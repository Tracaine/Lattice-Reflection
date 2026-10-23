# Interfaces, ordering, and failure semantics

ART-007. The declarations in contracts/*.ts are normative draft types. They are specification artifacts, not a compiled app. Semantic constraints below supplement their types. Runtime schemas must reject invalid data at each ingress; TypeScript types alone are insufficient.

## Interface index

| ID | Endpoints | Contract and invocation | Failure / compatibility |
| --- | --- | --- | --- |
| INT-001 | UI/renderer ↔ coordinator | companion.ts, common.ts; trusted MessagePort control + binary lane | Version handshake, snapshot recovery, command receipts, epoch fencing. |
| INT-002 | Built-in backend, director, memory ↔ inference gateway/adapters | inference.ts; AsyncIterable with AbortSignal | One terminal; capability validation; normalized error; no automatic generation retry. |
| INT-003 | Owner UI ↔ route/config services | management.ts + inference.ts; host-authorized RPC | Revision conflict; whole binding update; settings separate from companion stream. |
| INT-004 | Coordinator/backends ↔ speech service ↔ playback | avatar-speech.ts + backend.ts CaptureFrame | Canonical PCM, sample offsets/credit, cancellation, timing quality, text fallback. |
| INT-005 | Director/coordinator ↔ avatar runtime | avatar-speech.ts + visual.desired/report | Desired revision and actual outcomes; no fake success; resync is a full state. |
| INT-006 | Broker services ↔ local store | Repository transactions and DAT rules in 03 | Single writer, migrations, bounded queries; errors preserve data. |
| INT-007 | Context/UI ↔ memory service | management.ts and 03 retrieval rules | Character/channel filter, provenance, expected revision, reviewed proposals. |
| INT-008 | Coordinator ↔ session backend | backend.ts; AsyncIterable per turn | Capabilities declare context/audio owner; external mapping absorbs wire differences. |
| INT-009 | Channel gateway ↔ coordinator / remote channel | backend.ts; receive/send ports | Binding allowlist, inbox dedupe, uncertain-send state; no effect calls. |
| INT-010 | Components ↔ platform host | Fixed management/platform ports | Credential/file/window permissions; no generic invoke/readPath/execute escape hatch. |
| INT-011 | Importer ↔ asset store ↔ avatar | AvatarManifest, import report, getAvatarManifest | Content hash, relative resource names, capability downgrade, atomic activation. |

Management RPC is not model-accessible. Its responses are typed Result values. List operations cap pages at 100 except the bounded character/settings catalogs (maximum 100 characters, 64 connections, 256 profiles and 1,024 route bindings). Memory listing uses a stable ascending ID cursor and a maximum page of 100 records. Empty pages end pagination; invalid/cross-character cursors are rejected.

## Companion control protocol

Main authorizes the message port and assigns its client identity. Hello negotiates major version 1; Welcome supplies the broker session ID. Major mismatch returns unsupported_version and closes the port. Unknown event kinds may be ignored only if explicitly marked optional in a later minor contract; v1 has no such extension. Unknown payload fields are ignored for forward-compatible read DTOs but rejected for commands/config writes. A breaking type or semantic change increments the major version.

The broker assigns eventSeq starting at 1 per connected client; every emitted control event, including heartbeat, increments it. eventId is unique. A receiver ignores an exact duplicate sequence/event ID, detects a gap or conflicting duplicate, pauses transient presentation, and asks for a snapshot. Reliable IPC should not reorder; these rules also define the future bridge. Binary chunks use their own chunkIndex/sampleOffset, not eventSeq. The session UUID changes after broker restart. Epoch increases on interrupt, switch, renderer replacement, or shutdown; resource revisions and reportSeq are separate monotonic counters.

A snapshot contains at most 50 recent full messages and 48,000 aggregate UTF-16 code units. Older/longer history is obtained through bounded queries. A control envelope is at most 256 KiB, user text at most 16,000 UTF-16 units, and assistant output at most 32,768 units. The snapshot builder also measures encoded bytes and removes oldest tail entries until both limits fit; character counts alone do not bound JSON escapes. Validate Unicode, finite numbers, counter ranges, UUIDs, and string lengths. Cut only at Unicode scalar boundaries; offsets are explicitly JavaScript UTF-16 code units.

## Commands and acknowledgements

| Command | Preconditions / result | Duplicate and timeout behavior |
| --- | --- | --- |
| input.submit | Active character/conversation/epoch; nonempty text. Atomically accept input/turn and return IDs. | Persist receipt/digest; same ID + same payload returns original result. No second inference. UI waits 2 s, requests status/snapshot, and can resend the same ID. |
| turn.interrupt | Active epoch, or no active turn (noop). Bump epoch and cancel tree. | Idempotent; receipt says scheduled, actual playback stop is separately reported. |
| character.select | No conflicting switch; valid target profile and conversation ownership. | Prepare/activate with epoch boundary; same request cannot create a second conversation. |
| input.capture | Enabled STT/voice input; start owns capture ID, finish declares totalSamples, cancel stops it. | One capture; 60 s hard limit. Empty/failed transcription produces no user turn. |
| visual.set_manual | Known activity, duration 0–300,000 ms; zero means clear | Manual priority, bounded TTL; unsupported avatar is reported separately. |
| audio.configure | Owner input, finite volume 0–1 | Mute does not cancel; clock/animation continue. Stop is a different command. |
| sync.request | Authorized connection | Ephemeral, not a persistent user action; returns full snapshot. Never replays audio. |

Reject wrong character/conversation/epoch before side effects. Persist receipts only for state-changing accepted/rejected owner commands, not heartbeat, sync, or telemetry. Commands older than a deleted conversation cannot resurrect it. A rejected command carries a sanitized PublicError; provider HTTP bodies stay out of this protocol.

For an active interrupt, publish presentation.reset first under the new epoch, then command.result with effect=scheduled. The receipt acknowledges the cancellation decision, not an already-drained device buffer. A no-active-work interrupt returns effect=noop without incrementing the epoch. Background text turns are cancelled by the coordinator without resetting another character's presentation.

The UI uses optimistic drafts only for text entry; it marks an input sent after the committed acknowledgement. A scheduled acknowledgement is not evidence that an avatar loaded, a sound played, or a message was remotely delivered.

## Transcript and terminal ordering

turn.started identifies the persisted input and assistant message. message.delta carries fromRevision, toRevision, offsetUtf16, and textDelta. Apply only when fromRevision and current text length match; duplicates at an already-applied revision are ignored, a mismatch triggers a full snapshot. message.final supplies authoritative full text and terminal status and can repair the current view.

Text completion does not mean audio completion. speech.end means no more samples will be produced; PlaybackReport completed means its content has drained. turn.finished occurs after generation and required speech reach terminal states. Late text/audio after a cancelled turn is dropped at the coordinator, before UI/renderer publication. Old-epoch playback receipts may finalize accounting for the matching old utterance, but must never alter current visual state.

If current assistant output reaches its application cap, cancel upstream and finish the visible message as limited. Show that outcome rather than silently pretending a natural ending.

## Speech binary lane and flow control

Canonical output is signed 16-bit little-endian PCM, mono, 24,000 samples/s. AudioFrame has complete local scope, epoch, utterance, chunk index, sample offset/count, and an ArrayBuffer of exactly 2 × sampleCount bytes. Use nominal 480-sample/20 ms chunks, allow 1–4,096 samples, and split larger upstream buffers. Buffers are transferred, not JSON/base64 encoded inside desktop IPC. Any external wire uses its adapter's framing and converts to this contract.

A speech.start must precede its frames. The receiver may stage at most one second of pre-start frames to tolerate control/binary lane scheduling; otherwise it rejects the unknown utterance. chunkIndex begins at 0 and sampleOffset at 0 and both are contiguous. Exact duplicates within the 64-chunk fingerprint window are ignored; conflicting duplicates or a gap fail that utterance with audio_gap. Already-consumed older chunks are dropped, never replayed.

Renderer capacity is 48,000 source samples (2 s). Initial playback waits for 4,800 samples (200 ms), or a completed shorter utterance. Playback reports every 50 ms plus on transitions advertise remaining sample credit. The broker sends no more than current credit and keeps at most another 48,000 samples pending. Full queues backpressure TTS reads; if an external producer cannot pause and exceeds the cap, cancel its speech and preserve text. No unbounded audio file is accumulated.

On underrun, output silence, freeze the content cursor, release the mouth toward neutral, and report underrun. Resume after 2,400 samples (100 ms) or a final short tail. After two seconds without data, fail speech, close its epoch, and keep the text result. Finish only when declared totalSamples matches received samples and the playback tail drains.

speech.timing uses source-sample offsets. Discard elapsed cues; late cues may affect only unplayed samples. Missing/invalid cues use the documented amplitude fallback. Raw microphone capture uses CaptureFrame with the same PCM format, a separate capture ID/sequence and 60 s maximum; it cannot be mistaken for response audio.

## Visual synchronization

DesiredVisual is a full replacement state, with a monotonically increasing revision inside the epoch. TTLs are durations measured locally on receipt; duplicate revision delivery does not extend a TTL. The broker also expires its desired state so a reconnect cannot resurrect a stale request. Renderer applies the latest revision, reports the actual activity and per-feature outcomes, and never runs an older revision.

A lost acknowledgement prompts the broker to resend the same desired revision after 250 ms, at most three sends. No applied report after one second yields a degraded renderer indicator and snapshot request. Unsupported/suppressed is a valid outcome, not a retry condition. Transient gestures keep their IDs until expiry, so a duplicated snapshot does not replay a wave.

A new renderer always begins in a new epoch. Any current speech is cancelled. Idle/valid desired activity can be restored, but microphone capture and audio need fresh user actions.

## Inference/session composition

INT-002 has no turn or rig protocol. The built-in SessionBackend is created with the coordinator's frozen resolved binding and bounded context; it maps normalized inference events to BackendEvent. Exactly one response.started and one response terminal are permitted. The backend factory captures the immutable binding; a mutable global settings lookup during streaming is forbidden.

For an external backend, contextOwner=external causes context=null: send current input and mapped IDs only. If contextOwner=companion is negotiated, send the exact bounded context, not a second undocumented memory expansion. Audio capability is chosen once for the turn: external audio bypasses local TTS; text-only external output may use configured local TTS. An audio failure never switches to a second voice mid-utterance automatically.

External backend connections and speech connections are separate configuration records from model-provider connections. A conversation's backend can be changed only while it has no running turn, with its expected revision; null selects built-in mode. Registered adapters are compiled trusted modules, not scripts downloaded from configuration. An unknown adapter kind/capability fails configuration rather than loading arbitrary code.

A backend's finished event follows all of its text and audio production; its internal audio finished marker precedes it. The coordinator still waits for actual playback drain. Backend visual suggestions pass through the director allowlist and cannot set skeleton data, provider settings, or remembered facts.

## Management and storage semantics

All creates/updates carry commandId, and all updates/deletes carry expectedRevision. Revision mismatch returns conflict with the current revision through a follow-up read; do not silently merge profile, memory, or model configuration. A command updates its entity and durable outbox record in one store transaction. Management reads have a 5 s deadline, writes 10 s. Import/export/backup/restore are asynchronous owner requests with a visible busy state and a 120 s deadline after file selection; the success result is returned only after atomic completion. Awaiting the request must not block renderer frames. On failure the old state remains selected. Device and credential operations are separately host-authorized.

The credential-entry form is a dedicated local-only modal with one store operation; it clears the newly entered value immediately. Stored values are never returned to the companion UI. Secrets can exist transiently in that form, the main process, and an authorized adapter request, but not in the stage/UI state, event bus, export, or content log.

Public errors identify the failed operation and next useful action without raw provider errors or credentials. Compatibility fixtures and scenario checks in VER-006–012/022 are required before adding a new host or backend.
