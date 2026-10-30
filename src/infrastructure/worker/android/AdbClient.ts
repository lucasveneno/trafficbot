import { execFileSync } from 'child_process';
import { logger } from '../../logging/logger';

export interface AdbDevice {
  serial: string;
  state: 'device' | 'offline' | 'unauthorized';
  isEmulator: boolean;
}

export class AdbClient {
  static listDevices(): AdbDevice[] {
    try {
      const output = execFileSync('adb', ['devices'], { encoding: 'utf-8' });
      const lines = output.split('\n');
      const devices: AdbDevice[] = [];
      for (let i = 1; i < lines.length; i++) {
        const line = lines[i].trim();
        if (!line) continue;
        const [serial, state] = line.split(/\s+/);
        if (serial && state) {
          devices.push({
            serial,
            state: state as 'device' | 'offline' | 'unauthorized',
            isEmulator: serial.startsWith('emulator-'),
          });
        }
      }
      return devices;
    } catch (e) {
      logger.warn('Failed to list ADB devices', { error: String(e) });
      return [];
    }
  }

  static getProp(serial: string, prop: string): string | undefined {
    try {
      const output = execFileSync('adb', ['-s', serial, 'shell', 'getprop', prop], { encoding: 'utf-8' }).trim();
      return output || undefined;
    } catch {
      return undefined;
    }
  }

  static getChromeVersion(serial: string): string | undefined {
    try {
      const output = execFileSync('adb', ['-s', serial, 'shell', 'dumpsys', 'package', 'com.android.chrome'], { encoding: 'utf-8' });
      const match = output.match(/versionName=([\d.]+)/);
      return match ? match[1] : undefined;
    } catch {
      return undefined;
    }
  }

  static forwardPort(serial: string, localPort: number): void {
    try {
      execFileSync('adb', ['-s', serial, 'forward', `tcp:${localPort}`, 'localabstract:chrome_devtools_remote']);
    } catch (e) {
      throw new Error(`Failed to forward port for device ${serial}: ${e}`);
    }
  }

  static removeForward(serial: string, localPort: number): void {
    try {
      execFileSync('adb', ['-s', serial, 'forward', '--remove', `tcp:${localPort}`]);
    } catch (e) {
      logger.warn(`Failed to remove port forward ${localPort} for device ${serial}`, { error: String(e) });
    }
  }

  static startChromeDevTools(serial: string): void {
    try {
      execFileSync('adb', ['-s', serial, 'shell', 'echo', '_', '--remote-debugging-socket-name=chrome_devtools_remote', '>', '/data/local/tmp/chrome-command-line']);
      execFileSync('adb', ['-s', serial, 'shell', 'am', 'force-stop', 'com.android.chrome']);
      execFileSync('adb', ['-s', serial, 'shell', 'am', 'start', '-n', 'com.android.chrome/com.google.android.apps.chrome.Main', '-d', 'about:blank']);
    } catch (e) {
      throw new Error(`Failed to start Chrome DevTools on ${serial}: ${e}`);
    }
  }
}
