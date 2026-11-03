// Editing operations on the chord timeline. Pure functions: they return new arrays.
import type { ChordSpec } from '../theory/chord';
import type { PatternSpec } from './pattern';

export interface ChordSide {
  chord: ChordSpec;
  /** Pattern override for this chord (null/undefined = memo pattern). */
  pat?: PatternSpec | null;
}

export interface ChordItem {
  id: string;
  /** Start tick. */
  t: number;
  /** Length in ticks. */
  len: number;
  chord: ChordSpec;
  pat?: PatternSpec | null;
  /** B side for A/B comparison. Missing fields fall back to A. */
  b?: { chord?: ChordSpec; pat?: PatternSpec | null } | null;
}

let idCounter = 0;
export function newId(prefix = 'c'): string {
  idCounter = (idCounter + 1) % 1e6;
  return prefix + Date.now().toString(36) + Math.floor(Math.random() * 1e6).toString(36) + idCounter.toString(36);
}

export function sortItems(items: ChordItem[]): ChordItem[] {
  return [...items].sort((a, b) => a.t - b.t);
}

export function itemEnd(it: ChordItem): number {
  return it.t + it.len;
}

/** Remove everything in [from, to), trimming or splitting items that overlap the edges. */
export function clearRange(items: ChordItem[], from: number, to: number): ChordItem[] {
  if (to <= from) return items;
  const out: ChordItem[] = [];
  for (const it of items) {
    const end = itemEnd(it);
    if (end <= from || it.t >= to) {
      out.push(it);
      continue;
    }
    if (it.t < from) out.push({ ...it, len: from - it.t });
    if (end > to) out.push({ ...it, id: it.t < from ? newId() : it.id, t: to, len: end - to });
  }
  return sortItems(out);
}

/** Write a chord at [t, t+len), overwriting whatever was there. */
export function writeChord(items: ChordItem[], t: number, len: number, chord: ChordSpec, extra: Partial<ChordItem> = {}): { items: ChordItem[]; id: string } {
  const id = extra.id ?? newId();
  const cleared = clearRange(items, t, t + len);
  const item: ChordItem = { ...extra, id, t, len, chord };
  return { items: sortItems([...cleared, item]), id };
}

export function findItem(items: ChordItem[], id: string | null | undefined): ChordItem | undefined {
  return id ? items.find((i) => i.id === id) : undefined;
}

export function itemAt(items: ChordItem[], t: number): ChordItem | undefined {
  return items.find((i) => i.t <= t && t < itemEnd(i));
}

export function updateItem(items: ChordItem[], id: string, patch: Partial<ChordItem>): ChordItem[] {
  return items.map((i) => (i.id === id ? { ...i, ...patch, id: i.id } : i));
}

export function removeItems(items: ChordItem[], ids: string[]): ChordItem[] {
  const s = new Set(ids);
  return items.filter((i) => !s.has(i.id));
}

/** Change an item's length. Growing overwrites what follows; shrinking leaves a gap. */
export function resizeItem(items: ChordItem[], id: string, len: number): ChordItem[] {
  const it = findItem(items, id);
  if (!it || len <= 0) return items;
  const others = items.filter((i) => i.id !== id);
  const cleared = clearRange(others, it.t, it.t + len);
  return sortItems([...cleared, { ...it, len }]);
}

/** Split an item in two halves (snapped to `grid`). */
export function splitItem(items: ChordItem[], id: string, grid: number): { items: ChordItem[]; newId?: string } {
  const it = findItem(items, id);
  if (!it) return { items };
  let half = Math.round(it.len / 2 / grid) * grid;
  if (half <= 0 || half >= it.len) half = Math.floor(it.len / 2);
  if (half <= 0) return { items };
  const nid = newId();
  const a: ChordItem = { ...it, len: half };
  const b: ChordItem = { ...it, id: nid, t: it.t + half, len: it.len - half };
  return { items: sortItems([...items.filter((i) => i.id !== id), a, b]), newId: nid };
}

type Content = Pick<ChordItem, 'chord' | 'pat' | 'b'>;
const contentOf = (i: ChordItem): Content => ({ chord: i.chord, pat: i.pat, b: i.b });

/** Swap the contents (chord, pattern, B side) of two items; their time slots stay. */
export function swapContents(items: ChordItem[], idA: string, idB: string): ChordItem[] {
  const a = findItem(items, idA);
  const b = findItem(items, idB);
  if (!a || !b || a === b) return items;
  const ca = contentOf(a), cb = contentOf(b);
  return items.map((i) => (i.id === idA ? { ...i, ...cb } : i.id === idB ? { ...i, ...ca } : i));
}

/** Move an item's content one slot left/right (swap with the neighbour). Returns the id now holding it. */
export function shiftContent(items: ChordItem[], id: string, dir: -1 | 1): { items: ChordItem[]; id: string } {
  const sorted = sortItems(items);
  const idx = sorted.findIndex((i) => i.id === id);
  const j = idx + dir;
  if (idx < 0 || j < 0 || j >= sorted.length) return { items, id };
  return { items: swapContents(items, id, sorted[j].id), id: sorted[j].id };
}

/** Shift everything at or after `t` by `delta` ticks (ripple). */
export function ripple(items: ChordItem[], t: number, delta: number): ChordItem[] {
  return items.map((i) => (i.t >= t ? { ...i, t: i.t + delta } : i));
}

/**
 * Duplicate a contiguous selection and insert the copy right after it (later chords move back).
 * Returns the ids of the copies.
 */
export function duplicateItems(items: ChordItem[], ids: string[]): { items: ChordItem[]; ids: string[]; span: number } {
  const sel = sortItems(items.filter((i) => ids.includes(i.id)));
  if (!sel.length) return { items, ids: [], span: 0 };
  const start = sel[0].t;
  const end = Math.max(...sel.map(itemEnd));
  const span = end - start;
  const moved = ripple(items, end, span);
  const copies = sel.map((i) => ({ ...i, id: newId(), t: i.t + span }));
  return { items: sortItems([...moved, ...copies]), ids: copies.map((c) => c.id), span };
}

/** Insert empty time at `t` (e.g. "insert a bar"). */
export function insertTime(items: ChordItem[], t: number, len: number): ChordItem[] {
  // Split an item that straddles t.
  const straddle = items.find((i) => i.t < t && itemEnd(i) > t);
  let base = items;
  if (straddle) {
    base = items.filter((i) => i !== straddle);
    base.push({ ...straddle, len: t - straddle.t }, { ...straddle, id: newId(), t, len: itemEnd(straddle) - t });
  }
  return sortItems(ripple(base, t, len));
}

/** Delete time [t, t+len) and pull later chords forward. */
export function deleteTime(items: ChordItem[], t: number, len: number): ChordItem[] {
  const cleared = clearRange(items, t, t + len);
  return sortItems(cleared.map((i) => (i.t >= t + len ? { ...i, t: i.t - len } : i)));
}

/** Last tick used by any chord. */
export function contentEnd(items: ChordItem[]): number {
  return items.reduce((m, i) => Math.max(m, itemEnd(i)), 0);
}

/** Drop items beyond `end` and trim the one crossing it. */
export function truncate(items: ChordItem[], end: number): ChordItem[] {
  return items.filter((i) => i.t < end).map((i) => (itemEnd(i) > end ? { ...i, len: end - i.t } : i));
}

/** Contiguous range of ids between two items (inclusive), in time order. */
export function rangeIds(items: ChordItem[], a: string, b: string): string[] {
  const sorted = sortItems(items);
  const ia = sorted.findIndex((i) => i.id === a);
  const ib = sorted.findIndex((i) => i.id === b);
  if (ia < 0 || ib < 0) return [a].filter((x) => sorted.some((i) => i.id === x));
  const [lo, hi] = ia <= ib ? [ia, ib] : [ib, ia];
  return sorted.slice(lo, hi + 1).map((i) => i.id);
}

/** Chord / pattern actually used for a side. */
export function sideOf(it: ChordItem, side: 'A' | 'B'): ChordSide {
  if (side === 'B' && it.b) return { chord: it.b.chord ?? it.chord, pat: it.b.pat !== undefined ? it.b.pat : it.pat };
  return { chord: it.chord, pat: it.pat };
}

/** Check invariants (sorted, non-overlapping, positive lengths). */
export function isValidTimeline(items: ChordItem[]): boolean {
  for (let i = 0; i < items.length; i++) {
    if (items[i].len <= 0 || items[i].t < 0) return false;
    if (i > 0 && items[i].t < itemEnd(items[i - 1])) return false;
  }
  return true;
}

/**
 * Merge a contiguous selection into one chord (the first chord's content),
 * covering everything from the first start to the last end.
 */
export function mergeItems(items: ChordItem[], ids: string[]): { items: ChordItem[]; id: string | null } {
  const sel = sortItems(items.filter((i) => ids.includes(i.id)));
  if (sel.length < 2) return { items, id: sel[0]?.id ?? null };
  const first = sel[0];
  const end = Math.max(...sel.map(itemEnd));
  const rest = items.filter((i) => !ids.includes(i.id));
  const merged: ChordItem = { ...first, len: end - first.t };
  return { items: sortItems([...clearRange(rest, first.t, end), merged]), id: first.id };
}

/** Merge an item with the chord right after it (absorbs the next one). */
export function mergeWithNext(items: ChordItem[], id: string): { items: ChordItem[]; id: string | null } {
  const sorted = sortItems(items);
  const i = sorted.findIndex((x) => x.id === id);
  if (i < 0 || i === sorted.length - 1) return { items, id };
  return mergeItems(items, [id, sorted[i + 1].id]);
}

/**
 * Anticipation (食い): start the chord `amount` ticks earlier, taking the time from the chord before it
 * (or from a gap). Negative amount undoes it (starts later, giving the time back).
 */
export function shiftStart(items: ChordItem[], id: string, amount: number): ChordItem[] {
  const sorted = sortItems(items);
  const i = sorted.findIndex((x) => x.id === id);
  if (i < 0 || amount === 0) return items;
  const it = sorted[i];
  const prev = sorted[i - 1];
  const prevEnd = prev ? itemEnd(prev) : 0;
  if (amount > 0) {
    const newT = it.t - amount;
    if (newT < 0) return items;
    if (prev && prevEnd > newT) {
      // Take the time from the previous chord (it must keep at least a sliver).
      if (newT <= prev.t) return items;
      return sorted.map((x) => (x.id === prev.id ? { ...x, len: newT - prev.t } : x.id === id ? { ...x, t: newT, len: x.len + amount } : x));
    }
    return sorted.map((x) => (x.id === id ? { ...x, t: newT, len: x.len + amount } : x));
  }
  const back = -amount;
  if (it.len <= back) return items;
  const touching = prev && prevEnd === it.t;
  return sorted.map((x) => {
    if (touching && x.id === prev.id) return { ...x, len: x.len + back };
    if (x.id === id) return { ...x, t: x.t + back, len: x.len - back };
    return x;
  });
}

/** Delete items and pull everything after them forward by the deleted span ("削除して詰める"). */
export function rippleDelete(items: ChordItem[], ids: string[]): ChordItem[] {
  const sel = sortItems(items.filter((i) => ids.includes(i.id)));
  if (!sel.length) return items;
  const start = sel[0].t;
  const end = Math.max(...sel.map(itemEnd));
  return deleteTime(items, start, end - start);
}

/** Copy of a selection with times relative to its start (for the clipboard). */
export function copyItems(items: ChordItem[], ids: string[]): { items: ChordItem[]; span: number } {
  const sel = sortItems(items.filter((i) => ids.includes(i.id)));
  if (!sel.length) return { items: [], span: 0 };
  const start = sel[0].t;
  const span = Math.max(...sel.map(itemEnd)) - start;
  return { items: sel.map((i) => ({ ...i, t: i.t - start })), span };
}

/** Paste clipboard items at `t` (overwrite, or insert = push later chords back). */
export function pasteItems(items: ChordItem[], clip: { items: ChordItem[]; span: number }, t: number, insert: boolean): { items: ChordItem[]; ids: string[] } {
  if (!clip.items.length) return { items, ids: [] };
  let base = insert ? insertTime(items, t, clip.span) : clearRange(items, t, t + clip.span);
  const ids: string[] = [];
  for (const c of clip.items) {
    const id = newId();
    ids.push(id);
    base = [...base, { ...c, id, t: t + c.t }];
  }
  return { items: sortItems(base), ids };
}
