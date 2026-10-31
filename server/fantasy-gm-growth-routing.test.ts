import test from 'node:test';
import assert from 'node:assert/strict';
import { FantasyGmChat } from './fantasy-gm-chat.ts';
import { applyFantasyAction, newFantasyProfile, startFantasyActivity } from '../shared/fantasy-engine.ts';
import { FANTASY_JOBS } from '../shared/fantasy-data.ts';

test('server routes growth questions to current-state hints before generic status, jobs and activity answers', async () => {
  let calls = 0;
  const gm = new FantasyGmChat({ url: 'http://127.0.0.1:18081/v1', fetch: (async () => { calls++; throw new Error('growth must use verified rules'); }) as typeof fetch });
  const profile = applyFantasyAction(newFantasyProfile(), { type: 'create', source: 'human', name: 'Hints', gender: 'female' }).profile;
  Object.assign(profile.character!, { job: 'warrior', lifeJob: 'cook', location: 'hearth', hour: 12, jobXp: { warrior: 73, cook: 19 } });
  const active = startFantasyActivity(profile, { type: 'work', career: 'life' }, 12, () => .5).profile;
  assert.ok(active.activity);
  const context = { session: 'growth-test', world: 'fantasy', profile: active }, before = structuredClone(active);
  for (const [locale, query] of [
    ['ko', '성장하려면 지금 무슨 행동을 해야 하나요?'],
    ['en', 'How can I improve my skills and MP?'],
    ['ja', 'どうすれば成長できますか？'],
    ['en', 'How should I train as a warrior to grow stronger?'],
  ] as const) {
    const result = await gm.chat('growth-user', { requestId: crypto.randomUUID(), text: query, locale }, context);
    assert.equal(result.source, 'rules'); assert.equal(result.error, undefined);
    assert.match(result.reply.text, /73/); assert.match(result.reply.text, /19/);
    assert.match(result.reply.text, /반복|repeat|反復/i);
    assert.ok(result.reply.text.includes(FANTASY_JOBS.find(j => j.id === 'cook')!.names[locale]));
    assert.deepEqual(result.reply.suggestions, []);
  }
  assert.equal(calls, 0); assert.deepEqual(active, before);
});

test('server keeps unrelated growing questions on live free dialogue', async () => {
  let calls = 0;
  const gm = new FantasyGmChat({ url: 'http://127.0.0.1:18081/v1', fetch: (async () => {
    calls++;
    return new Response(JSON.stringify({ model: 'live-test', choices: [{ message: { content: 'Flowers develop under suitable conditions.' } }] }), { headers: { 'Content-Type': 'application/json' } });
  }) as typeof fetch });
  const profile = applyFantasyAction(newFantasyProfile(), { type: 'create', source: 'human', name: 'Flowers', gender: 'female' }).profile;
  const result = await gm.chat('flowers', { requestId: crypto.randomUUID(), text: 'How do flowers grow?', locale: 'en' }, { session: 'growth-test', world: 'fantasy', profile });
  assert.equal(result.source, 'local'); assert.equal(result.error, undefined); assert.equal(calls, 1);
  assert.match(result.reply.text, /Flowers develop/); assert.deepEqual(result.reply.suggestions, []);
});
