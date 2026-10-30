import IORedis from 'ioredis';
import { logger } from '../../infrastructure/logging/logger';

export type MetricEventType = 
  | 'session.queued'
  | 'session.started'
  | 'session.completed'
  | 'session.failed'
  | 'circuit.opened'
  | 'circuit.closed'
  | 'proxy.lease_acquired'
  | 'proxy.lease_released'
  | 'proxy.degraded'
  | 'worker.online'
  | 'worker.offline'
  | 'browser.launch'
  | 'browser.navigation'
  | 'browser.page.crashed'
  | 'browser.selector.timeout'
  | 'android.adb.disconnect';

export interface MetricEvent {
  type: MetricEventType;
  timestamp: string;
  sourceId: string; // workerId or control server ID
  campaignId?: string;
  proxyId?: string;
  sessionId?: string;
  durationMs?: number;
  failureReason?: string;
  metadata?: Record<string, any>;
}

export class MetricsCollector {
  private static redis: IORedis | null = null;
  private static buffer: MetricEvent[] = [];
  private static flushInterval: NodeJS.Timeout | null = null;
  public static localSourceId: string = 'unknown';

  static initialize(redisUrl: string, sourceId: string) {
    this.localSourceId = sourceId;
    this.redis = new IORedis(redisUrl);
    
    // Flush every 5 seconds
    this.flushInterval = setInterval(() => this.flush(), 5000);
  }

  static async close() {
    if (this.flushInterval) clearInterval(this.flushInterval);
    await this.flush();
    if (this.redis) {
      this.redis.disconnect();
    }
  }

  static emit(
    type: MetricEventType, 
    data: Omit<MetricEvent, 'type' | 'timestamp' | 'sourceId'>
  ) {
    const event: MetricEvent = {
      type,
      timestamp: new Date().toISOString(),
      sourceId: this.localSourceId,
      ...data
    };
    
    this.buffer.push(event);
    
    // Safety limit
    if (this.buffer.length > 1000) {
      void this.flush();
    }
  }

  private static async flush() {
    if (this.buffer.length === 0 || !this.redis) return;

    const events = this.buffer.splice(0, this.buffer.length);
    const pipeline = this.redis.pipeline();

    for (const event of events) {
      // Create one-minute buckets
      const date = new Date(event.timestamp);
      date.setSeconds(0, 0);
      const bucketKey = `traffic:metrics:${date.toISOString()}`;
      
      // Store raw events in a list for the bucket
      pipeline.rpush(bucketKey, JSON.stringify(event));
      // Expire bucket after 7 days
      pipeline.expire(bucketKey, 7 * 24 * 60 * 60);

      // Increment simple counters in a hash for fast aggregations
      const counterKey = `traffic:metrics:counters:${date.toISOString()}`;
      pipeline.hincrby(counterKey, event.type, 1);
      pipeline.expire(counterKey, 7 * 24 * 60 * 60);
    }

    try {
      await pipeline.exec();
    } catch (e) {
      logger.error('Failed to flush metrics to Redis', { error: String(e) });
      // In a real system, we might re-queue them. For now, we drop to avoid memory leaks.
    }
  }
}
