# Quality budgets, privacy, and operations

ART-009. Numbers are proposed acceptance requirements, not measured Animates or new-product performance.

## Measurement conditions and budgets

Record Windows version, CPU/GPU/RAM, power mode, display resolution, audio device/sample rate, Electron/library versions, avatar statistics, and test workload. Use a 1280×720 stage with the original demo avatar and a second approved import; network mocks isolate local budgets. Hardware qualification QST-002 precedes performance claims.

| Requirement | Target / limit | Failure response |
| --- | --- | --- |
| REQ-020 text responsiveness | p95 <=100 ms from normalized text delta to committed UI update over 200 deltas | Trace store/IPC/render stages; do not count provider latency as UI work. |
| REQ-010 stop | p95 <=100 ms command arrival to worklet stop/fade initiation over 100 interruptions | Drop epoch immediately; report device output delay separately. |
| REQ-020 rendering | >=30 fps, p95 frame time <=33.3 ms over 5 min; UI input remains responsive | Lower secondary physics/shadows/resolution; keep text view available. |
| REQ-020 sync | Scheduled mouth cues within 80 ms of measured loopback audio landmarks at p95; <=80 ms accumulated drift over 10 min | Reopen clock/resampling implementation; amplitude fallback quality is evaluated separately. |
| REQ-020 startup | Ready mock text UI <=5 s; demo avatar <=10 s on recorded reference machine | Show staged status; fail clearly instead of an infinite spinner. |
| REQ-022 buffering | Renderer 2 s PCM, broker 2 s PCM; 20 pending remote messages; bounded text segments | Backpressure then explicit speech/channel failure; preserve text. |
| REQ-018 durability | Zero lost acknowledged inputs/committed text after process kill; pending unpublished batch <=40 ms | Transactional acknowledgement; interruption markers on restart. |
| REQ-018 recovery | Recover ordinary process crash to readable history <=10 s; no provider/audio replay | Single restart then recovery UI. |
| REQ-021 request cost | Default dialogue max 512 completion-budget tokens; director max 128; memory max 1,024; no generation retries/fallback | Owner can change bounded profiles; reject missing/unsupported limits. |
| REQ-021 concurrency | <=2 inference calls globally; <=1 dialogue/character; <=1 per local connection by default | Queue or cancel optional work; never start unbounded agents. |
| REQ-020 resource envelope | Observe <=1.5 GiB working set for demo app excluding external LLM/TTS services | Investigate leaks, texture limits, renderer overhead; this budget is subject to hardware gate. |
| REQ-002 history | Search/page 100 records from 100k-message test dataset <=250 ms p95 | Index/query tuning; no full-history renderer load. |

Provider first-token, speech-generation, and model-loading latency are separate measured stages. A mock pass cannot support a cloud/local-model latency claim. Synthetic speech fallback does not prove naturalness or phoneme precision. Use recorded short phrases plus a ten-minute clock test and a human visual/audio review.

## Data and network policy

Default profile makes no provider/channel requests. Endpoint enablement is an owner setting with a clear description of transmitted input, selected history, and permitted memories. The renderer loads bundled code and validated local assets only; no remote scripts/CDNs at runtime. Model selection does not silently enable a new external endpoint.

Hosted endpoints use HTTPS with normal certificate verification. Loopback HTTP is supported for LM Studio and development fixtures. LAN HTTP requires an explicit advanced connection setting identifying the exposure; remote unencrypted internet endpoints are rejected. Reject credential-bearing redirects to different origins. Do not infer that store=false eliminates all provider retention or that a locally running UI makes remote inference private.

Renderer: sandbox enabled, context isolation enabled, nodeIntegration disabled, narrow preload functions, CSP with no eval/remote script, and navigation/new-window blocked except explicit user-chosen safe external links. Imported Markdown is sanitized; never render model HTML as trusted UI. File/resource reads resolve through a registered local application scheme and authorized asset IDs, not arbitrary user/model paths.

Secrets use the host's OS-backed store (version-appropriate asynchronous Electron safeStorage API when supported). The dedicated credential-entry modal receives only newly typed values; no saved secret is returned to a renderer. Refuse persistent secret storage if a platform offers only an insecure fallback. A configured environment-only credential can be used explicitly in development. Secrets are redacted from exceptions, transport tracing, usage records, exports, screenshots used as evidence, and crash logs.

Default microphone scope is PTT; recording state is always visible and the buffer is discarded after transcription/cancel. No automatic screen capture, app monitoring, camera, global microphone daemon, or analytics. Optional channel integrations are disabled until configured. Imported animation/model content cannot grant new privileges.

## Accessibility and UX contract

Default window: resizable stage beside a text transcript; on narrow layout, stage collapses above chat. A character selector, input/send, Stop, PTT, mute/volume, and history are reachable without opening developer settings. Profiles/settings/memory are separate pages with a Back action. Initial screen offers “Try the demo” and “Connect a provider”; missing speech configuration explains that text remains available.

Keyboard: Tab follows visible control order, Enter sends (Shift+Enter newline), Escape stops current speech/capture, Space activates focused controls, and PTT has a visible pointer/keyboard equivalent without stealing typing keys. Do not make a global hotkey a prerequisite. Restore focus after dialogs. Screen-reader labels distinguish generating text, generating speech, speaking, listening, and disconnected.

Show the entire reply in text, including interruptions/errors; do not force audio-only interaction. Provide reduced motion, readable contrast, adjustable text size, and a persistent mic indicator. Status changes are polite live-region updates, not repeated announcements for every token. User-visible controls avoid internal provider error codes except in expandable diagnostics.

## Observability without private reasoning

Each accepted turn gets a trace ID linked to its command, character, conversation, inference attempt, utterance and epoch. Log phase transitions, durations, normalized error codes, queue depth, underruns, selected configuration revisions, memory IDs (not contents), and actual visual outcomes. Do not request/store hidden model reasoning. Error details exposed to the owner use diagnostic IDs for correlation.

Usage is reported, estimated, or unknown. Store cumulative totals once per attempt; cancellation may leave incomplete reporting. Prices are optional configured metadata with source/date; if absent, show tokens and unknown cost. A configurable daily spend cap can block new paid calls when reliable estimates exist; never advertise a hard dollar guarantee when providers don't expose timely billing. Token/call/concurrency limits always apply.

Keep redacted diagnostic logs 10 MB × 5 and usage records 90 days. Export diagnostics only on owner request with a preview of included fields. No automatic telemetry upload. Health reports separate broker/store, renderer, audio device, each enabled provider, and each channel.

## Deployment, recovery, and update policy

WRK-001 pins the version matrix; WRK-016 verifies an actual packaged build from a clean user-data directory. The Windows installer/app release includes code, original demo assets, schemas/migrations, and dependency notices. No Animates binaries or private assets. Model services such as LM Studio remain separately installed/managed by the owner.

First release uses explicit manual updates; no background self-updater or cloud deployment. Before update/migration, make the consistent backup described in 03. Rollback selects the previous app plus compatible pre-migration data; never run old migrations backward destructively. Recovery/export is available if initialization fails.

Deletion, import, restore, and channel send have visible confirmation proportional to the operation. These are application UX requirements, not requests to stop drafting. Preserve unmodified research/original artifacts in this workspace.

## Scaling and later work triggers

Reconsider topology only if measured requirements exceed one visible avatar, two in-flight inference calls, 100 local characters, or 100k-message search targets. Add embeddings after measured retrieval failures, not as a default. Add a learned motion module after the baseline protocol and cancellation suite pass. Android background audio/permissions and cross-device synchronization need their own acceptance evidence; shared TypeScript is not proof those concerns are solved.
