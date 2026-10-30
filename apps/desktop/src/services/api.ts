import type { CampaignView, CampaignJobOptions, ProfileView, LogEntry, ScheduleView, ScheduleJobOptions } from '../types/control'
import type { Connection } from './control'

function headers(conn: Connection) {
  return { Authorization: `Bearer ${conn.token}`, 'Content-Type': 'application/json' }
}

async function get<T>(conn: Connection, path: string): Promise<T> {
  const res = await fetch(`${conn.baseUrl}${path}`, { headers: headers(conn), signal: AbortSignal.timeout(8000) })
  if (!res.ok) throw new Error(`${path} → HTTP ${res.status}`)
  return res.json() as Promise<T>
}

async function post<T>(conn: Connection, path: string, body: unknown): Promise<T> {
  const res = await fetch(`${conn.baseUrl}${path}`, { method: 'POST', headers: headers(conn), body: JSON.stringify(body), signal: AbortSignal.timeout(8000) })
  if (!res.ok) { const err = await res.json().catch(() => ({})) as { error?: string }; throw new Error(err.error ?? `HTTP ${res.status}`) }
  return res.json() as Promise<T>
}

async function put<T>(conn: Connection, path: string, body: unknown): Promise<T> {
  const res = await fetch(`${conn.baseUrl}${path}`, { method: 'PUT', headers: headers(conn), body: JSON.stringify(body), signal: AbortSignal.timeout(8000) })
  if (!res.ok) { const err = await res.json().catch(() => ({})) as { error?: string }; throw new Error(err.error ?? `HTTP ${res.status}`) }
  return res.json() as Promise<T>
}

async function patch<T>(conn: Connection, path: string, body: unknown): Promise<T> {
  const res = await fetch(`${conn.baseUrl}${path}`, { method: 'PATCH', headers: headers(conn), body: JSON.stringify(body), signal: AbortSignal.timeout(8000) })
  if (!res.ok) { const err = await res.json().catch(() => ({})) as { error?: string }; throw new Error(err.error ?? `HTTP ${res.status}`) }
  return res.json() as Promise<T>
}

async function del(conn: Connection, path: string): Promise<void> {
  const res = await fetch(`${conn.baseUrl}${path}`, { method: 'DELETE', headers: headers(conn), signal: AbortSignal.timeout(8000) })
  if (!res.ok && res.status !== 404) throw new Error(`HTTP ${res.status}`)
}

// ── Campaign API ─────────────────────────────────────────────────────
export const sessionApi = {
  stop: (conn: Connection, id: string) => post(conn, `/api/sessions/${encodeURIComponent(id)}/stop`, {}),
  retry: (conn: Connection, id: string) => post(conn, `/api/sessions/${encodeURIComponent(id)}/retry`, {}),
}
export const campaignApi = {
  list: (conn: Connection) => get<CampaignView[]>(conn, '/api/campaigns'),
  get: (conn: Connection, id: string) => get<CampaignView>(conn, `/api/campaigns/${id}`),
  create: (conn: Connection, body: CampaignJobOptions) => post<CampaignView>(conn, '/api/campaigns', body),
  update: (conn: Connection, id: string, body: Partial<CampaignJobOptions>) => put<CampaignView>(conn, `/api/campaigns/${id}`, body),
  setStatus: (conn: Connection, id: string, status: CampaignView['status']) => patch<CampaignView>(conn, `/api/campaigns/${id}/status`, { status }),
  delete: (conn: Connection, id: string) => del(conn, `/api/campaigns/${id}`),
  resumeCircuit: (conn: Connection, id: string) => post<void>(conn, `/api/campaigns/${id}/circuit/resume`, {}),
}

// ── Profile API ──────────────────────────────────────────────────────
export const profileApi = {
  list: (conn: Connection) => get<ProfileView[]>(conn, '/api/profiles'),
  get: (conn: Connection, key: string) => get<ProfileView>(conn, `/api/profiles/${encodeURIComponent(key)}`),
  delete: (conn: Connection, key: string) => del(conn, `/api/profiles/${encodeURIComponent(key)}`),
}

// ── Proxy API ────────────────────────────────────────────────────────
import type { PublicProxyDto, ProxyCreateDto } from '../types/control'

export const proxyApi = {
  test: (conn: Connection, id: string) => post(conn, `/api/proxies/${id}/test`, {}),
  list: (conn: Connection) => get<PublicProxyDto[]>(conn, '/api/proxies'),
  create: (conn: Connection, body: ProxyCreateDto) => post<{ id: string }>(conn, '/api/proxies', body),
  update: (conn: Connection, id: string, body: Partial<ProxyCreateDto>) => patch<{ id: string }>(conn, `/api/proxies/${id}`, body),
  delete: (conn: Connection, id: string) => del(conn, `/api/proxies/${id}`),
  bulkCreate: (conn: Connection, body: ProxyCreateDto[]) => post<{ added: number }>(conn, '/api/proxies/bulk', body),
}

// ── Metrics API ──────────────────────────────────────────────────────
export interface MetricsBucketDto {
  timestamp: string;
  queued: number;
  started: number;
  completed: number;
  failed: number;
}

export const metricsApi = {
  query: (conn: Connection, from: string, to: string, interval: string) => 
    get<MetricsBucketDto[]>(conn, `/api/metrics?from=${from}&to=${to}&interval=${interval}`),
}

// ── Logs API ─────────────────────────────────────────────────────────
export const logsApi = {
  get: (conn: Connection, params?: { limit?: number; level?: string }) => {
    const qs = new URLSearchParams()
    if (params?.limit) qs.set('limit', String(params.limit))
    if (params?.level) qs.set('level', params.level)
    return get<LogEntry[]>(conn, `/api/logs${qs.size ? `?${qs}` : ''}`)
  },
}

// ── Settings API ─────────────────────────────────────────────────────
export type PublicSettings = {
  restartRequired?: boolean
  nodeEnv: string; logLevel: string; defaultUrl: string; maxSessions: number
  stealthMode: boolean; headless: boolean; persistentSessions: boolean
  sessionsDataDir: string; humanBehavior: boolean; behaviorIntensity: string; behaviorModel: string;
  redisUrl: string; organicSearch: boolean; grantGeolocation: boolean
  matchGeolocation: boolean; externalIpCheck: boolean; referrals: string
  sessionTime: string; proxyConfigured: boolean
}
export const settingsApi = {
  get: (conn: Connection) => get<PublicSettings>(conn, '/api/settings'),
  update: (conn: Connection, body: Partial<PublicSettings>) => patch<PublicSettings>(conn, '/api/settings', body),
}

// ── Schedule API ─────────────────────────────────────────────────────
export const scheduleApi = {
  list:   (conn: Connection) => get<ScheduleView[]>(conn, '/api/schedules'),
  get:    (conn: Connection, id: string) => get<ScheduleView>(conn, `/api/schedules/${id}`),
  create: (conn: Connection, body: ScheduleJobOptions) => post<ScheduleView>(conn, '/api/schedules', body),
  update: (conn: Connection, id: string, body: Partial<ScheduleJobOptions>) => put<ScheduleView>(conn, `/api/schedules/${id}`, body),
  toggle: (conn: Connection, id: string) => patch<ScheduleView>(conn, `/api/schedules/${id}/toggle`, {}),
  runNow: (conn: Connection, id: string) => post<{ sessionId: string; status: string }>(conn, `/api/schedules/${id}/run`, {}),
  delete: (conn: Connection, id: string) => del(conn, `/api/schedules/${id}`),
}

// ── Worker API ───────────────────────────────────────────────────────
export const workerApi = {
  enrollment: (conn: Connection) => post<{ token: string; expiresAt: string }>(conn, '/api/workers/enrollment', {}),
  drain: (conn: Connection, id: string) => post<void>(conn, `/api/workers/${id}/drain`, {}),
  disable: (conn: Connection, id: string) => post<void>(conn, `/api/workers/${id}/disable`, {}),
  enable: (conn: Connection, id: string) => post<void>(conn, `/api/workers/${id}/enable`, {}),
  update: (conn: Connection, id: string) => post<void>(conn, `/api/workers/${id}/update`, {}),
  rollback: (conn: Connection, id: string) => post<void>(conn, `/api/workers/${id}/rollback`, {}),
}

// ── Fleet API ────────────────────────────────────────────────────────
export const fleetApi = {
  startRollout: (conn: Connection, config: { targetVersion: string, canaryCount?: number, maxConcurrent?: number, minCapacityPct?: number, maxFailures?: number }) => 
    post<any>(conn, '/api/fleet/updates', config),
  getActiveRollout: (conn: Connection) => 
    get<any>(conn, '/api/fleet/updates/active').catch(() => null),
  stopRollout: (conn: Connection) => 
    post<any>(conn, '/api/fleet/updates/active/stop', {}),
}
