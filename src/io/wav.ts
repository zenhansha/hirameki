// PCM WAV encoder (16-bit with TPDF dither, or 24-bit).

export function encodeWav(channels: Float32Array[], sampleRate: number, bits: 16 | 24 = 16): ArrayBuffer {
  const nch = channels.length;
  const n = channels[0]?.length ?? 0;
  const bps = bits / 8;
  const dataLen = n * nch * bps;
  const buf = new ArrayBuffer(44 + dataLen);
  const v = new DataView(buf);
  const str = (o: number, s: string) => { for (let i = 0; i < s.length; i++) v.setUint8(o + i, s.charCodeAt(i)); };
  str(0, 'RIFF');
  v.setUint32(4, 36 + dataLen, true);
  str(8, 'WAVE');
  str(12, 'fmt ');
  v.setUint32(16, 16, true);
  v.setUint16(20, 1, true);
  v.setUint16(22, nch, true);
  v.setUint32(24, sampleRate, true);
  v.setUint32(28, sampleRate * nch * bps, true);
  v.setUint16(32, nch * bps, true);
  v.setUint16(34, bits, true);
  str(36, 'data');
  v.setUint32(40, dataLen, true);
  let o = 44;
  let seed = 22222;
  const rnd = () => { seed = (seed * 1103515245 + 12345) & 0x7fffffff; return seed / 0x7fffffff; };
  for (let i = 0; i < n; i++) {
    for (let c = 0; c < nch; c++) {
      let x = channels[c][i];
      if (!isFinite(x)) x = 0;
      if (bits === 16) {
        // TPDF dither of ±1 LSB.
        let y = Math.round(x * 32767 + (rnd() - rnd()));
        y = y > 32767 ? 32767 : y < -32768 ? -32768 : y;
        v.setInt16(o, y, true);
        o += 2;
      } else {
        let y = Math.round(x * 8388607);
        y = y > 8388607 ? 8388607 : y < -8388608 ? -8388608 : y;
        v.setUint8(o, y & 0xff);
        v.setUint8(o + 1, (y >> 8) & 0xff);
        v.setUint8(o + 2, (y >> 16) & 0xff);
        o += 3;
      }
    }
  }
  return buf;
}

/** Minimal parser (tests and sanity checks). */
export function parseWavHeader(buf: ArrayBuffer): { channels: number; sampleRate: number; bits: number; frames: number } {
  const v = new DataView(buf);
  const tag = (o: number) => String.fromCharCode(v.getUint8(o), v.getUint8(o + 1), v.getUint8(o + 2), v.getUint8(o + 3));
  if (tag(0) !== 'RIFF' || tag(8) !== 'WAVE') throw new Error('not a wav');
  const channels = v.getUint16(22, true);
  const sampleRate = v.getUint32(24, true);
  const bits = v.getUint16(34, true);
  const dataLen = v.getUint32(40, true);
  return { channels, sampleRate, bits, frames: dataLen / (channels * (bits / 8)) };
}
