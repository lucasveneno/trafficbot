import { Queue } from 'bullmq';
import { randomUUID } from 'crypto';
import { QueueService } from '../../infrastructure/queue/QueueService';
import { deadline } from '../../infrastructure/lifecycle/deadline';

(process.env.RUN_REDIS_TESTS === '1' ? describe : describe.skip)('campaign concurrency across workers and queues', () => {
  test('two workers with eight slots respect a campaign limit of two', async () => {
    if (!process.env.REDIS_TEST_URL) throw new Error('Use an empty dedicated REDIS_TEST_URL');
    await QueueService.initialize(process.env.REDIS_TEST_URL, 3000);
    const redis = QueueService.getRedis()!;
    if (await redis.dbsize()) { await QueueService.close(); throw new Error('Test Redis database must be empty'); }
    const queues = ['linux', 'macos'].map(platform => new Queue(`traffic-sessions-${platform}`, { connection: redis }));
    let active = 0, maximum = 0, finished = 0;
    let done!: () => void;
    const completed = new Promise<void>(resolve => { done = resolve; });
    try {
      for (const platform of ['linux', 'macos'] as const) {
        const worker = await QueueService.createWorker(platform, async () => {
          active++; maximum = Math.max(maximum, active);
          try { await new Promise(resolve => setTimeout(resolve, 100)); } finally { active--; }
        }, 4);
        worker.on('completed', () => { if (++finished === 6) done(); });
      }
      const campaignId = randomUUID();
      for (let i = 0; i < 6; i++) await QueueService.addSession({ url: 'http://127.0.0.1/fixture', durationMinutes: 0.01, intensity: 'low', persistent: false, campaignId, campaignConcurrency: 2, proxyMode: 'direct', requirements: { platform: i % 2 ? 'macos' : 'linux' } });
      await deadline(completed, 15000, 'Campaign jobs');
      expect(maximum).toBe(2); expect(finished).toBe(6);
      for (const queue of queues) for (const job of await queue.getJobs(['completed'])) expect(job.attemptsMade).toBe(1);
      expect(await redis.zcard(`traffic:campaign-slots:${campaignId}`)).toBe(0);
    } finally { for (const queue of queues) { await queue.obliterate({ force: true }); await queue.close(); } await QueueService.close(); }
  }, 20000);
  test('an acknowledged dispatch is idempotent even when routing inputs change', async () => {
    await QueueService.initialize(process.env.REDIS_TEST_URL!, 3000);
    const redis = QueueService.getRedis()!;
    const queues = ['linux', 'macos'].map(platform => new Queue(`traffic-sessions-${platform}`, { connection: redis }));
    const campaignId = randomUUID(), dispatchKey = `dispatch-${randomUUID()}`;
    const data = { url: 'http://127.0.0.1/fixture', durationMinutes: 0.01, intensity: 'low' as const, persistent: false, campaignId, dispatchKey };
    try {
      const first = await QueueService.addSession({ ...data, requirements: { platform: 'linux' } });
      const retry = await QueueService.addSession({ ...data, requirements: { platform: 'macos' } });
      expect(first).toBe(retry);
      expect(await queues[0].getWaitingCount()).toBe(1); expect(await queues[1].getWaitingCount()).toBe(0);
      expect(await redis.hget(`traffic:campaign-counts:${campaignId}`, 'totalQueued')).toBe('1');
    } finally { for (const queue of queues) { await queue.obliterate({ force: true }); await queue.close(); } await QueueService.close(); }
  });
});
