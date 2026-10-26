import assert from 'node:assert/strict';
import test from 'node:test';
import { fileURLToPath } from 'node:url';
import { CameraCountdown, cameraTimerLabel } from './camera-countdown.ts';
import { cameraTimerDemoMap } from '../../../shared/camera-timer-demo.ts';
import { SystemRuntime } from '../../../server/system-runtime.ts';
import { validateSystemSubmission } from '../../../server/system-catalog.ts';
import { reconcileSystemItems } from '../../../server/system-items.ts';

const root = fileURLToPath(new URL('../../../', import.meta.url));
const catalog = validateSystemSubmission(root).catalog;
function setup() {
  let now = 10_000, command = 0;
  const runtime = new SystemRuntime(() => catalog, () => {}, undefined, () => now);
  runtime.apply('alice', { kind: 'map', id: `map-${command++}`, revision: 0, map: cameraTimerDemoMap }, ['alice', 'bob']);
  return {
    runtime,
    request(actor: string, token: string) { runtime.apply(actor, { kind: 'input', id: `request-${command++}`, revision: runtime.view().revision, instanceId: 'camera-shot', input: 'request', payload: { token } }, ['alice', 'bob']); },
    at(time: number) { now = time; runtime.tick(['alice', 'bob']); return runtime.view(); },
  };
}

test('the shared five-second timer beeps once per remaining second and captures once only in the initiating tab', () => {
  const h = setup(), owner = new CameraCountdown(), otherTab = new CameraCountdown();
  owner.begin('own-click'); h.request('alice', 'own-click');
  for (let second = 0; second < 5; second++) {
    const now = 10_000 + second * 1_000, view = h.at(now);
    assert.deepEqual(owner.update(view, 'alice', now), { beep: true, capture: false });
    assert.deepEqual(owner.update(view, 'alice', now + 50), { beep: false, capture: false });
    assert.deepEqual(otherTab.update(view, 'alice', now), { beep: false, capture: false });
  }
  const finished = h.at(15_000);
  assert.deepEqual(owner.update(finished, 'alice', 15_000), { beep: false, capture: true });
  assert.deepEqual(owner.update(finished, 'alice', 15_050), { beep: false, capture: false });
  assert.deepEqual(otherTab.update(finished, 'alice', 15_000), { beep: false, capture: false });
});

test('racing clicks and same-user tabs cannot claim another request token', () => {
  const h = setup(), alice = new CameraCountdown(), sameUser = new CameraCountdown(), bob = new CameraCountdown();
  alice.begin('first'); sameUser.begin('second'); bob.begin('third');
  h.request('alice', 'first'); h.request('alice', 'second'); h.request('bob', 'third');
  const running = h.runtime.view();
  alice.update(running, 'alice', 10_000); sameUser.update(running, 'alice', 10_000); bob.update(running, 'bob', 10_000);
  assert.equal(alice.waiting, true); assert.equal(sameUser.waiting, false); assert.equal(bob.waiting, false);
  const finished = h.at(15_000);
  assert.equal(alice.update(finished, 'alice', 15_000).capture, true);
  assert.equal(sameUser.update(finished, 'alice', 15_000).capture, false);
  assert.equal(bob.update(finished, 'bob', 15_000).capture, false);
});

test('late arrival, reconnect cancellation, and missing maps do not replay an old photo', () => {
  const h = setup(), pending = new CameraCountdown();
  pending.begin('before-disconnect'); h.request('alice', 'before-disconnect');
  pending.update(h.runtime.view(), 'alice', 10_000); pending.cancel();
  const finished = h.at(15_000);
  assert.equal(pending.update(finished, 'alice', 15_000).capture, false);
  assert.equal(new CameraCountdown().update(finished, 'alice', 15_000).capture, false);
  pending.begin('another'); pending.update(undefined, 'alice', 15_000); assert.equal(pending.waiting, false);
});

test('clock adjustments and delayed updates never burst or replay past beeps', () => {
  const h = setup(), pending = new CameraCountdown(); pending.begin('slow'); h.request('alice', 'slow');
  const view = h.runtime.view();
  assert.equal(pending.update(view, 'alice', 10_000).beep, true);
  assert.equal(pending.update(view, 'alice', 13_100).beep, true);
  assert.equal(pending.update(view, 'alice', 11_000).beep, false);
  assert.equal(pending.update(view, 'alice', 13_300).beep, false);
  assert.equal(pending.update(view, 'alice', 14_100).beep, true);
  assert.equal(pending.update(view, 'alice', 15_100).beep, false);
});

test('a retried revision conflict preserves the click token while a final command error cancels it', () => {
  const h = setup(), pending = new CameraCountdown(); pending.begin('retry');
  pending.update(h.runtime.view(), 'alice', 10_000, 'system revision conflict');
  assert.equal(pending.waiting, true);
  h.request('alice', 'retry');
  assert.equal(pending.update(h.runtime.view(), 'alice', 10_000).beep, true);
  assert.equal(pending.update(h.at(15_000), 'alice', 15_000).capture, true);
  pending.begin('failed');
  pending.update(h.runtime.view(), 'alice', 15_000, 'command failed');
  assert.equal(pending.waiting, false);
});

test('the one camera shows its shared remaining seconds above the original model without a separate display item', () => {
  const h = setup();
  const items = reconcileSystemItems(new Map(), h.runtime.view()).items;
  assert.equal(items.size, 1);
  const camera = [...items.values()][0];
  assert.equal(camera.kind, 'camera');
  assert.equal(cameraTimerLabel(camera, h.runtime.view()), undefined);
  h.request('alice', 'visible-countdown');
  for (let second = 0; second < 5; second++) assert.equal(cameraTimerLabel(camera, h.at(10_000 + second * 1_000)), String(5 - second));
  assert.equal(cameraTimerLabel(camera, h.at(15_000)), undefined);
  assert.equal(cameraTimerLabel(camera, undefined), undefined);
});
