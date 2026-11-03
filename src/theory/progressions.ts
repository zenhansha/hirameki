// Detect famous chord progressions (王道進行, 丸サ進行, カノン進行 …).
import { Key, mod12, relativeMajorTonic } from './core';
import { ChordSpec, quality } from './chord';

type TriadClass = 'maj' | 'min' | 'any';

export interface ProgressionDef {
  id: string;
  name: string;
  /** Roman numerals in the major frame (relative major for minor keys). */
  roman: string;
  /** Minimum number of chords that must match from the start (the rest is a bonus). */
  core?: number;
  desc: string;
  aliases?: string[];
  /** How famous (used to rank suggestions). */
  pop?: number;
}

/** Ordered so that longer / more specific progressions win. */
export const PROGRESSIONS: ProgressionDef[] = [
  { id: 'canon', pop: 3, name: 'カノン進行', roman: 'I V vi iii IV I IV V', core: 4, desc: 'パッヘルベルのカノン由来。ベースが順に下がっていく王道の泣き進行' },
  { id: 'blues', pop: 1, name: 'ブルース進行', roman: 'I IV I V IV I', core: 6, desc: '12小節ブルースの骨格' },
  { id: 'autumn', pop: 1.5, name: '枯葉進行（循環五度）', roman: 'ii V I IV vii III vi', core: 5, desc: '5度ずつ下がっていくジャズの定番' },
  { id: 'fly', pop: 1, name: 'Fly Me to the Moon進行', roman: 'vi ii V I IV vii III vi', core: 6, desc: '循環五度でぐるっと一周' },
  { id: 'marusa', pop: 3, name: '丸サ進行', roman: 'IV III vi v I', core: 3, desc: 'IVM7→III7→VIm7→(Vm7→I7)。おしゃれで切ない都会の進行', aliases: ['Just the Two of Us進行'] },
  { id: 'oudou3', pop: 2, name: '王道進行（III7型）', roman: 'IV V III vi', desc: '王道進行のiiiをIII7にして切なさマシマシ' },
  { id: 'oudou', pop: 3.2, name: '王道進行', roman: 'IV V iii vi', desc: 'J-POPで一番よく聴く「4536」。エモい' },
  { id: 'komuro', pop: 3, name: '小室進行', roman: 'vi IV V I', desc: '「6451」。90年代J-POPの疾走感' },
  { id: 'sensitive', pop: 2, name: 'センシティブ進行', roman: 'vi IV I V', desc: '「6415」。洋楽ポップスの切ない定番（短調なら i–♭VI–♭III–♭VII）' },
  { id: 'axis', pop: 2.5, name: 'ポップパンク進行（Let It Be進行）', roman: 'I V vi IV', desc: '「1564」。世界中のヒット曲で使われる最強進行' },
  { id: 'fifties', pop: 2, name: '50s進行（Stand by Me進行）', roman: 'I vi IV V', desc: '「1645」。オールディーズの甘い進行' },
  { id: 'junkan', pop: 2, name: '循環コード（イチロクニーゴー）', roman: 'I vi ii V', desc: '「1625」。ぐるぐる回せる万能進行' },
  { id: 'gyaku', pop: 1.5, name: '逆循環', roman: 'vi ii V I', desc: '「6251」。循環コードをviから始めた形' },
  { id: 'andalusia', pop: 1.5, name: 'アンダルシア進行', roman: 'vi V IV III', desc: '短調で i–♭VII–♭VI–V。フラメンコの情熱' },
  { id: 'creep', pop: 1, name: 'Creep進行', roman: 'I III IV iv', desc: 'III→ivの明暗が効いた進行' },
  { id: 'up456', pop: 1, name: '456進行（上昇）', roman: 'IV V vi', desc: '「456」。サビ前に気持ちが上がっていく' },
  { id: 'subminor', pop: 1.5, name: 'サブドミナントマイナー終止', roman: 'IV iv I', desc: 'IV→ivで一瞬切なくなって着地' },
  { id: 'mario', pop: 1, name: '♭VI–♭VII–I（マリオ終止）', roman: 'bVI bVII I', desc: 'ゲーム音楽やロックのファンファーレ的終止' },
  { id: 'mixo', pop: 1, name: 'ミクソリディアン終止', roman: 'bVII IV I', desc: 'ロックっぽい明るい終止' },
  { id: 'twofive', pop: 2, name: 'ツーファイブワン', roman: 'ii V I', desc: 'ジャズの基本。ii→Vで解決へ' },
  { id: 'three', pop: 1, name: 'スリーコード', roman: 'I IV V', desc: 'ロックンロールの基本' },
];

interface Token {
  offset: number;
  cls: TriadClass;
}

const NUM: Record<string, number> = { i: 0, ii: 1, iii: 2, iv: 3, v: 4, vi: 5, vii: 6 };
const MAJOR = [0, 2, 4, 5, 7, 9, 11];

export function parseRoman(tok: string): Token {
  const m = /^([b#]?)([ivIV]+)/.exec(tok);
  if (!m) throw new Error('bad roman ' + tok);
  const acc = m[1] === 'b' ? -1 : m[1] === '#' ? 1 : 0;
  const deg = NUM[m[2].toLowerCase()];
  const upper = m[2] === m[2].toUpperCase();
  return { offset: mod12(MAJOR[deg] + acc), cls: upper ? 'maj' : 'min' };
}

const PATTERNS = PROGRESSIONS.map((p) => ({ def: p, tokens: p.roman.split(' ').map(parseRoman) }));

function classOf(c: ChordSpec): TriadClass {
  const fam = quality(c.q).family;
  if (fam === 'min' || fam === 'dim') return 'min';
  if (fam === 'sus' || fam === 'pow') return 'any';
  return 'maj';
}

export interface ProgressionMatch {
  def: ProgressionDef;
  /** Index range into the input chord list (inclusive start, exclusive end). */
  start: number;
  end: number;
  /** How many chords of the pattern matched. */
  length: number;
  /** "（平行調で）" etc. */
  note?: string;
}

interface Step {
  offset: number;
  cls: TriadClass;
  idx: number; // first index in the original list
  last: number; // last index in the original list
}

function collapse(chords: ChordSpec[], keyTonic: number, frameTonic: number): Step[] {
  const steps: Step[] = [];
  chords.forEach((c, i) => {
    const offset = mod12(keyTonic + c.root - frameTonic);
    const cls = classOf(c);
    const prev = steps[steps.length - 1];
    if (prev && prev.offset === offset && prev.cls === cls) prev.last = i;
    else steps.push({ offset, cls, idx: i, last: i });
  });
  return steps;
}

function tokenMatches(t: Token, s: Step): boolean {
  return t.offset === s.offset && (s.cls === 'any' || t.cls === s.cls);
}

function findIn(steps: Step[], cyclic: boolean, note?: string): ProgressionMatch[] {
  const out: ProgressionMatch[] = [];
  const n = steps.length;
  for (const { def, tokens } of PATTERNS) {
    const need = Math.min(def.core ?? tokens.length, tokens.length);
    for (let s = 0; s < n; s++) {
      let k = 0;
      while (k < tokens.length) {
        const pos = s + k;
        if (pos >= n && !cyclic) break;
        if (cyclic && k >= n) break;
        if (!tokenMatches(tokens[k], steps[pos % n])) break;
        k++;
      }
      if (k >= need) {
        const endStep = steps[(s + k - 1) % n];
        const wraps = s + k - 1 >= n;
        out.push({ def, start: steps[s].idx, end: wraps ? -1 : endStep.last + 1, length: k, note });
        if (wraps) out[out.length - 1].end = steps[n - 1].last + 1;
      }
    }
  }
  return out;
}

/**
 * Famous progressions in a chord list. Searches the key's frame first (relative major for minor keys),
 * then any transposition (reported with a note). Overlapping weaker matches are removed.
 */
export function detectProgressions(chords: ChordSpec[], key: Key, opts: { cyclic?: boolean } = {}): ProgressionMatch[] {
  if (chords.length < 2) return [];
  const frame = relativeMajorTonic(key);
  let matches = findIn(collapse(chords, key.tonic, frame), !!opts.cyclic, key.mode === 'minor' ? '平行調の度数で' : undefined);
  if (!matches.length) {
    for (let t = 1; t < 12 && !matches.length; t++) {
      const ms = findIn(collapse(chords, key.tonic, mod12(frame + t)), !!opts.cyclic, '転調先の度数で').filter((m) => m.length >= 4);
      matches = ms;
    }
  }
  // Prefer longer matches, then pattern order.
  const order = (m: ProgressionMatch) => PROGRESSIONS.indexOf(m.def);
  matches.sort((a, b) => b.length - a.length || order(a) - order(b) || a.start - b.start);
  const kept: ProgressionMatch[] = [];
  for (const m of matches) {
    const overlaps = kept.some((k) => m.start < k.end && k.start < m.end && (k.length >= m.length));
    if (!overlaps) kept.push(m);
  }
  return kept.sort((a, b) => a.start - b.start);
}

/** "IV→V→iii→vi" style display of a definition. */
export function progressionRomanText(def: ProgressionDef): string {
  return def.roman.split(' ').map((t) => t.replace('b', '♭').replace('#', '♯')).join('→');
}
