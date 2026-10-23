# Charter and glossary

ART-002. Design intent for revision 1; proposed engineering defaults remain reviewable. User requirements come from this conversation, not from the reference application's feature list.

## Outcome and actors

Build a locally owned companion interface with an animated character that the user can replace and configure. Preserve useful text history, character continuity, and editable memory while allowing model, voice, avatar, and channel choices to vary independently. An existing local orchestration stack must be usable without coupling the renderer to its API.

| Actor | Authority | Boundaries |
| --- | --- | --- |
| Local owner | Creates/edits characters, routes, avatars, voices, memories; selects channels; exports/deletes data | One OS user and one active application instance in the first release; no app account required. |
| Configured model provider | Produces proposed text or bounded structured suggestions | Cannot write memory, change settings, execute programs, or mutate the rig directly. |
| External orchestration backend | Produces replies for a conversation explicitly assigned to it | Does not own the local profile, database, or other conversations. Its memory policy is declared per backend. |
| Renderer | Reports actual playback and supported visual outcomes | Cannot choose an inference provider or read secrets/database files. |
| Channel adapter | Validates/normalizes incoming messages and sends explicitly generated replies | Acts only on configured identities and allowlisted remote peers. |
| Implementing agent | Implements the requested work package and records evidence | Must not claim tests ran, decisions were accepted, or proprietary assets were licensed without evidence. |

## Smallest valuable slice: milestone M0

One Windows desktop window, two editable local character records, an original demo avatar plus VRM import, text input and durable transcript, deterministic streaming mock inference, timed mock speech, rule-driven motion, interruption, character switching, and restart recovery. It must run with networking disabled. Mock speech plays a declared fixture corresponding to the mock reply; it is not general speech synthesis.

The first intermediate walking skeleton is deliberately smaller: a typed text request reaches the mock backend, persists, streams back, and survives restart. Audio and 3D then join that same turn contract. Later work must not replace the contract to accommodate each provider.

## Scope and milestones

| Stage | Included outcome | Not required at this gate |
| --- | --- | --- |
| M0: offline demonstrator | Entire slice above, explicit snapshot/interrupt semantics, diagnostics | Real API keys, arbitrary TTS, microphone transcription, Telegram. |
| M1: useful Windows application | Named inference adapters, model routing UI, editable/retrievable memories, configured TTS/STT, PTT, export/backup, packaged startup | External stack mapping can remain a documented adapter gap if its API is unavailable. |
| M1b: existing-stack integration | External session adapter and one real mapping after obtaining documentation | Rebuilding the user's orchestrator or forcing it to implement our wire protocol. |
| M2: optional integrations | Telegram activity/replies, optional imported VRMA clips and OBS view | Autonomous background life, neural motion generation, cloud synchronization. |
| M3: portability validation | Android host feasibility and contract reuse experiment | A promised full mobile release or simultaneous Windows/Android state synchronization. |

Persistent preferences, history, and memory are included. Rich image/file input, multi-user accounts, multiple simultaneous audible avatars, agent tools that operate the computer, custom clothes/mesh authoring, voice cloning, automatic screen/activity monitoring, photorealistic video generation, and payment/account infrastructure are non-goals for this draft's first release. Future extensions need their own requirements rather than silently widening an interface.

## Authorities and review

The local broker owns conversation state and commits data to SQLite. The audio/renderer runtime owns observations of what was played/presented. A model's text is a generated statement, not evidence that an animation occurred or a memory became true. The local owner can inspect and correct stored memory. No background inference runs while the app is closed; no unattended simulation is implied.

The user has authorized the draft. Technology and product defaults are proposed decisions, not recorded approvals. Before a real provider is enabled, the owner selects its connection/model and sees what context is sent. Before optional messaging sends real replies, its integration is explicitly configured. Initial mocks need neither action.

## Success conditions

REQ-001–024 and VER-001–024 define the checks. The useful outcome is editable companions with a responsive, synchronized avatar and recoverable conversations. Operational targets include at least 30 rendered fps on a documented reference machine, visible streamed text within 100 ms of a local normalized delta at p95, and stop/fade initiation within 100 ms of an interruption at p95. Provider/network latency and physical speaker latency are reported separately. These are requirements to measure, not observed performance.

## Glossary

| Term | Exact meaning in this blueprint |
| --- | --- |
| Character | Stable local identity/profile and memory namespace, independent of geometry/model/voice. |
| Avatar | Renderable model and capability/mapping package. Several characters can use one avatar. |
| Channel | Transport identity/type (`desktop`, `telegram`, or `external`). Desktop typing and PTT are input modalities in the same conversation, not separate memory/history channels. |
| Conversation | Character + channel binding + retained message sequence; not a provider session ID. |
| Turn | One accepted user/channel input and its single logical assistant response attempt. |
| Utterance | One ordered audio timeline for a turn; it may contain several synthesized text segments. |
| Epoch | Monotonically increasing presentation generation that invalidates stale audio/effects after cancel, switch, or reconnect. |
| Provider connection | Endpoint/auth/capabilities, kept outside the companion event stream. |
| Model binding | An atomic connection + model + parameter-profile selection for a role. |
| Session backend | Built-in orchestration or an adapter to an already orchestrated external conversation service. |
| Director | Chooses permitted visual intent from events; does not synthesize audio or dictate whether an action succeeded. |
| Memory | Sourced, editable contextual records, with visibility and approval state. Not the complete chat history. |
| Diary | A reviewable derived summary of cited conversation messages; not an independent source of truth. |
| Live character | Locally rendered, continuously updated 3D avatar. No photorealistic video requirement is inferred. |

Discovery is sufficient for a draft: the desired experience, first slice, authority, persistence, and failure expectations are explicit. Remaining QST entries gate particular integrations or quality claims, not the act of writing the blueprint.
