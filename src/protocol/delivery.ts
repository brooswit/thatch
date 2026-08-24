/**
 * What a send can honestly claim. Never `void`.
 *
 *  C2 — a connected client's transport accepted the frame. That is the strongest
 *       claim this library can make: whether the frame entered the transcript (C3)
 *       or the model read it (C4) is not observable from here, and no API here
 *       will pretend otherwise.
 *
 *  A registered connection whose client has not opened (or has dropped) its
 *  server-to-client notification stream is "not-connected"'s quieter sibling,
 *  `no-channel-stream`: the tool calls work, but a pushed frame has nowhere to
 *  land. The SDK drops it in silence; this library refuses it out loud. That
 *  distinction is the whole reason this type is not `Promise<void>`.
 */
export type Delivery =
  | { claim: "C2" }
  | { claim: "refused"; reason: "not-connected" }
  | { claim: "refused"; reason: "no-channel-stream" }
  | { claim: "refused"; reason: "bad-meta"; keys: string[] }
  | { claim: "refused"; reason: "closed-mid-send"; detail: string };

export const delivered = (d: Delivery): d is { claim: "C2" } => d.claim === "C2";
