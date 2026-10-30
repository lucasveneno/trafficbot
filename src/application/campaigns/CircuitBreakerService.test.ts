import { CircuitBreakerService } from './CircuitBreakerService';
import { circuitStore } from './CircuitStore';
import { randomUUID } from 'crypto';

jest.mock('./CircuitStore', () => ({
  circuitStore: {
    get: jest.fn(),
    save: jest.fn(),
    ensureDir: jest.fn(),
  }
}));

describe('CircuitBreakerService', () => {
  let service: CircuitBreakerService;
  let campaignId: string;
  let storeGet: jest.Mock;
  let storeSave: jest.Mock;

  beforeEach(() => {
    service = new CircuitBreakerService();
    campaignId = randomUUID();
    storeGet = circuitStore.get as jest.Mock;
    storeSave = circuitStore.save as jest.Mock;
    storeGet.mockResolvedValue(undefined); // default
  });

  afterEach(() => {
    jest.clearAllMocks();
  });

  it('starts closed', async () => {
    expect(await service.canExecute(campaignId)).toBe(true);
  });

  it('opens after consecutive failure threshold', async () => {
    storeGet.mockResolvedValue({ campaignId, state: 'closed', consecutiveFailures: 0 });
    
    // Config: consecutiveFailureThreshold is 5
    for (let i = 0; i < 4; i++) {
      await service.reportFailure(campaignId, 'proxy_unavailable');
    }
    
    storeGet.mockResolvedValue({ campaignId, state: 'closed', consecutiveFailures: 4 });
    await service.reportFailure(campaignId, 'proxy_unavailable');
    
    expect(storeSave).toHaveBeenCalledWith(expect.objectContaining({
      state: 'open',
      consecutiveFailures: 5,
      lastFailureCategory: 'proxy_unavailable'
    }));
  });

  it('does not enqueue sessions while open', async () => {
    storeGet.mockResolvedValue({ campaignId, state: 'open', openedAt: new Date().toISOString() });
    expect(await service.canExecute(campaignId)).toBe(false);
  });

  it('transitions to half-open after cooldown', async () => {
    const openedAt = new Date(Date.now() - 61 * 1000).toISOString(); // 61s ago
    storeGet.mockResolvedValue({ campaignId, state: 'open', openedAt });
    
    expect(await service.canExecute(campaignId)).toBe(true); // First probe allowed
    expect(storeSave).toHaveBeenCalledWith(expect.objectContaining({ state: 'half_open' }));
  });

  it('limits half-open probes', async () => {
    storeGet.mockResolvedValue({ campaignId, state: 'half_open' });
    
    // Half open probe count is 2
    expect(await service.canExecute(campaignId)).toBe(true); // 1
    expect(await service.canExecute(campaignId)).toBe(true); // 2
    expect(await service.canExecute(campaignId)).toBe(false); // 3 (denied)
  });

  it('closes after successful probes', async () => {
    storeGet.mockResolvedValue({ campaignId, state: 'half_open' });
    
    await service.reportSuccess(campaignId);
    
    expect(storeSave).toHaveBeenCalledWith(expect.objectContaining({
      state: 'closed',
      consecutiveFailures: 0
    }));
  });

  it('reopens after failed probe', async () => {
    storeGet.mockResolvedValue({ campaignId, state: 'half_open' });
    
    await service.reportFailure(campaignId, 'target_unavailable');
    
    expect(storeSave).toHaveBeenCalledWith(expect.objectContaining({
      state: 'open'
    }));
  });

  it('manual resume works', async () => {
    storeGet.mockResolvedValue({ campaignId, state: 'open' });
    await service.manualResume(campaignId);
    expect(storeSave).toHaveBeenCalledWith(expect.objectContaining({ state: 'closed' }));
  });

});
