// Turning chord specs into MIDI notes, with optional smooth voice leading.
import { Key, mod12, tonicShift } from './core';
import { ChordSpec, chordBass, chordTones, hasSlash, quality } from './chord';

export interface VoicingOptions {
  /** Pick inversions that move as little as possible from `prev`. */
  auto: boolean;
  prev?: number[] | null;
  /** Lowest / highest allowed note of the upper voicing. */
  low?: number;
  high?: number;
  /** Where the voicing likes to sit (mean note). */
  center?: number;
  maxVoices?: number;
  /** Add the slash/inversion bass under the voicing (when no bass track plays it). */
  addBass?: boolean;
  /** Drop the root from the upper voicing (a bass track plays it). */
  rootless?: boolean;
}

export interface Voicing {
  notes: number[];
  /** Suggested bass note (MIDI) for the bass track. */
  bass: number;
}

export const DEFAULT_CENTER = 63;

/** Bass note in A1…G♯2 for a pitch class. */
export function bassMidi(pc: number): number {
  return 33 + mod12(pc - 9);
}

/** Pick the tones to voice (drop the least important when there are too many). */
export function voiceTones(c: ChordSpec, maxVoices: number, rootless: boolean): number[] {
  let tones = chordTones(c).map((t) => t[0]);
  const isAltered5 = quality(c.q).tones.some((t) => t[0] === 6 || t[0] === 8);
  const drop = (semi: number) => {
    const i = tones.findIndex((t) => mod12(t) === semi);
    if (i > 0 || (i === 0 && semi === 0)) tones.splice(i, 1);
  };
  if (rootless && tones.length >= 4) drop(0);
  if (tones.length > maxVoices && !isAltered5) drop(7);
  if (tones.length > maxVoices) drop(0);
  if (tones.length > maxVoices && tones.some((t) => t === 21)) {
    const i = tones.indexOf(17);
    if (i >= 0) tones.splice(i, 1);
  }
  while (tones.length > maxVoices) tones.pop();
  return tones;
}

/** Fixed (non-auto) voicing: close position near the centre, inversion applied. */
function fixedVoicing(c: ChordSpec, key: Key, center: number, maxVoices: number, rootless: boolean): number[] {
  const rootPc = mod12(key.tonic + c.root);
  const tones = voiceTones(c, maxVoices, rootless);
  // Put the root between F3 (53) and E4 (64).
  const rootMidi = 53 + mod12(rootPc - 5);
  let notes = tones.map((t) => rootMidi + t);
  const inv = c.bass ? 0 : c.inv ?? 0;
  if (inv > 0) {
    // Raise the lowest `inv` chord tones by an octave.
    const sorted = [...notes].sort((a, b) => a - b);
    const base = sorted.filter((n) => n - rootMidi < 12);
    for (let i = 0; i < inv && i < base.length; i++) {
      const idx = notes.indexOf(base[i]);
      notes[idx] += 12;
    }
  }
  notes.sort((a, b) => a - b);
  // Keep the mean near the centre.
  const mean = notes.reduce((s, n) => s + n, 0) / notes.length;
  const shift = Math.round((center - mean) / 12) * 12;
  if (Math.abs(shift) >= 12) notes = notes.map((n) => n + shift);
  return notes;
}

/** Close-position stacks starting on each tone, plus drop-2 variants. */
function candidateShapes(pcs: number[]): number[][] {
  const shapes: number[][] = [];
  const n = pcs.length;
  for (let r = 0; r < n; r++) {
    const stack: number[] = [];
    let prev = -1;
    for (let i = 0; i < n; i++) {
      const pc = pcs[(r + i) % n];
      let note = pc;
      while (note <= prev) note += 12;
      stack.push(note);
      prev = note;
    }
    shapes.push(stack);
    if (n >= 4) {
      const drop2 = [...stack];
      drop2[n - 2] -= 12;
      drop2.sort((a, b) => a - b);
      shapes.push(drop2);
    }
  }
  return shapes;
}

/** How far the voices have to move from a to b (symmetric nearest-neighbour). */
export function voiceMotion(a: number[], b: number[]): number {
  if (!a.length || !b.length) return 0;
  let s = 0;
  for (const x of b) s += Math.min(...a.map((y) => Math.abs(x - y)));
  for (const y of a) s += Math.min(...b.map((x) => Math.abs(x - y)));
  return s / 2;
}

function scoreVoicing(v: number[], prev: number[] | null | undefined, center: number, rootPc: number): number {
  const mean = v.reduce((s, n) => s + n, 0) / v.length;
  let score = 0.35 * Math.abs(mean - center);
  if (prev && prev.length) {
    score += voiceMotion(prev, v);
    score += 0.4 * Math.abs(v[v.length - 1] - prev[prev.length - 1]);
  } else if (mod12(v[0]) !== rootPc) {
    score += 2.5;
  }
  // Muddy low intervals.
  for (let i = 1; i < v.length; i++) {
    const iv = v[i] - v[i - 1];
    if (v[i - 1] < 55 && iv < 3) score += 5;
    else if (v[i - 1] < 50 && iv < 5) score += 3;
    if (iv === 1 && i === v.length - 1) score += 1.5; // minor 2nd on top sounds harsh
  }
  const span = v[v.length - 1] - v[0];
  if (span > 19) score += (span - 19) * 0.6;
  return score;
}

/** Voice a chord. Deterministic for the same input. */
export function voiceChord(c: ChordSpec, key: Key, opts: VoicingOptions): Voicing {
  const center = opts.center ?? DEFAULT_CENTER;
  const low = opts.low ?? 50;
  const high = opts.high ?? 81;
  const maxVoices = opts.maxVoices ?? 5;
  const rootPc = mod12(key.tonic + c.root);
  const bassPc = mod12(key.tonic + chordBass(c).root);
  const bass = bassMidi(bassPc);

  if (c.notes && c.notes.length) {
    const shift = tonicShift(key.tonic);
    const notes = c.notes.map((n) => n + shift).sort((a, b) => a - b);
    return { notes, bass: bassMidi(mod12(notes[0])) };
  }

  let notes: number[];
  if (!opts.auto) {
    notes = fixedVoicing(c, key, center, maxVoices, !!opts.rootless);
  } else {
    const tones = voiceTones(c, maxVoices, !!opts.rootless);
    const pcs = tones.map((t) => mod12(rootPc + t));
    let best: number[] | null = null;
    let bestScore = Infinity;
    for (const shape of candidateShapes(pcs)) {
      for (let oct = 2; oct <= 7; oct++) {
        const v = shape.map((n) => n + oct * 12);
        if (v[0] < low || v[v.length - 1] > high) continue;
        const s = scoreVoicing(v, opts.prev, center, rootPc);
        if (s < bestScore - 1e-9) {
          bestScore = s;
          best = v;
        }
      }
    }
    notes = best ?? fixedVoicing(c, key, center, maxVoices, !!opts.rootless);
  }

  if (opts.addBass && hasSlash(c)) {
    let b = notes[0] - 1;
    while (mod12(b) !== bassPc) b--;
    notes = [b, ...notes.filter((n) => n !== b)];
  }
  return { notes, bass };
}

/** Voice a whole sequence, carrying voice leading from chord to chord. */
export function voiceSequence(chords: ChordSpec[], key: Key, opts: Omit<VoicingOptions, 'prev'>): Voicing[] {
  const out: Voicing[] = [];
  let prev: number[] | null = null;
  for (const c of chords) {
    const v = voiceChord(c, key, { ...opts, prev });
    out.push(v);
    prev = v.notes;
  }
  return out;
}
