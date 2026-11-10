import assert from 'node:assert/strict';
import { mkdir, readFile } from 'node:fs/promises';
import { AUTOBUYER_IDS, INFINITY_UPGRADES } from '../client/src/ad/engine.mjs';

// fixture サーバーを先に起動。引数: Playwright の module URL、ブラウザ実行ファイル。
const { chromium } = await import(process.argv[2] || 'playwright');
const browser = await chromium.launch({ headless: true, ...(process.argv[3] ? { executablePath: process.argv[3] } : {}) });
try {
  const page = await browser.newPage({ viewport: { width: 1100, height: 950 }, hasTouch: true });
  const errors = [];
  page.on('pageerror', error => errors.push(error.message));
  await page.route('**/*', route => new URL(route.request().url()).hostname === '127.0.0.1' ? route.continue() : route.abort());
  await page.goto('http://127.0.0.1:5193/scripts/fixtures/ranking.html');
  const ranking = page.locator('.adlab-ranking');
  await ranking.waitFor();
  const ranks = () => ranking.locator('.adlab-ranking-rank').allTextContents();
  const alpha = ranking.getByRole('button', { name: '「Alpha」の残りの記録を展開', exact: true });
  const alphaButton = ranking.locator('.adlab-ranking-controls button').first();
  const children = ranking.locator('.adlab-ranking-child:visible');
  assert.deepEqual(await ranks(), ['1', '2', '3']);
  assert.equal(await children.count(), 0);
  assert.ok(await ranking.getByText('自分の記録を含む', { exact: true }).count());
  const regionId = await alpha.getAttribute('aria-controls');
  assert.equal(await page.locator(`[id="${regionId}"]`).count(), 1);
  assert.equal(await alpha.getAttribute('type'), 'button');

  // 実キー入力でスクロール領域、次いで最初の展開ボタンへ移動する。
  await page.getByRole('button', { name: 'ko', exact: true }).focus();
  await page.keyboard.press('Tab');
  assert.equal(await ranking.locator('.adlab-ranking-scroll').evaluate(el => el === document.activeElement), true);
  await page.keyboard.press('Tab');
  assert.equal(await alpha.evaluate(el => el === document.activeElement), true);
  assert.equal(await alpha.evaluate(el => getComputedStyle(el).outlineStyle), 'solid');
  await page.keyboard.press('Enter');
  assert.equal(await alphaButton.getAttribute('aria-expanded'), 'true');
  assert.deepEqual(await ranks(), ['1', '2', '3']);
  assert.equal(await children.count(), 2);
  assert.deepEqual(await children.locator('td:nth-child(4)').allTextContents(), ['0', '未取得']);
  assert.equal(await ranking.locator('th[scope="col"]:visible').count(), 7);
  assert.equal(await ranking.locator('tbody').first().locator('td').nth(2).textContent(), '17');
  assert.deepEqual(await children.locator('td:nth-child(5)').allTextContents(), ['0', '未取得']);
  assert.equal(await ranking.locator('tbody').first().locator('td').nth(3).textContent(), '12');
  assert.deepEqual(await children.locator('td:nth-child(6)').allTextContents(), ['7', '5']);
  assert.deepEqual(await children.locator('td:nth-child(1)').allTextContents(), ['', '']);
  assert.equal(await children.locator('.adlab-ranking-badge').count(), 1);
  assert.equal(await alphaButton.evaluate(el => el === document.activeElement), true);
  await page.keyboard.press('Space');
  assert.equal(await alphaButton.getAttribute('aria-expanded'), 'false');
  assert.equal(await children.count(), 0);
  await page.keyboard.press('Enter');
  await page.getByRole('button', { name: '並び更新 (初期)', exact: true }).click();
  const buttons = ranking.locator('.adlab-ranking-controls button');
  assert.deepEqual(await buttons.evaluateAll(elements => elements.map(el => el.getAttribute('aria-expanded'))), ['false', 'false', 'true']);
  assert.match(await buttons.nth(2).getAttribute('aria-label'), /Alpha/);
  assert.deepEqual(await ranks(), ['1', '2', '3']);
  for (const button of await buttons.all()) if (await button.getAttribute('aria-expanded') === 'false') await button.click();
  assert.equal(await children.count(), 4);
  assert.deepEqual(await children.locator('td:nth-child(6)').allTextContents(), ['6', '987654321012345', '7', '5']);
  await mkdir('.local/ranking-verification', { recursive: true });
  for (const language of ['en', 'ko', 'ja']) {
    await page.getByRole('button', { name: language, exact: true }).click();
    assert.equal(await children.count(), 4);
    assert.equal(await ranking.locator('th[scope="col"]:visible').nth(3).textContent(), 'Boost');
    assert.deepEqual(await children.locator('td:nth-child(4)').allTextContents(), [language === 'en' ? 'Not recorded' : language === 'ko' ? '미수집' : '未取得', language === 'en' ? 'Not recorded' : language === 'ko' ? '미수집' : '未取得', '0', language === 'en' ? 'Not recorded' : language === 'ko' ? '미수집' : '未取得']);
    const unavailable = language === 'en' ? 'Not recorded' : language === 'ko' ? '미수집' : '未取得';
    assert.equal(await ranking.locator('th[scope="col"]').nth(4).textContent(), language === 'en' ? 'Galaxies' : language === 'ko' ? '은하' : '銀河');
    assert.deepEqual(await children.locator('td:nth-child(5)').allTextContents(), ['6', unavailable, '0', unavailable]);
    assert.deepEqual(await ranking.locator('tbody:not([id]) tr td:nth-child(5)').allTextContents(), ['0', unavailable, '12']);
    assert.ok(await ranking.getByText(language === 'en' ? /Past records that are no longer kept cannot be recovered/ : language === 'ko' ? /저장 대상에서 제외된 과거 기록은 복원할 수 없습니다/ : /保存対象から外れた過去記録は復元できません/).count());
    assert.equal(await ranking.locator('th[scope="col"]').nth(6).textContent(), language === 'en' ? 'Play time' : language === 'ko' ? '플레이 시간' : 'プレイ時間');
    for (const width of [900, 320]) {
      await page.locator('.ranking-fixture-panel').evaluate((el, value) => { el.style.width = `${value}px`; }, width);
      const scroll = ranking.locator('.adlab-ranking-scroll');
      const dimensions = await scroll.evaluate(el => ({ client: el.clientWidth, content: el.scrollWidth, parent: el.parentElement.clientWidth }));
      assert.ok(dimensions.client <= dimensions.parent);
      if (width === 320) assert.ok(dimensions.client <= 304 && dimensions.content > dimensions.client);
      if (dimensions.content > dimensions.client) {
        await scroll.evaluate(el => { el.scrollLeft = 0; });
        await scroll.focus();
        await page.keyboard.press('ArrowRight');
        await page.waitForFunction(() => document.querySelector('.adlab-ranking-scroll').scrollLeft > 0);
      }
      for (const button of await buttons.all()) {
        await button.focus();
        await page.keyboard.press('Space');
        assert.equal(await button.getAttribute('aria-expanded'), 'false');
        await page.keyboard.press('Enter');
        assert.equal(await button.getAttribute('aria-expanded'), 'true');
      }
      assert.equal(await children.count(), 4);
      for (const cell of await ranking.locator('th, td').all()) {
        if (!(await cell.isVisible()) || !(await cell.textContent())) continue;
        await cell.scrollIntoViewIfNeeded();
        const cellBox = await cell.boundingBox(), scrollBox = await scroll.boundingBox();
        assert.ok(cellBox.x >= scrollBox.x - 1 && cellBox.x + cellBox.width <= scrollBox.x + scrollBox.width + 1);
      }
      await scroll.evaluate(el => { el.scrollLeft = 0; });
      await page.screenshot({ path: `.local/ranking-verification/ranking-${language}-${width}.png`, fullPage: true });
    }
  }
  await page.locator('.ranking-fixture-panel').evaluate(el => { el.style.width = '900px'; });
  await page.screenshot({ path: '.local/ranking-verification/wide.png', fullPage: true });
  await page.getByRole('button', { name: '幅 (900px)', exact: true }).click();
  const scroll = ranking.locator('.adlab-ranking-scroll');
  const dimensions = await scroll.evaluate(el => ({ client: el.clientWidth, content: el.scrollWidth, parent: el.parentElement.clientWidth }));
  assert.ok(dimensions.client <= 304 && dimensions.content > dimensions.client);
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
  await ranking.getByRole('button', { name: 'ランキングを更新', exact: true }).click();
  assert.equal(await page.locator('[data-refresh-calls]').textContent(), '1');
  await page.getByRole('button', { name: 'Reject: false', exact: true }).click();
  await ranking.getByRole('button', { name: 'ランキングを更新', exact: true }).click();
  assert.equal(await page.locator('[data-refresh-calls]').textContent(), '2');
  assert.equal(await page.locator('div[role="status"]').textContent(), 'ランキングを更新できませんでした。');

  const labels = {};
  for (const language of ['ja', 'en', 'ko']) {
    const source = await readFile(`client/src/i18n/${language}.ts`, 'utf8');
    labels[language] = key => {
      const match = source.match(new RegExp(`(?:"${key}"|\\b${key})\\s*:\\s*("(?:[^"\\\\]|\\\\.)*")`));
      assert.ok(match, `${language}: ${key}`);
      return JSON.parse(match[1]);
    };
  }
  await page.goto('http://127.0.0.1:5193/scripts/fixtures/ranking.html?panel');
  const panel = page.locator('.adlab-lab-panel');
  await panel.waitFor();
  const body = panel.locator('.adlab-body');
  const tabKeys = ['adLabText4', 'adInfinityTab', 'adLabText6', 'ui819', 'adLabText52', 'adSaveTab', 'adLabText7'];
  for (const language of ['ja', 'en', 'ko']) {
    await page.getByRole('button', { name: language, exact: true }).click();
    const label = labels[language];
    for (const infinity of [false, true]) {
      if (await page.getByRole('button', { name: `Infinity: ${!infinity}`, exact: true }).count()) {
        await page.getByRole('button', { name: `Infinity: ${!infinity}`, exact: true }).click();
      }
      // 実幅の境界はパネルの左右余白16pxも含めて確認する。
      for (const width of [320, 639, 640, 641, 655, 656, 657, 900]) {
        await page.setViewportSize({ width: Math.max(360, width + 32), height: 950 });
        await page.locator('.ranking-fixture-panel').evaluate((el, value) => { el.style.width = `${value}px`; }, width);
        const keys = tabKeys.filter(key => infinity || key !== 'adLabText7');
        const tabs = panel.locator('.adlab-tabs button');
        assert.deepEqual(await tabs.allTextContents(), keys.map(label));
        assert.equal(await tabs.first().evaluate(el => getComputedStyle(el).whiteSpace), 'nowrap');
        if (width === 320 && infinity) assert.equal(await panel.locator('.adlab-tabs').evaluate(el => el.scrollWidth > el.clientWidth), true);
        for (let index = 0; index < keys.length; index++) {
          const tab = tabs.nth(index);
          await tab.scrollIntoViewIfNeeded();
          if (width === 320) await tab.tap(); else await tab.click();
          assert.equal(await tab.getAttribute('aria-pressed'), 'true');
          assert.equal(await panel.locator('.adlab-tabs [aria-pressed="true"]').count(), 1);
          for (const [key, selector] of [
            ['adLabText4', '.adlab-dimensions'], ['adInfinityTab', '.adlab-infinity-head'],
            ['adLabText52', '.adlab-ranking'],
          ]) assert.equal(await body.locator(selector).count(), keys[index] === key ? 1 : 0);
          for (const [key, heading] of [['adLabText6', 'adLabText43'], ['ui819', 'ui819']]) {
            assert.equal(await body.locator('h3').filter({ hasText: label(heading) }).count(), keys[index] === key ? 1 : 0);
          }
          if (keys[index] === 'adSaveTab') assert.ok(await body.getByText(label('adIssueCode'), { exact: true }).count());
          if (keys[index] === 'adLabText7') assert.ok(await body.getByText(label('adLabText60'), { exact: true }).count());
          const box = await tab.boundingBox(), tabsBox = await panel.locator('.adlab-tabs').boundingBox();
          assert.ok(box.x >= tabsBox.x - 1 && box.x + box.width <= tabsBox.x + tabsBox.width + 1);
          assert.ok(box.height >= 40);
        }
        await tabs.first().focus();
        await page.keyboard.press('Enter');
        for (let index = 1; index < keys.length; index++) {
          await page.keyboard.press('Tab');
          assert.equal(await tabs.nth(index).evaluate(el => el === document.activeElement), true);
          await page.keyboard.press(index % 2 ? 'Space' : 'Enter');
          assert.equal(await tabs.nth(index).getAttribute('aria-pressed'), 'true');
        }
        if (language === 'ja' && infinity && [320, 656].includes(width)) {
          await page.screenshot({ path: `.local/ranking-verification/panel-${width}.png`, fullPage: true });
        }
      }
      if (infinity) {
        // 非表示になるタブを開いたまま進行を戻し、次元へ復帰する。
        for (const key of ['adLabText7']) {
          await panel.locator('.adlab-tabs').getByRole('button', { name: label(key), exact: true }).click();
          await page.getByRole('button', { name: 'Infinity: true', exact: true }).click();
          assert.equal(await panel.locator('.adlab-tabs button').first().getAttribute('aria-pressed'), 'true');
          assert.equal(await body.locator('.adlab-dimensions').count(), 1);
          await page.getByRole('button', { name: 'Infinity: false', exact: true }).click();
          assert.equal(await panel.locator('.adlab-tabs button').first().getAttribute('aria-pressed'), 'true');
        }
      }
    }
    await panel.locator('.adlab-tabs').getByRole('button', { name: label('adLabText52'), exact: true }).click();
    const refresh = body.getByRole('button', { name: label('adRankingRefresh'), exact: true });
    const beforeCalls = Number(await page.locator('[data-refresh-calls]').textContent());
    await refresh.click();
    assert.equal(Number(await page.locator('[data-refresh-calls]').textContent()), beforeCalls + 1);
    await page.getByRole('button', { name: 'Reject: false', exact: true }).click();
    await refresh.click();
    assert.equal(Number(await page.locator('[data-refresh-calls]').textContent()), beforeCalls + 2);
    await body.getByText(label('adRankingFailed'), { exact: true }).waitFor();
    await page.getByRole('button', { name: 'Reject: true', exact: true }).click();
  }
  for (const [key, heading] of [['adLabText6', 'adLabText43'], ['ui819', 'ui819'], ['adLabText52', 'adLabText52']]) {
    await panel.locator('.adlab-tabs').getByRole('button', { name: labels.ko(key), exact: true }).click();
    for (const language of ['en', 'ja', 'ko']) {
      await page.getByRole('button', { name: language, exact: true }).click();
      assert.equal(await panel.locator('.adlab-tabs [aria-pressed="true"]').textContent(), labels[language](key));
      assert.equal(await body.locator('h3').filter({ hasText: labels[language](heading) }).count(), 1);
    }
  }
  for (const preview of ['initial', 'locked', 'off', 'on', 'zero']) {
    await page.goto(`http://127.0.0.1:5193/scripts/fixtures/ranking.html?panel&preview=${preview}`);
    await panel.waitFor();
    for (const language of ['ja', 'en', 'ko']) {
      await page.getByRole('button', { name: language, exact: true }).click();
      await panel.locator('.adlab-tabs').getByRole('button', { name: labels[language]('adInfinityTab'), exact: true }).click();
      assert.equal(await panel.locator('.adlab-tabs [aria-pressed="true"]').textContent(), labels[language]('adInfinityTab'));
      for (const def of INFINITY_UPGRADES) assert.equal(await body.locator(`[data-iu="${def.id}"] .adlab-iu-desc`).count(), 1);
      assert.equal(await body.locator('.adlab-auto-row').count(), AUTOBUYER_IDS.length);
      assert.ok(await body.getByText(labels[language]('adInfinityPreview'), { exact: true }).count());
      assert.equal(await body.locator('.adlab-infinity button:enabled').count(), 0);
    }
    await page.getByRole('button', { name: 'Infinity: false', exact: true }).click();
    assert.equal(await body.getByText(labels.ko('adInfinityPreview'), { exact: true }).count(), 0);
    assert.equal(await body.locator('.adlab-iu-card').count(), INFINITY_UPGRADES.length);
    if (['off', 'on', 'zero'].includes(preview)) {
      assert.equal(await body.locator('[role="switch"]:enabled').count(), AUTOBUYER_IDS.length);
    }
    await page.getByRole('button', { name: 'Infinity: true', exact: true }).click();
    assert.equal(await body.locator('.adlab-infinity button:enabled').count(), 0);
    assert.equal(await body.locator('.adlab-iu-card').count(), INFINITY_UPGRADES.length);
  }
  assert.deepEqual(errors, []);
  console.log('PASS: ranking values, self labels, expansion, all columns and keyboard/scroll at 900px/320px in ja/en/ko; reorder, refresh/rejection, keyboard/focus; all panel tabs in ja/en/ko before/after Infinity at 320px and around 640px; screenshots in .local/ranking-verification');
} finally {
  await browser.close();
}
