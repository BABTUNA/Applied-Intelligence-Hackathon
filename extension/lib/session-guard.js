// Centralised stop-condition evaluation for guidance sessions.
//
// Maps failure reasons to structured outcomes so callers don't need
// to duplicate user-message strings or outcome classification logic.

/**
 * Known stop reasons and their outcome mappings.
 * @type {Record<string, { outcome: string, outcomeReason: string, userMessage: string }>}
 */
const STOP_MAP = {
  oscillation: {
    outcome: "oscillation",
    outcomeReason: "sustained oscillation detected",
    userMessage: "Navigation got stuck in a loop. Please try rephrasing your task.",
  },
  max_steps: {
    outcome: "max_steps",
    outcomeReason: "exceeded maximum steps",
    userMessage: "Reached the maximum number of steps. Try breaking the task into smaller parts.",
  },
  enumeration_failed: {
    outcome: "error",
    outcomeReason: "could not enumerate page elements",
    userMessage: "Could not read the page elements. Please refresh and try again.",
  },
  highlight_failed: {
    outcome: "error",
    outcomeReason: "highlighted element not found on page",
    userMessage: "The target element disappeared from the page. Please try again.",
  },
  vision_failed: {
    outcome: "error",
    outcomeReason: "vision call failed after retries",
    userMessage: "Could not analyse the page. Please check your connection and try again.",
  },
  missing_config: {
    outcome: "error",
    outcomeReason: "insforge url not configured",
    userMessage: "EverNav is not configured. Please set the InsForge URL in extension options.",
  },
  screenshot_failed: {
    outcome: "error",
    outcomeReason: "screenshot capture failed or timed out",
    userMessage: "Could not capture the screen. The tab may be unresponsive — please try again.",
  },
  stale_step: {
    outcome: "error",
    outcomeReason: "step timed out (zombie session)",
    userMessage: "Navigation stalled unexpectedly. Please try again.",
  },
};

/**
 * Map a failure reason to a structured stop outcome.
 *
 * @param {string} reason - one of the keys in STOP_MAP
 * @param {object} [context] - optional extra context (currently unused, reserved for future)
 * @returns {{ outcome: string, outcomeReason: string, userMessage: string } | null}
 *          null if the reason is unknown
 */
export function evaluateStopCondition(reason, context) {
  if (!reason || typeof reason !== "string") return null;
  const entry = STOP_MAP[reason];
  if (!entry) return null;
  return { ...entry };
}

/**
 * Build a human-readable diagnostic summary from step history and failure reason.
 *
 * @param {Array<{ stepIndex?: number, instruction?: string, fid?: string }>} stepHistory
 * @param {string} failureReason
 * @returns {string}
 */
export function buildDiagnosticSummary(stepHistory, failureReason) {
  const lines = [];
  lines.push(`Failure reason: ${failureReason || "unknown"}`);

  if (!Array.isArray(stepHistory) || stepHistory.length === 0) {
    lines.push("Step history: (empty)");
  } else {
    lines.push(`Steps completed: ${stepHistory.length}`);
    const last = stepHistory[stepHistory.length - 1];
    lines.push(`Last step: #${last.stepIndex ?? "?"} — ${last.instruction || "(no instruction)"}`);
    if (last.fid) lines.push(`Last fid: ${last.fid}`);
  }

  return lines.join("\n");
}
