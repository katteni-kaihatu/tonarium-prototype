import assert from 'node:assert/strict';
import test from 'node:test';
import { get, set } from '../store.ts';
import { playCountdownBeep, prepareCountdownSound } from './effects.ts';

class Parameter {
  values: Array<[number, number]> = [];
  setValueAtTime(value: number, at: number) { this.values.push([value, at]); }
  linearRampToValueAtTime(value: number, at: number) { this.values.push([value, at]); }
}
class Gain {
  gain = new Parameter();
  disconnected = false;
  connect(target: unknown) { return target; }
  disconnect() { this.disconnected = true; }
}
class Oscillator {
  type = '';
  frequency = new Parameter();
  onended?: () => void;
  disconnected = false;
  started?: number;
  stopped?: number;
  connect(target: unknown) { return target; }
  disconnect() { this.disconnected = true; }
  start(at: number) { this.started = at; }
  stop(at: number) { this.stopped = at; }
}

test('countdown sound unlocks on a gesture, respects effect volume and releases its short voice', async context => {
  const originalAudio = Object.getOwnPropertyDescriptor(globalThis, 'AudioContext');
  const originalVolume = get().audioVol;
  const voices: Oscillator[] = [], gains: Gain[] = [];
  let creations = 0, resumes = 0, state = 'suspended', rejectResume = false;
  class Audio {
    currentTime = 2;
    destination = {};
    constructor() { creations++; }
    get state() { return state; }
    resume() {
      resumes++;
      if (rejectResume) return Promise.reject(new Error('Audio denied'));
      state = 'running';
      return Promise.resolve();
    }
    createOscillator() { const voice = new Oscillator(); voices.push(voice); return voice; }
    createGain() { const gain = new Gain(); gains.push(gain); return gain; }
  }
  Object.defineProperty(globalThis, 'AudioContext', { configurable: true, value: Audio });
  context.after(() => {
    set({ audioVol: originalVolume });
    if (originalAudio) Object.defineProperty(globalThis, 'AudioContext', originalAudio);
    else Reflect.deleteProperty(globalThis, 'AudioContext');
  });

  playCountdownBeep();
  assert.equal(creations, 0);
  prepareCountdownSound();
  prepareCountdownSound();
  assert.equal(creations, 1);
  assert.equal(resumes, 1);
  set({ audioVol: { ...originalVolume, fx: 0.25 } });
  playCountdownBeep();
  assert.equal(voices[0].type, 'sine');
  assert.deepEqual(voices[0].frequency.values, [[880, 2]]);
  assert.deepEqual(gains[0].gain.values, [[0, 2], [0.025, 2.01], [0, 2.1]]);
  assert.equal(voices[0].started, 2);
  assert.equal(voices[0].stopped, 2.11);
  voices[0].onended?.();
  assert.equal(voices[0].disconnected, true);
  assert.equal(gains[0].disconnected, true);

  set({ audioVol: { ...originalVolume, fx: 0 } });
  playCountdownBeep();
  assert.equal(voices.length, 1);
  state = 'suspended'; rejectResume = true;
  assert.doesNotThrow(prepareCountdownSound);
  await new Promise(resolve => setImmediate(resolve));
  assert.doesNotThrow(playCountdownBeep);
  assert.equal(voices.length, 1);
  state = 'closed';
  Object.defineProperty(globalThis, 'AudioContext', { configurable: true, value: class { constructor() { throw new Error('Audio unavailable'); } } });
  assert.doesNotThrow(prepareCountdownSound);
  assert.doesNotThrow(playCountdownBeep);
});
