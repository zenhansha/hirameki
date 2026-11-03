// Chord qualities, chord specs, naming (chord names and roman numerals).
import {
  Key, LETTERS, accidentalFor, accidentalText, keyTonicSpelling, mod12, mod7, scaleOf, spell,
} from './core';

export type Family = 'maj' | 'min' | 'dom' | 'dim' | 'aug' | 'sus' | 'pow';

export interface QualityDef {
  id: string;
  /** Suffix in chord names, e.g. "m7(♭5)". */
  name: string;
  /** Suffix in classic roman numerals (case carries major/minor). */
  roman: string;
  /** [semitones, letter steps] above the root. */
  tones: [number, number][];
  family: Family;
  /** Short label for pickers. */
  label?: string;
}

const T = (s: number, l: number): [number, number] => [s, l];
const R = T(0, 0), m3 = T(3, 2), M3 = T(4, 2), P5 = T(7, 4), d5 = T(6, 4), a5 = T(8, 4);
const m7 = T(10, 6), M7 = T(11, 6), d7 = T(9, 6), M6 = T(9, 5), M2 = T(2, 1), P4 = T(5, 3);
const N9 = T(14, 1), b9 = T(13, 1), s9 = T(15, 1), N11 = T(17, 3), s11 = T(18, 3), b13 = T(20, 5), N13 = T(21, 5);

export const QUALITIES: QualityDef[] = [
  { id: 'M', name: '', roman: '', tones: [R, M3, P5], family: 'maj', label: 'メジャー' },
  { id: 'm', name: 'm', roman: '', tones: [R, m3, P5], family: 'min', label: 'マイナー' },
  { id: 'dim', name: 'dim', roman: '°', tones: [R, m3, d5], family: 'dim' },
  { id: 'aug', name: 'aug', roman: '+', tones: [R, M3, a5], family: 'aug' },
  { id: 'sus2', name: 'sus2', roman: 'sus2', tones: [R, M2, P5], family: 'sus' },
  { id: 'sus4', name: 'sus4', roman: 'sus4', tones: [R, P4, P5], family: 'sus' },
  { id: '5', name: '5', roman: '5', tones: [R, P5], family: 'pow', label: 'パワー' },
  { id: '7', name: '7', roman: '7', tones: [R, M3, P5, m7], family: 'dom' },
  { id: 'M7', name: 'M7', roman: 'M7', tones: [R, M3, P5, M7], family: 'maj' },
  { id: 'm7', name: 'm7', roman: '7', tones: [R, m3, P5, m7], family: 'min' },
  { id: 'm7b5', name: 'm7(♭5)', roman: 'ø7', tones: [R, m3, d5, m7], family: 'dim' },
  { id: 'dim7', name: 'dim7', roman: '°7', tones: [R, m3, d5, d7], family: 'dim' },
  { id: 'mM7', name: 'mM7', roman: 'M7', tones: [R, m3, P5, M7], family: 'min' },
  { id: '6', name: '6', roman: '6', tones: [R, M3, P5, M6], family: 'maj' },
  { id: 'm6', name: 'm6', roman: '6', tones: [R, m3, P5, M6], family: 'min' },
  { id: 'add9', name: 'add9', roman: 'add9', tones: [R, M3, P5, N9], family: 'maj' },
  { id: 'madd9', name: 'm(add9)', roman: 'add9', tones: [R, m3, P5, N9], family: 'min' },
  { id: '9', name: '9', roman: '9', tones: [R, M3, P5, m7, N9], family: 'dom' },
  { id: 'M9', name: 'M9', roman: 'M9', tones: [R, M3, P5, M7, N9], family: 'maj' },
  { id: 'm9', name: 'm9', roman: '9', tones: [R, m3, P5, m7, N9], family: 'min' },
  { id: '69', name: '6(9)', roman: '6(9)', tones: [R, M3, P5, M6, N9], family: 'maj' },
  { id: '7sus4', name: '7sus4', roman: '7sus4', tones: [R, P4, P5, m7], family: 'sus' },
  { id: '9sus4', name: '9sus4', roman: '9sus4', tones: [R, P4, P5, m7, N9], family: 'sus' },
  { id: 'add11', name: 'add11', roman: 'add11', tones: [R, M3, P5, N11], family: 'maj' },
  { id: '11', name: '11', roman: '11', tones: [R, P5, m7, N9, N11], family: 'dom' },
  { id: 'm11', name: 'm11', roman: '11', tones: [R, m3, P5, m7, N9, N11], family: 'min' },
  { id: '13', name: '13', roman: '13', tones: [R, M3, P5, m7, N9, N13], family: 'dom' },
  { id: 'M13', name: 'M13', roman: 'M13', tones: [R, M3, P5, M7, N9, N13], family: 'maj' },
  { id: '7b9', name: '7(♭9)', roman: '7(♭9)', tones: [R, M3, P5, m7, b9], family: 'dom' },
  { id: '7#9', name: '7(♯9)', roman: '7(♯9)', tones: [R, M3, P5, m7, s9], family: 'dom' },
  { id: '7#11', name: '7(♯11)', roman: '7(♯11)', tones: [R, M3, P5, m7, s11], family: 'dom' },
  { id: '7b13', name: '7(♭13)', roman: '7(♭13)', tones: [R, M3, P5, m7, b13], family: 'dom' },
  { id: 'aug7', name: 'aug7', roman: '+7', tones: [R, M3, a5, m7], family: 'aug' },
  { id: 'M7#5', name: 'M7(♯5)', roman: '+M7', tones: [R, M3, a5, M7], family: 'aug' },
  { id: 'M7#11', name: 'M7(♯11)', roman: 'M7(♯11)', tones: [R, M3, P5, M7, s11], family: 'maj' },
];

export const QUALITY_MAP: Record<string, QualityDef> = Object.fromEntries(QUALITIES.map((q) => [q.id, q]));

export function quality(id: string): QualityDef {
  return QUALITY_MAP[id] ?? QUALITY_MAP.M;
}

/** Extra tensions that can be stacked onto any chord. */
export const TENSIONS: { id: string; tone: [number, number]; name: string }[] = [
  { id: 'b9', tone: b9, name: '♭9' },
  { id: '9', tone: N9, name: '9' },
  { id: '#9', tone: s9, name: '♯9' },
  { id: '11', tone: N11, name: '11' },
  { id: '#11', tone: s11, name: '♯11' },
  { id: 'b13', tone: b13, name: '♭13' },
  { id: '13', tone: N13, name: '13' },
];
const TENSION_MAP = Object.fromEntries(TENSIONS.map((t) => [t.id, t]));
const TENSION_ORDER = TENSIONS.map((t) => t.id);

/**
 * A chord stored relative to the key: changing the key transposes it.
 * `root` = semitones above the tonic, `deg` = letter steps above the tonic letter
 * (keeps the spelling right: in F major the IV is B♭, not A♯).
 */
export interface ChordSpec {
  root: number;
  deg: number;
  q: string;
  ext?: string[];
  /** 0 = root position, 1 = 3rd in the bass, 2 = 5th, 3 = 7th. */
  inv?: number;
  /** Slash bass (overrides inv). */
  bass?: { root: number; deg: number } | null;
  /** Exact voicing from piano mode: MIDI notes minus tonicShift(tonic). */
  notes?: number[];
}

export function chordEquals(a: ChordSpec | null | undefined, b: ChordSpec | null | undefined): boolean {
  if (!a || !b) return a === b;
  return JSON.stringify(normalizeChord(a)) === JSON.stringify(normalizeChord(b));
}

export function normalizeChord(c: ChordSpec): ChordSpec {
  const out: ChordSpec = { root: mod12(c.root | 0), deg: mod7(c.deg | 0), q: QUALITY_MAP[c.q] ? c.q : 'M' };
  const ext = (c.ext ?? []).filter((e) => TENSION_MAP[e]);
  if (ext.length) out.ext = sortTensions(ext);
  const inv = c.inv ?? 0;
  if (inv > 0) out.inv = Math.min(inv, baseToneCount(out) - 1);
  if (c.bass) out.bass = { root: mod12(c.bass.root | 0), deg: mod7(c.bass.deg | 0) };
  if (c.notes && c.notes.length) out.notes = c.notes.map((n) => Math.round(n)).sort((x, y) => x - y);
  return out;
}

export function sortTensions(ext: string[]): string[] {
  return [...new Set(ext)].sort((a, b) => TENSION_ORDER.indexOf(a) - TENSION_ORDER.indexOf(b));
}

/** All tones of the chord as [semitones above root, letter steps], deduplicated by pitch class. */
export function chordTones(c: ChordSpec): [number, number][] {
  const q = quality(c.q);
  const tones: [number, number][] = [...q.tones];
  for (const e of c.ext ?? []) {
    const t = TENSION_MAP[e];
    if (t) tones.push(t.tone);
  }
  const seen = new Set<number>();
  const out: [number, number][] = [];
  for (const t of tones) {
    const pc = mod12(t[0]);
    if (seen.has(pc)) continue;
    seen.add(pc);
    out.push(t);
  }
  return out;
}

/** Tones within the first octave (root, 3rd, 5th, 7th…) — the ones that can be inverted. */
export function baseTones(c: ChordSpec): [number, number][] {
  return quality(c.q).tones.filter((t) => t[0] < 12);
}

export function baseToneCount(c: ChordSpec): number {
  return baseTones(c).length;
}

/** Bass of the chord relative to the tonic (root / inversion / slash). */
export function chordBass(c: ChordSpec): { root: number; deg: number } {
  if (c.bass) return c.bass;
  const inv = c.inv ?? 0;
  if (inv > 0) {
    const bt = baseTones(c);
    const t = bt[Math.min(inv, bt.length - 1)];
    return { root: mod12(c.root + t[0]), deg: mod7(c.deg + t[1]) };
  }
  return { root: mod12(c.root), deg: mod7(c.deg) };
}

export function hasSlash(c: ChordSpec): boolean {
  const b = chordBass(c);
  return b.root !== mod12(c.root);
}

/** Pitch classes (absolute, 0…11) of the chord in a key. */
export function chordPcs(c: ChordSpec, key: Key): number[] {
  return chordTones(c).map((t) => mod12(key.tonic + c.root + t[0]));
}

function letterOf(key: Key, deg: number): number {
  return mod7(keyTonicSpelling(key)[0] + deg);
}

export function rootName(c: { root: number; deg: number }, key: Key): string {
  return spell(letterOf(key, c.deg), key.tonic + c.root);
}

function suffixWithTensions(base: string, ext: string[] | undefined): string {
  if (!ext || !ext.length) return base;
  const names = sortTensions(ext).map((e) => TENSION_MAP[e].name).join(',');
  if (base.endsWith(')')) return base.slice(0, -1) + ',' + names + ')';
  return base + '(' + names + ')';
}

/** Chord symbol in the key, e.g. "Gm7/D", "B♭M7(9)". */
export function chordName(c: ChordSpec, key: Key): string {
  const q = quality(c.q);
  let s = rootName(c, key) + suffixWithTensions(q.name, c.ext);
  if (hasSlash(c)) s += '/' + rootName(chordBass(c), key);
  return s;
}

const NUMERALS = ['I', 'II', 'III', 'IV', 'V', 'VI', 'VII'];

export type RomanStyle = 'classic' | 'jp';

/** Accidental of a tonic-relative note against the key's own scale. */
export function degreeAccidental(key: Key, c: { root: number; deg: number }): number {
  const scale = scaleOf(key.mode);
  return mod12(c.root - scale[mod7(c.deg)] + 6) - 6;
}

/**
 * Roman numeral, e.g. classic "ii7", "♭VII", "V7/3" (bass on scale degree 3);
 * jp style uses uppercase + chord suffix: "IIm7", "IVM7".
 */
export function romanName(c: ChordSpec, key: Key, style: RomanStyle = 'classic'): string {
  const q = quality(c.q);
  const acc = accidentalText(degreeAccidental(key, c));
  const num = NUMERALS[mod7(c.deg)];
  let s: string;
  if (style === 'jp') {
    s = acc + num + suffixWithTensions(q.name, c.ext);
  } else {
    const lower = q.family === 'min' || q.family === 'dim';
    s = acc + (lower ? num.toLowerCase() : num) + suffixWithTensions(q.roman, c.ext);
  }
  if (hasSlash(c)) {
    const b = chordBass(c);
    s += '/' + accidentalText(degreeAccidental(key, b)) + (mod7(b.deg) + 1);
  }
  return s;
}

/** Note names of the chord's tones, spelled correctly ("D F♯ A C"). */
export function chordToneNames(c: ChordSpec, key: Key): string[] {
  const rootLetter = letterOf(key, c.deg);
  return chordTones(c).map((t) => spell(rootLetter + t[1], key.tonic + c.root + t[0]));
}

/** Function colour group used by the UI: T (tonic), S (subdominant), D (dominant), X (outside). */
export function chordFunction(c: ChordSpec, key: Key): 'T' | 'S' | 'D' | 'X' {
  const scale = scaleOf(key.mode);
  const pcs = chordTones(c).filter((t) => t[0] < 12).map((t) => mod12(c.root + t[0]));
  const diatonic = pcs.every((p) => scale.includes(p));
  const deg = mod7(c.deg);
  if (!diatonic && !(key.mode === 'minor' && deg === 4)) return 'X';
  if (key.mode === 'major') {
    if (deg === 0 || deg === 2 || deg === 5) return 'T';
    if (deg === 1 || deg === 3) return 'S';
    return 'D';
  }
  if (deg === 0 || deg === 2) return 'T';
  if (deg === 1 || deg === 3 || deg === 5) return 'S';
  return 'D';
}

export function makeChord(root: number, deg: number, q = 'M', extra: Partial<ChordSpec> = {}): ChordSpec {
  return normalizeChord({ root, deg, q, ...extra });
}

/** Letter name only helper for tests and labels. */
export function letterName(i: number): string {
  return LETTERS[mod7(i)];
}

export { accidentalFor };
