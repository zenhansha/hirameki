// Memo details (title/tags/note), song settings, export/share, and app settings (labels, MIDI, keys).
import { useState } from 'preact/hooks';
import { memo, settings, updateSettings, confirmDialog, toast, view, side, saveState } from '../state';
import { setBars, setLoop, updateMemo, newMemo, openMemo, setTimeSig } from '../actions';
import { TIME_SIGS, tsLabel } from '../../seq/time';
import { deleteMemo, restoreMemo } from '../../store/repo';
import { exportJson, exportMidi, exportWav, shareMemo, wavBusy } from '../exporting';
import { shareUrl } from '../../io/share';
import { midiSupported, midiInputs, midiStatus, enableMidi, disableMidi, midiLearn, midiLast } from '../../io/webmidi';
import { COMMANDS, COMMAND_MAP, keysFor, setKeyLearn } from '../commands';
import { Btn, Card, Seg, Slider, Toggle } from './common';
import { flushSave, persisted } from '../state';

function Tags() {
  const m = memo.value;
  const [v, setV] = useState('');
  const add = () => {
    const t = v.trim().replace(/^#/, '');
    if (!t) return;
    if (!m.tags.includes(t)) updateMemo({ tags: [...m.tags, t].slice(0, 12) });
    setV('');
  };
  return (
    <div class="tags-edit">
      {m.tags.map((t) => <span class="tag">#{t}<button type="button" aria-label={`${t}を外す`} onClick={() => updateMemo({ tags: m.tags.filter((x) => x !== t) })}>×</button></span>)}
      <input value={v} placeholder="タグを追加（Enter）" onInput={(e) => setV((e.target as HTMLInputElement).value)} onKeyDown={(e) => { if (e.key === 'Enter') { e.preventDefault(); add(); } }} onBlur={add} aria-label="タグを追加" />
    </div>
  );
}

function ExportCard() {
  const m = memo.value;
  const [withPat, setWithPat] = useState(true);
  const [loops, setLoops] = useState(2);
  const [busy, setBusy] = useState(false);
  const [url, setUrl] = useState('');
  return (
    <Card title="書き出し・共有" id="export">
      <div class="row wrap">
        <Btn kind="primary" icon="share" onClick={async () => { const r = await shareMemo(m); if (r === 'shown') setUrl(shareUrl(m)); }}>URLで共有</Btn>
        <Btn icon="download" onClick={() => exportJson([m])}>JSON</Btn>
      </div>
      {url && <textarea class="url-box" readOnly value={url} onFocus={(e) => (e.target as HTMLTextAreaElement).select()} />}
      <div class="row wrap">
        <Seg small value={loops} onChange={setLoops} options={[{ id: 1, label: '1回' }, { id: 2, label: '2回' }, { id: 4, label: '4回' }]} label="ループ回数" />
        <span class="hint">{m.loop.on ? `ループ範囲（${m.loop.start + 1}〜${m.loop.end}小節）をくり返して書き出し` : '曲全体を書き出し'}</span>
      </div>
      <div class="row wrap">
        <Btn icon="download" disabled={busy || wavBusy.value} onClick={() => { setBusy(true); exportWav(m, loops, side.value, () => setBusy(false)); }}>{busy ? '書き出し中…' : 'WAV（エフェクト込み）'}</Btn>
        <Btn icon="download" onClick={() => exportMidi(m, withPat, m.loop.on ? loops : 0, side.value)}>MIDI</Btn>
        <Toggle small value={withPat} onChange={setWithPat} label="MIDIにパターンを反映（オフ＝コードを伸ばしたまま）" />
      </div>
    </Card>
  );
}

function MidiCard() {
  if (!midiSupported) return null;
  const st = midiStatus.value;
  const s = settings.value;
  const [learnOpen, setLearnOpen] = useState(false);
  return (
    <Card title="MIDI入力" right={<Toggle small value={st === 'on'} onChange={(v) => (v ? enableMidi() : disableMidi())} label={st === 'on' ? 'ON' : 'OFF'} />}>
      {st === 'on' ? (
        <>
          <div class="hint">接続中：{midiInputs.value.length ? midiInputs.value.join('、') : '（デバイスなし。つなぐと自動で認識するよ）'}</div>
          <Toggle small value={s.midiInputChords} onChange={(v) => updateSettings({ midiInputChords: v })} label="弾いた和音をコードとして入力" />
          <Toggle small value={s.midiThru} onChange={(v) => updateSettings({ midiThru: v })} label="弾いた音をシンセで鳴らす" />
          <Btn class="txt" onClick={() => setLearnOpen(!learnOpen)}>MIDIラーン（ボタンやパッドに機能を割り当て）{learnOpen ? '▴' : '▾'}</Btn>
          {learnOpen && (
            <div class="learn">
              <div class="hint">「割り当て」を押してから、MIDI機器のボタン／パッド／ノブを動かすとその操作が割り当たるよ。最後に受信：{midiLast.value || '—'}</div>
              {COMMANDS.filter((c) => c.group !== 'メモ').map((c) => {
                const bound = Object.entries(s.midiMap).filter(([, id]) => id === c.id).map(([k]) => k);
                return (
                  <div class="learn-row">
                    <span>{c.label}</span>
                    <code>{bound.join(', ') || '—'}</code>
                    <Btn class={`txt ${midiLearn.value === c.id ? 'blink' : ''}`} onClick={() => (midiLearn.value = midiLearn.value === c.id ? null : c.id)}>{midiLearn.value === c.id ? '待機中…' : '割り当て'}</Btn>
                    {bound.length > 0 && <Btn class="txt" onClick={() => updateSettings({ midiMap: Object.fromEntries(Object.entries(s.midiMap).filter(([, id]) => id !== c.id)) })}>解除</Btn>}
                  </div>
                );
              })}
            </div>
          )}
        </>
      ) : <div class="hint">{st === 'denied' ? 'MIDIが許可されていません。ブラウザのサイト設定から許可してね' : 'MIDIキーボードや自作コントローラーで、コード入力や再生操作ができるよ'}</div>}
    </Card>
  );
}

function KeysCard() {
  const s = settings.value;
  const [open, setOpen] = useState(false);
  const [learning, setLearning] = useState<string | null>(null);
  return (
    <Card title="キーボードショートカット" right={<Btn class="txt" onClick={() => setOpen(!open)}>{open ? '閉じる' : '一覧・カスタマイズ'}</Btn>}>
      <div class="hint">Space 再生／1〜7 度数コード／Q 7th／Ctrl+Z 元に戻す など。左手デバイスのキー（F13など）も割り当てられるよ</div>
      {open && (
        <div class="learn">
          {COMMANDS.map((c) => (
            <div class="learn-row">
              <span>{c.label}</span>
              <code>{keysFor(c.id).join(' / ') || '—'}</code>
              <Btn class={`txt ${learning === c.id ? 'blink' : ''}`} onClick={() => {
                if (learning) { setKeyLearn(null); setLearning(null); return; }
                setLearning(c.id);
                setKeyLearn((combo) => {
                  setLearning(null);
                  updateSettings({ keyMap: { ...settings.value.keyMap, [combo]: c.id } });
                  toast(`${combo} →「${COMMAND_MAP[c.id].label}」`, 'ok');
                });
              }}>{learning === c.id ? 'キーを押して…' : '追加'}</Btn>
            </div>
          ))}
          {Object.keys(s.keyMap).length > 0 && <Btn class="txt" onClick={() => updateSettings({ keyMap: {} })}>カスタム割り当てをリセット</Btn>}
        </div>
      )}
    </Card>
  );
}

export function MemoPanel() {
  const m = memo.value;
  const s = settings.value;
  return (
    <div class="memopanel">
      <Card title="このメモ" right={<button type="button" class={`star ${m.fav ? 'on' : ''}`} aria-pressed={m.fav} aria-label="お気に入り" onClick={() => updateMemo({ fav: !m.fav })}>★</button>}>
        <label class="field"><span>タイトル</span>
          <input value={m.title} placeholder="無題のメモ" maxLength={80} onInput={(e) => updateMemo({ title: (e.target as HTMLInputElement).value }, 'title')} />
        </label>
        <label class="field"><span>タグ</span><Tags /></label>
        <label class="field"><span>ひとことメモ</span>
          <textarea value={m.note} rows={3} maxLength={600} placeholder="サビ用、Bメロで使いたい、など" onInput={(e) => updateMemo({ note: (e.target as HTMLTextAreaElement).value }, 'note')} />
        </label>
        <div class="row wrap">
          <label class="field inline"><span>拍子</span>
            <select value={tsLabel(m.ts)} onChange={(e) => { const [n, d] = (e.target as HTMLSelectElement).value.split('/').map(Number); setTimeSig({ num: n, den: d }); }} aria-label="拍子">
              {TIME_SIGS.map((t) => <option value={tsLabel(t)}>{tsLabel(t)}</option>)}
            </select>
          </label>
          <label class="field inline"><span>小節数</span><input type="number" min={1} max={256} value={m.bars} onChange={(e) => setBars(Number((e.target as HTMLInputElement).value))} /></label>
          <Toggle small value={m.loop.on} onChange={(v) => setLoop(m.loop.start, m.loop.end, v)} label="ループ" />
          <label class="field inline"><span>ループ</span>
            <input type="number" min={1} max={m.bars} value={m.loop.start + 1} onChange={(e) => setLoop(Number((e.target as HTMLInputElement).value) - 1, m.loop.end, m.loop.on)} aria-label="ループ開始小節" />
            〜
            <input type="number" min={1} max={m.bars} value={m.loop.end} onChange={(e) => setLoop(m.loop.start, Number((e.target as HTMLInputElement).value), m.loop.on)} aria-label="ループ終了小節" />
            小節
          </label>
        </div>
        <div class="row wrap">
          <Slider label="コード音量" min={0} max={1} value={m.chordVol} onChange={(v) => updateMemo({ chordVol: v }, 'cvol')} format={(v) => Math.round(v * 100) + '%'} />
          {m.melody.length > 0 && <Toggle small value={m.melodyOn} onChange={(v) => updateMemo({ melodyOn: v })} label={`メロディ（${m.melody.length}音）を鳴らす`} />}
          {m.melody.length > 0 && <Btn class="txt" onClick={() => updateMemo({ melody: [] })}>メロディを消す</Btn>}
        </div>
        <div class="hint save-hint">{saveState.value === 'saved' ? (persisted.value ? '✓ 自動保存済み' : '入力すると自動で保存されるよ') : saveState.value === 'error' ? '⚠ 保存エラー' : '保存中…'}</div>
      </Card>
      <ExportCard />
      <Card title="表示・動作">
        <div class="row wrap">
          <Seg value={s.label} onChange={(v) => updateSettings({ label: v })} options={[{ id: 'roman', label: '度数で表示' }, { id: 'name', label: 'コード名で表示' }]} label="表示" />
          <Seg small value={s.romanStyle} onChange={(v) => updateSettings({ romanStyle: v })} options={[{ id: 'classic', label: 'ii7 式' }, { id: 'jp', label: 'IIm7 式' }]} label="度数の書き方" />
        </div>
        <div class="row wrap">
          <Toggle small value={s.audition} onChange={(v) => updateSettings({ audition: v })} label="入力したコードをすぐ鳴らす" />
        </div>
        <Slider wide label="マスター音量" min={0} max={1} value={s.master} onChange={(v) => updateSettings({ master: v })} format={(v) => Math.round(v * 100) + '%'} />
      </Card>
      <MidiCard />
      <KeysCard />
      <Card title="メモの管理">
        <div class="row wrap">
          <Btn icon="plus" onClick={() => newMemo()}>新しいメモ</Btn>
          <Btn icon="list" onClick={async () => { await flushSave(); view.value = 'list'; }}>メモ一覧</Btn>
          <Btn kind="danger" icon="trash" disabled={!persisted.value} onClick={async () => {
            if (!(await confirmDialog('このメモを削除しますか？', `「${m.title || '無題のメモ'}」を削除します。一覧の「元に戻す」で復元できるのは直後だけです。`, '削除する', true))) return;
            saveState.value = 'saved';
            await deleteMemo(m.id);
            await newMemo();
            toast('メモを削除したよ', 'info', { label: '元に戻す', run: async () => { await restoreMemo(m.id); openMemo(m.id); } });
          }}>このメモを削除</Btn>
        </div>
      </Card>
      <div class="about">HIRAMEKI 即興コードメモ v1.0 ・ データはこの端末のブラウザ内に保存されます（URL共有・JSONで持ち運び）</div>
    </div>
  );
}
