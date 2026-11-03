// Memo repository: list / save / delete / duplicate + user presets + settings.
// Sync-ready: every write bumps `rev` and `updatedAt`; deletes leave a tombstone.
import { getBackend } from './db';
import { AppSettings, Bundle, BUNDLE_FORMAT, Memo, MEMO_VERSION, normalizeMemo, normalizeSettings } from './schema';
import { Patch, normalizePatch } from '../audio/params';
import { FxChain, normalizeFxChain } from '../audio/fx/defs';
import { newId } from '../seq/timeline';
import { TABLE_IDS } from '../audio/wavetables';

export interface UserFxPreset {
  id: string;
  name: string;
  chain: FxChain;
  updatedAt: number;
}

/** Interface a future cloud sync (Firebase / Supabase …) would implement. */
export interface SyncAdapter {
  /** Memos changed on the server since `since` (including tombstones). */
  pull(since: number): Promise<Memo[]>;
  /** Upload local changes. Conflicts: higher `rev`, then newer `updatedAt` wins. */
  push(memos: Memo[]): Promise<void>;
}

export async function listMemos(includeDeleted = false): Promise<Memo[]> {
  const b = await getBackend();
  const all = (await b.all<unknown>('memos')).map(normalizeMemo);
  return all.filter((m) => includeDeleted || !m.deleted).sort((a, b) => b.updatedAt - a.updatedAt);
}

export async function getMemo(id: string): Promise<Memo | undefined> {
  const b = await getBackend();
  const raw = await b.get<unknown>('memos', id);
  return raw ? normalizeMemo(raw) : undefined;
}

export async function saveMemo(m: Memo, touch = true): Promise<Memo> {
  const b = await getBackend();
  const out: Memo = touch ? { ...m, v: MEMO_VERSION, updatedAt: Date.now(), rev: m.rev + 1 } : m;
  await b.put('memos', out.id, out);
  return out;
}

export async function deleteMemo(id: string): Promise<void> {
  const m = await getMemo(id);
  if (!m) return;
  await saveMemo({ ...m, deleted: true });
}

export async function restoreMemo(id: string): Promise<void> {
  const m = await getMemo(id);
  if (!m) return;
  const r = { ...m };
  delete r.deleted;
  await saveMemo(r);
}

/** Remove tombstones older than `days` (they only matter for sync). */
export async function purgeDeleted(days = 30): Promise<void> {
  const b = await getBackend();
  const cut = Date.now() - days * 864e5;
  for (const m of await listMemos(true)) if (m.deleted && m.updatedAt < cut) await b.del('memos', m.id);
}

export async function duplicateMemo(m: Memo): Promise<Memo> {
  const now = Date.now();
  const copy: Memo = {
    ...JSON.parse(JSON.stringify(m)),
    id: newId('m'),
    title: (m.title.trim() || '無題のメモ') + ' のコピー',
    createdAt: now, updatedAt: now, rev: 0, sample: undefined, deleted: undefined,
  };
  copy.chords = copy.chords.map((c) => ({ ...c, id: newId() }));
  return saveMemo(copy, false);
}

// ---- user presets ----

export async function listUserPatches(): Promise<Patch[]> {
  const b = await getBackend();
  return (await b.all<Patch>('patches')).map((p) => ({ ...normalizePatch(p, TABLE_IDS), user: true }));
}

export async function saveUserPatch(p: Patch): Promise<Patch> {
  const b = await getBackend();
  const out = { ...normalizePatch(p, TABLE_IDS), id: p.id && p.user ? p.id : newId('p'), user: true };
  await b.put('patches', out.id!, out);
  return out;
}

export async function deleteUserPatch(id: string): Promise<void> {
  const b = await getBackend();
  await b.del('patches', id);
}

export async function listUserFx(): Promise<UserFxPreset[]> {
  const b = await getBackend();
  return (await b.all<UserFxPreset>('fxpresets')).map((x) => ({ ...x, chain: normalizeFxChain(x.chain) })).sort((a, b) => b.updatedAt - a.updatedAt);
}

export async function saveUserFx(name: string, chain: FxChain, id?: string): Promise<UserFxPreset> {
  const b = await getBackend();
  const out: UserFxPreset = { id: id ?? newId('f'), name: name.slice(0, 40) || 'マイFX', chain: normalizeFxChain(chain), updatedAt: Date.now() };
  await b.put('fxpresets', out.id, out);
  return out;
}

export async function deleteUserFx(id: string): Promise<void> {
  const b = await getBackend();
  await b.del('fxpresets', id);
}

// ---- settings / kv ----

export async function loadSettings(): Promise<AppSettings> {
  const b = await getBackend();
  return normalizeSettings(await b.get('kv', 'settings'));
}

export async function saveSettings(s: AppSettings): Promise<void> {
  const b = await getBackend();
  await b.put('kv', 'settings', s);
}

export async function kvGet<T>(key: string): Promise<T | undefined> {
  const b = await getBackend();
  return b.get<T>('kv', key);
}

export async function kvSet<T>(key: string, v: T): Promise<void> {
  const b = await getBackend();
  await b.put('kv', key, v);
}

// ---- import / export ----

export async function exportBundle(memos: Memo[], withPresets = true): Promise<Bundle> {
  const bundle: Bundle = { format: BUNDLE_FORMAT, v: 1, exportedAt: Date.now(), memos: memos.filter((m) => !m.deleted) };
  if (withPresets) {
    bundle.patches = await listUserPatches();
    bundle.fxPresets = (await listUserFx()).map((f) => ({ id: f.id, name: f.name, chain: f.chain }));
  }
  return bundle;
}

export class ImportError extends Error {}

/** Parse an exported file (a bundle, a single memo, or an array of memos). */
export function parseImport(text: string): { memos: Memo[]; patches: Patch[]; fx: { name: string; chain: FxChain }[] } {
  let data: unknown;
  try { data = JSON.parse(text); } catch { throw new ImportError('JSONとして読み込めませんでした。HIRAMEKIで書き出したファイルか確認してね'); }
  const asArr = (x: unknown) => (Array.isArray(x) ? x : []);
  let memos: unknown[] = [];
  let patches: unknown[] = [];
  let fx: unknown[] = [];
  if (Array.isArray(data)) memos = data;
  else if (data && typeof data === 'object') {
    const d = data as Record<string, unknown>;
    if (d.format === BUNDLE_FORMAT || Array.isArray(d.memos)) {
      memos = asArr(d.memos); patches = asArr(d.patches); fx = asArr(d.fxPresets);
    } else if (d.chords !== undefined || d.bpm !== undefined) memos = [d];
  }
  if (!memos.length && !patches.length && !fx.length) throw new ImportError('メモが見つかりませんでした。HIRAMEKIのJSONファイルを選んでね');
  return {
    memos: memos.map(normalizeMemo),
    patches: patches.map((p) => normalizePatch(p as Patch, TABLE_IDS)),
    fx: fx.map((f) => ({ name: String((f as { name?: string })?.name ?? 'インポートFX'), chain: normalizeFxChain((f as { chain?: FxChain })?.chain) })),
  };
}

/** Store imported memos; ids that already exist become copies so nothing gets overwritten. */
export async function importAll(data: ReturnType<typeof parseImport>): Promise<number> {
  const existing = new Set((await listMemos(true)).map((m) => m.id));
  let n = 0;
  for (const m of data.memos) {
    const copy = existing.has(m.id) ? { ...m, id: newId('m'), title: (m.title || '無題のメモ') + '（インポート）' } : m;
    delete copy.deleted;
    await saveMemo(copy, false);
    n++;
  }
  for (const p of data.patches) await saveUserPatch({ ...p, user: false, id: undefined });
  for (const f of data.fx) await saveUserFx(f.name, f.chain);
  return n;
}
