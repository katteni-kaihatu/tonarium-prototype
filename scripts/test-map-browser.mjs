import assert from 'node:assert/strict';
import { mkdir, readFile } from 'node:fs/promises';

// fixture サーバーを先に起動。引数は既存の Playwright の module URL とブラウザ実行ファイル。
const { chromium } = await import(process.argv[2] || 'playwright');
const browser = await chromium.launch({ headless: true, ...(process.argv[3] ? { executablePath: process.argv[3] } : {}) });
const url = 'http://127.0.0.1:5194/scripts/fixtures/map.html';
await mkdir('.local/verification', { recursive: true });
try {
  for (const mobile of [false, true]) {
    const context = await browser.newContext({ viewport: mobile ? { width: 390, height: 844 } : { width: 1200, height: 900 }, hasTouch: mobile, isMobile: mobile });
    const page = await context.newPage();
    const errors = [];
    page.on('pageerror', e => errors.push(e.message));
    await page.route('**/*', async route => {
      const url = new URL(route.request().url());
      if (url.hostname === '127.0.0.1') return route.continue();
      // 既存の Three.js に同梱されたデコーダーで、外部接続なしに実モデルを読む。
      const decoder = url.pathname.split('/').pop();
      if (url.hostname === 'www.gstatic.com' && ['draco_decoder.js', 'draco_decoder.wasm', 'draco_wasm_wrapper.js'].includes(decoder)) {
        return route.fulfill({ body: await readFile(new URL(`../node_modules/three/examples/jsm/libs/draco/gltf/${decoder}`, import.meta.url)), contentType: decoder.endsWith('.wasm') ? 'application/wasm' : 'text/javascript', headers: { 'Access-Control-Allow-Origin': '*' } });
      }
      return route.abort();
    });
    await page.goto(url);
    await page.locator('.mapfloor[style]').waitFor({ state: 'visible' });
    await page.locator('.mname').waitFor().catch(async error => {
      await page.screenshot({ path: '.local/verification/map-failure.png' });
      throw new Error(`${error.message}; page errors: ${errors.join('; ')}`);
    });
    const home = await page.locator('.mapfloor').getAttribute('style');
    const reset = () => page.evaluate(() => window.mapTest.reset());
    const snapshot = () => page.evaluate(() => window.mapTest.snapshot());
    const x = mobile ? 195 : 610, y = 450;
    if (mobile) {
      await reset();
      await page.touchscreen.tap(x, y);
      assert.equal((await snapshot()).moves.length, 1, 'native touch tap must walk');
      await reset();
      const input = await context.newCDPSession(page);
      await input.send('Input.dispatchTouchEvent', { type: 'touchStart', touchPoints: [{ x, y, id: 1 }] });
      await input.send('Input.dispatchTouchEvent', { type: 'touchCancel', touchPoints: [] });
      let state = await snapshot();
      assert.ok(state.events.some(e => e.type === 'pointercancel'), 'browser touch cancellation must reach Map2D');
      assert.equal(state.moves.length, 0, 'native touch cancellation must not walk');
      await page.touchscreen.tap(x, y);
      state = await snapshot();
      assert.equal(state.moves.length, 1, 'tap after native cancellation must walk');
      await input.detach();
    } else {
      await reset();
      await page.mouse.move(x, y);
      await page.mouse.down({ button: 'left' });
      await page.mouse.down({ button: 'right' });
      await page.mouse.move(x + 1, y + 1);
      await page.mouse.up({ button: 'right' });
      await page.mouse.up({ button: 'left' });
      const chord = await snapshot();
      assert.equal(chord.events.filter(e => e.type === 'pointerdown').length, 1, 'additional mouse button must not emit another pointerdown');
      assert.ok(chord.events.some(e => e.type === 'pointermove' && e.button === 2 && e.buttons === 3), 'right press must arrive as pointermove with both buttons');
      assert.ok(chord.events.some(e => e.type === 'pointermove' && e.button === 2 && e.buttons === 1), 'right release must arrive as pointermove with only left held');
      assert.equal(chord.moves.length, 0, 'left down / right down / right up / left up must not walk');
      await page.mouse.click(x, y);
      assert.equal((await snapshot()).moves.length, 1, 'fresh click after all buttons are released must walk');
      for (const button of ['right', 'middle']) {
        await reset();
        const before = await page.locator('.mapfloor').getAttribute('style');
        await page.mouse.move(x, y);
        await page.mouse.down({ button });
        await page.mouse.move(x + 70, y + 35, { steps: 8 });
        await page.mouse.up({ button });
        const state = await snapshot();
        assert.equal(state.moves.length, 0, `${button} drag must not walk`);
        await page.waitForFunction(before => document.querySelector('.mapfloor').getAttribute('style') !== before, before);
        await reset();
        await page.mouse.click(x, y, { button });
        assert.equal((await snapshot()).moves.length, 0, `${button} click must not walk`);
      }
      for (const type of ['pointercancel', 'lostpointercapture']) {
        await reset();
        await page.mouse.move(x, y);
        await page.mouse.down();
        await page.evaluate(() => window.mapTest.capture());
        // 次の実入力で pending capture を確定させる。ドラッグ閾値は超えない。
        await page.mouse.move(x + 1, y + 1);
        await page.evaluate(type => window.mapTest.interrupt(type), type);
        await page.mouse.move(x + 2, y + 2);
        await page.mouse.up();
        assert.equal((await snapshot()).moves.length, 0, `${type} must cancel even when a child stops propagation`);
      }
      await reset();
      await page.mouse.move(x, y);
      await page.mouse.down();
      await page.mouse.move(x + 30, y + 30);
      await page.mouse.move(x, y);
      await page.mouse.up();
      assert.equal((await snapshot()).moves.length, 0, 'left drag returning to its start must not walk');
      await reset();
      await page.evaluate(() => new Promise((resolve, reject) => {
        let previous = '', stable = 0, frames = 0;
        const tick = () => {
          const current = document.querySelector('.mapfloor').getAttribute('style');
          stable = current === previous ? stable + 1 : 0;
          previous = current;
          if (stable >= 3) resolve();
          else if (++frames > 240) reject(new Error('Map camera did not settle'));
          else requestAnimationFrame(tick);
        };
        requestAnimationFrame(tick);
      }));
      const expected = await page.evaluate(({ x, y }) => window.mapTest.floorTarget(x, y), { x, y });
      await page.mouse.click(x, y);
      const { moves } = await snapshot();
      assert.equal(moves.length, 1, 'left click after rotation/pan/cancellation must walk');
      assert.ok(Math.hypot(moves[0].x - expected.x, moves[0].z - expected.z) < .01, 'walk target must agree with the rotated SVG floor');
      const changed = await page.locator('.mapfloor').getAttribute('style');
      await page.mouse.wheel(0, -200);
      await page.waitForFunction(before => document.querySelector('.mapfloor').getAttribute('style') !== before, changed);
      await page.keyboard.press('Space');
      await page.waitForFunction(home => {
        const initial = new DOMMatrix(home.slice(home.indexOf('matrix3d('), home.lastIndexOf(')') + 1));
        const current = new DOMMatrix(getComputedStyle(document.querySelector('.mapfloor')).transform);
        return [[0, 0], [-8, 8], [8, -8]].every(([x, y]) => {
          const a = new DOMPoint(x, y).matrixTransform(initial), b = new DOMPoint(x, y).matrixTransform(current);
          return Math.hypot(a.x / a.w - b.x / b.w, a.y / a.w - b.y / b.w) < .02;
        });
      }, home);
    }
    await page.waitForFunction(() => window.mapTest.snapshot().bodies.some(body => body.meshes > 10));
    await page.screenshot({ path: `.local/verification/map-${mobile ? 'mobile' : 'desktop'}.png` });
    if (!mobile) {
      await page.evaluate(() => {
        const self = { id: 'map-test', name: 'Map test', mode: '2d', pos: { x: 0, z: 0, ry: 0 }, avatar: null };
        window.mapTest.received([self, { ...self, id: 'peer-2d', name: 'Peer 2D', pos: { x: -3, z: 2, ry: 1 } }, { ...self, id: 'peer-3d', name: 'Peer 3D', mode: '3d' }], { 'peer-3d': { x: 3, z: -2, ry: -1 } });
      });
      await page.locator('.mapname').filter({ hasText: 'Peer 3D' }).waitFor();
      await page.waitForFunction(() => {
        const bodies = window.mapTest.snapshot().bodies;
        return bodies.length === 3 && bodies.every(body => body.meshes > 10)
          && bodies.some(body => body.id === 'peer-2d' && Math.abs(body.position[0] + 3) < .05 && Math.abs(body.ry - 1) < .05)
          && bodies.some(body => body.id === 'peer-3d' && Math.abs(body.position[0] - 3) < .05 && Math.abs(body.ry + 1) < .05);
      });
      await page.screenshot({ path: '.local/verification/map-participants.png' });
      await page.evaluate(() => {
        const self = { id: 'map-test', name: 'Map test', mode: '2d', pos: { x: 0, z: 0, ry: 0 }, avatar: null };
        window.mapTest.received([self, { ...self, id: 'peer-3d', name: 'Moved peer', mode: '3d' }], { 'peer-3d': { x: -4, z: 1, ry: 2 } });
      });
      await page.waitForFunction(() => {
        const bodies = window.mapTest.snapshot().bodies;
        return bodies.length === 2 && bodies.some(body => body.id === 'peer-3d' && Math.abs(body.position[0] + 4) < .05 && Math.abs(body.ry - 2) < .05);
      });
      assert.equal(await page.locator('.mapname').filter({ hasText: 'Peer 2D' }).count(), 0, 'departing participant label must be removed');
      await page.locator('.mapname').filter({ hasText: 'Moved peer' }).waitFor();
      await page.evaluate(() => window.mapTest.show('2d', 'cafe'));
      await page.locator('.mapfloor .msolid').first().waitFor();
      await page.screenshot({ path: '.local/verification/map-cafe.png' });
      await page.evaluate(() => window.mapTest.show('3d', 'room'));
      await page.locator('.map3d canvas').waitFor();
      await page.waitForFunction(() => window.mapTest.snapshot().render?.calls > 0);
      await page.screenshot({ path: '.local/verification/map-3d.png' });
    }
    assert.deepEqual(errors, []);
    await context.close();
  }
  console.log('PASS: Map2D controls, multi-button cancellation, capture loss, rotated floor click, zoom/reset, mobile tap, received participant updates, world switch and Map3D rendering');
} finally {
  await browser.close();
}
