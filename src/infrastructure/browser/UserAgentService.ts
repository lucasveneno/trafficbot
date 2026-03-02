import fs from 'fs';
import path from 'path';

interface UserAgentEntry {
  ua: string;
  platform?: string;
  browser?: string;
}

export class UserAgentService {
  private static UA_DIR = path.join(process.cwd(), 'useragent');
  private static cache: Record<string, UserAgentEntry[]> = {};

  /**
   * Gets a random User-Agent, optionally filtered by type and platform.
   * Also performs non-destructive randomization of minor version components.
   */
  static getRandomUA(type: string = 'most-common', platform?: string): { ua: string; platform: string } {
    const entries = this.loadEntries(type);
    
    // Filter by platform if provided (mapping win32/darwin/linux)
    let filtered = platform 
      ? entries.filter(e => e.platform === platform)
      : entries;

    // Fallback if no entries match the platform
    if (filtered.length === 0) {
      filtered = entries;
    }

    const selected = filtered[Math.floor(Math.random() * filtered.length)];
    const randomizedUA = this.randomizeVersion(selected.ua);

    return { 
      ua: randomizedUA, 
      platform: selected.platform || 'win32' 
    };
  }

  private static loadEntries(type: string): UserAgentEntry[] {
    if (this.cache[type]) return this.cache[type];

    const filePath = path.join(this.UA_DIR, `${type}.json`);
    if (!fs.existsSync(filePath)) {
      throw new Error(`User-Agent file not found: ${filePath}`);
    }

    const data = JSON.parse(fs.readFileSync(filePath, 'utf-8'));
    this.cache[type] = Array.isArray(data) ? data : [];
    return this.cache[type];
  }

  /**
   * Randomizes the minor/patch version parts of Chrome User-Agents
   * Example: Chrome/145.0.0.0 -> Chrome/145.0.4285.12
   */
  private static randomizeVersion(ua: string): string {
    return ua.replace(/Chrome\/(\d+)\.0\.0\.0/, (_, major) => {
      const build = Math.floor(Math.random() * 5000) + 1000;
      const patch = Math.floor(Math.random() * 200);
      return `Chrome/${major}.0.${build}.${patch}`;
    });
  }
}
