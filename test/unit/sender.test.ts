import { describe, expect, test } from "bun:test";
import { Sender } from "../../src/channel/sender.js";
import { Registry } from "../../src/registry/registry.js";

/** A registry whose handles are fake Pushables; drives every Sender branch without HTTP. */
function rig() {
  const r = new Registry<Record<string, unknown>, { attached: boolean; notify: any }>({ onDuplicate: "replace", history: 10 });
  const s = new Sender<Record<string, unknown>>(r as any);
  const add = (name: string, opts: { attached?: boolean; throws?: boolean } = {}) => {
    const h = { attached: opts.attached ?? true, notify: opts.throws ? () => Promise.reject(new Error("gone")) : () => Promise.resolve(), channelAttached: opts.attached ?? true };
    r.add(name, {}, h as any, () => {}, (x: any) => x.channelAttached);
    return h;
  };
  return { r, s, add };
}

describe("Sender", () => {
  test("attached connection → C2, recorded in history", async () => {
    const { r, s, add } = rig(); add("a");
    expect(await s.send("a", { content: "x", meta: {} })).toEqual({ claim: "C2" });
    expect(r.get("a")!.history.at(-1)!.delivery).toEqual({ claim: "C2" });
  });
  test("bad meta → refused before touching the handle", async () => {
    const { s, add } = rig(); add("a");
    expect(await s.send("a", { content: "x", meta: { n: 1 as any } })).toMatchObject({ claim: "refused", reason: "bad-meta", keys: ["n"] });
  });
  test("absent name → not-connected, still recorded by name", async () => {
    const { r, s } = rig();
    expect(await s.send("ghost", { content: "x", meta: {} })).toEqual({ claim: "refused", reason: "not-connected" });
    expect(r.history.get("ghost").at(-1)!.delivery).toMatchObject({ reason: "not-connected" });
  });
  test("connected but no stream → no-channel-stream", async () => {
    const { s, add } = rig(); add("a", { attached: false });
    expect(await s.send("a", { content: "x", meta: {} })).toEqual({ claim: "refused", reason: "no-channel-stream" });
  });
  test("notify throws mid-send → closed-mid-send with detail", async () => {
    const { s, add } = rig(); add("a", { throws: true });
    expect(await s.send("a", { content: "x", meta: {} })).toMatchObject({ claim: "refused", reason: "closed-mid-send", detail: "gone" });
  });
  test("sendMany splits sent/refused; sendAll filters with where; onSend fires for connected", async () => {
    const { s, add } = rig(); add("a"); add("b"); add("c", { attached: false });
    const sends: string[] = []; const off = s.onSend((c) => sends.push(c.name));
    expect(await s.sendMany(["a", "ghost"], { content: "x", meta: {} })).toEqual({ sent: ["a"], refused: [{ name: "ghost", reason: "not-connected" }] });
    expect((await s.sendAll({ content: "x", meta: {} })).sent.sort()).toEqual(["a", "b"]);
    expect((await s.sendAll({ content: "x", meta: {} }, { where: (c) => c.name === "b" })).sent).toEqual(["b"]);
    off();
    expect(sends.length).toBeGreaterThan(0);
  });
});
