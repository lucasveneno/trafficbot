import { EventEmitter } from 'node:events';
import type { WorkerView, FleetUpdateStatus } from '../../domain/control/ControlContract';
export type { FleetUpdateStatus } from '../../domain/control/ControlContract';
import { logger } from '../../infrastructure/logging/logger';
import { QueueService } from '../../infrastructure/queue/QueueService';
import { randomUUID } from 'node:crypto';

export interface FleetUpdateConfig {
  targetVersion: string;
  canaryCount?: number;
  maxConcurrent?: number;
  minCapacityPct?: number; // 0-100
  maxFailures?: number;
}

export class FleetUpdatePlanner extends EventEmitter {
  private status: FleetUpdateStatus;
  private workers: WorkerView[] = [];
  private active = false;
  private checkInterval: NodeJS.Timeout | null = null;
  private config: Required<FleetUpdateConfig>;

  constructor(config: FleetUpdateConfig) {
    super();
    this.config = {
      targetVersion: config.targetVersion,
      canaryCount: config.canaryCount ?? 1,
      maxConcurrent: config.maxConcurrent ?? 3,
      minCapacityPct: config.minCapacityPct ?? 50,
      maxFailures: config.maxFailures ?? 2,
    };
    this.status = {
      id: randomUUID(),
      targetVersion: config.targetVersion,
      state: 'planning',
      totalEligible: 0,
      pending: [],
      inProgress: [],
      completed: [],
      failed: [],
    };
  }

  getStatus(): FleetUpdateStatus {
    return { ...this.status };
  }

  /** Supply the latest snapshot of workers */
  updateState(workers: WorkerView[]) {
    this.workers = workers;
    if (this.active) this.evaluate();
  }

  async start(initialWorkers: WorkerView[]) {
    this.workers = initialWorkers;
    this.active = true;
    
    // Filter eligible: online, not already at target version
    const eligible = this.workers.filter(w => 
      w.status === 'online' && w.version !== this.config.targetVersion
    ).map(w => w.id);
    
    this.status.totalEligible = eligible.length;
    this.status.pending = eligible;
    
    if (eligible.length === 0) {
      this.status.state = 'completed';
      this.active = false;
      this.emit('completed', this.status);
      return;
    }

    logger.info(`[fleet-updater:${this.status.id}] Started. Eligible workers: ${eligible.length}`);
    this.status.state = this.config.canaryCount > 0 ? 'canary' : 'rolling';
    this.checkInterval = setInterval(() => this.evaluate(), 5000);
    this.evaluate();
  }

  stop(reason?: string) {
    this.active = false;
    if (this.checkInterval) clearInterval(this.checkInterval);
    if (this.status.state !== 'completed' && this.status.state !== 'failed') {
      this.status.state = 'paused';
      if (reason) this.status.error = reason;
      this.emit('paused', this.status);
    }
  }

  private async triggerWorkerUpdate(workerId: string) {
    logger.info(`[fleet-updater:${this.status.id}] Triggering update for ${workerId}`);
    try {
      const redis = QueueService.getRedis();
      if (redis) {
        await redis.publish(`traffic:worker:${workerId}:commands`, JSON.stringify({
          type: 'update',
          targetVersion: this.config.targetVersion
        }));
      }
    } catch (e) {
      logger.error(`[fleet-updater:${this.status.id}] Failed to trigger worker ${workerId}`, { error: e });
    }
  }

  // Handle events emitted by UpdateReconciler
  handleWorkerEvent(workerId: string, event: 'completed' | 'failed') {
    if (!this.active) return;
    
    const inProgIdx = this.status.inProgress.indexOf(workerId);
    if (inProgIdx !== -1) {
      this.status.inProgress.splice(inProgIdx, 1);
      if (event === 'completed') {
        this.status.completed.push(workerId);
      } else {
        this.status.failed.push(workerId);
      }
      this.evaluate();
    }
  }

  private evaluate() {
    if (!this.active) return;

    // Check failures
    if (this.status.failed.length >= this.config.maxFailures) {
      logger.error(`[fleet-updater:${this.status.id}] Max failures reached (${this.status.failed.length}). Pausing rollout.`);
      this.stop('Max failures reached');
      return;
    }

    if (this.status.pending.length === 0 && this.status.inProgress.length === 0) {
      logger.info(`[fleet-updater:${this.status.id}] Rollout complete.`);
      this.status.state = 'completed';
      this.active = false;
      if (this.checkInterval) clearInterval(this.checkInterval);
      this.emit('completed', this.status);
      return;
    }

    if (this.status.state === 'canary') {
      // Are we done with canaries?
      if (this.status.completed.length >= this.config.canaryCount) {
        logger.info(`[fleet-updater:${this.status.id}] Canary phase complete. Moving to rolling phase.`);
        this.status.state = 'rolling';
        this.emit('phase_changed', this.status);
      } else {
        // Need to start canaries
        const canariesNeeded = this.config.canaryCount - (this.status.completed.length + this.status.inProgress.length);
        this.dispatch(canariesNeeded);
        return;
      }
    }

    if (this.status.state === 'rolling') {
      const availableConcurrency = this.config.maxConcurrent - this.status.inProgress.length;
      if (availableConcurrency > 0) {
        // Enforce minCapacityPct
        const onlineTotal = this.workers.filter(w => w.status === 'online').length;
        const onlineHealthy = this.workers.filter(w => w.status === 'online' && !this.status.inProgress.includes(w.id)).length;
        
        // We can only dispatch X workers before onlineHealthy drops below minCapacityPct
        // minCapacity = ceil(onlineTotal * (minCapacityPct / 100))
        const minRequired = Math.ceil(onlineTotal * (this.config.minCapacityPct / 100));
        
        let dispatchCount = 0;
        let simulatedHealthy = onlineHealthy;
        
        for (let i = 0; i < availableConcurrency; i++) {
          if (simulatedHealthy - 1 >= minRequired && this.status.pending.length > dispatchCount) {
            dispatchCount++;
            simulatedHealthy--;
          }
        }
        
        this.dispatch(dispatchCount);
      }
    }
  }

  private dispatch(count: number) {
    for (let i = 0; i < count; i++) {
      const workerId = this.status.pending.shift();
      if (workerId) {
        this.status.inProgress.push(workerId);
        this.triggerWorkerUpdate(workerId).catch(() => {});
      }
    }
    if (count > 0) {
      this.emit('progress', this.status);
    }
  }
}
