import { ControlSnapshot, SessionView, WorkerView } from '../../domain/control/ControlContract';
import { TrafficJobData } from '../../domain/entities/SessionContract';
import { QueueService } from '../../infrastructure/queue/QueueService';
import { WorkerRegistry } from '../../infrastructure/worker/WorkerRegistry';
import { deadline } from '../../infrastructure/lifecycle/deadline';

export interface ControlSource { snapshot(): Promise<ControlSnapshot>; submit(data: TrafficJobData): Promise<string>; }
export function publicUrl(value: string): string {
  try { const url = new URL(value); return `${url.origin}${url.pathname}`; } catch { return '[unavailable]'; }
}
export class RuntimeControlSource implements ControlSource {
  private collecting?: Promise<ControlSnapshot>;
  async submit(data: TrafficJobData): Promise<string> { return QueueService.addSession(data); }
  async snapshot(): Promise<ControlSnapshot> {
    const state: ControlSnapshot = {
      system: { application: 'trafficbot', apiVersion: 1, status: 'degraded', redis: 'unavailable', uptimeSeconds: Math.floor(process.uptime()), platform: process.platform, updatedAt: new Date().toISOString(), counts: { active: 0, queued: 0, completedToday: 0, failed: 0, workers: 0, capacity: 0 } }, workers: [], sessions: [], queues: [],
    };
    if (!QueueService.isDistributedEnabled()) return state;
    if (!this.collecting) this.collecting = this.collect(structuredClone(state)).finally(() => { this.collecting = undefined; });
    try { return await deadline(this.collecting, 2500, 'Controller snapshot'); }
    catch { return state; }
  }
  private async collect(state: ControlSnapshot): Promise<ControlSnapshot> {
    const capabilities = await WorkerRegistry.getAvailableWorkers();
    const entries = await QueueService.managementQueues();
    const sessions: SessionView[] = [];
    for (const { platform, deviceSerial, queue } of entries) {
      const counts = await queue.getJobCounts('wait', 'active', 'completed', 'failed', 'delayed');
      state.queues.push({ id: Buffer.from(queue.name).toString('base64url'), platform, deviceSerial, label: deviceSerial ? `Android · ${capabilities.find(w => w.device?.serial === deviceSerial)?.device?.model || deviceSerial}` : { linux: 'Linux', windows: 'Windows', macos: 'macOS', android: 'Android', ios: 'iOS' }[platform], waiting: counts.wait || 0, active: counts.active || 0, completed: counts.completed || 0, failed: counts.failed || 0, delayed: counts.delayed || 0 });
      const jobs = await queue.getJobs(['wait', 'active', 'completed', 'failed', 'delayed'], 0, 199, false);
      for (const job of jobs) {
        const status = await job.getState();
        if (!['waiting', 'active', 'completed', 'failed', 'delayed'].includes(status)) continue;
        sessions.push({ executionId: job.id, id: Buffer.from(`${queue.name}/${job.id}`).toString('base64url'), status: status === 'waiting' ? 'queued' : status as SessionView['status'], workerId: job.processedBy || null, platform, browser: job.data.requirements?.browser || null,
          profileId: job.data.profileKey || null, persistent: job.data.persistent, proxy: job.data.proxy || job.data.proxyPool ? 'configured' : 'direct', url: publicUrl(job.data.url), createdAt: new Date(job.timestamp).toISOString(), startedAt: job.processedOn ? new Date(job.processedOn).toISOString() : null,
          finishedAt: job.finishedOn ? new Date(job.finishedOn).toISOString() : null, durationMs: job.processedOn ? (job.finishedOn || Date.now()) - job.processedOn : null,
          error: job.failedReason ? 'Session execution failed; inspect the worker logs.' : null, attempts: job.attemptsMade, deviceSerial,
          campaignId: job.data.campaignId, scheduleId: job.data.scheduleId });
      }
    }
    const { checkCompatibility, APPLICATION_VERSION } = require('../../domain/Protocol');
    const { ReleaseManager } = require('../../infrastructure/updater/ReleaseManager');
    const latestVersion = ReleaseManager.getMetadata(APPLICATION_VERSION)?.latestVersion;

    const workers: WorkerView[] = capabilities.map(worker => {
      const active = sessions.filter(session => session.status === 'active' && session.workerId === worker.workerId).length;
      return {
        id: worker.workerId, platform: worker.platform, architecture: worker.architecture,
        runtime: worker.mobile ? 'device' : worker.containerized ? 'container' : 'native',
        browsers: worker.browsers.map(({ browser, version }) => ({ browser, version })),
        capacity: worker.maxConcurrentSessions, active, heartbeatAt: worker.heartbeatAt || null,
        health: active >= worker.maxConcurrentSessions ? 'busy' : 'healthy',
        device: worker.device,
        status: worker.status || (active >= worker.maxConcurrentSessions ? 'busy' : 'online'),
        version: worker.version || null,
        protocolVersion: worker.protocolVersion || null,
        compatibility: checkCompatibility(worker.protocolVersion, worker.version, latestVersion),
        rollbackAvailable: worker.rollbackAvailable ?? false,
        rollbackVersion: worker.rollbackVersion ?? null,
      };
    });
    const midnight = new Date(); midnight.setUTCHours(0, 0, 0, 0);
    return { ...state, workers, sessions: sessions.sort((a, b) => b.createdAt.localeCompare(a.createdAt)).slice(0, 500), system: { ...state.system, status: 'healthy', redis: 'ready', counts: {
      active: state.queues.reduce((sum, q) => sum + q.active, 0), queued: state.queues.reduce((sum, q) => sum + q.waiting + q.delayed, 0), completedToday: sessions.filter(s => s.status === 'completed' && s.finishedAt && s.finishedAt >= midnight.toISOString()).length,
      failed: state.queues.reduce((sum, q) => sum + q.failed, 0), workers: workers.length, capacity: workers.reduce((sum, w) => sum + w.capacity, 0),
    } } };
  }
}
