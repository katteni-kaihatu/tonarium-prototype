import test from 'node:test';
import assert from 'node:assert/strict';
import { createElement } from 'react';
import { renderToStaticMarkup } from 'react-dom/server';
import { createRequire } from 'node:module';
import { applyFantasyAction, newFantasyProfile } from '../../../shared/fantasy-engine.ts';
import { fantasyCompileAlchemy } from '../../../shared/fantasy-alchemy-synthesis.ts';
import { learnFantasyAlchemyBook, learnFantasyAlchemyRecipe, learnFantasyAlchemyFormula } from '../../../shared/fantasy-alchemy-discovery.ts';
import { FANTASY_ALCHEMY_FORMULAS } from '../../../shared/fantasy-specializations.ts';
import { FANTASY_ITEMS } from '../../../shared/fantasy-data.ts';
import type { FantasyCharacter } from '../../../shared/fantasy.ts';
const require = createRequire(import.meta.url), react = require('react') as typeof import('react');
const originalSnapshot = react.useSyncExternalStore, originalState = react.useState;
react.useSyncExternalStore = (subscribe, snapshot) => originalSnapshot(subscribe, snapshot, snapshot);
let overrides: unknown[] = [];
react.useState = ((initial: unknown) => originalState(overrides.length ? overrides.shift() : initial)) as typeof react.useState;
const { FantasyAlchemySynthesis } = require('./FantasyAlchemySynthesis.tsx') as typeof import('./FantasyAlchemySynthesis.tsx');
const { FantasyAlchemyPanel } = require('./FantasySpecialtyPanels.tsx') as typeof import('./FantasySpecialtyPanels.tsx');
const { setLocale } = require('../locale.ts') as typeof import('../locale.ts');
const { set } = require('../store.ts') as typeof import('../store.ts');
function player() {
  const c = applyFantasyAction(newFantasyProfile(), { type: 'create', source: 'human', name: 'Alchemy UI', gender: 'female' }, () => .5).profile.character!;
  c.job = 'warrior'; c.lifeJob = 'alchemist'; c.jobXp.alchemist = 100; c.location = 'mooncity'; c.hour = 8; c.inventory = { redleaf: 2, 'lizard-hide': 2, 'elder-dragon-scale': 2, 'fire-bomb': 1 }; return c;
}
function render(c: FantasyCharacter, locale: 'ko' | 'en' | 'ja', carrier = 'flask', ingredients = ['redleaf', 'lizard-hide']) {
  setLocale(locale); set({ wsConnected: true }); overrides = [carrier, ingredients];
  try { return renderToStaticMarkup(createElement(FantasyAlchemySynthesis, { c, blocked: false, onAction: () => {} })); } finally { overrides = []; }
}
test('unknown synthesis hides result names, effects and predicted combat values in KO/EN/JA even if an NPC potion is owned', () => {
  for (const locale of ['ko', 'en', 'ja'] as const) {
    const c = player(), compiled = fantasyCompileAlchemy(c, 'flask', ['redleaf', 'lizard-hide'])!, html = render(c, locale);
    assert.ok(!html.includes(compiled.names[locale]));
    assert.ok(!html.includes(({ ko: '열기를 퍼뜨려', en: 'Release heat', ja: '熱を放ち' })[locale]));
    assert.ok(html.includes(({ ko: '미확인 배합', en: 'Unidentified mixture', ja: '未確認の配合' })[locale]));
    assert.ok(!html.includes('fr-btn primary" disabled'));
  }
});
test('only exact completed-book or successful recipe knowledge reveals the synthesis preview', () => {
  for (const locale of ['ko', 'en', 'ja'] as const) {
    const c = player(); c.readBooks = ['remedies-and-rites']; learnFantasyAlchemyBook(c, 'remedies-and-rites');
    assert.ok(render(c, locale).includes(fantasyCompileAlchemy(c, 'flask', ['redleaf', 'lizard-hide'])!.names[locale]));
    assert.ok(render(c, locale, 'mist').includes(({ ko: '미확인 배합', en: 'Unidentified mixture', ja: '未確認の配合' })[locale]));
    learnFantasyAlchemyRecipe(c, 'flask', ['redleaf', 'elder-dragon-scale']);
    const ingredients = ['elder-dragon-scale', 'redleaf'];
    assert.ok(render(c, locale, 'flask', ingredients).includes(fantasyCompileAlchemy(c, 'flask', ingredients)!.names[locale]));
  }
});
test('collapsed legacy formula cards hide names and output until a success or exact book knowledge in every locale', () => {
  for (const locale of ['ko', 'en', 'ja'] as const) {
    const c = player(); setLocale(locale); set({ wsConnected: true }); overrides = [];
    const renderPanel = () => renderToStaticMarkup(createElement(FantasyAlchemyPanel, { c, blocked: false, onAction: () => {} }));
    const unknown = renderPanel();
    for (const formula of FANTASY_ALCHEMY_FORMULAS) {
      assert.ok(!unknown.includes(formula.names[locale])); assert.ok(!unknown.includes(FANTASY_ITEMS.find(item => item.id === formula.output)!.names![locale]));
    }
    assert.ok(unknown.includes(({ ko: '미확인 조합 1', en: 'Unidentified mixture 1', ja: '未確認の配合 1' })[locale]));
    learnFantasyAlchemyFormula(c, 'mana'); const afterSuccess = renderPanel(); assert.ok(afterSuccess.includes(FANTASY_ALCHEMY_FORMULAS.find(formula => formula.id === 'mana')!.names[locale]));
    c.readBooks = ['remedies-and-rites']; learnFantasyAlchemyBook(c, 'remedies-and-rites'); const afterBook = renderPanel();
    for (const id of ['healing', 'antidote']) assert.ok(afterBook.includes(FANTASY_ALCHEMY_FORMULAS.find(formula => formula.id === id)!.names[locale]));
    assert.ok(!afterBook.includes(FANTASY_ALCHEMY_FORMULAS.find(formula => formula.id === 'fatigue')!.names[locale]));
  }
});
