import { test } from 'node:test';
import assert from 'node:assert/strict';
import { FANTASY_DICE_FACES, fantasyDieFace } from './fantasy-dice.ts';
import { applyFantasyAction, newFantasyProfile, advanceFantasyWorld } from './fantasy-engine.ts';
import { addFantasyStatus } from './fantasy-effects.ts';

const high = () => 0.999;
const player = () => applyFantasyAction(newFantasyProfile(), { type: 'create', source: 'human', name: '骰子の旅人', gender: 'female' }, high).profile;

test('the five D6 face patterns are exact and other dice retain bounded proportional faces', () => {
  for (const [pattern, faces] of Object.entries(FANTASY_DICE_FACES)) {
    assert.deepEqual([1, 2, 3, 4, 5, 6].map(raw => fantasyDieFace(raw, 6, pattern as keyof typeof FANTASY_DICE_FACES)), faces);
    for (const sides of [8, 12, 20]) for (let raw = 1; raw <= sides; raw++) {
      const face = fantasyDieFace(raw, sides, pattern as keyof typeof FANTASY_DICE_FACES);
      assert.ok(Number.isInteger(face) && face >= 1 && face <= sides);
    }
  }
  assert.equal(fantasyDieFace(6, 6, 'even', 2), 4);
  assert.equal(fantasyDieFace(1, 6, 'lower', 50), 1);
});

test('profession grade, species and ordinary needs never permanently add dice', () => {
  const p = player(); p.character!.job = 'warrior'; p.character!.jobXp.warrior = 600;
  let calls = 0;
  const result = applyFantasyAction(p, { type: 'work' }, () => { calls++; return 0.999; });
  assert.equal(result.error, undefined);
  const roll = result.profile.log.findLast(log => log.text.includes('/ DC'))!.text;
  assert.ok(roll.includes('d8=')); assert.ok(!roll.includes('2d8')); assert.equal(calls, 2);
});

test('an active concentration rolls two real dice once and is consumed before the next matching action', () => {
  const p = player(); p.character!.job = 'mage'; p.character!.jobXp.mage = 0; p.character!.location = 'starspire'; p.character!.visited.push('starspire');
  p.character!.inventory.relic = 1; p.character!.inventory.gem = 1; p.character!.learnedSkills = ['mentor-focus'];
  const prepared = applyFantasyAction(p, { type: 'skill', skill: 'mentor-focus' }, high).profile;
  const rolls = [0.1, 0.9, 0.999]; let calls = 0;
  const result = applyFantasyAction(prepared, { type: 'craft', recipe: 'mage-refine' }, () => { calls++; return rolls.shift() ?? 0.999; });
  assert.equal(result.error, undefined); assert.equal(calls, 3);
  assert.ok(result.profile.log.some(log => log.text.includes('2d12=[2,11]、採用11（最高）')));
  assert.equal(result.profile.character!.buff, null); assert.equal(result.profile.character!.mana!.useXp, 4);
  result.profile.character!.inventory.relic = 1; result.profile.character!.inventory.gem = 1;
  const again = applyFantasyAction(result.profile, { type: 'craft', recipe: 'mage-refine' }, high);
  assert.ok(again.profile.log.at(-2)?.text || again.profile.log.at(-1)?.text);
  const newest = again.profile.log.slice(result.profile.log.length).find(log => log.text.includes('/ DC'))!.text;
  assert.ok(newest.includes('d12=') && !newest.includes('2d12='));
});

test('temporary disadvantage cancels active advantage and active faces win without stacking debuff faces', () => {
  const p = player(); const c = p.character!; c.job = 'fisher'; c.jobXp.fisher = 0; c.location = 'tidehaven'; c.visited.push('tidehaven');
  addFantasyStatus(c, 'frost');
  c.buff = { effect: 'check', stat: 'agility', power: 2, mp: 5, diceFaces: 'upper' };
  const result = applyFantasyAction(p, { type: 'fish', mode: 'pier' }, () => 0.1);
  assert.equal(result.error, undefined);
  const roll = result.profile.log.findLast(log => log.text.includes('/ DC'))!.text;
  assert.ok(roll.includes('d12=8')); assert.ok(!roll.includes('2d12'));
  assert.ok(result.profile.log.some(log => log.text.includes('判定の面：upper')));
  assert.equal(result.profile.character!.buff, null);
});

test('expiring concentration disappears on the shared clock and does not retain bonus dice', () => {
  const p = player(); const prepared = applyFantasyAction(p, { type: 'skill', skill: 'human-ingenuity' }, high).profile;
  const expired = advanceFantasyWorld(prepared, prepared.character!.hour + 7).profile;
  assert.equal(expired.character!.buff, null); assert.equal(expired.character!.mana?.useXp ?? 0, 0);
});
