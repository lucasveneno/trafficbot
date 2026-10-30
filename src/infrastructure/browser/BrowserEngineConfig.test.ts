import { defaultBrowserConfig } from './BrowserEngineConfig';
import { PuppeteerStealthEngine } from './PuppeteerStealthEngine';

describe('BrowserEngineConfig & NavigationState', () => {
  it('provides the correct defaultBrowserConfig values', () => {
    expect(defaultBrowserConfig).toEqual({
      pageLoadTimeoutMs: 60_000,
      selectorTimeoutMs: 5_000,
      navigationTimeoutMs: 60_000,
      interactionTimeoutMs: 15_000,
      networkIdleTimeoutMs: 15_000,
      networkIdleWaitMs: 1_000,
      consentCheckDelayMs: 2_000,
    });
  });

  it('initializes PuppeteerStealthEngine in idle state', () => {
    const engine = new PuppeteerStealthEngine();
    expect(engine.getNavigationState()).toBe('idle');
  });
});
