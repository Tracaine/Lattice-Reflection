import Database from "better-sqlite3";
import { createHash, randomUUID } from "node:crypto";
import type { JsonValue, MessageView } from "../contracts/common";
import type { CharacterProfile } from "../contracts/management";
import { initialMigration } from "./migration";

type FailurePoint = "migration" | "accept" | "checkpoint";
type Options = { now?: () => number; beforeCommit?: (point: FailurePoint) => void };
type Submission = {
  characterId: string; conversationId: string; commandId: string; clientInputId: string;
  source: "desktop_text" | "transcribed_voice"; text: string; frozenContext: JsonValue;
};
type Acceptance = { turnId: string; messageId: string; assistantMessageId: string };
const hash = (value: string) => createHash("sha256").update(value).digest("hex");

export class StorageConflict extends Error {}

export class CompanionStore {
  private readonly db: Database.Database;
  private readonly now: () => number;

  private readonly options: Options;

  constructor(path: string, options: Options = {}) {
    this.options = options;
    this.now = options.now ?? Date.now;
    this.db = new Database(path);
    try {
      this.db.pragma("foreign_keys = ON");
      this.db.pragma("journal_mode = WAL");
      this.db.pragma("synchronous = FULL");
      this.migrate();
      this.recover();
    } catch (error) {
      this.db.close();
      throw error;
    }
  }

  private migrate(): void {
    this.db.transaction(() => {
      const checksum = hash(initialMigration);
      const known = this.db.prepare("SELECT 1 FROM sqlite_master WHERE name = 'schema_migrations' AND type = 'table'").get();
      if (known) {
        const revisions = this.db.prepare("SELECT version, checksum FROM schema_migrations").all();
        if (JSON.stringify(revisions) !== JSON.stringify([{ version: 1, checksum }])) {
          throw new Error("Unsupported storage schema or migration checksum");
        }
        return;
      }
      if (this.db.prepare("SELECT 1 FROM sqlite_master WHERE name NOT LIKE 'sqlite_%' LIMIT 1").get()) {
        throw new Error("Storage has no recognized schema");
      }
      this.db.exec(initialMigration);
      this.db.prepare("INSERT INTO schema_migrations VALUES (1, ?)").run(checksum);
      this.options.beforeCommit?.("migration");
    })();
  }

  seed(profile: CharacterProfile, conversation: { id: string; channelId: string; title: string }): void {
    this.db.transaction(() => {
      const now = this.now();
      this.db.prepare("INSERT INTO characters VALUES (?, ?, ?, ?, ?, ?, ?, ?, NULL) ON CONFLICT(id) DO NOTHING")
        .run(profile.id, profile.revision, profile.name, JSON.stringify(profile), profile.avatarId, profile.voiceBindingId, now, now);
      this.db.prepare("INSERT INTO channels VALUES (?) ON CONFLICT(id) DO NOTHING").run(conversation.channelId);
      this.db.prepare("INSERT INTO conversations VALUES (?, ?, ?, ?, ?, ?, NULL) ON CONFLICT(id) DO NOTHING")
        .run(conversation.id, profile.id, conversation.channelId, conversation.title, now, now);
    })();
  }

  private assertScope(characterId: string, conversationId: string): void {
    const row = this.db.prepare(`
      SELECT 1 FROM conversations v JOIN characters c ON v.characterId = c.id
      WHERE v.id = ? AND c.id = ? AND c.deletedAtMs IS NULL
    `).get(conversationId, characterId);
    if (!row) throw new StorageConflict("Conversation is unavailable in this character scope");
  }

  accept(input: Submission): Acceptance & { duplicate: boolean } {
    return this.db.transaction(() => {
      this.assertScope(input.characterId, input.conversationId);
      const digest = hash(JSON.stringify([input.characterId, input.conversationId, input.clientInputId, input.source, input.text]));
      const receipt = this.db.prepare("SELECT digest, resultJson FROM command_receipts WHERE commandId = ?")
        .get(input.commandId) as { digest: string; resultJson: string } | undefined;
      if (receipt) {
        if (receipt.digest !== digest) throw new StorageConflict("Command ID has a different payload");
        return { ...JSON.parse(receipt.resultJson) as Acceptance, duplicate: true };
      }
      if (!input.text.isWellFormed() || input.text.length > 16000 || !input.text.trim()) throw new RangeError("Invalid input text");
      const now = this.now();
      const result = { turnId: randomUUID(), messageId: randomUUID(), assistantMessageId: randomUUID() };
      this.db.prepare("INSERT INTO turns VALUES (?, ?, ?, 'accepted', ?, NULL, ?, NULL)")
        .run(result.turnId, input.conversationId, input.commandId, JSON.stringify(input.frozenContext), now);
      const ordinal = (this.db.prepare("SELECT coalesce(max(ordinal), 0) AS value FROM messages WHERE conversationId = ?")
        .get(input.conversationId) as { value: number }).value;
      const insert = this.db.prepare("INSERT INTO messages VALUES (?, ?, ?, ?, ?, ?, 1, ?, ?)");
      insert.run(result.messageId, input.conversationId, result.turnId, ordinal + 1, "user", input.text, "complete", now);
      insert.run(result.assistantMessageId, input.conversationId, result.turnId, ordinal + 2, "assistant", "", "streaming", now);
      this.db.prepare("INSERT INTO command_receipts VALUES (?, ?, ?)").run(input.commandId, digest, JSON.stringify(result));
      this.touch(input.conversationId, now);
      this.event(input.conversationId, "turn.accepted", result, now);
      this.options.beforeCommit?.("accept");
      return { ...result, duplicate: false };
    })();
  }

  checkpoint(turnId: string, expectedRevision: number, delta: string): MessageView {
    return this.db.transaction(() => {
      const message = this.assistant(turnId);
      if (message.status !== "streaming" || message.revision !== expectedRevision) {
        throw new StorageConflict("Assistant revision has changed");
      }
      if (!delta || !delta.isWellFormed() || message.text.length + delta.length > 32768) throw new RangeError("Invalid assistant delta");
      this.db.prepare("UPDATE turns SET state = 'running' WHERE id = ? AND state = 'accepted'").run(turnId);
      const now = this.now();
      const revision = message.revision + 1;
      this.db.prepare("UPDATE messages SET text = ?, revision = ? WHERE id = ?").run(message.text + delta, revision, message.id);
      this.event(message.conversationId, "message.checkpoint", { messageId: message.id, revision, delta }, now);
      this.touch(message.conversationId, now);
      this.options.beforeCommit?.("checkpoint");
      return { id: message.id, turnId, role: message.role, status: message.status, createdAtMs: message.createdAtMs, text: message.text + delta, revision };
    })();
  }

  finish(turnId: string, state: "completed" | "cancelled" | "failed", reason: string | null = null): void {
    this.db.transaction(() => this.finishTurn(turnId, state, reason))();
  }

  private finishTurn(turnId: string, state: "completed" | "cancelled" | "failed", reason: string | null): void {
    const message = this.assistant(turnId);
    const now = this.now();
    const result = this.db.prepare("UPDATE turns SET state = ?, reason = ?, finishedAtMs = ? WHERE id = ? AND state IN ('accepted', 'running')")
      .run(state, reason, now, turnId);
    if (!result.changes) return;
    const status = { completed: "complete", cancelled: "interrupted", failed: "failed" }[state];
    this.db.prepare("UPDATE messages SET status = ?, revision = revision + 1 WHERE id = ? AND status = 'streaming'").run(status, message.id);
    this.event(message.conversationId, "turn.finished", { turnId, state, reason }, now);
    this.touch(message.conversationId, now);
  }

  private recover(): void {
    this.db.transaction(() => {
      const active = this.db.prepare("SELECT id FROM turns WHERE state IN ('accepted', 'running')").all() as { id: string }[];
      for (const { id } of active) this.finishTurn(id, "cancelled", "process_restart");
    })();
  }

  private assistant(turnId: string): MessageView & { conversationId: string } {
    const row = this.db.prepare("SELECT * FROM messages WHERE turnId = ? AND role = 'assistant'").get(turnId);
    if (!row) throw new StorageConflict("Turn is unavailable");
    return row as MessageView & { conversationId: string };
  }

  history(characterId: string, conversationId: string, limit = 50, beforeOrdinal = Number.MAX_SAFE_INTEGER): Array<MessageView & { ordinal: number }> {
    this.assertScope(characterId, conversationId);
    if (!Number.isSafeInteger(limit) || limit < 1 || limit > 100 || !Number.isSafeInteger(beforeOrdinal) || beforeOrdinal < 1) {
      throw new RangeError("Invalid history page");
    }
    return (this.db.prepare(`
      SELECT id, turnId, role, text, revision, status, createdAtMs, ordinal FROM messages
      WHERE conversationId = ? AND ordinal < ? ORDER BY ordinal DESC LIMIT ?
    `).all(conversationId, beforeOrdinal, limit) as Array<MessageView & { ordinal: number }>).reverse();
  }

  events(afterSeq = 0): Array<{ seq: number; kind: string; payload: string }> {
    return this.db.prepare("SELECT seq, kind, payload FROM domain_events WHERE seq > ? ORDER BY seq LIMIT 100")
      .all(afterSeq) as Array<{ seq: number; kind: string; payload: string }>;
  }

  private touch(conversationId: string, now: number): void {
    this.db.prepare("UPDATE conversations SET updatedAtMs = ? WHERE id = ?").run(now, conversationId);
  }

  private event(conversationId: string, kind: string, payload: JsonValue, now: number): void {
    this.db.prepare("INSERT INTO domain_events (conversationId, kind, payload, createdAtMs) VALUES (?, ?, ?, ?)")
      .run(conversationId, kind, JSON.stringify(payload), now);
  }

  async backup(path: string): Promise<void> {
    await this.db.backup(path);
  }

  close(): void {
    this.db.close();
  }
}
