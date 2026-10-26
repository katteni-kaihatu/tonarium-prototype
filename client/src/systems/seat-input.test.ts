import { test } from 'node:test';
import assert from 'node:assert/strict';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { SystemRuntime } from '../../../server/system-runtime.ts';
import { validateSystemSubmission } from '../../../server/system-catalog.ts';
import { systemDemoMap } from '../../../shared/system-demo.ts';
import { SeatSpaceShortcut, standInput, type SeatKeyEvent } from './seat-input.ts';

const root = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '../../..');
function key(code = 'Space', repeat = false, target?: unknown) {
  const event: SeatKeyEvent & { prevented: boolean; stopped: boolean } = {
    code, repeat, target, prevented: false, stopped: false,
    preventDefault() { this.prevented = true; }, stopImmediatePropagation() { this.stopped = true; },
  };
  return event;
}

test('Space stands the connected actor through the bound system and never becomes a held-key jump', () => {
  const catalog = validateSystemSubmission(root).catalog;
  const runtime = new SystemRuntime(() => catalog, () => {});
  runtime.apply('alice', { kind: 'map', id: 'install', revision: 0, map: systemDemoMap }, ['alice', 'bob']);
  runtime.apply('alice', { kind: 'input', id: 'sit', revision: 1, instanceId: 'seat', input: 'sit', payload: { user: 'alice' } }, ['alice', 'bob']);
  let requests = 0;
  const shortcut = new SeatSpaceShortcut(() => Object.values(runtime.view().seats).includes('alice'), () => {
    requests++;
    const input = standInput(runtime.view(), catalog, 'alice'); assert.ok(input);
    runtime.apply('alice', { kind: 'input', id: 'stand', revision: runtime.view().revision, ...input }, ['alice', 'bob']);
  });
  const press = key(); assert.equal(shortcut.down(press), true); assert.ok(press.prevented && press.stopped);
  assert.equal(runtime.view().seats['chair-object'], undefined);
  assert.equal(shortcut.down(key('Space', true)), true);
  assert.equal(shortcut.down(key('Space', true)), true); assert.equal(requests, 1);
  const release = key(); shortcut.up(release); assert.ok(release.prevented && release.stopped);
  const standing = key(); assert.equal(shortcut.down(standing), false); assert.equal(standing.prevented, false);
});

test('stand resolution uses the occupied seat owner and exact running original', () => {
  const catalog = validateSystemSubmission(root).catalog;
  const runtime = new SystemRuntime(() => catalog, () => {});
  runtime.apply('bob', { kind: 'map', id: 'install', revision: 0, map: systemDemoMap }, ['bob']);
  runtime.apply('bob', { kind: 'input', id: 'sit', revision: 1, instanceId: 'seat', input: 'sit', payload: { user: 'bob' } }, ['bob']);
  const view = runtime.view();
  assert.equal(standInput(view, catalog, 'alice'), undefined);
  assert.deepEqual(standInput(view, catalog, 'bob'), { instanceId: 'seat', input: 'stand', payload: { user: 'bob' } });
  const missingOriginal = structuredClone(catalog); missingOriginal.entries = missingOriginal.entries.filter(entry => entry.id !== 'chair');
  assert.equal(standInput(view, missingOriginal, 'bob'), undefined);
});

test('typing, composing, selection menus and unrelated keys retain their normal behavior', () => {
  let requests = 0;
  const shortcut = new SeatSpaceShortcut(() => true, () => requests++);
  for (const target of [{ tagName: 'INPUT' }, { tagName: 'TEXTAREA' }, { tagName: 'SELECT' }, { isContentEditable: true }, { closest: () => ({}) }]) {
    const event = key('Space', false, target); assert.equal(shortcut.down(event), false); assert.equal(event.prevented, false);
  }
  const composing = key(); composing.isComposing = true; assert.equal(shortcut.down(composing), false);
  assert.equal(shortcut.down(key('Enter')), false); assert.equal(requests, 0);
});

test('repeated held input never triggers an unrequested exit and blur resets the latch', () => {
  let seated = true, requests = 0;
  const shortcut = new SeatSpaceShortcut(() => seated, () => requests++);
  assert.equal(shortcut.down(key('Space', true)), true); assert.equal(requests, 0);
  shortcut.reset(); assert.equal(shortcut.down(key()), true); assert.equal(requests, 1);
  seated = false; shortcut.reset(); assert.equal(shortcut.down(key()), false);
});
