# Requirements and uncertainty

ART-003. The registry owns IDs, status, ownership, and verification links. This document gives the acceptance interpretation. M0 is the offline demonstrator, M1 the useful Windows release, and M2/M3 optional later stages.

## Requirements

| ID | Required outcome | Acceptance boundary |
| --- | --- | --- |
| REQ-001 | Develop and demonstrate with mocks | M0 runs offline, needs no credentials, and exercises streaming, failure, cancellation, audio, and restart. |
| REQ-002 | Persistent readable history | Inputs and output checkpoints survive restart; search, pagination, interrupted status, and separate character histories work. |
| REQ-003 | Editable interchangeable characters | Name/profile, avatar, voice, and routing are independent; switching prevents old speech or state from reaching the new character. |
| REQ-004 | User avatar import | Import a local VRM 1.0, preview capabilities, save mappings, and reject malformed/oversized resources without destroying the current avatar. |
| REQ-005 | Multiple inference providers | Mock, OpenAI Chat Completions, OpenRouter, and LM Studio implement the same streaming port and conformance suite. Live checks require configured credentials. |
| REQ-006 | Provider isolation | No provider SDK/native frame or secret appears in avatar, memory, director, or companion-event types. Dependency checks enforce it. |
| REQ-007 | Model routing | Complete per-character/channel/task bindings resolve by documented precedence, remain frozen per turn, and display their origin in settings. |
| REQ-008 | Streaming and provider failures | Partial text stays visible/durable; duplicate terminal/usage frames do not complete or charge twice; errors, timeouts, and cancellation terminate once. |
| REQ-009 | Independent speech pipeline | Mock audio and a configured real speech adapter use the same start/chunk/end/cancel contract. Text remains available when speech fails. PTT is available in M1. |
| REQ-010 | Immediate interruption | Stop input, new local input, or a switch cancels generation, unsent TTS segments, queued audio, and stale motion. No cancelled samples restart later. |
| REQ-011 | Explicit animation arbitration | Speech, idle, emotion, gaze, activity, and props obey deterministic masks/priorities and expiry rules. |
| REQ-012 | Truthful visual feedback | Distinguish accepted intent from applied/suppressed/unsupported state; reconnect uses a full snapshot and does not replay effects/audio. |
| REQ-013 | Inspectable memory and diary | Owner can add/edit/delete/pin memory and review sourced suggestions/diaries; retrieval respects character/channel visibility. |
| REQ-014 | Existing-stack integration | External session backend can supply text/audio/intent through its own adapter, without duplicate inference or a required change to the user's API. |
| REQ-015 | Explicit channel activity | Mock channel events prove phone/typing transitions; real Telegram is later and cannot mutate the rig directly. |
| REQ-016 | Local ownership and credentials | No account/cloud service needed for mocks; keys are outside renderer/database exports; unconfigured providers receive no traffic. |
| REQ-017 | Portable core contracts | Core protocol, identity, memory, and renderer interfaces contain no Electron/Windows/Unity types. Android host feasibility is a later gate. |
| REQ-018 | Recovery and migration | Test migration backup/restore, startup interruption recovery, failed migration preservation, and single-writer behavior. |
| REQ-019 | Accessible text-first controls | Keyboard access, readable transcript, Stop/PTT buttons, visible mic state, mute, reduced motion, and labelled errors work without audio. |
| REQ-020 | Measurable interactive budgets | Meet defined local latency/frame/buffer targets on a recorded reference machine; separate provider latency and physical-device delay. |
| REQ-021 | Diagnostics and cost control | Trace a turn across stages, show usage as reported/estimated/unknown, cap concurrency and tokens, and never hide a provider fallback. |
| REQ-022 | Bounded concurrency and replay | One audible utterance; per-character turn serialization; idempotent accepted commands; bounded queues; crash/reconnect cannot duplicate replies. |
| REQ-023 | Usable configuration workflow | First launch offers a mock demo; character editor, provider connection test, effective-route display, and clear missing-voice state use plain labels. |
| REQ-024 | Data portability | Export/import versioned characters, memory, and transcripts with license metadata and no secrets; search indexes rebuild after restore/deletion. |

The initial app need not match Animates' motion quality. REQ-020 cannot be satisfied by a headless frame counter alone: a visible avatar and loopback audio test are required. REQ-005 live authentication is separate from offline adapter correctness.

## Invariants

| ID | Always true | Enforcement |
| --- | --- | --- |
| INV-001 | Companion semantics do not depend on provider-native APIs | Contract types and prohibited-import checks. |
| INV-002 | Character-private data never enters another character's prompt by implicit lookup | Mandatory character ID and visibility filter in memory/history queries. |
| INV-003 | Only the current presentation epoch may play audio or apply transient motion | Epoch checks before queue insertion and every mixer/audio tick. |
| INV-004 | The broker is the sole durable domain writer | Repository transactions and a single application/broker lease. |
| INV-005 | A proposed/accepted visual request is not recorded as a successful presented action | Applied-state reports with revision and outcome. |
| INV-006 | A model binding is an atomic tuple and is immutable for an accepted turn | Route resolution transaction plus stored snapshot. |
| INV-007 | Retry/reconnect never silently repeats a generation or external send | Command ledger, explicit new attempt, and outbox semantics. |
| INV-008 | Credentials never enter renderer state, content logs, companion events, or exports | Main-process secret port and redacted error mapping. |
| INV-009 | Mouth timing follows consumed audio content time, including underrun/cancel | Playback clock and viseme scheduler; network timestamps are insufficient. |
| INV-010 | Imported content is data and cannot execute scripts or fetch arbitrary resources | Package validation, URL/resource resolver, CSP, and sandbox. |
| INV-011 | No background inference or channel output occurs without an enabled configuration and bounded trigger | Backend/channel enablement and scheduling policy. |
| INV-012 | Every event is scoped and ordered; epochs, event sequences, and resource revisions are different counters | Broker sequencer and ingress validation. |

## Assumptions and questions

| ID | Assumption / question | Consequence and resolution |
| --- | --- | --- |
| ASM-001 | Electron/WebGL2/AudioWorklet can meet the target on the user's Windows machine | Architecture-shaping, unvalidated. WRK-004/005 benchmark; preserve renderer/audio ports if a different host is needed. |
| ASM-002 | Standard VRM expressions and baseline poses are an acceptable first visual result | Architecture-shaping, unvalidated. M0 visual review with demo and imported avatar; optional enhanced lip-sync/motion remains replaceable. |
| ASM-003 | One local owner, one visible/audible character, and a windowed UI are useful first limits | Proposed product default. Multi-user, simultaneous avatars, and video broadcasting require later scope changes. |
| ASM-004 | The local stack exposes a bounded request/response or event stream that can be adapted | Unvalidated but not architecture-shaping; mock session backend isolates the connector. |
| QST-001 | What exact API does the existing stack expose? | Nonblocking for draft/M0/M1 providers; needed for the real mapping in WRK-024. Request docs or redacted samples, auth mechanism, cancellation, audio format, and context ownership. |
| QST-002 | Which machine and avatar define visual acceptance? | Nonblocking for drafting; required before claiming REQ-020 or accepting ASM-001/002. Record hardware automatically during the future benchmark. |
| QST-003 | Which production TTS/STT connection and voice should be enabled? | Nonblocking for mocks or text. Needed for live WRK-014 tests; list model/voice IDs and local/remote data expectations. |
| QST-004 | Is the first Android target an autonomous app or a view of a desktop-hosted session? | Deferred to M3; do not infer shared state or network exposure. |
| QST-005 | Which custom avatar/animation assets may ship in a demonstrator? | Original procedural demo is the default. Imported user assets retain their own permissions; distribution requires checked metadata/license. |

None of these requests asks the owner to pick a database or synchronization algorithm. Architectural decisions remain proposed until review; choosing a concrete draft default does not resolve the associated quality assumption.

## Risks

| ID | Risk and trigger | Mitigation |
| --- | --- | --- |
| RSK-001 | “OpenAI-compatible” differs in parameters, chunks, or capabilities | Per-provider adapters, pinned test fixtures, capability profiles; fail unsupported requests before submission. |
| RSK-002 | Audio underruns/drift or late packets after interrupt | Audio-owned content clock, bounded buffering/credit, epoch invalidation, timed replay tests. |
| RSK-003 | Generic avatars look less natural than proprietary rigs | Capability preview, normalization, retargetable clips, explicit subjective gate; do not promise visual parity. |
| RSK-004 | Memory leakage or data loss | Character/channel scoping, provenance, single writer, tested migrations/backups, deletion invalidation. |
| RSK-005 | Duplicate generation/send or unbounded spend | No automatic generation fallback/retry, outbox and attempt IDs, budgets, bounded worker count. |
| RSK-006 | Electron/native SQLite packaging or graphics overhead | Packaged smoke test early; keep storage/host ports isolated; record actual resource budgets. |
| RSK-007 | External backend hides memory/cancellation semantics | Mapping checklist and negotiated capabilities; disable double context/TTS; drop late output locally. |
| RSK-008 | Malformed/huge imported model or external URL | Size/complexity limits, isolated parsing, offline resource resolver, atomic import and fallback avatar. |

See blueprint.json for ownership and VER links. Deferred items do not count as passed acceptance.
