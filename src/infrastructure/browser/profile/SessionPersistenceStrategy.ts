import { BrowserProfile } from './BrowserProfile';
import { ProfileStore } from './ProfileStore';

export interface SessionPersistenceStrategy {
  prepare(profile: BrowserProfile, userDataDir?: string): Promise<void>;
  persist(profile: BrowserProfile, userDataDir?: string): Promise<void>;
  validate(profile: BrowserProfile, currentWorkerSerial?: string): Promise<void>;
}

export class DesktopProfilePersistenceStrategy implements SessionPersistenceStrategy {
  async prepare(profile: BrowserProfile, userDataDir?: string): Promise<void> {
    if (userDataDir) {
      await ProfileStore.prepareChromePreferences(userDataDir);
    }
  }

  async persist(profile: BrowserProfile, userDataDir?: string): Promise<void> {
    if (userDataDir) {
      await ProfileStore.write(userDataDir, profile);
    }
  }

  async validate(profile: BrowserProfile): Promise<void> {
    if (profile.operatingSystem === 'android') {
      throw new Error('Desktop strategy cannot handle Android profiles');
    }
  }
}

export class AndroidDevicePersistenceStrategy implements SessionPersistenceStrategy {
  async prepare(_profile: BrowserProfile, _userDataDir?: string): Promise<void> {
    // Nothing to do, Android Chrome manages state internally
  }

  async persist(profile: BrowserProfile, userDataDir?: string): Promise<void> {
    if (userDataDir) {
      // For Android, we ONLY write the profile.json metadata into the userDataDir,
      // we do not attempt to extract or store Chrome preferences.
      await ProfileStore.write(userDataDir, profile);
    }
  }

  async validate(profile: BrowserProfile, currentWorkerSerial?: string): Promise<void> {
    if (profile.operatingSystem !== 'android') {
      throw new Error('Android strategy can only handle Android profiles');
    }
    if (!profile.deviceSerial) {
      throw new Error('Persistent Android sessions must specify deviceSerial');
    }
    if (currentWorkerSerial && profile.deviceSerial !== currentWorkerSerial) {
      throw new Error(`Profile belongs to device ${profile.deviceSerial} but was executed on ${currentWorkerSerial}`);
    }
  }
}
