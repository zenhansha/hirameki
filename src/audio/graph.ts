// Builds the audio graph (shared by live playback and WAV export):
// engine(worklet) → FX chain → pump gain → master → limiter(worklet) → out
//               ↘ metronome click ───────↗
import workletUrl from './worklet/processors.ts?worker&url';
import type { EngineMessage } from './worklet/engine';
import { FxChainRuntime } from './fx/nodes';

const loaded = new WeakSet<BaseAudioContext>();

export async function ensureWorklets(ctx: BaseAudioContext): Promise<void> {
  if (loaded.has(ctx)) return;
  if (!ctx.audioWorklet) throw new Error('NO_WORKLET');
  try {
    await ctx.audioWorklet.addModule(workletUrl);
  } catch (e) {
    // Offline: some browsers don't route worklet loads through the service worker,
    // but a normal fetch is served from the cache — load it as a blob instead.
    const res = await fetch(workletUrl).catch(() => null);
    if (!res || !res.ok) throw e;
    const blob = URL.createObjectURL(new Blob([await res.text()], { type: 'application/javascript' }));
    await ctx.audioWorklet.addModule(blob);
    URL.revokeObjectURL(blob);
  }
  loaded.add(ctx);
}

export interface GraphOptions {
  light: boolean;
  /** Messages handled synchronously at construction (offline rendering). */
  init?: EngineMessage[];
  /** Offline: number of loop passes before stopping. */
  loops?: number;
}

export class AudioGraph {
  readonly ctx: BaseAudioContext;
  readonly engine: AudioWorkletNode;
  readonly fx: FxChainRuntime;
  readonly pump: GainNode;
  readonly click: GainNode;
  readonly master: GainNode;
  readonly limiter: AudioWorkletNode;
  readonly out: AudioNode;

  constructor(ctx: BaseAudioContext, opts: GraphOptions) {
    this.ctx = ctx;
    this.engine = new AudioWorkletNode(ctx, 'hm-engine', {
      numberOfInputs: 0,
      numberOfOutputs: 3,
      outputChannelCount: [2, 1, 1],
      processorOptions: { init: opts.init ?? [], loops: opts.loops ?? 0 },
    });
    this.fx = new FxChainRuntime(ctx, { light: opts.light });
    this.pump = ctx.createGain();
    this.pump.gain.value = 0; // driven entirely by the engine's pump signal
    this.click = ctx.createGain();
    this.click.gain.value = 0.8;
    this.master = ctx.createGain();
    this.limiter = new AudioWorkletNode(ctx, 'hm-limiter', {
      numberOfInputs: 1, numberOfOutputs: 1, outputChannelCount: [2], processorOptions: { lookaheadMs: 4 },
    });
    this.engine.connect(this.fx.input, 0);
    this.fx.output.connect(this.pump);
    this.engine.connect(this.pump.gain, 2);
    this.engine.connect(this.click, 1);
    this.pump.connect(this.master);
    this.click.connect(this.master);
    this.master.connect(this.limiter);
    this.out = this.limiter;
  }

  post(m: EngineMessage, transfer?: Transferable[]) {
    this.engine.port.postMessage(m, transfer ?? []);
  }

  dispose() {
    try { this.engine.port.postMessage({ type: 'dispose' }); } catch { /* */ }
    for (const n of [this.engine, this.pump, this.click, this.master, this.limiter]) try { n.disconnect(); } catch { /* */ }
    this.fx.dispose();
  }
}
