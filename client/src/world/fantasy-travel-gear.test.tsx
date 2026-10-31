import test from 'node:test';
import assert from 'node:assert/strict';
import { createElement } from 'react';
import { renderToStaticMarkup } from 'react-dom/server';
import { createRequire } from 'node:module';
import { applyFantasyAction, newFantasyProfile } from '../../../shared/fantasy-engine.ts';
const require = createRequire(import.meta.url), react = require('react') as typeof import('react'), snapshot = react.useSyncExternalStore;
react.useSyncExternalStore = (subscribe, value) => snapshot(subscribe, value, value);
const { FantasyEquipmentPanel } = require('./FantasyEquipmentPanel.tsx') as typeof import('./FantasyEquipmentPanel.tsx');
const { setLocale } = require('../locale.ts') as typeof import('../locale.ts');

test('travel-specific equipment access enables worn gear removal while keeping other busy panels locked in all locales', () => {
  const p = applyFantasyAction(newFantasyProfile(), { type: 'create', source: 'human', gender: 'female', name: 'Gear UI' }, () => .5).profile;
  const c = p.character!; c.inventory.blade = 1; c.equipment = { weapon: 'blade' };
  for (const locale of ['ko', 'en', 'ja'] as const) {
    setLocale(locale); const label = { ko: '해제', en: 'Unequip', ja: '外す' }[locale];
    for (const travelEquipment of [true, false]) {
      const html = renderToStaticMarkup(createElement(FantasyEquipmentPanel, { c, blocked: true, travelEquipment, onAction: () => { throw Error('Rendering cannot execute'); }, onInventory: () => {} }));
      const button = [...html.matchAll(/<button([^>]*)>(.*?)<\/button>/g)].find(match => match[2] === label);
      assert.ok(button, locale); assert.equal(button[1].includes('disabled'), !travelEquipment);
    }
  }
});
