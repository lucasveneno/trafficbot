import { logger } from '../logging/logger';

export interface TrafficMetrics {
  totalSessions: number;
  successfulSessions: number;
  failedSessions: number;
  totalDurationMs: number;
  averageDurationMs: number;
  lastSessionStatus: 'success' | 'failure' | 'none';
  activeSessions: number;
  lastFailureKind?: 'http' | 'timeout' | 'other';
  lastNavigation?: { status: number; finalUrl: string };
}

export class MetricsService {
  private static instance: MetricsService;
  private metrics: TrafficMetrics = {
    totalSessions: 0,
    successfulSessions: 0,
    failedSessions: 0,
    totalDurationMs: 0,
    averageDurationMs: 0,
    lastSessionStatus: 'none',
    activeSessions: 0,
  };

  private constructor() {}

  public static getInstance(): MetricsService {
    if (!MetricsService.instance) {
      MetricsService.instance = new MetricsService();
    }
    return MetricsService.instance;
  }

  public trackSessionStart(): void {
    this.metrics.totalSessions++;
    this.metrics.activeSessions++;
    logger.debug('Metric: Session started', { active: this.metrics.activeSessions });
  }

  public trackSessionEnd(success: boolean, durationMs: number, navigation?: { status: number; finalUrl: string }, failure?: unknown): void {
    this.metrics.activeSessions--;
    this.metrics.lastNavigation = navigation;
    const message = failure instanceof Error ? failure.message : '';
    this.metrics.lastFailureKind = success ? undefined : /HTTP failure/.test(message) ? 'http' : /timeout|timed out/i.test(message) ? 'timeout' : 'other';
    if (success) {
      this.metrics.successfulSessions++;
      this.metrics.lastSessionStatus = 'success';
    } else {
      this.metrics.failedSessions++;
      this.metrics.lastSessionStatus = 'failure';
    }
    
    this.metrics.totalDurationMs += durationMs;
    this.metrics.averageDurationMs = Math.floor(this.metrics.totalDurationMs / (this.metrics.successfulSessions + this.metrics.failedSessions));

    logger.debug('Metric: Session ended', { 
      success, 
      durationMs, 
      total: this.metrics.totalSessions,
      failed: this.metrics.failedSessions 
    });
  }

  public trackBrowserLaunch(durationMs: number): void {
    logger.debug('Metric: browser.launch', { durationMs });
    try {
      const { MetricsCollector } = require('../../application/metrics/MetricsCollector');
      MetricsCollector.emit('browser.launch', { durationMs });
    } catch (e) {}
  }

  public trackBrowserNavigation(durationMs: number, success: boolean, url?: string): void {
    logger.debug('Metric: browser.navigation', { durationMs, success, url });
    try {
      const { MetricsCollector } = require('../../application/metrics/MetricsCollector');
      MetricsCollector.emit('browser.navigation', { durationMs, metadata: { success, url } });
    } catch (e) {}
  }

  public trackBrowserPageCrash(engine: string): void {
    logger.debug('Metric: browser.page.crashed', { engine });
    try {
      const { MetricsCollector } = require('../../application/metrics/MetricsCollector');
      MetricsCollector.emit('browser.page.crashed', { metadata: { engine } });
    } catch (e) {}
  }

  public trackBrowserSelectorTimeout(selector: string): void {
    logger.debug('Metric: browser.selector.timeout', { selector });
    try {
      const { MetricsCollector } = require('../../application/metrics/MetricsCollector');
      MetricsCollector.emit('browser.selector.timeout', { metadata: { selector } });
    } catch (e) {}
  }

  public trackAdbDisconnect(deviceSerial: string): void {
    logger.debug('Metric: android.adb.disconnect', { deviceSerial });
    try {
      const { MetricsCollector } = require('../../application/metrics/MetricsCollector');
      MetricsCollector.emit('android.adb.disconnect', { metadata: { deviceSerial } });
    } catch (e) {}
  }

  public getMetrics(): TrafficMetrics {
    return { ...this.metrics };
  }

  public printSummary(): void {
    console.clear();
    console.log('------------------------------------------------');
    console.log('   VENENO TRAFFIC BOT V2 - LIVE DASHBOARD   ');
    console.log('------------------------------------------------');
    console.table({
      'Active Sessions': this.metrics.activeSessions,
      'Total Sessions': this.metrics.totalSessions,
      'Success Rate': `${((this.metrics.successfulSessions / Math.max(1, this.metrics.totalSessions - this.metrics.activeSessions)) * 100).toFixed(1)}%`,
      'Avg Duration': `${(this.metrics.averageDurationMs / 1000).toFixed(1)}s`,
      'Last Status': this.metrics.lastSessionStatus.toUpperCase(),
    });
    console.log('------------------------------------------------');
  }
}
