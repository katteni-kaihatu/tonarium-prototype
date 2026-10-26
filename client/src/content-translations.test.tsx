import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { registerHooks } from 'node:module';
import test from 'node:test';
import { setImmediate as nextTurn, setTimeout as pause } from 'node:timers/promises';
import { renderToStaticMarkup } from 'react-dom/server';
import type { SystemEntry, SystemManifest } from '../../shared/system-types.ts';
import { getLanguage, setLanguage } from './i18n/core.ts';
import { ITEM_INFO, MARKET_PRODUCTS, WORLDS } from './i18n/static.ts';
import { ITEM_INFO as RAW_ITEMS } from '../../shared/items.ts';
import { MARKET_PRODUCTS as RAW_PRODUCTS } from '../../shared/market.ts';
import { WORLDS as RAW_WORLDS } from '../../shared/worlds.ts';
import { catalogExampleCode } from './systems/catalog-example.ts';
import { contentFieldText, contentText, getContentTranslationsRevision, localizedContentEntry, receiveContentTranslations, startContentTranslations, subscribeContentTranslations, worldInstruction } from './content-translations.ts';

const styles = registerHooks({ load(url, context, next) { return url.endsWith('.css') ? { format: 'module', source: '', shortCircuit: true } : next(url, context); } });
const { CatalogItem } = await import('./systems/SystemCatalogBrowser.tsx');
styles.deregister();

const field = (source: string, translations: Partial<Record<'ja' | 'en' | 'ko', string>>) => ({ source, translations });
const catalog = (entries: Record<string, { fields: Record<string, ReturnType<typeof field>> }>, revision = 'test', pending = false) => ({ schema: 1, revision, pending, entries });
const reset = () => receiveContentTranslations(catalog({}, 'empty'));

test('stored metadata follows language and exact source while IDs, assets, logic and original definitions stay intact', t => {
  const language = getLanguage(), originalItems = structuredClone(RAW_ITEMS), originalWorlds = structuredClone(RAW_WORLDS), originalProducts = structuredClone(RAW_PRODUCTS);
  t.after(() => { reset(); setLanguage(language); });
  receiveContentTranslations(catalog({
    'item/note': { fields: { name: field(RAW_ITEMS.note.name, { en: 'Saved sticky note', ko: '저장된 메모' }), desc: field('old description', { ko: '낡은 설명' }) } },
    'world/cafe': { fields: { name: field(RAW_WORLDS.cafe.name, { en: 'Saved café', ko: '저장된 카페' }), 'instructions.welcome': field('ようこそ', { ko: '어서 오세요' }) } },
    'product/talk-card': { fields: { name: field(RAW_PRODUCTS.find(product => product.id === 'talk-card')!.name, { ko: '저장된 이야기 카드' }), text: field('runtime text is never replaced', { ko: '교체되면 안 됨' }) } },
  }));
  setLanguage('ko');
  assert.equal(ITEM_INFO.note.name, '저장된 메모');
  assert.notEqual(ITEM_INFO.note.desc, '낡은 설명');
  assert.equal(WORLDS.cafe.name, '저장된 카페');
  assert.equal(worldInstruction('cafe', 'welcome', 'ようこそ'), '어서 오세요');
  assert.equal(worldInstruction('cafe', 'welcome', 'changed original'), 'changed original');
  assert.equal(MARKET_PRODUCTS.find(product => product.id === 'talk-card')!.name, '저장된 이야기 카드');
  assert.equal(WORLDS.cafe.solids, RAW_WORLDS.cafe.solids);
  assert.equal(ITEM_INFO.note.illustration, RAW_ITEMS.note.illustration);
  for (const product of MARKET_PRODUCTS) if (product.category === 'items') {
    const original = RAW_PRODUCTS.find(raw => raw.id === product.id)!;
    assert.equal(original.category, 'items');
    if (original.category === 'items') assert.equal(product.text, original.text);
  }
  setLanguage('en');
  assert.equal(ITEM_INFO.note.name, 'Saved sticky note');
  assert.equal(WORLDS.cafe.name, 'Saved café');
  setLanguage('ja');
  assert.equal(ITEM_INFO.note.name, RAW_ITEMS.note.name);
  assert.deepEqual(RAW_ITEMS, originalItems); assert.deepEqual(RAW_WORLDS, originalWorlds); assert.deepEqual(RAW_PRODUCTS, originalProducts);
});

test('metadata wrappers translate only selected human fields and retain curated fallback on missing or stale translations', t => {
  const language = getLanguage(); t.after(() => { reset(); setLanguage(language); }); setLanguage('ko');
  const original = { id: 'author-item', name: 'Original name', asset: 'Original name', logic: { input: 'Original name' } }, before = structuredClone(original);
  const view = localizedContentEntry('item/author-item', original, ['name'], { ...original, name: '검토된 번역' });
  receiveContentTranslations(catalog({
    'item/author-item': { fields: { name: field(original.name, { ko: '자동 번역' }), asset: field(original.asset, { ko: '바뀌면 안 됨' }) } },
    'item/unrelated': { fields: { name: field(original.name, { ko: '다른 이름' }) } },
  }));
  assert.equal(view.name, '자동 번역'); assert.equal(view.id, original.id); assert.equal(view.asset, original.asset); assert.equal(view.logic, original.logic);
  receiveContentTranslations(catalog({ 'item/author-item': { fields: { name: field('older name', { ko: '오래된 번역' }) } } }, 'changed'));
  assert.equal(view.name, '검토된 번역');
  assert.equal(contentText('missing', 'name', original.name), original.name);
  assert.equal(contentFieldText('missing', 'usage'), '');
  assert.equal(receiveContentTranslations({ schema: 2, entries: {} }), false);
  assert.equal(view.name, '검토된 번역'); assert.deepEqual(original, before);
});

test('system sidecar documentation appears beside literal port/config IDs without changing example code or original JSON', t => {
  const language = getLanguage(); t.after(() => { reset(); setLanguage(language); }); setLanguage('ko');
  const manifest = JSON.parse(readFileSync(new URL('../../shared-systems/timer/1.0.1/system.json', import.meta.url), 'utf8')) as SystemManifest;
  const original = structuredClone(manifest), code = catalogExampleCode(manifest);
  const entry: SystemEntry = { id: manifest.id, version: manifest.version, manifest, integrity: 'a'.repeat(64) };
  receiveContentTranslations(catalog({ [`system/${manifest.id}/${manifest.version}`]: { fields: {
    title: field(manifest.title, { ko: '저장된 타이머' }), description: field(manifest.description, { ko: '저장된 타이머 설명' }),
    usage: field('Use start to begin.', { ko: 'start를 연결해 시작하세요. <script>text only</script>' }),
    'targets.display.label': field('Display', { ko: '표시 대상' }),
    'config.duration.label': field('Duration', { ko: '설정 시간' }),
    'config.duration.description': field('Seconds, including fractions.', { ko: '소수 초도 설정할 수 있습니다.' }),
    'inputs.start.label': field('Start', { ko: '시작 입력' }),
    'outputs.finished.description': field('Runs when time expires.', { ko: '시간이 끝나면 발생합니다.' }),
  } } }));
  const html = renderToStaticMarkup(<CatalogItem entries={[entry]} latest={entry} />);
  for (const text of ['저장된 타이머', '저장된 타이머 설명', '표시 대상', '설정 시간', '소수 초도 설정할 수 있습니다.', '시작 입력', '시간이 끝나면 발생합니다.']) assert.ok(html.includes(text), text);
  for (const id of ['display', 'duration', 'start', 'finished']) assert.ok(html.includes(`<code>${id}</code>`), id);
  assert.ok(html.includes('&lt;script&gt;text only&lt;/script&gt;')); assert.doesNotMatch(html, /<script>/);
  assert.equal(catalogExampleCode(manifest), code); assert.deepEqual(manifest, original);
});

test('saved translation loading notifies subscribers and polls only while registration is pending', { timeout: 3000 }, async t => {
  const language = getLanguage(); t.after(() => { reset(); setLanguage(language); }); setLanguage('ko'); reset();
  const before = getContentTranslationsRevision(); let calls = 0, updates = 0;
  let complete!: () => void;
  const completed = new Promise<void>(resolve => { complete = resolve; });
  const unsubscribe = subscribeContentTranslations(() => { updates++; if (contentText('item/late', 'name', 'New item') === '새 아이템') complete(); });
  t.after(unsubscribe);
  const request: typeof fetch = async (url, init) => {
    assert.equal(url, '/api/content-translations'); assert.equal(init?.cache, 'no-store'); assert.notEqual(init?.method, 'POST');
    calls++;
    return new Response(JSON.stringify(calls === 1 ? catalog({}, 'pending', true) : catalog({ 'item/late': { fields: { name: field('New item', { ko: '새 아이템' }) } } }, 'ready')));
  };
  const stop = startContentTranslations({ request, maxAttempts: 5, pollIntervalMs: 0 }); t.after(stop);
  await completed; await pause(20);
  assert.equal(calls, 2); assert.equal(updates, 2); assert.ok(getContentTranslationsRevision() > before);
  const currentRevision = getContentTranslationsRevision();
  receiveContentTranslations(catalog({ 'item/late': { fields: { name: field('New item', { ko: '새 아이템' }) } } }, 'ready'));
  assert.equal(getContentTranslationsRevision(), currentRevision);
});

test('translation polling is bounded, unsupported endpoints fall back, and cancelled loads cannot overwrite saved metadata', { timeout: 3000 }, async t => {
  t.after(reset); reset();
  for (const [status, pending, maxAttempts, expectedCalls] of [[200, true, 2, 2], [404, false, 5, 1], [503, false, 8, 4]] as const) {
    let calls = 0, reached!: () => void;
    const completed = new Promise<void>(resolve => { reached = resolve; });
    const stop = startContentTranslations({ request: async () => { calls++; if (calls === expectedCalls) reached(); return new Response(JSON.stringify(catalog({}, `attempt-${calls}`, pending)), { status }); }, maxAttempts, pollIntervalMs: 0 });
    await completed; await pause(20); stop(); assert.equal(calls, expectedCalls);
  }
  const before = getContentTranslationsRevision(); let finish!: (response: Response) => void;
  const stop = startContentTranslations({ request: () => new Promise(resolve => { finish = resolve; }) });
  stop(); finish(new Response(JSON.stringify(catalog({ 'item/stale': { fields: { name: field('source', { ko: 'stale' }) } } }, 'cancelled'))));
  await nextTurn(); assert.equal(getContentTranslationsRevision(), before); assert.equal(contentFieldText('item/stale', 'name'), '');
  let older!: (response: Response) => void, newer!: (response: Response) => void;
  const stopOld = startContentTranslations({ request: () => new Promise(resolve => { older = resolve; }) });
  const stopNew = startContentTranslations({ request: () => new Promise(resolve => { newer = resolve; }) });
  t.after(stopOld); t.after(stopNew);
  newer(new Response(JSON.stringify(catalog({ 'item/ordered': { fields: { name: field('latest', {}) } } }, 'newer'))));
  await nextTurn();
  older(new Response(JSON.stringify(catalog({ 'item/ordered': { fields: { name: field('older', {}) } } }, 'older'))));
  await nextTurn(); assert.equal(contentFieldText('item/ordered', 'name'), 'latest');
});
