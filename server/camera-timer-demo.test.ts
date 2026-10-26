import assert from 'node:assert/strict';
import test from 'node:test';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { cameraTimerDemoMap, cameraTimerRemoval, isCameraTimerItem } from '../shared/camera-timer-demo.ts';
import { createItem, type Item } from '../shared/items.ts';
import { validateSystemMap } from '../shared/systems.ts';
import type { SystemRuntimeState, SystemValue } from '../shared/system-types.ts';
import { validateSystemSubmission } from './system-catalog.ts';
import { SystemRuntime } from './system-runtime.ts';
import { reconcileSystemItems } from './system-items.ts';

const root = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');
const catalog = validateSystemSubmission(root).catalog;
function harness() {
  let time = 1000, command = 0, saved: SystemRuntimeState;
  const runtime = new SystemRuntime(() => catalog, state => { saved = state; }, undefined, () => time);
  runtime.apply('alice', { kind: 'map', id: 'install-camera', revision: 0, map: cameraTimerDemoMap }, ['alice', 'bob']);
  return {
    runtime,
    state: () => runtime.view().systems.find(system => system.instanceId === 'camera-shot')!.state,
    timer: () => runtime.view().systems.find(system => system.instanceId === 'camera-delay')!.state,
    saved: () => saved!,
    input(actor: string, input: string, payload: Record<string, SystemValue> = {}, participants = ['alice', 'bob']) {
      return runtime.apply(actor, { kind: 'input', id: `camera-input-${++command}`, revision: runtime.view().revision, instanceId: 'camera-shot', input, payload }, participants);
    },
    tick(at: number, participants = ['alice', 'bob']) { time = at; return runtime.tick(participants); },
    setTime(at: number) { time = at; },
  };
}

test('the camera example uses one existing camera item, shared timer and a validated token trigger', () => {
  assert.doesNotThrow(() => validateSystemMap(cameraTimerDemoMap, catalog));
  const example = harness(), view = example.runtime.view();
  const items = reconcileSystemItems(new Map(), view).items;
  assert.equal(items.size, 1); assert.equal(view.map.objects.length, 1);
  const camera = items.get('system-map:camera-timer-demo:delayed-camera')!;
  assert.equal(camera.kind, 'camera'); assert.equal(camera.mapPlacement?.mode, 'system');
  assert.equal(camera.x, 0); assert.equal(camera.z, -2); assert.equal(camera.ry, Math.PI);
  assert.equal(isCameraTimerItem(camera), true);
  assert.equal(example.timer().remaining, 5);
  assert.deepEqual(view.systems.find(system => system.instanceId === 'camera-delay')!.bindings, {});
  assert.deepEqual(view.systems.find(system => system.instanceId === 'camera-shot')!.bindings.camera, ['delayed-camera']);
  assert.equal(catalog.entries.find(entry => entry.id === 'camera-trigger')!.manifest.interaction, undefined);
  assert.throws(() => example.input('alice', 'request', { token: 123 }), /payload field: token/);
  assert.equal(example.state().busy, false);
});

test('five server seconds complete the original token once while rapid requests and other actors cannot replace it', () => {
  const example = harness();
  example.input('alice', 'request', { token: 'alice-shot-one' });
  assert.equal(example.state().busy, true); assert.equal(example.state().requester, 'alice');
  assert.equal(example.state().sequence, 1); assert.equal(example.state().deadline, 6000);
  assert.equal(example.timer().running, true); assert.equal(example.timer().remaining, 5);
  assert.equal(example.saved().schedules.length, 1); assert.equal(example.saved().schedules[0].actor, 'alice');
  const pending = structuredClone(example.saved().schedules);
  example.input('alice', 'request', { token: 'alice-spam' });
  example.input('bob', 'request', { token: 'bob-spam' });
  assert.equal(example.state().sequence, 1); assert.equal(example.state().token, 'alice-shot-one');
  assert.equal(example.state().deadline, 6000); assert.deepEqual(example.saved().schedules, pending);
  example.input('alice', 'complete'); assert.equal(example.state()['completed-token'], '');
  example.tick(5999);
  assert.equal(example.state().busy, true); assert.equal(example.state()['completed-token'], '');
  assert.equal(example.timer().remaining, 0.001);
  example.setTime(6000);
  example.input('bob', 'complete'); assert.equal(example.state()['completed-token'], '');
  example.tick(6000);
  assert.equal(example.state().busy, false); assert.equal(example.state()['completed-token'], 'alice-shot-one');
  assert.equal(example.state()['completed-by'], 'alice'); assert.equal(example.state().sequence, 1);
  assert.equal(example.timer().running, false); assert.equal(example.timer().remaining, 0);
  assert.deepEqual(example.saved().schedules, []);
  const completed = structuredClone(example.state());
  example.input('alice', 'complete'); example.input('bob', 'complete');
  assert.deepEqual(example.state(), completed); assert.equal(example.tick(10000), false);
  example.input('bob', 'request', { token: 'bob-next-shot' });
  assert.equal(example.state().sequence, 2); assert.equal(example.state().requester, 'bob');
  assert.equal(example.timer().remaining, 5); assert.equal(example.state().deadline, 15000);
  example.tick(15000);
  assert.equal(example.state()['completed-token'], 'bob-next-shot'); assert.equal(example.state()['completed-by'], 'bob');
});

test('only the requester leaving cancels the countdown and permits a fresh request', () => {
  const example = harness(); example.input('alice', 'request', { token: 'leaving-shot' });
  example.runtime.leave('bob'); assert.equal(example.state().busy, true); assert.equal(example.timer().running, true);
  example.runtime.leave('alice');
  assert.equal(example.state().busy, false); assert.equal(example.state().requester, null);
  assert.equal(example.state().token, ''); assert.equal(example.state().deadline, 0);
  assert.equal(example.state()['completed-token'], ''); assert.equal(example.state()['completed-by'], null);
  assert.equal(example.timer().running, false); assert.equal(example.timer().remaining, 5);
  assert.deepEqual(example.saved().schedules, []); assert.equal(example.tick(10000, ['bob']), false);
  example.input('bob', 'request', { token: 'after-departure' }, ['bob']); example.tick(15000, ['bob']);
  assert.equal(example.state()['completed-token'], 'after-departure'); assert.equal(example.state()['completed-by'], 'bob');
});

test('restoring persisted runtime state retains the request and finishes only its original owner', () => {
  const example = harness(); example.input('alice', 'request', { token: 'before-restart' }); example.tick(3000);
  const saved = structuredClone(example.saved()); example.runtime.dispose();
  let time = 5999, persisted = saved;
  const restored = new SystemRuntime(() => catalog, state => { persisted = state; }, saved, () => time);
  assert.equal(restored.view().systems.find(system => system.instanceId === 'camera-shot')!.state['completed-token'], '');
  restored.tick(['alice', 'bob']);
  time = 6000; restored.tick(['alice', 'bob']);
  const completed = restored.view().systems.find(system => system.instanceId === 'camera-shot')!.state;
  assert.equal(completed['completed-token'], 'before-restart'); assert.equal(completed['completed-by'], 'alice');
  assert.equal(completed.sequence, 1); assert.deepEqual(persisted.schedules, []);
  assert.equal(restored.tick(['alice', 'bob']), false);
});

test('removing the running camera cancels scheduled work, preserves ordinary items and can be placed again', () => {
  const example = harness();
  const ordinary = createItem('dice', { id: 'ordinary-dice', x: 2, z: 3, ry: 0, createdBy: 'bob' }, () => 0.5)!;
  let items = reconcileSystemItems(new Map([[ordinary.id, ordinary]]), example.runtime.view()).items;
  const camera = [...items.values()].find(isCameraTimerItem)!;
  example.input('alice', 'request', { token: 'remove-pending-shot' }); example.tick(2000);
  assert.equal(example.saved().schedules.length, 1);
  const before = example.runtime.view(), original = structuredClone(cameraTimerDemoMap);
  const removal = cameraTimerRemoval(before, camera); assert.ok(removal);
  assert.deepEqual(before, example.runtime.view()); assert.deepEqual(cameraTimerDemoMap, original);
  assert.doesNotThrow(() => validateSystemMap(removal, catalog));
  example.runtime.apply('bob', { kind: 'map', id: 'remove-camera', revision: before.revision, map: removal }, ['alice', 'bob']);
  assert.deepEqual(example.saved().schedules, []);
  assert.deepEqual(example.runtime.view().systems, []); assert.deepEqual(example.runtime.view().map.objects, []);
  assert.deepEqual(example.runtime.view().map.connections, []);
  const changes = reconcileSystemItems(items, example.runtime.view()); items = changes.items;
  assert.deepEqual(changes.removed, [camera.id]); assert.deepEqual([...items.values()], [ordinary]);
  assert.equal(example.tick(7000), false);
  assert.equal(example.runtime.view().traces.some(trace => trace.instanceId === 'camera-shot' && trace.event === 'complete'), false);
  const restored = new SystemRuntime(() => catalog, () => {}, example.saved(), () => 10000);
  assert.deepEqual(restored.view().systems, []); assert.equal(restored.tick(['alice', 'bob']), false);
  example.runtime.apply('alice', { kind: 'map', id: 'place-camera-again', revision: example.runtime.view().revision, map: cameraTimerDemoMap }, ['alice', 'bob']);
  items = reconcileSystemItems(items, example.runtime.view()).items;
  assert.equal(items.size, 2); assert.deepEqual(items.get(ordinary.id), ordinary);
  assert.equal(isCameraTimerItem(items.get(camera.id)!), true);
  assert.equal(example.state().busy, false); assert.equal(example.state()['completed-token'], '');
  assert.equal(example.timer().remaining, 5); assert.deepEqual(example.saved().schedules, []);
});

test('camera removal rejects ordinary, forged, mismatched and missing placements', () => {
  const view = harness().runtime.view(), camera = [...reconcileSystemItems(new Map(), view).items.values()][0];
  const ordinary = createItem('camera', { id: 'normal-camera', x: 0, z: 0, ry: 0, createdBy: 'alice' }, () => 0.5)!;
  const wrongKind = createItem('dice', { id: camera.id, x: 0, z: 0, ry: 0, createdBy: 'alice' }, () => 0.5)!;
  wrongKind.mapPlacement = structuredClone(camera.mapPlacement);
  const invalid: Item[] = [ordinary, wrongKind, { ...camera, id: 'forged-id' }, { ...camera, mapPlacement: undefined }];
  for (const patch of [{ mapId: 'other-map' }, { objectId: 'other-camera' }, { itemId: 'note' }, { mode: 'native' as const }]) invalid.push({ ...camera, mapPlacement: { ...camera.mapPlacement!, ...patch } });
  for (const item of invalid) {
    assert.equal(isCameraTimerItem(item), false); assert.equal(cameraTimerRemoval(view, item), undefined);
  }
  const otherMap = structuredClone(view); otherMap.map.id = 'other-map'; assert.equal(cameraTimerRemoval(otherMap, camera), undefined);
  const missingDefinition = structuredClone(view); missingDefinition.map.objects = []; assert.equal(cameraTimerRemoval(missingDefinition, camera), undefined);
  const missingState = structuredClone(view); delete missingState.objects['delayed-camera']; assert.equal(cameraTimerRemoval(missingState, camera), undefined);
  const differentItem = structuredClone(view); differentItem.map.objects[0].itemId = 'note'; assert.equal(cameraTimerRemoval(differentItem, camera), undefined);
  const differentMode = structuredClone(view); differentMode.map.objects[0].itemMode = 'native'; assert.equal(cameraTimerRemoval(differentMode, camera), undefined);
});

test('camera removal keeps unrelated map objects, systems and connections unchanged', () => {
  const view = harness().runtime.view(), camera = [...reconcileSystemItems(new Map(), view).items.values()][0];
  view.map.objects.push({ id: 'ordinary-code-button', capabilities: ['interact'], position: [3, 0, 1] });
  view.map.systems.push(
    { instanceId: 'ordinary-button', systemId: 'button', bindings: { target: ['ordinary-code-button'] }, config: {} },
    { instanceId: 'ordinary-timer', systemId: 'timer', bindings: {}, config: { duration: 12 } },
  );
  const connection = { from: 'ordinary-button', output: 'pressed', to: 'ordinary-timer', input: 'start' };
  view.map.connections.push(connection);
  const before = structuredClone(view), result = cameraTimerRemoval(view, camera); assert.ok(result);
  assert.deepEqual(view, before); assert.doesNotThrow(() => validateSystemMap(result, catalog));
  assert.deepEqual(result.objects, [view.map.objects[1]]);
  assert.deepEqual(result.systems.map(system => system.instanceId), ['ordinary-button', 'ordinary-timer']);
  assert.deepEqual(result.connections, [connection]);
});
