import { test } from 'node:test';
import assert from 'node:assert/strict';
import { createHash } from 'node:crypto';
import { AssetLoader } from './loader.ts';
const content = new TextEncoder().encode('immutable original');
const hash = 'sha256-' + createHash('sha256').update(content).digest('hex');
test('hash cache, retry, mutation safety and resource disposal', async () => {
  let calls = 0;
  const loader = new AssetLoader((async () => { calls++; if (calls === 1) return new Response('corrupt'); return new Response(content); }) as typeof fetch);
  const first = await loader.load(hash); assert.equal(calls, 2); first[0] = 0;
  assert.deepEqual(await loader.load(hash), content); assert.equal(calls, 2);
  loader.dispose(); assert.deepEqual(await loader.load(hash), content); assert.equal(calls, 3);
});
test('old response ignored after cancellation, partial failures remain independent', async () => {
  let release!: (r: Response) => void;
  const loader = new AssetLoader((() => new Promise<Response>(resolve => { release = resolve; })) as typeof fetch);
  const pending = loader.load(hash); await Promise.resolve(); loader.cancel(); release(new Response(content)); await assert.rejects(pending, /cancelled/);
  loader.dispose();
  let calls = 0;
  const partial = new AssetLoader((async (url: string) => { calls++; return new Response(url.endsWith(hash) ? content : new TextEncoder().encode('bad')); }) as typeof fetch);
  const results = await Promise.allSettled([partial.load(hash), partial.load('sha256-' + 'a'.repeat(64))]);
  assert.equal(results[0].status, 'fulfilled'); assert.equal(results[1].status, 'rejected'); assert.equal(calls, 4); partial.dispose();
});
test('in-flight budget and cancellation include queued work', async () => {
  const releases: ((response: Response) => void)[] = [];
  const loader = new AssetLoader((() => new Promise<Response>(resolve => releases.push(resolve))) as typeof fetch);
  const work = Array.from({ length: 5 }, () => loader.load(hash));
  const settled = Promise.allSettled(work);
  await Promise.resolve(); assert.equal(releases.length, 4);
  loader.cancel(); for (const release of releases) release(new Response(content));
  assert.ok((await settled).every(r => r.status === 'rejected')); loader.dispose();
});
