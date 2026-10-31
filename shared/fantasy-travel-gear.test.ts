import test from 'node:test';
import assert from 'node:assert/strict';
import { applyFantasyAction, newFantasyProfile, startFantasyActivity, advanceFantasyWorld } from './fantasy-engine.ts';

function traveler() {
  const p = applyFantasyAction(newFantasyProfile(), { type: 'create', source: 'human', gender: 'female', name: 'Traveller' }, () => .5).profile;
  const c = p.character!; c.hour = 8; c.inventory = { 'rain-cape': 1, 'fur-parka': 1, blade: 1, 'starter-pack': 1 }; c.charted.push('greenwood');
  const result = startFantasyActivity(p, { type: 'travel', destination: 'greenwood', transport: 'foot' }, c.hour, () => .99);
  assert.equal(result.error, undefined); assert.ok(result.profile.activity); return result.profile;
}
test('travelling allows immediate outfit weapon and armor changes while preserving the exact journey', () => {
  let p = traveler(); const journey = structuredClone(p.activity), hour = p.character!.hour, gold = p.character!.gold;
  for (const action of [{ type: 'wear', item: 'rain-cape' }, { type: 'equip', item: 'blade' }, { type: 'unequip', slot: 'weapon' }, { type: 'wear', item: 'fur-parka' }] as const) {
    const result = startFantasyActivity(p, action, hour, () => .99);
    assert.equal(result.error, undefined, action.type); assert.equal(result.changed, true);
    p = result.profile; assert.deepEqual(p.activity, journey); assert.equal(p.character!.hour, hour); assert.equal(p.character!.gold, gold);
  }
  assert.equal(p.character!.outfit, 'fur-parka');
  const arrived = advanceFantasyWorld(p, journey!.endsAt, { ambush: false });
  assert.equal(arrived.error, undefined); assert.equal(arrived.profile.character!.location, 'greenwood');
});
test('failed mid-travel gear changes preserve the complete journey and non-equipment actions remain blocked', () => {
  const p = traveler();
  for (const action of [{ type: 'wear', item: 'emberlined-coat' }, { type: 'equip', item: 'not-owned' }, { type: 'rest' }, { type: 'skill', skill: 'missing' }, { type: 'bagEquip', item: 'starter-pack' }] as const) {
    const result = applyFantasyAction(p, action, () => .99); assert.ok(result.error, action.type); assert.deepEqual(result.profile, p);
  }
  const working = structuredClone(p); working.activity!.action = { type: 'work' };
  assert.ok(applyFantasyAction(working, { type: 'wear', item: 'rain-cape' }).error);
  const fighting = structuredClone(p); fighting.combatId = 'battle';
  assert.ok(applyFantasyAction(fighting, { type: 'wear', item: 'rain-cape' }).error);
});
