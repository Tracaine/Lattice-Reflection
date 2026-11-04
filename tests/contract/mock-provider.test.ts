import { describe, expect, it } from "vitest";
import { mockProvider, mockReply } from "../../packages/inference/adapters/mock";
import type { InferenceRequest } from "../../packages/contracts/inference";
import { VirtualClock } from "../fixtures/virtual-clock";
import seed from "../../examples/mock-configuration.json";

const profile = seed.modelProfiles[0]!;
const connection = seed.connections[0]!;
const route = seed.routeBindings.find(item => item.role === "dialogue")!;
const request: InferenceRequest = {
  callId: profile.id,
  binding: {
    selectionId: profile.id, role: "dialogue", sourceScope: { kind: "application" },
    sourceRouteId: route.id, sourceRouteRevision: route.revision, resolvedAtMs: 0,
    connection: { ...connection, kind: "mock", auth: { kind: "none" } },
    profile: {
      ...profile, capabilities: {
        ...profile.capabilities, text: true, instructionRole: "system", structuredOutput: "none", usage: "unavailable",
      },
    },
    parameters: { mode: "model", profileId: profile.id, maxOutputTokens: 32 },
  },
  messages: [{ role: "user", content: "Hello" }],
  output: { kind: "text" },
};

function events(signal = new AbortController().signal, options?: Parameters<typeof mockProvider>[0]) {
  return mockProvider(options).generate(request, {
    signal, resolveSecret: async () => { throw new Error("The mock must not resolve credentials"); },
  });
}

describe("offline mock", () => {
  it("emits ordered deterministic text and a single terminal", async () => {
    const first = await Array.fromAsync(events());
    expect(first).toEqual(await Array.fromAsync(events()));
    expect(first.map(event => event.kind)).toEqual(["started", "text_delta", "text_delta", "finished"]);
    expect(first.filter(event => event.kind === "text_delta").map(({ index, text }) => [index, text]))
      .toEqual(mockReply.map((text, index) => [index, text]));
  });

  it("preserves a partial reply on failure", async () => {
    const result = await Array.fromAsync(events(undefined, { failAt: 1 }));
    expect(result.map(event => event.kind)).toEqual(["started", "text_delta", "failed"]);
  });

  it("cancels a pending virtual wait without emitting late text", async () => {
    const clock = new VirtualClock();
    const controller = new AbortController();
    const iterator = events(controller.signal, { wait: signal => clock.sleep(20, signal) })[Symbol.asyncIterator]();
    expect((await iterator.next()).value.kind).toBe("started");
    const first = iterator.next();
    clock.advance(20);
    expect((await first).value.kind).toBe("text_delta");
    const second = iterator.next();
    controller.abort();
    expect((await second).value.kind).toBe("cancelled");
    clock.advance(20);
    expect((await iterator.next()).done).toBe(true);
  });
});
