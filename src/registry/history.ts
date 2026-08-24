import type { HistoryEntry } from "./connection.js";

/** Per-name ring buffer. Pure. */
export class History {
  private byName = new Map<string, HistoryEntry[]>();
  constructor(private readonly limit: number) {}
  push(name: string, entry: HistoryEntry): void {
    if (this.limit <= 0) return;
    const list = this.byName.get(name) ?? [];
    list.push(entry);
    if (list.length > this.limit) list.splice(0, list.length - this.limit);
    this.byName.set(name, list);
  }
  get(name: string): readonly HistoryEntry[] { return this.byName.get(name) ?? []; }
}
