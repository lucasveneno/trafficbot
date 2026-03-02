import { Logger } from 'winston';

export class ReferrerService {
  private static readonly DEFAULT_REFERRERS = [
    'https://t.co/',
    'https://www.facebook.com/',
    'https://www.linkedin.com/',
    'https://www.reddit.com/',
    'https://news.ycombinator.com/',
    'https://www.quora.com/',
  ];

  private static readonly SEARCH_ENGINES = [
    { name: 'Google', url: 'https://www.google.com/search?q=' },
    { name: 'Bing', url: 'https://www.bing.com/search?q=' },
    { name: 'DuckDuckGo', url: 'https://duckduckgo.com/?q=' },
  ];

  constructor(private readonly logger: Logger) {}

  /**
   * Returns a random high-authority referrer URL.
   */
  getRandomReferrer(customPool: string[] = []): string {
    const pool = customPool.length > 0 ? customPool : ReferrerService.DEFAULT_REFERRERS;
    const index = Math.floor(Math.random() * pool.length);
    return pool[index];
  }

  /**
   * Returns a search engine URL with the given keyword, optionally filtering by preferred engine.
   */
  getRandomSearchUrl(keyword: string, preferredEngine: string = 'random'): { name: string; url: string } {
    let pool = ReferrerService.SEARCH_ENGINES;
    if (preferredEngine !== 'random') {
      const filtered = pool.filter(e => e.name.toLowerCase() === preferredEngine.toLowerCase());
      if (filtered.length > 0) pool = filtered;
    }
    
    const engine = pool[Math.floor(Math.random() * pool.length)];
    return {
      name: engine.name,
      url: `${engine.url}${encodeURIComponent(keyword)}`,
    };
  }

  /**
   * Returns a random keyword from the provided list.
   */
  getRandomKeyword(keywords: string[]): string {
    if (keywords.length === 0) return 'traffic bot';
    return keywords[Math.floor(Math.random() * keywords.length)];
  }

  /**
   * Returns the homepage URL for a given search engine.
   */
  public getSearchHomepage(engineOption: 'google' | 'bing' | 'duckduckgo' | 'random'): { name: string; url: string } {
    const engines = ['google', 'bing', 'duckduckgo'];
    let targetEngine = engineOption;
    
    if (targetEngine === 'random') {
      targetEngine = engines[Math.floor(Math.random() * engines.length)] as 'google' | 'bing' | 'duckduckgo';
    }

    switch (targetEngine) {
      case 'bing':
        return { name: 'Bing', url: 'https://www.bing.com/' };
      case 'duckduckgo':
        return { name: 'DuckDuckGo', url: 'https://duckduckgo.com/' };
      case 'google':
      default:
        return { name: 'Google', url: 'https://www.google.com/' };
    }
  }
}
