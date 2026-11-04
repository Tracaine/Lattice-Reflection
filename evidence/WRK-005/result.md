# WRK-005 playback implementation

Base includes the WRK-004 stage. The desktop build now ships a local AudioWorklet and a standalone PCM fixture. The fixture has no TTS, and chat turns do not drive speech yet. The later integration owns protocol routing between broker, playback and avatar.

The renderer reserves ingress credit until worklet acknowledgement. The worklet maintains a 48,000-source-sample ring, sequence and duplicate checks, prebuffer/rebuffer, end-of-stream drain, and a source cursor that freezes on underrun. Mute advances the cursor. Epoch cancellation discards queued PCM and ramps the last emitted value to zero over 10 ms. The playback report describes rendered samples. Physical device latency remains unmeasured.

- `pnpm exec vitest run tests/unit/audio tests/integration/audio` passed 7/7. Ten simulated minutes at 24,000, 44,100 and 48,000 Hz accumulated 0 ms sample drift. Test cases exercise irregular output block sizes, short tail drain, underrun and timeout, duplicate/gap/overflow rejection, mute, cancellation fade, stale frames, and simulated device failure.
- Typecheck, desktop bundle and import boundary checks passed.
- The actual AudioWorklet, graph loopback, audible output and live context-clock drift have not run in this workspace. The diagnostic compares elapsed AudioContext time with fixture content duration and reports the analyser peak. This measures graph output and callback timing, with no physical loopback latency claim.

## Windows hardware handoff

From a clean checkout of the feature branch, with the same Node/pnpm setup used for WRK-003:

~~~powershell
pnpm.cmd install --frozen-lockfile
pnpm.cmd build:test
pnpm.cmd --filter @open-companion/desktop rebuild:native
pnpm.cmd --filter @open-companion/desktop start
~~~

1. For WRK-004, follow [the avatar checks](../WRK-004/result.md). Check context loss if WebGL exposes `WEBGL_lose_context`: in Electron DevTools, run `const ext = document.querySelector("canvas").getContext("webgl2").getExtension("WEBGL_lose_context"); ext?.loseContext();` and confirm chat stays available. Run `ext?.restoreContext();` and confirm that the stage returns. Report unavailable extension separately.
2. Open **Audio diagnostics** and run **Play 5-second fixture**. Confirm short quiet pulses and copy the completion line, which should show 120,000/120,000 samples and a nonzero graph peak.
3. Run the short fixture again. Press **Stop audio** during a pulse. Confirm silence with no later pulse, and copy the cancellation line. Start the short fixture once more to verify a fresh run works.
4. Run **Measure 10-minute clock** with the window active and Windows awake. Copy the final line and report the output device and Windows sample rate. The live target is 14,400,000/14,400,000 samples, zero underruns and context drift no greater than 80 ms. If an underrun occurs, retain its result as a separate observation.
