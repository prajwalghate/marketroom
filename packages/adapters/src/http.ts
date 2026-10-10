/**
 * HTTP primitives shared by adapters.
 *
 * Centralised so timeout, retry and error-shaping behave identically across
 * venues, and so no adapter is tempted to call `fetch` directly.
 */

const DEFAULT_TIMEOUT_MS = 10_000;
const DEFAULT_RETRIES = 2;

export interface RequestOptions {
  readonly timeoutMs?: number;
  readonly retries?: number;
  readonly signal?: AbortSignal;
  /** Next.js fetch cache hint. Ignored outside Next. */
  readonly revalidate?: number;
}

export class HttpError extends Error {
  constructor(
    readonly status: number,
    readonly url: string,
    readonly body: string,
  ) {
    super(`HTTP ${status} for ${url}`);
    this.name = 'HttpError';
  }
}

const sleep = (ms: number) => new Promise((resolve) => setTimeout(resolve, ms));

/** Retry on transport failures and 5xx/429 only — never on a 4xx we caused. */
function isRetryable(error: unknown): boolean {
  if (error instanceof HttpError) {
    return error.status >= 500 || error.status === 429;
  }
  // AbortError from a caller-supplied signal must not be retried.
  return error instanceof Error && error.name !== 'AbortError';
}

async function once(url: string, init: RequestInit, options: RequestOptions): Promise<unknown> {
  // An `abort` listener only hears aborts that happen *after* it is attached.
  // A request started once a caller's deadline has already passed would never
  // hear it, and would run its full timeout and retries instead — which is how
  // a nine-second measurement deadline once stretched a page past sixty.
  if (options.signal?.aborted) {
    throw options.signal.reason instanceof Error
      ? options.signal.reason
      : Object.assign(new Error('Aborted'), { name: 'AbortError' });
  }

  const timeout = new AbortController();
  const timer = setTimeout(() => timeout.abort(), options.timeoutMs ?? DEFAULT_TIMEOUT_MS);

  // Combine caller cancellation with our timeout.
  const onCallerAbort = () => timeout.abort();
  options.signal?.addEventListener('abort', onCallerAbort, { once: true });

  try {
    const response = await fetch(url, {
      ...init,
      signal: timeout.signal,
      ...(options.revalidate !== undefined ? { next: { revalidate: options.revalidate } } : {}),
    } as RequestInit);

    if (!response.ok) {
      throw new HttpError(response.status, url, await response.text().catch(() => ''));
    }
    return await response.json();
  } finally {
    clearTimeout(timer);
    options.signal?.removeEventListener('abort', onCallerAbort);
  }
}

async function withRetry(url: string, init: RequestInit, options: RequestOptions) {
  const attempts = (options.retries ?? DEFAULT_RETRIES) + 1;
  let lastError: unknown;

  for (let attempt = 0; attempt < attempts; attempt += 1) {
    try {
      return await once(url, init, options);
    } catch (error) {
      lastError = error;
      // A caller that has given up is not served by a retry.
      if (attempt === attempts - 1 || !isRetryable(error) || options.signal?.aborted) break;
      // Exponential backoff with jitter, so two clients retrying don't sync up.
      await sleep(2 ** attempt * 250 + Math.random() * 100);
    }
  }
  throw lastError;
}

export const postJson = <T = unknown>(
  url: string,
  body: unknown,
  options: RequestOptions = {},
): Promise<T> =>
  withRetry(
    url,
    {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify(body),
    },
    options,
  ) as Promise<T>;

export const getJson = <T = unknown>(url: string, options: RequestOptions = {}): Promise<T> =>
  withRetry(url, { method: 'GET', headers: { Accept: 'application/json' } }, options) as Promise<T>;

/**
 * Parse an upstream stringly-typed numeric exactly once, here at the boundary.
 *
 * Both Hyperliquid and Jupiter return numbers as JSON strings. Letting those
 * reach the UI is how `NaN` ends up rendered and how sorts silently compare
 * lexicographically. Returns `null` rather than `NaN` so "missing" stays
 * representable all the way through.
 */
export function num(value: unknown): number | null {
  if (typeof value === 'number') return Number.isFinite(value) ? value : null;
  if (typeof value === 'string') {
    const trimmed = value.trim();
    if (trimmed === '') return null;
    const parsed = Number(trimmed);
    return Number.isFinite(parsed) ? parsed : null;
  }
  return null;
}

/** As `num`, but for fields that must have a value. */
export function requireNum(value: unknown, field: string): number {
  const parsed = num(value);
  if (parsed === null)
    throw new Error(`Expected numeric value for "${field}", got ${String(value)}`);
  return parsed;
}

/**
 * Map with bounded concurrency, settling every item.
 *
 * Measuring depth means a request per listing per size. Firing them all at
 * once is how a well-behaved client becomes a rate-limited one; running them
 * one at a time turns a three-second measurement into a minute. One failed
 * item must not discard the rest, so results are settled, in input order.
 */
export async function mapSettledLimit<T, R>(
  items: readonly T[],
  limit: number,
  fn: (item: T, index: number) => Promise<R>,
): Promise<PromiseSettledResult<R>[]> {
  const results: PromiseSettledResult<R>[] = new Array(items.length);
  let next = 0;
  const worker = async () => {
    while (next < items.length) {
      const index = next++;
      try {
        results[index] = { status: 'fulfilled', value: await fn(items[index]!, index) };
      } catch (reason) {
        results[index] = { status: 'rejected', reason };
      }
    }
  };
  await Promise.all(Array.from({ length: Math.max(1, Math.min(limit, items.length)) }, worker));
  return results;
}
