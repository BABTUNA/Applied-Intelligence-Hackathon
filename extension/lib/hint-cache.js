// Extracted from background.js — canonical testable source for Moss hint caching.

const HINT_CACHE_TTL = 3 * 60 * 1000; // 3 minutes
const HINT_CACHE_MAX = 20;

/** @type {Map<string, { hints: string, ts: number }>} */
let _hintCache = new Map();

/**
 * Retrieve cached hints for a given key.
 * Returns null if not cached or expired.
 */
export function getCachedHints(key) {
  const entry = _hintCache.get(key);
  if (!entry) return null;
  if (Date.now() - entry.ts > HINT_CACHE_TTL) {
    _hintCache.delete(key);
    return null;
  }
  return entry.hints;
}

/**
 * Store hints in the cache under a given key.
 * Auto-evicts the oldest entry if at capacity (20 entries).
 */
export function setCachedHints(key, hints) {
  // Evict oldest entries if at capacity
  if (_hintCache.size >= HINT_CACHE_MAX) {
    const oldest = _hintCache.keys().next().value;
    _hintCache.delete(oldest);
  }
  _hintCache.set(key, { hints, ts: Date.now() });
}

/**
 * Clear all cached hints. Useful for testing.
 */
export function clearHintCache() {
  _hintCache.clear();
}
