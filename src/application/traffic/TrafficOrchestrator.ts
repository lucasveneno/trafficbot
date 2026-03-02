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

      const { ReferrerService } = require('../../infrastructure/browser/ReferrerService');
      const referrerService = new ReferrerService(logger);

      await this.engine.init({
        userAgent: config.userAgent,
        viewport: config.viewport,
        proxy: config.proxy,
        userDataDir: config.userDataDir,
        headless: options.headless,
        platform: options.platform,
        fingerprintScript: options.fingerprintScript
      });

      // 1. Geolocation Matching
      if (Config.MATCH_GEOLOCATION && config.proxy) {
        try {
          // Fetch simple geo info from the proxy context (this assumes the bot can reach an external API)
          // In a real scenario, we might want to cache this or use a static lookup
          const response = await fetch('http://ip-api.com/json');
          if (response.ok) {
            const data: any = await response.json();
            if (data.lat && data.lon) {
              logger.info('Setting Geolocation to match Proxy', { lat: data.lat, lon: data.lon, city: data.city });
              await this.engine.setGeolocation(data.lat, data.lon);
            }
          }
        } catch (e) {
          logger.debug('Geolocation matching failed, using browser default', { e });
        }
      }

      // 2. Organic Search or Referrer Spoofing
      if (Config.ORGANIC_SEARCH && Config.SEARCH_KEYWORDS.length > 0) {
        const keyword = referrerService.getRandomKeyword(Config.SEARCH_KEYWORDS);
        const { name, url: searchUrl } = referrerService.getRandomSearchUrl(keyword);
        
        logger.info(`Simulating Organic Search via ${name}`, { keyword, searchUrl });
        await this.engine.navigate(searchUrl);
        
        // Brief wait to simulate "looking" at results
        await this.engine.wait(2000 + Math.random() * 3000);
        
        // Navigate to target (this simulates the "click")
        // We set the referer to the search engine
        await this.engine.setExtraHeaders({ 'Referer': searchUrl });
        await this.engine.navigate(config.url);
      } else {
        const referrer = referrerService.getRandomReferrer(Config.REFERRER_POOL);
        if (referrer) {
          logger.info(`Spoofing Referrer`, { referrer });
          await this.engine.setExtraHeaders({ 'Referer': referrer });
        }
        await this.engine.navigate(config.url);
      }
      
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

  /**
   * Helper to run a session from a simplified Job Data structure
   */
  async runFromJob(jobId: string, data: any): Promise<void> {
    const { FingerprintService } = require('../../infrastructure/browser/FingerprintService');
    const fingerprint = FingerprintService.generate();
    
    const session = new Session({
      id: jobId,
      url: data.url,
      userAgent: fingerprint.userAgent,
      viewport: fingerprint.viewport,
      durationMs: data.durationMinutes * 60000,
      proxy: data.proxy ? {
        server: `${data.proxy.host}:${data.proxy.port}`,
        username: data.proxy.username,
        password: data.proxy.password
      } : undefined
    });

    await this.run(session, {
      headless: Config.HEADLESS,
      platform: fingerprint.platform,
      fingerprintScript: FingerprintService.getInjectionScript(fingerprint)
    });
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
