import test from 'node:test';
import assert from 'node:assert/strict';
import { createFantasyPartyCombatSnapshot, nextFantasyPartyCombatWave, fantasyPartyCombatScale, scaleFantasyPartyEnemy, fantasyPartyRewardEligibility,
  FANTASY_PARTY_MAX_PLAYERS, FANTASY_PARTY_SCALING, type FantasyPartyCombatRosterMember, type FantasyPartyCombatSnapshot } from './fantasy-party-balance.ts';

const member = (playerId: string, extra: Partial<FantasyPartyCombatRosterMember> = {}): FantasyPartyCombatRosterMember => ({ playerId, kind: 'player', participation: 'engaged', hp: 100, ...extra });
const roster = (count: number) => Array.from({ length: count }, (_, index) => member(`player-${index + 1}/life-1`));
const snapshot = (count = 1) => createFantasyPartyCombatSnapshot({ combatId: 'future-battle', wave: 1, roster: roster(count) });

test('only actual living engaged players count, with duplicate connections counted once', () => {
  const entries = [member('a'), member('a', { hp: 40 }), member('b'), member('dead', { hp: 0 }), member('waiting', { participation: 'waiting' }),
    member('watcher', { participation: 'spectator' }), member('helper-npc', { kind: 'npc' }), member('summoned', { kind: 'summon' })];
  const before = structuredClone(entries), value = createFantasyPartyCombatSnapshot({ combatId: 'b', wave: 1, roster: entries });
  assert.deepEqual(value.participantIds, ['a', 'b']); assert.deepEqual(entries, before);
  assert.equal(fantasyPartyCombatScale(value, 'boss').players, 2);
  const spoofed = { combatId: 'b', wave: 1, roster: [member('a')], playerCount: 6, partyCapacity: 6 };
  assert.equal(fantasyPartyCombatScale(createFantasyPartyCombatSnapshot(spoofed), 'boss').players, 1);
});

test('zero participants, more than six and inconsistent duplicate states fail instead of silently weakening combat', () => {
  assert.equal(FANTASY_PARTY_MAX_PLAYERS, 6); assert.equal(snapshot(6).participantIds.length, 6);
  for (const entries of [[], [member('dead', { hp: 0 })], [member('waiting', { participation: 'waiting' })], roster(7)]) {
    assert.throws(() => createFantasyPartyCombatSnapshot({ combatId: 'b', wave: 1, roster: entries }), RangeError);
  }
  assert.throws(() => createFantasyPartyCombatSnapshot({ combatId: 'b', wave: 1, roster: [member('a'), member('a', { hp: 0 })] }), /Conflicting/);
  assert.throws(() => createFantasyPartyCombatSnapshot({ combatId: 'b', wave: 1, roster: [member('a'), member('a', { participation: 'spectator' })] }), /Conflicting/);
  assert.throws(() => createFantasyPartyCombatSnapshot({ combatId: 'b', wave: 1, roster: [member('a', { hp: NaN })] }), TypeError);
});

test('all enemy ranks preserve the one-player baseline and scale distinctly below linear HP growth', () => {
  const ranks = ['normal', 'elite', 'boss'] as const;
  for (const rank of ranks) {
    const one = fantasyPartyCombatScale(snapshot(), rank);
    assert.equal(one.hpMultiplier, 1); assert.equal(one.damageMultiplier, 1);
    let previousHp = 1, previousDamage = 1;
    for (let count = 2; count <= 6; count++) {
      const scale = fantasyPartyCombatScale(snapshot(count), rank);
      assert.ok(scale.hpMultiplier > previousHp && scale.hpMultiplier < count);
      assert.ok(scale.damageMultiplier >= previousDamage && scale.damageMultiplier <= 1.4);
      assert.equal(scale.enemyActionMultiplier, 1);
      previousHp = scale.hpMultiplier; previousDamage = scale.damageMultiplier;
    }
  }
  const six = ranks.map(rank => fantasyPartyCombatScale(snapshot(6), rank));
  assert.ok(six[0].hpMultiplier < six[1].hpMultiplier && six[1].hpMultiplier < six[2].hpMultiplier);
  assert.ok(six[0].damageMultiplier < six[1].damageMultiplier && six[1].damageMultiplier < six[2].damageMultiplier);
  assert.equal(six[2].hpMultiplier, 4.75); assert.equal(six[2].damageMultiplier, 1.4);
});

test('snapshot and policy are immutable and roster changes cannot reduce an ongoing wave', () => {
  const entries = roster(6), value = createFantasyPartyCombatSnapshot({ combatId: 'locked', wave: 1, roster: entries });
  const before = fantasyPartyCombatScale(value, 'boss');
  entries.splice(1); entries[0].hp = 0;
  assert.deepEqual(fantasyPartyCombatScale(value, 'boss'), before);
  assert.equal(value.participantIds.length, 6);
  assert.ok(Object.isFrozen(value) && Object.isFrozen(value.participantIds));
  assert.throws(() => (value.participantIds as string[]).pop(), TypeError);
  assert.ok(Object.isFrozen(FANTASY_PARTY_SCALING.boss.hp));
  assert.throws(() => (FANTASY_PARTY_SCALING.boss.hp as number[]).push(0), TypeError);
});

test('reinforcements and departures affect only a new wave and cannot rewrite the old snapshot', () => {
  const previous = snapshot(2), saved = structuredClone(previous);
  const next = nextFantasyPartyCombatWave(previous, { completedWave: 1, roster: [member('player-1/life-1'), member('new'), member('next-waiter', { participation: 'waiting' })] });
  assert.equal(next.wave, 2); assert.equal(next.combatId, previous.combatId); assert.deepEqual(next.participantIds, ['new', 'player-1/life-1']);
  assert.deepEqual(previous, saved); assert.equal(fantasyPartyCombatScale(previous, 'boss').players, 2);
  assert.throws(() => nextFantasyPartyCombatWave(previous, { completedWave: 0, roster: roster(3) }), /completed/);
  assert.throws(() => nextFantasyPartyCombatWave(previous, { completedWave: 2, roster: roster(3) }), /completed/);
});

test('scaling modifies HP and per-hit damage but leaves bounded template actions unchanged', () => {
  const base = { maxHp: 200, damage: 25, actionsPerRound: 2 as const }, saved = structuredClone(base);
  assert.deepEqual(scaleFantasyPartyEnemy(base, snapshot(), 'boss'), base);
  assert.deepEqual(scaleFantasyPartyEnemy(base, snapshot(6), 'boss'), { maxHp: 950, damage: 35, actionsPerRound: 2 });
  for (let count = 1; count <= 6; count++) assert.equal(scaleFantasyPartyEnemy(base, snapshot(count), 'elite').actionsPerRound, 2);
  assert.deepEqual(base, saved);
  assert.equal(scaleFantasyPartyEnemy({ maxHp: 3, damage: 0, actionsPerRound: 1 }, snapshot(2), 'normal').damage, 0);
  assert.throws(() => scaleFantasyPartyEnemy({ ...base, actionsPerRound: 99 as 2 }, snapshot(), 'boss'), TypeError);
  assert.throws(() => scaleFantasyPartyEnemy({ ...base, maxHp: 0 }, snapshot(), 'normal'), TypeError);
  assert.throws(() => scaleFantasyPartyEnemy({ ...base, maxHp: Number.MAX_SAFE_INTEGER }, snapshot(6), 'boss'), RangeError);
});

test('forged snapshot counts, duplicate participant IDs and invalid ranks are rejected', () => {
  const value = snapshot();
  for (const forged of [{ ...value, playerCount: 6 }, { ...value, participantIds: ['a', 'a'] }, { ...value, participantIds: [] }, { ...value, balancePolicy: 'unknown' }]) {
    assert.throws(() => fantasyPartyCombatScale(forged as FantasyPartyCombatSnapshot, 'normal'), TypeError);
  }
  assert.throws(() => fantasyPartyCombatScale(value, 'mythic' as 'boss'), TypeError);
});

test('personal reward eligibility recognizes support and fallen contributors, excludes waiting, AFK and early leavers', () => {
  const value = createFantasyPartyCombatSnapshot({ combatId: 'reward', wave: 1, roster: [member('attacker'), member('healer'), member('guard'), member('afk'), member('leaver'), member('dead-before', { hp: 0 }), member('spectator', { participation: 'spectator' })] });
  const contributions = [
    { playerId: 'attacker', effectiveActions: 4, activeRounds: 5, exit: 'present' as const },
    { playerId: 'healer', effectiveActions: 2, activeRounds: 3, exit: 'present' as const },
    { playerId: 'guard', effectiveActions: 1, activeRounds: 1, exit: 'incapacitated' as const },
    { playerId: 'afk', effectiveActions: 0, activeRounds: 6, exit: 'present' as const },
    { playerId: 'leaver', effectiveActions: 1, activeRounds: 1, exit: 'left' as const },
    { playerId: 'dead-before', effectiveActions: 10, activeRounds: 6, exit: 'present' as const },
    { playerId: 'spectator', effectiveActions: 10, activeRounds: 6, exit: 'present' as const },
    { playerId: 'late-arrival', effectiveActions: 10, activeRounds: 6, exit: 'present' as const },
  ];
  const original = structuredClone(contributions);
  assert.deepEqual(fantasyPartyRewardEligibility(value, { outcome: 'victory', totalRounds: 6, contributions }), ['attacker', 'guard', 'healer']);
  for (const outcome of ['defeat', 'withdrawal'] as const) assert.deepEqual(fantasyPartyRewardEligibility(value, { outcome, totalRounds: 6, contributions }), []);
  assert.deepEqual(contributions, original);
  assert.deepEqual(fantasyPartyRewardEligibility(value, { outcome: 'victory', totalRounds: 6, contributions }), ['attacker', 'guard', 'healer']);
});

test('contribution ledgers cannot duplicate players, count future rounds or transfer a prior life participation', () => {
  const value = createFantasyPartyCombatSnapshot({ combatId: 'reward', wave: 1, roster: [member('same-user/life-1')] });
  const valid = { playerId: 'same-user/life-1', effectiveActions: 1, activeRounds: 1, exit: 'present' as const };
  assert.throws(() => fantasyPartyRewardEligibility(value, { outcome: 'victory', totalRounds: 1, contributions: [valid, valid] }), TypeError);
  assert.throws(() => fantasyPartyRewardEligibility(value, { outcome: 'victory', totalRounds: 1, contributions: [{ ...valid, activeRounds: 2 }] }), TypeError);
  assert.deepEqual(fantasyPartyRewardEligibility(value, { outcome: 'victory', totalRounds: 1, contributions: [{ ...valid, playerId: 'same-user/life-2' }] }), []);
});
