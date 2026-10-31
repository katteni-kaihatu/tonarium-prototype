import test from 'node:test';
import assert from 'node:assert/strict';
import { FANTASY_DUNGEONS } from './fantasy-dungeon-catalog.ts';
import * as generator from './fantasy-dungeon-generator.ts';

test('seeded expeditions generate connected bounded maps with traps, choices and dead ends', () => {
  const shapes = new Set<string>();
  for (const template of FANTASY_DUNGEONS) for (let seed = 1; seed <= 100; seed++) {
    const site = generator.generateFantasyDungeon(template, seed);
    assert.ok(site.rooms.length >= 8 && site.rooms.length <= 18);
    const ids = new Set(site.rooms.map(room => room.id)); assert.equal(ids.size, site.rooms.length);
    const seen = new Set([site.entry]), pending = [site.entry];
    while (pending.length) { const current = pending.shift(); for (const exit of site.rooms.find(room => room.id === current)!.exits) if (!seen.has(exit)) { seen.add(exit); pending.push(exit); } }
    assert.equal(seen.size, site.rooms.length);
    for (const room of site.rooms) for (const exit of room.exits) assert.ok(site.rooms.find(other => other.id === exit)?.exits.includes(room.id));
    for (const core of template.rooms) assert.ok(ids.has(core.id));
    assert.ok(site.rooms.some(room => room.special));
    assert.ok(site.rooms.some(room => room.trap));
    assert.ok(site.rooms.some(room => room.id !== site.entry && room.exits.length === 1));
    assert.ok(site.rooms.some(room => room.enemy?.boss && seen.has(room.id)));
    assert.equal(new Set(site.rooms.map(room => `${room.x}:${room.y}`)).size, site.rooms.length);
    assert.deepEqual(generator.generateFantasyDungeon(template, seed), site);
    shapes.add(JSON.stringify(site.rooms.map(room => [room.id, room.exits, room.x, room.y])));
  }
  assert.ok(shapes.size > 550);
});
