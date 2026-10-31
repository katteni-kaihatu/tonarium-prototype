import test from 'node:test';
import assert from 'node:assert/strict';
import { FANTASY_LOCATIONS } from './fantasy-data.ts';
import { fantasyFogReveal, type FantasyFogPlace } from './fantasy-fog.ts';
import { FANTASY_MAINLAND_COASTS } from './fantasy-map-geometry.ts';

const place = (id: string, x: number, y: number, land: FantasyFogPlace['land'] = 'aurelia'): FantasyFogPlace => ({ id, x, y, land });
const neighbours = [place('hearth', 100, 100), place('silentwillow', 300, 100), place('tideport', 200, 275)];

test('three fully visited local neighbours clear their enclosed pocket', () => {
  const reveal = fantasyFogReveal(['hearth', 'silentwillow', 'tideport'], ['hearth', 'silentwillow', 'tideport'], undefined, neighbours);
  assert.equal(reveal.triangles.length, 1);
  assert.deepEqual(new Set(reveal.triangles[0].map(point => point.id)), new Set(['hearth', 'silentwillow', 'tideport']));
  assert.equal(reveal.connections.length, 3);
});

test('known places from a library do not count as visited surrounding regions', () => {
  const reveal = fantasyFogReveal(['hearth', 'silentwillow', 'tideport'], ['hearth', 'silentwillow'], undefined, neighbours);
  assert.equal(reveal.triangles.length, 0);
  assert.equal(reveal.circles.length, 3);
  assert.equal(reveal.connections.length, 1);
});

test('explored surroundings reveal enclosed terrain while an unknown place retains its identity', () => {
  const places = [...neighbours, place('unknown-grove', 200, 160)];
  const known = ['hearth', 'silentwillow', 'tideport'], visited = [...known];
  const reveal = fantasyFogReveal(known, visited, undefined, places);
  assert.equal(reveal.triangles.length, 1);
  assert.equal(reveal.circles.some(point => point.id === 'unknown-grove'), false);
  assert.deepEqual(known, ['hearth', 'silentwillow', 'tideport']); assert.deepEqual(visited, known);
});

test('complete mainland exploration reveals its entire shoreline without distant lands or ocean', () => {
  for (const land of ['aurelia', 'noctis', 'sylvara', 'kazaran', 'frontier'] as const) {
    const visited = FANTASY_LOCATIONS.filter(place => place.land === land).map(place => place.id);
    const reveal = fantasyFogReveal(visited, visited);
    assert.ok(reveal.coasts.some(area => area.land === land && area.complete), land);
    assert.ok(reveal.coasts.every(area => area.land === land));
    const area = reveal.coasts.find(area => area.complete)!;
    const outline = FANTASY_MAINLAND_COASTS[land];
    for (const corner of outline) assert.ok(area.points.some(point => Math.hypot(point.x - corner.x, point.y - corner.y) < 0.01), `${land}: coastline corner`);
    assert.ok(area.points.every(point => point.x >= Math.min(...outline.map(point => point.x)) && point.x <= Math.max(...outline.map(point => point.x))));
  }
});

test('partial exploration joins nearby coastal terrain but leaves the far shore fogged', () => {
  const visited = ['frontier-landing', 'frontier-rainforest', 'frontier-kelp-coast'];
  const reveal = fantasyFogReveal(visited, visited);
  const areas = reveal.coasts.filter(area => area.land === 'frontier');
  assert.ok(areas.length > 0); assert.ok(areas.every(area => !area.complete));
  assert.ok(areas.some(area => area.points.some(point => point.x < 1960 && point.y > 550 && point.y < 800)));
  assert.ok(areas.every(area => area.points.every(point => point.x < 2200 && point.y > 400)));
  assert.ok(reveal.coasts.every(area => area.land === 'frontier'));
  assert.equal(reveal.circles.some(point => point.id === 'frontier-storm-bluffs'), false);
});

test('library knowledge alone cannot clear an entire coastline', () => {
  const known = FANTASY_LOCATIONS.filter(place => place.land === 'frontier').map(place => place.id);
  assert.deepEqual(fantasyFogReveal(known, []).coasts, []);
});

test('distant explored points cannot clear a giant triangle or corridor', () => {
  const places = [place('near', 100, 100), place('far', 1100, 100), place('farther', 100, 1100)];
  for (const visited of [['near', 'far'], ['near', 'far', 'farther']]) {
    const reveal = fantasyFogReveal(visited, visited, undefined, places);
    assert.equal(reveal.connections.length, 0); assert.equal(reveal.triangles.length, 0);
  }
});

test('local fills never bridge continents or islands over undiscovered sea', () => {
  const places = [place('a', 100, 100), place('b', 200, 100, 'noctis'), place('c', 150, 200, 'islands')];
  const reveal = fantasyFogReveal(['a', 'b', 'c'], ['a', 'b', 'c'], undefined, places);
  assert.equal(reveal.connections.length, 0); assert.equal(reveal.triangles.length, 0);
});

test('a fully explored mainland clears adjacent interior cells without revealing another land', () => {
  const visited = FANTASY_LOCATIONS.filter(place => place.land === 'aurelia').map(place => place.id);
  const reveal = fantasyFogReveal(visited, visited);
  assert.ok(reveal.triangles.length > 10);
  assert.ok(reveal.triangles.some(triangle => triangle.some(point => point.id === 'hearth')));
  assert.ok(reveal.triangles.every(triangle => triangle.every(point => point.land === 'aurelia')));
  assert.ok(reveal.circles.every(point => point.land === 'aurelia'));
});

test('partial movement reveals only the travelled segment, including redirected start fractions', () => {
  const reveal = fantasyFogReveal(['hearth'], ['hearth'], { path: ['hearth', 'greenwood'], startedAt: 12, endsAt: 16, hour: 14, name: 'Traveler', travel: {
    paid: 0, ambushChecked: 0, legs: [{ from: 'hearth', to: 'greenwood', hours: 4, cost: 0, transport: 'foot', startFraction: .4 }],
  } });
  assert.deepEqual(reveal.trails, [[{ x: 253, y: 306 }, { x: 229, y: 280.5 }]]);
  assert.equal(reveal.circles.some(point => point.id === 'greenwood'), false);
});

test('gate travel does not clear unseen land or sea along its straight map line', () => {
  const reveal = fantasyFogReveal(['hearth'], ['hearth'], { path: ['hearth', 'mooncity'], startedAt: 12, endsAt: 14, hour: 13, name: 'Traveler', travel: {
    paid: 0, ambushChecked: 0, legs: [{ from: 'hearth', to: 'mooncity', hours: 2, cost: 0, transport: 'gate' }],
  } });
  assert.equal(reveal.trails.length, 0);
});
