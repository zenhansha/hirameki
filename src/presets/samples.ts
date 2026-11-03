// Sample memos that are installed on the very first launch.
import { Memo, defaultMemo } from '../store/schema';
import { ChordSpec, makeChord } from '../theory/chord';
import { diatonicChord } from '../theory/diatonic';
import { Key } from '../theory/core';
import { writeChord, ChordItem } from '../seq/timeline';
import { builtinPatch } from './synth';
import { FX_PRESETS } from '../audio/fx/defs';
import { patternPreset } from './patterns';
import { barTicks, TimeSig } from '../seq/time';

function build(opts: {
  title: string; tags: string[]; note: string; key: Key; bpm: number; ts?: TimeSig;
  chords: [ChordSpec, number][]; synth: string; fx: string; pattern: string; bass?: Memo['bass']['style'] | null; bassPatch?: string;
  swing?: number; fav?: boolean; offset: number;
}): Memo {
  const m = defaultMemo();
  m.title = opts.title;
  m.tags = opts.tags;
  m.note = opts.note;
  m.key = opts.key;
  m.bpm = opts.bpm;
  m.ts = opts.ts ?? { num: 4, den: 4 };
  const bar = barTicks(m.ts);
  let items: ChordItem[] = [];
  let t = 0;
  for (const [c, bars] of opts.chords) {
    const len = Math.round(bars * bar);
    items = writeChord(items, t, len, c).items;
    t += len;
  }
  m.chords = items;
  m.bars = Math.ceil(t / bar);
  m.loop = { on: true, start: 0, end: m.bars };
  m.synth = builtinPatch(opts.synth)!;
  m.fx = { v: 1, items: FX_PRESETS.find((f) => f.id === opts.fx)!.chain() };
  const pp = patternPreset(opts.pattern)!;
  m.pattern = pp.pattern;
  if (pp.pump) m.pump = { ...pp.pump };
  if (opts.bass === null) m.bass.on = false;
  else if (opts.bass) m.bass.style = opts.bass;
  if (opts.bassPatch) m.bass.patch = builtinPatch(opts.bassPatch)!;
  m.swing = opts.swing ?? 0;
  m.fav = !!opts.fav;
  m.sample = true;
  m.createdAt = m.updatedAt = Date.now() - opts.offset * 60000;
  return m;
}

export function sampleMemos(): Memo[] {
  const D: Key = { tonic: 2, mode: 'major' };
  const C: Key = { tonic: 0, mode: 'major' };
  const Ab: Key = { tonic: 8, mode: 'major' };
  const F: Key = { tonic: 5, mode: 'major' };
  const Am: Key = { tonic: 9, mode: 'minor' };
  return [
    build({
      title: '王道進行 × ドリーミーパッド', tags: ['サンプル', 'エモい', 'J-POP'], fav: true, offset: 1,
      note: 'IVM7→V7→iiim7→vim7。ふわっと広がるパッドとドリーミーなリバーブで。▶を押してみて！',
      key: D, bpm: 84, synth: 'pad-dreamy', fx: 'dreamy', pattern: 'sustain', bass: 'root', bassPatch: 'bass-sub',
      chords: [[diatonicChord(D, 3, true), 1], [diatonicChord(D, 4, true), 1], [diatonicChord(D, 2, true), 1], [diatonicChord(D, 5, true), 1]],
    }),
    build({
      title: 'カノン進行 × きらきらアルペジオ', tags: ['サンプル', '感動', 'バラード'], offset: 2,
      note: 'I→V→vi→iii→IV→I→IV→V。ベースが一歩ずつ下がる泣きの進行をアルペジオで。',
      key: C, bpm: 78, synth: 'glass', fx: 'hall', pattern: 'arp-ballad', bass: 'root', bassPatch: 'bass-electric',
      chords: [0, 4, 5, 2, 3, 0, 3, 4].map((d, i) => [i === 1 ? { ...diatonicChord(C, d), inv: 1 } : i === 3 ? { ...diatonicChord(C, d), inv: 1 } : diatonicChord(C, d), 1] as [ChordSpec, number]),
    }),
    build({
      title: '丸サ進行 × Lo-Fiキー', tags: ['サンプル', 'おしゃれ', 'Lo-Fi'], offset: 3,
      note: 'IVM7→III7→vim7→vm7・I7。ハネたスウィングとLo-Fiの揺れで夜っぽく。',
      key: C, bpm: 80, synth: 'lofikeys', fx: 'lofi', pattern: 'synco', bass: 'follow', bassPatch: 'bass-warm', swing: 0.45,
      chords: [[makeChord(5, 3, 'M7'), 1], [makeChord(4, 2, '7'), 1], [makeChord(9, 5, 'm7'), 1], [makeChord(7, 4, 'm7'), 0.5], [makeChord(0, 0, '7'), 0.5]],
    }),
    build({
      title: '小室進行 × スーパーソーEDM', tags: ['サンプル', 'EDM', 'アゲ'], offset: 4,
      note: 'vi→IV→V→I。4つ打ち風のポンピングで疾走感マシマシ。',
      key: C, bpm: 128, synth: 'supersaw', fx: 'club', pattern: 'pump-edm', bass: 'octave', bassPatch: 'bass-synth',
      chords: [[diatonicChord(C, 5), 1], [diatonicChord(C, 3), 1], [diatonicChord(C, 4), 1], [diatonicChord(C, 0), 1]],
    }),
    build({
      title: 'Just the Two of Us進行 × エレピ', tags: ['サンプル', 'おしゃれ', 'ソウル'], offset: 5,
      note: 'D♭M7→C7→Fm7→E♭m7・A♭7。ウォーキングベースとエレピでシティポップ風に。',
      key: Ab, bpm: 94, synth: 'epiano', fx: 'vintage', pattern: 'charleston', bass: 'walking', bassPatch: 'bass-electric', swing: 0.25,
      chords: [[makeChord(5, 3, 'M7', { ext: ['9'] }), 1], [makeChord(4, 2, '7', { ext: ['b13'] }), 1], [makeChord(9, 5, 'm7', { ext: ['9'] }), 1], [makeChord(7, 4, 'm7'), 0.5], [makeChord(0, 0, '7'), 0.5]],
    }),
    build({
      title: 'ワルツ（3/4）× ストリングス', tags: ['サンプル', '3拍子', 'クラシカル'], offset: 6,
      note: '3/4拍子の I→vi→ii→V。ズン・チャッ・チャッのストラムで。',
      key: F, bpm: 132, ts: { num: 3, den: 4 }, synth: 'strings', fx: 'hall', pattern: 'strum-waltz', bass: 'root',
      chords: [[diatonicChord(F, 0), 1], [diatonicChord(F, 5), 1], [diatonicChord(F, 1), 1], [diatonicChord(F, 4, true), 1]],
    }),
    build({
      title: 'センシティブ進行（Am）× クワイア', tags: ['サンプル', '切ない', '洋楽'], offset: 7,
      note: 'i→♭VI→♭III→♭VII（= vi→IV→I→V）。声っぽいパッドで壮大に。',
      key: Am, bpm: 90, synth: 'choir', fx: 'cinema', pattern: 'ballad8', bass: 'root5',
      chords: [[diatonicChord(Am, 0), 1], [diatonicChord(Am, 5), 1], [diatonicChord(Am, 2), 1], [diatonicChord(Am, 6), 1]],
    }),
  ];
}
