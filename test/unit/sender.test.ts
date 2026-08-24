import { describe, expect, test } from "bun:test";
import { Sender } from "../../src/channel/sender.js";
import { Registry } from "../../src/registry/registry.js";
import type { Connection } from "../../src/registry/connection.js";

function rig() {
  const r = new Registry<{ channelAttached: boolean; notify: any }>();
  const s = new Sender(r as any);
  const rec = (id: string): Connection => ({ id, headers: {}, connectedAt: 0, send: async () => ({ claim: "C2" }), close: async () => {} });
  const add = (id: string, opts: { attached?: boolean; throws?: boolean } = {}) => {
    const h = { channelAttached: opts.attached ?? true, notify: opts.throws ? () => Promise.reject(new Error("gone")) : () => Promise.resolve() };
    r.add(id, h as any, rec);
    return h;
  };
  return { r, s, add };
}

describe("Sender (uuid)", () => {
  test("attached → C2, still C2", async () => {
    const { r, s, add } = rig(); add("a");
    expect(await s.send("a", { content: "x", meta: {} })).toEqual({ claim: "C2" });
  });
  test("bad meta before touching the handle", async () => {
    const { s, add } = rig(); add("a");
    expect(await s.send("a", { content: "x", meta: { n: 1 as any } })).toMatchObject({ claim: "refused", reason: "bad-meta", keys: ["n"] });
  });
  test("absent id → not-connected, recorded by id", async () => {
    const { r, s } = rig();
    expect(await s.send("ghost", { content: "x", meta: {} })).toEqual({ claim: "refused", reason: "not-connected" });
  });
  test("connected but no stream → no-channel-stream", async () => {
    const { s, add } = rig(); add("a", { attached: false });
    expect(await s.send("a", { content: "x", meta: {} })).toEqual({ claim: "refused", reason: "no-channel-stream" });
  });
  test("notify throws → closed-mid-send with detail", async () => {
    const { s, add } = rig(); add("a", { throws: true });
    expect(await s.send("a", { content: "x", meta: {} })).toMatchObject({ claim: "refused", reason: "closed-mid-send", detail: "gone" });
  });
  test("sendMany splits sent/refused by id; sendAll filters; onSend fires", async () => {
    const { s, add } = rig(); add("a"); add("b"); add("c", { attached: false });
    const sends: string[] = []; const off = s.onSend((c) => sends.push(c.id));
    expect(await s.sendMany(["a", "ghost"], { content: "x", meta: {} })).toEqual({ sent: ["a"], refused: [{ id: "ghost", reason: "not-connected" }] });
    expect((await s.sendAll({ content: "x", meta: {} })).sent.sort()).toEqual(["a", "b"]);
    expect((await s.sendAll({ content: "x", meta: {} }, { where: (c) => c.id === "b" })).sent).toEqual(["b"]);
    off(); expect(sends.length).toBeGreaterThan(0);
  });
});
