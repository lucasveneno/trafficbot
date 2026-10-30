import IORedis from 'ioredis';
import { workerCapabilitiesSchema } from '../../domain/entities/WorkerContract';
import type { WorkerCapabilities } from '../../domain/entities/WorkerContract';
import { logger } from '../logging/logger';

export class WorkerRegistry {
  private static redis: IORedis | null = null;
  private static heartbeatTimer: NodeJS.Timeout | null = null;
  private static activeCapabilities: Map<string, WorkerCapabilities> = new Map();
  private static readonly HEARTBEAT_INTERVAL_MS = 10000;
  private static readonly TTL_SECONDS = 30;

  static initialize(redisConnection: IORedis) {
    this.redis = redisConnection;
  }

  static async registerWorker(capabilities: WorkerCapabilities): Promise<void> {
    if (!this.redis) throw new Error('WorkerRegistry not initialized with Redis');
    
    const isNew = !this.activeCapabilities.has(capabilities.workerId);
    this.activeCapabilities.set(capabilities.workerId, capabilities);
    
    if (isNew) {
      import('../../application/metrics/MetricsCollector').then(({ MetricsCollector }) => {
        MetricsCollector.emit('worker.online', { metadata: { platform: capabilities.platform } });
      }).catch(() => {});
    }
    
    await this.sendHeartbeat();
    
    if (!this.heartbeatTimer) {
      this.heartbeatTimer = setInterval(() => {
        this.sendHeartbeat().catch(e => logger.error('Failed to send worker heartbeat', { error: e.message }));
      }, this.HEARTBEAT_INTERVAL_MS);
    }
  }

  static getCurrentCapabilities(workerId?: string): WorkerCapabilities | null {
    if (this.activeCapabilities.size === 0) return null;
    if (workerId) return this.activeCapabilities.get(workerId) || null;
    return this.activeCapabilities.values().next().value || null;
  }

  static findLocalWorker(platform: string, deviceSerial?: string): WorkerCapabilities | undefined {
    return [...this.activeCapabilities.values()].find(worker => worker.platform === platform && worker.device?.serial === deviceSerial);
  }

  private static async sendHeartbeat(): Promise<void> {
    if (!this.redis || this.activeCapabilities.size === 0) return;
    const pipeline = this.redis.pipeline();
    for (const [id, capabilities] of this.activeCapabilities.entries()) {
      const key = `traffic:workers:${id}`;
      // activeSessions is tracked externally via SessionStore; read from capabilities status
      // WorkerUpdater needs this field to know when drain is complete
      const activeSessions = (capabilities as any)._activeSessions ?? 0;
      pipeline.set(key, JSON.stringify({
        ...capabilities,
        heartbeatAt: new Date().toISOString(),
        activeSessions,
      }), 'EX', this.TTL_SECONDS);
    }
    await pipeline.exec();
  }

  static async getAvailableWorkers(): Promise<WorkerCapabilities[]> {
    if (!this.redis) throw new Error('WorkerRegistry not initialized with Redis');
    const keys = await this.redis.keys('traffic:workers:*');
    if (keys.length === 0) return [];
    
    const rawWorkers = await this.redis.mget(...keys);
    const workers: WorkerCapabilities[] = [];
    
    for (const raw of rawWorkers) {
      if (raw) {
        try {
          const data = JSON.parse(raw);
          workers.push(workerCapabilitiesSchema.parse(data));
        } catch (e) {
          logger.warn('Failed to parse worker capabilities from Redis');
        }
      }
    }
    return workers;
  }

  static async close(): Promise<void> {
    if (this.heartbeatTimer) {
      clearInterval(this.heartbeatTimer);
      this.heartbeatTimer = null;
    }
    if (this.redis && this.activeCapabilities.size > 0) {
      const pipeline = this.redis.pipeline();
      for (const id of this.activeCapabilities.keys()) {
        pipeline.del(`traffic:workers:${id}`);
      }
      await pipeline.exec().catch(() => undefined);
      
      const { MetricsCollector } = require('../../application/metrics/MetricsCollector');
      MetricsCollector.emit('worker.offline', {});
      
      this.activeCapabilities.clear();
    }
    this.redis = null;
  }
}
