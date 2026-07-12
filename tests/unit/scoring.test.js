import { describe, it, expect } from "vitest";
import { scoreMatch, elementSignature } from "../../extension/lib/scoring.js";
import { makeEl } from "../setup/dom-helpers.js";

describe("scoreMatch", () => {
  it("returns 0 when tags don't match", () => {
    const score = scoreMatch(
      { tag: "button", text: "save" },
      { tag: "a", text: "save" }
    );
    expect(score).toBe(0);
  });

  it("returns 200 for exact testid match (authoritative)", () => {
    const score = scoreMatch(
      { tag: "button", testid: "save-btn", text: "save" },
      { tag: "button", testid: "save-btn", text: "save" }
    );
    expect(score).toBe(200);
  });

  it("returns 10 for tag-only match", () => {
    const score = scoreMatch(
      { tag: "button" },
      { tag: "button" }
    );
    expect(score).toBe(10);
  });

  it("adds 50 for exact text match", () => {
    const score = scoreMatch(
      { tag: "a", text: "settings" },
      { tag: "a", text: "settings" }
    );
    expect(score).toBe(60); // 10 base + 50 text
  });

  it("adds 15 when candidate text includes wanted text", () => {
    const score = scoreMatch(
      { tag: "a", text: "go to settings page" },
      { tag: "a", text: "settings" }
    );
    expect(score).toBe(25); // 10 base + 15 partial
  });

  it("adds 20 when wanted text includes candidate text", () => {
    const score = scoreMatch(
      { tag: "a", text: "settings" },
      { tag: "a", text: "go to settings page" }
    );
    expect(score).toBe(30); // 10 base + 20 partial
  });

  it("adds 30 for exact aria match", () => {
    const score = scoreMatch(
      { tag: "button", aria: "close dialog" },
      { tag: "button", aria: "close dialog" }
    );
    expect(score).toBe(40); // 10 base + 30 aria
  });

  it("adds 15 for partial aria match", () => {
    const score = scoreMatch(
      { tag: "button", aria: "close the dialog box" },
      { tag: "button", aria: "close" }
    );
    expect(score).toBe(25); // 10 base + 15 partial aria
  });

  it("adds 10 for role match", () => {
    const score = scoreMatch(
      { tag: "div", role: "tab" },
      { tag: "div", role: "tab" }
    );
    expect(score).toBe(20); // 10 base + 10 role
  });

  it("accumulates text + aria + role", () => {
    const score = scoreMatch(
      { tag: "button", text: "save", aria: "save changes", role: "button" },
      { tag: "button", text: "save", aria: "save changes", role: "button" }
    );
    // 10 base + 50 text + 30 aria + 10 role = 100
    expect(score).toBe(100);
  });
});

describe("elementSignature", () => {
  it("builds a lowercase signature from element attributes", () => {
    const el = makeEl("button", {
      "aria-label": "Save Changes",
      "data-testid": "save-btn",
      role: "button",
    }, "Save Changes");
    const sig = elementSignature(el);
    expect(sig.tag).toBe("button");
    expect(sig.text).toBe("save changes");
    expect(sig.aria).toBe("save changes");
    expect(sig.testid).toBe("save-btn");
    expect(sig.role).toBe("button");
  });

  it("returns undefined for missing optional fields", () => {
    const el = makeEl("div", {}, "Hello");
    const sig = elementSignature(el);
    expect(sig.tag).toBe("div");
    expect(sig.aria).toBeUndefined();
    expect(sig.testid).toBeUndefined();
    expect(sig.role).toBeUndefined();
  });
});
