import { describe, it, expect } from "vitest";
import { evaluateStopCondition, buildDiagnosticSummary } from "../../extension/lib/session-guard.js";

describe("evaluateStopCondition", () => {
  it("returns correct outcome for oscillation", () => {
    const result = evaluateStopCondition("oscillation");
    expect(result).toEqual({
      outcome: "oscillation",
      outcomeReason: "sustained oscillation detected",
      userMessage: expect.stringContaining("loop"),
    });
  });

  it("returns correct outcome for max_steps", () => {
    const result = evaluateStopCondition("max_steps");
    expect(result.outcome).toBe("max_steps");
    expect(result.userMessage).toBeTruthy();
  });

  it("returns correct outcome for enumeration_failed", () => {
    const result = evaluateStopCondition("enumeration_failed");
    expect(result.outcome).toBe("error");
    expect(result.userMessage).toContain("page elements");
  });

  it("returns correct outcome for highlight_failed", () => {
    const result = evaluateStopCondition("highlight_failed");
    expect(result.outcome).toBe("error");
    expect(result.outcomeReason).toContain("highlighted element");
  });

  it("returns correct outcome for vision_failed", () => {
    const result = evaluateStopCondition("vision_failed");
    expect(result.outcome).toBe("error");
    expect(result.userMessage).toContain("connection");
  });

  it("returns correct outcome for missing_config", () => {
    const result = evaluateStopCondition("missing_config");
    expect(result.outcome).toBe("error");
    expect(result.userMessage).toContain("InsForge");
  });

  it("returns correct outcome for stale_step", () => {
    const result = evaluateStopCondition("stale_step");
    expect(result.outcome).toBe("error");
    expect(result.userMessage).toContain("stalled");
  });

  it("returns null for unknown reason", () => {
    expect(evaluateStopCondition("totally_bogus")).toBeNull();
  });

  it("returns null for null/undefined/empty input", () => {
    expect(evaluateStopCondition(null)).toBeNull();
    expect(evaluateStopCondition(undefined)).toBeNull();
    expect(evaluateStopCondition("")).toBeNull();
  });

  it("returns a fresh object each call (no shared mutation)", () => {
    const a = evaluateStopCondition("oscillation");
    const b = evaluateStopCondition("oscillation");
    expect(a).toEqual(b);
    expect(a).not.toBe(b);
  });
});

describe("buildDiagnosticSummary", () => {
  it("includes failure reason", () => {
    const summary = buildDiagnosticSummary([], "oscillation");
    expect(summary).toContain("oscillation");
  });

  it("reports empty history", () => {
    const summary = buildDiagnosticSummary([], "test");
    expect(summary).toContain("(empty)");
  });

  it("reports step count and last step", () => {
    const history = [
      { stepIndex: 0, instruction: "Click A", fid: "tid:a" },
      { stepIndex: 1, instruction: "Click B", fid: "tid:b" },
    ];
    const summary = buildDiagnosticSummary(history, "max_steps");
    expect(summary).toContain("Steps completed: 2");
    expect(summary).toContain("Click B");
    expect(summary).toContain("tid:b");
  });

  it("handles null history", () => {
    const summary = buildDiagnosticSummary(null, "error");
    expect(summary).toContain("(empty)");
  });

  it("handles missing instruction in last step", () => {
    const history = [{ stepIndex: 0 }];
    const summary = buildDiagnosticSummary(history, "test");
    expect(summary).toContain("(no instruction)");
  });

  it("handles null failure reason", () => {
    const summary = buildDiagnosticSummary([], null);
    expect(summary).toContain("unknown");
  });
});
