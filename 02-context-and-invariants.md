# Context, authorities, and boundaries

ART-004. Applies INV-001–012 and DEC-004/007/008. The application is single-user and local by default.

## System boundary

~~~mermaid
flowchart TB
  subgraph Local["Owner's computer"]
    UI[Companion UI and VRM stage]
    PB[Desktop host: permissions / secrets / file dialogs]
    CORE[Broker: coordinator / memory / director / backends]
    DB[(SQLite + copied assets)]
    AUDIO[AudioWorklet playback]
    UI <-->|INT-001| CORE
    UI <--> AUDIO
    PB <--> CORE
    CORE <--> DB
  end
  CORE <-->|INT-002 via adapters| P[Configured inference endpoints]
  CORE <-->|INT-004 via adapters| V[Configured speech endpoints]
  CORE <-->|INT-008| O[Existing orchestration stack]
  CORE <-->|INT-009, optional| C[Messaging channel]
~~~

Only explicitly enabled adapters make network requests. The normal Windows app has no listening TCP port. Electron message ports carry the same companion DTOs that a future platform bridge would carry. Optional network views or incoming gateways require a later authenticated transport design.

## Trust boundaries and authorization

| Boundary | Identity and permitted data | Validation and failure |
| --- | --- | --- |
| Renderer ↔ host/broker | Main process binds one renderer client ID and role to the message port | Fixed typed operations, schema/size/epoch checks; never arbitrary IPC channel names, file paths, SQL, or code execution. |
| Broker ↔ inference endpoint | Enabled provider connection; credential supplied by the main-process secret port | HTTPS for hosted providers, explicit loopback HTTP for local providers; no redirects to a different origin with credentials. |
| Broker ↔ external stack | Enabled backend connection and a declared capability set | Adapter validates source identity/turn correlation; upstream IDs never become trusted local character IDs automatically. |
| Imported content ↔ runtime | Files selected by the owner, copied under application asset IDs | Require self-contained local resources; reject traversal, scripts, remote URIs, malformed/oversized meshes/textures. |
| Channel ↔ conversation | Binding maps a channel account and allowlisted peer to one character | Reject other peers. Deduplicate external message IDs. Linking/connected status alone never initiates a reply. |
| Prompt/model output ↔ state | Models produce text or suggestions only | Director schema and effect allowlist; memory proposals require review; no arbitrary tools in v1. |

The settings interface is a separate administration surface. It may show model names, provider status, and token usage; it does not embed provider-native objects in companion events. A content prompt or external message cannot create/edit a provider connection.

## Sources of truth

| State | Authority | Projections and conflict rule |
| --- | --- | --- |
| Character identity, voice/avatar choices | Broker repositories | UI edits require expected revision; reject conflicts instead of last-write-wins. |
| Accepted user inputs and generated transcript | Broker SQLite transactions | UI renders durable events/checkpoints; no direct renderer writes. |
| Route selection for an accepted turn | Stored immutable resolved binding | Later settings revisions affect subsequent turns only. |
| Memory visibility and accepted content | Memory service over local store | Model suggestions/diaries are derived and retain source message IDs. |
| Desired visual state | Director via coordinator | Full desired snapshots, versioned per epoch. |
| Actual pose/effect capability outcome | Avatar runtime | Coordinator stores the latest report; a desired state is not a successful action. |
| Audio consumed and output-device state | Playback service | Broker uses playback reports; model generation time does not imply audible time. |
| Channel delivery | Adapter's remote receipt, if available | Pending/uncertain send state is not “delivered.” |
| External stack's internal memory/world | External stack | Not copied as authoritative local memory; import only through a declared reviewed path. |
| Credentials | Desktop host secret store | Broker receives short-lived in-memory access; renderer gets no secret value. |

## Scope and identity rules

Every content operation identifies a character and conversation. A conversation belongs to exactly one character and channel binding for its lifetime. A channel ID is a local opaque ID; its kind is descriptive. Provider request IDs are diagnostic-only. Character, avatar, model, voice, channel, and conversation IDs are never reused interchangeably.

Profile changes increment profileRevision and affect new turns. Prompt context is built from a saved snapshot. Selecting a different character changes the presentation epoch and active conversation; it does not move messages or memories between identities.

One visible/audible character is the initial product limit. A character has at most one executing turn across its channels. New local input preempts its current turn. Incoming remote channel work waits while that character has foreground local speech; queue limits and expiry are defined in 06. No world simulation runs while the app is closed.

## Failure authority

If inference is unavailable, history, character editing, imports, and mock/demo mode remain usable. If speech is unavailable, generated text remains the primary result. If the renderer fails, the broker retains the conversation and cancels that presentation epoch. If the broker fails, the renderer stops audio upon heartbeat loss and the host restarts the broker once; it never tries to reconstruct or mutate durable state itself.

Changing any of these ownership rules reopens DEC-004, INV-002–009, the affected contracts, and their delivery packages.
