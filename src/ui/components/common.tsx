// Small shared UI building blocks: icons, buttons, segmented controls, toggles, sliders, knobs.
import { ComponentChildren, JSX } from 'preact';
import { useEffect, useRef, useState } from 'preact/hooks';
import { modAssign } from '../state';
import { MOD_SOURCES, ModSource } from '../../audio/params';

// ---- icons -------------------------------------------------------------------

const PATHS: Record<string, string> = {
  play: 'M7 5v14l12-7z',
  stop: 'M6 6h12v12H6z',
  start: 'M6 5h2v14H6zM20 5v14L9 12z',
  loop: 'M17 2l4 4-4 4V7H7a3 3 0 0 0-3 3v1H2v-1a5 5 0 0 1 5-5h10zM7 22l-4-4 4-4v3h10a3 3 0 0 0 3-3v-1h2v1a5 5 0 0 1-5 5H7z',
  metro: 'M12 2l5 18H7zM12 9l4-3',
  undo: 'M9 7V3L2 10l7 7v-4.1c5 0 8.5 1.6 11 5.1-1-5-4-10-11-11z',
  redo: 'M15 7V3l7 7-7 7v-4.1c-5 0-8.5 1.6-11 5.1 1-5 4-10 11-11z',
  list: 'M3 5h18v2H3zM3 11h18v2H3zM3 17h18v2H3z',
  plus: 'M11 4h2v7h7v2h-7v7h-2v-7H4v-2h7z',
  share: 'M18 16a3 3 0 0 0-2.4 1.2l-6.8-3.4a3 3 0 0 0 0-1.6l6.8-3.4A3 3 0 1 0 15 7l-6.8 3.4a3 3 0 1 0 0 3.2L15 17a3 3 0 1 0 3-1z',
  trash: 'M9 3h6l1 2h4v2H4V5h4zM6 9h12l-1 12H7z',
  copy: 'M8 8h12v12H8zM4 4h12v2H6v10H4z',
  split: 'M11 3h2v18h-2zM4 8l4 4-4 4zM20 8l-4 4 4 4z',
  left: 'M15 5l-7 7 7 7',
  right: 'M9 5l7 7-7 7',
  star: 'M12 3l2.8 5.8 6.2.9-4.5 4.4 1.1 6.2L12 17.3l-5.6 3 1.1-6.2L3 9.7l6.2-.9z',
  search: 'M10 3a7 7 0 0 1 5.6 11.2l5.1 5.1-1.4 1.4-5.1-5.1A7 7 0 1 1 10 3zm0 2a5 5 0 1 0 0 10 5 5 0 0 0 0-10z',
  more: 'M5 10a2 2 0 1 1 0 4 2 2 0 0 1 0-4zm7 0a2 2 0 1 1 0 4 2 2 0 0 1 0-4zm7 0a2 2 0 1 1 0 4 2 2 0 0 1 0-4z',
  close: 'M6.4 5L12 10.6 17.6 5 19 6.4 13.4 12 19 17.6 17.6 19 12 13.4 6.4 19 5 17.6 10.6 12 5 6.4z',
  mic: 'M12 2a3 3 0 0 1 3 3v6a3 3 0 0 1-6 0V5a3 3 0 0 1 3-3zm7 9a7 7 0 0 1-6 6.9V21h-2v-3.1A7 7 0 0 1 5 11h2a5 5 0 0 0 10 0z',
  piano: 'M3 4h18v16H3zM8 4v9M12 4v9M16 4v9M6 4v6h4M14 4v6h4',
  dice: 'M5 3h14a2 2 0 0 1 2 2v14a2 2 0 0 1-2 2H5a2 2 0 0 1-2-2V5a2 2 0 0 1 2-2zm3 3a1.5 1.5 0 1 0 0 3 1.5 1.5 0 0 0 0-3zm8 9a1.5 1.5 0 1 0 0 3 1.5 1.5 0 0 0 0-3zm-4-4.5a1.5 1.5 0 1 0 0 3 1.5 1.5 0 0 0 0-3z',
  download: 'M11 3h2v9l3-3 1.4 1.4L12 15.8l-5.4-5.4L8 9l3 3zM4 18h16v2H4z',
  upload: 'M11 21h2v-9l3 3 1.4-1.4L12 8.2l-5.4 5.4L8 15l3-3zM4 4h16v2H4z',
  gear: 'M12 8a4 4 0 1 1 0 8 4 4 0 0 1 0-8zm9 5.5v-3l-2.3-.6a7 7 0 0 0-.7-1.7l1.2-2-2.1-2.1-2 1.2a7 7 0 0 0-1.7-.7L13 2h-3l-.6 2.3a7 7 0 0 0-1.7.7l-2-1.2-2.1 2.1 1.2 2a7 7 0 0 0-.7 1.7L2 10.5v3l2.3.6c.2.6.4 1.2.7 1.7l-1.2 2 2.1 2.1 2-1.2c.5.3 1.1.5 1.7.7L10 22h3l.6-2.3a7 7 0 0 0 1.7-.7l2 1.2 2.1-2.1-1.2-2c.3-.5.5-1.1.7-1.7z',
  wand: 'M3 19l11-11 2 2L5 21zM15 3l1 2 2 1-2 1-1 2-1-2-2-1 2-1zM19 9l.7 1.3L21 11l-1.3.7L19 13l-.7-1.3L17 11l1.3-.7z',
  edit: 'M4 17.2V20h2.8l8.3-8.3-2.8-2.8zM19.7 7.1a1 1 0 0 0 0-1.4l-1.4-1.4a1 1 0 0 0-1.4 0l-1.3 1.3 2.8 2.8z',
  help: 'M12 2a10 10 0 1 1 0 20 10 10 0 0 1 0-20zm0 15a1.2 1.2 0 1 0 0 2.4 1.2 1.2 0 0 0 0-2.4zm.1-11c-2 0-3.6 1.3-3.8 3.3h2.1c.1-.9.8-1.4 1.6-1.4.9 0 1.6.6 1.6 1.4 0 .7-.4 1.1-1.3 1.7-1 .7-1.5 1.4-1.4 2.7v.4h2.1v-.3c0-.8.3-1.1 1.2-1.7 1-.7 1.7-1.5 1.7-2.9 0-1.9-1.6-3.2-3.8-3.2z',
  midi: 'M12 2a10 10 0 1 1 0 20 10 10 0 0 1 0-20zm-5 9a1.3 1.3 0 1 0 0 2.6A1.3 1.3 0 0 0 7 11zm10 0a1.3 1.3 0 1 0 0 2.6 1.3 1.3 0 0 0 0-2.6zM12 6a1.3 1.3 0 1 0 0 2.6A1.3 1.3 0 0 0 12 6zm-3.5 9a1.3 1.3 0 1 0 0 2.6 1.3 1.3 0 0 0 0-2.6zm7 0a1.3 1.3 0 1 0 0 2.6 1.3 1.3 0 0 0 0-2.6z',
  bolt: 'M13 2L4 14h7l-1 8 9-12h-7z',
  drag: 'M9 4h2v2H9zM13 4h2v2h-2zM9 9h2v2H9zM13 9h2v2h-2zM9 14h2v2H9zM13 14h2v2h-2zM9 19h2v2H9zM13 19h2v2h-2z',
  up: 'M5 15l7-7 7 7',
  down: 'M5 9l7 7 7-7',
};

export function Icon({ name, size = 20 }: { name: keyof typeof PATHS | string; size?: number }) {
  const stroke = name === 'left' || name === 'right' || name === 'up' || name === 'down';
  return (
    <svg class="icon" width={size} height={size} viewBox="0 0 24 24" aria-hidden="true">
      <path d={PATHS[name] ?? ''} fill={stroke ? 'none' : 'currentColor'} stroke={stroke ? 'currentColor' : 'none'} stroke-width={stroke ? 2.4 : 0} stroke-linecap="round" stroke-linejoin="round" />
    </svg>
  );
}

// ---- buttons --------------------------------------------------------------------

export function Btn(props: JSX.ButtonHTMLAttributes<HTMLButtonElement> & { icon?: string; kind?: 'primary' | 'ghost' | 'danger' | 'chip'; active?: boolean; label?: string }) {
  const { icon, kind, active, label, children, class: cls, ...rest } = props;
  return (
    <button type="button" class={`btn ${kind ?? ''} ${active ? 'on' : ''} ${cls ?? ''}`} aria-pressed={active === undefined ? undefined : active} title={label} aria-label={label} {...rest}>
      {icon && <Icon name={icon} />}
      {children}
    </button>
  );
}

export function Seg<T extends string | number>({ value, options, onChange, small, label }: { value: T; options: { id: T; label: ComponentChildren; title?: string }[]; onChange: (v: T) => void; small?: boolean; label?: string }) {
  return (
    <div class={`seg ${small ? 'small' : ''}`} role="radiogroup" aria-label={label}>
      {options.map((o) => (
        <button type="button" role="radio" aria-checked={o.id === value} class={o.id === value ? 'on' : ''} title={o.title} onClick={() => onChange(o.id)}>
          {o.label}
        </button>
      ))}
    </div>
  );
}

export function Toggle({ value, onChange, label, small }: { value: boolean; onChange: (v: boolean) => void; label?: ComponentChildren; small?: boolean }) {
  return (
    <label class={`toggle ${small ? 'small' : ''}`}>
      <input type="checkbox" checked={value} onChange={(e) => onChange((e.target as HTMLInputElement).checked)} />
      <span class="track"><span class="thumb" /></span>
      {label && <span class="tlabel">{label}</span>}
    </label>
  );
}

export function Slider({ value, min, max, step = 0.01, onChange, onEnd, label, format, wide }: {
  value: number; min: number; max: number; step?: number; onChange: (v: number) => void; onEnd?: () => void;
  label?: string; format?: (v: number) => string; wide?: boolean;
}) {
  return (
    <label class={`slider ${wide ? 'wide' : ''}`}>
      {label && <span class="slabel">{label}</span>}
      <input type="range" min={min} max={max} step={step} value={value} aria-label={label}
        onInput={(e) => onChange(Number((e.target as HTMLInputElement).value))}
        onChange={() => onEnd?.()} />
      <span class="sval">{format ? format(value) : value.toFixed(2)}</span>
    </label>
  );
}

export function Select<T extends string>({ value, options, onChange, label }: { value: T; options: { id: T; label: string }[]; onChange: (v: T) => void; label?: string }) {
  return (
    <label class="select">
      {label && <span class="slabel">{label}</span>}
      <select value={value} aria-label={label} onChange={(e) => onChange((e.target as HTMLSelectElement).value as T)}>
        {options.map((o) => <option value={o.id}>{o.label}</option>)}
      </select>
    </label>
  );
}

// ---- knob ----------------------------------------------------------------------------

export interface KnobMod {
  src: ModSource;
  amt: number;
}

export interface KnobProps {
  label: string;
  /** Normalised 0…1 value. */
  value: number;
  def?: number;
  display: string;
  onChange: (n: number) => void;
  onEnd?: () => void;
  size?: number;
  bipolar?: boolean;
  /** Modulation routes on this knob (amounts in the normalised range). */
  mods?: KnobMod[];
  modTarget?: string;
  onMod?: (src: ModSource, amt: number | null) => void;
  steps?: number;
  disabled?: boolean;
}

const SRC_COLOR: Record<string, string> = Object.fromEntries(MOD_SOURCES.map((s) => [s.id, s.color]));

function arc(cx: number, cy: number, r: number, a0: number, a1: number) {
  const p = (a: number) => [cx + r * Math.cos(a), cy + r * Math.sin(a)];
  const [x0, y0] = p(a0);
  const [x1, y1] = p(a1);
  const large = Math.abs(a1 - a0) > Math.PI ? 1 : 0;
  const sweep = a1 > a0 ? 1 : 0;
  return `M${x0.toFixed(2)} ${y0.toFixed(2)}A${r} ${r} 0 ${large} ${sweep} ${x1.toFixed(2)} ${y1.toFixed(2)}`;
}

const A0 = Math.PI * 0.75;
const A1 = Math.PI * 2.25;

/**
 * Drag up/down (or scroll) to change; double-tap resets. In modulation-assign mode
 * (a source chip is active) the drag sets that source's amount instead — like Vital.
 */
export function Knob(p: KnobProps) {
  const size = p.size ?? 46;
  const ref = useRef<HTMLDivElement>(null);
  const drag = useRef<{ y: number; x: number; v: number; moved: boolean; fine: boolean; mode: 'value' | 'mod'; amt0: number; touch: boolean } | null>(null);
  const lastTap = useRef(0);
  const [showVal, setShowVal] = useState(false);
  const assign = modAssign.value;
  const canMod = !!p.modTarget && !!p.onMod;
  const activeMod = assign && canMod ? p.mods?.find((m) => m.src === assign) : undefined;

  const quant = (n: number) => {
    let v = Math.min(1, Math.max(0, n));
    if (p.steps && p.steps > 1) v = Math.round(v * (p.steps - 1)) / (p.steps - 1);
    return v;
  };

  const onDown = (e: PointerEvent) => {
    if (p.disabled) return;
    (e.currentTarget as HTMLElement).setPointerCapture(e.pointerId);
    if (e.pointerType === 'mouse') (e.currentTarget as HTMLElement).focus({ preventScroll: true });
    const mode = assign && canMod ? 'mod' : 'value';
    drag.current = { y: e.clientY, x: e.clientX, v: p.value, moved: false, fine: e.shiftKey, mode, amt0: activeMod?.amt ?? 0, touch: e.pointerType === 'touch' };
    setShowVal(true);
    if (e.pointerType !== 'touch') e.preventDefault();
  };
  const onMove = (e: PointerEvent) => {
    const d = drag.current;
    if (!d) return;
    // Touch: horizontal drag (vertical swipes keep scrolling the page). Mouse: vertical drag.
    const dy = d.touch ? (e.clientX - d.x) * 1.2 : d.y - e.clientY + (e.clientX - d.x) * 0.25;
    if (Math.abs(dy) > 2) d.moved = true;
    const range = e.shiftKey ? 600 : 180;
    if (d.mode === 'mod') {
      const amt = Math.max(-1, Math.min(1, d.amt0 + dy / range));
      p.onMod!(assign!, Math.abs(amt) < 0.005 ? 0.005 * Math.sign(amt || 1) : amt);
    } else p.onChange(quant(d.v + dy / range));
  };
  const onUp = () => {
    const d = drag.current;
    drag.current = null;
    setShowVal(false);
    if (!d) return;
    const now = Date.now();
    if (!d.moved) {
      if (d.mode === 'mod') {
        // Tap: create the route with a sensible amount, tap again to remove.
        if (now - lastTap.current < 350 && activeMod) p.onMod!(assign!, null);
        else if (!activeMod) p.onMod!(assign!, 0.25);
      } else if (now - lastTap.current < 350 && p.def !== undefined) {
        p.onChange(p.def);
      }
      lastTap.current = now;
    }
    p.onEnd?.();
  };
  const onWheel = (e: WheelEvent) => {
    if (p.disabled) return;
    // Only a focused knob (clicked/tabbed) takes the wheel, so page scrolling keeps working.
    if (document.activeElement !== ref.current) return;
    e.preventDefault();
    const step = p.steps && p.steps > 1 && p.steps <= 25 ? 1 / (p.steps - 1) : e.shiftKey ? 0.002 : 0.01;
    p.onChange(quant(p.value - Math.sign(e.deltaY) * step));
    p.onEnd?.();
  };
  const onKey = (e: KeyboardEvent) => {
    const step = p.steps && p.steps > 1 ? 1 / (p.steps - 1) : e.shiftKey ? 0.002 : 0.02;
    if (e.key === 'ArrowUp' || e.key === 'ArrowRight') { p.onChange(quant(p.value + step)); p.onEnd?.(); e.preventDefault(); e.stopPropagation(); }
    if (e.key === 'ArrowDown' || e.key === 'ArrowLeft') { p.onChange(quant(p.value - step)); p.onEnd?.(); e.preventDefault(); e.stopPropagation(); }
  };
  useEffect(() => {
    const el = ref.current;
    if (!el) return;
    el.addEventListener('wheel', onWheel, { passive: false });
    return () => el.removeEventListener('wheel', onWheel);
  });

  const cx = size / 2, cy = size / 2, r = size / 2 - 5;
  const va = A0 + (A1 - A0) * p.value;
  const base = p.bipolar ? A0 + (A1 - A0) * 0.5 : A0;
  const mods = p.mods ?? [];
  return (
    <div class={`knob ${assign && canMod ? 'assignable' : ''} ${activeMod ? 'modding' : ''} ${p.disabled ? 'disabled' : ''}`} style={{ width: size + 18 + 'px' }}
      data-mod-target={p.modTarget}>
      <div ref={ref} class="knob-dial" tabIndex={0} role="slider" aria-label={p.label} aria-valuenow={Math.round(p.value * 100)} aria-valuetext={p.display}
        onPointerDown={onDown as never} onPointerMove={onMove as never} onPointerUp={onUp} onPointerCancel={() => { drag.current = null; setShowVal(false); }} onKeyDown={onKey as never}
        style={{ width: size + 'px', height: size + 'px', touchAction: 'pan-y' }}>
        <svg width={size} height={size}>
          <path d={arc(cx, cy, r, A0, A1)} class="k-track" />
          <path d={arc(cx, cy, r, Math.min(base, va), Math.max(base, va) + 0.0001)} class="k-val" />
          {mods.map((m, i) => {
            const rr = r + 3 + (i % 3) * 2.2;
            const to = Math.min(1, Math.max(0, p.value + m.amt));
            const a = A0 + (A1 - A0) * to;
            return <path d={arc(cx, cy, rr, Math.min(va, a), Math.max(va, a) + 0.0001)} stroke={SRC_COLOR[m.src]} class={`k-mod ${assign === m.src ? 'hot' : ''}`} />;
          })}
          <line x1={cx + (r - 9) * Math.cos(va)} y1={cy + (r - 9) * Math.sin(va)} x2={cx + (r - 1) * Math.cos(va)} y2={cy + (r - 1) * Math.sin(va)} class="k-ptr" />
        </svg>
        {(showVal || activeMod) && <div class="k-pop">{activeMod ? `${(activeMod.amt * 100).toFixed(0)}%` : p.display}</div>}
      </div>
      <div class="k-label">{p.label}</div>
      <div class="k-value">{p.display}</div>
    </div>
  );
}

export function Card({ title, children, right, class: cls, id }: { title?: ComponentChildren; children: ComponentChildren; right?: ComponentChildren; class?: string; id?: string }) {
  return (
    <section class={`card ${cls ?? ''}`} id={id}>
      {(title || right) && <header class="card-h"><h3>{title}</h3><div class="card-r">{right}</div></header>}
      {children}
    </section>
  );
}

export function useLongPress(cb: () => void, ms = 450) {
  const t = useRef<ReturnType<typeof setTimeout> | null>(null);
  return {
    onPointerDown: () => { t.current = setTimeout(cb, ms); },
    onPointerUp: () => { if (t.current) clearTimeout(t.current); },
    onPointerLeave: () => { if (t.current) clearTimeout(t.current); },
    onPointerCancel: () => { if (t.current) clearTimeout(t.current); },
  };
}
