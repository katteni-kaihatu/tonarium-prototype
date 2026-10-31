import test from 'node:test';
import assert from 'node:assert/strict';
import { applyFantasyAction, newFantasyProfile } from './fantasy-engine.ts';
import { FANTASY_ARTISANS } from './fantasy-artisan-catalog.ts';
import { FANTASY_ITEMS, FANTASY_RECIPES } from './fantasy-data.ts';
import { FANTASY_BUSINESS_JOBS, FANTASY_BUSINESS_WORKERS } from './fantasy-worker-catalog.ts';
import { applyFantasyCommission, quoteFantasyCommission, fantasyCommissionRecipeAllowed, fantasyCommissionText } from './fantasy-commissions.ts';
import { validFantasyGear } from './fantasy-equipment.ts';
import type { FantasyEmployee } from './fantasy-business.ts';

function person(job = 'warrior') {
  const p = applyFantasyAction(newFantasyProfile(), { type: 'create', source: 'human', name: 'Rael', gender: 'female' }, () => .99).profile;
  Object.assign(p.character!, { job, gold: 1000, location: 'hearth', hour: 12, inventory: { fish: 4, herb: 4 }, foodLots: [], jobXp: { [job]: 600 } });
  return p;
}
const order = { recipe: 'cook-meal', npcId: 'artisan-hearth-nella' };
function context() {
  const worker = FANTASY_BUSINESS_WORKERS[1];
  const employee: FantasyEmployee = { npc: worker.id, user: 'a', generation: 1, hiredAt: 0, expiresAt: 100, source: worker.source, skills: { cook: 0 }, learning: worker.learning, lastAt: 0 };
  return { actor: 'a', generation: 1, employees: { [worker.id]: employee } };
}

test('all sixteen production jobs have a stable hired-worker representative', () => {
  assert.equal(FANTASY_BUSINESS_JOBS.length, 16);
  for (const job of FANTASY_BUSINESS_JOBS) assert.ok(FANTASY_BUSINESS_WORKERS.some(worker => worker.job === job));
  assert.equal(FANTASY_BUSINESS_WORKERS[14].job, 'merchant', 'existing worker specialties must survive expansion');
});

test('a combat character can pay the resident artisan without inheriting unrelated profession bonuses', () => {
  const p = person(), original = structuredClone(p), quote = quoteFantasyCommission(p.character!, order);
  assert.equal(quote.error, undefined); assert.equal(quote.job, 'cook'); assert.equal(quote.hours, 3); assert.ok(quote.fee > 0);
  const result = applyFantasyCommission(p, order, () => .5);
  assert.equal(result.error, undefined); assert.equal(result.changed, true);
  assert.equal(result.profile.character!.gold, p.character!.gold - quote.fee);
  assert.equal(result.profile.character!.inventory.fish, 3); assert.equal(result.profile.character!.inventory.herb, 3);
  assert.equal(result.profile.character!.inventory.meal, quote.count);
  assert.equal(result.profile.character!.hour, 12);
  assert.equal(result.profile.character!.job, 'warrior'); assert.deepEqual(result.profile.character!.jobXp, p.character!.jobXp);
  assert.ok(result.profile.character!.foodLots.some(lot => lot.item === 'meal' && lot.count === quote.count));
  assert.deepEqual(p, original);
});

test('missing materials, insufficient payment, closed facilities and unknown/nonlocal providers fail atomically', () => {
  for (const alter of [(p: ReturnType<typeof person>) => p.character!.inventory = {}, (p: ReturnType<typeof person>) => p.character!.gold = 0, (p: ReturnType<typeof person>) => p.character!.hour = 22]) {
    const p = person(); alter(p); const original = structuredClone(p), result = applyFantasyCommission(p, order, () => .5);
    assert.ok(result.error); assert.equal(result.changed, false); assert.equal(result.profile, p); assert.deepEqual(p, original);
  }
  assert.ok(quoteFantasyCommission(person().character!, { ...order, npcId: 'invented-artisan' }).error);
  const other = FANTASY_ARTISANS.find(n => n.job === 'blacksmith')!;
  assert.ok(quoteFantasyCommission(person().character!, { ...order, npcId: other.id }).error);
});

test('outsourcing never creates private maps or rune knowledge records, even for a knowledgeable player', () => {
  const privateRecipes = FANTASY_RECIPES.filter(recipe => recipe.requiresBook || recipe.requiresLocations || /interior-map|rune-record/.test(recipe.output));
  assert.ok(privateRecipes.length > 0);
  for (const recipe of privateRecipes) assert.equal(fantasyCommissionRecipeAllowed(recipe), false, recipe.id);
});

test('owned idle workers earn bounded skill XP and charge wages; missing/foreign/assigned/expired workers cannot produce', () => {
  const p = person(), ctx = context(), workerId = Object.keys(ctx.employees)[0], request = { recipe: 'cook-meal', workerId };
  const quote = quoteFantasyCommission(p.character!, request, ctx); assert.equal(quote.error, undefined);
  const result = applyFantasyCommission(p, request, () => .5, ctx);
  assert.equal(result.error, undefined); assert.ok(result.employees![workerId].skills.cook > 0);
  assert.equal(ctx.employees[workerId].skills.cook, 0); assert.equal(result.profile.character!.gold, p.character!.gold - quote.fee);
  assert.ok(quoteFantasyCommission(p.character!, request).error);
  for (const patch of [{ user: 'b' }, { generation: 2 }, { plot: 'hearth-commercial' }, { company: true as const }, { estate: true as const }, { expiresAt: 12 }]) {
    const invalid = context(); Object.assign(invalid.employees[workerId], patch);
    const result = applyFantasyCommission(p, request, () => .5, invalid);
    assert.ok(result.error); assert.equal(result.profile, p); assert.equal(result.changed, false);
  }
});

test('a pending activity or battle cannot be bypassed through direct commission calls', () => {
  const p = person(); p.combatId = 'battle';
  const result = applyFantasyCommission(p, order, () => .5);
  assert.ok(result.error); assert.equal(result.profile, p);
});

test('a worker contract must cover the entire requested processing period', () => {
  const c = person().character!, ctx = context(), workerId = Object.keys(ctx.employees)[0], request = { recipe: 'cook-meal', workerId };
  ctx.employees[workerId].expiresAt = 14.99; assert.ok(quoteFantasyCommission(c, request, ctx).error);
  ctx.employees[workerId].expiresAt = 15; assert.ok(quoteFantasyCommission(c, request, ctx).error);
  ctx.employees[workerId].expiresAt = 15.01; assert.equal(quoteFantasyCommission(c, request, ctx).error, undefined);
});

test('gear commissions consume replacements and one gem per actual output, and use the artisan proficiency', () => {
  const smith = FANTASY_ARTISANS.find(npc => npc.job === 'blacksmith')!, p = person();
  Object.assign(p.character!, { location: smith.location, inventory: { ingot: 5, 'worldtree-branch': 2, ruby: 10 }, gear: [], jobXp: { warrior: 1_000_000 } });
  const request = { recipe: 'smith-blade', npcId: smith.id, material: 'worldtree-branch', gem: 'ruby' }, quote = quoteFantasyCommission(p.character!, request);
  assert.equal(quote.error, undefined); assert.equal(quote.inputs.wood, undefined); assert.equal(quote.inputs['worldtree-branch'], 1); assert.equal(quote.inputs.ruby, quote.count);
  const result = applyFantasyCommission(p, request, () => .5); assert.equal(result.error, undefined);
  const c = result.profile.character!; assert.equal(c.inventory.ruby, 10 - quote.count); assert.equal(c.inventory['worldtree-branch'], 1);
  assert.equal(c.gear!.length, quote.count); assert.ok(c.gear!.every(gear => gear.material === 'worldtree-branch' && gear.gem === 'ruby')); assert.equal(validFantasyGear(c), true);
  const novicePlayer = structuredClone(p); novicePlayer.character!.jobXp.warrior = 0;
  const noviceResult = applyFantasyCommission(novicePlayer, request, () => .5);
  assert.deepEqual(noviceResult.profile.character!.gear, c.gear);
  const noGem = structuredClone(p); noGem.character!.inventory.ruby = quote.count - 1;
  assert.ok(applyFantasyCommission(noGem, request, () => .5).error);
  assert.ok(quoteFantasyCommission(p.character!, { ...request, material: 'herb' }).error);
});

test('bag, gear and inventory ceilings reject before payment, consumption or random output', () => {
  const smith = FANTASY_ARTISANS.find(npc => npc.job === 'blacksmith')!;
  const p = person(); Object.assign(p.character!, { location: smith.location, inventory: { ingot: 5, wood: 5 }, gear: [] });
  const request = { recipe: 'smith-blade', npcId: smith.id };
  for (const item of FANTASY_ITEMS.filter(item => !['blade', 'ingot', 'wood'].includes(item.id)).slice(0, 22)) p.character!.inventory[item.id] = 1;
  let rolls = 0; const overBag = applyFantasyCommission(p, request, () => { rolls++; return .5; });
  assert.ok(overBag.error); assert.equal(overBag.profile, p); assert.equal(rolls, 0);
  p.character!.inventory = { ingot: 5, wood: 5 }; p.character!.gear = Array.from({ length: 1000 }, (_, i) => ({ id: `gear-limit-${i}`, item: 'blade', quality: 1, createdAt: 0 }));
  assert.ok(applyFantasyCommission(p, request, () => .5).error);
  const food = person(); food.character!.inventory.meal = 1_000_000;
  assert.ok(applyFantasyCommission(food, order, () => .5).error);
});

test('spoiled inputs and recovering workers fail atomically, and successful learning remains capped', () => {
  const p = person(); p.character!.hour = 50; p.character!.foodLots = [{ id: 'old-fish', item: 'fish', count: 4, createdAt: 0 }];
  assert.ok(applyFantasyCommission(p, order, () => .5).error);
  const fresh = person(), ctx = context(), workerId = Object.keys(ctx.employees)[0];
  fresh.character!.specialization = { companies: { troop: { members: [{ id: `worker-${workerId}`, condition: 'injured', hp: 0, assigned: false, missions: 0 }] } } };
  assert.ok(applyFantasyCommission(fresh, { recipe: 'cook-meal', workerId }, () => .5, ctx).error);
  delete fresh.character!.specialization; ctx.employees[workerId].skills.cook = 1_000_000;
  const result = applyFantasyCommission(fresh, { recipe: 'cook-meal', workerId }, () => .5, ctx);
  assert.equal(result.error, undefined); assert.equal(result.employees![workerId].skills.cook, 1_000_000);
});

test('commission errors and settled delivery receipts render in all supported languages', () => {
  for (const locale of ['ko', 'en', 'ja'] as const) {
    const error = fantasyCommissionText('加工の完了まで有効な雇用契約が必要です。', locale);
    const log = fantasyCommissionText('commission:artisan-hearth-nella:cook-meal:meal:2:8', locale);
    assert.ok(error); assert.ok(log); assert.ok(!log.includes('commission:')); assert.ok(log.includes('2') && log.includes('8'));
  }
  assert.equal(fantasyCommissionText('unrelated-log', 'en'), undefined);
});
