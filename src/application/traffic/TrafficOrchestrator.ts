import { BrowserEngine, BrowserOptions } from '../../domain/interfaces/BrowserEngine';
import { Session } from '../../domain/entities/Session';
import { logger } from '../../infrastructure/logging/logger';
import { Config } from '../../infrastructure/config/config';
import { BehaviorService } from '../../infrastructure/browser/BehaviorService';

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
      
      // Execute 4 steps of random navigation
      const waitPerStep = Math.floor(config.durationMs / 5);
      logger.debug('Starting navigation loop', { waitPerStep, humanBehavior: Config.HUMAN_BEHAVIOR });
      
      for (let i = 0; i < 4; i++) {
        logger.debug(`Step ${i+1}/4: Waiting ${waitPerStep}ms...`);
        
        if (Config.HUMAN_BEHAVIOR) {
          const stepStart = Date.now();
          while (Date.now() - stepStart < waitPerStep) {
            await BehaviorService.simulateRandomAction(
              this.engine, 
              config.viewport, 
              { intensity: Config.BEHAVIOR_INTENSITY }
            );
          }
        } else {
          await this.engine.wait(waitPerStep);
        }

        await this.performRandomClick();
      }

      // Final wait to ensure total session duration matches target
      const remainingTime = config.durationMs - (Date.now() - startTime);
      if (remainingTime > 0) {
        logger.debug(`Final compensating wait: ${remainingTime}ms...`);
        await this.engine.wait(remainingTime);
      }
      
      const actualDuration = Date.now() - startTime;
      logger.info('Session completed successfully', { 
        id: config.id, 
        actualDurationMs: actualDuration,
        targetDurationMs: config.durationMs
      });
    } catch (error: any) {
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

  private async performRandomClick(): Promise<void> {
    await this.engine.evaluate((blacklist) => {
      const allLinks = Array.from(document.querySelectorAll("a"))
        .map(a => a.href)
        .filter(href => href && !blacklist.some((b: string) => href.includes(b)));

      if (allLinks.length > 0) {
        const randomUrl = allLinks[Math.floor(Math.random() * allLinks.length)];
        window.location.href = randomUrl;
      }
    }, this.blacklist);
  }
}
