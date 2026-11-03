// User actions: every edit goes through commit() so undo/redo and autosave just work.
import { batch, signal } from '@preact/signals';
import { mergeItems, mergeWithNext, shiftStart, rippleDelete, copyItems, pasteItems, contentEnd } from '../seq/timeline';
import { Memo, defaultMemo } from '../store/schema';
import { ChordSpec } from '../theory/chord';
import { Key, mod12 } from '../theory/core';
import { ModifierId, applyModifier, setSlashBass, toggleTension } from '../theory/diatonic';
import { voiceChord } from '../theory/voicing';
import { rekeyChord, transposeKey } from '../theory/transpose';
import {
  ChordItem, deleteTime, duplicateItems, findItem, insertTime, itemAt, newId, rangeIds, removeItems, resizeItem,
  shiftContent, sideOf, sortItems, splitItem, swapContents, truncate, updateItem, writeChord,
} from '../seq/timeline';
import { PatternSpec, PumpSpec } from '../seq/pattern';
import { TimeSig, barTicks, beatTicks, isCompound, lengthChoices, unitTicks } from '../seq/time';
import { audio } from '../audio/host';
import {
  caret, commit, flushSave, lastInserted, loadMemoIntoEditor, memo, selection, settings, side, toast, auditionMemo, nowPlayingId, view, undo, updateSettings,
} from './state';
import { getMemo, kvGet } from '../store/repo';
import { TEMPLATES, templateById } from '../presets/templates';

// ---- helpers ------------------------------------------------------------------

export function inputLength(m: Memo = memo.value): number {
  const want = settings.value.inputLen;
  const choices = lengthChoices(m.ts).map((c) => c.ticks);
  if (want && choices.includes(want)) return want;
  return barTicks(m.ts);
}

export function songTicks(m: Memo = memo.value): number {
  return m.bars * barTicks(m.ts);
}

/** Notes the chord would play right now (for auditions), voice-led from the chord before it. */
export function previewNotes(chord: ChordSpec, beforeTick?: number): number[] {
  const m = memo.value;
  const t = beforeTick ?? caret.value;
  const prev = sortItems(m.chords).filter((i) => i.t < t).pop();
  const prevNotes = prev ? voiceChord(sideOf(prev, side.value).chord, m.key, { auto: m.autoVoice, addBass: !m.bass.on }).notes : null;
  const v = voiceChord(chord, m.key, { auto: m.autoVoice, prev: prevNotes, addBass: !m.bass.on });
  return v.notes;
}

export function auditionChord(chord: ChordSpec, at?: number) {
  if (!settings.value.audition) return;
  const m = memo.value;
  const notes = previewNotes(chord, at);
  audio.audition(notes, 1100, 0, 0.78);
  if (m.bass.on) audio.audition([voiceChord(chord, m.key, { auto: true }).bass + 12 * m.bass.oct], 1100, 1, 0.7);
}

function extendBars(m: Memo, end: number): Memo {
  const bar = barTicks(m.ts);
  const need = Math.ceil(end / bar);
  if (need <= m.bars) return m;
  const loopFollows = m.loop.end >= m.bars;
  return { ...m, bars: Math.min(256, need), loop: loopFollows ? { ...m.loop, end: Math.min(256, need) } : m.loop };
}

function setChordOf(it: ChordItem, chord: ChordSpec): Partial<ChordItem> {
  if (side.value === 'B' && it.b) return { b: { ...it.b, chord } };
  return { chord };
}

/** Chord the modifier chips act on: the selected one, else the one just entered. */
export function targetItem(): ChordItem | undefined {
  const m = memo.value;
  const id = selection.value[0] ?? lastInserted.value;
  return findItem(m.chords, id);
}

// ---- chord input ----------------------------------------------------------------

export function inputChord(chord: ChordSpec, opts: { audition?: boolean } = {}) {
  const sel = selection.value;
  const m = memo.value;
  if (sel.length) {
    const it = findItem(m.chords, sel[0]);
    if (!it) return;
    commit((mm) => ({ ...mm, chords: sel.reduce((items, id) => {
      const x = findItem(items, id);
      return x ? updateItem(items, id, setChordOf(x, chord)) : items;
    }, mm.chords) }));
    lastInserted.value = sel[0];
    if (opts.audition !== false) auditionChord(chord, it.t);
    return;
  }
  const len = inputLength(m);
  const t = Math.max(0, caret.value);
  let newIdOut = '';
  const insert = settings.value.insertMode && m.chords.some((i) => i.t + i.len > t);
  commit((mm) => {
    // Insert mode pushes the following chords back instead of overwriting them.
    const base = insert ? insertTime(mm.chords, t, len) : mm.chords;
    const r = writeChord(base, t, len, chord);
    newIdOut = r.id;
    const end = Math.max(t + len, contentEnd(r.items));
    return extendBars({ ...mm, chords: r.items }, end);
  });
  batch(() => {
    caret.value = t + len;
    lastInserted.value = newIdOut;
  });
  if (opts.audition !== false) auditionChord(chord, t);
}

export function modifyTarget(fn: (c: ChordSpec) => ChordSpec) {
  const it = targetItem();
  if (!it) {
    toast('先にコードを入力するか、タイムラインのコードをタップしてね');
    return;
  }
  const cur = sideOf(it, side.value).chord;
  const next = fn(cur);
  commit((m) => ({ ...m, chords: updateItem(m.chords, it.id, setChordOf(it, next)) }));
  auditionChord(next, it.t);
}

export const applyMod = (mod: ModifierId) => modifyTarget((c) => applyModifier(c, mod, memo.value.key));
export const applyTension = (t: string) => modifyTarget((c) => toggleTension(c, t));
export const applySlash = (offset: number | null) => modifyTarget((c) => setSlashBass(c, memo.value.key, offset));

// ---- selection / caret ------------------------------------------------------------

export function selectChord(id: string, extend = false) {
  const m = memo.value;
  if (extend && selection.value.length) {
    selection.value = rangeIds(m.chords, selection.value[0], id);
  } else selection.value = [id];
  lastInserted.value = null;
  const it = findItem(m.chords, id);
  if (it) caret.value = it.t + it.len;
}

export function clearSelection() {
  selection.value = [];
}

export function setCaret(t: number) {
  batch(() => {
    selection.value = [];
    lastInserted.value = null;
    caret.value = Math.max(0, Math.min(songTicks(), t));
  });
}

/** Snap a tick to the input length grid inside its bar. */
export function snapTick(t: number): number {
  const m = memo.value;
  const bar = barTicks(m.ts);
  const L = Math.min(inputLength(m), bar);
  const b = Math.floor(t / bar) * bar;
  return b + Math.floor((t - b) / L) * L;
}

export function stepSelection(dir: -1 | 1, extend = false) {
  const m = memo.value;
  const items = sortItems(m.chords);
  if (!items.length) return;
  const cur = selection.value.length ? selection.value[dir > 0 ? selection.value.length - 1 : 0] : null;
  let idx: number;
  if (cur) idx = items.findIndex((i) => i.id === cur) + dir;
  else {
    const t = caret.value;
    idx = dir > 0 ? items.findIndex((i) => i.t >= t) : items.map((i) => i.t < t).lastIndexOf(true);
  }
  if (idx < 0 || idx >= items.length) {
    if (dir > 0 && cur) setCaret(items[items.length - 1].t + items[items.length - 1].len);
    return;
  }
  const id = items[idx].id;
  if (extend && selection.value.length) selection.value = rangeIds(m.chords, selection.value[0], id);
  else selection.value = [id];
  lastInserted.value = null;
  if (!extend) auditionChord(sideOf(items[idx], side.value).chord, items[idx].t);
}

// ---- edit ops --------------------------------------------------------------------

export function deleteSelection() {
  const sel = selection.value.length ? selection.value : lastInserted.value ? [lastInserted.value] : [];
  if (!sel.length) {
    // Backspace at the caret removes the chord just before it.
    const m = memo.value;
    const prev = sortItems(m.chords).filter((i) => i.t + i.len <= caret.value).pop();
    if (!prev) return;
    commit((mm) => ({ ...mm, chords: removeItems(mm.chords, [prev.id]) }));
    caret.value = prev.t;
    return;
  }
  const first = findItem(memo.value.chords, sel[0]);
  commit((m) => ({ ...m, chords: removeItems(m.chords, sel) }));
  batch(() => {
    selection.value = [];
    lastInserted.value = null;
    if (first) caret.value = first.t;
  });
}

export function duplicateSelection() {
  const sel = selection.value;
  if (!sel.length) return toast('複製するコードを選んでね');
  let ids: string[] = [];
  commit((m) => {
    const r = duplicateItems(m.chords, sel);
    ids = r.ids;
    const end = Math.max(...r.items.map((i) => i.t + i.len));
    return extendBars({ ...m, chords: r.items }, end);
  });
  selection.value = ids;
}

export function moveSelection(dir: -1 | 1) {
  const sel = selection.value;
  if (sel.length !== 1) return;
  let nid = sel[0];
  commit((m) => {
    const r = shiftContent(m.chords, sel[0], dir);
    nid = r.id;
    return r.items === m.chords ? m : { ...m, chords: r.items };
  });
  selection.value = [nid];
}

export function swapItems(a: string, b: string) {
  commit((m) => ({ ...m, chords: swapContents(m.chords, a, b) }));
  selection.value = [b];
}

export function splitSelection() {
  const sel = selection.value;
  if (sel.length !== 1) return toast('分割するコードを1つ選んでね');
  const m = memo.value;
  commit((mm) => ({ ...mm, chords: splitItem(mm.chords, sel[0], beatTicks(m.ts) / 2).items }));
}

export function resizeSelection(len: number) {
  const sel = selection.value;
  if (!sel.length) return;
  const before = memo.value.chords.length;
  commit((m) => {
    let items = m.chords;
    let end = 0;
    for (const id of sel) {
      items = resizeItem(items, id, len);
      const it = findItem(items, id);
      if (it) end = Math.max(end, it.t + it.len);
    }
    return extendBars({ ...m, chords: items }, end);
  });
  const lost = before - memo.value.chords.length;
  if (lost > 0) toast(`後ろのコードを${lost}個上書きしたよ`, 'info', { label: '元に戻す', run: () => { undo(); } });
}

// ---- rhythm-aware edits -------------------------------------------------------

/** One "nudge" for anticipation: half a beat (an eighth in compound meters). */
export function nudgeTicks(m: Memo = memo.value): number {
  return isCompound(m.ts) ? unitTicks(m.ts) : beatTicks(m.ts) / 2;
}

/** Merge the selection (2+ chords), or the selected chord with the next one. */
export function mergeSelection() {
  const sel = selection.value;
  const id = sel[0] ?? lastInserted.value;
  if (!id) return toast('結合するコードを選んでね（2つ以上選ぶか、1つ選ぶと次のコードとつなげる）');
  let out: string | null = null;
  const before = memo.value.chords;
  commit((m) => {
    const r = sel.length >= 2 ? mergeItems(m.chords, sel) : mergeWithNext(m.chords, id);
    out = r.id;
    return r.items === m.chords ? m : { ...m, chords: r.items };
  });
  if (memo.value.chords === before) return toast('後ろにつなげるコードがないよ');
  if (out) selection.value = [out];
}

/** Anticipation (食い): start the chord half a beat earlier (dir 1) or move it back (dir −1). */
export function anticipate(dir: 1 | -1) {
  const it = targetItem();
  if (!it) return toast('食わせたいコードを選んでね');
  const amt = nudgeTicks() * dir;
  const before = memo.value.chords;
  commit((m) => {
    const items = shiftStart(m.chords, it.id, amt);
    return items === m.chords ? m : { ...m, chords: items };
  });
  if (memo.value.chords === before) toast(dir > 0 ? 'これ以上前には食えないよ（前のコードが短すぎるか、曲の頭）' : 'これ以上は戻せないよ');
  else if (dir > 0) toast('半拍前から鳴らすようにしたよ（同じコードが続く時はタイでつながる）', 'ok', undefined, 2200);
}

export function rippleDeleteSelection() {
  const sel = selection.value;
  if (!sel.length) return toast('消して詰めたいコードを選んでね');
  const first = findItem(memo.value.chords, sel[0]);
  commit((m) => ({ ...m, chords: rippleDelete(m.chords, sel) }));
  batch(() => { selection.value = []; lastInserted.value = null; if (first) caret.value = first.t; });
}

export const clipboard = signal<{ items: ChordItem[]; span: number } | null>(null);

export function copySelection(cut = false) {
  const sel = selection.value;
  if (!sel.length) return toast('コピーするコードを選んでね');
  clipboard.value = copyItems(memo.value.chords, sel);
  if (cut) deleteSelection();
  toast(cut ? '切り取ったよ' : `${sel.length}個のコードをコピーしたよ`, 'ok', undefined, 1600);
}

export function pasteAtCaret() {
  const clip = clipboard.value;
  if (!clip || !clip.items.length) return toast('先にコードをコピーしてね');
  const m = memo.value;
  const selIt = selection.value.length ? findItem(m.chords, selection.value[selection.value.length - 1]) : undefined;
  const t = selIt ? selIt.t + selIt.len : caret.value;
  let ids: string[] = [];
  commit((mm) => {
    const r = pasteItems(mm.chords, clip, t, settings.value.insertMode);
    ids = r.ids;
    return extendBars({ ...mm, chords: r.items }, Math.max(t + clip.span, contentEnd(r.items)));
  });
  selection.value = ids;
}

export function selectAll() {
  const ids = sortItems(memo.value.chords).map((i) => i.id);
  selection.value = ids;
  lastInserted.value = null;
}

export function selectBar(bar: number) {
  const m = memo.value;
  const b = barTicks(m.ts);
  const ids = sortItems(m.chords).filter((i) => i.t < (bar + 1) * b && i.t + i.len > bar * b).map((i) => i.id);
  if (ids.length) selection.value = ids;
}

export function toggleInsertMode() {
  const on = !settings.value.insertMode;
  updateSettings({ insertMode: on });
  toast(on ? '挿入モード：入力すると後ろのコードが後ろにずれるよ' : '上書きモード：入力した場所のコードを置き換えるよ', 'info', undefined, 2200);
}

export function makeB() {
  const it = targetItem();
  if (!it) return toast('B案を作るコードを選んでね');
  if (!it.b) commit((m) => ({ ...m, chords: updateItem(m.chords, it.id, { b: { chord: it.chord, pat: it.pat } }) }));
  side.value = 'B';
  toast('B案を作ったよ。ここで変えた内容はB側だけに入る。上の A/B で聴き比べてね', 'ok');
}

export function removeB(adopt: boolean) {
  const it = targetItem();
  if (!it || !it.b) return;
  commit((m) => ({
    ...m,
    chords: updateItem(m.chords, it.id, adopt ? { chord: it.b!.chord ?? it.chord, pat: it.b!.pat !== undefined ? it.b!.pat : it.pat, b: null } : { b: null }),
  }));
  if (!memo.value.chords.some((c) => c.b)) side.value = 'A';
}

export function insertBarAt(bar: number) {
  commit((m) => {
    const b = barTicks(m.ts);
    return { ...m, bars: Math.min(256, m.bars + 1), chords: insertTime(m.chords, bar * b, b), loop: m.loop.end >= m.bars ? { ...m.loop, end: m.loop.end + 1 } : m.loop };
  });
}

export function deleteBarAt(bar: number) {
  commit((m) => {
    if (m.bars <= 1) return m;
    const b = barTicks(m.ts);
    const bars = m.bars - 1;
    const loop = { ...m.loop, end: Math.min(m.loop.end, bars) };
    if (loop.start >= loop.end) { loop.start = 0; loop.end = bars; }
    return { ...m, bars, chords: deleteTime(m.chords, bar * b, b), loop };
  });
}

export function setBars(n: number) {
  const bars = Math.max(1, Math.min(256, Math.round(n)));
  commit((m) => {
    const b = barTicks(m.ts);
    const loop = { ...m.loop };
    if (loop.end >= m.bars || loop.end > bars) loop.end = bars;
    if (loop.start >= loop.end) loop.start = 0;
    return { ...m, bars, chords: truncate(m.chords, bars * b), loop };
  });
}

export function setLoop(start: number, end: number, on = true) {
  commit((m) => {
    let s = Math.max(0, Math.min(m.bars - 1, Math.round(start)));
    let e = Math.max(1, Math.min(m.bars, Math.round(end)));
    if (e <= s) { const t = s; s = e - 1 < 0 ? 0 : e - 1; e = t + 1; }
    return { ...m, loop: { on, start: s, end: Math.max(s + 1, e) } };
  }, { coalesce: 'loop' });
}

export function loopSelection() {
  const m = memo.value;
  const items = m.chords.filter((c) => selection.value.includes(c.id));
  if (!items.length) return;
  const b = barTicks(m.ts);
  const s = Math.floor(Math.min(...items.map((i) => i.t)) / b);
  const e = Math.ceil(Math.max(...items.map((i) => i.t + i.len)) / b);
  setLoop(s, e, true);
  toast(`${s + 1}〜${e}小節をループするよ`);
}

// ---- song settings ------------------------------------------------------------------

export function setBpm(bpm: number) {
  const v = Math.max(30, Math.min(300, Math.round(bpm * 10) / 10));
  commit((m) => (m.bpm === v ? m : { ...m, bpm: v }), { coalesce: 'bpm' });
}

let taps: number[] = [];
export function tapTempo() {
  const now = performance.now();
  taps = taps.filter((t) => now - t < 2500);
  taps.push(now);
  if (taps.length >= 2) {
    const iv = (taps[taps.length - 1] - taps[0]) / (taps.length - 1);
    setBpm(60000 / iv);
  }
  return taps.length;
}

export function setKey(k: Key, transposeChords: boolean) {
  commit((m) => {
    if (transposeChords) return { ...m, key: k };
    return { ...m, key: k, chords: m.chords.map((c) => ({
      ...c,
      chord: rekeyChord(c.chord, m.key, k),
      b: c.b ? { ...c.b, chord: c.b.chord ? rekeyChord(c.b.chord, m.key, k) : undefined } : c.b,
    })) };
  });
}

export function transpose(semis: number) {
  commit((m) => ({ ...m, key: transposeKey(m.key, semis) }), { coalesce: 'transpose' });
  const k = memo.value.key;
  void k;
}

export function setTimeSig(t: TimeSig) {
  commit((m) => {
    if (m.ts.num === t.num && m.ts.den === t.den) return m;
    // Keep chords in bar positions: scale each chord's bar-relative position.
    const ob = barTicks(m.ts), nb = barTicks(t);
    const items = m.chords.map((c) => ({ ...c, t: Math.round((c.t / ob) * nb), len: Math.max(1, Math.round((c.len / ob) * nb)) }));
    return { ...m, ts: { ...t }, chords: sortItems(items) };
  });
  caret.value = 0;
}

export function updateMemo(patch: Partial<Memo>, coalesce?: string) {
  commit((m) => ({ ...m, ...patch }), { coalesce });
}

// ---- patterns ----------------------------------------------------------------------

export function applyPattern(p: PatternSpec, scope: 'all' | 'sel', pump?: PumpSpec) {
  const sel = selection.value;
  if (scope === 'sel' && sel.length) {
    commit((m) => ({ ...m, chords: m.chords.map((c) => {
      if (!sel.includes(c.id)) return c;
      if (side.value === 'B' && c.b) return { ...c, b: { ...c.b, pat: p } };
      return { ...c, pat: p };
    }) }));
    return;
  }
  // Pumping presets switch pumping on; other presets leave the pumping card as it is.
  commit((m) => ({ ...m, pattern: p, pump: pump ? { ...pump } : m.pump }));
}

export function clearPatternOverride() {
  const sel = selection.value;
  commit((m) => ({ ...m, chords: m.chords.map((c) => (sel.includes(c.id) ? (side.value === 'B' && c.b ? { ...c, b: { ...c.b, pat: null } } : { ...c, pat: null }) : c)) }));
}

// ---- transport -----------------------------------------------------------------------

/** Where the next "play" starts (set by tapping the bar ruler); null = loop start. */
export const cue = signal<number | null>(null);

export function play(fromStart = false) {
  const m = memo.value;
  auditionMemo.value = null;
  nowPlayingId.value = null;
  const bar = barTicks(m.ts);
  let from = !fromStart && cue.value !== null ? cue.value : m.loop.on ? m.loop.start * bar : 0;
  cue.value = null;
  if (!m.chords.length && !m.melody.length) {
    toast('まずはコードを入れてみよう 👇');
  }
  if (from >= songTicks(m)) from = 0;
  audio.play(from);
}

export function stop() {
  audio.stop();
}

export function togglePlay() {
  if (audio.playing) stop();
  else play();
}

export function toStart() {
  const m = memo.value;
  const t = m.loop.on ? m.loop.start * barTicks(m.ts) : 0;
  cue.value = null;
  audio.seek(t);
}

export function seekBar(bar: number) {
  const m = memo.value;
  const t = bar * barTicks(m.ts);
  if (audio.playing) audio.seek(t);
  else cue.value = t;
  setCaret(t);
}

// ---- memo lifecycle ----------------------------------------------------------------

export async function newMemo() {
  await flushSave();
  audio.stop();
  const m = defaultMemo();
  // Keep the user's last tempo/key? A fresh start is clearer: defaults.
  loadMemoIntoEditor(m, false);
  view.value = 'editor';
}

/** A fresh, unsaved memo built from a template. */
export function memoFromTemplate(id: string): Memo {
  const t = templateById(id) ?? TEMPLATES[0];
  const m = t.build();
  const now = Date.now();
  return { ...m, id: newId('m'), createdAt: now, updatedAt: now, rev: 0 };
}

/** Menu → テンプレートから作成: opens it as a new memo and saves it to the list. */
export async function createFromTemplate(id: string) {
  await flushSave();
  audio.stop();
  auditionMemo.value = null;
  nowPlayingId.value = null;
  const m = memoFromTemplate(id);
  loadMemoIntoEditor(m, false);
  // Mark dirty so it gets saved (the user chose to create it).
  commit((x) => ({ ...x }), { noHistory: true });
  view.value = 'editor';
  toast(`「${m.title}」から新しいメモを作ったよ。自由に変えてね`, 'ok');
}

export async function openMemo(id: string) {
  await flushSave();
  const m = await getMemo(id);
  if (!m) return toast('メモが見つかりませんでした', 'error');
  audio.stop();
  auditionMemo.value = null;
  nowPlayingId.value = null;
  loadMemoIntoEditor(m, true);
  view.value = 'editor';
}

export async function lastMemoId(): Promise<string | undefined> {
  return kvGet<string>('lastMemo');
}

export function chordAtCaret(): ChordItem | undefined {
  return itemAt(memo.value.chords, caret.value);
}

export { newId, mod12 };
