import { QueueService } from '../../infrastructure/queue/QueueService';
import { UpdateEvent } from '../../infrastructure/updater/UpdateState';
import { WorkerView } from '../../domain/control/ControlContract';
import { logger } from '../../infrastructure/logging/logger';
import IORedis from 'ioredis';

const UPDATE_RESTART_TIMEOUT_MS = 60 * 1000; // 1 minute to reconnect

interface PendingUpdate {
  workerId: string;
  expectedVersion: string;
  restartingAt: number;
}

export class UpdateReconciler {
  private timer: NodeJS.Timeout | null = null;
  private subscriber: IORedis | null = null;
  private redis: IORedis | null = null;
  private retry?: NodeJS.Timeout;
  
  constructor(private broadcast: (event: any) => void) {}

  async start() {
    if (this.subscriber || this.retry) return;
    const originalRedis = QueueService.getRedis();
    if (!originalRedis) {
      this.retry = setTimeout(() => { this.retry = undefined; void this.start().catch(() => undefined); }, 1000);
      return;
    }
    this.redis = originalRedis;
    this.subscriber = originalRedis.duplicate();
    
    await this.subscriber.psubscribe('traffic:worker:*:update-events');
    this.subscriber.on('pmessage', async (pattern: string, channel: string, message: string) => {
      try {
        const event = JSON.parse(message) as UpdateEvent;
        this.broadcast({ type: 'worker.update.event', event });
        
        if (event.state === 'restarting' && event.targetVersion) {
          const pending: PendingUpdate = {
            workerId: event.workerId,
            expectedVersion: event.targetVersion,
            restartingAt: Date.now()
          };
          await this.redis?.hset('traffic:updates:pending', event.workerId, JSON.stringify(pending));
        }
      } catch (e) {
        logger.error('Failed to parse update event', { error: e, message });
      }
    });

    this.timer = setInterval(() => void this.checkTimeouts(), 5000);
  }

  async checkTimeouts() {
    if (!this.redis) return;
    try {
      const all = await this.redis.hgetall('traffic:updates:pending');
      const now = Date.now();
      for (const [workerId, json] of Object.entries(all)) {
        const pending = JSON.parse(json) as PendingUpdate;
        if (now - pending.restartingAt > UPDATE_RESTART_TIMEOUT_MS) {
          await this.redis.hdel('traffic:updates:pending', workerId);
          logger.error(`[update] Worker ${workerId} failed to restart in time`);
          this.broadcast({ 
            type: 'worker.update.failed', 
            workerId, 
            error: 'UPDATE_RESTART_TIMEOUT' 
          });
        }
      }
    } catch {}
  }

  async reconcileHeartbeats(workers: WorkerView[]) {
    if (!this.redis) return;
    for (const worker of workers) {
      const json = await this.redis.hget('traffic:updates:pending', worker.id);
      if (json) {
        const pending = JSON.parse(json) as PendingUpdate;
        if (worker.version === pending.expectedVersion) {
          logger.info(`[update] Worker ${worker.id} successfully updated to ${worker.version}`);
          await this.redis.hdel('traffic:updates:pending', worker.id);
          this.broadcast({
            type: 'worker.update.completed',
            workerId: worker.id,
            version: worker.version
          });
        }
      }
    }
  }

  stop() {
    if (this.retry) { clearTimeout(this.retry); this.retry = undefined; }
    if (this.timer) clearInterval(this.timer);
    if (this.subscriber) this.subscriber.quit();
  }
}
