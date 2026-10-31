import test, { type TestContext } from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import { FantasyStore, type FantasyCombatPlan } from './fantasy-store.ts';
import { applyFantasyAction, fantasyStats, newFantasyProfile } from '../shared/fantasy-engine.ts';
import { FANTASY_JOBS, FANTASY_QUESTS } from '../shared/fantasy-data.ts';
import { applyFantasyPriestAction, fantasyPriestServiceQuest, syncFantasyPriestGrowth } from '../shared/fantasy-priest-growth.ts';
import { fantasyOccultAction, fantasyOccultDungeonClaim } from '../shared/fantasy-occult.ts';
import { fantasyCombatEnemy } from '../shared/fantasy-combat-catalog.ts';
import { fantasyCombatStartPlan } from '../shared/fantasy-combat-challenges.ts';
import { fantasyEncounterFor } from '../shared/fantasy-encounters.ts';
import { validFantasyCombatState, type FantasyCombatState } from '../shared/fantasy-combat.ts';
import { beginFantasyDowned, validFantasyDowned } from '../shared/fantasy-downed.ts';
import type { FantasyProfile } from '../shared/fantasy.ts';
import { fantasyQuestRecordEligible } from '../shared/fantasy-access.ts';

function player(name: string): FantasyProfile {
  const p = applyFantasyAction(newFantasyProfile(), { type: 'create', source: 'human', gender: 'female', name }, () => .99).profile, c = p.character!;
  p.generation = 1; c.job = 'warrior'; c.jobXp.warrior = 0; c.level = 12; c.hour = 1000; c.location = 'greenwood'; c.visited = ['hearth', 'greenwood']; c.inventory.potion = 3; c.inventory.lantern = 1;
  c.hp = fantasyStats(c).hp; c.mp = fantasyStats(c).mp; return p;
}
function saint(): FantasyProfile {
  let p = player('Saint'); const c = p.character!; c.job = 'priest'; c.jobXp.priest = 300; c.gold = 1000;
  c.location = 'eclipsevault'; c.visited = ['hearth', 'suncourt', 'mooncity', 'eclipsevault', 'greenwood'];
  for (const job of ['baker', 'cook', 'alchemist', 'scout', 'pugilist', 'hunter']) c.jobXp[job] = 30;
  c.completed = FANTASY_QUESTS.filter(quest => fantasyPriestServiceQuest(quest.id) && fantasyQuestRecordEligible(c, quest)).slice(0, 20).map(quest => quest.id);
  c.readBooks = ['traveler-guide', 'remedies-and-rites', 'words-and-promises', 'rune-miracle']; c.lastPrayerDay = 9;
  c.skillXp = { [FANTASY_JOBS.find(job => job.id === 'priest')!.skills[0].id]: 100 }; syncFantasyPriestGrowth(c);
  c.unlockedSkills = FANTASY_JOBS.find(job => job.id === 'priest')!.skills.filter(skill => skill.unlock?.kind === 'mentor').map(skill => skill.id);
  c.priestGrowth!.prayerDays = Array.from({ length: 10 }, (_, day) => day); c.priestGrowth!.prayerTemples = Object.fromEntries(c.priestGrowth!.prayerDays.map(day => [String(day), 'hearth']));
  c.priestGrowth!.vows = c.completed.slice(0, 6).map((quest, index) => ({ quest, acceptedAt: 10 + index, hour: 20 + index, location: 'hearth', outcome: 'fulfilled' }));
  c.dungeon = { sites: { eclipsevault: { revealed: ['eclipsethrone'], inspected: [], findings: [], detected: [], disarmed: [], sprung: [], cleared: ['eclipsethrone'], claimed: ['eclipsethrone'], inspectionDays: {} } } };
  assert.deepEqual(fantasyOccultDungeonClaim(c, 'eclipsevault', 'eclipsethrone'), ['relic-priest-saint']);
  p = fantasyOccultAction(p, { type: 'occultRelic', relic: 'relic-priest-saint' })!.profile; p.character!.location = 'hearth';
  assert.equal(applyFantasyPriestAction(p.character!, { type: 'priestBranch', branch: 'saint' }).error, undefined);
  p.character!.miracles = { learned: ['miracle-rekindle', 'miracle-soul-anchor', 'miracle-sacred-severance'], prepared: [], failedPrayers: 0 };
  const prepared = applyFantasyAction(p, { type: 'miraclePrepare', miracles: ['miracle-rekindle', 'miracle-soul-anchor', 'miracle-sacred-severance'] }, () => .99);
  assert.equal(prepared.error, undefined); p = prepared.profile;
  assert.deepEqual(p.character!.miracles!.prepared, ['miracle-rekindle', 'miracle-soul-anchor', 'miracle-sacred-severance']);
  for (const id of p.character!.completed) assert.ok(fantasyQuestRecordEligible(p.character!, FANTASY_QUESTS.find(q=>q.id===id)!), id); p.character!.location = 'greenwood'; p.character!.hp = fantasyStats(p.character!).hp; p.character!.mp = fantasyStats(p.character!).mp; return p;
}
function fixture(t: TestContext, profiles: Record<string, FantasyProfile>) {
  const dir = fs.mkdtempSync(path.join(os.tmpdir(), 'fantasy-downed-combat-')); t.after(() => fs.rmSync(dir, { recursive: true, force: true }));
  const file = path.join(dir, 'fantasy.json'); fs.writeFileSync(file, JSON.stringify(profiles)); let hour = Math.max(...Object.values(profiles).map(p => p.character!.hour)), fail = false;
  const load = () => new FantasyStore(file, { combatEnabled: true, worldHour: () => hour, onError: () => {}, save: (target, text) => { if (fail) throw new Error('Test save failure'); fs.writeFileSync(target, text); } });
  let store = load(); assert.equal(store.loadError, undefined);
  const reload = () => { store = load(); assert.equal(store.loadError, undefined); };
  return { get store() { return store; }, file, reload, load, time: (at: number) => { hour = at; }, fail: (value: boolean) => { fail = value; } };
}
function start(t: TestContext) {
  const profiles = { a: player('Patient'), b: saint() }, encounter = fantasyEncounterFor('forest', 'travel-ambush', false).id;
  for (const profile of Object.values(profiles)) profile.event = encounter;
  const f = fixture(t, profiles);
  const plans: FantasyCombatPlan[] = ['a', 'b'].map(user => ({ user, session: 'same', generation: 1, location: 'greenwood', source: 'encounter', target: encounter }));
  // 職業ごとの遭遇等級が違っても、実際のパーティー開始と同じくリーダーの敵を共有する。
  const started = f.store.startCombat(plans, () => .5, { party: 'downed-test-party', session: 'same', leader: 'a' }); assert.equal(started.error, undefined);
  const leaderPlan = fantasyCombatStartPlan(f.store.profile('a'), 'encounter', encounter)!;
  assert.deepEqual(started.state!.fighters.filter(fighter => fighter.side === 'enemies').map(fighter => fighter.template), leaderPlan.enemies.map(enemy => enemy.template));
  const saved = JSON.parse(fs.readFileSync(f.file, 'utf8')), state: FantasyCombatState = saved.combats[started.state!.id].state;
  state.battlefield!.obstacles = []; state.fighters.find(f => f.userId === 'a')!.tile = { x: 4, y: 1 }; state.fighters.find(f => f.userId === 'b')!.tile = { x: 4, y: 3 }; state.fighters.find(f => f.side === 'enemies')!.tile = { x: 5, y: 1 };
  state.fighters.find(f => f.userId === 'a')!.hp = saved.profiles.a.character.hp = 1;
  assert.ok(validFantasyCombatState(state)); fs.writeFileSync(f.file, JSON.stringify(saved)); f.reload(); return { f, state: f.store.combat('a', 'same')! };
}
function down(t: TestContext) {
  const { f, state: first } = start(t); let state = first;
  for (let i = 0; i < 12 && state.fighters.find(f => f.userId === 'a')!.hp > 0; i++) {
    const a = f.store.combatOrder('a', 'same', state.id, state.revision, { type: 'guard' }); assert.equal(a.error, undefined);
    const b = f.store.combatOrder('b', 'same', state.id, state.revision, { type: 'guard' }); assert.equal(b.error, undefined); state = b.state!; f.time(state.hour);
  }
  assert.equal(state.status, 'active'); assert.equal(state.fighters.find(f => f.userId === 'a')!.hp, 0); return { f, state };
}

test('actual combat loss keeps a downed patient attached through save/reload and a saint miracle revives them atomically', t => {
  const { f, state } = down(t), patient = f.store.profile('a'); assert.equal(patient.character!.hp, 0); assert.ok(patient.character!.downed); assert.equal(patient.death, undefined); assert.equal(patient.combatId, state.id);
  f.reload(); assert.deepEqual(f.store.profile('a'), patient); assert.ok(f.store.combat('a', 'same')); assert.equal(f.store.combatOrder('a', 'same', state.id, state.revision, { type: 'guard' }).error, 'down');
  const cleric = f.store.profile('b'), target = state.fighters.find(f => f.userId === 'a')!.id;
  const result = f.store.combatOrder('b', 'same', state.id, state.revision, { type: 'skill', skill: 'miracle-rekindle', target }); assert.equal(result.error, undefined);
  assert.ok(f.store.profile('a').character!.hp > 0); assert.equal(f.store.profile('a').character!.downed, undefined); assert.equal(f.store.profile('a').combatId, state.id); assert.ok(f.store.profile('b').character!.mp < cleric.character!.mp);
  f.reload(); assert.ok(f.store.profile('a').character!.hp > 0); assert.equal(f.store.profile('a').character!.downed, undefined);
});

test('failed miracle save preserves downed HP, caster MP, potion stock and battle seed until one retry commits', t => {
  const { f, state } = down(t), before = fs.readFileSync(f.file, 'utf8'), a = f.store.profile('a'), b = f.store.profile('b');
  const order = { type: 'skill' as const, skill: 'miracle-rekindle', target: state.fighters.find(f => f.userId === 'a')!.id };
  f.fail(true); assert.equal(f.store.combatOrder('b', 'same', state.id, state.revision, order).error, 'save-failed'); assert.deepEqual(f.store.profile('a'), a); assert.deepEqual(f.store.profile('b'), b); assert.equal(fs.readFileSync(f.file, 'utf8'), before); assert.deepEqual(f.store.combat('a', 'same'), state);
  f.fail(false); const result = f.store.combatOrder('b', 'same', state.id, state.revision, order); assert.equal(result.error, undefined); assert.ok(f.store.profile('a').character!.hp > 0); assert.equal(f.store.profile('a').character!.inventory.potion, a.character!.inventory.potion); assert.equal(f.store.profile('b').character!.inventory.potion, b.character!.inventory.potion);
  const revived = f.store.profile('a'), caster = f.store.profile('b'); f.reload(); assert.deepEqual(f.store.profile('a'), revived); assert.deepEqual(f.store.profile('b'), caster);
  assert.equal(f.store.combatOrder('b', 'same', state.id, state.revision, order).error, 'stale'); assert.deepEqual(f.store.profile('b'), caster);
});

test('offline patients wake or expire on world ticks with no online users and persist the result', t => {
  for (const treated of [false, true]) {
    const p = player('Offline'); p.character!.location = 'eclipsevault'; p.character!.visited.push('eclipsevault'); p.character!.hp = 0; beginFantasyDowned(p, p.character!.hour);
    if (treated) { p.character!.downed!.treatedAt = p.character!.hour; p.character!.downed!.wakesAt = p.character!.hour + 2; }
    const f = fixture(t, { a: p }); f.time(p.character!.hour + (treated ? 2 : 6)); const updates = f.store.tick(new Set()); assert.ok(updates.some(update => update.user === 'a'));
    if (treated) { assert.ok(f.store.profile('a').character!.hp > 0); assert.equal(f.store.profile('a').death, undefined); } else assert.ok(f.store.profile('a').death);
    f.reload(); assert.equal(f.store.profile('a').character!.downed, undefined);
  }
});

test('a persisted active downed fighter cannot lose its profile combat membership silently', t => {
  const { f } = down(t), saved = JSON.parse(fs.readFileSync(f.file, 'utf8')); delete saved.profiles.a.combatId; fs.writeFileSync(f.file, JSON.stringify(saved)); assert.ok(f.load().loadError);
});

test('a downed treatment timestamp cannot be forged into the future', () => {
  const p = player('Patient'); p.character!.hp = 0; beginFantasyDowned(p, p.character!.hour); p.character!.downed!.treatedAt = p.character!.hour + 1; p.character!.downed!.wakesAt = p.character!.hour + 3;
  assert.equal(validFantasyDowned(p), false);
});



test('failed potion round while an ally is downed cannot duplicate healing or consume stock until commit', t => {
  const { f, state } = down(t), saved = JSON.parse(fs.readFileSync(f.file, 'utf8')), battle: FantasyCombatState = saved.combats[state.id].state;
  const cleric = battle.fighters.find(f => f.userId === 'b')!; cleric.hp -= 50; saved.profiles.b.character.hp = cleric.hp;
  fs.writeFileSync(f.file, JSON.stringify(saved)); f.reload(); const before = fs.readFileSync(f.file, 'utf8'), p = f.store.profile('b');
  const order = { type: 'item' as const, item: 'potion', target: cleric.id }; f.fail(true);
  assert.equal(f.store.combatOrder('b', 'same', state.id, state.revision, order).error, 'save-failed'); assert.deepEqual(f.store.profile('b'), p); assert.equal(fs.readFileSync(f.file, 'utf8'), before);
  f.fail(false); const result = f.store.combatOrder('b', 'same', state.id, state.revision, order); assert.equal(result.error, undefined);
  assert.ok(f.store.profile('b').character!.hp > p.character!.hp); assert.equal(f.store.profile('b').character!.inventory.potion, p.character!.inventory.potion - 1); assert.equal(f.store.profile('a').character!.hp, 0); assert.ok(f.store.profile('a').character!.downed);
  const committed = f.store.profile('b'); f.reload(); assert.deepEqual(f.store.profile('b'), committed); assert.equal(f.store.combatOrder('b', 'same', state.id, state.revision, order).error, 'stale'); assert.deepEqual(f.store.profile('b'), committed);
});

test('newly downed deadlines roll back on a failed world save and apply once on retry', t => {
  const p = player('Offline'); p.character!.location = 'eclipsevault'; p.character!.visited.push('eclipsevault'); p.character!.hp = 0; beginFantasyDowned(p, p.character!.hour);
  const f = fixture(t, { a: p }), before = fs.readFileSync(f.file, 'utf8'); f.time(p.character!.hour + 6); f.fail(true);
  assert.ok(f.store.tick(new Set()).some(update => !!update.error)); assert.equal(f.store.profile('a').death, undefined); assert.deepEqual(f.store.profile('a').character!.downed, p.character!.downed); assert.equal(fs.readFileSync(f.file, 'utf8'), before);
  f.fail(false); assert.ok(f.store.tick(new Set()).some(update => !update.error)); assert.ok(f.store.profile('a').death); assert.equal(f.store.profile('a').pastLives?.length, 1);
  f.store.tick(new Set()); assert.equal(f.store.profile('a').pastLives?.length, 1); f.reload(); assert.equal(f.store.profile('a').pastLives?.length, 1);
});

test('MP recovery commits once with real training and a shared cooldown, survives failure/reload, and hides the skill during cooldown', t => {
  const { f, state } = start(t), saved = JSON.parse(fs.readFileSync(f.file, 'utf8')), battle: FantasyCombatState = saved.combats[state.id].state;
  const caster = battle.fighters.find(f => f.userId === 'b')!, skill = caster.skills.find(skill => skill.kind === 'mana')!; assert.ok(skill);
  caster.mp -= 40; saved.profiles.b.character.mp = caster.mp; fs.writeFileSync(f.file, JSON.stringify(saved)); f.reload();
  const first = f.store.combatOrder('b', 'same', state.id, state.revision, { type: 'skill', skill: skill.id, target: caster.id }); assert.equal(first.error, undefined);
  const before = f.store.profile('b'), text = fs.readFileSync(f.file, 'utf8'); f.fail(true);
  assert.equal(f.store.combatOrder('a', 'same', state.id, state.revision, { type: 'guard' }).error, 'save-failed'); assert.deepEqual(f.store.profile('b'), before); assert.equal(fs.readFileSync(f.file, 'utf8'), text);
  f.fail(false); const result = f.store.combatOrder('a', 'same', state.id, state.revision, { type: 'guard' }); assert.equal(result.error, undefined);
  const after = f.store.profile('b'); assert.ok(after.character!.mp > before.character!.mp); assert.equal(after.character!.manaRecoveryAt, result.state!.hour); assert.ok((after.character!.skillXp?.[skill.id] ?? 0) > (before.character!.skillXp?.[skill.id] ?? 0));
  assert.equal(result.state!.fighters.find(f => f.userId === 'b')!.manaRecoveryUsed, true); assert.ok(!result.state!.fighters.find(f => f.userId === 'b')!.skills.some(skill => skill.kind === 'mana'));
  f.reload(); assert.deepEqual(f.store.profile('b'), after); assert.equal(f.store.combatOrder('a', 'same', state.id, state.revision, { type: 'guard' }).error, 'stale'); assert.deepEqual(f.store.profile('b'), after);
});

test('persisted downed state rejects null and primitive substitutes instead of treating them as absent', () => {
  for (const value of [null, 0, false, '']) { const p = player('Patient'); Object.assign(p.character!, { downed: value }); assert.equal(validFantasyDowned(p), false); }
});

test('a fallen contributor can level up from a genuine victory while remaining downed at HP0 through save and reload', t => {
  const { f, state: initial } = down(t), saved = JSON.parse(fs.readFileSync(f.file, 'utf8')), patient = saved.profiles.a.character;
  patient.xp = patient.level * 30 - 1; const level = patient.level;
  const fallen = (saved.combats[initial.id].state as FantasyCombatState).fighters.find(fighter => fighter.userId === 'a')!;
  assert.ok(fallen.contribution.effectiveActions > 0); assert.equal(fallen.hp, 0);
  // This is a reward/persistence boundary, so start the final real turn with an
  // injured adjacent opponent instead of depending on the saint winning a duel.
  const battle: FantasyCombatState = saved.combats[initial.id].state, cleric = battle.fighters.find(fighter => fighter.userId === 'b')!, opponent = battle.fighters.find(fighter => fighter.side === 'enemies')!;
  opponent.hp = 1; opponent.tile = { x: 5, y: 2 }; cleric.tile = { x: 4, y: 2 };
  cleric.hp = saved.profiles.b.character.hp = cleric.stats.hp;
  assert.ok(validFantasyCombatState(battle)); fs.writeFileSync(f.file, JSON.stringify(saved)); f.reload();
  let state = f.store.combat('b', 'same')!;
  for (let step = 0; step < 12 && state.status === 'active'; step++) {
    const enemy = state.fighters.find(fighter => fighter.side === 'enemies' && fighter.hp > 0)!;
    const result = f.store.combatOrder('b', 'same', state.id, state.revision, { type: 'attack', target: enemy.id }); assert.equal(result.error, undefined); state = result.state!; f.time(state.hour);
  }
  assert.equal(state.status, 'victory'); const after = f.store.profile('a'); assert.equal(after.character!.level, level + 1); assert.ok(after.character!.xp > 0);
  assert.equal(after.character!.hp, 0); assert.ok(after.character!.downed); assert.equal(after.death, undefined); assert.equal(after.combatId, undefined);
  f.reload(); assert.deepEqual(f.store.profile('a'), after); assert.equal(f.store.profile('a').character!.hp, 0); assert.ok(f.store.profile('a').character!.downed);
});


test('an active saved combat retains its enemy snapshot across catalog balance changes and continues after reload', t => {
  const profile = player('Legacy fighter'), encounter = fantasyEncounterFor('forest', 'travel-ambush', false).id;
  profile.event = encounter;
  const f = fixture(t, { a: profile });
  const started = f.store.startCombat([{ user: 'a', session: 'same', generation: 1, location: 'greenwood', source: 'encounter', target: encounter }], () => .5);
  assert.equal(started.error, undefined);
  const state = started.state!, enemy = state.fighters.find(fighter => fighter.side === 'enemies')!, template = fantasyCombatEnemy(enemy.template!)!;
  const beforeFile = fs.readFileSync(f.file, 'utf8'), previousStats = template.stats;
  try {
    // 実際に保存してから配信後のカタログ変更を再現し、保存中の敵を再生成しないことを確かめる。
    template.stats = { ...previousStats, hp: previousStats.hp + 17, attack: previousStats.attack + 3 };
    f.reload();
    assert.deepEqual(f.store.combat('a', 'same'), state);
    assert.equal(fs.readFileSync(f.file, 'utf8'), beforeFile);
    const result = f.store.combatOrder('a', 'same', state.id, state.revision, { type: 'guard' });
    assert.equal(result.error, undefined);
    assert.ok(result.state!.revision > state.revision);
    assert.deepEqual(result.state!.fighters.find(fighter => fighter.side === 'enemies')!.stats, enemy.stats);
    f.time(result.state!.hour); f.reload();
    assert.deepEqual(f.store.combat('a', 'same'), result.state);
  } finally { template.stats = previousStats; }
});
