import type { SessionBackend } from "../../contracts/backend";
import type { ResolvedBinding } from "../../contracts/inference";
import { mockProvider } from "../../inference/adapters/mock";
import { setTimeout } from "node:timers/promises";

export function builtinMock(binding: ResolvedBinding): SessionBackend {
  return {
    capabilities: () => ({
      text: true, audio: "none", visualSuggestions: false,
      cancellation: "acknowledged", contextOwner: "companion",
    }),
    async *runTurn(request, signal) {
      const adapter = mockProvider({ wait: signal => setTimeout(120, undefined, { signal }) });
      const messages = [
        ...(request.context?.history.map(entry => ({ role: entry.role, content: entry.text })) ?? []),
        { role: "user" as const, content: request.input.text },
      ];
      for await (const event of adapter.generate({
        callId: request.scope.turnId, binding, messages, output: { kind: "text" },
      }, { signal, resolveSecret: async () => { throw new Error("Mock has no credentials"); } })) {
        switch (event.kind) {
          case "started": yield { kind: "response.started", externalResponseId: null }; break;
          case "text_delta": yield { kind: "text.delta", index: event.index, text: event.text }; break;
          case "finished": yield { kind: "response.finished", outcome: "completed" }; break;
          case "cancelled": yield { kind: "response.cancelled" }; break;
          case "failed": yield { kind: "response.failed", error: {
            code: "dependency_failed", message: event.error.safeMessage,
            retryable: false, diagnosticId: event.error.diagnosticId,
          } }; break;
        }
      }
    },
  };
}
