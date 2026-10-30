import { mkdir, readFile, writeFile } from 'fs/promises';
import { join } from 'path';
import { PersistedCircuitState } from '../../domain/control/CircuitBreakerContract';

export class CircuitStore {
  private dir: string;

  constructor(dataDir: string = process.env.SESSIONS_DATA_DIR || './sessions') {
    this.dir = join(dataDir, 'circuits');
  }

  private filePath(campaignId: string): string {
    if (!/^[a-f0-9-]{36}$/.test(campaignId)) throw new Error('Invalid campaign ID');
    return join(this.dir, `${campaignId}.json`);
  }

  async ensureDir(): Promise<void> {
    await mkdir(this.dir, { recursive: true });
  }

  async get(campaignId: string): Promise<PersistedCircuitState | undefined> {
    try {
      const raw = await readFile(this.filePath(campaignId), 'utf8');
      return JSON.parse(raw) as PersistedCircuitState;
    } catch {
      return undefined;
    }
  }

  async save(state: PersistedCircuitState): Promise<void> {
    await this.ensureDir();
    state.updatedAt = new Date().toISOString();
    await writeFile(this.filePath(state.campaignId), JSON.stringify(state, null, 2), 'utf8');
  }
}

export const circuitStore = new CircuitStore();
