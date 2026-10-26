const test = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const vm = require('node:vm');
const path = require('node:path');

function harness(initial = {}) {
  const captures = [], sinks = [], elements = [], events = {};
  let inventory = [];
  class MediaElement {
    setSinkId(id) { sinks.push(['media', id]); return id === 'broken' ? Promise.reject(new Error('bad sink')) : Promise.resolve(); }
    play() { return Promise.resolve(); }
  }
  class AudioContext {
    constructor(options) { if (options?.sinkId) sinks.push(['context', options.sinkId]); }
    state = 'running';
    setSinkId(id) { sinks.push(['context', id]); return id === 'broken' ? Promise.reject(new Error('bad sink')) : Promise.resolve(); }
  }
  const sandbox = {
    navigator: { mediaDevices: {
      getUserMedia: async value => { captures.push(value); return { untouched: true }; },
      enumerateDevices: async () => inventory,
      addEventListener: (name, fn) => { events[name] = fn; },
    } },
    HTMLMediaElement: MediaElement, AudioContext,
    document: { querySelectorAll: () => elements },
    MutationObserver: class { observe() {} },
    process: { isMainFrame: true },
    require: name => {
      assert.equal(name, 'electron');
      return {
        contextBridge: { executeInMainWorld: ({ func, args }) => func(...args), exposeInMainWorld: (name, value) => { sandbox[name] = value; } },
        ipcRenderer: { sendSync: name => { assert.equal(name, 'shell:audio-config'); return initial; } },
      };
    },
  };
  sandbox.window = sandbox;
  vm.runInNewContext(fs.readFileSync(path.join(__dirname, '../app/audio-preload.cjs'), 'utf8'), sandbox);
  return { sandbox, api: sandbox.__tonariumElectronAudio, captures, sinks, elements, events,
    inventory: value => { inventory = value; } };
}

test('audio list never captures; selected mic only changes audio constraints', async () => {
  const h = harness({ input: 'mic-B' });
  await h.api.list();
  assert.equal(h.captures.length, 0);
  const original = { audio: { echoCancellation: true }, video: { width: 320 } };
  await h.sandbox.navigator.mediaDevices.getUserMedia(original);
  assert.equal(h.captures[0].audio.deviceId.exact, 'mic-B');
  assert.equal(h.captures[0].audio.echoCancellation, true);
  assert.equal(h.captures[0].video, original.video);
  assert.equal(original.audio.deviceId, undefined);
  await h.sandbox.navigator.mediaDevices.getUserMedia({ video: true });
  assert.equal(h.captures[1].audio, undefined);
  assert.equal(h.sandbox.tonariumShell, undefined);
});

test('routes Web Audio and media elements and rolls all sinks back on failure', async () => {
  const h = harness();
  new h.sandbox.AudioContext();
  h.elements.push(new h.sandbox.HTMLMediaElement());
  await h.api.apply({ output: 'speaker-B' });
  assert.ok(h.sinks.some(([kind, id]) => kind === 'media' && id === 'speaker-B'));
  assert.ok(h.sinks.some(([kind, id]) => kind === 'context' && id === 'speaker-B'));
  await assert.rejects(h.api.apply({ output: 'broken' }), /bad sink/);
  assert.equal(h.api.status().output, 'speaker-B');
  assert.deepEqual(h.sinks.slice(-2).map(([, id]) => id), ['speaker-B', 'speaker-B']);
  new h.sandbox.AudioContext();
  await Promise.resolve();
  assert.deepEqual(h.sinks.at(-1), ['context', 'speaker-B']);
});

test('uses existing LiveKit switch and serializes rapid changes; failures restore selection', async () => {
  const h = harness();
  const switches = [];
  h.sandbox.__tonariumRoom = { switchActiveDevice: async (kind, id) => {
    switches.push([kind, id]);
    assert.equal(h.api.status().input, id === 'default' ? '' : id);
    return id !== 'broken';
  } };
  await Promise.all([h.api.apply({ input: 'mic-A' }), h.api.apply({ input: 'mic-B' })]);
  assert.deepEqual(switches.map(([, id]) => id), ['mic-A', 'mic-B']);
  await assert.rejects(h.api.apply({ input: 'broken' }), /マイク/);
  assert.equal(h.api.status().input, 'mic-B');
  assert.equal(switches.at(-1)[1], 'mic-B');
  assert.equal(h.captures.length, 0);
});

test('without active room saves input for next capture without stopping/starting streams', async () => {
  const h = harness();
  await h.api.apply({ input: 'mic-B' });
  assert.equal(h.captures.length, 0);
  assert.match(h.api.status().notice, /次の録音/);
  await h.sandbox.navigator.mediaDevices.getUserMedia({ audio: true });
  assert.equal(h.captures[0].audio.deviceId.exact, 'mic-B');
});

test('redacted inventory preserves choices; unplugging a known device reverts to default', async () => {
  const h = harness({ input: 'mic-B', output: 'speaker-B' });
  h.events.devicechange();
  await new Promise(resolve => setImmediate(resolve));
  assert.equal(h.api.status().input, 'mic-B');
  h.inventory([
    { kind: 'audioinput', deviceId: 'default', label: 'Default microphone' },
    { kind: 'audiooutput', deviceId: 'default', label: 'Default speaker' },
  ]);
  h.events.devicechange();
  await new Promise(resolve => setImmediate(resolve));
  assert.equal(h.api.status().input, '');
  assert.equal(h.api.status().output, '');
  assert.equal(h.captures.length, 0);
});


test('returning to default overrides stale capture constraints after device selection', async () => {
  const h = harness({ input: 'mic-B' });
  await h.api.apply({ input: '' });
  await h.sandbox.navigator.mediaDevices.getUserMedia({ audio: { deviceId: { exact: 'mic-B' } } });
  assert.equal(h.captures[0].audio.deviceId.exact, 'default');
});

test('all devices disappearing after permission restores default without capture', async () => {
  const h = harness({ input: 'mic-B', output: 'speaker-B' });
  h.inventory([
    { kind: 'audioinput', deviceId: 'mic-B', label: 'Microphone B' },
    { kind: 'audiooutput', deviceId: 'speaker-B', label: 'Speaker B' },
  ]);
  await h.api.list();
  h.inventory([]);
  await h.api.list();
  assert.equal(h.api.status().input, '');
  assert.equal(h.api.status().output, '');
  assert.equal(h.captures.length, 0);
});

test('output-only failure never switches microphone', async () => {
  const h = harness({ input: 'mic-B' });
  new h.sandbox.AudioContext();
  let calls = 0;
  h.sandbox.__tonariumRoom = { switchActiveDevice: async () => { calls++; } };
  await assert.rejects(h.api.apply({ input: 'mic-B', output: 'broken' }));
  assert.equal(calls, 0);
});
