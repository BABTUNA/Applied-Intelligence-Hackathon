import { describe, it, expect, vi, beforeEach, afterEach } from "vitest";
import { createDomStabilityMonitor } from "../../extension/lib/dom-stability.js";

describe("createDomStabilityMonitor", () => {
  beforeEach(() => {
    vi.useFakeTimers();
  });

  afterEach(() => {
    vi.useRealTimers();
  });

  it("resolves immediately when already settled", async () => {
    const monitor = createDomStabilityMonitor();
    // Brand new monitor starts settled
    const result = monitor.waitForSettled();
    // Should resolve synchronously (returns resolved promise)
    await expect(result).resolves.toBeUndefined();
  });

  it("resolves after 400ms debounce", async () => {
    const monitor = createDomStabilityMonitor({ settleDebounce: 400 });
    monitor.onMutation();
    expect(monitor.settled).toBe(false);

    const settled = monitor.waitForSettled();
    let resolved = false;
    settled.then(() => { resolved = true; });

    // Advance 399ms — not yet settled
    await vi.advanceTimersByTimeAsync(399);
    expect(resolved).toBe(false);

    // Advance 1 more ms — settled
    await vi.advanceTimersByTimeAsync(1);
    expect(resolved).toBe(true);
  });

  it("resets debounce on new mutation", async () => {
    const monitor = createDomStabilityMonitor({ settleDebounce: 400 });
    monitor.onMutation();

    const settled = monitor.waitForSettled();
    let resolved = false;
    settled.then(() => { resolved = true; });

    // Advance 300ms then trigger another mutation
    await vi.advanceTimersByTimeAsync(300);
    monitor.onMutation();

    // Advance 399ms from second mutation — not yet settled
    await vi.advanceTimersByTimeAsync(399);
    expect(resolved).toBe(false);

    // 1 more ms — settled (400ms after second mutation)
    await vi.advanceTimersByTimeAsync(1);
    expect(resolved).toBe(true);
  });

  it("hard timeout overrides debounce at 5000ms", async () => {
    const monitor = createDomStabilityMonitor({ settleDebounce: 400, hardTimeout: 5000 });
    monitor.onMutation();

    const settled = monitor.waitForSettled();
    let resolved = false;
    settled.then(() => { resolved = true; });

    // Keep mutating every 200ms to prevent debounce from settling
    for (let i = 0; i < 24; i++) {
      await vi.advanceTimersByTimeAsync(200);
      monitor.onMutation();
    }
    // We're at 4800ms, not yet resolved by hard timeout
    expect(resolved).toBe(false);

    // Advance to 5000ms — hard timeout fires
    await vi.advanceTimersByTimeAsync(200);
    expect(resolved).toBe(true);
  });

  it("resolves all pending promises", async () => {
    const monitor = createDomStabilityMonitor({ settleDebounce: 100 });
    monitor.onMutation();

    let count = 0;
    monitor.waitForSettled().then(() => count++);
    monitor.waitForSettled().then(() => count++);
    monitor.waitForSettled().then(() => count++);

    await vi.advanceTimersByTimeAsync(100);
    expect(count).toBe(3);
  });
});
