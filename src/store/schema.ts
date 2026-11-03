// Memo data model, defaults, validation and migrations.
// Every stored object carries a version so old memos keep working after format changes.
// The shape is sync-friendly (stable ids, timestamps, revision counter, tombstones).
import { Key } from '../theory/core';
import { ChordSpec, normalizeChord } from '../theory/chord';
import { ChordItem, isValidTimeline, newId, sortItems } from '../seq/timeline';
import { DEFAULT_PATTERN, DEFAULT_PUMP, PatternSpec, PumpSpec, normalizePattern } from '../seq/pattern';
import { BassStyle } from '../seq/bass';
import { TimeSig, barTicks, TIME_SIGS, DIVS } from '../seq/time';
import { Patch, normalizePatch } from '../audio/params';
import { FxChain, FX_PRESETS, normalizeFxChain } from '../audio/fx/defs';
import { builtinPatch } from '../presets/synth';
import { TABLE_IDS } from '../audio/wavetables';

export const MEMO_VERSION = 1;

export interface BassSpec {
  on: boolean;
  style: BassStyle;
  oct: number;
  vol: number;
  patch: Patch;
}

export interface MelodyNote {
  t: number;
  len: number;
  n: number;
  v: number;
}

export interface Memo {
  v: number;
  id: string;
  title: string;
  tags: string[];
  note: string;
  fav: boolean;
  createdAt: number;
  updatedAt: number;
  /** Increases on each save (for future sync / conflict detection). */
  rev: number;
  /** Tombstone for sync; hidden from the list. */
  deleted?: boolean;
  sample?: boolean;

  bpm: number;
  ts: TimeSig;
  key: Key;
  bars: number;
  loop: { on: boolean; start: number; end: number };
  swing: number;
  swingGrid: 8 | 16;
  humanize: { time: number; vel: number };
  metronome: boolean;

  chords: ChordItem[];
  autoVoice: boolean;
  /** Same chord continuing = one sustained chord (tie). */
  tie: boolean;
  pattern: PatternSpec;
  pump: PumpSpec;
  bass: BassSpec;
  synth: Patch;
  fx: FxChain;
  melody: MelodyNote[];
  melodyOn: boolean;
  melodyPatch: Patch;
  /** Volume of the chord part 0…1. */
  chordVol: number;
}

const BASS_STYLES: BassStyle[] = ['root', 'root4', 'root8', 'octave', 'root5', 'walking', 'sync', 'follow'];

function num(v: unknown, lo: number, hi: number, def: number): number {
  const x = typeof v === 'number' ? v : Number(v);
  return isFinite(x) ? Math.min(hi, Math.max(lo, x)) : def;
}

function str(v: unknown, def: string, max = 200): string {
  return typeof v === 'string' ? v.slice(0, max) : def;
}

export function defaultMemo(): Memo {
  const now = Date.now();
  return {
    v: MEMO_VERSION,
    id: newId('m'),
    title: '',
    tags: [],
    note: '',
    fav: false,
    createdAt: now,
    updatedAt: now,
    rev: 0,
    bpm: 96,
    ts: { num: 4, den: 4 },
    key: { tonic: 0, mode: 'major' },
    bars: 4,
    loop: { on: true, start: 0, end: 4 },
    swing: 0,
    swingGrid: 8,
    humanize: { time: 0.15, vel: 0.15 },
    metronome: false,
    chords: [],
    autoVoice: true,
    tie: true,
    pattern: { ...DEFAULT_PATTERN, res: 'bar', steps: 'x-------', vel: 0.75 },
    pump: { ...DEFAULT_PUMP },
    bass: { on: true, style: 'root', oct: 0, vol: 0.8, patch: builtinPatch('bass-sub')! },
    synth: builtinPatch('pad-warm')!,
    fx: { v: 1, items: FX_PRESETS.find((p) => p.id === 'room')!.chain() },
    melody: [],
    melodyOn: true,
    melodyPatch: builtinPatch('lead-sine')!,
    chordVol: 0.85,
  };
}

export function normalizeKey(k: unknown): Key {
  const o = (k ?? {}) as Partial<Key>;
  return { tonic: Math.round(num(o.tonic, 0, 11, 0)), mode: o.mode === 'minor' ? 'minor' : 'major' };
}

export function normalizeTimeSig(t: unknown): TimeSig {
  const o = (t ?? {}) as Partial<TimeSig>;
  const found = TIME_SIGS.find((x) => x.num === o.num && x.den === o.den);
  return found ? { ...found } : { num: 4, den: 4 };
}

function normalizeItem(raw: unknown, barLen: number): ChordItem | null {
  const r = (raw ?? {}) as Partial<ChordItem>;
  if (!r.chord) return null;
  const t = Math.round(num(r.t, 0, barLen * 512, 0));
  const len = Math.round(num(r.len, 1, barLen * 64, barLen));
  const it: ChordItem = {
    id: typeof r.id === 'string' && r.id ? r.id : newId(),
    t, len,
    chord: normalizeChord(r.chord as ChordSpec),
  };
  if (r.pat) it.pat = normalizePattern(r.pat);
  if (r.b && (r.b.chord || r.b.pat)) {
    it.b = {};
    if (r.b.chord) it.b.chord = normalizeChord(r.b.chord);
    if (r.b.pat) it.b.pat = normalizePattern(r.b.pat);
  }
  return it;
}

/** Repair overlapping/unsorted items (keeps the earlier one). */
export function repairTimeline(items: ChordItem[]): ChordItem[] {
  const sorted = sortItems(items);
  const out: ChordItem[] = [];
  const ids = new Set<string>();
  for (const it of sorted) {
    const prev = out[out.length - 1];
    let cur = it;
    if (ids.has(cur.id)) cur = { ...cur, id: newId() };
    if (prev && cur.t < prev.t + prev.len) {
      const end = cur.t + cur.len;
      if (end <= prev.t + prev.len) continue;
      cur = { ...cur, t: prev.t + prev.len, len: end - (prev.t + prev.len) };
    }
    ids.add(cur.id);
    out.push(cur);
  }
  return out;
}

/** Migrate any stored memo to the current version. */
export function migrateMemo(raw: unknown): unknown {
  const m = { ...((raw ?? {}) as Record<string, unknown>) };
  const v = typeof m.v === 'number' ? m.v : 0;
  if (v < 1) {
    // v0 (pre-release drafts) had `tempo` instead of `bpm`.
    if (m.tempo !== undefined && m.bpm === undefined) m.bpm = m.tempo;
    m.v = 1;
  }
  // Future: if (v < 2) { ... }
  return m;
}

/** Validate + fill defaults. Never throws; garbage becomes a sensible empty memo. */
export function normalizeMemo(raw: unknown): Memo {
  const d = defaultMemo();
  const r = migrateMemo(raw) as Partial<Memo> & Record<string, unknown>;
  const ts = normalizeTimeSig(r.ts);
  const bar = barTicks(ts);
  const items = repairTimeline((Array.isArray(r.chords) ? r.chords : []).map((x) => normalizeItem(x, bar)).filter((x): x is ChordItem => !!x));
  const contentBars = Math.ceil(items.reduce((mx, i) => Math.max(mx, i.t + i.len), 0) / bar);
  const bars = Math.round(num(r.bars, 1, 256, Math.max(d.bars, contentBars)));
  const loopRaw = (r.loop ?? {}) as Partial<Memo['loop']>;
  let ls = Math.round(num(loopRaw.start, 0, bars - 1, 0));
  let le = Math.round(num(loopRaw.end, 1, bars, bars));
  if (le <= ls) { ls = 0; le = bars; }
  const bassRaw = (r.bass ?? {}) as Partial<BassSpec>;
  const pumpRaw = (r.pump ?? {}) as Partial<PumpSpec>;
  const hum = (r.humanize ?? {}) as Partial<Memo['humanize']>;
  const memo: Memo = {
    v: MEMO_VERSION,
    id: typeof r.id === 'string' && r.id ? r.id : d.id,
    title: str(r.title, '', 80),
    tags: Array.isArray(r.tags) ? [...new Set(r.tags.filter((t) => typeof t === 'string' && t.trim()).map((t) => t.trim().slice(0, 24)))].slice(0, 12) : [],
    note: str(r.note, '', 600),
    fav: !!r.fav,
    createdAt: num(r.createdAt, 0, 1e14, d.createdAt),
    updatedAt: num(r.updatedAt, 0, 1e14, d.updatedAt),
    rev: Math.round(num(r.rev, 0, 1e9, 0)),
    deleted: r.deleted ? true : undefined,
    sample: r.sample ? true : undefined,
    bpm: num(r.bpm, 30, 300, d.bpm),
    ts,
    key: normalizeKey(r.key ?? d.key),
    bars,
    loop: { on: loopRaw.on !== false, start: ls, end: le },
    swing: num(r.swing, 0, 1, 0),
    swingGrid: r.swingGrid === 16 ? 16 : 8,
    humanize: { time: num(hum.time, 0, 1, d.humanize.time), vel: num(hum.vel, 0, 1, d.humanize.vel) },
    metronome: !!r.metronome,
    chords: items.filter((i) => i.t < bars * bar).map((i) => (i.t + i.len > bars * bar ? { ...i, len: bars * bar - i.t } : i)),
    autoVoice: r.autoVoice !== false,
    tie: r.tie !== false,
    pattern: normalizePattern(r.pattern ?? d.pattern),
    pump: {
      on: !!pumpRaw.on,
      rate: typeof pumpRaw.rate === 'string' && DIVS[pumpRaw.rate] ? pumpRaw.rate : '1/4',
      depth: num(pumpRaw.depth, 0, 1, DEFAULT_PUMP.depth),
      curve: num(pumpRaw.curve, 0, 1, DEFAULT_PUMP.curve),
      offset: num(pumpRaw.offset, -0.5, 0.5, 0),
      length: num(pumpRaw.length, 0.1, 1, DEFAULT_PUMP.length),
    },
    bass: {
      on: bassRaw.on !== undefined ? !!bassRaw.on : d.bass.on,
      style: BASS_STYLES.includes(bassRaw.style as BassStyle) ? (bassRaw.style as BassStyle) : 'root',
      oct: Math.round(num(bassRaw.oct, -1, 1, 0)),
      vol: num(bassRaw.vol, 0, 1, 0.8),
      patch: normalizePatch(bassRaw.patch ?? d.bass.patch, TABLE_IDS),
    },
    synth: normalizePatch((r.synth as Patch) ?? d.synth, TABLE_IDS),
    fx: normalizeFxChain((r.fx as FxChain) ?? d.fx),
    melody: (Array.isArray(r.melody) ? r.melody : []).map((n) => {
      const x = (n ?? {}) as Partial<MelodyNote>;
      return { t: Math.round(num(x.t, 0, bars * bar, 0)), len: Math.round(num(x.len, 10, bars * bar, 240)), n: Math.round(num(x.n, 24, 108, 60)), v: num(x.v, 0.05, 1, 0.8) };
    }).slice(0, 2000),
    melodyOn: r.melodyOn !== false,
    melodyPatch: normalizePatch((r.melodyPatch as Patch) ?? d.melodyPatch, TABLE_IDS),
    chordVol: num(r.chordVol, 0, 1, d.chordVol),
  };
  if (!isValidTimeline(memo.chords)) memo.chords = repairTimeline(memo.chords);
  return memo;
}

/** Title shown in lists ("無題のメモ" + date if empty). */
export function displayTitle(m: Memo): string {
  if (m.title.trim()) return m.title.trim();
  const d = new Date(m.createdAt);
  return `無題のメモ ${d.getMonth() + 1}/${d.getDate()} ${String(d.getHours()).padStart(2, '0')}:${String(d.getMinutes()).padStart(2, '0')}`;
}

export function isEmptyMemo(m: Memo): boolean {
  return m.chords.length === 0 && !m.title.trim() && !m.note.trim() && m.melody.length === 0;
}

// ---- export bundle -------------------------------------------------------

export const BUNDLE_FORMAT = 'hirameki-memos';

export interface Bundle {
  format: string;
  v: number;
  exportedAt: number;
  memos: Memo[];
  patches?: Patch[];
  fxPresets?: { id: string; name: string; chain: FxChain }[];
}

// ---- app settings ------------------------------------------------------------

export interface AppSettings {
  v: number;
  label: 'roman' | 'name';
  romanStyle: 'classic' | 'jp';
  master: number;
  light: 'auto' | 'on' | 'off';
  midiEnabled: boolean;
  midiInputChords: boolean;
  midiThru: boolean;
  midiMap: Record<string, string>;
  keyMap: Record<string, string>;
  inputLen: number;
  seventh: boolean;
  audition: boolean;
  welcomed: boolean;
  deviceId: string;
  /** Typing in the middle pushes later chords back instead of overwriting. */
  insertMode: boolean;
  /** Bars per timeline row ('auto' = fit the shortest chord). */
  zoom: 'auto' | 1 | 2 | 4 | 8;
}

export function defaultSettings(): AppSettings {
  return {
    v: 1, label: 'roman', romanStyle: 'classic', master: 0.8, light: 'auto',
    midiEnabled: false, midiInputChords: true, midiThru: true, midiMap: {}, keyMap: {},
    inputLen: 0, seventh: false, audition: true, welcomed: false, deviceId: newId('d'), insertMode: false, zoom: 'auto',
  };
}

export function normalizeSettings(raw: unknown): AppSettings {
  const d = defaultSettings();
  const r = (raw ?? {}) as Partial<AppSettings>;
  const map = (x: unknown) => (x && typeof x === 'object' ? Object.fromEntries(Object.entries(x as Record<string, unknown>).filter(([, v]) => typeof v === 'string')) as Record<string, string> : {});
  return {
    v: 1,
    label: r.label === 'name' ? 'name' : 'roman',
    romanStyle: r.romanStyle === 'jp' ? 'jp' : 'classic',
    master: num(r.master, 0, 1, d.master),
    light: r.light === 'on' || r.light === 'off' ? r.light : 'auto',
    midiEnabled: !!r.midiEnabled,
    midiInputChords: r.midiInputChords !== false,
    midiThru: r.midiThru !== false,
    midiMap: map(r.midiMap),
    keyMap: map(r.keyMap),
    inputLen: Math.round(num(r.inputLen, 0, 1e6, 0)),
    seventh: !!r.seventh,
    audition: r.audition !== false,
    welcomed: !!r.welcomed,
    deviceId: typeof r.deviceId === 'string' && r.deviceId ? r.deviceId : d.deviceId,
    insertMode: !!r.insertMode,
    zoom: ([1, 2, 4, 8] as const).includes(r.zoom as 1) ? (r.zoom as 1 | 2 | 4 | 8) : 'auto',
  };
}
