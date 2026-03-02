import { BrowserEngine, BrowserOptions } from '../../domain/interfaces/BrowserEngine';
import { Session } from '../../domain/entities/Session';
import { logger } from '../../infrastructure/logging/logger';
import { Config } from '../../infrastructure/config/config';
import { BehaviorService } from '../../infrastructure/browser/BehaviorService';
import { MetricsService } from '../../infrastructure/monitoring/MetricsService';
import { ReputationService } from '../../infrastructure/monitoring/ReputationService';

export class TrafficOrchestrator {
  private blacklist = [
    'https://www.facebook.com/ppplayermusic',
    'https://instagram.com/ppplayermusic',
    'https://lucasveneno.com/public/search',
    'https://lucasveneno.com/search',
    'https://lucasveneno.com/login',
    'https://lucasveneno.com/register'
  ];

  constructor(private engine: BrowserEngine) {}

  async run(session: Session, options: Partial<BrowserOptions> = {}): Promise<void> {
    const { config } = session;
    const startTime = Date.now();
    logger.info('Starting traffic session', { 
      id: config.id, 
      url: config.url, 
      targetDurationMs: config.durationMs 
    });

    try {
      const metrics = MetricsService.getInstance();
      metrics.trackSessionStart();

      // Check Proxy Reputation (Optional/Async)
      ReputationService.checkIP(config.proxy?.server).catch((e: Error) => logger.debug('IP check deferred', { e }));

      await this.engine.init({
        userAgent: config.userAgent,
        viewport: config.viewport,
        proxy: config.proxy,
        userDataDir: config.userDataDir,
        headless: options.headless,
        platform: options.platform,
        fingerprintScript: options.fingerprintScript
      });

      await this.engine.navigate(config.url);
      
      await this.engine.navigate(config.url);
      
      // Execute 4 steps with randomized "Thinking Heatmaps" (non-linear stay times)
      const numSteps = 4;
      const totalLoopTime = Math.floor(config.durationMs * 0.8); // Reserve 20% for overhead/final wait
      
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
        logger.info(`Step ${i+1}/${numSteps}: Staying for ${currentStay}ms...`);
        
        if (Config.HUMAN_BEHAVIOR) {
          const stepStart = Date.now();
          while (Date.now() - stepStart < currentStay) {
            await BehaviorService.simulateRandomAction(
              this.engine, 
              config.viewport, 
              { intensity: Config.BEHAVIOR_INTENSITY }
            );
          }
        } else {
          await this.engine.wait(currentStay);
        }

        await this.performContextualClick();
      }

      // Final wait to ensure total session duration matches target
      const remainingTime = config.durationMs - (Date.now() - startTime);
      if (remainingTime > 0) {
        logger.debug(`Final compensating wait: ${remainingTime}ms...`);
        await this.engine.wait(remainingTime);
      }
      
      const actualDuration = Date.now() - startTime;
      metrics.trackSessionEnd(true, actualDuration);
      logger.info('Session completed successfully', { 
        id: config.id, 
        actualDurationMs: actualDuration,
        targetDurationMs: config.durationMs
      });
    } catch (error: any) {
      const actualDuration = Date.now() - startTime;
      MetricsService.getInstance().trackSessionEnd(false, actualDuration);
      logger.error('Session execution failed', { 
        id: config.id, 
        error: error instanceof Error ? {
          message: error.message,
          stack: error.stack,
          name: error.name
        } : (typeof error === 'object' ? JSON.stringify(error) : String(error))
      });
    } finally {
      await this.engine.close();
    }
  }

  private async performContextualClick(): Promise<void> {
    const clickResult = await this.engine.evaluate((blacklist) => {
      const HIGH_VALUE = ['about', 'product', 'service', 'feature', 'price', 'blog', 'case', 'contact'];
      const LOW_VALUE = ['login', 'register', 'signin', 'signup', 'terms', 'privacy', 'policy', 'legal'];

      const links = Array.from(document.querySelectorAll("a"))
        .filter(a => {
          const href = a.href;
          return href && !blacklist.some((b: string) => href.includes(b)) && href.startsWith(window.location.origin);
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
          window.location.href = link.href;
          return { href: link.href, text: link.text };
        }
      }
      return null;
    }, this.blacklist);

    if (clickResult) {
      logger.info(`Contextual click performed: "${clickResult.text}" -> ${clickResult.href}`);
    } else {
      logger.debug('No suitable links found for contextual click.');
    }
  }
}
