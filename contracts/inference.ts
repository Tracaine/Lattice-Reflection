/** INT-002/003. Private inference contract. No companion/rig/audio imports. */
import type { Id, JsonValue, Role } from "./common";

export type ProviderKind = "mock" | "openai-chat" | "openrouter-chat" | "lmstudio-chat" | "custom-chat";
export interface ProviderConnection {
  id: Id;
  revision: number;
  label: string;
  kind: ProviderKind;
  enabled: boolean;
  baseUrl: string | null; // Includes API prefix such as /v1; null only for mock.
  auth: { kind: "none" } | { kind: "bearer"; secretRef: Id };
}
export interface ModelCapabilities {
  text: true;
  streaming: boolean; // False selects an explicit buffered path; never fake token streaming.
  instructionRole: "system" | "developer";
  structuredOutput: "none" | "json_object" | "json_schema";
  usage: "reported" | "optional" | "unavailable";
  contextWindowTokens: number; // Explicit verified/configured value; never infer from model name.
  outputTokenLimit: number;
  supportsTemperature: boolean;
  supportsTopP: boolean;
}
export interface ModelProfile {
  id: Id;
  revision: number;
  label: string;
  connectionId: Id;
  modelId: string; // Exact provider identifier; no cross-provider name rewriting.
  capabilities: ModelCapabilities;
  adapterOptions: Record<string, JsonValue>; // Adapter allowlist only; cannot replace model/messages/auth/URL.
}
export type ModelBinding = {
  mode: "model";
  profileId: Id;
  maxOutputTokens: number;
  temperature?: number;
  topP?: number;
};
export type RoleBinding = ModelBinding | { mode: "rules" } | { mode: "disabled" };
export type BindingScope =
  | { kind: "application" }
  | { kind: "channel"; channelId: Id }
  | { kind: "character"; characterId: Id }
  | { kind: "character_channel"; characterId: Id; channelId: Id };
export interface RouteBinding {
  id: Id;
  revision: number;
  scope: BindingScope;
  role: Role;
  binding: RoleBinding;
}
export interface ResolvedBinding {
  selectionId: Id;
  role: Role;
  sourceScope: BindingScope;
  sourceRouteId: Id;
  sourceRouteRevision: number;
  connection: ProviderConnection;
  profile: ModelProfile;
  parameters: ModelBinding;
  resolvedAtMs: number;
}
export interface PromptMessage {
  role: "system" | "user" | "assistant";
  content: string;
}
export interface InferenceRequest {
  callId: Id;
  binding: ResolvedBinding;
  messages: PromptMessage[];
  output: { kind: "text" } | { kind: "json"; schema: Record<string, JsonValue> };
}
export interface Usage {
  status: "reported" | "estimated" | "unknown";
  inputTokens: number | null;
  outputTokens: number | null;
  totalTokens: number | null;
  cost: { currency: "USD"; amount: number; basis: "reported" | "configured_estimate" } | null;
}
export type InferenceErrorCode =
  | "authentication" | "permission" | "rate_limit" | "credit_limit" | "model_unavailable"
  | "invalid_request" | "unsupported_capability" | "context_limit" | "transport"
  | "first_token_timeout" | "idle_timeout" | "overall_timeout" | "malformed_stream"
  | "truncated_stream" | "upstream_error" | "unsupported_output";
export interface InferenceError {
  code: InferenceErrorCode;
  retryable: boolean;
  diagnosticId: Id;
  safeMessage: string;
  httpStatus: number | null;
  retryAfterMs: number | null;
}
export type InferenceEvent =
  | { kind: "started"; callId: Id; providerRequestId: string | null }
  | { kind: "text_delta"; callId: Id; index: number; text: string; textKind: "answer" | "refusal" }
  | { kind: "usage"; callId: Id; usage: Usage }
  | { kind: "finished"; callId: Id; reason: "stop" | "length" | "filtered" | "unknown"; usage: Usage }
  | { kind: "failed"; callId: Id; error: InferenceError; usage: Usage }
  | { kind: "cancelled"; callId: Id; usage: Usage };
export interface InferenceGateway {
  resolve(role: Role, characterId: Id, channelId: Id): Promise<ResolvedBinding | { mode: "rules" } | { mode: "disabled" }>;
  generate(request: InferenceRequest, signal: AbortSignal): AsyncIterable<InferenceEvent>;
}
export interface ProviderAdapter {
  readonly kind: ProviderKind;
  listModels(connection: ProviderConnection, signal: AbortSignal): Promise<Array<{ id: string; label: string }>>;
  generate(request: InferenceRequest, runtime: {
    signal: AbortSignal;
    resolveSecret: (secretRef: Id) => Promise<string>;
  }): AsyncIterable<InferenceEvent>;
}
// Dialogue requires mode=model. Director permits rules or model. Memory permits disabled or model.
// Bindings must be complete. A bad/disabled highest-precedence binding is an error, not inheritance.
// Exactly one terminal event (finished/failed/cancelled); no events after it.
