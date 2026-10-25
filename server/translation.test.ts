import assert from 'node:assert/strict';
import test from 'node:test';
import http from 'node:http';
import { configuredTranslationModel, createOpenAITranslationModel, createTranslationHandler, createTranslator, mockTranslationModel } from './translation.ts';
import { sourceLanguageOf } from '../shared/translation.ts';

test('mock translates all display languages and identifies the original language', async () => {
  const translate = createTranslator(mockTranslationModel);
  assert.deepEqual(await translate({ text: 'こんにちは', targetLanguage: 'en' }), { text: 'Hello', sourceLanguage: 'ja', status: 'translated' });
  assert.deepEqual(await translate({ text: 'Hello', targetLanguage: 'ko' }), { text: '안녕하세요', sourceLanguage: 'en', status: 'translated' });
  assert.deepEqual(await translate({ text: '안녕하세요', targetLanguage: 'ja' }), { text: 'こんにちは', sourceLanguage: 'ko', status: 'translated' });
  assert.equal((await translate({ text: '12345', targetLanguage: 'ja' })).sourceLanguage, null);
  for (const code of [null, '', 'unknown', 'und', 'zxx', 'mul', '<script>', 123]) assert.equal(sourceLanguageOf(code), null);
  assert.equal(sourceLanguageOf('en-us'), 'en-US');
  assert.equal(sourceLanguageOf('fr'), 'fr');
});

test('missing credentials, provider errors, malformed output and timeouts preserve the original', async () => {
  const input = { text: 'Hello', targetLanguage: 'ja' as const };
  assert.equal(configuredTranslationModel({ OPENAPI_KEY: '', OPENAI_API_KEY: 'unused-test-fixture' }, false), undefined);
  assert.equal(configuredTranslationModel({ OPENAPI_KEY: ' ' }, false), undefined);
  assert.ok(configuredTranslationModel({}, true));
  assert.equal((await createTranslator()(input)).status, 'unavailable');
  for (const model of [async () => { throw new Error('private provider detail'); }, async () => ({}), async () => ({ text: '' }), async () => ({ text: 7 })]) {
    assert.deepEqual(await createTranslator(model)(input), { text: 'Hello', sourceLanguage: null, status: 'failed' });
  }
  let signal: AbortSignal | undefined;
  const timed = createTranslator(async (_, current) => { signal = current; return new Promise(() => {}); }, 10);
  assert.deepEqual(await timed(input), { text: 'Hello', sourceLanguage: null, status: 'failed' });
  assert.equal(signal?.aborted, true);
  assert.equal((await createTranslator(async () => ({ text: 'こんにちは', sourceLanguage: 'und' }))(input)).sourceLanguage, null);
});

test('OpenAI adapter sends the contract over HTTP and hides upstream errors', async (t) => {
  const requests: { path: string; body: any; authenticated: boolean }[] = [];
  let status = 200, content = JSON.stringify({ text: 'こんにちは', sourceLanguage: 'en' }), finish = 'stop';
  const upstream = http.createServer(async (req, res) => {
    const chunks = [];
    for await (const chunk of req) chunks.push(chunk);
    requests.push({ path: req.url!, body: JSON.parse(Buffer.concat(chunks).toString()), authenticated: req.headers.authorization === 'Bearer local-test-fixture' });
    res.statusCode = status;
    res.end(JSON.stringify({ choices: [{ finish_reason: finish, message: { content } }], error: 'private provider detail' }));
  });
  await new Promise<void>((resolve) => upstream.listen(0, '127.0.0.1', resolve));
  t.after(() => { upstream.closeAllConnections(); upstream.close(); });
  const port = (upstream.address() as { port: number }).port;
  const localFetch: typeof fetch = (url, init) => {
    assert.equal(url, 'https://api.openai.com/v1/chat/completions');
    return fetch(`http://127.0.0.1:${port}/v1/chat/completions`, init);
  };
  const translate = createTranslator(createOpenAITranslationModel('local-test-fixture', 'test-model', localFetch));
  const input = { text: 'Hello', targetLanguage: 'ja' as const };
  assert.deepEqual(await translate(input), { text: 'こんにちは', sourceLanguage: 'en', status: 'translated' });
  assert.equal(requests[0].authenticated, true);
  assert.equal(requests[0].path, '/v1/chat/completions');
  assert.equal(requests[0].body.model, 'test-model');
  assert.equal(requests[0].body.store, false);
  assert.equal(requests[0].body.response_format.json_schema.strict, true);
  assert.deepEqual(JSON.parse(requests[0].body.messages[1].content), input);
  for (const failure of ['http', 'json', 'truncated']) {
    status = failure === 'http' ? 401 : 200;
    content = failure === 'json' ? 'not json' : JSON.stringify({ text: 'incomplete', sourceLanguage: 'en' });
    finish = failure === 'truncated' ? 'length' : 'stop';
    assert.deepEqual(await translate(input), { text: input.text, sourceLanguage: null, status: 'failed' });
  }
});

test('HTTP handler validates requests and never caches conversation text', async (t) => {
  const server = http.createServer(createTranslationHandler(createTranslator(mockTranslationModel)));
  await new Promise<void>((resolve) => server.listen(0, '127.0.0.1', resolve));
  t.after(() => { server.closeAllConnections(); server.close(); });
  const url = `http://127.0.0.1:${(server.address() as { port: number }).port}`;
  const response = await fetch(url, { method: 'POST', body: JSON.stringify({ text: 'Hello', targetLanguage: 'ja' }) });
  assert.equal(response.headers.get('cache-control'), 'no-store');
  assert.equal((await response.json()).text, 'こんにちは');
  assert.equal((await fetch(url)).status, 405);
  for (const body of ['invalid', '{}', JSON.stringify({ text: '', targetLanguage: 'ja' }), JSON.stringify({ text: 'Hello', targetLanguage: 'invalid' }), JSON.stringify({ text: 'x'.repeat(2001), targetLanguage: 'en' })]) {
    assert.equal((await fetch(url, { method: 'POST', body })).status, 400);
  }
  assert.equal((await fetch(url, { method: 'POST', body: 'x'.repeat(16001) })).status, 413);
});
