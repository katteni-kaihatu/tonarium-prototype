import assert from 'node:assert/strict';
import test from 'node:test';
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { createItem, type Item } from '../shared/items.ts';
import { cameraTimerDemoMap } from '../shared/camera-timer-demo.ts';
import { systemDemoMap } from '../shared/system-demo.ts';
import type { SystemView } from '../shared/system-types.ts';
import { TimedCameraItems } from './timed-camera-items.ts';
import { SystemService } from './system-service.ts';

const root = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');
const scopeOf = (sid: string, item: Item) => JSON.stringify(['timed-camera', sid, item.id]);
const cameraState = (item: Item) => {
  assert.equal(item.kind, 'camera');
  assert.ok('timerState' in item && item.timerState);
  const state = item.timerState.systems.find(system => system.instanceId === 'camera-shot')?.state;
  assert.ok(state); return state;
};
const timer = (view: SystemView) => {
  const state = view.systems.find(system => system.instanceId === 'camera-delay')?.state;
  assert.ok(state); return state;
};
function camera(id: string, variant = true) {
  const item = createItem('camera', { id, x: 2, z: 3, ry: 0.5, createdBy: 'alice', ...(variant ? { variant: 'camera-timer' as const } : {}) }, () => 0.5);
  assert.ok(item && item.kind === 'camera'); return item;
}
function harness(t: { after(fn: () => void): void; mock: { method(object: object, method: string, implementation: () => number): unknown } }) {
  const directory = fs.mkdtempSync(path.join(os.tmpdir(), 'tonarium-timed-camera-'));
  t.after(() => fs.rmSync(directory, { recursive: true, force: true }));
  let now = 1000;
  t.mock.method(Date, 'now', () => now);
  const systems = new SystemService(directory, root);
  t.after(() => systems.dispose());
  assert.deepEqual(systems.startupErrors, []);
  return { directory, systems, helper: new TimedCameraItems(systems), at: (value: number) => { now = value; } };
}

test('ordinary menu cameras run isolated shared timer graphs without replacing the session map', t => {
  const { systems, helper, at } = harness(t), participants = ['alice', 'bob'];
  systems.load('room', 'alice', systemDemoMap, participants);
  systems.apply('room', 'alice', { kind: 'input', id: 'global-start', revision: systems.view('room').revision, instanceId: 'countdown', input: 'start', payload: {} }, participants);
  const before = systems.view('room'), originalGraph = structuredClone(cameraTimerDemoMap), first = camera('first'), second = camera('second'), ordinary = camera('ordinary', false);
  assert.deepEqual(helper.tick('room', [first, second, ordinary], participants), [first, second]);
  assert.equal(ordinary.timerState, undefined);
  assert.equal(helper.request('room', 'alice', first, 'alice-one', participants), true);
  at(2000);
  assert.equal(helper.request('room', 'bob', second, 'bob-one', participants), true);
  assert.equal(cameraState(first).deadline, 6000); assert.equal(cameraState(second).deadline, 7000);
  const pending = structuredClone(first.timerState);
  for (let index = 0; index < 30; index++) assert.equal(helper.request('room', 'bob', first, `spam-${index}`, participants), false);
  assert.deepEqual(first.timerState, pending);
  at(6000); assert.deepEqual(helper.tick('room', [first, second, ordinary], participants), [first, second]);
  assert.equal(cameraState(first)['completed-token'], 'alice-one');
  assert.equal(cameraState(first)['completed-by'], 'alice');
  assert.equal(cameraState(second).busy, true); assert.equal(timer(second.timerState!).remaining, 1);
  at(7000); helper.tick('room', [first, second], participants);
  assert.equal(cameraState(second)['completed-token'], 'bob-one');
  assert.equal(cameraState(second)['completed-by'], 'bob');
  assert.equal(cameraState(first).sequence, 1);
  assert.deepEqual(systems.view('room'), before);
  assert.deepEqual(cameraTimerDemoMap, originalGraph);
  assert.equal(helper.request('room', 'alice', first, 'alice-one', participants), false);
  assert.equal(helper.request('room', 'alice', first, 'alice-two', participants), true);
  assert.equal(cameraState(first).sequence, 2);
  assert.equal(timer(first.timerState!).remaining, 5);
});

test('tokens, actors, ordinary cameras and held cameras are rejected before starting a countdown', t => {
  const { helper, systems } = harness(t), item = camera('validation'), ordinary = camera('ordinary', false);
  for (const token of ['', ' ', 'x'.repeat(129), '<script>', 'invalid/token']) assert.equal(helper.request('room', 'alice', item, token, ['alice']), false);
  assert.equal(helper.request('room', 'outside', item, 'valid-token', ['alice']), false);
  assert.equal(helper.request('room', '', item, 'valid-token', ['alice']), false);
  assert.equal(helper.request('room', 'alice', ordinary, 'valid-token', ['alice']), false);
  item.holder = 'alice';
  assert.equal(helper.request('room', 'alice', item, 'valid-token', ['alice']), false);
  assert.equal(item.timerState, undefined);
  assert.equal(systems.view(scopeOf('room', item)).map.id, 'empty');
  item.holder = null;
  assert.equal(helper.request('room', 'alice', item, '8d51fd83-a7bc-4861-aabb-c2891b4fb721', ['alice']), true);
  assert.equal(cameraState(item).busy, true);
});

test('the same camera id in different sessions has independent countdown and removal state', t => {
  const { helper, at } = harness(t), first = camera('shared-id'), second = camera('shared-id');
  helper.request('first-room', 'alice', first, 'first-request', ['alice']);
  at(2000); helper.request('second-room', 'bob', second, 'second-request', ['bob']);
  helper.remove('first-room', first);
  assert.equal(first.timerState, undefined);
  at(7000); helper.tick('second-room', [second], ['bob']);
  assert.equal(cameraState(second)['completed-token'], 'second-request');
  helper.tick('first-room', [first], ['alice']);
  assert.equal(cameraState(first).busy, false); assert.equal(cameraState(first)['completed-token'], '');
  assert.equal(timer(first.timerState!).remaining, 5);
});

test('late join snapshots copy authoritative state and restart recovers a pending request once', t => {
  const { helper, systems, directory, at } = harness(t), item = camera('restart');
  helper.request('room', 'alice', item, 'persisted-request', ['alice']);
  at(3000); helper.tick('room', [item], ['alice']);
  const late = structuredClone(item);
  late.timerState!.systems.find(system => system.instanceId === 'camera-shot')!.state.busy = false;
  helper.tick('room', [late], ['alice', 'bob']);
  assert.equal(cameraState(late).busy, true);
  assert.equal(cameraState(late).requester, 'alice'); assert.equal(timer(late.timerState!).remaining, 3);
  assert.deepEqual(late.timerState, item.timerState);
  systems.dispose();
  const restarted = new SystemService(directory, root); t.after(() => restarted.dispose());
  const recovered = new TimedCameraItems(restarted), restoredItem = structuredClone(item);
  restoredItem.timerState = undefined;
  at(4000); recovered.tick('room', [restoredItem], ['alice', 'bob']);
  assert.equal(cameraState(restoredItem).token, 'persisted-request');
  assert.equal(cameraState(restoredItem).deadline, 6000); assert.equal(timer(restoredItem.timerState!).remaining, 2);
  at(6000); recovered.tick('room', [restoredItem], ['alice', 'bob']);
  assert.equal(cameraState(restoredItem)['completed-token'], 'persisted-request');
  assert.equal(cameraState(restoredItem)['completed-by'], 'alice'); assert.equal(cameraState(restoredItem).sequence, 1);
  const completed = structuredClone(restoredItem.timerState);
  at(9000); assert.deepEqual(recovered.tick('room', [restoredItem], ['alice', 'bob']), []);
  assert.deepEqual(restoredItem.timerState, completed);
});

test('requester departure cancels only their camera while a new viewer cannot finish an absent requester', t => {
  const { helper, systems, at } = harness(t), first = camera('alice-camera'), second = camera('bob-camera');
  helper.request('room', 'alice', first, 'alice-request', ['alice', 'bob']);
  helper.request('room', 'bob', second, 'bob-request', ['alice', 'bob']);
  helper.leave('room', 'alice', [first, second]);
  assert.equal(cameraState(first).busy, false); assert.equal(cameraState(first).requester, null);
  assert.equal(cameraState(first).token, ''); assert.equal(timer(first.timerState!).remaining, 5);
  assert.equal(cameraState(second).busy, true);
  at(6000); helper.tick('room', [first, second], ['bob']);
  assert.equal(cameraState(first)['completed-token'], ''); assert.equal(cameraState(second)['completed-token'], 'bob-request');
  helper.request('room', 'bob', first, 'abandoned-request', ['bob']);
  helper.release('room', [first, second]);
  const replacement = new TimedCameraItems(systems);
  at(11000); replacement.tick('room', [first, second], ['late-viewer']);
  assert.equal(cameraState(first).busy, false); assert.equal(cameraState(first).token, '');
  assert.equal(cameraState(first)['completed-token'], '');
});

test('holding or changing a native placement to system mode cancels and releases its private countdown', t => {
  const { helper, systems, directory, at } = harness(t), item = camera('placement');
  item.mapPlacement = { mapId: 'coded-map', objectId: 'camera-object', itemId: 'camera-timer', mode: 'native', position: [2, 0, 3], rotation: 0.5 };
  helper.request('room', 'alice', item, 'held-request', ['alice']);
  item.holder = 'bob'; helper.tick('room', [item], ['alice', 'bob']);
  assert.equal(cameraState(item).busy, false); assert.equal(cameraState(item).token, '');
  item.holder = null; helper.request('room', 'alice', item, 'mode-request', ['alice']);
  item.mapPlacement.mode = 'system';
  assert.equal(helper.request('room', 'alice', item, 'forbidden-system-request', ['alice']), false);
  assert.deepEqual(helper.tick('room', [item], ['alice']), [item]);
  assert.equal(item.timerState, undefined);
  assert.equal(systems.view(scopeOf('room', item)).map.id, 'empty');
  assert.deepEqual(helper.tick('room', [item], ['alice']), []);
  systems.dispose();
  const restarted = new SystemService(directory, root); t.after(() => restarted.dispose());
  const recovered = new TimedCameraItems(restarted);
  item.mapPlacement.mode = 'native';
  at(10000); recovered.tick('room', [item], ['alice']);
  assert.equal(cameraState(item).busy, false); assert.equal(cameraState(item)['completed-token'], '');
  assert.equal(cameraState(item).sequence, 0);
});

test('deletion clears saved schedules while release alone retains recoverable server state', t => {
  const { helper, systems, directory, at } = harness(t), item = camera('deletion'), kept = camera('released');
  helper.request('room', 'alice', item, 'deleted-request', ['alice']);
  helper.request('room', 'alice', kept, 'retained-request', ['alice']);
  helper.remove('room', item);
  helper.remove('room', item);
  assert.equal(item.timerState, undefined);
  assert.deepEqual(systems.view(scopeOf('room', item)).systems, []);
  assert.deepEqual(systems.view(scopeOf('room', item)).map.objects, []);
  const before = structuredClone(kept.timerState);
  helper.release('room', [kept]);
  assert.deepEqual(kept.timerState, before);
  systems.dispose();
  const restarted = new SystemService(directory, root); t.after(() => restarted.dispose());
  const recovered = new TimedCameraItems(restarted);
  at(6000); recovered.tick('room', [item, kept], ['alice']);
  assert.equal(cameraState(item).busy, false); assert.equal(cameraState(item)['completed-token'], '');
  assert.equal(cameraState(kept)['completed-token'], 'retained-request');
  assert.equal(cameraState(kept)['completed-by'], 'alice');
});
