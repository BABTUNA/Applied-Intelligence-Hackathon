import { describe, it, expect, vi, beforeEach, afterEach } from "vitest";
import { withRetry, isTransientHttpError } from "../../extension/lib/retry.js";

describe("isTransientHttpError", () => {
  it("classifies 429 as transient", () => {
    expect(isTransientHttpError(new Error("vision-pick 429: rate limited"))).toBe(true);
  });

  it("classifies 500 as transient", () => {
    expect(isTransientHttpError(new Error("vision-pick 500: internal error"))).toBe(true);
  });

  it("classifies 503 as transient", () => {
    expect(isTransientHttpError(new Error("vision-pick 503: unavailable"))).toBe(true);
  });

  it("classifies 400 as permanent", () => {
    expect(isTransientHttpError(new Error("vision-pick 400: bad request"))).toBe(false);
  });

  it("classifies 401 as permanent", () => {
    expect(isTransientHttpError(new Error("vision-pick 401: unauthorized"))).toBe(false);
  });

  it("classifies network errors (no status) as transient", () => {
    expect(isTransientHttpError(new Error("fetch failed"))).toBe(true);
  });

  it("returns false for null/undefined", () => {
    expect(isTransientHttpError(null)).toBe(false);
    expect(isTransientHttpError(undefined)).toBe(false);
  });
});

describe("withRetry", () => {
  beforeEach(() => {
    vi.useFakeTimers();
  });

  afterEach(() => {
    vi.useRealTimers();
  });

  it("returns on first success", async () => {
    const fn = vi.fn().mockResolvedValue("ok");
    const result = await withRetry(fn, { maxAttempts: 3 });
    expect(result).toBe("ok");
    expect(fn).toHaveBeenCalledTimes(1);
  });

  it("retries then succeeds", async () => {
    const fn = vi.fn()
      .mockRejectedValueOnce(new Error("fail 1"))
      .mockResolvedValue("ok");

    const promise = withRetry(fn, { maxAttempts: 3, baseDelayMs: 100 });
    // Advance past the first retry delay
    await vi.advanceTimersByTimeAsync(200);
    const result = await promise;
    expect(result).toBe("ok");
    expect(fn).toHaveBeenCalledTimes(2);
  });

  it("throws after all attempts exhausted", async () => {
    vi.useRealTimers();
    const fn = vi.fn().mockRejectedValue(new Error("always fails"));

    await expect(
      withRetry(fn, { maxAttempts: 3, baseDelayMs: 10, maxDelayMs: 20 }),
    ).rejects.toThrow("always fails");
    expect(fn).toHaveBeenCalledTimes(3);
    vi.useFakeTimers();
  });

  it("short-circuits when shouldRetry returns false", async () => {
    vi.useRealTimers();
    const fn = vi.fn().mockRejectedValue(new Error("permanent 401"));
    const shouldRetry = vi.fn().mockReturnValue(false);

    await expect(
      withRetry(fn, { maxAttempts: 3, shouldRetry }),
    ).rejects.toThrow("permanent 401");
    expect(fn).toHaveBeenCalledTimes(1);
    expect(shouldRetry).toHaveBeenCalledTimes(1);
    vi.useFakeTimers();
  });

  it("caps delay at maxDelayMs", async () => {
    const fn = vi.fn()
      .mockRejectedValueOnce(new Error("fail 1"))
      .mockRejectedValueOnce(new Error("fail 2"))
      .mockResolvedValue("ok");

    const promise = withRetry(fn, {
      maxAttempts: 4,
      baseDelayMs: 1000,
      maxDelayMs: 1500,
    });

    // First retry: min(1000 * 2^0, 1500) = 1000ms
    await vi.advanceTimersByTimeAsync(1000);
    // Second retry: min(1000 * 2^1, 1500) = 1500ms (capped)
    await vi.advanceTimersByTimeAsync(1500);

    const result = await promise;
    expect(result).toBe("ok");
    expect(fn).toHaveBeenCalledTimes(3);
  });
});
