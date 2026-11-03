// Piano mode: pick any notes, see the chord name, enter it with the exact voicing.
import { useEffect, useRef } from 'preact/hooks';
import { memo, pianoNotes, midiHeld, settings, selection } from '../state';
import { recognizeChord } from '../../theory/recognize';
import { chordName, romanName, ChordSpec } from '../../theory/chord';
import { degreeForOffset, midiName, mod12, tonicShift } from '../../theory/core';
import { audio } from '../../audio/host';
import { inputChord } from '../actions';
import { notesOf } from './VoicingView';
import { Btn } from './common';

const LOW = 48; // C3
const HIGH = 84; // C6
const BLACK = [1, 3, 6, 8, 10];

export function pianoChord(notes: number[]): ChordSpec | null {
  const k = memo.value.key;
  if (!notes.length) return null;
  const rec = recognizeChord(notes, k, true);
  if (rec) return rec;
  // Single note or something unnamed: keep the exact notes on a root guess.
  const low = Math.min(...notes);
  const off = mod12(low - k.tonic);
  return { root: off, deg: degreeForOffset(k.mode, off).deg, q: notes.length === 1 ? '5' : 'M', notes: [...notes].sort((a, b) => a - b).map((n) => n - tonicShift(k.tonic)) };
}

export function Piano() {
  const sel = pianoNotes.value;
  const held = midiHeld.value;
  const k = memo.value.key;
  const scroller = useRef<HTMLDivElement>(null);
  useEffect(() => {
    const el = scroller.current;
    if (el) el.scrollLeft = (el.scrollWidth - el.clientWidth) / 2 - 40;
  }, []);
  // Selecting a chord loads its voicing so it can be tweaked note by note.
  const selId = selection.value[0];
  useEffect(() => {
    if (!selId) return;
    const ns = notesOf(selId).filter((n) => n >= LOW && n <= HIGH);
    if (ns.length) pianoNotes.value = ns;
  }, [selId]);
  const toggle = (n: number) => {
    const has = sel.includes(n);
    pianoNotes.value = has ? sel.filter((x) => x !== n) : [...sel, n].sort((a, b) => a - b);
    if (!has) audio.audition([n], 500, 0, 0.75);
  };
  const chord = pianoChord(sel);
  const whites: number[] = [];
  for (let n = LOW; n <= HIGH; n++) if (!BLACK.includes(n % 12)) whites.push(n);
  const ww = 100 / whites.length;
  const name = chord ? chordName(chord, k) : '—';
  const exact = sel.length >= 2 && !!recognizeChord(sel, k, false);
  return (
    <div class="piano-mode">
      <div class="piano-info">
        <div class="pi-name"><b>{sel.length ? name : '鍵盤をタップして和音を作ろう'}</b>{chord && sel.length > 0 && <span>{romanName(chord, k, settings.value.romanStyle)}</span>}</div>
        <div class="pi-notes">{sel.map((n) => midiName(n, k)).join(' ')}{sel.length >= 2 && !exact && <em>（名前は近いものを表示）</em>}</div>
        <div class="pi-actions">
          <Btn icon="play" label="試聴" disabled={!sel.length} onClick={() => audio.audition(sel, 1200)} />
          <Btn kind="primary" disabled={!chord} onClick={() => chord && inputChord(chord)}>{selection.value.length ? '置き換え' : '入力'}</Btn>
          <Btn class="txt" disabled={!sel.length} onClick={() => (pianoNotes.value = [])}>クリア</Btn>
        </div>
      </div>
      <div class="piano-scroll" ref={scroller}>
        <div class="piano" role="group" aria-label="ピアノ鍵盤">
          {whites.map((n, i) => (
            <button type="button" class={`wk ${sel.includes(n) ? 'on' : ''} ${held.includes(n) ? 'held' : ''}`} style={{ left: i * ww + '%', width: ww + '%' }} onClick={() => toggle(n)} aria-label={midiName(n, k)} aria-pressed={sel.includes(n)}>
              {n % 12 === 0 && <span>C{Math.floor(n / 12) - 1}</span>}
            </button>
          ))}
          {Array.from({ length: HIGH - LOW + 1 }, (_, i) => LOW + i).filter((n) => BLACK.includes(n % 12)).map((n) => {
            const wi = whites.findIndex((w) => w > n);
            return (
              <button type="button" class={`bk ${sel.includes(n) ? 'on' : ''} ${held.includes(n) ? 'held' : ''}`} style={{ left: `calc(${wi * ww}% - ${ww * 0.32}%)`, width: ww * 0.64 + '%' }} onClick={() => toggle(n)} aria-label={midiName(n, k)} aria-pressed={sel.includes(n)} />
            );
          })}
        </div>
      </div>
      <div class="hint">MIDIキーボードで弾いた和音もそのまま入力できるよ（設定 → MIDI）</div>
    </div>
  );
}
