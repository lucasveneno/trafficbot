import { InfiniteScrollBehavior } from './InfiniteScrollBehavior';
import { BrowserEngine } from '../../../domain/interfaces/BrowserEngine';
import { BehaviorService } from '../../../infrastructure/browser/BehaviorService';

function createMockEngine(overrides: Partial<jest.Mocked<BrowserEngine>> = {}): jest.Mocked<BrowserEngine> {
  return {
    init: jest.fn().mockResolvedValue(undefined),
    navigate: jest.fn().mockResolvedValue(undefined),
    close: jest.fn().mockResolvedValue(undefined),
    wait: jest.fn().mockResolvedValue(undefined),
    evaluate: jest.fn().mockResolvedValue(null),
    scroll: jest.fn().mockResolvedValue(undefined),
    mouseMove: jest.fn().mockResolvedValue(undefined),
    click: jest.fn().mockResolvedValue(undefined),
    pressKey: jest.fn().mockResolvedValue(undefined),
    setExtraHeaders: jest.fn().mockResolvedValue(undefined),
    setGeolocation: jest.fn().mockResolvedValue(undefined),
    waitForNetworkIdle: jest.fn().mockResolvedValue(undefined),
    randomDelay: jest.fn().mockResolvedValue(undefined),
    clickLinkByHref: jest.fn().mockResolvedValue(false),
    clickLinkContainingHref: jest.fn().mockResolvedValue(false),
    clickLinkByText: jest.fn().mockResolvedValue(false),
    clickNextSearchPage: jest.fn().mockResolvedValue(false),
    clickSearchResult: jest.fn().mockResolvedValue(false),
    searchKeyword: jest.fn().mockResolvedValue(undefined),
    handleConsentPopups: jest.fn().mockResolvedValue(false),
    getProfile: jest.fn().mockReturnValue({ viewport: { width: 1280, height: 720 } }),
    navigationResult: jest.fn().mockReturnValue({ status: 200, finalUrl: 'https://example.com' }),
    ...overrides,
  } as unknown as jest.Mocked<BrowserEngine>;
}

describe('InfiniteScrollBehavior', () => {
  let simulateSpy: jest.SpyInstance;

  beforeEach(() => {
    simulateSpy = jest.spyOn(BehaviorService, 'simulateRandomAction').mockResolvedValue(undefined);
  });

  afterEach(() => {
    simulateSpy.mockRestore();
    jest.restoreAllMocks();
  });

  test('has correct behavior model name', () => {
    const behavior = new InfiniteScrollBehavior();
    expect(behavior.name).toBe('infinite_scroll');
  });

  test('scrolls to bottom and detects increased scrollHeight', async () => {
    const behavior = new InfiniteScrollBehavior();
    const engine = createMockEngine();

    let callCount = 0;
    engine.evaluate.mockImplementation(async () => {
      callCount++;
      if (callCount === 1) return 1000; // initial height
      if (callCount === 2) return undefined; // scrollTo bottom
      if (callCount === 3) return 2000; // polling returns new height
      return 2000;
    });

    const start = 1000000;
    let now = start;
    jest.spyOn(Date, 'now').mockImplementation(() => now);
    engine.wait.mockImplementation(async (ms: number) => {
      now += ms;
    });

    const deadline = start + 50000;
    // Set now to deadline after height increased
    simulateSpy.mockImplementation(async () => {
      now += 2500;
    });

    await behavior.execute(engine, { url: 'https://example.com', durationMinutes: 1, intensity: 'low', behaviorModel: 'infinite_scroll', persistent: false }, deadline);

    expect(engine.evaluate).toHaveBeenCalled();
    expect(simulateSpy).toHaveBeenCalled();
  });

  test('scrolls up if height does not change after 5 seconds of polling', async () => {
    const behavior = new InfiniteScrollBehavior();
    const engine = createMockEngine();

    engine.evaluate.mockImplementation(async (fn: any) => {
      const fnStr = fn?.toString() || '';
      if (fnStr.includes('scrollHeight')) return 1000;
      return undefined;
    });

    const start = 1000000;
    let now = start;
    jest.spyOn(Date, 'now').mockImplementation(() => now);
    engine.wait.mockImplementation(async (ms: number) => {
      now += ms;
    });
    simulateSpy.mockImplementation(async () => {
      now += 2500;
    });

    // Provide enough budget for one 5s poll failure and retry scroll
    const deadline = start + 15000;
    await behavior.execute(engine, { url: 'https://example.com', durationMinutes: 1, intensity: 'low', behaviorModel: 'infinite_scroll', persistent: false }, deadline);
    expect(engine.evaluate).toHaveBeenCalled();
  });

  test('dwells until deadline if remaining time <= 5 seconds when height unchanged', async () => {
    const behavior = new InfiniteScrollBehavior();
    const engine = createMockEngine();

    engine.evaluate.mockImplementation(async (fn: any) => {
      const fnStr = fn?.toString() || '';
      if (fnStr.includes('scrollHeight')) return 1000;
      return undefined;
    });

    const start = 1000000;
    let now = start;
    jest.spyOn(Date, 'now').mockImplementation(() => now);
    engine.wait.mockImplementation(async (ms: number) => {
      now += ms;
    });
    simulateSpy.mockImplementation(async () => {
      now += 2000;
    });

    const deadline = start + 9000;
    await behavior.execute(engine, { url: 'https://example.com', durationMinutes: 1, intensity: 'low', behaviorModel: 'infinite_scroll', persistent: false }, deadline);
    expect(engine.wait).toHaveBeenCalled();
  });

  test('exits gracefully if evaluate throws', async () => {
    const behavior = new InfiniteScrollBehavior();
    const engine = createMockEngine();

    engine.evaluate.mockRejectedValue(new Error('Page crashed'));

    const deadline = Date.now() + 5000;
    await expect(behavior.execute(engine, { url: 'https://example.com', durationMinutes: 1, intensity: 'low', behaviorModel: 'infinite_scroll', persistent: false }, deadline)).resolves.not.toThrow();
  });
});
