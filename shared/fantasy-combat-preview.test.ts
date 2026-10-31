import test from 'node:test';
import assert from 'node:assert/strict';
import { createFantasyCombat, submitFantasyCombatOrder, type FantasyCombatSkill, type FantasyCombatPlayer } from './fantasy-combat.ts';
import { fantasyCombatAttackPreview, fantasyCombatItemAttackPreview, fantasyCombatCanTargetSelf, fantasyCombatSkillSummary } from './fantasy-combat-preview.ts';

const names = (value: string) => ({ ko: value, en: value, ja: value });
const arrow: FantasyCombatSkill = { id: 'aimed-arrow', names: names('Aimed arrow'), kind: 'attack', mp: 3, power: 2, range: 'ranged', hitBonus: 10 };
function battle(distance = 1, skill = arrow) {
  const player: FantasyCombatPlayer = { id: 'hero', userId: 'user', names: names('Hero'), generation: 1, hp: 200, mp: 100, position: 'front', range: 'ranged', skills: [skill],
    stats: { hp: 200, mp: 100, attack: 5, defense: 1, agility: 30, intelligence: 25, accuracy: 65, magicResist: 1 } };
  const state = createFantasyCombat({ id: 'preview', location: 'oldwatch', source: 'hunt:monster-goblin-raider', players: [player], enemies: [{ id: 'enemy', template: 'monster-goblin-raider' }], hour: 12, seed: 42, tactical: true });
  state.battlefield!.blocked = []; state.battlefield!.cover = [];
  state.fighters[0].tile = { x: 1, y: 1 }; state.fighters[1].tile = { x: 1 + distance, y: 1 };
  return state;
}
test('preview is the exact shared d20 threshold used by resolved skills at every legal distance', () => {
  for (const distance of [1, 3, 5, 7]) {
    const state = battle(distance), [actor, target] = state.fighters, before = structuredClone(state);
    const preview = fantasyCombatAttackPreview(state, actor, target, arrow);
    assert.equal(preview.error, undefined); assert.equal(preview.chance, (21 - preview.threshold!) / 20);
    const result = submitFantasyCombatOrder(state, 'user', state.revision, { type: 'skill', skill: arrow.id, target: target.id }, state.hour);
    assert.equal(result.error, undefined);
    const actual = result.state.logs.find(log => log.roll && log.text.en.includes('Hero'))!.roll!;
    assert.equal(actual.target, preview.threshold); assert.equal(actual.success, actual.value >= preview.threshold!);
    assert.deepEqual(state, before);
  }
  const near = battle(1), far = battle(7);
  assert.ok(fantasyCombatAttackPreview(near, near.fighters[0], near.fighters[1], arrow).chance! > fantasyCombatAttackPreview(far, far.fighters[0], far.fighters[1], arrow).chance!);
});
test('focus, skill hit bonuses, frost, target agility and distance all alter the actual chance', () => {
  const state = battle(4), [actor, target] = state.fighters;
  const base = fantasyCombatAttackPreview(state, actor, target);
  assert.ok(fantasyCombatAttackPreview(state, actor, target, arrow).chance! > base.chance!);
  actor.aim = { bonus: 15, turns: 2, owner: 'user', generation: 1, skill: 'focus', mp: 5 };
  assert.ok(fantasyCombatAttackPreview(state, actor, target).chance! > base.chance!);
  delete actor.aim; actor.effects.push({ id: 'frost', power: 5, turns: 2 });
  assert.ok(fantasyCombatAttackPreview(state, actor, target).chance! < base.chance!);
  actor.effects = []; target.stats.agility += 30;
  assert.ok(fantasyCombatAttackPreview(state, actor, target).chance! < base.chance!);
  actor.stats.accuracy = 100; actor.stats.agility = 1000; assert.equal(fantasyCombatAttackPreview(state, actor, target).chance, .9);
  actor.stats.accuracy = 0; actor.stats.agility = 0; target.stats.agility = 1000;
  assert.equal(fantasyCombatAttackPreview(state, actor, target).chance, .1);
});
test('an active focus buff and frost penalty appear in the real attack roll without being consumed by preview', () => {
  for (const frost of [false, true]) {
    const state = battle(5), [actor, target] = state.fighters;
    actor.skills.push({ id: 'focus', names: names('Focus'), kind: 'focus', mp: 5, power: 15 });
    actor.aim = { bonus: 15, turns: 2, owner: 'user', generation: 1, skill: 'focus', mp: 5 };
    if (frost) actor.effects.push({ id: 'frost', power: 3, turns: 2 });
    const preview = fantasyCombatAttackPreview(state, actor, target, arrow);
    assert.equal(preview.focusBonus, 15); assert.equal(preview.statusPenalty, frost ? 10 : 0); assert.ok(actor.aim);
    const done = submitFantasyCombatOrder(state, 'user', state.revision, { type: 'skill', skill: arrow.id, target: target.id }, state.hour);
    assert.equal(done.error, undefined); assert.equal(done.state.logs.find(log => log.roll && log.text.en.includes('Hero'))!.roll!.target, preview.threshold);
    assert.equal(done.state.fighters[0].aim, undefined);
  }
});
test('blocked, out-of-range, downed and friendly attack targets have no hit chance', () => {
  const state = battle(7), [actor, target] = state.fighters;
  state.battlefield!.blocked.push({ x: 4, y: 1 });
  assert.equal(fantasyCombatAttackPreview(state, actor, target, arrow).chance, undefined);
  state.battlefield!.blocked = []; target.tile = { x: 9, y: 1 };
  assert.equal(fantasyCombatAttackPreview(state, actor, target, arrow).chance, undefined);
  target.tile = { x: 2, y: 1 }; target.hp = 0;
  assert.equal(fantasyCombatAttackPreview(state, actor, target, arrow).chance, undefined);
  assert.equal(fantasyCombatAttackPreview(state, actor, actor, arrow).chance, undefined);
});
test('physical circles preserve physical cover rules while using their explicit reach and skill accuracy', () => {
  const physical: FantasyCombatSkill = { ...arrow, id: 'physical-circle', magic: false, range: 'magic', reach: 8, radius: 1 };
  const state = battle(5, physical), [actor, target] = state.fighters;
  state.battlefield!.cover.push(target.tile!);
  const physicalPreview = fantasyCombatAttackPreview(state, actor, target, physical);
  const magicPreview = fantasyCombatAttackPreview(state, actor, target, { ...physical, magic: true });
  assert.ok(magicPreview.accuracy! > physicalPreview.accuracy!);
  const result = submitFantasyCombatOrder(state, 'user', state.revision, { type: 'skill', skill: physical.id, target: target.id }, state.hour);
  assert.equal(result.state.logs.find(log => log.roll && log.text.en.includes('Hero'))!.roll!.target, physicalPreview.threshold);
});
test('an area spell applies one-use focus to its chosen center before nearby targets', () => {
  const circle: FantasyCombatSkill = { ...arrow, id: 'area-circle', magic: true, range: 'magic', reach: 8, radius: 1 };
  const state = battle(4, circle), [actor, nearby] = state.fighters;
  const center = { ...structuredClone(nearby), id: 'center', names: names('Center'), tile: { x: 6, y: 1 } }; state.fighters.push(center);
  actor.skills.push({ id: 'focus', names: names('Focus'), kind: 'focus', mp: 5, power: 15 });
  actor.aim = { bonus: 15, turns: 2, owner: 'user', generation: 1, skill: 'focus', mp: 5 };
  const preview = fantasyCombatAttackPreview(state, actor, center, circle);
  const result = submitFantasyCombatOrder(state, 'user', state.revision, { type: 'skill', skill: circle.id, target: center.id }, state.hour);
  assert.equal(result.error, undefined);
  const firstRoll = result.state.logs.find(log => log.roll && log.text.en.includes('Hero'))!;
  assert.ok(firstRoll.text.en.includes('Center')); assert.equal(firstRoll.roll!.target, preview.threshold);
});
test('localized skill summaries explain effects and ally arts permit self targeting except miracles', () => {
  for (const kind of ['heal', 'guard', 'focus', 'cleanse', 'blessing'] as const) assert.equal(fantasyCombatCanTargetSelf({ ...arrow, kind }), true);
  assert.equal(fantasyCombatCanTargetSelf({ ...arrow, kind: 'miracle' }), false); assert.equal(fantasyCombatCanTargetSelf(arrow), false);
  const blessing: FantasyCombatSkill = { ...arrow, kind: 'blessing', selfOnly: true, reach: 6, radius: 2, effects: { guard: 4, might: 3, cleanse: true } };
  for (const locale of ['ko', 'en', 'ja'] as const) { const text = fantasyCombatSkillSummary(blessing, locale); assert.match(text, /MP 3/); assert.match(text, /6/); assert.match(text, /2/); assert.match(text, /4/); assert.match(text, /3/); }
});


test('unlearned consumable attacks preview the actual item roll without pretending to be a learned skill',()=>{
  for(const distance of [1,3,5]){
    const state=battle(distance),[actor,target]=state.fighters;actor.skills=[];
    const art:FantasyCombatSkill={id:'item-bomb',names:names('Bomb'),kind:'attack',power:12,mp:0,range:'magic',magic:true,reach:6};
    const options={supplies:{user:{bomb:{count:1,names:names('Bomb'),combat:art}}}};
    assert.equal(fantasyCombatAttackPreview(state,actor,target,art).error,'invalid');
    const preview=fantasyCombatItemAttackPreview(state,'user','bomb',target,options);assert.equal(preview.error,undefined);
    const result=submitFantasyCombatOrder(state,'user',state.revision,{type:'item',item:'bomb',target:target.id},state.hour,options);assert.equal(result.error,undefined);
    const roll=result.state.logs.find(log=>log.roll&&log.text.en.includes('Hero'))!.roll!;assert.equal(roll.target,preview.threshold);
    assert.equal(fantasyCombatItemAttackPreview(state,'user','bomb',target,{supplies:{user:{bomb:{...options.supplies.user.bomb,count:0}}}}).error,'item');
  }
});
