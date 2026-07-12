// Extracted from background.js — canonical testable source for vision response parsing.

/**
 * Parse a vision model response into a structured pick object.
 *
 * Handles:
 * - Clean JSON
 * - Markdown-fenced JSON (```json ... ```)
 * - Leading prose before a JSON object
 * - Prose recovery for "done" signals (e.g. "task complete", "no further action")
 *
 * @param {string} text - raw text from the vision model
 * @returns {{ idx: number, fid?: string, instruction: string, done: boolean }}
 * @throws {Error} if text is unrecoverable non-JSON
 */
export function parseVisionJson(text) {
  // 1) Try strict JSON parse (handles markdown fences + leading prose).
  const stripped = text.replace(/^```(?:json)?\s*/i, "").replace(/```\s*$/i, "").trim();
  const match = stripped.match(/\{[\s\S]*\}/);
  if (match) {
    try {
      const parsed = JSON.parse(match[0]);
      if (typeof parsed.idx === "number") {
        if (typeof parsed.done !== "boolean") parsed.done = false;
        if (typeof parsed.instruction !== "string") parsed.instruction = "Click this.";
        return parsed;
      }
    } catch (e) {
      // fall through to prose recovery
    }
  }

  // 2) Claude returned prose — recover a "done" signal from natural language.
  const lower = text.toLowerCase();
  const doneSignals = [
    "task is complete",
    "task complete",
    "appears complete",
    "already done",
    "no further action",
    "no more steps",
    "successfully completed",
    "no actionable",
    "cannot determine",
    "unable to identify",
    "this page does not",
    "this page doesn't",
  ];
  if (doneSignals.some((s) => lower.includes(s))) {
    return { idx: -1, done: true, instruction: "Task complete." };
  }

  throw new Error(`vision returned non-JSON: ${text.slice(0, 120)}`);
}
