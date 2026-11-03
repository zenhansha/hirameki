// From a pitch track to melody notes, a key guess and chord candidates per bar.
import { Key, degreeForOffset, mod12, scaleOf } from '../theory/core';
import { ChordSpec, chordTones } from '../theory/chord';
import { diatonicChord } from '../theory/diatonic';
import type { MelodyNote } from '../store/schema';

export interface PitchFrame {
  /** Song position in ticks. */
  tick: number;
  /** Fractional MIDI note, or null when unvoiced. */
  midi: number | null;
}

/** Group stable frames into notes and quantise them to `grid` ticks. */
export function segmentNotes(frames: PitchFrame[], grid = 120, minTicks = 60): MelodyNote[] {
  const notes: MelodyNote[] = [];
  let cur: { start: number; end: number; pitches: number[] } | null = null;
  const flush = () => {
    if (!cur) return;
    if (cur.end - cur.start >= minTicks && cur.pitches.length >= 2) {
      const sorted = [...cur.pitches].sort((a, b) => a - b);
      const med = sorted[Math.floor(sorted.length / 2)];
      const n = Math.round(med);
      const t = Math.round(cur.start / grid) * grid;
      const end = Math.max(t + grid, Math.round(cur.end / grid) * grid);
      const prev = notes[notes.length - 1];
      if (prev && prev.n === n && t <= prev.t + prev.len) prev.len = Math.max(prev.len, end - prev.t);
      else if (prev && t < prev.t + prev.len) {
        prev.len = Math.max(grid, t - prev.t);
        if (t > prev.t) notes.push({ t, len: end - t, n, v: 0.8 });
      } else notes.push({ t, len: end - t, n, v: 0.8 });
    }
    cur = null;
  };
  for (const f of frames) {
    if (f.midi === null) { flush(); continue; }
    if (cur && Math.abs(f.midi - median(cur.pitches)) > 0.7) flush();
    if (!cur) cur = { start: f.tick, end: f.tick, pitches: [] };
    cur.pitches.push(f.midi);
    cur.end = f.tick;
  }
  flush();
  return notes.filter((n) => n.len > 0);
}

function median(a: number[]): number {
  const s = [...a].sort((x, y) => x - y);
  return s[Math.floor(s.length / 2)];
}

// Krumhansl–Kessler key profiles.
const MAJ = [6.35, 2.23, 3.48, 2.33, 4.38, 4.09, 2.52, 5.19, 2.39, 3.66, 2.29, 2.88];
const MIN = [6.33, 2.68, 3.52, 5.38, 2.6, 3.53, 2.54, 4.75, 3.98, 2.69, 3.34, 3.17];

export function estimateKey(notes: MelodyNote[]): Key {
  const hist = new Array(12).fill(0);
  for (const n of notes) hist[mod12(n.n)] += n.len;
  let best: Key = { tonic: 0, mode: 'major' };
  let bestR = -Infinity;
  for (let t = 0; t < 12; t++) {
    for (const [mode, prof] of [['major', MAJ], ['minor', MIN]] as const) {
      let r = 0;
      for (let i = 0; i < 12; i++) r += hist[mod12(i + t)] * prof[i];
      if (r > bestR) { bestR = r; best = { tonic: t, mode }; }
    }
  }
  return best;
}

/**
 * One chord per bar that fits the hummed melody: notes that are chord tones score, strong-beat
 * notes score more, and smooth functional moves get a small bonus (Viterbi over diatonic chords).
 */
export function chordsForMelody(notes: MelodyNote[], key: Key, barTicks: number, bars: number): ChordSpec[] {
  const cands = [0, 1, 2, 3, 4, 5, 6].map((d) => diatonicChord(key, d));
  const scale = scaleOf(key.mode);
  const fit = (c: ChordSpec, bar: number) => {
    const pcs = chordTones(c).map((t) => mod12(key.tonic + c.root + t[0]));
    let s = 0;
    for (const n of notes) {
      const a = Math.max(n.t, bar * barTicks), b = Math.min(n.t + n.len, (bar + 1) * barTicks);
      if (b <= a) continue;
      const w = (b - a) / barTicks;
      const strong = (n.t - bar * barTicks) % (barTicks / 2) === 0 ? 1.6 : 1;
      const pc = mod12(n.n);
      if (pcs.includes(pc)) s += 2 * w * strong;
      else if (scale.includes(mod12(pc - key.tonic))) s -= 0.3 * w;
      else s -= 1 * w;
    }
    return s;
  };
  const trans = (a: number, b: number) => {
    // Degree moves that sound natural.
    const good: Record<number, number[]> = { 0: [3, 4, 5, 1], 1: [4, 6], 2: [5, 3], 3: [4, 0, 1, 2], 4: [0, 5], 5: [3, 1, 4], 6: [0, 2] };
    if (a === b) return -0.2;
    return good[a]?.includes(b) ? 0.6 : 0;
  };
  const n = Math.max(1, bars);
  let score = cands.map((c, i) => fit(c, 0) + (i === 0 ? 0.8 : 0));
  const back: number[][] = [];
  for (let bar = 1; bar < n; bar++) {
    const next: number[] = [];
    const bp: number[] = [];
    for (let j = 0; j < 7; j++) {
      let best = -Infinity, arg = 0;
      for (let i = 0; i < 7; i++) {
        const v = score[i] + trans(i, j);
        if (v > best) { best = v; arg = i; }
      }
      next.push(best + fit(cands[j], bar) + (bar === n - 1 && (j === 0 || j === 4) ? 0.4 : 0));
      bp.push(arg);
    }
    score = next;
    back.push(bp);
  }
  let j = score.indexOf(Math.max(...score));
  const path = [j];
  for (let k = back.length - 1; k >= 0; k--) { j = back[k][j]; path.unshift(j); }
  return path.map((d) => cands[d]);
}

/** Nearest diatonic chord whose root is the hummed pitch class. */
export function chordForRoot(pc: number, key: Key): ChordSpec {
  const scale = scaleOf(key.mode);
  const off = mod12(pc - key.tonic);
  const deg = scale.indexOf(off);
  if (deg >= 0) return diatonicChord(key, deg);
  const { deg: d } = degreeForOffset(key.mode, off);
  return { root: off, deg: d, q: 'M' };
}
