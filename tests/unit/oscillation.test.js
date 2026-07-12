import { describe, it, expect } from "vitest";
import { detectOscillation, MAX_STEPS } from "../../extension/lib/oscillation.js";

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

describe("MAX_STEPS", () => {
  it("is 15", () => {
    expect(MAX_STEPS).toBe(15);
  });
});
