import { AmbientLight, Color, DirectionalLight, PerspectiveCamera, Scene, WebGLRenderer } from "three";
import type { AvatarCapabilities, AvatarManifest, AvatarRuntime, DesiredVisual, MouthShape, SpeechTiming, VisualReport } from "../contracts/avatar-speech";
import { createDemoRig, demoManifest, mouthShapes } from "./demo";

type Rig = ReturnType<typeof createDemoRig>;
export class DemoAvatar implements AvatarRuntime {
  private prepared: { rig: Rig; manifest: AvatarManifest } | null = null;
  private active: Rig | null = null;
  private epoch = 0;
  private desired: DesiredVisual | null = null;
  private receivedAt = 0;
  private lost = false;
  private disposed = false;
  private latest: VisualReport = this.neutral();
  readonly scene = new Scene();
  readonly camera = new PerspectiveCamera(34, 1, .1, 20);

  constructor() {
    this.scene.background = new Color(0x211b2e);
    this.scene.add(new AmbientLight(0xf1deff, 1.5));
    const key = new DirectionalLight(0xffebd7, 2.4);
    key.position.set(2, 3, 4);
    this.scene.add(key);
  }

  async prepare(manifest: AvatarManifest, signal: AbortSignal): Promise<AvatarCapabilities> {
    signal.throwIfAborted();
    if (this.disposed || manifest.format !== "builtin_demo" || manifest.id !== demoManifest.id ||
      manifest.sha256 !== demoManifest.sha256) throw new Error("Unsupported demonstration rig");
    const rig = createDemoRig();
    this.prepared?.rig.dispose();
    this.prepared = { rig, manifest };
    return {
      avatarId: manifest.id, humanoid: true,
      expressions: Object.keys(demoManifest.expressionMap),
      mouthShapes: [...mouthShapes], gaze: true, activities: ["none"], gestures: [], customClipIds: [],
    };
  }

  async activate(epoch: number): Promise<void> {
    const candidate = this.prepared;
    if (!candidate || this.disposed || epoch <= this.epoch) throw new Error("Avatar activation requires a fresh epoch and a prepared rig");
    this.prepared = null;
    this.active?.dispose();
    this.active = candidate.rig;
    this.scene.add(candidate.rig.root);
    const { framing, targetHeightRatio, distanceScale } = candidate.manifest.camera;
    const fullBody = framing === "full_body";
    const target = 1.84 * targetHeightRatio;
    this.camera.position.set(0, fullBody ? .93 : target, (fullBody ? 3.7 : 2.15) * distanceScale);
    this.camera.lookAt(0, fullBody ? .93 : target, 0);
    this.lost = false;
    this.reset(epoch);
  }

  setDesired(epoch: number, desired: DesiredVisual): void {
    if (!this.active || this.lost || epoch !== this.epoch || desired.revision <= (this.desired?.revision ?? -1)) return;
    this.desired = structuredClone(desired);
    this.receivedAt = performance.now();
  }

  // WRK-006 binds speech timing to actual playback. Timing alone cannot advance the rig.
  applySpeechTiming(_epoch: number, _timing: SpeechTiming): void {}

  report(): VisualReport { return structuredClone(this.latest); }

  reset(epoch: number): void {
    if (epoch <= this.epoch) return;
    this.epoch = epoch;
    this.desired = null;
    this.latest = this.neutral();
    this.active?.humanoid.resetNormalizedPose();
    this.active?.humanoid.update();
    this.active?.expression("sil", 0, 0);
  }

  contextLost(): void {
    this.lost = true;
    this.latest = this.neutral();
  }

  tick(now: number, preview?: { shape: MouthShape; blink: boolean }): void {
    const rig = this.active;
    if (!rig || this.lost) return;
    const desired = this.desired;
    const elapsed = now - this.receivedAt;
    const reduced = desired?.reducedMotion ?? false;
    const base = desired?.base ?? "idle";
    const emotionRequested = desired?.emotion.name ?? "neutral";
    const expired = !!desired && elapsed >= desired.emotion.ttlMs;
    const emotion = expired || (emotionRequested !== "happy" && emotionRequested !== "surprised") ? "neutral" : emotionRequested;
    rig.humanoid.resetNormalizedPose();
    const head = rig.humanoid.getNormalizedBoneNode("head")!;
    const spine = rig.humanoid.getNormalizedBoneNode("spine")!;
    spine.rotation.x = reduced ? 0 : .018 * Math.sin(now / 680);
    head.rotation.x = reduced ? 0 : base === "listening" ? -.10 : base === "thinking" ? .10 : .025 * Math.sin(now / 840);
    head.rotation.y = desired?.gaze === "away" ? .22 : 0;
    rig.humanoid.update();
    const cycle = Math.floor(now / 4200);
    const blinkCenter = 3000 + (cycle * 137 % 800);
    const blink = reduced ? 0 : Math.max(0, 1 - Math.abs(now % 4200 - blinkCenter) / 80);
    rig.expression(preview?.shape ?? (emotion === "happy" ? "ee" : emotion === "surprised" ? "oh" : "sil"),
      preview ? 1 : desired?.emotion.weight ?? 0, preview?.blink ? 1 : blink);
    this.latest = {
      appliedRevision: desired?.revision ?? 0, actualBase: base, actualActivity: "none", speaking: false, emotion,
      outcomes: desired ? [
        { feature: "activity", result: desired.activity.kind === "none" ? "applied" : "unsupported", detail: desired.activity.kind },
        { feature: "emotion", result: emotionRequested === "neutral" ? "applied" : expired ? "expired" : emotion === "neutral" ? "unsupported" : "applied", detail: emotionRequested },
        { feature: "gaze", result: desired.gaze === "phone" ? "unsupported" : "applied", detail: desired.gaze },
        ...(desired.gesture ? [{ feature: "gesture" as const, result: "unsupported" as const, detail: desired.gesture.name }] : []),
      ] : [],
    };
  }

  private neutral(): VisualReport {
    return { appliedRevision: 0, actualBase: "idle", actualActivity: "none", speaking: false, emotion: "neutral", outcomes: [] };
  }

  dispose(): void {
    this.active?.dispose();
    this.prepared?.rig.dispose();
    this.active = null;
    this.prepared = null;
    this.disposed = true;
    this.latest = this.neutral();
  }
}

export function makeRenderer(canvas: HTMLCanvasElement) {
  return new WebGLRenderer({ canvas, antialias: true, alpha: false });
}
