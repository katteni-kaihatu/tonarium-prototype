import { test } from 'node:test';
import assert from 'node:assert/strict';
import * as THREE from 'three';
import { ControllerInput } from './controllerInput.ts';

const transform = { position: { x: 0, y: 1, z: 0 }, orientation: { x: 0, y: 0, z: 0, w: 1 } };

for (const space of ['target', 'grip'] as const) {
  test(`${space} tracking loss releases input before polling and requires a fresh press after recovery`, () => {
    const input = new ControllerInput(), controller = new THREE.Group();
    const buttons = Array.from({ length: 6 }, () => ({ pressed: false }));
    const source = { gripSpace: {}, gamepad: { mapping: 'xr-standard', buttons } } as unknown as XRInputSource;
    const state = { controller, source, target: transform, grip: transform };
    let resets = 0;
    let jumpDown = 0, jumpUp = 0, toggles = 0;
    const reset = () => {
      resets++; input.clear();
    };
    const poll = () => {
      const pressed = input.poll(controller, source);
      if (!pressed) return;
      const { current, old } = pressed;
      if (current[4] !== !!old[4]) { if (current[4]) jumpDown++; else jumpUp++; }
      if (current[5] && !old[5]) toggles++;
    };
    input.sync([state], reset); poll();
    buttons[4].pressed = buttons[5].pressed = true;
    input.sync([state], reset); poll();
    assert.deepEqual([jumpDown, toggles], [1, 1]);
    for (let i = 0; i < 3; i++) {
      input.sync([{ ...state, [space]: undefined }], reset); poll();
      assert.equal(input.tracked.has(controller), false);
      assert.equal(input.poll(controller, source), null);
      assert.deepEqual([jumpDown, toggles], [1, 1]);
    }
    assert.equal(resets, 1);
    input.sync([state], reset); poll();
    assert.equal(input.tracked.has(controller), true);
    assert.deepEqual([jumpDown, toggles], [1, 1]);
    buttons[4].pressed = buttons[5].pressed = false;
    input.sync([state], reset); poll();
    buttons[4].pressed = buttons[5].pressed = true;
    input.sync([state], reset); poll();
    assert.deepEqual([jumpDown, jumpUp, toggles], [2, 1, 2]);
  });
}

test('losing one hand does not replay held buttons on the other hand after reset', () => {
  const input = new ControllerInput();
  const states = [0, 1].map(() => ({ controller: new THREE.Group(), source: { gamepad: { mapping: 'xr-standard', buttons: [{ pressed: true }] } } as unknown as XRInputSource, target: transform, grip: undefined }));
  input.sync(states, () => input.clear());
  input.sync([{ ...states[0], target: undefined }, states[1]], () => input.clear());
  assert.deepEqual(input.poll(states[1].controller, states[1].source), { old: [true], current: [true] });
});
