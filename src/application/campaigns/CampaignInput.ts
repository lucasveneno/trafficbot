import { z } from 'zod';
import { httpUrl } from '../../domain/entities/SessionContract';
import { sessionRequirementsSchema } from '../../domain/entities/WorkerContract';
import { validateCron } from '../schedules/CronEvaluator';
export const campaignInput = z.object({
  name: z.string().trim().min(1).max(100), description: z.string().max(2000).optional(), url: httpUrl,
  targets: z.array(httpUrl).min(1).max(100).optional(), concurrency: z.number().int().min(1).max(100).optional(),
  totalSessions: z.number().int().min(1).max(10000).optional(),
  proxyMode: z.enum(['auto', 'direct', 'pool']).optional(), proxyIds: z.array(z.string().uuid()).max(100).optional(),
  durationMinutes: z.number().finite().positive().max(120), intensity: z.enum(['low', 'medium', 'high']),
  behaviorModel: z.enum(['generic', 'article_reader', 'infinite_scroll', 'form_filler']),
  persistent: z.boolean(), profileKey: z.string().regex(/^[a-zA-Z0-9_-]{1,100}$/).optional(),
  requirements: sessionRequirementsSchema.optional(),
  proxy: z.object({ host: z.string().min(1), port: z.number().int().min(1).max(65535), protocol: z.enum(['http', 'https', 'socks5']) }).optional(),
  schedule: z.object({ mode: z.enum(['immediate', 'interval', 'cron']), value: z.string().max(100).optional(), startAt: z.string().datetime().optional(), endAt: z.string().datetime().optional(), maxSessions: z.number().int().positive().max(10000).optional() }),
}).refine(data => !data.persistent || !!data.profileKey, 'Persistent sessions require a profile key')
  .refine(data => !data.persistent || (data.concurrency || 1) === 1, 'A persistent profile requires concurrency one')
  .refine(data => data.proxyMode !== 'pool' || !!data.proxyIds?.length, 'Select at least one proxy for the pool')
  .refine(data => { if (data.schedule.mode === 'immediate') return true; if (data.schedule.mode === 'interval') return Number.isFinite(Number(data.schedule.value)) && Number(data.schedule.value) >= 1000; try { validateCron(data.schedule.value || ''); return true; } catch { return false; } }, 'Invalid campaign schedule')
  .transform(data => ({ ...data, url: data.targets?.[0] || data.url }));
