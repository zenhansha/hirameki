// "What comes next?" suggestions: functional harmony + famous-progression completion.
import { Key, mod12, relativeMajorTonic } from './core';
import { ChordSpec, chordBass, makeChord, quality } from './chord';
import { diatonicChord } from './diatonic';
import { PROGRESSIONS, parseRoman } from './progressions';

export interface Suggestion {
  chord: ChordSpec;
  score: number;
  reason: string;
  /** Progression this would complete / continue (for a badge). */
  progression?: string;
}

/** Candidate chord identity for merging (root + major/minor-ish). */
function idOf(c: ChordSpec): string {
  const fam = quality(c.q).family;
  const cls = fam === 'min' ? 'm' : fam === 'dim' ? 'd' : fam === 'dom' ? '7' : 'M';
  return mod12(c.root) + cls + (c.bass ? '/' + c.bass.root : '');
}

interface Rule { to: (k: Key, sev: boolean) => ChordSpec; w: number; why: string }

const D = (deg: number) => (k: Key, sev: boolean) => diatonicChord(k, deg, sev);
const C = (root: number, deg: number, q: string) => () => makeChord(root, deg, q);

// Rules keyed by the previous chord in the major frame: "offset:class".
const MAJOR_RULES: Record<string, Rule[]> = {
  '0:M': [
    { to: D(3), w: 5, why: 'Iから広がるIV' }, { to: D(4), w: 4.5, why: '王道のI→V' }, { to: D(5), w: 4, why: '明→暗のI→vi' },
    { to: D(1), w: 3, why: 'ツーファイブの入口' }, { to: D(2), w: 2, why: 'I→iii' },
    { to: C(0, 0, '7'), w: 1.8, why: 'V/IV：IVへ勢いをつける' }, { to: C(10, 6, 'M'), w: 1.3, why: '♭VII：ロックな借用' },
  ],
  '2:m': [
    { to: D(4), w: 6, why: 'ツーファイブ（ii→V）' }, { to: D(2), w: 2.2, why: 'ii→iii の上昇' }, { to: D(3), w: 1.6, why: 'ii→IV' },
    { to: C(7, 4, '7sus4'), w: 1.4, why: 'じらしのV7sus4' }, { to: D(0), w: 1.2, why: 'ii→I' },
  ],
  '4:m': [
    { to: D(5), w: 5, why: '王道進行の締め（iii→vi）' }, { to: D(3), w: 3.5, why: 'iii→IV' }, { to: D(1), w: 2, why: 'iii→ii' },
    { to: C(9, 5, '7'), w: 2.2, why: 'V/ii：iiへ向かうセカンダリー' },
  ],
  '5:M': [
    { to: D(4), w: 5, why: 'サブドミナント→ドミナント' }, { to: D(0), w: 3.5, why: 'IV→I（アーメン終止）' }, { to: D(2), w: 3, why: 'IV→iii（王道の変化形）' },
    { to: C(5, 3, 'm'), w: 3, why: 'サブドミナントマイナーで泣かせる' }, { to: D(5), w: 2, why: 'IV→vi' }, { to: D(1), w: 1.5, why: 'IV→ii' },
    { to: C(4, 2, '7'), w: 1.8, why: 'IV→III7（丸サ進行へ）' }, { to: C(6, 3, 'm7b5'), w: 1, why: '♯ivø7で経過' },
  ],
  '7:M': [
    { to: D(0), w: 6, why: 'ドミナント→トニック（解決）' }, { to: D(5), w: 4.5, why: '偽終止（V→vi）' }, { to: D(2), w: 2.5, why: '王道進行（V→iii）' },
    { to: D(3), w: 2, why: 'V→IV（ロックな戻り）' },
  ],
  '7:7': [
    { to: D(0), w: 6.5, why: 'ドミナント→トニック（解決）' }, { to: D(5), w: 4.5, why: '偽終止（V7→vi）' }, { to: D(2), w: 2, why: 'V7→iii' },
  ],
  '9:m': [
    { to: D(3), w: 5, why: 'vi→IV（小室進行の流れ）' }, { to: D(1), w: 4, why: '逆循環（vi→ii）' }, { to: D(4), w: 3.5, why: 'vi→V' },
    { to: D(2), w: 2.5, why: 'vi→iii（下降）' }, { to: D(0), w: 2, why: 'vi→I' }, { to: C(7, 4, 'm7'), w: 1.4, why: 'vi→v（丸サの流れ）' },
  ],
  '11:d': [{ to: D(0), w: 5, why: '導音から解決' }, { to: D(2), w: 3, why: 'vii°→iii' }, { to: C(4, 2, '7'), w: 2.5, why: 'vii°→III7→vi' }],
  // Secondary dominants resolve to their target.
  '2:7': [{ to: D(4), w: 6, why: 'V/V→V' }, { to: C(7, 4, '7sus4'), w: 1.5, why: 'V/V→V7sus4' }],
  '2:M': [{ to: D(4), w: 4, why: 'II→V（ドッペルドミナント）' }, { to: D(3), w: 2, why: 'II→IV' }],
  '4:7': [{ to: D(5), w: 7, why: 'V/vi→vi（切ない解決）' }, { to: D(3), w: 1.5, why: 'III7→IV' }],
  '4:M': [{ to: D(5), w: 6, why: 'III→vi' }, { to: D(3), w: 2.5, why: 'III→IV（Creep進行）' }],
  '9:7': [{ to: D(1), w: 6.5, why: 'V/ii→ii' }],
  '0:7': [{ to: D(3), w: 6.5, why: 'V/IV→IV' }],
  '11:7': [{ to: D(2), w: 6, why: 'V/iii→iii' }],
  '5:m': [{ to: D(0), w: 5.5, why: 'ivからIへ着地' }, { to: D(4), w: 2.5, why: 'iv→V' }, { to: C(10, 6, 'M'), w: 2, why: 'iv→♭VII' }],
  '8:M': [{ to: C(10, 6, 'M'), w: 5, why: '♭VI→♭VII（マリオ終止へ）' }, { to: D(4), w: 3, why: '♭VI→V' }, { to: D(3), w: 2, why: '♭VI→IV' }],
  '10:M': [{ to: D(0), w: 5.5, why: '♭VII→I（明るく着地）' }, { to: D(3), w: 3, why: '♭VII→IV' }],
  '7:m': [{ to: C(0, 0, '7'), w: 5.5, why: 'vm7→I7（丸サ/Just the Two of Us）' }, { to: D(3), w: 2, why: 'v→IV' }],
};

function ruleKey(c: ChordSpec, frameShift: number): string {
  const fam = quality(c.q).family;
  const off = mod12(c.root + frameShift);
  if (fam === 'dom') return off + ':7';
  if (fam === 'min') return off + ':m';
  if (fam === 'dim') return off + ':d';
  return off + ':M';
}

function usesSevenths(history: ChordSpec[]): boolean {
  const recent = history.slice(-3);
  if (!recent.length) return false;
  const n = recent.filter((c) => quality(c.q).tones.length >= 4).length;
  return n * 2 >= recent.length;
}

function inFrame(token: ReturnType<typeof parseRoman>, key: Key, frameShift: number, sev: boolean): ChordSpec {
  // token.offset is in the major frame; convert back to the key.
  const root = mod12(token.offset - frameShift);
  const MAJOR = [0, 2, 4, 5, 7, 9, 11];
  // Letter step: find degree in the major frame and shift by the frame's letter offset.
  const deg0 = MAJOR.indexOf(token.offset) >= 0 ? MAJOR.indexOf(token.offset) : MAJOR.indexOf(mod12(token.offset + 1));
  const letterShift = frameShift === 0 ? 0 : 2; // relative major sits a 3rd (2 letters) above
  const deg = (deg0 + letterShift) % 7;
  let q = token.cls === 'min' ? (sev ? 'm7' : 'm') : (sev ? 'M7' : 'M');
  if (token.cls === 'maj' && sev && (token.offset === 7 || token.offset === 4 || token.offset === 2)) q = '7';
  void key;
  return makeChord(root, deg, q);
}

/** Up to `limit` suggestions for the chord after `history`. */
export function suggestNext(history: ChordSpec[], key: Key, limit = 8): Suggestion[] {
  const sev = usesSevenths(history);
  const frameShift = mod12(key.tonic - relativeMajorTonic(key)); // 0 for major, 9 for minor
  const pool = new Map<string, Suggestion>();
  const add = (chord: ChordSpec, score: number, reason: string, progression?: string) => {
    const id = idOf(chord);
    const cur = pool.get(id);
    if (!cur) pool.set(id, { chord, score, reason, progression });
    else {
      cur.score += score * 0.6;
      if (progression && !cur.progression) { cur.progression = progression; cur.reason = reason; }
    }
  };

  const last = history[history.length - 1];
  if (!last) {
    const starts: [number, number, string][] = key.mode === 'major'
      ? [[0, 5, 'トニックから始める'], [3, 4, '王道進行はIVから'], [5, 3.5, '小室進行はviから'], [1, 2, 'ii→Vで始める']]
      : [[0, 5, 'トニックから始める'], [5, 3.5, '♭VIから壮大に'], [3, 2.5, 'ivから']];
    for (const [d, w, why] of starts) add(diatonicChord(key, d, sev), w, why);
  } else {
    const rules = MAJOR_RULES[ruleKey(last, frameShift)];
    if (rules) for (const r of rules) {
      const target = r.to({ tonic: relativeMajorTonic(key), mode: 'major' }, sev);
      // Re-express in the actual key.
      const c = makeChord(mod12(target.root - frameShift), (target.deg + (frameShift ? 2 : 0)) % 7, target.q, target.bass ? { bass: target.bass } : {});
      add(c, r.w, r.why);
    } else {
      // Unknown chord: root motion down a fifth / to the tonic.
      const lastBass = chordBass(last);
      void lastBass;
      add(makeChord(mod12(last.root + 5), (last.deg + 3) % 7, 'M'), 2.5, '5度下へ（強進行）');
      add(diatonicChord(key, 0, sev), 2.5, 'トニックへ戻る');
      add(diatonicChord(key, 4, sev), 1.5, 'ドミナントへ');
    }

    // Famous-progression completion.
    const frameKey: Key = { tonic: relativeMajorTonic(key), mode: 'major' };
    const steps = collapseRoots(history, key, frameKey.tonic);
    for (const p of PROGRESSIONS) {
      const toks = p.roman.split(' ').map(parseRoman);
      for (let k = Math.min(toks.length - 1, steps.length); k >= 1; k--) {
        const tail = steps.slice(steps.length - k);
        if (tail.every((s, i) => s.offset === toks[i].offset && (s.cls === 'any' || s.cls === toks[i].cls))) {
          const next = toks[k];
          const c = inFrame(next, key, frameShift, sev);
          const w = k >= 2 ? (1.5 + k) * (p.pop ?? 1) : 0.5 * (p.pop ?? 1);
          add(c, w, k >= 2 ? `${p.name}の続き` : `${p.name}っぽく`, k >= 2 ? p.name : undefined);
          break;
        }
      }
    }
  }

  // Don't suggest repeating the same chord.
  if (last) pool.delete(idOf(last));
  return [...pool.values()].sort((a, b) => b.score - a.score).slice(0, limit);
}

function collapseRoots(chords: ChordSpec[], key: Key, frameTonic: number) {
  const out: { offset: number; cls: 'maj' | 'min' | 'any' }[] = [];
  for (const c of chords) {
    const fam = quality(c.q).family;
    const cls = fam === 'min' || fam === 'dim' ? 'min' : fam === 'sus' || fam === 'pow' ? 'any' : 'maj';
    const offset = mod12(key.tonic + c.root - frameTonic);
    const prev = out[out.length - 1];
    if (prev && prev.offset === offset && prev.cls === cls) continue;
    out.push({ offset, cls });
  }
  return out;
}
