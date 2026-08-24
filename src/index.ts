export { thatch, type McpHandle } from "./plugin/mcp.js";
export type { McpOptions, ToolDef, Identity } from "./plugin/options.js";
export type { Connection, HistoryEntry, DisconnectReason } from "./registry/connection.js";
export type { Frame } from "./protocol/frame.js";
export { validateFrame, badMetaKeys } from "./protocol/frame.js";
export type { Delivery } from "./protocol/delivery.js";
export { delivered } from "./protocol/delivery.js";
export { CHANNEL_METHOD, CHANNEL_CAPABILITY } from "./protocol/method.js";
export { z } from "zod";
