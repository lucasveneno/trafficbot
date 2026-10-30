export type SessionFailureCategory =
  | 'target_unavailable'
  | 'proxy_unavailable'
  | 'browser_crash'
  | 'worker_failure'
  | 'timeout'
  | 'configuration_error'
  | 'navigation_error'
  | 'adb_disconnect'
  | 'interaction_failed'
  | 'selector_not_found'
  | 'unknown';

export interface CircuitBreakerConfig {
  enabled: boolean;
  minimumSampleSize: number;
  windowSeconds: number;
  failureRateThreshold: number;
  consecutiveFailureThreshold: number;
  cooldownSeconds: number;
  halfOpenProbeCount: number;
}

export interface PersistedCircuitState {
  campaignId: string;
  state: 'closed' | 'open' | 'half_open';
  openedAt?: string;
  nextProbeAt?: string;
  consecutiveFailures: number;
  lastFailureCategory?: SessionFailureCategory;
  updatedAt: string;
}
