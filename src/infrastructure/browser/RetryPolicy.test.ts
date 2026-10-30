import { classifyForRetry, withRetry } from './RetryPolicy';

describe('RetryPolicy', () => {
  describe('classifyForRetry', () => {
    it('returns abort for falsy errors', () => {
      expect(classifyForRetry(null)).toBe('abort');
      expect(classifyForRetry(undefined)).toBe('abort');
    });

    it('returns abort for permanent / configuration errors', () => {
      expect(classifyForRetry(new Error('Engine not initialized'))).toBe('abort');
      expect(classifyForRetry(new Error('Session cancelled'))).toBe('abort');
      expect(classifyForRetry(new Error('Invalid configuration provided'))).toBe('abort');
      expect(classifyForRetry(new Error('Feature unsupported'))).toBe('abort');
      expect(classifyForRetry(new Error('Authentication failed'))).toBe('abort');
      expect(classifyForRetry(new Error('Proxy auth error'))).toBe('abort');
      expect(classifyForRetry(new Error('Navigation blocked: destination outside configured origin'))).toBe('abort');
    });

    it('returns retry for transient browser errors', () => {
      expect(classifyForRetry(new Error('Navigation timeout exceeded'))).toBe('retry');
      expect(classifyForRetry(new Error('net::ERR_NAME_NOT_RESOLVED'))).toBe('retry');
      expect(classifyForRetry(new Error('Node is detached from document'))).toBe('retry');
      expect(classifyForRetry(new Error('Execution context destroyed'))).toBe('retry');
      expect(classifyForRetry(new Error('Session closed'))).toBe('retry');
      expect(classifyForRetry(new Error('Target closed'))).toBe('retry');
      expect(classifyForRetry(new Error('DevTools disconnected'))).toBe('retry');
    });

    it('returns abort for other unclassified errors', () => {
      expect(classifyForRetry(new Error('Unexpected arbitrary syntax error'))).toBe('abort');
    });
  });

  describe('withRetry', () => {
    it('returns result when operation succeeds on first attempt', async () => {
      const fn = jest.fn().mockResolvedValue('success');
      const result = await withRetry(fn);
      expect(result).toBe('success');
      expect(fn).toHaveBeenCalledTimes(1);
    });

    it('retries on retryable errors and returns result when eventual attempt succeeds', async () => {
      const fn = jest.fn()
        .mockRejectedValueOnce(new Error('Navigation timeout'))
        .mockResolvedValueOnce('eventual success');
      const result = await withRetry(fn, { maxAttempts: 3, baseDelayMs: 10 });
      expect(result).toBe('eventual success');
      expect(fn).toHaveBeenCalledTimes(2);
    });

    it('aborts immediately without retry when error is permanent', async () => {
      const fn = jest.fn().mockRejectedValue(new Error('Engine not initialized'));
      await expect(withRetry(fn, { maxAttempts: 3, baseDelayMs: 10 })).rejects.toThrow('Engine not initialized');
      expect(fn).toHaveBeenCalledTimes(1);
    });

    it('throws after reaching maxAttempts on persistent retryable error', async () => {
      const fn = jest.fn().mockRejectedValue(new Error('target closed'));
      await expect(withRetry(fn, { maxAttempts: 3, baseDelayMs: 10 })).rejects.toThrow('target closed');
      expect(fn).toHaveBeenCalledTimes(3);
    });

    it('throws when abort signal is already aborted', async () => {
      const controller = new AbortController();
      controller.abort();
      const fn = jest.fn().mockResolvedValue('ok');
      await expect(withRetry(fn, { maxAttempts: 3, baseDelayMs: 10 }, controller.signal)).rejects.toThrow('Cancelled');
      expect(fn).not.toHaveBeenCalled();
    });
  });
});
