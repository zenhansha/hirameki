// Toasts, dialogs, welcome and help overlays.
import { useEffect, useRef, useState } from 'preact/hooks';
import { booted, dialog, toasts, settings, updateSettings, audioState } from '../state';
import { audio } from '../../audio/host';
import { COMMANDS, keysFor } from '../commands';
import { play } from '../actions';
import { Btn } from './common';
import { openTemplates } from './TemplateGallery';

export function Toasts() {
  return (
    <div class="toasts" role="status" aria-live="polite">
      {toasts.value.map((t) => (
        <div class={`toast ${t.kind}`} key={t.id}>
          <span>{t.text}</span>
          {t.action && <button type="button" onClick={() => { t.action!.run(); toasts.value = toasts.value.filter((x) => x.id !== t.id); }}>{t.action.label}</button>}
        </div>
      ))}
    </div>
  );
}

export function DialogHost() {
  const d = dialog.value;
  const [val, setVal] = useState('');
  const input = useRef<HTMLInputElement>(null);
  useEffect(() => {
    if (d?.kind === 'prompt') { setVal(d.value ?? ''); setTimeout(() => input.current?.select(), 30); }
  }, [d]);
  if (!d) return null;
  const close = (v: string | boolean | null) => { dialog.value = null; d.resolve(v); };
  return (
    <div class="modal-bg" onClick={(e) => { if (e.target === e.currentTarget) close(d.kind === 'confirm' ? false : null); }}>
      <div class="modal" role="dialog" aria-modal="true" aria-label={d.title}>
        <h3>{d.title}</h3>
        {d.body && <p>{d.body}</p>}
        {d.kind === 'prompt' && (
          <input ref={input} value={val} onInput={(e) => setVal((e.target as HTMLInputElement).value)} onKeyDown={(e) => { if (e.key === 'Enter') close(val.trim()); if (e.key === 'Escape') close(null); }} aria-label={d.title} />
        )}
        {d.kind === 'custom' && d.render?.()}
        <div class="modal-actions">
          {d.kind !== 'custom' && <Btn class="txt" onClick={() => close(d.kind === 'confirm' ? false : null)}>キャンセル</Btn>}
          {d.kind === 'confirm' && <Btn kind={d.danger ? 'danger' : 'primary'} onClick={() => close(true)}>{d.ok ?? 'OK'}</Btn>}
          {d.kind === 'prompt' && <Btn kind="primary" onClick={() => close(val.trim())} disabled={!val.trim()}>{d.ok ?? 'OK'}</Btn>}
          {d.kind === 'custom' && <Btn kind="primary" onClick={() => close(true)}>閉じる</Btn>}
        </div>
      </div>
    </div>
  );
}

export function Welcome() {
  if (settings.value.welcomed || !booted.value) return null;
  const go = async (playNow: boolean) => {
    updateSettings({ welcomed: true });
    if (playNow) { await audio.start(); play(true); }
  };
  return (
    <div class="modal-bg welcome">
      <div class="modal">
        <div class="wl-logo">✦ HIRAMEKI</div>
        <h3>ひらめいたコード進行を、その場でメモして即再生。</h3>
        <ul>
          <li>🎹 <b>度数ボタン</b>（I, ii, V…）にはキーでのコード名も出るよ。タップで入力＆即試聴</li>
          <li>🥁 <b>パターン</b>で「どう鳴らすか」をワンタップ。アルペジオ・ストラム・ポンピングも</li>
          <li>🎛 <b>音色</b>はVital風シンセで作り込める。<b>エフェクト</b>は好きなだけ重ね掛け</li>
          <li>💾 自動保存。<b>URL共有</b>や<b>MIDI/WAV書き出し</b>でDAWへ</li>
        </ul>
        <p class="hint">テンプレート「王道進行 × ドリーミーパッド」を開いておいたよ。まずは聴いてみて！ ほかの進行は ＋ →「テンプレートから作成」から。</p>
        <div class="modal-actions">
          <Btn class="txt" onClick={() => go(false)}>あとで</Btn>
          <Btn class="txt" onClick={() => { go(false); openTemplates(); }}>テンプレートを見る</Btn>
          <Btn kind="primary" icon="play" onClick={() => go(true)}>再生してみる</Btn>
        </div>
      </div>
    </div>
  );
}

export function HelpOverlay({ onClose }: { onClose: () => void }) {
  const groups = [...new Set(COMMANDS.map((c) => c.group))];
  return (
    <div class="modal-bg" onClick={(e) => { if (e.target === e.currentTarget) onClose(); }}>
      <div class="modal wide">
        <h3>使い方とショートカット</h3>
        <div class="help-grid">
          <div>
            <h4>基本の流れ</h4>
            <ol>
              <li>キー・テンポを決める（上のバー）</li>
              <li>度数ボタンでコードを入れる（入れるたびに右に進む）</li>
              <li>入れたコードは 7th / sus4 / 転回 などのチップでアレンジ</li>
              <li>パターン・音色・エフェクトを選んで ▶</li>
              <li>タイムラインのコードをタップで選択 → 置き換え・長さ変更・複製。ドラッグで入れ替え</li>
              <li>小節番号のバーをドラッグするとループ範囲になる</li>
            </ol>
          </div>
          {groups.map((g) => (
            <div>
              <h4>{g}</h4>
              <dl>{COMMANDS.filter((c) => c.group === g).map((c) => { const k = keysFor(c.id); return k.length ? <><dt>{k.join(' / ')}</dt><dd>{c.label}</dd></> : null; })}</dl>
            </div>
          ))}
        </div>
        <div class="modal-actions"><Btn kind="primary" onClick={onClose}>閉じる</Btn></div>
      </div>
    </div>
  );
}

export function AudioErrorBanner() {
  const st = audioState.value;
  if (st !== 'error') return null;
  const code = audio.errorCode;
  const msg: Record<string, [string, string]> = {
    INSECURE: ['音声エンジンを起動できません', 'https:// のURLか、このPC上（localhost）で開いてね。ファイルを直接ダブルクリックで開くと動かないよ'],
    NO_WORKLET: ['このブラウザは音声エンジン（AudioWorklet）に対応していません', 'Chrome / Edge / Safari（iOS 14.5以降）の最新版で開いてね'],
    NO_AUDIO: ['このブラウザでは音を出せません', 'Chrome / Edge / Safari の最新版で開いてね'],
    WORKLET_FAILED: ['音声エンジンの読み込みに失敗しました', 'ページを再読み込みしてみてね。オフラインで初めて開いた場合は一度オンラインで開いてね'],
    CTX_FAILED: ['オーディオを開始できませんでした', 'ほかのアプリが音声を占有していないか確認して、もう一度タップしてね'],
  };
  const [t, fix] = msg[code] ?? ['音が出せません', 'ページを再読み込みしてみてね'];
  return (
    <div class="banner error" role="alert">
      <b>⚠ {t}</b><span>{fix}</span>
      <Btn class="txt" onClick={() => location.reload()}>再読み込み</Btn>
    </div>
  );
}
