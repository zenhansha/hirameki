import { render } from 'preact';
import './styles.css';
import { App } from './ui/App';
import { audio } from './audio/host';
import { installKeyboard } from './ui/commands';
import {
  flushSave, loadMemoIntoEditor, settings, startAudioSync, toast, updateSettings, memo, persisted,
} from './ui/state';
import { loadSettings, listMemos, saveMemo, kvGet, kvSet, purgeDeleted } from './store/repo';
import { getBackend } from './store/db';
import { defaultMemo, displayTitle } from './store/schema';
import { memoFromTemplate } from './ui/actions';
import { codeFromHash, decodeMemo, ShareDecodeError } from './io/share';
import { enableMidi, midiSupported, injectMidi } from './io/webmidi';
import { openMemo } from './ui/actions';

async function boot() {
  audio.installUnlock();
  installKeyboard();
  startAudioSync();

  try {
    settings.value = await loadSettings();
  } catch { /* defaults */ }
  audio.light = settings.value.light === 'on';
  audio.onOverload = () => {
    if (settings.value.light === 'auto' && !audio.light) {
      audio.setLight(true);
      toast('処理が重いみたいなので軽量モードにしたよ（エフェクト画面で変えられる）');
    }
  };

  const backend = await getBackend();
  if (backend.kind === 'memory') toast('この環境では保存ができません（プライベートモード？）。JSON書き出しで保存してね', 'error', undefined, 8000);

  // v1.0 stored the samples as memos. Templates now live in the "テンプレートから作成" menu,
  // so remove the sample memos the user never touched (edited ones are the user's now).
  if (!(await kvGet<boolean>('templatesV2'))) {
    try {
      for (const m of await listMemos()) if (m.sample && m.rev === 0) await backend.del('memos', m.id);
      await kvSet('templatesV2', true);
    } catch { /* storage might be unavailable */ }
  }

  const code = codeFromHash(location.hash);
  if (code) {
    try {
      const m = decodeMemo(code);
      await saveMemo(m, false);
      loadMemoIntoEditor(m, true);
      toast(`共有されたメモ「${m.title || '無題のメモ'}」を開いたよ（一覧にも保存済み）`, 'ok', undefined, 5000);
    } catch (e) {
      toast(e instanceof ShareDecodeError ? '共有リンクが壊れているか、途中で切れているみたい。リンク全体をコピーし直してね' : '共有リンクを開けませんでした', 'error', undefined, 7000);
      loadMemoIntoEditor(defaultMemo(), false);
    }
    history.replaceState(null, '', location.pathname + location.search);
  } else if (!settings.value.welcomed) {
    // First launch: a template is open (not saved unless edited) so ▶ immediately sounds good.
    loadMemoIntoEditor(memoFromTemplate('oudou-dreamy'), false);
  } else {
    // Ready for a new idea right away; the last memo is one tap away in the list.
    loadMemoIntoEditor(defaultMemo(), false);
    const last = await kvGet<string>('lastMemo');
    if (last) {
      const all = await listMemos().catch(() => []);
      const lm = all.find((x) => x.id === last);
      if (lm) toast(`前回のメモ「${displayTitle(lm)}」の続きをする？`, 'info', { label: '開く', run: () => openMemo(lm.id) }, 6000);
    }
  }

  if (settings.value.midiEnabled && midiSupported) enableMidi().catch(() => {});
  purgeDeleted().catch(() => {});

  const save = () => { flushSave(); };
  document.addEventListener('visibilitychange', () => { if (document.visibilityState === 'hidden') save(); });
  window.addEventListener('pagehide', save);
  window.addEventListener('beforeunload', save);

  window.addEventListener('error', (e) => reportError(e.error ?? e.message));
  window.addEventListener('unhandledrejection', (e) => reportError(e.reason));

  if ('serviceWorker' in navigator && import.meta.env.PROD) {
    navigator.serviceWorker.register('./sw.js').then((reg) => {
      reg.addEventListener('updatefound', () => {
        const nw = reg.installing;
        nw?.addEventListener('statechange', () => {
          if (nw.state === 'installed' && navigator.serviceWorker.controller) {
            toast('新しいバージョンがあります', 'info', { label: '更新', run: () => { flushSave().then(() => location.reload()); } }, 10000);
          }
        });
      });
    }).catch(() => {});
  }

  // Debug hook for automated tests.
  (window as unknown as Record<string, unknown>).__hm = { audio, memo, settings, persisted, updateSettings, injectMidi };
}

let lastErr = 0;
function reportError(e: unknown) {
  console.error(e);
  const now = Date.now();
  if (now - lastErr < 4000) return;
  lastErr = now;
  toast('予期しないエラーが起きました。データは自動保存されています。おかしい時はページを再読み込みしてね', 'error', undefined, 6000);
}

render(<App />, document.getElementById('app')!);
boot();
