// Standard MIDI File (type 1) export: tempo/meter/key + chord names, chords, bass, melody tracks.
import type { Memo } from '../store/schema';
import { compileMemo } from '../seq/compile';
import { chordName } from '../theory/chord';
import { keyTonicSpelling, LETTERS } from '../theory/core';
import { PPQ } from '../seq/time';

export interface MidiOptions {
  /** true: what you hear (patterns, arps, strums). false: one sustained block per chord. */
  withPattern: boolean;
  side?: 'A' | 'B';
  /** Repeat the loop range this many times (0 = whole song once). */
  loops?: number;
}

function vlq(n: number): number[] {
  n = Math.max(0, Math.round(n));
  const bytes = [n & 0x7f];
  n >>= 7;
  while (n > 0) {
    bytes.unshift((n & 0x7f) | 0x80);
    n >>= 7;
  }
  return bytes;
}

function textBytes(s: string): number[] {
  return [...new TextEncoder().encode(s)];
}

interface Ev { t: number; order: number; bytes: number[] }

function track(events: Ev[], name: string): number[] {
  events.sort((a, b) => a.t - b.t || a.order - b.order);
  const out: number[] = [0, 0xff, 0x03, ...vlq(textBytes(name).length), ...textBytes(name)];
  let last = 0;
  for (const e of events) {
    out.push(...vlq(e.t - last), ...e.bytes);
    last = e.t;
  }
  out.push(0, 0xff, 0x2f, 0);
  return [0x4d, 0x54, 0x72, 0x6b, (out.length >>> 24) & 0xff, (out.length >>> 16) & 0xff, (out.length >>> 8) & 0xff, out.length & 0xff, ...out];
}

/** Key signature: number of sharps (+) / flats (−). */
export function keySignature(memo: Memo): number {
  const [letter, acc] = keyTonicSpelling(memo.key);
  // Circle of fifths positions of natural major keys by letter: C0 D2 E4 F-1 G1 A3 B5
  const base = [0, 2, 4, -1, 1, 3, 5][letter];
  let sf = base + acc * 7;
  if (memo.key.mode === 'minor') sf -= 3;
  return Math.max(-7, Math.min(7, sf));
}

export function buildMidi(memo: Memo, opts: MidiOptions): Uint8Array {
  const c = compileMemo(memo, { side: opts.side });
  const loop = memo.loop.on && (opts.loops ?? 0) > 0;
  const from = loop ? c.loopStart : 0;
  const to = loop ? c.loopEnd : c.songEnd;
  const reps = loop ? opts.loops! : 1;
  const span = to - from;

  const tempo = Math.round(60000000 / memo.bpm);
  const meta: Ev[] = [
    { t: 0, order: 0, bytes: [0xff, 0x51, 3, (tempo >> 16) & 0xff, (tempo >> 8) & 0xff, tempo & 0xff] },
    { t: 0, order: 1, bytes: [0xff, 0x58, 4, memo.ts.num, Math.log2(memo.ts.den), 24, 8] },
    { t: 0, order: 2, bytes: [0xff, 0x59, 2, keySignature(memo) & 0xff, memo.key.mode === 'minor' ? 1 : 0] },
  ];
  const title = memo.title.trim() || 'HIRAMEKI memo';
  meta.push({ t: 0, order: 3, bytes: [0xff, 0x01, ...vlq(textBytes(title).length), ...textBytes(title)] });

  const tracks: Ev[][] = [[], [], []];
  for (let r = 0; r < reps; r++) {
    const off = r * span;
    for (const ch of c.spans) {
      if (ch.t < from || ch.t >= to) continue;
      const name = chordName(ch.chord, memo.key);
      const b = textBytes(name);
      meta.push({ t: ch.t - from + off, order: 4, bytes: [0xff, 0x06, ...vlq(b.length), ...b] });
      if (!opts.withPattern) {
        for (const n of ch.notes) {
          const t0 = ch.t - from + off;
          const t1 = t0 + Math.min(ch.len, to - ch.t);
          tracks[0].push({ t: t0, order: 2, bytes: [0x90, n, 90] }, { t: t1, order: 1, bytes: [0x80, n, 0] });
        }
      }
    }
    for (const e of c.events) {
      if (e.t < from || e.t >= to) continue;
      if (e.p === 0 && !opts.withPattern) continue;
      const ch = e.p;
      const t0 = e.t - from + off;
      const t1 = t0 + Math.max(1, Math.min(e.d, to - e.t));
      const vel = Math.max(1, Math.min(127, Math.round(e.v * 127)));
      tracks[e.p].push({ t: t0, order: 2, bytes: [0x90 | ch, e.n, vel] }, { t: t1, order: 1, bytes: [0x80 | ch, e.n, 0] });
    }
  }
  // Program changes: pad / bass / lead.
  tracks[0].push({ t: 0, order: 0, bytes: [0xc0, 89] });
  tracks[1].push({ t: 0, order: 0, bytes: [0xc1, 38] });
  tracks[2].push({ t: 0, order: 0, bytes: [0xc2, 80] });

  const all: number[][] = [track(meta, 'Tempo / Chords'), track(tracks[0], 'Chords'), track(tracks[1], 'Bass')];
  if (tracks[2].length > 1) all.push(track(tracks[2], 'Melody'));
  const header = [0x4d, 0x54, 0x68, 0x64, 0, 0, 0, 6, 0, 1, 0, all.length, (PPQ >> 8) & 0xff, PPQ & 0xff];
  const bytes = [...header, ...all.flat()];
  return new Uint8Array(bytes);
}

// ---- tiny reader (tests, and sanity-checking exports) ----

export interface ParsedMidi {
  format: number;
  ppq: number;
  tracks: { name: string; notes: { t: number; d: number; n: number; v: number; ch: number }[]; texts: { t: number; type: number; text: string }[]; tempo?: number; ts?: [number, number]; key?: [number, number] }[];
}

export function parseMidi(u8: Uint8Array): ParsedMidi {
  const v = new DataView(u8.buffer, u8.byteOffset, u8.byteLength);
  let p = 0;
  const tag = () => String.fromCharCode(u8[p], u8[p + 1], u8[p + 2], u8[p + 3]);
  if (tag() !== 'MThd') throw new Error('not midi');
  const format = v.getUint16(8);
  const ntr = v.getUint16(10);
  const ppq = v.getUint16(12);
  p = 14;
  const out: ParsedMidi = { format, ppq, tracks: [] };
  for (let k = 0; k < ntr; k++) {
    if (tag() !== 'MTrk') throw new Error('bad track');
    const len = v.getUint32(p + 4);
    let q = p + 8;
    const end = q + len;
    let t = 0;
    let status = 0;
    const tr: ParsedMidi['tracks'][number] = { name: '', notes: [], texts: [] };
    const open = new Map<string, { t: number; v: number }>();
    const readVlq = () => { let n = 0; let b: number; do { b = u8[q++]; n = (n << 7) | (b & 0x7f); } while (b & 0x80); return n; };
    while (q < end) {
      t += readVlq();
      let st = u8[q];
      if (st & 0x80) q++; else st = status;
      status = st;
      if (st === 0xff) {
        const type = u8[q++];
        const l = readVlq();
        const data = u8.slice(q, q + l);
        q += l;
        if (type === 0x03) tr.name = new TextDecoder().decode(data);
        else if (type === 0x51) tr.tempo = (data[0] << 16) | (data[1] << 8) | data[2];
        else if (type === 0x58) tr.ts = [data[0], 2 ** data[1]];
        else if (type === 0x59) tr.key = [(data[0] << 24) >> 24, data[1]];
        else if (type === 0x01 || type === 0x06) tr.texts.push({ t, type, text: new TextDecoder().decode(data) });
        continue;
      }
      const hi = st & 0xf0, ch = st & 0x0f;
      if (hi === 0x90 || hi === 0x80) {
        const n = u8[q++], vel = u8[q++];
        const key = ch + ':' + n;
        if (hi === 0x90 && vel > 0) open.set(key, { t, v: vel });
        else {
          const o = open.get(key);
          if (o) { tr.notes.push({ t: o.t, d: t - o.t, n, v: o.v, ch }); open.delete(key); }
        }
      } else if (hi === 0xc0 || hi === 0xd0) q += 1;
      else q += 2;
    }
    out.tracks.push(tr);
    p = end;
  }
  return out;
}

export function midiFileName(memo: Memo): string {
  return safeFileName(memo.title.trim() || 'hirameki') + '.mid';
}

export function safeFileName(s: string): string {
  return s.replace(/[\\/:*?"<>|]+/g, '_').slice(0, 60) || 'hirameki';
}

void LETTERS;
