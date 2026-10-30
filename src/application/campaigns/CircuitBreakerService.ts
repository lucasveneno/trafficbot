import { CircuitBreakerConfig, PersistedCircuitState, SessionFailureCategory } from '../../domain/control/CircuitBreakerContract';
import { circuitStore } from './CircuitStore';
import { logger } from '../../infrastructure/logging/logger';
import { EventEmitter } from 'events';

export class CircuitBreakerService extends EventEmitter {
  private config: CircuitBreakerConfig = {
    enabled: true,
    minimumSampleSize: 10,
    windowSeconds: 300,
    failureRateThreshold: 0.6,
    consecutiveFailureThreshold: 5,
    cooldownSeconds: 60,
    halfOpenProbeCount: 2,
  };

  // In-memory rolling window of failure metrics
  // key: campaignId, value: array of { success: boolean, timestamp: number }
  private rollingWindows: Map<string, Array<{ success: boolean; timestamp: number }>> = new Map();
  // In-memory probe counts for half-open state
  private activeProbes: Map<string, number> = new Map();

  async canExecute(campaignId: string): Promise<boolean> {
    if (!this.config.enabled) return true;
    
    let state = await circuitStore.get(campaignId);
    if (!state) return true;

    if (state.state === 'open') {
      if (!state.openedAt) return false; // invalid state, keep closed
      const elapsedSeconds = (Date.now() - new Date(state.openedAt).getTime()) / 1000;
      if (elapsedSeconds >= this.config.cooldownSeconds) {
        // Cooldown expired, transition to half-open
        state.state = 'half_open';
        state.nextProbeAt = undefined;
        this.activeProbes.set(campaignId, 0);
        await circuitStore.save(state);
        logger.info(`Circuit breaker HALF_OPEN for campaign ${campaignId}`);
        this.emit('campaign.circuit.half_open', this.buildEventPayload(state));
        return true; // We allow a probe
      }
      return false; // Still cooling down
    }

    if (state.state === 'half_open') {
      const currentProbes = this.activeProbes.get(campaignId) || 0;
      if (currentProbes < this.config.halfOpenProbeCount) {
        this.activeProbes.set(campaignId, currentProbes + 1);
        return true;
      }
      return false; // Waiting for probes to return
    }

    return true; // closed
  }

  async reportSuccess(campaignId: string): Promise<void> {
    this.recordOutcome(campaignId, true);
    let state = await circuitStore.get(campaignId);
    if (!state) return;

    if (state.state === 'half_open') {
      // Probes succeeded! Close the circuit.
      state.state = 'closed';
      state.consecutiveFailures = 0;
      state.openedAt = undefined;
      state.nextProbeAt = undefined;
      this.activeProbes.delete(campaignId);
      await circuitStore.save(state);
      logger.info(`Circuit breaker CLOSED for campaign ${campaignId}`);
      this.emit('campaign.circuit.closed', this.buildEventPayload(state));
      import('../metrics/MetricsCollector').then(({ MetricsCollector }) => {
        MetricsCollector.emit('circuit.closed', { campaignId });
      }).catch(() => {});
    } else if (state.state === 'closed') {
      if (state.consecutiveFailures > 0) {
        state.consecutiveFailures = 0;
        await circuitStore.save(state);
      }
    }
  }

  async reportFailure(campaignId: string, category: SessionFailureCategory): Promise<void> {
    this.recordOutcome(campaignId, false);
    
    let state = await circuitStore.get(campaignId);
    if (!state) {
      state = {
        campaignId,
        state: 'closed',
        consecutiveFailures: 0,
        updatedAt: new Date().toISOString()
      };
    }

    if (state.state === 'half_open') {
      // Probe failed. Immediately reopen.
      await this.openCircuit(state, category);
      return;
    }

    if (state.state === 'closed') {
      state.consecutiveFailures++;
      state.lastFailureCategory = category;

      if (state.consecutiveFailures >= this.config.consecutiveFailureThreshold) {
        await this.openCircuit(state, category);
        return;
      }

      // Check rolling failure rate
      const window = this.getValidWindow(campaignId);
      if (window.length >= this.config.minimumSampleSize) {
        const failures = window.filter(w => !w.success).length;
        const rate = failures / window.length;
        if (rate >= this.config.failureRateThreshold) {
          await this.openCircuit(state, category);
          return;
        }
      }

      await circuitStore.save(state);
    }
  }

  private async openCircuit(state: PersistedCircuitState, category: SessionFailureCategory) {
    state.state = 'open';
    state.openedAt = new Date().toISOString();
    state.nextProbeAt = new Date(Date.now() + this.config.cooldownSeconds * 1000).toISOString();
    state.lastFailureCategory = category;
    this.activeProbes.delete(state.campaignId);
    await circuitStore.save(state);
    logger.warn(`Circuit breaker OPENED for campaign ${state.campaignId} due to ${category}`);
    this.emit('campaign.circuit.opened', this.buildEventPayload(state));
    import('../metrics/MetricsCollector').then(({ MetricsCollector }) => {
      MetricsCollector.emit('circuit.opened', { campaignId: state.campaignId, failureReason: category });
    }).catch(() => {});
  }

  async manualResume(campaignId: string): Promise<void> {
    let state = await circuitStore.get(campaignId);
    if (state && state.state !== 'closed') {
      state.state = 'closed';
      state.consecutiveFailures = 0;
      state.openedAt = undefined;
      state.nextProbeAt = undefined;
      this.activeProbes.delete(campaignId);
      this.rollingWindows.delete(campaignId);
      await circuitStore.save(state);
      logger.info(`Circuit breaker MANUALLY RESUMED for campaign ${campaignId}`);
      this.emit('campaign.circuit.manual_resume', this.buildEventPayload(state));
      import('../metrics/MetricsCollector').then(({ MetricsCollector }) => {
        MetricsCollector.emit('circuit.closed', { campaignId });
      }).catch(() => {});
    }
  }

  buildEventPayload(state: PersistedCircuitState) {
    const window = this.getValidWindow(state.campaignId);
    const failures = window.filter(w => !w.success).length;
    return {
      campaignId: state.campaignId,
      state: state.state,
      failureRate: window.length > 0 ? failures / window.length : 0,
      sampleSize: window.length,
      consecutiveFailures: state.consecutiveFailures,
      dominantFailureCategory: state.lastFailureCategory,
      openedAt: state.openedAt,
      nextProbeAt: state.nextProbeAt
    };
  }

  private recordOutcome(campaignId: string, success: boolean) {
    const window = this.getValidWindow(campaignId);
    window.push({ success, timestamp: Date.now() });
    this.rollingWindows.set(campaignId, window);
  }

  private getValidWindow(campaignId: string) {
    const now = Date.now();
    const cutoff = now - (this.config.windowSeconds * 1000);
    const window = this.rollingWindows.get(campaignId) || [];
    return window.filter(w => w.timestamp >= cutoff);
  }
}

export const circuitBreakerService = new CircuitBreakerService();
