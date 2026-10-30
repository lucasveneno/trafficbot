import { proxyAllocator, ProxyAllocator } from './ProxyAllocator';
import { QueueService } from '../../infrastructure/queue/QueueService';
import { randomUUID } from 'crypto';
import { proxyStore } from './ProxyStore';
import { ProxyRecord } from '../../domain/control/ProxyContract';

jest.mock('./ProxyStore', () => ({
  proxyStore: {
    list: jest.fn(),
    get: jest.fn(),
    save: jest.fn(),
    getPassword: jest.fn(),
  }
}));

describe('ProxyAllocator', () => {
  let mockList: jest.Mock;
  let mockGet: jest.Mock;
  let mockSave: jest.Mock;
  
  beforeEach(() => {
    mockList = proxyStore.list as jest.Mock;
    mockGet = proxyStore.get as jest.Mock;
    mockSave = proxyStore.save as jest.Mock;
    
    // reset map
    // @ts-ignore
    proxyAllocator.leases.clear();
  });

  const makeProxy = (id: string, enabled = true, status: ProxyRecord['status'] = 'healthy'): ProxyRecord => ({
    id, protocol: 'http', host: '1.1.1.1', port: 80, enabled, status, consecutiveFailures: 0
  });

  it('ignores disabled and unavailable proxies', async () => {
    mockList.mockResolvedValue([
      makeProxy('p1', false, 'healthy'),
      makeProxy('p2', true, 'unavailable'),
      makeProxy('p3', true, 'healthy')
    ]);
    
    const result = await proxyAllocator.acquire('session1');
    expect(result?.proxy.id).toBe('p3');
  });

  it('releases lease correctly', async () => {
    mockList.mockResolvedValue([makeProxy('p1')]);
    const result = await proxyAllocator.acquire('session1');
    expect(result).toBeDefined();
    
    // @ts-ignore
    expect(proxyAllocator.leases.size).toBe(1);
    
    await proxyAllocator.release(result!.lease.leaseId);
    
    // @ts-ignore
    expect(proxyAllocator.leases.size).toBe(0);
  });
  it('enforces configured capacity and allows a new lease after release', async () => {
    mockList.mockResolvedValue([{ ...makeProxy('limited'), maxConcurrentLeases: 1 }]);
    const first = await proxyAllocator.acquire('first');
    await expect(proxyAllocator.acquire('second')).rejects.toThrow('capacity');
    await proxyAllocator.release(first!.lease.leaseId);
    expect((await proxyAllocator.acquire('second'))?.proxy.id).toBe('limited');
  });
  (process.env.RUN_REDIS_TESTS === '1' ? it : it.skip)('shares capacity atomically across allocator instances', async () => {
    const id = randomUUID();
    mockList.mockResolvedValue([{ ...makeProxy(id), maxConcurrentLeases: 1 }]);
    await QueueService.initialize(process.env.REDIS_TEST_URL!, 3000);
    const first = new ProxyAllocator(), second = new ProxyAllocator();
    try {
      const results = await Promise.allSettled([first.acquire('one'), second.acquire('two')]);
      expect(results.filter(r => r.status === 'fulfilled')).toHaveLength(1);
      expect(results.filter(r => r.status === 'rejected')).toHaveLength(1);
      for (const result of results) if (result.status === 'fulfilled') { await first.release(result.value!.lease.leaseId); await second.release(result.value!.lease.leaseId); }
      const lease = await second.acquire('three'); expect(lease).toBeDefined(); await second.release(lease!.lease.leaseId);
    } finally { await QueueService.getRedis()?.del(`traffic:proxy-leases:${id}`); await QueueService.close(); }
  });

  it('success updates health', async () => {
    mockList.mockResolvedValue([makeProxy('p1', true, 'degraded')]);
    mockGet.mockResolvedValue(makeProxy('p1', true, 'degraded'));
    
    const result = await proxyAllocator.acquire('session1');
    await proxyAllocator.reportSuccess(result!.lease.leaseId);
    
    expect(mockSave).toHaveBeenCalledWith(expect.objectContaining({
      id: 'p1',
      status: 'healthy',
      consecutiveFailures: 0
    }));
  });

  it('repeated failure degrades health', async () => {
    const proxy = makeProxy('p1');
    proxy.consecutiveFailures = 1;
    mockList.mockResolvedValue([proxy]);
    mockGet.mockResolvedValue(proxy);
    
    const result = await proxyAllocator.acquire('session1');
    await proxyAllocator.reportFailure(result!.lease.leaseId);
    
    expect(mockSave).toHaveBeenCalledWith(expect.objectContaining({
      id: 'p1',
      status: 'degraded',
      consecutiveFailures: 2
    }));
  });
});
