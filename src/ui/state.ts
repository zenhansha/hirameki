// App state (Preact signals), undo history, autosave and audio sync.
import { batch, computed, effect, signal } from '@preact/signals';
import { AppSettings, Memo, defaultMemo, defaultSettings, isEmptyMemo } from '../store/schema';
import { saveMemo, saveSettings, kvSet } from '../store/repo';
import { audio } from '../audio/host';
import { compileMemo, toSeqData } from '../seq/compile';
import type { ModSource } from '../audio/params';

export type View = 'editor' | 'list';
export type Tab = 'input' | 'pattern' | 'sound' | 'fx' | 'memo';
export type InputMode = 'diatonic' | 'nondia' | 'roots' | 'piano' | 'hum';
export type SoundPart = 0 | 1 | 2;

export const settings = signal<AppSettings>(defaultSettings());
export const memo = signal<Memo>(defaultMemo());
export const view = signal<View>('editor');
export const tab = signal<Tab>('input');
export const sideTab = signal<Exclude<Tab, 'input'>>('pattern');
export const inputMode = signal<InputMode>('diatonic');
export const side = signal<'A' | 'B'>('A');
export const selection = signal<string[]>([]);
export const caret = signal(0);
export const lastInserted = signal<string | null>(null);
export const playing = signal(false);
export const audioState = signal(audio.state);
export const saveState = signal<'saved' | 'dirty' | 'saving' | 'error'>('saved');
export const soundPart = signal<SoundPart>(0);
export const modAssign = signal<ModSource | null>(null);
export const pianoNotes = signal<number[]>([]);
export const midiHeld = signal<number[]>([]);
export const patternScope = signal<'all' | 'sel'>('all');
export const narrow = signal(typeof window !== 'undefined' ? window.innerWidth < 1024 : false);
export const persisted = signal(false);

// Slices: components that read these only re-render when that part changes.
export const chords = computed(() => memo.value.chords);
export const key = computed(() => memo.value.key);
export const ts = computed(() => memo.value.ts);
export const synthPatch = computed(() => memo.value.synth);
export const fxChain = computed(() => memo.value.fx);
export const hasB = computed(() => memo.value.chords.some((c) => !!c.b));

// ---- toasts / dialogs ---------------------------------------------------

export interface Toast {
  id: number;
  text: string;
  kind: 'info' | 'error' | 'ok';
  action?: { label: string; run: () => void };
  ms: number;
}

export const toasts = signal<Toast[]>([]);
let toastId = 1;

export function toast(text: string, kind: Toast['kind'] = 'info', action?: Toast['action'], ms = 3200) {
  const t: Toast = { id: toastId++, text, kind, action, ms: action ? Math.max(ms, 5000) : ms };
  toasts.value = [...toasts.value.slice(-3), t];
  setTimeout(() => { toasts.value = toasts.value.filter((x) => x.id !== t.id); }, t.ms);
}

export interface DialogSpec {
  kind: 'confirm' | 'prompt' | 'custom';
  title: string;
  body?: string;
  value?: string;
  ok?: string;
  danger?: boolean;
  render?: () => preact.ComponentChildren;
  resolve: (v: string | boolean | null) => void;
}

export const dialog = signal<DialogSpec | null>(null);

export function confirmDialog(title: string, body = '', ok = 'OK', danger = false): Promise<boolean> {
  return new Promise((res) => { dialog.value = { kind: 'confirm', title, body, ok, danger, resolve: (v) => res(v === true) }; });
}

export function promptDialog(title: string, value = '', ok = 'OK'): Promise<string | null> {
  return new Promise((res) => { dialog.value = { kind: 'prompt', title, value, ok, resolve: (v) => res(typeof v === 'string' ? v : null) }; });
}

export function customDialog(title: string, render: () => preact.ComponentChildren): Promise<void> {
  return new Promise((res) => { dialog.value = { kind: 'custom', title, render, resolve: () => res() }; });
}

// ---- history --------------------------------------------------------------

const undoStack: Memo[] = [];
const redoStack: Memo[] = [];
let coalesceKey = '';
let coalesceAt = 0;
export const historyTick = signal(0);
export const canUndo = computed(() => (historyTick.value, undoStack.length > 0));
export const canRedo = computed(() => (historyTick.value, redoStack.length > 0));

export interface CommitOptions {
  /** Merge consecutive commits with the same key (knob drags) into one undo step. */
  coalesce?: string;
  /** Don't record in history (e.g. title typing handled separately). */
  noHistory?: boolean;
}

export function commit(fn: (m: Memo) => Memo, opts: CommitOptions = {}) {
  const before = memo.value;
  const after = fn(before);
  if (after === before) return;
  const now = Date.now();
  if (!opts.noHistory) {
    const merge = opts.coalesce && opts.coalesce === coalesceKey && now - coalesceAt < 1500;
    if (!merge) {
      undoStack.push(before);
      if (undoStack.length > 200) undoStack.shift();
    }
    redoStack.length = 0;
    coalesceKey = opts.coalesce ?? '';
    coalesceAt = now;
    historyTick.value++;
  }
  memo.value = after;
  markDirty();
}

export function undo() {
  const prev = undoStack.pop();
  if (!prev) return false;
  redoStack.push(memo.value);
  coalesceKey = '';
  memo.value = prev;
  fixSelection();
  historyTick.value++;
  markDirty();
  return true;
}

export function redo() {
  const next = redoStack.pop();
  if (!next) return false;
  undoStack.push(memo.value);
  coalesceKey = '';
  memo.value = next;
  fixSelection();
  historyTick.value++;
  markDirty();
  return true;
}

export function resetHistory() {
  undoStack.length = 0;
  redoStack.length = 0;
  coalesceKey = '';
  historyTick.value++;
}

function fixSelection() {
  const ids = new Set(memo.value.chords.map((c) => c.id));
  const sel = selection.value.filter((id) => ids.has(id));
  if (sel.length !== selection.value.length) selection.value = sel;
  if (lastInserted.value && !ids.has(lastInserted.value)) lastInserted.value = null;
}

// ---- autosave ---------------------------------------------------------------

let saveTimer: ReturnType<typeof setTimeout> | null = null;

function markDirty() {
  saveState.value = 'dirty';
  if (saveTimer) clearTimeout(saveTimer);
  saveTimer = setTimeout(() => { flushSave(); }, 600);
}

export async function flushSave(): Promise<void> {
  if (saveTimer) { clearTimeout(saveTimer); saveTimer = null; }
  const m = memo.value;
  if (saveState.value === 'saved') return;
  if (!persisted.value && isEmptyMemo(m)) { saveState.value = 'saved'; return; }
  saveState.value = 'saving';
  try {
    await saveMemo(m);
    persisted.value = true;
    kvSet('lastMemo', m.id).catch(() => {});
    if (memo.value === m) saveState.value = 'saved';
    else saveState.value = 'dirty';
  } catch (e) {
    saveState.value = 'error';
    const quota = (e as DOMException)?.name === 'QuotaExceededError';
    toast(quota ? '保存容量がいっぱいです。古いメモを書き出して削除してね' : '保存できませんでした。もう一度試すか、JSONで書き出しておいてね', 'error');
  }
}

let settingsTimer: ReturnType<typeof setTimeout> | null = null;
export function updateSettings(patch: Partial<AppSettings>) {
  settings.value = { ...settings.value, ...patch };
  if (settingsTimer) clearTimeout(settingsTimer);
  settingsTimer = setTimeout(() => saveSettings(settings.value).catch(() => {}), 300);
}

/** Replace the whole memo (open/new) without history. */
export function loadMemoIntoEditor(m: Memo, isPersisted: boolean) {
  batch(() => {
    memo.value = m;
    persisted.value = isPersisted;
    selection.value = [];
    lastInserted.value = null;
    // Caret after the last chord: suggestions continue the progression and new chords append.
    caret.value = m.chords.reduce((e, c) => Math.max(e, c.t + c.len), 0);
    side.value = 'A';
    saveState.value = 'saved';
  });
  resetHistory();
}

// ---- audio sync -------------------------------------------------------------

/** When the list plays a memo, the engine follows that memo instead of the editor. */
export const auditionMemo = signal<Memo | null>(null);

let syncQueued = false;
export function syncAudioNow() {
  syncQueued = false;
  const m = auditionMemo.value ?? memo.value;
  const s = auditionMemo.value ? 'A' : side.value;
  const c = compileMemo(m, { side: s });
  audio.setPatch(0, m.synth);
  audio.setPatch(1, m.bass.patch);
  audio.setPatch(2, m.melodyPatch);
  audio.setFx(m.fx, m.bpm);
  audio.setSeq(toSeqData(m, c));
}

export function startAudioSync() {
  effect(() => {
    // Track dependencies.
    void memo.value; void side.value; void auditionMemo.value;
    if (syncQueued) return;
    syncQueued = true;
    queueMicrotask(syncAudioNow);
  });
  effect(() => { audio.setMaster(settings.value.master); });
  audio.subscribe(() => {
    playing.value = audio.playing;
    audioState.value = audio.state;
  });
}

export const nowPlayingId = signal<string | null>(null);
