# Verification and acceptance

ART-010. All application checks below are proposed obligations. None has run in this documentation-only workspace. Blueprint structural/link/declaration checks are recorded separately in review/draft-review.md.

## Requirement-level map

| Verification / requirement | Method | Planned evidence/test |
| --- | --- | --- |
| VER-001 / REQ-001 | Offline network-denied demo, deterministic virtual-clock success/failure/cancel scenarios. | tests/e2e/mock-demo.spec.ts |
| VER-002 / REQ-002 | Persist/reopen/search/page; compare character-specific message IDs and interrupted status. | tests/integration/storage/history.test.ts |
| VER-003 / REQ-003 | Change avatar/model/voice separately; race rapid switch and late callbacks; verify old histories stay assigned. | tests/e2e/character-switch.spec.ts |
| VER-004 / REQ-004 | Valid/incomplete/malformed/oversized/traversing/remote-resource fixtures and two-rig preview. | tests/integration/avatar-import |
| VER-005 / REQ-005 | Same normalized expectations for mock/OpenAI/OpenRouter/LM Studio; distinguish offline wire fixtures from live smoke. | tests/contract/providers |
| VER-006 / REQ-006 | Prohibited import checks, companion DTO field checks, and secret redaction fixtures. | tools/check-boundaries.ts |
| VER-007 / REQ-007 | All four scopes, explicit disabled/invalid winner, per-role override and mid-stream edit. | tests/integration/route-resolution.test.ts |
| VER-008 / REQ-008 | Split Unicode/SSE, comment, empty/refusal, repeated finish/usage, error-only 200, truncation/abort. | tests/contract/inference |
| VER-009 / REQ-009 | PCM normalization, sentence boundaries, source spans, no double TTS, transcribe empty/failure/cancel. | tests/contract/speech |
| VER-010 / REQ-010 | 100 randomized races at text/audio/end/switch boundaries; physical/estimated clock observations labelled. | tests/e2e/interrupt.spec.ts |
| VER-011 / REQ-011 | Cross product of speaking, listening, phone/typing, dance, gesture, reduced motion and missing assets. | tests/contract/director.test.ts |
| VER-012 / REQ-012 | Lost report, repeated revision/gesture, stale epoch, sequence gap and renderer replacement. | tests/integration/visual-sync.test.ts |
| VER-013 / REQ-013 | Character/channel isolation, reviewed state, deletion invalidation, bounded context and external ownership. | tests/integration/memory |
| VER-014 / REQ-014 | Fixture server text/audio/context ownership, mapped IDs, disconnection/cancel; later actual API mapping. | tests/contract/external-backend.test.ts |
| VER-015 / REQ-015 | Connected vs activity, TTL/preemption, duplicate inbox, bounded queue and uncertain outgoing send. | tests/contract/channels.test.ts |
| VER-016 / REQ-016 | No network in default mode; no secrets in stage/events/export/log; hostile import and untrusted Markdown. | tests/integration/security.test.ts |
| VER-017 / REQ-017 | No desktop/runtime/provider types in portable packages; future Android foreground fixture run. | tests/contract/platform.test.ts |
| VER-018 / REQ-018 | Kill at transaction boundaries, fail migration, validate snapshot/assets, restore without deleting previous dataset. | tests/integration/portability |
| VER-019 / REQ-019 | Keyboard/focus/mic/Stop/mute/reduced-motion tests plus screen-reader review. | tests/e2e/accessibility.spec.ts |
| VER-020 / REQ-020 | Recorded hardware, avatar statistics, timed frame/loopback/10-minute drift/startup/history runs plus human visual review. | tools/bench |
| VER-021 / REQ-021 | Reported vs estimated/unknown usage, repeated totals, cancellation, caps and global/per-connection concurrency. | tests/integration/budgets.test.ts |
| VER-022 / REQ-022 | Re-submit after lost ack; conflicting digest; old event/session; restart with active turn; no replay or resend. | tests/integration/recovery.test.ts |
| VER-023 / REQ-023 | Clean profile -> demo; effective-route explanation; missing voice; typed fallback and conflict recovery. | tests/e2e/setup.spec.ts |
| VER-024 / REQ-024 | Round-trip IDs/provenance/license, no secrets, derived-index rebuild and removal from context/events. | tests/integration/portability/export.test.ts |

The registry adds invariant targets. No requirement may be marked complete from an implemented checkbox alone. A test name is not a test result.

## Layers and commands

WRK-001 creates the following repository commands and pins their tools: pnpm typecheck; pnpm lint; pnpm check:boundaries; pnpm test:unit; pnpm test:contract; pnpm test:integration; pnpm build:test; pnpm verify; pnpm package:win; and the three benchmark scripts. pnpm verify runs type/lint/boundaries plus offline unit/contract/integration suites. Playwright/Electron checks run after build:test through the explicit commands in work items. No test invokes a paid endpoint by default.

Protocol types are accompanied by runtime validators and valid/invalid fixtures. Unit tests use a virtual monotonic clock; integration tests use temporary databases/assets and local mock endpoints. End-to-end tests launch the application's own packaged/test host, not Animates. Hardware/audio checks use actual presentation, with raw private recordings excluded from shared evidence by default.

Provider conformance runs against synthetic or redacted documented wire fixtures. Live smoke runs are opt-in for a configured connection and store only selected model, date, success/error category and redacted timing/usage. Report coverage as fixture-pass, live-pass, live-fail, or live-unverified for each adapter. Never summarize all four as live working merely because the mock works.

## M0 demonstration script

1. Start with a clean test user-data directory and networking denied; launch the demo.
2. See two seeded characters and the original demo avatar; select the first.
3. Submit a line of text. Observe one durable user message, a streaming mock reply, matching fixture speech and mouth motion.
4. Interrupt midway. Observe fade/stop, retained partial/full text as appropriate, no resumed late speech, and a truthful state report.
5. Import a valid VRM and inspect capability warnings/mapping preview; activate it, then attempt an invalid import and keep the working model.
6. Switch characters during pending output; verify the first character's audio/pose cannot reach the second.
7. Restart during generation; history survives and the unfinished turn is marked interrupted. Nothing speaks or calls a provider automatically.
8. Search each character's history and confirm there is no cross-character content.
9. Inspect the turn trace: command/turn/utterance/epoch/state outcomes are correlated; no credentials or private reasoning text.
10. Record actual results and limitations. Subjective motion quality remains a separate gate.

## Fault matrix

| Fault injection | Required observable result |
| --- | --- |
| Double-click/retransmit accepted input | One logical turn/provider attempt; same committed IDs. |
| Lost commit acknowledgement / process kill | Restart finds receipt and history; never regenerates automatically. |
| UTF-8/SSE split, role-only chunks, accounting duplicate | Correct text, one terminal and one cumulative usage record. |
| Provider stalls/fails after partial text | Partial history retained; speech cancelled; explicit retry option. |
| Output continues after AbortSignal | Dropped by turn/epoch check before rendering or persistence. |
| Audio gap/overflow/underrun | Bounded failure or silence/hold under the documented policy; no indefinite queue. |
| Renderer report missing / new renderer | Snapshot, new epoch, no gesture or audio replay. |
| Unsupported phone/face capability | Report unsupported and use only declared fallback; no false applied state. |
| Memory deleted while in context | Cancel affected turn; remove future retrieval and derived records. |
| Uncertain remote send | Visible uncertain outbox state; no automatic duplicate send. |
| Migration/restore/import failure | Prior data/avatar remains recoverable and selected where applicable. |

## Human acceptance and unresolved evidence

The owner or a designated reviewer evaluates whether motion feels acceptable, speech is intelligible, lip movement looks synchronized, and import/settings can be used without code knowledge. Capture a short consented demo or structured observations plus the exact model/voice/hardware/asset statistics. An agent must not invent that review or mark ASM-001/002 validated because it reread the spec.

A failed visual check should produce a narrow change proposal: better lip-sync, different clips, lower graphics profile, or an alternate renderer behind INT-005. Do not replace the conversation/provider architecture to compensate for a rendering issue.

M1 release needs the numeric tests and recovery/accessibility obligations, plus at least one configured real conversation/speech path if advertised as live. Unconfigured providers remain explicitly live-unverified even when their adapters pass offline conformance. Android, real Telegram, and the user's actual stack mapping have separate gates.

## Blueprint-only validation

Run the bundled blueprint_guard non-strict for registry structure and references, the portable tools/check-blueprint.mjs for draft completeness/contracts/examples, and a semantic scenario audit. Strict approval validation is a separate gate: this first draft intentionally retains unvalidated architecture-shaping visual/hardware assumptions and proposed decisions. A clean structural report is not implementation approval.
