/** Public controller contract. Types only: safe for the desktop to import. */
export type Platform = 'linux' | 'windows' | 'macos' | 'android' | 'ios';
export type Browser = 'chrome' | 'edge' | 'firefox' | 'safari';
export interface WorkerView {
  id: string; platform: Platform; architecture: string; runtime: 'container' | 'native' | 'device';
  browsers: { browser: Browser; version?: string }[]; capacity: number; active: number;
  heartbeatAt: string | null; health: 'healthy' | 'busy';
  status: 'online' | 'draining' | 'disabled' | 'offline' | 'busy'; version: string | null;
  protocolVersion: number | null; compatibility: 'compatible' | 'update_available' | 'upgrade_required' | 'server_upgrade_required' | 'unknown';
  rollbackAvailable: boolean;
  rollbackVersion: string | null;
  device?: { serial: string; model?: string; manufacturer?: string; osVersion?: string; sdkVersion?: number; type: 'emulator' | 'physical' };
}
export interface SessionView {
  executionId?: string;
  id: string; status: 'queued' | 'active' | 'completed' | 'failed' | 'delayed';
  workerId: string | null; platform: Platform; browser: Browser | null; profileId: string | null;
  persistent: boolean; proxy: 'configured' | 'direct'; url: string; createdAt: string;
  startedAt: string | null; finishedAt: string | null; durationMs: number | null;
  error: string | null; attempts: number; deviceSerial?: string;
  campaignId?: string; scheduleId?: string;
}
export interface QueueView { id: string; platform: Platform; label: string; deviceSerial?: string; waiting: number; active: number; completed: number; failed: number; delayed: number }
export interface SystemView {
  application: 'trafficbot'; apiVersion: 1; status: 'healthy' | 'degraded' | 'stopping';
  redis: 'ready' | 'unavailable'; uptimeSeconds: number; platform: string; updatedAt: string;
  counts: { active: number; queued: number; completedToday: number; failed: number; workers: number; capacity: number };
}
export interface ControlSnapshot { system: SystemView; workers: WorkerView[]; sessions: SessionView[]; queues: QueueView[] }
export type ControlEvent = { type: 'snapshot'; data: ControlSnapshot }
  | { type: 'system.updated'; system: SystemView }
  | { type: 'worker.updated'; worker: WorkerView } | { type: 'worker.offline'; workerId: string }
  | { type: 'session.updated' | 'session.started' | 'session.finished' | 'session.failed'; session: SessionView }
  | { type: 'queue.updated'; queue: QueueView }
  | { type: 'campaign.circuit.opened' | 'campaign.circuit.half_open' | 'campaign.circuit.closed' | 'campaign.circuit.manual_resume'; payload: any }
  | { type: 'worker.update.event'; event: any }
  | { type: 'worker.update.completed'; workerId: string; version: string | null }
  | { type: 'worker.update.failed'; workerId: string; error: string }
  | { type: 'fleet.update.progress'; status: FleetUpdateStatus }
  | { type: 'fleet.update.completed'; status: FleetUpdateStatus }
  | { type: 'fleet.update.paused'; status: FleetUpdateStatus }
  | { type: 'fleet.update.phase_changed'; status: FleetUpdateStatus };

export interface FleetUpdateStatus {
  id: string; targetVersion: string; state: 'planning' | 'canary' | 'rolling' | 'paused' | 'completed' | 'failed';
  totalEligible: number; pending: string[]; inProgress: string[]; completed: string[]; failed: string[]; error?: string;
}

/* ──────────────────────────────────────────────────────────────
   Profile
   ────────────────────────────────────────────────────────────── */
export interface ProfileView {
  id: string;
  /** human-readable key e.g. "us-chrome-desktop-01" */
  key: string;
  browser: Browser;
  operatingSystem: Platform;
  browserVersion: string;
  osVersion: string;
  locale: string;
  timezone: string;
  country?: string;
  userAgent: string;
  viewport: { width: number; height: number };
  mobile: boolean;
  /** ISO string when the profile was last written to disk */
  updatedAt: string | null;
  /** Serial of the Android device this profile is bound to, if any */
  deviceSerial?: string;
  source: 'catalog' | 'runtime';
}

/* ──────────────────────────────────────────────────────────────
   Proxy
   ────────────────────────────────────────────────────────────── */
import type { ProxyProtocol } from './ProxyContract';
export interface ProxyView {
  id: string;
  label: string;
  host: string;
  port: number;
  protocol: ProxyProtocol;
  authenticated: boolean;
  country?: string;
  /** ISO last-checked timestamp */
  lastCheckedAt: string | null;
  /** ms, null if never checked */
  latencyMs: number | null;
  healthy: boolean | null;
  assignedProfileKeys: string[];
}

/* ──────────────────────────────────────────────────────────────
   Campaign
   ────────────────────────────────────────────────────────────── */
export type CampaignStatus = 'active' | 'paused' | 'completed' | 'draft';
export type CampaignScheduleMode = 'immediate' | 'interval' | 'cron';

export interface CampaignView {
  id: string;
  name: string;
  description?: string;
  status: CampaignStatus;
  url: string;
  targets?: string[];
  concurrency?: number;
  totalSessions?: number;
  proxyMode?: 'auto' | 'direct' | 'pool';
  proxyIds?: string[];
  durationMinutes: number;
  intensity: 'low' | 'medium' | 'high';
  behaviorModel: 'generic' | 'article_reader' | 'infinite_scroll' | 'form_filler';
  persistent: boolean;
  profileKey?: string;
  proxy?: { host: string; port: number; protocol: ProxyProtocol };
  requirements?: {
    platform?: Platform;
    browser?: Browser;
    deviceSerial?: string;
  };
  schedule: {
    mode: CampaignScheduleMode;
    /** for interval: ms between sessions, for cron: cron expression */
    value?: string;
    startAt?: string;
    endAt?: string;
    maxSessions?: number;
  };
  stats: {
    totalQueued: number;
    totalCompleted: number;
    totalFailed: number;
    lastRunAt: string | null;
  };
  circuit?: {
    state: 'closed' | 'open' | 'half_open';
    failureRate: number;
    sampleSize: number;
    consecutiveFailures: number;
    dominantFailureCategory?: string;
    openedAt?: string;
    nextProbeAt?: string;
  };
  createdAt: string;
  updatedAt: string;
}

/** Payload for POST /api/campaigns and PUT /api/campaigns/:id */
export type CampaignJobOptions = Omit<CampaignView, 'id' | 'status' | 'stats' | 'createdAt' | 'updatedAt'>;

/* ──────────────────────────────────────────────────────────────
   Logs
   ────────────────────────────────────────────────────────────── */
export type LogLevel = 'error' | 'warn' | 'info' | 'debug';
export interface LogEntry {
  ts: string;
  level: LogLevel;
  message: string;
  service?: string;
  /** arbitrary structured metadata */
  meta?: Record<string, unknown>;
}

/* ──────────────────────────────────────────────────────────────
   Schedule
   ────────────────────────────────────────────────────────────── */
export type ScheduleMode = 'cron' | 'interval' | 'once';

export interface ScheduleView {
  id: string;
  name: string;
  /** ID of the campaign this schedule will run */
  campaignId: string;
  /** Denormalised campaign name (for display without a join) */
  campaignName: string;
  enabled: boolean;
  mode: ScheduleMode;
  // mode=cron     : 5-field cron expression  e.g. "0 * * * *" (every hour)
  // mode=interval : milliseconds as decimal string e.g. "300000" (5 minutes)
  // mode=once     : ISO 8601 datetime string       e.g. "2026-10-01T09:00:00Z"
  expression: string;
  nextRunAt: string | null;
  lastRunAt: string | null;
  runCount: number;
  failCount: number;
  createdAt: string;
  updatedAt: string;
}

export type ScheduleJobOptions = Omit<ScheduleView, 'id' | 'nextRunAt' | 'lastRunAt' | 'runCount' | 'failCount' | 'createdAt' | 'updatedAt'>;
