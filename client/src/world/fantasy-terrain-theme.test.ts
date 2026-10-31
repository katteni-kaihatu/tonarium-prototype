import test from 'node:test';
import assert from 'node:assert/strict';
import { FANTASY_LOCATIONS } from '../../../shared/fantasy-data.ts';
import { applyFantasyAction, newFantasyProfile } from '../../../shared/fantasy-engine.ts';
import type { FantasyProfile, FantasySeason, FantasyTravelLeg } from '../../../shared/fantasy.ts';
import { FANTASY_TERRAIN_PALETTES, fantasyTerrainContrast, fantasyTerrainFrame, type FantasyTerrain } from './fantasy-terrain-theme.ts';

const seasons: FantasySeason[] = ['spring', 'summer', 'autumn', 'winter'];
const player = (location = 'hearth', hour = 12) => {
  const p = applyFantasyAction(newFantasyProfile(), { type: 'create', name: 'Theme', source: 'human', gender: 'female' }, () => .9).profile;
  p.character!.location = location; p.character!.hour = hour;
  return p;
};
const journey = (legs: FantasyTravelLeg[], startedAt = 12) => {
  const p = player(legs[0].from, startedAt);
  p.activity = { action: { type: 'travel', destination: legs.at(-1)!.to, transport: 'foot' }, startedAt,
    endsAt: startedAt + legs.reduce((sum, leg) => sum + leg.hours, 0), seed: 1, travel: { legs, paid: 0, ambushChecked: 0 } };
  return p;
};
const leg = (from: string, to: string, hours: number, transport = 'foot', startFraction?: number): FantasyTravelLeg => ({ from, to, hours, transport, cost: 0, ...(startFraction === undefined ? {} : { startFraction }) });
const terrains = Object.keys(FANTASY_TERRAIN_PALETTES) as FantasyTerrain[];
const locationOf = (kind: FantasyTerrain) => kind === 'sea' ? 'tidehaven' : FANTASY_LOCATIONS.find(place => place.kind === kind)!.id;
const luminance = (hex: string) => {
  const channels = [1, 3, 5].map(offset => parseInt(hex.slice(offset, offset + 2), 16) / 255)
    .map(value => value <= .04045 ? value / 12.92 : ((value + .055) / 1.055) ** 2.4);
  return channels[0] * .2126 + channels[1] * .7152 + channels[2] * .0722;
};
const contrast = (a: string, b: string) => (Math.max(luminance(a), luminance(b)) + .05) / (Math.min(luminance(a), luminance(b)) + .05);
const readable = (tokens: Record<string, string>, context: string) => {
  for (const value of Object.values(tokens)) assert.match(value, /^#[0-9a-f]{6}$/i);
  for (const key of ['--fr-paper', '--fr-surface', '--fr-surface-alt', '--fr-border', '--fr-gold', '--fr-shadow']) {
    assert.ok(luminance(tokens[key]) >= .65, `${context}: ${key} must stay light`);
  }
  for (const key of ['--fr-accent', '--fr-character-bg']) assert.ok(luminance(tokens[key]) >= .55, `${context}: ${key} must stay pastel`);
  const pairs = ['--fr-paper', '--fr-surface', '--fr-surface-alt'].flatMap(bg => [['--fr-ink', bg], ['--fr-muted', bg]])
    .concat([['--fr-accent-ink', '--fr-accent'], ['--fr-character-ink', '--fr-character-bg'], ['--fr-character-muted', '--fr-character-bg']]);
  for (const [fg, bg] of pairs) assert.ok(contrast(tokens[fg], tokens[bg]) >= 4.5, `${context}: ${fg}/${bg}`);
};

test('contrast measures WCAG luminance and neutral drafting is city spring', () => {
  assert.equal(fantasyTerrainContrast('#000000', '#ffffff'), 21);
  assert.equal(fantasyTerrainContrast('#445566', '#445566'), 1);
  const frame = fantasyTerrainFrame(undefined, 9999);
  assert.equal(frame.from.terrain, 'city'); assert.equal(frame.to.terrain, 'city');
  assert.equal(frame.from.season, 'spring'); assert.equal(frame.progress, 0); readable(frame.tokens, 'draft');
});

test('each terrain has one traceable Coolors base palette through all seasons', () => {
  assert.equal(terrains.length, 13);
  for (const terrain of terrains) {
    const palette = FANTASY_TERRAIN_PALETTES[terrain];
    const sourceColors = palette.source.split('/').at(-1)!.split('-').map(hex => `#${hex}`);
    assert.deepEqual(palette.sourceColors, sourceColors);
    assert.ok(palette.colors.length >= 3, `${terrain} needs a usable light palette`);
    for (const color of palette.colors) {
      assert.ok(sourceColors.includes(color), `${terrain}: colors must come from its single source`);
      assert.ok(luminance(color) >= .45, `${terrain}: dark source colors must be excluded`);
    }
    for (const name of [palette.name, ...Object.values(palette.names)]) assert.ok(name.length > 0);
    for (const [index, season] of seasons.entries()) {
      const p = terrain === 'sea' ? journey([leg('tidehaven', 'glass-isle', 20, 'ship')], index * 360 + 2) : player(locationOf(terrain), index * 360 + 12);
      const hour = index * 360 + 12;
      const frame = fantasyTerrainFrame(p, hour);
      assert.equal(frame.from.terrain, terrain); assert.equal(frame.to.terrain, terrain);
      assert.equal(frame.from.season, season); readable(frame.tokens, `${terrain}/${season}`);
      const original = terrains.filter(other => other !== terrain).map(other => [other, FANTASY_TERRAIN_PALETTES[other].colors] as const);
      try {
        for (const [other] of original) FANTASY_TERRAIN_PALETTES[other].colors = ['#ff00ff'];
        assert.deepEqual(fantasyTerrainFrame(p, hour).tokens, frame.tokens, 'stationary palette must be independent of other terrains');
      } finally { for (const [other, colors] of original) FANTASY_TERRAIN_PALETTES[other].colors = colors; }
    }
  }
});

test('filtering dark swatches retains the original Coolors palette in source attribution', () => {
  for (const [terrain, darkHex, count] of [['mountain', '#212529', 5], ['ruin', '#d4a373', 4], ['sea', '#03045e', 4]] as const) {
    const palette = FANTASY_TERRAIN_PALETTES[terrain];
    assert.ok(palette.sourceColors.includes(darkHex));
    assert.equal(palette.colors.includes(darkHex), false);
    assert.equal(palette.colors.length, count);
  }
});

test('snow pairs ice white and light cold blue without saturated red or orange accents', () => {
  const channels=FANTASY_TERRAIN_PALETTES.snow.colors.map(hex=>[1,3,5].map(index=>parseInt(hex.slice(index,index+2),16)));
  assert.ok(channels.some(color=>Math.min(...color)>230),'snow needs a light snow color');
  assert.ok(channels.some(([r,g,b])=>b>r+20&&b>=240&&g>150),'snow needs a light cold blue');
  for(const [r,g,b] of channels)assert.ok(!(r>g+30&&r>b+30),'snow must not contain a warm red or orange accent');
});

test('stationary seasonal tints retain terrain identity and autumn forest turns amber', () => {
  const spring = fantasyTerrainFrame(player('greenwood', 12));
  const autumn = fantasyTerrainFrame(player('greenwood', 732));
  const winter = fantasyTerrainFrame(player('greenwood', 1092));
  assert.notDeepEqual(autumn.tokens, spring.tokens); assert.notDeepEqual(winter.tokens, spring.tokens);
  const accent = autumn.tokens['--fr-accent'];
  assert.ok(parseInt(accent.slice(1, 3), 16) > parseInt(accent.slice(3, 5), 16));
  assert.equal(autumn.from.terrain, 'forest'); assert.equal(winter.from.terrain, 'forest');
});

test('scheduled durations and redirects follow the actual current leg', () => {
  const p = journey([leg('hearth', 'greenwood', 2), leg('greenwood', 'ironridge', 8)]);
  const middle = fantasyTerrainFrame(p, 18, ['hearth', 'ironridge']);
  assert.equal(middle.from.location, 'greenwood'); assert.equal(middle.to.location, 'ironridge'); assert.equal(middle.progress, .5);
  assert.equal(fantasyTerrainFrame(p, 13).progress, .5);
  assert.equal(fantasyTerrainFrame(p, 14).from.terrain, 'forest');
  const redirect = journey([leg('greenwood', 'hearth', 4, 'foot', .4)]);
  assert.equal(fantasyTerrainFrame(redirect, 12).progress, .4);
  assert.equal(fantasyTerrainFrame(redirect, 14).progress, .7);
  const arrived = fantasyTerrainFrame(p, 22);
  assert.equal(arrived.from.location, 'ironridge'); assert.equal(arrived.to.location, 'ironridge'); assert.equal(arrived.progress, 0);
  assert.deepEqual(arrived.tokens, fantasyTerrainFrame(player('ironridge', 22)).tokens);
});

test('paused and cancelled journeys retain the saved physical position independent of clock', () => {
  const p = player(); p.character!.travelPosition = { from: 'hearth', to: 'greenwood', fraction: .37 };
  const a = fantasyTerrainFrame(p, 12), b = fantasyTerrainFrame(p, 17);
  assert.equal(a.progress, .37); assert.equal(b.progress, .37); assert.deepEqual(a.tokens, b.tokens);
  p.activity = { action: { type: 'rest' }, startedAt: 12, endsAt: 18, seed: 1 };
  assert.equal(fantasyTerrainFrame(p, 16).progress, .37);
  delete p.character!.travelPosition; delete p.activity;
  assert.equal(fantasyTerrainFrame(p, 16).to.terrain, 'city');
});

test('legacy paths interpolate their actual intermediate terrain and ignore preview paths while stationary', () => {
  const p = player();
  assert.deepEqual(fantasyTerrainFrame(p, 12, ['hearth', 'ironridge']), fantasyTerrainFrame(p, 12));
  p.activity = { action: { type: 'travel', destination: 'ironridge', transport: 'foot' }, startedAt: 12, endsAt: 22, seed: 1 };
  const middle = fantasyTerrainFrame(p, 18, ['hearth', 'greenwood', 'ironridge']);
  assert.equal(middle.from.terrain, 'forest'); assert.equal(middle.to.terrain, 'mountain');
  assert.deepEqual(fantasyTerrainFrame(p, 22, ['hearth', 'greenwood', 'ironridge']).tokens, fantasyTerrainFrame(player('ironridge', 22)).tokens);
  assert.equal(fantasyTerrainFrame(p, 12).from.terrain, 'city');
});

test('sea crossings have shore transitions and one ocean palette in open water', () => {
  const p = journey([leg('tidehaven', 'glass-isle', 10, 'ship')]);
  for (const [fraction, from, to, progress] of [[0, 'coast', 'coast', 0], [.09, 'coast', 'sea', .5], [.5, 'sea', 'sea', 0], [.91, 'sea', 'island', .5], [1, 'island', 'island', 0]] as const) {
    const frame = fantasyTerrainFrame(p, 12 + fraction * 10);
    assert.equal(frame.from.terrain, from); assert.equal(frame.to.terrain, to); assert.ok(Math.abs(frame.progress - progress) < 1e-8);
  }
  const paused = player('tidehaven'); paused.character!.travelPosition = { from: 'tidehaven', to: 'glass-isle', fraction: .5 };
  assert.equal(fantasyTerrainFrame(paused).from.terrain, 'sea');
});

test('gates use actual scheduled progress and malformed positions fall back safely', () => {
  const p = journey([leg('hearth', 'ironridge', 4, 'gate')]);
  assert.equal(fantasyTerrainFrame(p, 14).progress, .5);
  for (const hour of [Number.NaN, Number.POSITIVE_INFINITY]) readable(fantasyTerrainFrame(p, hour).tokens, 'invalid clock');
  const unknown = player('missing-place');
  unknown.character!.travelPosition = { from: 'missing-place', to: 'greenwood', fraction: Number.NaN };
  const frame = fantasyTerrainFrame(unknown, Number.NaN);
  assert.equal(frame.from.terrain, 'city'); assert.equal(frame.to.terrain, 'city'); assert.equal(frame.progress, 0);
});

test('all terrain pairs stay readable at dense travel fractions in every season', () => {
  for (const from of terrains) for (const to of terrains) for (const [seasonIndex, season] of seasons.entries()) {
    for (let index = 0; index <= 30; index++) {
      const p = player(locationOf(from), seasonIndex * 360 + 12);
      p.character!.travelPosition = { from: locationOf(from), to: locationOf(to), fraction: index / 30 };
      if (from === 'sea' || to === 'sea') {
        p.character!.travelPosition = { from: 'tidehaven', to: 'glass-isle', fraction: index / 30 };
      }
      readable(fantasyTerrainFrame(p).tokens, `${from}/${to}/${season}/${index}`);
    }
  }
});
