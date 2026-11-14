import assert from 'node:assert/strict';
import test from 'node:test';
import { get, set } from './store.ts';
import { playChatNotification, playDiceRoll, playEmoteSound, playPoke, playSynth, unlockEmoteAudio } from './world/sounds.ts';
import { playCountdownBeep, playPico, playShutter, prepareCountdownSound } from './items/effects.ts';
import { playSurvivorSound } from './world/survivorAudio.ts';
import { fantasyCombatSounds } from './world/fantasy-combat-sound.ts';

class Parameter {
  value = 0;
  setValueAtTime(v: number) { this.value = v; }
  linearRampToValueAtTime() {}
  exponentialRampToValueAtTime() {}
}
class Node {
  target?: Node;
  gain = new Parameter(); frequency = new Parameter(); Q = new Parameter();
  started = false;
  connect(target: Node) { this.target = target; return target; }
  disconnect() { this.target = undefined; }
  start() { this.started = true; }
  stop() {}
}

test('every synthesized effect routes running, scheduled and new sounds through a live final gain', t => {
  const before = get();
  const originals = ['AudioContext', 'window', 'document'].map(key => [key, Object.getOwnPropertyDescriptor(globalThis, key)] as const);
  const contexts: Context[] = [];
  class Context extends EventTarget {
    currentTime = 1; sampleRate = 1000; state = 'running'; destination = new Node();
    nodes: Node[] = [];
    constructor() { super(); contexts.push(this); }
    node() { const node = new Node(); this.nodes.push(node); return node; }
    createGain() { return this.node(); }
    createOscillator() { return this.node(); }
    createBufferSource() { return this.node(); }
    createBiquadFilter() { return this.node(); }
    createBuffer(_channels: number, length: number) { return { getChannelData: () => new Float32Array(length) }; }
    resume() { return Promise.resolve(); }
    close() { this.state = 'closed'; this.dispatchEvent(new Event('statechange')); }
  }
  Object.defineProperty(globalThis, 'AudioContext', { configurable: true, value: Context });
  Object.defineProperty(globalThis, 'window', { configurable: true, value: { AudioContext: Context } });
  Object.defineProperty(globalThis, 'document', { configurable: true, value: { visibilityState: 'visible' } });
  t.after(() => {
    contexts.forEach(c => c.close()); set(before);
    for (const [key, descriptor] of originals) {
      if (descriptor) Object.defineProperty(globalThis, key, descriptor);
      else Reflect.deleteProperty(globalThis, key);
    }
  });
  const effects = [
    () => playSynth('fanfare', 0.5),
    () => playEmoteSound('cheer', 0.5),
    playChatNotification, playPoke, playDiceRoll,
    playCountdownBeep, playPico, playShutter,
    () => playSurvivorSound('level'),
    () => fantasyCombatSounds.play({ visual: 'fire', tier: 3, event: { kind: 'attack', skill: 'flame' } }, 0.5),
  ];
  set({ audioMuted: false, audioVol: { ...before.audioVol, fx: 0.3 } });
  unlockEmoteAudio(); prepareCountdownSound();
  for (const play of effects) {
    const count = contexts.flatMap(c => c.nodes.filter(n => n.started)).length;
    play();
    const sources = contexts.flatMap(c => c.nodes.filter(n => n.started));
    assert.ok(sources.length > count);
    const outputs = () => contexts.flatMap(c => c.nodes.filter(n => n.target === c.destination));
    outputs().forEach(out => assert.equal(out.gain.value, 0.3));
    set({ audioMuted: true });
    outputs().forEach(out => assert.equal(out.gain.value, 0));
    play();
    assert.ok(contexts.flatMap(c => c.nodes.filter(n => n.started)).length > sources.length);
    outputs().forEach(out => assert.equal(out.gain.value, 0));
    for (const c of contexts) for (const source of c.nodes.filter(n => n.started)) {
      let node = source;
      const path = new Set<Node>();
      while (node.target && node.target !== c.destination) { assert.equal(path.has(node), false); path.add(node); node = node.target; }
      assert.equal(node.target, c.destination);
      assert.equal(node.gain.value, 0);
    }
    set({ audioVol: { ...get().audioVol, fx: 0.7 } });
    outputs().forEach(out => assert.equal(out.gain.value, 0));
    set({ audioMuted: false });
    outputs().forEach(out => assert.equal(out.gain.value, 0.7));
    set({ audioVol: { ...get().audioVol, fx: 0.3 } });
  }
});
