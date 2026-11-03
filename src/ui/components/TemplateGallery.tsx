// "テンプレートから作成": browse ready-made progressions, preview them, create a new memo from one.
import { signal } from '@preact/signals';
import { useEffect, useMemo, useState } from 'preact/hooks';
import { TEMPLATES, TEMPLATE_CATS, TemplateCat } from '../../presets/templates';
import { auditionMemo, nowPlayingId, playing } from '../state';
import { createFromTemplate } from '../actions';
import { audio } from '../../audio/host';
import { chordName } from '../../theory/chord';
import { keyName } from '../../theory/core';
import { sortItems } from '../../seq/timeline';
import { barTicks, tsLabel } from '../../seq/time';
import { Btn, Icon } from './common';

export const templateOpen = signal(false);

export function openTemplates() {
  templateOpen.value = true;
}

function stopPreview() {
  if (auditionMemo.value) {
    audio.stop();
    auditionMemo.value = null;
    nowPlayingId.value = null;
  }
}

export function TemplateGallery() {
  const open = templateOpen.value;
  const [cat, setCat] = useState<TemplateCat | 'all'>('all');
  const built = useMemo(() => TEMPLATES.map((t) => ({ t, m: t.build() })), []);
  useEffect(() => {
    if (!open) stopPreview();
    const esc = (e: KeyboardEvent) => { if (e.key === 'Escape' && templateOpen.value) { templateOpen.value = false; } };
    window.addEventListener('keydown', esc, true);
    return () => window.removeEventListener('keydown', esc, true);
  }, [open]);
  if (!open) return null;
  const close = () => { stopPreview(); templateOpen.value = false; };
  const preview = async (id: string) => {
    const b = built.find((x) => x.t.id === id)!;
    if (nowPlayingId.value === 'tpl:' + id && playing.value) { stopPreview(); return; }
    if (!(await audio.start())) return;
    auditionMemo.value = b.m;
    nowPlayingId.value = 'tpl:' + id;
    queueMicrotask(() => audio.play(b.m.loop.on ? b.m.loop.start * barTicks(b.m.ts) : 0));
  };
  const create = (id: string) => {
    stopPreview();
    templateOpen.value = false;
    createFromTemplate(id);
  };
  const list = built.filter((x) => cat === 'all' || x.t.cat === cat);
  return (
    <div class="modal-bg" onClick={(e) => { if (e.target === e.currentTarget) close(); }}>
      <div class="modal wide templates" role="dialog" aria-modal="true" aria-label="テンプレートから作成">
        <div class="tg-head">
          <h3>テンプレートから作成</h3>
          <button type="button" class="x" onClick={close} aria-label="閉じる"><Icon name="close" /></button>
        </div>
        <p class="hint">▶で試聴して、気に入ったら「これで作る」。新しいメモとしてコピーされるので、テンプレート自体は変わらないよ。</p>
        <div class="tg-cats">
          <button type="button" class={`chip ${cat === 'all' ? 'on' : ''}`} onClick={() => setCat('all')}>すべて</button>
          {TEMPLATE_CATS.map((c) => <button type="button" class={`chip ${cat === c ? 'on' : ''}`} onClick={() => setCat(c)}>{c}</button>)}
        </div>
        <div class="tg-grid">
          {list.map(({ t, m }) => {
            const on = nowPlayingId.value === 'tpl:' + t.id && playing.value;
            return (
              <article class={`tg-card ${on ? 'playing' : ''}`} key={t.id}>
                <button type="button" class="mc-play" onClick={() => preview(t.id)} aria-label={on ? '試聴を止める' : `${t.name}を試聴`}>
                  <Icon name={on ? 'stop' : 'play'} size={22} />
                </button>
                <div class="tg-body">
                  <b>{t.name}</b>
                  <small>{t.desc}</small>
                  <span class="tg-meta">{keyName(m.key)} ・ {Math.round(m.bpm)} BPM ・ {tsLabel(m.ts)} ・ {t.cat}</span>
                  <span class="tg-chords">{sortItems(m.chords).slice(0, 6).map((c) => chordName(c.chord, m.key)).join(' → ')}{m.chords.length > 6 ? ' …' : ''}</span>
                </div>
                <Btn kind="primary" onClick={() => create(t.id)}>これで作る</Btn>
              </article>
            );
          })}
        </div>
      </div>
    </div>
  );
}
