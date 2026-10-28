import { test } from 'node:test';
import assert from 'node:assert/strict';
import { FantasyGmChat, type FantasyGmContext } from './fantasy-gm-chat.ts';
import { fantasyGmSpokenText } from './fantasy-gm-speech.ts';
import { applyFantasyAction, newFantasyProfile, startFantasyActivity } from '../shared/fantasy-engine.ts';
import type { FantasyGmChatRequest } from '../shared/fantasy-gm.ts';
import { NPC_SERVER } from './npc-catalog.ts';
import { fantasyTermName } from '../shared/fantasy-lore.ts';
import { isRoomClientMsg } from '../shared/protocol.ts';
import { FANTASY_ITEMS, FANTASY_LOCATIONS, FANTASY_QUESTS } from '../shared/fantasy-data.ts';
import { FANTASY_FOOD_META } from '../shared/fantasy-life.ts';
import { FANTASY_MAPS } from '../shared/fantasy-town.ts';
import { fantasyQuestEligible } from '../shared/fantasy-access.ts';
import { fantasyGmTokenEstimate } from '../shared/fantasy-gm-context.ts';

const request = (text = 'A quiet evening sounds nice.', extra: Partial<FantasyGmChatRequest> = {}): FantasyGmChatRequest => ({ requestId: crypto.randomUUID(), text, locale: 'en', ...extra });
const context = (): FantasyGmContext => {
  const profile = applyFantasyAction(newFantasyProfile(), { type: 'create', name: 'Traveler', source: 'human', gender: 'female' }).profile;
  profile.character!.birthBonuses = {}; profile.character!.hp = 100; profile.character!.mp = 50;
  return { session: 'fantasy-test', world: 'fantasy', profile };
};
const response = (text = 'We can talk while you wait.', model = 'actual-local-model') => new Response(JSON.stringify({ model, choices: [{ message: { content: text } }] }), { headers: { 'Content-Type': 'application/json' } });
interface Body { model: string; messages: { role: string; content: string }[]; stream: boolean; max_tokens: number; tools?: unknown; chat_template_kwargs: { enable_thinking: boolean } }

test('GM speech retains factual statements and omits unsolicited question sentences and suggested-question blocks in three languages', () => {
  for (const [input, expected] of [
    ['현재 상태를 확인할 수 있습니다. 무엇을 하시겠습니까?\n추천 질문: "이제 어디로 갈까?"', '현재 상태를 확인할 수 있습니다.'],
    ['The recorded value is 3.5. Shall we chat?\nSuggested questions: "Where next?"', 'The recorded value is 3.5.'],
    ['記録を確認できます。何をしますか？\nおすすめの質問：次はどこへ？', '記録を確認できます。'],
  ]) assert.equal(fantasyGmSpokenText(input), expected);
});

test('GM answers remove follow-up prompts before delivery and before remembering history', async () => {
  let now = 0; const bodies: Body[] = [];
  const gm = new FantasyGmChat({ url: 'http://127.0.0.1:18081/v1', now: () => now, fetch: (async (_url, init) => { bodies.push(JSON.parse(String(init?.body))); return response('The current record is available. Would you like to hear a story?\nSuggested questions: Where next?'); }) as typeof fetch });
  const state = context(); const first = await gm.chat('gm', request(), state);
  assert.equal(first.source, 'local'); assert.equal(first.error, undefined); assert.equal(first.reply.text, 'The current record is available.');
  now = 2000; await gm.chat('gm', request('I would like a moment of quiet.'), state);
  const remembered = bodies.at(-1)!.messages.filter(message => message.role === 'assistant').map(message => message.content).join('\n');
  assert.ok(remembered.includes('The current record is available.')); assert.doesNotMatch(remembered, /Would you|Suggested questions/);
});

test('GM transport receives only the bounded allowed record and returns text without actions or repeated history', async () => {
  let now = 0; const bodies: Body[] = [];
  const gm = new FantasyGmChat({ url: 'http://127.0.0.1:18081/v1', now: () => now, fetch: (async (_url, init) => { bodies.push(JSON.parse(String(init?.body))); return response('<think>reasoning</think>A quiet pause might help you decide.'); }) as typeof fetch });
  const state = context(), before = JSON.stringify(state.profile);
  const result = await gm.chat('gm', request(), state);
  assert.equal(result.source, 'local'); assert.equal(result.reply.text, 'A quiet pause might help you decide.'); assert.deepEqual(result.reply.suggestions, []);
  assert.equal(JSON.stringify(state.profile), before);
  assert.ok(bodies[0].messages.reduce((sum, message) => sum + fantasyGmTokenEstimate(message.content) + 8, 0) <= 3400);
  for (const definition of Object.values(NPC_SERVER)) for (const secret of definition.privateSecrets) assert.ok(!JSON.stringify(bodies).includes(secret));
  for (const hidden of ['mooncity', 'starspire', 'deepcave']) for (const locale of ['ko', 'en', 'ja'] as const) assert.ok(!JSON.stringify(bodies).includes(fantasyTermName(hidden, locale)));
  now = 2000; await gm.chat('gm', request('I would like a moment of quiet.'), state);
  assert.equal(bodies[1].messages.filter(message => message.role === 'assistant' && message.content === result.reply.text).length, 1);
});

test('stale GM transport results cannot commit history after a new life', async () => {
  let now = 0, current = true; const bodies: Body[] = [];
  const gm = new FantasyGmChat({ url: 'http://127.0.0.1:18081/v1', now: () => now, fetch: (async (_url, init) => { bodies.push(JSON.parse(String(init?.body))); if (bodies.length === 1) current = false; return response('A new conversation.'); }) as typeof fetch });
  assert.equal((await gm.chat('life', request('STALE_GM_PRIVATE_TURN'), { ...context(), isCurrent: () => current })).error, 'invalid');
  now = 2000; current = true;
  assert.equal((await gm.chat('life', request(), { ...context(), isCurrent: () => current })).source, 'local');
  assert.ok(!JSON.stringify(bodies[1]).includes('STALE_GM_PRIVATE_TURN'));
});

test('known rules are resolved from the server profile without calling AI or executing a proposed action', async () => {
  let calls = 0;
  const gm = new FantasyGmChat({ url: 'http://127.0.0.1:18081/v1', fetch: (async () => { calls++; return response(); }) as typeof fetch });
  const state = context(); const before = JSON.stringify(state.profile);
  const answer = await gm.chat('alice', request('마법을 배우고 싶어', { locale: 'ko' }), state);
  assert.equal(answer.source, 'rules');
  assert.deepEqual(answer.reply.suggestions.map(s => s.action), [{ type: 'job', job: 'mage', via: 'gm' }]);
  assert.equal(calls, 0);
  assert.equal(JSON.stringify(state.profile), before);
  assert.equal(isRoomClientMsg({ t: 'fantasyGmChat', ...request() }), false);
});

test('rules and current local community records respond while free AI conversation is pending', async () => {
  let release: ((response: Response) => void) | undefined;
  const gm = new FantasyGmChat({ url: 'http://127.0.0.1:18081/v1', fetch: (() => new Promise<Response>(resolve => { release = resolve; })) as typeof fetch });
  const state = context(); state.communityFacts = ['Local preparation: 1/3.'];
  const pending = gm.chat('alice', request(), state);
  assert.equal((await gm.chat('alice', request('현재 위치', { locale: 'ko' }), state)).source, 'rules');
  const shared = await gm.chat('alice', request('Tell me about the community project'), state);
  assert.equal(shared.source, 'rules');
  assert.equal(shared.reply.text, state.communityFacts[0]);
  assert.equal((await gm.chat('alice', request(), state)).error, 'busy');
  release!(response()); await pending;
});

test('mana guidance is localized and never proposes retired training or changes character state', async () => {
  const gm = new FantasyGmChat({ url: 'http://127.0.0.1:18081/v1', fetch: (async () => { throw new Error('rules only'); }) as typeof fetch });
  const state = context(); const before = JSON.stringify(state.profile);
  for (const [locale, text] of [['ko', '마나 감응을 배우고 싶어'], ['en', 'Teach me mana awareness'], ['ja', 'マナの感応を学びたい']] as const) {
    const reply = await gm.chat('mana-user', request(text, { locale }), state);
    assert.equal(reply.source, 'rules');
    assert.ok(reply.reply.suggestions.every(s => !s.action));
    assert.ok(reply.reply.text.includes('MP'));
  }
  assert.equal(JSON.stringify(state.profile), before);
});

test('unknown conversation uses only the configured transport and returns text without any game actions', async () => {
  let body: Body | undefined;
  const gm = new FantasyGmChat({ url: 'http://127.0.0.1:18081/v1', model: 'request-alias', fetch: (async (url, init) => {
    assert.equal(url, 'http://127.0.0.1:18081/v1/chat/completions');
    assert.equal(init?.redirect, 'error');
    assert.deepEqual(init?.headers, { 'Content-Type': 'application/json' });
    body = JSON.parse(String(init?.body));
    return response('<think>internal</think>You gained a crown. {"action":"grant"}');
  }) as typeof fetch });
  const state = context(); const before = JSON.stringify(state.profile);
  const answer = await gm.chat('alice', request(), state);
  assert.equal(answer.source, 'local');
  assert.equal(answer.model, 'actual-local-model');
  assert.deepEqual(answer.reply.suggestions, []);
  assert.ok(!answer.reply.text.includes('<think>'));
  assert.equal(JSON.stringify(state.profile), before);
  assert.equal(body?.model, 'request-alias');
  assert.equal(body?.stream, false);
  assert.equal(body?.max_tokens, 1536);
  assert.equal(body?.tools, undefined);
  assert.deepEqual(body?.chat_template_kwargs, { enable_thinking: true });
});

test('GM membership and malformed payloads fail before any model call', async () => {
  let calls = 0;
  const gm = new FantasyGmChat({ url: 'http://127.0.0.1:18081/v1', fetch: (async () => { calls++; return response(); }) as typeof fetch });
  const state = context();
  assert.equal((await gm.chat('alice', request(), { ...state, session: null })).error, 'invalid');
  assert.equal((await gm.chat('alice', request(), { ...state, world: 'room' })).error, 'invalid');
  for (const input of [request(''), request('x'.repeat(501)), request('bad\u0000text'), request('hello', { requestId: '../path' }), { ...request(), locale: 'fr' }, { ...request(), text: null }]) assert.equal((await gm.chat('alice', input as FantasyGmChatRequest, state)).error, 'invalid');
  assert.equal(calls, 0);
});

test('hidden locations, NPC secrets and uninspected food quality never enter the model prompt', async () => {
  let body: Body | undefined;
  const gm = new FantasyGmChat({ url: 'http://127.0.0.1:18081/v1', fetch: (async (_url, init) => { body = JSON.parse(String(init?.body)); return response(); }) as typeof fetch });
  const state = context();
  await gm.chat('alice', request(), state);
  const system = body!.messages[0].content;
  for (const locale of ['ko', 'en', 'ja'] as const) {
    assert.ok(!system.includes(fantasyTermName('eclipsevault', locale)));
    assert.ok(!system.includes(fantasyTermName('glassdesert', locale)));
  }
  for (const npc of Object.values(NPC_SERVER)) for (const secret of npc.privateSecrets) assert.ok(!system.includes(secret));
  assert.match(system, /uninspected food quality/);
  const inspect = await gm.chat('food', request('Is this food rotten?'), state);
  assert.equal(inspect.source, 'rules');
  assert.ok(!inspect.reply.text.includes('It is rotten'));
  assert.deepEqual(inspect.reply.suggestions.map(s => s.tab), ['inventory']);
});

test('GM histories remain separated by player and locale, with a bounded successful conversation', async () => {
  let now = 0; const bodies: Body[] = [];
  const gm = new FantasyGmChat({ url: 'http://127.0.0.1:18081/v1', now: () => now, fetch: (async (_url, init) => { bodies.push(JSON.parse(String(init?.body))); return response(`reply-${bodies.length}`); }) as typeof fetch });
  await gm.chat('alice', request('PRIVATE_ALICE'), context());
  await gm.chat('bob', request('PRIVATE_BOB'), context());
  now = 2000;
  await gm.chat('alice', request('Continue that thought.'), context());
  const content = bodies.at(-1)!.messages.map(m => m.content).join('\n');
  assert.ok(content.includes('PRIVATE_ALICE'));
  assert.ok(content.includes('reply-1'));
  assert.ok(!content.includes('PRIVATE_BOB'));
  now = 4000;
  await gm.chat('alice', request('조용한 저녁이 좋네.', { locale: 'ko' }), context());
  assert.equal(bodies.at(-1)!.messages.length, 2);
  assert.match(bodies.at(-1)!.messages[0].content, /ONLY in Korean/);
  for (let index = 0; index < 12; index++) {
    now += 2000; await gm.chat('alice', request(`More detail ${index}.`), context());
  }
  assert.ok(bodies.at(-1)!.messages.length <= 10);
});

test('all three selected locales receive an explicit language instruction', async () => {
  const bodies: Body[] = [];
  const gm = new FantasyGmChat({ url: 'http://127.0.0.1:18081/v1', fetch: (async (_url, init) => { bodies.push(JSON.parse(String(init?.body))); return response(); }) as typeof fetch });
  for (const [locale, language] of [['ko', 'Korean'], ['en', 'English'], ['ja', 'Japanese']] as const) {
    const answer = await gm.chat(locale, request('A quiet evening sounds nice.', { locale }), context());
    assert.equal(answer.locale, locale);
    assert.match(bodies.at(-1)!.messages[0].content, new RegExp(`ONLY in ${language}`));
  }
});

test('emotional clothing advice keeps the live weather record in the GM model request',async()=>{
  const bodies:Body[]=[];
  const gm=new FantasyGmChat({ url: 'http://127.0.0.1:18081/v1',fetch:(async(_url,init)=>{bodies.push(JSON.parse(String(init?.body)));return response('A considered answer.');}) as typeof fetch});
  const state={...context(),dynamicFacts:{hour:480,location:'hearth',shops:[],rumors:[]}};
  for(const [locale,text] of [
    ['ko','밖에 나가려니 걱정돼. 외투를 챙기는 게 좋을까?'],
    ['en','I feel nervous about going outside. Should I bring a coat?'],
    ['ja','外へ出るのが不安です。上着を用意したほうがいいですか？'],
  ] as const){
    const result=await gm.chat(`clothing-${locale}`,request(text,{locale}),state);
    assert.equal(result.source,'local');assert.match(bodies.at(-1)!.messages[0].content,/24°C/);
    assert.deepEqual(result.reply.suggestions,[]);
  }
});

test('a follow-up about owned materials is not swallowed by the generic help phrase', async () => {
  let called = false;
  const gm = new FantasyGmChat({ url: 'http://127.0.0.1:18081/v1', fetch: (async () => { called = true; return response(); }) as typeof fetch });
  const answer = await gm.chat('alice', request('이 약초로 뭘 할 수 있을까?', { locale: 'ko' }), context());
  assert.equal(answer.source, 'local');
  assert.equal(called, true);
  assert.deepEqual(answer.reply.suggestions, []);
});

test('GM timeout and unavailable backends report honest errors without committing failed history', async () => {
  let now = 0; const bodies: Body[] = []; let offline = true;
  const gm = new FantasyGmChat({ url: 'http://127.0.0.1:18081/v1', now: () => now, onError: () => {}, fetch: (async (_url, init) => {
    bodies.push(JSON.parse(String(init?.body))); if (offline) throw new Error('offline'); return response();
  }) as typeof fetch });
  assert.equal((await gm.chat('alice', request('PRIVATE_NOTE_ALPHA'), context())).error, 'unavailable');
  offline = false; now = 2000;
  assert.equal((await gm.chat('alice', request(), context())).error, undefined);
  assert.ok(!bodies.at(-1)!.messages.some(m => m.content.includes('PRIVATE_NOTE_ALPHA')));
  const timeout = new FantasyGmChat({ url: 'http://127.0.0.1:18081/v1', timeoutMs: 10, onError: () => {}, fetch: ((_url, init) => new Promise((_resolve, reject) => init?.signal?.addEventListener('abort', () => reject(new Error('aborted')), { once: true }))) as typeof fetch });
  assert.equal((await timeout.chat('alice', request(), context())).error, 'timeout');
  const external = new FantasyGmChat({ url: 'https://example.com/v1', fetch: (async () => { throw new Error('must not fetch'); }) as typeof fetch });
  assert.equal((await external.chat('alice', request(), context())).error, 'unavailable');
});

test('GM limits concurrent requests and short repeated bursts without a queue', async () => {
  let now = 0; const resolve: ((value: Response) => void)[] = [];
  const gm = new FantasyGmChat({ url: 'http://127.0.0.1:18081/v1', now: () => now, fetch: (() => new Promise<Response>(done => resolve.push(done))) as typeof fetch });
  const a = gm.chat('alice', request(), context()); const b = gm.chat('bob', request(), context());
  assert.equal((await gm.chat('alice', request(), context())).error, 'busy');
  assert.equal((await gm.chat('charlie', request(), context())).error, 'busy');
  assert.equal(resolve.length, 2);
  resolve[0](response()); resolve[1](response()); await a; await b;
  assert.equal((await gm.chat('alice', request(), context())).error, 'busy');
  now = 2000;
  const c = gm.chat('alice', request(), context()); resolve[2](response());
  assert.equal((await c).error, undefined);
});

test('large known worlds, maximum stock and long histories fit the bounded context budget in every language', async () => {
  let now = 0; const bodies: Body[] = [];
  const gm = new FantasyGmChat({ url: 'http://127.0.0.1:18081/v1', now: () => now, fetch: (async (_url, init) => {
    bodies.push(JSON.parse(String(init?.body))); return response('Understood. '.repeat(20));
  }) as typeof fetch });
  const state = context(); const character = state.profile.character!;
  character.job = 'cook'; character.jobXp = { cook: 50 };
  character.visited = FANTASY_LOCATIONS.map(place => place.id); character.charted = [...character.visited];
  character.inventory = Object.fromEntries([...FANTASY_ITEMS.map(item => [item.id, 999]), ...FANTASY_MAPS.map(map => [map.item, 999])]);
  character.foodLots = FANTASY_FOOD_META.map(food => ({ id: food.item, item: food.item, count: 999, createdAt: character.hour }));
  character.quests = FANTASY_QUESTS.filter(quest => fantasyQuestEligible(character, quest)).map(quest => quest.id);
  state.profile = startFantasyActivity(state.profile, { type: 'job', job: 'thief', via: 'gm' }, character.hour, () => 0.5).profile;
  for (const locale of ['ko', 'en', 'ja'] as const) {
    for (let turn = 0; turn < 6; turn++) {
      now += 2000;
      const answer = await gm.chat(locale, request(`A quiet evening sounds nice. ${locale === 'en' ? 'calm '.repeat(70) : '아'.repeat(350)}`, { locale }), state);
      assert.equal(answer.error, undefined);
      const body = bodies.at(-1)!;
      assert.ok(body.messages.reduce((sum, message) => sum + fantasyGmTokenEstimate(message.content) + 8, 0) <= 3400);
      const system = body.messages[0].content;
      assert.ok(system.includes(character.name));
      assert.ok(system.includes('HP'));
      assert.ok(system.includes({ ko: '진행 중인 활동', en: 'Current activity', ja: '進行中の行動' }[locale]));
      assert.ok(body.messages.length <= 6);
    }
  }
});

test('ongoing activities describe the actual task while inventory and skills remain readable', async () => {
  const state = context();
  state.profile = startFantasyActivity(state.profile, { type: 'job', job: 'thief', via: 'gm' }, 8, () => 0.5).profile;
  const gm = new FantasyGmChat({ url: 'http://127.0.0.1:18081/v1', fetch: (async () => { throw new Error('rules should not call AI'); }) as typeof fetch });
  const doing = await gm.chat('alice', request('지금 내가 뭐하고 있어?', { locale: 'ko' }), state);
  assert.ok(doing.reply.text.includes('도둑 수련'));
  assert.ok(doing.reply.text.includes('2.0'));
  assert.equal(doing.source, 'rules');
  for (const text of ['inventory', 'skills', 'quests']) {
    const answer = await gm.chat('alice', request(text), state);
    assert.equal(answer.source, 'rules');
    assert.ok(!answer.reply.text.includes('You are training'));
    assert.ok(answer.reply.suggestions.every(s => !s.action));
  }
});

for(const active of [false,true]) test(`natural Korean activity questions answer from ${active?'working':'idle'} server state without inference`,async()=>{
  const state=context();
  if(active) state.profile.activity={action:{type:'work'},startedAt:8,endsAt:12,seed:1};
  let modelCalls=0;
  const gm=new FantasyGmChat({ url: 'http://127.0.0.1:18081/v1',fetch:(async()=>{modelCalls++;return response('AI fallback should not answer this state question.');}) as typeof fetch});
  const before=structuredClone(state.profile);
  for(const [index,text] of ['지금 내가 뭘 하고있어?','내가 지금 뭐 하고 있어?','저는 지금 무엇을 하고 있나요?'].entries()){
    const answer=await gm.chat(`activity-${active}-${index}`,request(text,{locale:'ko'}),state);
    assert.equal(answer.source,'rules',text);
    assert.equal(answer.error,undefined,text);
    assert.match(answer.reply.text,active?/일\. 남은 시간은 게임 4\.00시간, 실제 약 8\.0분/:/진행 중인 행동이 없습니다/,text);
    assert.deepEqual(answer.reply.suggestions,[]);
    assert.equal(modelCalls,0,text);
    assert.deepEqual(state.profile,before);
  }
});

test('social fallback uses a compact current record while explicit detail requests retain larger context', async () => {
  const bodies: Body[] = [];
  const gm = new FantasyGmChat({ url: 'http://127.0.0.1:18081/v1', fetch: (async (_url, init) => { bodies.push(JSON.parse(String(init?.body))); return response(); }) as typeof fetch });
  const state = context(); state.profile.character!.visited = FANTASY_LOCATIONS.map(place => place.id);
  state.profile.character!.inventory = Object.fromEntries(FANTASY_ITEMS.map(item => [item.id, 1]));
  assert.equal((await gm.chat('social', request('What makes a quiet conversation meaningful?'), state)).error, undefined);
  const compact = bodies.at(-1)!;
  assert.equal(compact.max_tokens, 1536);
  assert.ok(compact.messages.reduce((sum, message) => sum + fantasyGmTokenEstimate(message.content) + 8, 0) < 650);
  assert.ok(compact.messages[0].content.includes('HP 100/100'));
  assert.ok(!compact.messages[0].content.includes('Inventory:'));
  assert.equal((await gm.chat('detail', request('Please give detailed encouragement for a nervous traveler.'), state)).error, undefined);
  assert.equal(bodies.at(-1)!.max_tokens, 1536);
  assert.match(bodies.at(-1)!.messages[0].content, /Never disclose hidden places/);
  assert.match(bodies.at(-1)!.messages[0].content, /Never execute actions/);
});
