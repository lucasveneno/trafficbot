import IORedis from 'ioredis';

export interface MetricsBucketDto {
  timestamp: string;
  queued: number;
  started: number;
  completed: number;
  failed: number;
  activeSessions?: number;
  queueDepth?: number;
  averageDurationMs?: number;
  activeWorkers?: number;
}

export class MetricsQueryService {
  private redis: IORedis;

  constructor(redisUrl: string) {
    this.redis = new IORedis(redisUrl);
  }

  async close() {
    this.redis.disconnect();
  }

  /**
   * Queries metrics from `from` to `to` and groups them by `interval`.
   * @param interval in minutes
   */
  async query(from: Date, to: Date, intervalMinutes: number): Promise<MetricsBucketDto[]> {
    const buckets: MetricsBucketDto[] = [];
    const fromMs = from.getTime();
    const toMs = to.getTime();

    // To avoid fetching too many buckets, we generate the 1-minute bucket keys
    // and fetch them via pipeline.
    const keys: string[] = [];
    let currentMs = fromMs;
    // Align to minute
    currentMs = Math.floor(currentMs / 60000) * 60000;
    
    while (currentMs <= toMs) {
      const d = new Date(currentMs);
      const iso = d.toISOString();
      keys.push(`traffic:metrics:counters:${iso}`);
      currentMs += 60000; // 1 minute
    }

    if (keys.length === 0) return [];

    const pipeline = this.redis.pipeline();
    for (const key of keys) {
      pipeline.hgetall(key);
    }
    
    const results = await pipeline.exec();
    
    // Group by intervalMinutes
    let currentBucketStart = Math.floor(fromMs / (intervalMinutes * 60000)) * (intervalMinutes * 60000);
    let currentBucket: MetricsBucketDto = {
      timestamp: new Date(currentBucketStart).toISOString(),
      queued: 0,
      started: 0,
      completed: 0,
      failed: 0,
    };
    
    for (let i = 0; i < keys.length; i++) {
      const ms = fromMs + i * 60000;
      if (ms >= currentBucketStart + intervalMinutes * 60000) {
        buckets.push(currentBucket);
        currentBucketStart += intervalMinutes * 60000;
        currentBucket = {
          timestamp: new Date(currentBucketStart).toISOString(),
          queued: 0,
          started: 0,
          completed: 0,
          failed: 0,
        };
      }
      
      const err = results?.[i]?.[0];
      const data = results?.[i]?.[1] as Record<string, string>;
      if (!err && data) {
        currentBucket.queued += parseInt(data['session.queued'] || '0', 10);
        currentBucket.started += parseInt(data['session.started'] || '0', 10);
        currentBucket.completed += parseInt(data['session.completed'] || '0', 10);
        currentBucket.failed += parseInt(data['session.failed'] || '0', 10);
      }
    }
    buckets.push(currentBucket);

    return buckets;
  }
}
