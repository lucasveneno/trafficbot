import { z } from 'zod';
import dotenv from 'dotenv';
dotenv.config();

const ConfigSchema = z.object({
  NODE_ENV: z.enum(['development', 'production', 'test']).default('development'),
  LOG_LEVEL: z.enum(['error', 'warn', 'info', 'debug']).default('info'),
  DEFAULT_URL: z.string().url().default('https://lucasveneno.com/'),
  MAX_SESSIONS: z.coerce.number().int().positive().default(1),
  STEALTH_MODE: z.preprocess((a) => a === 'true' || a === '1' || a === true, z.boolean()).default(true),
  HEADLESS: z.preprocess((a) => a === 'false' || a === '0' || a === false ? false : true, z.boolean()).default(true),
  PERSISTENT_SESSIONS: z.preprocess((a) => a === 'true' || a === '1' || a === true, z.boolean()).default(false),
  SESSIONS_DATA_DIR: z.string().default('./sessions'),
  PROXY_URL: z.string().optional(),
  PROXY_PORT: z.coerce.number().optional(),
  PROXY_USER: z.string().optional(),
  PROXY_PASS: z.string().optional(),
  SESSION_TIME: z.coerce.string().default('3'),
  REFERRALS: z.enum(['yes', 'no']).default('no'),
  HUMAN_BEHAVIOR: z.preprocess((a) => a === 'true' || a === '1' || a === true, z.boolean()).default(true),
  BEHAVIOR_INTENSITY: z.enum(['low', 'medium', 'high']).default('medium'),
  REDIS_URL: z.string().default('redis://127.0.0.1:6379'),
  BOT_ROLE: z.enum(['producer', 'worker', 'both']).default('both'),
  ORGANIC_SEARCH: z.preprocess((val) => val === 'true', z.boolean()).default(false),
  SEARCH_KEYWORDS: z.preprocess((val) => (val ? String(val).split(',') : []), z.array(z.string())).default([]),
  REFERRER_POOL: z.preprocess((val) => (val ? String(val).split(',') : []), z.array(z.string())).default([]),
  MATCH_GEOLOCATION: z.preprocess((val) => val === 'true', z.boolean()).default(false),
});

export const Config = ConfigSchema.parse(process.env);
export type ConfigType = z.infer<typeof ConfigSchema>;
