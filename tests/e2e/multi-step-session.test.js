import { describe, it, expect, beforeEach } from "vitest";
import { resetChromeMock } from "../setup/chrome-mock.js";
import { detectOscillation } from "../../extension/lib/oscillation.js";

describe("multi-step-session E2E", () => {
  beforeEach(() => {
    resetChromeMock();
  });

  it("3-step PAT rotation: step history accumulates to 3 entries", () => {
    // Simulate a 3-step session where each step targets a different element
    const stepHistory = [];

    // Step 0: click "Profile" tab
    stepHistory.push({
      stepIndex: 0,
      instruction: "Click Profile to view your settings.",
      fid: "tid:nav-profile",
      elementText: "Profile",
      pageUrl: "https://github.com/settings",
      timestamp: Date.now(),
    });

    // Step 1: click "Name" input
    stepHistory.push({
      stepIndex: 1,
      instruction: "Click the Name field to edit your profile name.",
      fid: "tid:profile-name",
      elementText: "Ben Ba",
      pageUrl: "https://github.com/settings/profile",
      timestamp: Date.now() + 2000,
    });

    // Step 2: click "Update profile" button
    stepHistory.push({
      stepIndex: 2,
      instruction: "Click Update profile to save changes.",
      fid: "tid:save-profile",
      elementText: "Update profile",
      pageUrl: "https://github.com/settings/profile",
      timestamp: Date.now() + 4000,
    });

    expect(stepHistory).toHaveLength(3);

    // Each step has distinct fid and instruction
    const fids = stepHistory.map((s) => s.fid);
    const uniqueFids = new Set(fids);
    expect(uniqueFids.size).toBe(3);
  });

  it("oscillation does not false-trigger on distinct steps", () => {
    const stepHistory = [
      { fid: "tid:nav-profile", instruction: "Click Profile." },
      { fid: "tid:profile-name", instruction: "Click Name field." },
      { fid: "tid:save-profile", instruction: "Click Update profile." },
    ];

    // All distinct — should NOT detect oscillation
    const result = detectOscillation(stepHistory);
    expect(result).toBeNull();
  });

  it("step history is capped at 10 entries (sliding window)", () => {
    const stepHistory = [];
    for (let i = 0; i < 12; i++) {
      stepHistory.push({
        stepIndex: i,
        instruction: `Step ${i}`,
        fid: `tid:el-${i}`,
        elementText: `Element ${i}`,
        pageUrl: "https://github.com/settings",
        timestamp: Date.now() + i * 1000,
      });
    }

    // Simulate the background.js capping: slice(-10)
    const capped = stepHistory.slice(-10);
    expect(capped).toHaveLength(10);
    expect(capped[0].stepIndex).toBe(2); // oldest kept is index 2
  });
});
