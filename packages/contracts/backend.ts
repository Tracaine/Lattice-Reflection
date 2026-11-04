/** INT-008/009. Session backend/channel ports, separate from raw model providers. */
import type { Id, Scope, ChannelKind, PublicError } from "./common";
import type { ExpressionName, Activity, SpeechProviderEvent } from "./avatar-speech";

export interface BackendCapabilities {
  text: boolean;
  audio: "none" | "pcm24_mono";
  visualSuggestions: boolean;
  cancellation: "best_effort" | "acknowledged";
  contextOwner: "companion" | "external";
}
export interface BackendConnection {
  id: Id;
  revision: number;
  label: string;
  adapterKind: "mock-external" | "user-stack";
  baseUrl: string | null;
  enabled: boolean;
  auth: { kind: "none" } | { kind: "bearer"; secretRef: Id };
  capabilities: BackendCapabilities;
}
export interface BackendTurnRequest {
  scope: Scope;
  input: { messageId: Id; text: string };
  context: null | { instructions: string; memories: Array<{ id: Id; text: string }>; history: Array<{ role: "user" | "assistant"; text: string; partial: boolean }> };
  // context=null when contextOwner=external. No provider credentials or renderer epochs here.
}
export type BackendEvent =
  | { kind: "response.started"; externalResponseId: string | null }
  | { kind: "text.delta"; index: number; text: string }
  | { kind: "audio"; event: SpeechProviderEvent }
  | { kind: "visual.suggestion"; suggestionId: Id; activity: Activity | null; emotion: ExpressionName | null; ttlMs: number }
  | { kind: "response.finished"; outcome: "completed" | "limited" | "filtered" }
  | { kind: "response.failed"; error: PublicError }
  | { kind: "response.cancelled" };
export interface SessionBackend {
  capabilities(): BackendCapabilities;
  runTurn(request: BackendTurnRequest, signal: AbortSignal): AsyncIterable<BackendEvent>;
}
export interface ChannelMessage {
  bindingId: Id;
  channelKind: ChannelKind;
  externalMessageId: string;
  externalPeerId: string;
  receivedAtMs: number;
  text: string;
}
export interface ChannelActivity {
  bindingId: Id;
  kind: "connected" | "disconnected" | "peer_typing" | "message_received" | "reply_processing" | "reply_sent";
  externalEventId: string;
  observedAtMs: number;
  ttlMs: number;
}
export interface ChannelSend {
  outboxId: Id;
  bindingId: Id;
  inReplyToExternalMessageId: string | null;
  text: string;
}
export type ChannelSendResult =
  | { state: "delivered"; externalMessageId: string }
  | { state: "failed"; error: PublicError }
  | { state: "uncertain"; diagnosticId: Id };
export interface ChannelAdapter {
  receive(signal: AbortSignal): AsyncIterable<ChannelMessage | ChannelActivity>;
  send(request: ChannelSend, signal: AbortSignal): Promise<ChannelSendResult>;
}
export interface CaptureFrame {
  sessionId: Id;
  epoch: number;
  captureId: Id;
  chunkIndex: number;
  sampleOffset: number;
  sampleCount: number;
  sampleRate: 24000;
  channels: 1;
  encoding: "pcm_s16le";
  pcm: ArrayBuffer;
}
