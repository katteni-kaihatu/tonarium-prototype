import assert from 'node:assert/strict';
import test from 'node:test';
import { createElement } from 'react';
import { renderToStaticMarkup } from 'react-dom/server';
import { ITEM_VARIANTS } from '../../../shared/item-variants.ts';
import { ITEM_INFO as RAW_ITEMS } from '../../../shared/items.ts';
import { receiveContentTranslations } from '../content-translations.ts';
import { getLanguage, setLanguage } from '../i18n/core.ts';
import { localizedVariantInfo, localizedVariantUsage } from '../items/metadata.ts';
import { useOwnedItems, type OwnedItem } from './items.ts';

const reset = () => receiveContentTranslations({ schema: 1, revision: 'empty', pending: false, entries: {} });
function renderedMenu() {
  let entries: OwnedItem[] = [];
  function Menu() {
    entries = useOwnedItems();
    return createElement('div', null, entries.map(entry => createElement('button', { key: entry.id, 'data-id': entry.id, 'data-variant': entry.variant }, entry.info.name, entry.usage)));
  }
  const html = renderToStaticMarkup(createElement(Menu));
  return { entries, html };
}

test('the ordinary item menu includes distinct native and timer cameras in Japanese, English and Korean without loaded metadata', t => {
  const language = getLanguage(), original = structuredClone(RAW_ITEMS.camera); t.after(() => { reset(); setLanguage(language); }); reset();
  for (const [locale, name] of [['ja', '5秒タイマーカメラ'], ['en', '5-second timer camera'], ['ko', '5초 딜레이 카메라']] as const) {
    setLanguage(locale);
    const menu = renderedMenu(), timer = menu.entries.filter(entry => entry.id === 'camera-timer');
    assert.equal(timer.length, 1); assert.equal(timer[0].kind, 'camera'); assert.equal(timer[0].variant, 'camera-timer');
    assert.equal(timer[0].info.name, name); assert.equal(timer[0].info.in2d, false); assert.equal(timer[0].info.in3d, true);
    assert.ok(timer[0].usage?.includes('5') || timer[0].usage?.includes('five'));
    assert.ok(menu.html.includes(name)); assert.ok(menu.html.includes('data-variant="camera-timer"'));
    const native = menu.entries.find(entry => entry.id === 'camera')!;
    assert.equal(native.variant, undefined); assert.equal(native.kind, 'camera'); assert.notEqual(native.info.name, name);
  }
  assert.deepEqual(RAW_ITEMS.camera, original);
});

test('variant metadata follows source-matched translations and stale metadata falls back consistently after language changes', t => {
  const language = getLanguage(); t.after(() => { reset(); setLanguage(language); }); reset();
  const definition = ITEM_VARIANTS['camera-timer'], info = localizedVariantInfo(definition.id)!;
  setLanguage('ko'); assert.equal(info.name, '5초 딜레이 카메라');
  setLanguage('en'); assert.equal(info.name, '5-second timer camera');
  receiveContentTranslations({ schema: 1, revision: 'translated', pending: false, entries: {
    'item/camera-timer': { fields: {
      name: { source: definition.info.name, translations: { ko: '저장된 카메라 이름' } },
      usage: { source: definition.usage, translations: { ko: '저장된 사용법' } },
      desc: { source: 'old description', translations: { ko: '낡은 설명' } },
    } },
  } });
  setLanguage('ko'); assert.equal(info.name, '저장된 카메라 이름'); assert.notEqual(info.desc, '낡은 설명');
  assert.equal(localizedVariantUsage(definition.id), '저장된 사용법');
  const menu = renderedMenu(), listed = menu.entries.find(entry => entry.id === definition.id)!;
  assert.equal(listed.info.name, info.name); assert.equal(listed.usage, '저장된 사용법');
  assert.equal(info.illustration, RAW_ITEMS.camera.illustration);
  assert.equal(localizedVariantInfo('constructor'), undefined); assert.equal(localizedVariantUsage('missing'), undefined);
});
