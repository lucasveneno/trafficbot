import { BrowserEngine } from '../../../domain/interfaces/BrowserEngine';
import { TrafficJobData } from '../../../domain/entities/SessionContract';
import { SessionConfig } from '../../../domain/entities/Session';
import { BehaviorModel } from './BehaviorModel';
import { BehaviorService } from '../../../infrastructure/browser/BehaviorService';
import { logger } from '../../../infrastructure/logging/logger';

export class InfiniteScrollBehavior implements BehaviorModel {
  readonly name = 'infinite_scroll';

  async execute(
    engine: BrowserEngine,
    sessionData: TrafficJobData | SessionConfig,
    sessionDeadlineMs: number
  ): Promise<void> {
    let viewport = { width: 1280, height: 720 };
    try {
      viewport = engine.getProfile().viewport;
    } catch {
      // Default fallback
    }

    logger.info('Starting InfiniteScrollBehavior interaction loop');

    while (Date.now() < sessionDeadlineMs) {
      // 1. Record current document.body.scrollHeight
      let prevHeight = 0;
      try {
        prevHeight = await engine.evaluate(() => document.body.scrollHeight);
      } catch (err) {
        logger.warn('InfiniteScroll: Failed to read scrollHeight', { err });
        break;
      }

      // 2. Scroll to the bottom
      try {
        await engine.evaluate(() => window.scrollTo({ top: document.body.scrollHeight, behavior: 'smooth' }));
      } catch (err) {
        logger.warn('InfiniteScroll: Failed to scroll to bottom', { err });
        break;
      }

      // 3. Use BehaviorService.simulateRandomAction with { intensity: 'low' } for a few seconds while "waiting" for content to load
      const waitSeconds = Math.floor(Math.random() * 2) + 2; // 2-3 seconds
      const waitDeadline = Math.min(Date.now() + waitSeconds * 1000, sessionDeadlineMs);
      if (Date.now() < waitDeadline) {
        await BehaviorService.simulateRandomAction(engine, viewport, {
          intensity: 'low',
          deadlineMs: waitDeadline,
        });
        const remainingWait = waitDeadline - Date.now();
        if (remainingWait > 0) {
          await engine.wait(Math.min(500, remainingWait));
        }
      }

      if (Date.now() >= sessionDeadlineMs) break;

      // 4. Wait up to 5 seconds for document.body.scrollHeight to become greater than the recorded height (polling every 500ms)
      const pollStart = Date.now();
      let heightChanged = false;

      while (Date.now() - pollStart < 5000 && Date.now() < sessionDeadlineMs) {
        let currentHeight = 0;
        try {
          currentHeight = await engine.evaluate(() => document.body.scrollHeight);
        } catch {
          break;
        }

        if (currentHeight > prevHeight) {
          heightChanged = true;
          logger.debug(`InfiniteScroll: New content detected (scrollHeight increased from ${prevHeight} to ${currentHeight})`);
          break;
        }

        const pollWait = Math.min(500, Math.max(0, sessionDeadlineMs - Date.now()));
        if (pollWait > 0) {
          await engine.wait(pollWait);
        } else {
          break;
        }
      }

      if (Date.now() >= sessionDeadlineMs) break;

      // 5. If the height doesn't change after 5 seconds, it might be the true bottom. Scroll up a bit, wait, and try again, or just dwell until deadline.
      if (!heightChanged) {
        logger.debug('InfiniteScroll: scrollHeight unchanged after 5 seconds, might be true bottom');
        const remaining = sessionDeadlineMs - Date.now();
        if (remaining <= 5000) {
          logger.debug(`InfiniteScroll: Dwelling until deadline (${remaining}ms remaining)`);
          if (remaining > 0) {
            await engine.wait(remaining);
          }
          break;
        } else {
          // Scroll up a bit, wait, and try again
          const scrollUpPx = Math.floor(Math.random() * 300) + 200;
          logger.debug(`InfiniteScroll: Scrolling up by ${scrollUpPx}px before retrying`);
          try {
            await engine.evaluate((up) => window.scrollBy({ top: -up, behavior: 'smooth' }), scrollUpPx);
          } catch {
            break;
          }
          const retryWait = Math.min(Math.floor(Math.random() * 1000) + 1000, sessionDeadlineMs - Date.now());
          if (retryWait > 0) {
            await engine.wait(retryWait);
          }
        }
      }
    }

    logger.info('InfiniteScrollBehavior execution completed');
  }
}
