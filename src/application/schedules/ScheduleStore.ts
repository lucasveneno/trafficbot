import { mkdir, readFile, writeFile, unlink, rename, readdir } from 'fs/promises';
import { join } from 'path';
import { randomUUID } from 'crypto';
import { ScheduleView, ScheduleJobOptions } from '../../domain/control/ControlContract';

/**
 * File-based schedule store.
 * Schedules are stored as individual JSON files in <dataDir>/schedules/.
 * Atomic writes via tmp+rename, same pattern as CampaignStore and ProfileStore.
 */
export class ScheduleStore {
  private dir: string;

  constructor(dataDir: string = process.env.SESSIONS_DATA_DIR || './sessions') {
    this.dir = join(dataDir, 'schedules');
  }

  private filePath(id: string): string {
    if (!/^[a-f0-9-]{36}$/.test(id)) throw new Error('Invalid schedule ID');
    return join(this.dir, `${id}.json`);
  }

  async ensureDir(): Promise<void> {
    await mkdir(this.dir, { recursive: true });
  }

  async list(): Promise<ScheduleView[]> {
    await this.ensureDir();
    const names = await readdir(this.dir).catch(() => [] as string[]);
    const schedules: ScheduleView[] = [];
    for (const name of names) {
      if (!name.endsWith('.json')) continue;
      try {
        const raw = await readFile(join(this.dir, name), 'utf8');
        schedules.push(JSON.parse(raw) as ScheduleView);
      } catch { /* skip corrupt files */ }
    }
    return schedules.sort((a, b) => a.name.localeCompare(b.name));
  }

  async get(id: string): Promise<ScheduleView | undefined> {
    try {
      const raw = await readFile(this.filePath(id), 'utf8');
      return JSON.parse(raw) as ScheduleView;
    } catch { return undefined; }
  }

  async create(options: ScheduleJobOptions, nextRunAt: string | null): Promise<ScheduleView> {
    await this.ensureDir();
    const now = new Date().toISOString();
    const schedule: ScheduleView = {
      id: randomUUID(),
      nextRunAt,
      lastRunAt: null,
      runCount: 0,
      failCount: 0,
      createdAt: now,
      updatedAt: now,
      ...options,
    };
    await this.write(schedule);
    return schedule;
  }

  async update(id: string, patch: Partial<ScheduleView>): Promise<ScheduleView | undefined> {
    const existing = await this.get(id);
    if (!existing) return undefined;
    const updated: ScheduleView = { ...existing, ...patch, id, updatedAt: new Date().toISOString() };
    await this.write(updated);
    return updated;
  }

  async delete(id: string): Promise<boolean> {
    try { await unlink(this.filePath(id)); return true; }
    catch { return false; }
  }

  private async write(schedule: ScheduleView): Promise<void> {
    const path = this.filePath(schedule.id);
    const tmp = `${path}.tmp`;
    try {
      await writeFile(tmp, JSON.stringify(schedule, null, 2) + '\n', { mode: 0o600, flag: 'w' });
      await rename(tmp, path);
    } catch (error) {
      await unlink(tmp).catch(() => undefined);
      throw error;
    }
  }
}

export const scheduleStore = new ScheduleStore();
