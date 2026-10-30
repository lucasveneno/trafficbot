import os from 'os';
import fs from 'fs';
import path from 'path';
import { execSync } from 'child_process';
import { BrowserCapability, WorkerCapabilities } from '../../domain/entities/WorkerContract';

export class WindowsDetector {
  static detectCapabilities(workerId: string, maxSessions: number): WorkerCapabilities {
    if (os.platform() !== 'win32') {
      throw new Error('WindowsDetector can only be used on Windows');
    }

    const browsers = this.detectBrowsers();

    return {
      workerId,
      platform: 'windows',
      architecture: os.arch() === 'arm64' ? 'arm64' : 'x64', // Best effort mapping
      containerized: false, // Assume false for native Windows runs
      mobile: false,
      gpuAvailable: true, // Native typically has some GPU available
      maxConcurrentSessions: maxSessions,
      browsers,
    };
  }

  private static detectBrowsers(): BrowserCapability[] {
    const browsers: BrowserCapability[] = [];
    
    // Chrome paths
    const localAppData = process.env.LOCALAPPDATA || path.join(os.homedir(), 'AppData', 'Local');
    const programFiles = process.env.PROGRAMFILES || 'C:\\Program Files';
    const programFilesX86 = process.env['ProgramFiles(x86)'] || 'C:\\Program Files (x86)';

    const chromePaths = [
      path.join(programFiles, 'Google', 'Chrome', 'Application', 'chrome.exe'),
      path.join(programFilesX86, 'Google', 'Chrome', 'Application', 'chrome.exe'),
      path.join(localAppData, 'Google', 'Chrome', 'Application', 'chrome.exe'),
    ];

    for (const p of chromePaths) {
      if (fs.existsSync(p)) {
        const version = this.getExecutableVersion(p);
        if (version) {
          browsers.push({ browser: 'chrome', version, executablePath: p });
          break; // Stop after finding the first valid installation
        }
      }
    }

    // Edge paths
    const edgePaths = [
      path.join(programFiles, 'Microsoft', 'Edge', 'Application', 'msedge.exe'),
      path.join(programFilesX86, 'Microsoft', 'Edge', 'Application', 'msedge.exe'),
    ];

    for (const p of edgePaths) {
      if (fs.existsSync(p)) {
        const version = this.getExecutableVersion(p);
        if (version) {
          browsers.push({ browser: 'edge', version, executablePath: p });
          break;
        }
      }
    }

    return browsers;
  }

  private static getExecutableVersion(executablePath: string): string | null {
    try {
      // Execute powershell command to get version info
      const command = `powershell.exe -NoProfile -NonInteractive -Command "(Get-Item '${executablePath}').VersionInfo.ProductVersion"`;
      const output = execSync(command, { encoding: 'utf8', stdio: ['ignore', 'pipe', 'ignore'], timeout: 2000 });
      return output.trim() || null;
    } catch {
      return null;
    }
  }
}
