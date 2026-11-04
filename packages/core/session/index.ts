import { randomUUID } from "node:crypto";
import type { CompanionEvent, EventBodies, Snapshot } from "../../contracts/companion";
import type { DesiredVisual } from "../../contracts/avatar-speech";
import type { ResolvedBinding } from "../../contracts/inference";
import { matchesActiveScope, parseCommand } from "../../contracts/validation";
import { CompanionStore } from "../../storage";
import { builtinMock } from "../../session-backends/builtin";

const desiredVisual: DesiredVisual = {
  revision: 1, base: "idle", activity: { kind: "none", source: "local_input", ttlMs: 0 },
  emotion: { name: "neutral", weight: 0, ttlMs: 0 }, gaze: "auto", gesture: null, reducedMotion: false,
};

export class MockSession {
  readonly sessionId = randomUUID();
  private seq = 0;
  private busy = false;
  private readonly epoch = 1;

  constructor(
    private readonly store: CompanionStore,
    private readonly scope: { characterId: string; conversationId: string; channelId: string; avatarId: string },
    private readonly binding: ResolvedBinding,
    private readonly send: (event: CompanionEvent) => void,
  ) {}

  private emit<K extends keyof EventBodies>(kind: K, body: EventBodies[K], turnId: string | null = null) {
    this.send({
      protocol: "companion", version: 1, sessionId: this.sessionId, eventId: randomUUID(),
      eventSeq: ++this.seq, epoch: this.epoch, characterId: this.scope.characterId,
      conversationId: this.scope.conversationId, turnId, kind, body,
    } as CompanionEvent);
  }

  snapshot() {
    const { characterId, conversationId, avatarId, channelId } = this.scope;
    const transcriptTail = this.store.history(characterId, conversationId).map(({ ordinal: _, ...message }) => message);
    const body: Snapshot = {
      epoch: this.epoch, characterId, conversationId, avatarId, channelId, state: "ready",
      activeTurn: null, transcriptTail, desiredVisual, actualVisual: null,
      audio: { muted: false, volume: 1, replay: false },
    };
    while (transcriptTail.reduce((total, message) => total + message.text.length, 0) > 48000 ||
      new TextEncoder().encode(JSON.stringify(body)).byteLength > 260000) transcriptTail.shift();
    this.emit("state.snapshot", body);
  }

  async receive(value: unknown) {
    let command;
    try {
      command = parseCommand(value);
    } catch {
      return;
    }
    if (command.sessionId !== this.sessionId) return;
    if (command.kind === "sync.request") {
      this.snapshot();
      return;
    }
    const reject = (code: "busy" | "stale_epoch" | "unsupported_capability" | "storage_failed" | "conflict", message: string) =>
      this.emit("command.result", {
        commandId: command.commandId, status: "rejected", effect: "noop",
        turnId: null, messageId: null, error: { code, message, retryable: code === "busy", diagnosticId: randomUUID() },
      });
    if (command.kind !== "input.submit") return reject("unsupported_capability", "This build supports text and history.");
    if (!matchesActiveScope(command, { ...this.scope, sessionId: this.sessionId, epoch: this.epoch })) {
      return reject("stale_epoch", "The active conversation changed.");
    }
    if (this.busy) return reject("busy", "Wait for the current reply.");
    const { characterId, conversationId, channelId } = this.scope;
    const { text, clientInputId, source } = command.body;
    this.busy = true;
    let turnId: string | null = null;
    try {
      const accepted = this.store.accept({
        characterId, conversationId, commandId: command.commandId, text, clientInputId, source,
        frozenContext: { modelId: this.binding.profile.modelId, routeRevision: this.binding.sourceRouteRevision },
      });
      this.emit("command.result", {
        commandId: command.commandId, status: "accepted", effect: "committed",
        turnId: accepted.turnId, messageId: accepted.messageId, error: null,
      }, accepted.turnId);
      if (accepted.duplicate) return;
      turnId = accepted.turnId;
      const history = this.store.history(characterId, conversationId, 20);
      const userMessage = history.find(message => message.id === accepted.messageId);
      if (!userMessage) throw new Error("Accepted message missing");
      const { ordinal: _, ...user } = userMessage;
      this.emit("turn.started", { turnId, userMessage: user, assistantMessageId: accepted.assistantMessageId }, turnId);
      let revision = 1;
      let offset = 0;
      let outcome: "completed" | "failed" = "failed";
      const backend = builtinMock(this.binding);
      for await (const event of backend.runTurn({
        scope: { characterId, conversationId, channelId, turnId },
        input: { messageId: accepted.messageId, text },
        context: { instructions: "", memories: [], history: history
          .filter(message => message.turnId !== turnId)
          .map(message => ({ role: message.role, text: message.text, partial: message.status !== "complete" })) },
      }, new AbortController().signal)) {
        if (event.kind === "text.delta") {
          const updated = this.store.checkpoint(turnId, revision, event.text);
          this.emit("message.delta", {
            messageId: updated.id, fromRevision: revision, toRevision: updated.revision,
            offsetUtf16: offset, textDelta: event.text,
          }, turnId);
          revision = updated.revision;
          offset = updated.text.length;
        }
        if (event.kind === "response.finished") outcome = "completed";
      }
      this.store.finish(turnId, outcome);
      const final = this.store.history(characterId, conversationId, 1)[0];
      if (!final) throw new Error("Final message missing");
      this.emit("message.final", { messageId: final.id, revision: final.revision, text: final.text, status: final.status, outcome }, turnId);
      this.emit("turn.finished", { turnId, state: outcome, warnings: [] }, turnId);
    } catch (error) {
      if (turnId === null) {
        reject(error instanceof Error && error.constructor.name === "StorageConflict" ? "conflict" : "storage_failed", "Could not save this input.");
      } else {
        try { this.store.finish(turnId, "failed"); } catch { /* Startup recovery preserves committed text. */ }
        this.emit("system.problem", { code: "storage_failed", message: "The turn could not finish.", retryable: false, diagnosticId: randomUUID() }, turnId);
        this.emit("turn.finished", { turnId, state: "failed", warnings: [] }, turnId);
      }
    } finally {
      this.busy = false;
    }
  }
}
