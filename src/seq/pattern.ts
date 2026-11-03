// Patterns: HOW a chord is played (rhythm hits, arpeggio, strum). Pure and unit tested.
import { PPQ, TimeSig, barTicks } from './time';

export type PatternKind = 'block' | 'arp' | 'strum';
export type StepRes = 'bar' | '1' | '2' | '4' | '4.' | '8' | '8.' | '8t' | '16' | '16t' | '32';
export type ArpMode = 'up' | 'down' | 'updown' | 'downup' | 'random' | 'inout';
export type StrumDir = 'down' | 'up' | 'alt';

export const RES_TICKS: Record<Exclude<StepRes, 'bar'>, number> = {
  '1': PPQ * 4, '2': PPQ * 2, '4': PPQ, '4.': PPQ * 1.5, '8': PPQ / 2, '8.': PPQ * 0.75,
  '8t': PPQ / 3, '16': PPQ / 4, '16t': PPQ / 6, '32': PPQ / 8,
};

/** Step length in ticks ('bar' = one bar of the current time signature). */
export function resTicks(res: StepRes, ts: TimeSig): number {
  return res === 'bar' ? barTicks(ts) : RES_TICKS[res];
}

export const RES_LABELS: Record<StepRes, string> = {
  bar: '1小節', '1': '全音符', '2': '2分', '4': '4分', '4.': '付点4分', '8': '8分', '8.': '付点8分',
  '8t': '3連(8分)', '16': '16分', '16t': '3連(16分)', '32': '32分',
};

export interface PatternSpec {
  kind: PatternKind;
  /** Step length. */
  res: StepRes;
  /**
   * One cycle of steps, restarted every bar:
   * 'x' hit, 'X' accented hit, '-' hold the previous hit, '.' rest.
   */
  steps: string;
  /** Fraction of each hit's span that sounds (0.05…1). */
  gate: number;
  /** Base velocity 0…1. */
  vel: number;
  /** Extra velocity for 'X'. */
  accent: number;
  /** Always sound at the start of each chord even if the grid is silent there. */
  retrig: boolean;
  /** Octave shift for the chord notes. */
  oct: number;
  arp: { mode: ArpMode; octaves: number; start: number };
  strum: { dir: StrumDir; speed: number };
}

export interface NoteEvent {
  t: number;
  d: number;
  n: number;
  v: number;
}

export const DEFAULT_PATTERN: PatternSpec = {
  kind: 'block', res: '1', steps: 'x', gate: 1, vel: 0.78, accent: 0.18, retrig: true, oct: 0,
  arp: { mode: 'up', octaves: 1, start: 0 }, strum: { dir: 'down', speed: 18 },
};

export function normalizePattern(p: Partial<PatternSpec> | null | undefined): PatternSpec {
  const d = DEFAULT_PATTERN;
  const src = p ?? {};
  const kind: PatternKind = src.kind === 'arp' || src.kind === 'strum' ? src.kind : 'block';
  const res: StepRes = src.res && (src.res === 'bar' || RES_TICKS[src.res as Exclude<StepRes, 'bar'>]) ? (src.res as StepRes) : d.res;
  const steps = typeof src.steps === 'string' && /^[xX.\-]{1,64}$/.test(src.steps) ? src.steps : d.steps;
  const num = (v: unknown, lo: number, hi: number, def: number) => (typeof v === 'number' && isFinite(v) ? Math.min(hi, Math.max(lo, v)) : def);
  const arpSrc: Partial<PatternSpec['arp']> = src.arp ?? {};
  const strumSrc: Partial<PatternSpec['strum']> = src.strum ?? {};
  const modes: ArpMode[] = ['up', 'down', 'updown', 'downup', 'random', 'inout'];
  return {
    kind, res, steps,
    gate: num(src.gate, 0.05, 1, d.gate),
    vel: num(src.vel, 0.05, 1, d.vel),
    accent: num(src.accent, 0, 0.6, d.accent),
    retrig: typeof src.retrig === 'boolean' ? src.retrig : d.retrig,
    oct: Math.round(num(src.oct, -2, 2, 0)),
    arp: {
      mode: modes.includes(arpSrc.mode as ArpMode) ? (arpSrc.mode as ArpMode) : 'up',
      octaves: Math.round(num(arpSrc.octaves, 1, 4, 1)),
      start: Math.round(num(arpSrc.start, 0, 15, 0)),
    },
    strum: {
      dir: strumSrc.dir === 'up' || strumSrc.dir === 'alt' ? strumSrc.dir : 'down',
      speed: num(strumSrc.speed, 2, 80, 18),
    },
  };
}

/** Velocity compensation so big chords are not louder than small ones. */
export function chordGainComp(n: number): number {
  return n > 3 ? Math.sqrt(3 / n) : 1;
}

interface Hit {
  t: number;
  span: number;
  accent: boolean;
  /** Index of the step in the bar (for strum direction). */
  step: number;
}

/**
 * Rhythm hits of a pattern inside [cs, ce).
 * The step cycle restarts every bar, except when the cycle is an exact multiple of the bar
 * (e.g. 'x-------' with res 'bar' = hold up to 8 bars), then it runs over several bars.
 */
export function rhythmHits(p: PatternSpec, cs: number, ce: number, ts: TimeSig): Hit[] {
  const step = resTicks(p.res, ts);
  const bar = barTicks(ts);
  const steps = p.steps || 'x';
  const cycle = steps.length * step;
  const ratio = cycle / bar;
  const seg = ratio > 1 && Math.abs(ratio - Math.round(ratio)) < 1e-9 ? cycle : bar;
  const hits: Hit[] = [];
  let cur: Hit | null = null;
  const first = Math.floor(cs / seg);
  const last = Math.floor((ce - 1) / seg);
  for (let b = first; b <= last; b++) {
    const bs = b * seg;
    // A hit never holds across a cycle boundary: the pattern restarts there.
    if (cur) { hits.push(cur); cur = null; }
    for (let i = 0; bs + i * step < bs + seg - 1e-6; i++) {
      const pos = bs + i * step;
      const stepEnd = Math.min(pos + step, bs + seg);
      const ch = steps[i % steps.length];
      if (stepEnd <= cs) continue;
      if (pos >= ce) break;
      const start = Math.max(pos, cs);
      const end = Math.min(stepEnd, ce);
      if (ch === 'x' || ch === 'X') {
        if (cur) hits.push(cur);
        cur = { t: start, span: end - start, accent: ch === 'X', step: i };
      } else if (ch === '-') {
        if (cur) cur.span = end - cur.t;
        else if (p.retrig && start === cs) cur = { t: cs, span: end - cs, accent: false, step: i };
      } else {
        if (cur) { hits.push(cur); cur = null; }
        if (p.retrig && start === cs && !hits.some((h) => h.t === cs)) {
          hits.push({ t: cs, span: end - cs, accent: false, step: i });
        }
      }
    }
  }
  if (cur) hits.push(cur);
  hits.sort((a, b) => a.t - b.t);
  // Retrigger: make sure the chord sounds from its start.
  if (p.retrig && hits.length && hits[0].t > cs) {
    hits.unshift({ t: cs, span: hits[0].t - cs, accent: false, step: 0 });
  } else if (p.retrig && !hits.length && ce > cs) {
    hits.push({ t: cs, span: ce - cs, accent: false, step: 0 });
  }
  return hits.filter((h) => h.span > 0);
}

/** Arpeggio note order for a voicing. */
export function arpSequence(notes: number[], mode: ArpMode, octaves: number, seed: number): number[] {
  const base = [...notes].sort((a, b) => a - b);
  const ext: number[] = [];
  for (let o = 0; o < Math.max(1, octaves); o++) for (const n of base) ext.push(n + 12 * o);
  switch (mode) {
    case 'up': return ext;
    case 'down': return [...ext].reverse();
    case 'updown': return ext.length > 1 ? [...ext, ...ext.slice(1, -1).reverse()] : ext;
    case 'downup': {
      const d = [...ext].reverse();
      return d.length > 1 ? [...d, ...d.slice(1, -1).reverse()] : d;
    }
    case 'inout': {
      // Outside-in: low, high, 2nd low, 2nd high…
      const out: number[] = [];
      let lo = 0, hi = ext.length - 1;
      while (lo <= hi) { out.push(ext[lo++]); if (lo <= hi) out.push(ext[hi--]); }
      return out;
    }
    case 'random': {
      // Deterministic shuffle so playback, export and tests agree.
      const a = [...ext];
      let s = (seed * 2654435761) >>> 0 || 1;
      for (let i = a.length - 1; i > 0; i--) {
        s ^= s << 13; s >>>= 0; s ^= s >>> 17; s ^= s << 5; s >>>= 0;
        const j = s % (i + 1);
        [a[i], a[j]] = [a[j], a[i]];
      }
      return a;
    }
  }
}

export interface RenderContext {
  ts: TimeSig;
  bpm: number;
}

/**
 * Notes for one chord: voicing `notes` played with pattern `p` over [cs, ce).
 */
export function renderPattern(p: PatternSpec, notes: number[], cs: number, ce: number, ctx: RenderContext): NoteEvent[] {
  if (!notes.length || ce <= cs) return [];
  const shifted = notes.map((n) => n + 12 * p.oct).sort((a, b) => a - b);
  const hits = rhythmHits(p, cs, ce, ctx.ts);
  const out: NoteEvent[] = [];
  const velOf = (h: Hit) => Math.min(1, p.vel + (h.accent ? p.accent : 0));
  const durOf = (h: Hit) => Math.max(1, Math.round(h.span * p.gate));

  if (p.kind === 'block') {
    const comp = chordGainComp(shifted.length);
    for (const h of hits) for (const n of shifted) out.push({ t: h.t, d: durOf(h), n, v: velOf(h) * comp });
  } else if (p.kind === 'strum') {
    const comp = chordGainComp(shifted.length) * 1.05;
    const perNote = (p.strum.speed / 1000) * (ctx.bpm / 60) * PPQ;
    for (const h of hits) {
      const up = p.strum.dir === 'up' || (p.strum.dir === 'alt' && h.step % 2 === 1);
      const order = up ? [...shifted].reverse() : shifted;
      const dur = durOf(h);
      const maxOff = dur * 0.6;
      const step = order.length > 1 ? Math.min(perNote, maxOff / (order.length - 1)) : 0;
      order.forEach((n, i) => {
        const off = Math.round(i * step);
        out.push({ t: h.t + off, d: Math.max(1, dur - off), n, v: velOf(h) * comp * (up ? 0.82 : 1) * (1 - i * 0.025) });
      });
    }
  } else {
    const seq = arpSequence(shifted, p.arp.mode, p.arp.octaves, cs + shifted[0]);
    let idx = p.arp.start % seq.length;
    for (const h of hits) {
      out.push({ t: h.t, d: durOf(h), n: seq[idx % seq.length], v: velOf(h) });
      idx++;
    }
  }
  return out;
}

/** Ticks per step for display. */
export function stepTicks(p: PatternSpec, ts: TimeSig): number {
  return resTicks(p.res, ts);
}

/** Number of grid cells in one bar for this pattern. */
export function stepsPerBar(p: PatternSpec, ts: TimeSig): number {
  return Math.max(1, Math.round(barTicks(ts) / resTicks(p.res, ts)));
}

// ---- sidechain-style pumping ------------------------------------------------

export interface PumpSpec {
  on: boolean;
  /** Pump period (sync division, e.g. '1/4'). */
  rate: string;
  /** 0…1 how much the volume dips. */
  depth: number;
  /** 0…1 recovery curve (0 = linear, 1 = snappy). */
  curve: number;
  /** Timing offset as a fraction of the period (−0.5…0.5). */
  offset: number;
  /** Fraction of the period the dip lasts (0.1…1). */
  length: number;
}

export const DEFAULT_PUMP: PumpSpec = { on: false, rate: '1/4', depth: 0.6, curve: 0.5, offset: 0, length: 0.8 };

/** Pump gain (0…1) at a phase within the period, shared with the audio worklet. */
export function pumpGain(phase: number, spec: Pick<PumpSpec, 'depth' | 'curve' | 'length'>, attackPhase = 0.012): number {
  const len = Math.max(0.05, Math.min(1, spec.length));
  const ph = phase - Math.floor(phase);
  if (ph >= len) return 1;
  const u = ph / len;
  const k = 0.6 + spec.curve * 3.4;
  const env = Math.pow(1 - u, k);
  const att = ph < attackPhase ? ph / attackPhase : 1;
  return 1 - spec.depth * env * att;
}
