// Notes, keys and spelling. Everything here is pure and unit tested.

export type Mode = 'major' | 'minor';

/** A key: tonic pitch class (0 = C … 11 = B) and mode. */
export interface Key {
  tonic: number;
  mode: Mode;
}

export const LETTERS = ['C', 'D', 'E', 'F', 'G', 'A', 'B'];
export const LETTER_PC = [0, 2, 4, 5, 7, 9, 11];

export const MAJOR_SCALE = [0, 2, 4, 5, 7, 9, 11];
export const MINOR_SCALE = [0, 2, 3, 5, 7, 8, 10];

/** [letter index, accidental] used to spell each key's tonic. */
const MAJOR_KEY_SPELL: [number, number][] = [
  [0, 0], [1, -1], [1, 0], [2, -1], [2, 0], [3, 0], [3, 1], [4, 0], [5, -1], [5, 0], [6, -1], [6, 0],
]; // C Db D Eb E F F# G Ab A Bb B
const MINOR_KEY_SPELL: [number, number][] = [
  [0, 0], [0, 1], [1, 0], [2, -1], [2, 0], [3, 0], [3, 1], [4, 0], [4, 1], [5, 0], [6, -1], [6, 0],
]; // Cm C#m Dm Ebm Em Fm F#m Gm G#m Am Bbm Bm

export const mod12 = (n: number) => ((n % 12) + 12) % 12;
export const mod7 = (n: number) => ((n % 7) + 7) % 7;

export function scaleOf(mode: Mode): number[] {
  return mode === 'minor' ? MINOR_SCALE : MAJOR_SCALE;
}

/** Letter index and accidental of the key's tonic. */
export function keyTonicSpelling(key: Key): [number, number] {
  const t = mod12(key.tonic);
  return (key.mode === 'minor' ? MINOR_KEY_SPELL : MAJOR_KEY_SPELL)[t];
}

export function accidentalText(acc: number): string {
  if (acc === 0) return '';
  if (acc > 0) return '♯'.repeat(Math.min(acc, 3));
  return '♭'.repeat(Math.min(-acc, 3));
}

/** Accidental needed to spell pitch class `pc` with `letter` (range −6…5). */
export function accidentalFor(letter: number, pc: number): number {
  return mod12(pc - LETTER_PC[mod7(letter)] + 6) - 6;
}

/** Spell a pitch class using a given letter, e.g. (6, 10) → "B♭". */
export function spell(letter: number, pc: number): string {
  const l = mod7(letter);
  return LETTERS[l] + accidentalText(accidentalFor(l, pc));
}

export function keyName(key: Key): string {
  const [l, a] = keyTonicSpelling(key);
  return LETTERS[l] + accidentalText(a) + (key.mode === 'minor' ? 'm' : '');
}

/** Japanese long name, e.g. "Cメジャー" / "Aマイナー". */
export function keyNameJa(key: Key): string {
  const [l, a] = keyTonicSpelling(key);
  return LETTERS[l] + accidentalText(a) + (key.mode === 'minor' ? 'マイナー' : 'メジャー');
}

/** Does this key prefer flats when spelling chromatic notes? */
export function keyPrefersFlats(key: Key): boolean {
  const [, a] = keyTonicSpelling(key);
  if (a < 0) return true;
  if (a > 0) return false;
  // Natural tonic: F major and D/G/C minor have flats in their signatures.
  const t = mod12(key.tonic);
  if (key.mode === 'major') return t === 5;
  return t === 2 || t === 7 || t === 0 || t === 5;
}

const SHARP_NAMES = ['C', 'C♯', 'D', 'D♯', 'E', 'F', 'F♯', 'G', 'G♯', 'A', 'A♯', 'B'];
const FLAT_NAMES = ['C', 'D♭', 'D', 'E♭', 'E', 'F', 'G♭', 'G', 'A♭', 'A', 'B♭', 'B'];

/** Name of a pitch class in the context of a key (for keyboards and labels). */
export function pcName(pc: number, key?: Key): string {
  const flats = key ? keyPrefersFlats(key) : false;
  return (flats ? FLAT_NAMES : SHARP_NAMES)[mod12(pc)];
}

export function midiName(midi: number, key?: Key): string {
  return pcName(midi, key) + (Math.floor(midi / 12) - 1);
}

/**
 * Scale degree (0…6) and accidental for a semitone offset above the tonic.
 * Chromatic offsets use the usual pop/jazz choices: ♭II ♭III ♯IV ♭VI ♭VII in major,
 * ♭II ♯III ♯IV ♯VI ♯VII in minor.
 */
export function degreeForOffset(mode: Mode, offset: number): { deg: number; acc: number } {
  const o = mod12(offset);
  const scale = scaleOf(mode);
  const i = scale.indexOf(o);
  if (i >= 0) return { deg: i, acc: 0 };
  if (mode === 'major') {
    const map: Record<number, [number, number]> = { 1: [1, -1], 3: [2, -1], 6: [3, 1], 8: [5, -1], 10: [6, -1] };
    const [deg, acc] = map[o];
    return { deg, acc };
  }
  const map: Record<number, [number, number]> = { 1: [1, -1], 4: [2, 1], 6: [3, 1], 9: [5, 1], 11: [6, 1] };
  const [deg, acc] = map[o];
  return { deg, acc };
}

/** Semitone shift (−6…+5) used to place tonic-relative voicings near C. */
export function tonicShift(tonic: number): number {
  const t = mod12(tonic);
  return t >= 6 ? t - 12 : t;
}

/** All 24 keys in a friendly order for pickers. */
export function allKeys(): Key[] {
  const out: Key[] = [];
  for (let t = 0; t < 12; t++) out.push({ tonic: t, mode: 'major' });
  for (let t = 0; t < 12; t++) out.push({ tonic: t, mode: 'minor' });
  return out;
}

/** Relative major tonic for a key (itself for major keys). */
export function relativeMajorTonic(key: Key): number {
  return key.mode === 'minor' ? mod12(key.tonic + 3) : mod12(key.tonic);
}

export function midiToFreq(m: number): number {
  return 440 * Math.pow(2, (m - 69) / 12);
}

export function freqToMidi(f: number): number {
  return 69 + 12 * Math.log2(f / 440);
}
