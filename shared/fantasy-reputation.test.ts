import test from 'node:test';
import assert from 'node:assert/strict';
import { applyFantasyAction, newFantasyProfile } from './fantasy-engine.ts';
import { fantasyCanHaggle, fantasyHaggle, fantasyPrice, fantasyReputation, grantFantasyReputation, validFantasyReputation } from './fantasy-reputation.ts';
import { parseFantasyRoll } from './fantasy-roll.ts';

const character = () => applyFantasyAction(newFantasyProfile(), { type: 'create', name: 'Rep', gender: 'female', source: 'human' }).profile.character!;

test('local contributions keep continent, area and town standing distinct and bounded', () => {
  const c = character();
  grantFantasyReputation(c, 9);
  assert.deepEqual(fantasyReputation(c), { land: 3, region: 9, town: 9, score: 8 });
  c.location = 'emberhall';
  assert.deepEqual(fantasyReputation(c), { land: 3, region: 0, town: 0, score: 1 });
  c.location = 'mooncity';
  assert.deepEqual(fantasyReputation(c), { land: 0, region: 0, town: 0, score: 0 });
  for (let i = 0; i < 50; i++) grantFantasyReputation(c, 10);
  assert.equal(fantasyReputation(c).town, 100);
  assert.ok(validFantasyReputation(c));
});

test('reputation improves haggling while timed discounts stay local and separated by service', () => {
  const c = character();
  const first = fantasyHaggle(c, 'room', () => .4)!;
  assert.equal(first.success, false);
  assert.equal(fantasyCanHaggle(c, 'room'), false);
  assert.equal(fantasyHaggle(c, 'room', () => 0), null);
  c.hour += 4;
  grantFantasyReputation(c, 100);
  const second = fantasyHaggle(c, 'room', () => .4)!;
  assert.ok(second.chance > first.chance);
  assert.equal(second.success, true);
  assert.ok(fantasyPrice(c, 50, 'room') < 50);
  assert.equal(fantasyPrice(c, 50, 'food'), 50);
  c.location = 'emberhall';
  assert.equal(fantasyPrice(c, 50, 'room'), 50);
  c.location = 'hearth'; c.hour += 8;
  assert.equal(fantasyPrice(c, 50, 'room'), 50);
});

test('invalid standing and injected bargain discounts cannot load', () => {
  const c = character();
  c.reputation = { lands: { aurelia: 101 }, regions: {}, towns: {} };
  assert.equal(validFantasyReputation(c), false);
  c.reputation = { lands: {}, regions: {}, towns: {} };
  c.bargains = { goods: { location: 'hearth', discount: 1, expiresAt: 10, nextAt: 2 } };
  assert.equal(validFantasyReputation(c), false);
});

test('haggling rolls one actual D100 and succeeds exactly at or below its reputation-adjusted integer target', () => {
  const base = character(); let successes = 0;
  for (let face = 1; face <= 100; face++) {
    const c = structuredClone(base); let calls = 0;
    const result = fantasyHaggle(c, 'room', () => { calls++; return (face - 0.5) / 100; })!;
    assert.equal(calls, 1); assert.equal(result.roll, face); assert.equal(result.target, Math.floor(result.chance * 100));
    assert.equal(result.success, face <= result.target);
    assert.equal(result.target, 25); if (result.success) successes++;
    assert.equal(c.bargains!.room!.discount > 0, result.success);
  }
  assert.equal(successes, 25);
  const reputable = character(); reputable.job = 'merchant'; grantFantasyReputation(reputable, 100);
  const result = fantasyHaggle(reputable, 'goods', () => 0.5)!;
  assert.ok(result.target > 25); assert.equal(result.target, Math.floor(result.chance * 100));
  assert.equal(result.success, result.roll <= result.target);
});

test('the engine dice overlay receives exactly the D100 outcome used for the real discount', () => {
  for (const [value, face, success] of [[0.249, 25, true], [0.25, 26, false], [0.999, 100, false], [0, 1, true]] as const) {
    const p = applyFantasyAction(newFantasyProfile(), { type: 'create', name: '交渉者', source: 'human', gender: 'female' }, () => 0.999).profile;
    const before = structuredClone(p); let calls = 0;
    const result = applyFantasyAction(p, { type: 'haggle', service: 'room' }, () => { calls++; return value; });
    assert.equal(result.error, undefined); assert.equal(calls, 1); assert.deepEqual(p, before);
    const roll = result.profile.log.map(log => parseFantasyRoll(log.text)).find(Boolean)!;
    assert.equal(roll.label, '値段交渉（目標以下）'); assert.equal(roll.sides, 100); assert.deepEqual(roll.dice, [face]);
    assert.equal(roll.kept, face); assert.equal(roll.total, face); assert.equal(roll.dc, 25); assert.equal(roll.success, success);
    assert.equal(result.profile.character!.bargains!.room!.discount > 0, success);
    assert.equal(applyFantasyAction(result.profile, { type: 'haggle', service: 'room' }, () => { throw new Error('cooldown must not roll'); }).changed, false);
  }
});
