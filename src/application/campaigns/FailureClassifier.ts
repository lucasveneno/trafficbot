import { SessionFailureCategory } from '../../domain/control/CircuitBreakerContract';

export class FailureClassifier {
  static classify(error: unknown): SessionFailureCategory {
    if (!error) return 'unknown';
    const message = error instanceof Error ? error.message : String(error);
    const lower = message.toLowerCase();

    // 1. Proxy / Network / Target Unavailable
    if (lower.includes('net::err_proxy_connection_failed') || lower.includes('proxy location matching')) {
      return 'proxy_unavailable';
    }
    if (lower.includes('net::err_name_not_resolved') || lower.includes('net::err_connection_refused') || lower.includes('http failure: 50')) {
      return 'target_unavailable';
    }
    
    // 2. Navigation / Page Errors
    if (lower.includes('session did not reach configured origin') || lower.includes('missing navigation response') || lower.includes('http failure: 40')) {
      return 'navigation_error';
    }

    // 3. Timeouts
    if (lower.includes('timeout') || lower.includes('deadline exceeded')) {
      return 'timeout';
    }

    // 4. Configuration
    if (lower.includes('unsupported by this worker') || lower.includes('incompatible with worker') || lower.includes('not initialized') || lower.includes('requires mobile capabilities')) {
      return 'configuration_error';
    }

    // 5. Browser-specific failures
    // ADB disconnect
    if (lower.includes('adb') || lower.includes('forward port') || lower.includes('failed to connect to android')) {
      return 'adb_disconnect';
    }
    // Interaction failures  
    if (lower.includes('detached') || lower.includes('context destroyed') || lower.includes('node is detached')) {
      return 'interaction_failed';
    }
    // Selector not found
    if (lower.includes('selector') || lower.includes('waiting for selector') || lower.includes('element not found')) {
      return 'selector_not_found';
    }

    // 6. Browser / Worker Crash
    if (lower.includes('target closed') || lower.includes('session closed') || lower.includes('failed to connect') || lower.includes('browser process') || lower.includes('crash')) {
      return 'browser_crash';
    }

    return 'worker_failure';
  }
}
