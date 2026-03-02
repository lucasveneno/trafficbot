import { TrafficOrchestrator } from './application/traffic/TrafficOrchestrator';
import { PuppeteerStealthEngine } from './infrastructure/browser/PuppeteerStealthEngine';
import { UserAgentService } from './infrastructure/browser/UserAgentService';
import { Config } from './infrastructure/config/config';
import { logger } from './infrastructure/logging/logger';
import { Session } from './domain/entities/Session';
import path from 'path';
import { FingerprintService } from './infrastructure/browser/FingerprintService';
import { MetricsService } from './infrastructure/monitoring/MetricsService';
import { ReputationService } from './infrastructure/monitoring/ReputationService';

async function bootstrap() {
  logger.info('Initializing Veneno Traffic Bot v2', { 
    env: Config.NODE_ENV,
    sessions: Config.MAX_SESSIONS 
  });

  // Start Dashboard Loop
  const metrics = MetricsService.getInstance();
  const dashboardInterval = setInterval(() => {
    metrics.printSummary();
  }, 10000);

  const tasks: Promise<void>[] = [];

  for (let i = 0; i < Config.MAX_SESSIONS; i++) {
    logger.debug(`Preparing session ${i}...`);
    const fingerprint = FingerprintService.generate();
    
    const session = new Session({
      id: `session-${i}`,
      url: Config.DEFAULT_URL,
      userAgent: fingerprint.userAgent,
      userDataDir: Config.PERSISTENT_SESSIONS 
        ? path.join(process.cwd(), Config.SESSIONS_DATA_DIR, `session-${i}`) 
        : undefined,
      viewport: fingerprint.viewport,
      durationMs: Config.SESSION_TIME === 'random' 
        ? Math.floor(Math.random() * (300 - 60 + 1) + 60) * 1000 
        : parseInt(Config.SESSION_TIME) * 60000,
      proxy: Config.PROXY_URL ? {
        server: `${Config.PROXY_URL}:${Config.PROXY_PORT}`,
        username: Config.PROXY_USER,
        password: Config.PROXY_PASS
      } : undefined
    });

    const engine = new PuppeteerStealthEngine();
    const orchestrator = new TrafficOrchestrator(engine);
    tasks.push(orchestrator.run(session, { 
      headless: Config.HEADLESS,
      platform: fingerprint.platform,
      fingerprintScript: FingerprintService.getInjectionScript(fingerprint)
    }));
  }

  logger.info(`Launched ${tasks.length} parallel traffic tasks`);
  await Promise.all(tasks);
  clearInterval(dashboardInterval);
  metrics.printSummary(); // Final report
  logger.info('All traffic tasks finished');
}

bootstrap().catch(err => {
  logger.error('Fatal crash during bootstrap', { err });
  process.exit(1);
});
