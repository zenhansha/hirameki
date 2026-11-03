// Diatonic chords, non-diatonic palettes and chord "modifiers" (7th, sus4, …).
import { Key, degreeForOffset, mod12, mod7, scaleOf } from './core';
import { ChordSpec, QUALITY_MAP, baseToneCount, makeChord, normalizeChord, quality, sortTensions } from './chord';

const MAJOR_TRIADS = ['M', 'm', 'm', 'M', 'M', 'm', 'dim'];
const MAJOR_7THS = ['M7', 'm7', 'm7', 'M7', '7', 'm7', 'm7b5'];
const MINOR_TRIADS = ['m', 'dim', 'M', 'm', 'm', 'M', 'M'];
const MINOR_7THS = ['m7', 'm7b5', 'M7', 'm7', 'm7', 'M7', '7'];

export function diatonicQuality(key: Key, deg: number, seventh: boolean): string {
  const d = mod7(deg);
  if (key.mode === 'minor') return (seventh ? MINOR_7THS : MINOR_TRIADS)[d];
  return (seventh ? MAJOR_7THS : MAJOR_TRIADS)[d];
}

export function diatonicChord(key: Key, deg: number, seventh = false): ChordSpec {
  const d = mod7(deg);
  return makeChord(scaleOf(key.mode)[d], d, diatonicQuality(key, d, seventh));
}

export function diatonicChords(key: Key, seventh = false): ChordSpec[] {
  return [0, 1, 2, 3, 4, 5, 6].map((d) => diatonicChord(key, d, seventh));
}

/** Chord on any semitone offset above the tonic with a spelling that suits the key. */
export function chordOnOffset(key: Key, offset: number, q = 'M'): ChordSpec {
  const { deg } = degreeForOffset(key.mode, offset);
  return makeChord(mod12(offset), deg, q);
}

export interface PaletteEntry {
  chord: ChordSpec;
  /** Function label shown under the chord, e.g. "V/V". */
  role: string;
  group: 'secondary' | 'borrowed' | 'other';
  hint: string;
}

function entry(root: number, deg: number, q: string, role: string, group: PaletteEntry['group'], hint: string, extra: Partial<ChordSpec> = {}): PaletteEntry {
  return { chord: makeChord(root, deg, q, extra), role, group, hint };
}

/** Non-diatonic chords that are actually useful in pop music. */
export function nonDiatonicPalette(key: Key, seventh = true): PaletteEntry[] {
  const dom = seventh ? '7' : 'M';
  if (key.mode === 'major') {
    return [
      entry(2, 1, dom, 'V/V', 'secondary', 'Vへ向かう強い推進力'),
      entry(4, 2, dom, 'V/vi', 'secondary', 'viへ。切なさの定番（王道の変形・丸サ）'),
      entry(9, 5, dom, 'V/ii', 'secondary', 'iiへ。循環をおしゃれに'),
      entry(0, 0, dom, 'V/IV', 'secondary', 'IVへ。ブルージーな広がり'),
      entry(11, 6, dom, 'V/iii', 'secondary', 'iiiへ'),
      entry(5, 3, seventh ? 'm6' : 'm', 'iv', 'borrowed', 'サブドミナントマイナー。泣きの定番'),
      entry(8, 5, seventh ? 'M7' : 'M', '♭VI', 'borrowed', '同主短調から借用。壮大・ドラマチック'),
      entry(10, 6, seventh ? '7' : 'M', '♭VII', 'borrowed', '同主短調から借用。ロックっぽい明るさ'),
      entry(3, 2, seventh ? 'M7' : 'M', '♭III', 'borrowed', '同主短調から借用。意外性のある明るさ'),
      entry(2, 1, 'm7b5', 'iiø7', 'borrowed', '短調のii。切ない'),
      entry(7, 4, seventh ? 'm7' : 'm', 'v', 'borrowed', 'Vのマイナー版。丸サ/Just the Two of Usで使う'),
      entry(1, 1, seventh ? 'M7' : 'M', '♭II', 'borrowed', 'ナポリの和音。不思議な浮遊感'),
      entry(6, 3, 'm7b5', '♯ivø7', 'other', 'IV→♯ivø7→I/5 の経過和音'),
      entry(1, 0, 'dim7', '♯i°7', 'other', 'I→♯i°7→ii のパッシングディミニッシュ'),
      entry(3, 1, 'dim7', '♯ii°7', 'other', 'ii→♯ii°7→iii の経過和音'),
      entry(0, 0, 'aug', 'I+', 'other', 'クリシェ。I→I+→I6'),
      entry(5, 3, 'M', 'IV/V', 'other', 'ポップスの定番テンションドミナント', { bass: { root: 7, deg: 4 } }),
      entry(7, 4, '7sus4', 'V7sus4', 'other', '解決前のじらし'),
    ];
  }
  return [
    entry(7, 4, dom, 'V', 'secondary', '和声的短音階のV。強く解決'),
    entry(11, 6, 'dim7', 'vii°7', 'secondary', '導音のディミニッシュ'),
    entry(0, 0, dom, 'V/iv', 'secondary', 'ivへ向かう'),
    entry(2, 1, dom, 'V/V', 'secondary', 'Vへ向かう'),
    entry(5, 3, seventh ? '7' : 'M', 'IV', 'borrowed', 'ドリアンのIV。明るい陰り'),
    entry(0, 0, seventh ? 'M7' : 'M', 'I', 'borrowed', 'ピカルディの3度。最後に明るく'),
    entry(1, 1, seventh ? 'M7' : 'M', '♭II', 'borrowed', 'ナポリの和音'),
    entry(9, 5, 'm7b5', '♯viø7', 'other', 'メロディックマイナー由来'),
    entry(2, 1, seventh ? 'm7' : 'm', 'ii', 'other', 'ドリアンのii'),
    entry(7, 4, '7sus4', 'V7sus4', 'other', '解決前のじらし'),
  ];
}

// ---- modifiers -------------------------------------------------------------

function triadOf(q: string): string {
  const def = quality(q);
  switch (def.family) {
    case 'maj': case 'dom': return 'M';
    case 'min': return 'm';
    case 'dim': return 'dim';
    case 'aug': return 'aug';
    case 'pow': return '5';
    case 'sus': return q === 'sus2' ? 'sus2' : 'sus4';
  }
}

function hasSeventh(q: string): boolean {
  return quality(q).tones.some((t) => t[0] === 10 || t[0] === 11 || (t[0] === 9 && t[1] === 6));
}

function clean(c: ChordSpec, q: string, patch: Partial<ChordSpec> = {}): ChordSpec {
  const out: ChordSpec = { ...c, q, ...patch };
  delete out.notes;
  // Drop tensions that are now part of the quality.
  if (out.ext) out.ext = out.ext.filter((e) => !(QUALITY_MAP[q].tones.some((t) => t[0] >= 12 && tensionOf(t[0]) === e)));
  const n = normalizeChord(out);
  if ((n.inv ?? 0) >= baseToneCount(n)) delete n.inv;
  return n;
}

function tensionOf(semi: number): string {
  return ({ 13: 'b9', 14: '9', 15: '#9', 17: '11', 18: '#11', 20: 'b13', 21: '13' } as Record<number, string>)[semi] ?? '';
}

export type ModifierId =
  | 'triad' | 'seventh' | 'dom7' | 'maj7' | 'sus2' | 'sus4' | 'add9' | 'six' | 'swapMm'
  | 'dim' | 'aug' | 'power' | 'inv' | 'clearBass';

/** Apply a quick modifier to a chord. `key` is used for "diatonic" decisions. */
export function applyModifier(c: ChordSpec, mod: ModifierId, key: Key): ChordSpec {
  const tri = triadOf(c.q);
  const scale = scaleOf(key.mode);
  const inScale = (semi: number) => scale.includes(mod12(c.root + semi));
  switch (mod) {
    case 'triad':
      return clean(c, tri, { ext: undefined });
    case 'seventh': {
      if (hasSeventh(c.q)) return clean(c, tri);
      if (tri === 'M') return clean(c, inScale(0) && inScale(11) ? 'M7' : '7');
      if (tri === 'm') return clean(c, 'm7');
      if (tri === 'dim') return clean(c, inScale(10) || !inScale(9) ? 'm7b5' : 'dim7');
      if (tri === 'aug') return clean(c, 'aug7');
      if (tri === 'sus4') return clean(c, '7sus4');
      return c;
    }
    case 'dom7': {
      const map: Record<string, string> = { M: '7', m: 'm7', dim: 'm7b5', aug: 'aug7', sus4: '7sus4', sus2: '7sus4', '5': '7' };
      if (c.q === '7' || c.q === 'm7' || c.q === 'm7b5' || c.q === 'aug7' || c.q === '7sus4') return clean(c, tri);
      return clean(c, map[tri] ?? '7');
    }
    case 'maj7': {
      if (c.q === 'M7' || c.q === 'mM7' || c.q === 'M7#5') return clean(c, tri);
      const map: Record<string, string> = { M: 'M7', m: 'mM7', aug: 'M7#5' };
      return clean(c, map[tri] ?? 'M7');
    }
    case 'sus2':
      if (c.q === 'sus2') return clean(c, majMinFor(c, key));
      return clean(c, 'sus2');
    case 'sus4':
      if (c.q === 'sus4' || c.q === '7sus4') return clean(c, c.q === '7sus4' ? '7' : majMinFor(c, key));
      return clean(c, hasSeventh(c.q) && quality(c.q).family !== 'maj' ? '7sus4' : 'sus4');
    case 'add9': {
      if (c.q === 'add9') return clean(c, 'M');
      if (c.q === 'madd9') return clean(c, 'm');
      if (tri === 'M' && !hasSeventh(c.q) && c.q !== '6') return clean(c, 'add9');
      if (tri === 'm' && !hasSeventh(c.q) && c.q !== 'm6') return clean(c, 'madd9');
      return toggleTension(c, '9');
    }
    case 'six': {
      if (c.q === '6') return clean(c, 'M');
      if (c.q === 'm6') return clean(c, 'm');
      return clean(c, tri === 'm' || tri === 'dim' ? 'm6' : '6');
    }
    case 'swapMm': {
      const toMinor: Record<string, string> = { M: 'm', '7': 'm7', M7: 'm7', '6': 'm6', add9: 'madd9', '9': 'm9', M9: 'm9', '11': 'm11', '13': 'm11', sus2: 'm', sus4: 'm', '7sus4': 'm7', aug: 'm', aug7: 'm7', dim: 'm', m7b5: 'm7', dim7: 'm7', '5': 'm' };
      const toMajor: Record<string, string> = { m: 'M', m7: '7', mM7: 'M7', m6: '6', madd9: 'add9', m9: '9', m11: '11' };
      const fam = quality(c.q).family;
      if (fam === 'min') return clean(c, toMajor[c.q] ?? 'M');
      return clean(c, toMinor[c.q] ?? 'm');
    }
    case 'dim':
      if (c.q === 'dim') return clean(c, majMinFor(c, key));
      return clean(c, hasSeventh(c.q) ? 'm7b5' : 'dim');
    case 'aug':
      if (c.q === 'aug') return clean(c, 'M');
      return clean(c, c.q === '7' ? 'aug7' : 'aug');
    case 'power':
      if (c.q === '5') return clean(c, majMinFor(c, key));
      return clean(c, '5', { ext: undefined });
    case 'inv': {
      const n = baseToneCount(c);
      const next = ((c.bass ? 0 : c.inv ?? 0) + 1) % n;
      const out = { ...c, inv: next, bass: null } as ChordSpec;
      delete out.notes;
      return normalizeChord(out);
    }
    case 'clearBass': {
      const out = { ...c, inv: 0, bass: null } as ChordSpec;
      delete out.notes;
      return normalizeChord(out);
    }
  }
}

/** Major or minor triad, whichever is diatonic on this root (major if neither). */
function majMinFor(c: ChordSpec, key: Key): string {
  const scale = scaleOf(key.mode);
  const pc = (s: number) => scale.includes(mod12(c.root + s));
  if (pc(3) && pc(7) && !pc(4)) return 'm';
  return 'M';
}

export function toggleTension(c: ChordSpec, t: string): ChordSpec {
  const ext = new Set(c.ext ?? []);
  if (ext.has(t)) ext.delete(t);
  else {
    ext.add(t);
    // Mutually exclusive alterations.
    if (t === '9') { ext.delete('b9'); ext.delete('#9'); }
    if (t === 'b9' || t === '#9') ext.delete('9');
    if (t === '11') ext.delete('#11');
    if (t === '#11') ext.delete('11');
    if (t === '13') ext.delete('b13');
    if (t === 'b13') ext.delete('13');
  }
  const out = { ...c, ext: sortTensions([...ext]) };
  delete out.notes;
  return normalizeChord(out);
}

export function setSlashBass(c: ChordSpec, key: Key, bassOffset: number | null): ChordSpec {
  const out = { ...c } as ChordSpec;
  delete out.notes;
  if (bassOffset === null || mod12(bassOffset) === mod12(c.root)) {
    out.bass = null;
    out.inv = 0;
    return normalizeChord(out);
  }
  const { deg } = degreeForOffset(key.mode, bassOffset);
  out.bass = { root: mod12(bassOffset), deg };
  out.inv = 0;
  return normalizeChord(out);
}

/** Which modifiers are "on" for a chord (for highlighting the chips). */
export function activeModifiers(c: ChordSpec): Set<ModifierId> {
  const s = new Set<ModifierId>();
  const q = c.q;
  const fam = quality(q).family;
  if (['M', 'm', 'dim', 'aug'].includes(q) && !(c.ext?.length)) s.add('triad');
  if (hasSeventh(q)) s.add('seventh');
  if (['7', 'm7', 'm7b5', 'aug7', '7sus4', '9', 'm9', '13', '11', 'm11'].includes(q)) s.add('dom7');
  if (['M7', 'mM7', 'M7#5', 'M9', 'M13', 'M7#11'].includes(q)) s.add('maj7');
  if (q === 'sus2') s.add('sus2');
  if (q === 'sus4' || q === '7sus4' || q === '9sus4') s.add('sus4');
  if (q === 'add9' || q === 'madd9' || (c.ext ?? []).includes('9')) s.add('add9');
  if (q === '6' || q === 'm6' || q === '69') s.add('six');
  if (q === 'dim' || q === 'm7b5' || q === 'dim7') s.add('dim');
  if (fam === 'aug') s.add('aug');
  if (q === '5') s.add('power');
  if ((c.inv ?? 0) > 0 || c.bass) s.add('inv');
  return s;
}
