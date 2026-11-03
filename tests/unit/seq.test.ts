import { describe, expect, it } from 'vitest';
import { ChordItem, clearRange, contentEnd, deleteTime, duplicateItems, insertTime, isValidTimeline, itemAt, rangeIds, removeItems, resizeItem, shiftContent, sideOf, splitItem, swapContents, truncate, writeChord } from '../../src/seq/timeline';
import { makeChord } from '../../src/theory/chord';
import { DEFAULT_PATTERN, PatternSpec, arpSequence, chordGainComp, normalizePattern, pumpGain, renderPattern, rhythmHits } from '../../src/seq/pattern';
import { renderBass, BASS_STYLES } from '../../src/seq/bass';
import { PPQ, barTicks, beatTicks, lengthChoices, swingWarp, posLabel, isCompound } from '../../src/seq/time';
import { compileMemo, toSeqData } from '../../src/seq/compile';
import { defaultMemo, normalizeMemo } from '../../src/store/schema';
import { diatonicChord } from '../../src/theory/diatonic';
import { PATTERN_PRESETS } from '../../src/presets/patterns';

const BAR = 1920;
const c = (r: number) => makeChord(r, 0, 'M');
const ts44 = { num: 4, den: 4 };
const ts34 = { num: 3, den: 4 };
const ts68 = { num: 6, den: 8 };
const ctx = { ts: ts44, bpm: 120 };
const pat = (p: Partial<PatternSpec>) => normalizePattern({ ...DEFAULT_PATTERN, ...p });

function seq4(): ChordItem[] {
  let items: ChordItem[] = [];
  for (let i = 0; i < 4; i++) items = writeChord(items, i * BAR, BAR, c(i)).items;
  return items;
}

describe('time', () => {
  it('bar and beat lengths', () => {
    expect(barTicks(ts44)).toBe(1920);
    expect(barTicks(ts34)).toBe(1440);
    expect(barTicks(ts68)).toBe(1440);
    expect(beatTicks(ts68)).toBe(720);
    expect(isCompound(ts68)).toBe(true);
    expect(barTicks({ num: 7, den: 8 })).toBe(1680);
  });
  it('length choices per meter', () => {
    expect(lengthChoices(ts44).map((x) => x.ticks)).toEqual([3840, 1920, 960, 480, 240]);
    expect(lengthChoices(ts34).map((x) => x.ticks)).toEqual([2880, 1440, 960, 480, 240]);
    expect(lengthChoices(ts68).map((x) => x.ticks)).toEqual([2880, 1440, 720, 240]);
  });
  it('swing warp', () => {
    expect(swingWarp(0, 0.5, 8)).toBe(0);
    expect(swingWarp(480, 0.5, 8)).toBe(480);
    expect(swingWarp(240, 0, 8)).toBe(240);
    // amount 2/3 -> triplet feel (off-beat at 2/3 of the beat)
    expect(swingWarp(240, 2 / 3, 8)).toBeCloseTo(320, 5);
    expect(swingWarp(120, 1, 16)).toBeCloseTo(180, 5);
    // monotonic
    let last = -1;
    for (let t = 0; t < 2000; t += 7) { const w = swingWarp(t, 0.8, 8); expect(w).toBeGreaterThanOrEqual(last); last = w; }
  });
  it('position label', () => {
    expect(posLabel(0, ts44)).toBe('1.1');
    expect(posLabel(1920 + 960, ts44)).toBe('2.3');
  });
});

describe('timeline edits', () => {
  it('writes consecutive chords', () => {
    const items = seq4();
    expect(items.map((i) => i.t)).toEqual([0, 1920, 3840, 5760]);
    expect(isValidTimeline(items)).toBe(true);
  });
  it('overwrite splits an item around the new one', () => {
    let items = writeChord([], 0, BAR * 2, c(0)).items;
    items = writeChord(items, 960, 960, c(7)).items;
    expect(items.map((i) => [i.t, i.len, i.chord.root])).toEqual([[0, 960, 0], [960, 960, 7], [1920, 1920, 0]]);
    expect(isValidTimeline(items)).toBe(true);
    expect(new Set(items.map((i) => i.id)).size).toBe(3);
  });
  it('clearRange trims edges', () => {
    const items = clearRange(seq4(), 960, 2880);
    expect(items.map((i) => [i.t, i.len])).toEqual([[0, 960], [2880, 960], [3840, 1920], [5760, 1920]]);
  });
  it('resize grows over the next and shrinks to a gap', () => {
    const items = seq4();
    const grown = resizeItem(items, items[0].id, BAR * 2);
    expect(grown.map((i) => [i.t, i.len])).toEqual([[0, 3840], [3840, 1920], [5760, 1920]]);
    const shrunk = resizeItem(items, items[0].id, 480);
    expect(shrunk[0].len).toBe(480);
    expect(shrunk[1].t).toBe(1920);
  });
  it('split halves on the grid', () => {
    const items = seq4();
    const r = splitItem(items, items[1].id, 480);
    expect(r.items.map((i) => [i.t, i.len])).toContainEqual([1920, 960]);
    expect(r.items.map((i) => [i.t, i.len])).toContainEqual([2880, 960]);
    expect(isValidTimeline(r.items)).toBe(true);
    const tiny = writeChord([], 0, 1, c(0)).items;
    expect(splitItem(tiny, tiny[0].id, 480).items.length).toBe(1);
  });
  it('swap and shift contents keep the time slots', () => {
    const items = seq4();
    const s = swapContents(items, items[0].id, items[3].id);
    expect(s.map((i) => i.chord.root)).toEqual([3, 1, 2, 0]);
    expect(s.map((i) => i.t)).toEqual([0, 1920, 3840, 5760]);
    const r = shiftContent(items, items[1].id, 1);
    expect(r.items.map((i) => i.chord.root)).toEqual([0, 2, 1, 3]);
    expect(r.id).toBe(items[2].id);
    expect(shiftContent(items, items[0].id, -1).items).toBe(items);
  });
  it('duplicate inserts after and ripples', () => {
    const items = seq4();
    const r = duplicateItems(items, [items[0].id, items[1].id]);
    expect(r.items.map((i) => i.chord.root)).toEqual([0, 1, 0, 1, 2, 3]);
    expect(r.items.map((i) => i.t)).toEqual([0, 1920, 3840, 5760, 7680, 9600]);
    expect(r.ids.length).toBe(2);
    expect(contentEnd(r.items)).toBe(BAR * 6);
    expect(duplicateItems(items, []).items).toBe(items);
  });
  it('insert/delete time', () => {
    const items = seq4();
    const ins = insertTime(items, 1920, 1920);
    expect(ins.map((i) => i.t)).toEqual([0, 3840, 5760, 7680]);
    const mid = insertTime(items, 960, 480);
    expect(mid.map((i) => [i.t, i.len])).toEqual([[0, 960], [1440, 960], [2400, 1920], [4320, 1920], [6240, 1920]]);
    const del = deleteTime(items, 1920, 1920);
    expect(del.map((i) => [i.t, i.chord.root])).toEqual([[0, 0], [1920, 2], [3840, 3]]);
  });
  it('itemAt, rangeIds, truncate, remove', () => {
    const items = seq4();
    expect(itemAt(items, 2000)?.chord.root).toBe(1);
    expect(itemAt(items, 99999)).toBeUndefined();
    expect(rangeIds(items, items[2].id, items[0].id)).toEqual([items[0].id, items[1].id, items[2].id]);
    expect(truncate(items, 2500).map((i) => [i.t, i.len])).toEqual([[0, 1920], [1920, 580]]);
    expect(removeItems(items, [items[1].id]).length).toBe(3);
  });
  it('A/B sides fall back to A', () => {
    const it: ChordItem = { id: 'x', t: 0, len: 10, chord: c(0), b: { chord: c(5) } };
    expect(sideOf(it, 'B').chord.root).toBe(5);
    expect(sideOf(it, 'A').chord.root).toBe(0);
    expect(sideOf({ ...it, b: null }, 'B').chord.root).toBe(0);
  });
});

describe('patterns', () => {
  it('sustain holds across bars, one hit per chord', () => {
    const p = pat({ res: 'bar', steps: 'x-------' });
    const h = rhythmHits(p, 0, BAR * 2, ts44);
    expect(h).toEqual([{ t: 0, span: BAR * 2, accent: false, step: 0 }]);
    // a chord starting in the middle of the cycle is retriggered
    const h2 = rhythmHits(p, BAR * 3, BAR * 4, ts44);
    expect(h2.map((x) => [x.t, x.span])).toEqual([[BAR * 3, BAR]]);
    // in 3/4 the cycle follows the bar
    const h3 = rhythmHits(p, 0, 1440 * 2, ts34);
    expect(h3.map((x) => [x.t, x.span])).toEqual([[0, 2880]]);
  });
  it('quarter notes in 4/4 and 3/4', () => {
    const p = pat({ res: '4', steps: 'Xxxx' });
    expect(rhythmHits(p, 0, BAR, ts44).length).toBe(4);
    expect(rhythmHits(p, 0, 1440, ts34).length).toBe(3);
    expect(rhythmHits(p, 0, BAR, ts44)[0].accent).toBe(true);
  });
  it('a 16-step pattern restarts each bar in 3/4', () => {
    const p = pat({ res: '16', steps: 'x...x...x...x...' });
    const h = rhythmHits(p, 0, 1440 * 2, ts34);
    expect(h.map((x) => x.t)).toEqual([0, 480, 960, 1440, 1920, 2400]);
  });
  it('triplets', () => {
    const p = pat({ res: '8t', steps: 'x' });
    expect(rhythmHits(p, 0, BAR, ts44).length).toBe(12);
  });
  it('chord shorter than a step and starting mid-bar', () => {
    const p = pat({ res: 'bar', steps: 'x' });
    const h = rhythmHits(p, 480, 960, ts44);
    expect(h.map((x) => [x.t, x.span])).toEqual([[480, 480]]);
  });
  it('offbeat pattern without retrig stays off the downbeat', () => {
    const p = pat({ res: '8', steps: '.X.X.X.X', retrig: false });
    const h = rhythmHits(p, 0, BAR, ts44);
    expect(h.map((x) => x.t)).toEqual([240, 720, 1200, 1680]);
  });
  it('retrig adds a hit at the chord start inside a rest or tie', () => {
    const p = pat({ res: '8', steps: 'X--x--x-', retrig: true });
    const h = rhythmHits(p, 240, 960, ts44);
    expect(h[0].t).toBe(240);
    const p2 = pat({ res: '8', steps: 'x...', retrig: true });
    expect(rhythmHits(p2, 240, 480, ts44).map((x) => x.t)).toEqual([240]);
  });
  it('never crosses the chord end and gate shortens', () => {
    const p = pat({ res: '4', steps: 'x', gate: 0.5 });
    const ev = renderPattern(p, [60, 64, 67], 0, 960, ctx);
    for (const e of ev) { expect(e.t + e.d).toBeLessThanOrEqual(960); expect(e.d).toBe(240); }
  });
  it('block velocity compensation for big chords', () => {
    expect(chordGainComp(3)).toBe(1);
    expect(chordGainComp(6)).toBeCloseTo(Math.sqrt(0.5));
    const ev = renderPattern(pat({}), [48, 52, 55, 59, 62, 65], 0, BAR, ctx);
    expect(ev[0].v).toBeLessThan(DEFAULT_PATTERN.vel);
  });
  it('strum offsets go up or down', () => {
    const down = renderPattern(pat({ kind: 'strum', res: 'bar', steps: 'x', strum: { dir: 'down', speed: 20 } }), [60, 64, 67], 0, BAR, ctx);
    expect(down.map((e) => e.n)).toEqual([60, 64, 67]);
    expect(down[1].t).toBeGreaterThan(down[0].t);
    const up = renderPattern(pat({ kind: 'strum', res: 'bar', steps: 'x', strum: { dir: 'up', speed: 20 } }), [60, 64, 67], 0, BAR, ctx);
    expect(up.map((e) => e.n)).toEqual([67, 64, 60]);
    const alt = renderPattern(pat({ kind: 'strum', res: '8', steps: 'xx', strum: { dir: 'alt', speed: 5 } }), [60, 64, 67], 0, 480, ctx);
    expect(alt.slice(0, 3).map((e) => e.n)).toEqual([60, 64, 67]);
    expect(alt.slice(3).map((e) => e.n)).toEqual([67, 64, 60]);
  });
  it('arpeggio orders', () => {
    expect(arpSequence([60, 64, 67], 'up', 1, 0)).toEqual([60, 64, 67]);
    expect(arpSequence([60, 64, 67], 'down', 1, 0)).toEqual([67, 64, 60]);
    expect(arpSequence([60, 64, 67], 'updown', 1, 0)).toEqual([60, 64, 67, 64]);
    expect(arpSequence([60, 64, 67], 'up', 2, 0)).toEqual([60, 64, 67, 72, 76, 79]);
    expect(arpSequence([60, 64, 67, 72], 'inout', 1, 0)).toEqual([60, 72, 64, 67]);
    const r = arpSequence([60, 64, 67], 'random', 2, 42);
    expect([...r].sort((a, b) => a - b)).toEqual([60, 64, 67, 72, 76, 79]);
    expect(arpSequence([60, 64, 67], 'random', 2, 42)).toEqual(r);
    expect(arpSequence([60], 'updown', 1, 0)).toEqual([60]);
  });
  it('arpeggio start note and reset per chord', () => {
    const p = pat({ kind: 'arp', res: '8', steps: 'x', arp: { mode: 'up', octaves: 1, start: 1 } });
    const ev = renderPattern(p, [60, 64, 67], 0, 960, ctx);
    expect(ev.map((e) => e.n)).toEqual([64, 67, 60, 64]);
    const ev2 = renderPattern(p, [62, 65, 69], 960, 1920, ctx);
    expect(ev2[0].n).toBe(65);
  });
  it('octave shift', () => {
    const ev = renderPattern(pat({ oct: 1 }), [60], 0, BAR, ctx);
    expect(ev[0].n).toBe(72);
  });
  it('empty input', () => {
    expect(renderPattern(pat({}), [], 0, BAR, ctx)).toEqual([]);
    expect(renderPattern(pat({}), [60], 100, 100, ctx)).toEqual([]);
  });
  it('normalize fixes garbage', () => {
    const p = normalizePattern({ kind: 'zzz' as never, res: '7' as never, steps: 'abc', gate: 9, arp: { mode: 'x' as never, octaves: 99, start: -3 } });
    expect(p.kind).toBe('block');
    expect(p.res).toBe(DEFAULT_PATTERN.res);
    expect(p.steps).toBe('x');
    expect(p.gate).toBe(1);
    expect(p.arp).toEqual({ mode: 'up', octaves: 4, start: 0 });
  });
  it('every preset renders sane notes in 4/4, 3/4 and 6/8', () => {
    for (const pr of PATTERN_PRESETS) {
      for (const ts of [ts44, ts34, ts68]) {
        const bar = barTicks(ts);
        const ev = renderPattern(pr.pattern, [57, 60, 64, 67], 0, bar * 2, { ts, bpm: 100 });
        expect(ev.length, pr.id).toBeGreaterThan(0);
        for (const e of ev) {
          expect(e.t).toBeGreaterThanOrEqual(0);
          expect(e.t + e.d).toBeLessThanOrEqual(bar * 2);
          expect(e.v).toBeGreaterThan(0);
          expect(e.v).toBeLessThanOrEqual(1);
        }
      }
    }
  });
  it('pump gain curve', () => {
    const s = { depth: 0.8, curve: 0.5, length: 0.8 };
    expect(pumpGain(0, s)).toBeCloseTo(1, 5);
    expect(pumpGain(0.02, s)).toBeLessThan(0.3);
    expect(pumpGain(0.5, s)).toBeGreaterThan(pumpGain(0.1, s));
    expect(pumpGain(0.85, s)).toBe(1);
    expect(pumpGain(1.02, s)).toBeCloseTo(pumpGain(0.02, s));
    for (let x = 0; x < 1; x += 0.01) { const g = pumpGain(x, s); expect(g).toBeGreaterThanOrEqual(0.19); expect(g).toBeLessThanOrEqual(1); }
  });
});

describe('bass', () => {
  const info = { cs: 0, ce: BAR, bass: 36, pcs: [0, 4, 7], rootPc: 0, next: 43 };
  it('every style stays inside the chord and the bass range', () => {
    for (const s of BASS_STYLES) {
      for (const ts of [ts44, ts34, ts68]) {
        const ev = renderBass(s.id, { ...info, ce: barTicks(ts) }, { ts, bpm: 120 }, pat({ res: '8', steps: 'x.x.' }));
        expect(ev.length, s.id).toBeGreaterThan(0);
        for (const e of ev) {
          expect(e.t).toBeGreaterThanOrEqual(0);
          expect(e.t + e.d).toBeLessThanOrEqual(barTicks(ts));
          expect(e.n).toBeGreaterThanOrEqual(26);
          expect(e.n).toBeLessThanOrEqual(67);
        }
        expect(ev[0].t).toBe(0);
        expect(ev[0].n % 12).toBe(0);
      }
    }
  });
  it('walking bass approaches the next root by a semitone', () => {
    const ev = renderBass('walking', info, ctx);
    expect(ev.length).toBe(4);
    const last = ev[ev.length - 1].n;
    expect(Math.abs((last % 12) - 7)).toBe(1);
  });
  it('root5 alternates root and fifth', () => {
    const ev = renderBass('root5', info, ctx);
    expect(ev.map((e) => e.n % 12)).toEqual([0, 7, 0, 7]);
  });
  it('octave shift', () => {
    const ev = renderBass('root', info, ctx, undefined, 1);
    expect(ev[0].n).toBe(48);
  });
});

describe('compile', () => {
  function memoWith(degs: number[]) {
    const m = defaultMemo();
    let items: ChordItem[] = [];
    degs.forEach((d, i) => { items = writeChord(items, i * BAR, BAR, diatonicChord(m.key, d)).items; });
    m.chords = items;
    return m;
  }
  it('produces chords, bass and stays inside the song', () => {
    const m = memoWith([3, 4, 2, 5]);
    const c = compileMemo(m);
    expect(c.chords.length).toBe(4);
    expect(c.events.some((e) => e.p === 0)).toBe(true);
    expect(c.events.some((e) => e.p === 1)).toBe(true);
    for (const e of c.events) expect(e.t + e.d).toBeLessThanOrEqual(c.songEnd);
    for (let i = 1; i < c.events.length; i++) expect(c.events[i].t).toBeGreaterThanOrEqual(c.events[i - 1].t);
  });
  it('bass off adds slash basses into the chord part', () => {
    const m = memoWith([0]);
    m.chords[0].chord = { ...m.chords[0].chord, inv: 1 };
    m.bass.on = false;
    const c = compileMemo(m);
    expect(c.events.every((e) => e.p === 0)).toBe(true);
    expect(Math.min(...c.events.map((e) => e.n)) % 12).toBe(4);
  });
  it('B side swaps chords', () => {
    const m = memoWith([0, 4]);
    m.chords[1].b = { chord: diatonicChord(m.key, 5) };
    expect(compileMemo(m, { side: 'B' }).chords[1].chord.root).toBe(9);
    expect(compileMemo(m, { side: 'A' }).chords[1].chord.root).toBe(7);
  });
  it('chords beyond the song end are dropped/clipped', () => {
    const m = memoWith([0, 1, 2, 3, 4, 5]);
    m.bars = 4;
    const c = compileMemo(m);
    expect(c.chords.length).toBe(4);
  });
  it('swing moves off-beats only', () => {
    const m = memoWith([0]);
    m.pattern = pat({ res: '8', steps: 'x' });
    m.bass.on = false;
    m.swing = 2 / 3;
    const ts = compileMemo(m).events.filter((e) => e.p === 0).map((e) => e.t);
    expect([...new Set(ts)].slice(0, 2)).toEqual([0, 320]);
  });
  it('seq data for the worklet', () => {
    const m = memoWith([0, 4]);
    m.ts = ts68;
    const c = compileMemo(m);
    const s = toSeqData(m, c);
    expect(s.clickTicks).toBe(240);
    expect(s.beatTicks).toBe(720);
    expect(s.loop.end).toBeLessThanOrEqual(s.songEnd);
  });
  it('empty memo compiles to nothing', () => {
    expect(compileMemo(defaultMemo()).events).toEqual([]);
  });
});

describe('schema', () => {
  it('normalizes garbage into a valid memo', () => {
    for (const g of [null, undefined, 42, 'x', [], { chords: 'nope', bpm: 'fast', ts: { num: 99 } }]) {
      const m = normalizeMemo(g);
      expect(m.v).toBe(1);
      expect(m.bpm).toBeGreaterThanOrEqual(30);
      expect(m.ts).toEqual({ num: 4, den: 4 });
      expect(Array.isArray(m.chords)).toBe(true);
    }
  });
  it('migrates v0 tempo field', () => {
    const m = normalizeMemo({ tempo: 140, chords: [] });
    expect(m.bpm).toBe(140);
  });
  it('repairs overlapping chords and fixes the loop', () => {
    const m = normalizeMemo({
      bars: 4, loop: { on: true, start: 3, end: 1 },
      chords: [
        { id: 'a', t: 0, len: 1920, chord: { root: 0, deg: 0, q: 'M' } },
        { id: 'a', t: 960, len: 1920, chord: { root: 7, deg: 4, q: 'M' } },
      ],
    });
    expect(isValidTimeline(m.chords)).toBe(true);
    expect(new Set(m.chords.map((c) => c.id)).size).toBe(m.chords.length);
    expect(m.loop).toEqual({ on: true, start: 0, end: 4 });
  });
  it('round-trips through JSON', () => {
    const m = defaultMemo();
    m.chords = seq4();
    expect(normalizeMemo(JSON.parse(JSON.stringify(m)))).toEqual(normalizeMemo(m));
  });
});
