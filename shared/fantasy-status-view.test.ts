import test from 'node:test';
import assert from 'node:assert/strict';
import { applyFantasyAction, newFantasyProfile } from './fantasy-engine.ts';
import { fantasyStatusView } from './fantasy-status-view.ts';
import type { FantasyCombatFighter } from './fantasy-combat.ts';

const character = () => {
  const c = applyFantasyAction(newFantasyProfile(), { type: 'create', source: 'human', gender: 'female', name: 'Status' }, () => .5).profile.character!;
  c.location = 'greenwood'; c.hour = 45 * 24 + 12; c.inventory = { lantern: 1 }; c.fatigue = 90; c.hunger = 70; return c;
};
test('status rows explain actual climate needs effects and action buffs in all locales, hiding expired effects', () => {
  const c = character();
  c.effects = [{ id: 'poison', expiresAt: c.hour + 3, periodicHp: -2, check: -1 }, { id: 'expired', expiresAt: c.hour, check: 8 }];
  c.buff = { effect: 'check', stat: 'agility', power: 4, expiresAt: c.hour + 1 };
  for (const locale of ['ko', 'en', 'ja'] as const) {
    const rows = fantasyStatusView(c, locale);
    for (const id of ['weather-cold', 'fatigue', 'hunger', 'poison', 'prepared']) {
      const row = rows.find(row => row.id === id); assert.ok(row, id); assert.ok(row.name.trim().length > 0); assert.ok(row.description.length > row.name.length);
    }
    assert.ok(rows.find(row => row.id === 'poison')!.description.includes('-2'));
    assert.ok(!rows.some(row => row.id === 'expired'));
  }
  c.hour += 3; assert.ok(!fantasyStatusView(c, 'ko').some(row => ['prepared', 'poison'].includes(row.id)));
});
test('protection rows reflect actual ownership and camp-only ward operation rather than permanent fake buffs', () => {
  const c = character(); c.inventory['ember-handwarmer'] = 1;
  assert.ok(fantasyStatusView(c, 'ko').some(row => row.id === 'protection-warmth'));
  delete c.inventory['ember-handwarmer'];
  assert.ok(!fantasyStatusView(c, 'ko').some(row => row.id === 'protection-warmth'));
  c.inventory['ward-seal'] = 1; c.hour = 30 * 24 + 12;
  assert.ok(!fantasyStatusView(c, 'ko').some(row => row.id === 'protection-waterproof'));
});
test('combat statuses display current own fighter values without duplicate world ailments', () => {
  const c = character(); c.effects = [{ id: 'poison', expiresAt: c.hour + 4, periodicHp: -2 }];
  const fighter = { effects: [{ id: 'poison', power: 5, turns: 2 }], conditions: [{ id: 'silence', power: 2, turns: 1 }], ward: 10, guarding: true } as FantasyCombatFighter;
  const rows = fantasyStatusView(c, 'en', { fighter });
  assert.equal(rows.filter(row => row.id === 'poison').length, 1);
  assert.ok(rows.find(row => row.id === 'poison')!.description.includes('5'));
  assert.ok(rows.some(row => row.id === 'silence' && row.kind === 'debuff'));
  assert.ok(rows.some(row => row.id === 'combat-ward' && row.description.includes('10')));
});
test('fatigue and hunger appear only when their actual check penalty starts and scale at the same thresholds', () => {
  const c = character();
  for (const [value, penalty] of [[0, 0], [49, 0], [50, 1], [69, 1], [70, 2], [89, 2], [90, 3], [100, 3]]) {
    c.fatigue = value; c.hunger = value;
    const rows = fantasyStatusView(c, 'en');
    for (const id of ['fatigue', 'hunger']) {
      const row = rows.find(row => row.id === id);
      if (!penalty) assert.equal(row, undefined); else { assert.equal(row?.kind, 'debuff'); assert.ok(row.description.includes(`-${penalty}`)); }
    }
  }
});
