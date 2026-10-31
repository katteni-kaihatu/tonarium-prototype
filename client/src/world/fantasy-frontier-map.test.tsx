import test from 'node:test';
import assert from 'node:assert/strict';
import { createElement } from 'react';
import { renderToStaticMarkup } from 'react-dom/server';
import { FantasyMap } from './FantasyMap.tsx';
import { FANTASY_FRONTIER_COAST_PATH } from '../../../shared/fantasy-map-geometry.ts';

test('map draws the separate frontier coastline through terrain and fog clipping', () => {
  const html = renderToStaticMarkup(createElement(FantasyMap, { selected: 'hearth', visited: [], known: [], onSelect: () => {} }));
  assert.ok(html.split(`d="${FANTASY_FRONTIER_COAST_PATH}"`).length >= 4);
  assert.ok(html.includes('미개척 대륙'));
  assert.ok(html.includes('width="2640"'));
  assert.ok(!html.includes('Rootbound Archive'));
});
