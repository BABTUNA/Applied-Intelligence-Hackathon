// Extracted from content.js — canonical testable source for DOM stability monitoring.

/**
 * Factory that creates a DOM stability monitor.
 *
 * The monitor tracks DOM mutations and provides a promise-based API to wait
 * until the DOM has been "settled" (no mutations for `settleDebounce` ms).
 * A hard timeout ensures we never wait forever.
 *
 * `waitForSettled()` resolves with `{ timedOut: boolean }`:
 *   - `{ timedOut: false }` when the DOM naturally quieted down
 *   - `{ timedOut: true }` when the hard timeout fired first
 *
 * @param {object} [opts]
 * @param {number} [opts.settleDebounce=400] - ms of DOM quiet before "settled"
 * @param {number} [opts.hardTimeout=5000]   - ms max wait regardless of mutations
 * @returns {{ onMutation: Function, waitForSettled: Function, settled: boolean }}
 */
export function createDomStabilityMonitor(opts = {}) {
  const SETTLE_DEBOUNCE = opts.settleDebounce ?? 400;
  const HARD_TIMEOUT = opts.hardTimeout ?? 5000;

  let _settled = true;
  let _timer = null;
  let _hardTimer = null;
  let _timedOut = false;
  let _pendingResolves = [];

  function _onSettle() {
    _settled = true;
    clearTimeout(_hardTimer);
    _hardTimer = null;
    const didTimeout = _timedOut;
    _timedOut = false;
    const resolves = _pendingResolves.splice(0);
    for (const r of resolves) r({ timedOut: didTimeout });
  }

  return {
    /** Call this on every DOM mutation. */
    onMutation() {
      _settled = false;
      clearTimeout(_timer);
      _timer = setTimeout(() => _onSettle(), SETTLE_DEBOUNCE);
    },

    /**
     * Returns a promise that resolves when the DOM is settled.
     * Resolves immediately with `{ timedOut: false }` if already settled.
     *
     * @returns {Promise<{ timedOut: boolean }>}
     */
    waitForSettled() {
      if (_settled) return Promise.resolve({ timedOut: false });
      return new Promise((resolve) => {
        _pendingResolves.push(resolve);
        if (!_hardTimer) {
          _hardTimer = setTimeout(() => {
            _timedOut = true;
            _onSettle();
          }, HARD_TIMEOUT);
        }
      });
    },

    /** Whether the DOM is currently settled. */
    get settled() {
      return _settled;
    },
  };
}
