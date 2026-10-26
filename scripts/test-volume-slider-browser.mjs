import { readFileSync, mkdirSync, writeFileSync } from 'node:fs';
import { createServer } from 'node:http';
import assert from 'node:assert/strict';
// Playwright 導入済みの環境で実行。既存モジュールの file: URL とブラウザのパスも指定できる。
const { chromium } = await import(process.argv[2] || 'playwright');
const { default: sharp } = await import(process.argv[3] || 'sharp');
const executables = process.argv.slice(4);
if (!executables.length) executables.push('C:/Program Files/Google/Chrome/Application/chrome.exe', 'C:/Program Files (x86)/Microsoft/Edge/Application/msedge.exe');
mkdirSync('.local', {recursive:true});

const css = ['base', 'world', 'chat-media', 'responsive'].map(name => readFileSync(`client/src/styles/${name}.css`, 'utf8')).join('\n');
const labels = ['人の声', 'サウンドボード・効果音', '動画・画面共有', '個別の声'];
const html = `<!doctype html><meta charset="utf-8"><style>${css}</style><main style="width:260px;padding:8px"><b>音量（自分だけ）</b>${labels.map((label, i) => `<label class="volrow"><span class="vollabel"><span>${label}</span><b>0%</b></span><input aria-label="${label}" type="range" min="0" max="${i === 3 ? 2 : 1}" step="0.05" value="0"></label>`).join('')}</main><div class="mediactl"><input aria-label="動画シーク" type="range"></div><input aria-label="VR旋回速度" type="range"><script>for(const el of document.querySelectorAll('.volrow input'))el.addEventListener('input',()=>el.previousElementSibling.lastElementChild.textContent=Math.round(el.value*100)+'%')</script>`;
const server = createServer((req, res) => {res.setHeader('Content-Type', 'text/html'); res.end(html);});
await new Promise(resolve => server.listen(0, '127.0.0.1', resolve));
const results = [];
try {
  for (const [browserIndex, executablePath] of executables.entries()) {
    const browser = await chromium.launch({headless:true, executablePath});
    try {
      const context = await browser.newContext({hasTouch:true, deviceScaleFactor:1});
      const page = await context.newPage();
      await page.goto(`http://127.0.0.1:${server.address().port}`);
      let checks = 0;
      for (const width of [1440, 768, 390, 320]) {
        await page.setViewportSize({width, height:700});
        for (let i = 0; i < labels.length; i++) {
          const el = page.getByRole('slider', {name:labels[i], exact:true});
          const rect = await el.boundingBox();
          const max = i === 3 ? 2 : 1;
          for (const ratio of [0, .05, .5, .95, 1]) {
            await el.fill(String(ratio*max));
            await el.blur();
            const {data, info} = await sharp(await el.screenshot()).ensureAlpha().raw().toBuffer({resolveWithObject:true});
            const png = {data, width:info.width, height:info.height};
            const accent = [], line = [];
            for (let y=0;y<png.height;y++) for(let x=0;x<png.width;x++) {
              const o=(y*png.width+x)*4, rgb=[...png.data.subarray(o,o+3)].join(',');
              if(rgb==='47,95,196') accent.push([x,y]);
              if(rgb==='220,213,200') line.push([x,y]);
            }
            assert(accent.length > 140, 'thumb is fully drawn');
            const xs=accent.map(p=>p[0]), ys=accent.map(p=>p[1]);
            assert(Math.abs((Math.min(...xs)+Math.max(...xs))/2-(8+(png.width-16)*ratio-.5))<=1, 'thumb travel');
            assert(Math.max(...ys)-Math.min(...ys)>=13 && Math.min(...ys)>0 && Math.max(...ys)<png.height-1, 'thumb is not clipped');
            assert(line.every(([x])=>x>=8 && x<png.width-8), 'track ends at thumb center travel');
            checks++;
          }
          for (const [ratio, expected] of [[0,0],[.5,max/2],[1,max]]) {
            await page.mouse.click(rect.x+8+(rect.width-16)*ratio,rect.y+22);
            assert.equal(Number(await el.inputValue()),expected);
            checks++;
          }
          await page.mouse.move(rect.x+rect.width-8,rect.y+22); await page.mouse.down();
          await page.mouse.move(rect.x+8,rect.y+22,{steps:8}); await page.mouse.up();
          assert.equal(Number(await el.inputValue()),0);
          await el.press('End'); assert.equal(Number(await el.inputValue()),max);
          await el.press('Home'); await el.press('ArrowRight'); assert.equal(Number(await el.inputValue()),.05);
          await el.press('ArrowLeft'); assert.equal(Number(await el.inputValue()),0);
          await page.touchscreen.tap(rect.x+rect.width-8,rect.y+22); assert.equal(Number(await el.inputValue()),max);
          await page.touchscreen.tap(rect.x+8,rect.y+22); assert.equal(Number(await el.inputValue()),0);
          checks+=6;
        }
      }
      for (const label of ['動画シーク','VR旋回速度']) {
        const style = await page.getByRole('slider',{name:label}).evaluate(el=>({appearance:getComputedStyle(el).appearance,thumb:getComputedStyle(el).getPropertyValue('--volume-thumb')}));
        assert.equal(style.appearance,'auto'); assert.equal(style.thumb,''); checks++;
      }
      for (const el of await page.locator('.volrow input').all()) await el.fill('0.5');
      await page.screenshot({path:`.local/volume-browser-${browserIndex}.png`});
      results.push({executablePath,version:browser.version(),widths:[1440,768,390,320],checks});
    } finally {await browser.close();}
  }
  writeFileSync('.local/volume-results.json',JSON.stringify(results,null,2));
  console.log(JSON.stringify(results));
} finally {server.close();}
