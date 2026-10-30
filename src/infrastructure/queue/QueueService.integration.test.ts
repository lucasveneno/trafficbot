import { createServer, connect, Server, Socket } from 'net';
import { AddressInfo } from 'net';
import IORedis from 'ioredis';
import { Queue, Job } from 'bullmq';
import { QueueService } from './QueueService';
import { deadline } from '../lifecycle/deadline';

const integration = process.env.RUN_REDIS_TESTS === '1' ? describe : describe.skip;
integration('Redis integration: readiness, retries, reconnect, shutdown', () => {
  const redisUrl = process.env.REDIS_TEST_URL || 'redis://127.0.0.1:16389';
  let connection: IORedis;
  let observer: Queue;
  let proxy: Server;
  const sockets = new Set<Socket>();
  let port: number;
  const payload = { url: 'http://127.0.0.1/', durationMinutes: 0.01, intensity: 'low' as const, persistent: false };
  beforeAll(async () => {
    connection = new IORedis(redisUrl, { maxRetriesPerRequest: null });
    observer = new Queue('traffic-sessions-linux', { connection });
    await deadline(observer.waitUntilReady(), 3000, 'Test Redis connection');
    // Dedicated test Redis only; refuse to overwrite existing work.
    if (await observer.count()) throw new Error('Use an empty dedicated test Redis');
    const reserved = createServer();
    await new Promise<void>(resolve => reserved.listen(0, '127.0.0.1', resolve));
    port = (reserved.address() as AddressInfo).port;
    await new Promise<void>(resolve => reserved.close(() => resolve()));
    proxy = createServer(client => {
      const target = new URL(redisUrl);
      const upstream = connect(Number(target.port || 6379), target.hostname);
      for (const socket of [client, upstream]) {
        sockets.add(socket);
        socket.on('error', () => socket.destroy());
        socket.on('close', () => sockets.delete(socket));
      }
      client.pipe(upstream).pipe(client);
    });
  });
  afterEach(async () => { await QueueService.close(500); });
  afterAll(async () => {
    for (const socket of sockets) socket.destroy();
    if (proxy?.listening) await new Promise<void>(resolve => proxy.close(() => resolve()));
    if (connection.status === 'ready') await observer.obliterate({ force: true });
    connection.disconnect();
    await observer.close();
  });
  test('awaits delayed Redis before enabling distributed work', async () => {
    const timer = setTimeout(() => proxy.listen(port, '127.0.0.1'), 350);
    try {
      await QueueService.initialize(`redis://127.0.0.1:${port}${new URL(redisUrl).pathname}`, 5000);
      expect(QueueService.isDistributedEnabled()).toBe(true);
      expect(await QueueService.addSession(payload)).toBeTruthy();
    } finally { clearTimeout(timer); }
    await observer.drain();
  });
  test('bounded failure is explicit', async () => {
    await expect(QueueService.initialize('redis://127.0.0.1:1', 200)).rejects.toThrow('Required Redis');
    expect(QueueService.isDistributedEnabled()).toBe(false);
    await expect(QueueService.addSession(payload)).rejects.toThrow('not initialized');
  });
  test('retries original failures three times and retains final failure', async () => {
    await QueueService.initialize(redisUrl, 3000);
    let calls = 0;
    const worker = await QueueService.createWorker('linux', async () => { calls++; throw new Error('controlled failure'); });
    const finished = new Promise<void>(resolve => worker.on('failed', job => { if (job?.attemptsMade === 3) resolve(); }));
    const id = await QueueService.addSession(payload);
    await deadline(finished, 25000, 'Retries');
    const job = await Job.fromId(observer, id);
    expect(calls).toBe(3);
    expect(job?.attemptsMade).toBe(3);
    expect(job?.failedReason).toBe('controlled failure');
    expect(await job?.getState()).toBe('failed');
    await job?.remove();
  }, 30000);
  test('worker rejects invalid payload before invoking the processor', async () => {
    await QueueService.initialize(redisUrl, 3000);
    const processor = jest.fn(async () => undefined);
    const worker = await QueueService.createWorker('linux', processor);
    const failed = new Promise<void>(resolve => worker.once('failed', () => resolve()));
    const job = await observer.add('execute-session', { url: 'file:///invalid', durationMinutes: -1 });
    await deadline(failed, 3000, 'Payload rejection');
    expect(processor).not.toHaveBeenCalled();
    expect(await job.getState()).toBe('failed');
    await job.remove();
  });
  test('temporary disconnect resumes queued work and drain waits for active work', async () => {
    await QueueService.initialize(`redis://127.0.0.1:${port}${new URL(redisUrl).pathname}`, 5000);
    let release!: () => void;
    let started!: () => void;
    const active = new Promise<void>(resolve => { started = resolve; });
    const gate = new Promise<void>(resolve => { release = resolve; });
    const worker = await QueueService.createWorker('linux', async () => { started(); await gate; });
    for (const socket of sockets) socket.destroy();
    const completed = new Promise<void>(resolve => worker.once('completed', () => resolve()));
    await QueueService.addSession(payload);
    await deadline(active, 5000, 'Reconnect');
    let closed = false;
    const closing = QueueService.close(3000).then(() => { closed = true; });
    await new Promise(resolve => setTimeout(resolve, 100));
    expect(closed).toBe(false);
    release();
    await deadline(completed, 2000, 'Completion');
    await closing;
    expect(closed).toBe(true);
  }, 10000);
});
