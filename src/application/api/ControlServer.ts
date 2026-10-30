import express from 'express';
import { WebSocketServer, WebSocket } from 'ws';
import { createServer, Server } from 'http';
import { AddressInfo } from 'net';
import { readdir, readFile, stat } from 'fs/promises';
import { join } from 'path';
import { sessionJobSchema } from '../../domain/entities/SessionContract';
import { ControlEvent, ControlSnapshot, CampaignJobOptions, ProfileView, LogEntry, ScheduleJobOptions } from '../../domain/control/ControlContract';
import { ControlSource, RuntimeControlSource } from './ControlState';
import { loadControlToken, validToken, validOrigin } from './ControlAuth';
import { campaignStore } from '../campaigns/CampaignStore';
import { scheduleStore } from '../schedules/ScheduleStore';
import { ScheduleRunner } from '../schedules/ScheduleRunner';
import { validateCron } from '../schedules/CronEvaluator';
import { EnrollmentService } from '../../infrastructure/worker/EnrollmentService';
import { QueueService } from '../../infrastructure/queue/QueueService';
import { UpdateReconciler } from './UpdateReconciler';
import { saveSettings } from './SettingsStore';
import { proxyInput } from '../proxies/ProxyInput';
import { campaignInput } from '../campaigns/CampaignInput';
import { Config } from '../../infrastructure/config/config';
import { CampaignRunner } from '../campaigns/CampaignRunner';
import { campaignJob } from '../campaigns/CampaignJob';

export class ControlServer {
  private server: Server;
  private wss = new WebSocketServer({ noServer: true, maxPayload: 4096, handleProtocols: () => 'trafficbot' });
  private timer?: NodeJS.Timeout;
  private token = '';
  private current?: ControlSnapshot;
  private pending?: Promise<void>;
  private stopping = false;
  /** Circular ring buffer of recent log lines (max 2000) */
  private logBuffer: LogEntry[] = [];
  private readonly LOG_BUFFER_MAX = 2000;
  private runner: ScheduleRunner;
  private campaigns: CampaignRunner;
  private reconciler: UpdateReconciler;
  private fleetPlanner: import('../fleet/FleetUpdatePlanner').FleetUpdatePlanner | null = null;

  constructor(private source: ControlSource = new RuntimeControlSource(), private options: { token?: string; shutdown?: () => Promise<void>; intervalMs?: number } = {}) {
    this.runner = new ScheduleRunner(source, scheduleStore);
    this.campaigns = new CampaignRunner(source);
    this.reconciler = new UpdateReconciler(this.broadcast.bind(this));
    const app = express(); app.disable('x-powered-by');

    // ── Security middleware ──────────────────────────────────────────
    app.use((req, res, next) => {
      res.setHeader('Cache-Control', 'no-store');
      if (!['127.0.0.1', '::ffff:127.0.0.1'].includes(req.socket.remoteAddress || '') || !['127.0.0.1', 'localhost'].includes(req.headers.host?.split(':')[0] || '') || !validOrigin(req.headers.origin)) { res.sendStatus(403); return; }
      if (req.headers.origin) { res.setHeader('Access-Control-Allow-Origin', req.headers.origin); res.setHeader('Vary', 'Origin'); }
      if (req.method === 'OPTIONS') { res.setHeader('Access-Control-Allow-Headers', 'Authorization, Content-Type'); res.setHeader('Access-Control-Allow-Methods', 'GET, POST, PUT, PATCH, DELETE, OPTIONS'); res.sendStatus(204); return; }
      // Enrollment has a separate single-use capability, validated by its handler.
      if (!(req.method === 'POST' && req.path === '/api/workers/register') && !validToken(req.headers.authorization?.replace(/^Bearer /, ''), this.token)) { res.sendStatus(401); return; }
      next();
    });
    app.use(express.json({ limit: '64kb' }));

    // ── Core snapshot routes ─────────────────────────────────────────
    app.get('/api/system', async (_req, res) => { if (!this.current) await this.refresh(); res.json(this.current!.system); });
    app.get('/api/snapshot', async (_req, res) => { if (!this.current) await this.refresh(); res.json(this.current); });
    for (const kind of ['workers', 'sessions', 'queues'] as const) {
      app.get(`/api/${kind}`, async (_req, res) => { if (!this.current) await this.refresh(); res.json(this.current![kind]); });
      app.get(`/api/${kind}/:id`, async (req, res) => {
        if (!this.current) await this.refresh();
        const item = this.current![kind].find(item => item.id === req.params.id);
        if (item) res.json(item); else res.sendStatus(404);
      });
    }

    // ── Session submission ───────────────────────────────────────────
    app.post('/api/sessions', async (req, res) => {
      const parsed = sessionJobSchema.safeParse(req.body);
      if (!parsed.success) { res.status(400).json({ error: 'Invalid session configuration' }); return; }
      if (this.stopping || this.current?.system.redis !== 'ready') { res.status(503).json({ error: 'Controller is not ready to schedule work' }); return; }
      try { const id = await this.source.submit(parsed.data); res.status(202).json({ id, status: 'queued' }); void this.refresh(); }
      catch { res.status(409).json({ error: 'Session could not be scheduled; check worker compatibility' }); }
    });

    // ── Engine shutdown ──────────────────────────────────────────────
    for (const action of ['stop', 'retry'] as const) app.post(`/api/sessions/:id/${action}`, async (req, res) => {
      try { await QueueService.manageSession(req.params.id, action); res.status(202).json({ status: action === 'stop' ? 'cancelling' : 'queued' }); void this.refresh(); }
      catch { res.status(409).json({ error: 'Session command unavailable for its current state' }); }
    });
    app.post('/api/engine/shutdown', async (_req, res) => {
      await this.refresh();
      if (!this.options.shutdown) { res.status(409).json({ error: 'Engine shutdown is not managed by this controller' }); return; }
      if (this.current!.system.counts.active || this.current!.system.counts.queued || this.current!.system.redis !== 'ready') { res.status(409).json({ error: 'Cannot safely stop while work is pending or Redis state is unknown' }); return; }
      this.stopping = true; res.status(202).json({ status: 'stopping' });
      setImmediate(() => { void this.options.shutdown!(); });
    });

    // ── Workers ──────────────────────────────────────────────────────
    app.post('/api/workers/enrollment', async (req, res) => {
      try {
        if (!QueueService.getRedis()) { res.status(503).json({ error: 'Redis is not ready' }); return; }
        if (!EnrollmentService['redis']) EnrollmentService.initialize(QueueService.getRedis()!);
        const tokenData = await EnrollmentService.generateToken();
        res.status(201).json(tokenData);
      } catch (e) { res.status(500).json({ error: 'Failed to generate enrollment token' }); }
    });

    app.post('/api/workers/register', async (req, res) => {
      try {
        if (!QueueService.getRedis()) { res.status(503).json({ error: 'Redis is not ready' }); return; }
        if (!EnrollmentService['redis']) EnrollmentService.initialize(QueueService.getRedis()!);
        const { token } = req.body;
        if (!token) { res.status(400).json({ error: 'Missing token' }); return; }
        const valid = await EnrollmentService.consumeToken(token);
        if (!valid) { res.status(401).json({ error: 'Invalid or expired enrollment token' }); return; }
        
        res.json({
          setupConfig: EnrollmentService.getWorkerConfig()
        });
      } catch (e) { res.status(500).json({ error: 'Failed to register worker' }); }
    });

    app.post('/api/workers/:id/drain', async (req, res) => {
      try {
        const id = req.params.id;
        const redis = QueueService.getRedis();
        if (redis) await redis.publish(`traffic:worker:${id}:commands`, JSON.stringify({ type: 'drain' }));
        res.sendStatus(202);
      } catch (e) { res.status(500).json({ error: 'Failed to issue command' }); }
    });

    app.post('/api/workers/:id/disable', async (req, res) => {
      try {
        const id = req.params.id;
        const redis = QueueService.getRedis();
        if (redis) await redis.publish(`traffic:worker:${id}:commands`, JSON.stringify({ type: 'disable' }));
        res.sendStatus(202);
      } catch (e) { res.status(500).json({ error: 'Failed to issue command' }); }
    });

    app.post('/api/workers/:id/enable', async (req, res) => {
      try {
        const id = req.params.id;
        const redis = QueueService.getRedis();
        if (redis) await redis.publish(`traffic:worker:${id}:commands`, JSON.stringify({ type: 'enable' }));
        res.sendStatus(202);
      } catch (e) { res.status(500).json({ error: 'Failed to issue command' }); }
    });

    app.post('/api/workers/:id/update', async (req, res) => {
      try {
        const id = req.params.id;
        const redis = QueueService.getRedis();
        if (redis) await redis.publish(`traffic:worker:${id}:commands`, JSON.stringify({ type: 'update' }));
        res.sendStatus(202);
      } catch (e) { res.status(500).json({ error: 'Failed to issue command' }); }
    });

    app.post('/api/workers/:id/rollback', async (req, res) => {
      try {
        const id = req.params.id;
        const redis = QueueService.getRedis();
        if (redis) await redis.publish(`traffic:worker:${id}:commands`, JSON.stringify({ type: 'rollback' }));
        res.sendStatus(202);
      } catch (e) { res.status(500).json({ error: 'Failed to issue command' }); }
    });

    app.get('/api/releases/latest', async (_req, res) => {
      const { ReleaseManager } = require('../../infrastructure/updater/ReleaseManager');
      const { APPLICATION_VERSION } = require('../../domain/Protocol');
      const meta = ReleaseManager.getMetadata(APPLICATION_VERSION);
      if (meta) res.json(meta);
      else res.status(404).json({ error: 'Release metadata not available' });
    });

    // ── Campaigns ───────────────────────────────────────────────────
    app.post('/api/campaigns/pause-all', async (_req, res) => {
      try { for (const campaign of await campaignStore.list()) if (campaign.status === 'active') { await QueueService.getRedis()?.set(`traffic:campaign-status:${campaign.id}`, 'paused'); await campaignStore.update(campaign.id, { status: 'paused' }); } res.json({ status: 'paused' }); }
      catch { res.status(503).json({ error: 'Could not pause campaigns' }); }
    });
    app.get('/api/campaigns', async (_req, res) => {
      try { res.json(await campaignStore.list()); }
      catch (e) { res.status(500).json({ error: 'Failed to read campaigns' }); }
    });
    app.get('/api/campaigns/:id', async (req, res) => {
      const c = await campaignStore.get(req.params.id);
      if (c) res.json(c); else res.sendStatus(404);
    });
    app.post('/api/campaigns', async (req, res) => {
      try {
        const body = campaignInput.parse(req.body);
        await this.validateCampaignProfile(body);
        const campaign = await campaignStore.create(body as CampaignJobOptions);
        res.status(201).json(campaign);
      } catch (e) {
        res.status(400).json({ error: 'Invalid campaign configuration' });
      }
    });
    app.put('/api/campaigns/:id', async (req, res) => {
      try {
        const previous = await campaignStore.get(req.params.id);
        if (!previous) { res.sendStatus(404); return; }
        const body = campaignInput.parse({ ...previous, ...req.body });
        await this.validateCampaignProfile(body);
        const updated = await campaignStore.update(req.params.id, body);
        if (updated) await QueueService.getRedis()?.set(`traffic:campaign-limit:${updated.id}`, updated.concurrency || 1);
        if (updated) res.json(updated); else res.sendStatus(404);
      } catch {
        res.status(400).json({ error: 'Invalid update payload' });
      }
    });
    app.patch('/api/campaigns/:id/status', async (req, res) => {
      const { status } = req.body as { status?: string };
      const allowed = ['active', 'paused', 'completed', 'draft'];
      if (!status || !allowed.includes(status)) { res.status(400).json({ error: `status must be one of: ${allowed.join(', ')}` }); return; }
      const previous = await campaignStore.get(req.params.id);
      if (!previous) { res.sendStatus(404); return; }
      const redis = QueueService.getRedis();
      if (!redis || redis.status !== 'ready') { res.status(503).json({ error: 'Redis is unavailable' }); return; }
      if (status === 'active') {
        for (const field of ['totalQueued', 'totalCompleted', 'totalFailed'] as const) await redis.hsetnx(`traffic:campaign-counts:${previous.id}`, field, previous.stats[field]);
        await this.refresh();
        if (!this.current!.workers.some(w => w.status !== 'disabled' && w.status !== 'draining' && (!previous.requirements?.platform || w.platform === previous.requirements.platform) && (!previous.requirements?.browser || w.browsers.some(b => b.browser === previous.requirements!.browser)) && (!previous.requirements?.deviceSerial || w.device?.serial === previous.requirements.deviceSerial))) { res.status(409).json({ error: 'No compatible workers currently available' }); return; }
        if (previous.proxyMode === 'pool') {
          const { proxyStore } = await import('../proxies/ProxyStore');
          const selected = await Promise.all((previous.proxyIds || []).map(id => proxyStore.get(id)));
          if (!selected.length || selected.some(p => !p || !p.enabled || p.status === 'unavailable')) { res.status(409).json({ error: 'Selected proxy pool is unavailable' }); return; }
        }
      }
      if (status === 'active' && !['active', 'paused'].includes(previous.status)) {
        await this.refresh();
        if (this.current!.sessions.some(s => s.campaignId === previous.id && ['queued', 'active', 'delayed'].includes(s.status))) { res.status(409).json({ error: 'Previous campaign jobs are still pending' }); return; }
        await redis.del(`traffic:campaign-run:${previous.id}`);
      }
      await redis.set(`traffic:campaign-status:${previous.id}`, status);
      await redis.set(`traffic:campaign-limit:${previous.id}`, previous.concurrency || 1);
      const updated = await campaignStore.update(req.params.id, { status: status as 'active' | 'paused' | 'completed' | 'draft' });
      if (updated) res.json(updated); else res.sendStatus(404);
    });
    app.delete('/api/campaigns/:id', async (req, res) => {
      await this.refresh();
      if (this.current!.sessions.some(s => s.campaignId === req.params.id && ['queued', 'active', 'delayed'].includes(s.status))) { res.status(409).json({ error: 'Stop or finish pending campaign sessions before deleting' }); return; }
      const deleted = await campaignStore.delete(req.params.id);
      if (deleted) await QueueService.getRedis()?.del(`traffic:campaign-run:${req.params.id}`, `traffic:campaign-status:${req.params.id}`, `traffic:campaign-counts:${req.params.id}`, `traffic:campaign-routing:${req.params.id}`, `traffic:campaign-limit:${req.params.id}`);
      if (deleted) res.sendStatus(204); else res.sendStatus(404);
    });
    app.post('/api/campaigns/:id/circuit/resume', async (req, res) => {
      const c = await campaignStore.get(req.params.id);
      if (!c) { res.sendStatus(404); return; }
      import('../campaigns/CircuitBreakerService').then(async m => {
        await m.circuitBreakerService.manualResume(req.params.id);
        res.sendStatus(200);
      }).catch(() => res.sendStatus(500));
    });

    // ── Schedules ────────────────────────────────────────────────────
    app.get('/api/schedules', async (_req, res) => {
      try { res.json(await scheduleStore.list()); }
      catch { res.status(500).json({ error: 'Failed to read schedules' }); }
    });
    app.get('/api/schedules/:id', async (req, res) => {
      const s = await scheduleStore.get(req.params.id);
      if (s) res.json(s); else res.sendStatus(404);
    });
    app.post('/api/schedules', async (req, res) => {
      try {
        const opts = req.body as ScheduleJobOptions;
        if (!opts.name || !opts.campaignId || !opts.mode || !opts.expression) {
          res.status(400).json({ error: 'name, campaignId, mode, and expression are required' }); return;
        }
        if (opts.mode === 'cron') { try { validateCron(opts.expression); } catch (e) { res.status(400).json({ error: `Invalid cron expression: ${e}` }); return; } }
        if (opts.mode === 'interval') { const ms = Number(opts.expression); if (!Number.isFinite(ms) || ms < 1000) { res.status(400).json({ error: 'interval expression must be milliseconds ≥ 1000' }); return; } }
        if (opts.mode === 'once') { if (isNaN(new Date(opts.expression).getTime())) { res.status(400).json({ error: 'once expression must be a valid ISO datetime' }); return; } }
        // Resolve campaign name for denormalisation
        const campaign = await campaignStore.get(opts.campaignId);
        if (!campaign) { res.status(404).json({ error: 'Campaign not found' }); return; }
        const nextRunAt = ScheduleRunner.computeNextRunAt(opts);
        const schedule = await scheduleStore.create({ ...opts, campaignName: campaign.name }, nextRunAt);
        res.status(201).json(schedule);
      } catch { res.status(400).json({ error: 'Invalid schedule configuration' }); }
    });
    app.put('/api/schedules/:id', async (req, res) => {
      try {
        const opts = req.body as Partial<ScheduleJobOptions>;
        if (opts.mode === 'cron' && opts.expression) { try { validateCron(opts.expression); } catch (e) { res.status(400).json({ error: `Invalid cron expression: ${e}` }); return; } }
        const existing = await scheduleStore.get(req.params.id);
        if (!existing) { res.sendStatus(404); return; }
        const merged = { ...existing, ...opts };
        const nextRunAt = ScheduleRunner.computeNextRunAt(merged);
        const updated = await scheduleStore.update(req.params.id, { ...opts, nextRunAt });
        if (updated) res.json(updated); else res.sendStatus(404);
      } catch { res.status(400).json({ error: 'Invalid update payload' }); }
    });
    app.patch('/api/schedules/:id/toggle', async (req, res) => {
      const s = await scheduleStore.get(req.params.id);
      if (!s) { res.sendStatus(404); return; }
      const nextRunAt = !s.enabled ? ScheduleRunner.computeNextRunAt(s) : s.nextRunAt;
      const updated = await scheduleStore.update(req.params.id, { enabled: !s.enabled, nextRunAt });
      if (updated) res.json(updated); else res.sendStatus(404);
    });
    app.post('/api/schedules/:id/run', async (req, res) => {
      // Fire immediately regardless of schedule timing
      const s = await scheduleStore.get(req.params.id);
      if (!s) { res.sendStatus(404); return; }
      const campaign = await campaignStore.get(s.campaignId);
      if (!campaign) { res.status(404).json({ error: 'Campaign not found' }); return; }
      if (this.stopping || this.current?.system.redis !== 'ready') { res.status(503).json({ error: 'Controller is not ready to schedule work' }); return; }
      try {
        const id = await this.source.submit({ ...campaignJob(campaign, s.runCount), scheduleId: s.id });
        const now = new Date().toISOString();
        await scheduleStore.update(s.id, { runCount: s.runCount + 1, lastRunAt: now, nextRunAt: ScheduleRunner.computeNextRunAt(s) });
        res.status(202).json({ sessionId: id, status: 'queued' });
      } catch { res.status(409).json({ error: 'Session could not be scheduled' }); }
    });
    app.delete('/api/schedules/:id', async (req, res) => {
      const deleted = await scheduleStore.delete(req.params.id);
      if (deleted) res.sendStatus(204); else res.sendStatus(404);
    });

    // ── Fleet Updates ───────────────────────────────────────────────
    app.post('/api/fleet/updates', async (req, res) => {
      if (!this.current) await this.refresh();
      const config = req.body as import('../fleet/FleetUpdatePlanner').FleetUpdateConfig;
      if (!config.targetVersion) { res.status(400).json({ error: 'targetVersion required' }); return; }
      
      // Enforce protocol compatibility
      // Wait, we need the latest release manifest. But the planner only needs targetVersion.
      const { ReleaseManager } = require('../../infrastructure/updater/ReleaseManager');
      const { PROTOCOL_VERSION, APPLICATION_VERSION } = require('../../domain/Protocol');
      const meta = ReleaseManager.getMetadata(APPLICATION_VERSION);
      if (meta && meta.latestVersion === config.targetVersion) {
        if (meta.protocolVersion !== PROTOCOL_VERSION) {
          res.status(400).json({ error: `Protocol incompatibility: Target uses protocol ${meta.protocolVersion}, Controller uses ${PROTOCOL_VERSION}` });
          return;
        }
      }

      if (this.fleetPlanner) {
        this.fleetPlanner.stop('Superseded by new rollout');
        this.fleetPlanner.removeAllListeners();
      }
      
      const { FleetUpdatePlanner } = require('../fleet/FleetUpdatePlanner');
      const planner = new FleetUpdatePlanner(config);
      this.fleetPlanner = planner;
      
      planner.on('progress', (status: any) => this.broadcast({ type: 'fleet.update.progress', status }));
      planner.on('completed', (status: any) => this.broadcast({ type: 'fleet.update.completed', status }));
      planner.on('paused', (status: any) => this.broadcast({ type: 'fleet.update.paused', status }));
      planner.on('phase_changed', (status: any) => this.broadcast({ type: 'fleet.update.phase_changed', status }));
      
      await planner.start(this.current!.workers);
      res.status(201).json(planner.getStatus());
    });

    app.get('/api/fleet/updates/active', (req, res) => {
      if (!this.fleetPlanner) { res.sendStatus(404); return; }
      res.json(this.fleetPlanner.getStatus());
    });

    app.post('/api/fleet/updates/active/stop', (req, res) => {
      if (!this.fleetPlanner) { res.sendStatus(404); return; }
      this.fleetPlanner.stop('Stopped manually via API');
      res.json(this.fleetPlanner.getStatus());
    });

    // ── Profiles ────────────────────────────────────────────────────
    // Read from the sessions data directory where ProfileStore writes browser-profile.json files
    app.get('/api/profiles', async (_req, res) => {
      try { res.json(await this.listProfiles()); }
      catch { res.status(500).json({ error: 'Failed to read profiles' }); }
    });
    app.get('/api/profiles/:key', async (req, res) => {
      const profiles = await this.listProfiles();
      const p = profiles.find(p => p.key === req.params.key);
      if (p) res.json(p); else res.sendStatus(404);
    });
    app.delete('/api/profiles/:key', async (req, res) => {
      if (!/^[a-zA-Z0-9_-]{1,100}$/.test(req.params.key)) { res.sendStatus(400); return; }
      // Refuse to delete a profile that is actively assigned to a session
      if (!this.current) await this.refresh();
      const inUse = this.current!.sessions.some(s => s.profileId === req.params.key && s.status === 'active');
      if (inUse) { res.status(409).json({ error: 'Profile is in use by an active session' }); return; }
      try {
        const { rm } = await import('fs/promises');
        const dir = join(process.env.SESSIONS_DATA_DIR || './sessions', req.params.key);
        await rm(dir, { recursive: true, force: true });
        res.sendStatus(204);
      } catch {
        res.sendStatus(404);
      }
    });

    // ── Proxies ─────────────────────────────────────────────────────
    // Proxies are resolved from environment configuration; no user-writable store yet.
    // The endpoint returns a sanitised view (no credentials).
    app.get('/api/metrics', async (req, res) => {
      try {
        const { MetricsQueryService } = await import('../metrics/MetricsQueryService');
        const queryService = new MetricsQueryService(process.env.REDIS_URL || 'redis://127.0.0.1:6379');
        
        let from = new Date(req.query.from as string);
        let to = new Date(req.query.to as string);
        if (isNaN(from.getTime())) from = new Date(Date.now() - 24 * 60 * 60 * 1000); // 24h default
        if (isNaN(to.getTime())) to = new Date();
        
        const intervalParam = req.query.interval as string || '15m';
        let intervalMinutes = 15;
        if (intervalParam === '1m') intervalMinutes = 1;
        else if (intervalParam === '5m') intervalMinutes = 5;
        else if (intervalParam === '15m') intervalMinutes = 15;
        else if (intervalParam === '1h') intervalMinutes = 60;
        
        const buckets = await queryService.query(from, to, intervalMinutes);
        await queryService.close();
        
        res.json(buckets);
      } catch (e) {
        res.status(500).json({ error: String(e) });
      }
    });

    // ── Proxies ──────────────────────────────────────────────────────
    app.get('/api/proxies', async (_req, res) => {
      const { proxyStore } = await import('../proxies/ProxyStore');
      const { proxyAllocator } = await import('../proxies/ProxyAllocator');
      try {
        const records = await proxyStore.list();
        const redis = QueueService.getRedis();
        const distributedCounts = new Map<string, number>();
        if (redis) for (const record of records) {
          await redis.zremrangebyscore(`traffic:proxy-leases:${record.id}`, '-inf', Date.now());
          distributedCounts.set(record.id, await redis.zcard(`traffic:proxy-leases:${record.id}`));
        }
        // @ts-ignore (exposing internal for reporting)
        const leases = proxyAllocator.leases ? Array.from(proxyAllocator.leases.values()) : [];
        const dtos: import('../../domain/control/ProxyContract').PublicProxyDto[] = records.map(r => ({
          id: r.id,
          name: r.name,
          protocol: r.protocol,
          host: r.host,
          port: r.port,
          country: r.country,
          region: r.region,
          provider: r.provider,
          enabled: r.enabled,
          status: r.status,
          latencyMs: r.latencyMs,
          successRate: r.successRate,
          consecutiveFailures: r.consecutiveFailures,
          activeLeases: distributedCounts.get(r.id) ?? leases.filter((l: any) => l.proxyId === r.id && Date.parse(l.expiresAt) > Date.now()).length,
          maxConcurrentLeases: r.maxConcurrentLeases,
          lastCheckedAt: r.lastCheckedAt,
          lastUsedAt: r.lastUsedAt,
        }));
        res.json(dtos);
      } catch (e) {
        res.status(500).json({ error: String(e) });
      }
    });

    app.post('/api/proxies', async (req, res) => {
      try {
        const { proxyStore } = await import('../proxies/ProxyStore');
        const body = proxyInput.parse(req.body);
        const newProxy = await proxyStore.add({
          name: body.name,
          protocol: body.protocol,
          host: body.host,
          port: Number(body.port),
          username: body.username,
          password: body.password,
          country: body.country,
          region: body.region,
          provider: body.provider,
          maxConcurrentLeases: body.maxConcurrentLeases,
          enabled: true,
          status: 'unknown',
          consecutiveFailures: 0
        });
        res.json({ id: newProxy.id });
      } catch (e) {
        res.status(500).json({ error: String(e) });
      }
    });

    app.delete('/api/proxies/:id', async (req, res) => {
      try {
        const { proxyStore } = await import('../proxies/ProxyStore');
        await proxyStore.delete(req.params.id);
        res.sendStatus(204);
      } catch (e) {
        res.status(500).json({ error: String(e) });
      }
    });

    app.patch('/api/proxies/:id', async (req, res) => {
      try {
        const { proxyStore } = await import('../proxies/ProxyStore');
        const updated = await proxyStore.update(req.params.id, proxyInput.partial().parse(req.body));
        if (!updated) res.sendStatus(404);
        else res.json({ id: updated.id });
      } catch (e) {
        res.status(500).json({ error: String(e) });
      }
    });

    app.post('/api/proxies/:id/test', async (req, res) => {
      const { proxyStore } = await import('../proxies/ProxyStore');
      const proxy = await proxyStore.get(req.params.id);
      if (!proxy) { res.sendStatus(404); return; }
      const start = Date.now();
      try {
        const { connect } = await import('net');
        await new Promise<void>((resolve, reject) => {
          const socket = connect({ host: proxy.host, port: proxy.port });
          socket.setTimeout(3000);
          socket.once('connect', () => { socket.destroy(); resolve(); });
          socket.once('timeout', () => { socket.destroy(); reject(new Error('Timeout')); });
          socket.once('error', reject);
        });
        proxy.latencyMs = Date.now() - start; proxy.lastCheckedAt = new Date().toISOString();
        await proxyStore.save(proxy);
        res.json({ reachable: true, latencyMs: proxy.latencyMs, scope: 'endpoint-connectivity' });
      } catch { res.status(502).json({ error: 'Proxy endpoint is unreachable' }); }
    });

    app.post('/api/proxies/bulk', async (req, res) => {
      try {
        const { proxyStore } = await import('../proxies/ProxyStore');
        const items = Array.isArray(req.body) ? req.body.map(item => proxyInput.parse(item)) : [];
        let added = 0;
        for (const item of items) {
          await proxyStore.add({
            name: item.name,
            protocol: item.protocol,
            host: item.host,
            port: Number(item.port),
            username: item.username,
            password: item.password,
            country: item.country,
            region: item.region,
            provider: item.provider,
            maxConcurrentLeases: item.maxConcurrentLeases,
            enabled: true,
            status: 'unknown',
            consecutiveFailures: 0
          });
          added++;
        }
        res.json({ added });
      } catch (e) {
        res.status(500).json({ error: String(e) });
      }
    });

    // ── Settings ────────────────────────────────────────────────────
    app.get('/api/settings', (_req, res) => {
      res.json(this.resolvePublicSettings());
    });

    app.patch('/api/settings', async (req, res) => {
      try {
        await saveSettings(req.body);
        res.json({ ...this.resolvePublicSettings(), restartRequired: true });
      } catch (err) {
        res.status(400).json({ error: 'Invalid settings; changes were not applied' });
      }
    });

    // ── Logs ────────────────────────────────────────────────────────
    app.get('/api/logs', (req, res) => {
      const limit = Math.min(Number(req.query.limit) || 200, this.LOG_BUFFER_MAX);
      const level = req.query.level as string | undefined;
      const lines = level
        ? this.logBuffer.filter(e => e.level === level)
        : this.logBuffer;
      res.json(lines.slice(-limit));
    });

    // ── Error handler ────────────────────────────────────────────────
    app.use((_error: unknown, _req: express.Request, res: express.Response, _next: express.NextFunction) => { res.status(400).json({ error: 'Invalid request' }); });

    this.server = createServer(app); this.server.requestTimeout = 10000;

    // ── WebSocket upgrade ────────────────────────────────────────────
    this.server.on('upgrade', (req, socket, head) => {
      const protocols = String(req.headers['sec-websocket-protocol'] || '').split(',').map(s => s.trim());
      if (req.url !== '/events' || !validOrigin(req.headers.origin) || !validToken(protocols[1], this.token) || protocols[0] !== 'trafficbot' || !['127.0.0.1', 'localhost'].includes(req.headers.host?.split(':')[0] || '') || !['127.0.0.1', '::ffff:127.0.0.1'].includes(req.socket.remoteAddress || '')) {
        socket.write('HTTP/1.1 401 Unauthorized\r\nConnection: close\r\n\r\n'); socket.destroy(); return;
      }
      if (this.wss.clients.size >= 16) { socket.destroy(); return; }
      this.wss.handleUpgrade(req, socket, head, ws => this.wss.emit('connection', ws, req));
    });
    this.wss.on('connection', ws => { if (this.current) ws.send(JSON.stringify({ type: 'snapshot', data: this.current } satisfies ControlEvent)); });

    import('../campaigns/CircuitBreakerService').then(m => {
      m.circuitBreakerService.on('campaign.circuit.opened', payload => this.broadcast({ type: 'campaign.circuit.opened', payload }));
      m.circuitBreakerService.on('campaign.circuit.half_open', payload => this.broadcast({ type: 'campaign.circuit.half_open', payload }));
      m.circuitBreakerService.on('campaign.circuit.closed', payload => this.broadcast({ type: 'campaign.circuit.closed', payload }));
      m.circuitBreakerService.on('campaign.circuit.manual_resume', payload => this.broadcast({ type: 'campaign.circuit.manual_resume', payload }));
    }).catch(() => undefined);
  }

  /** Append a log entry to the in-memory ring buffer */
  pushLog(entry: LogEntry): void {
    this.logBuffer.push(entry);
    if (this.logBuffer.length > this.LOG_BUFFER_MAX) this.logBuffer.shift();
  }

  refresh(): Promise<void> {
    if (this.pending) return this.pending;
    this.pending = this.collect().finally(() => { this.pending = undefined; }); return this.pending;
  }

  private async collect() {
    const next = await this.source.snapshot(); if (this.stopping) next.system.status = 'stopping';
    const previous = this.current; this.current = next;
    
    await this.reconciler.reconcileHeartbeats(next.workers);
    if (this.fleetPlanner) this.fleetPlanner.updateState(next.workers);
    
    if (previous) {
      for (const worker of next.workers) if (JSON.stringify(worker) !== JSON.stringify(previous.workers.find(w => w.id === worker.id))) this.broadcast({ type: 'worker.updated', worker });
      for (const worker of previous.workers) if (!next.workers.some(w => w.id === worker.id)) this.broadcast({ type: 'worker.offline', workerId: worker.id });
      for (const session of next.sessions) {
        const prevSession = previous.sessions.find(s => s.id === session.id);
        if (JSON.stringify(session) !== JSON.stringify(prevSession)) {
          this.broadcast({ type: session.status === 'active' ? 'session.started' : session.status === 'completed' ? 'session.finished' : session.status === 'failed' ? 'session.failed' : 'session.updated', session });
          if (session.campaignId) {
            if (prevSession && prevSession.status !== 'completed' && session.status === 'completed') {
              import('../campaigns/CircuitBreakerService').then(m => m.circuitBreakerService.reportSuccess(session.campaignId!)).catch(() => undefined);
            }
            if (prevSession && prevSession.status !== 'failed' && session.status === 'failed') {
              import('../campaigns/FailureClassifier').then(fc => {
                import('../campaigns/CircuitBreakerService').then(m => m.circuitBreakerService.reportFailure(session.campaignId!, fc.FailureClassifier.classify(session.error))).catch(() => undefined);
              });
            }
          }
        }
      }
      for (const queue of next.queues) if (JSON.stringify(queue) !== JSON.stringify(previous.queues.find(q => q.id === queue.id))) this.broadcast({ type: 'queue.updated', queue });
    }
    this.broadcast({ type: 'snapshot', data: next });
  }

  private broadcast(event: ControlEvent) {
    if (this.fleetPlanner) {
      if (event.type === 'worker.update.completed') {
        this.fleetPlanner.handleWorkerEvent((event as any).workerId, 'completed');
      } else if (event.type === 'worker.update.failed') {
        this.fleetPlanner.handleWorkerEvent((event as any).workerId, 'failed');
      }
    }
    for (const client of this.wss.clients) { if (client.bufferedAmount > 1048576) client.terminate(); else if (client.readyState === WebSocket.OPEN) client.send(JSON.stringify(event)); }
  }

  async start(port = 4782, host = '127.0.0.1'): Promise<number> {
    if (host !== '127.0.0.1') throw new Error('Control API must bind to 127.0.0.1');
    this.token = this.options.token || await loadControlToken(); await this.refresh();
    await new Promise<void>((resolve, reject) => { this.server.once('error', reject); this.server.listen(port, host, resolve); });
    this.timer = setInterval(() => { void this.refresh().catch(() => undefined); }, this.options.intervalMs || 2000);
    this.runner.start();
    this.campaigns.start();
    await this.reconciler.start();
    return (this.server.address() as AddressInfo).port;
  }

  async stop(): Promise<void> {
    await this.campaigns.stop();
    this.runner.stop();
    this.reconciler.stop();
    if (this.timer) clearInterval(this.timer);
    for (const client of this.wss.clients) client.terminate();
    this.wss.close(); this.server.closeIdleConnections();
    await new Promise<void>(resolve => {
      // Bun can omit the close callback after upgraded WebSocket connections.
      // Listening is already stopped and every management socket is closed.
      const timer = setTimeout(resolve, 1000);
      this.server.close(() => { clearTimeout(timer); resolve(); });
      this.server.closeAllConnections();
    });
  }

  // ── Profile helpers ──────────────────────────────────────────────
  private async validateCampaignProfile(campaign: CampaignJobOptions): Promise<void> {
    if (!campaign.persistent || !campaign.profileKey) return;
    const profile = (await this.listProfiles()).find(p => p.key === campaign.profileKey);
    if (!profile) return;
    const requirements = campaign.requirements;
    if (requirements?.platform && requirements.platform !== profile.operatingSystem || requirements?.browser && requirements.browser !== profile.browser || requirements?.deviceSerial && requirements.deviceSerial !== profile.deviceSerial) throw new Error('Profile binding mismatch');
    campaign.requirements = { platform: profile.operatingSystem, browser: profile.browser, deviceSerial: profile.deviceSerial };
  }
  private async listProfiles(): Promise<ProfileView[]> {
    const baseDir = process.env.SESSIONS_DATA_DIR || './sessions';
    const profileFiles: ProfileView[] = [];
    let entries: string[];
    try { entries = await readdir(baseDir); } catch { return []; }
    for (const entry of entries) {
      const profilePath = join(baseDir, entry, 'browser-profile.json');
      try {
        const raw = await readFile(profilePath, 'utf8');
        const p = JSON.parse(raw);
        const s = await stat(profilePath);
        profileFiles.push({
          id: p.id ?? entry,
          key: entry,
          browser: p.browser,
          operatingSystem: p.operatingSystem,
          browserVersion: p.browserVersion,
          osVersion: p.osVersion,
          locale: p.locale,
          timezone: p.timezone,
          country: p.country,
          userAgent: p.userAgent,
          viewport: p.viewport,
          mobile: p.mobile,
          updatedAt: s.mtime.toISOString(),
          deviceSerial: p.deviceSerial,
          source: p.source ?? 'runtime',
        });
      } catch {
        // not a profile directory — skip
      }
    }
    return profileFiles.sort((a, b) => (b.updatedAt ?? '').localeCompare(a.updatedAt ?? ''));
  }

  // ── Proxy helpers ────────────────────────────────────────────────
  private resolveConfiguredProxies() {
    const host = process.env.PROXY_URL;
    const port = Number(process.env.PROXY_PORT);
    const hasAuth = !!(process.env.PROXY_USER && process.env.PROXY_PASS);
    if (!host || !port) return [];
    return [{
      id: 'env-proxy',
      label: 'Environment proxy',
      host,
      port,
      protocol: (host.startsWith('socks5') ? 'socks5' : host.startsWith('https') ? 'https' : 'http') as 'http' | 'https' | 'socks5',
      authenticated: hasAuth,
      // Never expose credentials — only existence
      lastCheckedAt: null,
      latencyMs: null,
      healthy: null,
      assignedProfileKeys: [],
    }];
  }

  // ── Settings helpers ─────────────────────────────────────────────
  private resolvePublicSettings() {
    // Return a sanitised view of the current runtime config.
    // Sensitive values (credentials, tokens) are NEVER returned.
    return {
      nodeEnv: process.env.NODE_ENV ?? 'development',
      logLevel: process.env.LOG_LEVEL ?? 'info',
      defaultUrl: Config.DEFAULT_URL,
      maxSessions: Number(process.env.MAX_SESSIONS ?? 1),
      stealthMode: process.env.STEALTH_MODE !== 'false',
      headless: process.env.HEADLESS !== 'false',
      persistentSessions: process.env.PERSISTENT_SESSIONS === 'true',
      sessionsDataDir: process.env.SESSIONS_DATA_DIR ?? './sessions',
      humanBehavior: process.env.HUMAN_BEHAVIOR !== 'false',
      behaviorIntensity: process.env.BEHAVIOR_INTENSITY ?? 'medium',
      behaviorModel: process.env.BEHAVIOR_MODEL ?? 'generic',
      redisUrl: process.env.REDIS_URL ? process.env.REDIS_URL.replace(/:[^@]*@/, ':***@') : 'redis://127.0.0.1:6379',
      organicSearch: process.env.ORGANIC_SEARCH === 'true',
      grantGeolocation: process.env.GRANT_GEOLOCATION === 'true',
      matchGeolocation: process.env.MATCH_GEOLOCATION === 'true',
      externalIpCheck: process.env.EXTERNAL_IP_CHECK === 'true',
      referrals: process.env.REFERRALS ?? 'no',
      sessionTime: process.env.SESSION_TIME ?? '3',
      proxyConfigured: !!(process.env.PROXY_URL && process.env.PROXY_PORT),
    };
  }
}
