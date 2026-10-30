import { mkdir, readFile, writeFile } from 'fs/promises';
import { join } from 'path';
import { randomUUID } from 'crypto';
import { ProxyRecord } from '../../domain/control/ProxyContract';
import { encryptionService } from '../../infrastructure/security/EncryptionService';

export class ProxyStore {
  private dir: string;

  constructor(dataDir: string = process.env.SESSIONS_DATA_DIR || './sessions') {
    this.dir = join(dataDir, 'proxies');
  }

  private filePath(id: string): string {
    if (!/^[a-f0-9-]{36}$/.test(id)) throw new Error('Invalid proxy ID');
    return join(this.dir, `${id}.json`);
  }

  async ensureDir(): Promise<void> {
    await mkdir(this.dir, { recursive: true });
  }

  async list(): Promise<ProxyRecord[]> {
    await this.ensureDir();
    const { readdir } = await import('fs/promises');
    const names = await readdir(this.dir).catch(() => [] as string[]);
    const records: ProxyRecord[] = [];
    for (const name of names) {
      if (!name.endsWith('.json')) continue;
      try {
        const raw = await readFile(join(this.dir, name), 'utf8');
        records.push(JSON.parse(raw));
      } catch {
        // skip corrupt
      }
    }
    return records;
  }

  async get(id: string): Promise<ProxyRecord | undefined> {
    try {
      const raw = await readFile(this.filePath(id), 'utf8');
      return JSON.parse(raw);
    } catch {
      return undefined;
    }
  }

  async save(record: ProxyRecord): Promise<void> {
    await this.ensureDir();
    await writeFile(this.filePath(record.id), JSON.stringify(record, null, 2), 'utf8');
  }

  async add(record: Omit<ProxyRecord, 'id' | 'passwordEncrypted'> & { password?: string }): Promise<ProxyRecord> {
    const id = randomUUID();
    const newRecord: ProxyRecord = {
      ...record,
      id,
      passwordEncrypted: record.password ? encryptionService.encrypt(record.password) : undefined,
    };
    // @ts-ignore
    delete newRecord.password;
    await this.save(newRecord);
    return newRecord;
  }

  async update(id: string, updates: Partial<ProxyRecord> & { password?: string }): Promise<ProxyRecord | undefined> {
    const record = await this.get(id);
    if (!record) return undefined;

    if (updates.password !== undefined) {
      if (updates.password === '') {
         record.passwordEncrypted = undefined;
      } else {
         record.passwordEncrypted = encryptionService.encrypt(updates.password);
      }
    }

    Object.assign(record, updates);
    // @ts-ignore
    delete record.password;
    
    await this.save(record);
    return record;
  }

  /** Gets the decrypted password for a proxy */
  async getPassword(id: string): Promise<string | undefined> {
    const record = await this.get(id);
    if (!record || !record.passwordEncrypted) return undefined;
    return encryptionService.decrypt(record.passwordEncrypted);
  }

  async delete(id: string): Promise<boolean> {
    try {
      const { unlink } = await import('fs/promises');
      await unlink(this.filePath(id));
      return true;
    } catch {
      return false;
    }
  }
}

export const proxyStore = new ProxyStore();
