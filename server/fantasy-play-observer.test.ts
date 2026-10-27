import test from 'node:test';
import assert from 'node:assert/strict';
import { applyFantasyAction, newFantasyProfile } from '../shared/fantasy-engine.ts';
import type { FantasyProfile } from '../shared/fantasy.ts';
import type { FantasyCombatState } from '../shared/fantasy-combat.ts';
import type { FantasyDiagnosticEvent } from './fantasy-diagnostics.ts';
import { FantasyPlayObserver } from './fantasy-play-observer.ts';

const privateText = 'PRIVATE_CHARACTER_STORY_INVENTORY_8391';
function profile(): FantasyProfile {
  const result = applyFantasyAction(newFantasyProfile(), { type: 'create', name: 'Observer fixture', gender: 'female', source: 'human' }, () => .5).profile;
  Object.assign(result.character!, { name: privateText, hp: 30, mp: 20, gold: 50, xp: 10, fatigue: 1, hunger: 2, hour: 8, lifeStartedAt: 8 });
  result.character!.inventory = { [privateText]: 1 }; result.log = [{ id: 1, hour: 8, text: `${privateText}：d20=16、補正+2、合計18 / DC12 → 成功`, kind: 'success' }];
  return result;
}
function fixture(maxActors?: number) {
  const events: FantasyDiagnosticEvent[] = [];
  return { events, observer: new FantasyPlayObserver({ record: event => { events.push(event); } }, { maxActors }) };
}
const types = (events: FantasyDiagnosticEvent[], type: string) => events.filter(event => event.type === type);

test('profile deliveries dedupe across sockets without replaying historical rolls or retaining story fields', () => {
  const { observer, events } = fixture(), value = profile();
  observer.profile('actor', 'world', value); observer.profile('actor', 'world', structuredClone(value));
  assert.equal(types(events, 'profile.resume').length, 1); assert.equal(types(events, 'roll.result').length, 0);
  value.revision++; value.log.push({ id: 2, hour: 8, text: `${privateText}：d20=8、補正+2、合計10 / DC12 → 失敗`, kind: 'failure' });
  observer.profile('actor', 'world', value); observer.profile('actor', 'world', structuredClone(value));
  assert.deepEqual(types(events, 'roll.result').map(event => [event.roll, event.rollTarget, event.rollSuccess]), [[10, 12, false]]);
  assert.equal(types(events, 'profile.delta').length, 0);
  assert.ok(!JSON.stringify(events).includes(privateText));
});

test('sixteen work steps produce incremental progress and exactly one scheduled completion', () => {
  const { observer, events } = fixture(), value = profile(); observer.profile('worker', null, value);
  value.revision++; value.activity = { action: { type: 'work' }, startedAt: 8, endsAt: 12, seed: 1, work: { completed: 0, successes: 0, gold: 0, xp: 0, totalSteps: 16 } };
  observer.profile('worker', null, value);
  for (let completed = 1; completed <= 15; completed++) { value.revision++; value.character!.hour = 8 + completed / 4; value.activity.work!.completed = completed; observer.profile('worker', null, value); observer.profile('worker', null, value); }
  value.revision++; value.character!.hour = 12; delete value.activity; observer.profile('worker', null, value); observer.profile('worker', null, value);
  assert.equal(types(events, 'activity.start').length, 1);
  assert.deepEqual(types(events, 'activity.progress').map(event => event.progress), [1, 2, 3, 4, 5, 6, 7, 8, 9, 10, 11, 12, 13, 14, 15, 16]);
  assert.ok(types(events, 'activity.progress').every(event => event.total === 16));
  assert.equal(types(events, 'activity.end').length, 1); assert.equal(types(events, 'activity.end')[0].completed, true); assert.equal(types(events, 'activity.cancel').length, 0);
});

test('numeric deltas, interrupted activities, death age and rebirth are recorded once without death stories', () => {
  const { observer, events } = fixture(), value = profile(); observer.profile('life', 'world', value);
  value.revision++; Object.assign(value.character!, { hp: 25, mp: 17, gold: 57, xp: 19, hunger: 6, fatigue: 7, location: 'greenwood', hour: 9 });
  value.activity = { action: { type: 'rest' }, startedAt: 9, endsAt: 17, seed: 1 }; observer.profile('life', 'world', value);
  const delta = types(events, 'profile.delta')[0]; assert.deepEqual([delta.healthDelta, delta.manaDelta, delta.moneyDelta, delta.experienceDelta, delta.hungerDelta, delta.fatigueDelta], [-5, -3, 7, 9, 4, 6]); assert.equal(delta.location, 'greenwood');
  value.revision++; value.character!.hour = 56; value.character!.hp = 0; value.death = { location: 'greenwood', hour: 56, cause: privateText }; delete value.activity; observer.profile('life', 'world', value); observer.profile('life', 'world', value);
  assert.equal(types(events, 'lifecycle.death').length, 1); assert.equal(types(events, 'lifecycle.death')[0].lifespanDays, 2); assert.equal(types(events, 'activity.cancel').length, 1);
  const reborn = profile(); reborn.revision = value.revision + 1; reborn.generation = 2; observer.profile('life', 'world', reborn); observer.profile('life', 'world', reborn);
  assert.equal(types(events, 'lifecycle.rebirth').length, 1); assert.equal(types(events, 'lifecycle.rebirth')[0].generation, 2);
  assert.ok(!JSON.stringify(events).includes(privateText));
});

test('combat revisions and new numeric rolls dedupe while fighters and log prose stay private', () => {
  const { observer, events } = fixture();
  const battle = { id: 'battle', revision: 2, round: 1, status: 'active', location: 'hearth', hour: 8, fighters: [{ side: 'players', userId: 'actor', names: { ko: privateText } }, { side: 'players', userId: 'ally', names: { ko: privateText } }, { side: 'enemies', names: { ko: privateText } }], logs: [{ id: 1, round: 1, text: { ko: privateText }, roll: { sides: 20, value: 19, target: 12, success: true } }] } as unknown as FantasyCombatState;
  observer.combat('actor', 'world', battle); observer.combat('actor', 'world', structuredClone(battle));
  assert.equal(types(events, 'combat.state').length, 1); assert.equal(types(events, 'combat.state')[0].partySize, 2); assert.equal(types(events, 'combat.roll').length, 0);
  battle.revision++; battle.round = 2; battle.logs.push({ id: 2, round: 2, text: { ko: privateText, en: privateText, ja: privateText }, roll: { sides: 20, value: 7, target: 10, success: false } });
  observer.combat('actor', 'world', battle); observer.combat('actor', 'world', structuredClone(battle));
  assert.deepEqual(types(events, 'combat.roll').map(event => [event.roll, event.rollTarget, event.rollSuccess]), [[7, 10, false]]);
  observer.combat('actor', 'world', null); observer.combat('actor', 'world', null); assert.equal(types(events, 'combat.end').length, 1);
  assert.ok(!JSON.stringify(events).includes(privateText));
});

test('actor LRU eviction and forget restart baselines while stale deliveries do not replay changes', () => {
  const { observer, events } = fixture(2), a = profile(), stale = structuredClone(a);
  observer.profile('a', null, a); observer.profile('b', null, profile()); observer.profile('a', null, a); observer.profile('c', null, profile()); observer.profile('a', null, a); observer.profile('b', null, profile());
  assert.equal(types(events, 'profile.resume').length, 4); // b, rather than the recently touched a, was evicted.
  observer.forget('a'); observer.profile('a', null, a); assert.equal(types(events, 'profile.resume').length, 5);
  a.revision++; a.character!.gold++; observer.profile('a', null, a); observer.profile('a', null, stale); observer.profile('a', null, a);
  assert.equal(types(events, 'profile.delta').filter(event => event.actorId === 'a').length, 1);
});

test('observer sink failures cannot escape gameplay or allow unregistered location and action strings', () => {
  const { observer, events } = fixture(), value = profile(); observer.profile('safe', null, value);
  value.revision++; value.character!.location = privateText; value.character!.gold++;
  value.activity = { action: { type: privateText } as never, startedAt: 8, endsAt: 9, seed: 1 }; observer.profile('safe', null, value);
  assert.ok(!JSON.stringify(events).includes(privateText));
  const throwing = new FantasyPlayObserver({ record: () => { throw Error('fake sink failure'); } });
  assert.doesNotThrow(() => { throwing.profile('a', null, value); value.revision++; value.character!.gold++; throwing.profile('a', null, value); throwing.combat('a', null, null); throwing.forget('a'); });
});
