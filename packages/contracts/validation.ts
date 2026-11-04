import { z } from "zod";
import type { CompanionCommand, CompanionEvent } from "./companion";
import type { AudioFrame } from "./avatar-speech";
import type { CaptureFrame } from "./backend";

const id = z.uuidv4();
const counter = z.int().min(0);
const epoch = counter.min(1);
const text = (limit: number) => z.string().max(limit).refine(value => value.isWellFormed());
const protocol = { protocol: z.literal("companion"), version: z.literal(1), sessionId: id };
const scope = z.strictObject({
  characterId: id.nullable(),
  conversationId: id.nullable(),
  expectedEpoch: epoch.nullable(),
});
const command = <K extends string, B extends z.ZodType>(kind: K, body: B) =>
  z.strictObject({ ...protocol, commandId: id, kind: z.literal(kind), scope, body });

const commandSchema = z.discriminatedUnion("kind", [
  command("sync.request", z.strictObject({ lastEventSeq: counter.nullable() })),
  command("input.submit", z.strictObject({
    text: text(16000).refine(value => value.trim().length > 0),
    clientInputId: id, source: z.enum(["desktop_text", "transcribed_voice"]),
  })),
  command("input.capture", z.strictObject({
    captureId: id, action: z.enum(["start", "finish", "cancel"]),
    totalSamples: counter.max(1440000).nullable(),
  }).refine(body => (body.action === "finish") === (body.totalSamples !== null))),
  command("turn.interrupt", z.strictObject({ reason: z.enum(["stop_button", "barge_in", "new_input"]) })),
  command("character.select", z.strictObject({ characterId: id, conversationId: id.nullable() })),
  command("visual.set_manual", z.strictObject({
    activity: z.enum(["none", "phone", "typing", "dance"]), durationMs: counter.max(300000),
  })),
  command("audio.configure", z.strictObject({ muted: z.boolean(), volume: z.number().min(0).max(1) })),
]);

export function parseCommand(input: unknown): CompanionCommand {
  const value = commandSchema.parse(input);
  if (new TextEncoder().encode(JSON.stringify(value)).byteLength > 262144) {
    throw new RangeError("Control message exceeds 256 KiB");
  }
  if (value.kind === "input.submit" || value.kind === "input.capture" || value.kind === "visual.set_manual") {
    if (Object.values(value.scope).includes(null)) throw new RangeError("Active scope required");
  }
  return value;
}

export function matchesActiveScope(command: CompanionCommand, active: {
  sessionId: string; characterId: string; conversationId: string; epoch: number;
}): boolean {
  return command.sessionId === active.sessionId &&
    command.scope.characterId === active.characterId &&
    command.scope.conversationId === active.conversationId &&
    command.scope.expectedEpoch === active.epoch;
}

const frameFields = {
  sessionId: id, epoch, chunkIndex: counter, sampleOffset: counter,
  sampleCount: counter.min(1).max(4096), pcm: z.instanceof(ArrayBuffer),
};
const validPcm = (frame: { pcm: ArrayBuffer; sampleCount: number; sampleOffset: number }) =>
  frame.pcm.byteLength === frame.sampleCount * 2 &&
  Number.isSafeInteger(frame.sampleOffset + frame.sampleCount);

const audioFrame = z.strictObject({
  ...frameFields, characterId: id, conversationId: id, turnId: id, utteranceId: id,
}).refine(validPcm);
const captureFrame = z.strictObject({
  ...frameFields, captureId: id, sampleRate: z.literal(24000),
  channels: z.literal(1), encoding: z.literal("pcm_s16le"),
}).refine(frame => validPcm(frame) && frame.sampleOffset + frame.sampleCount <= 1440000);

export const parseAudioFrame = (input: unknown): AudioFrame => audioFrame.parse(input);
export const parseCaptureFrame = (input: unknown): CaptureFrame => captureFrame.parse(input);

const activity = z.enum(["none", "phone", "typing", "dance"]);
const emotion = z.enum(["neutral", "happy", "sad", "angry", "relaxed", "surprised"]);
const mouth = z.enum(["sil", "aa", "ih", "ou", "ee", "oh"]);
const base = z.enum(["idle", "listening", "thinking"]);
const gesture = z.enum(["nod", "wave"]);
const weight = z.number().min(0).max(1);
const ttlMs = counter.max(300000);
const desired = z.object({
  revision: counter, base,
  activity: z.object({ kind: activity, source: z.enum(["manual", "local_input", "channel", "model"]), ttlMs }),
  emotion: z.object({ name: emotion, weight, ttlMs }),
  gaze: z.enum(["auto", "camera", "phone", "away"]),
  gesture: z.object({ id, name: gesture, ttlMs }).nullable(), reducedMotion: z.boolean(),
});
const visualReport = z.object({
  appliedRevision: counter, actualBase: base, actualActivity: activity, speaking: z.boolean(), emotion,
  outcomes: z.array(z.object({
    feature: z.enum(["activity", "emotion", "gaze", "gesture"]),
    result: z.enum(["applied", "suppressed", "unsupported", "expired", "failed"]),
    detail: text(512),
  })),
});
const capabilities = z.object({
  avatarId: id, humanoid: z.boolean(), expressions: z.array(text(512)), mouthShapes: z.array(mouth),
  gaze: z.boolean(), activities: z.array(activity), gestures: z.array(gesture), customClipIds: z.array(text(512)),
});
const error = z.object({
  code: z.enum([
    "invalid_input", "conflict", "stale_epoch", "unsupported_version", "not_configured",
    "not_ready", "busy", "queue_full", "permission_denied", "dependency_failed", "timeout",
    "cancelled", "context_too_large", "unsupported_capability", "audio_gap", "audio_overflow",
    "asset_invalid", "storage_failed", "protocol_error",
  ]),
  message: text(512), retryable: z.boolean(), diagnosticId: id,
});
const status = z.enum(["streaming", "complete", "interrupted", "failed"]);
const message = z.object({
  id, turnId: id, role: z.enum(["user", "assistant"]), text: text(32768),
  revision: counter, status, createdAtMs: counter,
}).refine(value => value.role === "assistant" || value.text.length <= 16000);
const snapshot = z.object({
  epoch, characterId: id.nullable(), avatarId: id.nullable(), conversationId: id.nullable(),
  channelId: id.nullable(), state: z.enum(["starting", "ready", "switching", "degraded"]),
  activeTurn: z.object({ turnId: id, messageId: id, state: z.enum(["running", "cancelling"]) }).nullable(),
  transcriptTail: z.array(message).max(50).refine(tail => tail.reduce((n, item) => n + item.text.length, 0) <= 48000),
  desiredVisual: desired, actualVisual: visualReport.nullable(),
  audio: z.object({ muted: z.boolean(), volume: weight, replay: z.literal(false) }),
});
const event = <K extends string, B extends z.ZodType>(kind: K, body: B) => z.object({
  ...protocol, eventId: id, eventSeq: counter.min(1), epoch,
  characterId: id.nullable(), conversationId: id.nullable(), turnId: id.nullable(),
  kind: z.literal(kind), body,
});
const eventSchema = z.discriminatedUnion("kind", [
  event("command.result", z.object({
    commandId: id, status: z.enum(["accepted", "rejected"]), effect: z.enum(["committed", "scheduled", "noop"]),
    turnId: id.nullable(), messageId: id.nullable(), error: error.nullable(),
  })),
  event("state.snapshot", snapshot),
  event("presentation.reset", z.object({
    epoch, reason: z.enum(["interrupt", "switch", "reconnect", "renderer_lost", "shutdown"]), desiredVisual: desired,
  })),
  event("turn.started", z.object({ turnId: id, userMessage: message, assistantMessageId: id })),
  event("message.delta", z.object({
    messageId: id, fromRevision: counter, toRevision: counter, offsetUtf16: counter.max(32768), textDelta: text(32768),
  }).refine(body => body.toRevision > body.fromRevision && body.offsetUtf16 + body.textDelta.length <= 32768)),
  event("message.final", z.object({
    messageId: id, revision: counter, text: text(32768), status,
    outcome: z.enum(["completed", "limited", "filtered", "interrupted", "failed"]),
  })),
  event("turn.finished", z.object({ turnId: id, state: z.enum(["completed", "cancelled", "failed"]), warnings: z.array(error) })),
  event("speech.start", z.object({
    utteranceId: id, messageId: id, encoding: z.literal("pcm_s16le"), sampleRate: z.literal(24000), channels: z.literal(1),
  })),
  event("speech.timing", z.object({
    utteranceId: id, segmentId: id, textStartUtf16: counter.max(32768), textEndUtf16: counter.max(32768),
    source: z.enum(["provider", "fixture", "estimated"]),
    cues: z.array(z.object({ startSample: counter, endSample: counter, shape: mouth, weight })
      .refine(cue => cue.endSample > cue.startSample)),
  }).refine(body => body.textEndUtf16 >= body.textStartUtf16)),
  event("speech.end", z.object({ utteranceId: id, totalSamples: counter })),
  event("visual.desired", desired),
  event("character.ready", z.object({ characterId: id, avatarId: id, capabilities })),
  event("capture.status", z.object({
    captureId: id, state: z.enum(["recording", "transcribing", "completed", "cancelled", "failed"]),
    transcript: text(16000).nullable(), error: error.nullable(),
  })),
  event("system.problem", error),
  event("system.heartbeat", z.object({ monotonicMs: z.number().min(0) })),
]);

export function parseEvent(input: unknown): CompanionEvent {
  if (new TextEncoder().encode(JSON.stringify(input)).byteLength > 262144) {
    throw new RangeError("Control message exceeds 256 KiB");
  }
  const value = eventSchema.parse(input);
  if ((value.kind === "state.snapshot" || value.kind === "presentation.reset") && value.body.epoch !== value.epoch) {
    throw new RangeError("Body epoch differs from envelope");
  }
  return value;
}
