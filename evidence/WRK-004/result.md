# WRK-004 avatar implementation

Base: `2ff1c18`. This slice adds Pip, an original CC0 procedural humanoid built from primitive meshes, with a Three.js stage and three-vrm normalized humanoid transforms. Its manifest hash identifies the built-in recipe version, since there is no imported model file. The preview exposes the mouth targets and blink independently of speech.

- `pnpm typecheck` passed.
- `pnpm exec vitest run tests/contract/avatar.test.ts` passed 3/3. The tests exercise humanoid bones, distinct targets, capability and epoch handling, simulated context loss and resource disposal events.
- `pnpm build:test` passed.
- Actual WebGL rendering, visual quality, real context restoration and GPU frame timing are pending Windows validation. The stage's **Measure frames** button records GPU renderer, viewport, triangle count and 300 animation-frame intervals. It replaces the proposed standalone benchmark for this slice.

Open Companion should show Pip beside the conversation. Try each mouth target, **Close eyes**, and **Reload rig** three times. Verify chat still works and copy the **Measure frames** result after keeping the app visible and idle. Include the CPU/GPU and display refresh rate. Importing VRM files and driving the mouth from speech remain later work.
