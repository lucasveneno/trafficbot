import { mkdir, readFile, rename, writeFile, unlink, readdir } from 'fs/promises';
import { join } from 'path';
import { BrowserProfile, validateProfile } from './BrowserProfile';
import { SessionPersistenceStrategy, DesktopProfilePersistenceStrategy, AndroidDevicePersistenceStrategy } from './SessionPersistenceStrategy';

/** The caller must hold ProfileLease for this directory for the entire browser session. */
export class ProfileStore {
  static getStrategy(profile: BrowserProfile): SessionPersistenceStrategy {
    if (profile.operatingSystem === 'android') {
      return new AndroidDevicePersistenceStrategy();
    }
    return new DesktopProfilePersistenceStrategy();
  }

  /** Disable Chrome's own startup/session restore before launch. Restored tabs
   * can issue requests before page-scoped identity and scope policy exist. */
  static async prepareChromePreferences(directory: string): Promise<void> {
    const defaultDirectory = join(directory, 'Default');
    const preferencesPath = join(defaultDirectory, 'Preferences');
    await mkdir(defaultDirectory, { recursive: true });
    let preferences: Record<string, unknown> = {};
    try {
      const parsed: unknown = JSON.parse(await readFile(preferencesPath, 'utf8'));
      if (!parsed || typeof parsed !== 'object' || Array.isArray(parsed)) throw new Error();
      preferences = parsed as Record<string, unknown>;
    } catch (error) {
      if ((error as NodeJS.ErrnoException).code !== 'ENOENT')
        throw new Error('Chrome Preferences is invalid; inspect it rather than replacing it silently');
    }
    const existingSession = preferences.session;
    const session = existingSession && typeof existingSession === 'object' && !Array.isArray(existingSession)
      ? existingSession as Record<string, unknown> : {};
    preferences.session = { ...session, restore_on_startup: 5 };
    const temporary = `${preferencesPath}.trafficbot-${process.pid}.tmp`;
    try {
      await writeFile(temporary, JSON.stringify(preferences), { mode: 0o600, flag: 'wx' });
      await rename(temporary, preferencesPath);
    } catch (error) {
      await unlink(temporary).catch(() => undefined);
      throw error;
    }

    // Chrome on macOS may restore these files even when restore_on_startup is
    // disabled. Archive them instead of deleting them so no tab can request a
    // site before page-scoped identity and navigation policy are installed.
    const sessionsDirectory = join(defaultDirectory, 'Sessions');
    const candidates: Array<{ directory: string; name: string }> = [];
    for (const source of [defaultDirectory, sessionsDirectory]) {
      const names = await readdir(source).catch((error: NodeJS.ErrnoException) => {
        if (error.code === 'ENOENT') return [];
        throw error;
      });
      for (const name of names) {
        if (/^(?:Session_|Tabs_|Current Session$|Current Tabs$|Last Session$|Last Tabs$)/.test(name))
          candidates.push({ directory: source, name });
      }
    }
    if (candidates.length) {
      const archive = join(defaultDirectory, 'Trafficbot Session Archive', `${Date.now()}-${process.pid}`);
      await mkdir(archive, { recursive: true });
      for (const [index, candidate] of candidates.entries())
        await rename(join(candidate.directory, candidate.name), join(archive, `${index}-${candidate.name}`));
    }
  }

  static async read(directory: string): Promise<BrowserProfile | undefined> {
    try { return validateProfile(JSON.parse(await readFile(join(directory, 'browser-profile.json'), 'utf8'))); }
    catch (error) { if ((error as NodeJS.ErrnoException).code === 'ENOENT') return undefined; throw new Error('Stored browser profile is invalid; inspect it rather than replacing it silently'); }
  }
  static async write(directory: string, profile: BrowserProfile): Promise<void> {
    const data = validateProfile(profile);
    await mkdir(directory, { recursive: true });
    const temporary = join(directory, 'browser-profile.json.tmp');
    try {
      await writeFile(temporary, JSON.stringify(data, null, 2) + '\n', { mode: 0o600, flag: 'wx' });
      await rename(temporary, join(directory, 'browser-profile.json'));
    } catch (error) {
      if ((error as NodeJS.ErrnoException).code !== 'EEXIST') await unlink(temporary).catch(() => undefined);
      throw error;
    }
  }
}
