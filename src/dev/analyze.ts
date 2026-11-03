// Dev-only sound analysis (not part of the app bundle): render memos offline and measure
// loudness, peaks, clicks and tails. Load it from the console in `npm run dev`.
import { renderMemo } from '../audio/render';
import { defaultMemo, Memo } from '../store/schema';
import { writeChord, ChordItem } from '../seq/timeline';
import { diatonicChord } from '../theory/diatonic';
import { CHORD_PRESETS, BASS_PRESETS, builtinPatch } from '../presets/synth';
import { PATTERN_PRESETS } from '../presets/patterns';
import { FX_PRESETS } from '../audio/fx/defs';

export function metrics(chs: Float32Array[], sr: number) {
  const n = chs[0].length;
  const win = Math.floor(sr * 0.4);
  const blocks: number[] = [];
  for (let s = 0; s + win <= n; s += win / 2) {
    let e = 0;
    for (const ch of chs) for (let i = s; i < s + win; i++) e += ch[i] * ch[i];
    blocks.push(10 * Math.log10(e / (win * chs.length) + 1e-12));
  }
  const gated = blocks.filter((b) => b > -50);
  const loud = gated.length ? 10 * Math.log10(gated.reduce((a, b) => a + Math.pow(10, b / 10), 0) / gated.length) : -99;
  let peak = 0;
  for (const ch of chs) for (let i = 0; i < n; i++) peak = Math.max(peak, Math.abs(ch[i]));
  // Click score: 2nd difference spike vs local level.
  let click = 0, clickAt = 0;
  for (const ch of chs) {
    let run = 0;
    const a = 0.995;
    for (let i = 2; i < n; i++) {
      const d2 = Math.abs(ch[i] - 2 * ch[i - 1] + ch[i - 2]);
      const lvl = Math.sqrt(run) + 1e-3;
      const sc = d2 / lvl;
      if (d2 > 0.02 && sc > click) { click = sc; clickAt = i / sr; }
      run = run * a + ch[i] * ch[i] * (1 - a);
    }
  }
  // Tail just before the export fade.
  let te = 0;
  const t0 = Math.max(0, n - Math.floor(sr * 0.4)), t1 = n - Math.floor(sr * 0.06);
  for (const ch of chs) for (let i = t0; i < t1; i++) te += ch[i] * ch[i];
  const tail = 10 * Math.log10(te / Math.max(1, (t1 - t0) * chs.length) + 1e-12);
  return { loud: +loud.toFixed(1), peak: +peak.toFixed(3), click: +click.toFixed(1), clickAt: +clickAt.toFixed(2), tail: +tail.toFixed(1) };
}

export function testMemo(synth: string, pattern: string, fx = 'dry', degs = [0, 4, 5, 3], sev = true): Memo {
  const m = defaultMemo();
  let items: ChordItem[] = [];
  degs.forEach((d, i) => { items = writeChord(items, i * 1920, 1920, diatonicChord(m.key, d, sev)).items; });
  m.chords = items;
  m.bars = degs.length;
  m.loop = { on: true, start: 0, end: degs.length };
  m.synth = builtinPatch(synth)!;
  const pp = PATTERN_PRESETS.find((p) => p.id === pattern)!;
  m.pattern = pp.pattern;
  if (pp.pump) m.pump = { ...pp.pump };
  m.fx = { v: 1, items: FX_PRESETS.find((f) => f.id === fx)!.chain() };
  m.humanize = { time: 0, vel: 0 };
  return m;
}

export async function analyzeMemo(m: Memo, opts: { noLimiter?: boolean; noFx?: boolean } = {}) {
  const r = await renderMemo(m, { loops: 1, raw: true, sampleRate: 44100, ...opts });
  return metrics(r.channels!, r.sampleRate);
}

/** Each chord preset with a few patterns, chords only (bass off), no FX, no limiter. */
export async function presetMatrix(patterns = ['sustain', 'eighth', 'arp-up16', 'strum-8']) {
  const out: Record<string, unknown>[] = [];
  for (const p of CHORD_PRESETS) {
    const row: Record<string, unknown> = { preset: p.id };
    for (const pat of patterns) {
      const m = testMemo(p.id!, pat);
      m.bass.on = false;
      const r = await analyzeMemo(m, { noLimiter: true, noFx: true });
      row[pat] = `${r.loud}dB pk${r.peak} c${r.click}`;
    }
    out.push(row);
  }
  return out;
}

export async function bassMatrix() {
  const out: Record<string, unknown>[] = [];
  for (const b of BASS_PRESETS) {
    const m = testMemo('pad-warm', 'sustain');
    m.chordVol = 0;
    m.bass.patch = JSON.parse(JSON.stringify(b));
    const r = await analyzeMemo(m, { noLimiter: true, noFx: true });
    out.push({ bass: b.id, ...r });
  }
  return out;
}

export async function fxMatrix(synth = 'pad-warm', pattern = 'quarter') {
  const out: Record<string, unknown>[] = [];
  const dry = await analyzeMemo(testMemo(synth, pattern, 'dry'), { noLimiter: true });
  for (const f of FX_PRESETS) {
    const r = await analyzeMemo(testMemo(synth, pattern, f.id), { noLimiter: true });
    out.push({ fx: f.id, ...r, vsDry: +(r.loud - dry.loud).toFixed(1) });
  }
  return out;
}

(window as unknown as Record<string, unknown>).__an = { metrics, testMemo, analyzeMemo, presetMatrix, bassMatrix, fxMatrix, renderMemo };
