import test from 'node:test';
import assert from 'node:assert/strict';
import { fantasyCombatPlayer } from '../server/fantasy-combat-adapter.ts';
import { benchmarkDamageForecast } from '../scripts/fantasy-balance-fixtures.ts';
import { applyFantasyAction, fantasyStats, newFantasyProfile } from './fantasy-engine.ts';
import { fantasyEquipGear } from './fantasy-equipment.ts';
import { createFantasyCombat, submitFantasyCombatOrder, validFantasyCombatState } from './fantasy-combat.ts';

function bodyPlayer(race: string, job: string) {
  const profile = applyFantasyAction(newFantasyProfile(), { type: 'create', source: 'human', name: 'Body dispatch', gender: 'female' }, () => .5).profile;
  const c = profile.character!;
  c.race = race; c.job = job; c.level = 10; c.jobXp = { [job]: 100 };
  c.fatigue = c.hunger = 0; c.hour = 108;
  c.inventory = {}; c.equipment = {}; c.equippedGear = {}; c.gear = [];
  const weapon = job === 'priest' ? 'sacred-book' : ['mage', 'summoner'].includes(job) ? 'mana-staff' : job === 'archer' ? 'oak-bow' : 'steel-sword';
  c.inventory[weapon] = 1;
  assert.equal(fantasyEquipGear(c, weapon), undefined);
  const stats = fantasyStats(c); c.hp = stats.hp; c.mp = stats.mp;
  return fantasyCombatPlayer(profile, 'reference');
}

test('caster equipment cannot turn anatomical melee attacks into magic damage', () => {
  for (const job of ['mage', 'priest', 'summoner', 'warrior', 'knight', 'archer']) {
    for (const race of ['rabbitkin', 'elf', 'orc', 'catkin']) {
      const player = bodyPlayer(race, job);
      const physical = player.skills.filter(skill => skill.id.startsWith('body-') && skill.range === 'melee');
      assert.ok(physical.length, `${race} ${job} must expose physical body attacks`);
      for (const skill of physical) assert.equal(skill.magic, false, `${race} ${job} ${skill.id}`);
    }
    const kick = bodyPlayer('rabbitkin', job).skills.find(skill => skill.id === 'body-spring-kick')!;
    assert.equal(kick.names.en, 'Spring Kick');
    assert.equal(kick.mp, 8);
    assert.equal(kick.power, 9);
    assert.equal(kick.range, 'melee');
    assert.equal(kick.reach, 3);
    assert.equal(kick.shape, 'single');
    assert.deepEqual(kick.motion, { kind: 'advance', distance: 2 });
    assert.deepEqual(kick.hitUtility, { id: 'weaken', power: 1, chance: .35 });
  }
});

test('authored magical body techniques and elemental breaths stay magical for every weapon role', () => {
  for (const job of ['mage', 'priest', 'summoner', 'warrior', 'archer']) {
    for (const [race, id] of [['birdkin', 'body-wing-gust'], ['tideborn', 'body-tidal-lance'], ['dryad', 'body-root-lash'], ['voidborn', 'body-ether-needle'], ['dragonblood', 'dragonblood-flame'], ['true-dragon', 'true-dragon-roar']]) {
      const skill = bodyPlayer(race, job).skills.find(skill => skill.id === id);
      assert.ok(skill, `${race} ${job} ${id}`);
      assert.equal(skill.magic, true, `${race} ${job} ${id}`);
      assert.equal(skill.range, 'magic');
      if (id.endsWith('flame') || id.endsWith('roar')) {
        assert.equal(skill.damageType, 'fire');
        assert.equal(skill.shape, 'cone');
      }
    }
    assert.equal(bodyPlayer('stoneborn', job).skills.find(skill => skill.id === 'body-mineral-pulse')!.magic, false);
  }
});

test('caster kicks use physical defense in both damage forecasts and actual combat', () => {
  for (const job of ['mage', 'priest', 'summoner', 'warrior', 'archer']) {
    let hits = 0;
    for (let seed = 1; seed <= 8; seed++) {
      const player = bodyPlayer('rabbitkin', job);
      const state = createFantasyCombat({ id: 'body-dispatch', location: 'hearth', source: 'audit:body-dispatch', hour: 108, seed, tactical: true,
        players: [player], enemies: [{ id: 'foe', template: 'human-order-knight' }] });
      const actor = state.fighters.find(f => f.userId === 'reference')!, target = state.fighters.find(f => f.side === 'enemies')!;
      actor.tile = { x: 4, y: 3 }; target.tile = { x: 5, y: 3 };
      target.hp = target.stats.hp = 100000; target.mp = target.stats.mp = 0;
      target.stats.defense = 20; target.stats.magicResist = 80; target.stats.agility = 0; target.stats.attack = 0; target.skills = [];
      const skill = actor.skills.find(skill => skill.id === 'body-spring-kick')!;
      const forecast = benchmarkDamageForecast(state, actor, target, skill);
      const physical = actor.stats.attack + skill.power - 14;
      assert.equal(forecast.magic, false, job);
      assert.equal(forecast.normal, Math.max(1, Math.round(physical)), job);
      const result = submitFantasyCombatOrder(state, 'reference', state.revision, { type: 'skill', skill: skill.id, target: target.id }, state.hour);
      assert.equal(result.error, undefined);
      assert.ok(validFantasyCombatState(result.state));
      const attack = result.state.logs.find(log => log.presentation?.actor === actor.id && log.presentation.skill === skill.id && log.roll);
      assert.ok(attack?.roll);
      const dealt = target.hp - result.state.fighters.find(f => f.id === target.id)!.hp;
      const expected = attack.roll.success ? attack.roll.value === 20 ? forecast.critical : forecast.normal : 0;
      assert.equal(dealt, expected, `${job} seed ${seed}`);
      assert.equal(result.state.fighters.find(f => f.id === actor.id)!.mp, actor.mp - (dealt ? 8 : 0), `${job} keeps the kick's hit-only MP cost`);
      if (dealt) hits++;
    }
    assert.ok(hits, `${job} must exercise successful physical damage`);
  }
});
