# Inference providers and external-stack integration

ART-018. INT-002/003/008, DEC-004/005/010, REQ-005–008/014. The exact private types are in [contracts/inference.ts](contracts/inference.ts). They do not appear in companion-facing events.

## Connection, model profile, and binding

A connection owns endpoint, adapter kind, enablement, and a credential reference. A model profile supplies an exact provider model ID, validated capabilities, context/output limits, and an adapter-validated options object. A role binding selects that complete profile and generation parameters. A turn stores a resolved copy with source scope and revisions.

Resolve a role by character+channel override, then character, channel, application. There is no field-by-field merge. An explicit disabled binding stops resolution; it is not “inherit.” A malformed or unavailable winning binding returns a configuration error, not a fallback. Character selection does not change other characters' configuration. Voice selection is a separate speech binding.

Default roles: dialogue uses the mock model; director uses rules; memory inference is disabled. When a real dialogue profile is enabled, rules/manual memory remain unchanged. The external session mode bypasses the dialogue provider binding; the settings UI displays “Managed by external backend” rather than pretending that the configured dialogue model is active.

The settings UI shows “Effective model” and “Selected by: character/channel/application,” provides an explicit inherit action, and previews the resulting route before saving. Saving a binding while a response streams does not affect that response. Test Connection lists metadata only; an optional test prompt is a separately labelled, potentially billable action.

## Adapter mapping

All production adapters use an HTTP POST. Streaming profiles use a bounded SSE decoder; explicitly nonstreaming profiles use the buffered path below. Keep the parser shared but request/response policy separate. Do not use provider SDK types as domain types. A lightweight fetch-based implementation with eventsource-parser is the baseline; lock its version in WRK-001.

| Adapter | Base URL / operation | Authentication / mapping |
| --- | --- | --- |
| mock | In-process; no URL | Deterministic scripted deltas; configurable failure and delay schedules; no network. |
| openai-chat | https://api.openai.com/v1 → POST /chat/completions | Bearer key. Use requested model, stream=true, n=1, max_completion_tokens, include_usage, and store=false. Send only supported optional parameters. |
| openrouter-chat | https://openrouter.ai/api/v1 → POST /chat/completions | Bearer key. Exact routed model ID; max_completion_tokens. Adapter-owned routing metadata/options stay private. |
| lmstudio-chat | Default http://127.0.0.1:1234/v1 → POST /chat/completions | Configured none/bearer auth. Exact loaded/available model ID; max_tokens. Never start/download/load a model implicitly. |
| custom-chat | Explicit API-prefix base URL | Opt-in adapter profile defines token-limit parameter and optional usage request. “Compatible” is not a capability test. |

OpenAI documents streamed delta chunks, including content-free/usage-only frames and potentially missing final usage after interruption. Its create API distinguishes max_completion_tokens from deprecated max_tokens. [Streaming events](https://developers.openai.com/api/reference/resources/chat/subresources/completions/streaming-events), [create contract](https://developers.openai.com/api/reference/resources/chat/subresources/completions/methods/create).

OpenRouter documents comment heartbeats, errors inside an already-200 stream, and a final usage frame that repeats a finish reason. Its upstream cancellation support varies. The adapter must normalize these into one application terminal. [OpenRouter streaming](https://openrouter.ai/docs/api_reference/streaming).

OpenRouter's current request schema prefers max_completion_tokens and marks max_tokens deprecated, even though some examples still use the latter. Use the schema's preferred field and cover it with a request fixture; do not send both. A legacy proxy needs an explicit compatible-chat profile, not an automatic parameter retry. [OpenRouter create contract](https://openrouter.ai/docs/api/api-reference/chat/create-a-chat-completion).

LM Studio documents its Chat Completions compatibility, stream/max_tokens controls, and local API prefix; authentication can be enabled in current versions. A model's actual capabilities still need a profile/test. [Chat Completions](https://lmstudio.ai/docs/developer/openai-compat/chat-completions), [authentication](https://lmstudio.ai/docs/developer/core/authentication).

These are documentation facts retrieved 2026-10-22, not proof that the user's accounts or locally installed server are configured. Models and prices are deliberately not hard-coded. OpenRouter may route internally within the selected connection; that is distinct from the app switching to another connection. Show and record any configured routing policy. Do not promise upstream provider identity or cancellation billing without evidence.

## Normalization rules

The gateway emits started, zero or more indexed text_delta/usage events, and exactly one finished/failed/cancelled. Usage events replace totals for the attempt; never sum the same cumulative usage twice. Unknown cost is null, not zero. Empty role chunks, heartbeats, and irrelevant metadata produce no visible text.

When the selected profile declares streaming=false, send stream=false, omit stream_options, and parse one bounded JSON response (maximum 2 MiB). Validate choice 0, text/refusal, finish reason and usage with the same output/error rules. Emit at most one text_delta followed by usage and one terminal; do not simulate token timing. The UI labels this profile "Buffered response." Whole-request and first-visible-content deadlines still apply. Never retry a failed streaming request as buffered automatically. Required named-provider streaming profiles must also pass true streaming tests.

The parser uses incremental UTF-8 decoding and handles SSE comments, multiline data, split boundaries, CRLF, and [DONE]. It bounds an SSE event at 1 MiB and a complete visible reply at the application text limit. Malformed non-comment JSON fails the stream; it is not silently ignored. Top-level error fields always take precedence over content or finish reason. Read the declared choice at index 0 only; requesting n>1 is unsupported.

Do not close on the first finish_reason: collect a following accounting frame, then finalize on [DONE] or clean EOF after a valid finish marker. Limit that final accounting wait to five seconds; missing usage becomes unknown. [DONE] without an explicit reason may finish as unknown. EOF before any completion marker is truncated_stream, retaining partial content. An HTTP success with only an error event is a failure.

Normalize refusal text into visible assistant text with textKind=refusal. Ignore hidden reasoning metadata; it is neither spoken nor stored as a transcript. Tool-call/audio/multimodal output from a text-only request produces unsupported_output; there is no tool executor in this release. If structured JSON is requested for optional director/memory tasks, negotiate the profile's capability and validate the full result. Never execute partial JSON.

The normalized token limit maps to each provider's completion budget; some models include nonvisible reasoning in that budget, so identical limits do not guarantee identical visible lengths. Unsupported temperature/top_p/structured-output options fail before the request. No silent parameter deletion, instruction-role rewriting beyond the explicit profile, or model substitution.

## Timeouts, retries, concurrency, and cancellation

| Control | Draft default |
| --- | --- |
| Connect/header deadline | 10 s hosted; 5 s loopback |
| First visible content | 60 s hosted; 120 s local (configurable for cold start) |
| Idle between meaningful output | 30 s; heartbeat comments do not reset it |
| Whole dialogue request | 180 s hosted; 300 s local |
| Director suggestion | 2 s total; on failure keep rule state |
| Memory/diary request | 60 s; run only on explicit owner request |
| Generation retries | None automatically; UI retry creates a new recorded attempt |
| Metadata reads | At most two retries, 250/1,000 ms backoff, respecting a bounded Retry-After |
| Global inference concurrency | At most two; at most one dialogue turn per character; local connection defaults to one |

Foreground dialogue cancels an in-flight optional director suggestion and takes priority over queued reflection. A provider request can only be retried by an explicit user action; pre-token network failure does not prove it was unbilled. No connection/model fallback happens automatically. Present configuration/auth/credit failures as actionable settings problems, and transient errors as an explicit Retry option.

AbortSignal propagates from the coordinator through backend, gateway, fetch/body reader, and speech producer. The gateway terminates locally once, ignores further provider bytes, and records usage as unknown if no final accounting arrives. It cannot guarantee the remote server stopped generating or charging. Late cancellation acknowledgement is diagnostic, never a reason to resume output.

## Mock first

The mock profile has a fixed model ID mock-companion-v1 and a seeded scenario ID. It can produce a short greeting with matching fixture speech, two different character-labelled replies, chunked Unicode, delayed first token, a mid-stream failure, duplicate usage/finish frames, and a cancellation race. A virtual clock drives deterministic unit tests; an optional real-time delay mode drives the UI demo.

WRK-006 creates the fixed spoken fixtures during development, then runtime tests replay their checked hashes without synthesis/network access. The Windows baseline is a small build-time System.Speech script using an installed voice and SetOutputToWaveFile, followed by canonical PCM normalization. Record exact text, voice/version, sample count, hash, timing provenance and permitted use. If no usable voice is installed, obtain an appropriately licensed recording of the same script before claiming the spoken demo complete; do not silently install a voice or substitute tones for intelligible speech. Clock-only tests may use generated tones. Fixture cues are authored test data, not evidence of automatic phoneme recognition. [Microsoft speech-file API](https://learn.microsoft.com/en-us/dotnet/api/system.speech.synthesis.speechsynthesizer.setoutputtowavefile?view=netframework-4.8.1).

Mock contract tests do not prove a real endpoint works. Adapter-specific captured/synthetic wire fixtures prove normalization offline. A separately recorded live smoke test proves configured authentication/model access. The suite must never silently replace a failed live test with a mock pass.

## Existing orchestration stack

SessionBackend is broader than ModelProvider. It may already do prompts, memory, tools, text generation, and speech. The adapter declares contextOwner and audio ownership before starting a turn. The coordinator supplies the current user input and mapped IDs, validates all output, and retains local chat history regardless of backend ownership.

The implementation ships MockExternalSessionBackend and a fixture server, plus a documented adapter skeleton. The actual user's connector is built only from its API documentation. Do not invent a universal endpoint and assume the existing stack implements it. An external gateway may translate HTTP/SSE, WebSocket, or request/poll responses into BackendEvent; it should be outbound from the app unless the API demonstrably requires another topology.

No shadow conversation is generated through the direct provider route in external mode. If the backend owns memory, the app sends no independent memory/history unless the integration explicitly allows it. Locally authored memory remains available for viewing/editing, but the UI marks whether that backend actually consumes it. If backend audio is enabled, local TTS is disabled for that turn.

## Information needed when integrating

| Backend | Nonsecret information needed | Credentials supplied later through the app |
| --- | --- | --- |
| OpenAI Chat Completions | Intended exact model ID, account/project restrictions, desired context/output limits; custom proxy docs only if using one | API key; optional organization/project settings if required. |
| OpenRouter | Exact model ID, routing/provider restrictions if any, allowed context/output and spending limits | OpenRouter key. |
| LM Studio | Installed server version, API base URL/port, exact model identifier, configured context window, whether auth is required | Local API token only if enabled. |
| Another compatible provider | Base URL, request and streamed response examples, auth mechanism, parameter/capability docs, terminal/error samples | Its token/credential through protected settings. |
| Existing orchestration stack | One redacted request plus successful and cancelled/error stream; endpoints; ID mapping; auth mechanism; memory/context owner; text/audio ownership; audio format/timing; reconnect/cancel behavior | Its configured secret if needed. |
| Speech | TTS/STT endpoint docs, model/voice IDs, encoding/rate, streaming/timing behavior, and intended language | Separate speech credential if the service requires one. |

No credentials or technical choices are needed from the owner to implement M0. We can discover advertised models/capabilities after an endpoint is configured; API examples should be redacted rather than containing real conversation history.

## Speech adapter baseline

The real first speech adapter is an explicit openai-audio profile, independent of the selected dialogue provider. It calls /audio/speech with the selected model/voice/input and response_format=pcm, normalizing to INT-004; capture is wrapped as a WAV and sent to /audio/transcriptions with the selected transcription model. PCM format and transcription file submission are documented by OpenAI. [Speech output formats](https://developers.openai.com/api/docs/guides/text-to-speech#supported-output-formats), [transcriptions](https://developers.openai.com/api/docs/guides/speech-to-text#transcriptions).

This does not require using OpenAI for dialogue, and does not imply OpenRouter or LM Studio provides equivalent speech endpoints. A different local TTS/STT service gets its own SpeechProvider adapter. The default remains mock until configured. The provider emits AI-generated speech; the UI identifies it as synthetic. Do not assume phoneme timing is present: use amplitude fallback unless the adapter supplies validated cues.
