// The chord timeline: bars in rows, chord blocks, caret, playhead, loop range and detected progressions.
import { useEffect, useMemo, useRef, useState } from 'preact/hooks';
import { useComputed } from '@preact/signals';
import { caret, memo, selection, settings, side, playing, lastInserted, updateSettings } from '../state';
import { audio } from '../../audio/host';
import { chordFunction, chordName, romanName } from '../../theory/chord';
import { detectProgressions, progressionRomanText } from '../../theory/progressions';
import { sideOf, sortItems } from '../../seq/timeline';
import { barTicks, beatTicks, beatsPerBar } from '../../seq/time';
import { patternName } from '../../presets/patterns';
import { auditionChord, insertBarAt, deleteBarAt, seekBar, selectChord, setBars, setCaret, setLoop, snapTick, swapItems, cue, selectBar } from '../actions';
import { compileMemo } from '../../seq/compile';
import { Icon } from './common';

function useWidth(ref: { current: HTMLElement | null }) {
  const [w, setW] = useState(800);
  useEffect(() => {
    const el = ref.current;
    if (!el) return;
    const ro = new ResizeObserver((es) => setW(es[0].contentRect.width));
    ro.observe(el);
    setW(el.getBoundingClientRect().width);
    return () => ro.disconnect();
  }, []);
  return w;
}

function Playhead({ rowStart, rowTicks }: { rowStart: number; rowTicks: number }) {
  const ref = useRef<HTMLDivElement>(null);
  useEffect(() => {
    let raf = 0;
    const loop = () => {
      const el = ref.current;
      if (el) {
        const t = audio.playhead();
        const on = audio.playing && t >= rowStart && t < rowStart + rowTicks;
        el.style.display = on ? 'block' : 'none';
        if (on) el.style.left = (((t - rowStart) / rowTicks) * 100).toFixed(3) + '%';
      }
      raf = requestAnimationFrame(loop);
    };
    raf = requestAnimationFrame(loop);
    return () => cancelAnimationFrame(raf);
  }, [rowStart, rowTicks]);
  return <div ref={ref} class="playhead" style={{ display: 'none' }} />;
}

/** Highlights the chord under the playhead (cheap DOM class toggling). */
function useNowPlaying(container: { current: HTMLElement | null }) {
  useEffect(() => {
    let raf = 0;
    let last: Element | null = null;
    const loop = () => {
      const el = container.current;
      if (el) {
        let cur: Element | null = null;
        if (audio.playing) {
          const t = audio.playhead();
          for (const c of el.querySelectorAll<HTMLElement>('[data-t]')) {
            const s = Number(c.dataset.t), l = Number(c.dataset.len);
            if (t >= s && t < s + l) { cur = c; break; }
          }
        }
        if (cur !== last) {
          last?.classList.remove('now');
          cur?.classList.add('now');
          last = cur;
        }
      }
      raf = requestAnimationFrame(loop);
    };
    raf = requestAnimationFrame(loop);
    return () => cancelAnimationFrame(raf);
  }, []);
}

export function Timeline() {
  const wrap = useRef<HTMLDivElement>(null);
  const width = useWidth(wrap);
  const m = memo.value;
  const key = m.key;
  const bar = barTicks(m.ts);
  const beat = beatTicks(m.ts);
  const nBeats = beatsPerBar(m.ts);
  const items = useMemo(() => sortItems(m.chords), [m.chords]);
  // Bars per row: 'auto' keeps the shortest chord at least ~40px wide so it stays tappable.
  const zoom = settings.value.zoom;
  const bpr = useMemo(() => {
    if (zoom !== 'auto') return zoom;
    const shortest = items.reduce((mn, i) => Math.min(mn, i.len), bar);
    const fit = Math.floor((width * shortest) / (bar * 40));
    const cap = width < 520 ? 4 : 8;
    const pick = [8, 4, 2, 1].find((n) => n <= Math.min(cap, Math.max(1, fit))) ?? 1;
    return m.bars <= 4 && pick > 4 ? 4 : pick;
  }, [zoom, items, width, bar, m.bars]);
  const rows = Math.ceil(m.bars / bpr);
  const rowTicks = bpr * bar;
  const sel = selection.value;
  const label = settings.value.label;
  const style = settings.value.romanStyle;
  const sd = side.value;
  const ties = useMemo(() => compileMemo(m, { side: sd }).ties, [m, sd]);
  const isPlaying = playing.value;
  useNowPlaying(wrap);

  const progressions = useComputed(() => {
    const mm = memo.value;
    const its = sortItems(mm.chords);
    const cs = its.map((i) => sideOf(i, side.value).chord);
    const cyclic = mm.loop.on && mm.loop.start === 0 && mm.loop.end >= mm.bars;
    return detectProgressions(cs, mm.key, { cyclic }).map((p) => ({
      ...p,
      t0: its[p.start]?.t ?? 0,
      t1: p.end > 0 ? (its[p.end - 1]?.t ?? 0) + (its[p.end - 1]?.len ?? 0) : 0,
    }));
  }).value;
  const [hot, setHot] = useState<number | null>(null);

  // Drag state for swapping chords.
  const dragRef = useRef<{ id: string; x: number; y: number; on: boolean; el: HTMLElement } | null>(null);

  const onChordDown = (e: PointerEvent, id: string) => {
    e.stopPropagation();
    dragRef.current = { id, x: e.clientX, y: e.clientY, on: false, el: e.currentTarget as HTMLElement };
    (e.currentTarget as HTMLElement).setPointerCapture(e.pointerId);
  };
  const onChordMove = (e: PointerEvent) => {
    const d = dragRef.current;
    if (!d) return;
    const dx = e.clientX - d.x, dy = e.clientY - d.y;
    if (!d.on && Math.abs(dx) > 12 && Math.abs(dx) > Math.abs(dy)) {
      d.on = true;
      d.el.classList.add('dragging');
    }
    if (d.on) {
      d.el.style.transform = `translate(${dx}px, ${dy}px)`;
      const over = document.elementsFromPoint(e.clientX, e.clientY).find((x) => (x as HTMLElement).dataset?.chordId && (x as HTMLElement).dataset.chordId !== d.id) as HTMLElement | undefined;
      wrap.current?.querySelectorAll('.drop').forEach((x) => x.classList.remove('drop'));
      over?.classList.add('drop');
    }
  };
  const onChordUp = (e: PointerEvent, id: string) => {
    const d = dragRef.current;
    dragRef.current = null;
    if (!d) return;
    d.el.classList.remove('dragging');
    d.el.style.transform = '';
    wrap.current?.querySelectorAll('.drop').forEach((x) => x.classList.remove('drop'));
    if (d.on) {
      const over = document.elementsFromPoint(e.clientX, e.clientY).find((x) => (x as HTMLElement).dataset?.chordId && (x as HTMLElement).dataset.chordId !== d.id) as HTMLElement | undefined;
      if (over) swapItems(d.id, over.dataset.chordId!);
      return;
    }
    const it = items.find((x) => x.id === id);
    if (!it) return;
    if (sel.length === 1 && sel[0] === id && !e.shiftKey) {
      // Second tap on a selected chord: deselect and put the caret after it.
      setCaret(it.t + it.len);
      return;
    }
    selectChord(id, e.shiftKey);
    auditionChord(sideOf(it, side.value).chord, it.t);
  };

  const onChordCancel = () => {
    const d = dragRef.current;
    dragRef.current = null;
    if (!d) return;
    d.el.classList.remove('dragging');
    d.el.style.transform = '';
    wrap.current?.querySelectorAll('.drop').forEach((x) => x.classList.remove('drop'));
  };

  const onLaneClick = (e: MouseEvent, rowStart: number) => {
    const el = e.currentTarget as HTMLElement;
    const r = el.getBoundingClientRect();
    const t = rowStart + ((e.clientX - r.left) / r.width) * rowTicks;
    setCaret(snapTick(Math.max(0, Math.min(m.bars * bar - 1, t))));
  };

  // Ruler: tap = cue/seek, drag = set loop range.
  const rulerRef = useRef<{ startBar: number; cur: number; moved: boolean } | null>(null);
  const [loopPreview, setLoopPreview] = useState<[number, number] | null>(null);
  const barFromEvent = (e: PointerEvent) => {
    const el = (e.target as HTMLElement).closest('[data-bar]') as HTMLElement | null;
    if (el) return Number(el.dataset.bar);
    const hit = document.elementsFromPoint(e.clientX, e.clientY).find((x) => (x as HTMLElement).dataset?.bar) as HTMLElement | undefined;
    return hit ? Number(hit.dataset.bar) : null;
  };
  const onRulerDown = (e: PointerEvent) => {
    const b = barFromEvent(e);
    if (b === null) return;
    (e.currentTarget as HTMLElement).setPointerCapture(e.pointerId);
    rulerRef.current = { startBar: b, cur: b, moved: false };
  };
  const onRulerMove = (e: PointerEvent) => {
    const r = rulerRef.current;
    if (!r) return;
    const hit = document.elementsFromPoint(e.clientX, e.clientY).find((x) => (x as HTMLElement).dataset?.bar) as HTMLElement | undefined;
    if (!hit) return;
    const b = Number(hit.dataset.bar);
    if (b !== r.cur) { r.cur = b; r.moved = true; }
    if (r.moved) setLoopPreview([Math.min(r.startBar, b), Math.max(r.startBar, b) + 1]);
  };
  const lastRulerTap = useRef<{ bar: number; at: number }>({ bar: -1, at: 0 });
  const onRulerUp = () => {
    const r = rulerRef.current;
    rulerRef.current = null;
    setLoopPreview(null);
    if (!r) return;
    if (r.moved) setLoop(Math.min(r.startBar, r.cur), Math.max(r.startBar, r.cur) + 1, true);
    else {
      // Double-tap a bar number = select every chord in that bar.
      const now = Date.now();
      if (lastRulerTap.current.bar === r.startBar && now - lastRulerTap.current.at < 380) selectBar(r.startBar);
      else seekBar(r.startBar);
      lastRulerTap.current = { bar: r.startBar, at: now };
    }
  };

  const loop = loopPreview ? { on: true, start: loopPreview[0], end: loopPreview[1] } : m.loop;
  const cueT = cue.value;
  const showCaret = !sel.length;
  const hotP = hot !== null ? progressions[hot] : null;

  return (
    <div class="timeline" ref={wrap}>
      {Array.from({ length: rows }, (_, r) => {
        const rowStart = r * rowTicks;
        const barsHere = Math.min(bpr, m.bars - r * bpr);
        const pct = (t: number) => ((t - rowStart) / rowTicks) * 100;
        const segs = items.filter((it) => it.t < rowStart + rowTicks && it.t + it.len > rowStart);
        return (
          <div class="tl-row" key={r}>
            <div class="ruler" onPointerDown={onRulerDown as never} onPointerMove={onRulerMove as never} onPointerUp={onRulerUp} onPointerCancel={onRulerUp}>
              {Array.from({ length: bpr }, (_, i) => {
                const b = r * bpr + i;
                const exists = b < m.bars;
                const inLoop = loop.on && b >= loop.start && b < loop.end;
                return (
                  <div class={`rb ${exists ? '' : 'ghost'} ${inLoop ? 'inloop' : ''} ${inLoop && b === loop.start ? 'ls' : ''} ${inLoop && b === loop.end - 1 ? 'le' : ''}`} data-bar={exists ? b : undefined}>
                    {exists && <span class="bn">{b + 1}</span>}
                    {exists && cueT !== null && Math.floor(cueT / bar) === b && !isPlaying && <span class="cue">▶</span>}
                  </div>
                );
              })}
            </div>
            <div class="lane" onClick={(e) => onLaneClick(e as unknown as MouseEvent, rowStart)}>
              {Array.from({ length: bpr }, (_, i) => (
                <div class={`bar ${r * bpr + i < m.bars ? '' : 'ghost'}`} style={{ width: 100 / bpr + '%' }}>
                  {Array.from({ length: nBeats - 1 }, (_, k) => <i class="beat" style={{ left: ((k + 1) / nBeats) * 100 + '%' }} />)}
                </div>
              ))}
              {hotP && hotP.t1 > rowStart && hotP.t0 < rowStart + rowTicks && (
                <div class="prog-band" style={{ left: Math.max(0, pct(hotP.t0)) + '%', width: Math.min(100, pct(hotP.t1)) - Math.max(0, pct(hotP.t0)) + '%' }} />
              )}
              {segs.map((it) => {
                const s = sideOf(it, sd);
                const c = s.chord;
                const s0 = Math.max(it.t, rowStart), s1 = Math.min(it.t + it.len, rowStart + rowTicks);
                const cont = it.t < rowStart;
                const fn = chordFunction(c, key);
                const nm = chordName(c, key);
                const rn = romanName(c, key, style);
                const main = label === 'roman' ? rn : nm;
                const sub = label === 'roman' ? nm : rn;
                const narrowSeg = ((s1 - s0) / rowTicks) * width < 54;
                return (
                  <div
                    class={`chord f-${fn} ${sel.includes(it.id) ? 'sel' : ''} ${cont ? 'cont' : ''} ${it.t + it.len > rowStart + rowTicks ? 'more' : ''} ${lastInserted.value === it.id && !sel.length ? 'last' : ''} ${narrowSeg ? 'tiny' : ''}`}
                    style={{ left: pct(s0) + '%', width: `calc(${pct(s1) - pct(s0)}% - 3px)` }}
                    data-chord-id={it.id} data-t={it.t} data-len={it.len}
                    onPointerDown={(e) => onChordDown(e as unknown as PointerEvent, it.id)}
                    onPointerMove={onChordMove as never}
                    onPointerUp={(e) => onChordUp(e as unknown as PointerEvent, it.id)}
                    onPointerCancel={onChordCancel}
                    onClick={(e) => e.stopPropagation()}
                    role="button" tabIndex={-1} aria-label={`${nm}（${rn}）`} aria-pressed={sel.includes(it.id)}
                  >
                    {!cont ? (
                      <>
                        <span class="c-main">{main}</span>
                        {!narrowSeg && <span class="c-sub">{sub}</span>}
                      </>
                    ) : <span class="c-cont">⋯</span>}
                    {it.b && <span class={`ab ${sd === 'B' ? 'b' : ''}`}>{sd === 'B' ? 'B' : 'A/B'}</span>}
                    {ties.has(it.id) && it.t + it.len <= rowStart + rowTicks && <span class="tie" title="次の同じコードとタイでつながってる（鳴らし直さない）" aria-label="タイ" />}
                    {s.pat && !cont && <span class="pat-mark" title={'このコードだけ: ' + patternName(s.pat)}>♪</span>}
                  </div>
                );
              })}
              {m.melodyOn && m.melody.filter((n) => n.t < rowStart + rowTicks && n.t + n.len > rowStart).map((n) => (
                <i class="mel" style={{ left: pct(Math.max(n.t, rowStart)) + '%', width: Math.max(0.4, pct(Math.min(n.t + n.len, rowStart + rowTicks)) - pct(Math.max(n.t, rowStart))) + '%', bottom: 3 + ((n.n - 48) % 24) * 0.9 + 'px' }} />
              ))}
              {showCaret && caret.value >= rowStart && caret.value < rowStart + rowTicks && caret.value < m.bars * bar && (
                <div class="caret" style={{ left: pct(caret.value) + '%' }} />
              )}
              <Playhead rowStart={rowStart} rowTicks={rowTicks} />
            </div>
            {r === rows - 1 && barsHere < bpr && (
              <button class="add-bar" style={{ left: (barsHere / bpr) * 100 + '%' }} onClick={() => setBars(m.bars + 1)} title="小節を追加" aria-label="小節を追加">
                <Icon name="plus" size={16} />
              </button>
            )}
          </div>
        );
      })}
      <div class="tl-foot">
        <div class="bars-ctl">
          <button class="mini" onClick={() => setBars(m.bars - 1)} aria-label="小節を減らす" disabled={m.bars <= 1}>−</button>
          <span>{m.bars}小節</span>
          <button class="mini" onClick={() => setBars(m.bars + 1)} aria-label="小節を増やす">＋</button>
          {sel.length > 0 && (() => {
            const it = items.find((i) => i.id === sel[0]);
            if (!it) return null;
            const b = Math.floor(it.t / bar);
            return (
              <>
                <button class="mini txt" onClick={() => insertBarAt(b)} title="この小節の前に空の小節を挿入">小節挿入</button>
                <button class="mini txt" onClick={() => deleteBarAt(b)} title="この小節を削除して詰める">小節削除</button>
              </>
            );
          })()}
        </div>
        <label class="zoom" title="1行に並べる小節数">
          <span>表示</span>
          <select value={String(zoom)} onChange={(e) => { const v = (e.target as HTMLSelectElement).value; updateSettings({ zoom: v === 'auto' ? 'auto' : (Number(v) as 1 | 2 | 4 | 8) }); }} aria-label="1行の小節数">
            <option value="auto">自動（{bpr}小節/行）</option>
            {[1, 2, 4, 8].map((n) => <option value={String(n)}>{n}小節/行</option>)}
          </select>
        </label>
        <div class="seg small label-toggle" role="radiogroup" aria-label="表示">
          <button type="button" class={label === 'roman' ? 'on' : ''} aria-checked={label === 'roman'} role="radio" onClick={() => updateSettings({ label: 'roman' })}>度数</button>
          <button type="button" class={label === 'name' ? 'on' : ''} aria-checked={label === 'name'} role="radio" onClick={() => updateSettings({ label: 'name' })}>コード名</button>
        </div>
        <div class="progs">
          {progressions.map((p, i) => (
            <button class={`prog ${hot === i ? 'on' : ''}`} onMouseEnter={() => setHot(i)} onMouseLeave={() => setHot(null)} onClick={() => setHot(hot === i ? null : i)}
              title={p.def.desc}>
              <b>{p.def.name}</b>
              {p.def.aliases && <em>（{p.def.aliases.join('・')}）</em>}
              {p.length < p.def.roman.split(' ').length && p.def.core && <em>（前半）</em>}
              <span>{progressionRomanText(p.def)}</span>
              {p.note && <small>{p.note}</small>}
            </button>
          ))}
        </div>
      </div>
      {!items.length && (
        <div class="tl-empty">
          <div>👇 下のボタンでコードを入れてみよう</div>
          <small>たとえば IV → V → iii → vi で「王道進行」</small>
        </div>
      )}
    </div>
  );
}
