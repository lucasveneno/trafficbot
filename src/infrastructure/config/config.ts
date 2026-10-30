import { z } from 'zod';
import dotenv from 'dotenv';
import { homedir } from 'os';
import { join } from 'path';
import { httpUrl, proxySchema } from '../../domain/entities/SessionContract';
import { workerPlatformSchema } from '../../domain/entities/WorkerContract';
dotenv.config({ path: join(process.env.TRAFFICBOT_CONTROL_DIR || join(homedir(), '.trafficbot'), '.env') });
dotenv.config();

export const ConfigSchema = z.object({
  NODE_ENV: z.enum(['development', 'production', 'test']).default('development'),
  LOG_LEVEL: z.enum(['error', 'warn', 'info', 'debug']).default('info'),
  DEFAULT_URL: httpUrl.default('http://127.0.0.1:8080/'),
  MAX_SESSIONS: z.coerce.number().int().positive().default(1),
  STEALTH_MODE: z.preprocess((a) => a === 'true' || a === '1' || a === true, z.boolean()).default(true),
  HEADLESS: z.preprocess((a) => a === 'false' || a === '0' || a === false ? false : true, z.boolean()).default(true),
  PERSISTENT_SESSIONS: z.preprocess((a) => a === 'true' || a === '1' || a === true, z.boolean()).default(false),
  SESSIONS_DATA_DIR: z.string().default('./sessions'),
  BROWSER_PROFILE: z.string().default('native'),
  PROXY_LOCATION_URL: httpUrl.optional(),
  GRANT_GEOLOCATION: z.enum(['true', 'false']).default('false').transform(value => value === 'true'),
  PROXY_URL: z.string().optional(),
  PROXY_PORT: z.coerce.number().int().min(1).max(65535).optional(),
  PROXY_USER: z.string().optional(),
  PROXY_PASS: z.string().optional(),
  SESSION_TIME: z.coerce.string().default('3').refine(value => value === 'random' || (value.trim() !== '' && Number.isFinite(Number(value)) && Number(value) > 0), 'Expected finite positive minutes or random'),
  LOCAL_FALLBACK: z.enum(['true', 'false']).default('false').transform(v => v === 'true'),
  REDIS_READY_TIMEOUT_MS: z.coerce.number().int().positive().default(15000),
  SHUTDOWN_TIMEOUT_MS: z.coerce.number().int().positive().default(30000),
  EXTERNAL_IP_CHECK: z.enum(['true', 'false']).default('false').transform(v => v === 'true'),
  HEALTH_PORT: z.coerce.number().int().min(1).max(65535).default(3000),
  REFERRALS: z.enum(['yes', 'no']).default('no'),
  HUMAN_BEHAVIOR: z.preprocess((a) => a === 'true' || a === '1' || a === true, z.boolean()).default(true),
  BEHAVIOR_INTENSITY: z.enum(['low', 'medium', 'high']).default('medium'),
  BEHAVIOR_MODEL: z.enum(['generic', 'article_reader', 'infinite_scroll', 'form_filler']).default('generic'),
  REDIS_URL: z.string().default('redis://127.0.0.1:6379'),
  BOT_ROLE: z.enum(['producer', 'worker', 'both', 'local']).default('both'),
  ORGANIC_SEARCH: z.preprocess((val) => val === 'true', z.boolean()).default(false),
  SEARCH_KEYWORDS: z.preprocess((val) => (val ? String(val).split(',') : []), z.array(z.string())).default([]),
  REFERRER_POOL: z.preprocess((val) => (val ? String(val).split(',') : []), z.array(z.string())).default([]),
  MATCH_GEOLOCATION: z.preprocess((val) => val === 'true', z.boolean()).default(false),
  SEARCH_TARGET_TYPE: z.enum(['url', 'contains', 'text']).default('url'),
  SEARCH_TARGET_VALUE: z.string().optional(),
  SEARCH_PAGES_LIMIT: z.coerce.number().min(1).max(10).default(1),
  SEARCH_ENGINE: z.enum(['google', 'bing', 'duckduckgo', 'random']).default('google'),
  WORKER_PLATFORM: workerPlatformSchema.or(z.enum(['auto'])).default('auto'),
}).superRefine((config, ctx) => {
  if (config.PROXY_URL || config.PROXY_PORT || config.PROXY_USER || config.PROXY_PASS) {
    if (!proxySchema.safeParse({ host: config.PROXY_URL, port: config.PROXY_PORT, username: config.PROXY_USER, password: config.PROXY_PASS }).success)
      ctx.addIssue({ code: 'custom', message: 'Invalid or incomplete proxy configuration', path: ['PROXY_URL'] });
  }
  if (config.MATCH_GEOLOCATION && (!config.PROXY_LOCATION_URL || (!config.PROXY_URL && config.BOT_ROLE !== 'worker')))
    ctx.addIssue({ code: 'custom', message: 'MATCH_GEOLOCATION requires PROXY_LOCATION_URL and a proxy (workers may receive the proxy in jobs)' });
  if (config.GRANT_GEOLOCATION && !config.MATCH_GEOLOCATION)
    ctx.addIssue({ code: 'custom', message: 'GRANT_GEOLOCATION requires proxy location matching' });
});

export function parseConfig(env: Record<string, unknown>) {
  const optionalBlank = new Set(['URL', 'PROXY_URL', 'PROXY_PORT', 'PROXY_USER', 'PROXY_PASS', 'SEARCH_TARGET_VALUE', 'PROXY_LOCATION_URL']);
  const normalized = Object.fromEntries(Object.entries(env).filter(([key, value]) => value !== '' || !optionalBlank.has(key)));
  return ConfigSchema.parse({ ...normalized, DEFAULT_URL: normalized.URL || normalized.DEFAULT_URL });
}
export const Config = parseConfig(process.env);
export type ConfigType = z.infer<typeof ConfigSchema>;
