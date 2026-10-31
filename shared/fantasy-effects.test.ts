import { test } from 'node:test';
import assert from 'node:assert/strict';
import type { FantasyAction, FantasyProfile } from './fantasy.ts';
import { advanceFantasyWorld, applyFantasyAction, fantasyActionHours, fantasySkills, fantasyStats, newFantasyProfile, startFantasyActivity } from './fantasy-engine.ts';
import { FANTASY_ITEMS, FANTASY_QUESTS } from './fantasy-data.ts';
import { addFantasyEffect, addFantasyStatus, FANTASY_MAX_EFFECTS, fantasyActiveEffects, fantasyEffectDamage, fantasyItemBonuses, validFantasyItemState } from './fantasy-effects.ts';
import { foodSense, reconcileFoodLots } from './fantasy-life.ts';
import { fantasyPrice } from './fantasy-reputation.ts';
import { fantasyMana } from './fantasy-mana.ts';
import { NPC_PUBLIC } from './npc.ts';

const high = () => 0.999;
function player(job = 'unassigned') {
  const result = applyFantasyAction(newFantasyProfile(), { type: 'create', source: 'human', name: '効果試験', gender: 'female' }, high);
  assert.equal(result.error, undefined);
  result.profile.character!.birthBonuses = {};
  result.profile.character!.hp = fantasyStats(result.profile.character!).hp;
  result.profile.character!.mp = fantasyStats(result.profile.character!).mp;
  result.profile.character!.job = job; result.profile.character!.jobXp[job] = 0;
  return result.profile;
}
function step(profile: FantasyProfile, action: FantasyAction, rng = high) {
  const original = structuredClone(profile); const result = applyFantasyAction(profile, action, rng);
  assert.equal(result.error, undefined, result.error ?? action.type);
  assert.equal(result.changed, true);
  assert.equal(result.profile.revision, profile.revision + 1);
  assert.deepEqual(profile, original);
  assert.ok(validFantasyItemState(result.profile.character!, FANTASY_ITEMS));
  assert.ok(result.profile.character!.hp <= fantasyStats(result.profile.character!).hp);
  assert.ok(result.profile.character!.mp <= fantasyStats(result.profile.character!).mp);
  return result.profile;
}
function reject(profile: FantasyProfile, action: FantasyAction) {
  const original = structuredClone(profile); const result = applyFantasyAction(profile, action, high);
  assert.ok(result.error); assert.equal(result.changed, false); assert.equal(result.profile, profile); assert.deepEqual(profile, original);
}

test('equipment modifies real stats in four independent slots without copying inventory or healing', () => {
  let p = player('warrior'); p.character!.inventory = { 'steel-sword': 1, 'bear-armor': 1, 'sapphire-charm': 1, 'iron-shield': 1 };
  const hp = p.character!.hp, mp = p.character!.mp;
  for (const item of Object.keys(p.character!.inventory)) p = step(p, { type: 'equip', item });
  assert.deepEqual(p.character!.inventory, { 'steel-sword': 1, 'bear-armor': 1, 'sapphire-charm': 1, 'iron-shield': 1 });
  assert.equal(Object.keys(p.character!.equipment!).length, 4);
  assert.equal(fantasyStats(p.character!).strength, 12);
  assert.equal(fantasyStats(p.character!).vitality, 11);
  assert.equal(fantasyStats(p.character!).intelligence, 11);
  assert.equal(fantasyStats(p.character!).mp, 63);
  assert.equal(fantasyItemBonuses(p.character!, FANTASY_ITEMS).guard, 4);
  assert.equal(p.character!.hp, hp); assert.equal(p.character!.mp, mp);
  reject(p, { type: 'equip', item: 'steel-sword' });
  reject(p, { type: 'sell', item: 'steel-sword' });
  p = step(p, { type: 'unequip', slot: 'weapon' });
  assert.equal(fantasyStats(p.character!).strength, 10);
  p = step(p, { type: 'sell', item: 'steel-sword' }); assert.equal(p.character!.inventory['steel-sword'], 0);
});

test('unequipping boosted resources clamps current HP and MP and re-equipping cannot refill them', () => {
  let p = player(); p.character!.inventory = { 'ruby-ring': 1, 'echo-pendant': 1 };
  p = step(p, { type: 'equip', item: 'ruby-ring' }); p.character!.hp = fantasyStats(p.character!).hp;
  p = step(p, { type: 'unequip', slot: 'ring1' }); assert.equal(p.character!.hp, 100);
  p = step(p, { type: 'equip', item: 'ruby-ring' }); assert.equal(p.character!.hp, 100);
  p = step(p, { type: 'equip', item: 'echo-pendant' }); p.character!.mp = fantasyStats(p.character!).mp;
  p = step(p, { type: 'unequip', slot: 'necklace' }); assert.equal(p.character!.mp, 50);
  reject(p, { type: 'equip', item: 'missing' }); reject(p, { type: 'equip', item: 'herb' });
  reject(p, { type: 'unequip', slot: '__proto__' } as unknown as FantasyAction);
});

test('an offhand shield reduces actual combat damage without preventing status or hunger damage', () => {
  const base = player('warrior'); base.character!.location = 'ashpeak';
  const armored = structuredClone(base); armored.character!.inventory['iron-shield'] = 1;
  const equipped = step(armored, { type: 'equip', item: 'iron-shield' });
  const plainThreat = step(base, { type: 'explore' }, () => 0);
  const armorThreat = step(equipped, { type: 'explore' }, () => 0);
  assert.equal(plainThreat.event, 'encounter-goblin');
  assert.equal(armorThreat.event, plainThreat.event);
  assert.equal(plainThreat.character!.hp, base.character!.hp);
  const plainResult = step(plainThreat, { type: 'event', choice: 'fight' }, () => 0);
  const armorResult = step(armorThreat, { type: 'event', choice: 'fight' }, () => 0);
  assert.ok(plainResult.character!.hp < plainThreat.character!.hp);
  assert.equal(armorResult.character!.hp - plainResult.character!.hp, 2);
  const poison = player(); poison.character!.equipment = { offhand: 'ancient-aegis' }; poison.character!.inventory['ancient-aegis'] = 1;
  addFantasyStatus(poison.character!, 'poison');
  assert.equal(advanceFantasyWorld(poison, poison.character!.hour + 2, { accrueIdleNeeds: true }).profile.character!.hp, 96);
});

test('all twelve potion grades restore their actual resource without changing food or gold', () => {
  for (const kind of ['hp', 'mp', 'fatigue'] as const) for (const [index, amount] of [15, 30, 55, 85].entries()) {
    const p = player(); const c = p.character!, id = `${kind}-potion-${index + 1}`;
    c.inventory[id] = 1; c.hp = 1; c.mp = 1; c.fatigue = 90;
    const next = step(p, { type: 'use', item: id }).character!;
    assert.equal(next[kind], kind === 'fatigue' ? 90 - amount : Math.min(fantasyStats(next)[kind], 1 + amount));
    assert.equal(next.inventory[id], 0); assert.equal(next.gold, c.gold); assert.equal(next.hunger, c.hunger);
    assert.equal(next.foodLots.some(lot => lot.item === id), false);
  }
  const full = player(); full.character!.inventory['hp-potion-4'] = 1;
  reject(full, { type: 'use', item: 'hp-potion-4' }); assert.equal(full.character!.inventory['hp-potion-4'], 1);
});

test('status herbs and antidote cure only their registered conditions and do not consume useless cures', () => {
  let p = player(); const c = p.character!; c.inventory = { silverweed: 1, antidote: 1 };
  for (const id of ['poison', 'burn', 'frost', 'weakness'] as const) addFantasyStatus(c, id);
  p = step(p, { type: 'use', item: 'silverweed' });
  assert.deepEqual(p.character!.effects!.map(effect => effect.id).sort(), ['burn', 'frost', 'weakness']);
  p = step(p, { type: 'use', item: 'antidote' }); assert.deepEqual(p.character!.effects, []);
  p.character!.inventory.silverweed = 1; reject(p, { type: 'use', item: 'silverweed' });
  assert.equal(addFantasyStatus(p.character!, '__proto__' as 'poison'), false);
});

test('poison and burn tick once per game hour, expire, and offline idle protects HP', () => {
  const p = player(); const c = p.character!;
  addFantasyStatus(c, 'poison'); addFantasyStatus(c, 'burn');
  assert.equal(fantasyEffectDamage(c, c.hour, c.hour + 10), 24);
  const two = advanceFantasyWorld(p, c.hour + 2, { accrueIdleNeeds: true }).profile;
  assert.equal(two.character!.hp, 90);
  const complete = advanceFantasyWorld(two, c.hour + 10, { accrueIdleNeeds: true }).profile;
  assert.equal(complete.character!.hp, 76); assert.deepEqual(complete.character!.effects, []);
  const offline = advanceFantasyWorld(p, c.hour + 10).profile;
  assert.equal(offline.character!.hp, c.hp); assert.deepEqual(offline.character!.effects, []);
});

test('periodic damage during a reserved action survives reload and does not accrue again at completion', () => {
  const p = player(); addFantasyStatus(p.character!, 'poison');
  const pending = startFantasyActivity(p, { type: 'work' }, p.character!.hour, high).profile;
  const restored = JSON.parse(JSON.stringify(pending)) as FantasyProfile;
  const done = advanceFantasyWorld(restored, pending.activity!.endsAt).profile;
  assert.equal(done.character!.hp, 92); assert.equal(done.activity, undefined);
  const idle = advanceFantasyWorld(done, done.character!.hour + 5).profile;
  assert.equal(idle.character!.hp, 92); assert.deepEqual(idle.character!.effects, []);
});

test('frost and weakness alter the real d20 check and expire by the common clock', () => {
  const p = player(); p.character!.location = 'greenwood';
  const plain = step(p, { type: 'explore' });
  const weakened = structuredClone(p); addFantasyStatus(weakened.character!, 'frost'); addFantasyStatus(weakened.character!, 'weakness');
  const next = step(weakened, { type: 'explore' });
  const score = (profile: FantasyProfile) => Number(profile.log.find(log => /の探索：(?:\d+)?d20/.test(log.text))!.text.match(/補正([+-]\d+)/)![1]);
  assert.equal(score(plain) - score(next), 3);
  const expired = advanceFantasyWorld(weakened, weakened.character!.hour + 8).profile;
  assert.equal(fantasyStats(expired.character!).agility, 10); assert.equal(fantasyItemBonuses(expired.character!, FANTASY_ITEMS).check, 0);
});

test('food buffs replace each other, respect freshness and expire without leaving excess current resources', () => {
  let p = player(); p.character!.inventory = { 'salmon-stew': 1, 'dragon-banquet': 1, 'hp-potion-4': 1 }; p.character!.hunger = 90; reconcileFoodLots(p.character!);
  p = step(p, { type: 'use', item: 'salmon-stew' }); assert.equal(fantasyStats(p.character!).vitality, 12);
  p.character!.hp = fantasyStats(p.character!).hp;
  p = step(p, { type: 'use', item: 'dragon-banquet' });
  assert.equal(p.character!.effects!.length, 1); assert.equal(p.character!.effects![0].id, 'well-fed');
  assert.equal(fantasyStats(p.character!).strength, 12); assert.equal(fantasyStats(p.character!).vitality, 10); assert.equal(p.character!.hp, 100);
  const expired = advanceFantasyWorld(p, p.character!.hour + 6).profile;
  assert.equal(fantasyStats(expired.character!).strength, 10); assert.deepEqual(expired.character!.effects, []);
  const stale = player(); stale.character!.hour = 30; stale.character!.hunger = 80;
  stale.character!.inventory['dragon-banquet'] = 1; stale.character!.foodLots.push({ id: 'old-banquet', item: 'dragon-banquet', count: 1, createdAt: 5 });
  const ate = step(stale, { type: 'use', item: 'dragon-banquet' });
  assert.equal(ate.character!.hunger, 62); assert.equal(ate.character!.effects?.length ?? 0, 0);
});

test('expanded food purchases and cooking preserve FIFO lots while only cooks inspect exact data', () => {
  let p = player(); p.character!.gold = 500;
  p = step(p, { type: 'buy', item: 'grilled-trout' });
  assert.equal(p.character!.foodLots.find(lot => lot.item === 'grilled-trout')!.createdAt, p.character!.hour);
  assert.equal(foodSense(p.character!, 'grilled-trout').known, undefined);
  p.character!.job = 'cook'; assert.equal(foodSense(p.character!, 'grilled-trout').known?.shelfLife, 24);
  p.character!.hunger = 70; p = step(p, { type: 'use', item: 'grilled-trout' });
  assert.equal(p.character!.foodLots.some(lot => lot.item === 'grilled-trout'), false);
});

test('gem focus, luck and ward buffs have actual bounded effects instead of infinitely stacking', () => {
  let p = player(); p.character!.inventory = { ruby: 2, sapphire: 1, emerald: 1, diamond: 1 };
  p = step(p, { type: 'use', item: 'ruby' }); reject(p, { type: 'use', item: 'ruby' });
  p = step(p, { type: 'use', item: 'sapphire' });
  assert.equal(fantasyStats(p.character!).strength, 10); assert.equal(fantasyStats(p.character!).intelligence, 12);
  p = step(p, { type: 'use', item: 'emerald' }); p = step(p, { type: 'use', item: 'diamond' });
  assert.equal(fantasyStats(p.character!).luck, 12); assert.equal(fantasyItemBonuses(p.character!, FANTASY_ITEMS).guard, 2);
  assert.equal(p.character!.effects!.length, 3);
});

test('permanent elixirs stop at three points per core stat and reject further consumption', () => {
  for (const stat of ['strength', 'intelligence', 'vitality'] as const) {
    let p = player(); const id = `${stat}-elixir`; p.character!.inventory[id] = 4;
    for (let i = 0; i < 3; i++) p = step(p, { type: 'use', item: id });
    assert.equal(p.character!.permanentBonuses![stat], 3); assert.equal(fantasyStats(p.character!)[stat], 13);
    reject(p, { type: 'use', item: id }); assert.equal(p.character!.inventory[id], 1);
  }
});

test('effect replacement caps duration and count and semantic validation rejects forged payloads', () => {
  const c = player().character!;
  addFantasyEffect(c, { id: 'test', hours: 900, check: 1 }); assert.equal(c.effects![0].expiresAt, c.hour + 48);
  for (let i = 1; i < FANTASY_MAX_EFFECTS; i++) assert.equal(addFantasyEffect(c, { id: `test-${i}`, hours: 2 }), true);
  assert.equal(addFantasyEffect(c, { id: 'excess', hours: 1 }), false);
  assert.equal(fantasyActiveEffects(c).length, 8);
  assert.equal(validFantasyItemState(c, FANTASY_ITEMS), false);
  const valid = player().character!; addFantasyStatus(valid, 'poison'); assert.equal(validFantasyItemState(valid, FANTASY_ITEMS), true);
  const malformed = structuredClone(valid); (malformed.effects as unknown[]) = [null]; assert.equal(validFantasyItemState(malformed, FANTASY_ITEMS), false);
  const hacked = structuredClone(valid); hacked.effects![0].periodicHp = 50; assert.equal(validFantasyItemState(hacked, FANTASY_ITEMS), false);
  const forged = player().character!; forged.equipment = { weapon: 'steel-sword' }; assert.equal(validFantasyItemState(forged, FANTASY_ITEMS), false);
  forged.permanentBonuses = { strength: 99 }; assert.equal(validFantasyItemState(forged, FANTASY_ITEMS), false);
});

test('haggle applies the same price to purchases, rooms and meals while preserving a strict resale loss', () => {
  for (const service of ['goods', 'room', 'food'] as const) {
    let p = player('merchant'); p.character!.gold = 500;
    p = step(p, { type: 'haggle', service }, () => 0);
    const bargain = p.character!.bargains![service]!; assert.ok(bargain.discount > 0 && bargain.discount <= 0.2);
    reject(p, { type: 'haggle', service });
    const command: FantasyAction = service === 'goods' ? { type: 'buy', item: 'ore' } : service === 'room' ? { type: 'lodge', room: 'common' } : { type: 'eat', meal: 'simple' };
    const base = service === 'goods' ? FANTASY_ITEMS.find(item => item.id === 'ore')!.price : service === 'room' ? 8 : 5;
    const price = fantasyPrice(p.character!, base, service);
    const paid = step(p, command); assert.equal(p.character!.gold - paid.character!.gold, price);
    if (service === 'goods') {
      const sold = step(paid, { type: 'sell', item: 'ore' }); assert.ok(sold.character!.gold < p.character!.gold);
    }
  }
  const p = player(); p.character!.location = 'greenwood'; reject(p, { type: 'haggle', service: 'goods' });
});

test('reputation is earned from successful ordinary work and completed quests without rewarding criminal work', () => {
  const ordinary = step(player('merchant'), { type: 'work' }); assert.equal(ordinary.character!.reputation!.towns.hearth, 1);
  const criminal = step(player('thief'), { type: 'work' }); assert.equal(criminal.character!.reputation, undefined);
  const p = player(); const quest = FANTASY_QUESTS.find(quest => quest.giver === 'hearth' && !quest.races && !quest.families && !quest.jobs && !quest.chapter)!;
  p.character!.quests = [quest.id]; p.character!.inventory[quest.item] = quest.count; p.character!.visited.push(quest.destination);
  const done = step(p, { type: 'complete', quest: quest.id }); assert.equal(done.character!.reputation!.towns.hearth, 6);
});

test('scheduled lodging and dining honor the valid quoted discount even when it expires before completion', () => {
  for (const service of ['room', 'food'] as const) {
    let p = player(); p.character!.gold = 200;
    p = step(p, { type: 'haggle', service }, () => 0);
    if (service === 'food') p = advanceFantasyWorld(p, p.character!.hour + 7.5).profile;
    const command: FantasyAction = service === 'room' ? { type: 'lodge', room: 'private' } : { type: 'eat', meal: 'feast' };
    const quoted = fantasyPrice(p.character!, service === 'room' ? 20 : 25, service);
    const pending = startFantasyActivity(p, command, p.character!.hour, high).profile;
    assert.ok(pending.activity!.endsAt >= p.character!.bargains![service]!.expiresAt);
    const done = advanceFantasyWorld(pending, pending.activity!.endsAt).profile;
    assert.equal(done.character!.gold, p.character!.gold - quoted);
  }
});

test('mana grows on a delayed effective action and body skills consume MP with limited strain', () => {
  let p = player('adventurer');
  reject(p, { type: 'manaTrain', exercise: 'sense' });
  p = step(p, { type: 'skill', skill: 'human-ingenuity' });
  assert.equal(fantasyMana(p.character!).useXp, undefined);
  const pending = startFantasyActivity(p, { type: 'explore' }, p.character!.hour, high).profile;
  assert.equal(pending.activity!.endsAt - pending.activity!.startedAt, 3);
  assert.equal(fantasyMana(advanceFantasyWorld(pending, pending.activity!.endsAt - 0.001).profile.character!).useXp, undefined);
  p = advanceFantasyWorld(pending, pending.activity!.endsAt).profile;
  assert.equal(fantasyMana(p.character!).useXp, 6);
  p.character!.mana = { stage: 2, mastery: 6, strain: 0, affinity: 'balanced', useXp: 40 };
  assert.equal(fantasyMana(p.character!).stage, 2); assert.equal(fantasyStats(p.character!).vitality, 11);
  assert.equal(fantasySkills(p.character!).filter(skill => skill.id.startsWith('mana-body-')).length, 3);
  const before = fantasyMana(p.character!).strain, mp = p.character!.mp;
  p = step(p, { type: 'skill', skill: 'mana-body-strength' });
  assert.equal(p.character!.mp, mp - 5); assert.equal(fantasyMana(p.character!).strain, before + 3);
  assert.equal(p.character!.buff!.stat, 'strength');
  p.character!.buff = null; p.character!.mana!.strain = 80; reject(p, { type: 'skill', skill: 'mana-body-strength' });
  const rested = advanceFantasyWorld(p, p.character!.hour + 2).profile;
  assert.equal(fantasyMana(rested.character!).strain, 68);
  reject(rested, { type: 'manaTrain', exercise: 'release' });
});

test('NPC lessons require the real local teacher and reserve one hour without granting a skill or spending early', () => {
  const teacher = NPC_PUBLIC.find(npc => npc.trainableSkills?.length)!; assert.ok(teacher);
  const skill = teacher.trainableSkills![0]; let p = player(); p.character!.location = teacher.homeLocation;
  const action: FantasyAction = { type: 'learn', npcId: teacher.id, skill };
  assert.equal(fantasyActionHours(p, action), 1);
  const pending = startFantasyActivity(p, action, p.character!.hour, high).profile;
  assert.equal(pending.character!.gold, p.character!.gold); assert.equal(pending.character!.learnedSkills, undefined);
  p = advanceFantasyWorld(pending, pending.activity!.endsAt).profile;
  assert.equal(p.character!.gold, pending.character!.gold - 5); assert.deepEqual(p.character!.learnedSkills, [skill]);
  assert.ok(fantasySkills(p.character!).some(entry => entry.id === skill)); reject(p, action);
  const remote = player(); remote.character!.location = 'greenwood'; reject(remote, action);
  const poor = player(); poor.character!.location = teacher.homeLocation; poor.character!.gold = 4; reject(poor, action);
});
