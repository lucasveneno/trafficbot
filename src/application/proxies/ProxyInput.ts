import { z } from 'zod';
export const proxyInput = z.object({
  name: z.string().max(100).optional(), protocol: z.enum(['http', 'https', 'socks5']),
  host: z.string().min(1).max(253).regex(/^[a-zA-Z0-9.:[\]-]+$/), port: z.number().int().min(1).max(65535),
  username: z.string().max(256).optional(), password: z.string().max(1024).optional(),
  country: z.string().max(2).optional(), region: z.string().max(100).optional(), provider: z.string().max(100).optional(),
  enabled: z.boolean().optional(), maxConcurrentLeases: z.number().int().min(1).max(10000).optional(),
}).strict();
