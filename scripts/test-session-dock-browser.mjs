import assert from 'node:assert/strict';
import { writeFileSync, unlinkSync } from 'node:fs';

// Vite 起動済み・Playwright 導入済みの環境で実行する。実サーバーへの参加・音声接続は行わない。
const { chromium } = await import(process.argv[2] || 'playwright');
const origin = process.argv[3] || 'http://127.0.0.1:5173';
const executablePath = process.argv[4] || 'C:/Program Files/Google/Chrome/Application/chrome.exe';
const fixture = new URL(`../client/.session-dock-${process.pid}.html`, import.meta.url);
writeFileSync(fixture, `<!doctype html><meta charset="utf-8"><meta name="viewport" content="width=device-width, initial-scale=1"><div id="root"></div>
<script type="module">
import React from 'react';
import { createRoot } from 'react-dom/client';
import { WorldScreen } from '/src/world/WorldScreen.tsx';
import { Home } from '/src/home/Home.tsx';
import { get, set, useStore } from '/src/store.ts';
import '/src/style.css';
set({selfId:'dock-test', selfName:'Dock test', session:'dock-test', homePage:'changelog', sync:'connected',
  guild:{name:'Dock test', sessions:[{id:'dock-test', name:'Dock test', world:'room'}]}});
window.dockTest = {get, set};
function Fixture() { return React.createElement(useStore(s => s.session) ? WorldScreen : Home); }
createRoot(document.getElementById('root')).render(React.createElement(Fixture));
</script>`);
let browser;
try {
  browser = await chromium.launch({ headless: true, executablePath });
  for (const phone of [false, true]) {
    const context = await browser.newContext({ hasTouch: phone, isMobile: phone });
    const page = await context.newPage();
    try {
      await page.goto(`${origin}/${fixture.pathname.split('/').at(-1)}`);
      await page.locator('.dock').waitFor();
      const dock = page.locator('.dock');
      const popover = page.locator('.popover');
      const set = (state) => page.evaluate(state => window.dockTest.set(state), state);
      const state = () => page.evaluate(() => {
        const { micEnabled, sharer, voice } = window.dockTest.get();
        return { micEnabled, sharer, voice };
      });
      const reachable = async locator => {
        await locator.scrollIntoViewIfNeeded();
        const rect = await locator.boundingBox();
        assert(rect && rect.x >= 0 && rect.y >= 0 && rect.x + rect.width <= page.viewportSize().width + 1 && rect.y + rect.height <= page.viewportSize().height + 1);
        assert(await locator.evaluate(el => {
          const r = el.getBoundingClientRect();
          return el.contains(document.elementFromPoint(r.x + r.width / 2, r.y + r.height / 2));
        }), 'control is not covered');
      };
      const sizes = phone ? [[390, 844], [844, 390], [320, 568]] : [[1440, 900], [1024, 768]];
      for (const mode of phone ? ['2d'] : ['2d', '3d']) {
        await set({ mode });
        for (const [width, height] of sizes) {
          await page.setViewportSize({ width, height });
          // 同じ DOM 要素が開閉を越えて残ることを確認する。
          await dock.evaluate(el => { el.dataset.testIdentity = 'original'; });
          for (const status of [
            { voice: 'off', micEnabled: false, sharer: null },
            { voice: 'connected', micEnabled: true, sharer: null },
            { voice: 'connected', micEnabled: true, sharer: 'dock-test' },
            { voice: 'connected', micEnabled: false, sharer: 'other' },
          ]) {
            await set(status);
            await page.locator('.smenubtn').click();
            await page.locator('.home.sheet').waitFor();
            assert.equal(await dock.count(), 1);
            assert.equal(await dock.getAttribute('data-test-identity'), 'original');
            assert.deepEqual(await state(), status);
            assert.equal(await dock.locator('button').first().evaluate(el => el.classList.contains('muted')), !status.micEnabled);
            if (phone) assert.equal(await dock.locator('button').count(), 7);
            else {
              const share = dock.locator('button').nth(1);
              assert.equal(await share.isDisabled(), status.voice !== 'connected' || status.sharer === 'other');
              assert.equal(await share.evaluate(el => el.classList.contains('active')), status.sharer === 'dock-test');
            }
            await page.locator('.hcontent').evaluate(el => { el.scrollTop = el.scrollHeight; });
            for (const button of await dock.locator('button:visible').all()) await reachable(button);
            const anchors = dock.locator('[data-popanchor]');
            for (let i = 0; i < 3; i++) {
              const button = anchors.nth(i);
              await button.click();
              await popover.waitFor();
              assert(await popover.evaluate(el => el.parentElement === document.body));
              await reachable(popover);
              if (i < 2) {
                const choice = popover.locator(i === 0 ? '.sbtn' : '.emote-option').first();
                if (await choice.isEnabled()) await choice.click();
              }
              if (i === 2) {
                const slider = popover.locator('input').first();
                await slider.fill('0.5');
                const r = await slider.boundingBox();
                await page.mouse.move(r.x + 8, r.y + r.height / 2);
                await page.mouse.down();
                await page.mouse.move(r.x + r.width - 8, r.y + r.height / 2, { steps: 8 });
                await page.mouse.up();
                assert.equal(await slider.inputValue(), '1');
              }
              await page.keyboard.press('Escape');
              await popover.waitFor({ state: 'detached' });
              assert.equal(await page.locator('.home.sheet').count(), 1);
              await button.click();
              await popover.waitFor();
              await button.click();
              await popover.waitFor({ state: 'detached' });
              await button.click();
              await popover.waitFor();
              await page.locator('.hhead').click({ position: { x: 4, y: 4 } });
              await popover.waitFor({ state: 'detached' });
            }
            await anchors.last().click();
            await popover.waitFor();
            await page.keyboard.press('Escape');
            await page.keyboard.press('Escape');
            await page.locator('.home.sheet').waitFor({ state: 'detached' });
            assert.equal(await dock.getAttribute('data-test-identity'), 'original');
            assert.deepEqual(await state(), status);
            assert.equal(await dock.evaluate(el => getComputedStyle(el).position), 'absolute');
            await anchors.last().click();
            await popover.waitFor();
            await page.locator('.smenubtn').click();
            await popover.waitFor({ state: 'detached' });
            if (phone) {
              await page.locator('.home.sheet .hmorebtn').click();
              await reachable(dock.locator('button').first());
              await reachable(dock.locator('button').last());
              await page.locator('.home.sheet .hmorebtn').click();
            }
            await page.locator('.smenubtn').click();
          }
          await set({ voice: 'off', hubOpen: true });
          const mic = dock.locator('button').first();
          const before = (await state()).micEnabled;
          await mic.click();
          assert.equal((await state()).micEnabled, !before);
          await dock.locator('[data-popanchor]').last().click();
          await popover.waitFor();
          await page.setViewportSize({ width: height, height: width });
          await popover.waitFor({ state: 'detached' });
          await reachable(mic);
          await set({ hubOpen: false });
        }
      }
      await set({ session: null, hubOpen: false });
      await page.locator('.home:not(.sheet)').waitFor();
      assert.equal(await dock.count(), 0);
      console.log(`${phone ? 'phone' : 'desktop'} dock layout / state / popover checks passed`);
    } finally { await context.close(); }
  }
} finally {
  await browser?.close();
  unlinkSync(fixture);
}
