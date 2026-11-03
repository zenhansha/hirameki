// Vital-style synth editor: oscillators with wavetable display, filter, 3 envelopes, 3 LFOs,
// drag-and-drop modulation (drag a source chip onto any knob, or tap a chip then a knob).
import { useEffect, useRef, useState } from 'preact/hooks';
import { memo, modAssign, soundPart, commit, toast, promptDialog, confirmDialog, narrow } from '../state';
import {
  FILTER_TYPES, LFO_SHAPES, MOD_SOURCES, ModSource, PARAM_MAP, Patch, PatchOptions, fromNorm, toNorm, modRangesFor,
} from '../../audio/params';
import { TABLE_DEFS, previewCycle } from '../../audio/wavetables';
import { ALL_BUILTIN_PATCHES, BASS_PRESETS, CHORD_PRESETS, MELODY_PRESETS } from '../../presets/synth';
import { DIV_LABELS } from '../../seq/time';
import { deleteUserPatch, listUserPatches, saveUserPatch } from '../../store/repo';
import { Btn, Card, Knob, Seg, Select, Toggle } from './common';
import { audio } from '../../audio/host';
import { previewNotes } from '../actions';
import { diatonicChord } from '../../theory/diatonic';

const PART_LABELS = ['コード', 'ベース', 'メロディ'];

function getPatch(m = memo.value, part = soundPart.value): Patch {
  return part === 0 ? m.synth : part === 1 ? m.bass.patch : m.melodyPatch;
}

function setPatch(fn: (p: Patch) => Patch, coalesce?: string) {
  const part = soundPart.value;
  commit((m) => {
    const p = fn(getPatch(m, part));
    if (part === 0) return { ...m, synth: p };
    if (part === 1) return { ...m, bass: { ...m.bass, patch: p } };
    return { ...m, melodyPatch: p };
  }, { coalesce: coalesce ? `p${part}:${coalesce}` : undefined });
}

function fmt(id: string, v: number): string {
  const d = PARAM_MAP[id];
  if (!d) return v.toFixed(2);
  if (d.curve === 'int') return (v > 0 && (id.endsWith('.oct') || id.endsWith('.semi')) ? '+' : '') + Math.round(v);
  switch (d.unit) {
    case 'Hz': return v >= 1000 ? (v / 1000).toFixed(v >= 10000 ? 1 : 2) + 'k' : v >= 100 ? v.toFixed(0) : v.toFixed(v < 1 ? 2 : 1);
    case 's': return v >= 1 ? v.toFixed(2) + 's' : (v * 1000).toFixed(0) + 'ms';
    case 'st': return (v > 0 ? '+' : '') + v.toFixed(Math.abs(v - Math.round(v)) < 0.01 ? 0 : 2);
    case 'ct': return (v > 0 ? '+' : '') + v.toFixed(0) + '¢';
  }
  if (id.endsWith('.pan')) return v === 0 ? 'C' : (v < 0 ? 'L' : 'R') + Math.round(Math.abs(v) * 100);
  return Math.round(v * 100) + '%';
}

/** Knob bound to a synth parameter (with modulation display / editing). */
function PK({ id, label, size }: { id: string; label?: string; size?: number }) {
  const p = getPatch();
  const def = PARAM_MAP[id];
  const v = p.p[id] ?? def.def;
  const n = toNorm(def, v);
  const steps = def.curve === 'int' ? def.max - def.min + 1 : undefined;
  return (
    <Knob
      label={label ?? def.label}
      value={n}
      def={toNorm(def, def.def)}
      display={fmt(id, v)}
      size={size}
      steps={steps}
      bipolar={def.min < 0}
      mods={def.mod ? modRangesFor(p, id) : undefined}
      modTarget={def.mod ? id : undefined}
      onMod={def.mod ? (src, amt) => setMod(src, id, amt) : undefined}
      onChange={(x) => setPatch((pp) => ({ ...pp, p: { ...pp.p, [id]: fromNorm(def, x) } }), id)}
      onEnd={() => {}}
    />
  );
}

function setMod(src: ModSource, dst: string, amt: number | null) {
  setPatch((p) => {
    const mods = p.mods.filter((m) => !(m.src === src && m.dst === dst));
    if (amt !== null) mods.push({ src, dst, amt });
    return { ...p, mods };
  }, `mod:${src}:${dst}`);
}

function opt<K extends keyof PatchOptions>(k: K, v: PatchOptions[K]) {
  setPatch((p) => ({ ...p, o: { ...p.o, [k]: v } }));
}

function Wave({ table, pos }: { table: string; pos: number }) {
  const ref = useRef<HTMLCanvasElement>(null);
  useEffect(() => {
    const c = ref.current;
    if (!c) return;
    const dpr = window.devicePixelRatio || 1;
    const w = c.clientWidth || 160, h = c.clientHeight || 56;
    c.width = w * dpr; c.height = h * dpr;
    const g = c.getContext('2d')!;
    g.scale(dpr, dpr);
    g.clearRect(0, 0, w, h);
    // A few frames behind for the 3D-ish "wavetable" look.
    const frames = [-0.3, -0.2, -0.1, 0];
    frames.forEach((off, i) => {
      const u = Math.min(1, Math.max(0, pos + off));
      const cyc = previewCycle(table, u, 96);
      g.beginPath();
      const dx = (frames.length - 1 - i) * 6, dy = (frames.length - 1 - i) * -4;
      for (let k = 0; k < cyc.length; k++) {
        const x = dx + 8 + (k / (cyc.length - 1)) * (w - 34);
        const y = dy + h / 2 + 4 - cyc[k] * (h * 0.36);
        if (k === 0) g.moveTo(x, y); else g.lineTo(x, y);
      }
      g.strokeStyle = i === frames.length - 1 ? '#7cf3ff' : `rgba(124,243,255,${0.12 + i * 0.08})`;
      g.lineWidth = i === frames.length - 1 ? 2 : 1;
      g.stroke();
    });
  }, [table, pos]);
  return <canvas ref={ref} class="wave" />;
}

const BASIC_SHAPES: [string, number][] = [['サイン', 0], ['三角', 1 / 3], ['ノコギリ', 2 / 3], ['矩形', 1]];

function Osc({ n }: { n: 1 | 2 | 3 }) {
  const p = getPatch();
  const on = p.o[`osc${n}On` as const];
  const table = p.o[`osc${n}Table` as const];
  const pos = p.p[`osc${n}.pos`];
  return (
    <Card class={`osc ${on ? '' : 'off'}`} title={<Toggle small value={on} onChange={(v) => opt(`osc${n}On`, v)} label={`OSC ${n}`} />}
      right={<Select value={table} onChange={(v) => opt(`osc${n}Table`, v)} options={TABLE_DEFS.map((t) => ({ id: t.id, label: t.label }))} label="ウェーブテーブル" />}>
      <div class="osc-body">
        <div class="wave-wrap">
          <Wave table={table} pos={pos} />
          {table === 'basic' && (
            <div class="shapes">
              {BASIC_SHAPES.map(([l, v]) => <button type="button" class={`chip ${Math.abs(pos - v) < 0.02 ? 'on' : ''}`} onClick={() => setPatch((pp) => ({ ...pp, p: { ...pp.p, [`osc${n}.pos`]: v } }))}>{l}</button>)}
            </div>
          )}
        </div>
        <div class="knobs">
          <PK id={`osc${n}.pos`} />
          <PK id={`osc${n}.level`} />
          <PK id={`osc${n}.oct`} />
          <PK id={`osc${n}.semi`} />
          <PK id={`osc${n}.fine`} />
          <PK id={`osc${n}.pan`} />
          <PK id={`osc${n}.uni`} />
          <PK id={`osc${n}.detune`} />
          <PK id={`osc${n}.spread`} />
        </div>
        <Toggle small value={p.o[`osc${n}Rand` as const]} onChange={(v) => opt(`osc${n}Rand`, v)} label="位相ランダム" />
      </div>
    </Card>
  );
}

function FilterCurve({ type, cutoff, res }: { type: string; cutoff: number; res: number }) {
  const ref = useRef<HTMLCanvasElement>(null);
  useEffect(() => {
    const c = ref.current;
    if (!c) return;
    const dpr = window.devicePixelRatio || 1;
    const w = c.clientWidth || 200, h = c.clientHeight || 56;
    c.width = w * dpr; c.height = h * dpr;
    const g = c.getContext('2d')!;
    g.scale(dpr, dpr);
    g.clearRect(0, 0, w, h);
    const k = 2 - 1.95 * res;
    g.beginPath();
    for (let x = 0; x <= w; x += 2) {
      const f = 20 * Math.pow(1000, x / w);
      const r = f / cutoff;
      // Analogue SVF magnitude responses.
      const den = Math.hypot(1 - r * r, k * r);
      let mag: number;
      if (type === 'hp12') mag = (r * r) / den;
      else if (type === 'bp12') mag = (k * r) / den;
      else if (type === 'notch') mag = Math.abs(1 - r * r) / den;
      else mag = 1 / den;
      if (type === 'lp24') mag = mag * (1 / Math.hypot(1 - r * r, (2 - 0.6 * res) * r));
      const db = 20 * Math.log10(Math.max(1e-4, mag));
      const y = h * 0.35 - db * (h / 70);
      if (x === 0) g.moveTo(x, y); else g.lineTo(x, Math.min(h + 2, y));
    }
    g.strokeStyle = '#ffb347';
    g.lineWidth = 2;
    g.stroke();
    g.lineTo(w, h); g.lineTo(0, h); g.closePath();
    g.fillStyle = 'rgba(255,179,71,0.12)';
    g.fill();
  }, [type, cutoff, res]);
  return <canvas ref={ref} class="fcurve" />;
}

function EnvGraph({ n }: { n: number }) {
  const p = getPatch();
  const a = p.p[`env${n}.a`], d = p.p[`env${n}.d`], s = p.p[`env${n}.s`], r = p.p[`env${n}.r`];
  const total = a + d + 0.6 + r;
  const W = 160, H = 46;
  const x1 = (a / total) * W, x2 = x1 + (d / total) * W, x3 = x2 + (0.6 / total) * W;
  const y = (v: number) => 4 + (1 - v) * (H - 8);
  return (
    <svg class="envg" viewBox={`0 0 ${W} ${H}`} preserveAspectRatio="none">
      <path d={`M0 ${y(0)} L${x1} ${y(1)} Q${x1 + (x2 - x1) * 0.25} ${y(s)} ${x2} ${y(s)} L${x3} ${y(s)} Q${x3 + (W - x3) * 0.2} ${y(0)} ${W} ${y(0)}`} />
    </svg>
  );
}

function Env({ n }: { n: 1 | 2 | 3 }) {
  return (
    <Card class="env" title={n === 1 ? 'ENV1（音量）' : `ENV${n}`} right={n > 1 ? <ModChip src={`env${n}` as ModSource} /> : undefined}>
      <EnvGraph n={n} />
      <div class="knobs">
        <PK id={`env${n}.a`} /><PK id={`env${n}.d`} /><PK id={`env${n}.s`} /><PK id={`env${n}.r`} />
      </div>
    </Card>
  );
}

function Lfo({ n }: { n: 1 | 2 | 3 }) {
  const p = getPatch();
  const sync = p.o[`lfo${n}Sync` as const];
  const divs = ['4/1', '2/1', '1/1', '1/2', '1/4', '1/8', '1/16', '1/32', '1/4t', '1/8t', '1/16t', '1/4.', '1/8.'];
  return (
    <Card class="lfo" title={`LFO${n}`} right={<ModChip src={`lfo${n}` as ModSource} />}>
      <div class="lfo-row">
        <Select value={p.o[`lfo${n}Shape` as const]} onChange={(v) => opt(`lfo${n}Shape`, v)} options={LFO_SHAPES} label="形" />
        <Seg small value={sync ? 'sync' : 'free'} onChange={(v) => opt(`lfo${n}Sync`, v === 'sync')} options={[{ id: 'free', label: 'Hz' }, { id: 'sync', label: 'テンポ同期' }]} />
        <Seg small value={p.o[`lfo${n}Mode` as const]} onChange={(v) => opt(`lfo${n}Mode`, v)} options={[{ id: 'free', label: 'フリー' }, { id: 'retrig', label: '毎回リセット' }]} />
      </div>
      <div class="knobs">
        {sync ? (
          <label class="select inline"><span class="slabel">長さ</span>
            <select value={p.o[`lfo${n}Div` as const]} onChange={(e) => opt(`lfo${n}Div`, (e.target as HTMLSelectElement).value)}>
              {divs.map((d) => <option value={d}>{DIV_LABELS[d] ?? d}</option>)}
            </select>
          </label>
        ) : <PK id={`lfo${n}.rate`} />}
        <PK id={`lfo${n}.phase`} />
        <PK id={`lfo${n}.fade`} />
      </div>
    </Card>
  );
}

/** Drag source chip: drag onto a knob (mouse or touch), or tap to enter assign mode. */
function ModChip({ src }: { src: ModSource }) {
  const s = MOD_SOURCES.find((x) => x.id === src)!;
  const active = modAssign.value === src;
  const ghost = useRef<HTMLDivElement | null>(null);
  const start = useRef<{ x: number; y: number; moved: boolean } | null>(null);
  const onDown = (e: PointerEvent) => {
    (e.currentTarget as HTMLElement).setPointerCapture(e.pointerId);
    start.current = { x: e.clientX, y: e.clientY, moved: false };
  };
  const onMove = (e: PointerEvent) => {
    const st = start.current;
    if (!st) return;
    if (!st.moved && Math.hypot(e.clientX - st.x, e.clientY - st.y) > 8) {
      st.moved = true;
      const g = document.createElement('div');
      g.className = 'drag-ghost';
      g.textContent = s.label;
      g.style.background = s.color;
      document.body.appendChild(g);
      ghost.current = g;
      document.body.classList.add('mod-dragging');
    }
    if (ghost.current) {
      ghost.current.style.left = e.clientX + 'px';
      ghost.current.style.top = e.clientY + 'px';
      document.querySelectorAll('.knob.droptarget').forEach((x) => x.classList.remove('droptarget'));
      const k = document.elementsFromPoint(e.clientX, e.clientY).map((x) => (x as HTMLElement).closest?.('[data-mod-target]')).find(Boolean) as HTMLElement | undefined;
      k?.classList.add('droptarget');
    }
  };
  const onUp = (e: PointerEvent) => {
    const st = start.current;
    start.current = null;
    if (ghost.current) {
      ghost.current.remove();
      ghost.current = null;
      document.body.classList.remove('mod-dragging');
      document.querySelectorAll('.knob.droptarget').forEach((x) => x.classList.remove('droptarget'));
      const k = document.elementsFromPoint(e.clientX, e.clientY).map((x) => (x as HTMLElement).closest?.('[data-mod-target]')).find(Boolean) as HTMLElement | undefined;
      const dst = k?.dataset.modTarget;
      if (dst) {
        const exists = getPatch().mods.some((m) => m.src === src && m.dst === dst);
        if (!exists) setMod(src, dst, 0.3);
        modAssign.value = src;
        toast(`${s.label} → ${PARAM_MAP[dst].group} ${PARAM_MAP[dst].label}。ノブを上下にドラッグで量を調整`, 'ok');
      }
      return;
    }
    if (st && !st.moved) modAssign.value = active ? null : src;
  };
  return (
    <button type="button" class={`modchip ${active ? 'on' : ''}`} style={{ '--c': s.color } as never}
      onPointerDown={onDown as never} onPointerMove={onMove as never} onPointerUp={onUp as never} onPointerCancel={() => { start.current = null; ghost.current?.remove(); ghost.current = null; }}
      title="ノブにドラッグ、またはタップしてからノブを操作">
      {s.label}
    </button>
  );
}

function ModMatrix() {
  const p = getPatch();
  if (!p.mods.length) return <div class="hint">まだモジュレーションはありません。上の色つきチップをノブにドラッグしてみて！</div>;
  return (
    <div class="modlist">
      {p.mods.map((m) => {
        const s = MOD_SOURCES.find((x) => x.id === m.src)!;
        const d = PARAM_MAP[m.dst];
        return (
          <div class="modrow">
            <span class="modchip static" style={{ '--c': s.color } as never}>{s.label}</span>
            <span class="arrow">→</span>
            <span class="dst">{d.group} {d.label}</span>
            <input type="range" min={-1} max={1} step={0.01} value={m.amt} aria-label="量" onInput={(e) => setMod(m.src, m.dst, Number((e.target as HTMLInputElement).value) || 0.001)} />
            <span class="amt">{Math.round(m.amt * 100)}%</span>
            <Btn icon="close" label="削除" onClick={() => setMod(m.src, m.dst, null)} />
          </div>
        );
      })}
    </div>
  );
}

function PresetBar() {
  const part = soundPart.value;
  const p = getPatch();
  const [user, setUser] = useState<Patch[]>([]);
  const [open, setOpen] = useState(false);
  useEffect(() => { listUserPatches().then(setUser).catch(() => {}); }, [open]);
  const builtin = part === 0 ? [...CHORD_PRESETS, ...MELODY_PRESETS] : part === 1 ? BASS_PRESETS : [...MELODY_PRESETS, ...CHORD_PRESETS];
  const cats = [...new Set(builtin.map((b) => b.cat))];
  const pick = (x: Patch) => {
    setPatch(() => JSON.parse(JSON.stringify(x)));
    const notes = part === 1 ? [36, 43] : part === 2 ? [72] : previewNotes(diatonicChord(memo.value.key, 0, true));
    audio.audition(notes, 900, part);
  };
  const save = async (asNew: boolean) => {
    const name = await promptDialog('音色の名前', p.user && !asNew ? p.name : p.name + (p.user ? '' : '（マイ）'));
    if (!name) return;
    const saved = await saveUserPatch({ ...p, name, cat: 'マイ音色', id: asNew ? undefined : p.id, user: asNew ? false : p.user });
    setPatch(() => saved);
    setUser(await listUserPatches());
    toast(`「${name}」を保存したよ`, 'ok');
  };
  return (
    <div class="presetbar">
      <Seg value={part} onChange={(v) => { soundPart.value = v; modAssign.value = null; }} options={PART_LABELS.map((l, i) => ({ id: i as 0 | 1 | 2, label: l }))} label="パート" />
      <button type="button" class="preset-name" onClick={() => setOpen(!open)} aria-expanded={open}>
        <span>{p.name}</span><small>{p.cat}</small><b>▾</b>
      </button>
      <Btn class="txt" onClick={() => save(false)} label="この音色を保存">保存</Btn>
      {open && (
        <div class="preset-list">
          {cats.map((c) => (
            <div class="pl-group">
              <div class="mini-label">{c}</div>
              <div class="pl-items">{builtin.filter((b) => b.cat === c).map((b) => <button type="button" class={`chip ${b.name === p.name ? 'on' : ''}`} onClick={() => pick(b)}>{b.name}</button>)}</div>
            </div>
          ))}
          <div class="pl-group">
            <div class="mini-label">マイ音色</div>
            <div class="pl-items">
              {user.length ? user.map((u) => (
                <span class="chip-x">
                  <button type="button" class={`chip ${u.id === p.id ? 'on' : ''}`} onClick={() => pick(u)}>{u.name}</button>
                  <button type="button" class="x" aria-label="削除" onClick={async () => { if (await confirmDialog(`「${u.name}」を削除しますか？`, '', '削除', true)) { await deleteUserPatch(u.id!); setUser(await listUserPatches()); } }}>×</button>
                </span>
              )) : <span class="hint">「保存」で今の音色をマイ音色にできるよ</span>}
            </div>
          </div>
          <Btn class="txt" onClick={() => save(true)}>名前を付けて新規保存</Btn>
        </div>
      )}
    </div>
  );
}

export function SoundPanel() {
  const p = getPatch();
  const assign = modAssign.value;
  void ALL_BUILTIN_PATCHES;
  return (
    <div class="sound">
      <PresetBar />
      <div class="modbar">
        <span class="mini-label">モジュレーション</span>
        {MOD_SOURCES.filter((s) => s.id !== 'env1').map((s) => <ModChip src={s.id} />)}
        {assign && <Btn class="txt done" onClick={() => (modAssign.value = null)}>完了</Btn>}
      </div>
      {!assign && <div class="hint">ノブは{narrow.value ? '左右' : '上下'}にドラッグ・ダブルタップで初期値。色つきチップをノブに重ねるとモジュレーション（Vital風）</div>}
      {assign && <div class="hint assign">🎯 {MOD_SOURCES.find((x) => x.id === assign)!.label} を割り当て中：光っているノブを上下ドラッグで量を決める（タップで追加、ダブルタップで解除）</div>}
      <div class="synth-grid">
        <Osc n={1} /><Osc n={2} /><Osc n={3} />
        <Card class="filter" title={<Toggle small value={p.o.filterOn} onChange={(v) => opt('filterOn', v)} label="FILTER" />}
          right={<Seg small value={p.o.filterType} onChange={(v) => opt('filterType', v)} options={FILTER_TYPES} />}>
          <FilterCurve type={p.o.filterType} cutoff={p.p['filter.cutoff']} res={p.p['filter.res']} />
          <div class="knobs"><PK id="filter.cutoff" /><PK id="filter.res" /><PK id="filter.drive" /><PK id="filter.key" /><PK id="noise.level" /></div>
        </Card>
        <Card class="amp" title="AMP">
          <div class="knobs"><PK id="amp.level" /><PK id="amp.vel" /><PK id="amp.glide" /></div>
        </Card>
        <Env n={1} /><Env n={2} /><Env n={3} />
        <Lfo n={1} /><Lfo n={2} /><Lfo n={3} />
        <Card class="matrix" title="モジュレーション一覧"><ModMatrix /></Card>
      </div>
    </div>
  );
}
