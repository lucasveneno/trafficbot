import { AdbClient } from './AdbClient';
import { WorkerCapabilities } from '../../../domain/entities/WorkerContract';

export class AndroidDetector {
  static detectWorkers(): WorkerCapabilities[] {
    const devices = AdbClient.listDevices();
    const workers: WorkerCapabilities[] = [];

    for (const device of devices) {
      if (device.state !== 'device') continue; // Skip offline/unauthorized

      const chromeVersion = AdbClient.getChromeVersion(device.serial);
      if (!chromeVersion) continue; // Skip if Chrome isn't installed

      const manufacturer = AdbClient.getProp(device.serial, 'ro.product.manufacturer');
      const model = AdbClient.getProp(device.serial, 'ro.product.model');
      const osVersion = AdbClient.getProp(device.serial, 'ro.build.version.release');
      const sdkVersionStr = AdbClient.getProp(device.serial, 'ro.build.version.sdk');
      const sdkVersion = sdkVersionStr ? parseInt(sdkVersionStr, 10) : undefined;
      const abi = AdbClient.getProp(device.serial, 'ro.product.cpu.abi');
      const architecture = (abi === 'arm64-v8a') ? 'arm64' : 'x64';

      workers.push({
        workerId: `android-${device.serial}`,
        platform: 'android',
        architecture,
        browsers: [
          {
            browser: 'chrome',
            version: chromeVersion,
          }
        ],
        containerized: false,
        mobile: true,
        gpuAvailable: true, // Most Androids have GPU composition
        maxConcurrentSessions: 1, // Single active session per physical/emulated device
        device: {
          type: device.isEmulator ? 'emulator' : 'physical',
          serial: device.serial,
          manufacturer,
          model,
          osVersion,
          sdkVersion
        }
      });
    }

    return workers;
  }
}
