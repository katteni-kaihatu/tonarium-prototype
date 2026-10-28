import assert from 'node:assert/strict';
import { mkdir } from 'node:fs/promises';

// fixture サーバーを先に起動。引数: Playwright の module URL、ブラウザ実行ファイル。
const { chromium } = await import(process.argv[2] || 'playwright');
const browser = await chromium.launch({ headless: true, ...(process.argv[3] ? { executablePath: process.argv[3] } : {}) });
try {
  const page = await browser.newPage({ viewport: { width: 1100, height: 950 } });
  const errors = [];
  page.on('pageerror', error => errors.push(error.message));
  await page.route('**/*', route => new URL(route.request().url()).hostname === '127.0.0.1' ? route.continue() : route.abort());
  await page.goto('http://127.0.0.1:5193/scripts/fixtures/ranking.html');
  const ranking = page.locator('.ad-ranking');
  await ranking.waitFor();
  const ranks = () => ranking.locator('.ad-ranking-rank').allTextContents();
  const alpha = ranking.getByRole('button', { name: '「Alpha」の残りの記録を展開', exact: true });
  const alphaButton = ranking.locator('.ad-ranking-controls button').first();
  const children = ranking.locator('.ad-ranking-child:visible');
  assert.deepEqual(await ranks(), ['1', '2', '3']);
  assert.equal(await children.count(), 0);
  assert.ok(await ranking.getByText('自分の記録を含む', { exact: true }).count());
  const regionId = await alpha.getAttribute('aria-controls');
  assert.equal(await page.locator(`[id="${regionId}"]`).count(), 1);
  assert.equal(await alpha.getAttribute('type'), 'button');

  // 実キー入力でスクロール領域、次いで最初の展開ボタンへ移動する。
  await page.getByRole('button', { name: 'ko', exact: true }).focus();
  await page.keyboard.press('Tab');
  assert.equal(await ranking.locator('.ad-ranking-scroll').evaluate(el => el === document.activeElement), true);
  await page.keyboard.press('Tab');
  assert.equal(await alpha.evaluate(el => el === document.activeElement), true);
  assert.equal(await alpha.evaluate(el => getComputedStyle(el).outlineStyle), 'solid');
  await page.keyboard.press('Enter');
  assert.equal(await alphaButton.getAttribute('aria-expanded'), 'true');
  assert.deepEqual(await ranks(), ['1', '2', '3']);
  assert.equal(await children.count(), 2);
  assert.deepEqual(await children.locator('td:nth-child(4)').allTextContents(), ['7', '5']);
  assert.deepEqual(await children.locator('td:nth-child(1)').allTextContents(), ['', '']);
  assert.equal(await children.locator('.ad-ranking-badge').count(), 1);
  assert.equal(await alphaButton.evaluate(el => el === document.activeElement), true);
  await page.keyboard.press('Space');
  assert.equal(await alphaButton.getAttribute('aria-expanded'), 'false');
  assert.equal(await children.count(), 0);
  await page.keyboard.press('Enter');
  await page.getByRole('button', { name: '並び更新 (初期)', exact: true }).click();
  const buttons = ranking.locator('.ad-ranking-controls button');
  assert.deepEqual(await buttons.evaluateAll(elements => elements.map(el => el.getAttribute('aria-expanded'))), ['false', 'false', 'true']);
  assert.match(await buttons.nth(2).getAttribute('aria-label'), /Alpha/);
  assert.deepEqual(await ranks(), ['1', '2', '3']);
  for (const button of await buttons.all()) if (await button.getAttribute('aria-expanded') === 'false') await button.click();
  assert.equal(await children.count(), 4);
  assert.deepEqual(await children.locator('td:nth-child(4)').allTextContents(), ['6', '987654321012345', '7', '5']);
  for (const language of ['en', 'ko', 'ja']) {
    await page.getByRole('button', { name: language, exact: true }).click();
    assert.equal(await children.count(), 4);
    assert.equal(await ranking.locator('th[scope="col"]').nth(4).textContent(), language === 'en' ? 'Play time' : language === 'ko' ? '플레이 시간' : 'プレイ時間');
  }
  await mkdir('.local/ranking-verification', { recursive: true });
  await page.screenshot({ path: '.local/ranking-verification/wide.png', fullPage: true });
  await page.getByRole('button', { name: '幅 (900px)', exact: true }).click();
  const scroll = ranking.locator('.ad-ranking-scroll');
  const dimensions = await scroll.evaluate(el => ({ client: el.clientWidth, content: el.scrollWidth, parent: el.parentElement.clientWidth }));
  assert.ok(dimensions.client <= 300 && dimensions.content > dimensions.client);
  assert.ok(dimensions.client <= dimensions.parent);
  for (const button of await buttons.all()) {
    await button.focus();
    await page.keyboard.press('Space');
    assert.equal(await button.getAttribute('aria-expanded'), 'false');
    await page.keyboard.press('Enter');
    assert.equal(await button.getAttribute('aria-expanded'), 'true');
  }
  assert.equal(await children.count(), 4);
  for (const cell of await ranking.locator('td').all()) {
    if (!(await cell.isVisible()) || !(await cell.textContent())) continue;
    await cell.scrollIntoViewIfNeeded();
    const cellBox = await cell.boundingBox(), scrollBox = await scroll.boundingBox();
    assert.ok(cellBox.x >= scrollBox.x - 1 && cellBox.x + cellBox.width <= scrollBox.x + scrollBox.width + 1);
  }
  await scroll.evaluate(el => { el.scrollLeft = el.scrollWidth; });
  assert.equal(await ranking.locator('td').filter({ hasText: '987654321012345' }).count(), 1);
  await page.screenshot({ path: '.local/ranking-verification/narrow-values.png', fullPage: true });
  await ranking.locator('td').filter({ hasText: '1234567890123456' }).scrollIntoViewIfNeeded();
  await page.screenshot({ path: '.local/ranking-verification/narrow-infinity.png', fullPage: true });
  await scroll.evaluate(el => { el.scrollLeft = 0; });
  await buttons.nth(1).focus();
  await page.screenshot({ path: '.local/ranking-verification/narrow-controls.png', fullPage: true });
  assert.deepEqual(await ranks(), ['1', '2', '3']);
  assert.deepEqual(errors, []);
  console.log('PASS: ranks, all 4 child records, self labels, Tab/Enter/Space, focus, reordered state, ja/en/ko, 320px overflow; screenshots in .local/ranking-verification');
} finally {
  await browser.close();
}
