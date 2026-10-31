import test from 'node:test';
import assert from 'node:assert/strict';
import { createElement } from 'react';
import { renderToStaticMarkup } from 'react-dom/server';
import { FantasyStatusEffects } from './FantasyStatusEffects.tsx';
import { fantasyTooltipPosition } from './fantasy-tooltip-position.ts';

test('status chips show distinct buffs and debuffs with readable accessible descriptions in all locales', () => {
  for (const locale of ['ko', 'en', 'ja'] as const) {
    const html = renderToStaticMarkup(createElement(FantasyStatusEffects, { locale, effects: [
      { id: 'warmth', name: 'Warmth', kind: 'buff', description: 'A carried charm protects you from cold.' },
      { id: 'cold', name: 'Cold', kind: 'debuff', description: 'Outdoor checks -2; camp recovery reduced.' },
    ] }));
    assert.match(html, /fr-status-chip buff/); assert.match(html, /fr-status-chip debuff/);
    assert.ok(html.includes('Outdoor checks -2; camp recovery reduced.'));
    assert.match(html, /type="button"/); assert.match(html, /aria-label=/);
    assert.ok(html.includes({ ko: '현재 효과', en: 'Current effects', ja: '現在の効果' }[locale]));
  }
  assert.equal(renderToStaticMarkup(createElement(FantasyStatusEffects, { locale: 'ko', effects: [] })), '');
});
test('status tooltip positioning stays inside narrow panel boundaries near every corner', () => {
  const bounds = { left: 100, top: 80, right: 320, bottom: 360 }, size = { width: 204, height: 160 };
  for (const [left, top] of [[100, 80], [290, 80], [100, 335], [290, 335]]) {
    const p = fantasyTooltipPosition({ left, top, right: left + 30, bottom: top + 25 }, size, bounds);
    assert.ok(p.left >= 108 && p.left + size.width <= 312);
    assert.ok(p.top >= 88 && p.top + size.height <= 352);
  }
});
