# Delivery graph and release gates

ART-011. This is a proposed execution order for a future build request. No work package has implementation evidence. Stable IDs are not numeric execution order; WRK-019–024 split responsibilities without renumbering earlier references.

## Work graph

| Package | Contribution | Prerequisites | Stage |
| --- | --- | --- | --- |
| [WRK-001](work-items/WRK-001.md) | Contracts, toolchain, deterministic mocks | None | M0 |
| [WRK-002](work-items/WRK-002.md) | Transactional store and crash-safe transcript | WRK-001 | M0 |
| [WRK-003](work-items/WRK-003.md) | First desktop text conversation | WRK-001, WRK-002 | M0 |
| [WRK-004](work-items/WRK-004.md) | Avatar renderer and original demonstration rig | WRK-001, WRK-003 | M0 |
| [WRK-005](work-items/WRK-005.md) | PCM playback clock and cancellation | WRK-001, WRK-003 | M0 |
| [WRK-019](work-items/WRK-019.md) | Bounded VRM import and mapping preview | WRK-002, WRK-004 | M0 |
| [WRK-006](work-items/WRK-006.md) | Synchronized mock speech and turn cancellation | WRK-003, WRK-004, WRK-005 | M0 |
| [WRK-007](work-items/WRK-007.md) | Director policy, reports, and channel simulation | WRK-004, WRK-006 | M0 |
| [WRK-008](work-items/WRK-008.md) | Character editor, switching, and usable history | WRK-002, WRK-003, WRK-006, WRK-007, WRK-019 | M0 |
| [WRK-009](work-items/WRK-009.md) | Provider gateway, routing, and settings | WRK-001, WRK-002, WRK-003, WRK-008 | M1 |
| [WRK-010](work-items/WRK-010.md) | OpenAI Chat Completions adapter | WRK-009 | M1 |
| [WRK-011](work-items/WRK-011.md) | OpenRouter adapter | WRK-009 | M1 |
| [WRK-012](work-items/WRK-012.md) | LM Studio and explicit compatible-chat profile | WRK-009 | M1 |
| [WRK-013](work-items/WRK-013.md) | Reviewed memory, context, and diary | WRK-002, WRK-003, WRK-008, WRK-009 | M1 |
| [WRK-014](work-items/WRK-014.md) | Real independent speech adapters | WRK-005, WRK-006, WRK-009 | M1 |
| [WRK-020](work-items/WRK-020.md) | Push-to-talk capture and transcription | WRK-008, WRK-014 | M1 |
| [WRK-015](work-items/WRK-015.md) | External-session seam and mock server | WRK-003, WRK-006, WRK-007, WRK-009 | M1 external seam |
| [WRK-021](work-items/WRK-021.md) | Export, backup, restore, and deletion UI | WRK-002, WRK-008, WRK-009, WRK-013, WRK-019 | M1 |
| [WRK-022](work-items/WRK-022.md) | Desktop accessibility and measured quality | WRK-008, WRK-013, WRK-020, WRK-021 | M1 |
| [WRK-016](work-items/WRK-016.md) | Packaged Windows release gate | WRK-010, WRK-011, WRK-012, WRK-014, WRK-015, WRK-020, WRK-021, WRK-022 | M1 |
| [WRK-024](work-items/WRK-024.md) | Map the user's actual orchestration API | WRK-015 | M1b; QST-001 |
| [WRK-017](work-items/WRK-017.md) | Optional Telegram channel | WRK-007, WRK-009, WRK-013, WRK-015, WRK-016 | Optional / deferred |
| [WRK-023](work-items/WRK-023.md) | Optional VRMA clips and motion refinement | WRK-004, WRK-007, WRK-019, WRK-022 | Optional / deferred |
| [WRK-018](work-items/WRK-018.md) | Android portability feasibility | WRK-016 | Optional / deferred |

Each linked package specifies allowed files, non-goals, contracts, checks, evidence, and recovery. blueprint.json is the canonical dependency graph. Dependent work starts only after real prerequisite evidence exists. Independent packages can be scheduled separately when explicitly authorized; this draft does not create agents or tasks.

## Milestones

**M0: offline companion.** WRK-001/002/003 first prove a durable streaming text conversation. WRK-004/005/019 add the renderer, playback, and safe import independently; WRK-006/007/008 join them into synchronized speech, explicit director state, editable characters and history. Gate: the full demonstration in 08 runs offline; stale audio/identity leakage and recovery tests pass. A failed visual quality check remains visible.

**M1: useful Windows app.** Add WRK-009–014, 020/021/022, the external seam in 015, and release qualification 016. Gate: all required fixture/contract/recovery/accessibility checks pass; imports, history, scoped memory and routing are inspectable; at least the enabled live providers/voice are verified before claiming them as working. A missing live credential is live-unverified, not an implicit mock success. Direct inference is sufficient to use M1 while the user's stack API is unavailable.

**M1b: user's orchestration stack.** WRK-024 begins when QST-001 documentation is available; its predecessor 015 already proves the adapter seam. Gate: one real mapped conversation, interruption, no double context/TTS/inference, and documented server cancellation limits.

**M2: optional capabilities.** WRK-017 adds configured Telegram only after reviewing its current official API. WRK-023 adds licensed portable clips and higher visual quality. An OBS output, advanced lip-sync classifier, learned speech-to-body model, or virtual camera requires a new bounded package; none silently enters M0.

**M3: Android feasibility.** WRK-018 is a measured host/bridge experiment after the desktop reference is stable. Resolve standalone vs paired data ownership first. A complete Android implementation plan is produced from that evidence; this package is not a promise that desktop packaging works on mobile.

## Release and rollback rules

No application release is approved by the existence of this document. Approval requires accepted architecture choices, resolved gate-specific questions, strict registry readiness, scenario consistency and actual implementation evidence. The M0 build can be authorized with its experiments explicitly understood as validation of proposed defaults.

Before each package, inspect code revision, dirty files, relevant contracts and prerequisite results. Preserve unrelated user work. A required architectural change reopens affected DEC/INT/VER/WRK IDs. Do not silently expand provider, asset, file access, or messaging privileges.

Before a data migration/release, create and verify a compatible backup. Failed release qualification retains the previous app/data. Rollback of a schema selects a pre-migration snapshot; it does not destructively run arbitrary inverse SQL. App publication, real external messaging and paid service use are distinct configured/authorized actions, not side effects of reading this execution plan.

## How to hand a package to a fresh agent

Provide the full architecture directory and say which WRK to implement. The agent reads README, 10-resume-state, the relevant contract/decision, and the WRK file; reconciles the actual repository; then implements only the bounded outcome. It records commands/results and code revision in evidence/WRK-NNN/result.md, updates completion/dependency state from evidence, and names the next available package.

A future general “Please build this” starts with WRK-001, follows this DAG, and retains the mock path as a permanent diagnostic mode. Missing documentation blocks only the actual integration package that needs it. Ordinary engineering details already decided here should not be repeatedly handed back to the nontechnical owner.
