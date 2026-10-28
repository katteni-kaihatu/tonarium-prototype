import assert from 'node:assert/strict';
import { test } from 'node:test';
import { set } from '../store.ts';
import { playChatNotification, unlockEmoteAudio } from './sounds.ts';

test('chat audio drops locked and muted arrivals, never queues them after resume, and contains failures', async (t) => {
  const previous = Object.getOwnPropertyDescriptor(globalThis, 'AudioContext');
  const contexts: FakeContext[] = [];
  let oscillators = 0, starts = 0, fail = false;
  let resume!: () => void;
  const param = () => ({ setValueAtTime() {}, exponentialRampToValueAtTime() {} });
  const node = () => ({ connect(target: unknown) { return target; }, disconnect() {} });
  class FakeContext {
    state = 'suspended';
    currentTime = 5;
    destination = {};
    constructor() { contexts.push(this); }
    resume() { return new Promise<void>((resolve) => { resume = () => { this.state = 'running'; resolve(); }; }); }
    createOscillator() {
      if (fail) throw new Error('audio unavailable');
      oscillators++;
      return { ...node(), frequency: param(), start() { starts++; }, stop() {}, type: 'sine', onended: null };
    }
    createGain() { return { ...node(), gain: param() }; }
  }
  Object.defineProperty(globalThis, 'AudioContext', { configurable: true, value: FakeContext });
  t.after(() => {
    if (previous) Object.defineProperty(globalThis, 'AudioContext', previous);
    else Reflect.deleteProperty(globalThis, 'AudioContext');
  });
  set({ audioVol: { voice: 1, fx: 0.5, media: 1 } });
  playChatNotification();
  assert.equal(contexts.length, 0);
  unlockEmoteAudio();
  playChatNotification();
  assert.equal(oscillators, 0);
  resume();
  await Promise.resolve();
  assert.equal(starts, 0);
  playChatNotification();
  assert.equal(starts, 2);
  set({ audioVol: { voice: 1, fx: 0, media: 1 } });
  playChatNotification();
  assert.equal(oscillators, 2);
  set({ audioVol: { voice: 1, fx: 0.5, media: 1 } });
  contexts[0].state = 'suspended';
  playChatNotification();
  unlockEmoteAudio();
  resume();
  await Promise.resolve();
  assert.equal(starts, 2);
  fail = true;
  assert.doesNotThrow(playChatNotification);
  fail = false;
  playChatNotification();
  assert.equal(starts, 4);
});
