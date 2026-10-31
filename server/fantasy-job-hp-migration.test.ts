import test, { type TestContext } from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import { FantasyStore } from './fantasy-store.ts';
import { applyFantasyAction, fantasyStats, fantasyUnscaledMaxHp, newFantasyProfile } from '../shared/fantasy-engine.ts';
import { fantasyJobHpMultiplier } from '../shared/fantasy-job-balance.ts';
import { beginFantasyDowned } from '../shared/fantasy-downed.ts';
import { recordFantasyDeath } from '../shared/fantasy-mortality.ts';
import { createFantasyCombat, validFantasyCombatState } from '../shared/fantasy-combat.ts';
import { fantasyCombatPlayer } from './fantasy-combat-adapter.ts';
import type { FantasyProfile } from '../shared/fantasy.ts';

function person() { return applyFantasyAction(newFantasyProfile(), { type: 'create', source: 'human', gender: 'female', name: 'HP migration' }, () => .5).profile; }
function fixture(t: TestContext) {
  const dir = fs.mkdtempSync(path.join(os.tmpdir(), 'fantasy-job-hp-'));
  t.after(() => { assert.equal(path.dirname(path.resolve(dir)), path.resolve(os.tmpdir())); assert.ok(path.basename(dir).startsWith('fantasy-job-hp-')); fs.rmSync(dir, { recursive: true, force: true }); });
  const file = path.join(dir, 'fantasy.json');
  return (profile: FantasyProfile, world?: { profiles: Record<string, FantasyProfile>; combats: Record<string, unknown> }) => {
    const bytes = JSON.stringify(world ? { version: 2, ...world } : { owner: profile }); fs.writeFileSync(file, bytes); let writes = 0; const errors: unknown[] = [];
    const store = new FantasyStore(file, { combatEnabled: true, worldHour: () => profile.character!.hour, onError: error => { errors.push(error); }, save: (target, value) => { writes++; fs.writeFileSync(target, value); } });
    return { store, file, bytes, writes: () => writes, errors };
  };
}

test('new characters record the current HP formula and modern over-max HP is rejected unchanged', t => {
  const p = person(), c = p.character!;
  assert.equal((c as unknown as Record<string, unknown>).jobHpVersion, 1);
  c.hp = fantasyStats(c).hp + 1;
  const saved = fixture(t)(p); assert.ok(saved.store.loadError);
  assert.equal(saved.store.apply('owner', p.revision, { type: 'rest' }).changed, false);
  assert.equal(saved.writes(), 0); assert.equal(fs.readFileSync(saved.file, 'utf8'), saved.bytes);
});

test('unknown HP formula versions are rejected without normalizing their contents', t => {
  for (const version of [0, 2, null, '1', true]) {
    const p = person(); (p.character as unknown as Record<string, unknown>).jobHpVersion = version;
    const saved = fixture(t)(p); assert.ok(saved.store.loadError, String(version));
    assert.equal(saved.writes(), 0); assert.equal(fs.readFileSync(saved.file, 'utf8'), saved.bytes);
  }
});

test('plausible historical job HP migrates once without healing and oversized legacy HP remains rejected', t => {
  const load = fixture(t);
  const historical: Record<string, number> = { pugilist: 1.3, knight: 1.35, shieldbearer: 1.45 };
  for (const job of ['mage', 'archer', 'pugilist', 'knight', 'shieldbearer', 'warrior', 'cook', 'merchant']) {
    const p = person(), c = p.character!; c.job = job; c.jobXp[job] = 300; c.level = 20;
    c.inventory['wolf-armor'] = 1; c.equipment = { ...c.equipment, armor: 'wolf-armor' };
    const current = fantasyStats(c), raw = fantasyUnscaledMaxHp(c);
    const cap = Math.max(20, Math.round(raw * Math.max(1, historical[job] ?? 1, fantasyJobHpMultiplier(job))));
    assert.equal(current.hp, Math.max(20, Math.round(raw * fantasyJobHpMultiplier(job))));
    c.mp = current.mp; delete c.jobHpVersion; c.hp = cap;
    const migrated = load(p); assert.equal(migrated.store.loadError, undefined, job);
    const restored = migrated.store.profile('owner').character!;
    if (job === 'cook' || job === 'merchant') {
      assert.equal(restored.job, 'unassigned'); assert.equal(restored.lifeJob, job); assert.equal(restored.jobXp[job], 300);
    }
    assert.equal(restored.hp, Math.min(cap, current.hp, fantasyStats(restored).hp), job);
    assert.equal(migrated.store.profile('owner').character!.jobHpVersion, 1); assert.equal(migrated.writes(), 1);
    const stored = fs.readFileSync(migrated.file, 'utf8');
    const reloaded = new FantasyStore(migrated.file, { combatEnabled: true, worldHour: () => c.hour, onError: () => {} });
    assert.equal(reloaded.loadError, undefined); assert.deepEqual(reloaded.profile('owner'), migrated.store.profile('owner'));
    assert.equal(fs.readFileSync(migrated.file, 'utf8'), stored);
    c.hp = 17; const wounded = load(p); assert.equal(wounded.store.loadError, undefined, job); assert.equal(wounded.store.profile('owner').character!.hp, 17, job);
    c.hp = cap + 1; const invalid = load(p); assert.ok(invalid.store.loadError, job); assert.equal(invalid.writes(), 0); assert.equal(fs.readFileSync(invalid.file, 'utf8'), invalid.bytes);
  }
});

test('legacy zero HP and downed or dead state survives HP migration without encounter-rating a living fighter', t => {
  const load = fixture(t);
  for (const kind of ['downed', 'dead'] as const) {
    const p = person(), c = p.character!; c.hp = 0; delete c.jobHpVersion;
    if (kind === 'downed') beginFantasyDowned(p, c.hour); else recordFantasyDeath(p, 'legacy death');
    const before = structuredClone(p), migrated = load(p); assert.equal(migrated.store.loadError, undefined, kind);
    const saved = migrated.store.profile('owner'); assert.equal(saved.character!.hp, 0); assert.equal(saved.character!.jobHpVersion, 1);
    assert.deepEqual(saved.character!.downed, before.character!.downed); assert.deepEqual(saved.death, before.death);
  }
});

test('an active legacy battle refreshes a downed caster maximum without resurrecting or detaching them', t => {
  const p = person(), ally = person(), c = p.character!;
  c.job = 'mage'; c.jobXp.mage = 300; c.level = 20; c.location = ally.character!.location = 'greenwood'; c.visited.push('greenwood'); ally.character!.visited.push('greenwood');
  c.hp = fantasyUnscaledMaxHp(c); c.mp = fantasyStats(c).mp; delete c.jobHpVersion;
  const caster = fantasyCombatPlayer(p, 'owner'); caster.stats.hp = caster.hp = c.hp;
  const state = createFantasyCombat({ id: 'legacy-hp-battle', source: 'hunt:monster-forest-wolf', location: 'greenwood', players: [caster, fantasyCombatPlayer(ally, 'ally')], enemies: [{ id: 'enemy', template: 'monster-forest-wolf' }], seed: 1, hour: c.hour });
  c.hp = state.fighters.find(fighter => fighter.userId === 'owner')!.hp = 0; beginFantasyDowned(p, c.hour);
  state.orders.ally = { type: 'guard' };
  p.combatId = ally.combatId = state.id; assert.ok(validFantasyCombatState(state));
  const before = structuredClone(c.downed), saved = fixture(t)(p, { profiles: { owner: p, ally }, combats: { [state.id]: { state, session: 'test' } } });
  assert.equal(saved.store.loadError, undefined, saved.errors.map(String).join('\n'));
  const loaded = saved.store.profile('owner'), battle = saved.store.combat('owner', 'test')!;
  assert.equal(loaded.character!.hp, 0); assert.deepEqual(loaded.character!.downed, before); assert.equal(loaded.combatId, state.id);
  const downed = battle.fighters.find(fighter => fighter.userId === 'owner')!;
  assert.equal(downed.hp, 0); assert.equal(downed.stats.hp, fantasyStats(loaded.character!).hp);
  assert.deepEqual(downed.skills, state.fighters.find(fighter => fighter.userId === 'owner')!.skills);
  assert.equal(downed.mp, c.mp); assert.equal(battle.seed, state.seed); assert.equal(battle.round, state.round); assert.deepEqual(battle.orders, state.orders);
  const bytes = fs.readFileSync(saved.file, 'utf8'), reloaded = new FantasyStore(saved.file, { combatEnabled: true, worldHour: () => c.hour, onError: () => {} });
  assert.equal(reloaded.loadError, undefined); assert.deepEqual(reloaded.profile('owner'), loaded); assert.deepEqual(reloaded.combat('owner', 'test'), battle);
  assert.equal(fs.readFileSync(saved.file, 'utf8'), bytes);
});
