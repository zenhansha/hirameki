// Turns the `vite build --mode artifact` output into a claude.ai Artifact page:
// artifact/index.html (content only: the host adds doctype/head) + artifact/assets/*.js.
import { readFileSync, writeFileSync, mkdirSync, readdirSync, copyFileSync, rmSync, existsSync } from 'node:fs';
import { join } from 'node:path';

const src = 'dist-artifact';
const out = 'artifact';
if (existsSync(out)) rmSync(out, { recursive: true, force: true });
mkdirSync(join(out, 'assets'), { recursive: true });

const html = readFileSync(join(src, 'index.html'), 'utf8');
const css = readFileSync(join(src, html.match(/href="\.\/(assets\/[^"]+\.css)"/)[1]), 'utf8');
const js = html.match(/src="\.\/(assets\/[^"]+\.js)"/)[1];

// The host frame pads :root by the safe-area insets and sizes the page; the app fills it.
const overrides = `
:root { color-scheme: dark; --safe-t: 0px; --safe-b: 0px; --gl: max(16px, env(safe-area-inset-left, 0px)); --gr: max(16px, env(safe-area-inset-right, 0px)); }
html, body { height: 100%; background: var(--bg); }
.app { height: 100%; padding-top: 0; }
.topbar, .transport, .editbar, .sidetabs, .bottomnav, .banner { padding-left: var(--gl); padding-right: var(--gr); }
.timeline, .chordpad, .list-screen, .editor.narrow .ed-panel.scroll, .col-right .ed-panel { padding-left: var(--gl); padding-right: var(--gr); }
.voicing { margin-left: var(--gl); margin-right: var(--gr); }
.menu.sheet { left: var(--gl); right: var(--gr); }
.toasts { width: min(520px, calc(100vw - 32px)); }
`;

const page = `<title>HIRAMEKI 即興コードメモ</title>
<meta name="claude:viewport-fit-sides" content="cover">
<meta name="description" content="ひらめいたコード進行をその場でメモしてすぐ鳴らせる、シンセ内蔵のコード進行メモ">
<style>
${css}
${overrides}
</style>
<div id="app"></div>
<noscript>HIRAMEKI を使うには JavaScript を有効にしてください。</noscript>
<script type="module" src="${js}"></script>
`;
writeFileSync(join(out, 'index.html'), page);
for (const f of readdirSync(join(src, 'assets'))) if (f.endsWith('.js')) copyFileSync(join(src, 'assets', f), join(out, 'assets', f));
console.log('artifact page:', join(out, 'index.html'), 'scripts:', readdirSync(join(out, 'assets')).join(', '));
