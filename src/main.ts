import { createServer } from 'http';
import { TrafficOrchestrator } from './application/traffic/TrafficOrchestrator';
import { PuppeteerStealthEngine } from './infrastructure/browser/PuppeteerStealthEngine';
import { Config } from './infrastructure/config/config';
import { logger } from './infrastructure/logging/logger';
import { MetricsService } from './infrastructure/monitoring/MetricsService';
import { QueueService } from './infrastructure/queue/QueueService';
import { TrafficJobData } from './domain/entities/SessionContract';
import { makeJob } from './infrastructure/config/session';
import { deadline } from './infrastructure/lifecycle/deadline';
import { WorkerRegistry } from './infrastructure/worker/WorkerRegistry';
import { WorkerPlatform, WorkerCapabilities } from './domain/entities/WorkerContract';
import os from 'os';
import { EnrollmentClient } from './infrastructure/worker/EnrollmentClient';
import { WorkerCommandListener } from './infrastructure/worker/WorkerCommandListener';

const args = process.argv.slice(2);
if (args[0] === 'enroll') {
  const tokenArg = args.indexOf('--token');
  const serverArg = args.indexOf('--server');
  if (tokenArg === -1 || serverArg === -1 || !args[tokenArg+1] || !args[serverArg+1]) {
    console.error('Usage: trafficbot-worker enroll --token <token> --server <http://127.0.0.1:4782>');
    process.exit(1);
  }
  EnrollmentClient.enroll(args[tokenArg+1], args[serverArg+1]).then(() => process.exit(0));
} else if (args[0] === 'rollback') {
  // trafficbot-worker rollback — restore immediately previous verified binary
  import('./infrastructure/worker/WorkerUpdater').then(({ WorkerUpdater }) => {
    WorkerUpdater.executeRollback('cli-rollback').catch(e => {
      console.error('Rollback failed:', e instanceof Error ? e.message : e);
      process.exit(1);
    });
  });
}

const engines = new Set<PuppeteerStealthEngine>();
let stopping = false;
let started = false;
let distributed = false;
let monitor: NodeJS.Timeout | undefined;
let shutdownPromise: Promise<void> | undefined;
let controlServer: any; // Type as any here to avoid cyclic imports if not careful, but better to import it
let commandListener: WorkerCommandListener | undefined;
const health = createServer((_request, response) => {
  const ready = started && !stopping && (!distributed || QueueService.isDistributedEnabled());
  response.writeHead(ready ? 200 : 503).end(ready ? `ready:${Config.BOT_ROLE}` : 'not ready');
});

function shutdown(code = 0): Promise<void> {
  if (shutdownPromise) return shutdownPromise;
  stopping = true;
  process.exitCode = code;
  if (monitor) clearInterval(monitor);
  health.close();
  shutdownPromise = (async () => {
    const forced = setTimeout(() => {
      logger.error('Shutdown deadline exceeded; unfinished jobs will be recovered by Redis');
      process.exit(1);
    }, Config.SHUTDOWN_TIMEOUT_MS);
    let complete = false;
    try {
      // First stop accepting work and drain. On expiry cancel browser waits and navigations.
      if (controlServer) await controlServer.stop().catch(() => {});
      await commandListener?.stop();
      await QueueService.close(Math.floor(Config.SHUTDOWN_TIMEOUT_MS / 2), () => Promise.allSettled([...engines].map(engine => engine.close())));
      if (distributed) {
        const { MetricsCollector } = require('./application/metrics/MetricsCollector');
        await MetricsCollector.close().catch(() => {});
      }
      const { ReleaseManager } = require('./infrastructure/updater/ReleaseManager');
      await ReleaseManager.close().catch(() => {});
      await deadline(Promise.allSettled([...engines].map(engine => engine.close())), Math.floor(Config.SHUTDOWN_TIMEOUT_MS / 3), 'Browser shutdown');
      complete = true;
    } catch { process.exitCode = 1; }
    finally { if (complete) clearTimeout(forced); }
  })();
  return shutdownPromise;
}
process.once('SIGTERM', () => { void shutdown(); });
process.once('SIGINT', () => { void shutdown(); });

async function execute(id: string, data: TrafficJobData, workerCapabilities?: WorkerCapabilities, queueName?: string): Promise<void> {
  if (stopping) throw new Error('Shutdown in progress');
  const { BrowserEngineFactory } = require('./infrastructure/browser/BrowserEngineFactory');
  const { APPLICATION_VERSION, PROTOCOL_VERSION } = require('./domain/Protocol');
  const defaultCapabilities: WorkerCapabilities = {
    workerId: 'local', platform: 'linux', architecture: 'x64', browsers: [], containerized: false, mobile: false, gpuAvailable: false, maxConcurrentSessions: 1, version: APPLICATION_VERSION, protocolVersion: PROTOCOL_VERSION
  };
  const engine = BrowserEngineFactory.createEngine(workerCapabilities || defaultCapabilities);
  engines.add(engine as any); // Type assertion until interface perfectly matches
  let checking = false;
  const cancellation = queueName ? setInterval(() => {
    if (checking) return; checking = true;
    void QueueService.getRedis()?.get(`traffic:cancel:${queueName}/${id}`).then(async value => { if (value) await engine.close(); }).catch(() => undefined).finally(() => { checking = false; });
  }, 500) : undefined;
  try { await new TrafficOrchestrator(engine).runFromJob(id, data); }
  finally { if (cancellation) clearInterval(cancellation); engines.delete(engine as any); }
}
async function bootstrap(): Promise<void> {
  const enrollment = await EnrollmentClient.loadConfig();
  if (enrollment?.redisUrl && !process.env.REDIS_URL) {
    process.env.REDIS_URL = enrollment.redisUrl;
    Config.REDIS_URL = enrollment.redisUrl;
  }
  health.on('error', () => { logger.error('Health server failed'); void shutdown(1); });
  await new Promise<void>((resolve, reject) => {
    health.once('error', reject);
    health.listen(Config.HEALTH_PORT, '127.0.0.1', resolve);
  });
  
  // Initialize updaters safely
  const { WorkerUpdater } = require('./infrastructure/worker/WorkerUpdater');
  await WorkerUpdater.initialize().catch(() => {});
  
  // Desktop normally runs the dedicated controller. Workers opt in explicitly
  // so several local workers cannot compete for the same management port.
  if (process.env.CONTROL_API_ENABLED === 'true') {
    const { ReleaseManager } = require('./infrastructure/updater/ReleaseManager');
    await ReleaseManager.initialize().catch(() => {});
    const { ControlServer } = require('./application/api/ControlServer');
    controlServer = new ControlServer(undefined, { shutdown });
    await controlServer.start(Number(process.env.CONTROL_PORT || 4782), '127.0.0.1');
  }

  if (Config.BOT_ROLE !== 'local') {
    try {
      await QueueService.initialize(Config.REDIS_URL, Config.REDIS_READY_TIMEOUT_MS);
      const { MetricsCollector } = require('./application/metrics/MetricsCollector');
      MetricsCollector.initialize(Config.REDIS_URL, os.hostname() + '-' + process.pid);
      distributed = true;
    } catch (error) {
      if (Config.BOT_ROLE !== 'both' || !Config.LOCAL_FALLBACK) throw error;
      logger.warn('Explicit startup fallback selected: running a finite local batch');
    }
  }
  if (stopping) { await QueueService.close(1000); return; }
  monitor = setInterval(() => MetricsService.getInstance().printSummary(), 10000);
  if (distributed && Config.BOT_ROLE !== 'producer') {
    let platform = Config.WORKER_PLATFORM;
    if (platform === 'auto') {
      const isDocker = process.env.PUPPETEER_CACHE_DIR !== undefined || os.platform() === 'linux';
      platform = isDocker ? 'linux' : (os.platform() === 'win32' ? 'windows' : (os.platform() === 'darwin' ? 'macos' : 'linux'));
    }

    if (os.platform() === 'win32' && platform !== 'windows') {
      logger.warn(`WORKER_PLATFORM is explicitly set to '${platform}' but OS is Windows. This may cause unexpected profile generation errors.`);
    }

    let workerCapabilitiesList: WorkerCapabilities[] = [];

    if (platform === 'android') {
      const { AndroidDetector } = require('./infrastructure/worker/android/AndroidDetector');
      workerCapabilitiesList = AndroidDetector.detectWorkers();
      if (workerCapabilitiesList.length === 0) {
        logger.warn('WORKER_PLATFORM is android but no connected/authorized Android devices were found.');
      }
    } else {
      const workerId = os.hostname() + '-' + process.pid;
      let capabilities: WorkerCapabilities;
      if (os.platform() === 'win32') {
        const { WindowsDetector } = require('./infrastructure/worker/WindowsDetector');
        capabilities = WindowsDetector.detectCapabilities(workerId, Config.MAX_SESSIONS);
      } else if (os.platform() === 'darwin') {
        const { MacOSDetector } = require('./infrastructure/worker/MacOSDetector');
        capabilities = MacOSDetector.detectCapabilities(workerId, Config.MAX_SESSIONS);
      } else {
        capabilities = {
          workerId,
          platform: platform as WorkerPlatform,
          architecture: os.arch() === 'arm64' ? 'arm64' : 'x64',
          browsers: [{ browser: 'chrome' }], // Puppeteer bundled fallback
          containerized: process.env.PUPPETEER_CACHE_DIR !== undefined,
          mobile: false,
          gpuAvailable: false,
          maxConcurrentSessions: Config.MAX_SESSIONS,
        };
      }
      workerCapabilitiesList.push(capabilities);
    }
    
    const { APPLICATION_VERSION, PROTOCOL_VERSION } = require('./domain/Protocol');
    workerCapabilitiesList.forEach(c => {
      c.version = APPLICATION_VERSION;
      c.protocolVersion = PROTOCOL_VERSION;
    });

    const cmdListener = new WorkerCommandListener(Config.REDIS_URL);
    commandListener = cmdListener;
    await cmdListener.start(workerCapabilitiesList.map((c: any) => c.workerId));

    for (const capabilities of workerCapabilitiesList) {
      await WorkerRegistry.registerWorker(capabilities);
      await WorkerUpdater.checkPendingUpdateMarker().catch(() => {});
      
      const { QueueNameResolver } = require('./infrastructure/queue/QueueNameResolver');
      const queueName = QueueNameResolver.getPlatformQueue(capabilities.platform);
      logger.info(`Worker Registered`, {
        workerId: capabilities.workerId,
        platform: capabilities.platform,
        architecture: capabilities.architecture,
        browsers: capabilities.browsers,
        concurrency: capabilities.maxConcurrentSessions,
        queue: queueName,
        distributed: true,
        persistent: Config.PERSISTENT_SESSIONS
      });
      
      if (capabilities.platform === 'android' && capabilities.device?.serial) {
        const { CapacityGuard } = require('./infrastructure/worker/CapacityGuard');
        const guard = new CapacityGuard(capabilities.maxConcurrentSessions);
        
        const genericWorker = await QueueService.createWorker(capabilities.platform as WorkerPlatform, async job => {
          await guard.acquire(false);
          try { await execute(job.id!, job.data, capabilities, job.queueName); }
          finally { guard.release(); }
        }, capabilities.maxConcurrentSessions, undefined, capabilities.workerId);
        guard.addWorker(genericWorker);
        
        const specificWorker = await QueueService.createWorker(capabilities.platform as WorkerPlatform, async job => {
          await guard.acquire(true);
          try { await execute(job.id!, job.data, capabilities, job.queueName); }
          finally { guard.release(); }
        }, capabilities.maxConcurrentSessions, capabilities.device.serial, capabilities.workerId);
        guard.addWorker(specificWorker);
        
        logger.info(`Listening to persistent exact-device queue: ${QueueNameResolver.getAndroidDeviceQueue(capabilities.device.serial)}`);
      } else {
        await QueueService.createWorker(capabilities.platform as WorkerPlatform, job => execute(job.id!, job.data, capabilities, job.queueName), capabilities.maxConcurrentSessions);
      }
    }
  }
  started = true;
  if (Config.BOT_ROLE !== 'worker') {
    const { ProfileStore } = await import('./infrastructure/browser/profile/ProfileStore');
    const { join } = await import('path');
    for (let index = 0; index < Config.MAX_SESSIONS && !stopping; index++) {
      const data = makeJob(Config, index);
      if (data.profileKey) {
        const profile = await ProfileStore.read(join(Config.SESSIONS_DATA_DIR, data.profileKey));
        if (profile) {
          if (!data.requirements) data.requirements = {};
          data.requirements.platform = profile.operatingSystem as WorkerPlatform;
          if (profile.operatingSystem === 'android' && profile.deviceSerial) {
            data.requirements.deviceSerial = profile.deviceSerial;
            data.requirements.browser = profile.browser;
            data.requirements.mobile = profile.mobile;
          }
        }
      }
      if (distributed) await QueueService.addSession(data);
      else await execute(`local-${index}`, data);
    }
  }
  if (!distributed || Config.BOT_ROLE === 'producer') await shutdown();
}
if (require.main === module && !['enroll', 'rollback'].includes(args[0])) {
  void bootstrap().catch((e) => {
    logger.error('Execution failed: check configuration, Redis readiness, or session failure logs', { error: e.stack || e.message });
    void shutdown(1);
  });
}
