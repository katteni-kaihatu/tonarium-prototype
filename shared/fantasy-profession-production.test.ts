import { test } from 'node:test';
import assert from 'node:assert/strict';
import type { FantasyAction, FantasyProfile, FantasyRecipe } from './fantasy.ts';
import { applyFantasyAction, advanceFantasyWorld, fantasyActionHours, fantasySkills, fantasyStats, newFantasyProfile, startFantasyActivity } from './fantasy-engine.ts';
import { FANTASY_ITEMS, FANTASY_JOBS, FANTASY_LOCATIONS, FANTASY_QUESTS, FANTASY_RECIPES } from './fantasy-data.ts';
import { FANTASY_PROFESSION_ITEMS, FANTASY_PROFESSION_QUESTS, FANTASY_PROFESSION_RECIPES } from './fantasy-items-expansion.ts';
import { canAcquireJob, canBuyItem, canSellItem, FANTASY_MAPS, fantasyBuildings, fantasyCanCraft, fantasyCraftFacility } from './fantasy-town.ts';
import { foodMeta, reconcileFoodLots } from './fantasy-life.ts';

const high = () => 0.999;
const counts: Record<string, number> = { carpenter: 3, tailor: 3, weaver: 3, leatherworker: 3, gemcutter: 3, herbalist: 3, farmer: 1, fisher: 2, baker: 4, potter: 3, shipwright: 3, scribe: 5 };
function player(job = 'unassigned'): FantasyProfile {
  const result = applyFantasyAction(newFantasyProfile(), { type: 'create', name: '共同の職人', source: 'human', gender: 'female' }, high);
  assert.equal(result.error, undefined);
  result.profile.character!.job = job; result.profile.character!.jobXp[job] = 0;
  return result.profile;
}
function step(profile: FantasyProfile, action: FantasyAction, rng = high) {
  const before = structuredClone(profile), result = applyFantasyAction(profile, action, rng);
  assert.equal(result.error, undefined, result.error ?? action.type); assert.equal(result.changed, true);
  assert.equal(result.profile.revision, profile.revision + 1); assert.deepEqual(profile, before);
  const c = result.profile.character!;
  assert.ok(c.hp <= fantasyStats(c).hp && c.mp <= fantasyStats(c).mp);
  for (const id of Object.keys(c.inventory).filter(id => foodMeta(id))) assert.equal(c.foodLots.filter(lot => lot.item === id).reduce((sum, lot) => sum + lot.count, 0), c.inventory[id]);
  return result.profile;
}
function reject(profile: FantasyProfile, action: FantasyAction) {
  const before = structuredClone(profile), result = applyFantasyAction(profile, action, high);
  assert.ok(result.error); assert.equal(result.changed, false); assert.equal(result.profile, profile); assert.deepEqual(profile, before);
}
function supplied(recipe: FantasyRecipe) {
  const p = player(recipe.job), c = p.character!;
  const facility = fantasyCraftFacility(c.job)!;
  c.location = FANTASY_LOCATIONS.find(place => fantasyBuildings({ location: place.id }).some(building => building.id === facility))!.id;
  if (!c.visited.includes(c.location)) c.visited.push(c.location);
  const map = FANTASY_MAPS.find(map => map.item === recipe.output);
  if (map) c.charted = [...map.locationIds];
  c.inventory = { ...recipe.inputs }; reconcileFoodLots(c);
  return p;
}

test('all twelve approved production professions have distinct registered recipes and localized useful products', () => {
  assert.equal(FANTASY_PROFESSION_RECIPES.length, 36);
  assert.equal(new Set(FANTASY_PROFESSION_RECIPES.map(recipe => recipe.id)).size, 36);
  assert.equal(FANTASY_PROFESSION_ITEMS.length, 9);
  for (const [job, count] of Object.entries(counts)) {
    assert.ok(FANTASY_JOBS.some(entry => entry.id === job), job);
    const recipes = FANTASY_PROFESSION_RECIPES.filter(recipe => recipe.job === job);
    assert.equal(recipes.length, count, job);
    assert.equal(new Set(recipes.map(recipe => recipe.output)).size, count, job);
    assert.ok(fantasyCraftFacility(job), job);
  }
  for (const item of FANTASY_PROFESSION_ITEMS) {
    assert.ok(FANTASY_ITEMS.some(entry => entry.id === item.id), item.id);
    for (const locale of ['ko', 'en', 'ja'] as const) assert.ok(item.names?.[locale] && item.descriptions?.[locale], `${item.id}:${locale}`);
    assert.ok(item.use || item.equipment || FANTASY_RECIPES.some(recipe => recipe.inputs[item.id] > 0) || FANTASY_PROFESSION_QUESTS.some(quest => quest.item === item.id));
  }
});

test('every approved recipe references existing inputs and normal items or map outputs without self-duplication', () => {
  for (const recipe of FANTASY_PROFESSION_RECIPES) {
    assert.ok(FANTASY_RECIPES.some(entry => entry.id === recipe.id), recipe.id);
    assert.ok(FANTASY_ITEMS.some(item => item.id === recipe.output) || FANTASY_MAPS.some(map => map.item === recipe.output), recipe.id);
    assert.equal(recipe.inputs[recipe.output], undefined, recipe.id);
    assert.notEqual(FANTASY_ITEMS.find(item => item.id === recipe.output)?.category, 'artifact', recipe.id);
    for (const [id, count] of Object.entries(recipe.inputs)) {
      assert.ok(FANTASY_ITEMS.some(item => item.id === id), `${recipe.id}:${id}`);
      assert.ok(Number.isSafeInteger(count) && count > 0);
    }
  }
});

test('all 36 production recipes use their actual profession and communal facility and spend each material once', () => {
  for (const recipe of FANTASY_PROFESSION_RECIPES) {
    const p = supplied(recipe), c = p.character!;
    assert.equal(fantasyCanCraft(c, recipe), true, recipe.id);
    const next = step(p, { type: 'craft', recipe: recipe.id }).character!;
    for (const id of Object.keys(recipe.inputs)) assert.equal(next.inventory[id], 0, `${recipe.id}:${id}`);
    assert.ok(next.inventory[recipe.output] >= recipe.count, recipe.id);
    assert.equal(next.hour, c.hour + 3);
    assert.equal('farm' in next || 'ship' in next || 'property' in next, false);
    if (foodMeta(recipe.output)) assert.equal(next.foodLots.find(lot => lot.item === recipe.output)?.createdAt, next.hour, recipe.id);
  }
});

test('wrong profession, missing communal facilities and material shortages reject without time or inventory changes', () => {
  for (const job of Object.keys(counts)) {
    const recipe = FANTASY_PROFESSION_RECIPES.find(recipe => recipe.job === job)!;
    const absent = supplied(recipe); absent.character!.location = 'greenwood';
    assert.equal(fantasyCanCraft(absent.character!, recipe), false); reject(absent, { type: 'craft', recipe: recipe.id });
    const wrong = supplied(recipe); wrong.character!.job = 'unassigned'; reject(wrong, { type: 'craft', recipe: recipe.id });
    const shortage = supplied(recipe); shortage.character!.inventory[Object.keys(recipe.inputs)[0]] = 0;
    reject(shortage, { type: 'craft', recipe: recipe.id });
  }
});

test('scribe and shipwright maps can copy only fully visited or charted places and never create hidden knowledge', () => {
  for (const recipe of FANTASY_PROFESSION_RECIPES.filter(recipe => recipe.output.startsWith('map-'))) {
    const map = FANTASY_MAPS.find(map => map.item === recipe.output)!;
    const p = supplied(recipe); p.character!.visited = [p.character!.location]; p.character!.charted = [];
    reject(p, { type: 'craft', recipe: recipe.id });
    const missing = map.locationIds.find(id => id !== p.character!.location)!;
    p.character!.charted = map.locationIds.filter(id => id !== missing);
    reject(p, { type: 'craft', recipe: recipe.id });
    p.character!.charted = [...map.locationIds];
    const before = [...p.character!.charted];
    const next = step(p, { type: 'craft', recipe: recipe.id }).character!;
    assert.deepEqual(next.charted, before); assert.ok(next.inventory[map.item] > 0);
    assert.ok(next.visited.every(id => p.character!.visited.includes(id)));
  }
});

test('farmer and fisher specialized work produces fresh materials only in suitable shared fields and fishing places', () => {
  const farmer = player('farmer'); farmer.character!.location = 'sunmeadow'; farmer.character!.visited.push('sunmeadow');
  const harvest = step(farmer, { type: 'work' }).character!;
  assert.equal(harvest.inventory.grain, 2); assert.equal(harvest.inventory.flax, 1); assert.equal(harvest.hour, farmer.character!.hour + 4);
  const failed = step(farmer, { type: 'work' }, () => 0).character!;
  assert.equal(failed.inventory.grain, 1); assert.equal(failed.inventory.flax ?? 0, 0);
  const wild = player('farmer'); wild.character!.location = 'deepcave';
  assert.equal(step(wild, { type: 'work' }).character!.inventory.grain ?? 0, 0);
  const fisher = player('fisher'); fisher.character!.location = 'tidehaven'; fisher.character!.visited.push('tidehaven');
  const caught = step(fisher, { type: 'work' }).character!;
  assert.equal(caught.inventory.fish, 2);
  assert.equal(caught.foodLots.find(lot => lot.item === 'fish')!.createdAt, caught.hour);
  const dry = player('fisher'); dry.character!.location = 'ironridge';
  assert.equal(step(dry, { type: 'work' }).character!.inventory.fish ?? 0, 0);
});

test('farm work, milling, a profession change and baking form a working input-to-food chain', () => {
  let p = player('farmer'); p.character!.location = 'sunmeadow'; p.character!.visited.push('sunmeadow');
  p = step(p, { type: 'work' }); p = step(p, { type: 'work' });
  p = step(p, { type: 'travel', destination: 'hearth', transport: 'foot' });
  p = step(p, { type: 'craft', recipe: 'farmer-flour' });
  const flour = p.character!.inventory.flour;
  p = step(p, { type: 'job', job: 'baker', via: 'guild' });
  p = step(p, { type: 'craft', recipe: 'baker-bread' });
  assert.ok(p.character!.inventory.bread >= 3);
  assert.equal(p.character!.inventory.flour, flour - 2);
  assert.equal(p.character!.foodLots.find(lot => lot.item === 'bread')!.createdAt, p.character!.hour);
});

test('pottery vessels are consumed by herbal and preservation crafts and their products actually work', () => {
  let p = supplied(FANTASY_PROFESSION_RECIPES.find(recipe => recipe.id === 'herbalist-tonic')!);
  p = step(p, { type: 'craft', recipe: 'herbalist-tonic' }); assert.equal(p.character!.inventory['pottery-vessel'], 0);
  p.character!.hp = 10; const healed = step(p, { type: 'use', item: 'hp-potion-1' }); assert.equal(healed.character!.hp, 25);
  let fish = supplied(FANTASY_PROFESSION_RECIPES.find(recipe => recipe.id === 'fisher-preserve')!);
  fish = step(fish, { type: 'craft', recipe: 'fisher-preserve' }); fish.character!.hunger = 60;
  fish = step(fish, { type: 'use', item: 'dried-fish' }); assert.equal(fish.character!.hunger, 32);
  assert.equal(foodMeta('dried-fish')?.shelfLife, 168);
});

test('reserved profession crafts and harvesting do not produce items early or repeat on reconnect', () => {
  const recipe = FANTASY_PROFESSION_RECIPES.find(recipe => recipe.id === 'shipwright-plank')!;
  const p = supplied(recipe);
  const pending = startFantasyActivity(p, { type: 'craft', recipe: recipe.id }, p.character!.hour, high).profile;
  assert.equal(pending.character!.inventory['repair-plank'] ?? 0, 0); assert.deepEqual(pending.character!.inventory, p.character!.inventory);
  const persisted = JSON.parse(JSON.stringify(pending)) as FantasyProfile;
  const done = advanceFantasyWorld(persisted, pending.activity!.endsAt).profile;
  assert.ok(done.character!.inventory['repair-plank'] >= 2); assert.equal(done.character!.hour, pending.activity!.endsAt);
  const again = advanceFantasyWorld(done, done.character!.hour).profile; assert.deepEqual(again.character!.inventory, done.character!.inventory);
  const farmer = player('farmer'); farmer.character!.location = 'sunmeadow'; farmer.character!.visited.push('sunmeadow');
  const harvest = startFantasyActivity(farmer, { type: 'work' }, farmer.character!.hour, high).profile;
  assert.equal(harvest.character!.inventory.grain, undefined);
  assert.ok(advanceFantasyWorld(harvest, harvest.activity!.endsAt).profile.character!.inventory.grain >= 1);
});

test('priest acquisition requires a present temple for every route and healing preparation uses temple facilities', () => {
  const p = player(); p.character!.location = 'emberhall';
  for (const via of ['guild', 'gm', 'npc'] as const) {
    assert.equal(canAcquireJob(p.character!, 'priest', via, via === 'npc' ? 'borin' : undefined), false);
    reject(p, { type: 'job', job: 'priest', via, ...(via === 'npc' ? { npcId: 'borin' } : {}) });
  }
  for (const location of ['hearth', 'suncourt', 'mooncity']) {
    const local = player(); local.character!.location = location;
    assert.equal(canAcquireJob(local.character!, 'priest', 'gm'), true);
    const learned = step(local, { type: 'job', job: 'priest', via: 'gm' }); assert.equal(learned.character!.job, 'priest');
  }
  const remedy = FANTASY_RECIPES.find(recipe => recipe.job === 'priest')!; assert.ok(remedy);
  const priest = supplied(remedy); assert.equal(fantasyCraftFacility('priest'), 'temple');
  step(priest, { type: 'craft', recipe: remedy.id });
  priest.character!.location = 'saffron-port'; reject(priest, { type: 'craft', recipe: remedy.id });
});

test('the shipyard repair order consumes crafted boards once and requires the inspection visit and return', () => {
  const quest = FANTASY_PROFESSION_QUESTS[0]; let p = player('shipwright');
  p.character!.location = quest.giver; p.character!.visited.push(quest.giver); p.character!.inventory[quest.item] = quest.count;
  p = step(p, { type: 'accept', quest: quest.id }); reject(p, { type: 'complete', quest: quest.id });
  p.character!.visited.push(quest.destination); p = step(p, { type: 'complete', quest: quest.id });
  assert.equal(p.character!.inventory[quest.item], 0); assert.ok(p.character!.completed.includes(quest.id)); reject(p, { type: 'complete', quest: quest.id });
  assert.equal(canBuyItem({ location: 'tidehaven' }, quest.item), true); assert.equal(canSellItem({ location: 'tidehaven' }, quest.item), true);
});

test('the nine approved combat professions own usable skills while skirmishes still use the shared d20 engine', () => {
  const jobs = ['warrior', 'knight', 'spearfighter', 'archer', 'scout', 'pugilist', 'spellblade', 'shieldbearer', 'summoner'];
  for (const job of jobs) {
    const p = player(job), definition = FANTASY_JOBS.find(entry => entry.id === job)!; assert.ok(definition);
    const active = definition.skills.find(skill => skill.kind === 'active')!; assert.ok(active);
    p.character!.hp = Math.max(1, p.character!.hp - 30); const used = step(p, { type: 'skill', skill: active.id });
    assert.equal(used.character!.mp, p.character!.mp - active.mp);
    assert.ok(fantasySkills(used.character!).some(skill => skill.id === active.id));
    const rough = player(job); rough.character!.location = 'ashpeak'; rough.character!.permanentBonuses = { [definition.stat]: 2 };
    const threat = step(rough, { type: 'explore' }, () => 0);
    assert.equal(threat.event, 'encounter-goblin', job);
    assert.equal(threat.character!.hp, rough.character!.hp, job);
    const result = step(threat, { type: 'event', choice: 'fight' }, () => 0);
    assert.ok(result.log.some(log => log.text.includes('道を塞ぐゴブリン：立ち向かって戦う') && log.text.includes('d20=')), job);
    assert.ok(result.character!.hp < threat.character!.hp, job);
    assert.equal(fantasyActionHours(rough, { type: 'explore' }), 3);
  }
});

test('new products cannot generate instant profit through discounted buying and selling and recipe materials form no duplication loop', () => {
  for (const item of FANTASY_PROFESSION_ITEMS) {
    let p = player(); p.character!.gold = 1000;
    p.character!.bargains = { goods: { location: 'hearth', discount: 0.2, expiresAt: p.character!.hour + 8, nextAt: p.character!.hour + 4 } };
    const before = p.character!.gold;
    p = step(p, { type: 'buy', item: item.id }); p = step(p, { type: 'sell', item: item.id });
    assert.ok(p.character!.gold < before, item.id);
    assert.equal(p.character!.inventory[item.id], 0);
  }
  const graph = new Map<string, Set<string>>();
  for (const recipe of FANTASY_RECIPES) for (const id of Object.keys(recipe.inputs)) {
    if (!graph.has(id)) graph.set(id, new Set());
    graph.get(id)!.add(recipe.output);
  }
  const walk = (id: string, visiting: Set<string>): void => {
    assert.equal(visiting.has(id), false, id);
    const next = new Set([...visiting, id]);
    for (const output of graph.get(id) ?? []) walk(output, next);
  };
  for (const id of graph.keys()) walk(id, new Set());
});

test('new materials, crafted food, equipment and copied maps survive the actual store semantic validator and reload', async t => {
  const { FantasyStore } = await import('../server/fantasy-store.ts');
  const { default: fs } = await import('node:fs');
  const { default: path } = await import('node:path');
  let scribe = supplied(FANTASY_PROFESSION_RECIPES.find(recipe => recipe.id === 'scribe-chart')!);
  scribe = step(scribe, { type: 'craft', recipe: 'scribe-chart' });
  let fisher = supplied(FANTASY_PROFESSION_RECIPES.find(recipe => recipe.id === 'fisher-preserve')!);
  fisher = step(fisher, { type: 'craft', recipe: 'fisher-preserve' });
  let tailor = supplied(FANTASY_PROFESSION_RECIPES.find(recipe => recipe.id === 'tailor-cloak')!);
  tailor = step(tailor, { type: 'craft', recipe: 'tailor-cloak' }); tailor = step(tailor, { type: 'equip', item: 'traveler-cloak' });
  const file = path.resolve('work', `profession-save-${crypto.randomUUID()}.json`);
  let serialized = JSON.stringify({ scribe, fisher, tailor });
  const read = fs.readFileSync.bind(fs);
  t.mock.method(fs, 'readFileSync', (candidate: unknown, ...args: unknown[]) => candidate === file ? serialized : Reflect.apply(read, fs, [candidate, ...args]));
  const store = new FantasyStore(file, { save: (_file, value) => { serialized = value; } });
  assert.equal(store.loadError, undefined);
  assert.deepEqual(store.profile('fisher'), fisher); assert.deepEqual(store.profile('tailor'), tailor);
  const sold = store.apply('scribe', scribe.revision, { type: 'sell', item: 'map-hearth-fields' });
  assert.equal(sold.error, undefined); assert.equal(sold.changed, true);
  const reloaded = new FantasyStore(file);
  assert.equal(reloaded.loadError, undefined);
  assert.deepEqual(reloaded.profile('scribe'), sold.profile);
  assert.deepEqual(reloaded.profile('fisher'), fisher);
  assert.equal(reloaded.profile('tailor').character!.equipment!.armor, 'traveler-cloak');
});

test('quest delivery preserves the worn copy, allows extra copies and permits the last copy only after unequipping', () => {
  const quest = FANTASY_QUESTS.find(quest => quest.id === 'quest-sword')!;
  assert.ok(quest);
  const equipment = FANTASY_ITEMS.find(item => item.id === quest.item)!.equipment!; assert.ok(equipment);
  let p = player(quest.jobs?.[0] ?? 'blacksmith');
  p.character!.location = quest.giver; p.character!.visited = [...new Set(['hearth', quest.giver, quest.destination])];
  p.character!.quests = [quest.id]; p.character!.completed = [...(quest.requiresCompleted ?? [])];
  p.character!.inventory[quest.item] = quest.count;
  p = step(p, { type: 'equip', item: quest.item });
  const before = structuredClone(p); const rejected = applyFantasyAction(p, { type: 'complete', quest: quest.id }, high);
  assert.equal(rejected.changed, false); assert.ok(rejected.error?.includes('着用中の装備'));
  assert.deepEqual(p, before);
  const spare = structuredClone(p); spare.character!.inventory[quest.item]++;
  const delivered = step(spare, { type: 'complete', quest: quest.id });
  assert.equal(delivered.character!.inventory[quest.item], 1);
  assert.equal(delivered.character!.equipment![equipment.slot], quest.item);
  assert.equal(fantasyStats(delivered.character!).strength, fantasyStats(spare.character!).strength);
  p = step(p, { type: 'unequip', slot: equipment.slot });
  p = step(p, { type: 'complete', quest: quest.id });
  assert.equal(p.character!.inventory[quest.item], 0); assert.equal(p.character!.equipment![equipment.slot], undefined);
});
