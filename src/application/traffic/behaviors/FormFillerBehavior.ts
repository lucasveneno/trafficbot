import { BrowserEngine } from '../../../domain/interfaces/BrowserEngine';
import { TrafficJobData } from '../../../domain/entities/SessionContract';
import { SessionConfig } from '../../../domain/entities/Session';
import { BehaviorModel } from './BehaviorModel';
import { BehaviorService } from '../../../infrastructure/browser/BehaviorService';
import { logger } from '../../../infrastructure/logging/logger';

export class FormFillerBehavior implements BehaviorModel {
  readonly name = 'form_filler';

  private static readonly PHRASES = [
    'how to integrate this',
    'hello world',
    'test message',
    'product inquiry',
    'customer support query',
    'pricing and availability',
    'getting started guide',
  ];

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

    logger.info('Starting FormFillerBehavior execution');

    while (Date.now() < sessionDeadlineMs) {
      // 1. Find a suitable visible input that isn't disabled or readonly, and focus it
      const selector = 'input[type="text"], input[type="search"], textarea';
      let inputFound = false;

      try {
        inputFound = await engine.evaluate((sel: string) => {
          const elements = Array.from(document.querySelectorAll<HTMLInputElement | HTMLTextAreaElement>(sel));
          for (const el of elements) {
            if (el.disabled || el.readOnly) continue;
            const style = window.getComputedStyle(el);
            if (style.display === 'none' || style.visibility === 'hidden' || style.opacity === '0') continue;
            const rect = el.getBoundingClientRect();
            if (rect.width > 0 && rect.height > 0) {
              el.scrollIntoView({ behavior: 'smooth', block: 'center' });
              el.focus();
              return true;
            }
          }
          return false;
        }, selector);
      } catch (err) {
        logger.warn('FormFiller: Error searching for input elements', { err });
      }

      // 2. If no input is found, fall back to random generic browsing for remainder of session
      if (!inputFound) {
        logger.info('FormFiller: No suitable input found, falling back to random generic browsing');
        while (Date.now() < sessionDeadlineMs) {
          await BehaviorService.simulateRandomAction(engine, viewport, {
            intensity: sessionData.intensity || 'low',
            deadlineMs: sessionDeadlineMs,
          });
          const sleep = Math.min(1000, Math.max(0, sessionDeadlineMs - Date.now()));
          if (sleep > 0) {
            await engine.wait(sleep);
          } else {
            break;
          }
        }
        break;
      }

      logger.info('FormFiller: Suitable input found and focused');
      // Brief pause after focusing
      const focusWait = Math.min(500 + Math.random() * 500, Math.max(0, sessionDeadlineMs - Date.now()));
      if (focusWait > 0) await engine.wait(focusWait);

      if (Date.now() >= sessionDeadlineMs) break;

      // 3. Pick a random phrase and type it using BehaviorService.humanType
      const phrase = FormFillerBehavior.PHRASES[Math.floor(Math.random() * FormFillerBehavior.PHRASES.length)];
      logger.info(`FormFiller: Typing phrase "${phrase}"`);

      try {
        await BehaviorService.humanType(async (char: string, delay: number) => {
          await engine.pressKey(char);
          await engine.wait(delay);
        }, phrase);
      } catch (err) {
        logger.warn('FormFiller: Error during human typing', { err });
      }

      if (Date.now() >= sessionDeadlineMs) break;

      // Brief thinking pause after typing
      const postTypeWait = Math.min(500 + Math.random() * 500, Math.max(0, sessionDeadlineMs - Date.now()));
      if (postTypeWait > 0) await engine.wait(postTypeWait);

      if (Date.now() >= sessionDeadlineMs) break;

      // 4. After typing, find a submit button and click it, or press 'Enter'
      let submitClicked = false;
      try {
        submitClicked = await engine.evaluate(() => {
          const activeEl = document.activeElement;
          const form = activeEl ? activeEl.closest('form') : null;
          const scope: ParentNode = form || document;
          const submitBtn = scope.querySelector<HTMLElement>(
            'button[type="submit"], input[type="submit"], button:not([type]), button[aria-label*="search" i], button[aria-label*="submit" i]'
          );
          if (submitBtn) {
            const style = window.getComputedStyle(submitBtn);
            const rect = submitBtn.getBoundingClientRect();
            if (style.display !== 'none' && style.visibility !== 'hidden' && rect.width > 0 && rect.height > 0) {
              submitBtn.click();
              return true;
            }
          }
          return false;
        });
      } catch (err) {
        logger.debug('FormFiller: Error looking for submit button', { err });
      }

      if (submitClicked) {
        logger.info('FormFiller: Submit button found and clicked');
      } else {
        logger.info('FormFiller: No submit button found, pressing Enter');
        try {
          await engine.pressKey('Enter');
        } catch (err) {
          logger.warn('FormFiller: Error pressing Enter', { err });
        }
      }

      // 5. Then wait until the deadline
      logger.info('FormFiller: Form filled and submitted. Waiting until session deadline...');
      while (Date.now() < sessionDeadlineMs) {
        await BehaviorService.simulateRandomAction(engine, viewport, {
          intensity: 'low',
          deadlineMs: sessionDeadlineMs,
        });
        const sleep = Math.min(1000, Math.max(0, sessionDeadlineMs - Date.now()));
        if (sleep > 0) {
          await engine.wait(sleep);
        } else {
          break;
        }
      }
      break;
    }

    logger.info('FormFillerBehavior execution completed');
  }
}
