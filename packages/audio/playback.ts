import type { AudioFrame, PlaybackReport } from "../contracts/avatar-speech";
import { parseAudioFrame } from "../contracts/validation";
import type { Lane } from "./clock";
import type { PlaybackCommand } from "./worklet";

export async function openPlayback(
  context: AudioContext,
  report: (report: PlaybackReport) => void,
  destination: AudioNode = context.destination,
) {
  if (![24000, 44100, 48000].includes(context.sampleRate)) throw new Error("Unsupported audio output sample rate");
  await context.audioWorklet.addModule(new URL("./playback-worklet.js", location.href));
  const node = new AudioWorkletNode(context, "open-companion-playback", {
    numberOfInputs: 0, numberOfOutputs: 1, outputChannelCount: [1],
  });
  let lane: Lane | null = null;
  let latest: PlaybackReport | null = null;
  let stopped = false;
  let disposed = false;
  let failed = false;
  let nextIndex = 0;
  let epoch = 0;
  let sessionId: string | null = null;
  let reserved = new Map<number, number>();
  const post = (command: PlaybackCommand, transfer: Transferable[] = []) => node.port.postMessage(command, transfer);
  const onFailure = () => {
    failed = true;
    stopped = true;
    if (disposed || !lane || (latest && ["completed", "cancelled", "failed"].includes(latest.state))) return;
    const failure: PlaybackReport = {
      utteranceId: lane.utteranceId, state: "failed", playedSamples: latest?.playedSamples ?? 0,
      bufferedSamples: 0, nextChunkIndex: latest?.nextChunkIndex ?? 0, creditSamples: 0,
      clockQuality: "rendered_samples", outputLatencyMs: null,
      error: { code: "dependency_failed", message: "Audio output stopped", retryable: true, diagnosticId: lane.utteranceId },
    };
    latest = failure;
    report(failure);
  };
  const onStateChange = () => { if (context.state === "closed") onFailure(); };
  context.addEventListener("statechange", onStateChange);
  node.onprocessorerror = onFailure;
  node.port.onmessage = ({ data }: MessageEvent<PlaybackReport>) => {
    if (disposed || failed || data.utteranceId !== lane?.utteranceId) return;
    latest = data;
    for (const index of reserved.keys()) if (index < data.nextChunkIndex) reserved.delete(index);
    if (["completed", "cancelled", "failed"].includes(data.state)) stopped = true;
    report(data);
  };
  node.connect(destination);

  const credit = () => stopped || !latest ? 0 : Math.max(0,
    latest.creditSamples - [...reserved.values()].reduce((sum, count) => sum + count, 0));
  return {
    start(next: Lane) {
      if (disposed || failed || next.epoch < epoch || (sessionId !== null && next.sessionId !== sessionId) ||
        (lane?.epoch === next.epoch && lane.utteranceId === next.utteranceId) || (lane && (!stopped || latest?.state === "buffering" ||
        latest?.state === "playing" || latest?.state === "draining" || latest?.state === "underrun"))) return false;
      epoch = next.epoch;
      sessionId = next.sessionId;
      lane = { ...next };
      latest = null;
      nextIndex = 0;
      reserved = new Map();
      stopped = false;
      post({ kind: "start", lane });
      return true;
    },
    credit,
    enqueue(value: AudioFrame) {
      if (disposed || stopped || !lane || value.chunkIndex !== nextIndex ||
        value.sampleCount > credit() || value.utteranceId !== lane.utteranceId ||
        value.epoch !== lane.epoch || value.sessionId !== lane.sessionId ||
        value.characterId !== lane.characterId || value.conversationId !== lane.conversationId ||
        value.turnId !== lane.turnId) return false;
      const frame = parseAudioFrame(value);
      post({ kind: "frame", frame }, [frame.pcm]);
      reserved.set(frame.chunkIndex, frame.sampleCount);
      nextIndex++;
      return true;
    },
    end(total: number) {
      if (disposed || stopped || !lane) return;
      stopped = true;
      post({ kind: "end", lane, total });
    },
    reset(nextSessionId: string, nextEpoch: number) {
      if (disposed || (sessionId !== null && nextSessionId !== sessionId) || nextEpoch <= epoch) return;
      sessionId = nextSessionId;
      epoch = nextEpoch;
      stopped = true;
      post({ kind: "reset", sessionId, epoch });
    },
    volume(muted: boolean, volume: number) {
      if (!disposed) post({ kind: "volume", muted, volume });
    },
    dispose() {
      if (disposed) return;
      disposed = true;
      context.removeEventListener("statechange", onStateChange);
      node.port.close();
      node.disconnect();
    },
  };
}
