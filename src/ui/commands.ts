// Commands shared by keyboard shortcuts, MIDI learn and custom key bindings (e.g. a left-hand device).
import { diatonicChord } from '../theory/diatonic';
import { openTemplates } from './components/TemplateGallery';
import { lengthChoices } from '../seq/time';
import { findItem } from '../seq/timeline';
import {
  applyMod, deleteSelection, duplicateSelection, inputChord, inputLength, moveSelection, newMemo, play, resizeSelection, stepSelection,
  tapTempo, togglePlay, toStart, transpose, updateMemo, clearSelection,
  mergeSelection, anticipate, rippleDeleteSelection, copySelection, pasteAtCaret, selectAll, toggleInsertMode,
} from './actions';
import { dialog, memo, redo, selection, settings, side, toast, undo, updateSettings, view, hasB, tab, narrow, inputMode } from './state';

export interface Command {
  id: string;
  label: string;
  group: string;
  run: () => void;
}

function deg(d: number, sev?: boolean) {
  return () => inputChord(diatonicChord(memo.value.key, d, sev ?? settings.value.seventh));
}

function changeLen(dir: -1 | 1) {
  const m = memo.value;
  const ch = lengthChoices(m.ts).map((c) => c.ticks).sort((a, b) => a - b);
  const sel = selection.value[0];
  const it = sel ? findItem(m.chords, sel) : undefined;
  const cur = it ? it.len : inputLength(m);
  let i = ch.findIndex((x) => x >= cur);
  if (i < 0) i = ch.length - 1;
  const next = ch[Math.max(0, Math.min(ch.length - 1, i + dir))];
  if (it) resizeSelection(next);
  else updateSettings({ inputLen: next });
}

export const COMMANDS: Command[] = [
  { id: 'play', label: '再生／停止', group: '再生', run: togglePlay },
  { id: 'playStart', label: '頭から再生', group: '再生', run: () => play(true) },
  { id: 'toStart', label: '先頭に戻る', group: '再生', run: toStart },
  { id: 'loop', label: 'ループ ON/OFF', group: '再生', run: () => updateMemo({ loop: { ...memo.value.loop, on: !memo.value.loop.on } }) },
  { id: 'metro', label: 'メトロノーム ON/OFF', group: '再生', run: () => updateMemo({ metronome: !memo.value.metronome }) },
  { id: 'tap', label: 'タップテンポ', group: '再生', run: () => { tapTempo(); } },
  { id: 'ab', label: 'A/B 切り替え', group: '再生', run: () => { if (hasB.value) side.value = side.value === 'A' ? 'B' : 'A'; else toast('B案があるコードがないよ（コードを選んで「＋B案」）'); } },
  ...[0, 1, 2, 3, 4, 5, 6].map((d) => ({ id: `deg${d + 1}`, label: `${d + 1}度のコード`, group: '入力', run: deg(d) })),
  ...[0, 1, 2, 3, 4, 5, 6].map((d) => ({ id: `deg${d + 1}x`, label: `${d + 1}度のコード（3和音/4和音を逆に）`, group: '入力', run: () => deg(d, !settings.value.seventh)() })),
  { id: 'mod7', label: '7th', group: '入力', run: () => applyMod('seventh') },
  { id: 'modM7', label: 'M7', group: '入力', run: () => applyMod('maj7') },
  { id: 'modSus4', label: 'sus4', group: '入力', run: () => applyMod('sus4') },
  { id: 'modAdd9', label: 'add9', group: '入力', run: () => applyMod('add9') },
  { id: 'modSwap', label: 'm⇔M', group: '入力', run: () => applyMod('swapMm') },
  { id: 'modInv', label: '転回', group: '入力', run: () => applyMod('inv') },
  { id: 'prev', label: '前のコード', group: '編集', run: () => stepSelection(-1) },
  { id: 'next', label: '次のコード', group: '編集', run: () => stepSelection(1) },
  { id: 'selPrev', label: '選択を左に広げる', group: '編集', run: () => stepSelection(-1, true) },
  { id: 'selNext', label: '選択を右に広げる', group: '編集', run: () => stepSelection(1, true) },
  { id: 'moveLeft', label: 'コードを左と入れ替え', group: '編集', run: () => moveSelection(-1) },
  { id: 'moveRight', label: 'コードを右と入れ替え', group: '編集', run: () => moveSelection(1) },
  { id: 'delete', label: '削除', group: '編集', run: deleteSelection },
  { id: 'dup', label: '複製', group: '編集', run: duplicateSelection },
  { id: 'merge', label: '結合（次のコードとつなげる）', group: '編集', run: mergeSelection },
  { id: 'antic', label: '半拍前に食う', group: '編集', run: () => anticipate(1) },
  { id: 'unantic', label: '食いを戻す', group: '編集', run: () => anticipate(-1) },
  { id: 'ripple', label: '削除して詰める', group: '編集', run: rippleDeleteSelection },
  { id: 'copy', label: 'コピー', group: '編集', run: () => copySelection(false) },
  { id: 'cut', label: '切り取り', group: '編集', run: () => copySelection(true) },
  { id: 'paste', label: '貼り付け', group: '編集', run: pasteAtCaret },
  { id: 'selAll', label: 'すべて選択', group: '編集', run: selectAll },
  { id: 'insMode', label: '挿入モード ON/OFF', group: '編集', run: toggleInsertMode },
  { id: 'undo', label: '元に戻す', group: '編集', run: () => { if (!undo()) toast('これ以上戻せないよ'); } },
  { id: 'redo', label: 'やり直す', group: '編集', run: () => { redo(); } },
  { id: 'lenDown', label: '長さを短く', group: '編集', run: () => changeLen(-1) },
  { id: 'lenUp', label: '長さを長く', group: '編集', run: () => changeLen(1) },
  { id: 'transDown', label: '半音下に移調', group: '編集', run: () => transpose(-1) },
  { id: 'transUp', label: '半音上に移調', group: '編集', run: () => transpose(1) },
  { id: 'escape', label: '選択解除', group: '編集', run: () => { if (dialog.value) { dialog.value.resolve(null); dialog.value = null; } else clearSelection(); } },
  { id: 'newMemo', label: '新しい空のメモ', group: 'メモ', run: () => { newMemo(); } },
  { id: 'templates', label: 'テンプレートから作成', group: 'メモ', run: () => { openTemplates(); } },
  { id: 'list', label: 'メモ一覧', group: 'メモ', run: () => { view.value = view.value === 'list' ? 'editor' : 'list'; } },
  { id: 'piano', label: 'ピアノ入力へ', group: 'メモ', run: () => { inputMode.value = 'piano'; if (narrow.value) tab.value = 'input'; } },
  { id: 'help', label: 'ショートカット一覧', group: 'メモ', run: () => { window.dispatchEvent(new Event('hm-help')); } },
];

export const COMMAND_MAP: Record<string, Command> = Object.fromEntries(COMMANDS.map((c) => [c.id, c]));

export const DEFAULT_KEYS: Record<string, string> = {
  Space: 'play', Enter: 'playStart', Home: 'toStart', L: 'loop', M: 'metro', T: 'tap', B: 'ab',
  '1': 'deg1', '2': 'deg2', '3': 'deg3', '4': 'deg4', '5': 'deg5', '6': 'deg6', '7': 'deg7',
  'Shift+1': 'deg1x', 'Shift+2': 'deg2x', 'Shift+3': 'deg3x', 'Shift+4': 'deg4x', 'Shift+5': 'deg5x', 'Shift+6': 'deg6x', 'Shift+7': 'deg7x',
  Q: 'mod7', W: 'modM7', E: 'modSus4', R: 'modAdd9', Y: 'modSwap', I: 'modInv',
  ArrowLeft: 'prev', ArrowRight: 'next', 'Shift+ArrowLeft': 'moveLeft', 'Shift+ArrowRight': 'moveRight',
  'Ctrl+Shift+ArrowLeft': 'selPrev', 'Ctrl+Shift+ArrowRight': 'selNext',
  Delete: 'delete', Backspace: 'delete', 'Ctrl+D': 'dup', J: 'merge', 'Alt+ArrowLeft': 'antic', 'Alt+ArrowRight': 'unantic', 'Shift+Delete': 'ripple',
  'Ctrl+C': 'copy', 'Ctrl+X': 'cut', 'Ctrl+V': 'paste', 'Ctrl+A': 'selAll', Insert: 'insMode', 'Ctrl+Z': 'undo', 'Ctrl+Y': 'redo', 'Ctrl+Shift+Z': 'redo',
  ',': 'lenDown', '.': 'lenUp', '[': 'transDown', ']': 'transUp', Escape: 'escape',
  'Alt+N': 'newMemo', 'Alt+T': 'templates', 'Alt+L': 'list', P: 'piano', 'Shift+/': 'help', '?': 'help',
};

/** "Ctrl+Shift+Z" style name of a key event (layout-independent for letters/digits). */
export function comboOf(e: KeyboardEvent): string {
  let k = e.key;
  if (/^Key[A-Z]$/.test(e.code)) k = e.code.slice(3);
  else if (/^Digit[0-9]$/.test(e.code)) k = e.code.slice(5);
  else if (k === ' ') k = 'Space';
  else if (k.length === 1) k = k.toUpperCase();
  const parts: string[] = [];
  if (e.ctrlKey || e.metaKey) parts.push('Ctrl');
  if (e.altKey) parts.push('Alt');
  if (e.shiftKey && !(k.length === 1 && !/[A-Z0-9]/.test(k))) parts.push('Shift');
  if (['Control', 'Shift', 'Alt', 'Meta'].includes(e.key)) return parts.join('+');
  parts.push(k);
  return parts.join('+');
}

export function keyBindings(): Record<string, string> {
  return { ...DEFAULT_KEYS, ...settings.value.keyMap };
}

/** Keys currently bound to a command (for the help list). */
export function keysFor(id: string): string[] {
  return Object.entries(keyBindings()).filter(([, c]) => c === id).map(([k]) => k);
}

export let keyLearn: ((combo: string) => void) | null = null;
export function setKeyLearn(fn: ((combo: string) => void) | null) {
  keyLearn = fn;
}

export function installKeyboard() {
  window.addEventListener('keydown', (e) => {
    const t = e.target as HTMLElement;
    const combo = comboOf(e);
    if (keyLearn) {
      if (!combo || ['Ctrl', 'Alt', 'Shift', 'Ctrl+Shift'].includes(combo)) return;
      e.preventDefault();
      const fn = keyLearn;
      keyLearn = null;
      fn(combo);
      return;
    }
    const typing = t && (t.tagName === 'INPUT' || t.tagName === 'TEXTAREA' || t.tagName === 'SELECT' || t.isContentEditable);
    if (typing && combo !== 'Escape') return;
    if (dialog.value && combo !== 'Escape') return;
    // Let focused knobs use arrow keys.
    if (t?.getAttribute?.('role') === 'slider' && /Arrow/.test(combo)) return;
    // Space always plays/stops (like a DAW) even when a button has focus; Enter keeps activating buttons.
    if (combo === 'Space' && t?.tagName === 'BUTTON') (t as HTMLButtonElement).blur();
    if (combo === 'Enter' && (t?.tagName === 'BUTTON' || t?.tagName === 'A')) return;
    const id = keyBindings()[combo];
    if (!id) return;
    if (view.value === 'list' && !['play', 'list', 'newMemo', 'templates', 'escape', 'help'].includes(id)) return;
    const cmd = COMMAND_MAP[id];
    if (!cmd) return;
    e.preventDefault();
    cmd.run();
  });
}
