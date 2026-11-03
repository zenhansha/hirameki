// Renders the sample memos and saves a spectrogram/envelope sheet (needs the dev server on 5173).
import { chromium } from '@playwright/test';
const out = process.argv[2] || 'viz.png';
const browser = await chromium.launch({ channel: process.env.PW_CHANNEL || 'msedge' });
const page = await browser.newPage({ viewport: { width: 1200, height: 1100 } });
await page.goto('http://localhost:5173/');
await page.waitForTimeout(1500);
const size = await page.evaluate(async () => {
  await import('/src/dev/viz.ts');
  const c = await window.__viz.drawAll();
  return [c.width, c.height];
});
await page.setViewportSize({ width: size[0], height: size[1] });
await page.locator('canvas').last().screenshot({ path: out });
await browser.close();
console.log('saved', out, size);
