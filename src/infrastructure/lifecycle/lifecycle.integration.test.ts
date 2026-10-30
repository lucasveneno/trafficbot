import { spawn, ChildProcess } from 'child_process';
import { createServer, Server } from 'http';
import { AddressInfo, createServer as createTcpServer, connect, Socket } from 'net';
import { Queue } from 'bullmq';
import IORedis from 'ioredis';
import { deadline } from './deadline';

const integration = process.env.RUN_LIFECYCLE_TESTS === '1' ? describe : describe.skip;
integration('Process roles and signals', () => {
  let server: Server;
  let origin: string;
  let requests = 0;
  let connection: IORedis;
  let queue: Queue;
  const children = new Set<ChildProcess>();
  const redisUrl = process.env.REDIS_TEST_URL || 'redis://127.0.0.1:16389';
  beforeAll(async () => {
    server = createServer((_req, res) => { requests++; res.end('<html><body>Local lifecycle fixture</body></html>'); });
    await new Promise<void>(resolve => server.listen(0, '127.0.0.1', resolve));
    origin = `http://127.0.0.1:${(server.address() as AddressInfo).port}/`;
    connection = new IORedis(redisUrl, { maxRetriesPerRequest: null });
    queue = new Queue('traffic-sessions-linux', { connection });
    await deadline(queue.waitUntilReady(), 3000, 'Redis test readiness');
    if (await queue.count()) throw new Error('Use an empty dedicated Redis');
  });
  afterEach(async () => {
    for (const child of children) child.kill('SIGKILL');
    children.clear();
    await queue.obliterate({ force: true });
    const nativePlatform = process.platform === 'darwin' ? 'macos' : process.platform === 'win32' ? 'windows' : 'linux';
    if (nativePlatform !== 'linux') {
      const nativeQueue = new Queue(`traffic-sessions-${nativePlatform}`, { connection });
      await nativeQueue.obliterate({ force: true }); await nativeQueue.close();
    }
  });
  afterAll(async () => {
    await queue.close(); connection.disconnect();
    server.closeAllConnections();
    await new Promise<void>(resolve => server.close(() => resolve()));
  });
  async function start(role: string, overrides: Record<string, string> = {}) {
    const reserve = createServer();
    await new Promise<void>(resolve => reserve.listen(0, '127.0.0.1', resolve));
    const port = (reserve.address() as AddressInfo).port;
    await new Promise<void>(resolve => reserve.close(() => resolve()));
    const child = spawn(process.execPath, ['dist/main.js'], { env: {
      ...process.env, NODE_ENV: 'test', LOG_LEVEL: 'error', BOT_ROLE: role, DEFAULT_URL: origin, URL: '',
      MAX_SESSIONS: '1', SESSION_TIME: '0.001', HUMAN_BEHAVIOR: 'false', ORGANIC_SEARCH: 'false',
      HEADLESS: 'true', MATCH_GEOLOCATION: 'false', EXTERNAL_IP_CHECK: 'false', PERSISTENT_SESSIONS: 'false',
      PROXY_URL: '', PROXY_PORT: '', PROXY_USER: '', PROXY_PASS: '',
      REDIS_URL: redisUrl, REDIS_READY_TIMEOUT_MS: '1000', SHUTDOWN_TIMEOUT_MS: '4000',
      HEALTH_PORT: String(port), LOCAL_FALLBACK: 'false', WORKER_PLATFORM: 'auto', CONTROL_API_ENABLED: 'false', ...overrides,
    }, stdio: 'pipe' });
    children.add(child);
    let output = '';
    child.stdout?.on('data', data => { output += String(data); });
    child.stderr?.on('data', data => { output += String(data); });
    const exited = new Promise<number | null>(resolve => child.once('exit', code => { children.delete(child); resolve(code); }));
    async function ready() {
      await deadline((async () => {
        for (;;) {
          if (child.exitCode !== null) throw new Error(`Exited before readiness: ${output}`);
          try { if ((await fetch(`http://127.0.0.1:${port}`, { signal: AbortSignal.timeout(500) })).ok) return; } catch { /* startup */ }
          await new Promise(resolve => setTimeout(resolve, 30));
        }
      })(), 5000, 'Process readiness');
    }
    return { child, exited, ready, get output() { return output; } };
  }
  test('producer enqueues a finite batch then exits', async () => {
    const process = await start('producer');
    expect(await deadline(process.exited, 5000, 'Producer exit')).toBe(0);
    expect(await queue.getWaitingCount()).toBe(1);
  });
  test.each(['producer', 'worker', 'both'])('%s starts after delayed Redis readiness', async role => {
    const sockets = new Set<Socket>();
    const proxy = createTcpServer(client => {
      const target = new URL(redisUrl);
      const upstream = connect(Number(target.port), target.hostname);
      for (const socket of [client, upstream]) {
        sockets.add(socket);
        socket.on('error', () => socket.destroy());
        socket.on('close', () => sockets.delete(socket));
      }
      client.pipe(upstream).pipe(client);
    });
    const reserve = createTcpServer();
    await new Promise<void>(resolve => reserve.listen(0, '127.0.0.1', resolve));
    const port = (reserve.address() as AddressInfo).port;
    await new Promise<void>(resolve => reserve.close(() => resolve()));
    const process = await start(role, { REDIS_URL: `redis://127.0.0.1:${port}${new URL(redisUrl).pathname}`, REDIS_READY_TIMEOUT_MS: '5000' });
    const timer = setTimeout(() => proxy.listen(port, '127.0.0.1'), 600);
    try {
      if (role !== 'producer') { await process.ready(); process.child.kill('SIGTERM'); }
      expect(await deadline(process.exited, 7000, 'Delayed role exit')).toBe(0);
      if (role === 'producer') expect(await queue.getWaitingCount()).toBe(1);
    } finally {
      clearTimeout(timer);
      for (const socket of sockets) socket.destroy();
      if (proxy.listening) await new Promise<void>(resolve => proxy.close(() => resolve()));
    }
  }, 12000);
  test.each(['producer', 'worker', 'both'])('%s fails when required Redis is unavailable', async role => {
    const process = await start(role, { REDIS_URL: 'redis://127.0.0.1:1', REDIS_READY_TIMEOUT_MS: '200' });
    expect(await deadline(process.exited, 4000, 'Failure exit')).toBe(1);
  });
  test.each(['local', 'both'])('%s finite local batch exits after browser cleanup', async role => {
    const process = await start(role, { REDIS_URL: 'redis://127.0.0.1:1', LOCAL_FALLBACK: 'true', REDIS_READY_TIMEOUT_MS: '200' });
    const exitCode = await deadline(process.exited, 15000, 'Batch exit');
    if (exitCode !== 0) console.error(`Role ${role} failed with output: ${process.child.exitCode} ${process.child.signalCode} - ` + process.output);
    expect(exitCode).toBe(0);
  }, 20000);
  test.each(['SIGTERM', 'SIGINT'] as const)('worker handles %s without leaving connections', async signal => {
    const process = await start('worker');
    await process.ready();
    process.child.kill(signal);
    expect(await deadline(process.exited, 6000, 'Worker shutdown')).toBe(0);
  }, 10000);
  test('both mode starts worker and cancels long session within shutdown deadline', async () => {
    const before = requests;
    const process = await start('both', { SESSION_TIME: '10' });
    await process.ready();
    await deadline((async () => { while (requests === before) await new Promise(resolve => setTimeout(resolve, 30)); })(), 10000, 'Active browser');
    process.child.kill('SIGTERM');
    expect(await deadline(process.exited, 6000, 'Bounded active shutdown')).toBe(0);
  }, 20000);
});
