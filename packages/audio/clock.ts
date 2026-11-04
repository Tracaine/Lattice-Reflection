import type { AudioFrame, PlaybackReport } from "../contracts/avatar-speech";
import type { PublicErrorCode } from "../contracts/common";

export const sourceRate = 24000;
export const capacity = 48000;
export type Lane = Pick<AudioFrame, "sessionId" | "epoch" | "characterId" | "conversationId" | "turnId" | "utteranceId">;
type State = PlaybackReport["state"];
const terminal = (state: State) => state === "completed" || state === "cancelled" || state === "failed";

export class PcmClock {
  private readonly ring = new Float32Array(capacity);
  private readonly recent = new Map<number, { offset: number; bytes: Uint8Array }>();
  private lane: Lane | null = null;
  private epoch = 0;
  private epochSession: string | null = null;
  private state: State = "buffering";
  private received = 0;
  private played = 0;
  private index = 0;
  private phase = 0;
  private starvedFrames = 0;
  private ended = false;
  private error: PlaybackReport["error"] = null;
  private gain = 1;
  private lastOutput = 0;
  private fadeValue = 0;
  private fadeRemaining = 0;
  private readonly fadeFrames: number;

  constructor(readonly rate: number) {
    if (![24000, 44100, 48000].includes(rate)) throw new RangeError("Unsupported playback sample rate");
    this.fadeFrames = Math.round(rate / 100);
  }

  start(lane: Lane): boolean {
    if (!Number.isSafeInteger(lane.epoch) || lane.epoch < 1 ||
      (this.epochSession !== null && lane.sessionId !== this.epochSession) ||
      lane.epoch < this.epoch || (this.lane?.epoch === lane.epoch &&
        (!terminal(this.state) || lane.utteranceId === this.lane.utteranceId))) return false;
    if (this.lane && !terminal(this.state)) return false;
    this.epochSession = lane.sessionId;
    this.epoch = lane.epoch;
    this.lane = { ...lane };
    this.state = "buffering";
    this.received = this.played = this.index = this.phase = this.starvedFrames = 0;
    this.ended = false;
    this.error = null;
    this.recent.clear();
    return true;
  }

  matches(lane: Lane): boolean {
    const current = this.lane;
    return current !== null && lane.epoch === this.epoch && lane.epoch === current.epoch &&
      lane.sessionId === current.sessionId && lane.characterId === current.characterId &&
      lane.conversationId === current.conversationId && lane.turnId === current.turnId &&
      lane.utteranceId === current.utteranceId;
  }

  append(frame: AudioFrame): boolean {
    if (!this.matches(frame) || terminal(this.state)) return false;
    const { chunkIndex, sampleOffset, sampleCount, pcm } = frame;
    if (!Number.isSafeInteger(chunkIndex) || chunkIndex < 0 ||
      !Number.isSafeInteger(sampleOffset) || sampleOffset < 0 ||
      !Number.isInteger(sampleCount) || sampleCount < 1 || sampleCount > 4096 ||
      !(pcm instanceof ArrayBuffer) || pcm.byteLength !== sampleCount * 2) {
      return this.fail("protocol_error", "Invalid PCM frame");
    }
    if (chunkIndex < this.index) {
      const prior = this.recent.get(chunkIndex);
      if (!prior) return false;
      const bytes = new Uint8Array(pcm);
      if (prior.offset !== sampleOffset || bytes.length !== prior.bytes.length ||
        !bytes.every((byte, index) => byte === prior.bytes[index])) return this.fail("audio_gap", "Conflicting PCM duplicate");
      return true;
    }
    if (this.ended || chunkIndex !== this.index || sampleOffset !== this.received) {
      return this.fail("audio_gap", "PCM frame out of sequence");
    }
    if (sampleCount > this.credit()) return this.fail("audio_overflow", "PCM playback queue is full");
    const view = new DataView(pcm);
    for (let i = 0; i < sampleCount; i++) {
      this.ring[(this.received + i) % capacity] = view.getInt16(i * 2, true) / 32768;
    }
    this.recent.set(chunkIndex, { offset: sampleOffset, bytes: new Uint8Array(pcm.slice(0)) });
    this.recent.delete(chunkIndex - 64);
    this.received += sampleCount;
    this.index++;
    return true;
  }

  end(lane: Lane, totalSamples: number): boolean {
    if (!this.matches(lane) || terminal(this.state)) return false;
    if (totalSamples !== this.received) return this.fail("audio_gap", "PCM end does not match received samples");
    this.ended = true;
    return true;
  }

  volume(muted: boolean, volume: number): void {
    if (Number.isFinite(volume)) this.gain = muted ? 0 : Math.min(1, Math.max(0, volume));
    if (muted || this.gain === 0) this.fadeValue = 0;
  }

  reset(sessionId: string, epoch: number): void {
    if (!Number.isSafeInteger(epoch) || epoch < 1 ||
      (this.epochSession !== null && sessionId !== this.epochSession) || epoch <= this.epoch) return;
    this.epochSession = sessionId;
    this.epoch = epoch;
    if (this.lane && !terminal(this.state)) this.terminate("cancelled");
  }

  deviceFailed(): void {
    if (this.lane && !terminal(this.state)) this.fail("dependency_failed", "Audio device or processor failed");
  }

  render(out: Float32Array): void {
    for (let i = 0; i < out.length; i++) {
      out[i] = this.renderSample();
    }
  }

  private renderSample(): number {
    if (this.fadeRemaining) {
      const value = this.fadeValue * this.fadeRemaining-- / this.fadeFrames;
      return this.gain === 0 ? 0 : value;
    }
    if (!this.lane || terminal(this.state)) return 0;
    const available = this.received - this.played;
    if (this.ended && available === 0) {
      this.terminate("completed");
      return 0;
    }
    if (this.state === "buffering" && available < 4800 && !this.ended) return 0;
    if (this.state === "underrun" && available < 2400 && !this.ended) {
      if (++this.starvedFrames >= this.rate * 2) this.fail("timeout", "PCM underrun timed out");
      return 0;
    }
    if (available === 0 || (!this.ended && this.phase !== 0 && available < 2)) {
      this.state = "underrun";
      this.starvedFrames = 1;
      this.lastOutput = 0;
      return 0;
    }
    this.starvedFrames = 0;
    this.state = this.ended ? "draining" : "playing";
    const a = this.ring[this.played % capacity]!;
    const b = available > 1 ? this.ring[(this.played + 1) % capacity]! : a;
    const value = (a + (b - a) * this.phase / this.rate) * this.gain;
    this.phase += sourceRate;
    if (this.phase >= this.rate) {
      this.phase -= this.rate;
      this.played++;
    }
    if (this.ended && this.played === this.received) this.terminate("completed");
    this.lastOutput = value;
    return value;
  }

  private credit(): number {
    return terminal(this.state) || this.ended ? 0 : capacity - (this.received - this.played);
  }

  private fail(code: PublicErrorCode, message: string): false {
    this.error = { code, message, retryable: false, diagnosticId: this.lane!.utteranceId };
    this.terminate("failed");
    return false;
  }

  private terminate(state: "completed" | "cancelled" | "failed"): void {
    if (state === "cancelled") {
      this.fadeValue = this.lastOutput;
      this.fadeRemaining = this.fadeFrames;
    }
    this.lastOutput = 0;
    this.state = state;
    this.received = this.played;
    this.recent.clear();
  }

  report(): PlaybackReport | null {
    if (!this.lane) return null;
    return {
      utteranceId: this.lane.utteranceId, state: this.state, playedSamples: this.played,
      bufferedSamples: this.received - this.played, nextChunkIndex: this.index, creditSamples: this.credit(),
      clockQuality: "rendered_samples", outputLatencyMs: null, error: this.error,
    };
  }
}
