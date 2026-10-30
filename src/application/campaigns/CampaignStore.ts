import { mkdir, readFile, writeFile, unlink, rename } from 'fs/promises';
import { join } from 'path';
import { randomUUID } from 'crypto';
import { CampaignView, CampaignJobOptions } from '../../domain/control/ControlContract';
import { QueueService } from '../../infrastructure/queue/QueueService';

/**
 * File-based campaign store.
 * Campaigns are stored as individual JSON files in <dataDir>/campaigns/.
 * This deliberately avoids Redis so campaigns survive Redis restarts.
 */
export class CampaignStore {
  private dir: string;
  private mutations = new Map<string, Promise<unknown>>();
  private async accounting(view: CampaignView): Promise<CampaignView> {
    const redis = QueueService.getRedis();
    if (redis?.status === 'ready') {
      const counts = await redis.hgetall(`traffic:campaign-counts:${view.id}`);
      if (Object.keys(counts).length) view.stats = { totalQueued: Number(counts.totalQueued || 0), totalCompleted: Number(counts.totalCompleted || 0), totalFailed: Number(counts.totalFailed || 0), lastRunAt: counts.lastRunAt || null };
    }
    return view;
  }
  private async mutate(id: string, change: (campaign: CampaignView) => CampaignView): Promise<CampaignView | undefined> {
    const pending = (this.mutations.get(id) || Promise.resolve()).catch(() => undefined).then(async () => {
      const existing = await this.get(id); if (!existing) return undefined;
      const updated = { ...change(existing), id, updatedAt: new Date().toISOString() };
      await this.write(updated); return updated;
    });
    this.mutations.set(id, pending);
    try { return await pending; } finally { if (this.mutations.get(id) === pending) this.mutations.delete(id); }
  }

  constructor(dataDir: string = process.env.SESSIONS_DATA_DIR || './sessions') {
    this.dir = join(dataDir, 'campaigns');
  }

  private filePath(id: string): string {
    // Sanitise: IDs must be valid UUIDs (hex + dashes only)
    if (!/^[a-f0-9-]{36}$/.test(id)) throw new Error('Invalid campaign ID');
    return join(this.dir, `${id}.json`);
  }

  async ensureDir(): Promise<void> {
    await mkdir(this.dir, { recursive: true });
  }

  async list(): Promise<CampaignView[]> {
    await this.ensureDir();
    const { readdir } = await import('fs/promises');
    const names = await readdir(this.dir).catch(() => [] as string[]);
    const campaigns: CampaignView[] = [];
    const { circuitStore } = await import('./CircuitStore');
    for (const name of names) {
      if (!name.endsWith('.json')) continue;
      try {
        const raw = await readFile(join(this.dir, name), 'utf8');
        const view = JSON.parse(raw) as CampaignView;
        const circuit = await circuitStore.get(view.id);
        if (circuit && circuit.state !== 'closed') {
          // Calculate failure rate dynamically
          const { circuitBreakerService } = await import('./CircuitBreakerService');
          const payload = (circuitBreakerService as any).buildEventPayload(circuit);
          view.circuit = payload;
        } else if (circuit) {
           view.circuit = { state: 'closed', failureRate: 0, sampleSize: 0, consecutiveFailures: circuit.consecutiveFailures };
        }
        campaigns.push(await this.accounting(view));
      } catch {
        // Skip corrupt files silently
      }
    }
    return campaigns.sort((a, b) => b.updatedAt.localeCompare(a.updatedAt));
  }

  async get(id: string): Promise<CampaignView | undefined> {
    try {
      const raw = await readFile(this.filePath(id), 'utf8');
      const view = JSON.parse(raw) as CampaignView;
      const { circuitStore } = await import('./CircuitStore');
      const circuit = await circuitStore.get(view.id);
      if (circuit && circuit.state !== 'closed') {
        const { circuitBreakerService } = await import('./CircuitBreakerService');
        const payload = (circuitBreakerService as any).buildEventPayload(circuit);
        view.circuit = payload;
      } else if (circuit) {
         view.circuit = { state: 'closed', failureRate: 0, sampleSize: 0, consecutiveFailures: circuit.consecutiveFailures };
      }
      return this.accounting(view);
    } catch {
      return undefined;
    }
  }

  async create(options: CampaignJobOptions): Promise<CampaignView> {
    await this.ensureDir();
    const now = new Date().toISOString();
    const campaign: CampaignView = {
      id: randomUUID(),
      status: 'draft',
      stats: { totalQueued: 0, totalCompleted: 0, totalFailed: 0, lastRunAt: null },
      createdAt: now,
      updatedAt: now,
      ...options,
    };
    await this.write(campaign);
    return campaign;
  }

  async update(id: string, patch: Partial<CampaignJobOptions & { status: CampaignView['status'] }>): Promise<CampaignView | undefined> {
    return this.mutate(id, existing => ({ ...existing, ...patch }));
  }

  async updateStats(id: string, delta: Partial<CampaignView['stats']>): Promise<void> {
    await this.mutate(id, existing => ({ ...existing, stats: { ...existing.stats, ...delta } }));
  }

  async incrementStats(id: string, increments: { totalQueued?: number; totalCompleted?: number; totalFailed?: number }, lastRunAt?: string): Promise<void> {
    await this.mutate(id, existing => {
      const stats = { ...existing.stats };
      if (increments.totalQueued) stats.totalQueued += increments.totalQueued;
      if (increments.totalCompleted) stats.totalCompleted += increments.totalCompleted;
      if (increments.totalFailed) stats.totalFailed += increments.totalFailed;
      if (lastRunAt) stats.lastRunAt = lastRunAt;
      return { ...existing, stats };
    });
  }

  async delete(id: string): Promise<boolean> {
    try {
      await unlink(this.filePath(id));
      return true;
    } catch {
      return false;
    }
  }

  private async write(campaign: CampaignView): Promise<void> {
    const path = this.filePath(campaign.id);
    const tmp = `${path}.tmp`;
    try {
      await writeFile(tmp, JSON.stringify(campaign, null, 2) + '\n', { mode: 0o600, flag: 'w' });
      await rename(tmp, path);
    } catch (error) {
      await unlink(tmp).catch(() => undefined);
      throw error;
    }
  }
}

/** Singleton instance shared by the controller */
export const campaignStore = new CampaignStore();
