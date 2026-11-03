// Top bar (logo, title, memo list/new/share) and the transport (play, tempo, key, meter, A/B …).
import { useEffect, useRef, useState } from 'preact/hooks';
import { openTemplates } from './TemplateGallery';
import { memo, playing, side, hasB, saveState, view, flushSave, audioState, persisted, settings, updateSettings, narrow } from '../state';
import { Btn, Icon } from './common';
import { play, setBpm, setKey, setTimeSig, stop, tapTempo, toStart, transpose, updateMemo, newMemo } from '../actions';
import { Key, allKeys, keyName, keyNameJa } from '../../theory/core';
import { TIME_SIGS, tsLabel } from '../../seq/time';
import { displayTitle } from '../../store/schema';
import { shareMemo } from '../exporting';
import { audio } from '../../audio/host';

/** ＋: a blank memo, or start from a template. */
function NewMenu() {
  const [open, setOpen] = useState(false);
  const ref = useRef<HTMLDivElement>(null);
  useEffect(() => {
    if (!open) return;
    const close = (e: PointerEvent) => { if (ref.current && !ref.current.contains(e.target as Node)) setOpen(false); };
    document.addEventListener('pointerdown', close, true);
    return () => document.removeEventListener('pointerdown', close, true);
  }, [open]);
  return (
    <div class="new-menu" ref={ref}>
      <Btn icon="plus" label="新しいメモ" active={open} onClick={() => setOpen(!open)} aria-haspopup="menu" aria-expanded={open} />
      {open && (
        <div class="menu down" role="menu">
          <button type="button" role="menuitem" onClick={() => { setOpen(false); newMemo(); }}><span class="ml">空のメモ</span><kbd>Alt+N</kbd></button>
          <button type="button" role="menuitem" onClick={() => { setOpen(false); openTemplates(); }}><span class="ml">テンプレートから作成…</span><kbd>Alt+T</kbd></button>
        </div>
      )}
    </div>
  );
}

export function TopBar() {
  const m = memo.value;
  const [editing, setEditing] = useState(false);
  const ss = saveState.value;
  return (
    <header class="topbar">
      <button type="button" class="logo" onClick={async () => { await flushSave(); view.value = view.value === 'list' ? 'editor' : 'list'; }} aria-label="メモ一覧">
        <span class="spark">✦</span><span class="lt">HIRAMEKI</span>
      </button>
      {view.value === 'editor' ? (
        editing ? (
          <input class="title-input" autoFocus value={m.title} placeholder="タイトル" maxLength={80}
            onInput={(e) => updateMemo({ title: (e.target as HTMLInputElement).value }, 'title')}
            onBlur={() => setEditing(false)} onKeyDown={(e) => { if (e.key === 'Enter' || e.key === 'Escape') setEditing(false); }} aria-label="タイトル" />
        ) : (
          <button type="button" class="title" onClick={() => setEditing(true)} title="タップでタイトルを編集">
            <span>{m.title || (persisted.value ? displayTitle(m) : '新しいメモ')}</span><Icon name="edit" size={14} />
          </button>
        )
      ) : <div class="title static">メモ一覧</div>}
      <span class={`save ${ss}`} title={ss === 'saved' ? '保存済み' : ss === 'error' ? '保存エラー' : '保存中'}>{ss === 'saved' ? (persisted.value ? '✓' : '') : ss === 'error' ? '⚠' : '●'}</span>
      <div class="tb-right">
        <Btn icon="list" label="メモ一覧" class={view.value === 'list' ? 'on' : ''} onClick={async () => { await flushSave(); view.value = view.value === 'list' ? 'editor' : 'list'; }} />
        <NewMenu />
        {view.value === 'editor' && <Btn icon="share" label="URLで共有" onClick={() => shareMemo(memo.value)} />}
      </div>
    </header>
  );
}

function KeyPicker({ onClose }: { onClose: () => void }) {
  const m = memo.value;
  const [withChords, setWithChords] = useState(true);
  const pick = (k: Key) => { setKey(k, withChords); };
  const keys = allKeys();
  return (
    <div class="popover keypick" role="dialog" aria-label="キー">
      <div class="kp-head">
        <b>キー：{keyNameJa(m.key)}</b>
        <button type="button" class="x" onClick={onClose} aria-label="閉じる">×</button>
      </div>
      <div class="kp-trans">
        <Btn onClick={() => transpose(-1)} class="txt">♭ 半音下げる</Btn>
        <Btn onClick={() => transpose(1)} class="txt">♯ 半音上げる</Btn>
      </div>
      <div class="kp-grid">
        {keys.filter((k) => k.mode === 'major').map((k) => <button type="button" class={`chip ${k.tonic === m.key.tonic && m.key.mode === 'major' ? 'on' : ''}`} onClick={() => pick(k)}>{keyName(k)}</button>)}
      </div>
      <div class="kp-grid minor">
        {keys.filter((k) => k.mode === 'minor').map((k) => <button type="button" class={`chip ${k.tonic === m.key.tonic && m.key.mode === 'minor' ? 'on' : ''}`} onClick={() => pick(k)}>{keyName(k)}</button>)}
      </div>
      <label class="kp-opt"><input type="checkbox" checked={withChords} onChange={(e) => setWithChords((e.target as HTMLInputElement).checked)} /> コードも一緒に移調する（オフ＝鳴っている音はそのまま、度数だけ読み替え）</label>
    </div>
  );
}

function BpmControl() {
  const m = memo.value;
  const drag = useRef<{ y: number; v: number; moved: boolean } | null>(null);
  const [edit, setEdit] = useState(false);
  const [tapN, setTapN] = useState(0);
  return (
    <div class="bpm">
      {edit ? (
        <input type="number" class="bpm-in" autoFocus min={30} max={300} defaultValue={String(Math.round(m.bpm))}
          onBlur={(e) => { setBpm(Number((e.target as HTMLInputElement).value) || m.bpm); setEdit(false); }}
          onKeyDown={(e) => { if (e.key === 'Enter') (e.target as HTMLInputElement).blur(); }} aria-label="テンポ" />
      ) : (
        <button type="button" class="bpm-val" title="上下ドラッグで変更・タップで入力"
          onPointerDown={(e) => { (e.currentTarget as HTMLElement).setPointerCapture(e.pointerId); drag.current = { y: e.clientY, v: m.bpm, moved: false }; }}
          onPointerMove={(e) => { const d = drag.current; if (!d) return; const dy = d.y - e.clientY; if (Math.abs(dy) > 3) d.moved = true; if (d.moved) setBpm(d.v + Math.round(dy / 3)); }}
          onPointerUp={() => { const d = drag.current; drag.current = null; if (d && !d.moved) setEdit(true); }}>
          <b>{Math.round(m.bpm)}</b><small>BPM</small>
        </button>
      )}
      <div class="bpm-steps">
        <button type="button" onClick={() => setBpm(m.bpm + 1)} aria-label="テンポを上げる">▲</button>
        <button type="button" onClick={() => setBpm(m.bpm - 1)} aria-label="テンポを下げる">▼</button>
      </div>
      <button type="button" class={`tap ${tapN ? 'pulse' : ''}`} onClick={() => { setTapN(tapTempo()); setTimeout(() => setTapN(0), 150); }} title="リズムに合わせて何回か叩く">TAP</button>
    </div>
  );
}

export function Transport() {
  const m = memo.value;
  const isPlaying = playing.value;
  const [keyOpen, setKeyOpen] = useState(false);
  const st = audioState.value;
  return (
    <div class="transport">
      <div class="tp-main">
        <Btn icon="start" label="先頭に戻る (Home)" onClick={toStart} />
        <button type="button" class={`playbtn ${isPlaying ? 'on' : ''}`} onClick={() => (isPlaying ? stop() : play())} aria-label={isPlaying ? '停止 (Space)' : '再生 (Space)'} data-testid="play">
          <Icon name={isPlaying ? 'stop' : 'play'} size={28} />
        </button>
        <Btn icon="loop" label="ループ (L)" active={m.loop.on} onClick={() => updateMemo({ loop: { ...m.loop, on: !m.loop.on } })} />
        <Btn icon="metro" label="メトロノーム (M)" active={m.metronome} onClick={() => updateMemo({ metronome: !m.metronome })} />
      </div>
      <BpmControl />
      <div class="tp-key">
        <button type="button" class="keybtn" onClick={() => setKeyOpen(!keyOpen)} aria-expanded={keyOpen} aria-label="キー">
          <small>キー</small><b>{keyName(m.key)}</b>
        </button>
        <div class="bpm-steps key-steps">
          <button type="button" onClick={() => transpose(1)} aria-label="半音上に移調" title="キー全体を半音上へ（]）">♯</button>
          <button type="button" onClick={() => transpose(-1)} aria-label="半音下に移調" title="キー全体を半音下へ（[）">♭</button>
        </div>
        {keyOpen && <KeyPicker onClose={() => setKeyOpen(false)} />}
      </div>
      <label class={`tsel ${narrow.value ? 'hide' : ''}`}>
        <small>拍子</small>
        <select value={tsLabel(m.ts)} onChange={(e) => { const [n, d] = (e.target as HTMLSelectElement).value.split('/').map(Number); setTimeSig({ num: n, den: d }); }} aria-label="拍子">
          {TIME_SIGS.map((t) => <option value={tsLabel(t)}>{tsLabel(t)}</option>)}
        </select>
      </label>
      <div class={`ab-switch ${hasB.value ? '' : 'disabled'} ${!hasB.value && narrow.value ? 'hide' : ''}`} title={hasB.value ? 'A案とB案を切り替えて聴き比べ (B)' : 'コードを選んで「＋B案」を作ると聴き比べられるよ'}>
        <button type="button" class={side.value === 'A' ? 'on' : ''} onClick={() => (side.value = 'A')} disabled={!hasB.value}>A</button>
        <button type="button" class={side.value === 'B' ? 'on' : ''} onClick={() => (side.value = 'B')} disabled={!hasB.value}>B</button>
      </div>
      <label class="master" title="マスター音量">
        <span aria-hidden="true">🔊</span>
        <input type="range" min={0} max={1} step={0.01} value={settings.value.master} onInput={(e) => updateSettings({ master: Number((e.target as HTMLInputElement).value) })} aria-label="マスター音量" />
      </label>
      {st === 'error' && <span class="audio-err" title={audio.errorCode}>⚠ 音が出せません</span>}
      {(st === 'idle' || (st === 'ready' && audio.ctx?.state !== 'running')) && <span class="audio-hint">タップで音が出るよ</span>}
    </div>
  );
}
