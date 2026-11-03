// Memo list: search, tag filter, favourites, play straight from the list, duplicate/share/export/delete.
import { useEffect, useMemo, useState } from 'preact/hooks';
import { Memo, displayTitle } from '../../store/schema';
import { deleteMemo, duplicateMemo, listMemos, restoreMemo, saveMemo } from '../../store/repo';
import { auditionMemo, confirmDialog, flushSave, memo, nowPlayingId, playing, toast, view } from '../state';
import { chordName } from '../../theory/chord';
import { keyName } from '../../theory/core';
import { sortItems } from '../../seq/timeline';
import { tsLabel, barTicks } from '../../seq/time';
import { audio } from '../../audio/host';
import { newMemo, openMemo } from '../actions';
import { exportJson, importJsonFile, shareMemo } from '../exporting';
import { Btn, Icon } from './common';

function preview(m: Memo): string {
  const cs = sortItems(m.chords).slice(0, 8).map((c) => chordName(c.chord, m.key));
  return cs.join(' → ') + (m.chords.length > 8 ? ' …' : '');
}

function when(t: number): string {
  const d = new Date(t);
  const now = new Date();
  const same = d.toDateString() === now.toDateString();
  const hm = `${String(d.getHours()).padStart(2, '0')}:${String(d.getMinutes()).padStart(2, '0')}`;
  return same ? `今日 ${hm}` : `${d.getFullYear() !== now.getFullYear() ? d.getFullYear() + '/' : ''}${d.getMonth() + 1}/${d.getDate()} ${hm}`;
}

export function ListScreen() {
  const [memos, setMemos] = useState<Memo[]>([]);
  const [loaded, setLoaded] = useState(false);
  const [q, setQ] = useState('');
  const [tag, setTag] = useState<string | null>(null);
  const [fav, setFav] = useState(false);
  const [sort, setSort] = useState<'updated' | 'created' | 'title'>('updated');
  const [menu, setMenu] = useState<string | null>(null);
  const reload = async () => { setMemos(await listMemos()); setLoaded(true); };
  useEffect(() => { reload(); }, []);
  useEffect(() => () => { if (auditionMemo.value) { audio.stop(); auditionMemo.value = null; nowPlayingId.value = null; } }, []);

  const tags = useMemo(() => [...new Set(memos.flatMap((m) => m.tags))].sort(), [memos]);
  const shown = useMemo(() => {
    const qq = q.trim().toLowerCase();
    let out = memos.filter((m) => (!fav || m.fav) && (!tag || m.tags.includes(tag)));
    if (qq) out = out.filter((m) => [displayTitle(m), m.note, m.tags.join(' '), preview(m), keyName(m.key)].join(' ').toLowerCase().includes(qq));
    if (sort === 'created') out = [...out].sort((a, b) => b.createdAt - a.createdAt);
    if (sort === 'title') out = [...out].sort((a, b) => displayTitle(a).localeCompare(displayTitle(b), 'ja'));
    return out;
  }, [memos, q, tag, fav, sort]);

  const playMemo = async (m: Memo) => {
    if (nowPlayingId.value === m.id && playing.value) {
      audio.stop();
      nowPlayingId.value = null;
      auditionMemo.value = null;
      return;
    }
    const ok = await audio.start();
    if (!ok) return;
    auditionMemo.value = m;
    nowPlayingId.value = m.id;
    // Let the sync effect push this memo, then start.
    queueMicrotask(() => audio.play(m.loop.on ? m.loop.start * barTicks(m.ts) : 0));
  };

  const del = async (m: Memo) => {
    setMenu(null);
    if (!(await confirmDialog('メモを削除しますか？', `「${displayTitle(m)}」を削除します。`, '削除する', true))) return;
    if (nowPlayingId.value === m.id) { audio.stop(); auditionMemo.value = null; nowPlayingId.value = null; }
    await deleteMemo(m.id);
    await reload();
    toast(`「${displayTitle(m)}」を削除したよ`, 'info', { label: '元に戻す', run: async () => { await restoreMemo(m.id); reload(); } });
  };

  const isCurrent = (m: Memo) => memo.value.id === m.id;

  return (
    <div class="list-screen">
      <div class="ls-head">
        <h2>メモ一覧 <small>{memos.length}件</small></h2>
        <div class="ls-actions">
          <Btn kind="primary" icon="plus" onClick={() => newMemo()}>新しいメモ</Btn>
          <Btn icon="upload" onClick={async () => { if (await importJsonFile()) reload(); }}>JSONを読み込む</Btn>
          <Btn icon="download" disabled={!memos.length} onClick={() => exportJson(memos)}>全部書き出す</Btn>
        </div>
      </div>
      <div class="ls-filter">
        <label class="search"><Icon name="search" size={18} /><input type="search" value={q} placeholder="タイトル・コード・タグで検索" onInput={(e) => setQ((e.target as HTMLInputElement).value)} aria-label="検索" /></label>
        <button type="button" class={`chip ${fav ? 'on' : ''}`} onClick={() => setFav(!fav)} aria-pressed={fav}>★ お気に入り</button>
        <select value={sort} onChange={(e) => setSort((e.target as HTMLSelectElement).value as typeof sort)} aria-label="並び順">
          <option value="updated">更新順</option><option value="created">作成順</option><option value="title">名前順</option>
        </select>
      </div>
      {tags.length > 0 && (
        <div class="ls-tags">
          <button type="button" class={`chip ${!tag ? 'on' : ''}`} onClick={() => setTag(null)}>すべて</button>
          {tags.map((t) => <button type="button" class={`chip ${tag === t ? 'on' : ''}`} onClick={() => setTag(tag === t ? null : t)}>#{t}</button>)}
        </div>
      )}
      <div class="ls-grid">
        {shown.map((m) => {
          const playingThis = nowPlayingId.value === m.id && playing.value;
          return (
            <article class={`memo-card ${isCurrent(m) ? 'current' : ''} ${playingThis ? 'playing' : ''}`} key={m.id}>
              <button type="button" class="mc-play" onClick={() => playMemo(m)} aria-label={playingThis ? '停止' : '再生'}>
                <Icon name={playingThis ? 'stop' : 'play'} size={24} />
              </button>
              <button type="button" class="mc-main" onClick={() => openMemo(m.id)}>
                <div class="mc-title">{m.fav && <span class="fav">★</span>}{displayTitle(m)}</div>
                <div class="mc-meta">{keyName(m.key)} ・ {Math.round(m.bpm)} BPM ・ {tsLabel(m.ts)} ・ {m.bars}小節 ・ {when(m.updatedAt)}</div>
                <div class="mc-chords">{preview(m) || '（コードなし）'}</div>
                {m.note && <div class="mc-note">{m.note}</div>}
                {m.tags.length > 0 && <div class="mc-tags">{m.tags.map((t) => <span>#{t}</span>)}</div>}
              </button>
              <div class="mc-side">
                <button type="button" class={`star ${m.fav ? 'on' : ''}`} aria-label="お気に入り" aria-pressed={m.fav} onClick={async () => { await saveMemo({ ...m, fav: !m.fav }); if (isCurrent(m)) memo.value = { ...memo.value, fav: !m.fav }; reload(); }}>★</button>
                <button type="button" class="more" aria-label="メニュー" onClick={() => setMenu(menu === m.id ? null : m.id)}><Icon name="more" /></button>
                {menu === m.id && (
                  <div class="mc-menu" onClick={() => setMenu(null)}>
                    <button type="button" onClick={() => openMemo(m.id)}>開く</button>
                    <button type="button" onClick={async () => { await flushSave(); const c = await duplicateMemo(m); await reload(); toast(`「${displayTitle(c)}」を作ったよ`, 'ok'); }}>複製</button>
                    <button type="button" onClick={() => shareMemo(m)}>URLで共有</button>
                    <button type="button" onClick={() => exportJson([m])}>JSONで書き出す</button>
                    <button type="button" class="danger" onClick={() => del(m)}>削除</button>
                  </div>
                )}
              </div>
            </article>
          );
        })}
      </div>
      {loaded && !shown.length && (
        <div class="ls-empty">
          {memos.length ? '条件に合うメモがないよ' : 'まだメモがないよ。ひらめいたら「新しいメモ」から！'}
        </div>
      )}
      <div class="ls-foot"><Btn class="txt" onClick={() => (view.value = 'editor')}>← エディタに戻る</Btn></div>
    </div>
  );
}
