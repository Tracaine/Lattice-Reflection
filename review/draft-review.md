# Draft review record

ART-027. Scope: architecture draft revision 1, not application implementation. Review checks registry structure, document/contract composition, fixture consistency and specified runtime scenarios. Reviewed on 2026-10-22 local time; verification recorded at 2026-10-23T01:18:03Z.

## Current disposition

The package is a concrete draft for review. Technology decisions are proposed and two architecture-shaping assumptions remain unvalidated: target-machine rendering/audio performance and acceptable visual quality. Real provider account access, the user's stack mapping, and production speech configuration have not been tested.

## Semantic review scope

Reviewed outcome/scope, source-of-truth ownership, provider/session/companion separation, model routing precedence, text/audio terminals, cancellation epochs, speech and context ownership, memory provenance, credential boundaries, import safety, channel duplication, persistence/recovery, and work dependencies.

The drafted scenarios specify a success path and invalid-input, unavailable dependency, cancellation, duplicate, crash/restart, and concurrent-conflict outcomes where relevant. The actual tests remain future work.

## Validation results

| Check actually performed | Observed result | Scope |
| --- | --- | --- |
| Node syntax check of check-blueprint.mjs | Exit 0 | The portable checking script parses. |
| Portable draft-structure check | Exit 0; 0 errors, 0 warnings | 51 artifacts, 212 registry entries, 24 requirements, 24 work packages; 32 relative links, 6 declaration files/33 import-name links, and a 10-frame control example. Dependency graph is acyclic. |
| Blueprint skill's ordinary validation | Exit 0; 0 errors, 0 warnings | Registry shape, references and draft requirements. |
| Blueprint skill's strict validation | Exit 1; exactly 2 errors, 0 warnings | ASM-001 and ASM-002 are still unvalidated architecture-shaping assumptions. Expected draft gate, not repaired by changing their status. |
| Portable --approval check | Exit 1; exactly 12 errors, 0 warnings | Ten proposed decisions lack approval evidence; the two shaping assumptions remain unvalidated. |
| Node v24.13.1 built-in TypeScript syntax parsing | 6 files parsed; exit 0 | stripTypeScriptTypes in strip mode; an experimental-API warning was emitted. This is NOT semantic TypeScript type checking. |
| Placeholder/stale-field scan | No unfinished template markers or obsolete schema fields found | Checked Markdown/declarations for placeholders, renamed fields and unsupported broad passing claims; descriptive review text is not an unfinished placeholder. |

The app does not exist. No app build, runtime schema validation, provider conformance test, audio measurement, avatar rendering, packaged installer, or real endpoint smoke test was run. In particular, declaration import linkage and syntax parsing are not a substitute for tsc and contract tests. WRK-001 must compile the declarations, create executable validators, and exercise the examples.

Reproduce the structural/readiness checks from the project root (the optional skill path is specific to this machine):

~~~powershell
node --check architecture/tools/check-blueprint.mjs
node architecture/tools/check-blueprint.mjs
python 'C:\Users\traca\.agents\skills\architect-software-blueprint\scripts\blueprint_guard.py' validate architecture/blueprint.json
python 'C:\Users\traca\.agents\skills\architect-software-blueprint\scripts\blueprint_guard.py' validate architecture/blueprint.json --strict
node architecture/tools/check-blueprint.mjs --approval
~~~

The last two commands intentionally fail the stronger gate in this draft. They must not be represented as passing or used to imply the owner has approved the choices.

## Semantic repairs made during drafting

- Typed input and PTT share a desktop channel/conversation; modality is not a separate memory partition.
- Inference, external-session and speech configurations have distinct owners and records. Frozen bindings prevent settings edits from changing an in-flight turn.
- External context/audio ownership is declared before a turn, preventing double prompt expansion, duplicate model replies, or simultaneous local/remote TTS.
- Provider streams wait for final accounting, deduplicate cumulative usage, and terminate once; buffered profiles have an explicit nonstreaming path. Current OpenRouter token-budget mapping follows its request schema rather than older examples.
- Background character turns have no presentation authority. Active interruptions reset the epoch before the scheduled acknowledgement; the example includes both command receipts.
- SQLite fields, management pagination/deadlines, byte-bounded snapshots, and the dedicated credential-entry exception are explicit instead of implied.
- VRMA playback is a later package, distinct from the procedural baseline. Fixed spoken demo fixtures require provenance and intelligible speech; tones only prove clock behavior.

These are design-review corrections, not regressions found in a running application.

## Remaining findings and disposition

| Finding | Why it matters | Smallest resolution / gate |
| --- | --- | --- |
| ASM-001: performance unmeasured | Renderer/audio host may need tuning or replacement on the actual hardware. | Implement the isolated renderer/audio/import slice; measure using WRK-022 conditions. Blocks performance claims, not drafting. |
| ASM-002: visual quality unreviewed | Procedural motion and amplitude mouth movement may not meet the desired companion feel. | Review the demo plus a second avatar; improve clips/lip-sync behind the same interfaces if needed. Blocks a visual-quality claim. |
| QST-001: existing stack API unknown | Its IDs, context owner, audio format and cancellation cannot be guessed safely. | Obtain redacted docs/examples before WRK-024. Does not block mocks or the fixture adapter. |
| QST-003: real speech configuration absent | Supported models/voices, timing and cancellation must be tested independently of text generation. | Configure one speech adapter and record live tests; no credential needed for M0. |
| QST-005: imported/fixture rights vary | An available model or voice is not automatically distributable. | Record provenance and permitted use before packaging; never reuse Animates assets. |
| TypeScript/runtime conformance not yet established | Declarations alone cannot reject malformed messages or prove implementation behavior. | WRK-001 pins the toolchain, compiles contracts and adds schemas/tests before downstream implementation. |

No unresolved draft-structure errors were found by the checks above. The package is a concrete first draft, not an accepted production architecture. A later build request can authorize the mock-first prototype that resolves these assumptions; ordinary technical defaults need not be put back to the owner as a questionnaire. Update evidence/status only from observed results, not from this review document's existence.
