import assert from 'node:assert/strict';
import test from 'node:test';
import { fileURLToPath } from 'node:url';
import { createItem, type Item } from '../../../shared/items.ts';
import { cameraTimerDemoMap } from '../../../shared/camera-timer-demo.ts';
import { validateSystemSubmission } from '../../../server/system-catalog.ts';
import { SystemRuntime } from '../../../server/system-runtime.ts';
import { bindTimedCameraRequest, createTimedCameraController, timedCameraSeconds, triggerTimedCameraRequest } from './timed-camera-controller.ts';

type CameraItem = Extract<Item, { kind: 'camera' }>;
const catalog = validateSystemSubmission(fileURLToPath(new URL('../../../', import.meta.url))).catalog;

function fixture(id = 'camera-one') {
  let now = 10000, sequence = 0, nonce = 0;
  const runtime = new SystemRuntime(() => catalog, () => {}, undefined, () => now);
  runtime.apply('alice', { kind: 'map', id: 'map', revision: 0, map: cameraTimerDemoMap }, ['alice', 'bob']);
  const item = createItem('camera', { id, variant: 'camera-timer', x: 2, z: -3, ry: .7, createdBy: 'alice' }, () => 0);
  assert.ok(item?.kind === 'camera');
  item.cameraY = 3.6; item.groundY = 2;
  const context = { present: true, ready: true, state: true };
  const captured: CameraItem[] = [], tokens: string[] = [];
  let beeps = 0, prepared = 0, failed = 0, notReady = 0;
  const options: Parameters<typeof createTimedCameraController>[0] = {
    user: 'alice',
    read: () => context.present ? { ...item, timerState: context.state ? runtime.view() : undefined } : undefined,
    ready: () => context.ready, now: () => now, nonce: () => `${id}-${++nonce}`,
    send(token) { tokens.push(token); runtime.apply('alice', { kind: 'input', id: `request-${sequence++}`, revision: runtime.view().revision, instanceId: 'camera-shot', input: 'request', payload: { token } }, ['alice', 'bob']); },
    capture: camera => { captured.push(camera); }, beep: () => { beeps++; }, prepare: () => { prepared++; },
    failed: () => { failed++; }, notReady: () => { notReady++; },
  };
  const controller = createTimedCameraController(options);
  return {
    item, runtime, context, captured, tokens, options, controller,
    at(time: number) { now = time; runtime.tick(['alice', 'bob']); return runtime.view(); },
    get counts() { return { beeps, prepared, failed, notReady }; },
  };
}

test('native timer camera uses its shared five-second logic, beeps once per second and posts one photo from its latest pose', () => {
  const f = fixture();
  assert.equal(f.controller.start(), true); assert.equal(f.controller.start(), false); assert.equal(f.tokens.length, 1);
  assert.equal(f.counts.prepared, 1);
  for (let second = 0; second < 5; second++) {
    const now = 10000 + second * 1000, view = f.at(now);
    assert.equal(timedCameraSeconds(view, now), String(5 - second));
    f.controller.update(); f.controller.update();
    assert.equal(f.counts.beeps, second + 1); assert.equal(f.captured.length, 0);
  }
  f.item.x = 4; f.item.cameraY = 4.2; f.item.groundY = 3;
  const complete = f.at(15000); f.controller.update(); f.controller.update();
  assert.equal(timedCameraSeconds(complete, 15000), undefined);
  assert.equal(f.controller.waiting, false); assert.equal(f.captured.length, 1);
  assert.deepEqual([f.captured[0].id, f.captured[0].x, f.captured[0].cameraY, f.captured[0].groundY], ['camera-one', 4, 4.2, 3]);
});

test('two placed timer cameras remain independent and another tab cannot replay either completion', () => {
  const first = fixture('first'), second = fixture('second');
  const otherTab = createTimedCameraController({ ...first.options, capture: () => assert.fail('another tab must not capture') });
  const unbindFirst = bindTimedCameraRequest(first.item.id, first.controller.start), unbindSecond = bindTimedCameraRequest(second.item.id, second.controller.start);
  try {
    assert.equal(triggerTimedCameraRequest('first'), true);
    second.at(12000); assert.equal(triggerTimedCameraRequest('second'), true);
    first.at(15000); first.controller.update(); otherTab.update();
    second.at(15000); second.controller.update();
    assert.equal(first.captured.length, 1); assert.equal(second.captured.length, 0);
    assert.equal(timedCameraSeconds(second.runtime.view(), 15000), '2');
    second.at(17000); second.controller.update(); first.controller.update(); otherTab.update();
    assert.equal(first.captured.length, 1); assert.equal(second.captured.length, 1);
    const lateTab = createTimedCameraController({ ...second.options, capture: () => assert.fail('late arrival must not capture') });
    lateTab.update(); assert.equal(lateTab.waiting, false);
  } finally { unbindFirst(); unbindSecond(); }
});

test('loss of the current 3D/session/item context cancels pending capture instead of replaying after reconnect', () => {
  for (const reason of ['mode', 'session', 'delete', 'renderer'] as const) {
    const f = fixture(reason);
    assert.equal(f.controller.start(), true); f.controller.update();
    if (reason === 'renderer') f.context.ready = false; else f.context.present = false;
    f.controller.update(); assert.equal(f.controller.waiting, false);
    f.context.present = true; f.context.ready = true; f.at(15000); f.controller.update();
    assert.equal(f.captured.length, 0, reason);
  }
});

test('unready, ordinary and system-controlled cameras cannot start the intrinsic timer request', () => {
  const f = fixture();
  f.context.ready = false; assert.equal(f.controller.start(), false); assert.equal(f.counts.notReady, 1);
  f.context.ready = true; f.item.variant = undefined; assert.equal(f.controller.start(), false);
  f.item.variant = 'camera-timer'; f.item.mapPlacement = { mapId: 'author-map', objectId: 'camera', itemId: 'camera-timer', mode: 'system', position: [0, 0, 0], rotation: 0 };
  assert.equal(f.controller.start(), false); assert.equal(f.tokens.length, 0); assert.equal(f.counts.prepared, 0);
  f.item.mapPlacement.mode = 'native'; assert.equal(f.controller.start(), true);
});

test('missing initial state has a bounded wait, failed capture is consumed and gesture registration cleans up safely', () => {
  const timeout = fixture('timeout'); timeout.context.state = false;
  assert.equal(timeout.controller.start(), true); timeout.controller.update(); assert.equal(timeout.controller.waiting, true);
  timeout.at(25001); timeout.controller.update(); assert.equal(timeout.controller.waiting, false); assert.equal(timeout.counts.failed, 1);
  timeout.context.state = true; timeout.controller.update(); assert.equal(timeout.captured.length, 0);
  const f = fixture('failure'), failed = createTimedCameraController({ ...f.options, capture: () => { throw new Error('renderer lost'); } });
  assert.equal(failed.start(), true); failed.update(); f.at(15000); failed.update(); failed.update();
  assert.equal(f.counts.failed, 1); assert.equal(failed.waiting, false);
  const first = bindTimedCameraRequest('same', () => true), second = bindTimedCameraRequest('same', () => false);
  first(); assert.equal(triggerTimedCameraRequest('same'), false);
  second(); assert.equal(triggerTimedCameraRequest('same'), undefined);
});

test('server clock corrections do not expire a request before the local waiting budget', () => {
  const f = fixture('clock'); let elapsed = 0;
  const controller = createTimedCameraController({ ...f.options, elapsed: () => elapsed });
  assert.equal(controller.start(), true); controller.update();
  elapsed = 5000; f.at(30000); controller.update();
  assert.equal(f.captured.length, 1); assert.equal(f.counts.failed, 0);
});
