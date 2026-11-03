// Polyphonic wavetable synth voice engine. Pure TypeScript (no Web Audio types) so it runs
// both inside the AudioWorklet and in Node unit tests.
import {
  ENV_COUNT, LFO_COUNT, MOD_SOURCE_INDEX, OSC_COUNT, PARAMS, PARAM_INDEX, Patch, Quality, QUALITY_HIGH,
  fromNorm, toNorm,
} from '../params';
import type { WavetableData } from '../wavetables';
import { DIVS } from '../../seq/time';

const NP = PARAMS.length;
/** Per-voice output gain (presets are balanced against this). */
const VOICE_GAIN = 0.5;
const MAX_UNI = 8;
const NSRC = 10;
const I = PARAM_INDEX;
const OSC = [1, 2, 3].map((n) => ({
  level: I[`osc${n}.level`], pos: I[`osc${n}.pos`], oct: I[`osc${n}.oct`], semi: I[`osc${n}.semi`], fine: I[`osc${n}.fine`],
  pan: I[`osc${n}.pan`], uni: I[`osc${n}.uni`], detune: I[`osc${n}.detune`], spread: I[`osc${n}.spread`],
}));
const ENV = [1, 2, 3].map((n) => ({ a: I[`env${n}.a`], d: I[`env${n}.d`], s: I[`env${n}.s`], r: I[`env${n}.r`] }));
const LFO = [1, 2, 3].map((n) => ({ rate: I[`lfo${n}.rate`], phase: I[`lfo${n}.phase`], fade: I[`lfo${n}.fade`] }));
const P_NOISE = I['noise.level'], P_CUT = I['filter.cutoff'], P_RES = I['filter.res'], P_DRIVE = I['filter.drive'];
const P_KEY = I['filter.key'], P_AMP = I['amp.level'], P_VEL = I['amp.vel'], P_GLIDE = I['amp.glide'];

const FILTER_TYPES = ['lp12', 'lp24', 'hp12', 'bp12', 'notch'];
const LFO_SHAPES = ['sine', 'tri', 'saw', 'ramp', 'square', 'sh', 'smooth'];

/** Built-in sine table used until the real tables arrive. */
function fallbackTable(): WavetableData {
  const N = 2048;
  const data = new Float32Array(N + 1);
  for (let k = 0; k <= N; k++) data[k] = Math.sin((2 * Math.PI * k) / N) * 0.95;
  return { id: 'sine', frames: 1, levels: 1, size: N, harmonics: [1], data };
}
const FALLBACK = fallbackTable();

interface Compiled {
  base: Float64Array; // normalised
  real: Float64Array; // real values (unmodulated)
  routeSrc: Int32Array;
  routeDst: Int32Array;
  routeAmt: Float64Array;
  modded: Int32Array; // list of params that have routes
  oscOn: boolean[];
  tableIds: string[];
  rand: boolean[];
  filterOn: boolean;
  filterType: number;
  lfoShape: number[];
  lfoSync: boolean[];
  lfoDivTicks: number[];
  lfoRetrig: boolean[];
}

export function compilePatch(p: Patch): Compiled {
  const base = new Float64Array(NP);
  const real = new Float64Array(NP);
  PARAMS.forEach((def, i) => {
    const v = p.p[def.id] ?? def.def;
    real[i] = v;
    base[i] = toNorm(def, v);
  });
  const routes = p.mods.filter((m) => I[m.dst] !== undefined && m.src in MOD_SOURCE_INDEX);
  const modded = [...new Set(routes.map((r) => I[r.dst]))];
  const o = p.o;
  return {
    base, real,
    routeSrc: Int32Array.from(routes.map((r) => MOD_SOURCE_INDEX[r.src])),
    routeDst: Int32Array.from(routes.map((r) => I[r.dst])),
    routeAmt: Float64Array.from(routes.map((r) => r.amt)),
    modded: Int32Array.from(modded),
    oscOn: [o.osc1On, o.osc2On, o.osc3On],
    tableIds: [o.osc1Table, o.osc2Table, o.osc3Table],
    rand: [o.osc1Rand, o.osc2Rand, o.osc3Rand],
    filterOn: o.filterOn,
    filterType: Math.max(0, FILTER_TYPES.indexOf(o.filterType)),
    lfoShape: [o.lfo1Shape, o.lfo2Shape, o.lfo3Shape].map((s) => Math.max(0, LFO_SHAPES.indexOf(s))),
    lfoSync: [o.lfo1Sync, o.lfo2Sync, o.lfo3Sync],
    lfoDivTicks: [o.lfo1Div, o.lfo2Div, o.lfo3Div].map((d) => DIVS[d] ?? DIVS['1/4']),
    lfoRetrig: [o.lfo1Mode, o.lfo2Mode, o.lfo3Mode].map((m) => m === 'retrig'),
  };
}

// Envelope stages
const IDLE = 0, ATT = 1, DEC = 2, SUS = 3, REL = 4;

class Env {
  stage = IDLE;
  level = 0;
  inc = 0; // attack increment per sample
  dc = 0; // decay coefficient per sample
  rc = 0; // release coefficient per sample
  sus = 0;
  set(a: number, d: number, s: number, r: number, sr: number) {
    this.inc = 1 / Math.max(1, a * sr);
    this.dc = Math.exp(-5 / Math.max(1, d * sr));
    this.rc = Math.exp(-5 / Math.max(1, r * sr));
    this.sus = s;
  }
  trigger() { this.stage = ATT; }
  release() { if (this.stage !== IDLE) this.stage = REL; }
  /** Advance one sample. */
  tick(): number {
    switch (this.stage) {
      case ATT:
        this.level += this.inc;
        if (this.level >= 1) { this.level = 1; this.stage = DEC; }
        break;
      case DEC:
        this.level = this.sus + (this.level - this.sus) * this.dc;
        if (Math.abs(this.level - this.sus) < 1e-4) { this.level = this.sus; this.stage = SUS; }
        break;
      case SUS:
        this.level = this.sus;
        break;
      case REL:
        this.level *= this.rc;
        if (this.level < 1e-4) { this.level = 0; this.stage = IDLE; }
        break;
    }
    return this.level;
  }
  /** Advance n samples at once (control-rate envelopes). */
  advance(n: number): number {
    switch (this.stage) {
      case ATT:
        this.level += this.inc * n;
        if (this.level >= 1) { this.level = 1; this.stage = DEC; }
        break;
      case DEC:
        this.level = this.sus + (this.level - this.sus) * Math.pow(this.dc, n);
        if (Math.abs(this.level - this.sus) < 1e-4) { this.level = this.sus; this.stage = SUS; }
        break;
      case SUS:
        this.level = this.sus;
        break;
      case REL:
        this.level *= Math.pow(this.rc, n);
        if (this.level < 1e-4) { this.level = 0; this.stage = IDLE; }
        break;
    }
    return this.level;
  }
}

let noiseState = 0x12345678;
function noise(): number {
  noiseState ^= noiseState << 13; noiseState ^= noiseState >>> 17; noiseState ^= noiseState << 5;
  return ((noiseState >>> 0) / 4294967296) * 2 - 1;
}

function lfoShape(shape: number, ph: number, held: number, prevHeld: number): number {
  switch (shape) {
    case 0: return Math.sin(2 * Math.PI * ph);
    case 1: return 1 - 4 * Math.abs(ph - 0.5);
    case 2: return 1 - 2 * ph;
    case 3: return 2 * ph - 1;
    case 4: return ph < 0.5 ? 1 : -1;
    case 5: return held;
    case 6: { const t = 0.5 - 0.5 * Math.cos(Math.PI * ph); return prevHeld + (held - prevHeld) * t; }
  }
  return 0;
}

class Voice {
  active = false;
  id = -1;
  note = 60;
  vel = 0.8;
  age = 0;
  fast = false;
  env = [new Env(), new Env(), new Env()];
  phases = new Float64Array(OSC_COUNT * MAX_UNI);
  // Filter state (2 stages × stereo)
  a1 = 0; a2 = 0; b1 = 0; b2 = 0; c1 = 0; c2 = 0; d1 = 0; d2 = 0;
  lfoPh = new Float64Array(LFO_COUNT);
  lfoHeld = new Float64Array(LFO_COUNT);
  lfoPrev = new Float64Array(LFO_COUNT);
  lfoSmooth = new Float64Array(LFO_COUNT);
  rand = 0;
  time = 0; // samples since trigger
  pitch = 60; // current pitch for glide
  ampPrev = 0;
  attackCap = 1e9;
}

export interface TransportInfo {
  playing: boolean;
  /** Tick at the start of the block. */
  tick: number;
  /** Ticks per sample. */
  tps: number;
  bpm: number;
}

export class Synth {
  readonly sr: number;
  q: Quality = QUALITY_HIGH;
  maxVoices: number;
  voices: Voice[] = [];
  c: Compiled | null = null;
  tables = new Map<string, WavetableData>();
  mw = 0;
  private ageCounter = 0;
  private lastNote = -1;
  // Global LFO state
  private gPh = new Float64Array(LFO_COUNT);
  private gHeld = new Float64Array(LFO_COUNT);
  private gPrev = new Float64Array(LFO_COUNT);
  private gVals: Float64Array[] = [];
  private gSmooth = new Float64Array(LFO_COUNT);
  // Scratch
  private bufL = new Float32Array(256);
  private bufR = new Float32Array(256);
  private src = new Float64Array(NSRC);
  private val = new Float64Array(NP);
  private uInc = new Float64Array(MAX_UNI);
  private uGL = new Float64Array(MAX_UNI);
  private uGR = new Float64Array(MAX_UNI);
  /** Overall output gain of this synth part. */
  gain = 1;

  constructor(sr: number, maxVoices = 24) {
    this.sr = sr;
    this.maxVoices = maxVoices;
    this.resize();
    for (let l = 0; l < LFO_COUNT; l++) this.gVals.push(new Float64Array(17));
  }

  private resize() {
    const want = this.maxVoices + 6;
    while (this.voices.length < want) this.voices.push(new Voice());
  }

  setQuality(q: Quality, maxVoices?: number) {
    this.q = q;
    if (maxVoices) this.maxVoices = maxVoices;
    this.resize();
  }

  setPatch(p: Patch) {
    this.c = compilePatch(p);
    // Update envelopes of sounding voices to the new times.
    for (const v of this.voices) if (v.active) this.setEnvs(v);
  }

  addTable(t: WavetableData) {
    this.tables.set(t.id, t);
  }

  activeCount(): number {
    let n = 0;
    for (const v of this.voices) if (v.active && !v.fast) n++;
    return n;
  }

  private setEnvs(v: Voice) {
    const r = this.c!.real;
    for (let e = 0; e < ENV_COUNT; e++) {
      const E = ENV[e];
      // Short notes (arps, fast rhythms) get a shorter attack so slow pads still speak.
      const a = Math.min(r[E.a], v.attackCap);
      v.env[e].set(a, r[E.d], r[E.s], r[E.r], this.sr);
    }
    if (v.fast) v.env[0].rc = Math.exp(-5 / (0.004 * this.sr));
  }

  /** `dur` (seconds) is the planned note length when known; it caps the attack time. */
  noteOn(id: number, note: number, vel: number, dur = 0) {
    if (!this.c) return;
    let v = this.voices.find((x) => x.active && x.note === note && !x.fast);
    const fresh = !v;
    if (!v) {
      if (this.activeCount() >= this.maxVoices) {
        // Steal: prefer the quietest released voice, else the oldest.
        let victim: Voice | null = null;
        for (const x of this.voices) {
          if (!x.active || x.fast) continue;
          if (x.env[0].stage === REL) {
            if (!victim || victim.env[0].stage !== REL || x.env[0].level < victim.env[0].level) victim = x;
          } else if (!victim || (victim.env[0].stage !== REL && x.age < victim.age)) victim = x;
        }
        if (victim) { victim.fast = true; victim.env[0].stage = REL; this.setEnvs(victim); }
      }
      v = this.voices.find((x) => !x.active);
      if (!v) {
        // Every slot is busy fading out: reuse the quietest one.
        v = this.voices.reduce((a, b) => (b.env[0].level < a.env[0].level ? b : a));
      }
    }
    v.id = id;
    v.note = note;
    v.vel = vel;
    v.age = ++this.ageCounter;
    v.fast = false;
    v.attackCap = dur > 0 ? Math.max(0.003, dur * 0.4) : 1e9;
    if (fresh) {
      v.active = true;
      v.time = 0;
      v.a1 = v.a2 = v.b1 = v.b2 = v.c1 = v.c2 = v.d1 = v.d2 = 0;
      v.ampPrev = 0;
      for (let e = 0; e < ENV_COUNT; e++) { v.env[e].level = 0; }
      const c = this.c;
      for (let o = 0; o < OSC_COUNT; o++) {
        const rnd = c.rand[o];
        for (let k = 0; k < MAX_UNI; k++) v.phases[o * MAX_UNI + k] = rnd ? Math.random() : (k === 0 ? 0 : Math.random() * 0.02);
      }
      v.rand = Math.random() * 2 - 1;
      const glide = c.real[P_GLIDE];
      v.pitch = glide > 0 && this.lastNote >= 0 ? this.lastNote : note;
      for (let l = 0; l < LFO_COUNT; l++) {
        v.lfoPh[l] = c.real[LFO[l].phase];
        v.lfoHeld[l] = Math.random() * 2 - 1;
        v.lfoPrev[l] = v.lfoHeld[l];
        v.lfoSmooth[l] = 0;
      }
    } else {
      v.time = 0;
      for (let l = 0; l < LFO_COUNT; l++) if (this.c.lfoRetrig[l]) v.lfoPh[l] = this.c.real[LFO[l].phase];
    }
    this.setEnvs(v);
    for (let e = 0; e < ENV_COUNT; e++) v.env[e].trigger();
    this.lastNote = note;
  }

  noteOff(id: number) {
    for (const v of this.voices) if (v.active && v.id === id) for (const e of v.env) e.release();
  }

  noteOffByNote(note: number) {
    for (const v of this.voices) if (v.active && v.note === note) for (const e of v.env) e.release();
  }

  allNotesOff() {
    for (const v of this.voices) if (v.active) for (const e of v.env) e.release();
  }

  /** Immediately silence (with a few ms fade). */
  kill() {
    for (const v of this.voices) if (v.active) { v.fast = true; v.env[0].stage = REL; this.setEnvs(v); }
  }

  /** Global LFO values for the block, sampled every 16 frames. */
  prepareBlock(frames: number, tr: TransportInfo) {
    const c = this.c;
    if (!c) return;
    for (let l = 0; l < LFO_COUNT; l++) {
      const shape = c.lfoShape[l];
      const vals = this.gVals[l];
      const hz = c.lfoSync[l] ? (tr.bpm / 60) * (480 / c.lfoDivTicks[l]) : c.real[LFO[l].rate];
      const inc = hz / this.sr;
      for (let s = 0, i = 0; s <= frames; s += 16, i++) {
        let ph: number;
        if (c.lfoSync[l] && tr.playing) {
          const t = tr.tick + s * tr.tps;
          ph = t / c.lfoDivTicks[l] + c.real[LFO[l].phase];
          ph -= Math.floor(ph);
          if (ph < this.gPh[l] - 0.5) { this.gPrev[l] = this.gHeld[l]; this.gHeld[l] = noise(); }
          this.gPh[l] = ph;
        } else {
          if (i > 0) {
            this.gPh[l] += inc * 16;
            if (this.gPh[l] >= 1) { this.gPh[l] -= Math.floor(this.gPh[l]); this.gPrev[l] = this.gHeld[l]; this.gHeld[l] = noise(); }
          }
          ph = this.gPh[l];
        }
        let x = lfoShape(shape, ph, this.gHeld[l], this.gPrev[l]);
        if (shape === 4 || shape === 5) { this.gSmooth[l] += (x - this.gSmooth[l]) * 0.35; x = this.gSmooth[l]; }
        vals[Math.min(i, 16)] = x;
      }
    }
  }

  /** Render voices into out[L/R] for frames [s, e) of the current block. */
  render(outL: Float32Array, outR: Float32Array, s: number, e: number, tr: TransportInfo) {
    const c = this.c;
    if (!c || e <= s) return;
    const block = this.q.block;
    for (const v of this.voices) {
      if (!v.active) continue;
      let pos = s;
      while (pos < e && v.active) {
        const n = Math.min(block, e - pos);
        this.renderVoice(v, outL, outR, pos, n, tr);
        pos += n;
      }
    }
  }

  private renderVoice(v: Voice, outL: Float32Array, outR: Float32Array, off: number, n: number, tr: TransportInfo) {
    const c = this.c!;
    const sr = this.sr;
    const src = this.src;
    const val = this.val;
    // --- modulation sources (control rate)
    src[0] = v.env[0].level;
    src[1] = v.env[1].advance(n);
    src[2] = v.env[2].advance(n);
    const gi = Math.min(16, (off / 16) | 0);
    for (let l = 0; l < LFO_COUNT; l++) {
      let x: number;
      if (c.lfoRetrig[l]) {
        const hz = c.lfoSync[l] ? (tr.bpm / 60) * (480 / c.lfoDivTicks[l]) : c.real[LFO[l].rate];
        v.lfoPh[l] += (hz / sr) * n;
        if (v.lfoPh[l] >= 1) { v.lfoPh[l] -= Math.floor(v.lfoPh[l]); v.lfoPrev[l] = v.lfoHeld[l]; v.lfoHeld[l] = noise(); }
        x = lfoShape(c.lfoShape[l], v.lfoPh[l], v.lfoHeld[l], v.lfoPrev[l]);
        if (c.lfoShape[l] === 4 || c.lfoShape[l] === 5) { v.lfoSmooth[l] += (x - v.lfoSmooth[l]) * 0.35; x = v.lfoSmooth[l]; }
      } else x = this.gVals[l][gi];
      const fade = c.real[LFO[l].fade];
      if (fade > 0) x *= Math.min(1, v.time / (fade * sr));
      src[3 + l] = x;
    }
    src[6] = v.vel;
    src[7] = (v.note - 60) / 36;
    src[8] = v.rand;
    src[9] = this.mw;

    // --- parameter values with modulation
    for (let i = 0; i < NP; i++) val[i] = c.real[i];
    if (c.modded.length) {
      for (let m = 0; m < c.modded.length; m++) {
        const p = c.modded[m];
        let x = c.base[p];
        for (let r = 0; r < c.routeDst.length; r++) if (c.routeDst[r] === p) x += c.routeAmt[r] * src[c.routeSrc[r]];
        val[p] = fromNorm(PARAMS[p], x);
      }
    }

    // --- glide
    const glide = val[P_GLIDE];
    if (glide > 0 && v.pitch !== v.note) {
      const k = 1 - Math.exp(-n / (glide * 0.35 * sr + 1));
      v.pitch += (v.note - v.pitch) * k;
      if (Math.abs(v.pitch - v.note) < 0.01) v.pitch = v.note;
    } else v.pitch = v.note;

    // --- oscillators into scratch
    const bufL = this.bufL, bufR = this.bufR;
    for (let i = 0; i < n; i++) { bufL[i] = 0; bufR[i] = 0; }
    const nyq = sr * 0.5;
    const maxUni = this.q.maxUnison;
    for (let o = 0; o < OSC_COUNT; o++) {
      if (!c.oscOn[o]) continue;
      const P = OSC[o];
      const level = val[P.level];
      if (level <= 0.0001) continue;
      const tbl = this.tables.get(c.tableIds[o]) ?? FALLBACK;
      const uni = Math.max(1, Math.min(maxUni, Math.round(c.real[P.uni])));
      const pitch = v.pitch + c.real[P.oct] * 12 + val[P.semi] + val[P.fine] / 100;
      const f = 440 * Math.pow(2, (pitch - 69) / 12);
      const det = val[P.detune];
      const maxCents = uni > 1 ? 100 * det * det : 0;
      const spread = val[P.spread];
      const pan = val[P.pan];
      const ug = level / Math.sqrt(uni);
      for (let k = 0; k < uni; k++) {
        const ok = uni === 1 ? 0 : (2 * k) / (uni - 1) - 1;
        // Slightly uneven spread (like classic supersaws) to avoid a static comb.
        const shaped = ok * (0.85 + 0.15 * Math.abs(ok));
        this.uInc[k] = (f * Math.pow(2, (shaped * maxCents) / 1200)) / sr;
        let pp = pan + ok * spread;
        pp = pp < -1 ? -1 : pp > 1 ? 1 : pp;
        const a = (pp + 1) * Math.PI * 0.25;
        this.uGL[k] = Math.cos(a) * ug * 1.414;
        this.uGR[k] = Math.sin(a) * ug * 1.414;
      }
      const maxF = f * Math.pow(2, maxCents / 1200);
      let lv = 0;
      const x = (1023 * maxF) / (nyq * 0.92);
      if (x > 1) lv = Math.ceil(2 * Math.log2(x));
      if (lv >= tbl.levels) lv = tbl.levels - 1;
      if (lv < 0) lv = 0;
      const F = tbl.frames;
      const fpos = val[P.pos] * (F - 1);
      const f0 = Math.min(F - 1, Math.floor(fpos));
      const f1 = Math.min(F - 1, f0 + 1);
      const ff = fpos - f0;
      const N = tbl.size;
      const stride = N + 1;
      const d = tbl.data;
      const b0 = (lv * F + f0) * stride;
      const b1 = (lv * F + f1) * stride;
      const morph = ff > 1e-6 && f1 !== f0;
      for (let k = 0; k < uni; k++) {
        const pi = o * MAX_UNI + k;
        let ph = v.phases[pi];
        const inc = this.uInc[k];
        const gl = this.uGL[k], gr = this.uGR[k];
        if (morph) {
          for (let i = 0; i < n; i++) {
            const p = ph * N;
            const i0 = p | 0;
            const fr = p - i0;
            let a = d[b0 + i0]; a += (d[b0 + i0 + 1] - a) * fr;
            let b = d[b1 + i0]; b += (d[b1 + i0 + 1] - b) * fr;
            const s = a + (b - a) * ff;
            bufL[i] += s * gl; bufR[i] += s * gr;
            ph += inc; if (ph >= 1) ph -= 1;
          }
        } else {
          for (let i = 0; i < n; i++) {
            const p = ph * N;
            const i0 = p | 0;
            let a = d[b0 + i0]; a += (d[b0 + i0 + 1] - a) * (p - i0);
            bufL[i] += a * gl; bufR[i] += a * gr;
            ph += inc; if (ph >= 1) ph -= 1;
          }
        }
        v.phases[pi] = ph;
      }
    }
    const nl = val[P_NOISE];
    if (nl > 0.0001) {
      const g = nl * 0.35;
      for (let i = 0; i < n; i++) { const w = noise() * g; bufL[i] += w; bufR[i] += w; }
    }

    // --- filter
    const amp = val[P_AMP];
    const velSens = c.real[P_VEL];
    const velGain = (1 - velSens) + velSens * v.vel * v.vel;
    const target = amp * velGain * VOICE_GAIN * this.gain;
    const env = v.env[0];
    let ampPrev = v.ampPrev;
    const dAmp = (target - ampPrev) / n;
    if (c.filterOn) {
      let fc = val[P_CUT] * Math.pow(2, (c.real[P_KEY] * (v.note - 60)) / 12);
      if (fc > sr * 0.45) fc = sr * 0.45;
      if (fc < 16) fc = 16;
      const g = Math.tan((Math.PI * fc) / sr);
      const res = val[P_RES];
      const k = 2 - 1.95 * res;
      const h1 = 1 / (1 + g * (g + k));
      const h2 = g * h1, h3 = g * h2;
      const ft = c.filterType;
      const drive = val[P_DRIVE];
      const pre = 1 + drive * 7;
      const post = 1 / (1 + drive * 2.5);
      // First stage of the 24 dB mode uses mild resonance.
      const k1 = 2 - 0.6 * res;
      const j1 = 1 / (1 + g * (g + k1));
      const j2 = g * j1, j3 = g * j2;
      let a1 = v.a1, a2 = v.a2, b1 = v.b1, b2 = v.b2, c1 = v.c1, c2 = v.c2, d1 = v.d1, d2 = v.d2;
      for (let i = 0; i < n; i++) {
        let xl = bufL[i], xr = bufR[i];
        if (drive > 0.001) {
          xl *= pre; xr *= pre;
          xl = xl > 3 ? 1 : xl < -3 ? -1 : (xl * (27 + xl * xl)) / (27 + 9 * xl * xl);
          xr = xr > 3 ? 1 : xr < -3 ? -1 : (xr * (27 + xr * xr)) / (27 + 9 * xr * xr);
          xl *= post; xr *= post;
        }
        let yl: number, yr: number;
        if (ft === 1) {
          // lp24: two cascaded SVF lowpasses
          let v3 = xl - a2, v1 = j1 * a1 + j2 * v3, v2 = a2 + j2 * a1 + j3 * v3;
          a1 = 2 * v1 - a1; a2 = 2 * v2 - a2;
          v3 = v2 - c2; v1 = h1 * c1 + h2 * v3; const w2 = c2 + h2 * c1 + h3 * v3;
          c1 = 2 * v1 - c1; c2 = 2 * w2 - c2;
          yl = w2;
          v3 = xr - b2; v1 = j1 * b1 + j2 * v3; v2 = b2 + j2 * b1 + j3 * v3;
          b1 = 2 * v1 - b1; b2 = 2 * v2 - b2;
          v3 = v2 - d2; v1 = h1 * d1 + h2 * v3; const z2 = d2 + h2 * d1 + h3 * v3;
          d1 = 2 * v1 - d1; d2 = 2 * z2 - d2;
          yr = z2;
        } else {
          let v3 = xl - a2;
          let v1 = h1 * a1 + h2 * v3;
          let v2 = a2 + h2 * a1 + h3 * v3;
          a1 = 2 * v1 - a1; a2 = 2 * v2 - a2;
          yl = ft === 0 ? v2 : ft === 2 ? xl - k * v1 - v2 : ft === 3 ? v1 * k : xl - k * v1;
          v3 = xr - b2;
          v1 = h1 * b1 + h2 * v3;
          v2 = b2 + h2 * b1 + h3 * v3;
          b1 = 2 * v1 - b1; b2 = 2 * v2 - b2;
          yr = ft === 0 ? v2 : ft === 2 ? xr - k * v1 - v2 : ft === 3 ? v1 * k : xr - k * v1;
        }
        ampPrev += dAmp;
        const gnow = env.tick() * ampPrev;
        outL[off + i] += yl * gnow;
        outR[off + i] += yr * gnow;
      }
      // Guard against blow-ups (NaN/Inf) — reset the filter if it ever happens.
      if (!isFinite(a1 + a2 + b1 + b2 + c1 + c2 + d1 + d2)) a1 = a2 = b1 = b2 = c1 = c2 = d1 = d2 = 0;
      v.a1 = a1; v.a2 = a2; v.b1 = b1; v.b2 = b2; v.c1 = c1; v.c2 = c2; v.d1 = d1; v.d2 = d2;
    } else {
      for (let i = 0; i < n; i++) {
        ampPrev += dAmp;
        const gnow = env.tick() * ampPrev;
        outL[off + i] += bufL[i] * gnow;
        outR[off + i] += bufR[i] * gnow;
      }
    }
    v.ampPrev = target;
    v.time += n;
    if (env.stage === IDLE) { v.active = false; v.fast = false; v.id = -1; }
  }
}
