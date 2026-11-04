# WRK-001 verification

Base revision `27f80ea9bfe6dca404059add0b2c412677fef5c5`. This report is committed with the tested implementation.

| Command | Observed result |
| --- | --- |
| `pnpm install --frozen-lockfile` | Passed |
| `pnpm typecheck` | Passed |
| `pnpm exec vitest run tests/contract/protocol.test.ts tests/contract/mock-provider.test.ts` | 7 passed |
| `pnpm check:boundaries` | Passed |

The published interruption trace parses unchanged. Malformed and stale scopes, invalid text/PCM, oversized control frames and extra command fields are covered. Unknown event fields are stripped. The mock emits ordered text with one terminal on success, failure or cancellation, including cancellation during a virtual wait.

| Runtime | Evidence |
| --- | --- |
| Linux x64 Node 24.22.1, module ABI 137, Node-API 10 | Verified with pnpm 11.25.0, TypeScript 5.9.3, Vitest 3.2.4 and Zod 4.1.12 |
| SQLite native module and Electron runtime | Deferred to their first consuming packages. Rebuild and verify the binding against Electron's ABI separately from standalone Node. |
| Packaged Windows | Pending target verification |

The runtime contract declarations copy the root blueprint declarations. Commands, events and PCM frames have runtime parsers. Sequence and playback state machines belong to the consuming packages. No desktop app, audio or real provider was exercised.
