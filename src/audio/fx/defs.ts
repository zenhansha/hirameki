// Effect chain data model, parameter definitions and the "atmosphere" presets.

export type FxType = 'reverb' | 'delay' | 'chorus' | 'flanger' | 'phaser' | 'distortion' | 'eq' | 'filter' | 'compressor' | 'width';

export interface FxParamDef {
  id: string;
  label: string;
  kind: 'num' | 'choice' | 'bool';
  min?: number;
  max?: number;
  def: number | string | boolean;
  curve?: 'lin' | 'exp';
  unit?: string;
  choices?: { id: string; label: string }[];
}

export interface FxDef {
  type: FxType;
  label: string;
  icon: string;
  desc: string;
  /** Default wet amount. */
  mix: number;
  /** Equal-power dry/wet for "send" effects, linear for inserts. */
  send: boolean;
  params: FxParamDef[];
}

const DELAY_DIVS = ['1/16', '1/8t', '1/8', '1/8.', '1/4t', '1/4', '1/4.', '1/2', '1/1'].map((d) => ({ id: d, label: d }));

export const FX_DEFS: FxDef[] = [
  {
    type: 'reverb', label: 'リバーブ', icon: '🌫', desc: '空間の響き', mix: 0.3, send: true,
    params: [
      { id: 'size', label: 'サイズ', kind: 'num', min: 0, max: 1, def: 0.6 },
      { id: 'decay', label: '減衰', kind: 'num', min: 0.2, max: 10, def: 2.5, curve: 'exp', unit: 's' },
      { id: 'predelay', label: 'プリディレイ', kind: 'num', min: 0, max: 0.2, def: 0.02, unit: 's' },
      { id: 'hicut', label: 'ハイカット', kind: 'num', min: 1000, max: 18000, def: 9000, curve: 'exp', unit: 'Hz' },
      { id: 'locut', label: 'ローカット', kind: 'num', min: 20, max: 1000, def: 180, curve: 'exp', unit: 'Hz' },
    ],
  },
  {
    type: 'delay', label: 'ディレイ', icon: '↻', desc: 'テンポに合わせたやまびこ', mix: 0.25, send: true,
    params: [
      { id: 'div', label: '長さ', kind: 'choice', def: '1/4.', choices: DELAY_DIVS },
      { id: 'fb', label: 'フィードバック', kind: 'num', min: 0, max: 0.9, def: 0.38 },
      { id: 'ping', label: 'ピンポン', kind: 'bool', def: true },
      { id: 'tone', label: 'トーン', kind: 'num', min: 500, max: 16000, def: 5500, curve: 'exp', unit: 'Hz' },
      { id: 'locut', label: 'ローカット', kind: 'num', min: 20, max: 2000, def: 250, curve: 'exp', unit: 'Hz' },
    ],
  },
  {
    type: 'chorus', label: 'コーラス', icon: '≋', desc: '揺らして厚みと広がり', mix: 0.4, send: true,
    params: [
      { id: 'rate', label: '速さ', kind: 'num', min: 0.05, max: 5, def: 0.6, curve: 'exp', unit: 'Hz' },
      { id: 'depth', label: '深さ', kind: 'num', min: 0, max: 1, def: 0.5 },
      { id: 'delay', label: 'ディレイ', kind: 'num', min: 0.005, max: 0.03, def: 0.014, unit: 's' },
    ],
  },
  {
    type: 'flanger', label: 'フランジャー', icon: '✈', desc: 'ジェット機のようなうねり', mix: 0.5, send: true,
    params: [
      { id: 'rate', label: '速さ', kind: 'num', min: 0.02, max: 5, def: 0.25, curve: 'exp', unit: 'Hz' },
      { id: 'depth', label: '深さ', kind: 'num', min: 0, max: 1, def: 0.7 },
      { id: 'fb', label: 'フィードバック', kind: 'num', min: -0.9, max: 0.9, def: 0.5 },
      { id: 'delay', label: 'ディレイ', kind: 'num', min: 0.0005, max: 0.008, def: 0.002, unit: 's' },
    ],
  },
  {
    type: 'phaser', label: 'フェイザー', icon: '◐', desc: 'シュワシュワした位相のうねり', mix: 0.5, send: true,
    params: [
      { id: 'rate', label: '速さ', kind: 'num', min: 0.02, max: 5, def: 0.3, curve: 'exp', unit: 'Hz' },
      { id: 'depth', label: '深さ', kind: 'num', min: 0, max: 1, def: 0.7 },
      { id: 'freq', label: '中心', kind: 'num', min: 200, max: 3000, def: 800, curve: 'exp', unit: 'Hz' },
      { id: 'stages', label: '段数', kind: 'choice', def: '6', choices: [{ id: '4', label: '4' }, { id: '6', label: '6' }, { id: '8', label: '8' }] },
    ],
  },
  {
    type: 'distortion', label: 'ディストーション', icon: '⚡', desc: '歪み・ビットクラッシュ', mix: 1, send: false,
    params: [
      {
        id: 'mode', label: 'タイプ', kind: 'choice', def: 'soft', choices: [
          { id: 'soft', label: 'ソフト' }, { id: 'hard', label: 'ハード' }, { id: 'tube', label: 'チューブ' }, { id: 'crush', label: 'ビットクラッシュ' },
        ],
      },
      { id: 'drive', label: 'ドライブ', kind: 'num', min: 0, max: 1, def: 0.4 },
      { id: 'tone', label: 'トーン', kind: 'num', min: 500, max: 18000, def: 9000, curve: 'exp', unit: 'Hz' },
      { id: 'bits', label: 'ビット', kind: 'num', min: 2, max: 16, def: 8 },
      { id: 'down', label: 'サンプル間引き', kind: 'num', min: 1, max: 30, def: 4 },
    ],
  },
  {
    type: 'eq', label: 'EQ', icon: '⫶', desc: 'ロー／ミッド／ハイの音質調整', mix: 1, send: false,
    params: [
      { id: 'low', label: 'ロー', kind: 'num', min: -15, max: 15, def: 0, unit: 'dB' },
      { id: 'mid', label: 'ミッド', kind: 'num', min: -15, max: 15, def: 0, unit: 'dB' },
      { id: 'midf', label: 'ミッド周波数', kind: 'num', min: 200, max: 5000, def: 1000, curve: 'exp', unit: 'Hz' },
      { id: 'high', label: 'ハイ', kind: 'num', min: -15, max: 15, def: 0, unit: 'dB' },
    ],
  },
  {
    type: 'filter', label: 'フィルター', icon: '⌒', desc: 'こもらせる／シャリっとさせる', mix: 1, send: false,
    params: [
      { id: 'mode', label: 'タイプ', kind: 'choice', def: 'lp', choices: [{ id: 'lp', label: 'LP' }, { id: 'hp', label: 'HP' }, { id: 'bp', label: 'BP' }] },
      { id: 'cutoff', label: 'カットオフ', kind: 'num', min: 20, max: 20000, def: 2500, curve: 'exp', unit: 'Hz' },
      { id: 'res', label: 'レゾナンス', kind: 'num', min: 0, max: 1, def: 0.2 },
      { id: 'lfo', label: '揺れ', kind: 'num', min: 0, max: 1, def: 0 },
      { id: 'rate', label: '揺れの速さ', kind: 'choice', def: '1/2', choices: ['1/16', '1/8', '1/4', '1/2', '1/1', '2/1', '4/1'].map((d) => ({ id: d, label: d })) },
    ],
  },
  {
    type: 'compressor', label: 'コンプレッサー', icon: '▤', desc: '音量の粒をそろえる', mix: 1, send: false,
    params: [
      { id: 'threshold', label: 'スレッショルド', kind: 'num', min: -60, max: 0, def: -20, unit: 'dB' },
      { id: 'ratio', label: 'レシオ', kind: 'num', min: 1, max: 20, def: 4, curve: 'exp' },
      { id: 'attack', label: 'アタック', kind: 'num', min: 0.001, max: 0.2, def: 0.01, curve: 'exp', unit: 's' },
      { id: 'release', label: 'リリース', kind: 'num', min: 0.02, max: 1, def: 0.2, curve: 'exp', unit: 's' },
      { id: 'makeup', label: '出力', kind: 'num', min: -12, max: 12, def: 0, unit: 'dB' },
    ],
  },
  {
    type: 'width', label: 'ステレオ幅', icon: '↔', desc: '左右の広がり', mix: 1, send: false,
    params: [{ id: 'width', label: '幅', kind: 'num', min: 0, max: 2, def: 1.5 }],
  },
];

export const FX_DEF_MAP = Object.fromEntries(FX_DEFS.map((d) => [d.type, d])) as Record<FxType, FxDef>;

export interface FxItem {
  id: string;
  type: FxType;
  on: boolean;
  mix: number;
  p: Record<string, number | string | boolean>;
}

export interface FxChain {
  v: number;
  items: FxItem[];
}

export const FX_VERSION = 1;
export const MAX_FX = 12;

let n = 0;
export function fxId(): string {
  n = (n + 1) % 1e6;
  return 'fx' + Date.now().toString(36) + n.toString(36) + Math.floor(Math.random() * 1e4).toString(36);
}

export function defaultFxParams(type: FxType): FxItem['p'] {
  return Object.fromEntries(FX_DEF_MAP[type].params.map((p) => [p.id, p.def]));
}

export function makeFx(type: FxType, p: Partial<FxItem['p']> = {}, mix?: number): FxItem {
  return { id: fxId(), type, on: true, mix: mix ?? FX_DEF_MAP[type].mix, p: { ...defaultFxParams(type), ...p } as FxItem['p'] };
}

export function normalizeFxChain(raw: Partial<FxChain> | null | undefined): FxChain {
  const items: FxItem[] = [];
  for (const it of Array.isArray(raw?.items) ? raw!.items : []) {
    if (!it || !FX_DEF_MAP[it.type as FxType]) continue;
    const def = FX_DEF_MAP[it.type as FxType];
    const p: FxItem['p'] = {};
    for (const pd of def.params) {
      const v = it.p?.[pd.id];
      if (pd.kind === 'num') {
        const x = Number(v);
        p[pd.id] = isFinite(x) && v !== undefined && v !== null ? Math.min(pd.max!, Math.max(pd.min!, x)) : (pd.def as number);
      } else if (pd.kind === 'bool') p[pd.id] = v === undefined ? pd.def : !!v;
      else p[pd.id] = pd.choices!.some((c) => c.id === v) ? (v as string) : (pd.def as string);
    }
    const mix = Number(it.mix);
    items.push({ id: typeof it.id === 'string' ? it.id : fxId(), type: def.type, on: it.on !== false, mix: isFinite(mix) ? Math.min(1, Math.max(0, mix)) : def.mix, p });
    if (items.length >= MAX_FX) break;
  }
  return { v: FX_VERSION, items };
}

export interface FxPreset {
  id: string;
  name: string;
  desc: string;
  chain: () => FxItem[];
  user?: boolean;
}

export const FX_PRESETS: FxPreset[] = [
  { id: 'dry', name: 'ドライ', desc: 'エフェクトなし', chain: () => [] },
  { id: 'room', name: 'ルーム', desc: '小さな部屋の自然な響き', chain: () => [makeFx('reverb', { size: 0.3, decay: 0.9, predelay: 0.01, hicut: 8000 }, 0.22)] },
  { id: 'hall', name: 'ホール', desc: '大きなホールで鳴らした感じ', chain: () => [makeFx('reverb', { size: 0.8, decay: 3.4, predelay: 0.03, hicut: 7500 }, 0.32)] },
  {
    id: 'dreamy', name: 'ドリーミー', desc: '夢の中みたいにふわっと広がる',
    chain: () => [
      makeFx('chorus', { rate: 0.35, depth: 0.55, delay: 0.016 }, 0.35),
      makeFx('delay', { div: '1/4.', fb: 0.45, ping: true, tone: 4200 }, 0.22),
      makeFx('reverb', { size: 0.95, decay: 6.5, predelay: 0.04, hicut: 6500, locut: 220 }, 0.45),
      makeFx('width', { width: 1.35 }),
    ],
  },
  {
    id: 'lofi', name: 'Lo-Fi', desc: 'カセットっぽいくすみと揺れ',
    chain: () => [
      makeFx('filter', { mode: 'lp', cutoff: 3600, res: 0.12, lfo: 0.15, rate: '2/1' }),
      makeFx('chorus', { rate: 0.4, depth: 0.85, delay: 0.02 }, 0.5),
      makeFx('distortion', { mode: 'crush', drive: 0.15, bits: 10, down: 3, tone: 6000 }, 0.45),
      makeFx('compressor', { threshold: -24, ratio: 3, attack: 0.02, release: 0.25, makeup: -2 }),
      makeFx('reverb', { size: 0.35, decay: 1.2, hicut: 5000 }, 0.2),
    ],
  },
  {
    id: 'wide', name: 'ワイド', desc: '左右いっぱいに広げる',
    chain: () => [makeFx('chorus', { rate: 0.25, depth: 0.35, delay: 0.012 }, 0.3), makeFx('width', { width: 1.75 }), makeFx('reverb', { size: 0.5, decay: 1.6 }, 0.2)],
  },
  {
    id: 'cinema', name: 'シネマティック', desc: '映画のサントラみたいに壮大',
    chain: () => [
      makeFx('eq', { low: 2, mid: -1.5, midf: 500, high: 2.5 }),
      makeFx('delay', { div: '1/2', fb: 0.42, ping: true, tone: 3800 }, 0.18),
      makeFx('reverb', { size: 1, decay: 8, predelay: 0.05, hicut: 7000, locut: 200 }, 0.5),
    ],
  },
  {
    id: 'vintage', name: 'ヴィンテージ', desc: 'あたたかい真空管とテープの質感',
    chain: () => [
      makeFx('eq', { low: 3, mid: 1, midf: 700, high: -4 }),
      makeFx('distortion', { mode: 'tube', drive: 0.3, tone: 7000 }, 0.55),
      makeFx('chorus', { rate: 0.5, depth: 0.3, delay: 0.01 }, 0.25),
      makeFx('compressor', { threshold: -18, ratio: 2.5, attack: 0.015, release: 0.3, makeup: -2.5 }),
      makeFx('reverb', { size: 0.45, decay: 1.8, hicut: 6000 }, 0.22),
    ],
  },
  {
    id: 'echo', name: 'エコー', desc: '左右に跳ねるやまびこ',
    chain: () => [makeFx('delay', { div: '1/8.', fb: 0.55, ping: true, tone: 5000 }, 0.35), makeFx('reverb', { size: 0.4, decay: 1.5 }, 0.18)],
  },
  {
    id: 'shoegaze', name: 'シューゲイザー', desc: '轟音の霧に包まれる',
    chain: () => [
      makeFx('distortion', { mode: 'soft', drive: 0.55, tone: 5000 }, 0.5),
      makeFx('flanger', { rate: 0.08, depth: 0.6, fb: 0.4, delay: 0.003 }, 0.35),
      makeFx('reverb', { size: 1, decay: 7.5, predelay: 0.02, hicut: 6000 }, 0.45),
    ],
  },
  {
    id: 'club', name: 'クラブ', desc: 'パキッと前に出るダンス系',
    chain: () => [
      makeFx('compressor', { threshold: -22, ratio: 4, attack: 0.005, release: 0.12, makeup: -3 }),
      makeFx('eq', { low: 3, mid: -2, midf: 400, high: 3 }),
      makeFx('delay', { div: '1/8', fb: 0.3, ping: true, tone: 7000 }, 0.15),
      makeFx('reverb', { size: 0.5, decay: 1.4, hicut: 9000 }, 0.18),
    ],
  },
  {
    id: 'phase80s', name: '80s', desc: 'フェイザーとコーラスのシンセポップ',
    chain: () => [
      makeFx('phaser', { rate: 0.2, depth: 0.6, freq: 900, stages: '6' }, 0.45),
      makeFx('chorus', { rate: 0.8, depth: 0.4, delay: 0.01 }, 0.35),
      makeFx('reverb', { size: 0.75, decay: 2.8, hicut: 8000 }, 0.3),
    ],
  },
];

/** Rough tail length (s) of a chain for WAV export. */
export function chainTail(chain: FxChain, bpm: number): number {
  let t = 0.5;
  for (const it of chain.items) {
    if (!it.on) continue;
    if (it.type === 'reverb') t = Math.max(t, Number(it.p.decay) * 1.1 + Number(it.p.predelay));
    if (it.type === 'delay') {
      const fb = Number(it.p.fb);
      const beats = ({ '1/16': 0.25, '1/8t': 1 / 3, '1/8': 0.5, '1/8.': 0.75, '1/4t': 2 / 3, '1/4': 1, '1/4.': 1.5, '1/2': 2, '1/1': 4 } as Record<string, number>)[String(it.p.div)] ?? 1;
      const repeats = fb > 0.01 ? Math.log(0.001) / Math.log(fb) : 1;
      t = Math.max(t, Math.min(12, repeats * beats * (60 / bpm)));
    }
  }
  return Math.min(14, t);
}
