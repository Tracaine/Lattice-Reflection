import { describe, expect, it } from "vitest";
import trace from "../../examples/interruption.trace.json";
import { matchesActiveScope, parseAudioFrame, parseCaptureFrame, parseCommand, parseEvent } from "../../packages/contracts/validation";

const input = trace.frames[0]!.message;
const id = input.sessionId;
const audio = {
  sessionId: id, epoch: 1, characterId: id, conversationId: id, turnId: id,
  utteranceId: id, chunkIndex: 0, sampleOffset: 0, sampleCount: 480, pcm: new ArrayBuffer(960),
};

describe("companion protocol", () => {
  it("accepts the published interruption exchange", () => {
    for (const frame of trace.frames) {
      const parse = frame.direction === "client_to_broker" ? parseCommand : parseEvent;
      expect(parse(frame.message)).toEqual(frame.message);
    }
  });

  it("rejects malformed and stale input scopes", () => {
    const command = parseCommand(input);
    const active = { sessionId: id, characterId: command.scope.characterId!, conversationId: command.scope.conversationId!, epoch: 1 };
    expect(matchesActiveScope(command, active)).toBe(true);
    expect(matchesActiveScope(command, { ...active, epoch: 2 })).toBe(false);
    expect(matchesActiveScope(command, { ...active, characterId: id })).toBe(false);
    for (const expectedEpoch of [0, -1, null, Infinity, 1.5]) {
      expect(() => parseCommand({ ...input, scope: { ...input.scope, expectedEpoch } })).toThrow();
    }
  });

  it("enforces command text and strips unknown fields on read DTOs only", () => {
    for (const text of [" ", "a".repeat(16001), "\uD800"]) {
      expect(() => parseCommand({ ...input, body: { ...input.body, text } })).toThrow();
    }
    expect(() => parseCommand({ ...input, body: { ...input.body, secretRef: id } })).toThrow();
    const event = trace.frames[1]!.message;
    expect(parseEvent({ ...event, body: { ...event.body, providerRequestId: id } })).toEqual(event);
    expect(() => parseEvent({ ...event, extra: "a".repeat(262144) })).toThrow();
  });

  it("requires bounded canonical PCM and distinguishes the two binary lanes", () => {
    expect(parseAudioFrame(audio)).toEqual(audio);
    for (const invalid of [{ pcm: new ArrayBuffer(959) }, { sampleCount: 4097 }, { chunkIndex: -1 }]) {
      expect(() => parseAudioFrame({ ...audio, ...invalid })).toThrow();
    }
    const capture = {
      sessionId: id, epoch: 1, captureId: id, chunkIndex: 0, sampleOffset: 0,
      sampleCount: 480, pcm: audio.pcm, sampleRate: 24000, channels: 1, encoding: "pcm_s16le",
    };
    expect(parseCaptureFrame(capture)).toEqual(capture);
    expect(() => parseAudioFrame(capture)).toThrow();
    expect(() => parseCaptureFrame({ ...capture, sampleRate: 48000 })).toThrow();
    expect(() => parseCaptureFrame({ ...capture, sampleOffset: 1440000 })).toThrow();
  });
});
