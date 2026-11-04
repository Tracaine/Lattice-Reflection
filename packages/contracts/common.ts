/** Normative draft declarations, not application implementation. Protocol major: 1. */
export type Id = string; // UUIDv4; external IDs remain separate opaque strings.
export type JsonValue = null | boolean | number | string | JsonValue[] | { [key: string]: JsonValue };
export type ChannelKind = "desktop" | "telegram" | "external";
export type Role = "dialogue" | "director" | "memory";
export type MessageStatus = "streaming" | "complete" | "interrupted" | "failed";
export type PublicErrorCode =
  | "invalid_input" | "conflict" | "stale_epoch" | "unsupported_version"
  | "not_configured" | "not_ready" | "busy" | "queue_full" | "permission_denied"
  | "dependency_failed" | "timeout" | "cancelled" | "context_too_large"
  | "unsupported_capability" | "audio_gap" | "audio_overflow" | "asset_invalid"
  | "storage_failed" | "protocol_error";
export interface PublicError {
  code: PublicErrorCode;
  message: string; // Sanitized, actionable, <= 512 UTF-16 code units.
  retryable: boolean; // Means an explicit new attempt may help, not auto-retry permission.
  diagnosticId: Id;
}
export interface MessageView {
  id: Id;
  turnId: Id;
  role: "user" | "assistant";
  text: string;
  revision: number;
  status: MessageStatus;
  createdAtMs: number;
}
export interface Scope {
  characterId: Id;
  conversationId: Id;
  channelId: Id;
  turnId: Id;
}
