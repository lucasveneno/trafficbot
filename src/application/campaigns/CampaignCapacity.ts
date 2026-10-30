import type IORedis from 'ioredis';
/** Redis reservation shared across platform queues and worker processes. */
export async function reserveCampaign(redis: IORedis, campaignId: string, member: string, limit: number, durationMinutes: number): Promise<boolean> {
  const now = Date.now(), expiry = now + (durationMinutes + 5) * 60000;
  const result = await redis.eval("redis.call('ZREMRANGEBYSCORE', KEYS[1], '-inf', ARGV[1]); if redis.call('ZCARD', KEYS[1]) >= tonumber(ARGV[2]) then return 0 end; redis.call('ZADD', KEYS[1], ARGV[3], ARGV[4]); redis.call('PEXPIRE', KEYS[1], math.max(redis.call('PTTL', KEYS[1]), tonumber(ARGV[3])-tonumber(ARGV[1]))); return 1", 1, `traffic:campaign-slots:${campaignId}`, now, limit, expiry, member);
  return result === 1;
}
export async function releaseCampaign(redis: IORedis, campaignId: string, member: string): Promise<void> { await redis.zrem(`traffic:campaign-slots:${campaignId}`, member); }
