// Share memos through the URL: compact JSON → deflate → base64url in the #hash (never sent to a server).
import { deflateSync, inflateSync, strToU8, strFromU8 } from 'fflate';
import { Memo, normalizeMemo } from '../store/schema';
import { ALL_BUILTIN_PATCHES } from '../presets/synth';
import type { Patch } from '../audio/params';
import { newId } from '../seq/timeline';
import { SHARE_BASE } from '../platform';

const PREFIX = '1.';

function b64url(u8: Uint8Array): string {
  let s = '';
  for (let i = 0; i < u8.length; i += 0x8000) s += String.fromCharCode(...u8.subarray(i, i + 0x8000));
  return btoa(s).replace(/\+/g, '-').replace(/\//g, '_').replace(/=+$/, '');
}

function unb64url(s: string): Uint8Array {
  const b = s.replace(/-/g, '+').replace(/_/g, '/');
  const bin = atob(b + '='.repeat((4 - (b.length % 4)) % 4));
  const u8 = new Uint8Array(bin.length);
  for (let i = 0; i < bin.length; i++) u8[i] = bin.charCodeAt(i);
  return u8;
}

const builtinJson = new Map(ALL_BUILTIN_PATCHES.map((p) => [JSON.stringify(p), p.id!]));

function packPatch(p: Patch): Patch | { ref: string } {
  const ref = builtinJson.get(JSON.stringify(p));
  return ref ? { ref } : p;
}

function unpackPatch(p: unknown): unknown {
  if (p && typeof p === 'object' && 'ref' in (p as Record<string, unknown>)) {
    const id = (p as { ref: string }).ref;
    const b = ALL_BUILTIN_PATCHES.find((x) => x.id === id);
    return b ? JSON.parse(JSON.stringify(b)) : undefined;
  }
  return p;
}

/** Small JSON for sharing (no ids/timestamps, built-in sounds by reference). */
export function packMemo(m: Memo): Record<string, unknown> {
  const { id: _id, createdAt: _c, updatedAt: _u, rev: _r, deleted: _d, sample: _s, fav: _f, ...rest } = m;
  void _id; void _c; void _u; void _r; void _d; void _s; void _f;
  return {
    ...rest,
    chords: m.chords.map(({ id: _i, ...c }) => { void _i; return c; }),
    synth: packPatch(m.synth),
    bass: { ...m.bass, patch: packPatch(m.bass.patch) },
    melodyPatch: packPatch(m.melodyPatch),
  };
}

export function encodeMemo(m: Memo): string {
  const json = JSON.stringify(packMemo(m));
  return PREFIX + b64url(deflateSync(strToU8(json), { level: 9 }));
}

export class ShareDecodeError extends Error {}

/** Decode a shared memo. Always returns a fresh id so it never overwrites a local memo. */
export function decodeMemo(code: string): Memo {
  try {
    const s = code.trim();
    if (!s.startsWith(PREFIX)) throw new Error('version');
    const json = strFromU8(inflateSync(unb64url(s.slice(PREFIX.length))));
    const raw = JSON.parse(json) as Record<string, unknown>;
    raw.synth = unpackPatch(raw.synth);
    if (raw.bass && typeof raw.bass === 'object') (raw.bass as Record<string, unknown>).patch = unpackPatch((raw.bass as Record<string, unknown>).patch);
    raw.melodyPatch = unpackPatch(raw.melodyPatch);
    const now = Date.now();
    return normalizeMemo({ ...raw, id: newId('m'), createdAt: now, updatedAt: now, rev: 0 });
  } catch {
    throw new ShareDecodeError('共有リンクを読み取れませんでした');
  }
}

export function shareUrl(m: Memo, base = SHARE_BASE || location.origin + location.pathname): string {
  return `${base}#m=${encodeMemo(m)}`;
}

/** Memo code from a URL hash like "#m=1.xxxx" (or null). */
export function codeFromHash(hash: string): string | null {
  const m = /[#&]m=([^&]+)/.exec(hash);
  return m ? decodeURIComponent(m[1]) : null;
}
