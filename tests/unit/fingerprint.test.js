import { describe, it, expect } from "vitest";
import { elementFingerprint, UNSTABLE_ID_PATTERN } from "../../extension/lib/fingerprint.js";
import { makeEl } from "../setup/dom-helpers.js";

describe("elementFingerprint", () => {
  it("returns tid: prefix for data-testid elements", () => {
    const el = makeEl("button", { "data-testid": "save-btn" }, "Save");
    expect(elementFingerprint(el)).toBe("tid:save-btn");
  });

  it("returns id: prefix for stable HTML IDs", () => {
    const el = makeEl("div", { id: "main-nav" });
    expect(elementFingerprint(el)).toBe("id:main-nav");
  });

  it("skips React auto-IDs (:r0:)", () => {
    const el = makeEl("button", { id: ":r0:" }, "Click me");
    expect(elementFingerprint(el)).not.toMatch(/^id:/);
  });

  it("skips Turbo IDs", () => {
    const el = makeEl("div", { id: "turbo-frame-1" }, "Content");
    expect(elementFingerprint(el)).not.toMatch(/^id:/);
  });

  it("skips Radix IDs", () => {
    const el = makeEl("div", { id: "radix-123" }, "Menu");
    expect(elementFingerprint(el)).not.toMatch(/^id:/);
  });

  it("skips __next IDs", () => {
    const el = makeEl("div", { id: "__next" });
    const fid = elementFingerprint(el);
    // Should return null (no other identifying info) or a non-id: fingerprint
    expect(fid === null || !fid.startsWith("id:")).toBe(true);
  });

  it("returns fp:tag:aria when aria-label present", () => {
    const el = makeEl("button", { "aria-label": "Close dialog" });
    expect(elementFingerprint(el)).toBe("fp:button:Close dialog");
  });

  it("returns fp:tag:role:text fallback", () => {
    const el = makeEl("div", { role: "tab" }, "Settings");
    expect(elementFingerprint(el)).toBe("fp:div:tab:Settings");
  });

  it("truncates text to 40 chars", () => {
    const longText = "A".repeat(60);
    const el = makeEl("span", { role: "button" }, longText);
    const fid = elementFingerprint(el);
    // Extract text portion (after fp:span:button:)
    const textPart = fid.replace("fp:span:button:", "");
    expect(textPart.length).toBe(40);
  });

  it("returns null for unidentifiable elements", () => {
    const el = makeEl("div");
    expect(elementFingerprint(el)).toBeNull();
  });

  it("data-testid takes priority over stable id", () => {
    const el = makeEl("input", { id: "email-field", "data-testid": "email-input" });
    expect(elementFingerprint(el)).toBe("tid:email-input");
  });
});

describe("UNSTABLE_ID_PATTERN", () => {
  it("matches React auto-IDs", () => {
    expect(UNSTABLE_ID_PATTERN.test(":r0:")).toBe(true);
    expect(UNSTABLE_ID_PATTERN.test(":r1a:")).toBe(true);
  });

  it("matches react- prefix", () => {
    expect(UNSTABLE_ID_PATTERN.test("react-select-1")).toBe(true);
  });

  it("matches turbo- prefix", () => {
    expect(UNSTABLE_ID_PATTERN.test("turbo-frame-main")).toBe(true);
  });

  it("matches radix- prefix", () => {
    expect(UNSTABLE_ID_PATTERN.test("radix-dropdown-1")).toBe(true);
  });

  it("does not match stable IDs", () => {
    expect(UNSTABLE_ID_PATTERN.test("main-nav")).toBe(false);
    expect(UNSTABLE_ID_PATTERN.test("profile-form")).toBe(false);
  });
});
