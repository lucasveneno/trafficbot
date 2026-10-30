import { BrowserEngine } from '../../../domain/interfaces/BrowserEngine';
import { TrafficJobData } from '../../../domain/entities/SessionContract';
import { SessionConfig } from '../../../domain/entities/Session';
import { BehaviorModel } from './BehaviorModel';
import { BehaviorService } from '../../../infrastructure/browser/BehaviorService';
import { logger } from '../../../infrastructure/logging/logger';

export class ArticleReaderBehavior implements BehaviorModel {
  readonly name = 'article_reader';

  async execute(
    engine: BrowserEngine,
    sessionData: TrafficJobData | SessionConfig,
    sessionDeadlineMs: number
  ): Promise<void> {
    const viewport = engine.getProfile().viewport;
    logger.info('Starting ArticleReaderBehavior interaction loop');

    while (Date.now() < sessionDeadlineMs) {
      // 1. Wait/dwell for a realistic reading time (e.g., 2 to 10 seconds)
      const dwellMs = Math.floor(Math.random() * 8000) + 2000;
      const remainingTime = sessionDeadlineMs - Date.now();
      if (remainingTime <= 0) break;

      const waitTime = Math.min(dwellMs, remainingTime);
      logger.debug(`ArticleReader: Reading dwell for ${waitTime}ms`);
      await engine.wait(waitTime);

      if (Date.now() >= sessionDeadlineMs) break;

      // 2. Occasional small mouse movements using BehaviorService.simulateRandomAction for 1-2 seconds
      if (Math.random() < 0.6) {
        const mouseDuration = Math.floor(Math.random() * 1000) + 1000; // 1-2 seconds
        const mouseDeadline = Math.min(Date.now() + mouseDuration, sessionDeadlineMs);
        while (Date.now() < mouseDeadline) {
          await BehaviorService.simulateRandomAction(engine, viewport, {
            intensity: 'low',
            deadlineMs: mouseDeadline
          });
        }
      }

      if (Date.now() >= sessionDeadlineMs) break;

      // 3. Check if the bottom of the page is reached
      let isBottom = false;
      try {
        isBottom = await engine.evaluate(() => {
          return (window.innerHeight + window.scrollY) >= document.body.offsetHeight;
        });
      } catch {
        break;
      }

      // 4. If bottom reached, either scroll back up slowly or dwell and micro-scroll until deadline
      if (isBottom) {
        logger.debug('ArticleReader: Bottom of page reached');
        if (Math.random() < 0.5) {
          // Scroll back up slowly
          const upAmount = -(Math.floor(Math.random() * 300) + 150);
          logger.debug(`ArticleReader: Scrolling back up by ${upAmount}px`);
          await engine.evaluate((dy) => window.scrollBy({ top: dy, behavior: 'smooth' }), upAmount);
        } else {
          // Dwell and micro-scroll
          const microAmount = Math.floor((Math.random() - 0.5) * 60);
          logger.debug(`ArticleReader: Micro-scrolling at bottom by ${microAmount}px`);
          await engine.evaluate((dy) => window.scrollBy({ top: dy, behavior: 'smooth' }), microAmount);
        }
      } else {
        // Scroll down a randomized small amount (e.g. 200 to 600 pixels)
        const scrollAmount = Math.floor(Math.random() * 400) + 200;
        logger.debug(`ArticleReader: Scrolling down by ${scrollAmount}px`);
        await engine.evaluate((dy) => window.scrollBy({ top: dy, behavior: 'smooth' }), scrollAmount);
      }
    }

    logger.info('ArticleReaderBehavior execution completed');
  }
}
