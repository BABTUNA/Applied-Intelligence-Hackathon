// Extracted from content.js — canonical testable source for element scoring/matching.

import { textOf } from "./fingerprint.js";

/**
 * Build a stable-ish descriptor used to re-find an element during cached-trail replay.
 */
export function elementSignature(el) {
  return {
    tag: el.tagName.toLowerCase(),
    text: textOf(el).toLowerCase(),
    aria: (el.getAttribute("aria-label") || "").toLowerCase() || undefined,
    testid: el.getAttribute("data-testid") || undefined,
    role: el.getAttribute("role") || undefined,
  };
}

/**
 * Score how well a candidate signature matches a wanted signature.
 *
 * Returns 0 if tags don't match.
 * Returns 200 for exact testid match (authoritative).
 * Otherwise accumulates: base 10 (tag) + text (15-50) + aria (15-30) + role (10).
 */
export function scoreMatch(candSig, want) {
  if (!candSig.tag || candSig.tag !== want.tag) return 0;
  let score = 10; // base tag match

  // data-testid exact match is authoritative
  if (want.testid && candSig.testid === want.testid) return 200;

  // Exact text match
  if (want.text && candSig.text && candSig.text === want.text) score += 50;
  // Partial text match (weaker)
  else if (want.text && candSig.text && candSig.text.includes(want.text)) score += 15;
  else if (want.text && candSig.text && want.text.includes(candSig.text)) score += 20;

  // Exact aria match
  if (want.aria && candSig.aria && candSig.aria === want.aria) score += 30;
  // Partial aria match
  else if (want.aria && candSig.aria && candSig.aria.includes(want.aria)) score += 15;

  // Role match
  if (want.role && candSig.role === want.role) score += 10;

  return score;
}
