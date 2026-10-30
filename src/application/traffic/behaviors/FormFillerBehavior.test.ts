import { FormFillerBehavior } from './FormFillerBehavior';
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

describe('FormFillerBehavior', () => {
  let simulateSpy: jest.SpyInstance;
  let humanTypeSpy: jest.SpyInstance;

  beforeEach(() => {
    simulateSpy = jest.spyOn(BehaviorService, 'simulateRandomAction').mockResolvedValue(undefined);
    humanTypeSpy = jest.spyOn(BehaviorService, 'humanType').mockImplementation(async (keyPresser, phrase) => {
      for (const char of phrase) {
        await keyPresser(char, 10);
      }
    });
  });

  afterEach(() => {
    simulateSpy.mockRestore();
    humanTypeSpy.mockRestore();
    jest.restoreAllMocks();
  });

  test('has correct behavior model name', () => {
    const behavior = new FormFillerBehavior();
    expect(behavior.name).toBe('form_filler');
  });

  test('types into found input and submits via submit button', async () => {
    const behavior = new FormFillerBehavior();
    const engine = createMockEngine();

    let evalCall = 0;
    engine.evaluate.mockImplementation(async () => {
      evalCall++;
      if (evalCall === 1) return true; // Input found and focused
      if (evalCall === 2) return true; // Submit button clicked
      return false;
    });

    const start = 1000000;
    let now = start;
    jest.spyOn(Date, 'now').mockImplementation(() => now);
    engine.wait.mockImplementation(async (ms: number) => {
      now += ms;
    });
    simulateSpy.mockImplementation(async () => {
      now += 1000;
    });

    const deadline = start + 5000;
    await behavior.execute(engine, { url: 'https://example.com', durationMinutes: 1, intensity: 'medium', behaviorModel: 'form_filler', persistent: false }, deadline);

    expect(engine.evaluate).toHaveBeenCalledTimes(2);
    expect(humanTypeSpy).toHaveBeenCalled();
    expect(engine.pressKey).toHaveBeenCalled();
    expect(simulateSpy).toHaveBeenCalled();
  });

  test('presses Enter when no submit button is found', async () => {
    const behavior = new FormFillerBehavior();
    const engine = createMockEngine();

    let evalCall = 0;
    engine.evaluate.mockImplementation(async () => {
      evalCall++;
      if (evalCall === 1) return true; // Input found
      if (evalCall === 2) return false; // No submit button
      return false;
    });

    const start = 1000000;
    let now = start;
    jest.spyOn(Date, 'now').mockImplementation(() => now);
    engine.wait.mockImplementation(async (ms: number) => {
      now += ms;
    });
    simulateSpy.mockImplementation(async () => {
      now += 1000;
    });

    const deadline = start + 5000;
    await behavior.execute(engine, { url: 'https://example.com', durationMinutes: 1, intensity: 'low', behaviorModel: 'form_filler', persistent: false }, deadline);

    expect(engine.pressKey).toHaveBeenCalledWith('Enter');
  });

  test('falls back to random generic browsing if no input is found', async () => {
    const behavior = new FormFillerBehavior();
    const engine = createMockEngine();

    engine.evaluate.mockResolvedValue(false);

    const start = 1000000;
    let now = start;
    jest.spyOn(Date, 'now').mockImplementation(() => now);
    engine.wait.mockImplementation(async (ms: number) => {
      now += ms;
    });
    simulateSpy.mockImplementation(async () => {
      now += 500;
    });

    const deadline = start + 2000;
    await behavior.execute(engine, { url: 'https://example.com', durationMinutes: 1, intensity: 'low', behaviorModel: 'form_filler', persistent: false }, deadline);

    expect(humanTypeSpy).not.toHaveBeenCalled();
    expect(simulateSpy).toHaveBeenCalled();
  });

  test('handles evaluate error gracefully and falls back to random generic browsing', async () => {
    const behavior = new FormFillerBehavior();
    const engine = createMockEngine();

    engine.evaluate.mockRejectedValue(new Error('DOM access error'));

    const start = 1000000;
    let now = start;
    jest.spyOn(Date, 'now').mockImplementation(() => now);
    engine.wait.mockImplementation(async (ms: number) => {
      now += ms;
    });
    simulateSpy.mockImplementation(async () => {
      now += 500;
    });

    const deadline = start + 2000;
    await behavior.execute(engine, { url: 'https://example.com', durationMinutes: 1, intensity: 'low', behaviorModel: 'form_filler', persistent: false }, deadline);

    expect(humanTypeSpy).not.toHaveBeenCalled();
    expect(simulateSpy).toHaveBeenCalled();
  });
});
