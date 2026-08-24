# @brooswit/thatch

A central HTTP MCP server, as an [Elysia](https://elysiajs.com) plugin. Many Claude Code sessions connect to one server by URL; the server addresses them by name and can push messages into a live session.

```ts
import { Elysia } from "elysia";
import { thatch, z } from "@brooswit/thatch";

const { plugin, mcp } = thatch({
  tools: {
    status: { description: "Fleet status", input: {}, handler: (_a, c) => `hello ${c.id}` },
  },
});

const app = new Elysia().use(plugin).listen(3000);

// every client is accepted and gets a UUID; it holds all its request headers.
mcp.on("connect", (c) => console.log("connected", c.id, c.headers["x-workspace"]));

// address by a header predicate, then push into that session — from anywhere
const c = mcp.connections.find((c) => c.headers["x-workspace"] === "epic/KAN-39");
const d = await c?.send({ content: "PR #296 approved", meta: { key: "KAN-39" } });
//  d: { claim: "C2" }  — a connected session's stream took it
//     { claim: "refused", reason: "not-connected" | "no-channel-stream" | "bad-meta" | "closed-mid-send" }
```

Claude Code connects with:

```
claude mcp add --transport http fleet http://localhost:3000/mcp --header "x-workspace: epic/KAN-39"
```

## Why the delivery type is not `void`

Pushing into a session can fail in ways the MCP SDK hides: a connection can be registered while its notification stream isn't attached, in which case the SDK drops the frame silently. `thatch` refuses that out loud (`no-channel-stream`) and only claims `C2` when a stream is actually there to carry the frame. `C3` (entered the transcript) and `C4` (the model read it) are not observable, so no API here pretends to them.

## API

- `thatch({ tools?, auth?, path?, history?, serverInfo? })` → `{ plugin, mcp }`. Every client is accepted and assigned a UUID. Gate connections with `auth(req) => boolean` (default accepts all); it does not identify — an accepted client still gets a UUID and holds its headers.
- `mcp.connections`: `list()`, `get(id)`, `has(id)`, `count()`, `find(pred)`, `filter(pred)`.
- `mcp.send(id, frame)`, `mcp.sendMany(ids, frame)`, `mcp.sendAll(frame, { where? })`.
- `mcp.on/once/off` for `connect` / `disconnect`.
- A `Connection` carries `id`, `headers` (all of them), `connectedAt`, and methods `send(frame)` / `close()`. No built-in history, `lastSeenAt`, or readiness flag — subscribe to the `send` event and key it however you like; the `send` result tells you if a frame could not land.
- `import { FakeConnection } from "@brooswit/thatch/testing"` for tests.

## Layers

`protocol` (frame, delivery, method — pure) · `registry` (named connections + history) · `channel` (sending, honest claims) · `plugin` (the Elysia mount, one MCP server per connection) · `testing`.

## Scripts

```
bun run check        # generate load tests + typecheck + unit + load + coverage ≥90%
bun test test/unit
MCP_LIVE=1 bun test test/live   # against a real Claude Code session (opt-in)
```
