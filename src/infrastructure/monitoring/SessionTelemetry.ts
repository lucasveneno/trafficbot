import { AsyncLocalStorage } from 'node:async_hooks';
import { randomUUID } from 'node:crypto';
import type Redis from 'ioredis';
import type { SessionDiagnostics, SessionEvent, SessionPhase, LogEntry } from '../../domain/control/ControlContract';
import { deadline } from '../lifecycle/deadline';

interface Context { sessionId: string; campaignId?: string; workerId?: string; attempt: number }
const context = new AsyncLocalStorage<Context>();
const TTL = 86400;
/** Only curated messages cross the worker/controller boundary; raw errors and job data stay private. */
export class SessionTelemetry {
  private static redis: Redis | null = null;
  static initialize(redis: Redis | null) { this.redis = redis; }
  static run<T>(value: Context, fn: () => Promise<T>): Promise<T> { return context.run(value, fn); }
  static async event(phase: SessionPhase, message: string): Promise<void> {
    const current = context.getStore(), redis = this.redis;
    if (!current || !redis || redis.status !== 'ready') return;
    const event: SessionEvent = { ...current, id: randomUUID(), ts: new Date().toISOString(), phase, message };
    const key = `traffic:session-events:${current.sessionId}`;
    await deadline(redis.multi().rpush(key, JSON.stringify(event)).ltrim(key, -100, -1).expire(key, TTL)
      .rpush('traffic:execution-logs', JSON.stringify(event)).ltrim('traffic:execution-logs', -2000, -1).expire('traffic:execution-logs', TTL).exec(), 500, 'Telemetry write').catch(() => undefined);
  }
  static async screenshot(bytes: Uint8Array): Promise<void> {
    const current = context.getStore(), redis = this.redis;
    if (!current || !redis || redis.status !== 'ready' || bytes.length > 384000) return;
    // Global cap: twenty bounded JPEGs, with no filesystem paths exposed by the API.
    await deadline(redis.eval(`
      redis.call('HSET', KEYS[1], ARGV[1], ARGV[2])
      redis.call('LREM', KEYS[2], 0, ARGV[1])
      redis.call('RPUSH', KEYS[2], ARGV[1])
      while redis.call('LLEN', KEYS[2]) > 20 do redis.call('HDEL', KEYS[1], redis.call('LPOP', KEYS[2])) end
      redis.call('EXPIRE', KEYS[1], 86400); redis.call('EXPIRE', KEYS[2], 86400)
      return 1`, 2, 'traffic:failure-screenshots', 'traffic:failure-screenshot-order', current.sessionId,
      JSON.stringify({ expires: Date.now() + TTL * 1000, image: `data:image/jpeg;base64,${Buffer.from(bytes).toString('base64')}` })), 500, 'Screenshot write').catch(() => undefined);
  }
  static async diagnostics(redis: Redis, sessionId: string, includeScreenshot = false): Promise<SessionDiagnostics> {
    const [lines, image] = await Promise.all([redis.lrange(`traffic:session-events:${sessionId}`, 0, -1), includeScreenshot ? redis.hget('traffic:failure-screenshots', sessionId) : Promise.resolve(null)]);
    const saved = image ? JSON.parse(image) : undefined;
    return { events: lines.map(line => JSON.parse(line)), screenshot: saved?.expires > Date.now() ? saved.image : undefined };
  }
  static async logs(redis: Redis): Promise<LogEntry[]> {
    return (await redis.lrange('traffic:execution-logs', 0, -1)).map(line => {
      const event: SessionEvent = JSON.parse(line);
      return { ts: event.ts, level: event.phase === 'failed' ? 'error' : event.phase === 'cancelled' ? 'warn' : 'info', service: 'worker', message: event.message, meta: { sessionId: event.sessionId, campaignId: event.campaignId, workerId: event.workerId, attempt: event.attempt, phase: event.phase } };
    });
  }
}

export function failureSummary(error: unknown): string {
  const message = error instanceof Error ? error.message : String(error);
  if (/cancel/i.test(message)) return 'Session cancelled by shutdown or stop request.';
  const status = /HTTP failure: (\d{3})/.exec(message)?.[1];
  if (status) return `Target returned HTTP ${status}. Check the target response before retrying.`;
  if (/timeout|deadline/i.test(message)) return 'Navigation or session operation timed out. Check target availability and proxy latency.';
  if (/proxy|ERR_TUNNEL/i.test(message)) return 'Proxy connection or location validation failed. Check the selected proxy pool.';
  if (/ERR_NAME_NOT_RESOLVED|ERR_CONNECTION/i.test(message)) return 'Target network connection failed. Check DNS and target availability.';
  if (/origin|redirect/i.test(message)) return 'Navigation left the allowed target origin or did not reach it.';
  if (/launch|browser process|executable|sandbox/i.test(message)) return 'Browser startup failed. Check the worker browser installation and sandbox configuration.';
  return 'Session execution failed. Inspect the timeline and worker logs before retrying.';
}
