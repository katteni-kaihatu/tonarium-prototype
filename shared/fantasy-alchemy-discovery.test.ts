import test from 'node:test';
import assert from 'node:assert/strict';
import { fantasyAlchemyRecipeKey, fantasyAlchemyResultKnown, learnFantasyAlchemyBook, learnFantasyAlchemyRecipe, fantasyAlchemyFormulaKnown, learnFantasyAlchemyFormula, validAlchemyKnowledge, type FantasyAlchemyKnowledge } from './fantasy-alchemy-discovery.ts';
import { FANTASY_ALCHEMY_FORMULA_IDS } from './fantasy-alchemy-catalog.ts';
import { FANTASY_ALCHEMY_FORMULAS } from './fantasy-specializations.ts';
test('recipe knowledge canonicalizes unordered reagents but keeps carrier and extra reagents distinct', () => {
  const c: { alchemyKnowledge?: FantasyAlchemyKnowledge } = {};
  assert.deepEqual(learnFantasyAlchemyRecipe(c, 'flask', ['redleaf', 'elder-dragon-scale']), ['flask:elder-dragon-scale+redleaf']);
  assert.ok(fantasyAlchemyResultKnown(c, 'flask', ['elder-dragon-scale', 'redleaf']));
  assert.equal(fantasyAlchemyResultKnown(c, 'mist', ['redleaf', 'elder-dragon-scale']), false);
  assert.equal(fantasyAlchemyResultKnown(c, 'flask', ['redleaf', 'elder-dragon-scale', 'herb']), false);
  assert.deepEqual(learnFantasyAlchemyRecipe(c, 'flask', ['elder-dragon-scale', 'redleaf']), []);
  assert.equal(fantasyAlchemyRecipeKey('flask', ['redleaf', 'redleaf']), undefined);
  assert.ok(validAlchemyKnowledge(c));
});
test('only an actual completed book grants its exact recipes and older read receipts reveal the same results', () => {
  const c: { readBooks: string[]; alchemyKnowledge?: FantasyAlchemyKnowledge } = { readBooks: [] };
  assert.deepEqual(learnFantasyAlchemyBook(c, 'remedies-and-rites'), []);
  c.readBooks.push('remedies-and-rites');
  assert.ok(fantasyAlchemyResultKnown(c, 'flask', ['redleaf', 'lizard-hide']));
  assert.equal(fantasyAlchemyResultKnown(c, 'oil', ['redleaf', 'lizard-hide']), false);
  assert.equal(learnFantasyAlchemyBook(c, 'remedies-and-rites').length, 4);
  assert.deepEqual(learnFantasyAlchemyBook(c, 'remedies-and-rites'), []);
  assert.deepEqual(learnFantasyAlchemyBook(c, '__proto__'), []);
});
test('legacy recipe-only knowledge remains valid and only exact book formulas or successes identify old mixtures', () => {
  const c: { readBooks: string[]; alchemyKnowledge?: FantasyAlchemyKnowledge } = { readBooks: [], alchemyKnowledge: { recipes: [] } };
  assert.ok(validAlchemyKnowledge(c)); assert.equal(fantasyAlchemyFormulaKnown(c, 'healing'), false);
  assert.deepEqual(FANTASY_ALCHEMY_FORMULA_IDS, FANTASY_ALCHEMY_FORMULAS.map(formula => formula.id));
  assert.deepEqual(learnFantasyAlchemyFormula(c, 'mana'), ['mana']); assert.ok(fantasyAlchemyFormulaKnown(c, 'mana'));
  assert.deepEqual(learnFantasyAlchemyFormula(c, 'mana'), []); assert.deepEqual(learnFantasyAlchemyFormula(c, '__proto__'), []);
  c.readBooks.push('remedies-and-rites'); assert.ok(fantasyAlchemyFormulaKnown(c, 'healing')); assert.ok(fantasyAlchemyFormulaKnown(c, 'antidote')); assert.equal(fantasyAlchemyFormulaKnown(c, 'fatigue'), false);
  learnFantasyAlchemyBook(c, 'remedies-and-rites'); assert.deepEqual(c.alchemyKnowledge!.formulas, ['mana', 'healing', 'antidote']);
  for (const formulas of [['healing', 'healing'], ['unknown'], ['__proto__']]) assert.equal(validAlchemyKnowledge({ alchemyKnowledge: { recipes: [], formulas } }), false);
});
test('persisted knowledge rejects noncanonical keys, duplicate receipts and client supplied effects', () => {
  for (const knowledge of [{ recipes: ['flask:redleaf+lizard-hide'] }, { recipes: ['flask:lizard-hide+redleaf', 'flask:lizard-hide+redleaf'] }, { recipes: ['flask:unknown+redleaf'] }, { recipes: ['flask:redleaf+moonmint'] }, { recipes: [], power: 999 }, { recipes: ['void:lizard-hide+redleaf'] }]) {
    const c = { alchemyKnowledge: knowledge }; const before = JSON.stringify(c);
    assert.equal(validAlchemyKnowledge(c), false); assert.equal(JSON.stringify(c), before);
  }
});
