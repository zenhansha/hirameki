// Chord input: degree buttons (with chord names in the current key), non-diatonic palette,
// any-root grid, modifier chips, next-chord suggestions and the edit bar.
import { useComputed } from '@preact/signals';
import { useState } from 'preact/hooks';
import { inputMode, memo, selection, settings, updateSettings, side, caret, canUndo, canRedo, undo, redo, lastInserted, narrow } from '../state';
import { ChordSpec, chordFunction, chordName, romanName, chordToneNames } from '../../theory/chord';
import { activeModifiers, chordOnOffset, diatonicChord, nonDiatonicPalette, ModifierId } from '../../theory/diatonic';
import { suggestNext } from '../../theory/suggest';
import { pcName } from '../../theory/core';
import { findItem, sideOf, sortItems } from '../../seq/timeline';
import { lengthChoices, posLabel } from '../../seq/time';
import {
  applyMod, applySlash, applyTension, auditionChord, deleteSelection, duplicateSelection, inputChord, inputLength, loopSelection,
  makeB, moveSelection, removeB, resizeSelection, splitSelection, stepSelection, targetItem,
} from '../actions';
import { Btn, Icon, Seg } from './common';
import { Piano } from './Piano';
import { Hum } from './Hum';

function ChordButton({ chord, role, hint, big }: { chord: ChordSpec; role?: string; hint?: string; big?: boolean }) {
  const k = memo.value.key;
  const style = settings.value.romanStyle;
  const fn = chordFunction(chord, k);
  const rn = role ?? romanName(chord, k, style);
  return (
    <button type="button" class={`cbtn f-${fn} ${big ? 'big' : ''}`} title={hint ? `${hint}（${chordToneNames(chord, k).join(' ')}）` : chordToneNames(chord, k).join(' ')}
      onPointerDown={(e) => { (e.currentTarget as HTMLElement).classList.add('press'); }}
      onPointerUp={(e) => { (e.currentTarget as HTMLElement).classList.remove('press'); }}
      onPointerLeave={(e) => { (e.currentTarget as HTMLElement).classList.remove('press'); }}
      onClick={() => inputChord(chord)}>
      <span class="r">{rn}</span>
      <span class="n">{chordName(chord, k)}</span>
    </button>
  );
}

const MODS: { id: ModifierId; label: string; title: string }[] = [
  { id: 'triad', label: '3和音', title: '3和音に戻す' },
  { id: 'seventh', label: '7th', title: 'キーに合った7th（IM7, ii7, V7 …）' },
  { id: 'maj7', label: 'M7', title: 'メジャーセブンス（maj7）' },
  { id: 'dom7', label: '7', title: 'セブンス（♭7）' },
  { id: 'sus2', label: 'sus2', title: '3度を2度に' },
  { id: 'sus4', label: 'sus4', title: '3度を4度に' },
  { id: 'add9', label: 'add9', title: '9度を足す' },
  { id: 'six', label: '6', title: '6度を足す' },
  { id: 'swapMm', label: 'm⇔M', title: 'メジャーとマイナーを入れ替え（借用和音に便利）' },
  { id: 'dim', label: 'dim', title: 'ディミニッシュ' },
  { id: 'aug', label: 'aug', title: 'オーギュメント' },
  { id: 'power', label: '5', title: 'パワーコード' },
  { id: 'inv', label: '転回', title: '転回形を順番に切り替え（ベース音が変わる）' },
];
const TENS = [['b9', '♭9'], ['9', '9'], ['#9', '♯9'], ['11', '11'], ['#11', '♯11'], ['b13', '♭13'], ['13', '13']];
const ROOT_QS: [string, string][] = [['M', 'M'], ['m', 'm'], ['7', '7'], ['M7', 'M7'], ['m7', 'm7'], ['sus4', 'sus4'], ['sus2', 'sus2'], ['dim', 'dim'], ['m7b5', 'm7♭5'], ['aug', 'aug'], ['6', '6'], ['add9', 'add9']];

function Modifiers() {
  const it = targetItem();
  const chord = it ? sideOf(it, side.value).chord : null;
  const act = chord ? activeModifiers(chord) : new Set<ModifierId>();
  const [slashOpen, setSlashOpen] = useState(false);
  const k = memo.value.key;
  return (
    <div class="mods">
      <div class="mods-row">
        {MODS.map((m) => (
          <button type="button" class={`chip ${act.has(m.id) ? 'on' : ''}`} title={m.title} disabled={!chord} onClick={() => applyMod(m.id)}>{m.label}</button>
        ))}
        <button type="button" class={`chip ${chord?.bass ? 'on' : ''}`} disabled={!chord} title="ベース音を指定（分数コード）" onClick={() => setSlashOpen(!slashOpen)}>/ベース</button>
      </div>
      <div class="mods-row tens">
        <span class="mini-label">テンション</span>
        {TENS.map(([id, l]) => (
          <button type="button" class={`chip t ${chord?.ext?.includes(id) ? 'on' : ''}`} disabled={!chord} onClick={() => applyTension(id)}>{l}</button>
        ))}
      </div>
      {slashOpen && chord && (
        <div class="slash-pop">
          <span class="mini-label">ベース音</span>
          <button type="button" class="chip" onClick={() => { applySlash(null); setSlashOpen(false); }}>なし</button>
          {Array.from({ length: 12 }, (_, i) => (
            <button type="button" class="chip" onClick={() => { applySlash(i); setSlashOpen(false); }}>{pcName(k.tonic + i, k)}</button>
          ))}
        </div>
      )}
      <div class="mods-target">{chord ? <>編集中：<b>{chordName(chord, k)}</b>（{romanName(chord, k, settings.value.romanStyle)}）{chordToneNames(chord, k).join(' ')}</> : 'コードを入れると、ここで7thやsus4に変えられるよ'}</div>
    </div>
  );
}

function Suggestions() {
  const data = useComputed(() => {
    const m = memo.value;
    const items = sortItems(m.chords);
    const sel = selection.value[0];
    const selIt = sel ? findItem(items, sel) : undefined;
    const t = selIt ? selIt.t : caret.value;
    const hist = items.filter((i) => i.t < t).map((i) => sideOf(i, side.value).chord).slice(-6);
    let list = suggestNext(hist, m.key, 8);
    if (selIt) {
      // When replacing, don't offer the chord that is already there.
      const cur = sideOf(selIt, side.value).chord;
      list = list.filter((s) => !(s.chord.root === cur.root && s.chord.q === cur.q));
    }
    return { list: list.slice(0, 7), replacing: !!selIt };
  }).value;
  const k = memo.value.key;
  const style = settings.value.romanStyle;
  return (
    <div class="suggest">
      <span class="mini-label">{data.replacing ? 'ここに合う候補' : '次の候補'}</span>
      <div class="sg-list">
        {data.list.map((s) => (
          <button type="button" class={`sg f-${chordFunction(s.chord, k)} ${s.progression ? 'hot' : ''}`} title={s.reason} onClick={() => inputChord(s.chord)}>
            <b>{chordName(s.chord, k)}</b>
            <span>{romanName(s.chord, k, style)}</span>
            <small>{s.progression ? `→ ${s.progression}` : s.reason}</small>
          </button>
        ))}
      </div>
    </div>
  );
}

export function EditBar() {
  const m = memo.value;
  const sel = selection.value;
  const it = sel.length ? findItem(m.chords, sel[0]) : undefined;
  const choices = lengthChoices(m.ts);
  const curLen = it ? it.len : inputLength(m);
  const target = targetItem();
  const setLen = (t: number) => (it ? resizeSelection(t) : updateSettings({ inputLen: t }));
  if (narrow.value) {
    // Phones: one scrollable row, most used first (length as a compact picker).
    return (
      <div class="editbar compact">
        <Btn icon="undo" label="元に戻す" disabled={!canUndo.value} onClick={undo} />
        <Btn icon="redo" label="やり直す" disabled={!canRedo.value} onClick={redo} />
        <label class="len-pick" title={it ? '選択中のコードの長さ' : '次に入れるコードの長さ'}>
          <span>{it ? '長さ' : '入力'}</span>
          <select value={String(curLen)} onChange={(e) => setLen(Number((e.target as HTMLSelectElement).value))} aria-label={it ? '長さ' : '入力の長さ'}>
            {choices.map((c) => <option value={String(c.ticks)}>{c.label}</option>)}
            {!choices.some((c) => c.ticks === curLen) && <option value={String(curLen)}>{posLabel(curLen, m.ts)}</option>}
          </select>
        </label>
        <Btn icon="left" label="前のコード" onClick={() => stepSelection(-1)} />
        <Btn icon="right" label="次のコード" onClick={() => stepSelection(1)} />
        {sel.length > 0 ? (
          <>
            <Btn icon="trash" label="削除" kind="danger" onClick={deleteSelection} />
            <Btn icon="copy" label="複製" onClick={duplicateSelection} />
            <Btn icon="split" label="分割" onClick={splitSelection} disabled={sel.length !== 1} />
            <Btn label="左と入れ替え" onClick={() => moveSelection(-1)} disabled={sel.length !== 1} class="txt swap">⇠入替</Btn>
            <Btn label="右と入れ替え" onClick={() => moveSelection(1)} disabled={sel.length !== 1} class="txt swap">入替⇢</Btn>
            <Btn icon="loop" label="選択範囲をループ" onClick={loopSelection} />
          </>
        ) : <Btn label="直前のコードを削除" onClick={deleteSelection} class="txt">⌫</Btn>}
        {target && (!target.b ? <Btn class="txt" label="B案を作る" onClick={makeB}>＋B案</Btn> : (
          <>
            <Btn class="txt" label="B案を採用" onClick={() => removeB(true)}>Bを採用</Btn>
            <Btn class="txt" label="B案を消す" onClick={() => removeB(false)}>B案削除</Btn>
          </>
        ))}
      </div>
    );
  }
  return (
    <div class={`editbar ${sel.length ? 'has-sel' : ''}`}>
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
            <Btn label="左と入れ替え (Shift+←)" onClick={() => moveSelection(-1)} disabled={sel.length !== 1} class="txt swap">⇠入替</Btn>
            <Btn label="右と入れ替え (Shift+→)" onClick={() => moveSelection(1)} disabled={sel.length !== 1} class="txt swap">入替⇢</Btn>
            <Btn icon="loop" label="選択範囲をループ" onClick={loopSelection} />
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
      </div>
      <div class="eb-group len" role="group" aria-label="長さ">
        <span class="mini-label">{it ? '長さ' : '入力の長さ'}</span>
        {choices.map((c) => (
          <button type="button" class={`chip ${c.ticks === curLen ? 'on' : ''}`} onClick={() => setLen(c.ticks)}>{c.label}</button>
        ))}
      </div>
    </div>
  );
}

export function ChordPad() {
  const mode = inputMode.value;
  const m = memo.value;
  const k = m.key;
  const sev = settings.value.seventh;
  const [rootQ, setRootQ] = useState('M');
  void lastInserted.value;
  return (
    <div class="chordpad">
      <div class="pad-head">
        <Seg value={mode} onChange={(v) => (inputMode.value = v)} label="入力方法" options={[
          { id: 'diatonic', label: '度数' },
          { id: 'nondia', label: 'ノンダイア' },
          { id: 'roots', label: '全ルート' },
          { id: 'piano', label: <><Icon name="piano" size={15} /> ピアノ</> },
          { id: 'hum', label: <><Icon name="mic" size={15} /> 鼻歌</> },
        ]} />
        {(mode === 'diatonic' || mode === 'nondia') && (
          <button type="button" class={`chip seventh ${sev ? 'on' : ''}`} title="4和音（7th付き）で入力" onClick={() => updateSettings({ seventh: !sev })}>4和音</button>
        )}
      </div>
      {mode === 'diatonic' && (
        <div class="dia-grid">
          {[0, 1, 2, 3, 4, 5, 6].map((d) => <ChordButton chord={diatonicChord(k, d, sev)} big />)}
        </div>
      )}
      {mode === 'nondia' && (
        <div class="nondia">
          {(['secondary', 'borrowed', 'other'] as const).map((g) => {
            const list = nonDiatonicPalette(k, sev).filter((p) => p.group === g);
            if (!list.length) return null;
            return (
              <div class="nd-group">
                <span class="mini-label">{g === 'secondary' ? (k.mode === 'major' ? 'セカンダリードミナント' : 'ドミナント系') : g === 'borrowed' ? '借用和音' : 'その他・経過和音'}</span>
                <div class="nd-list">{list.map((p) => <ChordButton chord={p.chord} role={p.role} hint={p.hint} />)}</div>
              </div>
            );
          })}
        </div>
      )}
      {mode === 'roots' && (
        <div class="roots">
          <div class="rq">
            {ROOT_QS.map(([q, l]) => <button type="button" class={`chip ${rootQ === q ? 'on' : ''}`} onClick={() => setRootQ(q)}>{l}</button>)}
          </div>
          <div class="root-grid">
            {Array.from({ length: 12 }, (_, i) => {
              const offset = (i - k.tonic + 12) % 12;
              const c = chordOnOffset(k, offset, rootQ);
              return (
                <button type="button" class={`cbtn f-${chordFunction(c, k)} ${[1, 3, 6, 8, 10].includes(i) ? 'blackish' : ''}`} onClick={() => inputChord(c)} title={chordToneNames(c, k).join(' ')}>
                  <span class="r">{chordName(c, k)}</span>
                  <span class="n">{romanName(c, k, settings.value.romanStyle)}</span>
                </button>
              );
            })}
          </div>
        </div>
      )}
      {mode === 'piano' && <Piano />}
      {mode === 'hum' && <Hum />}
      {mode !== 'piano' && mode !== 'hum' && <Modifiers />}
      {mode !== 'hum' && <Suggestions />}
    </div>
  );
}

export { auditionChord };
