import { randomUUID } from "node:crypto";
import { expect, it } from "vitest";
import { PcmClock, sourceRate } from "../../../packages/audio/clock";

it.each([24000, 44100, 48000])("renders ten simulated minutes at %i Hz without accumulated sample drift", rate => {
  const id = randomUUID();
  const lane = { sessionId: id, characterId: id, conversationId: id, turnId: id, utteranceId: id, epoch: 1 };
  const clock = new PcmClock(rate);
  clock.start(lane);
  const seconds = 600;
  const total = seconds * sourceRate;
  const lengths = [127, 512, 2000, 31];
  const blocks = lengths.map(length => new Float32Array(length));
  let offset = 0;
  let index = 0;
  let rendered = 0;
  let iteration = 0;
  let ended = false;
  const pcm = new ArrayBuffer(960);
  new DataView(pcm).setInt16(0, 4000, true);
  while (rendered < rate * seconds) {
    let credit = clock.report()!.creditSamples;
    while (offset < total && credit >= 480) {
      if (!clock.append({ ...lane, chunkIndex: index++, sampleOffset: offset, sampleCount: 480, pcm })) {
        throw new Error("Unexpected PCM ingress failure");
      }
      offset += 480;
      credit -= 480;
    }
    if (!ended && offset === total) ended = clock.end(lane, total);
    const available = rate * seconds - rendered;
    const block = blocks[iteration++ % blocks.length]!;
    const current = block.length <= available ? block : block.subarray(0, available);
    clock.render(current);
    rendered += current.length;
  }
  expect(clock.report()).toMatchObject({
    state: "completed", playedSamples: total, bufferedSamples: 0,
    clockQuality: "rendered_samples", outputLatencyMs: null,
  });
  expect(Math.abs(rendered / rate - clock.report()!.playedSamples / sourceRate) * 1000).toBe(0);
}, 15000);
