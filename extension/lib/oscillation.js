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
