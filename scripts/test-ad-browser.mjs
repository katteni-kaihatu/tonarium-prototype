import assert from 'node:assert/strict';
import { mkdir, writeFile } from 'node:fs/promises';

// 既存のブラウザー環境を指定できる。パッケージの追加やダウンロードは行わない。
const { chromium } = await import(process.argv[2] || 'playwright');
const browser = await chromium.launch({ headless: true, ...(process.argv[3] ? { executablePath: process.argv[3] } : {}) });
const base = process.env.AD_TEST_URL || 'http://127.0.0.1:5173/ad-localization-test.html';
const beforeMode = process.argv.includes('--before');
const rules = '.ad-body, .ad-card, .ad-header, .ad-small, .ad-tabs { display: none !important; }';
const results = { browser: `Chromium ${browser.version()}`, reproduction: 'CSS injection only; no ad blocker installed', checks: [] };
await mkdir('.local/verification', { recursive: true });
const context = await browser.newContext({ viewport: { width: 1100, height: 900 }, reducedMotion: 'no-preference' });
const page = await context.newPage();
const errors = [];
page.on('pageerror', error => errors.push(error.message));
await page.route('**/*', route => new URL(route.request().url()).origin === new URL(base).origin ? route.continue() : route.abort());

async function noLegacyClasses() {
  const legacy = await page.locator('#panel, [data-xr-surface="ad-confirm"]').evaluateAll(roots => roots.flatMap(root =>
    [root, ...root.querySelectorAll('[class]')].flatMap(node => [...node.classList].filter(token => token.startsWith('ad-')))));
  assert.deepEqual(legacy, [], 'generated panel/dialog/SVG/particle classes');
}

const tabRequirements = [
  [['.adlab-card', 4], ['.adlab-dimension-card', 8]],
  [['.adlab-infinity-head', 1], ['.adlab-segments > button', 2], ['.adlab-iu-grid', 1], ['.adlab-iu-card', 16]],
  [['.adlab-body h2', 1], ['.adlab-body h3', 3], ['.adlab-ranking', 1], ['.adlab-ranking-table', 1]],
  [['.adlab-body h3', 2], ['.adlab-body input', 1], ['.adlab-body textarea', 1], ['.adlab-body summary', 1]],
  [['.adlab-segments > button', 5], ['.adlab-body svg[viewBox="0 0 160 160"]', 1], ['.adlab-body > div > p', 1]],
];
const infinityRequirements = [tabRequirements[1],
  [['.adlab-infinity-head', 1], ['.adlab-segments > button', 2], ['.adlab-cards', 1], ['.adlab-auto-card', 6]]];
const layerRequirements = [
  [['.adlab-body > div > p', 1]],
  [['.adlab-body h3', 2], ['.adlab-body button:disabled', 20]],
  [['.adlab-body h3', 3], ['.adlab-body button:disabled', 34]],
  [['.adlab-body h3', 2], ['.adlab-body button:disabled', 10]],
  [['.adlab-body h3', 1], ['.adlab-body > div > div:last-child > div > div', 6]],
];

async function panelLayout(tab = 0, segment = 0) {
  await noLegacyClasses();
  const specific = tab === 1 ? infinityRequirements[segment] : tab === 4
    ? [...tabRequirements[4].slice(0, 2), ...layerRequirements[segment]] : tabRequirements[tab];
  const report = await page.locator('#panel').evaluate((host, specific) => {
    const required = [['.adlab-header', 1], ['.adlab-resource-value', 1], ['.adlab-tabs', 1], ['.adlab-tab', 5], ['.adlab-body', 1], ...specific];
    const failures = [];
    for (const [selector, minimum] of required) {
      const nodes = host.querySelectorAll(selector);
      if (nodes.length < minimum) failures.push(`${selector}: count ${nodes.length} < ${minimum}`);
      for (const node of nodes) {
        const rect = node.getBoundingClientRect();
        if (rect.width <= 0 || rect.height <= 0) failures.push(`${selector}: no visible area`);
      }
    }
    const bounds = host.getBoundingClientRect();
    // ランキング表は既存仕様で専用領域内を横スクロールする。
    for (const node of host.querySelectorAll('.adlab-body, .adlab-header, .adlab-tabs, .adlab-segments, .adlab-ranking-scroll, .adlab-card, .adlab-dimension-card, button, input, textarea')) {
      if (node.matches('.adlab-segments, .adlab-ranking-scroll')) {
        const rect = node.getBoundingClientRect();
        if (rect.left < bounds.left - 1 || rect.right > bounds.right + 1) failures.push(`${node.className}: scroll container outside panel`);
        continue;
      }
      if (node.closest('.adlab-ranking-scroll, .adlab-segments')) continue;
      const rect = node.getBoundingClientRect();
      if (!rect.width || !rect.height) continue;
      if (rect.left < bounds.left - 1 || rect.right > bounds.right + 1) failures.push(`${node.tagName}.${node.className}: outside panel`);
      if (node.scrollWidth > node.clientWidth + 1) failures.push(`${node.tagName}.${node.className}: clipped content`);
    }
    return failures;
  }, specific);
  assert.deepEqual(report, [], 'required counts, visible area, horizontal layout');
}

try {
  if (beforeMode) {
    await page.addInitScript(rules => {
      const observer = new MutationObserver(() => {
        if (!document.querySelector('.ad-dimension-card')) return;
        observer.disconnect();
        const measure = () => Object.fromEntries(['resource', 'tabs', 'body', 'card'].map(name => {
          const node = document.querySelector(name === 'resource' ? '.ad-resource-value' : `.ad-${name}`);
          const rect = node?.getBoundingClientRect();
          return [name, { count: document.querySelectorAll(name === 'resource' ? '.ad-resource-value' : `.ad-${name}`).length,
            width: rect?.width ?? 0, height: rect?.height ?? 0 }];
        }));
        const before = measure();
        const style = document.createElement('style');
        style.textContent = rules;
        document.head.appendChild(style);
        const after = measure();
        window.adBlockerReproduction = { before, after, injectedRules: style.sheet.cssRules.length,
          panelCssLoaded: getComputedStyle(document.querySelector('.ad-lab-panel')).containerType === 'inline-size' };
        style.remove();
      });
      observer.observe(document, { childList: true, subtree: true });
    }, rules);
    await page.goto(base);
    await page.waitForFunction(() => window.adBlockerReproduction, null, { timeout: 30000 });
    const evidence = await page.evaluate(() => window.adBlockerReproduction);
    results.checks.push(evidence);
    assert.equal(evidence.injectedRules, 1);
    assert.equal(evidence.panelCssLoaded, true);
    for (const name of ['resource', 'tabs', 'body', 'card']) {
      assert.ok(evidence.before[name].count > 0 && evidence.before[name].width > 0 && evidence.before[name].height > 0, `${name} initially visible`);
      assert.equal(evidence.after[name].width, 0, `${name} hidden by injection`);
      assert.equal(evidence.after[name].height, 0, `${name} hidden by injection`);
    }
  } else {
    for (const blocked of [false, true]) {
      await page.goto(base + (blocked ? '?blocker=1' : ''));
      await page.waitForFunction(() => /^(PASS|FAIL):/.test(document.getElementById('result').textContent), null, { timeout: 300000 });
      const result = await page.locator('#result').textContent();
      results.checks.push({ blocked, existingRegression: result });

      await page.goto(base + '?interactive=1');
      await page.waitForFunction(() => window.adBrowserTest);
      const style = blocked ? await page.addStyleTag({ content: rules }) : null;
      for (const width of [320, 375, 390, 540, 1000]) {
        await page.setViewportSize({ width, height: 900 });
        for (const language of ['ja', 'en', 'ko']) {
          await page.evaluate(({ language, width }) => window.adBrowserTest.reset(language, width), { language, width });
          await panelLayout();
          const tabs = page.locator('.adlab-tabs > button');
          for (let index = 0; index < await tabs.count(); index++) {
            const previousText = await page.locator('.adlab-body').textContent();
            const alreadySelected = await tabs.nth(index).getAttribute('aria-pressed') === 'true';
            await tabs.nth(index).click();
            assert.equal(await tabs.nth(index).getAttribute('aria-pressed'), 'true');
            if (!alreadySelected) assert.notEqual(await page.locator('.adlab-body').textContent(), previousText, 'tab changes body');
            await panelLayout(index);
            const rankingToggle = page.locator('.adlab-ranking button[aria-expanded="false"]');
            if (await rankingToggle.count()) {
              await rankingToggle.first().click();
              await noLegacyClasses();
              await panelLayout(index);
            }
            const segments = page.locator('.adlab-body .adlab-segments button');
            for (let segment = 0; segment < await segments.count(); segment++) {
              const previousText = await page.locator('.adlab-body').textContent();
              const alreadySelected = await segments.nth(segment).getAttribute('aria-pressed') === 'true';
              await segments.nth(segment).click();
              assert.equal(await segments.nth(segment).getAttribute('aria-pressed'), 'true');
              if (!alreadySelected) assert.notEqual(await page.locator('.adlab-body').textContent(), previousText, 'subtab changes body');
              await panelLayout(index, segment);
              if (width === 320 && language === 'ja' && index === 1) {
                const selector = segment === 0 ? '.adlab-iu-card' : '.adlab-auto-card';
                const hidden = await page.addStyleTag({ content: `${selector} { display: none !important; }` });
                try {
                  await assert.rejects(() => panelLayout(index, segment), /no visible area/, `${selector}: hidden cards must fail`);
                } finally {
                  await hidden.evaluate(node => node.remove());
                }
                await panelLayout(index, segment);
                results.checks.push({ blocked, hiddenCardGuard: selector, result: 'PASS: hidden cards rejected' });
              }
            }
          }
          await tabs.first().click();
          const labels = await page.evaluate(() => window.adBrowserTest.labels());
          const purchaseBefore = await page.evaluate(() => window.adBrowserTest.snapshot());
          await page.getByRole('button', { name: labels.buy, exact: true }).click();
          const purchaseAfter = await page.evaluate(() => window.adBrowserTest.snapshot());
          assert.equal(purchaseAfter.bought, purchaseBefore.bought + 1, 'real purchase count');
          const a = purchaseAfter.antimatter, b = purchaseBefore.antimatter;
          assert.ok(a.exponent < b.exponent || a.exponent === b.exponent && a.mantissa < b.mantissa, 'real purchase spends resources');
          await page.locator('.adlab-feedback-burst').first().waitFor({ state: 'attached' });
          await noLegacyClasses();
          const anchorError = await page.locator('#panel').evaluate(host => {
            const panel = host.firstElementChild.getBoundingClientRect();
            const reactor = host.querySelector('[data-tier="1"] .adlab-dimension-reactor').getBoundingClientRect();
            const button = host.querySelector('[data-tier="1"] button').getBoundingClientRect();
            const anchor = reactor.top + reactor.height / 2 >= panel.top && reactor.top + reactor.height / 2 <= panel.bottom ? reactor : button;
            const burst = host.querySelector('.adlab-feedback-burst').getBoundingClientRect();
            return Math.max(Math.abs(burst.left + burst.width / 2 - anchor.left - anchor.width / 2), Math.abs(burst.top + burst.height / 2 - anchor.top - anchor.height / 2));
          });
          assert.ok(anchorError < 1, 'purchase feedback originates at visible tier reactor or purchase button');

          await page.evaluate(({ language, width }) => window.adBrowserTest.reset(language, width, true), { language, width });
          const crunch = page.getByRole('button', { name: labels.crunch, exact: true });
          const initial = await page.evaluate(() => window.adBrowserTest.snapshot());
          for (const method of ['cancel', 'escape', 'approve']) {
            await crunch.click();
            const dialog = page.getByRole('alertdialog');
            await dialog.waitFor({ state: 'visible' });
            const dialogBounds = await dialog.boundingBox();
            assert.ok(dialogBounds && dialogBounds.width > 0 && dialogBounds.height > 0 && dialogBounds.x >= -1 && dialogBounds.x + dialogBounds.width <= width + 1, 'dialog has visible area and fits viewport');
            await noLegacyClasses();
            assert.equal(await dialog.evaluate(node => node.contains(document.activeElement)), true, 'dialog receives focus');
            await page.keyboard.press('Shift+Tab');
            assert.equal(await dialog.locator('button').last().evaluate(node => node === document.activeElement), true, 'reverse focus wrap');
            await page.keyboard.press('Tab');
            assert.equal(await dialog.locator('button').first().evaluate(node => node === document.activeElement), true, 'forward focus wrap');
            if (method === 'escape') await page.keyboard.press('Escape');
            else await dialog.getByRole('button', { name: method === 'approve' ? labels.ok : labels.cancel, exact: true }).click();
            await dialog.waitFor({ state: 'detached' });
            const state = await page.evaluate(() => window.adBrowserTest.snapshot());
            if (method === 'approve') assert.equal(state.infinities, initial.infinities + 1, 'real crunch dispatched on approval');
            else {
              assert.deepEqual(state, initial, 'cancel keeps game unchanged');
              assert.equal(await crunch.evaluate(node => node === document.activeElement), true, 'focus returns to initiating button');
            }
          }
          results.checks.push({ blocked, width, language, result: 'PASS: layout, tabs, real purchase, particle origin, dialog and focus' });
        }
      }
      if (style) await style.evaluate(node => node.remove());
      await page.evaluate(() => window.adBrowserTest.dispose());
    }
  }
  assert.ok(results.checks.every(check => !check.existingRegression || check.existingRegression.startsWith('PASS:')), 'existing browser regression checks (see recorded results)');
  assert.deepEqual(errors, [], 'browser errors');
  results.status = 'PASS';
} catch (error) {
  results.status = 'FAIL';
  results.error = String(error);
  process.exitCode = 1;
} finally {
  await context.close();
  await browser.close();
  await writeFile(`.local/verification/ad-browser${beforeMode ? '-before' : ''}.json`, JSON.stringify(results, null, 2));
  console.log(JSON.stringify(results, null, 2));
}
