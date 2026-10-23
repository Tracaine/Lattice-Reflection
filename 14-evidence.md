# Evidence and the limits of inference

ART-020. Sources checked or reused on 2026-10-22. FACT entries are observations or documentation facts, not requirements for the new product. DEC/REQ entries are explicit new design intent. No Animates service was contacted and no application/dependency was installed or launched for this drafting task.

| Fact | Evidence | What it supports / does not establish |
| --- | --- | --- |
| FACT-001 | [Windows static report](../WINDOWS_ARCHITECTURE.md), sections 1–6 | A Unity/WebUI client with remote conversation/director/memory boundaries, local scene/effect runtime. Private server prompts/policy are unknown. |
| FACT-002 | [Android static report](../ANDROID_ARCHITECTURE.md), sections 1–4 | Native Android host/bridge and Unity IL2CPP lineage; platform host responsibilities differ. Does not prove identical implementation or performance. |
| FACT-003 | [Avatar pipeline research](../AVATAR_PIPELINE_RESEARCH.md), sections 1–2 and E1–E8 | Speech-ID-aware scheduling, separate local/server animation generation, per-character rig mappings, audio sink, separate offline export. No measured live latency/quality. |
| FACT-004 | Avatar research compiled values | Windows baseline 24 kHz mono, 30 fps, canonical 61-bone/52-channel format. These are reference implementation values, not imported-avatar requirements. |
| FACT-005 | Windows section 7 / Android section 5 | Telegram integration and phone/typing paths coexist; their server trigger is not proven. Our channel rule is DEC-006. |
| FACT-006 | [OpenAI streaming events](https://developers.openai.com/api/reference/resources/chat/subresources/completions/streaming-events), [create API](https://developers.openai.com/api/reference/resources/chat/subresources/completions/methods/create) | SSE deltas/finish/usage and request options. Model/account support is not established by these docs alone. |
| FACT-007 | [OpenRouter streaming](https://openrouter.ai/docs/api_reference/streaming), [create API](https://openrouter.ai/docs/api/api-reference/chat/create-a-chat-completion) | Heartbeats, mid-stream errors and final accounting differences require normalization; current schema prefers max_completion_tokens. |
| FACT-008 | [LM Studio chat](https://lmstudio.ai/docs/developer/openai-compat/chat-completions), [auth](https://lmstudio.ai/docs/developer/core/authentication) | Compatible chat endpoint/stream parameter and optional token authentication. User's local version/config remains unknown. |
| FACT-009 | [VRM](https://vrm.dev/en/vrm/vrm_features/), [three-vrm](https://github.com/pixiv/three-vrm), [VRMA](https://vrm.dev/en/vrma/) | Standard avatar/animation data and an open loader. Arbitrary assets still require validation and license review. |
| FACT-010 | [Electron utility process](https://www.electronjs.org/docs/latest/api/utility-process), [security](https://www.electronjs.org/docs/latest/tutorial/security), [context isolation](https://www.electronjs.org/docs/latest/tutorial/context-isolation), [safeStorage](https://www.electronjs.org/docs/latest/api/safe-storage) | Process/IPC/security/OS-encryption mechanisms exist. Use the selected version's supported async secret API where available; Windows storage is not a defense against all same-user software. |
| FACT-011 | [SQLite backup](https://www.sqlite.org/backup.html), [better-sqlite3](https://github.com/WiseLibs/better-sqlite3) | Consistent snapshots and a transactional Node binding. Packaged Electron ABI compatibility needs a real build check. |
| FACT-012 | [AudioWorklet processing](https://developer.mozilla.org/en-US/docs/Web/API/AudioWorkletProcessor/process), [output timestamp](https://developer.mozilla.org/en-US/docs/Web/API/AudioContext/getOutputTimestamp) | Browser audio processing and output-clock estimates. Exact physical speaker latency is not implied. |
| FACT-013 | [OpenAI speech formats](https://developers.openai.com/api/docs/guides/text-to-speech#supported-output-formats), [transcriptions](https://developers.openai.com/api/docs/guides/speech-to-text#transcriptions) | A concrete optional speech adapter path; not evidence that all text providers offer speech. |
| FACT-014 | [Microsoft speech-file API](https://learn.microsoft.com/en-us/dotnet/api/system.speech.synthesis.speechsynthesizer.setoutputtowavefile?view=netframework-4.8.1) | An offline build-time spoken-fixture path exists. Installed voice availability and distribution permissions are not established by the API documentation. |

The earlier research reports remain unchanged. The avatar report refines the Windows report's previously unresolved speaker-output path; use that later, more specific evidence for this one point. Android byte-format/bridge ownership uncertainty remains unresolved.

## Reuse boundary

Implement the documented functional patterns and new open contracts. Do not bundle Animates binaries, code recovered from source maps, models, art, scenes, credentials, or private endpoint assumptions. Assets and dependencies retain their own licenses; an MIT renderer does not license imported characters. The reference material is evidence for responsibility boundaries and failure cases, not a source tree for the new application.

The blueprint contains proposed motion constants, queue budgets, routing rules, schemas, and storage policy authored for this project. Those values are requirements/defaults to test, not claims extracted from Animates. The user can accept or revise them without reinterpreting a reverse-engineering observation.
