// Offline WAV export: the exact same engine + effects + limiter, rendered faster than real time.
import type { Memo } from '../store/schema';
import { compileMemo, toSeqData } from '../seq/compile';
import { ticksToSeconds } from '../seq/time';
import { AudioGraph, ensureWorklets } from './graph';
import { buildTable, WavetableData } from './wavetables';
import { chainTail } from './fx/defs';
import type { EngineMessage } from './worklet/engine';
import { encodeWav } from '../io/wav';
import type { Patch } from './params';

export interface RenderOptions {
  loops: number;
  sampleRate?: number;
  side?: 'A' | 'B';
  bits?: 16 | 24;
  /** Analysis: return the raw channels and/or skip the final limiter. */
  raw?: boolean;
  noLimiter?: boolean;
  /** Override the effect chain (analysis). */
  noFx?: boolean;
}

export interface RenderResult {
  wav: ArrayBuffer;
  seconds: number;
  peak: number;
  rms: number;
  channels?: Float32Array[];
  sampleRate: number;
}

function tablesFor(patches: Patch[]): WavetableData[] {
  const ids = new Set<string>();
  for (const p of patches) {
    if (p.o.osc1On) ids.add(p.o.osc1Table);
    if (p.o.osc2On) ids.add(p.o.osc2Table);
    if (p.o.osc3On) ids.add(p.o.osc3Table);
  }
  return [...ids].map(buildTable);
}

export async function renderMemo(memo: Memo, opts: RenderOptions): Promise<RenderResult> {
  const OAC: typeof OfflineAudioContext = window.OfflineAudioContext || (window as unknown as { webkitOfflineAudioContext: typeof OfflineAudioContext }).webkitOfflineAudioContext;
  if (!OAC) throw new Error('NO_OFFLINE');
  const sr = opts.sampleRate ?? 44100;
  const c = compileMemo(memo, { side: opts.side });
  const seq = toSeqData(memo, c);
  seq.metronome = false;
  const loop = memo.loop.on;
  const passes = loop ? Math.max(1, opts.loops) : 1;
  const spanTicks = loop ? seq.loop.end - seq.loop.start : seq.songEnd;
  const body = ticksToSeconds(spanTicks * passes, memo.bpm);
  const tail = Math.max(1, chainTail(memo.fx, memo.bpm) + 0.8);
  const seconds = body + tail;
  const frames = Math.ceil(seconds * sr);
  const ctx = new OAC(2, frames, sr);
  await ensureWorklets(ctx);
  const patches = [memo.synth, memo.bass.patch, memo.melodyPatch];
  const init: EngineMessage[] = [
    { type: 'tables', tables: tablesFor(patches) },
    ...patches.map((patch, part) => ({ type: 'patch' as const, part, patch })),
    { type: 'seq', seq },
    { type: 'play', from: loop ? seq.loop.start : 0 },
  ];
  const g = new AudioGraph(ctx, { light: false, init, loops: loop ? passes : 0 });
  g.fx.set(opts.noFx ? [] : memo.fx.items, memo.bpm, true);
  g.master.gain.value = 1;
  if (opts.noLimiter) {
    g.master.disconnect();
    g.master.connect(ctx.destination);
  } else g.out.connect(ctx.destination);
  const buf = await ctx.startRendering();
  const chs = [buf.getChannelData(0), buf.getChannelData(1)];
  // Gentle fade at the very end.
  const fade = Math.min(frames, Math.floor(sr * 0.05));
  for (const ch of chs) for (let i = 0; i < fade; i++) ch[frames - 1 - i] *= i / fade;
  let peak = 0, s = 0;
  for (const ch of chs) for (let i = 0; i < ch.length; i++) { const a = Math.abs(ch[i]); if (a > peak) peak = a; s += ch[i] * ch[i]; }
  const rms = Math.sqrt(s / (chs.length * frames));
  g.dispose();
  return { wav: opts.raw ? new ArrayBuffer(0) : encodeWav(chs, sr, opts.bits ?? 16), seconds, peak, rms, channels: opts.raw ? chs : undefined, sampleRate: sr };
}
