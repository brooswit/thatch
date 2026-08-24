import { McpServer } from "@modelcontextprotocol/sdk/server/mcp.js";
import { WebStandardStreamableHTTPServerTransport } from "@modelcontextprotocol/sdk/server/webStandardStreamableHttp.js";
import { z } from "zod";
import { CHANNEL_CAPABILITY } from "../protocol/method.js";
import type { Pushable } from "../channel/sender.js";
import type { Connection } from "../registry/connection.js";
import type { ToolDef } from "./options.js";

/** One connected client: its own McpServer + transport. Implements Pushable for the channel. */
export class Session<Meta> implements Pushable {
  readonly server: McpServer;
  readonly transport: WebStandardStreamableHTTPServerTransport;

  /** True while the client holds an open server→client SSE stream (a GET). Only then can a pushed frame land. */
  channelAttached = false;
  private onAttachChange?: (attached: boolean) => void;

  private constructor(server: McpServer, transport: WebStandardStreamableHTTPServerTransport) {
    this.server = server; this.transport = transport;
  }

  onAttach(fn: (attached: boolean) => void): void { this.onAttachChange = fn; }

  static async open<Meta>(opts: {
    serverInfo: { name: string; version: string };
    tools: Record<string, ToolDef<Meta, any>>;
    connection: () => Connection<Meta>;
    sessionId: string;
    onClose: () => void;
  }): Promise<Session<Meta>> {
    const server = new McpServer(opts.serverInfo, { capabilities: { ...CHANNEL_CAPABILITY, tools: {} } });
    for (const [name, def] of Object.entries(opts.tools)) {
      server.tool(name, def.description, def.input, async (args: unknown) => {
        const out = await def.handler(args as never, opts.connection());
        return { content: [{ type: "text" as const, text: typeof out === "string" ? out : JSON.stringify(out) }] };
      });
    }
    const transport = new WebStandardStreamableHTTPServerTransport({ sessionIdGenerator: () => opts.sessionId });
    transport.onclose = opts.onClose;
    await server.connect(transport);
    return new Session(server, transport);
  }

  notify(method: string, params: unknown): Promise<void> {
    return this.server.server.notification({ method, params: params as Record<string, unknown> });
  }

  async handle(req: Request): Promise<Response> {
    const res = await this.transport.handleRequest(req);
    // A GET that returns an SSE body IS the standalone notification stream. Mark
    // the channel reachable while it lives; flip back when the body closes.
    if (req.method === "GET" && res.body && res.headers.get("content-type")?.includes("text/event-stream")) {
      this.setAttached(true);
      const reader = res.body.getReader();
      const done = () => this.setAttached(false);
      const watched = new ReadableStream<Uint8Array>({
        async pull(controller) {
          try {
            const { done: end, value } = await reader.read();
            if (end) { controller.close(); done(); } else controller.enqueue(value);
          } catch (e) { controller.error(e); done(); }
        },
        cancel(reason) { void reader.cancel(reason); done(); },   // client hung up
      });
      return new Response(watched, { status: res.status, headers: res.headers });
    }
    return res;
  }

  private setAttached(v: boolean): void { if (this.channelAttached !== v) { this.channelAttached = v; this.onAttachChange?.(v); } }
  async close(): Promise<void> { await this.transport.close().catch(() => {}); await this.server.close().catch(() => {}); }
}
export { z };
