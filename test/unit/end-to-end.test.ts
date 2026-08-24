import { describe, expect, test } from "bun:test";
import { Elysia } from "elysia";
import { thatch, z, type Delivery, type McpHandle } from "../../src/index.js";
import { FakeConnection } from "../../src/testing/index.js";

type Meta = { role: string };

/** A fresh server per test — no state leaks between cases. */
function fresh(opts?: Partial<Parameters<typeof thatch<Meta>>[0]>) {
  const { plugin, mcp } = thatch<Meta>({
    identify: (req) => {
      const n = req.headers.get("x-connection-name");
      return n ? { name: n, role: req.headers.get("x-role") ?? "none" } : null;
    },
    tools: {
      echo: { description: "echo", input: { text: z.string() }, handler: ({ text }, c) => ({ text, from: c.name, role: c.meta.role }) },
      fail: { description: "throws", input: {}, handler: () => { throw new Error("boom"); } },
    },
    ...(opts ?? {}),
  });
  const app = new Elysia().use(plugin).listen(0);
  return { mcp, base: `http://localhost:${app.server!.port}`, stop: async () => { await mcp.closeAll(); app.stop(); } };
}

/** connect and wait until the client's notification stream is up (channelReady) — no probe frames. */
async function ready(mcp: McpHandle<Meta>, base: string, name: string, headers?: Record<string, string>) {
  const c = await FakeConnection.connect(base, name, headers ? { headers } : {});
  for (let i = 0; i < 200 && !mcp.connections.get(name)?.channelReady; i++) await Bun.sleep(10);
  return c;
}

describe("thatch end to end over real HTTP", () => {
  test("connect populates the registry; tools list and call receive the connection", async () => {
    const { mcp, base, stop } = fresh();
    const a = await FakeConnection.connect(base, "alpha", { headers: { "x-role": "supervisor" } });
    expect(mcp.connections.list().map((c) => c.name)).toEqual(["alpha"]);
    expect((await a.listTools()).map((t) => t.name).sort()).toEqual(["echo", "fail"]);
    expect(await a.callTool("echo", { text: "hi" })).toEqual({ text: "hi", from: "alpha", role: "supervisor" });
    await a.disconnect(); await stop();
  });

  test("send is C2 and the frame arrives; bad meta and absent name refuse; history records all three by name", async () => {
    const { mcp, base, stop } = fresh();
    const a = await ready(mcp, base, "beta");
    expect(await mcp.send("beta", { content: "ping", meta: { k: "v" } })).toEqual({ claim: "C2" });
    expect(await a.nextFrame()).toEqual({ content: "ping", meta: { k: "v" } });
    expect(await mcp.send("beta", { content: "x", meta: { n: 1 as unknown as string } })).toMatchObject({ claim: "refused", reason: "bad-meta", keys: ["n"] });
    expect(await mcp.send("nobody", { content: "x", meta: {} })).toEqual({ claim: "refused", reason: "not-connected" });
    expect(mcp.connections.get("beta")!.history.map((h) => (h.delivery as Delivery).claim)).toEqual(["C2", "refused"]);
    await a.disconnect(); await stop();
  });

  test("a registered connection with no notification stream refuses as no-channel-stream, not a false C2", async () => {
    const { mcp, base, stop } = fresh();
    const r = await fetch(`${base}/mcp`, {
      method: "POST",
      headers: { "content-type": "application/json", accept: "application/json, text/event-stream", "x-connection-name": "silent" },
      body: JSON.stringify({ jsonrpc: "2.0", id: 1, method: "initialize", params: { protocolVersion: "2025-03-26", capabilities: {}, clientInfo: { name: "p", version: "0" } } }),
    });
    await r.text();
    expect(mcp.connections.has("silent")).toBe(true);
    expect(mcp.connections.get("silent")!.channelReady).toBe(false);
    expect(await mcp.send("silent", { content: "x", meta: {} })).toEqual({ claim: "refused", reason: "no-channel-stream" });
    await stop();
  });

  test("identify() null → connect rejects (401); a throwing tool is an error, not a crash", async () => {
    const { mcp, base, stop } = fresh();
    await expect(FakeConnection.connect(base, "", {})).rejects.toThrow();
    const a = await FakeConnection.connect(base, "gamma");
    await expect(a.callTool("fail")).rejects.toThrow();
    expect(mcp.connections.has("gamma")).toBe(true);
    await a.disconnect(); await stop();
  });

  test("duplicate name: replace drops the old (reason=replaced) and routes to the new", async () => {
    const { mcp, base, stop } = fresh();
    const reasons: string[] = [];
    mcp.on("disconnect", (_c, rs) => reasons.push(rs));
    const a1 = await ready(mcp, base, "delta");
    const a2 = await ready(mcp, base, "delta");
    expect(mcp.connections.count()).toBe(1);
    expect(reasons).toEqual(["replaced"]);
    expect(await mcp.send("delta", { content: "to-new", meta: {} })).toEqual({ claim: "C2" });
    expect(await a2.nextFrame()).toMatchObject({ content: "to-new" });
    await a2.disconnect(); await a1.disconnect().catch(() => {}); await stop();
  });

  test("duplicate name: reject refuses the second connection", async () => {
    const { mcp, base, stop } = fresh({ onDuplicate: "reject" });
    const s1 = await FakeConnection.connect(base, "eps");
    await expect(FakeConnection.connect(base, "eps")).rejects.toThrow();
    expect(mcp.connections.count()).toBe(1);
    await s1.disconnect(); await stop();
  });

  test("sendMany reports sent/refused; sendAll honours where; waitFor resolves then rejects on timeout", async () => {
    const { mcp, base, stop } = fresh();
    const p = mcp.connections.waitFor("zeta", { timeoutMs: 3000 });
    const z1 = await ready(mcp, base, "zeta", { "x-role": "a" });
    expect((await p).name).toBe("zeta");
    const z2 = await ready(mcp, base, "eta", { "x-role": "b" });
    expect(await mcp.sendMany(["zeta", "ghost"], { content: "m", meta: {} })).toEqual({ sent: ["zeta"], refused: [{ name: "ghost", reason: "not-connected" }] });
    expect((await mcp.sendAll({ content: "all", meta: {} }, { where: (c) => c.meta.role === "b" })).sent).toEqual(["eta"]);
    await expect(mcp.connections.waitFor("never", { timeoutMs: 50 })).rejects.toThrow(/not connected within/);
    await z1.disconnect(); await z2.disconnect(); await stop();
  });
});
