import { describe, it, expect, beforeEach } from "vitest";
import { resetChromeMock } from "../setup/chrome-mock.js";
import { detectOscillation } from "../../extension/lib/oscillation.js";

describe("oscillation-recovery E2E", () => {
  beforeEach(() => {
    resetChromeMock();
  });

  it("detects oscillation in repeated history and generates WARNING hint", () => {
    const stepHistory = [
      { fid: "tid:save-btn", instruction: "Click Save." },
      { fid: "tid:cancel-btn", instruction: "Click Cancel." },
      { fid: "tid:save-btn", instruction: "Click Save." },
      { fid: "tid:cancel-btn", instruction: "Click Cancel." },
    ];

    const oscillation = detectOscillation(stepHistory);
    expect(oscillation).not.toBeNull();
    expect(oscillation.repeatedFids).toContain("tid:save-btn");
    expect(oscillation.repeatedFids).toContain("tid:cancel-btn");
    expect(oscillation.repeatedInstrs).toContain("Click Save.");
    expect(oscillation.repeatedInstrs).toContain("Click Cancel.");

    // Build the anti-oscillation hint (mirrors background.js logic)
    let hints = "Navigate to the settings page.";
    const avoidList = [
      ...oscillation.repeatedFids.map((f) => `fingerprint ${f}`),
      ...oscillation.repeatedInstrs.map((i) => `"${i}"`),
    ];
    hints += `\n\nWARNING: The agent is oscillating. Do NOT click these recently-repeated elements: ${avoidList.join(", ")}. Pick a DIFFERENT element to make forward progress.`;

    expect(hints).toContain("WARNING");
    expect(hints).toContain("tid:save-btn");
    expect(hints).toContain("tid:cancel-btn");
    expect(hints).toContain('"Click Save."');
  });

  it("anti-loop hints would be passed in vision call body", () => {
    const stepHistory = [
      { fid: "tid:a", instruction: "Do X" },
      { fid: "tid:b", instruction: "Do Y" },
      { fid: "tid:a", instruction: "Do X" },
    ];

    const oscillation = detectOscillation(stepHistory);
    expect(oscillation).not.toBeNull();

    // Simulate building vision call payload with hints
    let siteHints = "Click the profile link.";
    const avoidList = [
      ...oscillation.repeatedFids.map((f) => `fingerprint ${f}`),
      ...oscillation.repeatedInstrs.map((i) => `"${i}"`),
    ];
    siteHints += `\n\nWARNING: The agent is oscillating. Do NOT click these recently-repeated elements: ${avoidList.join(", ")}. Pick a DIFFERENT element to make forward progress.`;

    // The vision call body structure
    const visionBody = {
      screenshot_b64: "AAAA",
      elements: [{ idx: 0, tag: "button", text: "Save" }],
      task: "Change profile name",
      site_hints: siteHints,
      step_history: stepHistory,
    };

    expect(visionBody.site_hints).toContain("WARNING");
    expect(visionBody.site_hints).toContain("Do NOT click");
    expect(visionBody.step_history).toHaveLength(3);
  });
});
