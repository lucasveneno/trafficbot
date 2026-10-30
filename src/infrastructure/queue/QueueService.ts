import { Queue, Worker, Job, DelayedError } from 'bullmq';
import { randomUUID } from 'crypto';
import { reserveCampaign, releaseCampaign } from '../../application/campaigns/CampaignCapacity';
import { recordCampaignCount } from '../../application/campaigns/CampaignAccounting';
import { CapacityUnavailable } from '../../domain/entities/CapacityUnavailable';
import IORedis from 'ioredis';
import { logger } from '../logging/logger';
import { deadline } from '../lifecycle/deadline';
import { sessionJobSchema } from '../../domain/entities/SessionContract';
import type { TrafficJobData, TrafficJobInput } from '../../domain/entities/SessionContract';
import type { WorkerPlatform } from '../../domain/entities/WorkerContract';
import { WorkerRegistry } from '../worker/WorkerRegistry';
export type { TrafficJobData, TrafficJobInput } from '../../domain/entities/SessionContract';

export class QueueService {
  private static redisConnection: IORedis | null = null;
  static getRedis() { return this.redisConnection; }
  private static queues: Map<string, Queue<TrafficJobData>> = new Map();
  private static workers: Worker[] = [];
  private static operationTimeout = 15000;

  static async initialize(redisUrl: string, timeoutMs = 15000): Promise<void> {
    this.operationTimeout = timeoutMs;
    const connection = new IORedis(redisUrl, {
      maxRetriesPerRequest: null, lazyConnect: true, connectTimeout: Math.min(timeoutMs, 2000),
      retryStrategy: attempt => Math.min(100 * attempt, 2000),
    });
    this.redisConnection = connection;
    connection.on('error', () => logger.warn('Redis unavailable; reconnecting, readiness suspended'));
    try {
      const ready = new Promise<void>(resolve => connection.once('ready', resolve));
      // connect() rejects on the first failed attempt even while ioredis keeps retrying.
      void connection.connect().catch(() => undefined);
      await deadline(ready, timeoutMs, 'Redis readiness');
      WorkerRegistry.initialize(connection);
    } catch {
      await this.close(1000);
      throw new Error('Required Redis infrastructure did not become ready');
    }
  }
  static isDistributedEnabled(): boolean {
    return this.redisConnection?.status === 'ready' && (this.workers.length === 0 || this.workers.every(worker => worker.isRunning()));
  }

  private static getQueue(platform: string, deviceSerial?: string): Queue<TrafficJobData> {
    if (!this.redisConnection) throw new Error('Queue not initialized');
    const { QueueNameResolver } = require('./QueueNameResolver');
    const queueName = deviceSerial ? QueueNameResolver.getAndroidDeviceQueue(deviceSerial) : QueueNameResolver.getPlatformQueue(platform);
    if (!this.queues.has(queueName)) {
      const queue = new Queue<TrafficJobData>(queueName, {
        connection: this.redisConnection,
        defaultJobOptions: { attempts: 3, backoff: { type: 'exponential', delay: 5000 }, removeOnComplete: { age: 86400, count: 1000 }, removeOnFail: false },
      });
      queue.on('error', () => logger.warn(`Queue ${queueName} connection interrupted`));
      this.queues.set(queueName, queue);
    }
    return this.queues.get(queueName)!;
  }

  static async addSession(data: TrafficJobInput): Promise<string> {
    if (!this.redisConnection) throw new Error('Queue not initialized');
    const jobData = sessionJobSchema.parse(data);
    if (jobData.proxyMode === 'pool') {
      if (!jobData.proxyIds?.length) throw new Error('Campaign proxy pool is empty');
      const { proxyStore } = await import('../../application/proxies/ProxyStore');
      jobData.proxyPool = await Promise.all(jobData.proxyIds.map(async id => {
        const proxy = await proxyStore.get(id);
        if (!proxy || !proxy.enabled || proxy.status === 'unavailable') throw new Error('Selected proxy unavailable');
        return { id, maxConcurrentLeases: proxy.maxConcurrentLeases, proxy: { host: `${proxy.protocol}://${proxy.host}`, port: proxy.port, username: proxy.username, password: await proxyStore.getPassword(id) } };
      }));
    }
    
    let platform = jobData.requirements?.platform;
    let deviceSerial = jobData.requirements?.deviceSerial;

    if (!platform || platform as any === 'auto') {
      const allWorkers = await WorkerRegistry.getAvailableWorkers();
      const requiredBrowser = jobData.requirements?.browser;
      let compatibleWorkers = requiredBrowser 
        ? allWorkers.filter(w => w.browsers.some(b => b.browser === requiredBrowser))
        : allWorkers;

      if (jobData.requirements?.mobile !== undefined) {
        compatibleWorkers = compatibleWorkers.filter(w => w.mobile === jobData.requirements!.mobile);
      }
      if (deviceSerial !== undefined) {
        compatibleWorkers = compatibleWorkers.filter(w => w.device?.serial === deviceSerial);
      }

      if (compatibleWorkers.length > 0) {
        platform = compatibleWorkers[Math.floor(Math.random() * compatibleWorkers.length)].platform;
      } else {
        platform = 'linux'; // Fallback
      }
    }
    if (jobData.dispatchKey && jobData.campaignId) {
      // Preserve the queue chosen for an unacknowledged dispatch across restarts.
      const proposed = JSON.stringify({ key: jobData.dispatchKey, platform, deviceSerial });
      const stored = await this.redisConnection!.eval("local old = redis.call('GET', KEYS[1]); if old and cjson.decode(old).key == ARGV[1] then return old end; redis.call('SET', KEYS[1], ARGV[2]); return ARGV[2]", 1, `traffic:campaign-routing:${jobData.campaignId}`, jobData.dispatchKey, proposed);
      const route = JSON.parse(String(stored)); platform = route.platform; deviceSerial = route.deviceSerial;
    }
    if (!platform) throw new Error('Campaign routing is unavailable');
    const queue = this.getQueue(platform, deviceSerial);
    const job = await deadline(queue.add('execute-session', jobData, jobData.dispatchKey ? { jobId: jobData.dispatchKey } : undefined), this.operationTimeout, 'Queue submission (outcome may be unknown)');
    if (jobData.campaignId) await recordCampaignCount(this.redisConnection!, jobData.campaignId, `${queue.name}/${job.id}`, 'totalQueued');
    return job.id!;
  }

  static async createWorker(platform: WorkerPlatform, processor: (job: Job<TrafficJobData>) => Promise<void>, concurrency = 1, deviceSerial?: string, workerId?: string): Promise<Worker> {
    if (!this.redisConnection) throw new Error('Queue not initialized');
    const { QueueNameResolver } = require('./QueueNameResolver');
    const queueName = deviceSerial ? QueueNameResolver.getAndroidDeviceQueue(deviceSerial) : QueueNameResolver.getPlatformQueue(platform);
    const worker = new Worker<TrafficJobData>(queueName, async (job, token) => {
      job.data = sessionJobSchema.parse(job.data);
      const cancellationKey = `traffic:cancel:${queueName}/${job.id}`;
      if (await this.redisConnection!.get(cancellationKey)) { job.discard(); throw new Error('Session cancelled'); }
      const campaign = job.data.campaignId, reservation = `${queueName}-${job.id}-${randomUUID()}`;
      if (campaign && await this.redisConnection!.get(`traffic:campaign-status:${campaign}`) === 'paused') {
        await job.moveToDelayed(Date.now() + 1000, token); throw new DelayedError();
      }
      const campaignLimit = campaign ? Number(await this.redisConnection!.get(`traffic:campaign-limit:${campaign}`)) || job.data.campaignConcurrency : undefined;
      if (campaign && campaignLimit && !await reserveCampaign(this.redisConnection!, campaign, reservation, campaignLimit, job.data.durationMinutes)) {
        await job.moveToDelayed(Date.now() + 1000, token); throw new DelayedError();
      }
      try { await processor(job); if (await this.redisConnection?.get(cancellationKey)) { job.discard(); throw new Error('Session cancelled'); } }
      catch (error) {
        if (error instanceof CapacityUnavailable) { await job.moveToDelayed(Date.now() + 1000, token); throw new DelayedError(); }
        if (await this.redisConnection?.get(cancellationKey)) job.discard(); throw error;
      }
      finally { if (campaign && campaignLimit) await releaseCampaign(this.redisConnection!, campaign, reservation); }
    }, { connection: this.redisConnection, concurrency, name: workerId || WorkerRegistry.findLocalWorker(platform, deviceSerial)?.workerId });
    this.workers.push(worker);
    worker.on('completed', job => { if (job.data.campaignId && this.redisConnection) void recordCampaignCount(this.redisConnection, job.data.campaignId, `${queueName}/${job.id}`, 'totalCompleted').catch(() => logger.warn('Campaign completion accounting unavailable')); });
    worker.on('failed', job => { if (job?.data.campaignId && this.redisConnection) {
      const redis = this.redisConnection;
      void (async () => { if (job.attemptsMade >= (job.opts.attempts || 1) || await redis.get(`traffic:cancel:${queueName}/${job.id}`)) await recordCampaignCount(redis, job.data.campaignId!, `${queueName}/${job.id}`, 'totalFailed'); })().catch(() => logger.warn('Campaign failure accounting unavailable'));
    } });
    worker.on('error', () => logger.warn('Worker connection interrupted; pending jobs remain in Redis'));
    worker.on('failed', job => logger.warn('Session attempt failed', { jobId: job?.id, attemptsMade: job?.attemptsMade }));
    await deadline(worker.waitUntilReady(), this.operationTimeout, 'Worker readiness');
    return worker;
  }

  static async manageSession(id: string, action: 'stop' | 'retry'): Promise<void> {
    if (!this.isDistributedEnabled()) throw new Error('Redis unavailable');
    const decoded = Buffer.from(id, 'base64url').toString();
    const slash = decoded.lastIndexOf('/');
    const queueName = decoded.slice(0, slash), jobId = decoded.slice(slash + 1);
    const entry = (await this.managementQueues()).find(item => item.queue.name === queueName);
    const job = await entry?.queue.getJob(jobId);
    if (!job) throw new Error('Session not found');
    const state = await job.getState();
    if (action === 'retry') {
      if (state !== 'failed') throw new Error('Only failed sessions can be retried');
      await this.redisConnection!.del(`traffic:cancel:${queueName}/${job.id}`);
      await job.retry(); return;
    }
    if (state === 'active') await this.redisConnection!.set(`traffic:cancel:${queueName}/${job.id}`, '1', 'EX', Math.ceil(job.data.durationMinutes * 60) + 3600);
    else if (['waiting', 'delayed', 'paused'].includes(state)) await job.remove();
    else throw new Error('Session is no longer running');
  }

  static async pauseWorker(workerId: string): Promise<void> {
    for (const w of this.workers) if (w.name === workerId) await w.pause();
  }

  static async resumeWorker(workerId: string): Promise<void> {
    for (const w of this.workers) if (w.name === workerId) await w.resume();
  }

  static async close(timeoutMs = 30000, cancelActive?: () => Promise<unknown>): Promise<void> {
    const workers = this.workers.splice(0);
    const queues = Array.from(this.queues.values());
    this.queues.clear();
    const connection = this.redisConnection;
    this.redisConnection = null;
    await WorkerRegistry.close();
    const drain = Promise.all(workers.map(worker => worker.close()));
    let drained = false;
    try {
      try { await deadline(drain, timeoutMs, 'Worker drain'); }
      catch {
        if (!cancelActive) throw new Error('Worker drain deadline exceeded');
        // Cancel browsers while Redis is still connected so failures can be recorded.
        await deadline(cancelActive(), timeoutMs, 'Active session cancellation');
        await deadline(drain, timeoutMs, 'Cancelled worker drain');
      }
      drained = true;
    } finally {
      if (!drained) await Promise.allSettled(workers.map(worker => worker.disconnect()));
      // Disconnect shared Redis before awaiting queue closure: queued commands must not hang shutdown.
      connection?.disconnect();
      await Promise.allSettled(queues.map(q => deadline(q.close(), 1000, 'Queue close')));
    }
  }

  /** Queue handles remain inside the management adapter, never in public responses. */
  static async managementQueues() {
    if (!this.isDistributedEnabled()) return [];
    const platforms: WorkerPlatform[] = ['linux', 'windows', 'macos', 'android'];
    const entries = platforms.map(platform => ({ platform, deviceSerial: undefined as string | undefined, queue: this.getQueue(platform) }));
    for (const worker of await WorkerRegistry.getAvailableWorkers()) {
      if (worker.platform === 'android' && worker.device?.serial && !entries.some(entry => entry.deviceSerial === worker.device!.serial))
        entries.push({ platform: 'android', deviceSerial: worker.device.serial, queue: this.getQueue('android', worker.device.serial) });
    }
    return entries;
  }
}
