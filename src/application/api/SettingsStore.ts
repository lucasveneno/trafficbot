import { z } from 'zod';
import { mkdir, readFile, rename, writeFile } from 'fs/promises';
import { homedir } from 'os';
import { join } from 'path';
import { parseConfig } from '../../infrastructure/config/config';
import dotenv from 'dotenv';

const text = z.string().max(2048).refine(v => !/[\r\n\0]/.test(v));
const schema = z.object({
  nodeEnv: z.enum(['development', 'production', 'test']), logLevel: z.enum(['error', 'warn', 'info', 'debug']),
  defaultUrl: text.refine(v => { try { return ['http:', 'https:'].includes(new URL(v).protocol); } catch { return false; } }), maxSessions: z.number().int().min(1).max(1000), stealthMode: z.boolean(), headless: z.boolean(),
  persistentSessions: z.boolean(), sessionsDataDir: text.refine(v => v.length > 0), humanBehavior: z.boolean(),
  behaviorIntensity: z.enum(['low', 'medium', 'high']), behaviorModel: z.enum(['generic', 'article_reader', 'infinite_scroll', 'form_filler']),
  redisUrl: text.refine(v => /^rediss?:\/\//.test(v) && !v.includes('***')), organicSearch: z.boolean(),
  grantGeolocation: z.boolean(), matchGeolocation: z.boolean(), externalIpCheck: z.boolean(), referrals: z.enum(['yes', 'no']),
  sessionTime: text, proxyConfigured: z.boolean().optional(), restartRequired: z.boolean().optional(),
}).partial().strict();

/** Persist next-launch configuration without claiming running workers were reconfigured. */
export async function saveSettings(value: unknown): Promise<void> {
  const patch = schema.parse(value);
  const directory = process.env.TRAFFICBOT_CONTROL_DIR || join(homedir(), '.trafficbot');
  await mkdir(directory, { recursive: true, mode: 0o700 });
  const file = join(directory, '.env');
  let content = await readFile(file, 'utf8').catch(() => '');
  const updates: Record<string, string> = {};
  for (const [key, entry] of Object.entries(patch)) {
    if (['proxyConfigured', 'restartRequired'].includes(key)) continue;
    const envKey = key === 'defaultUrl' ? 'URL' : key.replace(/[A-Z]/g, letter => `_${letter}`).toUpperCase();
    updates[envKey] = String(entry);
    const raw = String(entry);
    // dotenv expands backslash-n in double quotes, corrupting Windows paths.
    const quote = !raw.includes("'") ? "'" : !raw.includes('`') ? '`' : undefined;
    if (!quote) throw new Error('Setting contains unsupported quoting characters');
    const line = `${envKey}=${quote}${raw}${quote}`;
    const regex = new RegExp(`^${envKey}=.*$`, 'm');
    content = regex.test(content) ? content.replace(regex, () => line) : `${content}\n${line}`;
  }
  parseConfig({ ...process.env, ...dotenv.parse(content), ...updates });
  const temporary = `${file}.${process.pid}.tmp`;
  await writeFile(temporary, content, { mode: 0o600 });
  await rename(temporary, file);
}
