import type { z } from "zod";
import type { Connection } from "../registry/connection.js";
import type { OnDuplicate } from "../registry/registry.js";

export type Identity<Meta> = string | ({ name: string } & Meta) | null | undefined;

export interface ToolDef<Meta, Shape extends z.ZodRawShape = z.ZodRawShape> {
  description: string;
  input: Shape;
  handler: (args: z.infer<z.ZodObject<Shape>>, connection: Connection<Meta>) => unknown | Promise<unknown>;
}

export interface McpOptions<Meta = Record<string, unknown>> {
  /** Mount path. Default "/mcp". */
  path?: string;
  /** Who is this? Return a name (string) or `{ name, ...meta }`. Return null/undefined to reject. */
  identify: (req: Request) => Identity<Meta> | Promise<Identity<Meta>>;
  /** A name that is already connected: "replace" (default) drops the old one; "reject" refuses the new one. */
  onDuplicate?: OnDuplicate;
  /** Sends remembered per name. Default 50. 0 disables. */
  history?: number;
  /** The tools. The ONLY way a tool exists. */
  tools?: Record<string, ToolDef<Meta, any>>;
  /** Reported to clients at initialize. */
  serverInfo?: { name: string; version: string };
}
