import { Queue, Worker, Job, QueueEvents } from 'bullmq';
import IORedis from 'ioredis';
import { logger } from '../logging/logger';

export interface TrafficJobData {
  url: string;
  proxy?: {
    host: string;
    port: number;
    username?: string;
    password?: string;
  };
  durationMinutes: number;
  intensity: 'low' | 'medium' | 'high';
}

export class QueueService {
  private static readonly QUEUE_NAME = 'traffic-sessions';
  private static redisConnection: IORedis | null = null;
  private static queue: Queue | null = null;
  private static isInitialized = false;

  public static initialize(redisUrl: string = process.env.REDIS_URL || 'redis://127.0.0.1:6379'): void {
    try {
      this.redisConnection = new IORedis(redisUrl, {
        maxRetriesPerRequest: null,
        lazyConnect: true,
        connectTimeout: 2000, // Fail fast locally
        retryStrategy: () => null // Don't retry indefinitely
      });

      this.redisConnection.on('error', (err) => {
        if (this.isInitialized) {
          logger.debug('QueueService: Redis connection skipped/unavailable', { message: err.message });
          this.isInitialized = false;
        }
      });

      this.queue = new Queue(this.QUEUE_NAME, {
        connection: this.redisConnection as any,
        defaultJobOptions: {
          attempts: 3,
          backoff: {
            type: 'exponential',
            delay: 5000,
          },
          removeOnComplete: true,
          removeOnFail: false,
        },
      });

      this.isInitialized = true;
      logger.info('QueueService initialized (Distributed mode potential)', { redisUrl });
    } catch (err) {
      logger.warn('QueueService: Failed to setup Redis connection. Falling back to local mode.');
      this.isInitialized = false;
    }
  }

  public static isDistributedEnabled(): boolean {
    return this.isInitialized && this.redisConnection?.status === 'ready';
  }

  public static async addSession(data: TrafficJobData): Promise<string | null> {
    if (!this.queue) {
      logger.debug('QueueService: Skipping addSession (local mode active)');
      return null;
    }
    const job = await this.queue.add('execute-session', data);
    logger.debug('Session added to queue', { jobId: job.id, url: data.url });
    return job.id!;
  }

  public static createWorker(processor: (job: Job<TrafficJobData>) => Promise<void>): Worker | null {
    if (!this.redisConnection) {
      logger.debug('QueueService: Skipping createWorker (local mode active)');
      return null;
    }
    const worker = new Worker(this.QUEUE_NAME, processor, {
      connection: this.redisConnection as any,
      concurrency: parseInt(process.env.MAX_SESSIONS || '1', 10),
    });

    worker.on('completed', (job) => {
      logger.info('Worker: Job completed', { jobId: job.id });
    });

    worker.on('failed', (job, err) => {
      logger.error('Worker: Job failed', { jobId: job?.id, error: err.message });
    });

    return worker;
  }

  public static async close(): Promise<void> {
    if (this.queue) await this.queue.close();
    if (this.redisConnection) await this.redisConnection.quit();
  }
}
