import test from 'node:test';
import assert from 'node:assert/strict';
import { NpcChat } from './npc.ts';
import { FantasyGmChat } from './fantasy-gm-chat.ts';
import { applyFantasyAction, newFantasyProfile } from '../shared/fantasy-engine.ts';

const keys = ['KOKOAAI_BASEURL', 'KOKOAAI_MODEL', 'KOKOAAI_APIKEY'] as const;
const base = 'https://chat.kokoa.dev/v1';
const fixtureKey = 'test-only-kokoa-credential';
async function configured(values: Partial<Record<typeof keys[number], string>>, run: () => Promise<void>) {
  const before = keys.map(key => [key, process.env[key]] as const);
  try {
    for (const key of keys) {
      const value = values[key];
      if (value === undefined) delete process.env[key]; else process.env[key] = value;
    }
    await run();
  } finally {
    for (const [key, value] of before) {
      if (value === undefined) delete process.env[key]; else process.env[key] = value;
    }
  }
}
const defaults = { KOKOAAI_BASEURL: base, KOKOAAI_MODEL: 'lfm3-1.7b', KOKOAAI_APIKEY: fixtureKey };
const profile = () => applyFantasyAction(newFantasyProfile(), { type: 'create', name: 'Traveler', source: 'human', gender: 'female' }, () => .5).profile;
async function both(fetcher: typeof fetch, extra: { onError?: (error: unknown) => void; timeoutMs?: number; url?: string } = {}, locale: 'ko' | 'en' | 'ja' = 'en', progress?: (part: string) => void) {
  const options = { fetch: fetcher, onError: () => {}, ...extra };
  const request = { requestId: 'kokoa-test', text: { ko: '친구 미나와 다퉜어. 사과의 첫마디를 어떻게 꺼내면 좋을까?', en: 'I argued with my friend Mina. How should I start an apology?', ja: '友達のミナと喧嘩したんだ。謝るときは何と言えばいい？' }[locale], locale };
  const state = profile(), before = JSON.stringify(state);
  const replies = [
    await new NpcChat(options).chat('kokoa-test', { ...request, npcId: 'rin' }, { character: state.character!, onProgress: progress }),
    await new FantasyGmChat(options).chat('kokoa-test', request, { session: 'kokoa-test', world: 'fantasy', profile: state, onProgress: progress }),
  ];
  assert.equal(JSON.stringify(state), before);
  return { replies };
}
const spoken = { ko: '잠시 쉬어 가도 괜찮아요.', en: 'A quiet pause can help.', ja: '少し休んでも大丈夫です。' };

test('KokoaAI handles NPC and GM JSON and streaming replies in all three languages without browser inference', async () => {
  await configured(defaults, async () => {
    for (const locale of ['ko', 'en', 'ja'] as const) for (const stream of [false, true]) {
      let calls = 0; const parts: string[] = [];
      const fetcher = (async (input, init) => {
        calls++;
        assert.equal(String(input), base + '/chat/completions');
        assert.equal(new Headers(init?.headers).get('Authorization'), 'Bearer ' + fixtureKey);
        assert.equal(init?.redirect, 'error');
        const body = JSON.parse(String(init?.body));
        assert.deepEqual(Object.keys(body).sort(), ['chat_template_kwargs', 'max_tokens', 'messages', 'model', 'stream', 'temperature']);
        assert.deepEqual(body.chat_template_kwargs, { enable_thinking: true });
        assert.equal(body.model, 'lfm3-1.7b'); assert.equal(body.stream, stream);
        assert.ok(body.messages.length >= 2);
        assert.match(body.messages[0].content, new RegExp({ ko: 'Korean|한국어', en: 'English', ja: 'Japanese|日本語' }[locale]));
        assert.ok(!JSON.stringify(body).includes(fixtureKey));
        const value = stream
          ? 'data: ' + JSON.stringify({ model: 'lfm3-1.7b', choices: [{ delta: { content: spoken[locale] } }] }) + '\n\ndata: [DONE]\n\n'
          : JSON.stringify({ model: 'lfm3-1.7b', choices: [{ message: { content: spoken[locale] } }] });
        return new Response(value, { headers: { 'Content-Type': stream ? 'text/event-stream' : 'application/json' } });
      }) as typeof fetch;
      const result = await both(fetcher, {}, locale, stream ? part => parts.push(part) : undefined);
      assert.equal(calls, 2, `${locale}/${stream}: ${JSON.stringify(result.replies)}`);
      for (const reply of result.replies) {
        assert.equal(reply.error, undefined); assert.equal(reply.source, 'local'); assert.equal(reply.model, 'lfm3-1.7b');
        assert.equal('text' in reply ? reply.text : reply.reply.text, spoken[locale]);
        assert.ok(!JSON.stringify(reply).includes(fixtureKey));
      }
      if (stream) assert.ok(parts.includes(spoken[locale]));
    }
  });
});

test('KokoaAI normalizes base paths and defaults to lfm3-1.7b', async () => {
  for (const url of [base, base + '/', base + '/chat/completions', base + '/chat/completions/']) {
    await configured({ ...defaults, KOKOAAI_BASEURL: url, KOKOAAI_MODEL: ' ' }, async () => {
      let calls = 0;
      await both((async (input, init) => {
        calls++; assert.equal(String(input), base + '/chat/completions'); assert.equal(JSON.parse(String(init?.body)).model, 'lfm3-1.7b');
        return new Response(JSON.stringify({ choices: [{ message: { content: spoken.en } }] }));
      }) as typeof fetch);
      assert.equal(calls, 2);
    });
  }
});

test('invalid remote configuration fails closed without local or browser fallback', async () => {
  for (const values of [
    { KOKOAAI_APIKEY: '' }, { KOKOAAI_APIKEY: 'invalid\r\nheader' },
    ...['http://chat.kokoa.dev/v1', 'https://user:secret@chat.kokoa.dev/v1', base + '?token=x', base + '#fragment', 'invalid'].map(KOKOAAI_BASEURL => ({ KOKOAAI_BASEURL })),
  ]) await configured({ ...defaults, ...values }, async () => {
    let calls = 0;
    const result = await both((async () => { calls++; throw new Error('Unexpected request'); }) as typeof fetch);
    assert.equal(calls, 0);
    for (const reply of result.replies) assert.equal(reply.error, 'unavailable');
  });
});

test('remote HTTP errors preserve busy/unavailable behavior and never expose upstream bodies', async () => {
  await configured(defaults, async () => {
    for (const status of [401, 429, 503]) {
      const result = await both((async () => new Response(fixtureKey, { status })) as typeof fetch);
      for (const reply of result.replies) {
        assert.equal(reply.error, status === 429 ? 'busy' : 'unavailable');
        assert.ok(!JSON.stringify(reply).includes(fixtureKey));
      }

    }
  });
});

test('remote request timeouts abort both NPC and GM requests without browser fallback', async () => {
  await configured(defaults, async () => {
    let aborted = 0;
    const fetcher = (async (_input, init) => new Promise<Response>((_resolve, reject) => {
      init!.signal!.addEventListener('abort', () => { aborted++; reject(new DOMException('Aborted', 'AbortError')); }, { once: true });
    })) as typeof fetch;
    const result = await both(fetcher, { timeoutMs: 15 });
    assert.equal(aborted, 2);
    for (const reply of result.replies) assert.equal(reply.error, 'timeout');
  });
});

test('remote transport errors are sanitized before logging', async () => {
  await configured(defaults, async () => {
    const errors: unknown[] = [];
    const result = await both((async () => { throw new Error('Authorization: Bearer ' + fixtureKey); }) as typeof fetch, { onError: error => errors.push(error) });
    assert.equal(errors.length, 2);
    for (const error of errors) assert.ok(!String(error).includes(fixtureKey));
    for (const reply of result.replies) assert.equal(reply.error, 'unavailable');
  });
});

test('explicit programmatic local endpoints do not receive KokoaAI credentials', async () => {
  await configured(defaults, async () => {
    let calls = 0;
    const options = { url: 'http://127.0.0.1:18081/v1', fetch: (async (input, init) => {
      calls++; assert.equal(String(input), 'http://127.0.0.1:18081/v1/chat/completions');
      assert.equal(new Headers(init?.headers).get('Authorization'), null);
      const body = JSON.parse(String(init?.body)); assert.ok(!('cache_prompt' in body)); assert.deepEqual(body.chat_template_kwargs, { enable_thinking: true });
      return new Response(JSON.stringify({ choices: [{ message: { content: spoken.en } }] }));
    }) as typeof fetch };
    await new NpcChat(options).chat('local', { requestId: 'local-test', npcId: 'rin', locale: 'en', text: 'A quiet evening sounds pleasant.' });
    const state = profile();
    await new FantasyGmChat(options).chat('local', { requestId: 'local-test', locale: 'en', text: 'A quiet evening sounds pleasant.' }, { session: 'local', world: 'fantasy', profile: state });
    assert.equal(calls, 2);
  });
});

test('application never falls back when no KokoaAI key is configured', async () => {
  await configured({}, async () => {
    let calls = 0;
    const options = { fetch: (async () => { calls++; throw new Error('Unexpected inference'); }) as typeof fetch };
    const state = profile(), request = { requestId: 'missing-key', locale: 'en' as const, text: 'A quiet evening sounds pleasant.' };
    const npc = await new NpcChat(options).chat('missing-key', { ...request, npcId: 'rin' });
    const gm = await new FantasyGmChat(options).chat('missing-key', request, { session: 'test', world: 'fantasy', profile: state });
    assert.equal(npc.error, 'unavailable'); assert.equal(gm.error, 'unavailable'); assert.equal(calls, 0);
  });
});
