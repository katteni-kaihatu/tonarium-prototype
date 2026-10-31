import test from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { createElement } from 'react';
import { renderToStaticMarkup } from 'react-dom/server';
import { FantasyTerrainAmbience } from './FantasyTerrainAmbience.tsx';
import { FANTASY_TERRAIN_PALETTES, type FantasyTerrainMood } from './fantasy-terrain-theme.ts';

const seasons = ['spring', 'summer', 'autumn', 'winter'] as const;
const mood = (terrain: FantasyTerrainMood['terrain'], season: FantasyTerrainMood['season'] = 'summer', weather: FantasyTerrainMood['weather'] = 'clear'): FantasyTerrainMood => ({ location: terrain, terrain, season, weather, night: false, temperature: season === 'winter' ? -5 : 22 });
function scene(from: FantasyTerrainMood, to = from, progress = 1) {
  return renderToStaticMarkup(createElement(FantasyTerrainAmbience, { frame: { from, to, progress, tokens: {} } }));
}

test('decorative scenes are hidden, noninteractive and crossfade with bounded weights', () => {
  const html = scene(mood('forest'), mood('sea'), .25);
  assert.match(html, /aria-hidden="true"/);
  assert.match(html, /pointer-events:none/);
  assert.equal((html.match(/data-terrain=/g) ?? []).length, 2);
  assert.match(html, /opacity:0\.75/);
  assert.match(html, /opacity:0\.25/);
  assert.doesNotMatch(html, /<(button|input|a|canvas|img|text)\b/);
  assert.doesNotMatch(scene(mood('forest'), mood('sea'), -4), /opacity:-/);
  assert.doesNotMatch(scene(mood('forest'), mood('sea'), Number.NaN), /NaN/);
});

test('a stationary climate has one scene rather than two identical animated layers', () => {
  assert.equal((scene(mood('forest')).match(/data-terrain=/g) ?? []).length, 1);
  assert.match(scene(mood('forest')), /opacity:1/);
});

test('forest contours change with the season and winter keeps only bare branches and snow', () => {
  assert.match(scene(mood('forest', 'autumn')), /data-motif="maple"/);
  assert.match(scene(mood('forest', 'summer')), /data-motif="leaf"/);
  const winter = scene(mood('forest', 'winter'));
  assert.match(winter, /data-motif="bare-branches"/);
  assert.match(winter, /data-motif="settled-snow"/);
  assert.doesNotMatch(winter, /data-motif="(?:maple|leaf)"/);
});

test('snow terrain has summer thaw and water terrains retain wave art', () => {
  assert.match(scene(mood('snow', 'summer')), /data-snow-cover="thin"/);
  assert.match(scene(mood('snow', 'winter')), /data-snow-cover="deep"/);
  for (const terrain of ['sea', 'coast', 'island'] as const) assert.match(scene(mood(terrain)), /data-motif="waves"/);
});

test('underground weather is suppressed and town precipitation is muted', () => {
  for (const terrain of ['cave', 'tower'] as const) {
    for (const weather of ['rain', 'snow'] as const) assert.doesNotMatch(scene(mood(terrain, 'winter', weather)), /data-particle="(?:rain|snow)"/);
  }
  const town = scene(mood('city', 'winter', 'snow'));
  assert.match(town, /data-weather-muted="true"/);
  assert.ok((town.match(/data-particle="snow"/g) ?? []).length <= 8);
});

test('all terrain-season-weather combinations stay bounded and use only their own palette', () => {
  const css = readFileSync('client/src/world/fantasy-terrain-ambience.css', 'utf8');
  assert.doesNotMatch(css, /#[\da-f]{3,8}\b|\brgba?\(/i);
  for (const terrain of Object.keys(FANTASY_TERRAIN_PALETTES) as FantasyTerrainMood['terrain'][]) {
    for (const season of seasons) for (const weather of ['clear', 'rain', 'snow'] as const) {
      const html = scene(mood(terrain, season, weather));
      assert.ok((html.match(/data-particle=/g) ?? []).length <= 36, `${terrain}/${season}/${weather}`);
      assert.ok((html.match(/<[a-z][^/>]*/g) ?? []).length < 220, `${terrain}/${season}/${weather}`);
      for (const color of html.match(/#[\da-f]{6}\b/gi) ?? []) assert.ok(FANTASY_TERRAIN_PALETTES[terrain].colors.some(base => base.toLowerCase() === color.toLowerCase()), `${terrain}: ${color}`);
    }
  }
});

test('edge-only styling reduces mobile particles and turns all movement off for reduced motion', () => {
  const css = readFileSync('client/src/world/fantasy-terrain-ambience.css', 'utf8');
  assert.match(css, /prefers-reduced-motion:\s*reduce/);
  assert.match(css, /animation:\s*none\s*!important/);
  assert.match(css, /transition:\s*none\s*!important/);
  assert.match(css, /pointer-events:\s*none/);
  assert.match(css, /overflow:\s*hidden/);
  assert.match(css, /max-width:\s*600px/);
  assert.match(css, /nth-child\(n\s*\+\s*5\)/);
  assert.match(css, /1600ms/);
});
