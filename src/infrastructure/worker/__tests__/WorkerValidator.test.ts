import { validateProfileAgainstWorker } from '../WorkerValidator';
import { WorkerCapabilities } from '../../../domain/entities/WorkerContract';
import { BrowserProfile } from '../../browser/profile/BrowserProfile';

describe('WorkerValidator', () => {
  const linuxWorker: WorkerCapabilities = {
    workerId: 'test-linux-01',
    platform: 'linux',
    architecture: 'x64',
    browsers: [{ browser: 'chrome' }],
    containerized: true,
    mobile: false,
    gpuAvailable: false,
    maxConcurrentSessions: 5,
  };

  const windowsWorker: WorkerCapabilities = {
    workerId: 'test-windows-01',
    platform: 'windows',
    architecture: 'x64',
    browsers: [{ browser: 'chrome' }, { browser: 'edge' }],
    containerized: false,
    mobile: false,
    gpuAvailable: true,
    maxConcurrentSessions: 5,
  };

  const androidWorker: WorkerCapabilities = {
    workerId: 'test-android-01',
    platform: 'android',
    architecture: 'arm64',
    browsers: [{ browser: 'chrome' }],
    containerized: false,
    mobile: true,
    gpuAvailable: true,
    maxConcurrentSessions: 2,
  };

  const createProfile = (overrides: Partial<BrowserProfile> = {}): BrowserProfile => ({
    schemaVersion: 1, id: 'test', deviceId: 'test', source: 'catalog',
    browser: 'chrome', operatingSystem: 'linux', browserVersion: '120.0.0.0', osVersion: '10.0',
    userAgent: 'test', clientHints: null,
    viewport: { width: 1280, height: 720 },
    screen: { width: 1920, height: 1080, availWidth: 1920, availHeight: 1080 },
    devicePixelRatio: 1, mobile: false, touch: false,
    locale: 'en-US', languages: ['en-US', 'en'], acceptLanguage: 'en-US,en', timezone: 'America/New_York',
    hardware: { cores: 8, memory: 8 }, gpu: { vendor: 'test', renderer: 'test' },
    platform: 'Linux x86_64', rendering: 'native', permissions: 'native',
    ...overrides,
  } as BrowserProfile);

  it('allows Linux Chrome profile on Linux worker', () => {
    const profile = createProfile({ operatingSystem: 'linux', browser: 'chrome' });
    expect(() => validateProfileAgainstWorker(profile, linuxWorker)).not.toThrow();
  });

  it('rejects Windows profile on Linux worker', () => {
    const profile = createProfile({ operatingSystem: 'windows', browser: 'chrome' });
    expect(() => validateProfileAgainstWorker(profile, linuxWorker)).toThrow(/supported/);
  });

  it('allows Windows Edge profile on Windows worker', () => {
    const profile = createProfile({ operatingSystem: 'windows', browser: 'edge' });
    expect(() => validateProfileAgainstWorker(profile, windowsWorker)).not.toThrow();
  });

  it('rejects macOS Safari profile on Windows worker', () => {
    const profile = createProfile({ operatingSystem: 'macos', browser: 'safari' });
    expect(() => validateProfileAgainstWorker(profile, windowsWorker)).toThrow(/supported/);
  });

  it('allows Android Chrome on Android worker', () => {
    const profile = createProfile({ operatingSystem: 'android', browser: 'chrome', mobile: true });
    expect(() => validateProfileAgainstWorker(profile, androidWorker)).not.toThrow();
  });

  it('rejects desktop profile on mobile Android worker', () => {
    const profile = createProfile({ operatingSystem: 'windows', browser: 'chrome', mobile: false });
    expect(() => validateProfileAgainstWorker(profile, androidWorker)).toThrow(/supported/);
  });
});
