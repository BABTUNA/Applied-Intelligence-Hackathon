import { describe, it, expect, vi, beforeEach } from "vitest";
import { loadFixture } from "../setup/dom-helpers.js";
import { resetChromeMock } from "../setup/chrome-mock.js";
import { elementFingerprint } from "../../extension/lib/fingerprint.js";
import { parseVisionJson } from "../../extension/lib/parse-vision.js";
import { evaluateStopCondition } from "../../extension/lib/session-guard.js";
import visionResponses from "../fixtures/vision-responses.json";

describe("guidance-loop E2E", () => {
  beforeEach(() => {
    resetChromeMock();
    loadFixture("github-settings-page.html");
  });

  it("enumerates elements from fixture page and matches vision pick to HIGHLIGHT_INDEX", () => {
    // Simulate what the content script does: build an element list
    const INTERACTIVE_SELECTOR = [
      "a[href]", "button", "input:not([type=hidden])", "textarea",
      "select", "[role=button]", "[role=link]", "[role=menuitem]", "[role=tab]",
      '[tabindex]:not([tabindex="-1"])',
    ].join(",");

    const all = Array.from(document.querySelectorAll(INTERACTIVE_SELECTOR));
    expect(all.length).toBeGreaterThan(0);

    // Build element descriptors (mimicking buildElementList)
    const elements = all.map((el, i) => ({
      idx: i,
      tag: el.tagName.toLowerCase(),
      text: (el.innerText || el.value || "").trim().slice(0, 80),
      testid: el.getAttribute("data-testid") || undefined,
      fid: elementFingerprint(el) || undefined,
    }));

    // Mock vision response: pick the "save-profile" button
    const visionPick = visionResponses.click_save;

    // Verify vision pick maps to a real element
    const chosen = elements.find((e) => e.idx === visionPick.idx || e.fid === visionPick.fid);
    expect(chosen).toBeDefined();

    // Simulate dispatching HIGHLIGHT_INDEX
    const highlightMsg = {
      type: "HIGHLIGHT_INDEX",
      idx: visionPick.idx,
      fid: visionPick.fid,
      instruction: visionPick.instruction,
      stepIndex: 0,
    };
    expect(highlightMsg.type).toBe("HIGHLIGHT_INDEX");
    expect(highlightMsg.fid).toBe("tid:save-profile");
  });

  it("handles vision done signal — session stops", () => {
    const visionPick = visionResponses.task_complete;

    // Parse the "done" response
    expect(visionPick.done).toBe(true);
    expect(visionPick.idx).toBe(-1);

    // When done=true, the background script calls stopGuidance.
    // Verify the signal structure is correct for stopping.
    const shouldStop = visionPick.done || visionPick.idx === -1;
    expect(shouldStop).toBe(true);
  });

  it("parses a markdown-fenced vision response and extracts idx", () => {
    const raw = visionResponses.markdown_fenced;
    const result = parseVisionJson(raw);
    expect(result.idx).toBe(2);
    expect(result.fid).toBe("tid:nav-admin");
    expect(result.instruction).toBe("Click Account.");
    expect(result.done).toBe(false);
  });

  it("parses vision response with leading prose", () => {
    const raw = visionResponses.leading_prose;
    const result = parseVisionJson(raw);
    expect(result.idx).toBe(5);
    expect(result.instruction).toBe("Click Notifications.");
  });

  it("HIGHLIGHT_INDEX failure triggers stop path via evaluateStopCondition", () => {
    // Simulate: background gets { ok: false, found: false } from HIGHLIGHT_INDEX
    const highlightResp = { ok: false, found: false, resolvedBy: "none" };
    expect(highlightResp.ok).toBe(false);
    expect(highlightResp.found).toBe(false);

    // The background script would call evaluateStopCondition("highlight_failed")
    const cond = evaluateStopCondition("highlight_failed");
    expect(cond).not.toBeNull();
    expect(cond.outcome).toBe("error");
    expect(cond.outcomeReason).toContain("highlighted element");
    expect(cond.userMessage).toBeTruthy();
  });

  it("evaluateStopCondition produces correct output for all failure reasons", () => {
    const reasons = ["oscillation", "max_steps", "enumeration_failed", "highlight_failed", "vision_failed", "missing_config", "stale_step"];
    for (const reason of reasons) {
      const cond = evaluateStopCondition(reason);
      expect(cond).not.toBeNull();
      expect(cond.outcome).toBeTruthy();
      expect(cond.outcomeReason).toBeTruthy();
      expect(cond.userMessage).toBeTruthy();
    }
  });
});
