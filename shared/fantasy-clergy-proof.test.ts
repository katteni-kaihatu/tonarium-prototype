import { test } from 'node:test';
import assert from 'node:assert/strict';
import { applyFantasyAction, newFantasyProfile } from './fantasy-engine.ts';
import { createFantasyCombat } from './fantasy-combat.ts';
import { fantasyCombatPlayer } from '../server/fantasy-combat-adapter.ts';
import { recordFantasyClergyCombatService } from '../server/fantasy-clergy-service.ts';
import { validFantasyCombatProgress } from './fantasy-combat-challenges.ts';

test('canonical clergy combat proofs remain valid across saves and later profession changes', () => {
  const p = applyFantasyAction(newFantasyProfile(), { type: 'create', source: 'human', gender: 'female', name: '司祭' }, () => .5).profile, c = p.character!;
  c.job = 'priest'; c.hour = 12;
  const priest = fantasyCombatPlayer(p, 'priest'), ally = { ...structuredClone(priest), id: 'ally', userId: 'ally', vocation: { job: 'warrior' } };
  const state = createFantasyCombat({ id: 'combat-00000000-0000-4000-8000-000000000001', source: 'hunt:monster-forest-wolf', location: c.location, hour: 12, seed: 42, players: [priest, ally], enemies: [{ id: 'enemy', template: 'monster-forest-wolf' }] });
  state.status = 'victory'; state.fighters.find(f => f.side === 'enemies')!.hp = 0; state.fighters[0].contribution.receipts = { healing: 5, allyHealing: 5 };
  assert.equal(recordFantasyClergyCombatService(p, state, 'priest'), true);
  assert.equal(validFantasyCombatProgress(c), true);
  const restored = JSON.parse(JSON.stringify(c)); restored.job = 'warrior'; assert.equal(validFantasyCombatProgress(restored), true);
  delete restored.priestGrowth.support; assert.equal(validFantasyCombatProgress(restored), false);
});

test('a service-shaped victory key requires its paired bounded clergy receipt', () => {
  const p = applyFantasyAction(newFantasyProfile(), { type: 'create', source: 'human', gender: 'female', name: '旅人' }, () => .5).profile, c = p.character!;
  c.combatVictories = { 'service:combat-00000000-0000-4000-8000-000000000001': c.hour };
  assert.equal(validFantasyCombatProgress(c), false);
  c.combatVictories = { 'service:not-a-combat': c.hour }; assert.equal(validFantasyCombatProgress(c), false);
});
