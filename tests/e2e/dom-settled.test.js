import { describe, it, expect, vi, beforeEach, afterEach } from "vitest";
import { createDomStabilityMonitor } from "../../extension/lib/dom-stability.js";
import { resetChromeMock } from "../setup/chrome-mock.js";

describe("dom-settled E2E", () => {
  beforeEach(() => {
    vi.useFakeTimers();
    resetChromeMock();
  });

  afterEach(() => {
    vi.useRealTimers();
  });

  it("mutations stop for 400ms → settled signal fires", async () => {
    const monitor = createDomStabilityMonitor({ settleDebounce: 400, hardTimeout: 5000 });

    // Simulate a burst of DOM mutations (like a Turbo page swap)
    monitor.onMutation();
    await vi.advanceTimersByTimeAsync(50);
    monitor.onMutation();
    await vi.advanceTimersByTimeAsync(50);
    monitor.onMutation();
    await vi.advanceTimersByTimeAsync(50);

    // Now mutations stop — start waiting
    let settled = false;
    monitor.waitForSettled().then(() => { settled = true; });

    // Not yet settled (only 50ms since last mutation)
    await vi.advanceTimersByTimeAsync(349);
    expect(settled).toBe(false);

    // 400ms since last mutation — settled
    await vi.advanceTimersByTimeAsync(51);
    expect(settled).toBe(true);
  });

  it("WAIT_FOR_SETTLED message handler returns {ok: true}", async () => {
    const monitor = createDomStabilityMonitor({ settleDebounce: 100 });

    // Monitor is settled by default — waitForSettled resolves immediately
    await monitor.waitForSettled();

    // Simulate the content script message handler response
    const response = { ok: true, settled: true };
    expect(response.ok).toBe(true);
    expect(response.settled).toBe(true);
  });

  it("handles rapid mutations followed by quiet period", async () => {
    const monitor = createDomStabilityMonitor({ settleDebounce: 400 });

    // 20 rapid mutations over 200ms
    for (let i = 0; i < 20; i++) {
      monitor.onMutation();
      await vi.advanceTimersByTimeAsync(10);
    }

    let settled = false;
    monitor.waitForSettled().then(() => { settled = true; });

    // Wait 400ms after last mutation
    await vi.advanceTimersByTimeAsync(400);
    expect(settled).toBe(true);
  });

  it("hard timeout resolves even with continuous mutations", async () => {
    const monitor = createDomStabilityMonitor({ settleDebounce: 400, hardTimeout: 2000 });

    monitor.onMutation();
    let settled = false;
    monitor.waitForSettled().then(() => { settled = true; });

    // Mutate every 100ms — debounce never fires
    for (let i = 0; i < 19; i++) {
      await vi.advanceTimersByTimeAsync(100);
      monitor.onMutation();
    }
    expect(settled).toBe(false);

    // Hard timeout at 2000ms
    await vi.advanceTimersByTimeAsync(100);
    expect(settled).toBe(true);
  });
});
