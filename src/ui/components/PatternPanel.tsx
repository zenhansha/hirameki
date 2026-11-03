// Patterns (HOW chords are played) + bass line + pumping + groove.
import { useState } from 'preact/hooks';
import { memo, patternScope, selection, side, commit, soundPart, tab, sideTab, narrow } from '../state';
import { PATTERN_PRESETS, PatternPreset, patternName } from '../../presets/patterns';
import { ArpMode, PatternSpec, RES_LABELS, StepRes, normalizePattern, pumpGain } from '../../seq/pattern';
import { BASS_STYLES } from '../../seq/bass';
import { BASS_PRESETS } from '../../presets/synth';
import { DIV_LABELS } from '../../seq/time';
import { findItem, sideOf } from '../../seq/timeline';
import { applyPattern, clearPatternOverride, updateMemo } from '../actions';
import { Btn, Card, Seg, Select, Slider, Toggle } from './common';

const CATS: PatternPreset['cat'][] = ['刻み', 'アルペジオ', 'ストラム', 'ポンピング'];

function Mini({ p }: { p: PatternSpec }) {
  const steps = p.steps.length > 16 ? p.steps.slice(0, 16) : p.steps;
  const cells = p.res === 'bar' ? steps.slice(0, 8) : steps;
  return (
    <div class={`mini-steps k-${p.kind}`}>
      {cells.split('').map((c, i) => <i class={c === 'X' ? 'acc' : c === 'x' ? 'hit' : c === '-' ? 'hold' : ''} style={p.kind === 'arp' && (c === 'x' || c === 'X') ? { transform: `translateY(${-((i * 3) % 7) * 1.5}px)` } : undefined} />)}
    </div>
  );
}

/** The pattern being edited: memo pattern, or the selected chord's override. */
function currentPattern(): { p: PatternSpec; override: boolean } {
  const m = memo.value;
  if (patternScope.value === 'sel' && selection.value.length) {
    const it = findItem(m.chords, selection.value[0]);
    if (it) {
      const s = sideOf(it, side.value);
      return { p: s.pat ?? m.pattern, override: !!s.pat };
    }
  }
  return { p: m.pattern, override: false };
}

function editPattern(fn: (p: PatternSpec) => PatternSpec) {
  const { p } = currentPattern();
  const next = normalizePattern(fn(p));
  const scope = patternScope.value === 'sel' && selection.value.length ? 'sel' : 'all';
  if (scope === 'sel') applyPattern(next, 'sel');
  else commit((m) => ({ ...m, pattern: next }), { coalesce: 'pattern-edit' });
}

const RES_OPTS: StepRes[] = ['bar', '1', '2', '4', '4.', '8', '8.', '8t', '16', '16t', '32'];

function StepGrid() {
  const { p } = currentPattern();
  const cycle = (ch: string) => (ch === '.' ? 'x' : ch === 'x' ? 'X' : ch === 'X' ? '-' : '.');
  const set = (i: number) => editPattern((pp) => ({ ...pp, steps: pp.steps.slice(0, i) + cycle(pp.steps[i]) + pp.steps.slice(i + 1) }));
  const len = (d: number) => editPattern((pp) => {
    const n = Math.max(1, Math.min(32, pp.steps.length + d));
    return { ...pp, steps: n > pp.steps.length ? pp.steps + '.'.repeat(n - pp.steps.length) : pp.steps.slice(0, n) };
  });
  return (
    <div class="stepgrid">
      <div class="sg-cells">
        {p.steps.split('').map((c, i) => (
          <button type="button" class={`cell ${c === 'X' ? 'acc' : c === 'x' ? 'hit' : c === '-' ? 'hold' : ''} ${i % 4 === 0 ? 'b4' : ''}`} onClick={() => set(i)} aria-label={`ステップ${i + 1}`}>
            {c === '-' ? '–' : ''}
          </button>
        ))}
      </div>
      <div class="sg-ctl">
        <button type="button" class="mini" onClick={() => len(-1)} aria-label="ステップを減らす">−</button>
        <span>{p.steps.length}ステップ</span>
        <button type="button" class="mini" onClick={() => len(1)} aria-label="ステップを増やす">＋</button>
        <span class="hint">タップで ・→ 音 → アクセント → 伸ばす</span>
      </div>
    </div>
  );
}

function PumpCurve() {
  const pump = memo.value.pump;
  const pts: string[] = [];
  for (let i = 0; i <= 80; i++) {
    const ph = (i / 80) * 2;
    pts.push(`${(i / 80) * 200},${4 + (1 - pumpGain(ph - pump.offset, pump)) * 40}`);
  }
  return <svg class="pumpc" viewBox="0 0 200 48" preserveAspectRatio="none"><polyline points={pts.join(' ')} /></svg>;
}

export function PatternPanel() {
  const m = memo.value;
  const [cat, setCat] = useState<PatternPreset['cat']>('刻み');
  const { p, override } = currentPattern();
  const hasSel = selection.value.length > 0;
  const scope = hasSel ? patternScope.value : 'all';
  const pump = m.pump;
  const bass = m.bass;
  return (
    <div class="patterns">
      <Card title="パターン" right={hasSel ? (
        <Seg small value={scope} onChange={(v) => (patternScope.value = v)} options={[{ id: 'all', label: '全体' }, { id: 'sel', label: '選択中のコードだけ' }]} />
      ) : <span class="hint">今：{patternName(m.pattern)}</span>}>
        <Seg value={cat} onChange={setCat} options={CATS.map((c) => ({ id: c, label: c }))} />
        <div class="pp-grid">
          {PATTERN_PRESETS.filter((x) => x.cat === cat).map((x) => {
            const on = JSON.stringify(x.pattern) === JSON.stringify(p);
            return (
              <button type="button" class={`pp ${on ? 'on' : ''}`} title={x.desc} onClick={() => applyPattern(x.pattern, scope, scope === 'all' ? x.pump : undefined)}>
                <Mini p={x.pattern} />
                <b>{x.name}</b>
                <small>{x.desc}</small>
              </button>
            );
          })}
        </div>
        {scope === 'sel' && override && <Btn class="txt" onClick={clearPatternOverride}>このコードの個別パターンを解除</Btn>}
      </Card>

      <Card title={`パターン編集：${patternName(p)}`}>
        <div class="row wrap">
          <Seg value={p.kind} onChange={(v) => editPattern((pp) => ({ ...pp, kind: v }))} options={[{ id: 'block', label: '刻み' }, { id: 'arp', label: 'アルペジオ' }, { id: 'strum', label: 'ストラム' }]} />
          <Select value={p.res} onChange={(v) => editPattern((pp) => ({ ...pp, res: v }))} options={RES_OPTS.map((r) => ({ id: r, label: RES_LABELS[r] }))} label="1ステップ" />
        </div>
        <StepGrid />
        <div class="row wrap">
          <Slider label="ゲート" min={0.05} max={1} value={p.gate} onChange={(v) => editPattern((pp) => ({ ...pp, gate: v }))} format={(v) => Math.round(v * 100) + '%'} />
          <Slider label="強さ" min={0.1} max={1} value={p.vel} onChange={(v) => editPattern((pp) => ({ ...pp, vel: v }))} format={(v) => Math.round(v * 100) + '%'} />
          <Slider label="アクセント" min={0} max={0.6} value={p.accent} onChange={(v) => editPattern((pp) => ({ ...pp, accent: v }))} format={(v) => '+' + Math.round(v * 100) + '%'} />
          <Select value={String(p.oct)} onChange={(v) => editPattern((pp) => ({ ...pp, oct: Number(v) }))} options={['-2', '-1', '0', '1', '2'].map((o) => ({ id: o, label: (Number(o) > 0 ? '+' : '') + o + 'oct' }))} label="音域" />
          <Toggle small value={p.retrig} onChange={(v) => editPattern((pp) => ({ ...pp, retrig: v }))} label="コード頭で必ず鳴らす" />
        </div>
        {p.kind === 'arp' && (
          <div class="row wrap">
            <Select value={p.arp.mode} onChange={(v) => editPattern((pp) => ({ ...pp, arp: { ...pp.arp, mode: v as ArpMode } }))} label="順番" options={[
              { id: 'up', label: '上昇' }, { id: 'down', label: '下降' }, { id: 'updown', label: '往復（上→下）' }, { id: 'downup', label: '往復（下→上）' }, { id: 'random', label: 'ランダム' }, { id: 'inout', label: '外→内' },
            ]} />
            <Select value={String(p.arp.octaves)} onChange={(v) => editPattern((pp) => ({ ...pp, arp: { ...pp.arp, octaves: Number(v) } }))} label="オクターブ幅" options={['1', '2', '3', '4'].map((o) => ({ id: o, label: o + 'oct' }))} />
            <Select value={String(p.arp.start)} onChange={(v) => editPattern((pp) => ({ ...pp, arp: { ...pp.arp, start: Number(v) } }))} label="開始音" options={['0', '1', '2', '3', '4'].map((o) => ({ id: o, label: o === '0' ? '1番目（最初）' : `${Number(o) + 1}番目` }))} />
          </div>
        )}
        {p.kind === 'strum' && (
          <div class="row wrap">
            <Seg value={p.strum.dir} onChange={(v) => editPattern((pp) => ({ ...pp, strum: { ...pp.strum, dir: v } }))} options={[{ id: 'down', label: '下から（ダウン）' }, { id: 'up', label: '上から（アップ）' }, { id: 'alt', label: '交互' }]} />
            <Slider label="速さ" min={2} max={80} step={1} value={p.strum.speed} onChange={(v) => editPattern((pp) => ({ ...pp, strum: { ...pp.strum, speed: v } }))} format={(v) => Math.round(v) + 'ms'} />
          </div>
        )}
      </Card>

      <Card title="グルーヴ">
        <div class="row wrap">
          <Slider label="スウィング" min={0} max={1} value={m.swing} onChange={(v) => updateMemo({ swing: v }, 'swing')} format={(v) => Math.round(50 + v * 25) + '%'} />
          <Seg small value={m.swingGrid} onChange={(v) => updateMemo({ swingGrid: v })} options={[{ id: 8, label: '8分' }, { id: 16, label: '16分' }]} />
          <Slider label="タイミングゆらぎ" min={0} max={1} value={m.humanize.time} onChange={(v) => updateMemo({ humanize: { ...m.humanize, time: v } }, 'hum-t')} format={(v) => Math.round(v * 20) + 'ms'} />
          <Slider label="強さのゆらぎ" min={0} max={1} value={m.humanize.vel} onChange={(v) => updateMemo({ humanize: { ...m.humanize, vel: v } }, 'hum-v')} format={(v) => Math.round(v * 35) + '%'} />
          <Toggle small value={m.autoVoice} onChange={(v) => updateMemo({ autoVoice: v })} label="ボイシング自動調整（なめらかにつなぐ）" />
          <Toggle small value={m.tie} onChange={(v) => updateMemo({ tie: v })} label="同じコードが続いたらタイでつなげる（食い・半拍2つも1つの音に）" />
        </div>
      </Card>

      <Card title={<Toggle small value={bass.on} onChange={(v) => updateMemo({ bass: { ...bass, on: v } })} label="自動ベース" />}>
        <div class={`bass-styles ${bass.on ? '' : 'off'}`}>
          {BASS_STYLES.map((s) => (
            <button type="button" class={`chip ${bass.style === s.id ? 'on' : ''}`} title={s.hint} onClick={() => updateMemo({ bass: { ...bass, style: s.id, on: true } })}>{s.label}</button>
          ))}
        </div>
        <div class="row wrap">
          <Select value={BASS_PRESETS.find((b) => b.name === bass.patch.name)?.id ?? 'custom'} label="ベース音色"
            onChange={(id) => { const b = BASS_PRESETS.find((x) => x.id === id); if (b) updateMemo({ bass: { ...bass, patch: JSON.parse(JSON.stringify(b)) } }); }}
            options={[...BASS_PRESETS.map((b) => ({ id: b.id!, label: b.name })), ...(BASS_PRESETS.some((b) => b.name === bass.patch.name) ? [] : [{ id: 'custom', label: bass.patch.name }])]} />
          <Btn class="txt" onClick={() => { soundPart.value = 1; if (narrow.value) tab.value = 'sound'; else sideTab.value = 'sound'; }}>音色を細かく編集 →</Btn>
          <Select value={String(bass.oct)} onChange={(v) => updateMemo({ bass: { ...bass, oct: Number(v) } })} label="音域" options={['-1', '0', '1'].map((o) => ({ id: o, label: (Number(o) > 0 ? '+' : '') + o + 'oct' }))} />
          <Slider label="音量" min={0} max={1} value={bass.vol} onChange={(v) => updateMemo({ bass: { ...bass, vol: v } }, 'bass-vol')} format={(v) => Math.round(v * 100) + '%'} />
        </div>
      </Card>

      <Card title={<Toggle small value={pump.on} onChange={(v) => updateMemo({ pump: { ...pump, on: v } })} label="ポンピング（キックなしサイドチェイン）" />}>
        <div class={`row wrap ${pump.on ? '' : 'dim'}`}>
          <Select value={pump.rate} onChange={(v) => updateMemo({ pump: { ...pump, rate: v } })} label="周期" options={['1/1', '1/2', '1/4', '1/8', '1/4.', '1/8t'].map((d) => ({ id: d, label: DIV_LABELS[d] ?? d }))} />
          <Slider label="深さ" min={0} max={1} value={pump.depth} onChange={(v) => updateMemo({ pump: { ...pump, depth: v } }, 'pump-d')} format={(v) => Math.round(v * 100) + '%'} />
          <Slider label="カーブ" min={0} max={1} value={pump.curve} onChange={(v) => updateMemo({ pump: { ...pump, curve: v } }, 'pump-c')} format={(v) => Math.round(v * 100) + '%'} />
          <Slider label="戻る長さ" min={0.1} max={1} value={pump.length} onChange={(v) => updateMemo({ pump: { ...pump, length: v } }, 'pump-l')} format={(v) => Math.round(v * 100) + '%'} />
          <Slider label="タイミング" min={-0.5} max={0.5} value={pump.offset} onChange={(v) => updateMemo({ pump: { ...pump, offset: v } }, 'pump-o')} format={(v) => (v > 0 ? '+' : '') + Math.round(v * 100) + '%'} />
        </div>
        <PumpCurve />
      </Card>
    </div>
  );
}
