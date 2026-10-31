import test from 'node:test';
import assert from 'node:assert/strict';
import { applyFantasyAction, newFantasyProfile, fantasyStats } from './fantasy-engine.ts';
import { fantasyCombatPlayer } from '../server/fantasy-combat-adapter.ts';
import { advanceFantasyCombat, createFantasyCombat, fantasyCombatOrderError, submitFantasyCombatOrder, validFantasyCombatState, type FantasyCombatState } from './fantasy-combat.ts';
import { fantasyCombatCover, fantasyCombatPath } from './fantasy-combat-tactics.ts';

function battle(race = 'human', job = 'warrior', terrain = false): FantasyCombatState {
  const profile = applyFantasyAction(newFantasyProfile(), { type: 'create', name: 'Boundary', source: 'human', gender: 'female' }, () => .5).profile;
  const c = profile.character!; c.race = race; c.job = job; c.level = 20; c.hp = fantasyStats(c).hp; c.mp = fantasyStats(c).mp;
  if (job === 'mage') c.specialization = { spells: [{ slot: 1, element: 'flame', form: 'bolt', circle: { core: 'flame', runes: [] } }] };
  return createFantasyCombat({ id: 'boundary', source: 'encounter:test', location: 'oldwatch', players: [fantasyCombatPlayer(profile, 'owner')], enemies: [{ id: 'enemy', template: 'monster-goblin-raider' }], seed: 42, hour: 12, tactical: true, ...(terrain ? { terrain: 'barricade' as const } : {}) });
}
test('actual creation generates dense obstacles, separated valid starts and a ranged enemy', () => {
  const s = battle('human', 'warrior', true);
  assert.ok((s.battlefield!.obstacles?.length ?? 0) >= 8);
  assert.ok(s.fighters[0].tile!.x < 4); assert.ok(s.fighters[1].tile!.x >= 7);
  assert.equal(s.fighters[1].range, 'ranged');
  assert.ok(validFantasyCombatState(JSON.parse(JSON.stringify(s))));
});
test('adapter body traits survive creation/reload and forged body metadata is rejected', () => {
  for (const [race, key] of [['halfling', 'small'], ['foxkin', 'flexible'], ['birdkin', 'flying'], ['orc', 'large']] as const) {
    const s = battle(race); assert.equal(s.fighters[0].body?.[key], true);
    assert.ok(validFantasyCombatState(JSON.parse(JSON.stringify(s))));
    (s.fighters[0].body as Record<string, unknown>).small = 'yes'; assert.equal(validFantasyCombatState(s), false);
  }
});
test('flexible passage and large pit crossing resolve real D20 movement checks', () => {
  for (const [race, kind] of [['foxkin', 'fallen-log'], ['orc', 'hole']] as const) {
    const s = battle(race); s.fighters[0].tile = { x: 0, y: 3 }; s.fighters[1].tile = { x: 9, y: 3 };
    s.battlefield!.obstacles = [{ kind, tile: { x: 1, y: 3 } }];
    assert.equal(fantasyCombatPath(s, s.fighters[0], { x: 2, y: 3 })?.length, 3);
    const r = submitFantasyCombatOrder(s, 'owner', 0, { type: 'moveTo', tile: { x: 2, y: 3 } }, 12);
    assert.equal(r.error, undefined); assert.ok(r.state.logs.some(log => log.roll && /cross|passage/.test(log.text.en)));
    assert.ok(validFantasyCombatState(r.state));
  }
});
test('obstacle attacks reject indestructible, blocked sight and unavailable skills without mutation', () => {
  const s = battle(); s.fighters[0].tile = { x: 0, y: 3 }; s.fighters[0].range = 'ranged'; s.fighters[1].tile = { x: 9, y: 3 };
  s.battlefield!.obstacles = [{ kind: 'hole', tile: { x: 1, y: 3 } }, { kind: 'boulder', tile: { x: 2, y: 3 } }, { kind: 'thick-vine', tile: { x: 3, y: 3 } }];
  assert.equal(fantasyCombatOrderError(s, 'owner', { type: 'break', tile: { x: 1, y: 3 } }), 'target');
  assert.equal(fantasyCombatOrderError(s, 'owner', { type: 'break', tile: { x: 3, y: 3 } }), 'range');
  const r = submitFantasyCombatOrder(s, 'owner', 0, { type: 'break', tile: { x: 2, y: 3 }, skill: 'forged' }, 12);
  assert.equal(r.error, 'invalid'); assert.equal(r.changed, false); assert.deepEqual(r.state, s);
});
test('a learned flame attack burns vines using its MP and returns a practice receipt', () => {
  const s = battle('human', 'mage'); const actor = s.fighters[0]; actor.tile = { x: 0, y: 3 }; s.fighters[1].tile = { x: 9, y: 3 };
  actor.stats.accuracy = 100; actor.stats.agility = 100;
  s.battlefield!.obstacles = [{ kind: 'thick-vine', tile: { x: 1, y: 3 } }];
  const skill = actor.skills.find(skill => skill.id === 'prepared-spell-1')!; assert.equal(skill.damageType, 'fire');
  const r = submitFantasyCombatOrder(s, 'owner', 0, { type: 'break', tile: { x: 1, y: 3 }, skill: skill.id }, 12);
  assert.equal(r.error, undefined); assert.equal(r.state.fighters[0].mp, actor.mp - skill.mp);
  assert.equal(r.state.battlefield!.obstacles!.length, 0); assert.equal(r.usedSkills?.[0].kind, 'obstacle');
  assert.ok(r.state.logs.some(log => log.roll && log.text.en.includes('destroy')));
});
test('shield barriers provide positional cover, persist one round and expire without accumulation', () => {
  let s = battle('human', 'shieldbearer'); s.fighters[0].tile = { x: 2, y: 3 }; s.fighters[1].tile = { x: 8, y: 3 }; s.fighters[1].range = 'ranged';
  const skill = s.fighters[0].skills.find(skill => skill.id.includes('shieldbearer'))!;
  const r = submitFantasyCombatOrder(s, 'owner', 0, { type: 'skill', skill: skill.id, target: s.fighters[0].id }, 12); assert.equal(r.error, undefined); s = r.state;
  assert.equal(s.battlefield!.obstacles?.length, 1); assert.ok(s.battlefield!.obstacles![0].expiresRound);
  assert.ok(validFantasyCombatState(JSON.parse(JSON.stringify(s))));
  assert.equal(fantasyCombatCover(s, s.fighters[0], s.fighters[1]), true);
  s = advanceFantasyCombat(s, s.deadline).state; assert.equal(s.battlefield!.obstacles?.length, 0);
});
test('combat professions expose martial skills while racial hexes and human ingenuity retain distinct actual roles', () => {
  assert.equal(battle().fighters[0].skills.find(skill => skill.id === 'approved-skill-warrior-drive')?.kind, 'attack');
  const bird = battle('birdkin'), actor = bird.fighters[0], hex = actor.skills.find(skill => skill.id === 'birdkin-focus')!;
  assert.equal(hex.kind, 'hex'); assert.equal(hex.utility, 'blind');
  const cast = submitFantasyCombatOrder(bird, 'owner', bird.revision, { type: 'skill', skill: hex.id, target: bird.fighters[1].id }, bird.hour);
  assert.equal(cast.error, undefined); assert.ok(cast.state.fighters[1].conditions?.some(condition => condition.id === 'blind')); assert.equal(cast.state.fighters[0].mp, actor.mp - hex.mp);
  assert.equal(battle().fighters[0].skills.find(skill => skill.id === 'human-ingenuity')?.kind, 'focus');
});
test('small stature alone cannot walk through a pit, while flight can attempt a crossing', () => {
  for (const [race, direct] of [['halfling', false], ['birdkin', true]] as const) {
    const s = battle(race); s.fighters[0].tile = { x: 0, y: 3 }; s.fighters[1].tile = { x: 9, y: 3 };
    s.battlefield!.obstacles = [{ kind: 'hole', tile: { x: 1, y: 3 } }];
    assert.equal(fantasyCombatPath(s, s.fighters[0], { x: 2, y: 3 })?.length === 3, direct);
  }
});
test('rear ranged enemies deal real damage through low cover and solid obstacles block their shot', () => {
  const open = battle('human', 'warrior', true); open.fighters[0].tile = { x: 2, y: 3 }; open.fighters[1].tile = { x: 8, y: 3 };
  open.battlefield!.obstacles = []; open.fighters[1].stats.accuracy = 100; open.fighters[1].stats.agility = 100; open.fighters[0].stats.agility = 0; open.fighters[0].stats.defense = 0;
  const covered = structuredClone(open), blocked = structuredClone(open);
  covered.battlefield!.obstacles = [{ kind: 'low-wall', tile: { x: 3, y: 3 } }];
  blocked.battlefield!.obstacles = [{ kind: 'boulder', tile: { x: 4, y: 3 } }];
  const a = advanceFantasyCombat(open, open.deadline).state, b = advanceFantasyCombat(covered, covered.deadline).state, c = advanceFantasyCombat(blocked, blocked.deadline).state;
  assert.ok(a.fighters[0].hp < open.fighters[0].hp); assert.ok(b.fighters[0].hp > a.fighters[0].hp);
  assert.equal(c.fighters[0].hp, blocked.fighters[0].hp); assert.notDeepEqual(c.fighters[1].tile, { x: 4, y: 3 });
});
test('partial obstacle hits preserve damage and accurate logs after JSON reload', () => {
  const s = battle(); s.fighters[0].tile = { x: 0, y: 3 }; s.fighters[1].tile = { x: 9, y: 3 };
  s.fighters[0].stats.attack = 1; s.fighters[0].stats.accuracy = 100;
  s.battlefield!.obstacles = [{ kind: 'thick-vine', tile: { x: 1, y: 3 } }];
  const r = submitFantasyCombatOrder(s, 'owner', 0, { type: 'break', tile: { x: 1, y: 3 } }, 12);
  assert.equal(r.error, undefined); assert.equal(r.state.battlefield!.obstacles![0].hp, 5);
  assert.ok(r.state.logs.some(log => log.roll && log.text.en.includes('Thick Vines') && !log.text.en.includes('destroyed')));
  assert.ok(validFantasyCombatState(JSON.parse(JSON.stringify(r.state))));
});
