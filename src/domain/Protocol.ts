export const APPLICATION_VERSION = require('../../package.json').version;
export const PROTOCOL_VERSION = 1;

export const COMPATIBILITY = {
  MIN_PROTOCOL: 1,
  MAX_PROTOCOL: 1,
};

export type CompatibilityState = 'compatible' | 'update_available' | 'upgrade_required' | 'server_upgrade_required' | 'unknown';

export function checkCompatibility(workerProtocol: number | undefined, workerVersion: string | undefined, latestVersion?: string): CompatibilityState {
  if (workerProtocol === undefined) return 'unknown';
  if (workerProtocol < COMPATIBILITY.MIN_PROTOCOL) return 'upgrade_required';
  if (workerProtocol > COMPATIBILITY.MAX_PROTOCOL) return 'server_upgrade_required';
  
  if (latestVersion && workerVersion && workerVersion !== latestVersion) {
    // Basic semver check conceptually
    // If protocol is compatible, but version is older than latest known release, it's an update
    return 'update_available';
  }
  
  return 'compatible';
}
