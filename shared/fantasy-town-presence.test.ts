import test from 'node:test';
import assert from 'node:assert/strict';
import { fantasyTownPresence, type FantasyTownCandidate } from './fantasy-town-presence.ts';

const actor = (id: string, patch: Partial<FantasyTownCandidate> = {}): FantasyTownCandidate => ({ id, name: id, session: 'world', location: 'hearth', online: true, alive: true, travelling: false, ...patch });
test('town roster contains only living connected adventurers at the same place and world', () => {
  const self = actor('self');
  const result = fantasyTownPresence(self, [self, actor('friend', { name: '나그네' }), actor('other-town', { location: 'tidehaven' }), actor('other-world', { session: 'private-world' }), actor('offline', { online: false }), actor('dead', { alive: false }), actor('on-road', { travelling: true })]);
  assert.equal(result.location, 'hearth');
  assert.deepEqual(result.players.map(player => player.id).sort(), ['friend', 'self']);
  assert.ok(result.players.some(player => player.name === '나그네'));
  for (const player of result.players) assert.deepEqual(Object.keys(player).sort(), ['id', 'name']);
});
test('leaving town, losing ownership or travelling clears the current roster', () => {
  for (const self of [undefined, actor('self', { online: false }), actor('self', { alive: false }), actor('self', { travelling: true }), actor('self', { session: null }), actor('self', { location: 'greenwood' })]) {
    assert.deepEqual(fantasyTownPresence(self, [actor('other')]), { location: null, players: [] });
  }
});
test('duplicate tabs do not duplicate a traveler and returned data does not expose candidate metadata', () => {
  const self = actor('self'), friend = actor('friend');
  const result = fantasyTownPresence(self, [self, friend, friend]);
  assert.equal(result.players.length, 2);
  assert.ok(!JSON.stringify(result).includes('online'));
  result.players[0].name = 'changed'; assert.equal(self.name, 'self');
});
