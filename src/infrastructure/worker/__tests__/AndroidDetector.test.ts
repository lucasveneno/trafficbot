import { AndroidDetector } from '../android/AndroidDetector';
import { AdbClient } from '../android/AdbClient';

jest.mock('../android/AdbClient');

describe('AndroidDetector', () => {
  afterEach(() => {
    jest.resetAllMocks();
  });

  test('detects workers accurately based on AdbClient', () => {
    (AdbClient.listDevices as jest.Mock).mockReturnValue([
      { serial: 'emulator-5554', state: 'device', isEmulator: true },
      { serial: 'emulator-5556', state: 'offline', isEmulator: true },
      { serial: 'R58M123ABC', state: 'device', isEmulator: false },
    ]);

    (AdbClient.getChromeVersion as jest.Mock).mockImplementation((serial: string) => {
      if (serial === 'emulator-5554') return '115.0.0.0';
      if (serial === 'R58M123ABC') return '120.0.0.0';
      return undefined;
    });

    (AdbClient.getProp as jest.Mock).mockImplementation((serial: string, prop: string) => {
      if (serial === 'emulator-5554') {
        if (prop === 'ro.product.manufacturer') return 'Google';
        if (prop === 'ro.product.model') return 'Android SDK built for x86_64';
        if (prop === 'ro.build.version.release') return '14';
        if (prop === 'ro.build.version.sdk') return '34';
        if (prop === 'ro.product.cpu.abi') return 'x86_64';
      }
      if (serial === 'R58M123ABC') {
        if (prop === 'ro.product.manufacturer') return 'Samsung';
        if (prop === 'ro.product.model') return 'Galaxy S23';
        if (prop === 'ro.build.version.release') return '13';
        if (prop === 'ro.build.version.sdk') return '33';
        if (prop === 'ro.product.cpu.abi') return 'arm64-v8a';
      }
      return undefined;
    });

    const workers = AndroidDetector.detectWorkers();

    expect(workers.length).toBe(2);

    expect(workers[0].workerId).toBe('android-emulator-5554');
    expect(workers[0].architecture).toBe('x64');
    expect(workers[0].device?.type).toBe('emulator');
    expect(workers[0].device?.osVersion).toBe('14');
    expect(workers[0].browsers[0].version).toBe('115.0.0.0');

    expect(workers[1].workerId).toBe('android-R58M123ABC');
    expect(workers[1].architecture).toBe('arm64');
    expect(workers[1].device?.type).toBe('physical');
    expect(workers[1].device?.manufacturer).toBe('Samsung');
    expect(workers[1].browsers[0].version).toBe('120.0.0.0');
  });
});
