import { describe, expect, it } from 'vitest';
import { Key, keyName, pcName, spell, degreeForOffset, accidentalFor } from '../../src/theory/core';
import {
  ChordSpec, chordName, romanName, chordToneNames, chordBass, makeChord, chordPcs, chordFunction, normalizeChord,
} from '../../src/theory/chord';
import { applyModifier, diatonicChord, diatonicChords, nonDiatonicPalette, setSlashBass, toggleTension, activeModifiers } from '../../src/theory/diatonic';
import { voiceChord, voiceSequence, voiceMotion } from '../../src/theory/voicing';
import { recognizeChord } from '../../src/theory/recognize';
import { detectProgressions } from '../../src/theory/progressions';
import { suggestNext } from '../../src/theory/suggest';
import { rekeyChord, transposeKey } from '../../src/theory/transpose';

const C: Key = { tonic: 0, mode: 'major' };
const F: Key = { tonic: 5, mode: 'major' };
const Eb: Key = { tonic: 3, mode: 'major' };
const Fs: Key = { tonic: 6, mode: 'major' };
const Am: Key = { tonic: 9, mode: 'minor' };
const Gsm: Key = { tonic: 8, mode: 'minor' };

const names = (k: Key, sev = false) => diatonicChords(k, sev).map((c) => chordName(c, k));
const romans = (k: Key, sev = false, style: 'classic' | 'jp' = 'classic') => diatonicChords(k, sev).map((c) => romanName(c, k, style));

describe('spelling', () => {
  it('spells notes with letters', () => {
    expect(spell(6, 10)).toBe('B♭');
    expect(spell(2, 5)).toBe('E♯');
    expect(spell(3, 7)).toBe('F♯♯');
    expect(accidentalFor(0, 11)).toBe(-1);
  });
  it('names keys', () => {
    expect(keyName(C)).toBe('C');
    expect(keyName({ tonic: 1, mode: 'major' })).toBe('D♭');
    expect(keyName({ tonic: 1, mode: 'minor' })).toBe('C♯m');
    expect(keyName({ tonic: 10, mode: 'minor' })).toBe('B♭m');
  });
  it('uses flats/sharps by key', () => {
    expect(pcName(10, F)).toBe('B♭');
    expect(pcName(6, { tonic: 7, mode: 'major' })).toBe('F♯');
    expect(pcName(1, { tonic: 2, mode: 'minor' })).toBe('D♭');
  });
  it('maps chromatic offsets to degrees', () => {
    expect(degreeForOffset('major', 10)).toEqual({ deg: 6, acc: -1 });
    expect(degreeForOffset('major', 6)).toEqual({ deg: 3, acc: 1 });
    expect(degreeForOffset('minor', 11)).toEqual({ deg: 6, acc: 1 });
  });
});

describe('diatonic chords', () => {
  it('C major triads and 7ths', () => {
    expect(names(C)).toEqual(['C', 'Dm', 'Em', 'F', 'G', 'Am', 'Bdim']);
    expect(names(C, true)).toEqual(['CM7', 'Dm7', 'Em7', 'FM7', 'G7', 'Am7', 'Bm7(♭5)']);
  });
  it('spells flat keys correctly (IV of F is B♭, not A♯)', () => {
    expect(names(F)).toEqual(['F', 'Gm', 'Am', 'B♭', 'C', 'Dm', 'Edim']);
    expect(names(Eb)).toEqual(['E♭', 'Fm', 'Gm', 'A♭', 'B♭', 'Cm', 'Ddim']);
  });
  it('spells sharp keys with E♯', () => {
    expect(names(Fs)).toEqual(['F♯', 'G♯m', 'A♯m', 'B', 'C♯', 'D♯m', 'E♯dim']);
  });
  it('minor keys use natural minor', () => {
    expect(names(Am)).toEqual(['Am', 'Bdim', 'C', 'Dm', 'Em', 'F', 'G']);
    expect(romans(Am)).toEqual(['i', 'ii°', 'III', 'iv', 'v', 'VI', 'VII']);
  });
  it('roman numerals classic and Japanese style', () => {
    expect(romans(C)).toEqual(['I', 'ii', 'iii', 'IV', 'V', 'vi', 'vii°']);
    expect(romans(C, true)).toEqual(['IM7', 'ii7', 'iii7', 'IVM7', 'V7', 'vi7', 'viiø7']);
    expect(romans(C, true, 'jp')).toEqual(['IM7', 'IIm7', 'IIIm7', 'IVM7', 'V7', 'VIm7', 'VIIm7(♭5)']);
  });
  it('harmonic V in minor with leading tone spelled as F𝄪 in G♯ minor', () => {
    const V = makeChord(7, 4, 'M');
    expect(chordName(V, Gsm)).toBe('D♯');
    expect(chordToneNames(V, Gsm)).toEqual(['D♯', 'F♯♯', 'A♯']);
  });
});

describe('chord names, inversions, tensions', () => {
  it('slash chords and inversions', () => {
    const c1 = makeChord(0, 0, 'M', { inv: 1 });
    expect(chordName(c1, C)).toBe('C/E');
    expect(romanName(c1, C)).toBe('I/3');
    const g7 = makeChord(7, 4, '7', { inv: 3 });
    expect(chordName(g7, C)).toBe('G7/F');
    const gm = makeChord(9, 5, 'm', { inv: 2 });
    expect(chordName(gm, F)).toBe('Dm/A');
    const fOnG = makeChord(5, 3, 'M', { bass: { root: 7, deg: 4 } });
    expect(chordName(fOnG, C)).toBe('F/G');
    expect(romanName(fOnG, C)).toBe('IV/5');
    expect(chordBass(fOnG)).toEqual({ root: 7, deg: 4 });
  });
  it('user example: Gm/D style in B♭ major', () => {
    const Bb: Key = { tonic: 10, mode: 'major' };
    const vi = diatonicChord(Bb, 5); // Gm
    expect(chordName({ ...vi, inv: 2 }, Bb)).toBe('Gm/D');
  });
  it('tensions', () => {
    let c = makeChord(0, 0, 'M7');
    c = toggleTension(c, '9');
    expect(chordName(c, C)).toBe('CM7(9)');
    c = toggleTension(c, '13');
    expect(chordName(c, C)).toBe('CM7(9,13)');
    const half = toggleTension(makeChord(11, 6, 'm7b5'), '11');
    expect(chordName(half, C)).toBe('Bm7(♭5,11)');
    // mutually exclusive alterations
    const alt = toggleTension(toggleTension(makeChord(7, 4, '7'), '9'), 'b9');
    expect(alt.ext).toEqual(['b9']);
  });
  it('tone names are spelled', () => {
    expect(chordToneNames(makeChord(2, 1, '7'), C)).toEqual(['D', 'F♯', 'A', 'C']);
    expect(chordToneNames(makeChord(10, 6, 'M'), C)).toEqual(['B♭', 'D', 'F']);
  });
  it('borrowed chords roman with accidentals', () => {
    expect(romanName(makeChord(10, 6, 'M'), C)).toBe('♭VII');
    expect(romanName(makeChord(8, 5, 'M7'), C)).toBe('♭VIM7');
    expect(romanName(makeChord(5, 3, 'm'), C)).toBe('iv');
    expect(chordName(makeChord(8, 5, 'M'), C)).toBe('A♭');
  });
  it('function colours', () => {
    expect(chordFunction(diatonicChord(C, 0), C)).toBe('T');
    expect(chordFunction(diatonicChord(C, 3), C)).toBe('S');
    expect(chordFunction(diatonicChord(C, 4, true), C)).toBe('D');
    expect(chordFunction(makeChord(10, 6, 'M'), C)).toBe('X');
  });
  it('normalize clamps garbage', () => {
    const c = normalizeChord({ root: 25, deg: -1, q: 'nope', ext: ['9', 'x', '9'], inv: 9 } as ChordSpec);
    expect(c).toEqual({ root: 1, deg: 6, q: 'M', ext: ['9'], inv: 2 });
  });
  it('pitch classes follow the key', () => {
    expect(chordPcs(diatonicChord(F, 3), F)).toEqual([10, 2, 5]);
  });
});

describe('modifiers', () => {
  const I = diatonicChord(C, 0);
  const V = diatonicChord(C, 4);
  const ii = diatonicChord(C, 1);
  it('seventh uses diatonic sevenths', () => {
    expect(applyModifier(I, 'seventh', C).q).toBe('M7');
    expect(applyModifier(V, 'seventh', C).q).toBe('7');
    expect(applyModifier(ii, 'seventh', C).q).toBe('m7');
    expect(applyModifier(diatonicChord(C, 6), 'seventh', C).q).toBe('m7b5');
    // borrowed ♭VII gets a dominant 7
    expect(applyModifier(makeChord(10, 6, 'M'), 'seventh', C).q).toBe('7');
    // toggles back
    expect(applyModifier(applyModifier(I, 'seventh', C), 'seventh', C).q).toBe('M');
  });
  it('sus, add9, six, swap, dim, aug, power', () => {
    expect(applyModifier(V, 'sus4', C).q).toBe('sus4');
    expect(applyModifier(applyModifier(V, 'sus4', C), 'sus4', C).q).toBe('M');
    expect(applyModifier(applyModifier(V, 'seventh', C), 'sus4', C).q).toBe('7sus4');
    expect(applyModifier(I, 'sus2', C).q).toBe('sus2');
    expect(applyModifier(ii, 'sus2', C).q).toBe('sus2');
    expect(applyModifier(applyModifier(ii, 'sus2', C), 'sus2', C).q).toBe('m');
    expect(applyModifier(I, 'add9', C).q).toBe('add9');
    expect(applyModifier(ii, 'add9', C).q).toBe('madd9');
    expect(applyModifier(applyModifier(I, 'seventh', C), 'add9', C).ext).toEqual(['9']);
    expect(applyModifier(diatonicChord(C, 3), 'six', C).q).toBe('6');
    expect(applyModifier(diatonicChord(C, 3), 'swapMm', C).q).toBe('m');
    expect(applyModifier(ii, 'swapMm', C).q).toBe('M');
    expect(applyModifier(applyModifier(ii, 'seventh', C), 'swapMm', C).q).toBe('7');
    expect(applyModifier(I, 'dim', C).q).toBe('dim');
    expect(applyModifier(I, 'aug', C).q).toBe('aug');
    expect(applyModifier(I, 'power', C).q).toBe('5');
    expect(applyModifier(applyModifier(I, 'power', C), 'power', C).q).toBe('M');
  });
  it('inversion cycles through chord tones', () => {
    let c = I;
    const seen: string[] = [];
    for (let i = 0; i < 4; i++) { c = applyModifier(c, 'inv', C); seen.push(chordName(c, C)); }
    expect(seen).toEqual(['C/E', 'C/G', 'C', 'C/E']);
    const g7 = applyModifier(applyModifier(applyModifier(V, 'seventh', C), 'inv', C), 'inv', C);
    expect(chordName(applyModifier(g7, 'inv', C), C)).toBe('G7/F');
  });
  it('slash bass', () => {
    const s = setSlashBass(diatonicChord(C, 3), C, 7);
    expect(chordName(s, C)).toBe('F/G');
    expect(chordName(setSlashBass(s, C, null), C)).toBe('F');
    expect(chordName(setSlashBass(I, C, 10), C)).toBe('C/B♭');
  });
  it('modifiers clear piano voicings and report state', () => {
    const p = { ...I, notes: [48, 52, 55] };
    expect(applyModifier(p, 'seventh', C).notes).toBeUndefined();
    const act = activeModifiers(applyModifier(V, 'seventh', C));
    expect(act.has('seventh')).toBe(true);
    expect(act.has('dom7')).toBe(true);
    expect(act.has('maj7')).toBe(false);
  });
  it('non-diatonic palette contains secondary dominants and borrowed chords', () => {
    const pal = nonDiatonicPalette(C);
    const n = pal.map((p) => chordName(p.chord, C));
    expect(n).toContain('D7');
    expect(n).toContain('E7');
    expect(n).toContain('A7');
    expect(n).toContain('Fm6');
    expect(n).toContain('B♭7');
    expect(n).toContain('A♭M7');
    const pm = nonDiatonicPalette(Am).map((p) => chordName(p.chord, Am));
    expect(pm).toContain('E7');
    expect(pm).toContain('G♯dim7');
  });
});

describe('recognition', () => {
  const rec = (notes: number[], k: Key = C) => {
    const c = recognizeChord(notes, k, false);
    return c ? chordName(c, k) : null;
  };
  it('triads and sevenths', () => {
    expect(rec([60, 64, 67])).toBe('C');
    expect(rec([64, 67, 72])).toBe('C/E');
    expect(rec([55, 60, 64])).toBe('C/G');
    expect(rec([60, 64, 67, 70])).toBe('C7');
    expect(rec([57, 60, 64, 67])).toBe('Am7');
    expect(rec([60, 64, 67, 69])).toBe('C6');
    expect(rec([53, 57, 60, 64])).toBe('FM7');
    expect(rec([59, 62, 65])).toBe('Bdim');
    expect(rec([60, 62, 67])).toBe('Csus2');
    expect(rec([60, 65, 67])).toBe('Csus4');
    expect(rec([60, 63, 66, 69])).toBe('Cdim7');
  });
  it('omitted fifth and tensions', () => {
    expect(rec([60, 64, 70])).toBe('C7');
    expect(rec([60, 64, 67, 71, 74])).toBe('CM9');
    expect(rec([48, 64, 67, 70, 74])).toBe('C9');
  });
  it('slash bass that is not a chord tone', () => {
    expect(rec([43, 53, 57, 60])).toBe('F/G');
  });
  it('fewer than two pitch classes is null', () => {
    expect(recognizeChord([60], C)).toBeNull();
    expect(recognizeChord([60, 72], C)).toBeNull();
  });
  it('relative to the key and keeps notes', () => {
    const c = recognizeChord([62, 65, 69], F)!;
    expect(chordName(c, F)).toBe('Dm');
    expect(romanName(c, F)).toBe('vi');
    expect(c.notes?.length).toBe(3);
    const v = voiceChord(c, F, { auto: true });
    expect(v.notes).toEqual([62, 65, 69]);
  });
});

describe('voicing', () => {
  const prog = [0, 5, 3, 4].map((d) => diatonicChord(C, d)); // C Am F G
  it('auto voicing moves smoothly', () => {
    const vs = voiceSequence(prog, C, { auto: true });
    for (let i = 1; i < vs.length; i++) expect(voiceMotion(vs[i - 1].notes, vs[i].notes)).toBeLessThanOrEqual(5);
    for (const v of vs) {
      expect(v.notes[0]).toBeGreaterThanOrEqual(50);
      expect(v.notes[v.notes.length - 1]).toBeLessThanOrEqual(81);
    }
  });
  it('auto voicing beats fixed root position on motion', () => {
    const auto = voiceSequence(prog, C, { auto: true });
    const fixed = voiceSequence(prog, C, { auto: false });
    const total = (vs: typeof auto) => vs.slice(1).reduce((s, v, i) => s + voiceMotion(vs[i].notes, v.notes), 0);
    expect(total(auto)).toBeLessThan(total(fixed));
  });
  it('fixed voicing applies the inversion', () => {
    const v = voiceChord(makeChord(0, 0, 'M', { inv: 1 }), C, { auto: false });
    expect(v.notes[0] % 12).toBe(4);
    const v2 = voiceChord(makeChord(0, 0, 'M', { inv: 2 }), C, { auto: false });
    expect(v2.notes[0] % 12).toBe(7);
  });
  it('bass note follows slash/inversion', () => {
    expect(voiceChord(makeChord(0, 0, 'M', { inv: 1 }), C, { auto: true }).bass % 12).toBe(4);
    expect(voiceChord(makeChord(5, 3, 'M', { bass: { root: 7, deg: 4 } }), C, { auto: true }).bass % 12).toBe(7);
    const b = voiceChord(diatonicChord(C, 0), { tonic: 9, mode: 'major' }, { auto: true }).bass;
    expect(b).toBeGreaterThanOrEqual(33);
    expect(b).toBeLessThanOrEqual(44);
  });
  it('adds the slash bass under the voicing when no bass track plays', () => {
    const v = voiceChord(makeChord(0, 0, 'M', { inv: 1 }), C, { auto: true, addBass: true });
    expect(v.notes[0] % 12).toBe(4);
    expect(v.notes[0]).toBeLessThan(v.notes[1]);
  });
  it('limits the number of voices for big chords', () => {
    const v = voiceChord(makeChord(7, 4, '13'), C, { auto: true, maxVoices: 4 });
    expect(v.notes.length).toBe(4);
    // keeps the 3rd and 7th (B and F)
    const pcs = v.notes.map((n) => n % 12);
    expect(pcs).toContain(11);
    expect(pcs).toContain(5);
  });
  it('is deterministic', () => {
    expect(voiceSequence(prog, C, { auto: true })).toEqual(voiceSequence(prog, C, { auto: true }));
  });
  it('every key stays in range', () => {
    for (let t = 0; t < 12; t++) {
      const k: Key = { tonic: t, mode: 'major' };
      const vs = voiceSequence([0, 4, 5, 3, 6, 1].map((d) => diatonicChord(k, d, true)), k, { auto: true });
      for (const v of vs) {
        expect(Math.min(...v.notes)).toBeGreaterThanOrEqual(50);
        expect(Math.max(...v.notes)).toBeLessThanOrEqual(81);
      }
    }
  });
});

describe('progression detection', () => {
  const seq = (k: Key, degs: number[], sev = false) => degs.map((d) => diatonicChord(k, d, sev));
  const names = (cs: ChordSpec[], k: Key, cyclic = false) => detectProgressions(cs, k, { cyclic }).map((m) => m.def.name);
  it('王道進行', () => {
    expect(names(seq(C, [3, 4, 2, 5]), C)).toContain('王道進行');
    expect(names(seq(C, [3, 4, 2, 5], true), C)).toContain('王道進行');
    expect(names(seq({ tonic: 2, mode: 'major' }, [3, 4, 2, 5]), { tonic: 2, mode: 'major' })).toContain('王道進行');
  });
  it('丸サ進行 / Just the Two of Us', () => {
    const cs = [makeChord(5, 3, 'M7'), makeChord(4, 2, '7'), makeChord(9, 5, 'm7'), makeChord(7, 4, 'm7'), makeChord(0, 0, '7')];
    const m = detectProgressions(cs, C);
    expect(m[0].def.name).toBe('丸サ進行');
    expect(m[0].def.aliases).toContain('Just the Two of Us進行');
    expect(m[0].length).toBe(5);
  });
  it('カノン進行 (full and first half)', () => {
    expect(names(seq(C, [0, 4, 5, 2, 3, 0, 3, 4]), C)[0]).toBe('カノン進行');
    const half = detectProgressions(seq(C, [0, 4, 5, 2]), C);
    expect(half[0].def.name).toBe('カノン進行');
    expect(half[0].length).toBe(4);
  });
  it('小室進行 in major and in the relative minor', () => {
    expect(names(seq(C, [5, 3, 4, 0]), C)).toContain('小室進行');
    // A minor: Am F G C = i VI VII III
    expect(names(seq(Am, [0, 5, 6, 2]), Am)).toContain('小室進行');
  });
  it('other famous ones', () => {
    expect(names(seq(C, [0, 4, 5, 3]), C)).toContain('ポップパンク進行（Let It Be進行）');
    expect(names(seq(C, [0, 5, 1, 4]), C)).toContain('循環コード（イチロクニーゴー）');
    expect(names(seq(C, [1, 4, 0]), C)).toContain('ツーファイブワン');
    expect(names([diatonicChord(C, 3), makeChord(5, 3, 'm'), diatonicChord(C, 0)], C)).toContain('サブドミナントマイナー終止');
  });
  it('repeated chords collapse and indexes map back', () => {
    const cs = [...seq(C, [3, 3]), ...seq(C, [4, 2, 5])];
    const m = detectProgressions(cs, C).find((x) => x.def.name === '王道進行')!;
    expect(m.start).toBe(0);
    expect(m.end).toBe(5);
  });
  it('cyclic loops find wrapped progressions', () => {
    // G Am F C loop... vi IV V I rotated: V vi IV ... use 王道 rotated: vi IV V iii -> cyclic: IV V iii vi
    const cs = seq(C, [5, 3, 4, 2]);
    expect(names(cs, C, false)).not.toContain('王道進行');
    expect(names(cs, C, true)).toContain('王道進行');
  });
  it('falls back to other keys for long patterns', () => {
    // 王道 in G while the key says C
    const G: Key = { tonic: 7, mode: 'major' };
    const cs = seq(G, [3, 4, 2, 5]).map((c) => rekeyChord(c, G, C));
    const m = detectProgressions(cs, C);
    expect(m[0].def.name).toBe('王道進行');
    expect(m[0].note).toBeTruthy();
  });
  it('nothing for random chords and short input', () => {
    expect(detectProgressions([diatonicChord(C, 0)], C)).toEqual([]);
    expect(detectProgressions([], C)).toEqual([]);
  });
});

describe('suggestions', () => {
  const nm = (s: ReturnType<typeof suggestNext>, k: Key) => s.map((x) => chordName(x.chord, k));
  it('first chord', () => {
    const s = suggestNext([], C);
    expect(nm(s, C)[0]).toBe('C');
  });
  it('ii goes to V', () => {
    expect(nm(suggestNext([diatonicChord(C, 1)], C), C)[0]).toBe('G');
  });
  it('completes 王道進行 after IV V', () => {
    const s = suggestNext([diatonicChord(C, 3), diatonicChord(C, 4)], C);
    expect(nm(s, C)[0]).toBe('Em');
    expect(s[0].progression).toBe('王道進行');
  });
  it('secondary dominant resolves', () => {
    expect(nm(suggestNext([makeChord(4, 2, '7')], C), C)[0]).toMatch(/^Am/);
  });
  it('follows sevenths when the user uses them', () => {
    const s = suggestNext([diatonicChord(C, 1, true), diatonicChord(C, 4, true)], C);
    expect(nm(s, C)[0]).toBe('CM7');
  });
  it('works in minor keys', () => {
    const s = suggestNext([diatonicChord(Am, 0), diatonicChord(Am, 5)], Am);
    expect(s.length).toBeGreaterThan(2);
    const n = nm(s, Am);
    expect(n).toContain('G');
  });
  it('never suggests the same chord again and stays unique', () => {
    const s = suggestNext([diatonicChord(C, 0)], C);
    const n = nm(s, C);
    expect(n).not.toContain('C');
    expect(new Set(n).size).toBe(n.length);
  });
  it('unknown chords still get suggestions', () => {
    const s = suggestNext([makeChord(6, 3, 'aug')], C);
    expect(s.length).toBeGreaterThan(0);
  });
});

describe('transpose / rekey', () => {
  it('transposing the key moves everything', () => {
    const k = transposeKey(C, 2);
    expect(names(k)).toEqual(['D', 'Em', 'F♯m', 'G', 'A', 'Bm', 'C♯dim']);
    expect(transposeKey(C, -1).tonic).toBe(11);
    expect(transposeKey(C, 13).tonic).toBe(1);
  });
  it('rekey keeps absolute pitches', () => {
    const G: Key = { tonic: 7, mode: 'major' };
    const d = rekeyChord(diatonicChord(C, 1), C, G); // Dm in C -> Dm in G
    expect(chordName(d, G)).toBe('Dm');
    expect(romanName(d, G)).toBe('v');
    const slash = rekeyChord(makeChord(5, 3, 'M', { bass: { root: 7, deg: 4 } }), C, F);
    expect(chordName(slash, F)).toBe('F/G');
    const piano = rekeyChord({ ...diatonicChord(C, 0), notes: [60, 64, 67] }, C, G);
    expect(voiceChord(piano, G, { auto: true }).notes).toEqual([60, 64, 67]);
  });
});
