import type { z } from "zod";
import type { Connection } from "../registry/connection.js";

export interface ToolDef<Shape extends z.ZodRawShape = z.ZodRawShape> {
  description: string;
  input: Shape;
  handler: (args: z.infer<z.ZodObject<Shape>>, connection: Connection) => unknown | Promise<unknown>;
}

export interface McpOptions {
  /**
   * Accept or reject a connecting client. Return false to refuse it (401).
   * Sees the raw request, so it can read any header. Default: accept everyone.
   * This is a GATE, not identity — an accepted client still gets a UUID and
   * holds its headers.
   */
  auth?: (req: Request) => boolean | Promise<boolean>;
  /** Mount path. Default "/mcp". */
  path?: string;
  /** Sends remembered per connection id. Default 50. 0 disables. */
  history?: number;
  /** The tools. The ONLY way a tool exists. */
  tools?: Record<string, ToolDef<any>>;
  /** Reported to clients at initialize. */
  serverInfo?: { name: string; version: string };
}
