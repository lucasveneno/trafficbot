import { ConfigType } from './config';
import { sessionJobSchema, TrafficJobData } from '../../domain/entities/SessionContract';
export function makeJob(config: ConfigType, index: number, random = Math.random): TrafficJobData {
  return sessionJobSchema.parse({
    url: config.DEFAULT_URL,
    durationMinutes: config.SESSION_TIME === 'random' ? Math.floor(random() * 5) + 1 : Number(config.SESSION_TIME),
    intensity: config.BEHAVIOR_INTENSITY,
    deviceProfile: config.BROWSER_PROFILE,
    persistent: config.PERSISTENT_SESSIONS,
    profileKey: config.PERSISTENT_SESSIONS ? `session-${index}` : undefined,
    proxy: config.PROXY_URL ? { host: config.PROXY_URL, port: config.PROXY_PORT, username: config.PROXY_USER, password: config.PROXY_PASS } : undefined,
    requirements: config.WORKER_PLATFORM && config.WORKER_PLATFORM !== 'auto' ? { platform: config.WORKER_PLATFORM as any } : undefined,
  });
}
