import { randomUUID } from 'crypto';
import { ControlSource } from '../api/ControlState';
import { CampaignStore, campaignStore } from './CampaignStore';
import { QueueService } from '../../infrastructure/queue/QueueService';
import { cronMatches, parseCron } from '../schedules/CronEvaluator';
import { circuitBreakerService } from './CircuitBreakerService';
import { logger } from '../../infrastructure/logging/logger';
import { campaignJob } from './CampaignJob';
import { deadline } from '../../infrastructure/lifecycle/deadline';

interface Run { id: string; submitted: number; lastAt?: string; }
export class CampaignRunner {
  private timer?: NodeJS.Timeout;
  private pending?: Promise<void>;
  private stopped = true;
  constructor(private source: ControlSource, private store: CampaignStore = campaignStore) {}
  start() { if (this.timer) return; this.stopped = false; this.timer = setInterval(() => { void this.tick(); }, 2000); }
  async stop() { this.stopped = true; if (this.timer) clearInterval(this.timer); this.timer = undefined; await deadline(this.pending || Promise.resolve(), 2000, 'Campaign dispatch stop').catch(() => undefined); }
  tick(): Promise<void> {
    if (this.pending) return this.pending;
    const pending = this.collect().catch(error => { logger.warn('Campaign dispatch deferred', { error: error instanceof Error ? error.message : 'unknown' }); }).finally(() => { this.pending = undefined; });
    this.pending = pending; return pending;
  }
  private async collect() {
    const redis = QueueService.getRedis();
    if (!redis || redis.status !== 'ready' || this.stopped) return;
    for (const candidate of await this.store.list()) {
      if (this.stopped || candidate.status !== 'active') continue;
      const lock = `traffic:campaign-dispatch:${candidate.id}`, token = randomUUID();
      if (!await redis.set(lock, token, 'EX', 60, 'NX')) continue;
      try {
        const campaign = await this.store.get(candidate.id);
        if (!campaign || campaign.status !== 'active' || !await circuitBreakerService.canExecute(campaign.id)) continue;
        const now = new Date();
        if (campaign.schedule.startAt && now < new Date(campaign.schedule.startAt)) continue;
        if (campaign.schedule.endAt && now > new Date(campaign.schedule.endAt)) { await this.store.update(campaign.id, { status: 'completed' }); continue; }
        const key = `traffic:campaign-run:${campaign.id}`;
        const saved = await redis.get(key);
        const run: Run = saved ? JSON.parse(saved) : { id: randomUUID(), submitted: 0 };
        if (!saved) await redis.set(key, JSON.stringify(run));
        const targets = campaign.targets?.length ? campaign.targets : [campaign.url];
        const maximum = campaign.totalSessions ?? campaign.schedule.maxSessions ?? (campaign.schedule.mode === 'immediate' ? targets.length : Infinity);
        const snapshot = await this.source.snapshot();
        if (snapshot.system.redis !== 'ready') continue;
        if (!snapshot.workers.some(w => w.status !== 'disabled' && w.status !== 'draining' && (!campaign.requirements?.platform || w.platform === campaign.requirements.platform) && (!campaign.requirements?.browser || w.browsers.some(b => b.browser === campaign.requirements!.browser)) && (!campaign.requirements?.deviceSerial || w.device?.serial === campaign.requirements.deviceSerial))) continue;
        const outstanding = snapshot.sessions.filter(s => s.campaignId === campaign.id && ['active', 'queued', 'delayed'].includes(s.status)).length;
        if (run.submitted >= maximum) { if (!outstanding) await this.store.update(campaign.id, { status: 'completed' }); continue; }
        if (run.lastAt && campaign.schedule.mode === 'interval' && now.getTime() - Date.parse(run.lastAt) < Number(campaign.schedule.value)) continue;
        if (campaign.schedule.mode === 'cron' && (!cronMatches(parseCron(campaign.schedule.value || ''), now) || run.lastAt?.slice(0, 16) === now.toISOString().slice(0, 16))) continue;
        const count = Math.min(16, Math.max(0, (campaign.concurrency || 1) - outstanding), maximum - run.submitted, campaign.schedule.mode === 'immediate' ? Infinity : 1);
        for (let i = 0; i < count && !this.stopped; i++) {
          if (!await redis.eval("if redis.call('GET', KEYS[1]) == ARGV[1] then redis.call('EXPIRE', KEYS[1], 60); return 1 end return 0", 1, lock, token)) break;
          if ((await this.store.get(campaign.id))?.status !== 'active') break;
          await this.source.submit({
            ...campaignJob(campaign, run.submitted), dispatchKey: `campaign-${campaign.id}-${run.id}-${run.submitted}`,
          });
          run.submitted++; run.lastAt = now.toISOString();
          await redis.set(key, JSON.stringify(run));
        }
      } catch (error) {
        logger.warn('Campaign dispatch deferred', { campaignId: candidate.id, error: error instanceof Error ? error.message : 'unknown' });
      } finally { await redis.eval("if redis.call('GET', KEYS[1]) == ARGV[1] then return redis.call('DEL', KEYS[1]) end return 0", 1, lock, token); }
    }
  }
}
