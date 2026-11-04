import type { InferenceEvent, InferenceRequest, ProviderAdapter, Usage } from "../../../contracts/inference";

export const mockReply = ["Hello. ", "This is an offline mock reply."] as const;

export function mockProvider(options: {
  wait?: (signal: AbortSignal) => Promise<void>;
  failAt?: number;
} = {}): ProviderAdapter {
  return {
    kind: "mock",
    async listModels() {
      return [
        { id: "mock-companion-v1", label: "Scripted companion" },
        { id: "mock-brief-v1", label: "Scripted brief companion" },
      ];
    },
    async *generate({ callId, binding }: InferenceRequest, { signal }): AsyncIterable<InferenceEvent> {
      const usage: Usage = {
        status: "unknown", inputTokens: null, outputTokens: null, totalTokens: null, cost: null,
      };
      yield { kind: "started", callId, providerRequestId: null };
      try {
        const script = binding.profile.modelId === "mock-brief-v1" ? ["Hello."] : mockReply;
        for (const [index, text] of script.entries()) {
          signal.throwIfAborted();
          await options.wait?.(signal);
          signal.throwIfAborted();
          if (options.failAt === index) throw new Error("Scripted failure");
          yield { kind: "text_delta", callId, index, text, textKind: "answer" };
        }
        signal.throwIfAborted();
      } catch {
        if (signal.aborted) yield { kind: "cancelled", callId, usage };
        else yield { kind: "failed", callId, usage, error: {
          code: "upstream_error", retryable: false, diagnosticId: callId,
          safeMessage: "The offline mock failed.", httpStatus: null, retryAfterMs: null,
        } };
        return;
      }
      yield { kind: "finished", callId, reason: "stop", usage };
    },
  };
}
