# Components and deployment

ART-006. Proposed technologies: DEC-001–003/009. The first application is a modular desktop process group, not a collection of network services.

## Components

| ID | Component / planned module | Owns | Must not do |
| --- | --- | --- | --- |
| CMP-001 | DesktopHost — apps/desktop/src/main, packages/platform | Window lifecycle, secret store, file chooser, broker launch, platform permissions | Render untrusted remote pages or expose unrestricted IPC/filesystem APIs. |
| CMP-002 | CompanionUI — packages/ui | View state, forms, accessible transcript/settings/stage controls | Connect to model providers, execute SQL, or treat optimistic input as durable. |
| CMP-003 | SessionCoordinator — packages/core/session | Turn/conversation state, epochs, event sequencing, command receipts, cancellation tree | Parse provider-native SSE or compute rig poses. |
| CMP-004 | InferenceGateway — packages/inference | Route resolution, capability validation, provider adapters, normalized streams/accounting | Emit avatar commands or decide memory truth. |
| CMP-005 | MemoryService / ContextBuilder — packages/core/memory | Approved memory, retrieval, derived diary proposals, context provenance | Import a provider adapter, read other characters by implicit fallback, or save model suggestions as facts. |
| CMP-006 | SpeechService — packages/speech | Text segmentation, TTS/STT adapters, audio normalization and timing cues | Own actual audible playback or assume an LLM provider has a TTS endpoint. |
| CMP-007 | CharacterDirector — packages/core/director | Desired visual state and bounded suggestions | Write skeleton transforms or claim an effect succeeded without feedback. |
| CMP-008 | AvatarRuntime — packages/avatar | VRM scene, rig mappings, mixer, camera, props, actual visual state | Access credentials, database, provider config, or a channel SDK. |
| CMP-009 | PlaybackService — packages/audio | PCM queue, resampling, output clock, mute/stop/device state, input capture bridge | Resume a cancelled epoch or infer timing from packet arrival. |
| CMP-010 | LocalStore — packages/storage | Repository transactions, migrations, backups, full-text indexes | Encode provider or animation policy. |
| CMP-011 | SessionBackends — packages/session-backends | Built-in composition and external-stack adapters | Duplicate an externally owned response/TTS/context pipeline. |
| CMP-012 | ChannelGateway — packages/channels | Channel identity mapping, inbox/outbox, validated activity events | Toggle phone/typing directly on the rig. |
| CMP-013 | AssetImporter — packages/avatar-import | Bounded package validation, immutable file copy, capability report | Fetch arbitrary asset URLs or execute imported scripts. |

## Runtime topology

Electron main hosts CMP-001 and mediates a narrow preload API. An Electron utility process runs CMP-003–007 and CMP-010–013 (the broker). The renderer hosts CMP-002/008 and the UI side of CMP-009; an AudioWorklet handles its real-time playback loop. Parsing/model import may use a renderer Web Worker, with hard input limits and a disposable scene. The broker and renderer exchange transferable binary buffers through a main-authorized MessagePort, with validated JSON control envelopes.

Database work is synchronous and bounded in the broker via better-sqlite3. It never blocks the render thread. CPU-heavy optional inference or speech conversion must run outside the broker's event loop; local LLMs remain separately managed services such as LM Studio.

The normal app binds no HTTP listener. Local inference is an outbound request to an explicitly configured endpoint. Mocks run in-process; protocol fixture servers used by tests bind loopback only. A later OBS/browser output is a separate transport/security work item.

## Dependency direction

~~~text
contracts + platform ports
    ↑ core domain/services, inference adapters, speech adapters, storage, backends
    ↑ desktop composition root (wires implementations)
contracts + browser platform ports
    ↑ avatar + audio + UI
~~~

Core services depend on interfaces injected at startup, not concrete provider classes. Provider-specific code lives only under packages/inference/adapters/<kind>. The companion protocol has no dependency on inference contract types. SessionBackends may use both, because translating between conversation behavior and inference is its responsibility.

Enforce import boundaries with lint/dependency tests: avatar/audio/UI cannot import inference/storage/main; memory/director cannot import inference/adapters; packages/contracts imports no runtime library, Electron, Node, React, Unity, or provider SDK. Browser packages expose no node: imports. Do not introduce cyclic package dependencies to share a convenient enum.

## Repository shape to create during implementation

~~~text
apps/desktop/src/{main,preload,broker}/
packages/{contracts,platform,ui,core,inference,session-backends}/
packages/{speech,audio,avatar,avatar-import,storage,channels}/
tests/{unit,contract,integration,e2e,fixtures}/
tools/                         build, fixture and dependency-boundary scripts
architecture/                  this versioned design package
evidence/WRK-NNN/               recorded test/benchmark results, no secrets
~~~

Choose pnpm workspaces, TypeScript strict mode, Vitest for unit/contract/integration tests, and Playwright's Electron support for packaged/UI checks. Use React and Vite for the renderer, Three.js WebGL2 with matching three-vrm/three-vrm-animation releases, Electron Forge for packaging, and better-sqlite3 in the broker. These are specified choices; WRK-001 resolves exact compatible release versions from primary docs/package manifests, pins them in lockfiles, and records the matrix. It must not silently select a new rendering/desktop framework. No dependency is installed as part of this drafting task.

## Startup and shutdown

1. Main acquires a single-instance lock, creates user-data paths, registers a local secure app scheme, and initializes the secret port.
2. Main starts the broker; broker checks database integrity/migrations, recovers unfinished work, loads settings, and registers mock adapters first.
3. Main opens a sandboxed/context-isolated renderer with Node integration disabled. A one-time renderer identity/port handshake begins INT-001.
4. Broker sends the full snapshot. Renderer loads the selected avatar and returns capabilities. Audio remains suspended until the first user interaction when browser policy requires it.
5. Only after readiness may the coordinator enable configured provider/channel adapters. No unsolicited inference is part of startup.
6. Shutdown cancels turns/capture, sends an audio stop, closes channels, flushes final receipts, closes SQLite, and ends the broker. Wait at most two seconds for local cleanup; remote cancellation cannot indefinitely prevent exit.

Renderer crash: broker cancels the active epoch and pauses new audio; host can reopen the renderer. Broker crash: renderer fades/stops after two seconds without a heartbeat; main attempts one automatic restart, then shows a recovery view. Neither crash starts a new provider attempt.

## Portability

The Android extension reuses contracts and renderer/mixer logic if WebGL/audio measurements pass. Its host must supply native lifecycle, permission, storage/secret, audio-focus, and background-service behavior; Electron is not an Android runtime. A foreground-only WebView experiment comes before background microphone promises. Cross-device state synchronization is not implemented by sharing a SQLite file or reusing a desktop session ID; it is deferred until QST-004 is resolved.
