import assert from 'node:assert/strict';
import test from 'node:test';
import { renderToStaticMarkup } from 'react-dom/server';
import { systemItemDefinitions } from '../../../shared/system-items.ts';
import { getLanguage, setLanguage, t as translate } from '../i18n/core.ts';
import { LANGUAGES } from '../i18n/locale.ts';
import { CatalogPagination } from './CatalogPagination.tsx';
import { SystemItemCatalog } from './SystemItemCatalog.tsx';
import { CATALOG_PAGE_SIZE, catalogPage, uniqueSystemIds } from './pagination.ts';

test('catalog pages contain at most ten entries and preserve source order without mutation', () => {
  const entries = Array.from({ length: 23 }, (_, index) => ({ id: `item-${index + 1}` }));
  const original = structuredClone(entries), pages = [1, 2, 3].map(page => catalogPage(entries, page));
  assert.equal(CATALOG_PAGE_SIZE, 10);
  assert.deepEqual(pages.map(page => [page.page, page.pageCount, page.total, page.entries.length]), [[1, 3, 23, 10], [2, 3, 23, 10], [3, 3, 23, 3]]);
  assert.deepEqual(pages.flatMap(page => page.entries), entries);
  assert.equal(catalogPage(entries.slice(0, 10), 1).pageCount, 1);
  assert.equal(catalogPage(entries.slice(0, 11), 2).entries.length, 1);
  assert.deepEqual(entries, original);
});

test('stale page selections clamp when a refresh or filter reduces the available entries', () => {
  const entries = Array.from({ length: 41 }, (_, index) => index);
  assert.equal(catalogPage(entries, 5).page, 5);
  const filtered = catalogPage(entries.filter(value => value < 12), 5);
  assert.equal(filtered.page, 2); assert.equal(filtered.pageCount, 2);
  assert.deepEqual(filtered.entries, [10, 11]);
  const oneMatch = catalogPage(entries.filter(value => value === 37), filtered.page);
  assert.equal(oneMatch.page, 1); assert.deepEqual(oneMatch.entries, [37]);
  const empty = catalogPage(entries.filter(() => false), 5);
  assert.deepEqual(empty, { page: 1, pageCount: 1, total: 0, entries: [] });
  for (const page of [-3, 0, Number.NaN, Number.POSITIVE_INFINITY]) assert.equal(catalogPage(entries, page).page, 1);
  assert.equal(catalogPage(entries, 200).page, 5);
  assert.equal(catalogPage(entries, 2.9).page, 2);
});

test('system pagination counts unique IDs rather than each published version', () => {
  const releases = Array.from({ length: 24 }, (_, index) => `system-${String(index + 1).padStart(2, '0')}`)
    .flatMap(id => ['1.0.0', '1.0.1', '2.0.0'].map(version => ({ id, version }))).reverse();
  const original = structuredClone(releases), ids = uniqueSystemIds(releases);
  assert.equal(releases.length, 72); assert.equal(ids.length, 24);
  const first = catalogPage(ids, 1), final = catalogPage(ids, 3);
  assert.equal(first.pageCount, 3); assert.equal(first.entries.length, 10);
  assert.deepEqual(first.entries, Array.from({ length: 10 }, (_, index) => `system-${String(index + 1).padStart(2, '0')}`));
  assert.deepEqual(final.entries, ['system-21', 'system-22', 'system-23', 'system-24']);
  assert.deepEqual(releases, original);
});

test('pagination controls localize their labels and disable only unavailable directions', context => {
  const previous = getLanguage(); context.after(() => setLanguage(previous));
  const labels = { ja: ['前へ', '次へ', '2 / 3 ページ'], en: ['Previous', 'Next', 'Page 2 of 3'], ko: ['이전', '다음', '2 / 3 페이지'] };
  for (const language of LANGUAGES) {
    setLanguage(language);
    for (const page of [1, 2, 3]) {
      const html = renderToStaticMarkup(<CatalogPagination page={page} pageCount={3} onChange={() => {}} label={translate('ssCatalogItemsPages')} />);
      const buttons = [...html.matchAll(/<button\b([^>]*)>([^<]*)<\/button>/g)];
      assert.equal(buttons.length, 2);
      assert.equal(buttons[0][2], labels[language][0]); assert.equal(buttons[1][2], labels[language][1]);
      assert.equal(/\bdisabled=/.test(buttons[0][1]), page === 1);
      assert.equal(/\bdisabled=/.test(buttons[1][1]), page === 3);
      assert.ok(html.includes('aria-live="polite"'));
      if (page === 2) assert.ok(html.includes(labels[language][2]));
      assert.doesNotMatch(html, /\bssCatalog\w+/);
    }
    const single = renderToStaticMarkup(<CatalogPagination page={1} pageCount={1} onChange={() => {}} label={translate('ssCatalogItemsPages')} />);
    assert.equal([...single.matchAll(/\bdisabled=/g)].length, 2);
  }
});

test('the basic item list renders only the first ten rows instead of hiding later pages', () => {
  const entries = systemItemDefinitions(); assert.ok(entries.length > 10);
  const html = renderToStaticMarkup(<SystemItemCatalog />), body = /<tbody>([\s\S]*?)<\/tbody>/.exec(html)?.[1];
  assert.ok(body);
  const rows = [...body.matchAll(/<tr>([\s\S]*?)<\/tr>/g)].map(match => match[1]);
  assert.equal(rows.length, 10);
  for (const entry of entries.slice(0, 10)) assert.ok(rows.some(row => row.includes(`<code>${entry.id}</code>`)), entry.id);
  for (const entry of entries.slice(10)) assert.equal(rows.some(row => row.includes(`<code>${entry.id}</code>`)), false, entry.id);
});
