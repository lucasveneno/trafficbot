import { campaignInput } from './CampaignInput';
import { campaignJob } from './CampaignJob';
import { CampaignRunner } from './CampaignRunner';
import { CampaignStore } from './CampaignStore';
import { QueueService } from '../../infrastructure/queue/QueueService';
import { circuitBreakerService } from './CircuitBreakerService';
import type { CampaignView, ControlSnapshot, SessionView } from '../../domain/control/ControlContract';

const base = { name: 'Local campaign', url: 'http://127.0.0.1/a', targets: ['http://127.0.0.1/a', 'http://127.0.0.1/b'], concurrency: 2, totalSessions: 3, durationMinutes: 0.01, intensity: 'low' as const, behaviorModel: 'generic' as const, persistent: false, proxyMode: 'direct' as const, schedule: { mode: 'immediate' as const } };
test('validates targets, pool selection, persistent capacity and schedules', () => {
  expect(campaignInput.parse(base).targets).toHaveLength(2);
  for (const invalid of [{ targets: ['file:///private'] }, { targets: ['https://name:secret@example.com'] }, { concurrency: 0 }, { persistent: true, profileKey: 'one', concurrency: 2 }, { proxyMode: 'pool', proxyIds: [] }, { schedule: { mode: 'interval', value: 'invalid' } }]) expect(() => campaignInput.parse({ ...base, ...invalid })).toThrow();
});
test('rotates targets and preserves scheduling policy without accidentally retaining an inline proxy', () => {
  const campaign = { ...base, id: 'campaign', proxy: { host: 'legacy-proxy', port: 80, protocol: 'http' } } as CampaignView;
  expect([0, 1, 2].map(i => campaignJob(campaign, i).url)).toEqual([base.targets[0], base.targets[1], base.targets[0]]);
  expect(campaignJob(campaign, 0)).toMatchObject({ campaignId: 'campaign', campaignConcurrency: 2, proxyMode: 'direct' });
  expect(campaignJob(campaign, 0).proxy).toBeUndefined();
});
test('dispatches to capacity, resumes persisted progress, and completes a finite run', async () => {
  const values = new Map<string, string>();
  const redis = { status: 'ready', get: async (key: string) => values.get(key), set: async (key: string, value: string, ...args: unknown[]) => { if (args.includes('NX') && values.has(key)) return null; values.set(key, value); return 'OK'; }, eval: async (script: string, _count: number, key: string) => { if (script.includes("'DEL'")) values.delete(key); return 1; } };
  jest.spyOn(QueueService, 'getRedis').mockReturnValue(redis as unknown as ReturnType<typeof QueueService.getRedis>);
  jest.spyOn(circuitBreakerService, 'canExecute').mockResolvedValue(true);
  let campaign = { ...base, id: 'example', status: 'active' } as CampaignView;
  const sessions: SessionView[] = [];
  const source = { snapshot: jest.fn(async () => ({ system: { redis: 'ready' }, sessions, workers: [{ status: 'online', browsers: [] }] } as unknown as ControlSnapshot)), submit: jest.fn(async data => { sessions.push({ id: data.dispatchKey, campaignId: campaign.id, status: 'queued' } as SessionView); return data.dispatchKey; }) };
  const store = { list: async () => [campaign], get: async () => campaign, update: async (_id: string, patch: Partial<CampaignView>) => { campaign = { ...campaign, ...patch }; return campaign; } } as unknown as CampaignStore;
  const first = new CampaignRunner(source, store); first.start();
  try {
    await first.tick(); expect(source.submit).toHaveBeenCalledTimes(2);
    await first.tick(); expect(source.submit).toHaveBeenCalledTimes(2);
    campaign.status = 'paused'; sessions[0].status = 'completed'; await first.tick(); expect(source.submit).toHaveBeenCalledTimes(2);
    campaign.status = 'active'; await first.stop();
    const second = new CampaignRunner(source, store); second.start();
    try {
      await second.tick(); expect(source.submit).toHaveBeenCalledTimes(3);
      expect(source.submit.mock.calls.map(([data]) => data.url)).toEqual([base.targets[0], base.targets[1], base.targets[0]]);
      sessions.forEach(s => { s.status = 'completed'; }); await second.tick();
      expect(campaign.status).toBe('completed'); expect(new Set(source.submit.mock.calls.map(([data]) => data.dispatchKey)).size).toBe(3);
    } finally { await second.stop(); }
  } finally { await first.stop(); jest.restoreAllMocks(); }
});
