import { describe, it, expect } from "vitest";
import { parseVisionJson } from "../../extension/lib/parse-vision.js";

describe("parseVisionJson", () => {
  it("parses clean JSON", () => {
    const result = parseVisionJson('{"idx": 3, "fid": "tid:save", "instruction": "Click Save.", "done": false}');
    expect(result.idx).toBe(3);
    expect(result.fid).toBe("tid:save");
    expect(result.instruction).toBe("Click Save.");
    expect(result.done).toBe(false);
  });

  it("parses markdown-fenced JSON", () => {
    const input = '```json\n{"idx": 2, "fid": "tid:nav-admin", "instruction": "Click Account.", "done": false}\n```';
    const result = parseVisionJson(input);
    expect(result.idx).toBe(2);
    expect(result.instruction).toBe("Click Account.");
  });

  it("parses JSON with leading prose", () => {
    const input = 'Based on the screenshot, the user should click:\n{"idx": 5, "fid": null, "instruction": "Click Notifications.", "done": false}';
    const result = parseVisionJson(input);
    expect(result.idx).toBe(5);
    expect(result.instruction).toBe("Click Notifications.");
  });

  it("defaults done to false when missing", () => {
    const result = parseVisionJson('{"idx": 1}');
    expect(result.done).toBe(false);
  });

  it('defaults instruction to "Click this." when missing', () => {
    const result = parseVisionJson('{"idx": 1}');
    expect(result.instruction).toBe("Click this.");
  });

  it("preserves fid as null when absent", () => {
    const result = parseVisionJson('{"idx": 1}');
    // fid is not set by parseVisionJson defaults — it just passes through parsed object
    expect(result.fid).toBeUndefined();
  });

  it('recovers "task complete" prose as done signal', () => {
    const result = parseVisionJson("The profile has been updated. Task complete.");
    expect(result.idx).toBe(-1);
    expect(result.done).toBe(true);
    expect(result.instruction).toBe("Task complete.");
  });

  it('recovers "no further action" prose as done signal', () => {
    const result = parseVisionJson("Everything looks good. No further action is needed.");
    expect(result.idx).toBe(-1);
    expect(result.done).toBe(true);
  });

  it('recovers "cannot determine" prose as done signal', () => {
    const result = parseVisionJson("I cannot determine which element to click next.");
    expect(result.idx).toBe(-1);
    expect(result.done).toBe(true);
  });

  it("throws for unrecoverable non-JSON", () => {
    expect(() => parseVisionJson("I'm sorry, I can't help with that request."))
      .toThrow("vision returned non-JSON");
  });

  it("throws when JSON lacks idx field", () => {
    expect(() => parseVisionJson('{"instruction": "Click something.", "done": false}'))
      .toThrow("vision returned non-JSON");
  });
});
