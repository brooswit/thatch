import { describe, expect, test } from "bun:test";
import { badMetaKeys, validateFrame } from "../../src/protocol/frame.js";
import { delivered } from "../../src/protocol/delivery.js";
import { CHANNEL_METHOD, CHANNEL_CAPABILITY } from "../../src/protocol/method.js";

describe("frame validation", () => {
  test("bad meta keys: non-string values, and non-objects", () => {
    expect(badMetaKeys({ a: "ok", b: 1, c: true, d: "ok" })).toEqual(["b", "c"]);
    expect(badMetaKeys({})).toEqual([]);
    expect(badMetaKeys(null)).toEqual(["<meta is not an object>"]);
    expect(badMetaKeys([1])).toEqual(["<meta is not an object>"]);
  });
  test("validateFrame gates content and meta", () => {
    expect(validateFrame({ content: "x", meta: { a: "b" } })).toEqual({ ok: true });
    expect(validateFrame({ content: 1 as unknown as string, meta: {} })).toMatchObject({ ok: false });
    expect(validateFrame({ content: "x", meta: { n: 1 as unknown as string } })).toEqual({ ok: false, keys: ["n"] });
  });
});
describe("delivery + method constants", () => {
  test("delivered narrows to C2", () => {
    expect(delivered({ claim: "C2" })).toBe(true);
    expect(delivered({ claim: "refused", reason: "not-connected" })).toBe(false);
  });
  test("channel method and capability", () => {
    expect(CHANNEL_METHOD).toBe("notifications/claude/channel");
    expect(CHANNEL_CAPABILITY).toEqual({ experimental: { "claude/channel": {} } });
  });
});
