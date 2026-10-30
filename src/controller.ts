import { ControlServer } from './application/api/ControlServer';
import { QueueService } from './infrastructure/queue/QueueService';
import { Config } from './infrastructure/config/config';
import { logger, setLogCallback } from './infrastructure/logging/logger';

/** Management process. Existing workers continue to own all execution logic. */
async function start() {
  let stopping = false;
  let retry: NodeJS.Timeout | undefined;
  const server = new ControlServer(undefined, { shutdown: stop });
  setLogCallback(info => {
    server.pushLog({
      ts: info.timestamp || new Date().toISOString(),
      level: info.level,
      message: info.message,
      service: info.service,
      meta: Object.fromEntries(Object.entries(info).filter(([k]) => !['level', 'message', 'timestamp', 'service', Symbol.for('level'), Symbol.for('message'), Symbol.for('splat')].includes(k)))
    });
  });
  async function stop() {
    if (stopping) return; stopping = true;
    if (retry) clearTimeout(retry);
    await server.stop();
    await QueueService.close(10000);
    // All owned resources have drained; compiled runtimes may retain HTTP internals.
    process.exit(0);
  }
  process.once('SIGINT', () => { void stop(); });
  process.once('SIGTERM', () => { void stop(); });
  await server.start(Number(process.env.CONTROL_PORT || 4782));
  logger.info('Desktop controller listening on loopback');
  async function connect() {
    if (stopping) return;
    try { await QueueService.initialize(Config.REDIS_URL, 3000); if (stopping) await QueueService.close(1000); }
    catch { if (!stopping) retry = setTimeout(() => { void connect(); }, 5000); }
  }
  void connect();
}
if (require.main === module) void start().catch(() => { console.error('Controller startup failed; check port and token directory permissions.'); process.exitCode = 1; });
