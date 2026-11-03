// Where the app runs: the normal web/PWA build, or the claude.ai Artifact build
// (`vite build --mode artifact`), which swaps a few platform services.

/** Built for claude.ai Artifacts (sandboxed frame: no service worker, no plain downloads, no mic/MIDI). */
export const IS_ARTIFACT = import.meta.env.VITE_TARGET === 'artifact';

/** Base URL for share links ('' = this page). The Artifact build points them at the public web version. */
export const SHARE_BASE: string = import.meta.env.VITE_SHARE_BASE || '';

interface ClaudeHost {
  use(name: string): Promise<unknown>;
}

/** The Artifact runtime's capability namespace, or null outside a viewer. */
export async function claudeUse<T>(name: string): Promise<T | null> {
  const c = (window as unknown as { claude?: ClaudeHost }).claude;
  if (!c || typeof c.use !== 'function') return null;
  try {
    return ((await c.use(name)) as T) ?? null;
  } catch {
    return null;
  }
}
