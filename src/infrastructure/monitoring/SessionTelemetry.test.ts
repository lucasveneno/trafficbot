import type Redis from 'ioredis';
import { failureSummary, SessionTelemetry } from './SessionTelemetry';

afterEach(() => SessionTelemetry.initialize(null));

test('concurrent sessions keep correlation and attempt context isolated', async () => {
  const writes: { key: string; value: string }[] = [];
  const pipeline: any = { rpush: (key: string, value: string) => { writes.push({ key, value }); return pipeline; }, ltrim: () => pipeline, expire: () => pipeline, exec: async () => [] };
  SessionTelemetry.initialize({ status: 'ready', multi: () => pipeline } as unknown as Redis);
  await Promise.all(['one', 'two'].map((sessionId, i) => SessionTelemetry.run({ sessionId, workerId: `worker-${i}`, campaignId: `campaign-${i}`, attempt: i + 1 }, async () => {
    await Promise.resolve(); await SessionTelemetry.event('navigating', 'Navigating to target.');
  })));
  const events = writes.filter(write => write.key.startsWith('traffic:session-events:')).map(write => JSON.parse(write.value));
  expect(events).toEqual(expect.arrayContaining([
    expect.objectContaining({ sessionId: 'one', workerId: 'worker-0', campaignId: 'campaign-0', attempt: 1 }),
    expect.objectContaining({ sessionId: 'two', workerId: 'worker-1', campaignId: 'campaign-1', attempt: 2 }),
  ]));
});

test('telemetry outage does not replace session execution outcomes', async () => {
  const pipeline: any = { rpush: () => pipeline, ltrim: () => pipeline, expire: () => pipeline, exec: async () => { throw new Error('Redis unavailable'); } };
  SessionTelemetry.initialize({ status: 'ready', multi: () => pipeline } as unknown as Redis);
  await expect(SessionTelemetry.run({ sessionId: 'one', attempt: 1 }, () => SessionTelemetry.event('completed', 'Done.'))).resolves.toBeUndefined();
});

test('failure summaries preserve useful categories without credentials, URLs, or stack traces', () => {
  expect(failureSummary(new Error('HTTP failure: 503 https://user:password@example.test/?token=secret'))).toContain('HTTP 503');
  expect(failureSummary(new Error('Timeout https://user:password@example.test/?token=secret'))).toContain('timed out');
  for (const message of ['HTTP failure: 500 password', 'proxy password secret', 'unknown token=secret']) {
    expect(failureSummary(new Error(message))).not.toMatch(/password|secret|token=/);
  }
});

test('failure screenshots are opt-in reads and expire independently of later captures', async () => {
  const redis = { lrange: async () => [], hget: jest.fn(async () => JSON.stringify({ expires: Date.now() - 1, image: 'data:image/jpeg;base64,old' })) } as unknown as Redis;
  expect(await SessionTelemetry.diagnostics(redis, 'one')).toEqual({ events: [], screenshot: undefined });
  expect(redis.hget).not.toHaveBeenCalled();
  expect((await SessionTelemetry.diagnostics(redis, 'one', true)).screenshot).toBeUndefined();
});
