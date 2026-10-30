import { FailureClassifier } from './FailureClassifier';

describe('FailureClassifier', () => {
  it('classifies proxy failures', () => {
    expect(FailureClassifier.classify(new Error('net::ERR_PROXY_CONNECTION_FAILED'))).toBe('proxy_unavailable');
    expect(FailureClassifier.classify(new Error('Proxy location matching failed'))).toBe('proxy_unavailable');
  });

  it('classifies target unavailability', () => {
    expect(FailureClassifier.classify(new Error('net::ERR_NAME_NOT_RESOLVED'))).toBe('target_unavailable');
    expect(FailureClassifier.classify(new Error('net::ERR_CONNECTION_REFUSED'))).toBe('target_unavailable');
    expect(FailureClassifier.classify(new Error('HTTP failure: 503'))).toBe('target_unavailable');
  });

  it('classifies navigation errors', () => {
    expect(FailureClassifier.classify(new Error('Session did not reach configured origin'))).toBe('navigation_error');
    expect(FailureClassifier.classify(new Error('Missing navigation response'))).toBe('navigation_error');
    expect(FailureClassifier.classify(new Error('HTTP failure: 404'))).toBe('navigation_error');
  });

  it('classifies timeouts', () => {
    expect(FailureClassifier.classify(new Error('Navigation timeout of 30000ms exceeded'))).toBe('timeout');
    expect(FailureClassifier.classify(new Error('deadline exceeded'))).toBe('timeout');
  });

  it('classifies configuration errors', () => {
    expect(FailureClassifier.classify(new Error('Profile browser is unsupported by this worker'))).toBe('configuration_error');
    expect(FailureClassifier.classify(new Error('Profile requires mobile capabilities but worker is desktop'))).toBe('configuration_error');
  });

  it('classifies browser crashes', () => {
    expect(FailureClassifier.classify(new Error('Target closed'))).toBe('browser_crash');
    expect(FailureClassifier.classify(new Error('Session closed'))).toBe('browser_crash');
    expect(FailureClassifier.classify(new Error('Browser process crashed'))).toBe('browser_crash');
  });

  it('classifies adb disconnects', () => {
    expect(FailureClassifier.classify(new Error('ADB device not found'))).toBe('adb_disconnect');
    expect(FailureClassifier.classify(new Error('Failed to forward port 9222'))).toBe('adb_disconnect');
    expect(FailureClassifier.classify(new Error('Failed to connect to Android Chrome'))).toBe('adb_disconnect');
  });

  it('classifies interaction failures', () => {
    expect(FailureClassifier.classify(new Error('Execution context destroyed'))).toBe('interaction_failed');
    expect(FailureClassifier.classify(new Error('Node is detached from document'))).toBe('interaction_failed');
  });

  it('classifies selector not found', () => {
    expect(FailureClassifier.classify(new Error('Waiting for selector `input[name="q"]` failed'))).toBe('selector_not_found');
    expect(FailureClassifier.classify(new Error('Element not found on page'))).toBe('selector_not_found');
  });

  it('defaults to worker_failure or unknown', () => {
    expect(FailureClassifier.classify(new Error('Something completely random'))).toBe('worker_failure');
    expect(FailureClassifier.classify(null)).toBe('unknown');
  });
});
