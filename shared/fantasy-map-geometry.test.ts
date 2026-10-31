import test from 'node:test';
import assert from 'node:assert/strict';
import { FANTASY_LOCATIONS, FANTASY_ROUTES } from './fantasy-data.ts';
import { fantasyFogReveal } from './fantasy-fog.ts';
import { fantasyJourneyPoint } from './fantasy-journey.ts';
import { FANTASY_MAP_BOUNDS, FANTASY_NOCTIS_COAST, FANTASY_NOCTIS_LABEL } from './fantasy-map-geometry.ts';
import { FANTASY_EXPANSION_LOCATIONS } from './fantasy-world-expansion.ts';

const originalNoctis = [
  ['dawnport', 710, 370], ['mooncity', 800, 255], ['duskmire', 820, 420], ['glassdesert', 900, 330],
  ['ashpeak', 900, 165], ['frostpass', 795, 100], ['eclipsevault', 695, 185],
  ['inkstone-city', 805, 335], ['pinewatch', 770, 175], ['reedcross', 760, 470],
] as const;
const at = (id: string) => FANTASY_LOCATIONS.find(place => place.id === id)!;
const inside = (point: { x: number; y: number }) => {
  let result = false;
  for (let i = 0, j = FANTASY_NOCTIS_COAST.length - 1; i < FANTASY_NOCTIS_COAST.length; j = i++) {
    const a = FANTASY_NOCTIS_COAST[i], b = FANTASY_NOCTIS_COAST[j];
    if ((a.y > point.y) !== (b.y > point.y) && point.x < (b.x - a.x) * (point.y - a.y) / (b.y - a.y) + a.x) result = !result;
  }
  return result;
};
const onCoast = (point: { x: number; y: number }) => FANTASY_NOCTIS_COAST.some((a, index) => {
  const b = FANTASY_NOCTIS_COAST[(index + 1) % FANTASY_NOCTIS_COAST.length];
  const fraction = Math.max(0, Math.min(1, ((point.x - a.x) * (b.x - a.x) + (point.y - a.y) * (b.y - a.y)) / ((b.x - a.x) ** 2 + (b.y - a.y) ** 2)));
  return Math.hypot(point.x - a.x - fraction * (b.x - a.x), point.y - a.y - fraction * (b.y - a.y)) <= 8.5;
});

test('Noctis moves east together while every internal location offset stays intact', () => {
  const noctis = FANTASY_LOCATIONS.filter(place => place.land === 'noctis');
  assert.equal(noctis.length, originalNoctis.length);
  for (const [id, x, y] of originalNoctis) {
    assert.deepEqual({ x: at(id).x, y: at(id).y }, { x: x + 80, y });
  }
  assert.equal(at('inkstone-city').x - at('dawnport').x, 95);
  assert.equal(at('mooncity').y - at('dawnport').y, -115);
});

test('assembling the map leaves expansion source coordinates intact for module refreshes', () => {
  const source = FANTASY_EXPANSION_LOCATIONS.find(place => place.id === 'inkstone-city')!;
  assert.deepEqual({ x: source.x, y: source.y }, { x: 805, y: 335 });
  assert.notEqual(source, at('inkstone-city'));
});

test('the wider strait leaves other continents and island destinations fixed', () => {
  for (const [id, x, y] of [['hearth', 285, 340], ['greenwood', 205, 255], ['glass-isle', 565, 245],
    ['mirror-isle', 870, 650], ['beyond-dawn-isle', 1080, 555], ['verdant-quay', 235, 755], ['saffron-port', 1180, 730]] as const) {
    assert.deepEqual({ x: at(id).x, y: at(id).y }, { x, y });
  }
  assert.equal(Math.min(...FANTASY_NOCTIS_COAST.map(point => point.x)) - 492, 237);
  assert.ok(!inside(at('glass-isle')) && !inside(at('mirror-isle')));
});

test('Noctis labels, places and coastline remain inside map bounds and on the same land', () => {
  assert.ok(inside(FANTASY_NOCTIS_LABEL));
  for (const place of FANTASY_LOCATIONS.filter(place => place.land === 'noctis')) assert.ok(inside(place) || onCoast(place), `${place.id} is offshore`);
  for (const point of [...FANTASY_LOCATIONS, ...FANTASY_NOCTIS_COAST]) {
    assert.ok(point.x >= 0 && point.x <= FANTASY_MAP_BOUNDS.width);
    assert.ok(point.y >= 0 && point.y <= FANTASY_MAP_BOUNDS.height);
  }
});

test('fog reveals and scheduled route animation inherit shifted location coordinates', () => {
  const fog = fantasyFogReveal(['inkstone-city'], ['inkstone-city']);
  assert.deepEqual(fog.circles.map(({ x, y }) => ({ x, y })), [{ x: 885, y: 335 }]);
  const journey = fantasyJourneyPoint({ path: ['hearth', 'dawnport'], startedAt: 12, endsAt: 20, hour: 16, name: 'Traveler', travel: {
    paid: 0, ambushChecked: 0, legs: [{ from: 'hearth', to: 'dawnport', hours: 8, cost: 0, transport: 'ship' }],
  } });
  assert.deepEqual(journey!.point, { x: 537.5, y: 355 });
  assert.equal(journey!.progress, .5);
  assert.equal(FANTASY_ROUTES.find(route => route.from === 'hearth' && route.to === 'dawnport' && route.mode === 'sea')!.hours, 8);
});
