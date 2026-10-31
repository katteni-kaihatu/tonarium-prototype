import test from 'node:test';
import assert from 'node:assert/strict';
import { createElement } from 'react';
import { renderToStaticMarkup } from 'react-dom/server';
import { createRequire } from 'node:module';
import { FANTASY_RECIPES } from '../../../shared/fantasy-data.ts';
import { FANTASY_ARTISANS } from '../../../shared/fantasy-artisan-catalog.ts';
import { fantasyCommissionRecipeAllowed, quoteFantasyCommission } from '../../../shared/fantasy-commissions.ts';
import { applyFantasyAction, newFantasyProfile } from '../../../shared/fantasy-engine.ts';
const require = createRequire(import.meta.url), react = require('react') as typeof import('react');
const originalSnapshot = react.useSyncExternalStore;
react.useSyncExternalStore = (subscribe, snapshot) => originalSnapshot(subscribe, snapshot, snapshot);
const { FantasyCommissions } = require('./FantasyCommissions.tsx') as typeof import('./FantasyCommissions.tsx');
const { setLocale } = require('../locale.ts') as typeof import('../locale.ts');
const { fantasyErrorText, fantasyLogText } = require('./fantasy-copy.ts') as typeof import('./fantasy-copy.ts');
function fixture() {
  const artisan = FANTASY_ARTISANS.find(artisan => artisan.job === 'tailor')!;
  const recipe = FANTASY_RECIPES.find(recipe => recipe.job === artisan.job && fantasyCommissionRecipeAllowed(recipe))!;
  const c = applyFantasyAction(newFantasyProfile(), { type: 'create', name: 'Commission guest', source: 'human', gender: 'female' }, () => .5).profile.character!;
  c.job = 'warrior'; c.lifeJob = 'farmer'; c.location = artisan.location; c.hour = 12; c.gold = 10000; c.inventory = { ...recipe.inputs };
  return { c, artisan, recipe };
}
test('artisan commission UI works outside the player profession and shows the authoritative fee, time and ingredient counts in each locale', () => {
  for (const locale of ['ko', 'en', 'ja'] as const) {
    setLocale(locale);
    const { c, artisan, recipe } = fixture(), quote = quoteFantasyCommission(c, { npcId: artisan.id, recipe: recipe.id });
    assert.equal(quote.error, undefined);
    const html = renderToStaticMarkup(createElement(FantasyCommissions, { c, building: artisan.building, blocked: false, onAction: () => {} }));
    assert.ok(html.includes(artisan.names[locale]));
    assert.ok(html.includes(`${quote.fee} G`));
    assert.ok(html.includes(`${quote.hours} h`));
    assert.ok(html.includes(({ ko: '선택 소재', en: 'Material substitution', ja: '素材の置き換え' })[locale]));
    assert.ok(html.includes(({ ko: '선택 보석', en: 'Optional gem', ja: '追加する宝石' })[locale]));
    assert.ok(!html.includes('fr-btn" disabled'));
    for (const [id, count] of Object.entries(quote.inputs)) assert.ok(html.includes(`${c.inventory[id]} / ${count}`));
    assert.ok(!html.includes('map-interior'));
  }
});
test('missing ingredients disable commissions with localized explanations and different buildings show no unrelated contacts', () => {
  for (const locale of ['ko', 'en', 'ja'] as const) {
    setLocale(locale); const { c, artisan } = fixture(); c.inventory = {};
    const html = renderToStaticMarkup(createElement(FantasyCommissions, { c, building: artisan.building, blocked: false, onAction: () => {} }));
    assert.ok(html.includes('disabled=""'));
    assert.ok(html.includes(({ ko: '재료가 부족합니다.', en: 'You do not have enough materials.', ja: '材料が足りません。' })[locale]));
    const empty = renderToStaticMarkup(createElement(FantasyCommissions, { c, building: 'shipyard', blocked: false, onAction: () => {} }));
    assert.equal(empty, '');
  }
});
test('commission receipts and errors flow through the player journal in the selected language', () => {
  const { c, artisan, recipe } = fixture();
  for (const locale of ['ko', 'en', 'ja'] as const) {
    const receipt = fantasyLogText(`commission:${artisan.id}:${recipe.id}:${recipe.output}:1:12`, locale, c);
    assert.ok(receipt.includes(artisan.names[locale])); assert.ok(receipt.includes('12'));
    assert.ok(!receipt.includes('commission:')); assert.ok(!receipt.includes(artisan.id));
    const error = fantasyErrorText('加工設備は営業時間外です。', locale);
    assert.ok(error);
    if (locale !== 'ja') assert.doesNotMatch(error, /[ぁ-んァ-ヶ]/);
    assert.ok(fantasyErrorText('生活職業を選んでください。', locale));
  }
});
