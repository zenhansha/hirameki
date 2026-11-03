// Dev-only: render memos and draw waveform envelopes + spectrograms on a canvas for visual checks.
import { renderMemo } from '../audio/render';
import { fft } from '../audio/wavetables';
import { TEMPLATES } from '../presets/templates';

export async function drawAll(): Promise<HTMLCanvasElement> {
  const memos = TEMPLATES.map((t) => t.build());
  const W = 1200, rowH = 150;
  const c = document.createElement('canvas');
  c.width = W; c.height = rowH * memos.length;
  const g = c.getContext('2d')!;
  g.fillStyle = '#0b0d12'; g.fillRect(0, 0, c.width, c.height);
  let y0 = 0;
  for (const m of memos) {
    const r = await renderMemo(m, { loops: 1, raw: true, sampleRate: 32000 });
    const L = r.channels![0], R = r.channels![1];
    const n = L.length, sr = r.sampleRate;
    // Spectrogram (top 100px), log frequency 40 Hz … 12 kHz.
    const N = 1024, cols = W;
    const hop = Math.max(1, Math.floor((n - N) / cols));
    const re = new Float64Array(N), im = new Float64Array(N);
    for (let x = 0; x < cols; x++) {
      const s = x * hop;
      for (let i = 0; i < N; i++) { const w = 0.5 - 0.5 * Math.cos((2 * Math.PI * i) / N); re[i] = ((L[s + i] ?? 0) + (R[s + i] ?? 0)) * 0.5 * w; im[i] = 0; }
      fft(re, im);
      for (let yy = 0; yy < 100; yy++) {
        const f = 40 * Math.pow(300, 1 - yy / 100);
        const k = Math.min(N / 2 - 1, Math.round((f / sr) * N));
        const mag = Math.hypot(re[k], im[k]);
        const db = 20 * Math.log10(mag + 1e-9);
        const v = Math.max(0, Math.min(1, (db + 60) / 60));
        g.fillStyle = `rgb(${Math.round(255 * Math.min(1, v * 1.6))},${Math.round(200 * v * v)},${Math.round(120 + 135 * v * (1 - v))})`;
        g.fillRect(x, y0 + yy, 1, 1);
      }
    }
    // Envelope (L up, R down).
    const mid = y0 + 125;
    for (let x = 0; x < cols; x++) {
      let pl = 0, pr = 0;
      for (let i = x * hop; i < Math.min(n, (x + 1) * hop); i++) { pl = Math.max(pl, Math.abs(L[i])); pr = Math.max(pr, Math.abs(R[i])); }
      g.fillStyle = pl > 0.94 || pr > 0.94 ? '#ff5d73' : '#36e2c9';
      g.fillRect(x, mid - pl * 22, 1, pl * 22);
      g.fillRect(x, mid, 1, pr * 22);
    }
    g.fillStyle = '#fff'; g.font = '13px sans-serif';
    g.fillText(`${m.title}  peak ${r.peak.toFixed(2)}  ${r.seconds.toFixed(1)}s`, 8, y0 + 14);
    y0 += rowH;
  }
  document.body.appendChild(c);
  c.style.cssText = 'position:fixed;left:0;top:0;z-index:9999;width:100vw';
  return c;
}

(window as unknown as Record<string, unknown>).__viz = { drawAll };
