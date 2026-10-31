import { test } from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import { FantasyStore } from './fantasy-store.ts';
import { applyFantasyAction, fantasyStats, newFantasyProfile } from '../shared/fantasy-engine.ts';
import { fantasyTestAcceptHunt } from './fantasy-test-combat-access.ts';
import { validFantasyCombatState, type FantasyCombatState } from '../shared/fantasy-combat.ts';
import { validFantasyCombatProgress } from '../shared/fantasy-combat-challenges.ts';
import { validFantasyPriestGrowth } from '../shared/fantasy-priest-growth.ts';

test('real shared combat healing commits its service proof once and survives a failed victory save and reload', t => {
  const directory = fs.mkdtempSync(path.join(os.tmpdir(), 'fantasy-clergy-proof-'));
  t.after(() => { assert.equal(path.dirname(path.resolve(directory)), path.resolve(os.tmpdir())); assert.ok(path.basename(directory).startsWith('fantasy-clergy-proof-')); fs.rmSync(directory, { recursive: true, force: true }); });
  const file = path.join(directory, 'world.json'), errors: unknown[] = []; let fail = false;
  const player = (name: string, job: string) => {
    const p = applyFantasyAction(newFantasyProfile(), { type: 'create', source: 'human', gender: 'female', name }, () => .5).profile, c = p.character!;
    Object.assign(c, { job, level: 40, location: 'greenwood', hour: 12 }); c.jobXp[job] = 0; c.visited.push('greenwood'); c.inventory.lantern = 1; c.hp = fantasyStats(c).hp; c.mp = fantasyStats(c).mp;
    return fantasyTestAcceptHunt(p);
  };
  fs.writeFileSync(file, JSON.stringify({ priest: player('Priest', 'priest'), ally: player('Ally', 'warrior') }));
  const options = { combatEnabled: true, worldHour: () => 12, onError: (error: unknown) => { errors.push(error); }, save: (target: string, data: string) => { if (fail) throw Error('disk full'); fs.writeFileSync(target, data); } };
  let store = new FantasyStore(file, options); assert.equal(store.loadError, undefined);
  const started = store.startCombat(['priest', 'ally'].map(user => ({ user, source: 'hunt' as const, target: 'monster-forest-wolf', session: 'same', generation: store.profile(user).generation ?? 1, location: 'greenwood' })), () => .5);
  assert.equal(started.error, undefined);
  const saved = JSON.parse(fs.readFileSync(file, 'utf8')), arranged: FantasyCombatState = saved.combats[started.state!.id].state;
  arranged.battlefield!.obstacles = []; arranged.battlefield!.blocked = [];
  arranged.fighters.find(f => f.userId === 'priest')!.tile = { x: 4, y: 1 };
  const ally = arranged.fighters.find(f => f.userId === 'ally')!; ally.tile = { x: 4, y: 2 }; ally.hp -= 5; saved.profiles.ally.character.hp = ally.hp;
  const enemy = arranged.fighters.find(f => f.side === 'enemies')!; enemy.tile = { x: 5, y: 2 }; enemy.hp = 1;
  assert.equal(validFantasyCombatState(arranged), true); fs.writeFileSync(file, JSON.stringify(saved));
  store = new FantasyStore(file, options); assert.equal(store.loadError, undefined, errors.map(error => String(error)).join('\n'));
  let state = store.combat('priest', 'same')!;
  const healed = store.combatOrder('priest', 'same', state.id, state.revision, { type: 'skill', skill: 'priest-grace', target: ally.id });
  assert.equal(healed.error, undefined); state = healed.state!;
  const waited = store.combatOrder('ally', 'same', state.id, state.revision, { type: 'guard' }); assert.equal(waited.error, undefined); state = waited.state!;
  assert.equal(state.fighters.find(f => f.userId === 'priest')!.contribution.receipts?.allyHealing, 5);
  for (let turn = 0; turn < 10 && state.status === 'active'; turn++) {
    const ready = store.combatOrder('priest', 'same', state.id, state.revision, { type: 'guard' }); assert.equal(ready.error, undefined); state = ready.state!;
    const before = store.profile('priest'), bytes = fs.readFileSync(file, 'utf8'); fail = true;
    const rejected = store.combatOrder('ally', 'same', state.id, state.revision, { type: 'attack', target: enemy.id });
    assert.equal(rejected.error, 'save-failed'); assert.deepEqual(store.profile('priest'), before); assert.equal(fs.readFileSync(file, 'utf8'), bytes);
    fail = false;
    const won = store.combatOrder('ally', 'same', state.id, state.revision, { type: 'attack', target: enemy.id }); assert.equal(won.error, undefined); state = won.state!;
  }
  assert.equal(state.status, 'victory');
  const completed = store.profile('priest'); assert.equal(completed.character!.priestGrowth?.support?.length, 1);
  assert.equal(validFantasyCombatProgress(completed.character!), true); assert.equal(validFantasyPriestGrowth(completed.character!), true);
  const restored = new FantasyStore(file, options); assert.equal(restored.loadError, undefined); assert.deepEqual(restored.profile('priest').character!.priestGrowth!.support, completed.character!.priestGrowth!.support);
  assert.equal(restored.profile('priest').character!.combatVictories![`service:${state.id}`], completed.character!.hour);
});
