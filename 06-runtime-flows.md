# Runtime flows and failure proofs

ART-008. Each flow names its state owner and uses the interfaces in 05. Implement these as scenario tests rather than assuming the happy-path diagram proves them.

## FLW-001 — Startup, restart, and shutdown

Precondition: one local OS owner, application files and user-data directory accessible. Main acquires the single-instance lock and launches the broker (INT-010). LocalStore opens/migrates/reconciles SQLite (INT-006), marks unfinished turns cancelled(process_restart), and retains partial text. Coordinator creates a new session ID/epoch. UI negotiates INT-001, receives a snapshot, and loads the selected/default demo avatar.

First run seeds two demo character IDs, one mock connection/profile, application dialogue=mock, director=rules, memory=disabled, and one desktop channel shared by typed/PTT input. Each character has its own conversation on that channel. No real provider connection is enabled. Audio starts only after the required user gesture. A missing model/import/device leaves chat usable with an actionable status.

Corrupt/failed migration: preserve database and snapshot, open recovery UI, do not seed an empty database on top. Broker crash: renderer stops after heartbeat loss, main restarts once, coordinator emits a fresh snapshot without replaying PCM or resending calls. On orderly exit, cancel work, stop capture/audio, persist receipts, close store; local cleanup has a two-second deadline.

## FLW-002 — Typed input to visible reply and speech

Preconditions: active character/conversation, ready broker, a built-in or external backend, enabled voice binding if speech is desired. UI sends input.submit through INT-001. Coordinator first checks the receipt ledger; a retained identical command returns its prior result before live epoch validation. Otherwise validate scope, reserve a turn, cancel an active same-character turn if needed, and commit input/turn/config snapshot/ack in one transaction.

For built-in mode, ContextBuilder retrieves the allowed history/memories (INT-007), freezes prompt/profile, and SessionBackend calls InferenceGateway (INT-002/008) with the resolved binding. The mock follows exactly this path. Text deltas are persisted before publication; UI appends by revision. SpeechService segments speakable text (INT-004), starts one utterance, and sends credit-limited PCM/cues to playback. Director sets thinking until actual speech begins; avatar reports applied state through INT-005.

When model generation finishes, commit message.final; finish all valid queued speech segments, declare speech.end, wait for playback completed, then turn.finished. If speech is disabled, text terminal is enough. If speech fails, preserve complete text and finish with a warning.

Failure branches: invalid input/route returns a rejected command; context too large fails the accepted turn without a provider call; storage failure before ack produces no accepted turn; storage failure during output aborts generation and never displays uncommitted text. Duplicate commands cannot start a second provider request. Crash after commit but before ack returns the original receipt on resend; crash during streaming follows FLW-001.

## FLW-003 — Stop, barge-in, and cancellation races

Trigger: Stop, new local input, PTT start, or character switch. Coordinator bumps the presentation epoch and marks the current turn cancelling/cancelled; aborts the backend → inference/speech tree; publishes presentation.reset. Audio runtime flushes ring/queued source frames and starts a 10 ms fade. Avatar releases mouth and transient motion and transitions body toward current baseline. Capture can begin only under the new epoch.

Late provider deltas, TTS callbacks, external audio, and old gestures are discarded by matching turn/utterance/epoch. A late old playback report may finalize that old turn's played position, never the new character's state. Text already committed remains visible as partial or complete as appropriate. No automatic continuation/regeneration occurs.

Proof: repeatedly race stop against final chunk, usage frame, renderer acknowledgement, and new turn start. Exactly one turn terminal; no cancelled sample after the allowed local stop boundary; no second completion/usage charge. Physical device buffer latency is measured separately.

## FLW-004 — Character/voice/model changes

A profile edit is revision-checked through owner management. Changes affect later turns. A model route edit cannot splice a provider into an existing stream. Voice settings are snapshotted with the turn just like model configuration.

A character switch checks identity and scene capability, cancels old output, bumps epoch, enters switching, prepares the new avatar, and activates it only after ready. The broker commits the new selected character/conversation and sends a full snapshot. Existing target history is retrieved by target character. If load fails, retain the old selection, restore its avatar in the new epoch, show error, and do not resume its old speech. A second switch while one is active returns busy; the owner can select again after completion.

## FLW-005 — Provider unavailable or stream interrupted

Before any call, gateway validates enabled connection, credential availability, model capability, input budget, and concurrency. Unsupported configuration fails locally. HTTP errors map to sanitized categories; a mid-stream error retains committed partial text. EOF without valid completion is a failed stream. If some audio has played, stop remaining speech and retain the receipt.

Do not retry generation automatically and do not route to another provider. Explicit Retry creates a new turn/attempt with a link to the failed turn; it uses current configuration and shows the partial prior result rather than concatenating onto it. Unknown final usage remains unknown. Metadata reads may use their bounded retry policy.

## FLW-006 — Review, edit, and use memory

Owner adds or edits a record via INT-007 with expectedRevision. MemoryService writes provenance/visibility/revision and updates derived index in one transaction. A conflict asks UI to reload the latest record. New model-generated diary/memory is proposed and cannot enter retrieval until accepted. Pinned authored records remain distinct from generated interpretations.

At turn creation, retrieve only active records for that character and allowed channel. Store selected IDs in the context receipt. Delete a source message: invalidate dependent derived entries, remove index/event copies, and prevent them from future prompts. Deletion also cancels active turns containing that source. Its immutable context receipt records prior use; cancellation cannot recall context already sent to an external service.

## FLW-007 — External orchestration backend

Coordinator freezes the external backend configuration and declared capabilities. With external context ownership, send current input and mapped conversation/character IDs; omit local context. With companion ownership, provide the exact bounded context. Adapter starts the remote request and normalizes text/audio/suggestions into BackendEvent. Coordinator applies the same persistence, cancellation, and presentation rules as built-in mode.

External audio disables local TTS for that turn. Text-only output can use configured local speech. Correlation must bind every remote event to this request; missing/ambiguous IDs fail the integration rather than guessing the active character. On disconnect, retain partial output and stop audio; never reconnect by submitting the same user prompt again. A future resumable server cursor needs a separately verified contract.

The shipped mock fixture server proves this seam without the user's API. QST-001 gates the actual mapping, not the external contract or M0.

## FLW-008 — Remote messaging and phone/typing

An enabled channel adapter receives a message, validates allowed peer/binding, and writes its external ID to the inbox before creating a turn. Duplicate external IDs return the existing local result. Incoming work for the foreground character waits while a local turn speaks; queued work is bounded at 20 messages/binding and expires after five minutes. Overflow/expiry is visible and not silently processed later.

Gateway emits normalized activity; director may request phone/typing with defined TTLs. connected merely updates the badge. Local voice preempts channel visuals. Remote channels default to text-only output: do not read private remote replies aloud unexpectedly.

Nonforeground characters may process text-only turns within the same per-character/global concurrency limits. Such work has no presentation slot and cannot bump the global presentation epoch or publish audio/visual commands. Text/history remains scoped to its own character/conversation; the UI may show an unread badge. Cancelling a background turn does not reset foreground playback. A later character switch never replays completed speech or expired activity.

When generation completes, put the complete reply in the outbox transaction. The adapter sends once. A confirmed remote receipt marks delivered. Timeout after submission is uncertain; display it and do not auto-resend. Cancellation before send deletes/marks the pending outbox entry cancelled; after delivery it cannot unsend the remote message by pretending a local cancellation revoked it. Telegram is a later configured integration; mocks exercise this flow first.

## FLW-009 — Renderer desynchronization

Event-sequence gap, invalid revision, new renderer identity, or missed visual report triggers snapshot recovery. Coordinator cancels any live audio and increments epoch before sending current state. Renderer discards old queues and adopts the complete snapshot. Restored persistent settings/profile are distinct from transient gestures and audio. A duplicate full visual revision does not extend TTL or replay a gesture.

If a report is unsupported/suppressed, retain that truthful result. Resending the same state will not make an unsupported asset appear. If the renderer remains unresponsive, mark degraded and keep the text UI functional.

## FLW-010 — Avatar import

Host file chooser grants access to a chosen .vrm or package directory. Importer checks hard limits/local paths, parses in isolation, validates schema/rig/resources, computes content hash, and produces a capability report. Copy files to a staging directory owned by the app, then atomically commit asset metadata/files. Identical content can share immutable files with separate mapping/profile records.

Preview in a disposable scene; owner can map expressions and choose activation. Failed parse/GPU upload disposes only the candidate. Crash during import leaves uncommitted staging data, which startup cleans after checking no committed asset references it. Import never overwrites the source file or old avatar.

## FLW-011 — Backup, deletion, and restore

At idle or owner request, store uses a consistent SQLite backup plus referenced asset hashes. Validate snapshot integrity before marking success. Deletion first cancels affected active work, then transactionally removes content/projections; existing backups are handled by explicit retention/removal policy.

Restore stops broker/write activity, validates version/integrity/assets, creates a recoverable copy of the previous dataset, selects the restored dataset atomically, and restarts into a new session/epoch. Failed validation leaves current data selected. Migrated data is not opened by an older binary; rollback selects the pre-migration backup.

## FLW-012 — Push-to-talk input

Owner holds the visible PTT control or configured in-app shortcut. Check mic permission and STT configuration, cancel current speech, start a capture ID, and visibly show recording. Normalize bounded mic frames to 24 kHz mono. Release commits totalSamples and moves to transcribing; Escape cancels and erases the temporary buffer. Stop at 60 s even if a keyup event is lost. No always-on capture.

SpeechService sends a bounded WAV to the selected STT adapter. Nonempty final text is submitted through the ordinary input path with source=transcribed_voice and the capture's idempotency key. Empty text creates no turn. Permission, device, network, or transcription failure leaves history unchanged and displays a clear error. Typed input remains available.
