import test from 'node:test';
import assert from 'node:assert/strict';
import { FANTASY_ITEMS, FANTASY_LOCATIONS } from './fantasy-data.ts';
import { FANTASY_MONSTERS } from './fantasy-monsters.ts';
import { generateFantasyDungeon } from './fantasy-dungeon-generator.ts';
import { fantasyFogReveal } from './fantasy-fog.ts';
import * as geometry from './fantasy-map-geometry.ts';
import * as frontier from './fantasy-frontier-data.ts';

test('frontier is a connected wilderness with one dock and one external passage', () => {
  const places = frontier.FANTASY_FRONTIER_LOCATIONS, routes = frontier.FANTASY_FRONTIER_ROUTES;
  assert.ok(places.length >= 12 && places.length <= 16);
  assert.equal(new Set(places.map(place => place.id)).size, places.length);
  assert.ok(places.every(place => place.land === 'frontier' && place.kind !== 'city'));
  assert.deepEqual(places.filter(place => place.services.length).map(place => [place.id, place.services]), [[frontier.FANTASY_FRONTIER_BASE, ['port']]]);
  const ids = new Set(places.map(place => place.id));
  const external = routes.filter(route => !ids.has(route.from) || !ids.has(route.to));
  assert.deepEqual(external, [{ from: frontier.FANTASY_FRONTIER_DEPARTURE, to: frontier.FANTASY_FRONTIER_BASE, mode: 'sea', hours: 24 }]);
  assert.ok(FANTASY_LOCATIONS.find(place => place.id === frontier.FANTASY_FRONTIER_DEPARTURE)?.services.includes('port'));
  const reached = new Set([frontier.FANTASY_FRONTIER_BASE]);
  for (let step = 0; step < places.length; step++) for (const route of routes) {
    if (ids.has(route.from) && ids.has(route.to)) {
      assert.equal(route.mode, 'land'); assert.ok(route.hours > 0);
      if (reached.has(route.from)) reached.add(route.to);
      if (reached.has(route.to)) reached.add(route.from);
    }
  }
  assert.equal(reached.size, places.length);
  for (const place of places) for (const locale of ['ko', 'en', 'ja'] as const) {
    assert.ok(place.names?.[locale]); assert.ok(place.descriptions?.[locale]);
  }
});

test('frontier resources and native encounter pools use registered appropriate content', () => {
  const itemIds = new Set(FANTASY_ITEMS.map(item => item.id));
  const monsters = new Map(FANTASY_MONSTERS.map(monster => [monster.id, monster]));
  for (const place of frontier.FANTASY_FRONTIER_LOCATIONS) {
    for (const item of place.resources) assert.ok(itemIds.has(item), `${place.id}: ${item}`);
    const enemies = frontier.FANTASY_FRONTIER_ENCOUNTERS[place.id];
    if (place.id === frontier.FANTASY_FRONTIER_BASE) assert.deepEqual(enemies, []);
    else assert.ok(enemies.length > 0, place.id);
    for (const id of enemies) {
      const enemy = monsters.get(id)!;
      assert.ok(enemy, id); assert.ok(enemy.tier >= 4 && enemy.tier <= 6, id);
      assert.ok(enemy.kinds.includes(place.kind), `${place.id}: ${id}`);
      assert.ok(place.danger >= (enemy.minDanger ?? 0), `${place.id}: ${id} is outside its habitat danger`);
    }
    for (const item of frontier.FANTASY_FRONTIER_FORAGE_ITEMS[place.id] ?? []) {
      assert.ok(place.resources.includes(item)); assert.ok(FANTASY_ITEMS.find(entry => entry.id === item)?.food);
    }
  }
});

test('hidden frontier sites have complete discovery metadata and playable randomized interiors', () => {
  const sites = frontier.FANTASY_FRONTIER_DUNGEONS;
  assert.ok(sites.length >= 6 && sites.length <= 8);
  assert.ok(sites.filter(site => site.kind === 'ruin').length >= 3);
  for (const site of sites) {
    const discovery = frontier.FANTASY_FRONTIER_SITE_DISCOVERY[site.id];
    assert.equal(discovery.location, site.location); assert.ok(discovery.chance > 0 && discovery.chance < 1);
    assert.ok(discovery.dc >= 14); assert.equal(discovery.hidden, true);
    assert.ok(frontier.fantasyFrontierSitesAt(site.location).some(entry => entry.id === site.id));
    assert.ok(frontier.FANTASY_FRONTIER_LOCATIONS.some(place => place.id === site.location));
    for (const seed of [1, 24, 997]) {
      const generated = generateFantasyDungeon(site, seed), rooms = new Map(generated.rooms.map(room => [room.id, room]));
      assert.ok(rooms.has(generated.entry)); assert.ok(rooms.size >= 8 && rooms.size <= 18);
      const seen = new Set([generated.entry]);
      for (let step = 0; step < rooms.size; step++) for (const room of rooms.values()) for (const exit of room.exits) {
        assert.ok(rooms.get(exit)?.exits.includes(room.id), `${site.id}: asymmetric exit`);
        if (seen.has(room.id)) seen.add(exit);
      }
      assert.equal(seen.size, rooms.size); assert.equal(generated.rooms.filter(room => room.enemy?.boss).length, 1);
      for (const room of generated.rooms) if (room.enemy) {
        const enemy = FANTASY_MONSTERS.find(enemy => enemy.id === room.enemy!.template)!;
        assert.ok(enemy && enemy.tier >= 4 && enemy.tier <= 6, `${site.id}: ${room.enemy.template}`);
      }
    }
  }
  assert.deepEqual(frontier.fantasyFrontierSitesAt('hearth'), []);
});

test('frontier geography is separate, within pan bounds, and reveals only visited local cells', () => {
  const coast = geometry.FANTASY_FRONTIER_COAST;
  const inside = (point: { x: number; y: number }) => {
    let result = false;
    for (let i = 0, j = coast.length - 1; i < coast.length; j = i++) {
      const a = coast[i], b = coast[j];
      if ((a.y > point.y) !== (b.y > point.y) && point.x < (b.x - a.x) * (point.y - a.y) / (b.y - a.y) + a.x) result = !result;
    }
    return result;
  };
  assert.ok(coast.every(point => point.x >= 1900));
  assert.ok(inside(geometry.FANTASY_FRONTIER_LABEL));
  for (const place of frontier.FANTASY_FRONTIER_LOCATIONS) {
    assert.ok(inside(place), `${place.id} is offshore`);
    assert.ok(place.x < geometry.FANTASY_MAP_BOUNDS.width && place.y < geometry.FANTASY_MAP_BOUNDS.height);
  }
  const places = frontier.FANTASY_FRONTIER_LOCATIONS, visited = places.map(place => place.id);
  const reveal = fantasyFogReveal(visited, visited, undefined, places);
  assert.ok(reveal.triangles.length > 0); assert.ok(reveal.connections.length > 0);
  assert.equal(fantasyFogReveal([], [], undefined, places).circles.length, 0);
});
