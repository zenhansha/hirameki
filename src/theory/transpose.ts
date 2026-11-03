// Transposition and re-keying.
import { Key, keyTonicSpelling, mod12, mod7, tonicShift } from './core';
import { ChordSpec, normalizeChord } from './chord';

/** Move the key by semitones. Chords are stored relative to the key, so they follow automatically. */
export function transposeKey(key: Key, semis: number): Key {
  return { tonic: mod12(key.tonic + semis), mode: key.mode };
}

/**
 * Re-express a chord in a different key while keeping its absolute pitches
 * (used when the user fixes the key without wanting to transpose).
 */
export function rekeyChord(c: ChordSpec, from: Key, to: Key): ChordSpec {
  const fromLetter = keyTonicSpelling(from)[0];
  const toLetter = keyTonicSpelling(to)[0];
  const conv = (x: { root: number; deg: number }) => ({
    root: mod12(x.root + from.tonic - to.tonic),
    deg: mod7(x.deg + fromLetter - toLetter),
  });
  const out: ChordSpec = { ...c, ...conv(c) };
  if (c.bass) out.bass = conv(c.bass);
  if (c.notes) {
    const d = tonicShift(from.tonic) - tonicShift(to.tonic);
    out.notes = c.notes.map((n) => n + d);
  }
  return normalizeChord(out);
}
