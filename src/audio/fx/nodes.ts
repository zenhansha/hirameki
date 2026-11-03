// Web Audio implementations of the effects. Each effect is a small sub-graph with dry/wet.
import { FX_DEF_MAP, FxItem, FxType } from './defs';
import { DIVS, PPQ } from '../../seq/time';

export interface FxRuntimeOptions {
  light: boolean;
}

const RAMP = 0.02;

function setParam(p: AudioParam, v: number, ctx: BaseAudioContext, tc = RAMP) {
  if (!isFinite(v)) return;
  try {
    p.setTargetAtTime(v, ctx.currentTime, tc);
  } catch {
    p.value = v;
  }
}

function divSeconds(div: string, bpm: number): number {
  return ((DIVS[div] ?? PPQ) / PPQ) * (60 / bpm);
}

// ---- distortion curves (pure, calibrated for equal loudness) ----

export function shapeSample(mode: string, drive: number, x: number): number {
  const k = 1 + drive * 24;
  switch (mode) {
    case 'hard': {
      const y = x * (1 + drive * 30);
      return y > 1 ? 1 : y < -1 ? -1 : y;
    }
    case 'tube': {
      // Asymmetric soft clip (even harmonics), DC is removed by a high-pass after.
      const y = x >= 0 ? Math.tanh(k * x) : Math.tanh(k * 0.62 * x) / 0.85;
      return y / Math.tanh(k);
    }
    default:
      return Math.tanh(k * x) / Math.tanh(k);
  }
}

/** Gain that keeps the loudness of a typical signal about the same after shaping. */
export function shapeCompensation(mode: string, drive: number): number {
  let si = 0, so = 0;
  for (let i = 0; i < 2048; i++) {
    const x = 0.3 * Math.sin((2 * Math.PI * i * 3) / 2048) + 0.15 * Math.sin((2 * Math.PI * i * 7) / 2048);
    const y = shapeSample(mode, drive, x);
    si += x * x;
    so += y * y;
  }
  return Math.sqrt(si / Math.max(1e-9, so));
}

function makeCurve(mode: string, drive: number): Float32Array {
  const n = 2048;
  const c = new Float32Array(n);
  for (let i = 0; i < n; i++) c[i] = shapeSample(mode, drive, (i / (n - 1)) * 2 - 1);
  return c;
}

// ---- reverb impulse response ----

export function makeImpulse(ctx: BaseAudioContext, size: number, decay: number, light: boolean): AudioBuffer {
  const sr = ctx.sampleRate;
  const len = Math.max(0.2, Math.min(light ? 3 : 9, decay * 1.25 + 0.1));
  const n = Math.floor(len * sr);
  const buf = ctx.createBuffer(2, n, sr);
  const attack = Math.max(0.002, size * 0.03);
  let seed = 1234567;
  const rnd = () => {
    seed ^= seed << 13; seed ^= seed >>> 17; seed ^= seed << 5;
    return ((seed >>> 0) / 4294967296) * 2 - 1;
  };
  for (let ch = 0; ch < 2; ch++) {
    const d = buf.getChannelData(ch);
    let lp = 0;
    let energy = 0;
    for (let i = 0; i < n; i++) {
      const t = i / sr;
      const env = Math.exp((-6.9 * t) / decay) * (t < attack ? t / attack : 1);
      // High frequencies die faster: the low-pass closes over time.
      const a = 0.85 - 0.65 * Math.min(1, t / Math.max(0.3, decay));
      lp += a * (rnd() - lp);
      const x = lp * env;
      d[i] = x;
      energy += x * x;
    }
    // A few early reflections, decorrelated between channels.
    const taps = 6;
    for (let k = 0; k < taps; k++) {
      const t = (0.004 + size * 0.06) * ((k + 1) / taps) * (1 + 0.13 * (ch ? 1 : -1) * ((k % 3) - 1));
      const idx = Math.floor(t * sr);
      if (idx < n) d[idx] += (0.5 / (k + 1.5)) * (k % 2 ? -1 : 1) * Math.sqrt(energy / n) * 30;
    }
    let e2 = 0;
    for (let i = 0; i < n; i++) e2 += d[i] * d[i];
    const g = 0.75 / Math.sqrt(Math.max(1e-12, e2));
    for (let i = 0; i < n; i++) d[i] *= g;
  }
  return buf;
}

// ---- effect runtime --------------------------------------------------------

export abstract class FxNode {
  readonly input: GainNode;
  readonly output: GainNode;
  protected dry: GainNode;
  protected wet: GainNode;
  protected ctx: BaseAudioContext;
  protected opts: FxRuntimeOptions;
  type: FxType;
  private lastKey = '';

  constructor(ctx: BaseAudioContext, type: FxType, opts: FxRuntimeOptions) {
    this.ctx = ctx;
    this.type = type;
    this.opts = opts;
    this.input = ctx.createGain();
    this.output = ctx.createGain();
    this.dry = ctx.createGain();
    this.wet = ctx.createGain();
    this.input.connect(this.dry).connect(this.output);
    this.wet.connect(this.output);
  }

  /** Connect the effect core between `input` and `wet`. */
  protected abstract build(): void;
  protected abstract apply(item: FxItem, bpm: number, first: boolean): void;

  init(item: FxItem, bpm: number) {
    this.build();
    this.update(item, bpm, true);
  }

  update(item: FxItem, bpm: number, first = false) {
    const key = JSON.stringify([item.on, item.mix, item.p, bpm]);
    if (key === this.lastKey) return;
    this.lastKey = key;
    const def = FX_DEF_MAP[this.type];
    const mix = item.on ? item.mix : 0;
    let d: number, w: number;
    if (def.send) {
      d = Math.cos((mix * Math.PI) / 2);
      w = Math.sin((mix * Math.PI) / 2);
    } else {
      d = 1 - mix;
      w = mix;
    }
    if (first) { this.dry.gain.value = d; this.wet.gain.value = w; } else { setParam(this.dry.gain, d, this.ctx); setParam(this.wet.gain, w, this.ctx); }
    this.apply(item, bpm, first);
  }

  dispose() {
    try { this.input.disconnect(); this.output.disconnect(); this.dry.disconnect(); this.wet.disconnect(); } catch { /* already gone */ }
    this.disposeCore();
  }

  protected disposeCore() {}
}

class Reverb extends FxNode {
  private locut!: BiquadFilterNode;
  private pre!: DelayNode;
  private convs: ConvolverNode[] = [];
  private convGains: GainNode[] = [];
  private active = 0;
  private hicut!: BiquadFilterNode;
  private irKey = '';
  private timer: ReturnType<typeof setTimeout> | null = null;

  protected build() {
    const c = this.ctx;
    this.locut = c.createBiquadFilter();
    this.locut.type = 'highpass';
    this.pre = c.createDelay(0.5);
    this.hicut = c.createBiquadFilter();
    this.hicut.type = 'lowpass';
    this.input.connect(this.locut).connect(this.pre);
    for (let i = 0; i < 2; i++) {
      const cv = c.createConvolver();
      cv.normalize = false;
      const g = c.createGain();
      g.gain.value = i === 0 ? 1 : 0;
      this.pre.connect(cv).connect(g).connect(this.hicut);
      this.convs.push(cv);
      this.convGains.push(g);
    }
    this.hicut.connect(this.wet);
  }

  protected apply(item: FxItem, _bpm: number, first: boolean) {
    const p = item.p;
    setParam(this.locut.frequency, Number(p.locut), this.ctx);
    setParam(this.hicut.frequency, Number(p.hicut), this.ctx);
    setParam(this.pre.delayTime, Number(p.predelay), this.ctx);
    const key = `${Number(p.size).toFixed(3)}|${Number(p.decay).toFixed(3)}|${this.opts.light}`;
    if (key === this.irKey) return;
    this.irKey = key;
    const make = () => {
      const buf = makeImpulse(this.ctx, Number(p.size), Number(p.decay), this.opts.light);
      if (first) {
        this.convs[0].buffer = buf;
        return;
      }
      // Crossfade to a fresh convolver so changing the size never clicks.
      const next = 1 - this.active;
      this.convs[next].buffer = buf;
      setParam(this.convGains[next].gain, 1, this.ctx, 0.04);
      setParam(this.convGains[this.active].gain, 0, this.ctx, 0.04);
      this.active = next;
    };
    if (first) make();
    else {
      if (this.timer) clearTimeout(this.timer);
      this.timer = setTimeout(make, 120);
    }
  }

  protected disposeCore() {
    if (this.timer) clearTimeout(this.timer);
    for (const n of [this.locut, this.pre, this.hicut, ...this.convs, ...this.convGains]) try { n.disconnect(); } catch { /* */ }
  }
}

class Delay extends FxNode {
  private nodes: AudioNode[] = [];
  private dL!: DelayNode; private dR!: DelayNode;
  private lpL!: BiquadFilterNode; private lpR!: BiquadFilterNode;
  private hp!: BiquadFilterNode;
  private inL!: GainNode; private inR!: GainNode; private inRL!: GainNode;
  private fLL!: GainNode; private fRR!: GainNode; private fLR!: GainNode; private fRL!: GainNode;

  protected build() {
    const c = this.ctx;
    const split = c.createChannelSplitter(2);
    const merge = c.createChannelMerger(2);
    this.hp = c.createBiquadFilter(); this.hp.type = 'highpass';
    this.dL = c.createDelay(4); this.dR = c.createDelay(4);
    this.lpL = c.createBiquadFilter(); this.lpL.type = 'lowpass';
    this.lpR = c.createBiquadFilter(); this.lpR.type = 'lowpass';
    this.inL = c.createGain(); this.inR = c.createGain(); this.inRL = c.createGain();
    this.fLL = c.createGain(); this.fRR = c.createGain(); this.fLR = c.createGain(); this.fRL = c.createGain();
    this.input.connect(this.hp).connect(split);
    split.connect(this.inL, 0); split.connect(this.inR, 1); split.connect(this.inRL, 1);
    this.inL.connect(this.dL); this.inRL.connect(this.dL); this.inR.connect(this.dR);
    this.dL.connect(this.lpL); this.dR.connect(this.lpR);
    this.lpL.connect(this.fLL).connect(this.dL);
    this.lpR.connect(this.fRR).connect(this.dR);
    this.lpL.connect(this.fLR).connect(this.dR);
    this.lpR.connect(this.fRL).connect(this.dL);
    this.lpL.connect(merge, 0, 0);
    this.lpR.connect(merge, 0, 1);
    merge.connect(this.wet);
    this.nodes = [split, merge, this.hp, this.dL, this.dR, this.lpL, this.lpR, this.inL, this.inR, this.inRL, this.fLL, this.fRR, this.fLR, this.fRL];
  }

  protected apply(item: FxItem, bpm: number) {
    const p = item.p;
    const t = Math.min(3.9, divSeconds(String(p.div), bpm));
    setParam(this.dL.delayTime, t, this.ctx, 0.05);
    setParam(this.dR.delayTime, t, this.ctx, 0.05);
    const fb = Math.min(0.9, Math.max(0, Number(p.fb)));
    const ping = !!p.ping;
    setParam(this.lpL.frequency, Number(p.tone), this.ctx);
    setParam(this.lpR.frequency, Number(p.tone), this.ctx);
    setParam(this.hp.frequency, Number(p.locut), this.ctx);
    setParam(this.inL.gain, ping ? 0.7 : 1, this.ctx);
    setParam(this.inRL.gain, ping ? 0.7 : 0, this.ctx);
    setParam(this.inR.gain, ping ? 0 : 1, this.ctx);
    setParam(this.fLL.gain, ping ? 0 : fb, this.ctx);
    setParam(this.fRR.gain, ping ? 0 : fb, this.ctx);
    setParam(this.fLR.gain, ping ? fb : 0, this.ctx);
    setParam(this.fRL.gain, ping ? fb : 0, this.ctx);
  }

  protected disposeCore() {
    for (const n of this.nodes) try { n.disconnect(); } catch { /* */ }
  }
}

/** Chorus and flanger share the modulated-delay core. */
class ModDelay extends FxNode {
  private nodes: AudioNode[] = [];
  private osc!: OscillatorNode;
  private dL!: DelayNode; private dR!: DelayNode;
  private mL!: GainNode; private mR!: GainNode;
  private fbL!: GainNode; private fbR!: GainNode;

  protected build() {
    const c = this.ctx;
    const split = c.createChannelSplitter(2);
    const merge = c.createChannelMerger(2);
    this.dL = c.createDelay(0.1); this.dR = c.createDelay(0.1);
    this.osc = c.createOscillator();
    this.osc.type = this.type === 'flanger' ? 'triangle' : 'sine';
    this.mL = c.createGain(); this.mR = c.createGain();
    this.fbL = c.createGain(); this.fbR = c.createGain();
    this.osc.connect(this.mL).connect(this.dL.delayTime);
    this.osc.connect(this.mR).connect(this.dR.delayTime);
    this.input.connect(split);
    split.connect(this.dL, 0); split.connect(this.dR, 1);
    this.dL.connect(this.fbL).connect(this.dL);
    this.dR.connect(this.fbR).connect(this.dR);
    this.dL.connect(merge, 0, 0); this.dR.connect(merge, 0, 1);
    merge.connect(this.wet);
    this.osc.start();
    this.nodes = [split, merge, this.dL, this.dR, this.mL, this.mR, this.fbL, this.fbR];
  }

  protected apply(item: FxItem) {
    const p = item.p;
    const base = Number(p.delay);
    const depth = Number(p.depth);
    const amt = this.type === 'flanger' ? base * 0.9 * depth : 0.004 * depth;
    setParam(this.dL.delayTime, base, this.ctx, 0.05);
    setParam(this.dR.delayTime, base, this.ctx, 0.05);
    setParam(this.mL.gain, amt, this.ctx);
    setParam(this.mR.gain, -amt, this.ctx);
    setParam(this.osc.frequency, Number(p.rate), this.ctx);
    const fb = this.type === 'flanger' ? Math.max(-0.9, Math.min(0.9, Number(p.fb))) : 0;
    setParam(this.fbL.gain, fb, this.ctx);
    setParam(this.fbR.gain, fb, this.ctx);
  }

  protected disposeCore() {
    try { this.osc.stop(); } catch { /* */ }
    for (const n of [...this.nodes, this.osc]) try { n.disconnect(); } catch { /* */ }
  }
}

class Phaser extends FxNode {
  private nodes: AudioNode[] = [];
  private osc!: OscillatorNode;
  private chains: BiquadFilterNode[][] = [];
  private mods: GainNode[] = [];
  private stageCount = 0;
  private split!: ChannelSplitterNode;
  private merge!: ChannelMergerNode;

  protected build() {
    const c = this.ctx;
    this.split = c.createChannelSplitter(2);
    this.merge = c.createChannelMerger(2);
    this.osc = c.createOscillator();
    this.osc.type = 'sine';
    this.osc.start();
    this.input.connect(this.split);
    this.merge.connect(this.wet);
    this.nodes = [this.split, this.merge];
  }

  private rebuild(stages: number) {
    for (const ch of this.chains) for (const f of ch) try { f.disconnect(); } catch { /* */ }
    for (const m of this.mods) try { m.disconnect(); } catch { /* */ }
    try { this.split.disconnect(); } catch { /* */ }
    this.chains = [];
    this.mods = [];
    const c = this.ctx;
    for (let ch = 0; ch < 2; ch++) {
      const m = c.createGain();
      this.osc.connect(m);
      const chain: BiquadFilterNode[] = [];
      let prev: AudioNode | null = null;
      for (let s = 0; s < stages; s++) {
        const f = c.createBiquadFilter();
        f.type = 'allpass';
        f.Q.value = 0.6;
        m.connect(f.detune);
        if (prev) prev.connect(f); else this.split.connect(f, ch);
        prev = f;
        chain.push(f);
      }
      prev!.connect(this.merge, 0, ch);
      this.chains.push(chain);
      this.mods.push(m);
    }
    this.stageCount = stages;
  }

  protected apply(item: FxItem) {
    const p = item.p;
    let stages = Number(p.stages) || 6;
    if (this.opts.light) stages = Math.min(stages, 4);
    if (stages !== this.stageCount) this.rebuild(stages);
    setParam(this.osc.frequency, Number(p.rate), this.ctx);
    const cents = 2400 * Number(p.depth);
    this.mods[0] && setParam(this.mods[0].gain, cents, this.ctx);
    this.mods[1] && setParam(this.mods[1].gain, -cents, this.ctx);
    for (const ch of this.chains) for (let i = 0; i < ch.length; i++) setParam(ch[i].frequency, Number(p.freq) * (1 + i * 0.35), this.ctx);
  }

  protected disposeCore() {
    try { this.osc.stop(); } catch { /* */ }
    for (const ch of this.chains) for (const f of ch) try { f.disconnect(); } catch { /* */ }
    for (const n of [...this.nodes, ...this.mods, this.osc]) try { n.disconnect(); } catch { /* */ }
  }
}

class Distortion extends FxNode {
  private shaper!: WaveShaperNode;
  private pathShape!: GainNode;
  private pathCrush!: GainNode;
  private crusher: AudioWorkletNode | null = null;
  private tone!: BiquadFilterNode;
  private dc!: BiquadFilterNode;
  private post!: GainNode;
  private curveKey = '';

  protected build() {
    const c = this.ctx;
    this.shaper = c.createWaveShaper();
    this.shaper.oversample = this.opts.light ? '2x' : '4x';
    this.pathShape = c.createGain();
    this.pathCrush = c.createGain();
    this.tone = c.createBiquadFilter(); this.tone.type = 'lowpass';
    this.dc = c.createBiquadFilter(); this.dc.type = 'highpass'; this.dc.frequency.value = 20;
    this.post = c.createGain();
    this.input.connect(this.pathShape).connect(this.shaper).connect(this.dc);
    try {
      this.crusher = new AudioWorkletNode(c, 'hm-crusher', { numberOfInputs: 1, numberOfOutputs: 1, outputChannelCount: [2] });
      this.input.connect(this.pathCrush).connect(this.crusher).connect(this.dc);
    } catch {
      this.crusher = null;
    }
    this.dc.connect(this.tone).connect(this.post).connect(this.wet);
  }

  protected apply(item: FxItem, _bpm: number, first: boolean) {
    const p = item.p;
    const mode = String(p.mode);
    const drive = Number(p.drive);
    const crush = mode === 'crush' && !!this.crusher;
    setParam(this.pathShape.gain, crush ? 0 : 1, this.ctx);
    setParam(this.pathCrush.gain, crush ? 1 + drive * 1.5 : 0, this.ctx);
    if (!crush) {
      const key = mode + drive.toFixed(3);
      if (key !== this.curveKey) {
        this.curveKey = key;
        this.shaper.curve = makeCurve(mode, drive) as Float32Array<ArrayBuffer>;
      }
      setParam(this.post.gain, shapeCompensation(mode, drive), this.ctx);
    } else if (this.crusher) {
      const bits = this.crusher.parameters.get('bits');
      const down = this.crusher.parameters.get('down');
      if (bits) setParam(bits, Number(p.bits), this.ctx, 0.01);
      if (down) setParam(down, Number(p.down), this.ctx, 0.01);
      setParam(this.post.gain, 1 / (1 + drive * 1.5), this.ctx);
    }
    setParam(this.tone.frequency, Number(p.tone), this.ctx);
    void first;
  }

  protected disposeCore() {
    for (const n of [this.shaper, this.pathShape, this.pathCrush, this.tone, this.dc, this.post, this.crusher]) try { n?.disconnect(); } catch { /* */ }
  }
}

class EQ extends FxNode {
  private lo!: BiquadFilterNode; private mid!: BiquadFilterNode; private hi!: BiquadFilterNode;
  protected build() {
    const c = this.ctx;
    this.lo = c.createBiquadFilter(); this.lo.type = 'lowshelf'; this.lo.frequency.value = 150;
    this.mid = c.createBiquadFilter(); this.mid.type = 'peaking'; this.mid.Q.value = 0.9;
    this.hi = c.createBiquadFilter(); this.hi.type = 'highshelf'; this.hi.frequency.value = 6500;
    this.input.connect(this.lo).connect(this.mid).connect(this.hi).connect(this.wet);
  }
  protected apply(item: FxItem) {
    setParam(this.lo.gain, Number(item.p.low), this.ctx);
    setParam(this.mid.gain, Number(item.p.mid), this.ctx);
    setParam(this.mid.frequency, Number(item.p.midf), this.ctx);
    setParam(this.hi.gain, Number(item.p.high), this.ctx);
  }
  protected disposeCore() { for (const n of [this.lo, this.mid, this.hi]) try { n.disconnect(); } catch { /* */ } }
}

class Filter extends FxNode {
  private f!: BiquadFilterNode;
  private osc!: OscillatorNode;
  private lfo!: GainNode;
  protected build() {
    const c = this.ctx;
    this.f = c.createBiquadFilter();
    this.osc = c.createOscillator();
    this.osc.type = 'sine';
    this.lfo = c.createGain();
    this.lfo.gain.value = 0;
    this.osc.connect(this.lfo).connect(this.f.detune);
    this.osc.start();
    this.input.connect(this.f).connect(this.wet);
  }
  protected apply(item: FxItem, bpm: number) {
    const p = item.p;
    const mode = String(p.mode);
    this.f.type = mode === 'hp' ? 'highpass' : mode === 'bp' ? 'bandpass' : 'lowpass';
    const res = Number(p.res);
    setParam(this.f.Q, mode === 'bp' ? 0.7 + res * 8 : 0.6 + res * 14, this.ctx);
    setParam(this.f.frequency, Number(p.cutoff), this.ctx);
    setParam(this.lfo.gain, Number(p.lfo) * 1800, this.ctx);
    setParam(this.osc.frequency, 1 / divSeconds(String(p.rate), bpm), this.ctx);
  }
  protected disposeCore() {
    try { this.osc.stop(); } catch { /* */ }
    for (const n of [this.f, this.osc, this.lfo]) try { n.disconnect(); } catch { /* */ }
  }
}

class Compressor extends FxNode {
  private comp!: DynamicsCompressorNode;
  private makeup!: GainNode;
  protected build() {
    this.comp = this.ctx.createDynamicsCompressor();
    this.comp.knee.value = 6;
    this.makeup = this.ctx.createGain();
    this.input.connect(this.comp).connect(this.makeup).connect(this.wet);
  }
  protected apply(item: FxItem) {
    const p = item.p;
    setParam(this.comp.threshold, Number(p.threshold), this.ctx);
    setParam(this.comp.ratio, Number(p.ratio), this.ctx);
    setParam(this.comp.attack, Number(p.attack), this.ctx);
    setParam(this.comp.release, Number(p.release), this.ctx);
    setParam(this.makeup.gain, Math.pow(10, Number(p.makeup) / 20), this.ctx);
  }
  protected disposeCore() { for (const n of [this.comp, this.makeup]) try { n.disconnect(); } catch { /* */ } }
}

class Width extends FxNode {
  private nodes: AudioNode[] = [];
  private gLL!: GainNode; private gLR!: GainNode; private gRR!: GainNode; private gRL!: GainNode;
  protected build() {
    const c = this.ctx;
    const split = c.createChannelSplitter(2);
    const merge = c.createChannelMerger(2);
    this.gLL = c.createGain(); this.gLR = c.createGain(); this.gRR = c.createGain(); this.gRL = c.createGain();
    this.input.connect(split);
    split.connect(this.gLL, 0); split.connect(this.gLR, 0);
    split.connect(this.gRR, 1); split.connect(this.gRL, 1);
    this.gLL.connect(merge, 0, 0); this.gRL.connect(merge, 0, 0);
    this.gRR.connect(merge, 0, 1); this.gLR.connect(merge, 0, 1);
    merge.connect(this.wet);
    this.nodes = [split, merge, this.gLL, this.gLR, this.gRR, this.gRL];
  }
  protected apply(item: FxItem) {
    const w = Number(item.p.width);
    // L' = M + wS, R' = M − wS with M = (L+R)/2, S = (L−R)/2. Wide settings are scaled to keep peaks sane.
    const norm = w > 1 ? 1 / (0.5 + 0.5 * w) : 1;
    const a = (0.5 + 0.5 * w) * norm, b = (0.5 - 0.5 * w) * norm;
    setParam(this.gLL.gain, a, this.ctx); setParam(this.gRR.gain, a, this.ctx);
    setParam(this.gLR.gain, b, this.ctx); setParam(this.gRL.gain, b, this.ctx);
  }
  protected disposeCore() { for (const n of this.nodes) try { n.disconnect(); } catch { /* */ } }
}

export function createFx(ctx: BaseAudioContext, item: FxItem, bpm: number, opts: FxRuntimeOptions): FxNode {
  let n: FxNode;
  switch (item.type) {
    case 'reverb': n = new Reverb(ctx, 'reverb', opts); break;
    case 'delay': n = new Delay(ctx, 'delay', opts); break;
    case 'chorus': n = new ModDelay(ctx, 'chorus', opts); break;
    case 'flanger': n = new ModDelay(ctx, 'flanger', opts); break;
    case 'phaser': n = new Phaser(ctx, 'phaser', opts); break;
    case 'distortion': n = new Distortion(ctx, 'distortion', opts); break;
    case 'eq': n = new EQ(ctx, 'eq', opts); break;
    case 'filter': n = new Filter(ctx, 'filter', opts); break;
    case 'compressor': n = new Compressor(ctx, 'compressor', opts); break;
    case 'width': n = new Width(ctx, 'width', opts); break;
  }
  n.init(item, bpm);
  return n;
}

/** The whole chain: input → fx1 → fx2 … → output. Reconnects smoothly when the order changes. */
export class FxChainRuntime {
  readonly input: GainNode;
  readonly output: GainNode;
  private ctx: BaseAudioContext;
  private nodes = new Map<string, FxNode>();
  private order: string[] = [];
  opts: FxRuntimeOptions;
  private pendingWire: ReturnType<typeof setTimeout> | null = null;

  constructor(ctx: BaseAudioContext, opts: FxRuntimeOptions) {
    this.ctx = ctx;
    this.opts = opts;
    this.input = ctx.createGain();
    this.output = ctx.createGain();
    this.input.connect(this.output);
  }

  set(items: FxItem[], bpm: number, immediate = false) {
    const ids = items.map((i) => i.id);
    // Remove deleted / retyped.
    for (const [id, node] of this.nodes) {
      const it = items.find((i) => i.id === id);
      if (!it || it.type !== node.type) {
        node.dispose();
        this.nodes.delete(id);
      }
    }
    let rewire = false;
    for (const it of items) {
      const node = this.nodes.get(it.id);
      if (node) node.update(it, bpm);
      else {
        this.nodes.set(it.id, createFx(this.ctx, it, bpm, this.opts));
        rewire = true;
      }
    }
    if (rewire || ids.join() !== this.order.join()) {
      this.order = ids;
      this.rewire(immediate);
    }
  }

  private rewire(immediate: boolean) {
    const doWire = () => {
      try { this.input.disconnect(); } catch { /* */ }
      for (const id of this.order) try { this.nodes.get(id)!.output.disconnect(); } catch { /* */ }
      let prev: AudioNode = this.input;
      for (const id of this.order) {
        const n = this.nodes.get(id)!;
        prev.connect(n.input);
        prev = n.output;
      }
      prev.connect(this.output);
    };
    if (immediate) { doWire(); return; }
    // Duck the output for a moment so reconnecting never clicks.
    const now = this.ctx.currentTime;
    const g = this.output.gain;
    g.cancelScheduledValues(now);
    g.setValueAtTime(g.value, now);
    g.linearRampToValueAtTime(0, now + 0.012);
    if (this.pendingWire) clearTimeout(this.pendingWire);
    this.pendingWire = setTimeout(() => {
      doWire();
      const t = this.ctx.currentTime;
      g.cancelScheduledValues(t);
      g.setValueAtTime(0, t);
      g.linearRampToValueAtTime(1, t + 0.03);
    }, 20);
  }

  setLight(light: boolean, items: FxItem[], bpm: number) {
    if (this.opts.light === light) return;
    this.opts = { ...this.opts, light };
    // Rebuild everything with the new quality.
    for (const n of this.nodes.values()) n.dispose();
    this.nodes.clear();
    this.order = [];
    this.set(items, bpm);
  }

  dispose() {
    for (const n of this.nodes.values()) n.dispose();
    this.nodes.clear();
  }
}
