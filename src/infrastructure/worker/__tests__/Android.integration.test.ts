import { AdbClient } from '../android/AdbClient';
import { AndroidDetector } from '../android/AndroidDetector';
import { AndroidChromeDriver } from '../../browser/android/AndroidChromeDriver';
import { WorkerRegistry } from '../WorkerRegistry';
import IORedis from 'ioredis';

const hasAndroidDevice = process.env.RUN_ANDROID_TESTS === '1' && AdbClient.listDevices().some(d => d.state === 'device');
const testOrSkip = hasAndroidDevice ? describe : describe.skip;

testOrSkip('Android Integration', () => {
  let redis: IORedis;

  beforeAll(() => {
    redis = new IORedis('redis://127.0.0.1:16389');
    WorkerRegistry.initialize(redis);
  });

  afterAll(async () => {
    await WorkerRegistry.close();
    redis.disconnect();
  });

  test('Detects Android device', () => {
    const workers = AndroidDetector.detectWorkers();
    expect(workers.length).toBeGreaterThan(0);
    const worker = workers[0];
    expect(worker.platform).toBe('android');
    expect(worker.mobile).toBe(true);
    expect(worker.device).toBeDefined();
    expect(worker.browsers.find(b => b.browser === 'chrome')).toBeDefined();
  });

  test('Starts Chrome DevTools via AdbClient and cleans up', async () => {
    const devices = AdbClient.listDevices();
    const device = devices[0];
    
    AdbClient.startChromeDevTools(device.serial);
    // Give it a moment to start
    await new Promise(r => setTimeout(r, 2000));
    
    const { PortAllocator } = require('../android/PortAllocator');
    const port = await PortAllocator.allocate();
    AdbClient.forwardPort(device.serial, port);
    expect(port).toBeGreaterThan(0);
    
    // Test removal
    expect(() => AdbClient.removeForward(device.serial, port)).not.toThrow();
    PortAllocator.release(port);
  });

  test('AndroidChromeDriver launches and navigates', async () => {
    const devices = AdbClient.listDevices();
    const driver = new AndroidChromeDriver({ serial: devices[0].serial });
    
    await driver.init({ headless: false, deviceProfile: '{}' });
    await driver.navigate('https://example.com');
    
    const result = driver.navigationResult();
    expect(result.status).toBeGreaterThanOrEqual(200);
    expect(result.finalUrl).toContain('example.com');
    
    await driver.close();
  }, 30000); // 30 second timeout
});
