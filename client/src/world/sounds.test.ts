import assert from 'node:assert/strict';
import { test } from 'node:test';
import { get, set } from '../store.ts';
import { playChatNotification, unlockEmoteAudio } from './sounds.ts';

test('chat audio drops locked and muted arrivals, never queues them after resume, and contains failures', async (t) => {
  const previous = Object.getOwnPropertyDescriptor(globalThis, 'AudioContext');
  const contexts: FakeContext[] = [];
  const outputs: {value:number}[] = [];
  let oscillators = 0, starts = 0, fail = false;
  let resume!: () => void;
  const param = () => ({ setValueAtTime() {}, exponentialRampToValueAtTime() {} });
  const node = () => ({ connect(target: unknown) { return target; }, disconnect() {} });
  class FakeContext extends EventTarget {
    state = 'suspended';
    currentTime = 5;
    destination = {};
    constructor() { super(); contexts.push(this); }
    resume() { return new Promise<void>((resolve) => { resume = () => { this.state = 'running'; resolve(); }; }); }
    createOscillator() {
      if (fail) throw new Error('audio unavailable');
      oscillators++;
      return { ...node(), frequency: param(), start() { starts++; }, stop() {}, type: 'sine', onended: null };
    }
    createGain() { const gain = {value: 0, ...param(), setValueAtTime(v:number) { this.value=v; }}; outputs.push(gain); return { ...node(), gain }; }
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
  const output = outputs[0];
  assert.equal(output.value, 0.5);
  set({audioMuted:true});
  assert.equal(output.value, 0);
  playChatNotification();
  assert.equal(starts, 4);
  assert.equal(output.value, 0);
  set({audioVol:{...get().audioVol, fx:0.3}});
  assert.equal(output.value, 0);
  set({audioMuted:false});
  assert.equal(output.value, 0.3);
  const beforeFail = starts;
  fail = true;
  assert.doesNotThrow(playChatNotification);
  fail = false;
  playChatNotification();
  assert.equal(starts, beforeFail + 2);
});
