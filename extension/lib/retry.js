// Generic retry wrapper with exponential backoff.

/**
 * Classify whether an error represents a transient HTTP failure worth retrying.
 *
 * Retryable: 429 (rate limit) and 5xx (server errors).
 * Permanent: 4xx (except 429) — client errors that won't fix themselves.
 *
 * @param {Error} err
 * @returns {boolean}
 */
export function isTransientHttpError(err) {
  if (!err) return false;
  const msg = String(err.message || "");
  // Extract HTTP status code from error message (e.g. "vision-pick 503: ...")
  const match = msg.match(/\b([45]\d{2})\b/);
  if (!match) return true; // network errors (no status) are transient
  const code = parseInt(match[1], 10);
  if (code === 429) return true;
  if (code >= 500) return true;
  return false; // 4xx (except 429) = permanent
}

/**
 * Retry a function with exponential backoff.
 *
 * @param {() => Promise<T>} fn - async function to attempt
 * @param {object} [opts]
 * @param {number} [opts.maxAttempts=3] - total attempts (including the first)
 * @param {number} [opts.baseDelayMs=500] - initial delay between retries
 * @param {number} [opts.maxDelayMs=5000] - cap on delay
 * @param {(err: Error) => boolean} [opts.shouldRetry] - predicate; return false to fail fast
 * @returns {Promise<T>}
 */
export async function withRetry(fn, opts = {}) {
  const maxAttempts = opts.maxAttempts ?? 3;
  const baseDelayMs = opts.baseDelayMs ?? 500;
  const maxDelayMs = opts.maxDelayMs ?? 5000;
  const shouldRetry = opts.shouldRetry ?? (() => true);

  let lastError;
  for (let attempt = 1; attempt <= maxAttempts; attempt++) {
    try {
      return await fn();
    } catch (err) {
      lastError = err;
      if (attempt >= maxAttempts) break;
      if (!shouldRetry(err)) break;
      const delay = Math.min(baseDelayMs * 2 ** (attempt - 1), maxDelayMs);
      await new Promise((r) => setTimeout(r, delay));
    }
  }
  throw lastError;
}
