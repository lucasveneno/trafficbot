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
   * Returns a random search engine URL with the given keyword.
   */
  getRandomSearchUrl(keyword: string): { name: string; url: string } {
    const engine = ReferrerService.SEARCH_ENGINES[Math.floor(Math.random() * ReferrerService.SEARCH_ENGINES.length)];
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
}
