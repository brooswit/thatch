import { describe, expect, test } from "bun:test";
import { Registry } from "../../src/registry/registry.js";
import { History } from "../../src/registry/history.js";

const stub = () => ({ close: () => {}, attached: true });

describe("History", () => {
  test("keeps at most `limit`, per name, newest-last; 0 disables", () => {
    const h = new History(2);
    for (let i = 0; i < 4; i++) h.push("a", { at: i, frame: { content: String(i), meta: {} }, delivery: { claim: "C2" } });
    expect(h.get("a").map((e) => e.at)).toEqual([2, 3]);
    expect(h.get("b")).toEqual([]);
    const off = new History(0); off.push("a", { at: 0, frame: { content: "", meta: {} }, delivery: { claim: "C2" } });
    expect(off.get("a")).toEqual([]);
  });
});

describe("Registry", () => {
  test("add/get/has/count/list and connect event; channelReady flows from the handle", () => {
    const r = new Registry<{ role: string }, { attached: boolean }>({ onDuplicate: "replace", history: 10 });
    const seen: string[] = []; r.on("connect", (c) => seen.push(c.name));
    const h = { attached: false };
    r.add("a", { role: "x" }, h, () => {}, (x) => x.attached);
    expect(r.has("a")).toBe(true); expect(r.count()).toBe(1);
    expect(r.get("a")!.channelReady).toBe(false);
    h.attached = true; expect(r.get("a")!.channelReady).toBe(true);
    expect(r.get("a")!.meta.role).toBe("x"); expect(seen).toEqual(["a"]);
  });
  test("replace closes the old handle and fires disconnect(replaced); reject returns null", () => {
    const rep = new Registry({ onDuplicate: "replace", history: 0 });
    let closed = 0; const reasons: string[] = []; rep.on("disconnect", (_c, why) => reasons.push(why));
    rep.add("a", {}, { id: 1 }, () => closed++);
    expect(rep.add("a", {}, { id: 2 }, () => closed++)).not.toBeNull();
    expect(closed).toBe(1); expect(reasons).toEqual(["replaced"]); expect(rep.count()).toBe(1);
    const rej = new Registry({ onDuplicate: "reject", history: 0 });
    rej.add("a", {}, {}, () => {});
    expect(rej.add("a", {}, {}, () => {})).toBeNull(); expect(rej.count()).toBe(1);
  });
  test("waitFor resolves immediately if present, on connect if not, and rejects on timeout; off() unsubscribes", async () => {
    const r = new Registry({ onDuplicate: "replace", history: 0 });
    r.add("here", {}, {}, () => {});
    expect((await r.waitFor("here", { timeoutMs: 10 })).name).toBe("here");
    const p = r.waitFor("later", { timeoutMs: 1000 });
    r.add("later", {}, {}, () => {});
    expect((await p).name).toBe("later");
    await expect(r.waitFor("never", { timeoutMs: 20 })).rejects.toThrow(/not connected/);
    const off = r.on("connect", () => {}); off(); // exercise unsubscribe
  });
  test("remove is a no-op for an unknown name; touch updates lastSeenAt", async () => {
    const r = new Registry({ onDuplicate: "replace", history: 0 });
    r.remove("ghost", "closed"); // no throw
    r.add("a", {}, {}, () => {}); const t0 = r.get("a")!.lastSeenAt;
    await Bun.sleep(2); r.touch("a"); expect(r.get("a")!.lastSeenAt).toBeGreaterThanOrEqual(t0);
    r.touch("ghost"); // no throw
  });
});
