# Open Companion: first architecture draft

Revision 1 / design version 0.1 / 2026-10-22. Registry: [blueprint.json](blueprint.json). Status: **draft for review**. All implementation work is unstarted.

## The experience we are building

The user opens a desktop app, picks a companion, and sees a live 3D character next to a persistent conversation. They can type or hold a microphone button, read every reply, hear speech, interrupt it, and reopen earlier conversations. The character blinks, looks toward the user, listens, speaks, and performs configured gestures. The user can change its avatar independently of its name, personality, voice, memories, and language model.

The application can either run a conversation using a chosen inference provider or display a conversation managed by the user's existing API stack. Both routes feed the same companion runtime. Initial development is fully exerciseable with a mock backend, prerecorded/generated test audio, and an original demonstration avatar.

This is a real-time 3D character, rather than a commitment to photorealistic generated video. Visual style follows the imported model. Learned full-body speech animation, Android packaging, Telegram, and broadcast/video outputs have extension points and later work packages; they are not prerequisites for the first working desktop slice. These scope choices are proposed defaults, not claims that the user rejected those capabilities.

## Proposed baseline

| Concern | Draft choice | Reason and main tradeoff |
| --- | --- | --- |
| Desktop host | Electron, TypeScript, one application window | Consistent Chromium audio/rendering and a small host bridge; larger footprint than a native shell. |
| UI | React with a persistent chat panel, character/settings editor, and stage | Accessible text remains useful if audio or graphics fail. |
| 3D | Three.js WebGL2 + `@pixiv/three-vrm`; VRM 1.0 import | Standard humanoid/expression mappings and replaceable models; imported models still vary in quality. |
| Motion | Deterministic idle/listening/talking poses, blink/gaze, timed mouth animation; VRMA clips in a later package | Produces a complete first system without a proprietary motion model; naturalness needs visual review. |
| App authority | One TypeScript broker process, independent of UI and render frames | One owner for turns, routes, history, memory, and desired presentation. |
| Persistence | SQLite via `better-sqlite3`, immutable imported asset copies, OS-protected secrets | Local ownership and export; the native database module must pass a packaged Electron test. |
| Inference | A project-owned asynchronous provider interface | Mock, OpenAI Chat Completions, OpenRouter, and LM Studio have separate adapters and conformance tests. |
| Speech | Independent TTS/STT ports; canonical 24 kHz mono PCM; renderer-owned playback clock | A text inference provider is never assumed to provide speech. |
| Director | Rules by default; optional bounded model suggestions | Predictable effects with no extra inference cost; the renderer reports what actually happened. |
| Memory | Character-scoped, sourced, editable records; ordinary structured/full-text retrieval | Inspectable behavior; no vector database or unattended memory rewriting in the first release. |

These are DEC-001 through DEC-010 in [decisions/decisions.md](decisions/decisions.md). That document compares alternatives and records reversal costs. The selected baseline is specific enough to implement once the draft is accepted; optional alternatives are not instructions for the implementing agent to choose freely.

## Two protocols, two responsibilities

The **inference interface** takes messages and a resolved model binding, and yields normalized text, usage, and one terminal result. It knows nothing about rigs, phone props, diarization, character animation, or WebView messages. The gateway owns provider capabilities, authentication, parameter mapping, timeout handling, and accounting.

The **companion protocol** identifies characters, conversations, turns, utterances, and presentation epochs. It carries persisted transcript changes, audio frames, visual-state requests, playback reports, and acknowledgements. It contains no provider-native request objects or API keys. Memory and director services may request inference through the gateway, but neither imports a specific provider adapter.

An **external session backend** is a third, deliberate seam: it can supply conversation text and audio already produced by the user's orchestration stack. In that mode the app does not generate a duplicate reply or automatically send the same context to a second model. The backend adapter translates that stack's API into our session contract. See INT-008 and [12-provider-integration.md](12-provider-integration.md).

## One turn through the system

```mermaid
sequenceDiagram
  participant U as User/UI
  participant C as Coordinator
  participant M as Memory/context
  participant B as Session backend
  participant G as Inference gateway
  participant S as Speech service
  participant R as Playback/avatar
  U->>C: submit text (command ID)
  C->>C: persist input + turn; freeze route/config
  C-->>U: accepted; durable transcript
  C->>M: retrieve permitted context
  C->>B: start turn
  B->>G: generate normalized text (built-in mode)
  G-->>B: text deltas / usage / terminal
  B-->>C: backend text deltas
  C->>C: commit text checkpoints
  C-->>U: transcript updates
  C->>S: speak completed text segments
  S-->>R: start / PCM chunks / timing / end
  C->>R: desired visual state
  R-->>C: playback position + actual visual state
  U->>C: interrupt
  C->>B: cancel turn
  C->>S: cancel generation
  C->>R: stop old epoch and flush audio/motion
  C->>C: retain partial transcript; record interruption
```

The audio service supplies the time used by mouth animation. Network packet arrival is not a playback clock. Text completion and speech completion are separate events. A renderer reconnect receives a snapshot, never a replay of old speech.

## Model selection without confusion

Connections describe **where and how to connect**. Model bindings describe **what to run**. For each role (`dialogue`, `director`, `memory`) the complete binding is selected from:

1. character + channel override;
2. character default;
3. channel default;
4. application default.

The first complete binding wins. Provider and model are never combined from different scopes. Settings expose the effective selection and its source. Each turn stores a frozen configuration revision; changing settings affects later turns. There is no automatic paid-provider fallback. `director=rules` and `memory=disabled` are explicit default bindings, not accidental uses of the dialogue model.

For the mock profile, all three named real providers can remain unconfigured. Real API keys are entered into the eventual app's protected settings, not committed to a sample configuration or handed to an agent in chat. The integration checklist names the exact nonsecret documentation needed for each backend.

## What the first draft resolves

| Previously ambiguous issue | Defined here |
| --- | --- |
| Who decides an animation? | Coordinator/director chooses desired intent; avatar mixer validates capabilities and owns the applied pose. |
| What if two effects conflict? | Fixed ownership masks and priority rules; unsupported effects return a result instead of pretending to succeed. |
| Does switching models reset the companion? | No. Character identity, stored history, memory, avatar, and voice are separate records. |
| Does Telegram “connected” mean phone animation? | No. Explicit message/processing activity can request phone/typing; presence alone does not. This is our chosen policy. |
| What survives a crash? | Accepted input, committed output, profiles, memory, and settings. In-progress generation becomes interrupted; speech does not replay. |
| Can it work before choosing a model or TTS service? | Yes, through deterministic mocks. Mock speech demonstrates synchronization, not arbitrary-text synthesis. |
| What if the avatar cannot make an expression? | Report reduced capabilities, use a documented fallback, and keep chat/audio usable. |

## Reading and handoff order

Read 00–04 for outcome, state, and ownership; 05 plus `contracts/*.ts` for exact interfaces; 06–08 for failures and verification; 09 plus `work-items/` for execution. Read 12 for provider/backend integration and 13 for rendering/director behavior. [14-evidence.md](14-evidence.md) separates observed Animates behavior, current external documentation, and new design choices.

Start implementation only when requested. The first proposed package is WRK-001. It pins compatible dependency versions and creates the contract/mocks test harness; it does not connect to a paid service. All test commands in the delivery documents are **future repository scripts to create**, unless explicitly listed as already run in the resume state.

## Remaining validation gates

The structure can be drafted now, while three results remain unproven: performance and visual quality with an actual VRM on the target machine; the user's external orchestration API mapping; and the chosen production speech provider's voices, timing, and cancellation behavior. Mocks isolate these gaps. None requires the user to choose a database, rendering engine, or stream parser.

The first useful acceptance demonstration is: launch offline; see a character; type; watch a streamed scripted reply; hear synchronized fixture speech; interrupt; switch to a second character; restart; recover both histories without cross-character leakage. A build that cannot do that has not completed the first milestone.


# Document Spec:
"COMPANION_BLUEPRINT.md" is the First Stone, the entry document: Begin here.
"12-provider-integration.md" identifies the documentation and configuration we’ll need later. Nothing is needed for initial mock development.

For a future handoff, provide the entry document first and the entire /architecture/ folder.
