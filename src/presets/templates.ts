// Templates: ready-made starting points. They are NOT stored as memos — picking one creates a new memo.
import { Memo, defaultMemo } from '../store/schema';
import { ChordSpec, makeChord } from '../theory/chord';
import { diatonicChord } from '../theory/diatonic';
import { Key } from '../theory/core';
import { writeChord, ChordItem } from '../seq/timeline';
import { builtinPatch } from './synth';
import { FX_PRESETS } from '../audio/fx/defs';
import { patternPreset } from './patterns';
import { barTicks, beatTicks, TimeSig } from '../seq/time';

export type TemplateCat = 'J-POP定番' | 'おしゃれ' | 'ダンス' | 'ジャズ・ブルース' | 'バラード・その他';

export interface Template {
  id: string;
  name: string;
  cat: TemplateCat;
  desc: string;
  build: () => Memo;
}

interface Spec {
  title: string; tags: string[]; note: string; key: Key; bpm: number; ts?: TimeSig;
  /** [chord, length in bars] laid end to end … */
  chords?: [ChordSpec, number][];
  /** … or [chord, start beat, length in beats] for syncopated starts (食い). */
  chordsAt?: [ChordSpec, number, number][];
  synth: string; fx: string; pattern: string; bass?: Memo['bass']['style'] | null; bassPatch?: string; swing?: number;
}

function build(o: Spec): Memo {
  const m = defaultMemo();
  m.title = o.title;
  m.tags = o.tags;
  m.note = o.note;
  m.key = o.key;
  m.bpm = o.bpm;
  m.ts = o.ts ?? { num: 4, den: 4 };
  const bar = barTicks(m.ts);
  const beat = beatTicks(m.ts);
  let items: ChordItem[] = [];
  let end = 0;
  if (o.chordsAt) {
    for (const [c, start, len] of o.chordsAt) {
      items = writeChord(items, Math.round(start * beat), Math.round(len * beat), c).items;
      end = Math.max(end, Math.round((start + len) * beat));
    }
  } else {
    for (const [c, bars] of o.chords ?? []) {
      const len = Math.round(bars * bar);
      items = writeChord(items, end, len, c).items;
      end += len;
    }
  }
  m.chords = items;
  m.bars = Math.max(1, Math.ceil(end / bar));
  m.loop = { on: true, start: 0, end: m.bars };
  m.synth = builtinPatch(o.synth)!;
  m.fx = { v: 1, items: FX_PRESETS.find((f) => f.id === o.fx)!.chain() };
  const pp = patternPreset(o.pattern)!;
  m.pattern = pp.pattern;
  if (pp.pump) m.pump = { ...pp.pump };
  if (o.bass === null) m.bass.on = false;
  else if (o.bass) m.bass.style = o.bass;
  if (o.bassPatch) m.bass.patch = builtinPatch(o.bassPatch)!;
  m.swing = o.swing ?? 0;
  return m;
}

const K = (tonic: number, mode: 'major' | 'minor' = 'major'): Key => ({ tonic, mode });
const D = K(2), C = K(0), Ab = K(8), F = K(5), Am = K(9, 'minor'), G = K(7), Eb = K(3), A = K(9);
const dia = (k: Key, ds: number[], sev = false, bars = 1): [ChordSpec, number][] => ds.map((d) => [diatonicChord(k, d, sev), bars]);

export const TEMPLATES: Template[] = [
  {
    id: 'oudou-dreamy', name: '王道進行 × ドリーミーパッド', cat: 'J-POP定番', desc: 'IVM7→V7→iiim7→vim7。J-POPで一番エモい定番',
    build: () => build({
      title: '王道進行 × ドリーミーパッド', tags: ['エモい', 'J-POP'], note: 'IVM7→V7→iiim7→vim7。ふわっと広がるパッドとドリーミーなリバーブで。',
      key: D, bpm: 84, synth: 'pad-dreamy', fx: 'dreamy', pattern: 'sustain', bass: 'root', bassPatch: 'bass-sub', chords: dia(D, [3, 4, 2, 5], true),
    }),
  },
  {
    id: 'canon-arp', name: 'カノン進行 × きらきらアルペジオ', cat: 'J-POP定番', desc: 'ベースが一歩ずつ下がる泣きの8小節',
    build: () => build({
      title: 'カノン進行 × きらきらアルペジオ', tags: ['感動', 'バラード'], note: 'I→V→vi→iii→IV→I→IV→V。ベースが順に下がっていく進行をアルペジオで。',
      key: C, bpm: 78, synth: 'glass', fx: 'hall', pattern: 'arp-ballad', bass: 'root', bassPatch: 'bass-electric',
      chords: [0, 4, 5, 2, 3, 0, 3, 4].map((d, i) => [i === 1 || i === 3 ? { ...diatonicChord(C, d), inv: 1 } : diatonicChord(C, d), 1] as [ChordSpec, number]),
    }),
  },
  {
    id: 'komuro-edm', name: '小室進行 × スーパーソーEDM', cat: 'ダンス', desc: 'vi→IV→V→I。4つ打ち風ポンピングで疾走感',
    build: () => build({
      title: '小室進行 × スーパーソーEDM', tags: ['EDM', 'アゲ'], note: 'vi→IV→V→I。キックなしでも4つ打ちっぽく揺れるポンピング。',
      key: C, bpm: 128, synth: 'supersaw', fx: 'club', pattern: 'pump-edm', bass: 'octave', bassPatch: 'bass-synth', chords: dia(C, [5, 3, 4, 0]),
    }),
  },
  {
    id: 'poppunk', name: 'ポップパンク進行 × ストラム', cat: 'J-POP定番', desc: 'I→V→vi→IV。世界中のヒット曲の型を8ビートで',
    build: () => build({
      title: 'ポップパンク進行 × ストラム', tags: ['ロック', '明るい'], note: 'I→V→vi→IV（Let It Be進行）。ダウン・アップのストロークで。',
      key: G, bpm: 150, synth: 'pluck', fx: 'room', pattern: 'strum-8', bass: 'root8', bassPatch: 'bass-pluck', chords: dia(G, [0, 4, 5, 3]),
    }),
  },
  {
    id: 'marusa-lofi', name: '丸サ進行 × Lo-Fiキー', cat: 'おしゃれ', desc: 'IVM7→III7→vim7→vm7・I7。夜っぽいスウィング',
    build: () => build({
      title: '丸サ進行 × Lo-Fiキー', tags: ['おしゃれ', 'Lo-Fi'], note: 'IVM7→III7→vim7→vm7・I7。ハネたスウィングとLo-Fiの揺れで。',
      key: C, bpm: 80, synth: 'lofikeys', fx: 'lofi', pattern: 'synco', bass: 'follow', bassPatch: 'bass-warm', swing: 0.45,
      chords: [[makeChord(5, 3, 'M7'), 1], [makeChord(4, 2, '7'), 1], [makeChord(9, 5, 'm7'), 1], [makeChord(7, 4, 'm7'), 0.5], [makeChord(0, 0, '7'), 0.5]],
    }),
  },
  {
    id: 'jttou-epiano', name: 'Just the Two of Us進行 × エレピ', cat: 'おしゃれ', desc: 'ウォーキングベースでシティポップ風',
    build: () => build({
      title: 'Just the Two of Us進行 × エレピ', tags: ['おしゃれ', 'ソウル'], note: 'D♭M7(9)→C7(♭13)→Fm7(9)→E♭m7・A♭7。',
      key: Ab, bpm: 94, synth: 'epiano', fx: 'vintage', pattern: 'charleston', bass: 'walking', bassPatch: 'bass-electric', swing: 0.25,
      chords: [[makeChord(5, 3, 'M7', { ext: ['9'] }), 1], [makeChord(4, 2, '7', { ext: ['b13'] }), 1], [makeChord(9, 5, 'm7', { ext: ['9'] }), 1], [makeChord(7, 4, 'm7'), 0.5], [makeChord(0, 0, '7'), 0.5]],
    }),
  },
  {
    id: 'citypop-antic', name: '食い（アンティシペーション）の王道進行', cat: 'おしゃれ', desc: 'コードが半拍前に入ってくるシティポップのノリ',
    build: () => build({
      title: '食いの王道進行 × シンセブラス', tags: ['おしゃれ', 'シティポップ', '食い'],
      note: '2つ目以降のコードは前の小節の4拍目ウラ（半拍前）から入る「食い」。タイでそのまま次の小節へつながる。',
      key: Eb, bpm: 104, synth: 'brass', fx: 'vintage', pattern: 'charleston', bass: 'follow', bassPatch: 'bass-synth',
      chordsAt: [
        [makeChord(5, 3, 'M7', { ext: ['9'] }), 0, 3.5],
        [makeChord(7, 4, '7', { ext: ['9'] }), 3.5, 4],
        [makeChord(4, 2, 'm7'), 7.5, 4],
        [makeChord(9, 5, 'm7', { ext: ['9'] }), 11.5, 4.5],
      ],
    }),
  },
  {
    id: 'junkan-jazz', name: '循環コード × オルガン（スウィング）', cat: 'ジャズ・ブルース', desc: 'IM7→vi7→ii7→V7をウォーキングで',
    build: () => build({
      title: '循環コード × オルガン', tags: ['ジャズ', 'スウィング'], note: 'I→vi→ii→V（イチロクニーゴー）。ハネたウォーキングベースで。',
      key: F, bpm: 118, synth: 'organ', fx: 'room', pattern: 'charleston', bass: 'walking', bassPatch: 'bass-electric', swing: 0.65, chords: dia(F, [0, 5, 1, 4], true),
    }),
  },
  {
    id: 'blues12', name: '12小節ブルース × エレピ', cat: 'ジャズ・ブルース', desc: 'I7×4→IV7×2→I7×2→V7→IV7→I7→V7',
    build: () => build({
      title: '12小節ブルース × エレピ', tags: ['ブルース'], note: 'ロックンロールにもジャズにもなる12小節の型。シャッフルで。',
      key: A, bpm: 96, synth: 'epiano', fx: 'vintage', pattern: 'quarter', bass: 'walking', bassPatch: 'bass-warm', swing: 0.7,
      chords: [0, 0, 0, 0, 3, 3, 0, 0, 4, 3, 0, 4].map((d) => [makeChord([0, 2, 4, 5, 7, 9, 11][d], d, '7'), 1] as [ChordSpec, number]),
    }),
  },
  {
    id: 'waltz-strings', name: 'ワルツ（3/4）× ストリングス', cat: 'バラード・その他', desc: 'ズン・チャッ・チャッの3拍子',
    build: () => build({
      title: 'ワルツ（3/4）× ストリングス', tags: ['3拍子', 'クラシカル'], note: '3/4拍子の I→vi→ii→V。',
      key: F, bpm: 132, ts: { num: 3, den: 4 }, synth: 'strings', fx: 'hall', pattern: 'strum-waltz', bass: 'root',
      chords: [[diatonicChord(F, 0), 1], [diatonicChord(F, 5), 1], [diatonicChord(F, 1), 1], [diatonicChord(F, 4, true), 1]],
    }),
  },
  {
    id: 'ballad68', name: '6/8バラード × ソフトピアノ', cat: 'バラード・その他', desc: '揺れる6/8でピアノの分散和音',
    build: () => build({
      title: '6/8バラード × ソフトピアノ', tags: ['バラード', '6/8'], note: 'I→iii→IV→V。6/8の分散和音でゆったりと。',
      key: C, bpm: 96, ts: { num: 6, den: 8 }, synth: 'softkeys', fx: 'hall', pattern: 'arp-ballad', bass: 'root',
      chords: [[diatonicChord(C, 0), 1], [diatonicChord(C, 2), 1], [diatonicChord(C, 3), 1], [diatonicChord(C, 4, true), 1]],
    }),
  },
  {
    id: 'sensitive-choir', name: 'センシティブ進行（Am）× クワイア', cat: 'バラード・その他', desc: 'i→♭VI→♭III→♭VII。壮大で切ない',
    build: () => build({
      title: 'センシティブ進行（Am）× クワイア', tags: ['切ない', '洋楽'], note: 'i→♭VI→♭III→♭VII（= vi→IV→I→V）。声っぽいパッドで壮大に。',
      key: Am, bpm: 90, synth: 'choir', fx: 'cinema', pattern: 'ballad8', bass: 'root5', chords: dia(Am, [0, 5, 2, 6]),
    }),
  },
];

export const TEMPLATE_CATS: TemplateCat[] = ['J-POP定番', 'おしゃれ', 'ダンス', 'ジャズ・ブルース', 'バラード・その他'];

export function templateById(id: string): Template | undefined {
  return TEMPLATES.find((t) => t.id === id);
}
