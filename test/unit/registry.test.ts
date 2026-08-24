import { describe, expect, test } from "bun:test";
import { Registry } from "../../src/registry/registry.js";
import type { Connection } from "../../src/registry/connection.js";

const rec = (id: string, extra: Partial<Connection> = {}): Connection => ({
  id, headers: {}, connectedAt: 0, lastSeenAt: 0, channelReady: false,
  send: async () => ({ claim: "not-connected" as never }), close: async () => {}, ...extra,
});

describe("Registry (uuid-keyed)", () => {
  test("add/get/has/count/list/find/filter and connect event", () => {
    const r = new Registry<{ n: number }>();
    const seen: string[] = []; r.on("connect", (c) => seen.push(c.id));
    r.add("id-1", { n: 1 }, (id) => rec(id, { headers: { role: "a" } }));
    r.add("id-2", { n: 2 }, (id) => rec(id, { headers: { role: "b" } }));
    expect(r.count()).toBe(2); expect(r.has("id-1")).toBe(true);
    expect(r.get("id-1")!.headers.role).toBe("a");
    expect(r.find((c) => c.headers.role === "b")!.id).toBe("id-2");
    expect(r.filter((c) => c.headers.role === "a").map((c) => c.id)).toEqual(["id-1"]);
    expect(seen).toEqual(["id-1", "id-2"]);
  });
  test("remove fires disconnect and is a no-op for an unknown id; touch updates lastSeenAt", async () => {
    const r = new Registry();
    const reasons: string[] = []; r.on("disconnect", (_c, why) => reasons.push(why));
    r.remove("ghost", "closed"); expect(reasons).toEqual([]);
    r.add("a", {}, (id) => rec(id));
    const t0 = r.get("a")!.lastSeenAt; await Bun.sleep(2); r.touch("a");
    expect(r.get("a")!.lastSeenAt).toBeGreaterThanOrEqual(t0);
    r.remove("a", "error"); expect(reasons).toEqual(["error"]); expect(r.count()).toBe(0);
  });
  test("on returns an unsubscribe; off removes; once resolves on the next event", async () => {
    const r = new Registry();
    let n = 0; const off = r.on("connect", () => n++);
    const p = r.once("connect");
    r.add("a", {}, (id) => rec(id));
    expect((await p).id).toBe("a");
    off(); r.add("b", {}, (id) => rec(id));
    expect(n).toBe(1); // off() worked
    const fn = () => n++; r.on("connect", fn); r.off("connect", fn);
    r.add("c", {}, (id) => rec(id)); expect(n).toBe(1);
  });
});
