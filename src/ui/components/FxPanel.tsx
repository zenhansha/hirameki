// Effect chain editor: atmosphere presets, add / remove / reorder, ON/OFF and Dry/Wet per effect.
import { useEffect, useState } from 'preact/hooks';
import { memo, commit, settings, updateSettings, toast, promptDialog, confirmDialog } from '../state';
import { FX_DEFS, FX_DEF_MAP, FX_PRESETS, FxItem, FxParamDef, FxType, MAX_FX, fxId, makeFx } from '../../audio/fx/defs';
import { UserFxPreset, deleteUserFx, listUserFx, saveUserFx } from '../../store/repo';
import { audio, Meter } from '../../audio/host';
import { Btn, Card, Icon, Knob, Seg, Toggle } from './common';

function setChain(fn: (items: FxItem[]) => FxItem[], coalesce?: string) {
  commit((m) => ({ ...m, fx: { ...m.fx, items: fn(m.fx.items) } }), { coalesce });
}

function updItem(id: string, patch: Partial<FxItem>, coalesce?: string) {
  setChain((items) => items.map((i) => (i.id === id ? { ...i, ...patch } : i)), coalesce);
}

function toN(pd: FxParamDef, v: number) {
  if (pd.curve === 'exp') return Math.log(v / pd.min!) / Math.log(pd.max! / pd.min!);
  return (v - pd.min!) / (pd.max! - pd.min!);
}
function fromN(pd: FxParamDef, n: number) {
  if (pd.curve === 'exp') return pd.min! * Math.pow(pd.max! / pd.min!, n);
  return pd.min! + n * (pd.max! - pd.min!);
}
function fmt(pd: FxParamDef, v: number) {
  if (pd.unit === 'Hz') return v >= 1000 ? (v / 1000).toFixed(1) + 'k' : v >= 20 ? Math.round(v) + '' : v.toFixed(v < 1 ? 2 : 1) + 'Hz';
  if (pd.unit === 's') return v >= 1 ? v.toFixed(1) + 's' : Math.round(v * 1000) + 'ms';
  if (pd.unit === 'dB') return (v > 0 ? '+' : '') + v.toFixed(1);
  if (pd.id === 'ratio') return v.toFixed(1) + ':1';
  if (pd.id === 'bits' || pd.id === 'down') return Math.round(v) + '';
  if (pd.id === 'width') return Math.round(v * 100) + '%';
  if (pd.id === 'fb') return Math.round(v * 100) + '%';
  return Math.round(v * 100) + '%';
}

function FxCard({ it, index, count }: { it: FxItem; index: number; count: number }) {
  const def = FX_DEF_MAP[it.type];
  const [open, setOpen] = useState(true);
  const move = (d: number) => setChain((items) => {
    const a = [...items];
    const j = index + d;
    if (j < 0 || j >= a.length) return items;
    [a[index], a[j]] = [a[j], a[index]];
    return a;
  });
  const mode = String(it.p.mode ?? '');
  const visible = def.params.filter((pd) => {
    if (it.type === 'distortion') {
      if (pd.id === 'bits' || pd.id === 'down') return mode === 'crush';
    }
    if (it.type === 'filter' && pd.id === 'rate') return Number(it.p.lfo) > 0;
    return true;
  });
  return (
    <div class={`fxcard ${it.on ? '' : 'off'}`} data-fx={it.type}>
      <div class="fx-h">
        <span class="fx-idx">{index + 1}</span>
        <span class="fx-icon">{def.icon}</span>
        <button type="button" class="fx-name" onClick={() => setOpen(!open)} aria-expanded={open}>{def.label}</button>
        <Toggle small value={it.on} onChange={(v) => updItem(it.id, { on: v })} label={it.on ? 'ON' : 'OFF'} />
        <div class="fx-move">
          <Btn icon="up" label="上へ" disabled={index === 0} onClick={() => move(-1)} />
          <Btn icon="down" label="下へ" disabled={index === count - 1} onClick={() => move(1)} />
          <Btn icon="close" label="削除" onClick={() => setChain((items) => items.filter((x) => x.id !== it.id))} />
        </div>
      </div>
      {open && (
        <div class="fx-body">
          <Knob label="Dry/Wet" value={it.mix} def={def.mix} display={Math.round(it.mix * 100) + '%'} onChange={(v) => updItem(it.id, { mix: v }, it.id + 'mix')} />
          {visible.map((pd) => {
            if (pd.kind === 'num') {
              const v = Number(it.p[pd.id]);
              return <Knob label={pd.label} value={toN(pd, v)} def={toN(pd, pd.def as number)} display={fmt(pd, v)} bipolar={pd.min! < 0}
                onChange={(n) => updItem(it.id, { p: { ...it.p, [pd.id]: fromN(pd, n) } }, it.id + pd.id)} />;
            }
            if (pd.kind === 'bool') return <Toggle small value={!!it.p[pd.id]} onChange={(v) => updItem(it.id, { p: { ...it.p, [pd.id]: v } })} label={pd.label} />;
            return (
              <div class="fx-choice">
                <span class="slabel">{pd.label}</span>
                <Seg small value={String(it.p[pd.id])} onChange={(v) => updItem(it.id, { p: { ...it.p, [pd.id]: v } })} options={pd.choices!.map((c) => ({ id: c.id, label: c.label }))} />
              </div>
            );
          })}
        </div>
      )}
    </div>
  );
}

function MeterBar() {
  const [m, setM] = useState<Meter>(audio.meter);
  useEffect(() => audio.onMeter(setM), []);
  const db = 20 * Math.log10(Math.max(1e-5, m.peak));
  const pct = Math.max(0, Math.min(100, ((db + 48) / 48) * 100));
  const gr = 20 * Math.log10(Math.max(1e-5, m.gr));
  return (
    <div class="meter" title="出力レベル（最終段リミッター後）">
      <div class="m-bar"><i style={{ width: pct + '%' }} class={db > -1.5 ? 'hot' : ''} /></div>
      <span>{db > -60 ? db.toFixed(1) : '-∞'} dB</span>
      {gr < -0.5 && <span class="gr">リミッター {gr.toFixed(1)} dB</span>}
    </div>
  );
}

export function FxPanel() {
  const items = memo.value.fx.items;
  const [user, setUser] = useState<UserFxPreset[]>([]);
  const [adding, setAdding] = useState(false);
  useEffect(() => { listUserFx().then(setUser).catch(() => {}); }, []);
  const applyPreset = (chain: FxItem[], name: string) => {
    setChain(() => chain.map((c) => ({ ...c, id: fxId() })));
    toast(`雰囲気「${name}」にしたよ`, 'ok', undefined, 1800);
  };
  const add = (t: FxType) => {
    if (items.length >= MAX_FX) return toast(`エフェクトは${MAX_FX}個までだよ`);
    setChain((x) => [...x, makeFx(t)]);
    setAdding(false);
  };
  const save = async () => {
    const name = await promptDialog('このエフェクトチェーンの名前', 'マイFX');
    if (!name) return;
    await saveUserFx(name, memo.value.fx);
    setUser(await listUserFx());
    toast(`「${name}」を保存したよ`, 'ok');
  };
  const light = settings.value.light;
  return (
    <div class="fxpanel">
      <Card title="雰囲気プリセット" right={<Btn class="txt" onClick={save}>今のチェーンを保存</Btn>}>
        <div class="fx-presets">
          {FX_PRESETS.map((p) => <button type="button" class="chip big" title={p.desc} onClick={() => applyPreset(p.chain(), p.name)}>{p.name}</button>)}
          {user.map((u) => (
            <span class="chip-x">
              <button type="button" class="chip big mine" onClick={() => applyPreset(u.chain.items, u.name)}>{u.name}</button>
              <button type="button" class="x" aria-label="削除" onClick={async () => { if (await confirmDialog(`「${u.name}」を削除しますか？`, '', '削除', true)) { await deleteUserFx(u.id); setUser(await listUserFx()); } }}>×</button>
            </span>
          ))}
        </div>
      </Card>
      <Card title={`エフェクトチェーン（${items.length}）`} right={<MeterBar />}>
        <div class="chain">
          <div class="chain-io">🎹 シンセ</div>
          {items.map((it, i) => <FxCard it={it} index={i} count={items.length} key={it.id} />)}
          {!items.length && <div class="hint">エフェクトなし（ドライ）。下の「＋追加」か上のプリセットからどうぞ</div>}
          <div class="add-fx">
            <Btn kind="primary" icon="plus" onClick={() => setAdding(!adding)}>エフェクトを追加</Btn>
            {adding && (
              <div class="add-menu">
                {FX_DEFS.map((d) => (
                  <button type="button" class="add-item" onClick={() => add(d.type)}>
                    <span class="fx-icon">{d.icon}</span><b>{d.label}</b><small>{d.desc}</small>
                  </button>
                ))}
              </div>
            )}
          </div>
          <div class="chain-io limiter"><Icon name="bolt" size={14} /> リミッター（常にON・音割れ防止）→ 🔊</div>
        </div>
      </Card>
      <Card title="動作の軽さ">
        <Seg value={light} onChange={(v) => { updateSettings({ light: v }); audio.setLight(v === 'on'); }} options={[{ id: 'auto', label: '自動' }, { id: 'off', label: '高音質' }, { id: 'on', label: '軽量モード' }]} />
        <p class="hint">軽量モードは同時発音数・ユニゾン・リバーブの長さを抑えて、スマホでも途切れにくくするよ。「自動」は重くなったら自動で切り替わる。</p>
      </Card>
    </div>
  );
}
