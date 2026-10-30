import os from 'os';
import fs from 'fs';
import { execSync } from 'child_process';
import { BrowserCapability, WorkerCapabilities } from '../../domain/entities/WorkerContract';

export class MacOSDetector {
  static detectCapabilities(workerId: string, maxSessions: number): WorkerCapabilities {
    if (os.platform() !== 'darwin') {
      throw new Error('MacOSDetector can only be used on macOS');
    }

    const browsers = this.detectBrowsers();

    return {
      workerId,
      platform: 'macos',
      architecture: os.arch() === 'arm64' ? 'arm64' : 'x64',
      containerized: false,
      mobile: false,
      gpuAvailable: true,
      maxConcurrentSessions: maxSessions,
      browsers,
    };
  }

  private static detectBrowsers(): BrowserCapability[] {
    const browsers: BrowserCapability[] = [];
    
    // Chrome paths
    const chromePaths = [
      '/Applications/Google Chrome.app/Contents/MacOS/Google Chrome',
      `${os.homedir()}/Applications/Google Chrome.app/Contents/MacOS/Google Chrome`
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
      '/Applications/Microsoft Edge.app/Contents/MacOS/Microsoft Edge',
      `${os.homedir()}/Applications/Microsoft Edge.app/Contents/MacOS/Microsoft Edge`
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

  private static getExecutableVersion(executablePath: string): string | undefined {
    try {
      // Execute with --version
      const output = execSync(`"${executablePath}" --version`, { encoding: 'utf8', stdio: ['ignore', 'pipe', 'ignore'] }).trim();
      // Output is typically "Google Chrome 117.0.5938.132" or "Microsoft Edge 117.0.2045.31"
      const match = output.match(/(\d+\.\d+\.\d+\.\d+)/);
      return match ? match[1] : undefined;
    } catch (e) {
      return undefined;
    }
  }
}
