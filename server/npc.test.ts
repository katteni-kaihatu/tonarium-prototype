import { test } from 'node:test';
import assert from 'node:assert/strict';
import http from 'node:http';
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import net from 'node:net';
import { spawn } from 'node:child_process';
import { WebSocket } from 'ws';
import type { NpcChatRequest } from '../shared/npc.ts';
import { NPC_PUBLIC } from '../shared/npc.ts';
import { COMPAT_VERSION, isRoomClientMsg } from '../shared/protocol.ts';
import { NpcChat, npcAllowedFacts, npcCanonicalReply, npcEndpoint, npcSystemPrompt } from './npc.ts';
import { NPC_SERVER } from './npc-catalog.ts';
import { npcDefinitionSpeech, npcPersonalitySpeech } from './npc-info-speech.ts';
import { FANTASY_TERMS, fantasyTermName } from '../shared/fantasy-lore.ts';
import { applyFantasyAction, newFantasyProfile } from '../shared/fantasy-engine.ts';
import { FANTASY_JOBS, FANTASY_LOCATIONS, FANTASY_RACES } from '../shared/fantasy-data.ts';
import { fantasyBuildings } from '../shared/fantasy-town.ts';
import { fantasyGmTokenEstimate } from '../shared/fantasy-gm-context.ts';
import { BROWSER_AI_MODEL, type BrowserAiGeneration } from '../shared/ai-support.ts';
import { unknownNpcInformation } from './dialogue-knowledge.ts';

const answer = (text = 'Welcome to the inn.') => new Response(JSON.stringify({ choices: [{ message: { role: 'assistant', content: text } }] }), { status: 200, headers: { 'Content-Type': 'application/json' } });
const request = (text = 'A quiet evening sounds pleasant.', extra: Partial<NpcChatRequest> = {}): NpcChatRequest => ({ requestId: crypto.randomUUID(), text, locale: 'en', npcId: 'rin', ...extra });

test('browser NPC generation uses only allowed context and commits one plain dialogue turn', async () => {
  let now = 0, calls = 0; const jobs: BrowserAiGeneration[] = [];
  const service = new NpcChat({ now: () => now, fetch: (async () => { calls++; return answer(); }) as typeof fetch });
  const browserGenerate = async (job: BrowserAiGeneration) => { jobs.push(structuredClone(job)); return '<think>private reasoning</think>We could share a quiet cup of tea.'; };
  const result = await service.chat('browser-alice', request(), { browserGenerate });
  assert.equal(result.source, 'browser'); assert.equal(result.model, BROWSER_AI_MODEL); assert.equal(result.error, undefined);
  assert.equal(result.text, 'We could share a quiet cup of tea.'); assert.equal(result.actions, undefined); assert.equal(calls, 0);
  assert.equal(jobs[0].kind, 'npc'); assert.ok(jobs[0].maxTokens <= 256);
  for (const definition of Object.values(NPC_SERVER)) for (const secret of definition.privateSecrets) assert.ok(!JSON.stringify(jobs).includes(secret));
  now = 2000;
  await service.chat('browser-alice', request('I brought a different kind of tea.'), { browserGenerate });
  assert.equal(jobs[1].messages.filter(message => message.role === 'assistant' && message.content === result.text).length, 1);
});

test('NPC browser failures and malformed spoken results fall back once to the existing local model', async () => {
  for (const bad of [undefined, '', '<think>reasoning only</think>', '{"action":{"type":"buy","item":"blade"}}', '```json\n{"gold":99}\n```', 'a'.repeat(1201)]) {
    let calls = 0;
    const service = new NpcChat({ fetch: (async () => { calls++; return answer('Local fallback.'); }) as typeof fetch });
    const result = await service.chat('browser-fallback', request(), { browserGenerate: async () => bad });
    assert.equal(result.source, 'local'); assert.equal(result.text, 'Local fallback.'); assert.equal(calls, 1);
  }
  const service = new NpcChat({ fetch: (async () => answer('Come and rest for a while.')) as typeof fetch });
  assert.equal((await service.chat('rejected-browser', request(), { browserGenerate: async () => { throw new Error('browser disconnected'); } })).source, 'local');
});

test('stale NPC browser or fallback results neither commit old history nor start a new local request', async () => {
  let now = 0, current = true, calls = 0; const jobs: BrowserAiGeneration[] = [];
  const service = new NpcChat({ now: () => now, fetch: (async () => { calls++; current = false; return answer('Stale local response.'); }) as typeof fetch });
  const stale = await service.chat('stale-browser', request('STALE_BROWSER_PRIVATE_TURN'), {
    isCurrent: () => current, browserGenerate: async () => { current = false; return 'A stale browser answer.'; },
  });
  assert.equal(stale.error, 'invalid'); assert.equal(calls, 0);
  now = 2000; current = true;
  const next = await service.chat('stale-browser', request(), { isCurrent: () => current, browserGenerate: async job => { jobs.push(job); return 'A current answer.'; } });
  assert.equal(next.source, 'browser'); assert.ok(!JSON.stringify(jobs).includes('STALE_BROWSER_PRIVATE_TURN'));
  current = true;
  const local = await service.chat('stale-local', request(), { isCurrent: () => current, browserGenerate: async () => undefined });
  assert.equal(local.error, 'invalid'); assert.equal(calls, 1);
});

test('browser NPC jobs use no server generation slot and canonical replies still bypass pending inference', async () => {
  const releases: ((text: string) => void)[] = []; let calls = 0;
  const service = new NpcChat({ fetch: (async () => { calls++; return answer('Come and rest for a while.'); }) as typeof fetch });
  const browserGenerate = () => new Promise<string>(resolve => releases.push(resolve));
  const a = service.chat('browser-one', request(), { browserGenerate });
  const b = service.chat('browser-two', request(), { browserGenerate });
  const canonical = await service.chat('browser-one', request('Hello'), { browserGenerate });
  assert.equal(canonical.source, 'canon'); assert.equal(releases.length, 2);
  assert.equal((await service.chat('server-three', request())).source, 'local'); assert.equal(calls, 1);
  releases[0]('A little quiet helps.'); releases[1]('A warm hearth helps.');
  assert.equal((await a).source, 'browser'); assert.equal((await b).source, 'browser');
});

test('expanded residents use registered homes, races and teachable professions with distinct public profiles', () => {
  assert.ok(NPC_PUBLIC.length >= 25);
  const profiles = new Set<string>();
  for (const npc of NPC_PUBLIC) {
    assert.ok(FANTASY_LOCATIONS.some(place => place.id === npc.homeLocation), npc.id);
    assert.ok(FANTASY_RACES.some(race => race.id === npc.race), npc.id);
    assert.ok(npc.age >= 18 && npc.age < 1000);
    if (npc.building !== 'residence') assert.ok(fantasyBuildings({ location: npc.homeLocation }).some(building => building.id === npc.building && building.npcIds.includes(npc.id)), npc.id);
    assert.ok((npc.trainableJobs ?? []).every(id => FANTASY_JOBS.some(job => job.id === id && job.category !== 'none')));
    profiles.add(JSON.stringify([npc.name, npc.age, npc.gender, npc.homeLocation, npc.role, npc.personality]));
  }
  assert.equal(profiles.size, NPC_PUBLIC.length);
});

test('local residents may teach crime professions while foreign NPC IDs and preview training grant nothing', async () => {
  const service = new NpcChat({ fetch: (async () => { throw new Error('rules only'); }) as typeof fetch });
  const profile = applyFantasyAction(newFantasyProfile(), { type: 'create', source: 'human', name: 'Learner', gender: 'male' }, () => .999).profile;
  const npcId = 'hearth-nyx';
  const taught = await service.chat('learner', request('Teach me to become a thief.', { npcId }), { character: profile.character! });
  assert.deepEqual(taught.actions, [{ type: 'job', job: 'thief', via: 'npc', npcId }]);
  assert.equal(applyFantasyAction(profile, taught.actions![0]).error, undefined);
  assert.equal((await service.chat('preview', request('Teach me to become a thief.', { npcId }))).actions, undefined);
  assert.equal((await service.chat('bad', request('Teach me to become a thief.', { npcId: 'redweave-cass' }), { character: profile.character! })).error, 'invalid');
});

test('simple canonical replies bypass pending model generation without discarding either successful turn', async () => {
  let release: ((response: Response) => void) | undefined;
  const service = new NpcChat({ fetch: (() => new Promise<Response>(resolve => { release = resolve; })) as typeof fetch });
  const pending = service.chat('alice', request());
  assert.equal((await service.chat('alice', request('How old are you?'))).source, 'canon');
  assert.equal((await service.chat('alice', request('Thank you'))).source, 'canon');
  assert.equal((await service.chat('alice', request())).error, 'busy');
  release!(answer());
  assert.equal((await pending).relationship, 'familiar');
});

test('NPC prompts fit the 4096 context with an 800-character non-ASCII query and cache prompt enabled', async () => {
  let body: Body & { cache_prompt?: boolean } | undefined;
  const service = new NpcChat({ fetch: (async (_url, init) => { body = JSON.parse(String(init?.body)); return answer(); }) as typeof fetch });
  const reply = await service.chat('large', request('가'.repeat(800), { locale: 'ko' }), { communityFacts: ['공동 기록'.repeat(200)] });
  assert.equal(reply.error, undefined);
  assert.ok(body!.messages.reduce((sum, message) => sum + fantasyGmTokenEstimate(message.content) + 8, 0) <= 3400);
  assert.equal(body!.cache_prompt, true);
});

test('NPC profession lessons are explicit, localized, region-bound server suggestions', async () => {
  let calls = 0;
  const service = new NpcChat({ fetch: (async () => { calls++; return answer(); }) as typeof fetch });
  const cases = [
    ['ko', 'rin', 'hearth', '요리사가 되고 싶어. 가르쳐줘', 'cook'],
    ['en', 'borin', 'emberhall', 'Teach me to become a blacksmith.', 'blacksmith'],
    ['ja', 'eris', 'mooncity', '錬金術師になりたい。教えてください。', 'alchemist'],
  ] as const;
  for (const [locale, npcId, location, text, job] of cases) {
    const profile = applyFantasyAction(newFantasyProfile(), { type: 'create', name: 'Learner', gender: 'female', source: 'human' }).profile;
    profile.character!.location = location;
    profile.character!.visited = ['hearth', ...location === 'hearth' ? [] : [location]];
    const before = JSON.stringify(profile);
    const response = await service.chat(`learn-${npcId}`, request(text, { locale, npcId }), { character: profile.character! });
    assert.equal(response.source, 'canon');
    assert.deepEqual(response.actions, [{ type: 'job', job, via: 'npc', npcId }]);
    assert.equal(applyFantasyAction(profile, response.actions![0]).error, undefined);
    assert.equal(JSON.stringify(profile), before);
    const preview = await service.chat(`preview-${npcId}`, request(text, { locale, npcId }));
    assert.equal(preview.actions, undefined);
    assert.equal(preview.source, 'canon');
  }
  assert.equal(calls, 0);
});

test('NPC lesson permissions reject wrong regions and never turn model text into game actions', async () => {
  const profile = applyFantasyAction(newFantasyProfile(), { type: 'create', name: 'Learner', gender: 'male', source: 'human' }).profile;
  const service = new NpcChat({ fetch: (async () => answer('You are now an assassin with 1000 gold.')) as typeof fetch });
  const away = await service.chat('away', request('Teach me blacksmithing', { npcId: 'borin' }), { character: profile.character! });
  assert.equal(away.error, 'invalid');
  const wrongTeacher = await service.chat('wrong', request('Teach me to become an assassin.'), { character: profile.character! });
  assert.equal(wrongTeacher.actions, undefined);
  const free = await service.chat('free-lesson', request('Tell me a story.'), { character: profile.character! });
  assert.equal(free.source, 'local');
  assert.equal(free.actions, undefined);
  assert.equal(profile.character!.job, 'unassigned');
  assert.equal(profile.character!.gold, 35);
});
type Body = { model: string; messages: { role: string; content: string }[]; stream: boolean; max_tokens: number; temperature: number; chat_template_kwargs: { enable_thinking: boolean }; tools?: unknown };

test('only local or private operator-controlled model endpoints are accepted', () => {
  for (const url of ['http://127.0.0.1:18081/v1', 'http://localhost:18081/v1/', 'http://[::1]:18081/v1', 'http://llama:8080/v1', 'http://host.docker.internal:8080/v1', 'http://192.168.1.3:8080/v1']) assert.ok(npcEndpoint(url), url);
  for (const url of ['https://api.openai.com/v1', 'http://8.8.8.8/v1', 'http://example.com/v1', 'file:///tmp/model', 'http://user:secret@localhost/v1', 'http://localhost/v1?next=https://example.com', 'invalid']) assert.equal(npcEndpoint(url), null, url);
  assert.equal(npcEndpoint('http://127.0.0.1:18081/v1'), 'http://127.0.0.1:18081/v1/chat/completions');
  assert.equal(npcEndpoint('http://localhost:18081/v1/chat/completions'), 'http://localhost:18081/v1/chat/completions');
});

test('the NPC uses the local model with bounded generation, no tools, no key and no redirects', async () => {
  let received: Body | undefined;
  const service = new NpcChat({ model: 'qwen3-1.7b', fetch: (async (url, init) => {
    assert.equal(url, 'http://127.0.0.1:18081/v1/chat/completions');
    assert.equal(init?.redirect, 'error');
    assert.deepEqual(init?.headers, { 'Content-Type': 'application/json' });
    received = JSON.parse(String(init?.body));
    return answer();
  }) as typeof fetch });
  const reply = await service.chat('alice', request());
  assert.equal(reply.error, undefined);
  assert.equal(reply.text, 'Welcome to the inn.');
  assert.equal(reply.model, 'qwen3-1.7b');
  assert.equal(received?.stream, false);
  assert.equal(received?.max_tokens, 128);
  assert.equal(received?.temperature, 0.7);
  assert.equal(received?.chat_template_kwargs.enable_thinking, false);
  assert.equal(received?.tools, undefined);
});

test('NPC social prompts omit unrelated world facts while factual questions select allowed expertise', async () => {
  const bodies: Body[] = [];
  const service = new NpcChat({ fetch: (async (_url, init) => { bodies.push(JSON.parse(String(init?.body))); return answer(); }) as typeof fetch });
  assert.equal((await service.chat('social', request('What makes a quiet conversation meaningful?'))).error, undefined);
  const social = bodies.at(-1)!;
  assert.equal(social.max_tokens, 128);
  assert.ok(social.messages.reduce((sum, message) => sum + fantasyGmTokenEstimate(message.content) + 8, 0) < 650);
  assert.ok(!social.messages[0].content.includes(NPC_SERVER.rin.knownFacts[0]));
  assert.ok(!social.messages[0].content.includes('Tidehaven'));
  const caravan = npcSystemPrompt('ko', 'rin', 'stranger', {}, '대상인으로 여행하던 시절의 삶을 이야기해 줄래? caravan');
  assert.ok(caravan.includes(NPC_SERVER.rin.publicFacts[2]));
  for (const secret of NPC_SERVER.rin.privateSecrets) assert.ok(!caravan.includes(secret));
  for (const fact of NPC_SERVER.rin.conditionalFacts) assert.ok(!caravan.includes(fact.fact));
  assert.equal((await service.chat('detail', request('Please give detailed encouragement for a nervous traveler.'))).error, undefined);
  assert.equal(bodies.at(-1)!.max_tokens, 256);
});

test('all three locales select an explicit response language and localized persona name', async () => {
  const bodies: Body[] = [];
  const service = new NpcChat({ fetch: (async (_url, init) => { bodies.push(JSON.parse(String(init?.body))); return answer(); }) as typeof fetch });
  for (const [locale, language, name] of [['ko', 'Korean', '린'], ['en', 'English', 'Rin'], ['ja', 'Japanese', 'リン']] as const) {
    assert.equal((await service.chat(locale, request(undefined, { locale }))).error, undefined);
    assert.match(bodies.at(-1)!.messages[0].content, new RegExp(`ONLY in ${language}`));
    assert.ok(bodies.at(-1)!.messages[0].content.includes(name));
    assert.match(npcSystemPrompt(locale), /Never claim to have granted gold, items, professions or results/);
  }
});

test('age influence remains live generation with public experience ahead of unrelated live records and service lists', async () => {
  const bodies: Body[]=[];
  const service=new NpcChat({fetch:(async(_url,init)=>{bodies.push(JSON.parse(String(init?.body)));return answer('A measured response.');}) as typeof fetch});
  const profile=applyFantasyAction(newFantasyProfile(),{type:'create',name:'Traveler',source:'human',gender:'female'}).profile;
  const state={character:profile.character!,dynamicFacts:{hour:49,location:'hearth',shops:[],rumors:[{hour:48,text:'UNRELATED_NEWS_SENTINEL'}]}};
  for(const [locale,text] of [
    ['ko','네 나이가 이 여관을 운영하는 방식에 어떤 영향을 줘?'],
    ['en','How does your age influence the way you run this inn?'],
    ['ja','あなたの年齢は、この宿の営み方にどう影響していますか？'],
  ] as const){
    const result=await service.chat(`age-focus-${locale}`,request(text,{locale}),state);
    assert.equal(result.source,'local');assert.equal(result.text,'A measured response.');
    const system=bodies.at(-1)!.messages[0].content;
    assert.match(system,/34-year-old/);assert.match(system,/experienced traveling merchant/);
    assert.doesNotMatch(system,/UNRELATED_NEWS_SENTINEL|Rooms \(complete\)|Meals:|Current goods:|°C|맑아|흐려|It's (?:clear|cloudy)|曇っています|晴れています/);
  }
  assert.equal(bodies.length,3);
});

test('emotional clothing advice still sends relevant live weather to NPC generation in every locale',async()=>{
  const bodies:Body[]=[];
  const service=new NpcChat({fetch:(async(_url,init)=>{bodies.push(JSON.parse(String(init?.body)));return answer('A considered answer.');}) as typeof fetch});
  const profile=applyFantasyAction(newFantasyProfile(),{type:'create',name:'Traveler',source:'human',gender:'female'}).profile;
  const state={character:profile.character!,dynamicFacts:{hour:480,location:'hearth',shops:[],rumors:[]}};
  for(const [locale,text,weather] of [
    ['ko','밖에 나가려니 걱정돼. 외투를 챙기는 게 좋을까?',/흐려/],
    ['en','I feel nervous about going outside. Should I bring a coat?',/cloudy/],
    ['ja','外へ出るのが不安です。上着を用意したほうがいいですか？',/曇って/],
  ] as const){
    const result=await service.chat(`clothing-${locale}`,request(text,{locale}),state);
    assert.equal(result.source,'local');assert.match(bodies.at(-1)!.messages[0].content,weather);
    assert.equal(result.text,'A considered answer.');
  }
});

test('user histories are private and a second turn includes the actual prior reply', async () => {
  let now = 0;
  const bodies: Body[] = [];
  const service = new NpcChat({ now: () => now, fetch: (async (_url, init) => { bodies.push(JSON.parse(String(init?.body))); return answer(`answer-${bodies.length}`); }) as typeof fetch });
  await service.chat('alice', request('private-alice'));
  await service.chat('bob', request('private-bob'));
  now = 2000;
  await service.chat('alice', request('Please continue our conversation.'));
  const content = bodies[2].messages.map(m => m.content).join('\n');
  assert.match(content, /private-alice/);
  assert.match(content, /answer-1/);
  assert.ok(!content.includes('private-bob'));
  assert.equal(bodies[1].messages.length, 2);
});

test('empty reset calls no model, resets only that user, and locale changes start fresh context', async () => {
  let now = 0;
  const bodies: Body[] = [];
  const service = new NpcChat({ now: () => now, fetch: (async (_url, init) => { bodies.push(JSON.parse(String(init?.body))); return answer(); }) as typeof fetch });
  await service.chat('alice', request('alice-old'));
  await service.chat('bob', request('bob-old'));
  assert.equal((await service.chat('alice', request('', { reset: true }))).error, undefined);
  assert.equal(bodies.length, 2);
  now = 2000;
  await service.chat('alice', request('alice-new'));
  await service.chat('bob', request('bob-new'));
  assert.equal(bodies[2].messages.length, 2);
  assert.ok(bodies[3].messages.some(m => m.content === 'bob-old'));
  now = 4000;
  await service.chat('bob', request('한국어', { locale: 'ko' }));
  assert.equal(bodies[4].messages.length, 2);
});

test('invalid, oversized and empty messages do not reach the model', async () => {
  let calls = 0;
  const service = new NpcChat({ fetch: (async () => { calls++; return answer(); }) as typeof fetch });
  for (const input of [request('a'.repeat(801)), request(''), request('bad\u0000text'), request('X', { requestId: '../path' }),
    { ...request(), locale: 'fr' }, { ...request(), reset: 'yes' }, { ...request(), text: null }, { ...request(), npcId: 'unknown-npc' }]) {
    assert.equal((await service.chat('alice', input as NpcChatRequest)).error, 'invalid');
  }
  assert.equal(calls, 0);
});

test('one request per user and at most two model requests run at once without a queue', async () => {
  const resolve: ((response: Response) => void)[] = [];
  const service = new NpcChat({ fetch: (() => new Promise<Response>(done => resolve.push(done))) as typeof fetch });
  const a = service.chat('alice', request());
  const b = service.chat('bob', request());
  assert.equal((await service.chat('alice', request('Again'))).error, 'busy');
  assert.equal((await service.chat('alice', request('', { reset: true }))).error, 'busy');
  assert.equal((await service.chat('charlie', request())).error, 'busy');
  assert.equal(resolve.length, 2);
  resolve[0](answer()); resolve[1](answer());
  assert.equal((await a).error, undefined);
  assert.equal((await b).error, undefined);
  const c = service.chat('charlie', request());
  assert.equal(resolve.length, 3);
  resolve[2](answer());
  assert.equal((await c).error, undefined);
});

test('rapid repeat requests are rate limited and become available after the cooldown', async () => {
  let now = 0;
  const service = new NpcChat({ now: () => now, fetch: (async () => answer()) as typeof fetch });
  assert.equal((await service.chat('alice', request())).error, undefined);
  assert.equal((await service.chat('alice', request())).error, 'busy');
  now = 1500;
  assert.equal((await service.chat('alice', request())).error, undefined);
});

test('model connection failures return honest errors and never commit a failed turn or reset', async () => {
  let now = 0, failure = false;
  const bodies: Body[] = [];
  const service = new NpcChat({ now: () => now, onError: () => {}, fetch: (async (_url, init) => {
    bodies.push(JSON.parse(String(init?.body)));
    if (failure) throw new Error('ECONNREFUSED');
    return answer('real reply');
  }) as typeof fetch });
  await service.chat('alice', request('keep this'));
  now += 2000; failure = true;
  const unavailable = await service.chat('alice', request('failed reset', { reset: true }));
  assert.equal(unavailable.error, 'unavailable');
  assert.equal(unavailable.text, '');
  now += 2000; failure = false;
  await service.chat('alice', request('after failure'));
  assert.ok(bodies.at(-1)!.messages.some(m => m.content === 'keep this'));
  assert.ok(!bodies.at(-1)!.messages.some(m => m.content === 'failed reset'));
});

test('timeouts abort the request, do not commit context, and release the concurrency slot', async () => {
  let now = 0, hanging = true;
  const service = new NpcChat({ timeoutMs: 15, now: () => now, onError: () => {}, fetch: (async (_url, init) => {
    if (!hanging) return answer();
    return new Promise<Response>((_resolve, reject) => init?.signal?.addEventListener('abort', () => reject(new Error('aborted'))));
  }) as typeof fetch });
  assert.equal((await service.chat('alice', request())).error, 'timeout');
  now = 2000; hanging = false;
  assert.equal((await service.chat('alice', request())).error, undefined);
});

test('HTTP errors and unusable model bodies never masquerade as a successful NPC reply', async () => {
  for (const response of [new Response('', { status: 503 }), new Response('{}', { status: 200 }), answer(''), answer('<think>unfinished'), answer('<think>private reasoning</think>')]) {
    const service = new NpcChat({ onError: () => {}, fetch: (async () => response) as typeof fetch });
    const result = await service.chat('alice', request());
    assert.equal(result.error, 'unavailable');
    assert.equal(result.text, '');
  }
  const service = new NpcChat({ onError: () => {}, fetch: (async () => new Response('', { status: 429 })) as typeof fetch });
  assert.equal((await service.chat('alice', request())).error, 'busy');
});

test('long sessions retain at most twelve turns and a two-thousand-character context budget', async () => {
  let now = 0;
  const bodies: Body[] = [];
  const service = new NpcChat({ now: () => now, fetch: (async (_url, init) => { bodies.push(JSON.parse(String(init?.body))); return answer('reply'.repeat(50)); }) as typeof fetch });
  for (let n = 0; n < 20; n++) {
    assert.equal((await service.chat('alice', request(`${n}-` + 'text'.repeat(100)))).error, undefined);
    now += 2000;
  }
  for (const body of bodies) {
    const conversation = body.messages.slice(1);
    assert.ok(conversation.length <= 13);
    assert.ok(conversation.reduce((size, message) => size + message.content.length, 0) <= 2000);
    assert.equal(conversation[0].role, 'user');
    assert.equal(conversation.at(-1)!.role, 'user');
  }
  assert.ok(!bodies.at(-1)!.messages.some(m => m.content.startsWith('0-')));
});

test('thinking markup is removed, operator model ID is authoritative, and invalid endpoint never fetches', async () => {
  const service = new NpcChat({ model: 'operator-model', fetch: (async () => answer('<think>private</think>こんにちは。')) as typeof fetch });
  assert.equal((await service.chat('alice', request())).text, 'こんにちは。');
  let calls = 0;
  const unavailable = new NpcChat({ url: 'https://external.example/v1', fetch: (async () => { calls++; return answer(); }) as typeof fetch });
  assert.equal((await unavailable.chat('alice', request())).error, 'unavailable');
  assert.equal(calls, 0);
  assert.equal(isRoomClientMsg({ t: 'npcChat', ...request() }), false);
});

test('the loaded model name in a valid backend response takes precedence over the configured request alias', async () => {
  for (const [reported, expected] of [['qwen3-actual-loaded', 'qwen3-actual-loaded'], ['', 'configured-model'], ['x'.repeat(121), 'configured-model'], ['bad\nmodel', 'configured-model'], [null, 'configured-model']] as const) {
    const service = new NpcChat({ model: 'configured-model', fetch: (async () => new Response(JSON.stringify({ model: reported, choices: [{ message: { content: 'Hello' } }] }))) as typeof fetch });
    assert.equal((await service.chat('alice', request())).model, expected);
  }
});

test('public NPC profiles contain only public metadata, while every private secret stays out of every prompt', () => {
  assert.ok(NPC_PUBLIC.length >= 25);
  assert.equal(new Set(NPC_PUBLIC.map(npc => npc.id)).size, NPC_PUBLIC.length);
  const permitted = ['id', 'name', 'role', 'age', 'gender', 'race', 'homeLocation', 'building', 'personality', 'speech', 'knownTopics', 'trainableJobs', 'trainableSkills'];
  for (const npc of NPC_PUBLIC) {
    assert.ok(Object.keys(npc).every(key => permitted.includes(key)));
    for (const locale of ['ko', 'en', 'ja'] as const) {
      assert.ok(npc.name[locale]); assert.ok(npc.knownTopics[locale].length);
      const system = npcSystemPrompt(locale, npc.id, 'trusted', { completedQuests: ['quest-herbalist', 'quest-fish', 'quest-crystal', 'quest-tower', 'quest-ore', 'quest-moon'] });
      assert.ok(system.includes(npc.name[locale]));
      assert.ok(system.includes(`${npc.age}-year-old`));
      for (const definition of Object.values(NPC_SERVER)) {
        for (const secret of definition.privateSecrets) {
          assert.ok(!system.includes(secret));
          assert.ok(!JSON.stringify(NPC_PUBLIC).includes(secret));
        }
      }
    }
  }
});

test('conditional knowledge requires every configured relationship and completed-quest condition', () => {
  for (const npc of NPC_PUBLIC) {
    const definition = NPC_SERVER[npc.id];
    for (const fact of definition.conditionalFacts) {
      if (fact.completedQuest) assert.ok(!npcAllowedFacts(npc.id, 'trusted').includes(fact.fact));
      if (fact.relationship) assert.ok(!npcAllowedFacts(npc.id, 'stranger', { completedQuests: [fact.completedQuest!] }).includes(fact.fact));
      assert.ok(npcAllowedFacts(npc.id, 'trusted', { completedQuests: [fact.completedQuest!] }).includes(fact.fact));
    }
    assert.ok(npcAllowedFacts(npc.id, 'stranger').length >= 5);
    assert.ok(npcAllowedFacts(npc.id, 'trusted', { completedQuests: definition.conditionalFacts.map(fact => fact.completedQuest!).filter(Boolean) }).length <= 9);
  }
});

test('dialogue is separated by user, NPC and locale and switching back resumes only its matching thread', async () => {
  let now = 0;
  const bodies: Body[] = [];
  const service = new NpcChat({ now: () => now, fetch: (async (_url, init) => { bodies.push(JSON.parse(String(init?.body))); return answer(); }) as typeof fetch });
  const ask = async (user: string, input: NpcChatRequest) => { now += 2000; return service.chat(user, input); };
  await ask('alice', request('alice-rin-en'));
  await ask('alice', request('alice-borin-en', { npcId: 'borin' }));
  assert.equal(bodies.at(-1)!.messages.length, 2);
  await ask('alice', request('alice-rin-ko', { locale: 'ko' }));
  assert.equal(bodies.at(-1)!.messages.length, 2);
  await ask('bob', request('bob-rin-en'));
  assert.equal(bodies.at(-1)!.messages.length, 2);
  await ask('alice', request('continue'));
  const content = bodies.at(-1)!.messages.map(message => message.content).join('\n');
  assert.ok(content.includes('alice-rin-en'));
  for (const other of ['alice-borin-en', 'alice-rin-ko', 'bob-rin-en']) assert.ok(!content.includes(other));
});

test('relationship thresholds count only successful model replies and are independent for each NPC', async () => {
  let now = 0, fail = false;
  const service = new NpcChat({ now: () => now, onError: () => {}, fetch: (async () => fail ? new Response('', { status: 503 }) : answer()) as typeof fetch });
  for (let turn = 1; turn <= 8; turn++) {
    now += 2000;
    const result = await service.chat('alice', request());
    assert.equal(result.relationship, turn >= 8 ? 'trusted' : turn >= 3 ? 'familiar' : 'stranger');
    if (turn === 2) {
      now += 2000; fail = true;
      const failed = await service.chat('alice', request());
      assert.equal(failed.error, 'unavailable');
      assert.equal(failed.relationship, 'stranger');
      fail = false;
    }
  }
  now += 2000;
  assert.equal((await service.chat('alice', request('Hello', { npcId: 'borin' }))).relationship, 'stranger');
});

test('reset clears only the selected user NPC conversation and relationship, preserving other NPCs', async () => {
  let now = 0;
  const bodies: Body[] = [];
  const service = new NpcChat({ now: () => now, fetch: (async (_url, init) => { bodies.push(JSON.parse(String(init?.body))); return answer(); }) as typeof fetch });
  for (const npcId of ['rin', 'borin'] as const) {
    for (let turn = 0; turn < 3; turn++) { now += 2000; await service.chat('alice', request(`${npcId}-old-${turn}`, { npcId })); }
  }
  assert.equal((await service.chat('alice', request('', { reset: true, npcId: 'rin' }))).relationship, 'stranger');
  now += 2000;
  assert.equal((await service.chat('alice', request('after-reset', { npcId: 'rin' }))).relationship, 'stranger');
  assert.equal(bodies.at(-1)!.messages.length, 2);
  now += 2000;
  assert.equal((await service.chat('alice', request('still-remember', { npcId: 'borin' }))).relationship, 'familiar');
  assert.ok(bodies.at(-1)!.messages.some(message => message.content === 'borin-old-0'));
});

test('unknown terminology and previous made-up terms are explicitly outside the model authority', () => {
  for (const npc of NPC_PUBLIC) {
    const system = npcSystemPrompt('ko', npc.id);
    assert.match(system, /Do not invent new place names, objects, factions, jargon/);
    assert.match(system, /unknown term/);
    assert.match(system, /correct your mistake/);
    assert.ok(!system.includes('페어'));
    assert.ok(!system.includes('카르버런트'));
  }
});

test('NPC identity, age, gender and personality use public metadata with an explicit canon source', async () => {
  let calls = 0;
  const service = new NpcChat({ fetch: (async () => { calls++; throw new Error('offline'); }) as typeof fetch });
  for (const npc of NPC_PUBLIC) {
    const response = await service.chat(`profile-${npc.id}`, request('이름이 뭐야?', { npcId: npc.id, locale: 'ko' }));
    assert.equal(response.source, 'canon');
    assert.equal(response.model, '');
    assert.ok(response.text.includes(npc.name.ko));
    assert.ok(npcCanonicalReply('en', npc.id, 'stranger', 'How old are you?')!.includes(String(npc.age)));
    assert.ok(npcCanonicalReply('ja', npc.id, 'stranger', '性別は？')!.includes(npc.gender === 'female' ? '女性' : '男性'));
      assert.equal(npcCanonicalReply('ko', npc.id, 'stranger', '성격이 어때?'), npcPersonalitySpeech(npc.id, 'ko'));
      assert.ok(!npcCanonicalReply('ko', npc.id, 'stranger', '성격이 어때?')!.includes(npc.speech.ko));
    assert.ok(npcCanonicalReply('ko', npc.id, 'stranger', '종족은 뭐야?')!.includes(fantasyTermName(npc.race, 'ko')));
  }
  assert.equal(calls, 0);
});

test('registered world names are localized from the canonical glossary and unknown expertise is admitted', () => {
  for (const locale of ['ko', 'en', 'ja'] as const) {
    const term = FANTASY_TERMS.find(term => term.id === 'hearth')!;
    const question = locale === 'ko' ? `${term.names.ko}는 어디야?` : locale === 'en' ? `Where is ${term.names.en}?` : `${term.names.ja}はどこ？`;
    const known = npcCanonicalReply(locale, 'rin', 'stranger', question);
      assert.equal(known, npcDefinitionSpeech('rin', locale, term));
    assert.ok(npcSystemPrompt(locale, 'rin').includes(`Hearth = ${fantasyTermName('hearth', locale)}`));
    const outside = npcCanonicalReply(locale, 'borin', 'stranger', question)!;
    assert.ok(!outside.includes(term.summary[locale]));
  }
});

test('unknown proper-noun meanings admit uncertainty without inventing an earlier mistake in all three languages', async () => {
  let calls = 0;
  const service = new NpcChat({ fetch: (async () => { calls++; return answer('fake definition'); }) as typeof fetch });
  const cases = [
    ['ko', '페어가 뭐야?'], ['ko', '카르버런트는 뭔데?'], ['ko', '카르버런트는 뭔 뜻이야?'],
    ['en', 'What is Carverrant?'], ['en', 'What does Fair mean?'],
    ['ja', 'カールバラントって何？'], ['ja', 'フェアとは？'], ['ja', 'フェアってどういう意味？'],
  ] as const;
  for (const [index, [locale, text]] of cases.entries()) {
    const response = await service.chat(`unknown-${index}`, request(text, { locale }));
    assert.equal(response.source, 'canon');
    assert.equal(response.error, undefined);
    assert.equal(response.model, '');
    assert.equal(response.text, unknownNpcInformation('rin', locale));
    assert.doesNotMatch(response.text, /정정|잘못.*말|take it back|mistaken|訂正|페어|카르버런트|Carverrant|Fair|フェア|カールバラント/u);
    assert.ok(!response.text.includes('fake definition'));
  }
  assert.equal(calls, 0);
});

test('feelings, open conversation and the player name remain local model conversations', async () => {
  let calls = 0;
  const service = new NpcChat({ fetch: (async () => { calls++; return answer('I am listening.'); }) as typeof fetch });
  const cases = [['ko', '오늘 좀 외로워. 얘기해 줄래?'], ['en', 'What is happiness?'], ['ja', '人生って何だと思う？'], ['en', 'What is my name?'], ['ko', '내 이름이 뭐야?']] as const;
  for (const [index, [locale, text]] of cases.entries()) {
    const response = await service.chat(`free-${index}`, request(text, { locale }));
    assert.equal(response.source, 'local');
    assert.equal(response.text, 'I am listening.');
  }
  assert.equal(calls, cases.length);
});

test('casual questions shaped like definitions reach the model in all three languages', async () => {
  let calls = 0;
  const service = new NpcChat({ fetch: (async () => { calls++; return answer('I would enjoy a quiet evening.'); }) as typeof fetch });
  const cases = [
    ['ja', '雨の日に宿でゆっくり過ごすなら、あなたは何をしたい？'],
    ['ja', 'あなたが好きな飲み物は何？'],
    ['ja', '今日は何を飲みたい？'],
    ['ko', '너는 좋아하는 음료가 뭐야?'],
    ['ko', '너에게 따뜻한 저녁이란 무엇이야?'],
    ['en', 'What is your favorite drink on a rainy day?'],
    ['en', 'What is a good way to relax on a rainy day?'],
  ] as const;
  for (const [index, [locale, text]] of cases.entries()) {
    assert.equal(npcCanonicalReply(locale, 'rin', 'stranger', text), undefined, text);
    const response = await service.chat(`casual-definition-${index}`, request(text, { locale }));
    assert.equal(response.source, 'local', text);
    assert.equal(response.text, 'I would enjoy a quiet evening.');
  }
  assert.equal(calls, cases.length);
});

test('offline AI remains an error for free conversation while canon answers are visibly a separate source', async () => {
  const service = new NpcChat({ onError: () => {}, fetch: (async () => { throw new Error('offline'); }) as typeof fetch });
  const factual = await service.chat('facts', request('How old are you?'));
  assert.equal(factual.source, 'canon');
  assert.equal(factual.model, '');
  const free = await service.chat('free', request());
  assert.equal(free.error, 'unavailable');
  assert.equal(free.text, '');
  assert.notEqual(free.source, 'canon');
});

test('home WebSocket NPC works after hello without joining a session and uses its own private context', { timeout: 30_000 }, async (t) => {
  const directory = fs.mkdtempSync(path.join(os.tmpdir(), 'tonarium-npc-ws-'));
  const sessions = path.join(directory, 'sessions.json');
  fs.writeFileSync(sessions, JSON.stringify({ name: 'NPC test', sessions: [{ id: 'room', name: 'Room' }] }));
  const prompts: Body[] = [];
  const model = http.createServer(async (req, res) => {
    let body = ''; for await (const chunk of req) body += String(chunk);
    prompts.push(JSON.parse(body));
    res.setHeader('Content-Type', 'application/json');
    res.end(JSON.stringify({ choices: [{ message: { content: `A quiet evening ${prompts.length}` } }] }));
  });
  await new Promise<void>((resolve) => model.listen(0, '127.0.0.1', resolve));
  const modelPort = (model.address() as net.AddressInfo).port;
  const listener = net.createServer();
  await new Promise<void>((resolve) => listener.listen(0, '127.0.0.1', resolve));
  const port = (listener.address() as net.AddressInfo).port;
  await new Promise<void>((resolve) => listener.close(() => resolve()));
  let child: ReturnType<typeof spawn> | undefined;
  let logs = '';
  const sockets: WebSocket[] = [];
  const until = async <T>(read: () => T | undefined, timeout = 10_000): Promise<T> => {
    const end = Date.now() + timeout;
    while (Date.now() < end) { const value = read(); if (value !== undefined) return value; await new Promise(resolve => setTimeout(resolve, 15)); }
    throw new Error(`Timed out waiting for NPC WebSocket: ${logs}`);
  };
  t.after(async () => {
    for (const socket of sockets) socket.terminate();
    const running = child;
    if (running) {
      running.kill();
      await until(() => running.exitCode !== null || running.signalCode ? true : undefined, 5000).catch(() => running.kill('SIGKILL'));
    }
    await new Promise<void>(resolve => model.close(() => resolve()));
    fs.rmSync(directory, { recursive: true, force: true });
  });
  child = spawn(process.execPath, ['--import', 'tsx', 'server/index.ts', '--dev'], {
    env: { ...process.env, NODE_ENV: 'test', FANTASY_ACCOUNT_TEST_BYPASS: '1', SERVER_PORT: String(port), DATA_DIR: directory, SESSIONS_FILE: sessions, NPC_LLM_URL: `http://127.0.0.1:${modelPort}/v1`, NPC_LLM_MODEL: 'test-local-model', LIVEKIT_URL: '', LIVEKIT_API_KEY: '', LIVEKIT_API_SECRET: '' },
    stdio: ['ignore', 'pipe', 'pipe'],
  });
  child.stdout?.on('data', chunk => { logs += String(chunk); });
  child.stderr?.on('data', chunk => { logs += String(chunk); });
  await until(() => logs.includes('server on') ? true : undefined);
  const peer = async (id: string) => {
    const ws = new WebSocket(`ws://127.0.0.1:${port}/ws`); sockets.push(ws);
    const messages: { t: string; requestId?: string; text?: string; error?: string; model?: string; npcId?: string; locale?: string; relationship?: string }[] = [];
    ws.on('message', data => messages.push(JSON.parse(String(data))));
    await new Promise<void>((resolve, reject) => { ws.once('open', resolve); ws.once('error', reject); });
    ws.send(JSON.stringify({ t: 'hello', compat: COMPAT_VERSION, id, name: id }));
    await until(() => messages.find(m => m.t === 'snapshot'));
    return { ws, messages };
  };
  const alice = await peer('alice');
  const bob = await peer('bob');
  const ask = request('My secret is blue.', { locale: 'en' });
  alice.ws.send(JSON.stringify({ t: 'npcChat', ...ask, completedQuests: ['quest-herbalist', 'quest-fish'], relationship: 'trusted' }));
  const first = await until(() => alice.messages.find(m => m.requestId === ask.requestId));
  assert.equal(first.text, 'A quiet evening 1');
  assert.equal(first.model, 'test-local-model');
  assert.equal(first.error, undefined);
  assert.equal(first.npcId, 'rin');
  assert.equal(first.relationship, 'stranger');
  for (const conditional of NPC_SERVER.rin.conditionalFacts) assert.ok(!prompts[0].messages[0].content.includes(conditional.fact));
  const other = request(undefined, { locale: 'ko', npcId: 'borin' });
  bob.ws.send(JSON.stringify({ t: 'npcChat', ...other }));
  const second = await until(() => bob.messages.find(m => m.requestId === other.requestId));
  assert.equal(second.npcId, 'borin');
  assert.ok(!prompts[1].messages.some(m => m.content === 'My secret is blue.'));
  assert.match(prompts[1].messages[0].content, /ONLY in Korean/);
  const reset = request('', { reset: true, locale: 'en' });
  alice.ws.send(JSON.stringify({ t: 'npcChat', ...reset }));
  assert.equal((await until(() => alice.messages.find(m => m.requestId === reset.requestId))).error, undefined);
  assert.equal(prompts.length, 2);
});
