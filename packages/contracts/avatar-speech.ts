/** INT-004/005/011. Renderer-neutral speech, avatar, and visual-state contract. */
import type { Id, JsonValue, PublicError } from "./common";

export type ExpressionName = "neutral" | "happy" | "sad" | "angry" | "relaxed" | "surprised";
export type MouthShape = "sil" | "aa" | "ih" | "ou" | "ee" | "oh";
export type Activity = "none" | "phone" | "typing" | "dance";
export type BodyMask = "torso" | "left_arm" | "right_arm" | "legs" | "head";
export interface DesiredVisual {
  revision: number;
  base: "idle" | "listening" | "thinking";
  activity: { kind: Activity; source: "manual" | "local_input" | "channel" | "model"; ttlMs: number };
  emotion: { name: ExpressionName; weight: number; ttlMs: number };
  gaze: "auto" | "camera" | "phone" | "away";
  gesture: null | { id: Id; name: "nod" | "wave"; ttlMs: number };
  reducedMotion: boolean;
}
export interface AvatarCapabilities {
  avatarId: Id;
  humanoid: boolean;
  expressions: string[];
  mouthShapes: MouthShape[];
  gaze: boolean;
  activities: Activity[];
  gestures: Array<"nod" | "wave">;
  customClipIds: string[];
}
export interface VisualReport {
  appliedRevision: number;
  actualBase: "idle" | "listening" | "thinking";
  actualActivity: Activity;
  speaking: boolean; // Playback observation, not token-generation state.
  emotion: ExpressionName;
  outcomes: Array<{
    feature: "activity" | "emotion" | "gaze" | "gesture";
    result: "applied" | "suppressed" | "unsupported" | "expired" | "failed";
    detail: string;
  }>;
}
export interface SpeechStart {
  utteranceId: Id;
  messageId: Id;
  encoding: "pcm_s16le";
  sampleRate: 24000;
  channels: 1;
}
export interface AudioFrame {
  sessionId: Id;
  epoch: number;
  characterId: Id;
  conversationId: Id;
  turnId: Id;
  utteranceId: Id;
  chunkIndex: number;
  sampleOffset: number;
  sampleCount: number;
  pcm: ArrayBuffer; // Exactly sampleCount * 2 bytes, signed little-endian PCM.
}
export interface MouthCue {
  startSample: number;
  endSample: number;
  shape: MouthShape;
  weight: number;
}
export interface SpeechTiming {
  utteranceId: Id;
  segmentId: Id;
  textStartUtf16: number;
  textEndUtf16: number;
  source: "provider" | "fixture" | "estimated";
  cues: MouthCue[];
}
export interface PlaybackReport {
  utteranceId: Id;
  state: "buffering" | "playing" | "underrun" | "draining" | "completed" | "cancelled" | "failed";
  playedSamples: number; // Source timeline, excludes inserted silence and cancelled samples.
  bufferedSamples: number;
  nextChunkIndex: number;
  creditSamples: number;
  clockQuality: "device_estimate" | "rendered_samples";
  outputLatencyMs: number | null;
  error: PublicError | null;
}
export interface AvatarManifest {
  schemaVersion: 1;
  id: Id;
  name: string;
  format: "vrm1" | "builtin_demo";
  modelPath: string | null; // Relative to immutable package root; never URL/absolute path.
  sha256: string;
  attribution: { authors: string[]; licenseName: string; licenseUrl: string | null; sourceUrl: string | null };
  expressionMap: Partial<Record<MouthShape | ExpressionName | "blink" | "blinkLeft" | "blinkRight", string>>;
  clips: Array<{ id: string; path: string; format: "vrma1"; activity: Activity | "idle" | "talk" | "nod" | "wave"; masks: BodyMask[]; loop: boolean }>;
  camera: { framing: "full_body" | "waist_up"; distanceScale: number; targetHeightRatio: number };
  props: Array<{ id: "phone"; kind: "builtin_phone"; hand: "left" | "right"; position: [number, number, number]; rotation: [number, number, number, number]; scale: number }>;
  extras: Record<string, JsonValue>; // Data only. Unknown extensions have no executable semantics.
}
export interface AvatarRuntime {
  prepare(manifest: AvatarManifest, signal: AbortSignal): Promise<AvatarCapabilities>;
  activate(epoch: number): Promise<void>;
  setDesired(epoch: number, desired: DesiredVisual): void;
  applySpeechTiming(epoch: number, timing: SpeechTiming): void;
  report(): VisualReport;
  reset(epoch: number): void;
  dispose(): void;
}
export interface SpeechRequest {
  utteranceId: Id;
  segmentId: Id;
  text: string;
  voiceBindingId: Id;
}
export type SpeechProviderEvent =
  | { kind: "audio"; pcm: ArrayBuffer; sampleRate: 24000; channels: 1 }
  | { kind: "timing"; cues: MouthCue[] }
  | { kind: "finished" }
  | { kind: "failed"; error: PublicError };
export interface SpeechProvider {
  synthesize(request: SpeechRequest, signal: AbortSignal): AsyncIterable<SpeechProviderEvent>;
  transcribe(input: { captureId: Id; pcm: ArrayBuffer; sampleRate: 24000; channels: 1; language: string | null }, signal: AbortSignal): Promise<{ text: string; language: string | null }>;
}
// Provider adaptation normalizes PCM before it reaches this interface.
// Timing from a provider is segment-relative; SpeechService adds segment offsets for SpeechTiming.
