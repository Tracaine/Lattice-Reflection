# WRK-003 verification

## Windows desktop verification (2026-11-04)

The WRK-003 draft was `aa4a754fae99ba455540fec5893b81c61764a3b0`. Windows fixes were committed as `9256303` on `feature/open-companion`. Host tools: Node 24.13.1, pnpm 11.25.0, Visual Studio 2026 Enterprise 18.11.1 with the C++ toolset and Windows SDK.

### Failure and repair

- `@electron/rebuild@4.0.3` failed before compilation because its `node-gyp@11.5.0` Visual Studio finder only recognizes VS 2019/2022. `vswhere` found the installed VS 2026 C++ workload. Pinned rebuild 4.0.4 brings `node-gyp@12.4.0`, which used the existing VS installation.
- Rebuild 4.0.4 then reached compilation, where `better-sqlite3@12.10.0` failed against Electron 42.0.0. Electron's Windows header used an unsupported MSVC intrinsic, and the addon used V8 external APIs that changed in Electron 42. [Electron 42.3.0](https://releases.electronjs.org/release/v42.3.0) fixes the header; [better-sqlite3 12.10.1](https://github.com/WiseLibs/better-sqlite3/releases/tag/v12.10.1) fixes the V8 calls, and [12.11.1](https://github.com/WiseLibs/better-sqlite3/releases/tag/v12.11.1) includes the Electron 42 Windows build update. The project pins Electron 42.3.0 and better-sqlite3 12.11.1.
- Playwright passed Electron a Windows directory path ending in `\`. The app launch error showed a literal trailing quote on that argument. Resolving the path first removed the trailing separator.
- The storage crash tests expected POSIX `SIGKILL` reporting. This Windows host returned status 1 and a null signal for all four intentional kills, with empty stderr. The assertion now accepts that result and still checks recovered database state.

### Verified commands

| Command | Result |
| --- | --- |
| `pnpm install --frozen-lockfile` | Passed |
| `pnpm typecheck` | Passed |
| `pnpm test` | Passed, 15 contract and storage tests |
| `pnpm check:boundaries` | Passed |
| `pnpm build:test` | Passed, Electron and React bundles built |
| `pnpm --dir apps/desktop exec electron-rebuild --build-from-source -f -w better-sqlite3` | Passed; `build/config.gypi` records MSVC `v145` and Electron 42.3.0 headers |
| `pnpm --filter @open-companion/desktop rebuild:native` | Passed |
| `pnpm exec playwright test --config tests/playwright.config.ts tests/e2e/mock-text.spec.ts` | Passed, 1 of 1 after the source build and again in the final Electron-targeted state |

Playwright launched Electron twice. It observed the partial `Hello. ` text and final scripted reply, then found the user input and reply after restart. The test's `network.log` remained empty. Electron's default session records and cancels HTTP, HTTPS, WebSocket, and secure WebSocket requests; none were observed during the test.

Node 24 uses native module ABI 137 on this host; Electron 42 uses ABI 146. Both workspace packages link to one physical `better-sqlite3` installation. `pnpm -r rebuild better-sqlite3` restores the Node-targeted binding for `pnpm test`; `pnpm --filter @open-companion/desktop rebuild:native` restores the Electron-targeted binding. The checkout was left in the Electron-targeted state.

The network audit covers Electron's default session, including the renderer. It does not capture arbitrary Node networking from the utility process or provide an OS-wide packet trace. The current broker selects the mock connection and built-in mock provider, whose turn path uses a timer and has no network transport. Process-wide outbound auditing remains a separate verification task; the existing Playwright acceptance test passes.

## Earlier managed-executor result (historical)

Base revision `b2d81784b64b2761f2dad238eb972982ebaa29bb`. This report accompanies the local draft commit.

| Check | Result |
| --- | --- |
| `pnpm typecheck` | Passed |
| `pnpm build:test` | Passed, Electron main/preload/broker and React bundles built |
| `pnpm test` | 15 prior contract and storage tests passed |
| `pnpm check:boundaries` | Passed, including chat import allowlist |
| `pnpm exec playwright test --config tests/playwright.config.ts tests/e2e/mock-text.spec.ts` | Failed at Electron launch, before any app assertions |

Electron 42.0.0 expects native module ABI 146. The standalone storage tests use ABI 137. The better-sqlite3 12.10.0 Linux x64 prebuild lookup for Electron ABI 146 returned 404. The Electron-targeted rebuild and load must still be verified.

Electron failed at its POSIX process-singleton socket with EPERM. A locally extracted Xvfb also failed to open local sockets, and a minimal Unix socket listener reproduced EPERM. No desktop UI, MessagePort round trip, Electron-backed persistence, restart assertion or zero-web-request assertion was observed. The Playwright audit targets renderer web requests. Process-level outbound auditing remains to be verified separately.

This was the state of the earlier managed-executor attempt. The Windows verification above supersedes its rebuild instructions.
