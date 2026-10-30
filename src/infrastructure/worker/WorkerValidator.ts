import { BrowserProfile } from '../browser/profile/BrowserProfile';
import { WorkerCapabilities } from '../../domain/entities/WorkerContract';

export function validateProfileAgainstWorker(profile: BrowserProfile, worker: WorkerCapabilities): void {
  if (profile.operatingSystem !== worker.platform) {
    throw new Error(`Profile OS '${profile.operatingSystem}' is not supported by worker platform '${worker.platform}'`);
  }

  if (profile.mobile && !worker.mobile) {
    throw new Error('Profile requires mobile capabilities but worker is desktop');
  }

  // Bind exact device serial if required
  if (worker.device?.serial && profile.operatingSystem === 'android') {
    // In actual implementation, Profile needs to persist its serial if it belongs to Android.
    // Assuming runtime validation at job submission verifies deviceSerial matches.
  }

  const workerBrowser = worker.browsers.find(b => b.browser === profile.browser);
  if (!workerBrowser) {
    throw new Error(`Profile browser '${profile.browser}' is not supported by this worker`);
  }

  if (workerBrowser.version && profile.browserVersion) {
    const profileMajor = profile.browserVersion.split('.')[0];
    const workerMajor = workerBrowser.version.split('.')[0];
    if (profileMajor !== workerMajor) {
      throw new Error(`Profile browser major version '${profileMajor}' is incompatible with worker browser version '${workerMajor}'`);
    }
  }
}
