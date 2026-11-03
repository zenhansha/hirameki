// A/B comparison, per-chord pattern, loop range by ruler drag, MIDI input, offline PWA.
import { expect, test, Page } from '@playwright/test';

const isPhone = (page: Page) => (page.viewportSize()?.width ?? 1000) < 600;
async function hm<T>(page: Page, fn: string): Promise<T> {
  return page.evaluate(`(() => { const hm = window.__hm; return (${fn}); })()`) as Promise<T>;
}
async function openPanel(page: Page, name: string) {
  if (isPhone(page)) await page.locator('.bottomnav button', { hasText: name }).click();
  else if (name !== 'コード') await page.locator('.sidetabs button', { hasText: name }).click();
}
async function freshMemoWith(page: Page, degs: number[]) {
  await page.goto('/');
  await page.getByRole('button', { name: 'あとで' }).click();
  await page.getByRole('button', { name: '新しいメモ' }).first().click();
  for (const d of degs) await page.locator('.dia-grid .cbtn').nth(d).click();
  await expect(page.locator('.timeline .chord')).toHaveCount(degs.length);
}

test('A/B comparison of one chord', async ({ page }) => {
  await freshMemoWith(page, [0, 4, 5, 3]);
  await page.locator('.timeline .chord').nth(3).click();
  await page.getByRole('button', { name: /B案を作/ }).click();
  await expect.poll(() => hm<string>(page, `document.querySelector('.ab-switch button.on')?.textContent`)).toBe('B');
  // Edit on the B side: IV → ii
  await page.locator('.dia-grid .cbtn').nth(1).click();
  await expect.poll(() => hm<number>(page, 'hm.memo.value.chords[3].chord.root')).toBe(5);
  await expect.poll(() => hm<number>(page, 'hm.memo.value.chords[3].b.chord.root')).toBe(2);
  await expect(page.locator('.timeline .chord').nth(3)).toContainText('Dm');
  await page.locator('.ab-switch button', { hasText: 'A' }).click();
  await expect(page.locator('.timeline .chord').nth(3)).toContainText('F');
  // Adopt B.
  await page.locator('.ab-switch button', { hasText: 'B' }).click();
  await page.getByRole('button', { name: /B案を採用/ }).click();
  await expect.poll(() => hm<number>(page, 'hm.memo.value.chords[3].chord.root')).toBe(2);
  await expect.poll(() => hm<unknown>(page, 'hm.memo.value.chords[3].b')).toBeFalsy();
});

test('pattern for one chord only', async ({ page }) => {
  await freshMemoWith(page, [0, 4]);
  await page.locator('.timeline .chord').nth(1).click();
  await openPanel(page, 'パターン');
  await page.locator('.patterns .card-h .seg button', { hasText: '選択中のコードだけ' }).click();
  await page.locator('.patterns .seg button', { hasText: 'ストラム' }).first().click();
  await page.locator('.pp', { hasText: 'アコギ8ビート' }).click();
  await expect.poll(() => hm<string | undefined>(page, 'hm.memo.value.chords[1].pat?.kind')).toBe('strum');
  await expect.poll(() => hm<unknown>(page, 'hm.memo.value.chords[0].pat')).toBeFalsy();
  await expect.poll(() => hm<string>(page, 'hm.memo.value.pattern.kind')).toBe('block');
  await expect(page.locator('.timeline .chord').nth(1).locator('.pat-mark')).toBeVisible();
});

test('loop range by dragging the bar ruler', async ({ page }) => {
  await freshMemoWith(page, [0, 4, 5, 3]);
  const bars = page.locator('.ruler .rb[data-bar]');
  const b1 = await bars.nth(1).boundingBox();
  const b2 = await bars.nth(2).boundingBox();
  await page.mouse.move(b1!.x + 8, b1!.y + b1!.height / 2);
  await page.mouse.down();
  await page.mouse.move(b2!.x + 12, b2!.y + b2!.height / 2, { steps: 6 });
  await page.mouse.up();
  await expect.poll(() => hm<string>(page, 'JSON.stringify(hm.memo.value.loop)')).toBe(JSON.stringify({ on: true, start: 1, end: 3 }));
  await expect(page.locator('.ruler .rb.inloop')).toHaveCount(2);
});

test('MIDI keyboard chord input and MIDI learn', async ({ page }) => {
  test.skip(isPhone(page), 'MIDI is a desktop feature in this test');
  await freshMemoWith(page, []);
  // Play D F A (Dm) and release → entered as a chord.
  for (const n of [62, 65, 69]) await hm(page, `hm.injectMidi([0x90, ${n}, 100])`);
  for (const n of [62, 65, 69]) await hm(page, `hm.injectMidi([0x80, ${n}, 0])`);
  await expect.poll(() => hm<number>(page, 'hm.memo.value.chords.length')).toBe(1);
  await expect(page.locator('.timeline .chord').first()).toContainText('Dm');
  // Learn: bind note 36 to "next degree 5 chord".
  await hm(page, `hm.updateSettings({ midiMap: { 'note:36': 'deg5' } })`);
  await hm(page, `hm.injectMidi([0x90, 36, 100])`);
  await expect.poll(() => hm<number>(page, 'hm.memo.value.chords.length')).toBe(2);
  await expect(page.locator('.timeline .chord').nth(1)).toContainText('G');
});

test('works offline after the first visit (PWA)', async ({ page, context }) => {
  await page.goto('/');
  await page.evaluate(async () => { await navigator.serviceWorker.ready; });
  await page.reload();
  await page.evaluate(async () => { await navigator.serviceWorker.ready; });
  await context.setOffline(true);
  await page.reload();
  await expect(page.locator('.topbar .logo')).toBeVisible();
  await page.getByRole('button', { name: /あとで|再生してみる/ }).first().click().catch(() => {});
  await page.getByTestId('play').click();
  await expect.poll(() => hm<string>(page, 'hm.audio.state'), { timeout: 15000 }).toBe('ready');
  await context.setOffline(false);
});

test('custom key binding (e.g. a left-hand device sending F13)', async ({ page }) => {
  test.skip(isPhone(page), 'keyboard bindings are a desktop feature');
  await freshMemoWith(page, []);
  await openPanel(page, 'メモ');
  await page.getByRole('button', { name: '一覧・カスタマイズ' }).click();
  const row = page.locator('.learn-row', { hasText: '1度のコード' }).first();
  await row.getByRole('button', { name: '追加' }).click();
  await expect(row.getByRole('button', { name: 'キーを押して…' })).toBeVisible();
  // Playwright has no F13 key, so send the event the device would produce.
  await page.evaluate(() => window.dispatchEvent(new KeyboardEvent('keydown', { key: 'F13', code: 'F13', bubbles: true })));
  await expect(row.locator('code')).toContainText('F13');
  await page.evaluate(() => window.dispatchEvent(new KeyboardEvent('keydown', { key: 'F13', code: 'F13', bubbles: true })));
  await expect.poll(() => hm<number>(page, 'hm.memo.value.chords.length')).toBe(1);
  await expect(page.locator('.timeline .chord').first()).toContainText('C');
});
