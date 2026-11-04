import { describe, expect, it } from "vitest";
import { createHash } from "node:crypto";
import { createDemoRig, demoManifest, mouthShapes } from "../../packages/avatar/demo";
import { DemoAvatar } from "../../packages/avatar/runtime";
import type { DesiredVisual } from "../../packages/contracts/avatar-speech";

const desired: DesiredVisual = {
  revision: 3, base: "listening", activity: { kind: "phone", source: "manual", ttlMs: 1000 },
  emotion: { name: "happy", weight: .6, ttlMs: 1000 }, gaze: "camera", gesture: null, reducedMotion: true,
};
describe("original demo rig", () => {
  it("has normalized humanoid bones, distinct vowel targets, and blink", () => {
    const rig = createDemoRig();
    expect(rig.humanoid.getNormalizedBoneNode("head")).toBeTruthy();
    const shapes = mouthShapes.map(shape => {
      rig.expression(shape, 1, 1);
      return [rig.mouth.scale.x, rig.mouth.scale.y].join("/");
    });
    expect(new Set(shapes).size).toBe(6);
    expect(rig.eyes[0]!.scale.y).toBeLessThan(.004);
    expect(createHash("sha256").update("pip-v1").digest("hex")).toBe(demoManifest.sha256);
    rig.dispose();
  });

  it("reports actual capabilities, fences stale intent, and neutralizes after context loss", async () => {
    const stage = new DemoAvatar();
    const capabilities = await stage.prepare(demoManifest, new AbortController().signal);
    expect(capabilities.activities).toEqual(["none"]);
    await stage.activate(1);
    stage.setDesired(1, desired);
    stage.tick(performance.now());
    expect(stage.report()).toMatchObject({ actualBase: "listening", appliedRevision: 3, actualActivity: "none", emotion: "happy" });
    expect(stage.report().outcomes[0]?.result).toBe("unsupported");
    stage.setDesired(1, { ...desired, base: "thinking", revision: 2 });
    stage.tick(performance.now() + 2000);
    expect(stage.report()).toMatchObject({ actualBase: "listening", emotion: "neutral" });
    stage.reset(2);
    stage.setDesired(1, desired);
    stage.tick(performance.now());
    expect(stage.report().appliedRevision).toBe(0);
    stage.contextLost();
    stage.setDesired(2, desired);
    stage.tick(performance.now());
    expect(stage.report().appliedRevision).toBe(0);
    stage.dispose();
  });

  it("retains the active rig on aborted preparation and disposes replaced resources", async () => {
    const stage = new DemoAvatar();
    const signal = new AbortController().signal;
    await stage.prepare(demoManifest, signal);
    await stage.activate(1);
    const root = stage.scene.children.at(-1)!;
    const geometry = (root.children[0]!.children.find(child => "geometry" in child) as ReturnType<typeof createDemoRig>["mouth"]).geometry;
    let disposed = 0;
    geometry.addEventListener("dispose", () => disposed++);
    await expect(stage.prepare(demoManifest, AbortSignal.abort())).rejects.toThrow();
    expect(root.parent).toBe(stage.scene);
    await stage.prepare(demoManifest, signal);
    await stage.activate(2);
    expect(root.parent).toBeNull();
    expect(disposed).toBe(1);
    stage.dispose();
    stage.dispose();
    expect(stage.scene.children).toHaveLength(2);
  });
});
