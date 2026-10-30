import { Worker } from 'bullmq';

export class CapacityGuard {
  private active = 0;
  private queue: { resolve: () => void, priority: boolean }[] = [];
  private workers: Worker[] = [];

  constructor(private capacity: number) {}

  addWorker(worker: Worker) {
    this.workers.push(worker);
  }

  async acquire(priority: boolean): Promise<void> {
    if (this.active < this.capacity) {
      this.active++;
      this.checkPause();
      return;
    }

    return new Promise<void>(resolve => {
      if (priority) {
        // Insert before any non-priority items
        const firstNonPriority = this.queue.findIndex(item => !item.priority);
        if (firstNonPriority === -1) {
          this.queue.push({ resolve, priority });
        } else {
          this.queue.splice(firstNonPriority, 0, { resolve, priority });
        }
      } else {
        this.queue.push({ resolve, priority });
      }
    });
  }

  release(): void {
    if (this.queue.length > 0) {
      const next = this.queue.shift()!;
      next.resolve();
    } else {
      this.active--;
      this.checkPause();
    }
  }

  private checkPause() {
    if (this.active >= this.capacity) {
      // Best-effort pause to avoid fetching more jobs than necessary
      this.workers.forEach(w => w.pause().catch(() => {}));
    } else {
      this.workers.forEach(w => { w.resume(); });
    }
  }
}
