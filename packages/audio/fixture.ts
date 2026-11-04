import { sourceRate, type Lane } from "./clock";
import { openPlayback } from "./playback";

export function tonePcm(offset: number, count: number): ArrayBuffer {
  const pcm = new ArrayBuffer(count * 2);
  const view = new DataView(pcm);
  for (let i = 0; i < count; i++) {
    const index = offset + i;
    const pulse = index % sourceRate;
    const envelope = Math.max(0, Math.min(1, pulse / 240, (4800 - pulse) / 240));
    view.setInt16(i * 2, Math.round(6000 * envelope * Math.sin(index * 2 * Math.PI * 440 / sourceRate)), true);
  }
  return pcm;
}

export async function startAudioFixture(
  seconds: number,
  show: (result: string) => void,
  signal: AbortSignal,
) {
  const context = new AudioContext({ sampleRate: 48000 });
  const analyser = context.createAnalyser();
  analyser.connect(context.destination);
  const wave = new Float32Array(analyser.fftSize);
  const total = seconds * sourceRate;
  let offset = 0;
  let chunkIndex = 0;
  let first: number | undefined;
  let peak = 0;
  let underruns = 0;
  let previous = "";
  const lane: Lane = {
    sessionId: crypto.randomUUID(), characterId: crypto.randomUUID(), conversationId: crypto.randomUUID(),
    turnId: crypto.randomUUID(), utteranceId: crypto.randomUUID(), epoch: 1,
  };
  let player: Awaited<ReturnType<typeof openPlayback>> | undefined;
  let sentEnd = false;
  let stopTimer = 0;
  const close = () => {
    player?.dispose();
    if (context.state !== "closed") void context.close();
    signal.removeEventListener("abort", stop);
    clearTimeout(stopTimer);
  };
  const stop = () => {
    player?.reset(lane.sessionId, 2);
    stopTimer = window.setTimeout(() => { close(); show("Stopped · no audio receipt"); }, 1000);
  };
  try {
    signal.throwIfAborted();
    const resumed = context.resume();
    player = await openPlayback(context, report => {
      analyser.getFloatTimeDomainData(wave);
      for (const sample of wave) peak = Math.max(peak, Math.abs(sample));
      const time = context.currentTime;
      if (report.state === "playing" || report.state === "draining") first ??= time;
      if (report.state === "underrun" && previous !== "underrun") underruns++;
      previous = report.state;
      if (report.state === "cancelled") {
        clearTimeout(stopTimer);
        stopTimer = window.setTimeout(() => { close(); show(`Cancelled at ${report.playedSamples} source samples`); }, 30);
        return;
      }
      if (report.state === "failed" || report.state === "completed") {
        close();
        const drift = first === undefined ? "unavailable" : `${Math.abs((time - first - seconds) * 1000).toFixed(1)} ms`;
        show(report.error?.message ??
          `${report.state} | ${context.sampleRate} Hz | ${report.playedSamples}/${total} source samples | context drift ${drift} | ${underruns} underruns | graph loopback peak ${peak.toFixed(4)} | ${report.clockQuality}`);
        return;
      }
      if (signal.aborted || sentEnd || !player) return;
      while (offset < total && player.credit() >= 480) {
        if (!player.enqueue({ ...lane, chunkIndex, sampleOffset: offset, sampleCount: 480, pcm: tonePcm(offset, 480) })) break;
        offset += 480;
        chunkIndex++;
      }
      if (offset === total) {
        sentEnd = true;
        player.end(total);
      }
    }, analyser);
    await resumed;
    signal.throwIfAborted();
    signal.addEventListener("abort", stop, { once: true });
    player.volume(false, .12);
    player.start(lane);
  } catch (error) {
    close();
    if (!signal.aborted) show(error instanceof Error ? error.message : "Audio fixture failed");
  }
}
