/** INT-001. Companion-facing protocol. Must never import inference.ts. */
import type { Id, MessageView, MessageStatus, PublicError } from "./common";
import type { DesiredVisual, VisualReport, AvatarCapabilities, SpeechStart, SpeechTiming, PlaybackReport } from "./avatar-speech";

export interface CommandScope {
  characterId: Id | null;
  conversationId: Id | null;
  expectedEpoch: number | null;
}
export interface CommandBodies {
  "sync.request": { lastEventSeq: number | null };
  "input.submit": { text: string; clientInputId: Id; source: "desktop_text" | "transcribed_voice" };
  "input.capture": { captureId: Id; action: "start" | "finish" | "cancel"; totalSamples: number | null };
  "turn.interrupt": { reason: "stop_button" | "barge_in" | "new_input" };
  "character.select": { characterId: Id; conversationId: Id | null };
  "visual.set_manual": { activity: "none" | "phone" | "typing" | "dance"; durationMs: number };
  "audio.configure": { muted: boolean; volume: number };
}
export type CompanionCommand = { [K in keyof CommandBodies]: {
  protocol: "companion";
  version: 1;
  sessionId: Id;
  commandId: Id;
  kind: K;
  scope: CommandScope;
  body: CommandBodies[K];
} }[keyof CommandBodies];

export interface Snapshot {
  epoch: number;
  characterId: Id | null;
  avatarId: Id | null;
  conversationId: Id | null;
  channelId: Id | null;
  state: "starting" | "ready" | "switching" | "degraded";
  activeTurn: { turnId: Id; messageId: Id; state: "running" | "cancelling" } | null;
  transcriptTail: MessageView[]; // At most 50 and 48,000 aggregate UTF-16 units; older records via history query.
  desiredVisual: DesiredVisual;
  actualVisual: VisualReport | null;
  audio: { muted: boolean; volume: number; replay: false };
}
export interface EventBodies {
  "command.result": { commandId: Id; status: "accepted" | "rejected"; effect: "committed" | "scheduled" | "noop"; turnId: Id | null; messageId: Id | null; error: PublicError | null };
  "state.snapshot": Snapshot;
  "presentation.reset": { epoch: number; reason: "interrupt" | "switch" | "reconnect" | "renderer_lost" | "shutdown"; desiredVisual: DesiredVisual };
  "turn.started": { turnId: Id; userMessage: MessageView; assistantMessageId: Id };
  "message.delta": { messageId: Id; fromRevision: number; toRevision: number; offsetUtf16: number; textDelta: string };
  "message.final": { messageId: Id; revision: number; text: string; status: MessageStatus; outcome: "completed" | "limited" | "filtered" | "interrupted" | "failed" };
  "turn.finished": { turnId: Id; state: "completed" | "cancelled" | "failed"; warnings: PublicError[] };
  "speech.start": SpeechStart;
  "speech.timing": SpeechTiming;
  "speech.end": { utteranceId: Id; totalSamples: number };
  "visual.desired": DesiredVisual;
  "character.ready": { characterId: Id; avatarId: Id; capabilities: AvatarCapabilities };
  "capture.status": { captureId: Id; state: "recording" | "transcribing" | "completed" | "cancelled" | "failed"; transcript: string | null; error: PublicError | null };
  "system.problem": PublicError;
  "system.heartbeat": { monotonicMs: number };
}
export type CompanionEvent = { [K in keyof EventBodies]: {
  protocol: "companion";
  version: 1;
  sessionId: Id;
  eventId: Id;
  eventSeq: number;
  epoch: number;
  characterId: Id | null;
  conversationId: Id | null;
  turnId: Id | null;
  kind: K;
  body: EventBodies[K];
} }[keyof EventBodies];
export type RendererReport = {
  protocol: "companion";
  version: 1;
  sessionId: Id;
  epoch: number;
  characterId: Id;
  reportSeq: number;
} & (
  | { kind: "visual.report"; body: VisualReport }
  | { kind: "playback.report"; body: PlaybackReport }
  | { kind: "renderer.ready"; body: { capabilities: AvatarCapabilities } }
  | { kind: "renderer.failed"; body: PublicError }
);
export interface Hello {
  protocol: "companion";
  supportedVersions: [1];
  clientId: Id;
  role: "owner_ui" | "presentation";
}
export interface Welcome {
  protocol: "companion";
  version: 1;
  sessionId: Id;
  clientId: Id;
  heartbeatMs: 500;
  maximumControlBytes: 262144;
}
// AudioFrame and CaptureFrame travel on the binary lane; their sequencing is not eventSeq.
