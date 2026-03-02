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
  private static QUEUE_NAME = 'traffic-sessions';
  private static redisConnection: IORedis;
  private static queue: Queue;

  public static initialize(redisUrl: string = process.env.REDIS_URL || 'redis://127.0.0.1:6379'): void {
    this.redisConnection = new IORedis(redisUrl, {
      maxRetriesPerRequest: null,
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

    logger.info('QueueService initialized', { redisUrl });
  }

  public static async addSession(data: TrafficJobData): Promise<string> {
    const job = await this.queue.add('execute-session', data);
    logger.debug('Session added to queue', { jobId: job.id, url: data.url });
    return job.id!;
  }

  public static createWorker(processor: (job: Job<TrafficJobData>) => Promise<void>): Worker {
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
    await this.queue.close();
    await this.redisConnection.quit();
  }
}
