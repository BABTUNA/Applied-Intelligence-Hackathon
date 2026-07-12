import { describe, it, expect, vi, beforeEach, afterEach } from "vitest";
import { getCachedHints, setCachedHints, clearHintCache } from "../../extension/lib/hint-cache.js";

describe("hint-cache", () => {
  beforeEach(() => {
    clearHintCache();
    vi.useFakeTimers();
  });

  afterEach(() => {
    vi.useRealTimers();
  });

  it("returns null for uncached key", () => {
    expect(getCachedHints("github.com::change profile")).toBeNull();
  });

  it("stores and retrieves hints", () => {
    setCachedHints("github.com::change name", "Click the Name field");
    expect(getCachedHints("github.com::change name")).toBe("Click the Name field");
  });

  it("expires after 3-minute TTL", () => {
    setCachedHints("github.com::task", "some hints");
    // Advance 3 minutes + 1ms
    vi.advanceTimersByTime(3 * 60 * 1000 + 1);
    expect(getCachedHints("github.com::task")).toBeNull();
  });

  it("is valid within TTL", () => {
    setCachedHints("github.com::task", "some hints");
    // Advance 2 minutes (within TTL)
    vi.advanceTimersByTime(2 * 60 * 1000);
    expect(getCachedHints("github.com::task")).toBe("some hints");
  });

  it("evicts oldest entry at 20 entries", () => {
    // Fill cache to capacity
    for (let i = 0; i < 20; i++) {
      setCachedHints(`key-${i}`, `hint-${i}`);
    }
    // Add one more — oldest (key-0) should be evicted
    setCachedHints("key-new", "new hint");
    expect(getCachedHints("key-0")).toBeNull();
    expect(getCachedHints("key-new")).toBe("new hint");
    // key-1 should still be there
    expect(getCachedHints("key-1")).toBe("hint-1");
  });

  it("stores empty string (Moss returned no hints)", () => {
    setCachedHints("github.com::task", "");
    expect(getCachedHints("github.com::task")).toBe("");
  });
});
