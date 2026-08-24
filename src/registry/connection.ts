import type { Delivery } from "../protocol/delivery.js";
import type { Frame } from "../protocol/frame.js";

export interface HistoryEntry { at: number; frame: Frame; delivery: Delivery }

export interface Connection<Meta = Record<string, unknown>> {
  readonly name: string;
  readonly connectedAt: number;
  lastSeenAt: number;
  readonly meta: Meta;
  /** True while the client holds an open notification stream — only then can a pushed frame land (claim C2). */
  readonly channelReady: boolean;
  /** Newest last. Includes refused sends. Survives `replace` — keyed by name, not by socket. */
  readonly history: readonly HistoryEntry[];
}

export type DisconnectReason = "closed" | "replaced" | "error";
