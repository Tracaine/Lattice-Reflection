export const initialMigration = `
  CREATE TABLE schema_migrations (
    version INTEGER PRIMARY KEY, checksum TEXT NOT NULL
  ) STRICT;
  CREATE TABLE characters (
    id TEXT PRIMARY KEY, revision INTEGER NOT NULL CHECK(revision >= 1),
    name TEXT NOT NULL, profileJson TEXT NOT NULL CHECK(json_valid(profileJson)),
    avatarId TEXT NOT NULL, voiceBindingId TEXT, createdAtMs INTEGER NOT NULL,
    updatedAtMs INTEGER NOT NULL, deletedAtMs INTEGER
  ) STRICT;
  CREATE TABLE channels (id TEXT PRIMARY KEY) STRICT;
  CREATE TABLE conversations (
    id TEXT PRIMARY KEY, characterId TEXT NOT NULL REFERENCES characters(id),
    channelId TEXT NOT NULL REFERENCES channels(id), title TEXT NOT NULL,
    createdAtMs INTEGER NOT NULL, updatedAtMs INTEGER NOT NULL, archivedAtMs INTEGER
  ) STRICT;
  CREATE TABLE turns (
    id TEXT PRIMARY KEY, conversationId TEXT NOT NULL REFERENCES conversations(id) ON DELETE CASCADE,
    commandId TEXT NOT NULL UNIQUE, state TEXT NOT NULL
      CHECK(state IN ('accepted', 'running', 'completed', 'cancelled', 'failed')),
    routeSnapshotJson TEXT NOT NULL CHECK(json_valid(routeSnapshotJson)),
    reason TEXT, createdAtMs INTEGER NOT NULL, finishedAtMs INTEGER,
    UNIQUE(conversationId, id)
  ) STRICT;
  CREATE TABLE messages (
    id TEXT PRIMARY KEY, conversationId TEXT NOT NULL, turnId TEXT NOT NULL,
    ordinal INTEGER NOT NULL CHECK(ordinal >= 1), role TEXT NOT NULL CHECK(role IN ('user', 'assistant')),
    text TEXT NOT NULL, revision INTEGER NOT NULL CHECK(revision >= 1),
    status TEXT NOT NULL CHECK(status IN ('streaming', 'complete', 'interrupted', 'failed')),
    createdAtMs INTEGER NOT NULL,
    UNIQUE(conversationId, ordinal), UNIQUE(turnId, role),
    FOREIGN KEY(conversationId, turnId) REFERENCES turns(conversationId, id) ON DELETE CASCADE
  ) STRICT;
  CREATE TABLE command_receipts (
    commandId TEXT PRIMARY KEY REFERENCES turns(commandId) ON DELETE CASCADE,
    digest TEXT NOT NULL, resultJson TEXT NOT NULL CHECK(json_valid(resultJson))
  ) STRICT;
  CREATE TABLE domain_events (
    seq INTEGER PRIMARY KEY AUTOINCREMENT,
    conversationId TEXT NOT NULL REFERENCES conversations(id) ON DELETE CASCADE,
    kind TEXT NOT NULL, payload TEXT NOT NULL CHECK(json_valid(payload)), createdAtMs INTEGER NOT NULL
  ) STRICT;
`;
