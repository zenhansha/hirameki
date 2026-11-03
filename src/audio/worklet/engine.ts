// The sequencer + synth parts that run inside the AudioWorklet (sample-accurate timing).
// Pure TypeScript: unit tests drive it directly in Node.
import { Patch, QUALITY_HIGH, Quality } from '../params';
import type { WavetableData } from '../wavetables';
import { Synth, TransportInfo } from './synth';
import { pumpGain } from '../../seq/pattern';
import { PPQ } from '../../seq/time';

export interface SeqEvent {
  t: number;
  d: number;
  n: number;
  v: number;
  /** 0 chords, 1 bass, 2 melody */
  p: number;
}

export interface SeqData {
  events: SeqEvent[];
  songEnd: number;
  loop: { on: boolean; start: number; end: number };
  bpm: number;
  barTicks: number;
  /** Metronome click interval and accent interval. */
  clickTicks: number;
  beatTicks: number;
  metronome: boolean;
  humanize: { time: number; vel: number };
  pump: { on: boolean; period: number; offset: number; depth: number; curve: number; length: number };
  partGain: number[];
}

export const EMPTY_SEQ: SeqData = {
  events: [], songEnd: PPQ * 16, loop: { on: true, start: 0, end: PPQ * 16 }, bpm: 120, barTicks: PPQ * 4,
  clickTicks: PPQ, beatTicks: PPQ, metronome: false, humanize: { time: 0, vel: 0 },
  pump: { on: false, period: PPQ, offset: 0, depth: 0, curve: 0.5, length: 0.8 }, partGain: [1, 1, 0.9],
};

interface Pending {
  frame: number;
  on: boolean;
  part: number;
  id: number;
  note: number;
  vel: number;
  /** Planned duration in seconds (note-ons). */
  dur: number;
}

export type EngineMessage =
  | { type: 'tables'; tables: WavetableData[] }
  | { type: 'patch'; part: number; patch: Patch }
  | { type: 'seq'; seq: SeqData }
  | { type: 'play'; from: number }
  | { type: 'stop' }
  | { type: 'seek'; tick: number }
  | { type: 'liveOn'; id: number; part: number; note: number; vel: number }
  | { type: 'liveOff'; id: number; part: number }
  | { type: 'liveOffNote'; part: number; note: number }
  | { type: 'mw'; value: number }
  | { type: 'quality'; q: Quality; voices: number }
  | { type: 'panic' };

export type EngineReport =
  | { type: 'pos'; tick: number; frame: number; playing: boolean }
  | { type: 'ended' }
  | { type: 'load'; load: number; voices: number };

export class Engine {
  readonly sr: number;
  parts: Synth[];
  seq: SeqData = EMPTY_SEQ;
  playing = false;
  pos = 0; // tick
  frame = 0; // absolute frame counter
  private pending: Pending[] = [];
  private nextId = 1;
  private clickPhase = 0;
  private clickEnv = 0;
  private clickFreq = 1000;
  private pumpLut = new Float32Array(257);
  private pumpOut = 1;
  private lastReport = 0;
  /** Offline: stop after this many loop passes (0 = unlimited). */
  loopsLeft = 0;
  private loopPasses = 0;
  onReport: (r: EngineReport) => void = () => {};
  private rnd = 0x9e3779b9;

  constructor(sr: number) {
    this.sr = sr;
    this.parts = [new Synth(sr, 28), new Synth(sr, 6), new Synth(sr, 4)];
    this.buildPumpLut();
  }

  private random(): number {
    let x = this.rnd;
    x ^= x << 13; x ^= x >>> 17; x ^= x << 5;
    this.rnd = x >>> 0;
    return this.rnd / 4294967296;
  }

  private buildPumpLut() {
    const p = this.seq.pump;
    for (let i = 0; i <= 256; i++) this.pumpLut[i] = pumpGain(i / 256, p);
  }

  get tps(): number {
    return (this.seq.bpm * PPQ) / (60 * this.sr);
  }

  handle(m: EngineMessage) {
    switch (m.type) {
      case 'tables':
        for (const t of m.tables) for (const s of this.parts) s.addTable(t);
        break;
      case 'patch':
        this.parts[m.part]?.setPatch(m.patch);
        break;
      case 'seq': {
        const oldBpm = this.seq.bpm;
        this.seq = m.seq;
        this.seq.partGain.forEach((g, i) => { if (this.parts[i]) this.parts[i].gain = g; });
        this.buildPumpLut();
        if (this.playing) {
          const lp = this.seq.loop;
          if (lp.on && (this.pos >= lp.end || this.pos < lp.start)) this.pos = lp.start;
          // Pending note-offs were computed with the old tempo; rescale relative to now.
          if (oldBpm !== this.seq.bpm) {
            const k = oldBpm / this.seq.bpm;
            for (const p of this.pending) if (!p.on && p.frame > this.frame) p.frame = this.frame + (p.frame - this.frame) * k;
          }
        }
        break;
      }
      case 'play':
        this.start(m.from);
        break;
      case 'stop':
        this.stop();
        break;
      case 'seek':
        if (this.playing) { this.stop(); this.start(m.tick); } else this.pos = m.tick;
        break;
      case 'liveOn':
        this.parts[m.part]?.noteOn(-m.id, m.note, m.vel);
        break;
      case 'liveOff':
        this.parts[m.part]?.noteOff(-m.id);
        break;
      case 'liveOffNote':
        this.parts[m.part]?.noteOffByNote(m.note);
        break;
      case 'mw':
        for (const s of this.parts) s.mw = m.value;
        break;
      case 'quality':
        this.parts[0].setQuality(m.q, m.voices);
        this.parts[1].setQuality(m.q);
        this.parts[2].setQuality(m.q);
        break;
      case 'panic':
        this.pending = [];
        for (const s of this.parts) s.kill();
        break;
    }
  }

  start(from: number) {
    this.stopSequencedNotes();
    this.playing = true;
    const lp = this.seq.loop;
    this.pos = Math.max(0, from);
    if (lp.on && (this.pos >= lp.end || this.pos < lp.start)) this.pos = lp.start;
    this.loopPasses = 0;
    this.clickEnv = 0;
    // Chase: notes already sounding at the start position start now.
    for (const e of this.seq.events) {
      if (e.t < this.pos && e.t + e.d > this.pos + 1) {
        const rest = e.t + e.d - this.pos;
        this.schedule(this.frame, rest / this.tps, e, 0);
      }
    }
  }

  stop() {
    this.playing = false;
    this.stopSequencedNotes();
    this.onReport({ type: 'pos', tick: this.pos, frame: this.frame, playing: false });
  }

  private stopSequencedNotes() {
    // Release every sequenced note (ids > 0), keep live notes.
    for (const p of this.pending) if (!p.on) this.parts[p.part].noteOff(p.id);
    this.pending = [];
    for (const s of this.parts) for (const v of s.voices) if (v.active && v.id > 0) for (const e of v.env) e.release();
  }

  private schedule(frame: number, durFrames: number, e: SeqEvent, humanizeFrames: number) {
    const id = this.nextId++;
    if (this.nextId > 1e9) this.nextId = 1;
    const hv = this.seq.humanize.vel;
    let vel = e.v;
    if (hv > 0) vel *= 1 + (this.random() * 2 - 1) * hv * 0.35;
    vel = vel < 0.02 ? 0.02 : vel > 1 ? 1 : vel;
    const on = frame + humanizeFrames;
    this.insert({ frame: on, on: true, part: e.p, id, note: e.n, vel, dur: Math.max(16, durFrames) / this.sr });
    this.insert({ frame: on + Math.max(16, durFrames), on: false, part: e.p, id, note: e.n, vel: 0, dur: 0 });
  }

  private insert(p: Pending) {
    // Keep sorted by frame (offs before ons on the same frame).
    const arr = this.pending;
    let i = arr.length;
    while (i > 0 && (arr[i - 1].frame > p.frame || (arr[i - 1].frame === p.frame && arr[i - 1].on && !p.on))) i--;
    arr.splice(i, 0, p);
  }

  /** Index of the first event with t >= tick. */
  private lower(tick: number): number {
    const ev = this.seq.events;
    let lo = 0, hi = ev.length;
    while (lo < hi) {
      const mid = (lo + hi) >> 1;
      if (ev[mid].t < tick) lo = mid + 1; else hi = mid;
    }
    return lo;
  }

  private scan(a: number, b: number, frameAtA: number, tps: number) {
    const ev = this.seq.events;
    const lp = this.seq.loop;
    const hmax = this.seq.humanize.time * 0.02 * this.sr; // up to 20 ms late
    for (let i = this.lower(a); i < ev.length && ev[i].t < b; i++) {
      const e = ev[i];
      let d = e.d;
      if (lp.on && e.t + d > lp.end) d = lp.end - e.t;
      const f = frameAtA + (e.t - a) / tps;
      const h = hmax > 0 ? this.random() * hmax : 0;
      this.schedule(f, d / tps, e, h);
    }
  }

  /** Render one block. `click` and `pump` may be null. */
  process(outL: Float32Array, outR: Float32Array, click: Float32Array | null, pump: Float32Array | null) {
    const n = outL.length;
    const tps = this.tps;
    const startTick = this.pos;
    const seq = this.seq;
    const lp = seq.loop;
    let wrapAt = -1; // frame offset within block where the loop wrapped
    let wrapF = 0; // exact (fractional) frame offset of the wrap
    let wrapFrom = 0;

    if (this.playing) {
      const endTick = this.pos + n * tps;
      const limit = lp.on ? lp.end : seq.songEnd;
      if (endTick >= limit) {
        const f = (limit - this.pos) / tps;
        this.scan(this.pos, limit, this.frame, tps);
        if (lp.on && (this.loopsLeft === 0 || this.loopPasses + 1 < this.loopsLeft)) {
          this.loopPasses++;
          const rem = endTick - limit;
          wrapAt = Math.max(0, Math.floor(f));
          wrapF = Math.max(0, f);
          wrapFrom = limit;
          this.scan(lp.start, lp.start + rem, this.frame + f, tps);
          this.pos = lp.start + rem;
        } else {
          this.pos = limit;
          this.playing = false;
          this.onReport({ type: 'ended' });
        }
      } else {
        this.scan(this.pos, endTick, this.frame, tps);
        this.pos = endTick;
      }
    }

    // Apply pending events in order, rendering the segments in between.
    const blockEnd = this.frame + n;
    const tr: TransportInfo = { playing: this.playing || wrapAt >= 0, tick: startTick, tps, bpm: seq.bpm };
    for (const s of this.parts) s.prepareBlock(n, tr);
    let cursor = 0;
    while (this.pending.length && this.pending[0].frame < blockEnd) {
      const p = this.pending.shift()!;
      const off = Math.max(cursor, Math.min(n, Math.floor(p.frame - this.frame)));
      if (off > cursor) {
        for (const s of this.parts) s.render(outL, outR, cursor, off, tr);
        cursor = off;
      }
      const part = this.parts[p.part];
      if (!part) continue;
      if (p.on) part.noteOn(p.id, p.note, p.vel, p.dur);
      else part.noteOff(p.id);
    }
    if (cursor < n) for (const s of this.parts) s.render(outL, outR, cursor, n, tr);

    // Metronome clicks that fall inside this block.
    const playingNow = this.playing || wrapAt >= 0;
    const clickAt: number[] = [];
    const clickLvl: number[] = [];
    if (click && seq.metronome && playingNow) {
      const ct = seq.clickTicks;
      const addSeg = (a: number, b: number, off0: number) => {
        for (let k = Math.ceil(a / ct - 1e-9) * ct; k < b - 1e-9; k += ct) {
          clickAt.push(off0 + (k - a) / tps);
          const inBar = ((k % seq.barTicks) + seq.barTicks) % seq.barTicks;
          clickLvl.push(inBar < 1e-6 ? 2 : Math.abs(inBar % seq.beatTicks) < 1e-6 ? 1 : 0);
        }
      };
      if (wrapAt >= 0) {
        addSeg(startTick, wrapFrom, 0);
        addSeg(lp.start, this.pos, wrapF);
      } else addSeg(startTick, this.playing ? this.pos : startTick + n * tps, 0);
    }
    const clickDecay = Math.exp(-1 / (0.009 * this.sr));
    let ci = 0;

    // Metronome + pump (per sample, cheap).
    const pumpOn = seq.pump.on && playingNow;
    for (let i = 0; i < n; i++) {
      let tick = startTick + i * tps;
      if (wrapAt >= 0 && i >= wrapAt) tick = lp.start + (tick - wrapFrom);
      if (click) {
        while (ci < clickAt.length && clickAt[ci] <= i) {
          const lvl = clickLvl[ci++];
          this.clickEnv = lvl === 2 ? 0.55 : lvl === 1 ? 0.36 : 0.2;
          this.clickFreq = lvl === 2 ? 1760 : lvl === 1 ? 1175 : 990;
          this.clickPhase = 0;
        }
        if (this.clickEnv > 0.0005) {
          this.clickPhase += this.clickFreq / this.sr;
          // 1 ms fade-in avoids a click on the click.
          const fin = this.clickPhase < this.clickFreq * 0.001 ? this.clickPhase / (this.clickFreq * 0.001) : 1;
          click[i] = Math.sin(2 * Math.PI * this.clickPhase) * this.clickEnv * fin;
          this.clickEnv *= clickDecay;
        } else click[i] = 0;
      }
      if (pump) {
        let target = 1;
        if (pumpOn) {
          const P = seq.pump;
          let ph = (tick - P.offset * P.period) / P.period;
          ph -= Math.floor(ph);
          const x = ph * 256;
          const k = x | 0;
          target = this.pumpLut[k] + (this.pumpLut[k + 1] - this.pumpLut[k]) * (x - k);
        }
        // Smooth transitions when pumping turns on/off.
        this.pumpOut += (target - this.pumpOut) * (pumpOn ? 0.5 : 0.002);
        pump[i] = this.pumpOut;
      }
    }

    this.frame += n;
    if (this.frame - this.lastReport >= this.sr * 0.02) {
      this.lastReport = this.frame;
      this.onReport({ type: 'pos', tick: this.pos, frame: this.frame, playing: this.playing });
    }
  }

  /** Total voices currently sounding. */
  voiceCount(): number {
    return this.parts.reduce((s, p) => s + p.activeCount(), 0);
  }
}

// ---- master limiter -----------------------------------------------------------

/**
 * Look-ahead brickwall limiter with a slow loudness guard in front.
 * Required gains are min-filtered over la+1 samples and box-smoothed over la samples while the
 * audio is delayed by la samples — so the gain is always fully down when a peak comes out.
 */
export class Limiter {
  readonly sr: number;
  ceiling = 0.944; // −0.5 dBFS
  readonly la: number;
  private dl: Float32Array;
  private dr: Float32Array;
  private w = 0;
  private need: Float32Array; // ring of required gains (index = count % cap)
  private dq: Float64Array; // deque of absolute counts (sliding minimum)
  private cap: number;
  private head = 0;
  private tail = 0;
  private count = 0;
  private box: Float32Array;
  private bi = 0;
  private boxSum: number;
  private rel = 1;
  private relCoef: number;
  private rms = 0;
  private rmsCoef: number;
  private guard = 1;
  peak = 0;
  minGain = 1;
  nanCount = 0;

  constructor(sr: number, lookaheadMs = 4) {
    this.sr = sr;
    this.la = Math.max(8, Math.round((sr * lookaheadMs) / 1000));
    this.dl = new Float32Array(this.la);
    this.dr = new Float32Array(this.la);
    this.cap = this.la + 4;
    this.need = new Float32Array(this.cap).fill(1);
    this.dq = new Float64Array(this.cap);
    this.box = new Float32Array(this.la).fill(1);
    this.boxSum = this.la;
    this.relCoef = Math.exp(-1 / (sr * 0.12));
    this.rmsCoef = Math.exp(-1 / (sr * 0.4));
  }

  process(inL: Float32Array, inR: Float32Array, outL: Float32Array, outR: Float32Array) {
    const la = this.la, cap = this.cap, c = this.ceiling;
    for (let i = 0; i < inL.length; i++) {
      let l = inL[i], r = inR[i];
      if (!isFinite(l) || !isFinite(r)) { l = 0; r = 0; this.nanCount++; }
      // Loudness guard: if the long-term RMS gets far too hot, back off slowly (max about −9 dB).
      this.rms = this.rms * this.rmsCoef + 0.5 * (l * l + r * r) * (1 - this.rmsCoef);
      const rms = Math.sqrt(this.rms);
      const target = rms > 0.42 ? Math.max(0.35, 0.42 / rms) : 1;
      this.guard += (target - this.guard) * (target < this.guard ? 0.00003 : 0.000005);
      l *= this.guard; r *= this.guard;

      const pk = Math.max(Math.abs(l), Math.abs(r));
      const need = pk > c ? c / pk : 1;
      const cnt = this.count++;
      this.need[cnt % cap] = need;
      while (this.tail > this.head && this.need[this.dq[(this.tail - 1) % cap] % cap] >= need) this.tail--;
      this.dq[this.tail % cap] = cnt;
      this.tail++;
      while (this.dq[this.head % cap] < cnt - la) this.head++;
      const wmin = this.need[this.dq[this.head % cap] % cap];

      this.boxSum += wmin - this.box[this.bi];
      this.box[this.bi] = wmin;
      this.bi = (this.bi + 1) % la;
      const g0 = this.boxSum / la;
      if (g0 < this.rel) this.rel = g0;
      else this.rel = g0 + (this.rel - g0) * this.relCoef;
      const g = this.rel;
      if (g < this.minGain) this.minGain = g;

      const ol0 = this.dl[this.w], or0 = this.dr[this.w];
      this.dl[this.w] = l; this.dr[this.w] = r;
      this.w = (this.w + 1) % la;
      let ol = ol0 * g, or = or0 * g;
      ol = ol > c ? c : ol < -c ? -c : ol;
      or = or > c ? c : or < -c ? -c : or;
      outL[i] = ol; outR[i] = or;
      const ap = ol > 0 ? ol : -ol, bp = or > 0 ? or : -or;
      if (ap > this.peak) this.peak = ap;
      if (bp > this.peak) this.peak = bp;
    }
    // Keep the counters small.
    if (this.count > 1e12) { this.count = 0; this.head = this.tail = 0; }
  }

  /** Read and reset meters. */
  meters() {
    const m = { peak: this.peak, gr: this.minGain, guard: this.guard, nan: this.nanCount };
    this.peak = 0;
    this.minGain = 1;
    return m;
  }
}
