import assert from 'node:assert/strict';
import { mock, test } from 'node:test';

const sent = [], stored = new Map(), recorders = [];
let permission = 'granted';
const stub = (path, namedExports) => mock.module(new URL(path, import.meta.url).href, { namedExports });
mock.module('react', { namedExports: { useSyncExternalStore: (_subscribe, snapshot) => snapshot() } });
stub('./actions.ts', { sendMessage: (conv, message) => sent.push({ conv, message }) });
stub('./i18n/core.ts', { t: key => key });
stub('./store.ts', { get: () => ({ wsReady: true }) });
const tick = () => new Promise(resolve => setTimeout(resolve, 5));
globalThis.indexedDB = {
  open: () => {
    const request = { result: {
      close() {},
      transaction() {
        const tx = { objectStore: () => ({
          get: id => ({ result: structuredClone(stored.get(id)) }),
          put: value => { stored.set(value.id, structuredClone(value)); return {}; },
          delete: id => { stored.delete(id); return {}; },
        }) };
        setTimeout(() => tx.oncomplete(), 0);
        return tx;
      },
    } };
    setTimeout(() => request.onsuccess(), 0);
    return request;
  },
};
Object.defineProperty(globalThis, 'navigator', { configurable: true, value: {
  permissions: { query: async () => ({ state: permission }) },
  mediaDevices: { getUserMedia: async () => ({ getTracks: () => [{ stop() {} }] }) },
} });
globalThis.window = { dispatchEvent() {} };
globalThis.MediaRecorder = class {
  static isTypeSupported() { return true; }
  mimeType = 'audio/webm';
  state = 'inactive';
  constructor() { recorders.push(this); }
  start() { this.state = 'recording'; }
  stop() {
    this.state = 'inactive';
    queueMicrotask(() => { this.ondataavailable({ data: new Blob(['audio']) }); this.onstop(); });
  }
};
globalThis.fetch = async () => ({ ok: true, json: async () => ({ url: '/media/recorded.webm' }) });
const { useVoiceRecorder, prepareRecordings, restoreRecordings, retryRecordings } = await import('./updateRecording.ts');

test('recording segments survive updating, resume with permission, and request interaction otherwise', async () => {
  useVoiceRecorder('dm:friend').toggle(); await tick();
  assert.equal(useVoiceRecorder('dm:friend').recording, true);
  const refs = await prepareRecordings();
  assert.equal(sent.length, 0);
  assert.equal(stored.get(refs[0].id).segments[0].blob.size, 5);
  assert.deepEqual(await restoreRecordings(refs), []);
  assert.equal(recorders.at(-1).state, 'recording');

  const nextRefs = await prepareRecordings();
  permission = 'prompt';
  const issues = await restoreRecordings(nextRefs);
  assert.ok(issues[0].includes('updateRecordingPermission'));
  assert.equal(useVoiceRecorder('dm:friend').recording, false);
  assert.deepEqual(await retryRecordings(), []);
  assert.equal(useVoiceRecorder('dm:friend').recording, true);
  useVoiceRecorder('dm:friend').toggle();
  await tick(); await tick();
  assert.equal(sent.length, 3);
  assert.ok(sent.every(entry => entry.conv === 'dm:friend'));
  assert.equal(stored.size, 0);
});

test('an uploading recording is saved without waiting for the network or sending twice', async () => {
  let complete;
  const before = sent.length;
  globalThis.fetch = () => new Promise(resolve => { complete = resolve; });
  useVoiceRecorder('dm:uploading').toggle(); await tick();
  useVoiceRecorder('dm:uploading').toggle(); await tick();
  const refs = await prepareRecordings();
  assert.equal(refs.length, 1);
  assert.equal(sent.length, before);
  complete({ ok: true, json: async () => ({ url: '/media/first.webm' }) });
  await tick();
  assert.equal(sent.length, before);
  globalThis.fetch = async () => ({ ok: true, json: async () => ({ url: '/media/restored.webm' }) });
  assert.deepEqual(await restoreRecordings(refs), []);
  assert.equal(sent.length, before + 1);
  assert.equal(stored.size, 0);
});
