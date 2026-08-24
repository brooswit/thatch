/** What crosses the channel. `meta` becomes attributes on the `<channel>` tag Claude Code renders. */
export interface Frame {
  content: string;
  meta: Record<string, string>;
}

/**
 * Meta values must be strings. A non-string value does not degrade the frame —
 * Claude Code discards the WHOLE frame in silence. This was the root cause of six
 * "delivered" pokes that were never received; hence a refusal, never a pass-through.
 */
export function badMetaKeys(meta: unknown): string[] {
  if (meta === null || typeof meta !== "object" || Array.isArray(meta)) return ["<meta is not an object>"];
  return Object.entries(meta as Record<string, unknown>).filter(([, v]) => typeof v !== "string").map(([k]) => k);
}

export const validateFrame = (f: Frame): { ok: true } | { ok: false; keys: string[] } => {
  if (typeof f?.content !== "string") return { ok: false, keys: ["<content is not a string>"] };
  const keys = badMetaKeys(f.meta);
  return keys.length ? { ok: false, keys } : { ok: true };
};
