import test from 'node:test';
import assert from 'node:assert/strict';
import { applyFantasyAction, advanceFantasyWorld, fantasySkills, fantasyStats, fantasyTransports, newFantasyProfile, startFantasyActivity } from './fantasy-engine.ts';
import { applyFantasyPrayer } from './fantasy-prayer.ts';
import { fantasyPriestCombatSkill, fantasyPriestSkills, type FantasyPriestBranch } from './fantasy-priest-growth.ts';
import { fantasyCombatPlayer } from '../server/fantasy-combat-adapter.ts';
import { createFantasyCombat, fantasyCombatOrderError, submitFantasyCombatOrder, validFantasyCombatState, type FantasyCombatOrder, type FantasyCombatState } from './fantasy-combat.ts';

const active = { care: 'priest-care-mercy', ward: 'priest-ward-aegis', oath: 'priest-oath-clarity', pilgrim: 'priest-pilgrim-lantern' } as const;
function priest(branch: FantasyPriestBranch) {
  let p = applyFantasyAction(newFantasyProfile(), { type: 'create', source: 'human', name: 'Faith Keeper', gender: 'female' }, () => .99).profile;
  const c = p.character!; c.job = 'priest'; c.jobXp.priest = 30; c.hour = 12; c.gold = 500;
  c.visited = ['hearth', 'suncourt', 'greenwood']; c.readBooks = ['traveler-guide', 'remedies-and-rites', 'quiet-sword', 'words-and-promises']; c.quests = ['quest-herbalist']; c.inventory.herb = 3;
  p = applyFantasyAction(p, { type: 'priestVow', quest: 'quest-herbalist' }).profile;
  p = applyFantasyAction(p, { type: 'complete', quest: 'quest-herbalist' }).profile;
  for (let day = 1; day <= 4; day++) { p.character!.hour = day * 24 + 12; applyFantasyPrayer(p.character!); }
  const choice = applyFantasyAction(p, { type: 'priestBranch', branch }); assert.equal(choice.error, undefined); p = choice.profile;
  p.character!.hour = 108; p.character!.level = 10; p.character!.location = 'reedfen'; p.character!.visited.push('reedfen'); p.character!.inventory.lantern = 1;
  p.character!.hp = fantasyStats(p.character!).hp; p.character!.mp = fantasyStats(p.character!).mp; return p;
}
function warrior() {
  const p = applyFantasyAction(newFantasyProfile(), { type: 'create', source: 'human', name: 'Shield Companion', gender: 'male' }, () => .5).profile;
  p.character!.job = 'warrior'; p.character!.jobXp.warrior = 0; p.character!.level = 10; p.character!.hour = 108;
  p.character!.location = 'reedfen'; p.character!.visited.push('reedfen'); p.character!.inventory.lantern = 1;
  p.character!.hp = fantasyStats(p.character!).hp; p.character!.mp = fantasyStats(p.character!).mp; return p;
}
function battle(branch: FantasyPriestBranch, seed = 1) {
  const p = priest(branch), ally = warrior();
  const state = createFantasyCombat({ id: 'priest-engagement', location: 'reedfen', source: 'hunt:monster-marsh-troll', hour: 108, seed, tactical: true,
    players: [fantasyCombatPlayer(p, 'priest'), fantasyCombatPlayer(ally, 'ally')], enemies: [{ id: 'enemy', template: 'monster-marsh-troll' }] });
  state.fighters.find(f => f.side === 'enemies')!.tile = { x: 5, y: 2 };
  assert.equal(validFantasyCombatState(state), true);
  return { state, p, ally, healer: state.fighters.find(f => f.userId === 'priest')!, companion: state.fighters.find(f => f.userId === 'ally')! };
}
function round(state: FantasyCombatState, own: FantasyCombatOrder, ally: FantasyCombatOrder = { type: 'guard' }) {
  const first = submitFantasyCombatOrder(state, 'priest', state.revision, own, state.hour); assert.equal(first.error, undefined);
  const last = submitFantasyCombatOrder(first.state, 'ally', state.revision, ally, state.hour); assert.equal(last.error, undefined);
  assert.equal(validFantasyCombatState(last.state), true); return last.state;
}

test('four priest branches expose exactly their learned active and a distinct bounded combat role', () => {
  for (const branch of Object.keys(active) as (keyof typeof active)[]) {
    const p = priest(branch), actor = fantasyCombatPlayer(p, 'priest'), own = actor.skills.find(skill => skill.id === active[branch])!;
    assert.ok(own); assert.equal(own.kind, branch === 'care' ? 'heal' : branch === 'oath' ? 'focus' : 'guard');
    for (const other of Object.keys(active) as (keyof typeof active)[]) if (other !== branch) assert.ok(!actor.skills.some(skill => skill.id === active[other]));
    assert.equal(fantasyPriestSkills(p.character!).filter(skill => skill.kind === 'passive').length, 1);
    assert.ok(fantasyPriestCombatSkill(own.id, 999)!.power <= (branch === 'oath' ? 15 : 100));
  }
});

test('care heals a wounded ally using real MP, but rejects enemies, full HP and unavailable mana without changes', () => {
  const f = battle('care'), hp = f.companion.hp; f.companion.hp -= 60;
  const order: FantasyCombatOrder = { type: 'skill', skill: active.care, target: f.companion.id };
  assert.equal(fantasyCombatOrderError(f.state, 'priest', { ...order, target: 'enemy' }), 'target');
  const full = structuredClone(f.state); full.fighters.find(actor => actor.id === f.companion.id)!.hp = hp; assert.equal(fantasyCombatOrderError(full, 'priest', order), 'unnecessary');
  const empty = structuredClone(f.state); empty.fighters.find(actor => actor.id === f.healer.id)!.mp = 0; assert.equal(fantasyCombatOrderError(empty, 'priest', order), 'mana');
  const done = round(f.state, order), healer = done.fighters.find(actor => actor.id === f.healer.id)!, ally = done.fighters.find(actor => actor.id === f.companion.id)!;
  assert.equal(healer.mp, f.healer.mp - 12); assert.ok(ally.hp > hp - 60); assert.ok(healer.contribution.effectiveActions > 0);
  assert.ok(done.logs.some(log => log.text.en.includes('restores') && log.text.en.includes('Shield Companion')));
});

test('ward and pilgrim protection reduce real allied damage, expire each round and have different costs and powers', () => {
  const protection = [];
  for (const branch of ['ward', 'pilgrim'] as const) {
    let useful = 0;
    for (let seed = 1; seed <= 12; seed++) {
      const f = battle(branch, seed), baseline = round(structuredClone(f.state), { type: 'guard' });
      const done = round(f.state, { type: 'skill', skill: active[branch], target: f.companion.id });
      const actor = done.fighters.find(x => x.id === f.healer.id)!, ally = done.fighters.find(x => x.id === f.companion.id)!;
      const damageSaved = ally.hp - baseline.fighters.find(x => x.id === f.companion.id)!.hp;
      assert.ok(damageSaved >= 0); if (damageSaved > 0) useful++;
      assert.equal(actor.mp, f.healer.mp - (branch === 'ward' ? 10 : 6)); assert.equal(ally.ward, 0);
    }
    assert.ok(useful > 0, `${branch} never reduced incoming damage`);
    protection.push(fantasyCombatPlayer(priest(branch), 'priest').skills.find(s => s.id === active[branch])!.power);
  }
  assert.ok(protection[0] > protection[1]);
});

test('oath steadies an allied attack rather than damaging its recipient, and aid is one use with a short expiry', () => {
  const f = battle('oath'), initialEnemyHp = f.state.fighters.find(x => x.id === 'enemy')!.hp;
  const stored = round(f.state, { type: 'skill', skill: active.oath, target: f.companion.id });
  const ally = stored.fighters.find(x => x.id === f.companion.id)!, healer = stored.fighters.find(x => x.id === f.healer.id)!;
  assert.ok(ally.aim); assert.equal(ally.aim!.bonus, 10); assert.equal(healer.mp, f.healer.mp - 8);
  assert.equal(stored.fighters.find(x => x.id === 'enemy')!.hp, initialEnemyHp);
  assert.equal(fantasyCombatOrderError(stored, 'priest', { type: 'skill', skill: active.oath, target: ally.id }), 'unnecessary');
  const used = round(stored, { type: 'guard' }, { type: 'attack', target: 'enemy' });
  assert.equal(used.fighters.find(x => x.id === ally.id)!.aim, undefined);
  const expired = round(stored, { type: 'guard' }); assert.equal(expired.fighters.find(x => x.id === ally.id)!.aim, undefined);
  assert.equal(expired.fighters.find(x => x.id === f.healer.id)!.mp, healer.mp);
});

test('oath support improves the actual D20 target at equal seeds and does not passively increase attack', () => {
  let improved = 0;
  for (let seed = 1; seed <= 8; seed++) {
    const f = battle('oath', seed), baseline = round(structuredClone(f.state), { type: 'guard' }, { type: 'attack', target: 'enemy' });
    const done = round(f.state, { type: 'skill', skill: active.oath, target: f.companion.id }, { type: 'attack', target: 'enemy' });
    const playerRoll = (state: FantasyCombatState) => state.logs.find(log => !!log.roll && (log.text.en.startsWith('Shield Companion →') || log.text.en.includes('evades Shield Companion')))?.roll;
    const a = playerRoll(baseline), b = playerRoll(done); assert.ok(a && b); assert.equal(b.value, a.value); assert.ok(b.target <= a.target); if (b.target < a.target) improved++;
  }
  assert.ok(improved > 0);
  const withPath = priest('oath'), plain = structuredClone(withPath); delete plain.character!.priestGrowth!.branch;
  assert.equal(fantasyCombatPlayer(withPath, 'priest').stats.attack, fantasyCombatPlayer(plain, 'priest').stats.attack);
});

test('priest guard passives affect actual defense while pilgrimage still shortens ordinary living-world travel', () => {
  const guard = priest('ward'), plain = structuredClone(guard); delete plain.character!.priestGrowth!.branch;
  assert.ok(fantasyCombatPlayer(guard, 'priest').stats.defense > fantasyCombatPlayer(plain, 'priest').stats.defense);
  const pilgrim = priest('pilgrim'); pilgrim.character!.location = 'hearth'; const ordinary = structuredClone(pilgrim); delete ordinary.character!.priestGrowth!.branch;
  let shorter = 0;
  for (const destination of ['suncourt', 'greenwood', 'oldwatch', 'emberhall', 'tidehaven']) {
    const a = fantasyTransports(pilgrim.character!, destination).find(route => route.id === 'carriage')!, b = fantasyTransports(ordinary.character!, destination).find(route => route.id === 'carriage')!;
    assert.ok(a.hours <= b.hours); if (a.hours < b.hours) shorter++;
  }
  assert.ok(shorter > 0, 'Pilgrim travel benefit never survives the normal travel rounding');
  const gateA = fantasyTransports(pilgrim.character!, 'suncourt').find(route => route.id === 'gate')!, gateB = fantasyTransports(ordinary.character!, 'suncourt').find(route => route.id === 'gate')!;
  assert.equal(gateA.hours, gateB.hours);
});

test('outside combat, prepared wards cannot stack, full healing cannot train, and MP recovery still waits for rest', () => {
  let p = priest('ward'), mp = p.character!.mp; const cast = applyFantasyAction(p, { type: 'skill', skill: active.ward }); assert.equal(cast.error, undefined); p = cast.profile;
  assert.equal(p.character!.mp, mp - 10); const snapshot = structuredClone(p);
  const repeated = applyFantasyAction(p, { type: 'skill', skill: active.ward }); assert.ok(repeated.error); assert.deepEqual(repeated.profile, snapshot);
  assert.equal(p.character!.skillXp?.[active.ward] ?? 0, 0);
  const begun = startFantasyActivity(p, { type: 'rest' }, p.character!.hour, () => .99); assert.equal(begun.error, undefined);
  assert.equal(begun.profile.activity!.endsAt - begun.profile.activity!.startedAt, 8);
  assert.equal(advanceFantasyWorld(begun.profile, p.character!.hour + 4).profile.character!.mp, p.character!.mp);
  const care = priest('care'), before = structuredClone(care); assert.ok(applyFantasyAction(care, { type: 'skill', skill: active.care }).error); assert.deepEqual(care, before);
  care.character!.hp = 1; let used = 0;
  for (let attempt = 0; attempt < 20; attempt++) { const result = applyFantasyAction(care, { type: 'skill', skill: active.care }); if (result.error) break; Object.assign(care, result.profile); used++; }
  assert.ok(used > 0 && used <= Math.floor(before.character!.mp / 12)); assert.ok(care.character!.mp < before.character!.mp);
  assert.ok(fantasySkills(care.character!).some(skill => skill.id === active.care));
});

test('repeated combat wards consume a finite mana reserve and never persist as a free stacked barrier', () => {
  const f = battle('ward', 6); let state = f.state, casts = 0;
  const available = Math.floor(f.healer.mp / 10);
  while (state.status === 'active' && casts < available) {
    state = round(state, { type: 'skill', skill: active.ward, target: f.companion.id }); casts++;
    assert.equal(state.fighters.find(actor => actor.id === f.healer.id)!.mp, f.healer.mp - casts * 10);
    assert.equal(state.fighters.find(actor => actor.id === f.companion.id)!.ward, 0);
  }
  assert.equal(casts, available); assert.equal(state.status, 'active');
  const before = structuredClone(state), exhausted = submitFantasyCombatOrder(state, 'priest', state.revision, { type: 'skill', skill: active.ward, target: f.companion.id }, state.hour);
  assert.equal(exhausted.error, 'mana'); assert.deepEqual(exhausted.state, before);
});

test('oath’s living-world art really improves an intelligence investigation and trains only after use', () => {
  let p = priest('oath'); p.character!.location = 'hearth'; p = applyFantasyAction(p, { type: 'accept', quest: 'main-night-01' }).profile;
  p.character!.location = 'oldwatch'; p.character!.visited.push('oldwatch');
  const baseline = structuredClone(p), action = { type: 'investigate', quest: 'main-night-01', approach: 'analyze' } as const;
  const before = p.character!.mp, cast = applyFantasyAction(p, { type: 'skill', skill: active.oath }); assert.equal(cast.error, undefined);
  assert.equal(cast.profile.character!.mp, before - 8); assert.equal(cast.profile.character!.skillXp?.[active.oath] ?? 0, 0);
  const plain = applyFantasyAction(baseline, action, () => .5), strengthened = applyFantasyAction(cast.profile, action, () => .5);
  assert.equal(plain.error, undefined); assert.equal(strengthened.error, undefined);
  const modifier = (logs: typeof plain.profile.log) => Number(logs.findLast(log => /補正[+-]\d+、合計/.test(log.text))!.text.match(/補正([+-]\d+)/)![1]);
  assert.ok(modifier(strengthened.profile.log) > modifier(plain.profile.log)); assert.equal(strengthened.profile.character!.buff, null);
  assert.ok(strengthened.profile.character!.skillXp![active.oath] > 0);
});

test('unused oath focus gives no training receipt, and the ally’s later attack spends its receipt once', () => {
  const f = battle('oath'); const first = submitFantasyCombatOrder(f.state, 'priest', f.state.revision, { type: 'skill', skill: active.oath, target: f.companion.id }, f.state.hour);
  const held = submitFantasyCombatOrder(first.state, 'ally', f.state.revision, { type: 'guard' }, f.state.hour); assert.equal(held.error, undefined); assert.equal(held.usedSkills?.length ?? 0, 0);
  const defended = submitFantasyCombatOrder(held.state, 'priest', held.state.revision, { type: 'guard' }, held.state.hour);
  const hit = submitFantasyCombatOrder(defended.state, 'ally', held.state.revision, { type: 'attack', target: 'enemy' }, held.state.hour); assert.equal(hit.error, undefined);
  assert.deepEqual(hit.usedSkills, [{ userId: 'priest', skill: active.oath, mp: 8 }]);
  assert.equal(hit.state.fighters.find(actor => actor.id === f.healer.id)!.mp, f.healer.mp - 8);
  const duplicate = submitFantasyCombatOrder(hit.state, 'priest', held.state.revision, { type: 'guard' }, hit.state.hour); assert.equal(duplicate.error, 'stale'); assert.equal(duplicate.usedSkills?.length ?? 0, 0);
});
