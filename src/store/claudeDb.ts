// Artifact build: memos live in the viewer's private `db` subtree (data/users/<id>/…), so they persist
// with the person's claude.ai account instead of one browser's storage.
import type { Backend, StoreName } from './db';
import { claudeUse } from '../platform';

interface DocSnap { exists: boolean; data(): Record<string, unknown> | undefined }
interface DocRef { get(): Promise<DocSnap>; set(d: Record<string, unknown>): Promise<void>; delete(): Promise<void>; collection(p: string): ColRef }
interface ColRef { doc(id: string): DocRef; get(): Promise<{ docs: DocSnap[] }> }
interface DB { doc(path: string): DocRef }
interface User { id(): Promise<string | null> }

/** A Backend over the Artifact `db` capability, or null when this view has none (signed out, no viewer). */
export async function claudeDbBackend(fallback: () => Promise<Backend>): Promise<Backend | null> {
  const [db, user] = await Promise.all([claudeUse<DB>('db'), claudeUse<User>('user')]);
  if (!db || !user) return null;
  const uid = await user.id().catch(() => null);
  if (!uid) return null;
  let root: DocRef;
  try {
    root = db.doc(`data/users/${uid}/hirameki`);
  } catch {
    return null;
  }
  const col = (s: StoreName) => root.collection(s);
  // One write at a time per document (the store's rule); later writes wait for earlier ones.
  const chains = new Map<string, Promise<unknown>>();
  const serial = <T>(key: string, fn: () => Promise<T>): Promise<T> => {
    const next = (chains.get(key) ?? Promise.resolve()).then(fn, fn);
    chains.set(key, next.catch(() => undefined));
    return next;
  };
  // A viewer who can't write here (view-only) falls back to this browser's storage.
  let local: Backend | null = null;
  const degrade = async () => (local ??= await fallback());
  const isRefusal = (e: unknown) => ['invalid_argument', 'not_granted', 'revoked', 'capability_disabled', 'capability_removed'].includes((e as { code?: string })?.code ?? '');
  return {
    kind: 'claude',
    async get(s, k) {
      if (local) return local.get(s, k);
      const snap = await col(s).doc(k).get();
      return snap.exists ? ((snap.data() as { v?: unknown })?.v as never) : undefined;
    },
    async put(s, k, v) {
      if (local) return local.put(s, k, v);
      try {
        await serial(`${s}/${k}`, () => col(s).doc(k).set({ v: JSON.parse(JSON.stringify(v)) }));
      } catch (e) {
        if (!isRefusal(e)) throw e;
        await (await degrade()).put(s, k, v);
      }
    },
    async del(s, k) {
      if (local) return local.del(s, k);
      await serial(`${s}/${k}`, () => col(s).doc(k).delete());
    },
    async all(s) {
      if (local) return local.all(s);
      const snap = await col(s).get();
      return snap.docs.filter((d) => d.exists).map((d) => (d.data() as { v?: unknown })?.v) as never;
    },
  };
}
