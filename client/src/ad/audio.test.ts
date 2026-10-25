import assert from 'node:assert/strict';
import test from 'node:test';
import { AdSoundPlayer } from './audio.ts';

class Param {
  value = 0;
  values: number[] = [];
  setValueAtTime(value: number) { this.value = value; this.values.push(value); }
  linearRampToValueAtTime(value: number) { this.values.push(value); }
  exponentialRampToValueAtTime(value: number) { this.values.push(value); }
  cancelScheduledValues() {}
}
class Gain {
  gain = new Param();
  disconnected = false;
  connect(target: unknown) { return target; }
  disconnect() { this.disconnected = true; }
}
class Voice {
  frequency = new Param();
  type = 'sine';
  onended: (() => void) | null = null;
  disconnected = false;
  starts: number[] = [];
  stops: Array<number | undefined> = [];
  connect(target: unknown) { return target; }
  disconnect() { this.disconnected = true; }
  start(at: number) { this.starts.push(at); }
  stop(at?: number) { this.stops.push(at); }
}
class MusicSource {
  buffer: AudioBuffer | null = null;
  loop = false;
  disconnected = false;
  starts: Array<[number | undefined, number | undefined]> = [];
  stopped = false;
  connect(target: unknown) { return target; }
  disconnect() { this.disconnected = true; }
  start(at?: number, offset?: number) { this.starts.push([at, offset]); }
  stop() { this.stopped = true; }
}
class Context {
  state: AudioContextState = 'suspended';
  currentTime = 0;
  destination = {};
  voices: Voice[] = [];
  sources: MusicSource[] = [];
  gains: Gain[] = [];
  resumes = 0;
  decodes = 0;
  closed = false;
  createOscillator() { const voice = new Voice(); this.voices.push(voice); return voice; }
  createBufferSource() { const source = new MusicSource(); this.sources.push(source); return source; }
  createGain() { const gain = new Gain(); this.gains.push(gain); return gain; }
  decodeAudioData(_data: ArrayBuffer): Promise<AudioBuffer> {
    this.decodes++;
    return Promise.resolve({ duration: 53.333 } as AudioBuffer);
  }
  resume() { this.resumes++; this.state = 'running'; return Promise.resolve(); }
  close() { this.closed = true; this.state = 'closed'; return Promise.resolve(); }
}

function fixture(fetchImpl?: typeof fetch) {
  const context = new Context();
  let creations = 0;
  const requests: Array<{ url: unknown; signal: AbortSignal | null | undefined }> = [];
  const fetchTrack = ((url, init) => {
    requests.push({ url, signal: init?.signal });
    return fetchImpl ? fetchImpl(url, init) : Promise.resolve({ ok: true, arrayBuffer: async () => new ArrayBuffer(8) } as Response);
  }) as typeof fetch;
  const player = new AdSoundPlayer(() => { creations++; return context as unknown as AudioContext; }, fetchTrack);
  return { player, context, requests, creations: () => creations };
}

async function settle() { await new Promise<void>((resolve) => setImmediate(resolve)); }
function deferred<T>() {
  let resolve!: (value: T) => void;
  const promise = new Promise<T>((r) => { resolve = r; });
  return { promise, resolve };
}

test('only a gesture creates the context; music waits for unlock and old operation events are not replayed', async () => {
  const { player, context, requests, creations } = fixture();
  player.play({ kind: 'purchase', tier: 1 });
  player.production(1);
  await settle();
  assert.equal(creations(), 0);
  assert.equal(requests.length, 0);
  player.unlock();
  await settle();
  assert.equal(context.resumes, 1);
  assert.equal(context.voices.length, 0);
  assert.equal(context.sources.length, 1);
  assert.equal(requests[0].url, '/audio/ad-lab-reactor.ogg');
  player.play({ kind: 'purchase', tier: 1 });
  assert.equal(context.voices.length, 2);
  player.dispose();
});

test('purchase pitch follows the dimension and rapid operations keep at most 24 voices', () => {
  const { player, context } = fixture();
  player.unlock();
  player.play({ kind: 'purchase', tier: 1 });
  const firstPitch = context.voices[0].frequency.values[0];
  player.play({ kind: 'purchase', tier: 8 });
  assert.ok(context.voices[2].frequency.values[0] > firstPitch);
  for (let i = 0; i < 100; i++) {
    context.currentTime += 0.06;
    player.play({ kind: 'crunch' });
  }
  assert.equal(context.voices.filter((voice) => !voice.disconnected).length, 24);
  player.dispose();
});

test('production plays one faded, looping imported buffer without production oscillators; decode is cached across pauses', async () => {
  const { player, context, requests } = fixture();
  player.unlock();
  for (let i = 0; i < 100; i++) player.production(0.5);
  await settle();
  assert.equal(requests.length, 1);
  assert.equal(context.decodes, 1);
  assert.equal(context.sources.length, 1);
  assert.equal(context.sources[0].loop, true);
  assert.equal(context.voices.length, 0);
  assert.deepEqual(context.gains[1].gain.values, [0, 0.2]);
  player.production(1);
  assert.equal(context.gains[1].gain.values.at(-1), 0.4);
  context.currentTime = 12.5;
  player.stopProduction();
  assert.equal(context.sources[0].disconnected, true);
  assert.equal(context.sources[0].stopped, true);
  player.production(0.75);
  assert.equal(context.sources.length, 2);
  assert.deepEqual(context.sources[1].starts, [[12.5, 12.5]]);
  assert.equal(requests.length, 1);
  assert.equal(context.decodes, 1);
  player.dispose();
});

test('muting cancels music and future operation notes immediately and does not queue muted events', async () => {
  const { player, context } = fixture();
  player.unlock();
  player.production(1);
  await settle();
  player.play({ kind: 'crunch' });
  assert.ok(context.voices.some((voice) => voice.starts[0] > context.currentTime));
  player.setVolume(0);
  assert.ok(context.voices.every((voice) => voice.disconnected && voice.stops.includes(undefined)));
  assert.ok(context.sources.every((source) => source.disconnected && source.stopped));
  assert.ok(context.gains.every((gain, i) => i === 0 || gain.disconnected));
  const count = context.voices.length;
  player.play({ kind: 'save' });
  player.production(1);
  player.setVolume(0.5);
  assert.equal(context.voices.length, count);
  assert.equal(context.sources.length, 1);
  assert.equal(context.gains[0].gain.value, 0.5);
  player.dispose();
});

test('leaving production range preserves operation feedback, and disposal releases all resources', async () => {
  const { player, context, requests } = fixture();
  player.unlock();
  player.play({ kind: 'save' });
  player.production(0.5);
  await settle();
  player.stopProduction();
  assert.ok(context.voices.every((voice) => !voice.disconnected));
  assert.ok(context.sources.every((source) => source.disconnected && source.stopped));
  player.production(1);
  player.dispose();
  assert.ok(context.voices.every((voice) => voice.disconnected));
  assert.ok(context.sources.every((source) => source.disconnected && source.stopped));
  assert.ok(context.gains.every((gain) => gain.disconnected));
  assert.equal(context.closed, true);
  assert.equal(requests[0].signal?.aborted, true);
  player.unlock();
  player.play({ kind: 'save' });
  player.production(1);
  assert.equal(context.voices.length, 2);
  assert.equal(context.sources.length, 2);
});

test('late track decoding cannot restart music after stop, mute, or disposal', async () => {
  for (const action of ['stop', 'mute', 'dispose'] as const) {
    const { player, context } = fixture();
    const decoding = deferred<AudioBuffer>();
    context.decodeAudioData = () => decoding.promise;
    player.unlock();
    player.production(1);
    await settle();
    if (action === 'stop') player.stopProduction();
    if (action === 'mute') player.setVolume(0);
    if (action === 'dispose') player.dispose();
    decoding.resolve({ duration: 53.333 } as AudioBuffer);
    await settle();
    assert.equal(context.sources.length, 0, action);
    player.dispose();
  }
});

test('pending resume cannot restart music after leaving the lab', async () => {
  const { player, context, requests } = fixture();
  const resumed = deferred<void>();
  context.resume = () => resumed.promise.then(() => { context.state = 'running'; });
  player.production(1);
  player.unlock();
  player.stop();
  resumed.resolve();
  await settle();
  assert.equal(requests.length, 0);
  assert.equal(context.sources.length, 0);
  player.dispose();
});

test('failed music requests are contained without polling retries and operation feedback remains available', async () => {
  const { player, context, requests } = fixture((async () => new Response(null, { status: 404 })) as typeof fetch);
  player.unlock();
  player.production(1);
  await settle();
  for (let i = 0; i < 100; i++) player.production(1);
  await settle();
  assert.equal(requests.length, 1);
  assert.equal(context.sources.length, 0);
  assert.equal(context.decodes, 0);
  player.play({ kind: 'save' });
  assert.equal(context.voices.length, 2);
  player.dispose();
});

// Native window.fetch rejects AdSoundPlayer as its receiver. The default loader
// must invoke fetch as a global function, rather than as a player method.
test('default music loader does not bind native fetch to the sound player', async () => {
  const originalFetch = globalThis.fetch;
  const context = new Context();
  let requests = 0;
  globalThis.fetch = (function (this: unknown) {
    assert.equal(this, undefined);
    requests++;
    return Promise.resolve(new Response(new ArrayBuffer(8)));
  }) as typeof fetch;
  const player = new AdSoundPlayer(() => context as unknown as AudioContext);
  try {
    player.production(1);
    player.unlock();
    await settle();
    assert.equal(requests, 1);
    assert.equal(context.sources.length, 1);
    assert.equal(context.sources[0].loop, true);
  } finally {
    player.dispose();
    globalThis.fetch = originalFetch;
  }
});
