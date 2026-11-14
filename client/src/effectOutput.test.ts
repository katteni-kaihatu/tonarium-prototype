import assert from 'node:assert/strict';
import test from 'node:test';
import { effectOutput } from './effectOutput.ts';
import { get, set } from './store.ts';

test('effect outputs follow mute, edits and context replacement and unsubscribe on close', t => {
  const before = get();
  t.after(() => set(before));
  class Context extends EventTarget {
    state = 'running';
    currentTime = 1;
    destination = {};
    writes = 0;
    disconnected = false;
    createGain() {
      const parameter = { value: 0, setValueAtTime: (v: number) => { this.writes++; parameter.value = v; } };
      return {
        gain: parameter,
        connect: () => {}, disconnect: () => { this.disconnected = true; },
      };
    }
  }
  const context = new Context();
  set({ audioMuted: false, audioVol: { ...before.audioVol, fx: 0.3 } });
  const gain = effectOutput(context as unknown as AudioContext);
  assert.equal(effectOutput(context as unknown as AudioContext), gain);
  assert.equal(gain.gain.value, 0.3);
  set({ audioMuted: true });
  assert.equal(gain.gain.value, 0);
  set({ audioVol: { ...get().audioVol, fx: 0.8 } });
  assert.equal(gain.gain.value, 0);
  const replacement = new Context();
  const next = effectOutput(replacement as unknown as AudioContext);
  assert.equal(next.gain.value, 0);
  context.state = 'closed'; context.dispatchEvent(new Event('statechange'));
  const writes = context.writes;
  set({ audioMuted: false });
  assert.equal(next.gain.value, 0.8);
  assert.equal(context.writes, writes);
  assert.equal(context.disconnected, true);
  replacement.state = 'closed'; replacement.dispatchEvent(new Event('statechange'));
});
