// Main-thread audio host: owns the AudioContext, unlocks it on the first gesture (iOS too),
// keeps the worklet in sync with the current memo and estimates the playhead.
import { AudioGraph, ensureWorklets } from './graph';
import { Patch, QUALITY_HIGH, QUALITY_LIGHT } from './params';
import { buildTable, WavetableData } from './wavetables';
import type { FxChain } from './fx/defs';
import type { EngineMessage, SeqData } from './worklet/engine';

export type HostState = 'idle' | 'starting' | 'ready' | 'error';

export interface Meter {
  peak: number;
  gr: number;
  guard: number;
  nan: number;
}

type Listener = () => void;

const SILENT_WAV =
  'data:audio/wav;base64,UklGRiQAAABXQVZFZm10IBAAAAABAAEAQB8AAIA+AAACABAAZGF0YQAAAAA=';

function isMobile(): boolean {
  return typeof navigator !== 'undefined' && /Android|iPhone|iPad|iPod|Mobile/i.test(navigator.userAgent + (navigator.maxTouchPoints > 1 && /Mac/.test(navigator.userAgent) ? ' iPad' : ''));
}

export class AudioHost {
  ctx: AudioContext | null = null;
  graph: AudioGraph | null = null;
  state: HostState = 'idle';
  errorCode = '';
  playing = false;
  light = false;
  meter: Meter = { peak: 0, gr: 1, guard: 1, nan: 0 };
  load = 0;
  voices = 0;
  private starting: Promise<boolean> | null = null;
  private listeners = new Set<Listener>();
  private sentTables = new Set<string>();
  private patches: (Patch | null)[] = [null, null, null];
  private patchKeys = ['', '', ''];
  private seq: SeqData | null = null;
  private fx: FxChain | null = null;
  private pos = { tick: 0, frame: 0, playing: false };
  private liveId = 1;
  private master = 0.8;
  private silentEl: HTMLAudioElement | null = null;
  private wantPlay = false;
  onEnded: () => void = () => {};
  onOverload: () => void = () => {};
  private overloadCount = 0;

  subscribe(fn: Listener): () => void {
    this.listeners.add(fn);
    return () => this.listeners.delete(fn);
  }

  private emit() {
    for (const l of this.listeners) l();
  }

  get sampleRate(): number {
    return this.ctx?.sampleRate ?? 48000;
  }

  /**
   * Must be called from inside a user gesture the first time. Creating + resuming the context and
   * playing a silent buffer synchronously inside the gesture is what unlocks iOS Safari.
   */
  start(): Promise<boolean> {
    if (this.state === 'ready' && this.ctx) {
      if (this.ctx.state !== 'running') this.resumeNow();
      return Promise.resolve(true);
    }
    if (this.starting) {
      if (this.ctx && this.ctx.state !== 'running') this.resumeNow();
      return this.starting;
    }
    try {
      const AC: typeof AudioContext = window.AudioContext || (window as unknown as { webkitAudioContext: typeof AudioContext }).webkitAudioContext;
      if (!AC) throw new Error('NO_AUDIO');
      this.ctx = new AC({ latencyHint: isMobile() ? 'balanced' : 'interactive' });
    } catch (e) {
      this.fail((e as Error).message === 'NO_AUDIO' ? 'NO_AUDIO' : 'CTX_FAILED');
      return Promise.resolve(false);
    }
    this.state = 'starting';
    this.emit();
    this.resumeNow();
    const ctx = this.ctx;
    ctx.onstatechange = () => this.emit();
    this.starting = (async () => {
      try {
        if (!window.isSecureContext) throw new Error('INSECURE');
        await ensureWorklets(ctx);
        const g = new AudioGraph(ctx, { light: this.light });
        g.master.gain.value = this.master;
        const analyser = ctx.createAnalyser();
        analyser.fftSize = 1024;
        g.out.connect(ctx.destination);
        g.out.connect(analyser);
        this.analyser = analyser;
        g.engine.port.onmessage = (e) => this.onEngineMessage(e.data);
        g.limiter.port.onmessage = (e) => {
          if (e.data?.type === 'meter') {
            this.meter = e.data as Meter;
            this.emitMeter();
          }
        };
        this.graph = g;
        this.state = 'ready';
        // Re-send whatever the app already pushed.
        this.sentTables.clear();
        const p = this.patches;
        this.patchKeys = ['', '', ''];
        p.forEach((x, i) => x && this.setPatch(i, x));
        if (this.fx) g.fx.set(this.fx.items, this.seq?.bpm ?? 120, true);
        if (this.seq) g.post({ type: 'seq', seq: this.seq });
        this.applyQuality();
        this.emit();
        if (this.wantPlay) { this.wantPlay = false; this.play(this.pos.tick); }
        return true;
      } catch (e) {
        const msg = (e as Error)?.message;
        this.fail(msg === 'INSECURE' ? 'INSECURE' : msg === 'NO_WORKLET' ? 'NO_WORKLET' : 'WORKLET_FAILED');
        return false;
      } finally {
        this.starting = null;
      }
    })();
    return this.starting;
  }

  analyser: AnalyserNode | null = null;

  private resumeNow() {
    const ctx = this.ctx;
    if (!ctx) return;
    try {
      // iOS 17+: play through the silent switch.
      const nav = navigator as unknown as { audioSession?: { type: string } };
      if (nav.audioSession) nav.audioSession.type = 'playback';
      else if (/iPhone|iPad|iPod/.test(navigator.userAgent) && !this.silentEl) {
        // Older iOS: a looping silent <audio> switches the session to "playback".
        const el = new Audio(SILENT_WAV);
        el.loop = true;
        el.setAttribute('playsinline', '');
        el.play().catch(() => {});
        this.silentEl = el;
      }
    } catch { /* best effort */ }
    try {
      const b = ctx.createBuffer(1, 1, ctx.sampleRate);
      const s = ctx.createBufferSource();
      s.buffer = b;
      s.connect(ctx.destination);
      s.start(0);
    } catch { /* */ }
    if (ctx.state !== 'running') ctx.resume().then(() => this.emit()).catch(() => {});
  }

  /** Install listeners that unlock audio on the first touch/click/key anywhere. */
  installUnlock() {
    const handler = () => {
      if (this.state === 'error' && this.errorCode !== 'CTX_FAILED') return;
      this.start();
    };
    for (const ev of ['pointerdown', 'touchend', 'keydown', 'click']) document.addEventListener(ev, handler, { capture: true, passive: true });
    document.addEventListener('visibilitychange', () => {
      if (document.visibilityState === 'visible' && this.ctx && this.ctx.state !== 'running' && this.state === 'ready') this.ctx.resume().catch(() => {});
    });
  }

  private fail(code: string) {
    this.state = 'error';
    this.errorCode = code;
    this.emit();
  }

  get running(): boolean {
    return !!this.ctx && this.ctx.state === 'running' && this.state === 'ready';
  }

  private meterListeners = new Set<(m: Meter) => void>();
  onMeter(fn: (m: Meter) => void): () => void {
    this.meterListeners.add(fn);
    return () => this.meterListeners.delete(fn);
  }
  private emitMeter() {
    for (const l of this.meterListeners) l(this.meter);
  }

  private onEngineMessage(m: { type: string; [k: string]: unknown }) {
    if (m.type === 'pos') {
      this.pos = { tick: m.tick as number, frame: m.frame as number, playing: m.playing as boolean };
      if (this.playing !== this.pos.playing) {
        this.playing = this.pos.playing;
        this.emit();
      }
    } else if (m.type === 'ended') {
      this.playing = false;
      this.emit();
      this.onEnded();
    } else if (m.type === 'load') {
      this.load = m.load as number;
      this.voices = m.voices as number;
      if (this.load > 0.65) {
        if (++this.overloadCount >= 2) { this.overloadCount = 0; this.onOverload(); }
      } else this.overloadCount = 0;
    }
  }

  private post(m: EngineMessage, transfer?: Transferable[]) {
    if (this.graph) this.graph.post(m, transfer);
  }

  private ensureTables(p: Patch) {
    const ids = [p.o.osc1Table, p.o.osc2Table, p.o.osc3Table].filter((_, i) => [p.o.osc1On, p.o.osc2On, p.o.osc3On][i]);
    const fresh: WavetableData[] = [];
    for (const id of new Set(ids)) {
      if (this.sentTables.has(id)) continue;
      const t = buildTable(id);
      // Send a copy; the cache keeps the original for WAV export.
      fresh.push({ ...t, data: t.data.slice() });
      this.sentTables.add(id);
    }
    if (fresh.length) this.post({ type: 'tables', tables: fresh }, fresh.map((t) => t.data.buffer));
  }

  setPatch(part: number, p: Patch) {
    const key = JSON.stringify(p);
    this.patches[part] = p;
    if (!this.graph || key === this.patchKeys[part]) return;
    this.patchKeys[part] = key;
    this.ensureTables(p);
    this.post({ type: 'patch', part, patch: p });
  }

  setSeq(seq: SeqData) {
    this.seq = seq;
    this.post({ type: 'seq', seq });
  }

  setFx(chain: FxChain, bpm: number) {
    this.fx = chain;
    this.graph?.fx.set(chain.items, bpm);
  }

  setMaster(v: number) {
    this.master = v;
    if (this.graph && this.ctx) this.graph.master.gain.setTargetAtTime(v, this.ctx.currentTime, 0.02);
  }

  setLight(on: boolean) {
    if (this.light === on) return;
    this.light = on;
    this.applyQuality();
    if (this.graph && this.fx) this.graph.fx.setLight(on, this.fx.items, this.seq?.bpm ?? 120);
    this.emit();
  }

  private applyQuality() {
    this.post({ type: 'quality', q: this.light ? QUALITY_LIGHT : QUALITY_HIGH, voices: this.light ? QUALITY_LIGHT.maxVoices : QUALITY_HIGH.maxVoices });
  }

  play(from = 0) {
    if (!this.graph) {
      this.wantPlay = true;
      this.pos.tick = from;
      this.start();
      return;
    }
    if (this.ctx && this.ctx.state !== 'running') this.resumeNow();
    this.post({ type: 'play', from });
    this.playing = true;
    this.pos = { tick: from, frame: this.ctxFrame(), playing: true };
    this.emit();
  }

  stop() {
    this.wantPlay = false;
    this.post({ type: 'stop' });
    this.playing = false;
    this.emit();
  }

  seek(tick: number) {
    this.post({ type: 'seek', tick });
    this.pos = { tick, frame: this.ctxFrame(), playing: this.playing };
  }

  panic() {
    this.post({ type: 'panic' });
  }

  private ctxFrame(): number {
    return this.ctx ? this.ctx.currentTime * this.ctx.sampleRate : 0;
  }

  /** Audible playhead (ticks), compensating for output latency. */
  playhead(): number {
    const seq = this.seq;
    if (!seq || !this.ctx) return this.pos.tick;
    if (!this.playing) return this.pos.tick;
    const lat = ((this.ctx as AudioContext).outputLatency || 0) + (this.ctx.baseLatency || 0);
    const tps = (seq.bpm * 480) / (60 * this.ctx.sampleRate);
    let t = this.pos.tick + (this.ctxFrame() - this.pos.frame - lat * this.ctx.sampleRate) * tps;
    const lp = seq.loop;
    if (lp.on && lp.end > lp.start) {
      if (t >= lp.end) t = lp.start + ((t - lp.end) % (lp.end - lp.start));
      if (t < lp.start && this.pos.tick >= lp.start) t = lp.end - (lp.start - t);
    }
    return Math.max(0, t);
  }

  /** Play notes right now (chord buttons, piano keys). Returns a release function. */
  noteOn(notes: number[], part = 0, vel = 0.8): () => void {
    if (!this.graph) {
      // The very first tap starts the engine; play the chord as soon as it is ready
      // so the first idea is never silent.
      const t0 = performance.now();
      let cancelled = false;
      let off: (() => void) | null = null;
      this.start().then((ok) => {
        if (!ok || cancelled || performance.now() - t0 > 1500) return;
        off = this.noteOn(notes, part, vel);
        setTimeout(() => off?.(), 700);
      });
      return () => { cancelled = true; off?.(); };
    }
    if (this.ctx && this.ctx.state !== 'running') this.resumeNow();
    const comp = notes.length > 3 ? Math.sqrt(3 / notes.length) : 1;
    const ids = notes.map((note) => {
      const id = this.liveId++;
      this.post({ type: 'liveOn', id, part, note, vel: vel * comp });
      return id;
    });
    let done = false;
    return () => {
      if (done) return;
      done = true;
      for (const id of ids) this.post({ type: 'liveOff', id, part });
    };
  }

  /** Audition a chord for a fixed time. */
  audition(notes: number[], ms = 900, part = 0, vel = 0.8) {
    const off = this.noteOn(notes, part, vel);
    setTimeout(off, ms);
    return off;
  }

  liveOffNote(part: number, note: number) {
    this.post({ type: 'liveOffNote', part, note });
  }

  setModWheel(v: number) {
    this.post({ type: 'mw', value: v });
  }
}

export const audio = new AudioHost();
