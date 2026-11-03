// YIN pitch detection (de Cheveigné & Kawahara 2002) for humming input.

export interface PitchResult {
  freq: number;
  /** 0…1, higher = more confident. */
  clarity: number;
}

export function yin(buf: Float32Array, sampleRate: number, minHz = 70, maxHz = 1100, threshold = 0.15): PitchResult | null {
  const n = buf.length;
  const maxTau = Math.min(Math.floor(sampleRate / minHz), Math.floor(n / 2));
  const minTau = Math.max(2, Math.floor(sampleRate / maxHz));
  // Quiet input → no pitch.
  let energy = 0;
  for (let i = 0; i < n; i++) energy += buf[i] * buf[i];
  if (Math.sqrt(energy / n) < 0.008) return null;
  const d = new Float32Array(maxTau + 1);
  const W = n - maxTau;
  for (let tau = 1; tau <= maxTau; tau++) {
    let s = 0;
    for (let i = 0; i < W; i++) {
      const x = buf[i] - buf[i + tau];
      s += x * x;
    }
    d[tau] = s;
  }
  // Cumulative mean normalised difference.
  const cm = new Float32Array(maxTau + 1);
  cm[0] = 1;
  let run = 0;
  for (let tau = 1; tau <= maxTau; tau++) {
    run += d[tau];
    cm[tau] = run > 0 ? (d[tau] * tau) / run : 1;
  }
  let tau = -1;
  for (let t = minTau; t <= maxTau; t++) {
    if (cm[t] < threshold) {
      while (t + 1 <= maxTau && cm[t + 1] < cm[t]) t++;
      tau = t;
      break;
    }
  }
  if (tau < 0) return null;
  // Parabolic interpolation.
  let better = tau;
  if (tau > 1 && tau < maxTau) {
    const a = cm[tau - 1], b = cm[tau], c = cm[tau + 1];
    const den = a + c - 2 * b;
    if (den !== 0) better = tau + (a - c) / (2 * den);
  }
  const freq = sampleRate / better;
  if (freq < minHz || freq > maxHz) return null;
  return { freq, clarity: 1 - cm[tau] };
}
