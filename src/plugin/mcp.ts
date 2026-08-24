import { Elysia } from "elysia";
import { Registry } from "../registry/registry.js";
import { Sender, type Pushable } from "../channel/sender.js";
import type { Connection, DisconnectReason } from "../registry/connection.js";
import type { Frame } from "../protocol/frame.js";
import type { Delivery } from "../protocol/delivery.js";
import type { McpOptions } from "./options.js";
import { Session } from "./session.js";

const SESSION_HEADER = "mcp-session-id";

/** What `app.mcp` exposes. */
export interface McpHandle<Meta> {
  connections: Pick<Registry<Meta, Pushable>, "list" | "get" | "has" | "count" | "waitFor">;
  send(name: string, frame: Frame): Promise<Delivery>;
  sendMany(names: readonly string[], frame: Frame): ReturnType<Sender<Meta>["sendMany"]>;
  sendAll(frame: Frame, opts?: { where?: (c: Connection<Meta>) => boolean }): ReturnType<Sender<Meta>["sendAll"]>;
  on(event: "connect", fn: (c: Connection<Meta>) => void): () => void;
  on(event: "disconnect", fn: (c: Connection<Meta>, reason: DisconnectReason) => void): () => void;
  on(event: "send", fn: (c: Connection<Meta>, frame: Frame, delivery: Delivery) => void): () => void;
  /** Tear down every session. */
  closeAll(): Promise<void>;
}

function build<Meta = Record<string, unknown>>(o: McpOptions<Meta>) {
  const path = o.path ?? "/mcp";
  const registry = new Registry<Meta, Session<Meta>>({ onDuplicate: o.onDuplicate ?? "replace", history: o.history ?? 50 });
  const sender = new Sender<Meta>(registry as unknown as Registry<Meta, Pushable>);
  const bySession = new Map<string, string>(); // session id → name
  const serverInfo = o.serverInfo ?? { name: "thatch", version: "0" };

  async function fetchHandler(req: Request): Promise<Response> {
    const sid = req.headers.get(SESSION_HEADER);
    // existing session → route to it
    if (sid) {
      const name = bySession.get(sid);
      const entry = name ? registry.entry(name) : undefined;
      if (!entry) return new Response(JSON.stringify({ error: "unknown session" }), { status: 404, headers: { "content-type": "application/json" } });
      registry.touch(name!);
      return entry.handle.handle(req);
    }
    // new connection: only an initialize POST may open one
    if (req.method !== "POST") return new Response("session required", { status: 400 });
    const id = await o.identify(req);
    const name = typeof id === "string" ? id : id?.name;
    if (!name) return new Response(JSON.stringify({ error: "identify() rejected this connection" }), { status: 401, headers: { "content-type": "application/json" } });
    const meta = (typeof id === "string" ? {} : (({ name: _n, ...rest }) => rest)(id!)) as Meta;
    const sessionId = crypto.randomUUID();
    const session = await Session.open<Meta>({
      serverInfo, tools: o.tools ?? {}, sessionId,
      connection: () => registry.get(name)!,
      onClose: () => { if (bySession.get(sessionId) === name) { bySession.delete(sessionId); registry.remove(name, "closed"); } },
    });
    const entry = registry.add(name, meta, session, (old) => { void old.close(); }, (h) => h.channelAttached);
    if (!entry) { await session.close(); return new Response(JSON.stringify({ error: `"${name}" is already connected` }), { status: 409, headers: { "content-type": "application/json" } }); }
    bySession.set(sessionId, name);
    return session.handle(req);
  }

  const handle: McpHandle<Meta> = {
    connections: registry,
    send: (n, f) => sender.send(n, f),
    sendMany: (n, f) => sender.sendMany(n, f),
    sendAll: (f, opts) => sender.sendAll(f, opts),
    on: ((event: string, fn: any) => event === "send" ? sender.onSend(fn) : registry.on(event as "connect" | "disconnect", fn)) as McpHandle<Meta>["on"],
    closeAll: async () => { for (const c of registry.list()) { const e = registry.entry(c.name); registry.remove(c.name, "closed"); await e?.handle.close(); } },
  };

  const plugin = new Elysia({ name: "thatch" }).all(path, (ctx) => fetchHandler(ctx.request));
  return { plugin, mcp: handle };
}

/**
 * Build a thatch MCP endpoint.
 *
 *   const { plugin, mcp } = thatch({ identify, tools });
 *   const app = new Elysia().use(plugin).listen(3000);
 *   await mcp.send("epic-kan-39", { content: "...", meta: {} });
 *
 * `plugin` mounts the endpoint (default `/mcp`); `mcp` is the handle daemon-side
 * code holds — registry, sends, events — usable without a reference to the app.
 */
export function thatch<Meta = Record<string, unknown>>(o: McpOptions<Meta>): { plugin: Elysia; mcp: McpHandle<Meta> } {
  const { plugin, mcp } = build<Meta>(o);
  return { plugin: plugin as Elysia, mcp };
}