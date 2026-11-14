import assert from 'node:assert/strict';
import test from 'node:test';
import { AdSoundPlayer } from './audio.ts';

class Parameter {
  value = 0;
  setValueAtTime(v: number) { this.value = v; }
  linearRampToValueAtTime() {}
  exponentialRampToValueAtTime() {}
  cancelScheduledValues() {}
}
class Node {
  gain = new Parameter(); frequency = new Parameter(); stopped = false;
  connect(target: unknown) { return target; }
  disconnect() {}
  start() {}
  stop(at?: number) { if (at === undefined) this.stopped = true; }
}
class Context {
  state = 'running'; currentTime = 1; destination = {};
  gains: Node[] = []; sources: Node[] = []; voices: Node[] = [];
  createGain() { const n = new Node(); this.gains.push(n); return n; }
  createBufferSource() { const n = new Node(); this.sources.push(n); return n; }
  createOscillator() { const n = new Node(); this.voices.push(n); return n; }
  decodeAudioData() { return Promise.resolve({ duration: 30 } as AudioBuffer); }
  close() { this.state = 'closed'; return Promise.resolve(); }
}

test('muted AD output preserves BGM, scheduled voices and late decoded playback', async () => {
  const context = new Context();
  let finish!: (response: Response) => void;
  const player = new AdSoundPlayer(() => context as unknown as AudioContext,
    () => new Promise(resolve => { finish = resolve; }));
  try {
    player.unlock(); player.production(0.5);
    player.play({ kind: 'crunch' });
    player.setMuted(true);
    assert.equal(context.gains[0].gain.value, 0);
    assert.ok(context.voices.length > 1);
    assert.equal(context.voices.some(n => n.stopped), false);
    finish(new Response(new ArrayBuffer(1)));
    await new Promise(resolve => setImmediate(resolve));
    assert.equal(context.sources.length, 1);
    assert.equal(context.sources[0].stopped, false);
    player.setVolume(0.7);
    assert.equal(context.gains[0].gain.value, 0);
    const count = context.voices.length;
    context.currentTime = 3;
    player.play({ kind: 'save' });
    assert.ok(context.voices.length > count);
    player.setMuted(false);
    assert.equal(context.gains[0].gain.value, 0.7);
    assert.equal(context.sources.length, 1);
    assert.equal(context.sources[0].stopped, false);
  } finally { player.dispose(); }
});

test('AD reconnects a replaced context with muted output', () => {
  const contexts: Context[] = [];
  const player = new AdSoundPlayer(() => {
    const c = new Context(); contexts.push(c); return c as unknown as AudioContext;
  });
  try {
    player.unlock();
    contexts[0].state = 'closed';
    player.setMuted(true); player.unlock();
    assert.equal(contexts.length, 2);
    assert.equal(contexts[1].gains[0].gain.value, 0);
    player.setMuted(false);
    assert.equal(contexts[1].gains[0].gain.value, 1);
  } finally { player.dispose(); }
});
