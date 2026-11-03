// Renders the app icons (PNG) from an inline SVG using the system Edge via Playwright.
import { chromium } from '@playwright/test';
import { writeFileSync } from 'node:fs';

const svg = (pad) => `
<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 512 512" width="512" height="512">
  <defs>
    <linearGradient id="bg" x1="0" y1="0" x2="1" y2="1"><stop offset="0" stop-color="#2a1a66"/><stop offset="1" stop-color="#0d0e13"/></linearGradient>
    <linearGradient id="sp" x1="0" y1="0" x2="1" y2="1"><stop offset="0" stop-color="#ffe08a"/><stop offset="1" stop-color="#ff8a3d"/></linearGradient>
    <radialGradient id="glow" cx="0.5" cy="0.38" r="0.5"><stop offset="0" stop-color="#ffb347" stop-opacity="0.55"/><stop offset="1" stop-color="#ffb347" stop-opacity="0"/></radialGradient>
  </defs>
  <rect width="512" height="512" rx="${pad ? 0 : 112}" fill="url(#bg)"/>
  <circle cx="256" cy="200" r="190" fill="url(#glow)"/>
  <path d="M256 70 C268 160 300 192 390 204 C300 216 268 248 256 338 C244 248 212 216 122 204 C212 192 244 160 256 70Z" fill="url(#sp)"/>
  <g transform="translate(0, ${pad ? -6 : 0})">
    <rect x="104" y="372" width="92" height="56" rx="16" fill="#3fc8e4"/>
    <rect x="210" y="372" width="92" height="56" rx="16" fill="#ffb347"/>
    <rect x="316" y="372" width="92" height="56" rx="16" fill="#ff6b8b"/>
  </g>
</svg>`;

const browser = await chromium.launch({ channel: process.env.PW_CHANNEL || 'msedge' });
const page = await browser.newPage({ deviceScaleFactor: 1 });
async function shot(size, file, pad = false) {
  await page.setViewportSize({ width: size, height: size });
  const inner = pad ? `<div style="width:${size}px;height:${size}px;background:#0d0e13;display:flex;align-items:center;justify-content:center"><div style="width:${size * 0.8}px;height:${size * 0.8}px">${svg(true).replace('width="512" height="512"', 'width="100%" height="100%"')}</div></div>` : svg(false).replace('width="512" height="512"', `width="${size}" height="${size}"`);
  await page.setContent(`<html><body style="margin:0;background:transparent">${inner}</body></html>`);
  const buf = await page.screenshot({ omitBackground: !pad, clip: { x: 0, y: 0, width: size, height: size } });
  writeFileSync(file, buf);
}
await shot(192, 'public/icons/icon-192.png');
await shot(512, 'public/icons/icon-512.png');
await shot(512, 'public/icons/maskable-512.png', true);
await shot(180, 'public/icons/apple-touch-icon.png', true);
await browser.close();
console.log('icons done');
