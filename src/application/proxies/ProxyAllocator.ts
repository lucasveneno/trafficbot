import { randomUUID } from 'crypto';
import { ProxyLease, ProxyRecord } from '../../domain/control/ProxyContract';
import { proxyStore } from './ProxyStore';
import { QueueService } from '../../infrastructure/queue/QueueService';
import type { TrafficJobData } from '../../domain/entities/SessionContract';
import { CapacityUnavailable } from '../../domain/entities/CapacityUnavailable';

export class ProxyAllocator {
  // In-memory active leases
  private leases: Map<string, ProxyLease> = new Map();

  async acquire(sessionId: string, _campaignId?: string, durationMinutes = 10, pool?: TrafficJobData['proxyPool']): Promise<{ proxy: ProxyRecord, lease: ProxyLease, password?: string } | undefined> {
    for (const [id, lease] of this.leases) if (Date.parse(lease.expiresAt) <= Date.now()) this.leases.delete(id);
    const proxies: ProxyRecord[] = pool ? pool.map(item => { const url = new URL(item.proxy.host.includes('://') ? item.proxy.host : `http://${item.proxy.host}`); return { id: item.id, protocol: url.protocol.slice(0, -1) as ProxyRecord['protocol'], host: url.hostname, port: item.proxy.port, username: item.proxy.username, enabled: true, status: 'unknown', consecutiveFailures: 0, maxConcurrentLeases: item.maxConcurrentLeases }; }) : await proxyStore.list();
    const available = proxies.filter(p => p.enabled && p.status !== 'unavailable');
    
    if (available.length === 0) { if (pool) throw new Error('Campaign proxy pool unavailable'); return undefined; }

    // Very simple round-robin or random for now, plus least-active priority.
    // Count active leases per proxy
    const counts = new Map<string, number>();
    for (const p of available) counts.set(p.id, 0);
    
    for (const lease of this.leases.values()) {
      if (counts.has(lease.proxyId)) {
        counts.set(lease.proxyId, counts.get(lease.proxyId)! + 1);
      }
    }

    // Pick proxy with lowest count
    available.sort((a, b) => counts.get(a.id)! - counts.get(b.id)!);
    let selected: ProxyRecord | undefined;
    const leaseId = randomUUID();
    const expires = Date.now() + (durationMinutes + 5) * 60000;
    const redis = QueueService.getRedis();
    for (const proxy of available) {
      if (redis) {
        const acquired = await redis.eval(`redis.call('ZREMRANGEBYSCORE', KEYS[1], '-inf', ARGV[1]); if tonumber(ARGV[2]) > 0 and redis.call('ZCARD', KEYS[1]) >= tonumber(ARGV[2]) then return 0 end; redis.call('ZADD', KEYS[1], ARGV[3], ARGV[4]); redis.call('PEXPIRE', KEYS[1], math.max(redis.call('PTTL', KEYS[1]), tonumber(ARGV[3])-tonumber(ARGV[1]))); return 1`, 1, `traffic:proxy-leases:${proxy.id}`, Date.now(), proxy.maxConcurrentLeases || 0, expires, leaseId);
        if (acquired === 1) { selected = proxy; break; }
      } else if (!proxy.maxConcurrentLeases || counts.get(proxy.id)! < proxy.maxConcurrentLeases) { selected = proxy; break; }
    }
    if (!selected) throw new CapacityUnavailable('Proxy capacity exhausted');

    const lease: ProxyLease = {
      leaseId,
      proxyId: selected.id,
      sessionId,
      issuedAt: new Date().toISOString(),
      expiresAt: new Date(expires).toISOString()
    };

    this.leases.set(lease.leaseId, lease);
    
    selected.lastUsedAt = new Date().toISOString();
    if (!pool) await proxyStore.save(selected);

    const password = pool ? pool.find(item => item.id === selected!.id)?.proxy.password : await proxyStore.getPassword(selected.id);

    import('../metrics/MetricsCollector').then(({ MetricsCollector }) => {
      MetricsCollector.emit('proxy.lease_acquired', { proxyId: selected.id, sessionId });
    }).catch(() => {});

    return { proxy: selected, lease, password };
  }

  async release(leaseId: string): Promise<void> {
    const lease = this.leases.get(leaseId);
    if (lease) {
      await QueueService.getRedis()?.zrem(`traffic:proxy-leases:${lease.proxyId}`, leaseId);
      import('../metrics/MetricsCollector').then(({ MetricsCollector }) => {
        MetricsCollector.emit('proxy.lease_released', { proxyId: lease.proxyId, sessionId: lease.sessionId });
      }).catch(() => {});
    }
    this.leases.delete(leaseId);
  }

  async reportSuccess(leaseId: string): Promise<void> {
    const lease = this.leases.get(leaseId);
    if (!lease) return;

    const proxy = await proxyStore.get(lease.proxyId);
    if (!proxy) return;

    proxy.consecutiveFailures = 0;
    proxy.status = 'healthy';
    proxy.lastCheckedAt = new Date().toISOString();
    
    // Simplistic success rate
    proxy.successRate = proxy.successRate !== undefined ? (proxy.successRate * 0.9) + 0.1 : 1;

    await proxyStore.save(proxy);
    this.release(leaseId);
  }

  async reportFailure(leaseId: string): Promise<void> {
    const lease = this.leases.get(leaseId);
    if (!lease) return;

    const proxy = await proxyStore.get(lease.proxyId);
    if (!proxy) return;

    proxy.consecutiveFailures++;
    proxy.lastCheckedAt = new Date().toISOString();
    
    proxy.successRate = proxy.successRate !== undefined ? (proxy.successRate * 0.9) : 0;

    if (proxy.consecutiveFailures >= 5) {
      if (proxy.status !== 'unavailable') {
        import('../metrics/MetricsCollector').then(({ MetricsCollector }) => {
          MetricsCollector.emit('proxy.degraded', { proxyId: proxy.id, metadata: { status: 'unavailable' } });
        }).catch(() => {});
      }
      proxy.status = 'unavailable';
    } else if (proxy.consecutiveFailures >= 2) {
      if (proxy.status !== 'degraded') {
        import('../metrics/MetricsCollector').then(({ MetricsCollector }) => {
          MetricsCollector.emit('proxy.degraded', { proxyId: proxy.id, metadata: { status: 'degraded' } });
        }).catch(() => {});
      }
      proxy.status = 'degraded';
    }

    await proxyStore.save(proxy);
    this.release(leaseId);
  }
}

export const proxyAllocator = new ProxyAllocator();
