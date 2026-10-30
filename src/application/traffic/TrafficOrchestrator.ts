import { BrowserEngine, BrowserOptions } from '../../domain/interfaces/BrowserEngine';
import { Session } from '../../domain/entities/Session';
import { logger } from '../../infrastructure/logging/logger';
import { Config } from '../../infrastructure/config/config';
import { BehaviorService } from '../../infrastructure/browser/BehaviorService';
import { MetricsService } from '../../infrastructure/monitoring/MetricsService';
import { sessionJobSchema, proxyServer } from '../../domain/entities/SessionContract';
import { acquireProfile } from '../../infrastructure/browser/ProfileLease';
import { ReputationService } from '../../infrastructure/monitoring/ReputationService';
import { BehaviorFactory } from './behaviors/BehaviorFactory';

export class TrafficOrchestrator {
  constructor(private engine: BrowserEngine) {}

  async run(session: Session, options: Partial<BrowserOptions> = {}): Promise<void> {
    const { config } = session;
    const startTime = Date.now();
    logger.info('Starting traffic session', { 
      id: config.id, 
      url: config.url, 
      targetDurationMs: config.durationMs 
    });

    let failed = false;
    let failure: unknown;
    let outcome: { status: number; finalUrl: string } | undefined;
    MetricsService.getInstance().trackSessionStart();
    try {


      // Check Proxy Reputation (Optional/Async)
      ReputationService.checkIP(Config.EXTERNAL_IP_CHECK, config.proxy?.server).catch((e: Error) => logger.debug('IP check deferred', { e }));

      const { ReferrerService } = require('../../infrastructure/browser/ReferrerService');
      const referrerService = new ReferrerService(logger);

      await this.engine.init({
        proxy: config.proxy,
        userDataDir: config.userDataDir,
        headless: options.headless,
        deviceProfile: config.deviceProfile || Config.BROWSER_PROFILE,
        proxyLocationEndpoint: Config.MATCH_GEOLOCATION ? Config.PROXY_LOCATION_URL : undefined,
        grantGeolocation: Config.GRANT_GEOLOCATION,
        allowedOrigin: new URL(config.url).origin,
        searchOrigins: Config.ORGANIC_SEARCH ? ['https://www.google.com', 'https://www.bing.com', 'https://duckduckgo.com'] : []
      });
      const viewport = this.engine.getProfile().viewport;

      // 2. Organic Search or Referrer Spoofing
      if (Config.ORGANIC_SEARCH && Config.SEARCH_KEYWORDS.length > 0) {
        const keyword = referrerService.getRandomKeyword(Config.SEARCH_KEYWORDS);
        const { name, url: homepageUrl } = referrerService.getSearchHomepage(Config.SEARCH_ENGINE);
        
        logger.info(`Simulating Organic Search via ${name} (Human-like typing)`, { keyword, homepageUrl });
        await this.engine.navigate(homepageUrl);
        await this.engine.waitForNetworkIdle();
        
        // Clear potential consent popups before interacting
        await this.engine.handleConsentPopups();
        
        await this.engine.randomDelay(1000, 3000);
        
        // Type the keyword and search
        await this.engine.searchKeyword(keyword);
        const searchUrl = await this.engine.evaluate(() => window.location.href);
        
        // Wait to simulate "looking" at results
        if (Config.HUMAN_BEHAVIOR) {
          logger.info('Simulating human-like result scanning (scrolling and mouse movement)...');
          const searchWait = Math.floor(Math.random() * 3000) + 3000; // 3-6 seconds
          const searchStart = Date.now();
          while (Date.now() - searchStart < searchWait) {
            await BehaviorService.simulateRandomAction(this.engine, viewport, { intensity: 'low' });
          }
        } else {
          logger.info('Waiting briefly on search results...');
          await this.engine.randomDelay(2000, 5000);
        }

        // Targeted Clicking Logic (Multi-page loop)
        const targetType = Config.SEARCH_TARGET_TYPE;
        const targetValue = Config.SEARCH_TARGET_VALUE || config.url;
        const pageLimit = Config.SEARCH_PAGES_LIMIT;
        
        let clicked = false;
        for (let page = 1; page <= pageLimit; page++) {
          logger.info(`Searching for target link (Page ${page}/${pageLimit})...`, { 
            strategy: targetType, 
            pattern: targetValue 
          });

          clicked = await this.engine.clickSearchResult(targetValue);

          if (clicked) {
            logger.info(`Successfully identified and clicked target search result on page ${page}!`);
            // Wait for navigation to commence and network to settle
            await this.engine.wait(Math.floor(Math.random() * 2000) + 3000); 
            try {
              await this.engine.waitForNetworkIdle();
            } catch (e) {
              // Ignore network idle timeout, proceed with the loop
            }
            break;
          }

          if (page < pageLimit) {
            logger.info(`Target not found on page ${page}. Attempting to navigate to next page...`);
            const movedToNext = await this.engine.clickNextSearchPage();
            if (!movedToNext) {
              logger.warn(`Could not find "Next" button on search page ${page}. Stopping search.`);
              break;
            }
            await this.engine.waitForNetworkIdle();
            // Random delay after clicking next
            await this.engine.randomDelay(2000, 4000);
          }
        }

        if (!clicked) {
          logger.warn(`Target link matching "${targetValue}" not found within ${pageLimit} pages. Navigating directly.`, { 
            type: targetType, 
            value: targetValue 
          });
          // Fallback: Navigate directly but keep referer if possible
          let safeReferer = searchUrl;
          try {
            const parsedUrl = new URL(searchUrl);
            safeReferer = parsedUrl.origin + '/';
          } catch {}
          await this.engine.setExtraHeaders({ 'Referer': safeReferer });
          await this.engine.navigate(config.url);
        }
      } else {
        const referrer = Config.REFERRALS === 'yes' || Config.REFERRER_POOL.length > 0
          ? referrerService.getRandomReferrer(Config.REFERRER_POOL)
          : undefined;
        if (referrer) {
          logger.info(`Spoofing Referrer`, { referrer });
          await this.engine.setExtraHeaders({ 'Referer': referrer });
        }
        await this.engine.navigate(config.url);
      }
      
      const sessionDeadline = startTime + config.durationMs;
      const behaviorModel = BehaviorFactory.create(config.behaviorModel || 'generic');
      logger.info(`Executing behavior model: ${behaviorModel.name}`);
      await behaviorModel.execute(this.engine, config, sessionDeadline);

      // Final wait to ensure total session duration matches target
      const remainingTime = config.durationMs - (Date.now() - startTime);
      if (remainingTime > 0) {
        logger.debug(`Final compensating wait: ${remainingTime}ms...`);
        await this.engine.wait(remainingTime);
      }
      
      outcome = this.engine.navigationResult();
    } catch (error: unknown) {
      failed = true;
      failure = error;
      try { outcome = this.engine.navigationResult(true); } catch { /* No response before launch/navigation failure. */ }
      logger.error('Session execution failed', { 
        id: config.id, 
        error: error instanceof Error ? {
          message: error.message,
          stack: error.stack,
          name: error.name
        } : (typeof error === 'object' ? JSON.stringify(error) : String(error))
      });
    } finally {
      try { await this.engine.close(); } catch (cleanupError) {
        logger.warn('Browser cleanup failed', { error: cleanupError });
        if (!failed) { failure = cleanupError; } // Record the failure but do not mark the session as failed
      } finally {
        MetricsService.getInstance().trackSessionEnd(!failed, Date.now() - startTime, outcome, failure);
      }
    }
    if (failed) throw failure;
    logger.info('Session completed successfully', { id: config.id, actualDurationMs: Date.now() - startTime, ...outcome });
  }

  /**
   * Helper to run a session from a simplified Job Data structure
   */
  async runFromJob(jobId: string, payload: unknown): Promise<void> {
    const data = sessionJobSchema.parse(payload);
    if (data.proxyMode === 'pool' && !data.proxyPool?.length) throw new Error('Campaign proxy pool was not resolved');
    const lease = data.persistent ? await acquireProfile(Config.SESSIONS_DATA_DIR, data.profileKey!) : undefined;
    
    const { proxyAllocator } = await import('../proxies/ProxyAllocator');
    const proxyLeaseData = data.proxy || data.proxyMode === 'direct' ? undefined : await proxyAllocator.acquire(jobId, data.campaignId, data.durationMinutes, data.proxyPool).catch(async error => { await lease?.release(); throw error; });
    
    let proxyOpts = data.proxy ? {
      server: proxyServer(data.proxy),
      username: data.proxy.username,
      password: data.proxy.password
    } : undefined;

    if (!proxyOpts && proxyLeaseData) {
      proxyOpts = {
        server: proxyServer({ host: `${proxyLeaseData.proxy.protocol}://${proxyLeaseData.proxy.host}`, port: proxyLeaseData.proxy.port }),
        username: proxyLeaseData.proxy.username,
        password: proxyLeaseData.password
      };
    }

    try {
      const session = new Session({
        id: jobId,
        url: data.url,
        deviceProfile: data.deviceProfile,
        durationMs: data.durationMinutes * 60000,
        intensity: data.intensity,
        behaviorModel: data.behaviorModel,
        userDataDir: lease?.path,
        proxy: proxyOpts
      });

      const { MetricsCollector } = require('../metrics/MetricsCollector');
      MetricsCollector.emit('session.started', { 
        sessionId: jobId, 
        campaignId: data.campaignId, 
        proxyId: proxyLeaseData?.proxy.id 
      });

      const startTime = Date.now();
      await this.run(session, {
        headless: Config.HEADLESS,
      });
      const durationMs = Date.now() - startTime;
      
      MetricsCollector.emit('session.completed', {
        sessionId: jobId,
        campaignId: data.campaignId,
        proxyId: proxyLeaseData?.proxy.id,
        durationMs
      });

      if (proxyLeaseData) await proxyAllocator.reportSuccess(proxyLeaseData.lease.leaseId);
    } catch (e) {
      const { MetricsCollector } = require('../metrics/MetricsCollector');
      MetricsCollector.emit('session.failed', {
        sessionId: jobId,
        campaignId: data.campaignId,
        proxyId: proxyLeaseData?.proxy.id,
        failureReason: e instanceof Error ? e.message : String(e)
      });
      if (proxyLeaseData) await proxyAllocator.reportFailure(proxyLeaseData.lease.leaseId);
      throw e;
    } finally { 
      if (proxyLeaseData) await proxyAllocator.release(proxyLeaseData.lease.leaseId);
      await lease?.release().catch(() => logger.warn('Profile lock release failed')); 
    }
  }
}
