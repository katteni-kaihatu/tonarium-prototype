import { test } from 'node:test';
import assert from 'node:assert/strict';
import { advanceFantasyWorld, applyFantasyAction, newFantasyProfile, startFantasyActivity } from './fantasy-engine.ts';
import { addFantasyStatus } from './fantasy-effects.ts';
import { fantasyRescueTown, validFantasyLifeProfile } from './fantasy-mortality.ts';
import { FANTASY_STARTING_INVENTORY, FANTASY_STARTING_GOLD } from './fantasy-starting-kit.ts';

const high = () => 0.999;
const player = () => applyFantasyAction(newFantasyProfile(), { type: 'create', name: '足跡の旅人', source: 'human', gender: 'female' }, high).profile;

test('nearby towns permit rescue while caves, islands, dangerous wilds and sea override it', () => {
  const c = player().character!;
  assert.equal(fantasyRescueTown(c), 'hearth');
  c.location = 'greenwood'; assert.ok(fantasyRescueTown(c));
  for (const location of ['deepcave', 'drift-isle', 'ashpeak']) { c.location = location; assert.equal(fantasyRescueTown(c, false, true), undefined); }
  c.location = 'tidehaven'; assert.equal(fantasyRescueTown(c, true, true), undefined);
});

test('town rescue charges once and preserves tools without advancing the shared clock', () => {
  const p = player(), c = p.character!; c.hp = 1; c.gold = 100; addFantasyStatus(c, 'poison');
  const result = advanceFantasyWorld(p, c.hour + 1, { accrueIdleNeeds: true });
  assert.equal(result.profile.death, undefined); assert.equal(result.profile.character!.gold, 90);
  assert.deepEqual(result.profile.character!.inventory, c.inventory);
  assert.equal(result.profile.character!.hour, c.hour + 1); assert.equal(result.profile.pastLives!.length, 0);
});

test('remote death records one atomic footprint and blocks all actions until rebirth', () => {
  const p = player(), c = p.character!; c.location = 'deepcave'; c.visited.push('deepcave'); c.hp = 1; c.gold = 999;
  c.jobXp.unassigned = 37; addFantasyStatus(c, 'poison');
  const dead = advanceFantasyWorld(p, c.hour + 1, { accrueIdleNeeds: true }).profile;
  assert.equal(dead.character!.hp, 0); assert.equal(dead.death!.location, 'deepcave'); assert.equal(dead.pastLives!.length, 1);
  assert.equal(dead.pastLives![0].jobXp.unassigned, 37); assert.equal(validFantasyLifeProfile(dead), true);
  const later = advanceFantasyWorld(dead, dead.character!.hour + 100).profile;
  assert.equal(later.pastLives!.length, 1); assert.equal(later.character!.hp, 0);
  for (const action of [{ type: 'work' }, { type: 'rest' }, { type: 'draw' }, { type: 'use', item: 'potion' }] as const) assert.equal(applyFantasyAction(dead, action, high).changed, false);
  const reborn = applyFantasyAction(dead, { type: 'rebirth' }, high).profile;
  assert.equal(reborn.character, null); assert.equal(reborn.generation, 2); assert.equal(reborn.death, undefined);
  assert.deepEqual(reborn.draft, { remaining: 5, candidate: null, kept: null }); assert.deepEqual(reborn.pastLives, dead.pastLives);
  const created = applyFantasyAction(reborn, { type: 'create', name: '二番目の人生', gender: 'male', source: 'human' }, high).profile;
  assert.equal(created.character!.gold, FANTASY_STARTING_GOLD); assert.deepEqual(created.character!.inventory, FANTASY_STARTING_INVENTORY);
  assert.equal(created.character!.jobXp.unassigned, 0); assert.equal(created.pastLives!.length, 1);
});

test('sea fishing and sea travel deaths are recorded at sea before arrival and grant no unfinished rewards', () => {
  for (const action of [{ type: 'fish', mode: 'sea' }, { type: 'travel', destination: 'dawnport', transport: 'working-ship' }] as const) {
    const p = player(), c = p.character!; c.job = 'fisher'; c.jobXp.fisher = 0; c.location = 'tidehaven'; c.visited.push('tidehaven'); c.charted.push('dawnport');
    c.fishingBoat = { kind: 'owned' }; c.hp = 1; c.hunger = 100;
    const pending = startFantasyActivity(p, action, c.hour, high).profile;
    assert.ok(pending.activity);
    const dead = advanceFantasyWorld(pending, c.hour + 1).profile;
    assert.equal(dead.death!.location, 'sea'); assert.equal(dead.pastLives![0].location, 'sea');
    assert.equal(dead.character!.location, 'tidehaven'); assert.equal(dead.activity, undefined); assert.equal(dead.character!.inventory.tuna ?? 0, 0);
    assert.equal(dead.character!.visited.includes('dawnport'), false); assert.equal(validFantasyLifeProfile(dead), true);
  }
});
