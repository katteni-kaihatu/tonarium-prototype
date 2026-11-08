import test from 'node:test';
import assert from 'node:assert/strict';
import { battleInputFor } from './battlefield-input.ts';
import { battlefieldAvatars } from './battlefield-state.ts';
import { Battlefields } from '../../server/battlefield.ts';
import { BATTLEFIELD } from '../../shared/battlefield.ts';
import ja from './i18n/ja.ts';
import en from './i18n/en.ts';
import ko from './i18n/ko.ts';
import { readFileSync } from 'node:fs';
import { ITEM_VARIANTS } from '../../shared/item-variants.ts';
import { WORLDS } from '../../shared/worlds.ts';

test('all combat UI and source-matched world/tank metadata have Japanese, English and Korean text', () => {
  const keys = Object.keys(ja).filter(key => key.startsWith('battle'));
  assert.ok(keys.length >= 16);
  for (const key of keys) {
    const values = [ja, en, ko].map(locale => (locale as Record<string, string>)[key]);
    for (const value of values) assert.ok(value?.trim(), key);
    assert.deepEqual(values[0].match(/\{\d+\}/g), values[1].match(/\{\d+\}/g));
    assert.deepEqual(values[0].match(/\{\d+\}/g), values[2].match(/\{\d+\}/g));
  }
  const metadata = JSON.parse(readFileSync(new URL('../../content-locales/metadata.json', import.meta.url), 'utf8'));
  for (const [key, source] of [['world/battlefield', WORLDS.battlefield], ['item/battlefield-tank', { ...ITEM_VARIANTS['battlefield-tank'].info, usage: ITEM_VARIANTS['battlefield-tank'].usage }]] as const) {
    for (const [name, field] of Object.entries(metadata.entries[key].fields) as [string, { source: string; translations: Record<string, string> }][]) {
      assert.equal(field.source, (source as unknown as Record<string, string>)[name]);
      assert.ok(field.translations.en?.trim()); assert.ok(field.translations.ko?.trim());
    }
  }
});

test('2D world axes and 3D camera axes produce the same combat input', () => {
  const flat = battleInputFor({ KeyD: true }, -Math.PI / 2, false, true);
  const spatial = battleInputFor({ KeyW: true }, -Math.PI / 2, true, true);
  assert.ok(Math.abs(flat.x - spatial.x) < 1e-9); assert.ok(Math.abs(flat.z - spatial.z) < 1e-9);
  assert.equal(flat.fire, spatial.fire); assert.equal(flat.aim, spatial.aim);
  const diagonal = battleInputFor({ KeyW: true, KeyD: true }, 0, false, false); assert.equal(Math.hypot(diagonal.x, diagonal.z), 1);
});
test('both inputs drive the same server actor and snapshot projection preserves tank and bot state', () => {
  let at = 1000;
  const battles = new Battlefields({ now: () => at, random: () => .5, members: () => [{ id: 'a' }], owner: () => 'a', solids: () => [...BATTLEFIELD.solids], publish: () => {} });
  const state = battles.ensure('s'); const a = state.actors.a;
  for (const relative of [false, true]) {
    assert.ok(battles.command('s', 'a', { t: 'battleInput', input: battleInputFor({ KeyW: true }, 0, relative, false) }));
    at += 50; battles.update('s');
  }
  assert.equal(a.z, 6.6);
  Object.assign(a, { x: -8, z: 6 }); assert.ok(battles.command('s', 'a', { t: 'battleMount', id: 'battlefield-tank-red' }));
  battles.command('s', 'a', { t: 'battleBot', action: 'add' });
  const before = JSON.stringify(state);
  {
    const restored = structuredClone(state), positions = battlefieldAvatars(restored);
    assert.equal(restored.actors.a.tank, 'battlefield-tank-red'); assert.equal(restored.tanks['battlefield-tank-red'].rider, 'a');
    assert.equal(positions.a.x, a.x); assert.equal(positions.a.y, 1); assert.equal(Object.keys(positions).length, 1);
    assert.ok(Object.values(restored.actors).some(p => p.bot));
  }
  assert.equal(JSON.stringify(state), before);
});
