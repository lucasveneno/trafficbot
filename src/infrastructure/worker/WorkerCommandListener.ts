import IORedis from 'ioredis';
import { QueueService } from '../queue/QueueService';
import { logger } from '../logging/logger';
import { WorkerRegistry } from './WorkerRegistry';

export class WorkerCommandListener {
  private subscriber: IORedis | null = null;
  private workerIds: string[] = [];

  constructor(private redisUrl: string) {}

  async start(workerIds: string[]) {
    this.workerIds = workerIds;
    this.subscriber = new IORedis(this.redisUrl);
    
    for (const id of workerIds) {
      await this.subscriber.subscribe(`traffic:worker:${id}:commands`);
    }

    this.subscriber.on('message', async (channel, message) => {
      try {
        const cmd = JSON.parse(message);
        const workerId = channel.split(':')[2];
        const caps = WorkerRegistry.getCurrentCapabilities(workerId);
        
        if (cmd.type === 'drain') {
          logger.info(`Draining worker ${workerId}`);
          await QueueService.pauseWorker(workerId);
          if (caps) { caps.status = 'draining'; await WorkerRegistry.registerWorker(caps); }
        } else if (cmd.type === 'disable') {
          logger.info(`Disabling worker ${workerId}`);
          await QueueService.pauseWorker(workerId);
          if (caps) { caps.status = 'disabled'; await WorkerRegistry.registerWorker(caps); }
        } else if (cmd.type === 'enable') {
          logger.info(`Enabling worker ${workerId}`);
          await QueueService.resumeWorker(workerId);
          if (caps) { caps.status = 'online'; await WorkerRegistry.registerWorker(caps); }
        } else if (cmd.type === 'update') {
          const { WorkerUpdater } = require('./WorkerUpdater');
          void WorkerUpdater.executeUpdate(workerId);
        } else if (cmd.type === 'rollback') {
          const { WorkerUpdater } = require('./WorkerUpdater');
          void WorkerUpdater.executeRollback(workerId);
        }
      } catch (e) {
        logger.error('Failed to process worker command', { error: String(e) });
      }
    });
  }

  async stop() {
    if (this.subscriber) {
      await this.subscriber.quit();
      this.subscriber = null;
    }
  }
}
