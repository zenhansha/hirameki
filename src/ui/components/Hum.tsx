// Humming input: sing a note → chord root, or record a melody over the loop → melody + chord candidates.
import { useEffect, useRef, useState } from 'preact/hooks';
import { memo, settings, toast } from '../state';
import { audio } from '../../audio/host';
import { yin } from '../../hum/pitch';
import { PitchFrame, chordForRoot, chordsForMelody, estimateKey, segmentNotes } from '../../hum/melody';
import { freqToMidi, keyNameJa, midiName, mod12, pcName } from '../../theory/core';
import { chordName } from '../../theory/chord';
import { barTicks } from '../../seq/time';
import { writeChord } from '../../seq/timeline';
import type { MelodyNote } from '../../store/schema';
import { inputChord, play, setKey, stop, updateMemo } from '../actions';
import { commit } from '../state';
import { Btn } from './common';
import { IS_ARTIFACT, SHARE_BASE } from '../../platform';

export function Hum() {
  const [on, setOn] = useState(false);
  const [note, setNote] = useState<number | null>(null);
  const [level, setLevel] = useState(0);
  const [rec, setRec] = useState(false);
  const [result, setResult] = useState<MelodyNote[] | null>(null);
  const streamRef = useRef<MediaStream | null>(null);
  const rafRef = useRef(0);
  const framesRef = useRef<PitchFrame[]>([]);
  const recRef = useRef(false);
  const startTick = useRef(0);
  const wrapped = useRef(false);
  const lastTick = useRef(0);
  const k = memo.value.key;

  const stopMic = () => {
    cancelAnimationFrame(rafRef.current);
    streamRef.current?.getTracks().forEach((t) => t.stop());
    streamRef.current = null;
    setOn(false);
  };
  useEffect(() => () => stopMic(), []);

  const startMic = async () => {
    const ok = await audio.start();
    if (!ok || !audio.ctx) return toast('オーディオを開始できませんでした', 'error');
    if (!navigator.mediaDevices?.getUserMedia) return toast('このブラウザはマイクに対応していません', 'error');
    try {
      const stream = await navigator.mediaDevices.getUserMedia({ audio: { echoCancellation: false, noiseSuppression: false, autoGainControl: false } as MediaTrackConstraints });
      streamRef.current = stream;
      const ctx = audio.ctx;
      const src = ctx.createMediaStreamSource(stream);
      const an = ctx.createAnalyser();
      an.fftSize = 2048;
      src.connect(an);
      const buf = new Float32Array(an.fftSize);
      const half = new Float32Array(an.fftSize / 2);
      const sr = ctx.sampleRate / 2;
      let frame = 0;
      setOn(true);
      const loop = () => {
        rafRef.current = requestAnimationFrame(loop);
        if (frame++ % 2) return; // ~30 fps is plenty
        an.getFloatTimeDomainData(buf);
        let peak = 0;
        for (let i = 0; i < half.length; i++) { half[i] = (buf[2 * i] + buf[2 * i + 1]) * 0.5; peak = Math.max(peak, Math.abs(half[i])); }
        setLevel(peak);
        const r = yin(half, sr);
        const midi = r && r.clarity > 0.75 ? freqToMidi(r.freq) : null;
        setNote(midi);
        if (recRef.current) {
          const tick = audio.playhead();
          if (tick < lastTick.current - 10) wrapped.current = true;
          lastTick.current = tick;
          if (wrapped.current && tick >= startTick.current) { finishRec(); return; }
          framesRef.current.push({ tick, midi });
        }
      };
      loop();
    } catch (e) {
      const name = (e as DOMException)?.name;
      toast(name === 'NotAllowedError' ? 'マイクの使用が許可されませんでした。ブラウザのアドレスバー横の設定からマイクを許可してね' : 'マイクを開けませんでした。ほかのアプリが使っていないか確認してね', 'error', undefined, 6000);
    }
  };

  const startRec = () => {
    framesRef.current = [];
    wrapped.current = false;
    const m = memo.value;
    startTick.current = m.loop.on ? m.loop.start * barTicks(m.ts) : 0;
    lastTick.current = startTick.current;
    if (!m.chords.length && !m.metronome) {
      updateMemo({ metronome: true });
      toast('コードがまだないので、メトロノームをONにしたよ');
    }
    recRef.current = true;
    setRec(true);
    setResult(null);
    play(true);
  };

  const finishRec = () => {
    recRef.current = false;
    setRec(false);
    stop();
    const notes = segmentNotes(framesRef.current);
    if (!notes.length) { toast('うまく音程を拾えませんでした。もう少し大きめに、はっきり歌ってみてね'); return; }
    setResult(notes);
  };

  const pc = note !== null ? mod12(Math.round(note)) : null;
  const cents = note !== null ? Math.round((note - Math.round(note)) * 100) : 0;
  const m = memo.value;
  const bar = barTicks(m.ts);

  const applyChords = () => {
    if (!result) return;
    const startBar = m.loop.on ? m.loop.start : 0;
    const endBar = m.loop.on ? m.loop.end : m.bars;
    const shifted = result.map((n) => ({ ...n, t: n.t - startBar * bar }));
    const cs = chordsForMelody(shifted, m.key, bar, endBar - startBar);
    commit((mm) => {
      let items = mm.chords;
      cs.forEach((c, i) => { items = writeChord(items, (startBar + i) * bar, bar, c).items; });
      return { ...mm, chords: items };
    });
    toast(`メロディに合いそうなコードを${cs.length}小節ぶん入れたよ`, 'ok');
  };
  const estKey = result ? estimateKey(result) : null;

  if (IS_ARTIFACT) {
    return (
      <div class="hum">
        <div class="hum-start">
          <p>claude.ai の中ではマイクが使えないので、鼻歌入力は Web 版で使ってね。メモは「URLで共有」でそのまま持っていけるよ。</p>
          <a class="btn primary" href={SHARE_BASE || 'https://zenhansha.github.io/hirameki/'} target="_blank" rel="noopener">Web版を開く</a>
        </div>
      </div>
    );
  }
  return (
    <div class="hum">
      {!on ? (
        <div class="hum-start">
          <p>マイクに向かって「ふ〜ん」と歌うと音程を当てるよ。1音ならコードのルートに、ループに合わせて歌えばメロディ＆コード候補にできる。</p>
          <Btn kind="primary" icon="mic" onClick={startMic}>マイクをオン</Btn>
          <small>ヘッドホン推奨（スピーカーの音を拾わないように）</small>
        </div>
      ) : (
        <>
          <div class="hum-meter">
            <div class="hm-note">{pc !== null ? pcName(pc, k) : '…'}<small>{note !== null ? midiName(Math.round(note), k) : ''}</small></div>
            <div class="hm-cents"><i style={{ left: 50 + cents / 1.2 + '%' }} /><span>{note !== null ? (cents > 0 ? '+' : '') + cents + '¢' : ''}</span></div>
            <div class="hm-level"><i style={{ width: Math.min(100, level * 250) + '%' }} /></div>
          </div>
          <div class="hum-actions">
            <Btn disabled={pc === null} kind="primary" onClick={() => pc !== null && inputChord(chordForRoot(pc, k))}>
              この音をルートに入力{pc !== null && `（${chordName(chordForRoot(pc, k), k)}）`}
            </Btn>
            {!rec ? <Btn icon="mic" onClick={startRec}>● ループに合わせて録音</Btn> : <Btn kind="danger" onClick={finishRec}>■ 録音を止める</Btn>}
            <Btn class="txt" onClick={stopMic}>マイクをオフ</Btn>
          </div>
          {rec && <div class="hint rec">録音中…ループが一周したら自動で止まるよ</div>}
          {result && (
            <div class="hum-result">
              <div class="mini-label">拾えたメロディ（{result.length}音）</div>
              <div class="hr-notes">{result.slice(0, 32).map((n) => midiName(n.n, k)).join(' ')}{result.length > 32 ? ' …' : ''}</div>
              <div class="hum-actions">
                <Btn kind="primary" onClick={() => { updateMemo({ melody: result, melodyOn: true }); toast('メロディとして保存したよ（再生すると一緒に鳴る）', 'ok'); }}>メロディとして保存</Btn>
                <Btn onClick={applyChords}>合うコードを入力</Btn>
                {estKey && (estKey.tonic !== m.key.tonic || estKey.mode !== m.key.mode) && (
                  <Btn class="txt" onClick={() => setKey(estKey, false)}>キーを {keyNameJa(estKey)} にする</Btn>
                )}
              </div>
            </div>
          )}
        </>
      )}
      {settings.value && null}
    </div>
  );
}
