import type { Connection, DisconnectReason } from "./connection.js";

export interface Entry<Handle> { record: Connection; handle: Handle }

export interface RegistryEvents {
  connect: (c: Connection) => void;
  disconnect: (c: Connection, reason: DisconnectReason) => void;
}

/** The registry IS the source of truth for who is connected: a UUID is present iff its transport is open. */
export class Registry<Handle = unknown> {
  private entries = new Map<string, Entry<Handle>>();
  private listeners: { [K in keyof RegistryEvents]: RegistryEvents[K][] } = { connect: [], disconnect: [] };

  /** Register a live connection. `build` turns the id into the public record (so it can close via the owning plugin). */
  add(id: string, handle: Handle, build: (id: string) => Connection): Entry<Handle> {
    const entry = { record: build(id), handle };
    this.entries.set(id, entry);
    for (const l of this.listeners.connect) l(entry.record);
    return entry;
  }

  remove(id: string, reason: DisconnectReason): void {
    const e = this.entries.get(id);
    if (!e) return;
    this.entries.delete(id);
    for (const l of this.listeners.disconnect) l(e.record, reason);
  }

  touch(id: string): void { const e = this.entries.get(id); if (e) e.record.lastSeenAt = Date.now(); }
  entry(id: string): Entry<Handle> | undefined { return this.entries.get(id); }
  get(id: string): Connection | undefined { return this.entries.get(id)?.record; }
  has(id: string): boolean { return this.entries.has(id); }
  count(): number { return this.entries.size; }
  list(): Connection[] { return [...this.entries.values()].map((e) => e.record); }
  find(pred: (c: Connection) => boolean): Connection | undefined { return this.list().find(pred); }
  filter(pred: (c: Connection) => boolean): Connection[] { return this.list().filter(pred); }

  on<K extends keyof RegistryEvents>(event: K, fn: RegistryEvents[K]): () => void {
    this.listeners[event].push(fn);
    return () => this.off(event, fn);
  }
  off<K extends keyof RegistryEvents>(event: K, fn: RegistryEvents[K]): void {
    const a = this.listeners[event]; const i = a.indexOf(fn); if (i >= 0) a.splice(i, 1);
  }
  once<K extends keyof RegistryEvents>(event: K): Promise<Parameters<RegistryEvents[K]>[0]> {
    return new Promise((resolve) => { const off = this.on(event, ((c: Connection) => { off(); resolve(c); }) as RegistryEvents[K]); });
  }
}
