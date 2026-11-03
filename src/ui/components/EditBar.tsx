// The edit bar under the timeline: undo/redo, navigation, the most used edits, chord length,
// and a "その他" menu with the rhythm-aware edits (merge, anticipation, copy/paste, insert mode…).
import { useEffect, useRef, useState } from 'preact/hooks';
import { memo, selection, settings, updateSettings, caret, canUndo, canRedo, undo, redo, narrow } from '../state';
import { findItem } from '../../seq/timeline';
import { barTicks, lengthChoices, posLabel, beatTicks, isCompound } from '../../seq/time';
import {
  anticipate, clipboard, copySelection, deleteBarAt, deleteSelection, duplicateSelection, insertBarAt, inputLength, loopSelection, makeB,
  mergeSelection, moveSelection, pasteAtCaret, removeB, resizeSelection, rippleDeleteSelection, selectAll, splitSelection, stepSelection,
  targetItem, toggleInsertMode, updateMemo,
} from '../actions';
import { Btn } from './common';

interface Item { label: string; hint?: string; run: () => void; disabled?: boolean; check?: boolean; danger?: boolean; sep?: boolean }

function MoreMenu({ items }: { items: Item[] }) {
  const [open, setOpen] = useState(false);
  const [pos, setPos] = useState<Record<string, string> | null>(null);
  const ref = useRef<HTMLDivElement>(null);
  // The edit bar scrolls horizontally (which clips children), so the menu is placed in viewport coordinates.
  const toggle = () => {
    const r = ref.current?.getBoundingClientRect();
    if (r) {
      // Open towards the side with more room and never past the window edge.
      const above = r.top - 12, below = window.innerHeight - r.bottom - 12;
      const right = Math.max(8, window.innerWidth - r.right) + 'px';
      setPos(above >= below
        ? { right, bottom: window.innerHeight - r.top + 6 + 'px', maxHeight: above + 'px' }
        : { right, top: r.bottom + 6 + 'px', maxHeight: below + 'px' });
    }
    setOpen(!open);
  };
  useEffect(() => {
    if (!open) return;
    const close = (e: PointerEvent) => { if (ref.current && !ref.current.contains(e.target as Node)) setOpen(false); };
    const esc = (e: KeyboardEvent) => { if (e.key === 'Escape') setOpen(false); };
    document.addEventListener('pointerdown', close, true);
    document.addEventListener('keydown', esc, true);
    return () => { document.removeEventListener('pointerdown', close, true); document.removeEventListener('keydown', esc, true); };
  }, [open]);
  return (
    <div class="more-menu" ref={ref}>
      <Btn icon="more" label="その他の編集" active={open} onClick={toggle} aria-haspopup="menu" aria-expanded={open} />
      {open && (
        <div class={`menu fixed ${narrow.value ? 'sheet' : ''}`} role="menu" style={!narrow.value && pos ? pos : undefined}>
          {items.map((it) => it.sep ? <hr /> : (
            <button type="button" role="menuitem" class={`${it.danger ? 'danger' : ''} ${it.check !== undefined ? 'checkable' : ''}`} disabled={it.disabled}
              onClick={() => { setOpen(false); it.run(); }}>
              {it.check !== undefined && <span class={`check ${it.check ? 'on' : ''}`}>{it.check ? '✓' : ''}</span>}
              <span class="ml">{it.label}</span>
              {it.hint && <kbd>{it.hint}</kbd>}
            </button>
          ))}
        </div>
      )}
    </div>
  );
}

export function EditBar() {
  const m = memo.value;
  const s = settings.value;
  const sel = selection.value;
  const it = sel.length ? findItem(m.chords, sel[0]) : undefined;
  const choices = lengthChoices(m.ts);
  const curLen = it ? it.len : inputLength(m);
  const target = targetItem();
  const setLen = (t: number) => (it ? resizeSelection(t) : updateSettings({ inputLen: t }));
  const bar = barTicks(m.ts);
  const hereBar = Math.floor((it ? it.t : caret.value) / bar);
  const nudge = isCompound(m.ts) ? '8分' : '半拍';
  const isNarrow = narrow.value;

  const more: Item[] = [
    { label: sel.length >= 2 ? '選択したコードを1つに結合' : '次のコードと結合', hint: 'J', run: mergeSelection, disabled: !target },
    { label: '分割（半分に）', run: splitSelection, disabled: sel.length !== 1 },
    { label: `${nudge}前に食う（アンティシペーション）`, hint: 'Alt+←', run: () => anticipate(1), disabled: !target },
    { label: '食いを戻す', hint: 'Alt+→', run: () => anticipate(-1), disabled: !target },
    { sep: true, label: '', run: () => {} },
    ...(isNarrow ? [
      { label: '左のコードと入れ替え', run: () => moveSelection(-1), disabled: sel.length !== 1 },
      { label: '右のコードと入れ替え', run: () => moveSelection(1), disabled: sel.length !== 1 },
    ] : []),
    { label: 'コピー', hint: 'Ctrl+C', run: () => copySelection(false), disabled: !sel.length },
    { label: '切り取り', hint: 'Ctrl+X', run: () => copySelection(true), disabled: !sel.length },
    { label: clipboard.value ? `貼り付け（${clipboard.value.items.length}個）` : '貼り付け', hint: 'Ctrl+V', run: pasteAtCaret, disabled: !clipboard.value },
    { label: 'すべて選択', hint: 'Ctrl+A', run: selectAll, disabled: !m.chords.length },
    { label: '選択範囲をループ', run: loopSelection, disabled: !sel.length },
    { sep: true, label: '', run: () => {} },
    { label: '削除して後ろを詰める', hint: 'Shift+Del', run: rippleDeleteSelection, disabled: !sel.length, danger: true },
    { label: `${hereBar + 1}小節目の前に空の小節を挿入`, run: () => insertBarAt(hereBar) },
    { label: `${hereBar + 1}小節目を削除して詰める`, run: () => deleteBarAt(hereBar), disabled: m.bars <= 1, danger: true },
    { sep: true, label: '', run: () => {} },
    ...(isNarrow && target ? (!target.b
      ? [{ label: 'このコードのB案を作る（A/B比較）', run: makeB }]
      : [{ label: 'B案を採用', run: () => removeB(true) }, { label: 'B案を削除', run: () => removeB(false) }]) : []),
    { label: '挿入モード（後ろをずらして入力）', hint: 'Insert', run: toggleInsertMode, check: s.insertMode },
    { label: '同じコードが続いたらタイでつなげる', run: () => updateMemo({ tie: !m.tie }), check: m.tie },
  ];

  const lenPicker = (
    <label class="len-pick" title={it ? '選択中のコードの長さ' : '次に入れるコードの長さ'}>
      <span>{it ? '長さ' : '入力'}</span>
      <select value={String(curLen)} onChange={(e) => setLen(Number((e.target as HTMLSelectElement).value))} aria-label={it ? '長さ' : '入力の長さ'}>
        {choices.map((c) => <option value={String(c.ticks)}>{c.label}</option>)}
        {!choices.some((c) => c.ticks === curLen) && <option value={String(curLen)}>{(curLen / beatTicks(m.ts)).toFixed(2).replace(/\.?0+$/, '')}拍</option>}
      </select>
    </label>
  );

  if (isNarrow) {
    // Phones: one scrollable row, most used first; the rest lives in the その他 menu.
    return (
      <div class={`editbar compact ${s.insertMode ? 'ins' : ''}`}>
        <Btn icon="undo" label="元に戻す" disabled={!canUndo.value} onClick={undo} />
        <Btn icon="redo" label="やり直す" disabled={!canRedo.value} onClick={redo} />
        {lenPicker}
        <Btn icon="left" label="前のコード" onClick={() => stepSelection(-1)} />
        <Btn icon="right" label="次のコード" onClick={() => stepSelection(1)} />
        {sel.length > 0 ? (
          <>
            <Btn icon="trash" label="削除" kind="danger" onClick={deleteSelection} />
            <Btn icon="copy" label="複製" onClick={duplicateSelection} />
            <Btn class="txt" label="結合" onClick={mergeSelection}>結合</Btn>
          </>
        ) : <Btn label="直前のコードを削除" onClick={deleteSelection} class="txt">⌫</Btn>}
        {s.insertMode && <button type="button" class="chip ins-chip on" onClick={toggleInsertMode} title="挿入モード（タップで上書きモードへ）">挿入</button>}
        <MoreMenu items={more} />
      </div>
    );
  }
  return (
    <div class={`editbar ${sel.length ? 'has-sel' : ''} ${s.insertMode ? 'ins' : ''}`}>
      <div class="eb-group eb-main">
        <Btn icon="undo" label="元に戻す (Ctrl+Z)" disabled={!canUndo.value} onClick={undo} />
        <Btn icon="redo" label="やり直す (Ctrl+Y)" disabled={!canRedo.value} onClick={redo} />
        <span class="eb-sep" />
        <Btn icon="left" label="前のコード (←)" onClick={() => stepSelection(-1)} />
        <Btn icon="right" label="次のコード (→)" onClick={() => stepSelection(1)} />
        {sel.length > 0 ? (
          <>
            <span class="eb-sep" />
            <Btn icon="copy" label="複製 (Ctrl+D)" onClick={duplicateSelection} />
            <Btn icon="split" label="分割" onClick={splitSelection} disabled={sel.length !== 1} />
            <Btn class="txt" label={sel.length >= 2 ? '選択したコードを結合 (J)' : '次のコードと結合 (J)'} onClick={mergeSelection}>結合</Btn>
            <Btn class="txt" label="半拍前に食う (Alt+←)" onClick={() => anticipate(1)}>食い</Btn>
            <Btn label="左と入れ替え (Shift+←)" onClick={() => moveSelection(-1)} disabled={sel.length !== 1} class="txt swap">⇠入替</Btn>
            <Btn label="右と入れ替え (Shift+→)" onClick={() => moveSelection(1)} disabled={sel.length !== 1} class="txt swap">入替⇢</Btn>
            <Btn icon="trash" label="削除 (Delete)" kind="danger" onClick={deleteSelection} />
          </>
        ) : (
          <>
            <span class="pos">位置 {posLabel(caret.value, m.ts)}</span>
            <Btn label="直前のコードを削除 (Backspace)" onClick={deleteSelection} class="txt">⌫</Btn>
          </>
        )}
        {target && (!target.b ? (
          <Btn class="txt" label="このコードのB案を作って聴き比べる" onClick={makeB}>＋B案</Btn>
        ) : (
          <>
            <Btn class="txt" label="B案を採用（Aに上書き）" onClick={() => removeB(true)}>Bを採用</Btn>
            <Btn class="txt" label="B案を消す" onClick={() => removeB(false)}>B案削除</Btn>
          </>
        ))}
        <MoreMenu items={more} />
      </div>
      <div class="eb-group len" role="group" aria-label="長さ">
        <span class="mini-label">{it ? '長さ' : '入力の長さ'}</span>
        {choices.map((c) => (
          <button type="button" class={`chip ${c.ticks === curLen ? 'on' : ''}`} onClick={() => setLen(c.ticks)}>{c.label}</button>
        ))}
        <button type="button" class={`chip ins-chip ${s.insertMode ? 'on' : ''}`} onClick={toggleInsertMode} title="挿入モード：入力すると後ろのコードをずらす (Insert)">{s.insertMode ? '挿入' : '上書き'}</button>
      </div>
    </div>
  );
}
