// Tiny storage layer: IndexedDB when available, localStorage as a fallback.
// Everything goes through `Store` so a cloud sync adapter can be added later without touching the UI.

import { IS_ARTIFACT } from '../platform';
import { claudeDbBackend } from './claudeDb';

export type StoreName = 'memos' | 'patches' | 'fxpresets' | 'kv';
const STORES: StoreName[] = ['memos', 'patches', 'fxpresets', 'kv'];
const DB_NAME = 'hirameki';
const DB_VERSION = 1;

export interface Backend {
  kind: 'idb' | 'local' | 'memory' | 'claude';
  get<T>(store: StoreName, key: string): Promise<T | undefined>;
  put<T>(store: StoreName, key: string, value: T): Promise<void>;
  del(store: StoreName, key: string): Promise<void>;
  all<T>(store: StoreName): Promise<T[]>;
}

function req<T>(r: IDBRequest<T>): Promise<T> {
  return new Promise((res, rej) => {
    r.onsuccess = () => res(r.result);
    r.onerror = () => rej(r.error);
  });
}

async function openIdb(): Promise<Backend> {
  if (typeof indexedDB === 'undefined') throw new Error('no idb');
  const db = await new Promise<IDBDatabase>((res, rej) => {
    const r = indexedDB.open(DB_NAME, DB_VERSION);
    r.onupgradeneeded = () => {
      const d = r.result;
      for (const s of STORES) if (!d.objectStoreNames.contains(s)) d.createObjectStore(s);
    };
    r.onsuccess = () => res(r.result);
    r.onerror = () => rej(r.error);
    r.onblocked = () => rej(new Error('blocked'));
  });
  const tx = (s: StoreName, mode: IDBTransactionMode) => db.transaction(s, mode).objectStore(s);
  return {
    kind: 'idb',
    get: (s, k) => req(tx(s, 'readonly').get(k)),
    put: async (s, k, v) => {
      const t = db.transaction(s, 'readwrite');
      t.objectStore(s).put(v, k);
      await new Promise<void>((res, rej) => { t.oncomplete = () => res(); t.onerror = () => rej(t.error); t.onabort = () => rej(t.error); });
    },
    del: async (s, k) => {
      const t = db.transaction(s, 'readwrite');
      t.objectStore(s).delete(k);
      await new Promise<void>((res, rej) => { t.oncomplete = () => res(); t.onerror = () => rej(t.error); });
    },
    all: (s) => req(tx(s, 'readonly').getAll()),
  };
}

function localBackend(): Backend {
  let ok = true;
  try { localStorage.setItem('hm.test', '1'); localStorage.removeItem('hm.test'); } catch { ok = false; }
  const mem = new Map<string, unknown>();
  const k = (s: StoreName, key: string) => `hm.${s}.${key}`;
  const keys = (s: StoreName) => {
    if (!ok) return [...mem.keys()].filter((x) => x.startsWith(`hm.${s}.`));
    const out: string[] = [];
    for (let i = 0; i < localStorage.length; i++) { const x = localStorage.key(i); if (x && x.startsWith(`hm.${s}.`)) out.push(x); }
    return out;
  };
  const read = (full: string) => {
    if (!ok) return mem.get(full);
    const v = localStorage.getItem(full);
    return v === null ? undefined : JSON.parse(v);
  };
  return {
    kind: ok ? 'local' : 'memory',
    get: async (s, key) => read(k(s, key)) as never,
    put: async (s, key, v) => { if (ok) localStorage.setItem(k(s, key), JSON.stringify(v)); else mem.set(k(s, key), v); },
    del: async (s, key) => { if (ok) localStorage.removeItem(k(s, key)); else mem.delete(k(s, key)); },
    all: async (s) => keys(s).map(read) as never,
  };
}

let backend: Promise<Backend> | null = null;

const browserBackend = () => openIdb().catch(() => localBackend());

export function getBackend(): Promise<Backend> {
  if (!backend) {
    // Artifact build: the viewer's private claude.ai store first, this browser's storage otherwise.
    backend = IS_ARTIFACT
      ? claudeDbBackend(browserBackend).then((b) => b ?? browserBackend())
      : browserBackend();
  }
  return backend;
}

/** For tests. */
export function setBackend(b: Backend) {
  backend = Promise.resolve(b);
}

export function memoryBackend(): Backend {
  const m = new Map<string, unknown>();
  return {
    kind: 'memory',
    get: async (s, k) => m.get(s + '/' + k) as never,
    put: async (s, k, v) => { m.set(s + '/' + k, JSON.parse(JSON.stringify(v))); },
    del: async (s, k) => { m.delete(s + '/' + k); },
    all: async (s) => [...m.entries()].filter(([k]) => k.startsWith(s + '/')).map(([, v]) => v) as never,
  };
}
