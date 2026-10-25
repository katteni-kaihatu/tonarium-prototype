import assert from 'node:assert/strict';
import test from 'node:test';
import { createTranslationClient } from './translation.ts';
import { setLanguage, getLanguage, subscribeLanguage } from './i18n/core.ts';

test('language changes retranslate existing messages; delayed old results cannot replace the selected language', async () => {
  const responses = new Map<string, (r: Response) => void>();
  let calls = 0, updates = 0;
  const client = createTranslationClient(async (_, init) => {
    calls++;
    const { targetLanguage } = JSON.parse(init!.body as string);
    return new Promise<Response>((resolve) => responses.set(targetLanguage, resolve));
  });
  const unsubscribe = client.subscribe(() => updates++);
  setLanguage('en');
  const original = 'こんにちは';
  const en = client.load(original, getLanguage());
  const enDuplicate = client.load(original, getLanguage());
  await Promise.resolve();
  assert.equal(en, enDuplicate);
  assert.equal(client.get(original, 'en')?.text, original);
  assert.equal(client.get(original, 'en')?.status, 'pending');
  let next: Promise<void> | undefined;
  const stop = subscribeLanguage(() => { next = client.load(original, getLanguage()); });
  setLanguage('ko');
  await Promise.resolve();
  responses.get('ko')!(Response.json({ text: '안녕하세요', sourceLanguage: 'ja', status: 'translated' }));
  await next;
  assert.equal(client.get(original, getLanguage())?.text, '안녕하세요');
  responses.get('en')!(Response.json({ text: 'Hello', sourceLanguage: 'ja', status: 'translated' }));
  await en;
  assert.equal(client.get(original, getLanguage())?.text, '안녕하세요');
  setLanguage('en');
  await next;
  assert.equal(client.get(original, getLanguage())?.text, 'Hello');
  assert.equal(client.get(original, getLanguage())?.sourceLanguage, 'ja');
  assert.equal(calls, 2);
  assert.equal(updates, 4);
  stop(); unsubscribe(); setLanguage('ja');
});

test('missing credentials, failures, malformed responses and lost HTTP connections display original text', async () => {
  for (const response of [
    () => Response.json({ status: 'unavailable', text: 'untrusted replacement' }),
    () => Response.json({ status: 'failed', text: 'untrusted replacement' }),
    () => Response.json({ status: 'translated', text: '' }),
    () => Response.json({ status: 'unexpected', text: 'bad' }),
    () => new Response('bad upstream response', { status: 503 }),
    () => { throw new Error('offline'); },
  ]) {
    const client = createTranslationClient(async () => response());
    await client.load('原文', 'en');
    assert.equal(client.get('原文', 'en')?.text, '原文');
    assert.equal(client.get('原文', 'en')?.sourceLanguage, null);
    assert.notEqual(client.get('原文', 'en')?.status, 'translated');
    await client.load('次の発言', 'ko');
    assert.equal(client.get('次の発言', 'ko')?.text, '次の発言');
  }
});

test('a failed translation is retried on the next load, while unavailable stays cached', async () => {
  let calls = 0;
  const client = createTranslationClient(async () => {
    calls++;
    if (calls === 1) return Response.json({ status: 'failed', text: '原文' });
    return Response.json({ text: 'Hello', sourceLanguage: 'ja', status: 'translated' });
  });
  await client.load('原文', 'en');
  assert.equal(client.get('原文', 'en')?.status, 'failed');
  assert.equal(client.get('原文', 'en')?.text, '原文');
  await client.load('原文', 'en');
  assert.equal(calls, 2);
  assert.equal(client.get('原文', 'en')?.status, 'translated');
  assert.equal(client.get('原文', 'en')?.text, 'Hello');
  // 成功結果は従来どおりキャッシュされ、再送しない
  await client.load('原文', 'en');
  assert.equal(calls, 2);

  let unavailableCalls = 0;
  const unavailable = createTranslationClient(async () => {
    unavailableCalls++;
    return Response.json({ status: 'unavailable', text: '原文' });
  });
  await unavailable.load('原文', 'en');
  assert.equal(unavailable.get('原文', 'en')?.status, 'unavailable');
  await unavailable.load('原文', 'en');
  assert.equal(unavailableCalls, 1);
});

test('a long history is queued so it does not overflow server concurrency', async () => {
  const waiting: (() => void)[] = [];
  let active = 0, maximum = 0;
  const client = createTranslationClient(async (_, init) => {
    active++;
    maximum = Math.max(maximum, active);
    await new Promise<void>((resolve) => waiting.push(resolve));
    active--;
    const { text } = JSON.parse(init!.body as string);
    return Response.json({ text: `translated ${text}`, sourceLanguage: 'en', status: 'translated' });
  });
  const tasks = Array.from({ length: 12 }, (_, i) => client.load(`message ${i}`, 'ja'));
  while (tasks.some((_, i) => client.get(`message ${i}`, 'ja')?.status === 'pending')) {
    await new Promise((resolve) => setTimeout(resolve, 1));
    waiting.splice(0).forEach((resolve) => resolve());
  }
  await Promise.all(tasks);
  assert.equal(maximum, 4);
  for (let i = 0; i < 12; i++) assert.equal(client.get(`message ${i}`, 'ja')?.text, `translated message ${i}`);
});
