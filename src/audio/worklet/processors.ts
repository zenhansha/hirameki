// AudioWorklet entry: registers the engine, limiter and bit-crusher processors.
/* eslint-disable @typescript-eslint/no-explicit-any */
import { Engine, EngineMessage, Limiter } from './engine';

declare const sampleRate: number;
declare const currentFrame: number;
declare function registerProcessor(name: string, ctor: any): void;
declare class AudioWorkletProcessor {
  readonly port: MessagePort;
  constructor(options?: any);
}

class EngineProcessor extends AudioWorkletProcessor {
  engine: Engine;
  private loadAcc = 0;
  private loadFrames = 0;
  private alive = true;

  constructor(options: any) {
    super(options);
    this.engine = new Engine(sampleRate);
    // Positions are reported against the context clock (frame at the end of this block).
    this.engine.onReport = (r) => this.port.postMessage(r.type === 'pos' ? { ...r, frame: currentFrame + 128 } : r);
    const o = options?.processorOptions;
    if (o) {
      // Offline rendering gets everything up front (messages may arrive too late).
      for (const m of (o.init ?? []) as EngineMessage[]) this.engine.handle(m);
      if (o.loops) this.engine.loopsLeft = o.loops;
    }
    this.port.onmessage = (e: MessageEvent) => {
      const m = e.data as EngineMessage | { type: 'dispose' };
      if (m.type === 'dispose') { this.alive = false; return; }
      this.engine.handle(m as EngineMessage);
    };
  }

  process(_inputs: Float32Array[][], outputs: Float32Array[][]): boolean {
    const t0 = Date.now();
    const music = outputs[0];
    const L = music[0];
    const R = music[1] ?? music[0];
    const click = outputs[1]?.[0] ?? null;
    const pump = outputs[2]?.[0] ?? null;
    this.engine.process(L, R, click, pump);
    if (R !== L && music.length === 1) for (let i = 0; i < L.length; i++) L[i] = (L[i] + R[i]) * 0.5;
    // Rough CPU load estimate (ms resolution, averaged over ~0.5 s).
    this.loadAcc += Date.now() - t0;
    this.loadFrames += L.length;
    if (this.loadFrames >= sampleRate * 0.5) {
      const load = this.loadAcc / ((this.loadFrames / sampleRate) * 1000);
      this.port.postMessage({ type: 'load', load, voices: this.engine.voiceCount() });
      this.loadAcc = 0;
      this.loadFrames = 0;
    }
    return this.alive;
  }
}

class LimiterProcessor extends AudioWorkletProcessor {
  lim: Limiter;
  private frames = 0;
  private zero = new Float32Array(128);
  private spare = new Float32Array(128);
  constructor(options: any) {
    super(options);
    this.lim = new Limiter(sampleRate, options?.processorOptions?.lookaheadMs ?? 4);
  }
  process(inputs: Float32Array[][], outputs: Float32Array[][]): boolean {
    const inp = inputs[0];
    const out = outputs[0];
    const n = out[0].length;
    if (this.zero.length !== n) { this.zero = new Float32Array(n); this.spare = new Float32Array(n); }
    const inL = inp && inp[0] ? inp[0] : this.zero;
    const inR = inp && inp[1] ? inp[1] : inL;
    this.lim.process(inL, inR, out[0], out[1] ?? this.spare);
    this.frames += n;
    if (this.frames >= sampleRate * 0.08) {
      this.frames = 0;
      this.port.postMessage({ type: 'meter', ...this.lim.meters() });
    }
    return true;
  }
}

/** Bit depth + sample-rate reduction (Lo-Fi). */
class CrusherProcessor extends AudioWorkletProcessor {
  static get parameterDescriptors() {
    return [
      { name: 'bits', defaultValue: 8, minValue: 1, maxValue: 16, automationRate: 'k-rate' },
      { name: 'down', defaultValue: 4, minValue: 1, maxValue: 50, automationRate: 'k-rate' },
    ];
  }
  private hold = [0, 0];
  private cnt = 0;
  process(inputs: Float32Array[][], outputs: Float32Array[][], params: Record<string, Float32Array>): boolean {
    const inp = inputs[0];
    const out = outputs[0];
    if (!inp || !inp.length) { for (const ch of out) ch.fill(0); return true; }
    const bits = params.bits[0];
    const down = Math.max(1, params.down[0]);
    const steps = Math.pow(2, bits - 1);
    for (let i = 0; i < out[0].length; i++) {
      if (this.cnt <= 0) {
        this.cnt += down;
        for (let c = 0; c < out.length; c++) {
          const x = (inp[c] ?? inp[0])[i];
          this.hold[c] = Math.round(x * steps) / steps;
        }
      }
      this.cnt -= 1;
      for (let c = 0; c < out.length; c++) out[c][i] = this.hold[c] ?? 0;
    }
    return true;
  }
}

registerProcessor('hm-engine', EngineProcessor);
registerProcessor('hm-limiter', LimiterProcessor);
registerProcessor('hm-crusher', CrusherProcessor);
