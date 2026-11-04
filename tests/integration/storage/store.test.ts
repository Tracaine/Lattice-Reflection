import { spawnSync } from "node:child_process";
import { mkdtempSync, rmSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { DatabaseSync } from "node:sqlite";
import { fileURLToPath } from "node:url";
import { afterEach, beforeEach, describe, expect, it } from "vitest";
import { CompanionStore, StorageConflict } from "../../../packages/storage";
import { conversation, input, profile, seeded } from "./fixture";

let directory: string;
let path: string;
beforeEach(() => {
  directory = mkdtempSync(join(tmpdir(), "open-companion-storage-"));
  path = join(directory, "companion.sqlite");
});
afterEach(() => rmSync(directory, { recursive: true, force: true }));

describe("transactional transcript", () => {
  it.each([
    ["before-accept", false, ""], ["after-accept", true, ""],
    ["before-checkpoint", true, ""], ["after-checkpoint", true, "Partial."],
  ] as const)("recovers from process death %s", (point, committed, partial) => {
    const worker = fileURLToPath(new URL("./crash-worker.mjs", import.meta.url));
    const result = spawnSync(process.execPath, [worker, path, point], { encoding: "utf8", timeout: 5000 });
    expect(result.signal, result.stderr).toBe("SIGKILL");
    const store = new CompanionStore(path);
    try {
      const recovered = store.history(profile.id, conversation.id);
      expect(recovered.map(({ text, status }) => [text, status]))
        .toEqual(committed ? [["Hello", "complete"], [partial, "interrupted"]] : []);
      const receipt = store.accept(input);
      expect(receipt.duplicate).toBe(committed);
      if (committed) expect(receipt.messageId).toBe(recovered[0]?.id);
      expect(store.history(profile.id, conversation.id)).toHaveLength(2);
      expect(store.events().filter(event => event.kind === "turn.accepted")).toHaveLength(1);
    } finally {
      store.close();
    }
  });

  it("rejects command conflicts, invalid scopes and stale checkpoints", () => {
    const store = seeded(path);
    try {
      const accepted = store.accept(input);
      expect(store.accept(input)).toEqual({ ...accepted, duplicate: true });
      expect(() => store.accept({ ...input, text: "different" })).toThrow(StorageConflict);
      expect(() => store.accept({ ...input, characterId: "other" })).toThrow(StorageConflict);
      expect(() => store.accept({ ...input, conversationId: "missing" })).toThrow(StorageConflict);
      store.checkpoint(accepted.turnId, 1, "Done.");
      expect(() => store.checkpoint(accepted.turnId, 1, "Duplicate.")).toThrow(StorageConflict);
      store.finish(accepted.turnId, "completed");
      expect(store.history(profile.id, conversation.id)[1]).toMatchObject({ text: "Done.", status: "complete" });
    } finally {
      store.close();
    }
  });

  it("rejects a previously accepted command after its character is deleted", () => {
    const store = seeded(path);
    store.accept(input);
    store.close();
    const database = new DatabaseSync(path);
    database.prepare("UPDATE characters SET deletedAtMs = 124 WHERE id = ?").run(profile.id);
    database.close();

    const reopened = new CompanionStore(path);
    try {
      expect(() => reopened.accept(input)).toThrow(StorageConflict);
      expect(() => reopened.history(profile.id, conversation.id)).toThrow(StorageConflict);
    } finally {
      reopened.close();
    }
  });

  it("rolls back initial migration failure and can reopen the same file", () => {
    expect(() => new CompanionStore(path, { beforeCommit: () => { throw new Error("injected"); } })).toThrow("injected");
    const store = seeded(path);
    store.close();
  });

  it("reopens a consistent backup taken while the WAL database is open", async () => {
    const store = seeded(path);
    const backup = join(directory, "backup.sqlite");
    try {
      const accepted = store.accept(input);
      store.checkpoint(accepted.turnId, 1, "Done.");
      store.finish(accepted.turnId, "completed");
      await store.backup(backup);
      const restored = new CompanionStore(backup);
      try {
        expect(restored.history(profile.id, conversation.id)).toEqual(store.history(profile.id, conversation.id));
        expect(restored.events()).toEqual(store.events());
        expect(restored.accept(input)).toEqual({ ...accepted, duplicate: true });
      } finally {
        restored.close();
      }
    } finally {
      store.close();
    }
  });
});
