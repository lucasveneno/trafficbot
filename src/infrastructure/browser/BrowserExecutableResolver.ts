import { WorkerCapabilities } from '../../domain/entities/WorkerContract';

export class BrowserExecutableResolver {
  static resolveExecutable(deviceId: string | undefined, hostOS: string, workerCaps: WorkerCapabilities | null): string | undefined {
    if (!workerCaps) return undefined;

    // Default to chrome if not explicitly requested
    const requestedBrowser = (deviceId && deviceId.includes('-edge-')) ? 'edge' : 'chrome';

    const workerBrowser = workerCaps.browsers.find(b => b.browser === requestedBrowser);
    if (!workerBrowser) {
      throw new Error(`Browser '${requestedBrowser}' is not supported on this worker`);
    }

    if (workerBrowser.executablePath) {
      return workerBrowser.executablePath;
    }

    return undefined;
  }
}
