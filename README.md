# @brooswit/thatch

A central HTTP MCP server, as an [Elysia](https://elysiajs.com) plugin. Many Claude Code sessions connect to one server by URL; the server addresses them by name and can push messages into a live session.

```ts
import { Elysia } from "elysia";
import { thatch, z } from "@brooswit/thatch";

const { plugin, mcp } = thatch({
  identify: (req) => req.headers.get("x-connection-name"),   // names the connection; null rejects it
  tools: {
    status: { description: "Fleet status", input: {}, handler: (_a, c) => `hello ${c.name}` },
  },
});

const app = new Elysia().use(plugin).listen(3000);

// push a message into a named session — from anywhere
const d = await mcp.send("epic-kan-39", { content: "PR #296 approved", meta: { key: "KAN-39" } });
//  d: { claim: "C2" }  — a connected session's stream took it
//     { claim: "refused", reason: "not-connected" | "no-channel-stream" | "bad-meta" | "closed-mid-send" }
```

Claude Code connects with:

```
claude mcp add --transport http fleet http://localhost:3000/mcp --header "x-connection-name: epic-kan-39"
```

## Why the delivery type is not `void`

Pushing into a session can fail in ways the MCP SDK hides: a connection can be registered while its notification stream isn't attached, in which case the SDK drops the frame silently. `thatch` refuses that out loud (`no-channel-stream`) and only claims `C2` when a stream is actually there to carry the frame. `C3` (entered the transcript) and `C4` (the model read it) are not observable, so no API here pretends to them.

## API

- `thatch(options)` → `{ plugin, mcp }` — `plugin` mounts the endpoint (default `/mcp`); `mcp` is the handle.
- `options`: `identify(req)`, `onDuplicate` (`"replace"` default | `"reject"`), `history` (default 50), `tools`, `path`, `serverInfo`.
- `mcp.connections`: `list()`, `get(name)`, `has(name)`, `count()`, `waitFor(name, { timeoutMs })`.
- `mcp.send(name, frame)`, `mcp.sendMany(names, frame)`, `mcp.sendAll(frame, { where? })`.
- `mcp.on("connect" | "disconnect" | "send", handler)`.
- A `Connection` carries `name`, `connectedAt`, `lastSeenAt`, `meta`, `channelReady`, and `history`.
- `import { FakeConnection } from "@brooswit/thatch/testing"` for tests.

## Layers

`protocol` (frame, delivery, method — pure) · `registry` (named connections + history) · `channel` (sending, honest claims) · `plugin` (the Elysia mount, one MCP server per connection) · `testing`.

## Scripts

```
bun run check        # generate load tests + typecheck + unit + load + coverage ≥90%
bun test test/unit
MCP_LIVE=1 bun test test/live   # against a real Claude Code session (opt-in)
```
