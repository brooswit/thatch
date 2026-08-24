/** The notification Claude Code renders as a `<channel>` block. */
export const CHANNEL_METHOD = "notifications/claude/channel" as const;
/** Declared unconditionally at initialize — the client reads capabilities once and never again. */
export const CHANNEL_CAPABILITY = { experimental: { "claude/channel": {} } } as const;
