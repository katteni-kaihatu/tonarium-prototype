import test from 'node:test';
import assert from 'node:assert/strict';
import { checkKokoaAi } from './check-kokoa-ai.ts';

const env = { KOKOAAI_BASEURL: 'https://chat.kokoa.dev/v1', KOKOAAI_MODEL: 'lfm3-1.7b', KOKOAAI_APIKEY: 'probe-test-only' };
test('generation probe uses the same supplied configuration for model listing and all six dialogues', async () => {
  let calls = 0; const reports: string[] = [];
  const ok = await checkKokoaAi({ env: { ...env, KOKOAAI_BASEURL: 'https://isolated.kokoa.invalid/v1', KOKOAAI_MODEL: 'isolated-model' }, generate: true, report: value => reports.push(value), fetcher: (async (url, init) => {
    calls++; assert.ok(String(url).startsWith('https://isolated.kokoa.invalid/v1/'));
    assert.equal(new Headers(init?.headers).get('Authorization'), 'Bearer probe-test-only');
    if (String(url).endsWith('/models')) return new Response(JSON.stringify({ data: [{ id: 'isolated-model' }] }));
    const body = JSON.parse(String(init?.body)); assert.equal(body.model, 'isolated-model'); assert.deepEqual(body.chat_template_kwargs, { enable_thinking: true });
    return new Response(JSON.stringify({ model: 'isolated-model', choices: [{ message: { content: 'A quiet pause can help.' } }] }));
  }) as typeof fetch });
  assert.equal(ok, true); assert.equal(calls, 7);
  assert.equal(reports.map(value => JSON.parse(value)).filter(value => value.stage === 'generation' && value.ok).length, 6);
  assert.ok(!reports.join('').includes('probe-test-only'));
});
test('operator probe checks configured model with server credentials without exposing them', async () => {
  const reports: string[] = [];
  const ok = await checkKokoaAi({ env, report: value => reports.push(value), fetcher: (async (url, init) => {
    assert.equal(String(url), 'https://chat.kokoa.dev/v1/models');
    assert.equal(new Headers(init?.headers).get('Authorization'), 'Bearer probe-test-only'); assert.equal(init?.redirect, 'error');
    return new Response(JSON.stringify({ data: [{ id: 'lfm3-1.7b' }] }));
  }) as typeof fetch });
  assert.equal(ok, true); assert.ok(reports.some(value => JSON.parse(value).modelFound)); assert.ok(!reports.join('').includes('probe-test-only'));
});
test('operator probe fails safely on absent credentials, HTTP errors, missing model and transport errors', async () => {
  const reports: string[] = [];
  assert.equal(await checkKokoaAi({ env: {}, report: value => reports.push(value), fetcher: (async () => { throw Error('should not call'); }) as typeof fetch }), false);
  for (const fetcher of [
    async () => new Response('probe-test-only', { status: 401 }),
    async () => new Response(JSON.stringify({ data: [{ id: 'other-model' }] })),
    async () => { throw Error('Bearer probe-test-only'); },
  ]) assert.equal(await checkKokoaAi({ env, report: value => reports.push(value), fetcher: fetcher as typeof fetch }), false);
  assert.ok(!reports.join('').includes('probe-test-only'));
});
