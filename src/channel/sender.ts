import { CHANNEL_METHOD } from "../protocol/method.js";
import type { Delivery } from "../protocol/delivery.js";
import { validateFrame, type Frame } from "../protocol/frame.js";
import type { Registry } from "../registry/registry.js";
import type { Connection } from "../registry/connection.js";

/** What a transport must offer: push a notification, and say whether a stream is there to carry it. */
export interface Pushable { notify(method: string, params: unknown): Promise<void>; readonly channelAttached: boolean }

export class Sender {
  constructor(private readonly registry: Registry<Pushable>) {}

  async send(id: string, frame: Frame): Promise<Delivery> {
    const v = validateFrame(frame);
    const entry = this.registry.entry(id);
    const delivery: Delivery = !v.ok
      ? { claim: "refused", reason: "bad-meta", keys: v.keys }
      : !entry
        ? { claim: "refused", reason: "not-connected" }
        : !entry.handle.channelAttached
        ? { claim: "refused", reason: "no-channel-stream" }
        : await entry.handle.notify(CHANNEL_METHOD, { content: frame.content, meta: frame.meta })
            .then((): Delivery => ({ claim: "C2" }))
            .catch((e): Delivery => ({ claim: "refused", reason: "closed-mid-send", detail: String(e?.message ?? e) }));
    return delivery;
  }

  async sendMany(ids: readonly string[], frame: Frame) {
    const sent: string[] = [], refused: Array<{ id: string; reason: Exclude<Delivery, { claim: "C2" }>["reason"] }> = [];
    for (const id of ids) { const d = await this.send(id, frame); d.claim === "C2" ? sent.push(id) : refused.push({ id, reason: d.reason }); }
    return { sent, refused };
  }

  sendAll(frame: Frame, opts: { where?: (c: Connection) => boolean } = {}) {
    return this.sendMany(this.registry.list().filter(opts.where ?? (() => true)).map((c) => c.id), frame);
  }
}
