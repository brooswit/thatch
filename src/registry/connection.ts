import type { Delivery } from "../protocol/delivery.js";
import type { Frame } from "../protocol/frame.js";

/**
 * A connected client. Identity is a server-assigned UUID — the library imposes
 * no naming. Every header from the initialize request is held for the app to
 * use however it likes (including `authorization`/`cookie`: treat a connection
 * list as sensitive).
 */
export interface Connection {
  readonly id: string;
  readonly headers: Readonly<Record<string, string>>;
  readonly connectedAt: number;
  lastSeenAt: number;
  /** True only while the client's notification stream is attached — a pushed frame can land (claim C2). */
  readonly channelReady: boolean;
  /** Push a frame to this connection. Sugar for `mcp.send(id, frame)`, routed by id so a stale reference refuses cleanly. */
  send(frame: Frame): Promise<Delivery>;
  /** Disconnect this client. */
  close(): Promise<void>;
}

export type DisconnectReason = "closed" | "error";
