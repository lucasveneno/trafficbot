export type RetryDecision = 'retry' | 'abort';

export interface RetryOptions {
  maxAttempts: number;
  baseDelayMs: number;
}

export const defaultRetryOptions: RetryOptions = {
  maxAttempts: 3,
  baseDelayMs: 500,
};

/** Returns 'retry' for transient browser errors, 'abort' for permanent ones. */
export function classifyForRetry(error: unknown): RetryDecision {
  if (!error) return 'abort';
  const message = error instanceof Error ? error.message : String(error);
  const lower = message.toLowerCase();

  // Never retry these — they are permanent/config errors
  if (
    lower.includes('not initialized') ||
    lower.includes('cancelled') ||
    lower.includes('invalid configuration') ||
    lower.includes('unsupported') ||
    lower.includes('authentication') ||
    lower.includes('auth error') ||
    lower.includes('navigation blocked') // scope violation = config error
  ) return 'abort';

  // Retry transient failures
  if (
    lower.includes('timeout') ||
    lower.includes('net::err_name_not_resolved') ||
    lower.includes('detached') ||
    lower.includes('context destroyed') ||
    lower.includes('session closed') ||
    lower.includes('target closed') ||
    lower.includes('disconnected')
  ) return 'retry';

  return 'abort';
}

/**
 * Executes `fn` with exponential backoff retry.
 * Does NOT retry on abort-classified errors.
 */
export async function withRetry<T>(
  fn: () => Promise<T>,
  options: RetryOptions = defaultRetryOptions,
  signal?: AbortSignal
): Promise<T> {
  let lastError: unknown;
  for (let attempt = 0; attempt < options.maxAttempts; attempt++) {
    if (signal?.aborted) throw new Error('Cancelled');
    try {
      return await fn();
    } catch (e) {
      lastError = e;
      if (classifyForRetry(e) === 'abort') throw e;
      if (attempt < options.maxAttempts - 1) {
        const delay = options.baseDelayMs * Math.pow(2, attempt);
        await new Promise(r => setTimeout(r, delay));
      }
    }
  }
  throw lastError;
}
