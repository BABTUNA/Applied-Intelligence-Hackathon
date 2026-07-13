// Extracted from background.js — canonical testable source for oscillation detection.

/** Maximum steps before auto-stopping a guidance session. */
export const MAX_STEPS = 15;

/**
 * Detect oscillation (repeated elements/instructions) in recent step history.
 *
 * Checks the last 4 steps for repeated fingerprints or instructions.
 * Returns null if no oscillation, or { repeatedFids, repeatedInstrs } if detected.
 *
 * @param {Array} stepHistory - array of { fid, instruction, ... } step records
 * @returns {null | { repeatedFids: string[], repeatedInstrs: string[] }}
 */
export function detectOscillation(stepHistory) {
  if (!Array.isArray(stepHistory) || stepHistory.length < 3) return null;
  const recent = stepHistory.slice(-4);
  // Check if same fingerprint appears 2+ times in last 4 steps
  const fidCounts = {};
  const instrCounts = {};
  for (const s of recent) {
    if (s.fid) fidCounts[s.fid] = (fidCounts[s.fid] || 0) + 1;
    if (s.instruction) instrCounts[s.instruction] = (instrCounts[s.instruction] || 0) + 1;
  }
  const repeatedFids = Object.entries(fidCounts).filter(([, c]) => c >= 2).map(([fid]) => fid);
  const repeatedInstrs = Object.entries(instrCounts).filter(([, c]) => c >= 2).map(([instr]) => instr);
  if (repeatedFids.length === 0 && repeatedInstrs.length === 0) return null;
  return { repeatedFids, repeatedInstrs };
}

// ─── escalating oscillation classification ────────────────────────────────────

const WINDOW_SIZE = 4;

/**
 * Check whether a single 4-step window shows oscillation.
 * @param {Array} window — exactly WINDOW_SIZE step records
 * @returns {{ repeatedFids: string[], repeatedInstrs: string[] } | null}
 */
function windowHasOscillation(window) {
  const fidCounts = {};
  const instrCounts = {};
  for (const s of window) {
    if (s.fid) fidCounts[s.fid] = (fidCounts[s.fid] || 0) + 1;
    if (s.instruction) instrCounts[s.instruction] = (instrCounts[s.instruction] || 0) + 1;
  }
  const repeatedFids = Object.entries(fidCounts).filter(([, c]) => c >= 2).map(([fid]) => fid);
  const repeatedInstrs = Object.entries(instrCounts).filter(([, c]) => c >= 2).map(([instr]) => instr);
  if (repeatedFids.length === 0 && repeatedInstrs.length === 0) return null;
  return { repeatedFids, repeatedInstrs };
}

/**
 * Count how many consecutive oscillation windows exist at the tail of stepHistory.
 *
 * Windows are checked from the tail backwards: the most recent window is
 * stepHistory.slice(-4), the one before is stepHistory.slice(-5, -1), etc.
 * The count stops at the first non-oscillating window.
 *
 * @param {Array} stepHistory
 * @returns {number}
 */
function countConsecutiveOscillatingWindows(stepHistory) {
  if (!Array.isArray(stepHistory) || stepHistory.length < WINDOW_SIZE) return 0;
  let count = 0;
  // Walk backwards from the tail
  for (let end = stepHistory.length; end >= WINDOW_SIZE; end--) {
    const window = stepHistory.slice(end - WINDOW_SIZE, end);
    if (!windowHasOscillation(window)) break;
    count++;
  }
  return count;
}

/**
 * Classify oscillation severity with escalating response tiers.
 *
 * @param {Array} stepHistory
 * @returns {{ action: 'none'|'warn'|'retry_different'|'hard_stop',
 *             repeatedFids: string[], repeatedInstrs: string[],
 *             consecutiveOscillationCount: number }}
 */
export function classifyOscillation(stepHistory) {
  const none = { action: "none", repeatedFids: [], repeatedInstrs: [], consecutiveOscillationCount: 0 };
  if (!Array.isArray(stepHistory) || stepHistory.length < 3) return none;

  const consecutiveCount = countConsecutiveOscillatingWindows(stepHistory);
  if (consecutiveCount === 0) return none;

  // Get the repeated elements from the most recent window for hints
  const recentWindow = stepHistory.slice(-WINDOW_SIZE);
  const osc = windowHasOscillation(recentWindow) || { repeatedFids: [], repeatedInstrs: [] };

  let action;
  if (consecutiveCount >= 3) {
    action = "hard_stop";
  } else if (consecutiveCount === 2) {
    action = "retry_different";
  } else {
    action = "warn";
  }

  return {
    action,
    repeatedFids: osc.repeatedFids,
    repeatedInstrs: osc.repeatedInstrs,
    consecutiveOscillationCount: consecutiveCount,
  };
}
