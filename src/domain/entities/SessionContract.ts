import { z } from 'zod';
import { sessionRequirementsSchema } from './WorkerContract';

export const httpUrl = z.string().url().refine(value => {
  try {
    const url = new URL(value);
    return ['http:', 'https:'].includes(url.protocol) && !url.username && !url.password;
  } catch { return false; }
}, 'Expected an HTTP(S) URL without credentials');
export const proxySchema = z.object({
  host: z.string().min(1).refine(value => {
    try {
      if (!/^(?:[a-z][a-z0-9+.-]*:\/\/)?(\[[^\]]+\]|[^:/?#\s]+)\/?$/i.test(value)) return false;
      const url = new URL(value.includes('://') ? value : `http://${value}`);
      return ['http:', 'https:', 'socks5:'].includes(url.protocol) && !!url.hostname &&
        !url.username && !url.password && !url.port && url.pathname.replace('/', '') === '' && !url.search && !url.hash;
    } catch { return false; }
  }, 'Proxy host must be a hostname or supported origin without port or credentials'),
  port: z.number().int().min(1).max(65535),
  username: z.string().min(1).optional(),
  password: z.string().min(1).optional(),
}).strict().superRefine((proxy, ctx) => {
  if (!!proxy.username !== !!proxy.password || (proxy.host.startsWith('socks5:') && proxy.username))
    ctx.addIssue({ code: 'custom', message: 'Credentials must be paired; SOCKS authentication is unsupported' });
});
export const sessionJobSchema = z.object({
  url: httpUrl,
  durationMinutes: z.number().finite().positive(),
  intensity: z.enum(['low', 'medium', 'high']),
  behaviorModel: z.enum(['generic', 'article_reader', 'infinite_scroll', 'form_filler']).default('generic'),
  proxy: proxySchema.optional(),
  persistent: z.boolean().default(false),
  profileKey: z.string().regex(/^[a-zA-Z0-9_-]{1,100}$/).optional(),
  deviceProfile: z.string().regex(/^[a-z0-9-]+$/).optional(),
  requirements: sessionRequirementsSchema.optional(),
  campaignId: z.string().optional(),
  campaignConcurrency: z.number().int().min(1).max(100).optional(),
  dispatchKey: z.string().regex(/^[a-zA-Z0-9_-]{1,200}$/).optional(),
  proxyMode: z.enum(['auto', 'direct', 'pool']).optional(),
  proxyIds: z.array(z.string().uuid()).min(1).max(100).optional(),
  proxyPool: z.array(z.object({ id: z.string().uuid(), proxy: proxySchema, maxConcurrentLeases: z.number().int().positive().optional() })).min(1).max(100).optional(),
  scheduleId: z.string().optional(),
}).strict().refine(data => !data.persistent || !!data.profileKey, 'Persistent sessions require a profile key')
  .refine(data => !['direct', 'pool'].includes(data.proxyMode || '') || !data.proxy, 'Explicit proxy conflicts with proxy mode')
  .refine(data => data.proxyMode !== 'pool' || !!data.proxyIds?.length || !!data.proxyPool?.length, 'Selected proxy pool is empty');
export type TrafficJobData = z.infer<typeof sessionJobSchema>;
export type TrafficJobInput = z.input<typeof sessionJobSchema>;
export function proxyServer(proxy: z.infer<typeof proxySchema>): string {
  const url = new URL(proxy.host.includes('://') ? proxy.host : `http://${proxy.host}`);
  url.port = String(proxy.port);
  return url.origin === 'null' ? `${url.protocol}//${url.host}` : url.origin;
}
export function sameOrigin(target: string, origin: string): boolean {
  try { return new URL(target).origin === new URL(origin).origin; } catch { return false; }
}
