// Memo → playable events (chords with patterns + bass + melody), used by playback, WAV and MIDI.
import type { Memo } from '../store/schema';
import { mod12 } from '../theory/core';
import { chordPcs, ChordSpec } from '../theory/chord';
import { voiceChord } from '../theory/voicing';
import { renderBass } from './bass';
import { NoteEvent, PatternSpec, renderPattern } from './pattern';
import { sideOf, sortItems } from './timeline';
import { DIVS, PPQ, barTicks, beatTicks, isCompound, swingWarp, unitTicks } from './time';
import type { SeqData, SeqEvent } from '../audio/worklet/engine';

export interface CompiledChord {
  id: string;
  t: number;
  len: number;
  chord: ChordSpec;
  pattern: PatternSpec;
  notes: number[];
  bass: number;
}

export interface Compiled {
  events: SeqEvent[];
  chords: CompiledChord[];
  songEnd: number;
  loopStart: number;
  loopEnd: number;
  barTicks: number;
}

export interface CompileOptions {
  side?: 'A' | 'B';
  /** Skip swing (e.g. for a straight MIDI export). */
  noSwing?: boolean;
}

/** Notes for the chord part, voiced and with the pattern applied. */
export function compileMemo(memo: Memo, opts: CompileOptions = {}): Compiled {
  const side = opts.side ?? 'A';
  const bar = barTicks(memo.ts);
  const songEnd = memo.bars * bar;
  const items = sortItems(memo.chords).filter((i) => i.t < songEnd);
  const events: SeqEvent[] = [];
  const chords: CompiledChord[] = [];
  const ctx = { ts: memo.ts, bpm: memo.bpm };
  let prev: number[] | null = null;
  const bassOn = memo.bass.on;

  // First pass: voicings.
  for (const it of items) {
    const s = sideOf(it, side);
    const pattern = s.pat ?? memo.pattern;
    const v = voiceChord(s.chord, memo.key, { auto: memo.autoVoice, prev, addBass: !bassOn });
    prev = v.notes;
    const len = Math.min(it.len, songEnd - it.t);
    chords.push({ id: it.id, t: it.t, len, chord: s.chord, pattern, notes: v.notes, bass: v.bass });
  }

  // Second pass: events.
  chords.forEach((c, i) => {
    const ce = c.t + c.len;
    for (const e of renderPattern(c.pattern, c.notes, c.t, ce, ctx)) events.push({ ...e, p: 0 });
    if (bassOn) {
      const next = chords[i + 1];
      const nextContiguous = next && next.t === ce ? next : undefined;
      const info = {
        cs: c.t, ce, bass: c.bass,
        pcs: chordPcs(c.chord, memo.key),
        rootPc: mod12(memo.key.tonic + c.chord.root),
        next: nextContiguous ? nextContiguous.bass : undefined,
      };
      for (const e of renderBass(memo.bass.style, info, ctx, c.pattern, memo.bass.oct)) events.push({ ...e, p: 1 });
    }
  });

  if (memo.melodyOn) for (const n of memo.melody) if (n.t < songEnd) events.push({ t: n.t, d: Math.min(n.len, songEnd - n.t), n: n.n, v: n.v, p: 2 });

  let out = events;
  if (!opts.noSwing && memo.swing > 0) {
    out = events.map((e) => {
      const t = swingWarp(e.t, memo.swing, memo.swingGrid);
      const end = swingWarp(e.t + e.d, memo.swing, memo.swingGrid);
      return { ...e, t, d: Math.max(1, end - t) };
    });
  }
  out.sort((a, b) => a.t - b.t || a.p - b.p || a.n - b.n);
  return {
    events: out,
    chords,
    songEnd,
    loopStart: memo.loop.start * bar,
    loopEnd: memo.loop.end * bar,
    barTicks: bar,
  };
}

/** Everything the worklet sequencer needs. */
export function toSeqData(memo: Memo, c: Compiled): SeqData {
  const pumpPeriod = DIVS[memo.pump.rate] ?? PPQ;
  return {
    events: c.events,
    songEnd: c.songEnd,
    loop: { on: memo.loop.on, start: c.loopStart, end: Math.min(c.loopEnd, c.songEnd) },
    bpm: memo.bpm,
    barTicks: c.barTicks,
    clickTicks: isCompound(memo.ts) ? unitTicks(memo.ts) : beatTicks(memo.ts),
    beatTicks: beatTicks(memo.ts),
    metronome: memo.metronome,
    humanize: memo.humanize,
    pump: {
      on: memo.pump.on, period: pumpPeriod, offset: memo.pump.offset,
      depth: memo.pump.depth, curve: memo.pump.curve, length: memo.pump.length,
    },
    partGain: [memo.chordVol, memo.bass.vol, 0.8],
  };
}

export type { NoteEvent };
