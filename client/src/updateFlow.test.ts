import { test } from 'node:test';
import assert from 'node:assert/strict';
import { UpdateCountdown, readUpdatePreferences, saveUpdatePreferences, validUpdateSeconds } from './updateFlow.ts';

test('Web defaults on and Electron defaults off, both default to five seconds', () => {
  const storage = { getItem: () => null };
  assert.deepEqual(readUpdatePreferences(storage, false), { enabled: true, seconds: 5 });
  assert.deepEqual(readUpdatePreferences(storage, true), { enabled: false, seconds: 5 });
});
test('saved settings and invalid delays are validated', () => {
  for (const electron of [true, false]) {
    for (const seconds of [1, 300]) assert.deepEqual(readUpdatePreferences({ getItem: () => JSON.stringify({ enabled: false, seconds }) }, electron), { enabled: false, seconds });
    for (const seconds of [0, 301, 1.5, null, '5']) assert.equal(readUpdatePreferences({ getItem: () => JSON.stringify({ seconds }) }, electron).seconds, 5);
  }
  for (const n of [NaN, Infinity, 0, 301, 1.5]) assert.equal(validUpdateSeconds(n), false);
});

test('both environments persist on/off and boundary values independently', () => {
  const values = new Map<string, string>();
  const storage = { getItem: (key: string) => values.get(key) ?? null, setItem: (key: string, value: string) => { values.set(key, value); } };
  for (const electron of [false, true]) {
    for (const enabled of [false, true]) for (const seconds of [1, 300]) {
      saveUpdatePreferences(storage, electron, { enabled, seconds });
      assert.deepEqual(readUpdatePreferences(storage, electron), { enabled, seconds });
    }
    for (const seconds of [0, 301, 1.5, NaN]) assert.throws(() => saveUpdatePreferences(storage, electron, { enabled: false, seconds }));
    assert.deepEqual(readUpdatePreferences(storage, electron), { enabled: true, seconds: 300 });
  }
  assert.equal(values.size, 2);
});
test('newer updates replace the target without moving the running deadline', () => {
  const flow = new UpdateCountdown();
  flow.detect('v2', { enabled: true, seconds: 5 }, 1000);
  flow.detect('v3', { enabled: false, seconds: 300 }, 3000);
  assert.equal(flow.version, 'v3'); assert.equal(flow.remaining(3000), 3);
  assert.equal(flow.remaining(6000), 0);
});
test('cancel never resumes for the same version; a new version can restart', () => {
  const flow = new UpdateCountdown();
  flow.detect('v2', { enabled: true, seconds: 5 }, 0); flow.cancel();
  flow.detect('v2', { enabled: true, seconds: 10 }, 2000);
  assert.equal(flow.deadline, null);
  flow.detect('v3', { enabled: true, seconds: 10 }, 3000);
  assert.equal(flow.remaining(3000), 10);
});
