import { describe, expect, it } from "vitest";
import { randomUUID } from "node:crypto";
import { PcmClock, type Lane } from "../../../packages/audio/clock";
import { tonePcm } from "../../../packages/audio/fixture";

const lane: Lane = {
  sessionId: randomUUID(), characterId: randomUUID(), conversationId: randomUUID(),
  turnId: randomUUID(), utteranceId: randomUUID(), epoch: 1,
};
const frame = (chunkIndex: number, sampleOffset: number, sampleCount = 480, scope = lane) =>
  ({ ...scope, chunkIndex, sampleOffset, sampleCount, pcm: tonePcm(sampleOffset, sampleCount) });
const fill = (clock: PcmClock, chunks: number, from = 0) => {
  for (let i = from; i < from + chunks; i++) expect(clock.append(frame(i, i * 480))).toBe(true);
};

describe("PCM playback", () => {
  it("uses prebuffer, freezes during underrun, and drains a final short tail", () => {
    const clock = new PcmClock(48000);
    clock.start(lane);
    fill(clock, 9);
    const block = new Float32Array(256);
    clock.render(block);
    expect(clock.report()).toMatchObject({ state: "buffering", playedSamples: 0, bufferedSamples: 4320 });
    fill(clock, 1, 9);
    clock.render(new Float32Array(12000));
    const playedSamples = clock.report()!.playedSamples;
    expect(clock.report()?.state).toBe("underrun");
    clock.render(block);
    expect(clock.report()?.playedSamples).toBe(playedSamples);
    fill(clock, 1, 10);
    expect(clock.end(lane, 5280)).toBe(true);
    clock.render(new Float32Array(2048));
    expect(clock.report()).toMatchObject({ state: "completed", playedSamples: 5280, bufferedSamples: 0, creditSamples: 0 });
  });

  it("enforces sample credit, duplicate fingerprints, sequence and declared total", () => {
    const clock = new PcmClock(24000);
    clock.start(lane);
    expect(clock.append(frame(0, 0))).toBe(true);
    expect(clock.append(frame(0, 0))).toBe(true);
    expect(clock.report()?.bufferedSamples).toBe(480);
    expect(clock.append({ ...frame(0, 0), pcm: new ArrayBuffer(960) })).toBe(false);
    expect(clock.report()?.error?.code).toBe("audio_gap");

    const next = new PcmClock(24000);
    next.start(lane);
    fill(next, 100);
    expect(next.report()?.creditSamples).toBe(0);
    expect(next.append(frame(100, 48000))).toBe(false);
    expect(next.report()?.error?.code).toBe("audio_overflow");

    const gap = new PcmClock(24000);
    gap.start(lane);
    expect(gap.append(frame(1, 480))).toBe(false);
    expect(gap.report()?.error?.code).toBe("audio_gap");

    const badEnd = new PcmClock(24000);
    badEnd.start(lane);
    expect(badEnd.end(lane, 1)).toBe(false);
    expect(badEnd.report()?.error?.code).toBe("audio_gap");
  });

  it("keeps mute on the content clock and fades cancellation without consuming queued samples", () => {
    const clock = new PcmClock(48000);
    clock.start(lane);
    fill(clock, 12);
    const muted = new Float32Array(256);
    clock.volume(true, 1);
    clock.render(muted);
    expect(muted.every(value => value === 0)).toBe(true);
    expect(clock.report()?.playedSamples).toBe(128);
    clock.volume(false, 1);
    clock.render(new Float32Array(777));
    const atStop = clock.report()!.playedSamples;
    clock.reset(lane.sessionId, 2);
    expect(clock.append(frame(12, 5760))).toBe(false);
    expect(clock.start(lane)).toBe(false);
    const fade = new Float32Array(512);
    clock.render(fade);
    expect(Math.abs(fade[0]!)).toBeGreaterThan(0);
    expect(Math.abs(fade[479]!)).toBeLessThan(Math.abs(fade[0]!));
    expect(fade.slice(480).every(value => value === 0)).toBe(true);
    expect(clock.report()).toMatchObject({ state: "cancelled", playedSamples: atStop, creditSamples: 0 });
    expect(clock.start({ ...lane, epoch: 2, utteranceId: randomUUID() })).toBe(true);
    expect(clock.append(frame(0, 0))).toBe(false);
  });

  it("reports device failure and a two-second underrun timeout", () => {
    const clock = new PcmClock(24000);
    clock.start(lane);
    fill(clock, 10);
    clock.render(new Float32Array(4800));
    clock.render(new Float32Array(47999));
    expect(clock.report()?.state).toBe("underrun");
    clock.render(new Float32Array(1));
    expect(clock.report()?.error?.code).toBe("timeout");
    expect(clock.report()?.playedSamples).toBe(4800);
    clock.start({ ...lane, epoch: 2 });
    clock.deviceFailed();
    expect(clock.report()).toMatchObject({ state: "failed", bufferedSamples: 0, error: { code: "dependency_failed" } });
  });
});
