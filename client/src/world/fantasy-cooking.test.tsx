import test from 'node:test';
import assert from 'node:assert/strict';
import { createElement } from 'react';
import { renderToStaticMarkup } from 'react-dom/server';
import { createRequire } from 'node:module';
import { applyFantasyAction, newFantasyProfile } from '../../../shared/fantasy-engine.ts';
import { reconcileFoodLots } from '../../../shared/fantasy-life.ts';
import { FANTASY_IMPROVISED_RECIPE } from '../../../shared/fantasy-freeform-cooking.ts';
import { fantasyCookingPlan } from '../../../shared/fantasy-cooking.ts';
import { FANTASY_PROPERTY_PLOTS, fantasyPropertyState, newFantasyPropertyLedger } from '../../../shared/fantasy-property.ts';
const require = createRequire(import.meta.url), react = require('react') as typeof import('react'), originalSnapshot = react.useSyncExternalStore, originalState = react.useState;
react.useSyncExternalStore = (subscribe, snapshot) => originalSnapshot(subscribe, snapshot, snapshot);
let overrides: unknown[] = [];
react.useState = ((initial: unknown) => originalState(overrides.length ? overrides.shift() : initial)) as typeof react.useState;
const { FantasyCooking, fantasyCookingSlotIngredients, fantasyCookingWarehouseInventory, fantasyCookingRepeatCount } = require('./FantasyCooking.tsx') as typeof import('./FantasyCooking.tsx');
const { FantasyCrafting } = require('./FantasyCrafting.tsx') as typeof import('./FantasyCrafting.tsx');
const { setLocale } = require('../locale.ts') as typeof import('../locale.ts');
const { useStore } = require('../store.ts') as typeof import('../store.ts');
function player() { const c = applyFantasyAction(newFantasyProfile(), { type: 'create', name: 'Cooking UI', source: 'human', gender: 'female' }, () => .5).profile.character!; c.inventory = { meat: 12, spice: 6, herb: 6, tinderbox: 1, wood: 4, 'folding-grill': 1 }; c.foodLots = []; reconcileFoodLots(c); return c; }
function state(partial: Record<string, unknown> = {}) { return { mode: 'free', slots: ['meat', 'meat', 'herb', '', ''], targets: [0, 1], repeats: '1', source: 'inventory', recipe: '', ...partial }; }
function render(c = player(), partial: Record<string, unknown> = {}, props: Partial<Parameters<typeof FantasyCooking>[0]> = {}) {
  overrides = [state(partial)];
  try { return renderToStaticMarkup(createElement(FantasyCooking, { c, station: 'outdoor', blocked: false, onAction: () => {}, ...props })); }
  finally { overrides = []; }
}
test('five one-unit slots aggregate repeated items for exactly one cook', () => {
  assert.deepEqual(fantasyCookingSlotIngredients(['meat', 'meat', 'herb', 'spice', 'spice']), [{ item: 'meat', count: 2 }, { item: 'herb', count: 1 }, { item: 'spice', count: 2 }]);
  assert.deepEqual(fantasyCookingSlotIngredients(['meat', '', '', '', '']), [{ item: 'meat', count: 1 }]);
});
test('free cooking shows three candidates without a result chooser and labels all five unit positions in KO EN JA', () => {
  const slots = ['meat', 'meat', 'herb', 'spice', 'spice'];
  const plan = fantasyCookingPlan({ type: 'cookMix', station: 'outdoor', recipe: FANTASY_IMPROVISED_RECIPE, ingredients: fantasyCookingSlotIngredients(slots), mains: slots.slice(0, 3), additions: [{ main: 0, item: 'spice' }, { main: 1, item: 'spice' }] });
  assert.equal(plan?.candidates?.length, 3);
  for (const locale of ['ko', 'en', 'ja'] as const) {
    setLocale(locale); const html = render(player(), { slots });
    assert.equal((html.match(/data-cooking-candidate=/g) ?? []).length, 3);
    assert.ok(html.includes('5/5')); assert.ok(html.includes('aria-pressed="true"'));
    assert.ok(html.includes(({ ko: '주재료 1', en: 'Main ingredient 1', ja: '主材料1' })[locale]));
    assert.ok(html.includes(({ ko: '선택한 재료로 요리', en: 'Cook selected ingredients', ja: '選んだ材料で調理' })[locale]));
    assert.equal(html.includes('name="cooking-result"'), false);
    assert.equal(html.includes('fr-btn primary" disabled'), false);
  }
});
test('repeats are bounded by actual stock and fuel while total duration is shown', () => {
  setLocale('en'); const c = player(), html = render(c, { repeats: '999' });
  assert.equal(fantasyCookingRepeatCount('999', 4), 4); assert.equal(fantasyCookingRepeatCount('', 4), 0); assert.equal(fantasyCookingRepeatCount('1.5', 4), 0);
  assert.ok(html.includes('aria-label="Repeat count"')); assert.ok(html.includes('max="4"')); assert.ok(html.includes('value="4"')); assert.ok(html.includes('Total duration'));
  const noFuel = player(); noFuel.inventory.wood = 0;
  assert.ok(render(noFuel).includes('fr-btn primary" disabled'));
});
test('selected slots remain visible when stock disappears and cooking is disabled', () => {
  setLocale('en'); const c = player(); c.inventory.meat = 0; c.foodLots = [];
  const html = render(c);
  assert.ok(html.includes('value="meat" selected=""')); assert.ok(html.includes('Owned 0'));
  assert.ok(html.includes('fr-btn primary" disabled')); assert.ok(html.includes('Available repeats: 0'));
});
test('fixed mode exposes five one-unit slots and kitchen crafting delegates to the same form', () => {
  setLocale('en'); const c = player(); c.job = 'cook';
  const html = render(c, { mode: 'fixed', slots: ['bread', 'bread', '', '', ''] }, { station: 'kitchen' });
  assert.equal((html.match(/aria-label="Material [1-5]"/g) ?? []).length, 5);
  assert.equal(html.includes('aria-label="Main ingredient'), false);
  overrides = [state({ mode: 'fixed', slots: ['', '', '', '', ''] })];
  try { assert.ok(renderToStaticMarkup(createElement(FantasyCrafting, { c, building: 'restaurant', blocked: false, onAction: () => {} })).includes('Kitchen cooking')); }
  finally { overrides = []; }
});

test('a combat character can use kitchen recipes and crafting proficiency from the independent life profession', () => {
  for (const locale of ['ko', 'en', 'ja'] as const) {
    setLocale(locale); const c = player(); c.job = 'warrior'; c.lifeJob = 'baker'; c.jobXp.warrior = 999; c.jobXp.baker = 123; c.inventory.flour = 4;
    const html = render(c, { mode: 'fixed', slots: ['flour', 'flour', 'herb', '', ''] }, { station: 'kitchen' });
    assert.ok(html.includes('123'));
    assert.ok(!html.includes('No fixed recipe matches'));
    assert.ok(!html.includes('fr-btn primary" disabled'));
    overrides = [state({ mode: 'fixed', slots: ['flour', 'flour', 'herb', '', ''] })];
    try {
      const kitchen = renderToStaticMarkup(createElement(FantasyCrafting, { c, building: 'restaurant', blocked: false, onAction: () => {} }));
      assert.ok(kitchen.includes(({ ko: '주방 요리', en: 'Kitchen cooking', ja: '厨房の料理' })[locale]));
      assert.ok(kitchen.includes('123'));
    } finally { overrides = []; }
  }
});
test('warehouse counts combine nonfood inventory and food parcels without invented freshness', () => {
  assert.deepEqual(fantasyCookingWarehouseInventory({ inventory: { spice: 2 }, parcels: [{ item: 'meat', count: 3 }, { item: 'meat', count: 4 }] }), { spice: 2, meat: 7 });
  setLocale('en'); const c = player(); c.job = 'cook'; c.inventory.meat = 0; c.inventory.herb = 0;
  const plot = FANTASY_PROPERTY_PLOTS.find(plot => plot.kind === 'commercial' && plot.location === c.location)!;
  assert.ok(plot); const previous = useStore.getState().fantasyProperties;
  const profile = { ...newFantasyProfile(), character: c }, ledger = newFantasyPropertyLedger();
  ledger.plots[plot.id] = { revision: 0, owner: { user: 'cooking-ui', generation: profile.generation ?? 1, name: c.name, acquiredAt: c.hour }, listing: null,
    business: { inventory: {}, treasury: 0, lastAt: c.hour, parcels: [{ id: 'meat', goods: { item: 'meat', count: 8 } }, { id: 'herb', goods: { item: 'herb', count: 4 } }] } };
  useStore.setState({ fantasyProperties: fantasyPropertyState(ledger, { 'cooking-ui': profile }, 'cooking-ui') });
  try {
    const html = render(c, { source: 'storage' }, { station: 'kitchen', workshop: plot.id });
    assert.ok(html.includes('Local business warehouse')); assert.ok(html.includes('Owned 8')); assert.ok(html.includes('Available repeats: 4'));
    assert.ok(html.includes('Actual ingredient condition is checked when cooking.')); assert.equal(html.includes('Cooking success chance with current ingredients'), false);
    assert.equal(html.includes('fr-btn primary" disabled'), false);
    useStore.setState({ fantasyProperties: { revision: 0, location: c.location, plots: [], owned: [], legacies: [] } });
    assert.ok(render(c, { source: 'storage' }, { station: 'kitchen', workshop: plot.id }).includes('fr-btn primary" disabled'));
  } finally { useStore.setState({ fantasyProperties: previous }); }
});
test('outdoor and remote kitchens cannot select a business warehouse', () => {
  setLocale('en'); assert.equal(render().includes('aria-label="Ingredient source"'), false);
  const c = player(); assert.equal(render(c, {}, { station: 'kitchen', workshop: 'remote-commercial' }).includes('aria-label="Ingredient source"'), false);
});
test('harmful free mixtures remain cookable with warnings and busy or missing-tool states still disable cooking', () => {
  const c = player(); c.inventory.ore = 4;
  for (const locale of ['ko', 'en', 'ja'] as const) {
    setLocale(locale); const html = render(c, { slots: ['ore', 'ore', 'meat', '', ''] });
    assert.ok(html.includes(({ ko: '몸에 해로울 수 있습니다', en: 'harmful to eat', ja: '体に害を及ぼす' })[locale]));
    assert.equal(html.includes('fr-btn primary" disabled'), false);
  }
  setLocale('en'); assert.ok(render(player(), {}, { blocked: true }).includes('<fieldset disabled=""'));
  const noTool = player(); noTool.inventory['folding-grill'] = 0;
  assert.ok(render(noTool).includes('fr-btn primary" disabled'));
});
