import { AppError } from './errors.js';

export interface RetryOptions {
  retries?: number;
  baseDelayMs?: number;
  maxDelayMs?: number;
  onRetry?: (attempt: number, err: unknown, delayMs: number) => void;
}

const sleep = (ms: number): Promise<void> =>
  new Promise((resolve) => setTimeout(resolve, ms));

/**
 * Retry an async operation with exponential backoff + jitter.
 * Only retries when the thrown error is marked `retryable`.
 */
export async function withRetry<T>(
  fn: () => Promise<T>,
  options: RetryOptions = {},
): Promise<T> {
  const retries = options.retries ?? 3;
  const base = options.baseDelayMs ?? 300;
  const max = options.maxDelayMs ?? 8_000;

  let attempt = 0;
  // eslint-disable-next-line no-constant-condition
  while (true) {
    try {
      return await fn();
    } catch (err) {
      const retryable = err instanceof AppError ? err.retryable : false;
      if (!retryable || attempt >= retries) throw err;
      const backoff = Math.min(max, base * 2 ** attempt);
      const jitter = Math.floor(Math.random() * (backoff / 2));
      const delay = backoff + jitter;
      options.onRetry?.(attempt + 1, err, delay);
      await sleep(delay);
      attempt += 1;
    }
  }
}
