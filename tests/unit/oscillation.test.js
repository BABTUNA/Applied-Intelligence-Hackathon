import { describe, it, expect } from "vitest";
import { detectOscillation, classifyOscillation, MAX_STEPS } from "../../extension/lib/oscillation.js";

describe("detectOscillation", () => {
  it("returns null for empty history", () => {
    expect(detectOscillation([])).toBeNull();
  });

  it("returns null for short history (< 3 entries)", () => {
    expect(detectOscillation([
      { fid: "tid:a", instruction: "Click A" },
      { fid: "tid:b", instruction: "Click B" },
    ])).toBeNull();
  });

  it("returns null for no repeats in last 4", () => {
    const history = [
      { fid: "tid:a", instruction: "Click A" },
      { fid: "tid:b", instruction: "Click B" },
      { fid: "tid:c", instruction: "Click C" },
      { fid: "tid:d", instruction: "Click D" },
    ];
    expect(detectOscillation(history)).toBeNull();
  });

  it("detects repeated fid", () => {
    const history = [
      { fid: "tid:a", instruction: "Click A" },
      { fid: "tid:b", instruction: "Click B" },
      { fid: "tid:a", instruction: "Click A again" },
    ];
    const result = detectOscillation(history);
    expect(result).not.toBeNull();
    expect(result.repeatedFids).toContain("tid:a");
  });

  it("detects repeated instruction", () => {
    const history = [
      { fid: "tid:a", instruction: "Click the save button" },
      { fid: "tid:b", instruction: "Click another thing" },
      { fid: "tid:c", instruction: "Click the save button" },
    ];
    const result = detectOscillation(history);
    expect(result).not.toBeNull();
    expect(result.repeatedInstrs).toContain("Click the save button");
  });

  it("only checks last 4 steps (not full history)", () => {
    const history = [
      { fid: "tid:x", instruction: "Old step" },
      { fid: "tid:x", instruction: "Old step" }, // repeats, but outside last 4
      { fid: "tid:a", instruction: "Step 1" },
      { fid: "tid:b", instruction: "Step 2" },
      { fid: "tid:c", instruction: "Step 3" },
      { fid: "tid:d", instruction: "Step 4" },
    ];
    expect(detectOscillation(history)).toBeNull();
  });

  it("handles null fid gracefully", () => {
    const history = [
      { fid: null, instruction: "Click A" },
      { fid: null, instruction: "Click B" },
      { fid: null, instruction: "Click C" },
    ];
    // null fids are skipped (only truthy fids are counted)
    expect(detectOscillation(history)).toBeNull();
  });

  it("handles non-array input", () => {
    expect(detectOscillation(null)).toBeNull();
    expect(detectOscillation(undefined)).toBeNull();
    expect(detectOscillation("not an array")).toBeNull();
  });
});

describe("classifyOscillation", () => {
  it("returns 'none' for short history", () => {
    const result = classifyOscillation([{ fid: "tid:a", instruction: "Click A" }]);
    expect(result.action).toBe("none");
    expect(result.consecutiveOscillationCount).toBe(0);
  });

  it("returns 'warn' for a single oscillation window", () => {
    // 1 window of oscillation: steps show A, B, A pattern
    const history = [
      { fid: "tid:a", instruction: "Click A" },
      { fid: "tid:b", instruction: "Click B" },
      { fid: "tid:a", instruction: "Click A" },
      { fid: "tid:b", instruction: "Click B" },
    ];
    const result = classifyOscillation(history);
    expect(result.action).toBe("warn");
    expect(result.consecutiveOscillationCount).toBe(1);
    expect(result.repeatedFids).toContain("tid:a");
  });

  it("returns 'retry_different' for 2 consecutive oscillation windows", () => {
    // 5 steps → 2 overlapping windows both oscillating
    const history = [
      { fid: "tid:a", instruction: "Click A" },
      { fid: "tid:b", instruction: "Click B" },
      { fid: "tid:a", instruction: "Click A" },
      { fid: "tid:b", instruction: "Click B" },
      { fid: "tid:a", instruction: "Click A" },
    ];
    const result = classifyOscillation(history);
    expect(result.action).toBe("retry_different");
    expect(result.consecutiveOscillationCount).toBe(2);
  });

  it("returns 'hard_stop' for 3+ consecutive oscillation windows", () => {
    // 6 steps → 3 overlapping windows all oscillating
    const history = [
      { fid: "tid:a", instruction: "Click A" },
      { fid: "tid:b", instruction: "Click B" },
      { fid: "tid:a", instruction: "Click A" },
      { fid: "tid:b", instruction: "Click B" },
      { fid: "tid:a", instruction: "Click A" },
      { fid: "tid:b", instruction: "Click B" },
    ];
    const result = classifyOscillation(history);
    expect(result.action).toBe("hard_stop");
    expect(result.consecutiveOscillationCount).toBeGreaterThanOrEqual(3);
  });

  it("resets after the oscillation streak breaks", () => {
    // Oscillation then a clean window
    const history = [
      { fid: "tid:a", instruction: "Click A" },
      { fid: "tid:b", instruction: "Click B" },
      { fid: "tid:a", instruction: "Click A" },
      // Streak broken by unique steps
      { fid: "tid:c", instruction: "Click C" },
      { fid: "tid:d", instruction: "Click D" },
      { fid: "tid:e", instruction: "Click E" },
      { fid: "tid:f", instruction: "Click F" },
    ];
    const result = classifyOscillation(history);
    expect(result.action).toBe("none");
  });
});

describe("MAX_STEPS", () => {
  it("is 15", () => {
    expect(MAX_STEPS).toBe(15);
  });
});
