import { WindowsDetector } from '../WindowsDetector';
import os from 'os';
import fs from 'fs';
import child_process from 'child_process';

jest.mock('os');
jest.mock('fs');
jest.mock('child_process');

describe('WindowsDetector', () => {
  beforeEach(() => {
    jest.resetAllMocks();
    (os.homedir as jest.Mock).mockReturnValue('C:\\Users\\Test');
  });

  it('throws an error if not on Windows', () => {
    (os.platform as jest.Mock).mockReturnValue('linux');
    expect(() => WindowsDetector.detectCapabilities('worker-1', 5)).toThrow(/only be used on Windows/);
  });

  it('detects Chrome and Edge properly on Windows', () => {
    (os.platform as jest.Mock).mockReturnValue('win32');
    (os.arch as jest.Mock).mockReturnValue('x64');

    (fs.existsSync as jest.Mock).mockImplementation((path: string) => {
      if (path.includes('chrome.exe') || path.includes('msedge.exe')) return true;
      return false;
    });

    (child_process.execSync as jest.Mock).mockImplementation((cmd: string) => {
      if (cmd.includes('chrome.exe')) return '140.0.6099.109\n';
      if (cmd.includes('msedge.exe')) return '140.0.1000.0\n';
      return '';
    });

    const caps = WindowsDetector.detectCapabilities('worker-1', 5);

    expect(caps.platform).toBe('windows');
    expect(caps.workerId).toBe('worker-1');
    expect(caps.maxConcurrentSessions).toBe(5);
    
    expect(caps.browsers).toHaveLength(2);
    
    const chrome = caps.browsers.find(b => b.browser === 'chrome');
    expect(chrome).toBeDefined();
    expect(chrome?.version).toBe('140.0.6099.109');
    expect(chrome?.executablePath).toContain('chrome.exe');

    const edge = caps.browsers.find(b => b.browser === 'edge');
    expect(edge).toBeDefined();
    expect(edge?.version).toBe('140.0.1000.0');
    expect(edge?.executablePath).toContain('msedge.exe');
  });

  it('omits browsers that are not found', () => {
    (os.platform as jest.Mock).mockReturnValue('win32');
    (os.arch as jest.Mock).mockReturnValue('x64');

    (fs.existsSync as jest.Mock).mockReturnValue(false);

    const caps = WindowsDetector.detectCapabilities('worker-2', 10);
    expect(caps.browsers).toHaveLength(0);
  });
});
