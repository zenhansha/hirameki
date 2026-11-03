// End-to-end: new memo → chords → pattern → effect → play → save → list → play from list
// → share URL restore → MIDI / WAV export. Runs at PC width and phone width.
import { expect, test, Page } from '@playwright/test';
import { readFileSync } from 'node:fs';

const isPhone = (page: Page) => (page.viewportSize()?.width ?? 1000) < 600;

async function openPanel(page: Page, name: 'パターン' | '音色' | 'エフェクト' | 'メモ' | 'コード') {
  if (isPhone(page)) await page.locator('.bottomnav button', { hasText: name }).click();
  else if (name !== 'コード') await page.locator('.sidetabs button', { hasText: name }).click();
}

async function hm<T>(page: Page, fn: string): Promise<T> {
  return page.evaluate(`(() => { const hm = window.__hm; return (${fn}); })()`) as Promise<T>;
}

async function waitAudio(page: Page) {
  await expect.poll(() => hm<string>(page, 'hm.audio.state'), { timeout: 15000 }).toBe('ready');
}

test.beforeEach(async ({ context }) => {
  await context.grantPermissions(['clipboard-read', 'clipboard-write']).catch(() => {});
});

test('first launch shows the welcome + sample memo', async ({ page }) => {
  await page.goto('/');
  await expect(page.getByText('ひらめいたコード進行を、その場でメモして即再生。')).toBeVisible();
  await page.getByRole('button', { name: '再生してみる' }).click();
  await waitAudio(page);
  await expect.poll(() => hm<boolean>(page, 'hm.audio.playing')).toBe(true);
  await expect(page.locator('.timeline .chord')).toHaveCount(4);
  await expect(page.locator('.prog b', { hasText: '王道進行' })).toBeVisible();
  // Sound reaches the limiter.
  await expect.poll(() => hm<number>(page, 'hm.audio.meter.peak'), { timeout: 8000 }).toBeGreaterThan(0.01);
  await page.getByTestId('play').click();
  await expect.poll(() => hm<boolean>(page, 'hm.audio.playing')).toBe(false);
});

test('main flow: input → pattern → fx → play → save → list → share → export', async ({ page, context }) => {
  await page.goto('/');
  await page.getByRole('button', { name: 'あとで' }).click();

  // New memo.
  await page.getByRole('button', { name: '新しいメモ' }).first().click();
  await page.getByRole('menuitem', { name: /空のメモ/ }).click();
  await expect(page.locator('.timeline .chord')).toHaveCount(0);
  await openPanel(page, 'コード');

  // Chords: IV V iii vi via the degree buttons (they show roman + chord name).
  const btn = (i: number) => page.locator('.dia-grid .cbtn').nth(i);
  await expect(btn(3)).toContainText('IV');
  await expect(btn(3)).toContainText('F');
  for (const i of [3, 4, 2, 5]) await btn(i).click();
  await expect(page.locator('.timeline .chord')).toHaveCount(4);
  await expect(page.locator('.prog b', { hasText: '王道進行' })).toBeVisible();
  await waitAudio(page);

  // Modifier on the chord just entered: vi → vi7.
  await page.locator('.mods .chip', { hasText: /^7th$/ }).click();
  await expect.poll(() => hm<string>(page, 'hm.memo.value.chords[3].chord.q')).toBe('m7');

  // Undo / redo.
  await page.getByRole('button', { name: /元に戻す/ }).click();
  await expect.poll(() => hm<string>(page, 'hm.memo.value.chords[3].chord.q')).toBe('m');
  await page.getByRole('button', { name: /やり直す/ }).click();
  await expect.poll(() => hm<string>(page, 'hm.memo.value.chords[3].chord.q')).toBe('m7');

  // Select a chord on the timeline and duplicate it.
  await page.locator('.timeline .chord').first().click();
  await page.getByRole('button', { name: /複製/ }).click();
  await expect(page.locator('.timeline .chord')).toHaveCount(5);
  await page.getByRole('button', { name: /元に戻す/ }).click();
  await expect(page.locator('.timeline .chord')).toHaveCount(4);
  await page.keyboard.press('Escape');

  // Pattern: arpeggio preset.
  await openPanel(page, 'パターン');
  await page.locator('.patterns .seg button', { hasText: 'アルペジオ' }).first().click();
  await page.locator('.pp', { hasText: '上昇16分' }).click();
  await expect.poll(() => hm<string>(page, 'hm.memo.value.pattern.kind')).toBe('arp');

  // Effects: add a reverb + a delay.
  await openPanel(page, 'エフェクト');
  const before = await hm<number>(page, 'hm.memo.value.fx.items.length');
  await page.getByRole('button', { name: 'エフェクトを追加' }).click();
  await page.locator('.add-item', { hasText: 'リバーブ' }).click();
  await page.getByRole('button', { name: 'エフェクトを追加' }).click();
  await page.locator('.add-item', { hasText: 'ディレイ' }).click();
  await expect.poll(() => hm<number>(page, 'hm.memo.value.fx.items.length')).toBe(before + 2);
  await expect(page.locator('.fxcard')).toHaveCount(before + 2);

  // Play and hear something.
  await page.getByTestId('play').click();
  await expect.poll(() => hm<boolean>(page, 'hm.audio.playing')).toBe(true);
  await expect.poll(() => hm<number>(page, 'hm.audio.meter.peak'), { timeout: 8000 }).toBeGreaterThan(0.01);
  // Never clips (final limiter).
  for (let i = 0; i < 5; i++) {
    await page.waitForTimeout(300);
    expect(await hm<number>(page, 'hm.audio.meter.peak')).toBeLessThanOrEqual(0.95);
  }
  await page.getByTestId('play').click();

  // Title + autosave.
  await page.locator('.topbar .title').click();
  await page.locator('.topbar .title-input').fill('E2Eテスト進行');
  await page.keyboard.press('Enter');
  await expect.poll(() => hm<boolean>(page, 'hm.persisted.value'), { timeout: 5000 }).toBe(true);

  // List: the memo is there; play it straight from the list.
  await page.getByRole('button', { name: 'メモ一覧' }).first().click();
  const card = page.locator('.memo-card', { hasText: 'E2Eテスト進行' });
  await expect(card).toBeVisible();
  await expect(card).toContainText('F → G → Em → Am7');
  await card.locator('.mc-play').click();
  await expect.poll(() => hm<boolean>(page, 'hm.audio.playing')).toBe(true);
  await expect(card).toHaveClass(/playing/);
  await card.locator('.mc-play').click();
  await expect.poll(() => hm<boolean>(page, 'hm.audio.playing')).toBe(false);
  // Search and tag filter.
  await page.getByRole('searchbox', { name: '検索' }).fill('E2E');
  await expect(page.locator('.memo-card')).toHaveCount(1);
  await page.getByRole('searchbox', { name: '検索' }).fill('');
  await card.locator('.mc-main').click();

  // Share URL → open in a fresh page → restored.
  await openPanel(page, 'メモ');
  // Headless has no share sheet: fall back to the clipboard path.
  await page.evaluate(() => { (navigator as unknown as { share?: unknown }).share = undefined; });
  await page.getByRole('button', { name: 'URLで共有' }).last().click();
  let url = '';
  await expect.poll(async () => {
    url = await page.evaluate(async () => {
      try { return await navigator.clipboard.readText(); } catch { return (document.querySelector('.url-box') as HTMLTextAreaElement | null)?.value ?? ''; }
    });
    return url;
  }).toContain('#m=1.');
  const other = await context.newPage();
  await other.goto(url);
  await expect(other.locator('.topbar .title')).toContainText('E2Eテスト進行');
  await expect(other.locator('.timeline .chord')).toHaveCount(4);
  const restored = await other.evaluate(() => (window as unknown as { __hm: { memo: { value: { pattern: { kind: string }; fx: { items: unknown[] } } } } }).__hm.memo.value);
  expect(restored.pattern.kind).toBe('arp');
  expect(restored.fx.items.length).toBe(before + 2);
  await other.close();

  // MIDI export.
  const [midi] = await Promise.all([page.waitForEvent('download'), page.getByRole('button', { name: 'MIDI', exact: true }).click()]);
  expect(midi.suggestedFilename()).toBe('E2Eテスト進行.mid');
  const mbytes = readFileSync((await midi.path())!);
  expect(mbytes.subarray(0, 4).toString('latin1')).toBe('MThd');
  expect(mbytes.length).toBeGreaterThan(200);

  // WAV export (offline render with effects).
  const [wav] = await Promise.all([page.waitForEvent('download', { timeout: 60000 }), page.getByRole('button', { name: /WAV/ }).click()]);
  expect(wav.suggestedFilename()).toBe('E2Eテスト進行.wav');
  const wbytes = readFileSync((await wav.path())!);
  expect(wbytes.subarray(0, 4).toString('latin1')).toBe('RIFF');
  expect(wbytes.subarray(8, 12).toString('latin1')).toBe('WAVE');
  expect(wbytes.length).toBeGreaterThan(44100 * 4 * 5);
  // The audio isn't silent and never clips.
  let peak = 0;
  for (let i = 44; i < wbytes.length; i += 2) peak = Math.max(peak, Math.abs(wbytes.readInt16LE(i)));
  expect(peak).toBeGreaterThan(1000);
  expect(peak).toBeLessThan(32767);
});

test('delete asks for confirmation and can be undone; JSON export/import round trip', async ({ page }) => {
  await page.goto('/');
  await page.getByRole('button', { name: 'あとで' }).click();
  // Templates are not memos: the list starts empty.
  await page.getByRole('button', { name: 'メモ一覧' }).first().click();
  await expect(page.locator('.memo-card')).toHaveCount(0);
  await expect(page.locator('.ls-empty')).toContainText('テンプレート');
  // Make three memos from templates.
  for (const name of ['カノン進行', '小室進行', '丸サ進行']) {
    await page.getByRole('button', { name: 'テンプレートから作成' }).first().click();
    await page.locator('.tg-card', { hasText: name }).getByRole('button', { name: 'これで作る' }).click();
    await expect.poll(() => page.evaluate(() => (window as unknown as { __hm: { persisted: { value: boolean } } }).__hm.persisted.value), { timeout: 5000 }).toBe(true);
    await page.getByRole('button', { name: 'メモ一覧' }).first().click();
  }
  const n0 = await page.locator('.memo-card').count();
  expect(n0).toBe(3);
  const first = page.locator('.memo-card').first();
  const title = (await first.locator('.mc-title').innerText()).replace('★', '').trim();
  await first.locator('.more').click();
  await page.locator('.mc-menu button', { hasText: '削除' }).click();
  await expect(page.getByRole('dialog')).toContainText('削除しますか');
  await page.getByRole('button', { name: 'キャンセル' }).click();
  await expect(page.locator('.memo-card')).toHaveCount(n0);
  await first.locator('.more').click();
  await page.locator('.mc-menu button', { hasText: '削除' }).click();
  await page.getByRole('button', { name: '削除する' }).click();
  await expect(page.locator('.memo-card')).toHaveCount(n0 - 1);
  await page.locator('.toast button', { hasText: '元に戻す' }).click();
  await expect(page.locator('.memo-card', { hasText: title })).toBeVisible();

  // Export all as JSON.
  const [dl] = await Promise.all([page.waitForEvent('download'), page.getByRole('button', { name: '全部書き出す' }).click()]);
  const json = JSON.parse(readFileSync((await dl.path())!, 'utf8'));
  expect(json.format).toBe('hirameki-memos');
  expect(json.memos.length).toBe(n0);
  // Import it back: every memo comes back as a copy.
  const [chooser] = await Promise.all([page.waitForEvent('filechooser'), page.getByRole('button', { name: 'JSONを読み込む' }).click()]);
  await chooser.setFiles((await dl.path())!);
  await expect(page.locator('.memo-card')).toHaveCount(n0 * 2);
});

test('keyboard shortcuts (PC) / piano mode', async ({ page }) => {
  await page.goto('/');
  await page.getByRole('button', { name: 'あとで' }).click();
  await page.getByRole('button', { name: '新しいメモ' }).first().click();
  await page.getByRole('menuitem', { name: /空のメモ/ }).click();
  if (!isPhone(page)) {
    await page.keyboard.press('1');
    await page.keyboard.press('5');
    await page.keyboard.press('6');
    await page.keyboard.press('4');
    await expect(page.locator('.timeline .chord')).toHaveCount(4);
    await page.keyboard.press('q');
    await expect.poll(() => hm<string>(page, 'hm.memo.value.chords[3].chord.q')).toBe('M7');
    await page.keyboard.press('Control+z');
    await expect.poll(() => hm<string>(page, 'hm.memo.value.chords[3].chord.q')).toBe('M');
    await page.keyboard.press(']');
    await expect.poll(() => hm<number>(page, 'hm.memo.value.key.tonic')).toBe(1);
    await page.keyboard.press('Space');
    await expect.poll(() => hm<boolean>(page, 'hm.audio.playing')).toBe(true);
    await page.keyboard.press('Space');
  }
  // Piano mode: C E G B -> CM7
  await openPanel(page, 'コード');
  await page.locator('.pad-head .seg button', { hasText: 'ピアノ' }).click();
  const key = async (label: string) => page.locator(`.piano [aria-label="${label}"]`).click();
  for (const n of ['C4', 'E4', 'G4', 'B4']) await key(n);
  await expect(page.locator('.pi-name b')).toHaveText('CM7');
  await page.locator('.pi-actions .btn.primary').click();
  await expect.poll(() => hm<number>(page, 'hm.memo.value.chords.length')).toBeGreaterThan(0);
});
