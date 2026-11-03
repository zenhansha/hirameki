import { useEffect, useState } from 'preact/hooks';
import { narrow, sideTab, tab, view, Tab } from './state';
import { TopBar, Transport } from './components/Transport';
import { Timeline } from './components/Timeline';
import { ChordPad, EditBar } from './components/ChordPad';
import { PatternPanel } from './components/PatternPanel';
import { SoundPanel } from './components/SoundPanel';
import { FxPanel } from './components/FxPanel';
import { MemoPanel } from './components/MemoPanel';
import { ListScreen } from './components/ListScreen';
import { AudioErrorBanner, DialogHost, HelpOverlay, Toasts, Welcome } from './components/Overlays';
import { Icon } from './components/common';
import { VoicingView } from './components/VoicingView';

const TABS: { id: Tab; label: string; icon: string }[] = [
  { id: 'input', label: 'コード', icon: 'piano' },
  { id: 'pattern', label: 'パターン', icon: 'dice' },
  { id: 'sound', label: '音色', icon: 'wand' },
  { id: 'fx', label: 'エフェクト', icon: 'bolt' },
  { id: 'memo', label: 'メモ', icon: 'gear' },
];

function Panel({ t }: { t: Tab }) {
  switch (t) {
    case 'pattern': return <PatternPanel />;
    case 'sound': return <SoundPanel />;
    case 'fx': return <FxPanel />;
    case 'memo': return <MemoPanel />;
    default: return <ChordPad />;
  }
}

function Editor() {
  const isNarrow = narrow.value;
  if (isNarrow) {
    const t = tab.value;
    return (
      <div class={`editor narrow tab-${t}`}>
        <Transport />
        <div class="ed-timeline"><Timeline /></div>
        <EditBar />
        <div class={`ed-panel ${t === 'input' ? 'pad' : 'scroll'}`}><Panel t={t} /></div>
        <nav class="bottomnav" aria-label="パネル切り替え">
          {TABS.map((x) => (
            <button type="button" class={t === x.id ? 'on' : ''} onClick={() => (tab.value = x.id)} aria-current={t === x.id}>
              <Icon name={x.icon} size={20} /><span>{x.label}</span>
            </button>
          ))}
        </nav>
      </div>
    );
  }
  const st = sideTab.value;
  return (
    <div class="editor wide">
      <Transport />
      <div class="cols">
        <div class="col-left">
          <div class="ed-timeline"><Timeline /><VoicingView /></div>
          <EditBar />
          <div class="ed-pad"><ChordPad /></div>
        </div>
        <div class="col-right">
          <nav class="sidetabs" aria-label="パネル切り替え">
            {TABS.filter((x) => x.id !== 'input').map((x) => (
              <button type="button" class={st === x.id ? 'on' : ''} onClick={() => (sideTab.value = x.id as typeof st)} aria-current={st === x.id}>
                <Icon name={x.icon} size={18} /><span>{x.label}</span>
              </button>
            ))}
          </nav>
          <div class="ed-panel scroll"><Panel t={st} /></div>
        </div>
      </div>
    </div>
  );
}

export function App() {
  const [help, setHelp] = useState(false);
  useEffect(() => {
    const onResize = () => { narrow.value = window.innerWidth < 1024; };
    const onHelp = () => setHelp(true);
    window.addEventListener('resize', onResize);
    window.addEventListener('hm-help', onHelp);
    return () => { window.removeEventListener('resize', onResize); window.removeEventListener('hm-help', onHelp); };
  }, []);
  return (
    <div class={`app ${narrow.value ? 'is-narrow' : 'is-wide'}`}>
      <TopBar />
      <AudioErrorBanner />
      <main class="main">{view.value === 'list' ? <ListScreen /> : <Editor />}</main>
      <Toasts />
      <DialogHost />
      <Welcome />
      {help && <HelpOverlay onClose={() => setHelp(false)} />}
    </div>
  );
}
