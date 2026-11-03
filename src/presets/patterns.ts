// Pattern presets: tap one and the progression instantly gets a feel.
import { DEFAULT_PUMP, PatternSpec, PumpSpec, normalizePattern } from '../seq/pattern';

export interface PatternPreset {
  id: string;
  name: string;
  cat: '刻み' | 'アルペジオ' | 'ストラム' | 'ポンピング';
  desc: string;
  pattern: PatternSpec;
  /** Pumping that comes with the preset (ポンピング category). */
  pump?: PumpSpec;
}

const P = (p: Partial<PatternSpec>) => normalizePattern(p);

export const PATTERN_PRESETS: PatternPreset[] = [
  // ---- 刻み
  { id: 'sustain', name: 'ロングトーン', cat: '刻み', desc: 'コードを長く伸ばす（パッド向け）', pattern: P({ kind: 'block', res: 'bar', steps: 'x-------', gate: 1, vel: 0.75 }) },
  { id: 'whole', name: '全音符', cat: '刻み', desc: '小節ごとに鳴らし直す', pattern: P({ kind: 'block', res: 'bar', steps: 'x', gate: 0.97, vel: 0.78 }) },
  { id: 'half', name: '2分音符', cat: '刻み', desc: '2拍ずつ', pattern: P({ kind: 'block', res: '2', steps: 'Xx', gate: 0.95, vel: 0.74 }) },
  { id: 'quarter', name: '4分刻み', cat: '刻み', desc: 'ピアノの基本の刻み', pattern: P({ kind: 'block', res: '4', steps: 'Xxxx', gate: 0.82, vel: 0.72 }) },
  { id: 'eighth', name: '8分刻み', cat: '刻み', desc: '8ビートの疾走感', pattern: P({ kind: 'block', res: '8', steps: 'Xxxxxxxx', gate: 0.7, vel: 0.68, accent: 0.2 }) },
  { id: 'sixteenth', name: '16分刻み', cat: '刻み', desc: '細かく刻んでノリを出す', pattern: P({ kind: 'block', res: '16', steps: 'Xxxx', gate: 0.5, vel: 0.62, accent: 0.22 }) },
  { id: 'triplet', name: '3連刻み', cat: '刻み', desc: 'バラードの3連', pattern: P({ kind: 'block', res: '8t', steps: 'Xxx', gate: 0.8, vel: 0.66, accent: 0.18 }) },
  { id: 'dotted', name: '付点（3+3+2）', cat: '刻み', desc: 'トレシーロのはずむノリ', pattern: P({ kind: 'block', res: '8', steps: 'X--x--x-', gate: 0.9, vel: 0.74 }) },
  { id: 'dotted16', name: '付点8分', cat: '刻み', desc: '16分の付点で跳ねる', pattern: P({ kind: 'block', res: '16', steps: 'X--x--x--x--x-x-', gate: 0.85, vel: 0.7 }) },
  { id: 'synco', name: 'シンコペーション', cat: '刻み', desc: '裏で食うJ-POPのサビ', pattern: P({ kind: 'block', res: '8', steps: 'X--x-.x-', gate: 0.92, vel: 0.74 }) },
  { id: 'charleston', name: 'チャールストン', cat: '刻み', desc: '1拍目と2拍裏', pattern: P({ kind: 'block', res: '8', steps: 'X--x....', gate: 0.8, vel: 0.74 }) },
  { id: 'offbeat', name: '裏打ち', cat: '刻み', desc: 'スカ・ハウスの裏', pattern: P({ kind: 'block', res: '8', steps: '.X.X.X.X', gate: 0.35, vel: 0.7, accent: 0.1, retrig: false }) },
  { id: 'reggae', name: 'レゲエ', cat: '刻み', desc: '2拍4拍のカッティング', pattern: P({ kind: 'block', res: '8', steps: '..X...X.', gate: 0.28, vel: 0.72, retrig: false }) },
  { id: 'ballad8', name: 'バラード8分', cat: '刻み', desc: 'やさしく8分で支える', pattern: P({ kind: 'block', res: '8', steps: 'X-x-x-x-', gate: 0.95, vel: 0.6, accent: 0.15 }) },
  // ---- アルペジオ
  { id: 'arp-up8', name: '上昇8分', cat: 'アルペジオ', desc: 'シンプルに下から', pattern: P({ kind: 'arp', res: '8', steps: 'x', gate: 0.9, vel: 0.7, arp: { mode: 'up', octaves: 1, start: 0 } }) },
  { id: 'arp-up16', name: '上昇16分', cat: 'アルペジオ', desc: '2オクターブを駆け上がる', pattern: P({ kind: 'arp', res: '16', steps: 'Xxxx', gate: 0.7, vel: 0.66, accent: 0.15, arp: { mode: 'up', octaves: 2, start: 0 } }) },
  { id: 'arp-updown', name: '往復16分', cat: 'アルペジオ', desc: '上って下りてキラキラ', pattern: P({ kind: 'arp', res: '16', steps: 'x', gate: 0.65, vel: 0.64, arp: { mode: 'updown', octaves: 2, start: 0 } }) },
  { id: 'arp-down', name: '下降8分', cat: 'アルペジオ', desc: '上から降ってくる', pattern: P({ kind: 'arp', res: '8', steps: 'x', gate: 0.85, vel: 0.68, arp: { mode: 'down', octaves: 1, start: 0 } }) },
  { id: 'arp-random', name: 'ランダム', cat: 'アルペジオ', desc: '気まぐれに散らす', pattern: P({ kind: 'arp', res: '16', steps: 'x.xx', gate: 0.55, vel: 0.62, arp: { mode: 'random', octaves: 2, start: 0 } }) },
  { id: 'arp-trip', name: '3連アルペジオ', cat: 'アルペジオ', desc: '流れるような3連', pattern: P({ kind: 'arp', res: '8t', steps: 'Xxx', gate: 0.9, vel: 0.66, accent: 0.12, arp: { mode: 'up', octaves: 2, start: 0 } }) },
  { id: 'arp-ballad', name: 'ピアノ分散', cat: 'アルペジオ', desc: 'バラードのピアノ伴奏風', pattern: P({ kind: 'arp', res: '8', steps: 'x', gate: 1, vel: 0.62, arp: { mode: 'updown', octaves: 2, start: 0 }, oct: -1 }) },
  { id: 'arp-sparkle', name: 'きらきら', cat: 'アルペジオ', desc: '高音で細かくきらめく', pattern: P({ kind: 'arp', res: '16t', steps: 'x', gate: 0.45, vel: 0.55, arp: { mode: 'up', octaves: 3, start: 0 }, oct: 1 }) },
  { id: 'arp-inout', name: '外→内', cat: 'アルペジオ', desc: '低音と高音を交互に', pattern: P({ kind: 'arp', res: '8', steps: 'x', gate: 0.85, vel: 0.66, arp: { mode: 'inout', octaves: 2, start: 0 } }) },
  // ---- ストラム
  { id: 'strum-slow', name: 'ゆったりストラム', cat: 'ストラム', desc: 'ジャラーンと1回', pattern: P({ kind: 'strum', res: 'bar', steps: 'x', gate: 1, vel: 0.75, strum: { dir: 'down', speed: 38 } }) },
  { id: 'strum-8', name: 'アコギ8ビート', cat: 'ストラム', desc: 'ダウン・ダウンアップ・アップダウンアップ', pattern: P({ kind: 'strum', res: '8', steps: 'X.xx.xxx', gate: 0.95, vel: 0.7, accent: 0.18, strum: { dir: 'alt', speed: 12 } }) },
  { id: 'strum-16', name: '16ビートカッティング', cat: 'ストラム', desc: 'ファンキーな16分', pattern: P({ kind: 'strum', res: '16', steps: 'X.x.xxX.x.xxX.xx', gate: 0.45, vel: 0.66, accent: 0.2, strum: { dir: 'alt', speed: 6 } }) },
  { id: 'strum-harp', name: 'ハープ', cat: 'ストラム', desc: '上から優雅に', pattern: P({ kind: 'strum', res: 'bar', steps: 'x', gate: 1, vel: 0.7, strum: { dir: 'up', speed: 70 } }) },
  { id: 'strum-waltz', name: 'ワルツ', cat: 'ストラム', desc: 'ズン・チャッ・チャッ', pattern: P({ kind: 'strum', res: '4', steps: 'Xxx', gate: 0.7, vel: 0.68, accent: 0.2, strum: { dir: 'down', speed: 14 } }) },
  // ---- ポンピング
  { id: 'pump-edm', name: 'EDMポンピング', cat: 'ポンピング', desc: '4つ打ちキックで揺れる感じ', pattern: P({ kind: 'block', res: 'bar', steps: 'x-------', gate: 1, vel: 0.8 }), pump: { ...DEFAULT_PUMP, on: true, rate: '1/4', depth: 0.75, curve: 0.55, length: 0.85 } },
  { id: 'pump-half', name: 'ゆったりポンプ', cat: 'ポンピング', desc: '2拍ごとに大きく呼吸', pattern: P({ kind: 'block', res: 'bar', steps: 'x-------', gate: 1, vel: 0.8 }), pump: { ...DEFAULT_PUMP, on: true, rate: '1/2', depth: 0.65, curve: 0.35, length: 0.9 } },
  { id: 'pump-future', name: 'フューチャーベース', cat: 'ポンピング', desc: '8分ポンプ＋刻み', pattern: P({ kind: 'block', res: '8', steps: 'X-x-X-xx', gate: 0.9, vel: 0.75 }), pump: { ...DEFAULT_PUMP, on: true, rate: '1/4', depth: 0.6, curve: 0.75, length: 0.6 } },
  { id: 'pump-chill', name: 'チルポンプ', cat: 'ポンピング', desc: '浅めでさりげなく', pattern: P({ kind: 'block', res: 'bar', steps: 'x-------', gate: 1, vel: 0.78 }), pump: { ...DEFAULT_PUMP, on: true, rate: '1/4', depth: 0.35, curve: 0.4, length: 0.95 } },
];

export function patternPreset(id: string): PatternPreset | undefined {
  return PATTERN_PRESETS.find((p) => p.id === id);
}

/** Name of a pattern if it equals a preset (for labels). */
export function patternName(p: PatternSpec | null | undefined): string {
  if (!p) return '';
  const s = JSON.stringify(normalizePattern(p));
  return PATTERN_PRESETS.find((x) => !x.pump && JSON.stringify(x.pattern) === s)?.name ?? PATTERN_PRESETS.find((x) => JSON.stringify(x.pattern) === s)?.name ?? 'カスタム';
}
