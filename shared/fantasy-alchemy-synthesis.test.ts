import test from 'node:test';
import assert from 'node:assert/strict';
import { FANTASY_ITEMS } from './fantasy-data.ts';
import { applyFantasyAction, newFantasyProfile } from './fantasy-engine.ts';
import { FANTASY_ALCHEMY_INGREDIENTS, FANTASY_ALCHEMY_SYNTHESIS_ITEMS } from './fantasy-alchemy-catalog.ts';
import { applyFantasyAlchemySynthesis, fantasyAlchemyComposeValid, fantasyAlchemyIngredientCapacity, fantasyAlchemySynthesisHours, fantasyAlchemySynthesisText, fantasyCompileAlchemy } from './fantasy-alchemy-synthesis.ts';
import { fantasyAlchemyFormulaKnown } from './fantasy-alchemy-discovery.ts';
import { FANTASY_ALCHEMY_FORMULAS, fantasySpecializationText } from './fantasy-specializations.ts';
function player() {
  const p = applyFantasyAction(newFantasyProfile(), { type: 'create', source: 'human', name: 'Synthesis', gender: 'female' }, () => .5).profile, c = p.character!;
  c.job = 'alchemist'; c.jobXp.alchemist = 0; c.location = 'mooncity'; c.visited.push('mooncity'); c.hour = 8;
  c.inventory = Object.fromEntries(['herb', 'redleaf', 'moonmint', 'sunroot', 'silverweed', 'embermoss', 'frostbloom', 'wolf-hide', 'bear-hide', 'lizard-hide', 'elder-dragon-scale', 'ancient-frostheart', 'ancient-storm-sinew', 'void-chimera-prism'].map(id => [id, 4]));
  c.inventory['arcane-bag-3'] = 1; c.magicBags = ['arcane-bag-3']; return p;
}
const action = { type: 'alchemyCompose', carrier: 'flask', ingredients: ['redleaf', 'lizard-hide'] } as const;
test('herbs and actual monster parts deterministically form distinct useful combat potions', () => {
  const c = player().character!, pairs = [ ['redleaf', 'lizard-hide'], ['silverweed', 'lizard-hide'], ['frostbloom', 'wolf-hide'], ['embermoss', 'wolf-hide'], ['herb', 'wolf-hide'], ['sunroot', 'lizard-hide'], ['herb', 'bear-hide'], ['moonmint', 'wolf-hide'], ['sunroot', 'wolf-hide'], ['redleaf', 'bear-hide'] ];
  const outputs = pairs.map(ids => fantasyCompileAlchemy(c, 'flask', ids)!);
  assert.equal(new Set(outputs.map(recipe => recipe.family)).size, 10);
  assert.equal(outputs[0].item, 'fire-bomb'); assert.equal(outputs[0].combatUse.kind, 'attack');
  assert.equal(outputs[1].combatUse.utility, 'vulnerable'); assert.equal(outputs[4].combatUse.utility, 'root');
  assert.deepEqual(outputs[0], fantasyCompileAlchemy(c, 'flask', [...pairs[0]].reverse()));
  assert.ok(FANTASY_ALCHEMY_INGREDIENTS.every(ingredient => FANTASY_ITEMS.some(item => item.id === ingredient.id)));
});
test('carrier geometry and finite grades are real, bounded and give diminishing potency gains', () => {
  const c = player().character!; c.jobXp.alchemist = 100;
  const flask = fantasyCompileAlchemy(c, 'flask', [...action.ingredients])!, mist = fantasyCompileAlchemy(c, 'mist', [...action.ingredients])!, oil = fantasyCompileAlchemy(c, 'oil', [...action.ingredients])!;
  assert.ok(mist.combatUse.radius! > flask.combatUse.radius!); assert.ok(mist.combatUse.power < flask.combatUse.power); assert.ok(oil.combatUse.reach! < flask.combatUse.reach!);
  const powers = FANTASY_ALCHEMY_SYNTHESIS_ITEMS.filter(item => /^fire-bomb(-[23])?$/.test(item.id)).map(item => item.combatUse!.power);
  assert.equal(powers.length, 3); assert.ok(powers[1] - powers[0] > powers[2] - powers[1]);
  for (const item of FANTASY_ALCHEMY_SYNTHESIS_ITEMS) { assert.ok(item.combatUse!.power > 0 && item.combatUse!.power <= 40); for (const locale of ['ko', 'en', 'ja'] as const) { assert.ok(item.names?.[locale]); assert.ok(item.descriptions?.[locale]); } }
});
test('capacity uses alchemist proficiency and schemas reject forged calculations or duplicate ingredients', () => {
  const c = player().character!;
  for (const [xp, cap] of [[0, 2], [29, 2], [30, 3], [99, 3], [100, 4]]) { c.jobXp.alchemist = xp; assert.equal(fantasyAlchemyIngredientCapacity(c), cap); }
  c.jobXp.alchemist = 0; assert.equal(fantasyCompileAlchemy(c, 'flask', ['redleaf', 'lizard-hide', 'moonmint']), undefined);
  assert.equal(fantasyCompileAlchemy(c, 'flask', ['redleaf', 'moonmint']), undefined);
  assert.ok(fantasyAlchemyComposeValid(action));
  for (const forged of [{ ...action, power: 999 }, { ...action, ingredients: ['redleaf', 'redleaf'] }, { ...action, carrier: 'void' }, { ...action, ingredients: ['unknown', 'wolf-hide'] }]) assert.equal(fantasyAlchemyComposeValid(forged), false);
});
test('actual synthesis atomically consumes one of each ingredient, makes one registered item and spends no MP', () => {
  const p = player(), before = JSON.stringify(p), result = applyFantasyAlchemySynthesis(p, { ...action, ingredients: [...action.ingredients] }, () => .5)!;
  assert.equal(result.error, undefined); assert.equal(JSON.stringify(p), before); assert.equal(result.profile.character!.inventory.redleaf, 3); assert.equal(result.profile.character!.inventory['lizard-hide'], 3);
  assert.equal(result.profile.character!.inventory['fire-bomb'], 1); assert.equal(result.profile.character!.mp, p.character!.mp); assert.equal(result.profile.character!.hour, p.character!.hour + 2);
  assert.equal(fantasyAlchemySynthesisHours(p, { ...action, ingredients: [...action.ingredients] }), 2);
  for (const locale of ['ko', 'en', 'ja'] as const) assert.ok(fantasyAlchemySynthesisText(result.profile.log.at(-1)!.text, locale));
});
test('wrong job, absent stock, missing workshop and closed workshop fail without mutation', () => {
  for (const change of [(p: ReturnType<typeof player>) => { p.character!.job = 'mage'; }, (p: ReturnType<typeof player>) => { p.character!.inventory.redleaf = 0; }, (p: ReturnType<typeof player>) => { p.character!.location = 'hearth'; }, (p: ReturnType<typeof player>) => { p.character!.hour = 20; }]) {
    const p = player(); change(p); const before = JSON.stringify(p), result = applyFantasyAlchemySynthesis(p, { ...action, ingredients: [...action.ingredients] })!;
    assert.ok(result.error); assert.equal(result.changed, false); assert.equal(JSON.stringify(p), before);
  }
});
test('reserved completion respects the original opening hour and delegates time advancement', () => {
  const p = player(); p.character!.hour = 19;
  const result = applyFantasyAlchemySynthesis(p, { ...action, ingredients: [...action.ingredients] }, () => .5, { advanceTime: false, startedAt: 17 })!;
  assert.equal(result.error, undefined); assert.equal(result.profile.character!.hour, 19);
});

test('unregistered unstable mixtures consume ingredients and time without a result or knowledge',()=>{
 const p=player(), before=JSON.stringify(p), result=applyFantasyAlchemySynthesis(p,{type:'alchemyCompose',carrier:'flask',ingredients:['moonmint','lizard-hide']},()=>0)!;
 assert.equal(JSON.stringify(p),before);assert.equal(result.changed,true);assert.equal(result.profile.character!.inventory.moonmint,3);assert.equal(result.profile.character!.inventory['lizard-hide'],3);assert.equal(result.profile.character!.hour,10);assert.equal(result.profile.log.at(-1)!.kind,'failure');assert.equal(result.profile.character!.alchemyKnowledge,undefined);
 for(const locale of ['ko','en','ja'] as const) assert.ok(fantasyAlchemySynthesisText(result.profile.log.at(-1)!.text,locale));
});
test('experimental mixtures fail a real roll, learn only on success, and retain exact carrier knowledge',()=>{
 const p=player(), mix={type:'alchemyCompose' as const,carrier:'flask' as const,ingredients:['redleaf','elder-dragon-scale']};
 const failed=applyFantasyAlchemySynthesis(p,mix,()=>.99)!;assert.equal(failed.profile.log.at(-1)!.kind,'failure');assert.equal(failed.profile.character!.alchemyKnowledge,undefined);
 const success=applyFantasyAlchemySynthesis(p,mix,()=>0)!;assert.equal(success.profile.log.at(-1)!.kind,'success');assert.equal(success.profile.character!.alchemyKnowledge!.recipes.length,1);
 const replay=applyFantasyAlchemySynthesis(success.profile,{...mix,ingredients:[...mix.ingredients].reverse()},()=>.99)!;assert.equal(replay.profile.log.at(-1)!.kind,'success');assert.equal(replay.profile.character!.alchemyKnowledge!.recipes.length,1);
 const other=applyFantasyAlchemySynthesis(p,{...mix,carrier:'mist'},()=>.99)!;assert.equal(other.profile.log.at(-1)!.kind,'failure');
});

test('alchemy fields use stable result family identifiers and carrier geometry',()=>{
 const c=player().character!;assert.equal(fantasyCompileAlchemy(c,'flask',['redleaf','lizard-hide'])?.combatUse.field,'fire');assert.equal(fantasyCompileAlchemy(c,'oil',['silverweed','lizard-hide'])?.combatUse.field,'poison');assert.equal(fantasyCompileAlchemy(c,'mist',['frostbloom','wolf-hide'])?.combatUse.field,'frost');assert.equal(fantasyCompileAlchemy(c,'mist',['embermoss','wolf-hide'])?.combatUse.field,'storm');
});
test('old formula success discovers once while failure consumes only its first ingredient and hides the result name', () => {
  const p = player(), formula = FANTASY_ALCHEMY_FORMULAS.find(formula => formula.id === 'healing')!;
  const success = applyFantasyAction(p, { type: 'alchemy', formula: formula.id }, () => .999);
  assert.equal(success.error, undefined); assert.ok(fantasyAlchemyFormulaKnown(success.profile.character!, formula.id));
  assert.deepEqual(success.profile.character!.alchemyKnowledge?.formulas, ['healing']);
  const again = applyFantasyAction(success.profile, { type: 'alchemy', formula: formula.id }, () => .999); assert.equal(again.error, undefined); assert.deepEqual(again.profile.character!.alchemyKnowledge?.formulas, ['healing']);
  const failureInput = structuredClone(p); failureInput.character!.hunger = 100; failureInput.character!.fatigue = 100;
  const failed = applyFantasyAction(failureInput, { type: 'alchemy', formula: formula.id }, () => 0);
  assert.equal(failed.error, undefined); assert.equal(fantasyAlchemyFormulaKnown(failed.profile.character!, formula.id), false); assert.equal(failed.profile.character!.alchemyKnowledge, undefined);
  assert.equal(failed.profile.character!.inventory.herb, p.character!.inventory.herb - 1); assert.equal(failed.profile.character!.inventory.redleaf, p.character!.inventory.redleaf); assert.equal(failed.profile.character!.hour, p.character!.hour + 3);
  assert.ok(!failed.profile.log.some(log => log.text.includes(formula.names.ja)));
  const failure = failed.profile.log.find(log => log.text.startsWith('未確認の配合 1は安定せず'))!; assert.ok(failure);
  for (const locale of ['ko', 'en', 'ja'] as const) { const text = fantasySpecializationText(failure.text, locale)!; assert.ok(text); assert.ok(!text.includes(formula.names[locale])); }
});
