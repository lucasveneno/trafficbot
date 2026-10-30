import { BrowserEngine } from '../../domain/interfaces/BrowserEngine';
import { PuppeteerStealthEngine } from './PuppeteerStealthEngine';
import { AndroidChromeDriver } from './android/AndroidChromeDriver';
import { WorkerCapabilities } from '../../domain/entities/WorkerContract';

export class BrowserEngineFactory {
  static createEngine(capabilities: WorkerCapabilities): BrowserEngine {
    if (capabilities.platform === 'android') {
      if (!capabilities.device?.serial) {
        throw new Error('Android worker missing device serial');
      }
      return new AndroidChromeDriver(capabilities.device);
    }
    
    // Fallback for desktop environments
    return new PuppeteerStealthEngine();
  }
}
