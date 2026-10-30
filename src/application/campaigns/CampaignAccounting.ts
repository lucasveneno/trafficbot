import type IORedis from 'ioredis';
export async function recordCampaignCount(redis: IORedis, campaignId: string, jobKey: string, outcome: 'totalQueued' | 'totalCompleted' | 'totalFailed'): Promise<void> {
  await redis.eval("if redis.call('SET', KEYS[1], '1', 'EX', 604800, 'NX') then redis.call('HINCRBY', KEYS[2], ARGV[1], 1); if ARGV[1] == 'totalQueued' then redis.call('HSET', KEYS[2], 'lastRunAt', ARGV[2]) end end; return 1", 2, `traffic:campaign-counted:${campaignId}:${jobKey}:${outcome}`, `traffic:campaign-counts:${campaignId}`, outcome, new Date().toISOString());
}
