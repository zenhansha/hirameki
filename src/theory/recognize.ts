// Recognise a chord from a set of MIDI notes (piano mode, MIDI keyboard).
import { Key, degreeForOffset, mod12, scaleOf, tonicShift } from './core';
import { ChordSpec, QUALITIES, baseTones, normalizeChord, sortTensions } from './chord';

const TENSION_FOR_INTERVAL: Record<number, string> = { 1: 'b9', 2: '9', 3: '#9', 5: '11', 6: '#11', 8: 'b13', 9: '13' };
const BIG = new Set(['11', 'm11', '13', 'M13', '9sus4']);

interface Candidate {
  root: number; // absolute pc
  q: string;
  ext: string[];
  score: number;
  /** Bass played as a separate slash note (not part of the upper structure). */
  slash: boolean;
}

function bestFor(root: number, pcs: number[], bassPc: number, scale: number[], tonic: number, slash: boolean): Candidate | null {
  const ivs = new Set(pcs.map((p) => mod12(p - root)));
  let best: Candidate | null = null;
  for (const q of QUALITIES) {
    const qset = new Set(q.tones.map((t) => mod12(t[0])));
    // Quality tones that are missing (only the 5th may be omitted, and only from 4+ note chords).
    const missing = [...qset].filter((i) => !ivs.has(i));
    if (missing.length > 1 || (missing.length === 1 && missing[0] !== 7)) continue;
    if (missing.length === 1 && qset.size <= 3) continue;
    const extras = [...ivs].filter((i) => !qset.has(i));
    const ext: string[] = [];
    let ok = true;
    for (const e of extras) {
      const t = TENSION_FOR_INTERVAL[e];
      if (!t) { ok = false; break; }
      if (t === '#9' && !qset.has(4)) { ok = false; break; }
      ext.push(t);
    }
    if (!ok) continue;
    let score = 100 - extras.length * 9 - missing.length * 12 - q.tones.length * 1.5;
    if (!slash && root === bassPc) score += 14;
    if (slash) score -= 6;
    if (!slash && root !== bassPc) {
      // A bass that is only a tension of the chord reads better as a slash chord.
      const baseIv = q.tones.filter((t) => t[0] < 12).map((t) => t[0]);
      if (!baseIv.includes(mod12(bassPc - root))) score -= 10;
    }
    if (scale.includes(mod12(root - tonic))) score += 3;
    if (q.id === '5') score -= 20;
    if (q.family === 'sus') score -= 4;
    if (BIG.has(q.id)) score -= 8;
    if (q.id === '6' || q.id === 'm6') score -= 3; // prefer m7 inversions over 6 chords unless the bass says so
    if (!best || score > best.score) best = { root, q: q.id, ext, score, slash };
  }
  return best;
}

/**
 * Best chord for the notes, relative to `key`. Returns null for fewer than 2 distinct pitch classes.
 * The exact notes are kept in `notes` so piano-mode voicings play back as entered.
 */
export function recognizeChord(midi: number[], key: Key, keepNotes = true): ChordSpec | null {
  const sorted = [...new Set(midi.map((n) => Math.round(n)))].sort((a, b) => a - b);
  const pcs = [...new Set(sorted.map(mod12))];
  if (pcs.length < 2) return null;
  const bassPc = mod12(sorted[0]);
  const scale = scaleOf(key.mode);
  const tonic = mod12(key.tonic);
  // Upper structure without the bass (when the bass pitch class is not doubled above).
  const upper = sorted.slice(1).map(mod12);
  const upperPcs = upper.includes(bassPc) ? null : [...new Set(upper)];
  let best: Candidate | null = null;
  for (const root of pcs) {
    const a = bestFor(root, pcs, bassPc, scale, tonic, false);
    if (a && (!best || a.score > best.score)) best = a;
    if (upperPcs && upperPcs.length >= 3 && upperPcs.includes(root)) {
      const b = bestFor(root, upperPcs, bassPc, scale, tonic, true);
      if (b && (!best || b.score > best.score)) best = b;
    }
  }
  if (!best) return null;

  const offset = mod12(best.root - tonic);
  const { deg } = degreeForOffset(key.mode, offset);
  const spec: ChordSpec = { root: offset, deg, q: best.q };
  if (best.ext.length) spec.ext = sortTensions(best.ext);
  if (bassPc !== best.root) {
    const bt = baseTones(spec);
    const idx = best.slash ? -1 : bt.findIndex((t) => mod12(best!.root + t[0]) === bassPc);
    if (idx > 0) spec.inv = idx;
    else {
      const b = mod12(bassPc - tonic);
      spec.bass = { root: b, deg: degreeForOffset(key.mode, b).deg };
    }
  }
  if (keepNotes) {
    const shift = tonicShift(key.tonic);
    spec.notes = sorted.map((n) => n - shift);
  }
  return normalizeChord(spec);
}
