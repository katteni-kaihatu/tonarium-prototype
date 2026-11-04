import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { stripTypeScriptTypes } from 'node:module';
import { createServer } from 'vite';

// Playwright 導入済みの環境で実行。既存モジュールの file: URL も指定できる。
const { chromium } = await import(process.argv[2] || 'playwright');
const source = stripTypeScriptTypes(readFileSync('client/src/home/horizontalWheel.ts', 'utf8')).replace('export ', '');
const css = readFileSync('client/src/styles/home.css', 'utf8');
// 実アプリの接続先や .env を使わず、Home を単独で描画する。
process.env.VITE_SYSTEM_PLAYTEST = '1';
const server = await createServer({ server: { host: '127.0.0.1', port: 0 } });
await server.listen();
const origin = `http://127.0.0.1:${server.httpServer.address().port}`;
try {
for (const executablePath of process.argv.slice(3).length ? process.argv.slice(3) : [
  'C:/Program Files/Google/Chrome/Application/chrome.exe',
  'C:/Program Files (x86)/Microsoft/Edge/Application/msedge.exe',
]) {
  const browser = await chromium.launch({ executablePath, headless: true });
  try {
    const page = await browser.newPage({ viewport: { width: 900, height: 700 }, hasTouch: true });
    page.setDefaultTimeout(10000);
    for (const sheet of [false, true]) {
      await page.setContent(`<style>${css}
        body { margin:0; font:16px/24px sans-serif; }
        #home { padding:20px; ${sheet ? 'height:600px;overflow-y:auto;' : ''} }
        .hrow { width:580px; } .hrow > * { height:140px; }
        footer { height:1500px; }
        </style><main id="home"><div id="target" class="hrow">${'<button>Card</button>'.repeat(8)}</div>
        <div id="other" class="hrow">${'<button>Other</button>'.repeat(8)}</div><footer></footer></main>
        <script>${source}
        window.row = document.querySelector('#target');
        window.cleanup = attachHorizontalWheel(row);
        window.wheel = (options = {}) => {
          const event = new WheelEvent('wheel', {deltaY:40, cancelable:true, bubbles:true, ...options});
          row.dispatchEvent(event);
          return { prevented:event.defaultPrevented, left:row.scrollLeft };
        };
        </script>`);
      const state = () => page.evaluate(() => ({ left:row.scrollLeft, max:row.scrollWidth-row.clientWidth }));
      const move = (options) => page.evaluate(options => wheel(options), options);
      const initialLeft = (await state()).left;
      assert.equal((await move()).prevented, true);
      assert.equal((await state()).left, initialLeft + 40);
      assert.equal((await move({ deltaY:-20 })).left, initialLeft + 20);
      for (let i = 0; i < 35; i++) {
        await move({ deltaY:4 });
        await page.waitForTimeout(10);
      }
      assert.equal((await state()).left, initialLeft + 160, 'small continuous inputs accumulate across frames');
      for (let i = 0; i < 100; i++) await move({ deltaY:0.1 });
      assert.ok(Math.abs((await state()).left - initialLeft - 170) < 1, 'fractional inputs accumulate despite coordinate rounding');
      assert.ok((await move({ deltaY:-0.1 })).left <= initialLeft + 170, 'reversing clears the previous direction remainder');
      await page.waitForTimeout(300);
      assert.equal(await page.evaluate(() => row.style.scrollSnapType), '', 'snap restored after gesture');
      for (const options of [{ctrlKey:true}, {shiftKey:true}, {deltaX:2}, {cancelable:false}, {deltaY:0}]) {
        assert.equal((await move(options)).prevented, false);
      }
      assert.equal(await page.evaluate(() => {
        const event = new WheelEvent('wheel', { deltaY:40, cancelable:true });
        event.preventDefault();
        const before = row.scrollLeft;
        row.dispatchEvent(event);
        return row.scrollLeft === before;
      }), true);
      await page.evaluate(() => { row.style.scrollSnapType = 'none'; row.scrollLeft = 0; });
      assert.equal((await move({ deltaY:2, deltaMode:1 })).left, 48, 'line delta uses computed line height');
      await page.evaluate(() => { row.style.lineHeight = 'normal'; row.scrollLeft = 0; });
      assert.ok((await move({ deltaY:1, deltaMode:1 })).left > 0, 'normal line height is measured');
      await page.evaluate(() => { row.scrollLeft = 0; });
      assert.equal((await move({ deltaY:1, deltaMode:2 })).left, await page.evaluate(() => row.clientWidth), 'page delta uses visible width');
      await page.evaluate(() => { row.scrollLeft = row.scrollWidth; });
      assert.equal((await move()).prevented, false);
      await page.locator('#target').hover();
      await page.mouse.wheel(0, 120);
      await page.waitForTimeout(120);
      assert.ok(await page.evaluate(sheet => sheet ? document.querySelector('#home').scrollTop > 0 : scrollY > 0, sheet), 'edge releases vertical scrolling');
      await page.evaluate(sheet => { if (sheet) document.querySelector('#home').scrollTop = 0; else scrollTo(0, 0); row.scrollLeft = 0; }, sheet);
      assert.equal((await move({ deltaY:-40 })).prevented, false);
      await page.evaluate(() => { row.style.width = '3000px'; });
      assert.equal((await move()).prevented, false, 'no overflow releases wheel');
      await page.evaluate(() => { row.style.width = '400px'; });
      assert.equal((await move()).prevented, true, 'resize is observed on each event');
      await page.evaluate(() => { cleanup(); row.style.scrollSnapType = 'none'; row.scrollLeft = 0; cleanup = attachHorizontalWheel(row); });
      await page.locator('#target').hover();
      await page.mouse.wheel(100, 0);
      await page.waitForTimeout(120);
      assert.ok((await state()).left > 0, 'native horizontal wheel still scrolls');
      await move();
      await page.evaluate(() => { cleanup(); row.replaceChildren(); });
      assert.equal(await page.evaluate(() => row.style.scrollSnapType), 'none', 'cleanup restores previous inline snap');
      await page.evaluate(() => {
        row.remove();
        row = document.createElement('div'); row.className = 'hrow';
        row.innerHTML = '<button>Card</button>'.repeat(8);
        document.querySelector('#home').prepend(row);
        cleanup = attachHorizontalWheel(row);
      });
      assert.equal((await move()).prevented, true, 'reattaching after an empty result works');
      await page.evaluate(() => cleanup());
      assert.equal((await move()).prevented, false, 'cleanup removes listener');
      assert.equal(await page.evaluate(() => {
        const event = new WheelEvent('wheel', { deltaY:40, cancelable:true });
        document.querySelector('#other').dispatchEvent(event);
        return event.defaultPrevented;
      }), false, 'other rows are unaffected');
    }
    await page.route(`${origin}/home-wheel-test`, async route => route.fulfill({
      contentType: 'text/html',
      body: await server.transformIndexHtml('/home-wheel-test', `<div id="root"></div><script type="module">
        import React from 'react';
        import { createRoot } from 'react-dom/client';
        import { Home } from '/src/home/Home.tsx';
        import { set } from '/src/store.ts';
        import { MARKET_PRODUCTS } from '/src/i18n/static.ts';
        import { purchaseProduct } from '/src/market/store.ts';
        import '/src/style.css';
        set({ selfId:'wheel-test' });
        MARKET_PRODUCTS.filter(product => product.category === 'worlds').forEach(product => purchaseProduct(product.id));
        const root = createRoot(document.querySelector('#root'));
        window.renderHome = (sheet) => {
          set({ homePage:'home', session:sheet ? 'wheel-test' : null, selfId:'wheel-test', wsConnected:true });
          root.render(React.createElement(Home, { sheet }));
        };
        renderHome(false);
      </script><style>.home.sheet { height:600px; }</style>`),
    }));
    await page.goto(`${origin}/home-wheel-test`);
    await page.waitForFunction(() => typeof window.renderHome === 'function');
    const worldRow = page.locator('.hrow').filter({ has: page.locator('.market-world-tile') });
    for (const sheet of [false, true]) {
      await page.evaluate(sheet => renderHome(sheet), sheet);
      await worldRow.waitFor();
      await worldRow.evaluate(row => { row.scrollLeft = 0; });
      assert.equal(await worldRow.evaluate(row => {
        const event = new WheelEvent('wheel', { deltaY:40, cancelable:true, bubbles:true });
        row.dispatchEvent(event);
        return event.defaultPrevented && row.scrollLeft > 0;
      }), true, 'real Home enables conversion');
      await page.locator('.hsearch input').fill('no-world-matches-this-query-97231');
      await worldRow.waitFor({ state:'detached' });
      await page.locator('.hsearch input').fill('');
      await worldRow.waitFor();
      assert.equal(await worldRow.evaluate(row => {
        const event = new WheelEvent('wheel', { deltaY:40, cancelable:true });
        row.dispatchEvent(event);
        return event.defaultPrevented;
      }), true, 'React ref reattaches after empty search');
      await worldRow.locator('.scjoin').first().click();
      await page.locator('.modal').waitFor();
      await page.locator('.modal .row.end > button').first().click();
      await page.locator('.modal').waitFor({ state:'detached' });
      await worldRow.locator('.market-origin').first().click();
      await page.waitForFunction(() => document.querySelector('.market-home'));
      await page.evaluate(sheet => renderHome(sheet), sheet);
      await worldRow.waitFor();
      await page.locator('.hsec').filter({ has: worldRow }).locator('.hlink').click();
      await worldRow.waitFor({ state:'detached' });
      assert.equal(await page.evaluate(async () => (await import('/src/store.ts')).get().homePage), 'worlds', 'more opens worlds');
    }
    console.log(`PASS ${executablePath}: real Home search lifecycle and card controls, normal and session sheet`);
    console.log(`PASS ${executablePath}: wheel conversion in document and scroll container`);
  } finally {
    await browser.close();
  }
}
} finally {
  await server.close();
}
