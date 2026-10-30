import { BrowserExecutableResolver } from '../../browser/BrowserExecutableResolver';
import { WorkerCapabilities } from '../../../domain/entities/WorkerContract';

describe('BrowserExecutableResolver', () => {
  const workerCaps: WorkerCapabilities = {
    workerId: 'test',
    platform: 'windows',
    architecture: 'x64',
    containerized: false,
    mobile: false,
    gpuAvailable: true,
    maxConcurrentSessions: 5,
    browsers: [
      { browser: 'chrome', version: '140', executablePath: 'C:\\chrome.exe' },
      { browser: 'edge', version: '140', executablePath: 'C:\\edge.exe' }
    ]
  };

  it('resolves chrome correctly if specified in device profile', () => {
    const path = BrowserExecutableResolver.resolveExecutable('windows-chrome-1440', 'windows', workerCaps);
    expect(path).toBe('C:\\chrome.exe');
  });

  it('resolves edge correctly if specified in device profile', () => {
    const path = BrowserExecutableResolver.resolveExecutable('windows-edge-1440', 'windows', workerCaps);
    expect(path).toBe('C:\\edge.exe');
  });

  it('defaults to chrome if no device profile provided', () => {
    const path = BrowserExecutableResolver.resolveExecutable(undefined, 'windows', workerCaps);
    expect(path).toBe('C:\\chrome.exe');
  });

  it('throws error if required browser is not installed', () => {
    const capsWithoutEdge: WorkerCapabilities = {
      ...workerCaps,
      browsers: [{ browser: 'chrome', version: '140', executablePath: 'C:\\chrome.exe' }]
    };
    expect(() => BrowserExecutableResolver.resolveExecutable('windows-edge-1440', 'windows', capsWithoutEdge))
      .toThrow(/not supported on this worker/);
  });

  it('returns undefined if executablePath is not set in worker caps', () => {
    const capsWithoutPath: WorkerCapabilities = {
      ...workerCaps,
      browsers: [{ browser: 'chrome', version: '140' }]
    };
    const path = BrowserExecutableResolver.resolveExecutable('windows-chrome-1440', 'linux', capsWithoutPath);
    expect(path).toBeUndefined();
  });

  it('returns undefined if workerCaps is null', () => {
    const path = BrowserExecutableResolver.resolveExecutable('windows-chrome-1440', 'windows', null);
    expect(path).toBeUndefined();
  });
});
