# Continuation state

ART-012. Blueprint revision 1, design version 0.1, draft for review. This is a continuation cache; a future agent must reconcile it with the actual repository and evidence.

## Verified baseline

This workspace contains research reports and the newly authored architecture package. No Open Companion application, dependency lockfile, database, migration, provider integration, application test suite, or built avatar exists yet. Code branch/revision: not applicable for the new application. No implementation WRK is completed.

The reference installation, APK contents, REA repository and previous research reports were not edited. Public provider/platform documentation was read to specify adapter boundaries. No provider credentials or external companion session were used.

The draft's document/registry validation results are recorded in review/draft-review.md. Application commands in 08/09 and work-items are future commands, not evidence of tests run now.

## Current focus and next action

Current phase: draft review. Active implementation package: none. The earliest proposed package is WRK-001 after a build request. Read README.md, 00-charter.md, decisions/decisions.md, 05-interfaces-and-contracts.md, contracts/*.ts and work-items/WRK-001.md.

In this research workspace, the recommended future source directory is a new Open-Companion subdirectory. In another context, use that task's supplied project root. Copy this architecture package into the source root before implementation. Do not build inside the REA clone or Animates installation, and do not use those shipped artifacts as application assets. User data belongs in the packaged app's user-data directory, not its source tree.

First blueprint check from any context with Node installed:

~~~text
node architecture/tools/check-blueprint.mjs
~~~

If the blueprint skill is installed, also run its blueprint_guard.py validate on architecture/blueprint.json. Its strict mode and the portable checker's --approval mode assess approval readiness separately from draft integrity. Do not remove unresolved assumptions just to make those gates green.

WRK-001 is done only when the pinned toolchain/contracts/mocks/runtime validators and boundary/contract tests exist with recorded passing checks. It is not done after copying these declarations. Resume from the actual earliest incomplete package, not merely the last package mentioned in a chat.

## Remaining gates

- ASM-001/002: hardware/render/audio feasibility and acceptable visual quality require measured/observed evidence.
- DEC-001–010: proposed architecture choices, not recorded user approval.
- QST-001 blocks only real user-stack mapping WRK-024. Mock external contract work WRK-015 can proceed without it.
- QST-003 gates live production speech configuration; text and mock speech remain testable.
- QST-004 precedes the deferred Android feasibility design.
- QST-005: original procedural fixtures are the default; imported asset distribution needs checked permissions.

The current user request is to produce the first draft. Do not begin application implementation solely because this continuation file names its first package. A later “Please build this” supplies that direction and should use the chosen defaults without repeating ordinary engineering questions.

## Information for the owner later

The provider guide lists the nonsecret configuration needed when enabling OpenAI, OpenRouter, LM Studio, another provider, or the existing orchestration stack. The most useful external-stack input is one redacted API example or its documentation, including cancellation and who supplies memory/audio. No API keys are needed in chat and no graphics-engine/database decision is being left to the owner.
