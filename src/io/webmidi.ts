// Web MIDI input: play the synth, enter chords from a MIDI keyboard, and drive commands via MIDI learn.
// Hidden automatically when the browser has no Web MIDI (iOS Safari, Firefox without permission…).
import { signal } from '@preact/signals';
import { IS_ARTIFACT } from '../platform';
import { audio } from '../audio/host';
import { recognizeChord } from '../theory/recognize';
import { COMMAND_MAP } from '../ui/commands';
import { inputChord } from '../ui/actions';
import { memo, midiHeld, settings, toast, updateSettings, pianoNotes, inputMode } from '../ui/state';

// The Artifact frame refuses device access, so MIDI is offered only in the web version.
export const midiSupported = !IS_ARTIFACT && typeof navigator !== 'undefined' && 'requestMIDIAccess' in navigator;
export const midiInputs = signal<string[]>([]);
export const midiStatus = signal<'off' | 'on' | 'denied' | 'error'>('off');
export const midiLearn = signal<string | null>(null);
export const midiLast = signal('');

let access: MIDIAccess | null = null;
const held = new Map<number, () => void>();
let peak = new Set<number>();
let sustain = false;
const sustained = new Set<number>();

function refreshInputs() {
  if (!access) return;
  const names: string[] = [];
  access.inputs.forEach((inp) => {
    names.push(inp.name ?? 'MIDI入力');
    inp.onmidimessage = onMessage;
  });
  midiInputs.value = names;
}

export async function enableMidi(): Promise<boolean> {
  if (!midiSupported) return false;
  try {
    access = await navigator.requestMIDIAccess({ sysex: false });
    access.onstatechange = () => refreshInputs();
    refreshInputs();
    midiStatus.value = 'on';
    if (!settings.value.midiEnabled) updateSettings({ midiEnabled: true });
    return true;
  } catch (e) {
    const denied = (e as DOMException)?.name === 'SecurityError' || (e as DOMException)?.name === 'NotAllowedError';
    midiStatus.value = denied ? 'denied' : 'error';
    toast(denied ? 'MIDIの使用が許可されませんでした。アドレスバーのサイト設定から許可してね' : 'MIDIを開始できませんでした', 'error', undefined, 6000);
    return false;
  }
}

export function disableMidi() {
  access?.inputs.forEach((inp) => { inp.onmidimessage = null; });
  access = null;
  midiInputs.value = [];
  midiStatus.value = 'off';
  for (const off of held.values()) off();
  held.clear();
  midiHeld.value = [];
  updateSettings({ midiEnabled: false });
}

function bindingKey(st: number, d1: number): string | null {
  const hi = st & 0xf0;
  if (hi === 0x90) return `note:${d1}`;
  if (hi === 0xb0) return `cc:${d1}`;
  if (hi === 0xc0) return `pc:${d1}`;
  return null;
}

function onMessage(e: MIDIMessageEvent) {
  const data = e.data;
  if (!data || data.length < 1) return;
  const st = data[0], d1 = data[1] ?? 0, d2 = data[2] ?? 0;
  const hi = st & 0xf0;
  const isOn = hi === 0x90 && d2 > 0;
  const isOff = hi === 0x80 || (hi === 0x90 && d2 === 0);
  const triggers = isOn || (hi === 0xb0 && d2 > 0) || hi === 0xc0;
  const bk = bindingKey(st, d1);
  if (bk && triggers) midiLast.value = bk;

  // MIDI learn: bind the next trigger to a command.
  if (midiLearn.value && bk && triggers) {
    const id = midiLearn.value;
    midiLearn.value = null;
    updateSettings({ midiMap: { ...settings.value.midiMap, [bk]: id } });
    toast(`${bk} →「${COMMAND_MAP[id]?.label ?? id}」に割り当てたよ`, 'ok');
    return;
  }
  if (bk && settings.value.midiMap[bk]) {
    if (triggers) COMMAND_MAP[settings.value.midiMap[bk]]?.run();
    return;
  }

  if (isOn) {
    audio.start();
    if (settings.value.midiThru) {
      const off = audio.noteOn([d1], 0, Math.max(0.15, d2 / 127));
      held.get(d1)?.();
      held.set(d1, off);
    }
    peak.add(d1);
    midiHeld.value = [...new Set([...midiHeld.value, d1])].sort((a, b) => a - b);
    if (inputMode.value === 'piano') pianoNotes.value = [...peak].sort((a, b) => a - b);
  } else if (isOff) {
    if (sustain) sustained.add(d1);
    else { held.get(d1)?.(); held.delete(d1); }
    midiHeld.value = midiHeld.value.filter((n) => n !== d1);
    if (midiHeld.value.length === 0) finishChord();
  } else if (hi === 0xb0) {
    if (d1 === 1) audio.setModWheel(d2 / 127);
    if (d1 === 64) {
      sustain = d2 >= 64;
      if (!sustain) { for (const n of sustained) { held.get(n)?.(); held.delete(n); } sustained.clear(); }
    }
    if (d1 === 123 || d1 === 120) { for (const off of held.values()) off(); held.clear(); }
  }
}

/** When every key is released, a played chord (2+ notes) is entered. */
function finishChord() {
  const notes = [...peak].sort((a, b) => a - b);
  peak = new Set();
  if (!settings.value.midiInputChords || notes.length < 2 || inputMode.value === 'piano') return;
  const c = recognizeChord(notes, memo.value.key, true);
  if (c) inputChord(c, { audition: false });
}

/** Feed a raw MIDI message (tests and on-screen debugging). */
export function injectMidi(bytes: number[]) {
  onMessage({ data: Uint8Array.from(bytes) } as unknown as MIDIMessageEvent);
}
