import { ScheduleView } from '../../domain/control/ControlContract';
import { ControlSource } from '../api/ControlState';
import { campaignStore } from '../campaigns/CampaignStore';
import { ScheduleStore } from './ScheduleStore';
import { nextCronDate, cronMatches, parseCron } from './CronEvaluator';
import { logger } from '../../infrastructure/logging/logger';
import { campaignJob } from '../campaigns/CampaignJob';

const TICK_MS = 30_000; // check every 30 s
const ONCE_GRACE_MS = 60_000; // fire "once" schedules up to 60 s late

/**
 * ScheduleRunner — walks enabled schedules on every tick and submits
 * a session to the queue when a schedule is due.
 *
 * Runs entirely in the controller process; no additional infrastructure.
 */
export class ScheduleRunner {
  private timer?: NodeJS.Timeout;
  private initialTimer?: NodeJS.Timeout;
  private running = false;

  constructor(
    private source: ControlSource,
    private store: ScheduleStore,
  ) {}

  start(): void {
    if (this.timer || this.initialTimer) return;
    // Align first tick to the next whole minute boundary for cron accuracy
    const msToNextMinute = 60_000 - (Date.now() % 60_000);
    this.initialTimer = setTimeout(() => {
      this.initialTimer = undefined;
      void this.tick();
      this.timer = setInterval(() => void this.tick(), TICK_MS);
    }, Math.min(msToNextMinute, TICK_MS));
  }

  stop(): void {
    if (this.initialTimer) { clearTimeout(this.initialTimer); this.initialTimer = undefined; }
    if (this.timer) { clearInterval(this.timer); this.timer = undefined; }
  }

  /** Compute the next fire time for a schedule from now. */
  static computeNextRunAt(schedule: Pick<ScheduleView, 'mode' | 'expression'>): string | null {
    const now = new Date();
    try {
      switch (schedule.mode) {
        case 'cron':
          return nextCronDate(schedule.expression, now).toISOString();
        case 'interval': {
          const ms = Number(schedule.expression);
          if (!Number.isFinite(ms) || ms < 1000) return null;
          return new Date(Date.now() + ms).toISOString();
        }
        case 'once':
          return new Date(schedule.expression) > now ? schedule.expression : null;
      }
    } catch (e) {
      logger.warn('ScheduleRunner: invalid expression', { error: String(e) });
      return null;
    }
  }

  private async tick(): Promise<void> {
    if (this.running) return;
    this.running = true;
    try {
      const schedules = await this.store.list();
      const now = new Date();

      for (const schedule of schedules) {
        if (!schedule.enabled) continue;
        if (!this.isDue(schedule, now)) continue;

        logger.info('ScheduleRunner: firing schedule', { id: schedule.id, name: schedule.name });
        await this.fire(schedule);
      }
    } catch (e) {
      logger.error('ScheduleRunner: tick error', { error: String(e) });
    } finally {
      this.running = false;
    }
  }

  private isDue(schedule: ScheduleView, now: Date): boolean {
    try {
      switch (schedule.mode) {
        case 'cron': {
          if (schedule.lastRunAt?.slice(0, 16) === now.toISOString().slice(0, 16)) return false;
          const fields = parseCron(schedule.expression);
          // Allow firing if we're within the current minute window
          return cronMatches(fields, now);
        }
        case 'interval': {
          const ms = Number(schedule.expression);
          if (!Number.isFinite(ms) || ms < 1000) return false;
          if (!schedule.lastRunAt) return true; // never run — fire immediately
          return Date.now() - new Date(schedule.lastRunAt).getTime() >= ms;
        }
        case 'once': {
          if (schedule.runCount > 0) return false; // already ran
          const target = new Date(schedule.expression).getTime();
          const delta = now.getTime() - target;
          return delta >= 0 && delta <= ONCE_GRACE_MS;
        }
      }
    } catch { return false; }
  }

  private async fire(schedule: ScheduleView): Promise<void> {
    const now = new Date().toISOString();
    try {
      // Load campaign to get job parameters
      const campaign = await campaignStore.get(schedule.campaignId);
      if (!campaign) {
        logger.warn('ScheduleRunner: campaign not found', { scheduleId: schedule.id, campaignId: schedule.campaignId });
        await this.store.update(schedule.id, { failCount: schedule.failCount + 1, lastRunAt: now, updatedAt: now });
        return;
      }

      const { circuitBreakerService } = await import('../campaigns/CircuitBreakerService');
      const canExecute = await circuitBreakerService.canExecute(campaign.id);
      if (!canExecute) {
        logger.info('ScheduleRunner: skipping due to open circuit breaker', { campaignId: campaign.id });
        return;
      }

      if (campaign.status === 'paused') {
        logger.info('ScheduleRunner: campaign paused, skipping', { campaignId: campaign.id });
        return;
      }

      // Submit to queue
      const jobId = await this.source.submit({
        ...campaignJob(campaign, schedule.runCount),
        scheduleId: schedule.id,
      });

      import('../metrics/MetricsCollector').then(({ MetricsCollector }) => {
        MetricsCollector.emit('session.queued', { campaignId: campaign.id, sessionId: String(jobId) });
      }).catch(() => {});

      // Advance counters and nextRunAt
      const nextRunAt = ScheduleRunner.computeNextRunAt(schedule);
      await this.store.update(schedule.id, {
        runCount: schedule.runCount + 1,
        lastRunAt: now,
        nextRunAt,
        // Disable "once" schedules after they fire
        enabled: schedule.mode !== 'once',
        updatedAt: now,
      });

      logger.info('ScheduleRunner: session submitted', { scheduleId: schedule.id, campaignId: campaign.id, nextRunAt });
    } catch (e) {
      logger.error('ScheduleRunner: fire error', { scheduleId: schedule.id, error: String(e) });
      await this.store.update(schedule.id, { failCount: schedule.failCount + 1, lastRunAt: now, updatedAt: now }).catch(() => undefined);
    }
  }
}
