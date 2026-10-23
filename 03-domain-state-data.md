# Domain state, persistence, and recovery

ART-005. DEC-003/007/008. The broker is the only domain writer. SQLite is an implementation choice behind repository ports, not the transport protocol.

## Storage layout and records

Use Electron's application user-data directory, with a stable product folder configured by the host. The future packaged app must not store data inside its installation, this research workspace, or the Animates installation.

~~~text
user-data/
  companion.sqlite
  assets/<sha256>/...       immutable imported files
  secrets/                 OS-encrypted credentials; excluded from exports/backups
  backups/                 consistent database snapshots + asset manifest
  diagnostics/             redacted rotating logs
  cache/                   disposable thumbnails; no default audio archive
~~~

| DAT | Tables / files and essential fields | Authority and lifetime |
| --- | --- | --- |
| DAT-001 | characters: id, revision, name, profileJson, avatarId, voiceBindingId, createdAt, updatedAt, deletedAt | Coordinator. Stable UUID; profile includes biography, instructions, language, authored preferences. |
| DAT-002 | avatars: id, contentHash, manifestJson, capabilitiesJson, importReportJson, revision | Asset importer; may be referenced by multiple characters. Immutable source files, versioned mapping metadata. |
| DAT-003 | provider_connections, model_profiles, route_bindings: IDs, revision, enabled, nonsecret configuration, secretRef | Inference gateway. No API key in these tables. Route scope uses explicit scope kind/key/role with unique constraint. |
| DAT-004 | channels, channel_bindings, conversations: IDs, characterId, channelId, backendConnectionId, title, createdAt, archivedAt | Coordinator/channel gateway. Conversation's character/channel cannot change after creation. |
| DAT-005 | turns, messages, speech_receipts: IDs, conversationId, commandId, state, text, textRevision, routeSnapshotJson, errorCode, timestamps, playedSamples | Coordinator. User message and turn accepted together; assistant checkpoints update one message. |
| DAT-006 | memories, memory_sources, diaries, diary_sources: characterId, revision, text, status, origin, visibilityJson, pinned, confidence, source IDs, timestamps | Memory service. FTS5 index is derived; never the authority. |
| DAT-007 | command_receipts, domain_events, presentation_sessions: command digest/result, commit sequence, epoch, revision, client lease | Coordinator. Exactly-once local acceptance for a retained command ID; events are a durable outbox, not a replayable audio archive. |
| DAT-008 | inference_attempts, usage_records: local attemptId, binding snapshot, providerRequestId, outcome, usageStatus, counts, costEstimate, timestamps | Gateway/accounting. Store one usage total per attempt; revisions replace totals. |
| DAT-009 | secrets/*.bin | Host. OS-encrypted opaque values; no content/provider service writes them directly. |
| DAT-010 | asset files, manifest hashes, thumbnail cache | Importer/store. Content-addressed assets; reference-counted cleanup after committed deletion. |
| DAT-011 | app_settings: key, valueJson, revision; devices chosen by stable ID where available | Coordinator owns saved preferences; host reports actual device availability. Missing devices produce a visible “choose/default device” state. |
| DAT-012 | channel_inbox, channel_outbox: external IDs, bindingId, turnId, body, delivery state, remote receipt | Channel gateway. Dedupe incoming IDs; preserve uncertain outgoing delivery for inspection. |
| DAT-013 | backend_connections: id, revision, adapterKind, enabled, baseUrl, secretRef, declaredCapabilitiesJson | Session backends own external orchestration configuration; it is not a model-provider connection. |
| DAT-014 | speech_connections, voice_bindings: id, revision, endpoint/auth reference, selected TTS/STT models and voice | Speech service owns independent speech configuration; character records reference a binding. |

SQLite columns use TEXT UUIDs, INTEGER UTC milliseconds/revisions, and validated JSON TEXT for nested configuration. Unique indexes: messages(conversationId, ordinal), turns(commandId), command_receipts(commandId), route_bindings(scopeKind,scopeKey,role), channel_inbox(bindingId,externalMessageId), usage_records(attemptId). Foreign keys are enabled. Add CHECK constraints for enumerations and nonnegative counters. Use WAL and synchronous=FULL; a single broker owns the database connection. Large queries are bounded/paginated and never run in the UI process.

## Distinct state machines

| Entity | States and transitions | Owner/recovery |
| --- | --- | --- |
| Turn | accepted → running → completed / cancelled / failed | Coordinator. On restart, accepted/running → cancelled(reason=process_restart); never resend. |
| Assistant message | streaming → complete / interrupted / failed | Text checkpoints persist throughout. Completed text remains complete if its audio is later interrupted. |
| Utterance | pending → buffering → playing ↔ underrun → draining → completed; any live state → cancelled / failed | Playback runtime. Stop/epoch change wins; completion means the scheduled content drained, not merely TTS ended. |
| Capture | idle → recording → transcribing → idle; recording/transcribing → cancelled/failed | Input/speech service. Explicit PTT controls; no always-on VAD in v1. |
| Character presentation | ready → switching → ready / degraded | Coordinator. Increment epoch, stop old output, prepare new avatar, then commit selection; load failure restores old selection in the new epoch. |
| Visual intent | requested → accepted → applied / suppressed / unsupported / expired / failed | Director accepts policy; avatar reports outcome. Expiry is not retroactively “success.” |
| Memory | proposed → active / rejected; active → superseded / deleted | Owner review through memory service. Edits create a revision; superseded content is excluded from retrieval. |
| Channel outbox | pending → sending → delivered / failed / uncertain | Gateway. Unknown network outcome → uncertain, not automatic resend. |

Turn completion waits for text terminal and any requested speech terminal. A speech failure after successful text makes the turn completed with a presentation warning; it does not falsify the text result. A cancellation retains generated text, marks a still-streaming message interrupted, and records the played audio position. Subsequent prompt context labels interrupted/failed assistant messages as partial; the user can exclude one from context.

## Acceptance, checkpoint, and event transactions

A valid submit command carries a unique commandId. In one transaction, insert its receipt, input message, turn, frozen profile/route/backend context, and durable accepted event. Only then acknowledge. Repeating the same ID and payload digest returns the saved acknowledgement; a different payload with that ID returns conflict. Keep lightweight receipts for the lifetime of the conversation. Do not include original text in the digest ledger after the conversation is deleted.

Text deltas are coalesced for at most 40 ms or 256 UTF-16 code units, whichever occurs first. Commit the accumulated message text, textRevision, and corresponding event before publishing to the UI. This bounds pending crash loss and ensures displayed accepted checkpoints are recoverable. Streaming audio and 50 ms playback ticks are ephemeral; only start/terminal and final/interruption receipts persist.

Domain events have a database commit sequence independent of the live connection eventSeq. Keep domain event payloads seven days, then compact after the state they describe is committed. Snapshot resynchronization uses authoritative tables, not an assumption that the full event history still exists. Deletion must purge content-bearing events and FTS rows too.

## Context and memory policy

The built-in backend assembles: authored character instructions; approved allowed memories; a bounded current-conversation history; current input. It never fetches another character's history. User statements and model statements retain their roles. Suggested summaries are marked derived and must cite actual source messages.

Memory fields distinguish origin (user_authored, user_reported, model_proposed, imported), status, confidence (0–1 or null), source time, and allowed channel IDs/kinds. Default visibility is local desktop channels for that character. Sharing selected memories with a remote channel is an explicit setting. Full transcript from another channel is never included merely because both channels use the same character.

Initial retrieval uses pinned approved records first, then sanitized full-text terms and recency, with deterministic tie-breaking by ID. Select at most eight records and 4,000 UTF-16 code units of memory text. Prompt assembly uses the chosen model profile's context limit and a conservative token estimate (UTF-8 byte count when no tokenizer is available), reserves maxOutputTokens plus 512 tokens, and removes oldest history first. Never truncate the current input or authored instructions silently: return context_too_large if those alone do not fit. Record selected memory IDs and removed-history count.

Diaries are generated only on request using the optional memory-role binding. With that role disabled, show an ordinary chronological activity list and an explanation; do not fabricate a generated diary. A generated diary is a proposal until reviewed. Deleting a source message invalidates its derived summaries and model-derived memories; exclude them until reviewed/rebuilt. User-authored memory can remain independently.

## Retention, deletion, and export

History, profiles, and approved memory persist until deleted. Raw microphone/audio streams are memory-only by default. Diagnostic logs exclude message/audio content and rotate at 10 MB × 5 files; usage metadata retains 90 days unless the owner exports it.

Deleting a conversation removes messages, source-dependent derived content, FTS rows, receipts, and content-bearing events in one logical transaction; mark affected running work cancelled first. Character deletion requires the UI to show the affected conversations/memories. Backup copies are outside that transaction: explain their retention and offer a separate “remove local backups containing deleted data” operation. Do not imply forensic erasure from SSDs or external copies.

Export format is versioned JSON plus optionally copied avatar assets with original license metadata. Exclude keys, external service tokens, raw audio, provider error bodies, and private debug traces. Import validates size/version, assigns new IDs by default, rewrites internal references, and never overwrites an existing character without an explicit import choice. Memory imports start proposed unless the owner confirms them.

## Migrations, backup, and restart

Every schema change is a numbered forward migration with a checksum recorded in schema_migrations. Before migration, use SQLite's backup mechanism to create a consistent snapshot; do not copy a live database file while ignoring WAL. Verify integrity and available disk space first. Failed migration rolls back its transaction and leaves the original plus backup; the app opens a recovery screen, not an empty replacement database.

Automatic backup: once per day on the first idle opportunity, retain seven daily snapshots plus the last pre-migration snapshot. Asset files are immutable; each backup includes hashes/references and retains their referenced files. Secrets are not restored from a data export. Restore while the broker is stopped, validate schema/integrity/assets, then atomically select the restored dataset; preserve the previous dataset as a recoverable backup.

A broker crash recovers SQLite, marks unfinished turns interrupted, increments presentation epoch, rebuilds disposable indexes if necessary, and reissues snapshots. It does not replay PCM, regenerate text, or retry an uncertain channel send. Capture is never resumed without a new user action.
