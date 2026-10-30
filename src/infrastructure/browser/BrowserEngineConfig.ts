export interface BrowserEngineConfig {
  pageLoadTimeoutMs: number;
  selectorTimeoutMs: number;
  navigationTimeoutMs: number;
  interactionTimeoutMs: number;
  networkIdleTimeoutMs: number;
  networkIdleWaitMs: number;
  consentCheckDelayMs: number;
}

export const defaultBrowserConfig: BrowserEngineConfig = {
  pageLoadTimeoutMs: 60_000,
  selectorTimeoutMs: 5_000,
  navigationTimeoutMs: 60_000,
  interactionTimeoutMs: 15_000,
  networkIdleTimeoutMs: 15_000,
  networkIdleWaitMs: 1_000,
  consentCheckDelayMs: 2_000,
};
