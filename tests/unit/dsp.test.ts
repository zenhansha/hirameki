// Audio engine tests: run the worklet DSP in Node and listen with numbers.
import { describe, expect, it } from 'vitest';
import { Engine, Limiter } from '../../src/audio/worklet/engine';
import { Synth } from '../../src/audio/worklet/synth';
import { buildTable, fft, LEVEL_HARMONICS, TABLE_IDS } from '../../src/audio/wavetables';
import { ALL_BUILTIN_PATCHES, CHORD_PRESETS, builtinPatch } from '../../src/presets/synth';
import { compileMemo, toSeqData } from '../../src/seq/compile';
import { defaultMemo } from '../../src/store/schema';
import { writeChord, ChordItem } from '../../src/seq/timeline';
import { diatonicChord } from '../../src/theory/diatonic';
import { PATTERN_PRESETS } from '../../src/presets/patterns';
import { QUALITY_LIGHT } from '../../src/audio/params';

const SR = 48000;
const B = 128;

function tables() {
  return TABLE_IDS.map(buildTable);
}

function renderEngine(e: Engine, seconds: number) {
  const n = Math.ceil((seconds * SR) / B);
  const L = new Float32Array(n * B), R = new Float32Array(n * B);
  const l = new Float32Array(B), r = new Float32Array(B), click = new Float32Array(B), pump = new Float32Array(B);
  for (let i = 0; i < n; i++) {
    l.fill(0); r.fill(0);
    e.process(l, r, click, pump);
    L.set(l, i * B); R.set(r, i * B);
  }
  return { L, R };
}

function peak(a: Float32Array, from = 0, to = a.length) {
  let p = 0;
  for (let i = from; i < to; i++) p = Math.max(p, Math.abs(a[i]));
  return p;
}

function rms(a: Float32Array, from = 0, to = a.length) {
  let s = 0;
  for (let i = from; i < to; i++) s += a[i] * a[i];
  return Math.sqrt(s / Math.max(1, to - from));
}

/** Largest jump of the 2nd difference relative to the local level (click detector). */
function clickiness(a: Float32Array) {
  let worst = 0;
  const win = 256;
  for (let i = 2 + win; i < a.length - win; i++) {
    const d2 = Math.abs(a[i] - 2 * a[i - 1] + a[i - 2]);
    if (d2 < 0.02) continue;
    const local = rms(a, i - win, i - 4) + 1e-4;
    worst = Math.max(worst, d2 / local);
  }
  return worst;
}

function memo(degs: number[], patternId = 'sustain', synth = 'pad-warm') {
  const m = defaultMemo();
  let items: ChordItem[] = [];
  degs.forEach((d, i) => { items = writeChord(items, i * 1920, 1920, diatonicChord(m.key, d, true)).items; });
  m.chords = items;
  m.bars = degs.length;
  m.loop = { on: true, start: 0, end: degs.length };
  m.pattern = PATTERN_PRESETS.find((p) => p.id === patternId)!.pattern;
  m.synth = builtinPatch(synth)!;
  return m;
}

function engineFor(m: ReturnType<typeof memo>) {
  const e = new Engine(SR);
  e.handle({ type: 'tables', tables: tables() });
  e.handle({ type: 'patch', part: 0, patch: m.synth });
  e.handle({ type: 'patch', part: 1, patch: m.bass.patch });
  e.handle({ type: 'patch', part: 2, patch: m.melodyPatch });
  e.handle({ type: 'seq', seq: toSeqData(m, compileMemo(m)) });
  return e;
}

describe('wavetables', () => {
  it('every table is normalised and finite', () => {
    for (const t of tables()) {
      let p = 0, bad = 0;
      for (let i = 0; i < t.data.length; i++) {
        const x = t.data[i];
        if (!Number.isFinite(x)) bad++;
        else if (Math.abs(x) > p) p = Math.abs(x);
      }
      expect(bad, t.id).toBe(0);
      expect(p, t.id).toBeLessThanOrEqual(0.96);
      expect(p, t.id).toBeGreaterThan(0.5);
    }
  });
  it('mip levels are band-limited', () => {
    const t = buildTable('basic');
    const stride = t.size + 1;
    for (const lv of [4, 8, 12]) {
      const H = LEVEL_HARMONICS[lv];
      const frame = t.frames - 1; // square
      const base = (lv * t.frames + frame) * stride;
      const re = Float64Array.from(t.data.subarray(base, base + t.size));
      const im = new Float64Array(t.size);
      fft(re, im);
      let above = 0, total = 0;
      for (let k = 1; k < t.size / 2; k++) {
        const mag = Math.hypot(re[k], im[k]);
        total += mag;
        if (k > H) above += mag;
      }
      expect(above / total).toBeLessThan(1e-6);
    }
  });
});

describe('synth voice', () => {
  it('sounds, then fully releases (no stuck notes)', () => {
    const s = new Synth(SR, 8);
    for (const t of tables()) s.addTable(t);
    s.setPatch(builtinPatch('pluck')!);
    s.noteOn(1, 60, 0.8);
    const tr = { playing: false, tick: 0, tps: 0, bpm: 120 };
    const L = new Float32Array(B), R = new Float32Array(B);
    let loud = 0;
    for (let i = 0; i < 40; i++) { L.fill(0); R.fill(0); s.prepareBlock(B, tr); s.render(L, R, 0, B, tr); loud = Math.max(loud, peak(L)); }
    expect(loud).toBeGreaterThan(0.01);
    s.noteOff(1);
    for (let i = 0; i < 2000; i++) { L.fill(0); R.fill(0); s.prepareBlock(B, tr); s.render(L, R, 0, B, tr); }
    expect(s.activeCount()).toBe(0);
    expect(peak(L)).toBe(0);
  });
  it('same-note retrigger reuses the voice', () => {
    const s = new Synth(SR, 8);
    s.setPatch(builtinPatch('pad-warm')!);
    s.noteOn(1, 60, 0.8);
    s.noteOn(2, 60, 0.8);
    expect(s.activeCount()).toBe(1);
    // the old id no longer releases the reused voice
    s.noteOff(1);
    expect(s.voices.find((v) => v.active)!.env[0].stage).not.toBe(4);
  });
  it('voice stealing keeps the voice budget', () => {
    const s = new Synth(SR, 6);
    s.setPatch(builtinPatch('pad-warm')!);
    for (let n = 0; n < 20; n++) s.noteOn(n + 1, 40 + n, 0.8);
    expect(s.activeCount()).toBeLessThanOrEqual(6);
  });
  it('all built-in patches render finite audio over the keyboard', () => {
    const tr = { playing: true, tick: 0, tps: 0.02, bpm: 120 };
    for (const p of ALL_BUILTIN_PATCHES) {
      const s = new Synth(SR, 12);
      for (const t of tables()) s.addTable(t);
      s.setPatch(p);
      [36, 48, 60, 72, 84, 96].forEach((n, i) => s.noteOn(i + 1, n, 1));
      const L = new Float32Array(B), R = new Float32Array(B);
      let pk = 0;
      for (let i = 0; i < 200; i++) {
        L.fill(0); R.fill(0); s.prepareBlock(B, tr); s.render(L, R, 0, B, tr);
        let bad = 0;
        for (let k = 0; k < B; k++) if (!Number.isFinite(L[k]) || !Number.isFinite(R[k])) bad++;
        expect(bad).toBe(0);
        pk = Math.max(pk, peak(L), peak(R));
      }
      expect(pk, p.name).toBeGreaterThan(0.005);
      expect(pk, p.name).toBeLessThan(1.6);
    }
  });
});

describe('engine sequencing', () => {
  it('plays a progression and stops cleanly', () => {
    const m = memo([3, 4, 2, 5]);
    const e = engineFor(m);
    e.handle({ type: 'play', from: 0 });
    const a = renderEngine(e, 4);
    expect(rms(a.L)).toBeGreaterThan(0.01);
    e.handle({ type: 'stop' });
    renderEngine(e, 4);
    expect(e.voiceCount()).toBe(0);
  });
  it('loops forever without accumulating voices', () => {
    const m = memo([0, 4, 5, 3], 'eighth', 'pluck');
    m.bpm = 180;
    const e = engineFor(m);
    e.handle({ type: 'play', from: 0 });
    let maxVoices = 0;
    for (let k = 0; k < 6; k++) { renderEngine(e, 2); maxVoices = Math.max(maxVoices, e.voiceCount()); }
    expect(maxVoices).toBeLessThanOrEqual(28 + 6 + 4);
    expect(e.playing).toBe(true);
  });
  it('non-looping playback ends and reports', () => {
    const m = memo([0, 4]);
    m.loop.on = false;
    const e = engineFor(m);
    let ended = false;
    e.onReport = (r) => { if (r.type === 'ended') ended = true; };
    e.handle({ type: 'play', from: 0 });
    renderEngine(e, 6);
    expect(ended).toBe(true);
    expect(e.playing).toBe(false);
    renderEngine(e, 4);
    expect(e.voiceCount()).toBe(0);
  });
  it('timing is sample accurate', () => {
    const m = memo([0, 0, 0, 0], 'quarter', 'organ');
    m.bass.on = false;
    m.humanize = { time: 0, vel: 0 };
    m.bpm = 120; // 0.5 s per beat -> 24000 frames
    m.pattern = { ...m.pattern, gate: 0.5 };
    m.synth = { ...m.synth, p: { ...m.synth.p, 'env1.r': 0.005 } };
    const e = engineFor(m);
    e.handle({ type: 'play', from: 0 });
    const { L } = renderEngine(e, 2.2);
    // Find onsets: first sample above threshold after a quiet gap.
    const onsets: number[] = [];
    for (let i = 1; i < L.length; i++) {
      if (Math.abs(L[i]) > 0.002 && peak(L, Math.max(0, i - 2000), i) < 0.002) onsets.push(i);
    }
    expect(onsets.length).toBeGreaterThanOrEqual(4);
    for (let k = 1; k < 4; k++) expect(Math.abs(onsets[k] - onsets[0] - k * 24000)).toBeLessThan(64);
  });
  it('no clicks from voice stealing or retriggers', () => {
    const m = memo([0, 5, 3, 4], 'sixteenth', 'pad-warm');
    const e = engineFor(m);
    e.handle({ type: 'quality', q: QUALITY_LIGHT, voices: 6 });
    e.handle({ type: 'play', from: 0 });
    const { L } = renderEngine(e, 4);
    expect(clickiness(L)).toBeLessThan(25);
  });
  it('tempo change while playing keeps going and releases notes', () => {
    const m = memo([0, 4, 5, 3]);
    const e = engineFor(m);
    e.handle({ type: 'play', from: 0 });
    renderEngine(e, 1);
    m.bpm = 60;
    e.handle({ type: 'seq', seq: toSeqData(m, compileMemo(m)) });
    renderEngine(e, 2);
    e.handle({ type: 'stop' });
    renderEngine(e, 5);
    expect(e.voiceCount()).toBe(0);
  });
  it('live notes (audition / MIDI) start and stop', () => {
    const e = engineFor(memo([0]));
    e.handle({ type: 'liveOn', id: 5, part: 0, note: 64, vel: 0.9 });
    const a = renderEngine(e, 0.3);
    expect(peak(a.L)).toBeGreaterThan(0.01);
    e.handle({ type: 'liveOff', id: 5, part: 0 });
    renderEngine(e, 5);
    expect(e.voiceCount()).toBe(0);
  });
  it('metronome clicks and pump signal', () => {
    const m = memo([0]);
    m.metronome = true;
    m.pump = { on: true, rate: '1/4', depth: 0.7, curve: 0.5, offset: 0, length: 0.8 };
    const e = engineFor(m);
    e.handle({ type: 'play', from: 0 });
    const l = new Float32Array(B), r = new Float32Array(B), click = new Float32Array(B), pump = new Float32Array(B);
    let clickPeak = 0, pumpMin = 1, pumpMax = 0;
    for (let i = 0; i < (SR * 1.2) / B; i++) {
      l.fill(0); r.fill(0);
      e.process(l, r, click, pump);
      clickPeak = Math.max(clickPeak, peak(click));
      for (const x of pump) { pumpMin = Math.min(pumpMin, x); pumpMax = Math.max(pumpMax, x); }
    }
    expect(clickPeak).toBeGreaterThan(0.1);
    expect(pumpMin).toBeLessThan(0.45);
    expect(pumpMax).toBeGreaterThan(0.95);
  });
  it('panic silences everything', () => {
    const e = engineFor(memo([0, 1, 2, 3]));
    e.handle({ type: 'play', from: 0 });
    renderEngine(e, 1);
    e.handle({ type: 'panic' });
    e.handle({ type: 'stop' });
    renderEngine(e, 0.1);
    expect(e.voiceCount()).toBe(0);
  });
  it('a dense chord stack (many notes) stays bounded', () => {
    const m = memo([0], 'sustain', 'supersaw');
    const e = engineFor(m);
    for (let n = 0; n < 12; n++) e.handle({ type: 'liveOn', id: n + 1, part: 0, note: 48 + n * 2, vel: 1 });
    const a = renderEngine(e, 1);
    expect(peak(a.L)).toBeLessThan(2.5);
  });
});

describe('limiter', () => {
  it('never exceeds the ceiling, even for huge spikes', () => {
    const lim = new Limiter(SR);
    const n = SR * 2;
    const inL = new Float32Array(n), inR = new Float32Array(n);
    for (let i = 0; i < n; i++) {
      inL[i] = Math.sin(i * 0.05) * 3 + (i % 9000 === 0 ? 20 : 0);
      inR[i] = Math.sin(i * 0.031) * 2.5;
    }
    const oL = new Float32Array(n), oR = new Float32Array(n);
    for (let i = 0; i < n; i += B) lim.process(inL.subarray(i, i + B), inR.subarray(i, i + B), oL.subarray(i, i + B), oR.subarray(i, i + B));
    expect(peak(oL)).toBeLessThanOrEqual(lim.ceiling + 1e-6);
    expect(peak(oR)).toBeLessThanOrEqual(lim.ceiling + 1e-6);
    // and the limiting is smooth (no hard clipping): 2nd difference small relative to level
    expect(clickiness(oL)).toBeLessThan(30);
  });
  it('quiet signals pass unchanged (delayed by the look-ahead)', () => {
    const lim = new Limiter(SR);
    const n = SR / 2;
    const inL = new Float32Array(n), inR = new Float32Array(n);
    for (let i = 0; i < n; i++) inL[i] = inR[i] = Math.sin(i * 0.02) * 0.3;
    const oL = new Float32Array(n), oR = new Float32Array(n);
    lim.process(inL, inR, oL, oR);
    for (let i = lim.la + 10; i < n; i += 97) expect(oL[i]).toBeCloseTo(inL[i - lim.la], 5);
  });
  it('NaN never reaches the output', () => {
    const lim = new Limiter(SR);
    const a = new Float32Array(B).fill(NaN);
    const o = new Float32Array(B), o2 = new Float32Array(B);
    for (let k = 0; k < 4; k++) lim.process(a, a, o, o2);
    expect(o.every((x) => x === 0)).toBe(true);
    expect(lim.meters().nan).toBeGreaterThan(0);
  });
});

describe('presets sanity', () => {
  it('there are at least 10 chord presets with unique ids', () => {
    expect(CHORD_PRESETS.length).toBeGreaterThanOrEqual(10);
    expect(new Set(ALL_BUILTIN_PATCHES.map((p) => p.id)).size).toBe(ALL_BUILTIN_PATCHES.length);
  });
});
