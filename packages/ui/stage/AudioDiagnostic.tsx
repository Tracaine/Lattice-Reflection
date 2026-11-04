import { useEffect, useRef, useState } from "react";
import { startAudioFixture } from "../../audio/fixture";

export function AudioDiagnostic() {
  const [status, setStatus] = useState("");
  const [running, setRunning] = useState(false);
  const active = useRef<AbortController | null>(null);
  useEffect(() => () => { active.current?.abort(); active.current = null; }, []);

  const run = (seconds: number) => {
    const controller = new AbortController();
    active.current = controller;
    setRunning(true);
    setStatus("Running a quiet PCM fixture…");
    void startAudioFixture(seconds, result => {
      if (active.current !== controller) return;
      active.current = null;
      setStatus(result);
      setRunning(false);
    }, controller.signal);
  };
  return <details>
    <summary>Audio diagnostics</summary>
    <button disabled={running} onClick={() => run(5)}>Play 5-second fixture</button>
    <button disabled={running} onClick={() => run(600)}>Measure 10-minute clock</button>
    <button disabled={!running} onClick={() => active.current?.abort()}>Stop audio</button>
    <output>{status}</output>
  </details>;
}
