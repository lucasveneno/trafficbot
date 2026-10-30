import fs from 'fs/promises';
import path from 'path';
import os from 'os';

export class EnrollmentClient {
  static get configPath() {
    return path.join(os.homedir(), '.trafficbot-worker', 'config.json');
  }

  static async enroll(token: string, serverUrl: string) {
    console.log(`Enrolling worker with server ${serverUrl}...`);
    try {
      const response = await fetch(`${serverUrl}/api/workers/register`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ token }),
        signal: AbortSignal.timeout(10000),
      });
      
      if (!response.ok) {
        const err = await response.json().catch(() => ({}));
        throw new Error(`Enrollment failed (${response.status}): ${err.error || 'Unknown error'}`);
      }
      
      const config = await response.json();
      
      await fs.mkdir(path.dirname(this.configPath), { recursive: true, mode: 0o700 });
      await fs.writeFile(this.configPath, JSON.stringify(config.setupConfig, null, 2), { mode: 0o600 });
      console.log(`Worker successfully enrolled. Configuration saved to ${this.configPath}`);
    } catch (e) {
      console.error(e instanceof Error ? e.message : e);
      process.exit(1);
    }
  }

  static async loadConfig() {
    try {
      const raw = await fs.readFile(this.configPath, 'utf8');
      return JSON.parse(raw);
    } catch {
      return null;
    }
  }
}
