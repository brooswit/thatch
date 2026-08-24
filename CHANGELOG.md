# Changelog

All notable changes to `@brooswit/thatch`. Format is [Keep a Changelog](https://keepachangelog.com/en/1.1.0/);
entries are `## [x.y.z] - YYYY-MM-DD` with subsections from: `BREAKING`, `Added`, `Changed`, `Fixed`, `Removed`.
CI refuses a merge that changes `src/`, `schema/` or `package.json` without a new entry here.

## Versioning — what the numbers mean in this project

- **MAJOR** — a restructuring or rewrite that breaks a lot of things, requiring reimplementation by consumers. Requires a `### BREAKING` section.
- **MINOR** — a new feature, or a change to an existing feature that breaks just that feature.
- **PATCH** — a fix or correction that requires no consumer code changes, or very minor ones.

## [0.2.0] - 2026-08-24
### Changed
- Connections are identified by a server-assigned **UUID**, not a caller-supplied name. `identify` and `onDuplicate` are removed; every client is accepted (reject unwanted ones with an Elysia route guard before the handler). A connection now **holds all its request headers** (`connection.headers`, including `authorization`/`cookie` — treat a connection list as sensitive), and you address/find connections by id or by a header predicate.
### Added
- `connection.send(frame)` and `connection.close()`.
- `connections.find(pred)` / `connections.filter(pred)`; `mcp.once(event)` (promise) and `mcp.off(event, fn)`.
- Send history and `disconnect` reasons are now keyed by connection id (history no longer spans a reconnect — a new connection is a new id).

## [0.1.0] - 2026-08-24
### Added
- `thatch()` — an Elysia plugin + handle for a central HTTP MCP server that many Claude Code sessions connect to by URL.
- Named connections: `identify()` names each connection; `connections.{list,get,has,count,waitFor}`; `onDuplicate: "replace" | "reject"`.
- A channel that pushes `<channel>` frames into a session, addressed by name: `send`, `sendMany`, `sendAll`.
- `Delivery` — a discriminated union, never `void`. `C2` is claimed only when a client's notification stream is actually attached; a registered connection with no stream refuses as `no-channel-stream` rather than a false success. Non-string meta refuses as `bad-meta` instead of being silently dropped.
- Per-name send history (survives reconnect), events (`connect`/`disconnect`/`send`), and `connection.channelReady`.
- `@brooswit/thatch/testing` — `FakeConnection`, a Claude-Code stand-in over real HTTP.
