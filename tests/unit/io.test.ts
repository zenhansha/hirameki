import { describe, expect, it } from 'vitest';
import { buildMidi, keySignature, parseMidi } from '../../src/io/midi';
import { encodeWav, parseWavHeader } from '../../src/io/wav';
import { codeFromHash, decodeMemo, encodeMemo, ShareDecodeError } from '../../src/io/share';
import { defaultMemo, normalizeMemo, normalizeSettings } from '../../src/store/schema';
import { writeChord, ChordItem } from '../../src/seq/timeline';
import { diatonicChord } from '../../src/theory/diatonic';
import { makeChord } from '../../src/theory/chord';
import { yin } from '../../src/hum/pitch';
import { chordForRoot, chordsForMelody, estimateKey, segmentNotes } from '../../src/hum/melody';
import { chordName } from '../../src/theory/chord';
import { parseImport, ImportError } from '../../src/store/repo';
import { builtinPatch } from '../../src/presets/synth';
import { TEMPLATES } from '../../src/presets/templates';
import { compileMemo } from '../../src/seq/compile';
import { detectProgressions } from '../../src/theory/progressions';
import { sortItems } from '../../src/seq/timeline';
import { shapeCompensation, shapeSample } from '../../src/audio/fx/nodes';
import { comboOf } from '../../src/ui/commands';

function memo(degs: number[]) {
  const m = defaultMemo();
  let items: ChordItem[] = [];
  degs.forEach((d, i) => { items = writeChord(items, i * 1920, 1920, diatonicChord(m.key, d, true)).items; });
  m.chords = items;
  m.title = 'テスト';
  return m;
}

describe('MIDI export', () => {
  it('writes a valid type-1 file with chords, bass, meta', () => {
    const m = memo([3, 4, 2, 5]);
    const f = parseMidi(buildMidi(m, { withPattern: true }));
    expect(f.format).toBe(1);
    expect(f.ppq).toBe(480);
    expect(f.tracks.map((t) => t.name)).toEqual(['Tempo / Chords', 'Chords', 'Bass']);
    expect(Math.round(60000000 / f.tracks[0].tempo!)).toBe(96);
    expect(f.tracks[0].ts).toEqual([4, 4]);
    expect(f.tracks[0].texts.filter((t) => t.type === 6).map((t) => t.text)).toEqual(['FM7', 'G7', 'Em7', 'Am7']);
    expect(f.tracks[1].notes.length).toBeGreaterThan(8);
    expect(f.tracks[2].notes.every((n) => n.ch === 1)).toBe(true);
    // Every note ends inside the song.
    for (const t of f.tracks) for (const n of t.notes) expect(n.t + n.d).toBeLessThanOrEqual(4 * 1920);
  });
  it('block mode holds each chord for its length', () => {
    const m = memo([0, 4]);
    m.bass.on = false;
    m.pattern = { ...m.pattern, kind: 'arp', res: '16', steps: 'x' };
    const f = parseMidi(buildMidi(m, { withPattern: false }));
    const ch = f.tracks[1].notes;
    expect(ch.every((n) => n.d === 1920)).toBe(true);
    expect(new Set(ch.map((n) => n.t))).toEqual(new Set([0, 1920]));
  });
  it('loops repeat the loop range', () => {
    const m = memo([0, 4, 5, 3]);
    m.loop = { on: true, start: 0, end: 2 };
    const f = parseMidi(buildMidi(m, { withPattern: false, loops: 3 }));
    expect(f.tracks[0].texts.filter((t) => t.type === 6).length).toBe(6);
  });
  it('key signatures', () => {
    const k = (tonic: number, mode: 'major' | 'minor' = 'major') => keySignature({ ...defaultMemo(), key: { tonic, mode } });
    expect(k(0)).toBe(0);
    expect(k(7)).toBe(1);
    expect(k(5)).toBe(-1);
    expect(k(3)).toBe(-3);
    expect(k(6)).toBe(6);
    expect(k(9, 'minor')).toBe(0);
    expect(k(4, 'minor')).toBe(1);
    expect(k(2, 'minor')).toBe(-1);
  });
  it('melody gets its own track', () => {
    const m = memo([0]);
    m.melody = [{ t: 0, len: 480, n: 72, v: 0.8 }];
    const f = parseMidi(buildMidi(m, { withPattern: true }));
    expect(f.tracks[3].name).toBe('Melody');
    expect(f.tracks[3].notes[0].n).toBe(72);
  });
});

describe('WAV', () => {
  it('encodes 16 and 24 bit', () => {
    const a = new Float32Array(100).map((_, i) => Math.sin(i / 5) * 0.5);
    const h16 = parseWavHeader(encodeWav([a, a], 44100, 16));
    expect(h16).toEqual({ channels: 2, sampleRate: 44100, bits: 16, frames: 100 });
    const h24 = parseWavHeader(encodeWav([a], 48000, 24));
    expect(h24).toEqual({ channels: 1, sampleRate: 48000, bits: 24, frames: 100 });
  });
  it('clamps and removes NaN', () => {
    const b = encodeWav([Float32Array.from([2, -2, NaN])], 8000, 16);
    const v = new DataView(b);
    expect(v.getInt16(44, true)).toBe(32767);
    expect(v.getInt16(46, true)).toBe(-32768);
    expect(Math.abs(v.getInt16(48, true))).toBeLessThanOrEqual(1);
  });
});

describe('share URL', () => {
  it('round-trips a memo (and built-in sounds go by reference)', () => {
    const m = memo([3, 4, 2, 5]);
    m.chords[1].b = { chord: makeChord(4, 2, '7') };
    m.tags = ['夜', 'サビ'];
    const code = encodeMemo(m);
    expect(code.startsWith('1.')).toBe(true);
    expect(code.length).toBeLessThan(2000);
    const back = decodeMemo(code);
    expect(back.id).not.toBe(m.id);
    expect(back.title).toBe('テスト');
    expect(back.tags).toEqual(['夜', 'サビ']);
    expect(back.chords.map((c) => c.chord)).toEqual(m.chords.map((c) => c.chord));
    expect(back.chords[1].b?.chord).toEqual(makeChord(4, 2, '7'));
    expect(back.synth).toEqual(m.synth);
    expect(back.bass.patch).toEqual(m.bass.patch);
    expect(back.fx.items.map((i) => i.type)).toEqual(m.fx.items.map((i) => i.type));
  });
  it('custom sounds are embedded', () => {
    const m = memo([0]);
    m.synth = { ...builtinPatch('pluck')!, name: '自作', p: { ...builtinPatch('pluck')!.p, 'filter.cutoff': 1234 } };
    const back = decodeMemo(encodeMemo(m));
    expect(back.synth.name).toBe('自作');
    expect(back.synth.p['filter.cutoff']).toBe(1234);
  });
  it('rejects broken codes with a friendly error', () => {
    expect(() => decodeMemo('1.@@@@')).toThrow(ShareDecodeError);
    expect(() => decodeMemo('9.abc')).toThrow(ShareDecodeError);
    const code = encodeMemo(memo([0, 1]));
    expect(() => decodeMemo(code.slice(0, code.length / 2))).toThrow(ShareDecodeError);
  });
  it('reads the code from the hash', () => {
    expect(codeFromHash('#m=1.abc')).toBe('1.abc');
    expect(codeFromHash('#x=1&m=1.abc')).toBe('1.abc');
    expect(codeFromHash('#other')).toBeNull();
  });
});

describe('import parsing', () => {
  it('accepts bundles, arrays and single memos', () => {
    const m = memo([0, 4]);
    expect(parseImport(JSON.stringify({ format: 'hirameki-memos', v: 1, memos: [m] })).memos.length).toBe(1);
    expect(parseImport(JSON.stringify([m, m])).memos.length).toBe(2);
    expect(parseImport(JSON.stringify(m)).memos[0].chords.length).toBe(2);
  });
  it('rejects garbage', () => {
    expect(() => parseImport('not json')).toThrow(ImportError);
    expect(() => parseImport('{"foo":1}')).toThrow(ImportError);
  });
  it('settings normalise', () => {
    const s = normalizeSettings({ label: 'name', master: 5, keyMap: { F13: 'deg1', bad: 3 } });
    expect(s.label).toBe('name');
    expect(s.master).toBe(1);
    expect(s.keyMap).toEqual({ F13: 'deg1' });
  });
});

describe('humming', () => {
  const sr = 24000;
  const tone = (f: number, n = 1024, harm = true) => Float32Array.from({ length: n }, (_, i) => {
    const t = i / sr;
    return 0.4 * Math.sin(2 * Math.PI * f * t) + (harm ? 0.2 * Math.sin(4 * Math.PI * f * t) + 0.1 * Math.sin(6 * Math.PI * f * t) : 0);
  });
  it('YIN finds the pitch of voice-like tones', () => {
    for (const f of [98, 147, 220, 330, 440, 660, 880]) {
      const r = yin(tone(f), sr);
      expect(r, String(f)).not.toBeNull();
      expect(Math.abs(12 * Math.log2(r!.freq / f))).toBeLessThan(0.15);
    }
  });
  it('silence and noise give no pitch', () => {
    expect(yin(new Float32Array(1024), sr)).toBeNull();
    let s = 1;
    const noise = Float32Array.from({ length: 1024 }, () => { s = (s * 16807) % 2147483647; return (s / 2147483647 - 0.5) * 0.6; });
    const r = yin(noise, sr);
    expect(r === null || r.clarity < 0.75).toBe(true);
  });
  it('segments a pitch track into quantised notes', () => {
    const frames = [];
    for (let t = 0; t < 960; t += 20) frames.push({ tick: t, midi: t < 480 ? 60.1 : 64.05 });
    frames.push({ tick: 980, midi: null });
    for (let t = 1000; t < 1440; t += 20) frames.push({ tick: t, midi: 67 });
    const notes = segmentNotes(frames);
    expect(notes.map((n) => n.n)).toEqual([60, 64, 67]);
    expect(notes[0].t).toBe(0);
    expect(notes[1].t).toBe(480);
  });
  it('estimates the key and harmonises a melody', () => {
    const C = { tonic: 0, mode: 'major' as const };
    // bar 1: C E G (C), bar 2: F A C (F), bar 3: G B D (G), bar 4: C E (C)
    const mel = [[60, 64, 67], [65, 69, 72], [67, 71, 74], [72, 64, 60]].flatMap((ns, bar) => ns.map((n, i) => ({ t: bar * 1920 + i * 640, len: 600, n, v: 0.8 })));
    expect(estimateKey(mel)).toEqual(C);
    const cs = chordsForMelody(mel, C, 1920, 4);
    expect(cs.map((c) => chordName(c, C))).toEqual(['C', 'F', 'G', 'C']);
    expect(chordName(chordForRoot(9, C), C)).toBe('Am');
    expect(chordName(chordForRoot(10, C), C)).toBe('B♭');
  });
});

describe('templates', () => {
  it('build valid memos named after the progression they contain', () => {
    expect(TEMPLATES.length).toBeGreaterThanOrEqual(10);
    expect(new Set(TEMPLATES.map((t) => t.id)).size).toBe(TEMPLATES.length);
    const expected = ['王道進行', 'カノン進行', '丸サ進行', '小室進行', 'Just the Two of Us進行', 'センシティブ進行', 'ポップパンク進行', '循環コード', 'ブルース進行'];
    for (const t of TEMPLATES) {
      const m = t.build();
      const n = normalizeMemo(JSON.parse(JSON.stringify(m)));
      expect(n.sample).toBeUndefined();
      expect(n.chords.length, t.id).toBeGreaterThan(0);
      expect(compileMemo(n).events.length, t.id).toBeGreaterThan(0);
      const found = detectProgressions(sortItems(n.chords).map((c) => c.chord), n.key, { cyclic: true }).map((p) => [p.def.name, ...(p.def.aliases ?? [])]).flat();
      const named = expected.find((e) => t.name.includes(e.replace('進行', '')));
      if (named) expect(found.some((f) => f.includes(named.replace('進行', ''))), t.name + ' → ' + found.join(',')).toBe(true);
    }
  });
  it('the anticipation template really starts chords half a beat early', () => {
    const m = TEMPLATES.find((t) => t.id === 'citypop-antic')!.build();
    expect(sortItems(m.chords).map((c) => c.t)).toEqual([0, 1680, 3600, 5520]);
  });
  it('each build is a fresh copy', () => {
    const a = TEMPLATES[0].build(), b = TEMPLATES[0].build();
    a.chords[0].chord.q = 'dim';
    expect(b.chords[0].chord.q).not.toBe('dim');
  });
});

describe('effects helpers', () => {
  it('distortion curves stay bounded and loudness is compensated', () => {
    for (const mode of ['soft', 'hard', 'tube']) {
      for (const d of [0, 0.3, 0.7, 1]) {
        for (let x = -1; x <= 1; x += 0.05) expect(Math.abs(shapeSample(mode, d, x))).toBeLessThanOrEqual(1.25);
        const c = shapeCompensation(mode, d);
        expect(c).toBeGreaterThan(0.05);
        expect(c).toBeLessThanOrEqual(1.2);
      }
    }
  });
});

describe('keyboard combos', () => {
  const ev = (o: Partial<KeyboardEvent>) => ({ key: '', code: '', ctrlKey: false, metaKey: false, altKey: false, shiftKey: false, ...o }) as KeyboardEvent;
  it('normalises keys', () => {
    expect(comboOf(ev({ key: ' ', code: 'Space' }))).toBe('Space');
    expect(comboOf(ev({ key: 'z', code: 'KeyZ', ctrlKey: true }))).toBe('Ctrl+Z');
    expect(comboOf(ev({ key: '!', code: 'Digit1', shiftKey: true }))).toBe('Shift+1');
    expect(comboOf(ev({ key: 'F13', code: 'F13' }))).toBe('F13');
    expect(comboOf(ev({ key: ']', code: 'BracketRight' }))).toBe(']');
  });
});
