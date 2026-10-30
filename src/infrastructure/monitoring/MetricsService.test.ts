import { MetricsService } from './MetricsService';
import { logger } from '../logging/logger';

describe('MetricsService', () => {
  let service: MetricsService;
  let loggerDebugSpy: jest.SpyInstance;

  beforeEach(() => {
    service = MetricsService.getInstance();
    loggerDebugSpy = jest.spyOn(logger, 'debug').mockImplementation(() => logger);
  });

  afterEach(() => {
    loggerDebugSpy.mockRestore();
  });

  it('tracks browser launch duration', () => {
    service.trackBrowserLaunch(450);
    expect(loggerDebugSpy).toHaveBeenCalledWith('Metric: browser.launch', { durationMs: 450 });
  });

  it('tracks browser navigation metrics', () => {
    service.trackBrowserNavigation(1200, true, 'https://example.com');
    expect(loggerDebugSpy).toHaveBeenCalledWith('Metric: browser.navigation', {
      durationMs: 1200,
      success: true,
      url: 'https://example.com',
    });
  });

  it('tracks browser page crash', () => {
    service.trackBrowserPageCrash('puppeteer-stealth');
    expect(loggerDebugSpy).toHaveBeenCalledWith('Metric: browser.page.crashed', {
      engine: 'puppeteer-stealth',
    });
  });

  it('tracks selector timeout', () => {
    service.trackBrowserSelectorTimeout('input[name="q"]');
    expect(loggerDebugSpy).toHaveBeenCalledWith('Metric: browser.selector.timeout', {
      selector: 'input[name="q"]',
    });
  });

  it('tracks adb disconnect', () => {
    service.trackAdbDisconnect('emulator-5554');
    expect(loggerDebugSpy).toHaveBeenCalledWith('Metric: android.adb.disconnect', {
      deviceSerial: 'emulator-5554',
    });
  });
});
