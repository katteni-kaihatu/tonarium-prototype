import { test } from 'node:test';
import assert from 'node:assert/strict';
import { CrouchInput } from './crouch.ts';

const normal = { typing: false, operating: true, camera: false, repeat: false };

test('holding C publishes crouch once and release publishes standing immediately', () => {
  const states: boolean[] = [];
  const input = new CrouchInput(value => states.push(value));
  input.down(normal);
  input.down({ ...normal, repeat: true });
  assert.equal(input.active, true);
  assert.deepEqual(states, [true]);
  input.release();
  assert.equal(input.active, false);
  assert.deepEqual(states, [true, false]);
});

test('photo and typing consume the press until release, including focus changes', () => {
  for (const context of [{ camera: true }, { typing: true }, { operating: false }]) {
    const states: boolean[] = [];
    const input = new CrouchInput(value => states.push(value));
    const action = input.down({ ...normal, ...context });
    assert.equal(action, 'camera' in context ? 'photo' : undefined);
    input.down(normal);
    input.down({ ...normal, repeat: true });
    assert.deepEqual(states, []);
    input.release();
    input.down(normal);
    assert.deepEqual(states, [true]);
  }
  const input = new CrouchInput(() => assert.fail('typing must not change posture'));
  assert.equal(input.down({ ...normal, camera: true, typing: true }), undefined);
});

test('focus loss clears and publishes without waiting for a render frame or keyup', () => {
  const states: boolean[] = [];
  const input = new CrouchInput(value => states.push(value));
  input.down(normal);
  input.release();
  input.down({ ...normal, repeat: true });
  assert.deepEqual(states, [true, false]);
  input.down(normal);
  input.cancel();
  input.down(normal);
  assert.deepEqual(states, [true, false, true, false]);
  input.release();
  input.down(normal);
  assert.equal(input.active, true);
});
