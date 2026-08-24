import type { Connection, DisconnectReason } from "./connection.js";
import { History } from "./history.js";

export type OnDuplicate = "replace" | "reject";

/** A live connection plus whatever the transport layer needs to reach it. */
export interface Entry<Meta, Handle> { record: Connection<Meta>; handle: Handle }

export interface RegistryEvents<Meta> {
  connect: (c: Connection<Meta>) => void;
  disconnect: (c: Connection<Meta>, reason: DisconnectReason) => void;
}

/**
 * The registry IS the source of truth for "who is connected". There is no
 * separate liveness probe: a name is present iff its transport is open.
 */
export class Registry<Meta = Record<string, unknown>, Handle = unknown> {
  private entries = new Map<string, Entry<Meta, Handle>>();
  private waiters = new Map<string, Array<(c: Connection<Meta>) => void>>();
  private listeners: { [K in keyof RegistryEvents<Meta>]: RegistryEvents<Meta>[K][] } = { connect: [], disconnect: [] };
  readonly history: History;

  constructor(private readonly opts: { onDuplicate: OnDuplicate; history: number }) {
    this.history = new History(opts.history);
  }

  /** Returns the entry, or null if rejected as a duplicate. `close` is invoked on a replaced handle. */
  add(name: string, meta: Meta, handle: Handle, close: (h: Handle) => void, channelReady: (h: Handle) => boolean = () => false): Entry<Meta, Handle> | null {
    const existing = this.entries.get(name);
    if (existing) {
      if (this.opts.onDuplicate === "reject") return null;
      this.remove(name, "replaced");
      close(existing.handle);
    }
    const self = this;
    const now = Date.now();
    const record: Connection<Meta> = {
      name, connectedAt: now, lastSeenAt: now, meta,
      get channelReady() { return channelReady(handle); },
      get history() { return self.history.get(name); },
    };
    const entry = { record, handle };
    this.entries.set(name, entry);
    for (const l of this.listeners.connect) l(record);
    for (const w of this.waiters.get(name) ?? []) w(record);
    this.waiters.delete(name);
    return entry;
  }

  remove(name: string, reason: DisconnectReason): void {
    const e = this.entries.get(name);
    if (!e) return;
    this.entries.delete(name);
    for (const l of this.listeners.disconnect) l(e.record, reason);
  }

  touch(name: string): void { const e = this.entries.get(name); if (e) e.record.lastSeenAt = Date.now(); }
  entry(name: string): Entry<Meta, Handle> | undefined { return this.entries.get(name); }
  get(name: string): Connection<Meta> | undefined { return this.entries.get(name)?.record; }
  has(name: string): boolean { return this.entries.has(name); }
  count(): number { return this.entries.size; }
  list(): Connection<Meta>[] { return [...this.entries.values()].map((e) => e.record); }

  waitFor(name: string, opts: { timeoutMs: number }): Promise<Connection<Meta>> {
    const now = this.get(name);
    if (now) return Promise.resolve(now);
    return new Promise((resolve, reject) => {
      const t = setTimeout(() => {
        this.waiters.set(name, (this.waiters.get(name) ?? []).filter((w) => w !== done));
        reject(new Error(`waitFor(${name}): not connected within ${opts.timeoutMs}ms`));
      }, opts.timeoutMs);
      const done = (c: Connection<Meta>) => { clearTimeout(t); resolve(c); };
      this.waiters.set(name, [...(this.waiters.get(name) ?? []), done]);
    });
  }

  on<K extends keyof RegistryEvents<Meta>>(event: K, fn: RegistryEvents<Meta>[K]): () => void {
    (this.listeners[event] as RegistryEvents<Meta>[K][]).push(fn);
    return () => { const a = this.listeners[event] as RegistryEvents<Meta>[K][]; const i = a.indexOf(fn); if (i >= 0) a.splice(i, 1); };
  }
}
