# Live proof: does Claude Code render a thatch channel frame over HTTP?

The unit/e2e suite covers everything up to "the frame leaves the server correctly addressed".
This last hop — Claude Code actually *rendering* `notifications/claude/channel` — cannot be
proven headlessly and must be checked in an **interactive** session.

## What we established (stock Claude Code 2.1.241, from the binary + live runs, 2026-08-24)

- The capability is real and present: `claude/channel`, `notifications/claude/channel`,
  `notifications/claude/channel/permission_request`.
- **CLI opt-in, per server:** `--channels server:<name>`. Untagged names are rejected;
  the valid forms are `server:<name>` (a manually configured MCP server) and
  `plugin:<name>@<marketplace>`.
- **A permission prompt:** a pushed frame raises `notifications/claude/channel/permission_request`,
  which the user accepts *in an interactive session*. `claude -p` has no one to accept it, so
  it is skipped — no "Channel notifications registered/skipped" line fires, and the debug shows
  `[session-notices] … nonInteractive flag=false(fallback)`. **Headless cannot receive channels.**
- **Managed-org opt-in:** the binary says "claude.ai Teams/Enterprise: default off; Console:
  default on unless a managed setting." A Teams/Enterprise account may also need the org to enable it.

## To verify by hand

1. Start a thatch server that pushes to its caller from a tool:
   ```
   bun run test/live/channel-render-server.ts        # http://localhost:41414/mcp, tool ping_me, prints a nonce
   ```
2. In another terminal, an **interactive** Claude Code pointed at it, with the channel opt-in:
   ```
   claude --mcp-config test/live/live-mcp.json --channels server:thatchlive
   ```
3. In that session, say: **call ping_me**. The tool pushes a `<channel>` frame back to the session
   (and may raise a permission prompt to accept).
   - A `<channel>…</channel>` block containing the nonce appears → thatch's channel renders over HTTP. ✅
   - Nothing appears → the remaining gate is the managed-org opt-in (Teams/Enterprise).
