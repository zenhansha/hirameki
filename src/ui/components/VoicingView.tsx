// Shows the actual notes of the chord under the playhead (or the selected one) on a mini keyboard.
import { useEffect, useMemo, useState } from 'preact/hooks';
import { memo, selection, side, lastInserted, settings, playing } from '../state';
import { compileMemo } from '../../seq/compile';
import { audio } from '../../audio/host';
import { chordName, chordToneNames, romanName } from '../../theory/chord';
import { midiName } from '../../theory/core';

const LOW = 31; // G1
const HIGH = 88; // E6
const BLACK = [1, 3, 6, 8, 10];

export function VoicingView() {
  const m = memo.value;
  const sd = side.value;
  const compiled = useMemo(() => compileMemo(m, { side: sd }), [m, sd]);
  const [nowId, setNowId] = useState<string | null>(null);
  const isPlaying = playing.value;
  useEffect(() => {
    if (!isPlaying) { setNowId(null); return; }
    let raf = 0;
    let last: string | null = null;
    const loop = () => {
      const t = audio.playhead();
      const c = compiled.chords.find((x) => t >= x.t && t < x.t + x.len);
      const id = c?.id ?? null;
      if (id !== last) { last = id; setNowId(id); }
      raf = requestAnimationFrame(loop);
    };
    raf = requestAnimationFrame(loop);
    return () => cancelAnimationFrame(raf);
  }, [isPlaying, compiled]);

  const id = nowId ?? selection.value[0] ?? lastInserted.value ?? compiled.chords[0]?.id;
  const c = compiled.chords.find((x) => x.id === id);
  if (!c) return null;
  const k = m.key;
  const notes = new Set(c.notes);
  const bass = m.bass.on ? c.bass + 12 * m.bass.oct : null;
  const whites: number[] = [];
  for (let n = LOW; n <= HIGH; n++) if (!BLACK.includes(n % 12)) whites.push(n);
  const ww = 100 / whites.length;
  return (
    <div class="voicing">
      <div class="vo-head">
        <b>{chordName(c.chord, k)}</b>
        <span>{romanName(c.chord, k, settings.value.romanStyle)}</span>
        <small>{chordToneNames(c.chord, k).join(' ')}</small>
        <small class="vo-notes">鳴っている音：{c.notes.map((n) => midiName(n, k)).join(' ')}{bass !== null ? `／ベース ${midiName(bass, k)}` : ''}</small>
        {nowId && <em>再生中</em>}
      </div>
      <div class="vo-keys" aria-hidden="true">
        {whites.map((n, i) => <i class={`w ${notes.has(n) ? 'on' : ''} ${bass === n ? 'bass' : ''}`} style={{ left: i * ww + '%', width: ww + '%' }} />)}
        {Array.from({ length: HIGH - LOW + 1 }, (_, i) => LOW + i).filter((n) => BLACK.includes(n % 12)).map((n) => {
          const wi = whites.findIndex((w) => w > n);
          return <i class={`b ${notes.has(n) ? 'on' : ''} ${bass === n ? 'bass' : ''}`} style={{ left: `calc(${wi * ww}% - ${ww * 0.3}%)`, width: ww * 0.6 + '%' }} />;
        })}
      </div>
      <div class="hint">{m.autoVoice ? 'ボイシング自動調整ON：前のコードからなめらかにつながる転回形を選んでいるよ' : 'ボイシング自動調整OFF（パターン画面のグルーヴで切り替え）'}</div>
    </div>
  );
}

/** Notes (voicing) of a chord item as it will play. */
export function notesOf(id: string): number[] {
  const c = compileMemo(memo.value, { side: side.value }).chords.find((x) => x.id === id);
  return c ? c.notes : [];
}
