import { TrafficOrchestrator } from './application/traffic/TrafficOrchestrator';
import { PuppeteerStealthEngine } from './infrastructure/browser/PuppeteerStealthEngine';
import { Config } from './infrastructure/config/config';
import { logger } from './infrastructure/logging/logger';
import { MetricsService } from './infrastructure/monitoring/MetricsService';
import { QueueService, TrafficJobData } from './infrastructure/queue/QueueService';
import { Job } from 'bullmq';

async function setupMonitoring() {
  const metrics = MetricsService.getInstance();
  setInterval(() => {
    metrics.printSummary();
  }, 10000);
  return metrics;
}

async function runProducer() {
  logger.info('Role: PRODUCER - Adding initial tasks to queue', { 
    count: Config.MAX_SESSIONS,
    url: Config.DEFAULT_URL 
  });

  for (let i = 0; i < Config.MAX_SESSIONS; i++) {
    const durationMin = Config.SESSION_TIME === 'random' 
      ? Math.floor(Math.random() * (5 - 1 + 1) + 1) 
      : parseInt(Config.SESSION_TIME);

    const jobData: TrafficJobData = {
      url: Config.DEFAULT_URL,
      durationMinutes: durationMin,
      intensity: Config.BEHAVIOR_INTENSITY,
      proxy: Config.PROXY_URL ? {
        host: Config.PROXY_URL,
        port: Config.PROXY_PORT!,
        username: Config.PROXY_USER,
        password: Config.PROXY_PASS
      } : undefined
    };

    await QueueService.addSession(jobData);
  }
}

async function runWorker() {
  logger.info('Role: WORKER - Listening for tasks...', {
    concurrency: Config.MAX_SESSIONS
  });

  QueueService.createWorker(async (job: Job<TrafficJobData>) => {
    logger.info('Worker: Starting job', { jobId: job.id, url: job.data.url });
    const engine = new PuppeteerStealthEngine();
    const orchestrator = new TrafficOrchestrator(engine);
    
    try {
      await orchestrator.runFromJob(job.id!, job.data);
    } catch (err) {
      logger.error('Worker: Job target failed', { jobId: job.id, error: err });
      throw err; // Allow BullMQ to handle retry
    }
  });
}

async function bootstrap() {
  logger.info('Initializing Veneno Traffic Bot v2 (Distributed)', { 
    env: Config.NODE_ENV,
    role: Config.BOT_ROLE,
    redis: Config.REDIS_URL
  });

  // Initialize Queue
  QueueService.initialize(Config.REDIS_URL);
  
  // Start Monitoring (only locally relevant if worker/both)
  if (Config.BOT_ROLE !== 'producer') {
    await setupMonitoring();
  }

  // Execute Roles
  if (Config.BOT_ROLE === 'producer' || Config.BOT_ROLE === 'both') {
    await runProducer();
  }

  if (Config.BOT_ROLE === 'worker' || Config.BOT_ROLE === 'both') {
    await runWorker();
  }

  // Graceful shutdown
  process.on('SIGTERM', async () => {
    logger.info('SIGTERM received, closing services...');
    await QueueService.close();
    process.exit(0);
  });
}

bootstrap().catch(err => {
  logger.error('Fatal crash during bootstrap', { err });
  process.exit(1);
});
