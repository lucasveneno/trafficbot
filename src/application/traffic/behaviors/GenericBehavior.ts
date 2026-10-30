import { BrowserEngine } from '../../../domain/interfaces/BrowserEngine';
import { TrafficJobData } from '../../../domain/entities/SessionContract';
import { SessionConfig } from '../../../domain/entities/Session';
import { BehaviorModel } from './BehaviorModel';
import { BehaviorService } from '../../../infrastructure/browser/BehaviorService';
import { Config } from '../../../infrastructure/config/config';
import { logger } from '../../../infrastructure/logging/logger';

export class GenericBehavior implements BehaviorModel {
  readonly name = 'generic';

  private blacklist = [
    'https://www.facebook.com/ppplayermusic',
    'https://instagram.com/ppplayermusic',
    'https://lucasveneno.com/public/search',
    'https://lucasveneno.com/search',
    'https://lucasveneno.com/login',
    'https://lucasveneno.com/register'
  ];

  async execute(
    engine: BrowserEngine,
    sessionData: TrafficJobData | SessionConfig,
    sessionDeadlineMs: number
  ): Promise<void> {
    const durationMs = 'durationMs' in sessionData && typeof sessionData.durationMs === 'number'
      ? sessionData.durationMs
      : ('durationMinutes' in sessionData && typeof sessionData.durationMinutes === 'number'
        ? sessionData.durationMinutes * 60000
        : 60000);

    const viewport = engine.getProfile().viewport;

    // Execute 4 steps with randomized "Thinking Heatmaps" (non-linear stay times)
    const numSteps = 4;
    const totalLoopTime = Math.min(Math.floor(durationMs * 0.8), Math.max(0, sessionDeadlineMs - Date.now()));

    // Generate randomized stay durations that sum to totalLoopTime
    const stayWeights = Array.from({ length: numSteps }, () => Math.random() + 0.5);
    const totalWeight = stayWeights.reduce((a, b) => a + b, 0);
    const stayDurations = stayWeights.map(w => Math.floor((w / totalWeight) * totalLoopTime));

    logger.debug('Starting navigation loop with Thinking Heatmaps', { 
      stayDurations, 
      humanBehavior: Config.HUMAN_BEHAVIOR 
    });

    for (let i = 0; i < numSteps; i++) {
      const currentStay = stayDurations[i];
      logger.info(`Step ${i + 1}/${numSteps}: Staying for ${currentStay}ms...`);

      if (Config.HUMAN_BEHAVIOR) {
        const stepStart = Date.now();
        const stepDeadline = Math.min(stepStart + currentStay, sessionDeadlineMs);
        while (Date.now() < stepDeadline) {
          await BehaviorService.simulateRandomAction(
            engine,
            viewport,
            { intensity: sessionData.intensity || Config.BEHAVIOR_INTENSITY, deadlineMs: stepDeadline }
          );
        }
      } else {
        await engine.wait(currentStay);
      }

      if (Date.now() < sessionDeadlineMs) {
        await this.performContextualClick(engine);
      }
    }
  }

  private async performContextualClick(engine: BrowserEngine): Promise<void> {
    const clickResult = await engine.evaluate((blacklist) => {
      const HIGH_VALUE = ['about', 'product', 'service', 'feature', 'price', 'blog', 'case', 'contact'];
      const LOW_VALUE = ['login', 'register', 'signin', 'signup', 'terms', 'privacy', 'policy', 'legal'];

      const links = Array.from(document.querySelectorAll("a"))
        .filter(a => {
          const href = a.href;
          if (!href || blacklist.some((b: string) => href.includes(b))) return false;
          try {
            const target = new URL(href);
            const current = new URL(window.location.href);
            // Exclude same-page hash anchors — page.goto() returns null for them
            if (target.origin !== current.origin) return false;
            if (target.pathname === current.pathname && target.search === current.search) return false;
            return true;
          } catch { return false; }
        })
        .map(a => {
          const text = (a.innerText || a.title || "").toLowerCase().trim();
          let score = 10; // Base score
          
          if (HIGH_VALUE.some(k => text.includes(k))) score += 20;
          if (LOW_VALUE.some(k => text.includes(k))) score -= 5;
          
          // Surface area bonus (prefer larger elements/buttons)
          const rect = a.getBoundingClientRect();
          score += Math.min(rect.width * rect.height / 1000, 10);

          return { href: a.href, score, text };
        });

      if (links.length === 0) return null;

      // Weighted random selection
      const totalScore = links.reduce((sum, l) => sum + l.score, 0);
      let rand = Math.random() * totalScore;
      
      for (const link of links) {
        rand -= link.score;
        if (rand <= 0) {
          return { href: link.href, text: link.text };
        }
      }
      return null;
    }, this.blacklist);

    if (clickResult) {
      await engine.navigate(clickResult.href);
      logger.info(`Contextual click performed: "${clickResult.text}" -> ${clickResult.href}`);
    } else {
      logger.debug('No suitable links found for contextual click.');
    }
  }
}
