// Built-in synth presets (chord sounds, bass sounds, melody sounds).
import { ModRoute, Patch, PatchOptions, normalizePatch } from '../audio/params';

type PP = Record<string, number>;

function mk(id: string, name: string, cat: string, p: PP, o: Partial<PatchOptions> = {}, mods: ModRoute[] = []): Patch {
  return normalizePatch({ id, name, cat, p, o: { ...o } as PatchOptions, mods });
}
const m = (src: ModRoute['src'], dst: string, amt: number): ModRoute => ({ src, dst, amt });

export const CHORD_PRESETS: Patch[] = [
  mk('pad-dreamy', 'ドリーミーパッド', 'パッド', {
    'osc1.level': 0.75, 'osc1.pos': 0.55, 'osc1.uni': 4, 'osc1.detune': 0.24, 'osc1.spread': 0.85,
    'osc2.level': 0.32, 'osc2.pos': 0.25, 'osc2.oct': 1, 'osc2.uni': 2, 'osc2.detune': 0.15,
    'filter.cutoff': 2300, 'filter.res': 0.18, 'filter.key': 0.3,
    'env1.a': 0.9, 'env1.d': 1.6, 'env1.s': 0.85, 'env1.r': 2.4,
    'env2.a': 1.4, 'env2.d': 2.5, 'env2.s': 0.55, 'env2.r': 2.4,
    'lfo1.rate': 0.16, 'amp.level': 0.46, 'amp.vel': 0.3,
  }, { osc1Table: 'warm', osc2On: true, osc2Table: 'vocal', filterType: 'lp24', lfo2Sync: true, lfo2Div: '2/1' },
  [m('lfo1', 'osc1.pos', 0.22), m('lfo2', 'filter.cutoff', 0.08), m('env2', 'filter.cutoff', 0.16), m('lfo1', 'osc2.pos', -0.2)]),

  mk('pad-warm', 'ウォームパッド', 'パッド', {
    'osc1.level': 0.7, 'osc1.pos': 0.6, 'osc1.uni': 3, 'osc1.detune': 0.18, 'osc1.spread': 0.7,
    'osc2.level': 0.55, 'osc2.pos': 0.45, 'osc2.fine': 8, 'osc2.uni': 2, 'osc2.detune': 0.12,
    'filter.cutoff': 1700, 'filter.res': 0.12, 'filter.key': 0.35,
    'env1.a': 0.45, 'env1.d': 1.2, 'env1.s': 0.85, 'env1.r': 1.5,
    'lfo1.rate': 0.25, 'amp.level': 0.35, 'amp.vel': 0.35,
  }, { osc1Table: 'basic', osc2On: true, osc2Table: 'basic', filterType: 'lp24' },
  [m('lfo1', 'osc2.pos', 0.12), m('vel', 'filter.cutoff', 0.12)]),

  mk('supersaw', 'スーパーソー', 'リード/ソー', {
    'osc1.level': 0.8, 'osc1.pos': 0.6667, 'osc1.uni': 7, 'osc1.detune': 0.44, 'osc1.spread': 1,
    'osc2.level': 0.38, 'osc2.pos': 0.6667, 'osc2.oct': -1, 'osc2.uni': 3, 'osc2.detune': 0.22,
    'filter.cutoff': 9500, 'filter.res': 0.08, 'filter.key': 0.2,
    'env1.a': 0.006, 'env1.d': 0.7, 'env1.s': 0.85, 'env1.r': 0.5, 'amp.level': 0.4, 'amp.vel': 0.35,
  }, { osc1Table: 'basic', osc2On: true, osc2Table: 'basic', filterType: 'lp12' },
  [m('vel', 'filter.cutoff', 0.08)]),

  mk('pluck', 'プラック', 'プラック', {
    'osc1.level': 0.75, 'osc1.pos': 0.6667, 'osc1.uni': 3, 'osc1.detune': 0.12, 'osc1.spread': 0.6,
    'osc2.level': 0.35, 'osc2.pos': 0.3, 'osc2.oct': 1,
    'filter.cutoff': 520, 'filter.res': 0.28, 'filter.key': 0.55,
    'env1.a': 0.002, 'env1.d': 0.55, 'env1.s': 0, 'env1.r': 0.35,
    'env2.a': 0.001, 'env2.d': 0.26, 'env2.s': 0, 'env2.r': 0.2, 'amp.level': 0.85, 'amp.vel': 0.5,
  }, { osc1Table: 'basic', osc2On: true, osc2Table: 'pwm', filterType: 'lp24', osc1Rand: false, osc2Rand: false },
  [m('env2', 'filter.cutoff', 0.52), m('vel', 'filter.cutoff', 0.14)]),

  mk('bell', 'ベル', 'ベル/キー', {
    'osc1.level': 0.7, 'osc1.pos': 0.4,
    'osc2.level': 0.28, 'osc2.pos': 0.55, 'osc2.oct': 1, 'osc2.fine': 6,
    'filter.cutoff': 12000, 'filter.res': 0,
    'env1.a': 0.002, 'env1.d': 2.8, 'env1.s': 0, 'env1.r': 2.4,
    'env2.a': 0.001, 'env2.d': 1.1, 'env2.s': 0.08, 'env2.r': 1.2,
    'env3.a': 0.001, 'env3.d': 0.5, 'env3.s': 0, 'env3.r': 0.5, 'amp.level': 0.51, 'amp.vel': 0.55,
  }, { osc1Table: 'fm', osc2On: true, osc2Table: 'glass', filterType: 'lp12', osc1Rand: false },
  [m('env2', 'osc1.pos', 0.38), m('env3', 'osc2.level', 0.4), m('vel', 'osc1.pos', 0.12)]),

  mk('epiano', 'エレピ', 'ベル/キー', {
    'osc1.level': 0.8, 'osc1.pos': 0.18,
    'osc2.level': 0.18, 'osc2.pos': 0, 'osc2.oct': 1,
    'filter.cutoff': 7000, 'filter.res': 0.05, 'filter.key': 0.3,
    'env1.a': 0.002, 'env1.d': 2.4, 'env1.s': 0.3, 'env1.r': 0.5,
    'env2.a': 0.001, 'env2.d': 0.8, 'env2.s': 0.1, 'env2.r': 0.5,
    'lfo1.rate': 4.2, 'amp.level': 0.51, 'amp.vel': 0.65,
  }, { osc1Table: 'epiano', osc2On: true, osc2Table: 'basic', filterType: 'lp12', osc1Rand: false, osc2Rand: false },
  [m('env2', 'osc1.pos', 0.45), m('vel', 'osc1.pos', 0.3), m('lfo1', 'osc1.pan', 0.28), m('lfo1', 'osc2.pan', -0.28)]),

  mk('strings', 'ストリングス', 'パッド', {
    'osc1.level': 0.7, 'osc1.pos': 0.6667, 'osc1.uni': 5, 'osc1.detune': 0.25, 'osc1.spread': 0.9,
    'osc2.level': 0.4, 'osc2.pos': 0.25, 'osc2.uni': 3, 'osc2.detune': 0.18,
    'filter.cutoff': 2800, 'filter.res': 0.1, 'filter.key': 0.45,
    'env1.a': 0.38, 'env1.d': 1.2, 'env1.s': 0.9, 'env1.r': 0.9,
    'env2.a': 0.5, 'env2.d': 1.5, 'env2.s': 0.6, 'env2.r': 1,
    'lfo3.rate': 5.2, 'lfo3.fade': 0.9, 'amp.level': 0.49, 'amp.vel': 0.45,
  }, { osc1Table: 'basic', osc2On: true, osc2Table: 'pwm', filterType: 'lp24' },
  [m('lfo3', 'osc1.semi', 0.0045), m('lfo3', 'osc2.semi', 0.0045), m('env2', 'filter.cutoff', 0.1), m('vel', 'filter.cutoff', 0.12)]),

  mk('organ', 'オルガン', 'ベル/キー', {
    'osc1.level': 0.75, 'osc1.pos': 0.55,
    'env1.a': 0.004, 'env1.d': 0.2, 'env1.s': 1, 'env1.r': 0.09, 'lfo1.rate': 5.8, 'amp.level': 0.39, 'amp.vel': 0.1,
  }, { osc1Table: 'organ', filterOn: false, osc1Rand: false },
  [m('lfo1', 'osc1.pos', 0.04), m('lfo1', 'osc1.pan', 0.35)]),

  mk('glass', 'ガラスキー', 'ベル/キー', {
    'osc1.level': 0.65, 'osc1.pos': 0.45, 'osc2.level': 0.38, 'osc2.pos': 0.33, 'osc2.oct': -1,
    'filter.cutoff': 11000, 'env1.a': 0.002, 'env1.d': 1.6, 'env1.s': 0.22, 'env1.r': 1.1,
    'env2.a': 0.001, 'env2.d': 0.5, 'env2.s': 0, 'env2.r': 0.4, 'amp.level': 0.58, 'amp.vel': 0.55,
  }, { osc1Table: 'glass', osc2On: true, osc2Table: 'basic', filterType: 'lp12', osc1Rand: false },
  [m('env2', 'osc1.pos', 0.35), m('vel', 'osc1.pos', 0.15)]),

  mk('lofikeys', 'Lo-Fiキー', 'ベル/キー', {
    'osc1.level': 0.72, 'osc1.pos': 0.33, 'osc2.level': 0.38, 'osc2.pos': 0.1,
    'noise.level': 0.03, 'filter.cutoff': 2100, 'filter.res': 0.08, 'filter.key': 0.3,
    'env1.a': 0.003, 'env1.d': 1.7, 'env1.s': 0.3, 'env1.r': 0.45, 'lfo1.rate': 0.55, 'amp.level': 0.42, 'amp.vel': 0.5,
  }, { osc1Table: 'basic', osc2On: true, osc2Table: 'epiano', filterType: 'lp12', osc1Rand: false },
  [m('lfo1', 'osc1.fine', 0.06), m('lfo1', 'osc2.fine', 0.06), m('vel', 'filter.cutoff', 0.15)]),

  mk('chip', 'チップチューン', 'リード/ソー', {
    'osc1.level': 0.55, 'osc1.pos': 0, 'env1.a': 0.001, 'env1.d': 0.25, 'env1.s': 0.65, 'env1.r': 0.06, 'amp.level': 0.48, 'amp.vel': 0.2,
  }, { osc1Table: 'pwm', filterOn: false, osc1Rand: false }),

  mk('choir', 'クワイア', 'パッド', {
    'osc1.level': 0.75, 'osc1.pos': 0.05, 'osc1.uni': 4, 'osc1.detune': 0.2, 'osc1.spread': 0.8,
    'osc2.level': 0.25, 'osc2.pos': 0.0, 'osc2.oct': 1, 'osc2.uni': 2,
    'filter.cutoff': 4200, 'filter.res': 0.08, 'env1.a': 0.6, 'env1.d': 1, 'env1.s': 0.9, 'env1.r': 1.6,
    'lfo1.rate': 0.11, 'lfo3.rate': 4.8, 'lfo3.fade': 1.2, 'amp.level': 0.66, 'amp.vel': 0.3,
  }, { osc1Table: 'vocal', osc2On: true, osc2Table: 'basic', filterType: 'lp24' },
  [m('lfo1', 'osc1.pos', 0.42), m('lfo3', 'osc1.semi', 0.004)]),

  mk('brass', 'シンセブラス', 'リード/ソー', {
    'osc1.level': 0.7, 'osc1.pos': 0.6667, 'osc1.uni': 3, 'osc1.detune': 0.16, 'osc1.spread': 0.6,
    'osc2.level': 0.5, 'osc2.pos': 0.6667, 'osc2.fine': -9,
    'filter.cutoff': 850, 'filter.res': 0.16, 'filter.key': 0.4,
    'env1.a': 0.035, 'env1.d': 0.4, 'env1.s': 0.85, 'env1.r': 0.28,
    'env2.a': 0.07, 'env2.d': 0.45, 'env2.s': 0.45, 'env2.r': 0.3, 'amp.level': 0.51, 'amp.vel': 0.5,
  }, { osc1Table: 'basic', osc2On: true, osc2Table: 'basic', filterType: 'lp24' },
  [m('env2', 'filter.cutoff', 0.38), m('vel', 'filter.cutoff', 0.15)]),

  mk('softkeys', 'ソフトピアノ', 'ベル/キー', {
    'osc1.level': 0.75, 'osc1.pos': 0.18, 'osc2.level': 0.32, 'osc2.pos': 0.45,
    'filter.cutoff': 3600, 'filter.res': 0.05, 'filter.key': 0.5,
    'env1.a': 0.002, 'env1.d': 2.2, 'env1.s': 0.15, 'env1.r': 0.65,
    'env2.a': 0.001, 'env2.d': 0.7, 'env2.s': 0.2, 'env2.r': 0.6, 'amp.level': 0.41, 'amp.vel': 0.65,
  }, { osc1Table: 'basic', osc2On: true, osc2Table: 'warm', filterType: 'lp24', osc1Rand: false, osc2Rand: false },
  [m('env2', 'filter.cutoff', 0.22), m('vel', 'filter.cutoff', 0.22)]),

  mk('ambient', 'アンビエント', 'パッド', {
    'osc1.level': 0.65, 'osc1.pos': 0.3, 'osc1.uni': 3, 'osc1.detune': 0.16, 'osc1.spread': 1,
    'osc2.level': 0.3, 'osc2.pos': 0.5, 'osc2.oct': 1,
    'filter.cutoff': 4800, 'filter.res': 0.1, 'env1.a': 1.8, 'env1.d': 2, 'env1.s': 0.9, 'env1.r': 4,
    'lfo1.rate': 0.07, 'amp.level': 0.67, 'amp.vel': 0.2,
  }, { osc1Table: 'sweep', osc2On: true, osc2Table: 'glass', filterType: 'lp24', lfo2Sync: true, lfo2Div: '1/1', lfo2Shape: 'tri' },
  [m('lfo1', 'osc1.pos', 0.38), m('lfo2', 'osc2.level', -0.25)]),

  mk('hollow', 'ホロウパッド', 'パッド', {
    'osc1.level': 0.72, 'osc1.pos': 0.25, 'osc1.uni': 3, 'osc1.detune': 0.2, 'osc1.spread': 0.8,
    'filter.cutoff': 3200, 'filter.res': 0.2, 'env1.a': 0.5, 'env1.d': 1, 'env1.s': 0.85, 'env1.r': 1.4,
    'lfo1.rate': 0.2, 'amp.level': 0.34, 'amp.vel': 0.3,
  }, { osc1Table: 'hollow', filterType: 'lp24' },
  [m('lfo1', 'osc1.pos', 0.3)]),
];

export const BASS_PRESETS: Patch[] = [
  mk('bass-sub', 'サブベース', 'ベース', {
    'osc1.level': 0.85, 'osc1.pos': 0, 'osc2.level': 0.22, 'osc2.pos': 0.33,
    'env1.a': 0.005, 'env1.d': 0.3, 'env1.s': 0.9, 'env1.r': 0.12, 'amp.level': 0.4, 'amp.vel': 0.3,
  }, { osc1Table: 'basic', osc2On: true, osc2Table: 'basic', filterOn: false, osc1Rand: false, osc2Rand: false }),
  mk('bass-synth', 'シンセベース', 'ベース', {
    'osc1.level': 0.7, 'osc1.pos': 0.6667, 'osc1.uni': 2, 'osc1.detune': 0.08, 'osc2.level': 0.42, 'osc2.pos': 1, 'osc2.oct': -1,
    'filter.cutoff': 480, 'filter.res': 0.3, 'filter.key': 0.4,
    'env1.a': 0.002, 'env1.d': 0.3, 'env1.s': 0.8, 'env1.r': 0.1,
    'env2.a': 0.001, 'env2.d': 0.25, 'env2.s': 0.18, 'env2.r': 0.1, 'amp.level': 0.71, 'amp.vel': 0.4,
  }, { osc1Table: 'basic', osc2On: true, osc2Table: 'basic', filterType: 'lp24', osc1Rand: false, osc2Rand: false },
  [m('env2', 'filter.cutoff', 0.36)]),
  mk('bass-pluck', 'プラックベース', 'ベース', {
    'osc1.level': 0.8, 'osc1.pos': 0.6667, 'filter.cutoff': 650, 'filter.res': 0.34, 'filter.key': 0.5,
    'env1.a': 0.002, 'env1.d': 0.5, 'env1.s': 0.4, 'env1.r': 0.1,
    'env2.a': 0.001, 'env2.d': 0.18, 'env2.s': 0, 'env2.r': 0.1, 'amp.level': 1, 'amp.vel': 0.5,
  }, { osc1Table: 'basic', filterType: 'lp24', osc1Rand: false },
  [m('env2', 'filter.cutoff', 0.45)]),
  mk('bass-electric', 'エレキベース風', 'ベース', {
    'osc1.level': 0.8, 'osc1.pos': 0.42, 'osc2.level': 0.28, 'osc2.pos': 0.6,
    'filter.cutoff': 1100, 'filter.res': 0.1, 'filter.key': 0.4,
    'env1.a': 0.003, 'env1.d': 0.9, 'env1.s': 0.5, 'env1.r': 0.09,
    'env2.a': 0.001, 'env2.d': 0.3, 'env2.s': 0.2, 'env2.r': 0.1, 'amp.level': 0.98, 'amp.vel': 0.5,
  }, { osc1Table: 'basic', osc2On: true, osc2Table: 'pwm', filterType: 'lp12', osc1Rand: false, osc2Rand: false },
  [m('env2', 'filter.cutoff', 0.2), m('vel', 'filter.cutoff', 0.15)]),
  mk('bass-warm', 'アナログベース', 'ベース', {
    'osc1.level': 0.78, 'osc1.pos': 0.6, 'filter.cutoff': 650, 'filter.res': 0.2, 'filter.key': 0.3, 'amp.glide': 0.04,
    'env1.a': 0.004, 'env1.d': 0.5, 'env1.s': 0.85, 'env1.r': 0.12, 'amp.level': 0.75, 'amp.vel': 0.35,
  }, { osc1Table: 'basic', filterType: 'lp24', osc1Rand: false }),
  mk('bass-808', '808風', 'ベース', {
    'osc1.level': 0.9, 'osc1.pos': 0, 'filter.cutoff': 9000, 'filter.drive': 0.35,
    'env1.a': 0.002, 'env1.d': 1.4, 'env1.s': 0.6, 'env1.r': 0.25,
    'env2.a': 0.001, 'env2.d': 0.08, 'env2.s': 0, 'env2.r': 0.05, 'amp.level': 1, 'amp.vel': 0.3,
  }, { osc1Table: 'basic', filterType: 'lp12', osc1Rand: false },
  [m('env2', 'osc1.semi', 0.08)]),
];

export const MELODY_PRESETS: Patch[] = [
  mk('lead-sine', 'やわらかリード', 'メロディ', {
    'osc1.level': 0.75, 'osc1.pos': 0.12, 'env1.a': 0.01, 'env1.d': 0.4, 'env1.s': 0.8, 'env1.r': 0.25,
    'lfo3.rate': 5.5, 'lfo3.fade': 0.5, 'amp.level': 0.36, 'amp.glide': 0.03,
  }, { osc1Table: 'basic', filterOn: false, osc1Rand: false }, [m('lfo3', 'osc1.semi', 0.004)]),
  mk('lead-square', 'スクエアリード', 'メロディ', {
    'osc1.level': 0.6, 'osc1.pos': 0.2, 'filter.cutoff': 4000, 'env1.a': 0.005, 'env1.d': 0.3, 'env1.s': 0.75, 'env1.r': 0.15, 'amp.level': 0.33,
  }, { osc1Table: 'pwm', filterType: 'lp12', osc1Rand: false }),
];

export const ALL_BUILTIN_PATCHES: Patch[] = [...CHORD_PRESETS, ...BASS_PRESETS, ...MELODY_PRESETS];

export function builtinPatch(id: string): Patch | undefined {
  const p = ALL_BUILTIN_PATCHES.find((x) => x.id === id);
  return p ? structuredCloneSafe(p) : undefined;
}

export function structuredCloneSafe<T>(x: T): T {
  return JSON.parse(JSON.stringify(x)) as T;
}
