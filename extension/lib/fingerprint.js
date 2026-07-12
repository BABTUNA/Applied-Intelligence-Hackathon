// Extracted from content.js — canonical testable source for element fingerprinting.

/** Auto-generated IDs that shift across navigations — skip these for fingerprints. */
export const UNSTABLE_ID_PATTERN = /^(:r[a-z0-9]+:|react-|turbo-|__next|radix-)/i;

/**
 * Visible text (no markup), trimmed and capped.
 * Shared helper used by fingerprinting and scoring.
 */
export function textOf(el) {
  const raw =
    el.getAttribute("aria-label") ||
    el.innerText ||
    el.value ||
    el.getAttribute("placeholder") ||
    el.getAttribute("title") ||
    "";
  return raw.replace(/\s+/g, " ").trim().slice(0, 80);
}

/**
 * Stable element fingerprint that survives DOM reshuffles.
 *
 * Priority: data-testid > stable HTML id > aria-label+tag > text+tag+role
 *
 * Returns one of:
 *   - `tid:<data-testid>`
 *   - `id:<stable-id>`
 *   - `fp:<tag>:<aria>`
 *   - `fp:<tag>:<role>:<text>`
 *   - null (unidentifiable)
 */
export function elementFingerprint(el) {
  const testid = el.getAttribute("data-testid");
  if (testid) return `tid:${testid}`;

  const id = el.id;
  if (id && !UNSTABLE_ID_PATTERN.test(id)) return `id:${id}`;

  const tag = el.tagName.toLowerCase();
  const aria = (el.getAttribute("aria-label") || "").trim();
  if (aria) return `fp:${tag}:${aria}`;

  const text = textOf(el).slice(0, 40);
  const role = el.getAttribute("role") || "";
  if (text) return `fp:${tag}:${role}:${text}`;

  return null;
}
