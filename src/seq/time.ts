// Musical time helpers. All positions are in ticks, 480 per quarter note.
export const PPQ = 480;

export interface TimeSig {
  num: number;
  den: number;
}

export const TIME_SIGS: TimeSig[] = [
  { num: 4, den: 4 }, { num: 3, den: 4 }, { num: 2, den: 4 }, { num: 5, den: 4 },
  { num: 6, den: 8 }, { num: 7, den: 8 }, { num: 9, den: 8 }, { num: 12, den: 8 },
];

export function barTicks(ts: TimeSig): number {
  return Math.round((ts.num * 4 * PPQ) / ts.den);
}

/** Tick length of the written beat (a quarter in x/4, an eighth in x/8). */
export function unitTicks(ts: TimeSig): number {
  return Math.round((4 * PPQ) / ts.den);
}

/** Compound meters (6/8, 9/8, 12/8) feel the dotted quarter as the beat. */
export function isCompound(ts: TimeSig): boolean {
  return ts.den === 8 && ts.num % 3 === 0 && ts.num > 3;
}

/** Felt beat length: dotted quarter in compound meters, otherwise the written beat. */
export function beatTicks(ts: TimeSig): number {
  return isCompound(ts) ? unitTicks(ts) * 3 : unitTicks(ts);
}

export function beatsPerBar(ts: TimeSig): number {
  return Math.round(barTicks(ts) / beatTicks(ts));
}

export function tsLabel(ts: TimeSig): string {
  return `${ts.num}/${ts.den}`;
}

/** Chord length choices for the input bar, longest first. */
export function lengthChoices(ts: TimeSig): { ticks: number; label: string }[] {
  const bar = barTicks(ts);
  const beat = beatTicks(ts);
  const out: { ticks: number; label: string }[] = [
    { ticks: bar * 2, label: '2小節' },
    { ticks: bar, label: '1小節' },
  ];
  const nBeats = beatsPerBar(ts);
  if (isCompound(ts)) {
    if (nBeats >= 2) out.push({ ticks: beat, label: '付点4分' });
    out.push({ ticks: unitTicks(ts), label: '8分' });
  } else if (ts.den === 8) {
    // 7/8: 2+2+3 grouping is common, offer quarter and eighth
    out.push({ ticks: PPQ, label: '4分' });
    out.push({ ticks: unitTicks(ts), label: '8分' });
  } else {
    if (nBeats % 2 === 0 && nBeats > 2) out.push({ ticks: bar / 2, label: '半小節' });
    if (nBeats === 3 || nBeats === 5) out.push({ ticks: beat * 2, label: '2拍' });
    out.push({ ticks: beat, label: '1拍' });
    out.push({ ticks: beat / 2, label: '半拍' });
  }
  // Dedupe.
  const seen = new Set<number>();
  return out.filter((o) => (seen.has(o.ticks) ? false : (seen.add(o.ticks), true)));
}

export function ticksToSeconds(ticks: number, bpm: number): number {
  return (ticks / PPQ) * (60 / bpm);
}

export function secondsToTicks(sec: number, bpm: number): number {
  return (sec * bpm * PPQ) / 60;
}

/** Note-value names → ticks (used by sync divisions everywhere). */
export const DIVS: Record<string, number> = {
  '4/1': PPQ * 16, '2/1': PPQ * 8, '1/1': PPQ * 4, '1/2': PPQ * 2, '1/2.': PPQ * 3, '1/2t': (PPQ * 4) / 3,
  '1/4': PPQ, '1/4.': PPQ * 1.5, '1/4t': (PPQ * 2) / 3,
  '1/8': PPQ / 2, '1/8.': PPQ * 0.75, '1/8t': PPQ / 3,
  '1/16': PPQ / 4, '1/16.': (PPQ * 3) / 8, '1/16t': PPQ / 6,
  '1/32': PPQ / 8,
};

export const DIV_LABELS: Record<string, string> = {
  '4/1': '4小節', '2/1': '2小節', '1/1': '1小節', '1/2': '2分', '1/2.': '付点2分', '1/2t': '2分3連',
  '1/4': '4分', '1/4.': '付点4分', '1/4t': '4分3連', '1/8': '8分', '1/8.': '付点8分', '1/8t': '8分3連',
  '1/16': '16分', '1/16.': '付点16分', '1/16t': '16分3連', '1/32': '32分',
};

/**
 * Swing warp. `amount` 0…1 maps the off-beat from 50% (straight) to 75% of the pair.
 * `grid` 8 swings eighths, 16 swings sixteenths.
 */
export function swingWarp(t: number, amount: number, grid: 8 | 16): number {
  if (amount <= 0) return t;
  const P = grid === 8 ? PPQ : PPQ / 2;
  const r = 0.5 + Math.min(1, amount) * 0.25;
  const x = ((t % P) + P) % P;
  const base = t - x;
  const half = P / 2;
  const xw = x < half ? x * ((r * P) / half) : r * P + (x - half) * (((1 - r) * P) / half);
  return base + xw;
}

export function barOf(t: number, ts: TimeSig): number {
  return Math.floor(t / barTicks(ts));
}

/** "3.2" style position (bar.beat, 1-based). */
export function posLabel(t: number, ts: TimeSig): string {
  const bar = barTicks(ts);
  const b = Math.floor(t / bar);
  const beat = Math.floor((t - b * bar) / beatTicks(ts));
  return `${b + 1}.${beat + 1}`;
}
