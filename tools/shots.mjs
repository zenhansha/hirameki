// Screenshots of the main screens at PC and phone width (for design review).
// Usage: node tools/shots.mjs [outDir]   (needs `npx vite preview --port 4173` running)
import { chromium } from '@playwright/test';
import { mkdirSync } from 'node:fs';

const out = process.argv[2] || 'shots';
mkdirSync(out, { recursive: true });
const browser = await chromium.launch({ channel: process.env.PW_CHANNEL || 'msedge', args: ['--autoplay-policy=no-user-gesture-required'] });

async function run(name, viewport, mobile) {
  const ctx = await browser.newContext({ viewport, deviceScaleFactor: mobile ? 2 : 1, isMobile: mobile, hasTouch: mobile });
  const page = await ctx.newPage();
  const shot = (n) => page.screenshot({ path: `${out}/${name}-${n}.png` });
  await page.goto('http://localhost:4173/');
  await page.waitForTimeout(600);
  await shot('01-welcome');
  await page.getByRole('button', { name: 'あとで' }).click();
  await page.waitForTimeout(300);
  await shot('02-editor-sample');
  const tab = async (t) => {
    if (mobile) await page.locator('.bottomnav button', { hasText: t }).click();
    else if (t !== 'コード') await page.locator('.sidetabs button', { hasText: t }).click();
    await page.waitForTimeout(250);
  };
  await page.locator('.timeline .chord').nth(1).click();
  await page.waitForTimeout(200);
  await shot('03-selected');
  await page.locator('.pad-head .seg button', { hasText: 'ノンダイア' }).click();
  await shot('04-nondia');
  await page.locator('.pad-head .seg button', { hasText: '全ルート' }).click();
  await shot('05-roots');
  await page.locator('.pad-head .seg button', { hasText: 'ピアノ' }).click();
  await shot('06-piano');
  await page.locator('.pad-head .seg button', { hasText: '鼻歌' }).click();
  await shot('07-hum');
  await page.locator('.pad-head .seg button', { hasText: '度数' }).click();
  await tab('パターン');
  await shot('08-pattern');
  await tab('音色');
  await shot('09-sound');
  await page.locator('.modbar .modchip', { hasText: 'LFO1' }).click();
  await shot('10-sound-assign');
  await page.locator('.modbar .modchip', { hasText: 'LFO1' }).click();
  await tab('エフェクト');
  await shot('11-fx');
  await tab('メモ');
  await shot('12-memo');
  await page.getByRole('button', { name: 'メモ一覧' }).first().click();
  await page.waitForTimeout(300);
  await shot('13-list');
  await page.getByRole('button', { name: '新しいメモ' }).first().click();
  await page.waitForTimeout(300);
  await tab('コード');
  await shot('14-new');
  await page.keyboard.press('Shift+/');
  await page.waitForTimeout(200);
  await shot('15-help');
  await ctx.close();
}

await run('pc', { width: 1366, height: 860 }, false);
await run('phone', { width: 390, height: 844 }, true);
await browser.close();
console.log('done');
