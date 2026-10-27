import test from 'node:test';
import assert from 'node:assert/strict';
import { createLocalInferenceScheduler } from './local-inference.ts';

test('NPC and GM jobs share one generator and preserve queued order', async () => {
  let active = 0, peak = 0;
  const seen: string[] = [];
  const releases: (() => void)[] = [];
  const fetcher = (async (url: RequestInfo | URL) => {
    active++; peak = Math.max(peak, active); seen.push(String(url));
    await new Promise<void>(resolve => releases.push(resolve));
    active--; return new Response('reply');
  }) as typeof fetch;
  const schedule = createLocalInferenceScheduler(fetcher);
  const a = schedule('http://local/npc'), b = schedule('http://local/gm');
  assert.deepEqual(seen, ['http://local/npc']);
  releases.shift()!(); await a;
  await new Promise(resolve => setImmediate(resolve));
  assert.deepEqual(seen, ['http://local/npc', 'http://local/gm']);
  releases.shift()!(); assert.equal(await (await b).text(), 'reply');
  assert.equal(peak, 1);
});

test('cancelled queue entries never consume a model call and a full queue refuses excess work', async () => {
  let release!: () => void; let calls = 0;
  const schedule = createLocalInferenceScheduler((async () => { calls++; await new Promise<void>(resolve => { release = resolve; }); return new Response('ok'); }) as typeof fetch, { maxQueue: 1 });
  const first = schedule('http://local/first');
  const controller = new AbortController();
  const queued = schedule('http://local/queued', { signal: controller.signal });
  assert.equal((await schedule('http://local/excess')).status, 429);
  controller.abort(); await assert.rejects(queued, { name: 'AbortError' });
  release(); await first;
  assert.equal(calls, 1);
});

test('two configured slots generate concurrently while the third request waits', async () => {
  let active=0, peak=0;
  const releases:(()=>void)[]=[];
  const seen:string[]=[];
  const schedule=createLocalInferenceScheduler((async input=>{
    active++;peak=Math.max(peak,active);seen.push(String(input));
    await new Promise<void>(resolve=>releases.push(resolve));
    active--;return new Response('ok');
  }) as typeof fetch,{concurrency:2});
  const a=schedule('http://local/a'),b=schedule('http://local/b'),c=schedule('http://local/c');
  assert.deepEqual(seen,['http://local/a','http://local/b']);
  releases.shift()!();await a;await new Promise(resolve=>setImmediate(resolve));
  assert.equal(seen.length,3);
  releases.shift()!();await b;releases.shift()!();await c;
  assert.equal(peak,2);
});
