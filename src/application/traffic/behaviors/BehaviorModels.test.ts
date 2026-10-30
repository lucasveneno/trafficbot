import { BehaviorFactory } from './BehaviorFactory';
import { GenericBehavior } from './GenericBehavior';
import { ArticleReaderBehavior } from './ArticleReaderBehavior';
import { InfiniteScrollBehavior } from './InfiniteScrollBehavior';
import { FormFillerBehavior } from './FormFillerBehavior';
import { BrowserEngine } from '../../../domain/interfaces/BrowserEngine';
import { Config } from '../../../infrastructure/config/config';
import { BehaviorService } from '../../../infrastructure/browser/BehaviorService';

function createMockEngine(overrides: Partial<jest.Mocked<BrowserEngine>> = {}): jest.Mocked<BrowserEngine> {
  return {
    init: jest.fn().mockResolvedValue(undefined),
    navigate: jest.fn().mockResolvedValue(undefined),
    close: jest.fn().mockResolvedValue(undefined),
    wait: jest.fn().mockResolvedValue(undefined),
    evaluate: jest.fn().mockResolvedValue(null),
    setExtraHeaders: jest.fn().mockResolvedValue(undefined),
    getProfile: jest.fn().mockReturnValue({ viewport: { width: 1280, height: 720 } }),
    navigationResult: jest.fn().mockReturnValue({ status: 200, finalUrl: 'https://example.com' }),
    scroll: jest.fn().mockResolvedValue(undefined),
    mouseMove: jest.fn().mockResolvedValue(undefined),
    click: jest.fn().mockResolvedValue(undefined),
    setGeolocation: jest.fn().mockResolvedValue(undefined),
    waitForNetworkIdle: jest.fn().mockResolvedValue(undefined),
    randomDelay: jest.fn().mockResolvedValue(undefined),
    clickLinkByHref: jest.fn().mockResolvedValue(true),
    clickLinkContainingHref: jest.fn().mockResolvedValue(true),
    clickLinkByText: jest.fn().mockResolvedValue(true),
    clickNextSearchPage: jest.fn().mockResolvedValue(true),
    clickSearchResult: jest.fn().mockResolvedValue(true),
    searchKeyword: jest.fn().mockResolvedValue(undefined),
    handleConsentPopups: jest.fn().mockResolvedValue(false),
    ...overrides
  } as unknown as jest.Mocked<BrowserEngine>;
}

describe('BehaviorFactory', () => {
  test('creates GenericBehavior by default or for generic', () => {
    expect(BehaviorFactory.create('generic')).toBeInstanceOf(GenericBehavior);
    expect(BehaviorFactory.create('unknown')).toBeInstanceOf(GenericBehavior);
    expect(BehaviorFactory.create('')).toBeInstanceOf(GenericBehavior);
  });

  test('creates ArticleReaderBehavior for article_reader', () => {
    expect(BehaviorFactory.create('article_reader')).toBeInstanceOf(ArticleReaderBehavior);
  });

  test('creates InfiniteScrollBehavior for infinite_scroll', () => {
    expect(BehaviorFactory.create('infinite_scroll')).toBeInstanceOf(InfiniteScrollBehavior);
  });

  test('creates FormFillerBehavior for form_filler', () => {
    expect(BehaviorFactory.create('form_filler')).toBeInstanceOf(FormFillerBehavior);
  });
});

describe('GenericBehavior', () => {
  beforeEach(() => {
    Config.HUMAN_BEHAVIOR = false;
  });

  test('executes 4-step loop and waits', async () => {
    const behavior = new GenericBehavior();
    const engine = createMockEngine();
    const sessionData = {
      id: 'test-1',
      url: 'https://example.com',
      durationMs: 4000
    };
    const deadline = Date.now() + 4000;

    await behavior.execute(engine, sessionData, deadline);

    expect(engine.getProfile).toHaveBeenCalled();
    expect(engine.wait).toHaveBeenCalled();
  });

  test('performs contextual click when link found', async () => {
    const behavior = new GenericBehavior();
    const engine = createMockEngine({
      evaluate: jest.fn().mockResolvedValue({ href: 'https://example.com/about', text: 'about' })
    });
    const sessionData = {
      id: 'test-2',
      url: 'https://example.com',
      durationMs: 1000
    };
    const deadline = Date.now() + 1000;

    await behavior.execute(engine, sessionData, deadline);

    expect(engine.navigate).toHaveBeenCalledWith('https://example.com/about');
  });
});

describe('ArticleReaderBehavior', () => {
  test('executes reading loop without navigating away', async () => {
    const simulateSpy = jest.spyOn(BehaviorService, 'simulateRandomAction').mockResolvedValue(undefined);
    try {
      const behavior = new ArticleReaderBehavior();
      const engine = createMockEngine({
        evaluate: jest.fn().mockImplementation((fn, ...args) => {
          // If checking bottom of page (no args)
          if (typeof fn === 'function' && args.length === 0) {
            return false;
          }
          // If smooth scrolling
          return null;
        }),
        wait: jest.fn().mockResolvedValue(undefined)
      });

      const sessionData = {
        id: 'test-article',
        url: 'https://example.com/article',
        durationMs: 500
      };
      const deadline = Date.now() + 3000;

      await behavior.execute(engine, sessionData, deadline);

      expect(engine.wait).toHaveBeenCalled();
      expect(engine.navigate).not.toHaveBeenCalled();
      expect(engine.evaluate).toHaveBeenCalled();
    } finally {
      simulateSpy.mockRestore();
    }
  });

  test('handles reaching bottom of the page', async () => {
    const simulateSpy = jest.spyOn(BehaviorService, 'simulateRandomAction').mockResolvedValue(undefined);
    try {
      const behavior = new ArticleReaderBehavior();
      const engine = createMockEngine({
        evaluate: jest.fn().mockImplementation((fn, ...args) => {
          // Returns true for isBottom check
          if (typeof fn === 'function' && args.length === 0) {
            return true;
          }
          return null;
        }),
        wait: jest.fn().mockResolvedValue(undefined)
      });

      const sessionData = {
        id: 'test-article-bottom',
        url: 'https://example.com/article',
        durationMs: 300
      };
      const deadline = Date.now() + 3000;

      await behavior.execute(engine, sessionData, deadline);

      expect(engine.evaluate).toHaveBeenCalled();
      expect(engine.navigate).not.toHaveBeenCalled();
    } finally {
      simulateSpy.mockRestore();
    }
  });
});
