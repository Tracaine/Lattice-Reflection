export class VirtualClock {
  private nowMs = 0;
  private readonly pending = new Set<{ due: number; finish: () => void }>();

  sleep(delayMs: number, signal: AbortSignal): Promise<void> {
    signal.throwIfAborted();
    return new Promise((resolve, reject) => {
      const entry = { due: this.nowMs + delayMs, finish: () => { cleanup(); resolve(); } };
      const abort = () => { cleanup(); reject(signal.reason); };
      const cleanup = () => {
        this.pending.delete(entry);
        signal.removeEventListener("abort", abort);
      };
      this.pending.add(entry);
      signal.addEventListener("abort", abort, { once: true });
    });
  }

  advance(ms: number): void {
    this.nowMs += ms;
    for (const entry of this.pending) {
      if (entry.due <= this.nowMs) entry.finish();
    }
  }
}
