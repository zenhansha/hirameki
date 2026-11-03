// Band-limited wavetables (mipmapped, morphable frames), generated from harmonic spectra.
// Generated on the main thread and transferred to the worklet; also used in Node tests.

export const TABLE_SIZE = 2048;
/** Max harmonic per mip level, in half-octave steps (1023 … 1). */
export const LEVEL_HARMONICS: number[] = (() => {
  const out: number[] = [];
  for (let l = 0; ; l++) {
    const h = Math.max(1, Math.floor(1023 / Math.pow(2, l / 2)));
    out.push(h);
    if (h === 1) break;
  }
  return out;
})();

export interface WavetableData {
  id: string;
  frames: number;
  levels: number;
  size: number;
  /** Max harmonic per level. */
  harmonics: number[];
  /** levels × frames × (size + 1) samples (one guard sample per frame). */
  data: Float32Array;
}

export interface TableDef {
  id: string;
  label: string;
  frames: number;
  /** Harmonic spectrum of a frame at morph position u ∈ [0,1]: amplitudes for sin (b) and cos (a), index = harmonic. */
  spectrum?: (u: number, H: number) => { a: Float64Array; b: Float64Array };
  /** Or a time-domain single cycle (analysed with an FFT). */
  cycle?: (u: number, N: number) => Float64Array;
}

const PI = Math.PI;

function zeros(H: number) {
  return { a: new Float64Array(H + 1), b: new Float64Array(H + 1) };
}

function sawB(n: number) { return (2 / PI) * (n % 2 === 1 ? 1 : -1) / n; }
function squareB(n: number) { return n % 2 === 1 ? 4 / (PI * n) : 0; }
function triB(n: number) { return n % 2 === 1 ? (8 / (PI * PI)) * ((((n - 1) / 2) % 2 === 0) ? 1 : -1) / (n * n) : 0; }

function basicAt(shape: number, n: number): number {
  // 0 sine, 1 triangle, 2 saw, 3 square
  if (shape === 0) return n === 1 ? 1 : 0;
  if (shape === 1) return triB(n);
  if (shape === 2) return sawB(n);
  return squareB(n);
}

const VOWELS: [number, number, number][] = [
  [800, 1150, 2900], // a
  [480, 1850, 2550], // e
  [300, 2250, 3000], // i
  [460, 820, 2800], // o
  [330, 1250, 2500], // u (Japanese u is unrounded, F2 higher)
];

function formantGain(f: number, F: [number, number, number]): number {
  const bw = [90, 110, 160];
  const amp = [1, 0.6, 0.3];
  let g = 0;
  for (let i = 0; i < 3; i++) {
    const x = (f - F[i]) / bw[i];
    g += amp[i] / (1 + x * x);
  }
  return g;
}

export const TABLE_DEFS: TableDef[] = [
  {
    id: 'basic', label: 'ベーシック（サイン→三角→ノコギリ→矩形）', frames: 16,
    spectrum: (u, H) => {
      const s = zeros(H);
      const x = u * 3;
      const i0 = Math.min(2, Math.floor(x));
      const f = x - i0;
      for (let n = 1; n <= H; n++) s.b[n] = basicAt(i0, n) * (1 - f) + basicAt(i0 + 1, n) * f;
      return s;
    },
  },
  {
    id: 'warm', label: 'ウォーム（暗い→明るいノコギリ）', frames: 16,
    spectrum: (u, H) => {
      const s = zeros(H);
      const hc = 1.5 * Math.pow(120, u);
      for (let n = 1; n <= H; n++) s.b[n] = sawB(n) / (1 + Math.pow(n / hc, 3));
      return s;
    },
  },
  {
    id: 'pwm', label: 'パルス（幅50%→5%）', frames: 16,
    spectrum: (u, H) => {
      const s = zeros(H);
      const w = 0.5 - u * 0.45;
      for (let n = 1; n <= H; n++) s.a[n] = (2 / (n * PI)) * Math.sin(n * PI * w);
      return s;
    },
  },
  {
    id: 'organ', label: 'オルガン（ドローバー）', frames: 8,
    spectrum: (u, H) => {
      const s = zeros(H);
      const regs: Record<number, number>[] = [
        { 1: 1 },
        { 1: 1, 2: 0.6 },
        { 1: 1, 2: 0.7, 3: 0.55 },
        { 1: 1, 2: 0.8, 3: 0.6, 4: 0.55 },
        { 1: 1, 2: 0.8, 3: 0.7, 4: 0.6, 6: 0.45, 8: 0.4 },
        { 1: 0.9, 2: 0.9, 3: 0.8, 4: 0.7, 5: 0.35, 6: 0.55, 8: 0.6, 10: 0.2, 12: 0.25 },
      ];
      const x = u * (regs.length - 1);
      const i0 = Math.min(regs.length - 2, Math.floor(x));
      const f = x - i0;
      for (let n = 1; n <= Math.min(H, 16); n++) {
        const g = (regs[i0][n] ?? 0) * (1 - f) + (regs[i0 + 1][n] ?? 0) * f;
        s.b[n] = g * 0.6;
      }
      return s;
    },
  },
  {
    id: 'vocal', label: 'ボイス（あ→え→い→お→う）', frames: 16,
    spectrum: (u, H) => {
      const s = zeros(H);
      const x = u * (VOWELS.length - 1);
      const i0 = Math.min(VOWELS.length - 2, Math.floor(x));
      const f = x - i0;
      const F: [number, number, number] = [0, 1, 2].map((k) => VOWELS[i0][k] * (1 - f) + VOWELS[i0 + 1][k] * f) as [number, number, number];
      const f0 = 130;
      for (let n = 1; n <= H; n++) {
        const hz = n * f0;
        if (hz > 9000) break;
        s.b[n] = (formantGain(hz, F) / Math.sqrt(n)) * (n % 2 ? 1 : -1);
      }
      return s;
    },
  },
  {
    id: 'fm', label: 'FM（ベル・金属）', frames: 16,
    cycle: (u, N) => {
      const out = new Float64Array(N);
      const I = u * 6;
      for (let k = 0; k < N; k++) {
        const th = (2 * PI * k) / N;
        out[k] = Math.sin(th + I * Math.sin(3 * th) + 0.3 * I * Math.sin(th));
      }
      return out;
    },
  },
  {
    id: 'epiano', label: 'エレピ（まろやか→バーク）', frames: 16,
    cycle: (u, N) => {
      const out = new Float64Array(N);
      for (let k = 0; k < N; k++) {
        const th = (2 * PI * k) / N;
        const body = Math.sin(th + (0.15 + u * 1.6) * Math.sin(th));
        const tine = Math.sin(14 * th + u * 0.8 * Math.sin(th)) * (0.04 + u * 0.18);
        out[k] = body + tine + 0.08 * Math.sin(2 * th);
      }
      return out;
    },
  },
  {
    id: 'sweep', label: 'ハーモニックスイープ', frames: 16,
    spectrum: (u, H) => {
      const s = zeros(H);
      const c = 1 + Math.pow(u, 1.6) * 40;
      for (let n = 1; n <= H; n++) {
        const d = (n - c) / (1.2 + c * 0.12);
        s.b[n] = (n === 1 ? 0.6 : 0) + Math.exp(-d * d) * 0.8 / Math.sqrt(1 + n * 0.05);
      }
      return s;
    },
  },
  {
    id: 'glass', label: 'グラス（倍音きらきら）', frames: 16,
    spectrum: (u, H) => {
      const s = zeros(H);
      const partials = [1, 2, 3, 5, 8, 13, 21];
      partials.forEach((n, i) => {
        if (n > H) return;
        const w = i === 0 ? 1 : Math.pow(0.62, i) * (0.3 + u * 1.4);
        s.b[n] += w;
      });
      // A little odd-harmonic body.
      for (let n = 3; n <= Math.min(H, 15); n += 2) s.b[n] += (0.15 * (1 - u)) / n;
      return s;
    },
  },
  {
    id: 'hollow', label: 'ホロウ（奇数倍音→櫛形）', frames: 16,
    spectrum: (u, H) => {
      const s = zeros(H);
      for (let n = 1; n <= H; n++) {
        const odd = n % 2 === 1 ? 1 : 0;
        const comb = Math.abs(Math.cos((n * PI) / (3 + u * 5)));
        s.b[n] = ((odd * (1 - u) + comb * u) * 1.4) / Math.pow(n, 1.05);
      }
      return s;
    },
  },
];

export const TABLE_IDS = TABLE_DEFS.map((t) => t.id);
export const TABLE_LABELS: Record<string, string> = Object.fromEntries(TABLE_DEFS.map((t) => [t.id, t.label]));

// ---- FFT --------------------------------------------------------------------

const fftCache = new Map<number, { rev: Uint32Array; cos: Float64Array; sin: Float64Array }>();

function fftTables(n: number) {
  let t = fftCache.get(n);
  if (t) return t;
  const rev = new Uint32Array(n);
  for (let i = 1, j = 0; i < n; i++) {
    let bit = n >> 1;
    for (; j & bit; bit >>= 1) j ^= bit;
    j ^= bit;
    rev[i] = j;
  }
  const cos = new Float64Array(n / 2), sin = new Float64Array(n / 2);
  for (let i = 0; i < n / 2; i++) { cos[i] = Math.cos((2 * PI * i) / n); sin[i] = Math.sin((2 * PI * i) / n); }
  t = { rev, cos, sin };
  fftCache.set(n, t);
  return t;
}

/** In-place iterative radix-2 complex FFT. `inverse` uses +i and does not scale. */
export function fft(re: Float64Array, im: Float64Array, inverse = false): void {
  const n = re.length;
  const { rev, cos, sin } = fftTables(n);
  for (let i = 1; i < n; i++) {
    const j = rev[i];
    if (i < j) {
      let t = re[i]; re[i] = re[j]; re[j] = t;
      t = im[i]; im[i] = im[j]; im[j] = t;
    }
  }
  const sgn = inverse ? 1 : -1;
  for (let len = 2; len <= n; len <<= 1) {
    const half = len >> 1;
    const step = n / len;
    for (let i = 0; i < n; i += len) {
      for (let j = 0, k = 0; j < half; j++, k += step) {
        const wr = cos[k], wi = sgn * sin[k];
        const a = i + j, b = a + half;
        const br = re[b] * wr - im[b] * wi;
        const bi = re[b] * wi + im[b] * wr;
        re[b] = re[a] - br; im[b] = im[a] - bi;
        re[a] += br; im[a] += bi;
      }
    }
  }
}

/** Harmonic amplitudes (a cos, b sin) of a single cycle. */
function analyse(cycle: Float64Array, H: number) {
  const N = cycle.length;
  const re = Float64Array.from(cycle);
  const im = new Float64Array(N);
  fft(re, im);
  const s = zeros(H);
  for (let n = 1; n <= H && n < N / 2; n++) {
    s.a[n] = (2 * re[n]) / N;
    s.b[n] = (-2 * im[n]) / N;
  }
  return s;
}

/** Synthesize one cycle from harmonics up to `limit`. */
function synth(spec: { a: Float64Array; b: Float64Array }, N: number, limit: number): Float64Array {
  const re = new Float64Array(N);
  const im = new Float64Array(N);
  const H = Math.min(limit, spec.a.length - 1, N / 2 - 1);
  for (let n = 1; n <= H; n++) {
    // x[k] = Σ a cos + b sin = Re(Σ (a - i b) e^{i2πnk/N})
    re[n] = spec.a[n] / 2;
    im[n] = -spec.b[n] / 2;
    re[N - n] = spec.a[n] / 2;
    im[N - n] = spec.b[n] / 2;
  }
  fft(re, im, true);
  return re;
}

const cache = new Map<string, WavetableData>();

/** Build (or fetch from cache) a wavetable by id. */
export function buildTable(id: string): WavetableData {
  const hit = cache.get(id);
  if (hit) return hit;
  const def = TABLE_DEFS.find((t) => t.id === id) ?? TABLE_DEFS[0];
  const N = TABLE_SIZE;
  const Hmax = N / 2 - 1;
  const F = def.frames;
  const L = LEVEL_HARMONICS.length;
  const stride = N + 1;
  const data = new Float32Array(L * F * stride);
  for (let f = 0; f < F; f++) {
    const u = F === 1 ? 0 : f / (F - 1);
    const spec = def.spectrum ? def.spectrum(u, Hmax) : analyse(def.cycle!(u, N), Hmax);
    // One scale per frame (the peak over all levels) keeps loudness equal across the keyboard.
    const cycles: Float64Array[] = [];
    let peak = 0;
    for (let l = 0; l < L; l++) {
      const cyc = synth(spec, N, LEVEL_HARMONICS[l]);
      for (let k = 0; k < N; k++) { const a = cyc[k] < 0 ? -cyc[k] : cyc[k]; if (a > peak) peak = a; }
      cycles.push(cyc);
    }
    const scale = peak > 1e-9 ? 0.95 / peak : 0;
    for (let l = 0; l < L; l++) {
      const cyc = cycles[l];
      const base = (l * F + f) * stride;
      for (let k = 0; k < N; k++) data[base + k] = cyc[k] * scale;
      data[base + N] = data[base];
    }
  }
  const t: WavetableData = { id: def.id, frames: F, levels: L, size: N, harmonics: LEVEL_HARMONICS, data };
  cache.set(def.id, t);
  return t;
}

/** One frame (full band) for drawing in the UI, at morph position u. */
export function previewCycle(id: string, u: number, points = 128): Float32Array {
  const t = buildTable(id);
  const out = new Float32Array(points);
  const fpos = u * (t.frames - 1);
  const f0 = Math.min(t.frames - 1, Math.floor(fpos));
  const f1 = Math.min(t.frames - 1, f0 + 1);
  const ff = fpos - f0;
  const stride = t.size + 1;
  for (let i = 0; i < points; i++) {
    const k = Math.floor((i / points) * t.size);
    const a = t.data[f0 * stride + k];
    const b = t.data[f1 * stride + k];
    out[i] = a + (b - a) * ff;
  }
  return out;
}
