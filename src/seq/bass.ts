// Automatic bass lines.
import { mod12 } from '../theory/core';
import { NoteEvent, PatternSpec, RenderContext, rhythmHits } from './pattern';
import { TimeSig, barTicks, beatTicks, isCompound } from './time';

export type BassStyle = 'root' | 'root4' | 'root8' | 'octave' | 'root5' | 'walking' | 'sync' | 'follow';

export const BASS_STYLES: { id: BassStyle; label: string; hint: string }[] = [
  { id: 'root', label: 'ルート（ロング）', hint: '小節ごとにルートを伸ばす' },
  { id: 'root4', label: 'ルート4分', hint: '4分でルートを刻む' },
  { id: 'root8', label: 'ルート8分', hint: '8分で疾走感' },
  { id: 'octave', label: 'オクターブ', hint: 'ディスコ風の上下' },
  { id: 'root5', label: 'ルート＋5度', hint: 'ルートと5度を交互に' },
  { id: 'walking', label: 'ウォーキング', hint: '次のコードへ歩いていくジャズ風' },
  { id: 'sync', label: 'シンコペーション', hint: '3+3+2のノリ' },
  { id: 'follow', label: 'パターンに合わせる', hint: 'コードと同じリズムでルート' },
];

export interface BassChordInfo {
  cs: number;
  ce: number;
  /** Bass note (MIDI) of this chord (root or slash bass). */
  bass: number;
  /** Absolute pitch classes of the chord. */
  pcs: number[];
  /** Root pitch class. */
  rootPc: number;
  /** Bass note of the next chord (for walking approaches), if any. */
  next?: number;
}

const BASS_LOW = 26;
const BASS_HIGH = 55;

function fit(n: number): number {
  while (n < BASS_LOW) n += 12;
  while (n > BASS_HIGH) n -= 12;
  return n;
}

/** Closest note with pitch class `pc` to `near`. */
function nearestPc(pc: number, near: number): number {
  let n = near - mod12(near - pc);
  if (near - n > 6) n += 12;
  return n;
}

function grid(cs: number, ce: number, step: number, ts: TimeSig): number[] {
  const bar = barTicks(ts);
  const out: number[] = [];
  const first = Math.floor(cs / bar);
  for (let b = first; b * bar < ce; b++) {
    for (let p = b * bar; p < (b + 1) * bar; p += step) {
      if (p >= cs && p < ce) out.push(p);
    }
  }
  if (!out.length || out[0] > cs) out.unshift(cs);
  return out;
}

/** Bass notes for one chord. */
export function renderBass(style: BassStyle, info: BassChordInfo, ctx: RenderContext, chordPattern?: PatternSpec, octave = 0): NoteEvent[] {
  const { cs, ce, ts } = { ...info, ts: ctx.ts };
  if (ce <= cs) return [];
  const root = fit(info.bass + 12 * octave);
  const eighth = 240;
  const beat = beatTicks(ts);
  const out: NoteEvent[] = [];
  const push = (t: number, d: number, n: number, v: number) => {
    const end = Math.min(ce, t + d);
    if (end > t) out.push({ t, d: end - t, n, v });
  };
  const fifth = root + 7 <= BASS_HIGH ? root + 7 : root - 5;
  switch (style) {
    case 'root': {
      for (const t of grid(cs, ce, barTicks(ts), ts)) push(t, Math.min(barTicks(ts), ce - t) * 0.96, root, 0.86);
      break;
    }
    case 'root4':
      for (const t of grid(cs, ce, beat, ts)) push(t, beat * 0.8, root, t % barTicks(ts) === 0 ? 0.88 : 0.78);
      break;
    case 'root8':
      for (const t of grid(cs, ce, eighth, ts)) push(t, eighth * 0.75, root, (t / eighth) % 2 === 0 ? 0.86 : 0.72);
      break;
    case 'octave':
      for (const t of grid(cs, ce, eighth, ts)) {
        const hi = Math.round((t - cs) / eighth) % 2 === 1;
        push(t, eighth * 0.7, hi ? (root + 12 <= BASS_HIGH + 12 ? root + 12 : root) : root, hi ? 0.74 : 0.88);
      }
      break;
    case 'root5': {
      const pts = grid(cs, ce, beat, ts);
      pts.forEach((t, i) => push(t, beat * 0.85, i % 2 === 0 ? root : fifth, i % 2 === 0 ? 0.88 : 0.76));
      break;
    }
    case 'sync': {
      // 3+3+2 in eighths per bar (compound meters: dotted quarters)
      const bar = barTicks(ts);
      const offs = isCompound(ts) ? Array.from({ length: Math.round(bar / beat) }, (_, i) => i * beat) : [0, 3, 6].map((x) => x * eighth).filter((x) => x < bar);
      if (!isCompound(ts) && bar > 8 * eighth) for (let x = 8; x * eighth < bar; x += 2) offs.push(x * eighth);
      const first = Math.floor(cs / bar);
      for (let b = first; b * bar < ce; b++) {
        offs.forEach((o, i) => {
          const t = b * bar + o;
          if (t < cs || t >= ce) return;
          const nextO = offs[i + 1] ?? bar;
          push(t, (nextO - o) * 0.85, i === 1 ? (root + 12 <= BASS_HIGH ? root + 12 : root) : root, i === 0 ? 0.9 : 0.78);
        });
      }
      if (!out.length || out[0].t > cs) push(cs, Math.min(eighth * 3, ce - cs) * 0.85, root, 0.86);
      out.sort((a, b) => a.t - b.t);
      break;
    }
    case 'follow': {
      const p = chordPattern;
      const hits = p ? rhythmHits({ ...p, kind: 'block' }, cs, ce, ts) : [{ t: cs, span: ce - cs, accent: false, step: 0 }];
      for (const h of hits) push(h.t, Math.max(30, h.span * Math.min(0.95, p?.gate ?? 0.9)), root, h.accent ? 0.92 : 0.82);
      break;
    }
    case 'walking': {
      const pts = grid(cs, ce, beat, ts);
      const tones = [...new Set(info.pcs.map(mod12))];
      let cur = root;
      pts.forEach((t, i) => {
        let n: number;
        if (i === 0) n = root;
        else if (i === pts.length - 1 && info.next !== undefined) {
          // Chromatic approach into the next chord's bass.
          const target = nearestPc(mod12(info.next), cur);
          n = target > cur ? target - 1 : target + 1;
          if (n === cur) n = target + (target > cur ? -2 : 2);
        } else {
          // Step through chord tones upward, turning around at the top of the range.
          const goingUp = cur < 45;
          const cands = tones.map((pc) => nearestPc(pc, cur + (goingUp ? 4 : -4))).filter((x) => x !== cur);
          cands.sort((a, b) => Math.abs(a - cur) - Math.abs(b - cur));
          n = cands[0] ?? cur + 7;
        }
        n = fit(n);
        push(t, beat * 0.9, n, i === 0 ? 0.88 : 0.78);
        cur = n;
      });
      break;
    }
  }
  return out;
}
