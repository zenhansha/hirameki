// Synth parameter registry, shared by the UI (knobs) and the AudioWorklet (DSP).
// Patch values are stored in real units; modulation works in the normalised 0…1 domain like Vital.

export type Curve = 'lin' | 'exp' | 'int';

export interface ParamDef {
  id: string;
  label: string;
  min: number;
  max: number;
  def: number;
  curve: Curve;
  unit?: string;
  /** Can be a modulation destination. */
  mod?: boolean;
  /** Short group label for the mod list. */
  group: string;
}

export const OSC_COUNT = 3;
export const ENV_COUNT = 3;
export const LFO_COUNT = 3;

const P: ParamDef[] = [];
const add = (d: ParamDef) => P.push(d);

for (let i = 1; i <= OSC_COUNT; i++) {
  const g = `OSC${i}`;
  add({ id: `osc${i}.level`, label: '音量', min: 0, max: 1, def: i === 1 ? 0.8 : 0.6, curve: 'lin', mod: true, group: g });
  add({ id: `osc${i}.pos`, label: 'ポジション', min: 0, max: 1, def: 0, curve: 'lin', mod: true, group: g });
  add({ id: `osc${i}.oct`, label: 'オクターブ', min: -3, max: 3, def: 0, curve: 'int', group: g });
  add({ id: `osc${i}.semi`, label: '半音', min: -24, max: 24, def: 0, curve: 'lin', unit: 'st', mod: true, group: g });
  add({ id: `osc${i}.fine`, label: '微調整', min: -100, max: 100, def: 0, curve: 'lin', unit: 'ct', mod: true, group: g });
  add({ id: `osc${i}.pan`, label: 'パン', min: -1, max: 1, def: 0, curve: 'lin', mod: true, group: g });
  add({ id: `osc${i}.uni`, label: 'ユニゾン', min: 1, max: 8, def: 1, curve: 'int', group: g });
  add({ id: `osc${i}.detune`, label: 'デチューン', min: 0, max: 1, def: 0.25, curve: 'lin', mod: true, group: g });
  add({ id: `osc${i}.spread`, label: '広がり', min: 0, max: 1, def: 0.7, curve: 'lin', mod: true, group: g });
}
add({ id: 'noise.level', label: 'ノイズ', min: 0, max: 1, def: 0, curve: 'lin', mod: true, group: 'NOISE' });
add({ id: 'filter.cutoff', label: 'カットオフ', min: 20, max: 20000, def: 8000, curve: 'exp', unit: 'Hz', mod: true, group: 'FILTER' });
add({ id: 'filter.res', label: 'レゾナンス', min: 0, max: 1, def: 0.15, curve: 'lin', mod: true, group: 'FILTER' });
add({ id: 'filter.drive', label: 'ドライブ', min: 0, max: 1, def: 0, curve: 'lin', mod: true, group: 'FILTER' });
add({ id: 'filter.key', label: 'キー追従', min: 0, max: 1, def: 0.3, curve: 'lin', group: 'FILTER' });
add({ id: 'amp.level', label: '音量', min: 0, max: 1, def: 0.45, curve: 'lin', mod: true, group: 'AMP' });
add({ id: 'amp.vel', label: 'ベロシティ感度', min: 0, max: 1, def: 0.5, curve: 'lin', group: 'AMP' });
add({ id: 'amp.glide', label: 'グライド', min: 0, max: 1, def: 0, curve: 'lin', unit: 's', group: 'AMP' });
for (let i = 1; i <= ENV_COUNT; i++) {
  const g = `ENV${i}`;
  add({ id: `env${i}.a`, label: 'アタック', min: 0.001, max: 8, def: i === 1 ? 0.005 : 0.01, curve: 'exp', unit: 's', group: g });
  add({ id: `env${i}.d`, label: 'ディケイ', min: 0.005, max: 10, def: 0.4, curve: 'exp', unit: 's', group: g });
  add({ id: `env${i}.s`, label: 'サステイン', min: 0, max: 1, def: i === 1 ? 0.8 : 0.3, curve: 'lin', group: g });
  add({ id: `env${i}.r`, label: 'リリース', min: 0.005, max: 12, def: i === 1 ? 0.35 : 0.4, curve: 'exp', unit: 's', group: g });
}
for (let i = 1; i <= LFO_COUNT; i++) {
  const g = `LFO${i}`;
  add({ id: `lfo${i}.rate`, label: 'レート', min: 0.02, max: 30, def: 2, curve: 'exp', unit: 'Hz', group: g });
  add({ id: `lfo${i}.phase`, label: '位相', min: 0, max: 1, def: 0, curve: 'lin', group: g });
  add({ id: `lfo${i}.fade`, label: 'フェードイン', min: 0, max: 5, def: 0, curve: 'lin', unit: 's', group: g });
}

export const PARAMS: ParamDef[] = P;
export const PARAM_INDEX: Record<string, number> = Object.fromEntries(P.map((p, i) => [p.id, i]));
export const PARAM_MAP: Record<string, ParamDef> = Object.fromEntries(P.map((p) => [p.id, p]));
export const MOD_DESTS = P.filter((p) => p.mod).map((p) => p.id);

export function toNorm(def: ParamDef, v: number): number {
  if (def.curve === 'exp') return Math.log(Math.max(def.min, v) / def.min) / Math.log(def.max / def.min);
  return (v - def.min) / (def.max - def.min);
}

export function fromNorm(def: ParamDef, n: number): number {
  const x = n < 0 ? 0 : n > 1 ? 1 : n;
  if (def.curve === 'exp') return def.min * Math.pow(def.max / def.min, x);
  const v = def.min + x * (def.max - def.min);
  return def.curve === 'int' ? Math.round(v) : v;
}

export function clampParam(def: ParamDef, v: number): number {
  if (typeof v !== 'number' || !isFinite(v)) return def.def;
  const c = Math.min(def.max, Math.max(def.min, v));
  return def.curve === 'int' ? Math.round(c) : c;
}

// ---- options, sources, patch ---------------------------------------------

export type ModSource = 'env1' | 'env2' | 'env3' | 'lfo1' | 'lfo2' | 'lfo3' | 'vel' | 'key' | 'rand' | 'mw';
export const MOD_SOURCES: { id: ModSource; label: string; color: string }[] = [
  { id: 'env2', label: 'ENV2', color: '#ffb347' },
  { id: 'env3', label: 'ENV3', color: '#ff8a65' },
  { id: 'lfo1', label: 'LFO1', color: '#5ee2ff' },
  { id: 'lfo2', label: 'LFO2', color: '#7c9cff' },
  { id: 'lfo3', label: 'LFO3', color: '#b98cff' },
  { id: 'vel', label: 'VEL', color: '#9be564' },
  { id: 'key', label: 'KEY', color: '#e5e564' },
  { id: 'rand', label: 'RAND', color: '#ff7eb6' },
  { id: 'mw', label: 'MOD', color: '#64e5c0' },
  { id: 'env1', label: 'ENV1', color: '#ffd166' },
];
export const MOD_SOURCE_INDEX: Record<ModSource, number> = {
  env1: 0, env2: 1, env3: 2, lfo1: 3, lfo2: 4, lfo3: 5, vel: 6, key: 7, rand: 8, mw: 9,
};

export interface ModRoute {
  src: ModSource;
  dst: string;
  /** −1…1 in the destination's normalised range. */
  amt: number;
}

export type FilterType = 'lp12' | 'lp24' | 'hp12' | 'bp12' | 'notch';
export type LfoShape = 'sine' | 'tri' | 'saw' | 'ramp' | 'square' | 'sh' | 'smooth';
export type LfoMode = 'free' | 'retrig';

export interface PatchOptions {
  osc1On: boolean; osc2On: boolean; osc3On: boolean;
  osc1Table: string; osc2Table: string; osc3Table: string;
  osc1Rand: boolean; osc2Rand: boolean; osc3Rand: boolean;
  filterOn: boolean;
  filterType: FilterType;
  lfo1Shape: LfoShape; lfo2Shape: LfoShape; lfo3Shape: LfoShape;
  lfo1Sync: boolean; lfo2Sync: boolean; lfo3Sync: boolean;
  lfo1Div: string; lfo2Div: string; lfo3Div: string;
  lfo1Mode: LfoMode; lfo2Mode: LfoMode; lfo3Mode: LfoMode;
}

export interface Patch {
  v: number;
  id?: string;
  name: string;
  cat: string;
  p: Record<string, number>;
  o: PatchOptions;
  mods: ModRoute[];
  /** User preset? */
  user?: boolean;
}

export const PATCH_VERSION = 1;

export const DEFAULT_OPTIONS: PatchOptions = {
  osc1On: true, osc2On: false, osc3On: false,
  osc1Table: 'basic', osc2Table: 'basic', osc3Table: 'basic',
  osc1Rand: true, osc2Rand: true, osc3Rand: true,
  filterOn: true, filterType: 'lp24',
  lfo1Shape: 'sine', lfo2Shape: 'tri', lfo3Shape: 'sine',
  lfo1Sync: false, lfo2Sync: true, lfo3Sync: false,
  lfo1Div: '1/4', lfo2Div: '1/1', lfo3Div: '1/8',
  lfo1Mode: 'free', lfo2Mode: 'free', lfo3Mode: 'retrig',
};

export const LFO_SHAPES: { id: LfoShape; label: string }[] = [
  { id: 'sine', label: 'サイン' }, { id: 'tri', label: '三角' }, { id: 'saw', label: '下り' },
  { id: 'ramp', label: '上り' }, { id: 'square', label: '矩形' }, { id: 'sh', label: 'S&H' }, { id: 'smooth', label: 'ゆらぎ' },
];
export const FILTER_TYPES: { id: FilterType; label: string }[] = [
  { id: 'lp24', label: 'LP 24' }, { id: 'lp12', label: 'LP 12' }, { id: 'hp12', label: 'HP' }, { id: 'bp12', label: 'BP' }, { id: 'notch', label: 'ノッチ' },
];

export function defaultParams(): Record<string, number> {
  return Object.fromEntries(PARAMS.map((p) => [p.id, p.def]));
}

const BOOL_OPTS: (keyof PatchOptions)[] = ['osc1On', 'osc2On', 'osc3On', 'osc1Rand', 'osc2Rand', 'osc3Rand', 'filterOn', 'lfo1Sync', 'lfo2Sync', 'lfo3Sync'];

/** Fill defaults and clamp everything so old/corrupt patches never break the engine. */
export function normalizePatch(raw: Partial<Patch> | null | undefined, tables: string[] = []): Patch {
  const src = raw ?? {};
  const p = defaultParams();
  const rp = (src.p ?? {}) as Record<string, number>;
  for (const def of PARAMS) if (rp[def.id] !== undefined) p[def.id] = clampParam(def, Number(rp[def.id]));
  const o: PatchOptions = { ...DEFAULT_OPTIONS };
  const ro = (src.o ?? {}) as Partial<PatchOptions>;
  for (const k of Object.keys(DEFAULT_OPTIONS) as (keyof PatchOptions)[]) {
    const v = ro[k];
    if (v === undefined) continue;
    if (BOOL_OPTS.includes(k)) (o as unknown as Record<string, unknown>)[k] = !!v;
    else if (typeof v === 'string') (o as unknown as Record<string, unknown>)[k] = v;
  }
  if (tables.length) for (const k of ['osc1Table', 'osc2Table', 'osc3Table'] as const) if (!tables.includes(o[k])) o[k] = 'basic';
  if (!FILTER_TYPES.some((f) => f.id === o.filterType)) o.filterType = 'lp24';
  for (const k of ['lfo1Shape', 'lfo2Shape', 'lfo3Shape'] as const) if (!LFO_SHAPES.some((s) => s.id === o[k])) o[k] = 'sine';
  for (const k of ['lfo1Mode', 'lfo2Mode', 'lfo3Mode'] as const) if (o[k] !== 'free' && o[k] !== 'retrig') o[k] = 'free';
  const mods: ModRoute[] = [];
  for (const m of Array.isArray(src.mods) ? src.mods : []) {
    if (!m || !(m.src in MOD_SOURCE_INDEX) || !PARAM_MAP[m.dst]?.mod) continue;
    const amt = Number(m.amt);
    if (!isFinite(amt) || amt === 0) continue;
    // One route per (src, dst).
    const existing = mods.find((x) => x.src === m.src && x.dst === m.dst);
    if (existing) existing.amt = Math.max(-1, Math.min(1, amt));
    else mods.push({ src: m.src, dst: m.dst, amt: Math.max(-1, Math.min(1, amt)) });
  }
  return {
    v: PATCH_VERSION,
    id: typeof src.id === 'string' ? src.id : undefined,
    name: typeof src.name === 'string' && src.name ? src.name.slice(0, 60) : '無題の音色',
    cat: typeof src.cat === 'string' ? src.cat : 'その他',
    p, o, mods,
    user: src.user ? true : undefined,
  };
}

/** Values to show on a knob: base value plus the mod ranges of every route targeting it. */
export function modRangesFor(patch: Patch, dst: string): { src: ModSource; amt: number }[] {
  return patch.mods.filter((m) => m.dst === dst).map((m) => ({ src: m.src, amt: m.amt }));
}

/** Engine quality settings (light mode lowers these). */
export interface Quality {
  maxVoices: number;
  maxUnison: number;
  /** Control-rate block size in samples. */
  block: number;
}

export const QUALITY_HIGH: Quality = { maxVoices: 28, maxUnison: 8, block: 32 };
export const QUALITY_LIGHT: Quality = { maxVoices: 12, maxUnison: 3, block: 64 };
