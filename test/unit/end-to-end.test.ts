import { describe, expect, test } from "bun:test";
import { Elysia } from "elysia";
import { thatch, z, type Delivery, type McpHandle } from "../../src/index.js";
import { FakeConnection } from "../../src/testing/index.js";

function fresh(opts?: Parameters<typeof thatch>[0]) {
  const { plugin, mcp } = thatch({
    tools: {
      echo: { description: "echo", input: { text: z.string() }, handler: ({ text }, c) => ({ text, id: c.id, ws: c.headers["x-workspace"] ?? null }) },
      fail: { description: "throws", input: {}, handler: () => { throw new Error("boom"); } },
    },
    ...(opts ?? {}),
  });
  const app = new Elysia().use(plugin).listen(0);
  return { mcp, base: `http://localhost:${app.server!.port}`, stop: async () => { await mcp.closeAll(); app.stop(); } };
}
async function ready(mcp: McpHandle, base: string, headers?: Record<string, string>) {
  const c = await FakeConnection.connect(base, headers ? { headers } : {});
  const id = c.sessionId!;
  for (let i = 0; i < 200 && !mcp.connections.get(id)?.channelReady; i++) await Bun.sleep(10);
  return c;
}

describe("thatch (uuid connections) end to end over real HTTP", () => {
  test("every client is accepted, gets a uuid, and holds its headers", async () => {
    const { mcp, base, stop } = fresh();
    const a = await FakeConnection.connect(base, { headers: { "x-workspace": "epic/KAN-39", authorization: "Bearer secret" } });
    expect(mcp.connections.count()).toBe(1);
    const c = mcp.connections.list()[0]!;
    expect(c.id).toMatch(/^[0-9a-f-]{36}$/);
    expect(c.id).toBe(a.sessionId!);
    expect(c.headers["x-workspace"]).toBe("epic/KAN-39");
    expect(c.headers["authorization"]).toBe("Bearer secret"); // held as-is; connection list is sensitive
    expect(await a.callTool("echo", { text: "hi" })).toEqual({ text: "hi", id: c.id, ws: "epic/KAN-39" });
    await a.disconnect(); await stop();
  });

  test("find/filter by header; send by id and c.send both land; sendAll honours where", async () => {
    const { mcp, base, stop } = fresh();
    const a = await ready(mcp, base, { "x-role": "supervisor" });
    const b = await ready(mcp, base, { "x-role": "worker" });
    const sup = mcp.connections.find((c) => c.headers["x-role"] === "supervisor")!;
    expect(sup.id).toBe(a.sessionId!);
    expect(mcp.connections.filter((c) => c.headers["x-role"] === "worker").map((c) => c.id)).toEqual([b.sessionId!]);
    expect(await mcp.send(sup.id, { content: "by-id", meta: {} })).toEqual({ claim: "C2" });
    expect(await a.nextFrame()).toMatchObject({ content: "by-id" });
    expect(await sup.send({ content: "by-conn", meta: { k: "v" } })).toEqual({ claim: "C2" });
    expect(await a.nextFrame()).toEqual({ content: "by-conn", meta: { k: "v" } });
    expect((await mcp.sendAll({ content: "all", meta: {} }, { where: (c) => c.headers["x-role"] === "worker" })).sent).toEqual([b.sessionId!]);
    await a.disconnect(); await b.disconnect(); await stop();
  });

  test("refusals: bad meta, unknown id, and registered-but-no-stream; history is per id incl. refusals", async () => {
    const { mcp, base, stop } = fresh();
    const a = await ready(mcp, base);
    const id = a.sessionId!;
    expect(await mcp.send(id, { content: "ok", meta: {} })).toEqual({ claim: "C2" });
    expect(await mcp.send(id, { content: "x", meta: { n: 1 as unknown as string } })).toMatchObject({ claim: "refused", reason: "bad-meta", keys: ["n"] });
    expect(await mcp.send("no-such-uuid", { content: "x", meta: {} })).toEqual({ claim: "refused", reason: "not-connected" });
    expect(mcp.connections.get(id)!.history.map((h) => (h.delivery as Delivery).claim)).toEqual(["C2", "refused"]);
    await a.disconnect(); await stop();
  });

  test("no-channel-stream: a session that never opens its stream refuses, not a false C2", async () => {
    const { mcp, base, stop } = fresh();
    const r = await fetch(`${base}/mcp`, {
      method: "POST",
      headers: { "content-type": "application/json", accept: "application/json, text/event-stream" },
      body: JSON.stringify({ jsonrpc: "2.0", id: 1, method: "initialize", params: { protocolVersion: "2025-03-26", capabilities: {}, clientInfo: { name: "p", version: "0" } } }),
    });
    await r.text();
    const c = mcp.connections.list()[0]!;
    expect(c.channelReady).toBe(false);
    expect(await c.send({ content: "x", meta: {} })).toEqual({ claim: "refused", reason: "no-channel-stream" });
    await stop();
  });

  test("connect/disconnect/once events; c.close() disconnects and a stale reference refuses", async () => {
    const { mcp, base, stop } = fresh();
    const seen: string[] = [];
    mcp.on("connect", (c) => seen.push("+" + c.id.slice(0, 4)));
    const off = mcp.on("disconnect", (c, r) => seen.push(`-${c.id.slice(0, 4)}:${r}`));
    const pending = mcp.once("connect");
    const a = await ready(mcp, base);
    expect((await pending).id).toBe(a.sessionId!);
    const c = mcp.connections.get(a.sessionId!)!;
    await c.close(); await Bun.sleep(30);
    expect(mcp.connections.has(a.sessionId!)).toBe(false);
    expect(await c.send({ content: "x", meta: {} })).toEqual({ claim: "refused", reason: "not-connected" }); // stale ref
    expect(seen.some((s) => s.startsWith("+"))).toBe(true);
    expect(seen.some((s) => s.includes(":closed"))).toBe(true);
    off();
    await a.disconnect().catch(() => {}); await stop();
  });

  test("a throwing tool is an error, not a crash; the connection stays", async () => {
    const { mcp, base, stop } = fresh();
    const a = await FakeConnection.connect(base);
    await expect(a.callTool("fail")).rejects.toThrow();
    expect(mcp.connections.count()).toBe(1);
    await a.disconnect(); await stop();
  });

  test("sendMany reports sent/refused by id", async () => {
    const { mcp, base, stop } = fresh();
    const a = await ready(mcp, base);
    expect(await mcp.sendMany([a.sessionId!, "ghost"], { content: "m", meta: {} })).toEqual({ sent: [a.sessionId!], refused: [{ id: "ghost", reason: "not-connected" }] });
    await a.disconnect(); await stop();
  });
});

describe("thatch auth hook", () => {
  test("auth returning false refuses the connection (401); true (default) accepts", async () => {
    const { plugin, mcp } = thatch({ auth: (req) => req.headers.get("x-key") === "let-me-in" });
    const app = new Elysia().use(plugin).listen(0);
    const base = `http://localhost:${app.server!.port}`;
    await expect(FakeConnection.connect(base, { headers: { "x-key": "nope" } })).rejects.toThrow();
    expect(mcp.connections.count()).toBe(0);
    const ok = await FakeConnection.connect(base, { headers: { "x-key": "let-me-in" } });
    expect(mcp.connections.count()).toBe(1);
    await ok.disconnect(); await mcp.closeAll(); app.stop();
  });
  test("an async auth hook is awaited", async () => {
    const { plugin, mcp } = thatch({ auth: async (req) => { await Bun.sleep(1); return req.headers.get("x-ok") === "1"; } });
    const app = new Elysia().use(plugin).listen(0);
    const base = `http://localhost:${app.server!.port}`;
    await expect(FakeConnection.connect(base, { headers: {} })).rejects.toThrow();
    const ok = await FakeConnection.connect(base, { headers: { "x-ok": "1" } });
    expect(mcp.connections.count()).toBe(1);
    await ok.disconnect(); await mcp.closeAll(); app.stop();
  });
});
