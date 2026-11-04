import type { AudioFrame } from "../contracts/avatar-speech";
import { PcmClock, type Lane } from "./clock";

export type PlaybackCommand =
  | { kind: "start"; lane: Lane }
  | { kind: "frame"; frame: AudioFrame }
  | { kind: "end"; lane: Lane; total: number }
  | { kind: "reset"; sessionId: string; epoch: number }
  | { kind: "volume"; muted: boolean; volume: number };

declare const sampleRate: number;
declare abstract class AudioWorkletProcessor {
  readonly port: MessagePort;
  abstract process(inputs: Float32Array[][], outputs: Float32Array[][]): boolean;
}
declare function registerProcessor(name: string, processor: typeof AudioWorkletProcessor): void;

class OpenCompanionPlayback extends AudioWorkletProcessor {
  private readonly clock = new PcmClock(sampleRate);
  private lastState = "";
  private frames = 0;

  constructor() {
    super();
    this.port.onmessage = ({ data }: MessageEvent<PlaybackCommand>) => {
      switch (data.kind) {
        case "start": this.clock.start(data.lane); this.publish(true); break;
        case "frame": this.clock.append(data.frame); this.publish(); break;
        case "end": this.clock.end(data.lane, data.total); this.publish(); break;
        case "reset": this.clock.reset(data.sessionId, data.epoch); this.publish(); break;
        case "volume": this.clock.volume(data.muted, data.volume); break;
      }
    };
  }

  private publish(force = false): void {
    const report = this.clock.report();
    if (report && (force || this.lastState !== report.state || this.frames >= sampleRate / 20)) {
      this.port.postMessage(report);
      this.lastState = report.state;
      this.frames = 0;
    }
  }

  process(_inputs: Float32Array[][], outputs: Float32Array[][]): boolean {
    const channel = outputs[0]?.[0];
    if (channel) {
      this.clock.render(channel);
      this.frames += channel.length;
      this.publish();
    }
    return true;
  }
}

registerProcessor("open-companion-playback", OpenCompanionPlayback);
