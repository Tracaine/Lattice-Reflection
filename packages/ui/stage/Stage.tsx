import { useEffect, useRef, useState } from "react";
import type { MouthShape } from "../../contracts/avatar-speech";
import { demoManifest, mouthShapes } from "../../avatar/demo";
import { DemoAvatar, makeRenderer } from "../../avatar/runtime";

export function Stage() {
  const canvas = useRef<HTMLCanvasElement>(null);
  const preview = useRef({ shape: "sil" as MouthShape, blink: false });
  const samples = useRef<number[] | null>(null);
  const [generation, reload] = useState(0);
  const [status, setStatus] = useState("Preparing Pip");
  const [benchmark, setBenchmark] = useState("");
  const [ready, setReady] = useState(false);

  useEffect(() => {
    const surface = canvas.current!;
    const runtime = new DemoAvatar();
    const controller = new AbortController();
    let renderer: ReturnType<typeof makeRenderer> | undefined;
    let request = 0;
    let lastFrame = 0;
    let lost = false;
    const resize = () => {
      const width = Math.max(1, surface.clientWidth);
      const height = Math.max(1, surface.clientHeight);
      renderer?.setSize(width, height, false);
      runtime.camera.aspect = width / height;
      runtime.camera.updateProjectionMatrix();
    };
    const onLost = (event: Event) => {
      event.preventDefault();
      lost = true;
      runtime.contextLost();
      cancelAnimationFrame(request);
      samples.current = null;
      setReady(false);
      setStatus("Graphics context lost. Chat is still available.");
    };
    const onRestored = () => reload(value => value + 1);
    surface.addEventListener("webglcontextlost", onLost);
    surface.addEventListener("webglcontextrestored", onRestored);
    const observer = new ResizeObserver(resize);

    async function start() {
      try {
        renderer = makeRenderer(surface);
        renderer.setPixelRatio(Math.min(devicePixelRatio, 1.5));
        observer.observe(surface);
        resize();
        const capabilities = await runtime.prepare(demoManifest, controller.signal);
        if (controller.signal.aborted || lost) return;
        await runtime.activate(generation + 1);
        if (controller.signal.aborted || lost) return;
        setReady(true);
        setStatus(`${demoManifest.name} · humanoid · ${capabilities.mouthShapes.length} mouth targets · blink and gaze`);
        const frame = (time: number) => {
          runtime.tick(time, preview.current);
          renderer!.render(runtime.scene, runtime.camera);
          const timings = samples.current;
          if (timings && lastFrame) {
            timings.push(time - lastFrame);
            if (timings.length === 300) {
              const sorted = [...timings].sort((a, b) => a - b);
              const mean = timings.reduce((a, b) => a + b, 0) / timings.length;
              const gl = renderer!.getContext();
              const ext = gl.getExtension("WEBGL_debug_renderer_info");
              const gpu = gl.getParameter(ext ? ext.UNMASKED_RENDERER_WEBGL : gl.RENDERER);
              setBenchmark(`${gpu} | ${renderer!.domElement.width}×${renderer!.domElement.height} | ${renderer!.info.render.triangles} triangles | 300 frames | mean ${mean.toFixed(1)} ms | p95 ${sorted[284]!.toFixed(1)} ms | max ${sorted[299]!.toFixed(1)} ms`);
              samples.current = null;
            }
          }
          lastFrame = time;
          request = requestAnimationFrame(frame);
        };
        request = requestAnimationFrame(frame);
      } catch {
        if (!controller.signal.aborted) {
          setReady(false);
          setStatus("3D stage unavailable. Chat is still available.");
        }
      }
    }
    setReady(false);
    setStatus("Preparing Pip");
    void start();
    return () => {
      controller.abort();
      samples.current = null;
      cancelAnimationFrame(request);
      observer.disconnect();
      surface.removeEventListener("webglcontextlost", onLost);
      surface.removeEventListener("webglcontextrestored", onRestored);
      runtime.dispose();
      renderer?.dispose();
    };
  }, [generation]);

  return <section className="stage" aria-label="Avatar stage">
    <canvas ref={canvas} aria-label="Pip demonstration avatar" />
    <p>{status}</p>
    <label>Mouth <select disabled={!ready} defaultValue="sil"
      onChange={event => { preview.current.shape = event.target.value as MouthShape; }}>
      {mouthShapes.map(shape => <option key={shape}>{shape}</option>)}
    </select></label>
    <label><input type="checkbox" disabled={!ready}
      onChange={event => { preview.current.blink = event.target.checked; }} /> Close eyes</label>
    <button onClick={() => { setBenchmark(""); reload(value => value + 1); }}>Reload rig</button>
    <button disabled={!ready} onClick={() => { samples.current = []; setBenchmark("Measuring 300 frames…"); }}>Measure frames</button>
    <output>{benchmark}</output>
  </section>;
}
