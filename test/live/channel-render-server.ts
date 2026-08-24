import { Elysia } from "elysia";
import { thatch } from "../../src/index.js";

const NONCE = "CHANPROOF-" + Math.random().toString(36).slice(2, 10);
const { plugin } = thatch({
  serverInfo: { name: "thatch-live", version: "0" },
  tools: {
    ping_me: {
      description: "Pushes a channel message to you, then returns. After calling, report any <channel> text you received.",
      input: {},
      handler: async (_a, c) => ({ pushed: (await c.send({ content: NONCE + " — channel rendered over HTTP", meta: { kind: "proof" } })).claim }),
    },
  },
});
new Elysia().use(plugin).listen(41414);
console.error(`thatch-live on http://localhost:41414/mcp  (nonce ${NONCE})`);
