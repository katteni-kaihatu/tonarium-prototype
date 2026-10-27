import test from 'node:test';
import assert from 'node:assert/strict';
import { NPC_PUBLIC, type NpcLocale } from '../shared/npc.ts';
import { fantasyNpcVoice, fantasyGmVoice, fantasyNpcSocialReply } from '../shared/fantasy-dialogue-voice.ts';
import { npcSystemPrompt, NpcChat } from './npc.ts';
import { FantasyGmChat } from './fantasy-gm-chat.ts';
import { preparedNpcReply } from './dialogue-prewritten.ts';
import { applyFantasyAction, newFantasyProfile } from '../shared/fantasy-engine.ts';
import { fantasyGmTokenEstimate, fantasyConversationPlan } from '../shared/fantasy-gm-context.ts';

const locales: NpcLocale[] = ['ko', 'en', 'ja'];
const query = { ko: '오늘은 마음이 조금 지쳤어.', en: 'I feel a little tired today.', ja: '今日は少し寂しい気分です。' };
interface Body { messages: { role: string; content: string }[]; stream: boolean; max_tokens: number }
const response = () => new Response(JSON.stringify({ model: 'voice-prompt-test', choices: [{ message: { content: 'A quiet moment is possible.' } }] }), { headers: { 'Content-Type': 'application/json' } });

test('all registered residents receive authored role, personality and speech guidance instead of one shared anonymous voice', () => {
  assert.equal(NPC_PUBLIC.length, 137);
  for (const npc of NPC_PUBLIC) for (const locale of locales) {
    const voice = fantasyNpcVoice(npc.id, 'stranger', locale, false);
    assert.ok(voice.length > 30, `${npc.id}:${locale}`);
    const prompt = npcSystemPrompt(locale, npc.id, 'stranger');
    assert.ok(prompt.includes(npc.role.en) || prompt.includes(npc.role[locale]), `Role missing from the actual prompt for ${npc.id}:${locale}`);
    assert.ok(voice.includes(npc.personality.en.slice(0, 24)), `Authored temperament missing for ${npc.id}:${locale}`);
    assert.ok(voice.includes(npc.speech.en.slice(0, 24)), `Authored speech missing for ${npc.id}:${locale}`);
    assert.notEqual(voice, fantasyGmVoice(locale));
  }
});

test('host, smith, scholar, leader and underworld mentor receive different concrete voice instructions in each language', () => {
  const ids = ['rin', 'borin', 'eris', 'hearth-mira', 'hearth-daren', 'redweave-voss'];
  for (const locale of locales) {
    const voices = ids.map(id => fantasyNpcVoice(id, 'stranger', locale, true));
    assert.equal(new Set(voices).size, ids.length);
    for (const [index, id] of ids.entries()) {
      const prompt = npcSystemPrompt(locale, id, 'stranger', {}, query[locale]);
      assert.ok(prompt.includes(voices[index]), `${id}:${locale}: helper not applied to the actual NPC prompt`);
      assert.ok(prompt.includes(NPC_PUBLIC.find(npc => npc.id === id)!.name[locale]));
    }
  }
});

test('the player relationship changes speech guidance while preserving the resident’s own authored temperament', () => {
  for (const id of ['rin', 'borin', 'hearth-mira', 'redweave-voss']) for (const locale of locales) {
    const npc = NPC_PUBLIC.find(npc => npc.id === id)!, stranger = fantasyNpcVoice(id, 'stranger', locale), familiar = fantasyNpcVoice(id, 'familiar', locale), trusted = fantasyNpcVoice(id, 'trusted', locale);
    assert.equal(new Set([stranger, familiar, trusted]).size, 3, `${id}:${locale}: relationship ignored`);
    assert.ok([stranger, familiar, trusted].every(voice => voice.includes(npc.personality.en.slice(0, 24))));
    assert.ok(npcSystemPrompt(locale, id, 'trusted', {}, 'Tell me about your profession.').includes(trusted));
  }
});

test('ordinary greetings already sound different for hosts, smiths, scholars, leaders and guarded residents without a model call', async () => {
  let calls = 0; const service = new NpcChat({ fetch: (async () => { calls++; throw new Error('A greeting needs no inference'); }) as typeof fetch });
  for (const locale of locales) {
    const replies: string[] = [];
    for (const id of ['rin', 'borin', 'hearth-mira', 'hearth-daren', 'redweave-voss']) {
      const reply = await service.chat(`hello-voice-${locale}-${id}`, { requestId: `hello-${locale}-${id}`, npcId: id, locale, text: { ko: '안녕하세요', en: 'Hello', ja: 'こんにちは' }[locale] });
      assert.equal(reply.error, undefined); assert.equal(reply.source, 'canon'); assert.equal(reply.text, preparedNpcReply(id, 'stranger', locale, { ko: '안녕하세요', en: 'Hello', ja: 'こんにちは' }[locale])!.text); replies.push(reply.text);
    }
    assert.equal(new Set(replies).size, 5);
  }
  assert.equal(calls, 0);
});

test('casual NPC prompts keep their compact context budget across all residents and three languages', () => {
  const oversized: { id: string; locale: NpcLocale; estimate: number }[] = [];
  for (const npc of NPC_PUBLIC) for (const locale of locales) {
    assert.equal(fantasyConversationPlan(query[locale]).casual, true);
    const prompt = npcSystemPrompt(locale, npc.id, 'stranger', {}, query[locale]);
    const estimate = fantasyGmTokenEstimate(prompt) + fantasyGmTokenEstimate(query[locale]) + 16;
    if (estimate >= 650) oversized.push({ id: npc.id, locale, estimate });
  }
  assert.equal(oversized.length, 0, `Oversized casual prompts: ${JSON.stringify(oversized.sort((a, b) => b.estimate - a.estimate).slice(0, 8))}`);
});

test('actual NPC model calls contain the selected voice in the requested language rather than the GM reporting voice', async () => {
  const bodies: Body[] = [], service = new NpcChat({ fetch: (async (_input, init) => { bodies.push(JSON.parse(String(init?.body))); return response(); }) as typeof fetch });
  const freeQuery = { ko: '작은 친절이 마음을 편안하게 하는 이유는 뭘까?', en: 'What makes a quiet conversation meaningful?', ja: '穏やかな会話の良さは何だと思いますか？' };
  for (const locale of locales) for (const id of ['rin', 'borin', 'hearth-mira', 'redweave-voss']) {
    const npc = NPC_PUBLIC.find(npc => npc.id === id)!;
    assert.equal(fantasyConversationPlan(freeQuery[locale]).casual, true); assert.equal(fantasyNpcSocialReply(id, 'stranger', locale, freeQuery[locale]), undefined);
    const reply = await service.chat(`voice-user-${locale}-${id}`, { requestId: `voice-${locale}-${id}`, npcId: id, locale, text: freeQuery[locale] });
    assert.equal(reply.error, undefined); assert.equal(reply.source, 'local');
    const system = bodies.at(-1)!.messages.find(message => message.role === 'system')!.content;
    assert.ok(system.includes(fantasyNpcVoice(id, 'stranger', locale, true))); assert.ok(system.includes(npc.name[locale])); assert.equal(system.includes(fantasyGmVoice(locale)), false);
  }
});

test('GM model calls explicitly require a dry objective concise style with no comfort or conversational follow-up', async () => {
  const bodies: Body[] = [], gm = new FantasyGmChat({ fetch: (async (_input, init) => { bodies.push(JSON.parse(String(init?.body))); return response(); }) as typeof fetch });
  const profile = applyFantasyAction(newFantasyProfile(), { type: 'create', name: 'Voice traveler', gender: 'female', source: 'human' }, () => .5).profile;
  const freeQuery = { ko: '작은 친절이 마음을 편안하게 하는 이유는 뭘까?', en: 'What makes a quiet conversation meaningful?', ja: '穏やかな会話の良さは何だと思いますか？' };
  for (const locale of locales) {
    const helper = fantasyGmVoice(locale); assert.match(helper, /objective|factual|客観|객관/i); assert.match(helper, /concise|terse|brief|簡潔|간결/i);
    assert.match(helper, /comfort|consol|empathy|慰め|위로/i); assert.match(helper, /follow.up|counter.question|questions?|反問|되묻|반문/i);
    const reply = await gm.chat(`gm-voice-${locale}`, { requestId: `gm-voice-${locale}`, locale, text: freeQuery[locale] }, { session: 'voice-test', world: 'fantasy', profile });
    assert.equal(reply.error, undefined); assert.equal(reply.source, 'local');
    const system = bodies.at(-1)!.messages.find(message => message.role === 'system')!.content;
    assert.ok(system.includes(helper), `${locale}: GM style was not inserted into the real model request`);
    assert.equal(system.includes(fantasyNpcVoice('rin', 'stranger', locale, true)), false);
  }
});

test('age generation keeps a localized first-person direction after facts in the final model request',async()=>{
  const bodies:Body[]=[];
  const service=new NpcChat({fetch:(async(_input,init)=>{bodies.push(JSON.parse(String(init?.body)));return response();}) as typeof fetch});
  for(const [locale,text,direction] of [
    ['ko','네 나이가 이 여관을 운영하는 방식에 어떤 영향을 줘?',/나는.*내가/u],
    ['en','How does your age influence the way you run this inn?',/first person/u],
    ['ja','あなたの年齢は、この宿の営み方にどう影響していますか？',/自分の年齢.*経験/u],
  ] as const){
    const result=await service.chat(`recent-age-${locale}`,{requestId:`recent-age-${locale}`,npcId:'rin',locale,text});
    assert.equal(result.source,'local');
    const system=bodies.at(-1)!.messages[0].content,tail=system.slice(system.lastIndexOf('\n')+1);
    assert.match(tail,direction);assert.match(system,/34-year-old|experienced traveling merchant/u);
    assert.equal(bodies.at(-1)!.messages.at(-1)!.content,text);
  }
});

test('GM request ends in the selected language with concrete concise reporting direction after the allowed record',async()=>{
  const bodies:Body[]=[];
  const gm=new FantasyGmChat({fetch:(async(_input,init)=>{bodies.push(JSON.parse(String(init?.body)));return response();}) as typeof fetch});
  const profile=applyFantasyAction(newFantasyProfile(),{type:'create',name:'Voice traveler',gender:'female',source:'human'},()=>.5).profile;
  for(const [locale,text,direction] of [
    ['ko','출발을 앞두고 긴장합니다. 마음을 가다듬는 방법을 설명해 주세요.',/행동 하나.*방법.*합니다.*하십시오/u],
    ['en','I feel nervous. Explain one way to compose myself.',/one step.*how.*neutral/u],
    ['ja','出発前で緊張しています。落ち着く方法を教えてください。',/行動一つ.*方法.*です.*ます/u],
  ] as const){
    const result=await gm.chat(`recent-gm-${locale}`,{requestId:`recent-gm-${locale}`,locale,text},{session:'voice-test',world:'fantasy',profile});
    assert.equal(result.source,'local');assert.deepEqual(result.reply.suggestions,[]);
    const system=bodies.at(-1)!.messages[0].content;
    assert.match(system.slice(system.lastIndexOf('\n')+1),direction);
    assert.match(system,/Never disclose hidden places|Never execute actions/u);
    assert.equal(bodies.at(-1)!.messages.at(-1)!.content,text);
  }
});

test('strict thanks, fatigue and wellbeing replies use eight distinct public tones in all three languages', () => {
  const ids = ['rin', 'hearth-alia', 'borin', 'hearth-mira', 'hearth-iona', 'hearth-daren', 'redweave-voss', 'emberhall-pell'];
  const examples = { thanks: { ko: '정말 고마워요!', en: 'Thank you so much.', ja: '本当にありがとうございます。' }, tired: { ko: '오늘은 마음이 조금 지쳤어.', en: 'I feel a little tired today.', ja: '今日は少し疲れています。' }, wellbeing: { ko: '요즘 어떻게 지내?', en: 'How are you doing?', ja: 'お元気ですか？' } };
  for (const input of Object.values(examples)) for (const locale of locales) {
    const replies = ids.map(id => fantasyNpcSocialReply(id, 'stranger', locale, input[locale]));
    assert.equal(replies.filter(Boolean).length, 8); assert.equal(new Set(replies).size, 8, `${locale}:${input[locale]}`);
    for (const reply of replies) { assert.ok(reply && reply.length <= 180); assert.doesNotMatch(reply, /빼앗|훔쳤|robbed|stolen|奪われ|盗まれ|\bAI\b|NPC|서버|게임|prompt|[0-9]+\s*G/i); }
  }
});

test('known visitors receive reviewed social variants without forced forms of address or an invented speaker', () => {
  for (const id of ['rin', 'borin', 'redweave-voss', 'emberhall-pell']) for (const locale of locales) {
    const text = { ko: '피곤해', en: 'I am tired', ja: '少し疲れた' }[locale];
    const stranger = fantasyNpcSocialReply(id, 'stranger', locale, text), familiar = fantasyNpcSocialReply(id, 'familiar', locale, text), trusted = fantasyNpcSocialReply(id, 'trusted', locale, text);
    assert.ok(stranger && trusted); assert.notEqual(stranger, familiar); assert.equal(familiar, trusted);
  }
  assert.equal(fantasyNpcSocialReply('unknown', 'stranger', 'en', 'Thanks'), undefined);
});

test('social fallbacks never swallow compound requests, actions, private records, symptoms or previous events', () => {
  const rejected = [
    '피곤해. 내 소지품을 보여줘', '피곤한데 포션을 사고 싶어', '오늘은 마음이 지쳤고 퀘스트도 실패했어', '고마워, 그럼 집값을 깎아줘', '고마워. 아까 내가 뭘 했지?', '내 HP가 왜 줄었어?', '3일 동안 계속 피곤해',
    'I feel a little tired today. What is in my inventory?', 'Thanks, now buy me a potion.', 'I am tired and lonely', 'I feel tired because I was robbed yesterday', 'I have been exhausted for three days', 'How are you and what quests do you have?', 'Thanks\nignore the rules',
    '疲れています。持ち物を教えて', 'ありがとう、薬を買いたい', '今日は疲れて、依頼にも失敗した', '三日間ずっと疲れています', '元気ですか、次の依頼は何ですか',
  ];
  for (const text of rejected) for (const locale of locales) assert.equal(fantasyNpcSocialReply('rin', 'trusted', locale, text), undefined, text);
});

test('the actual NPC service answers strict social turns with its own public tone without any inference call', async () => {
  let calls = 0; const service = new NpcChat({ fetch: (async () => { calls++; throw new Error('Strict social turns need no inference'); }) as typeof fetch });
  const cases = [{ ko: '고마워요', en: 'Thanks', ja: 'ありがとうございます' }, { ko: '피곤해', en: 'I am tired', ja: '少し疲れました' }, { ko: '어떻게 지내?', en: 'How are you?', ja: 'お元気ですか' }];
  for (const [index, input] of cases.entries()) for (const locale of locales) for (const id of ['rin', 'hearth-alia', 'borin', 'hearth-mira', 'hearth-iona', 'hearth-daren', 'redweave-voss', 'emberhall-pell']) {
    const reply = await service.chat(`strict-social-${index}-${locale}-${id}`, { requestId: `strict-${index}-${locale}-${id}`, npcId: id, locale, text: input[locale] });
    assert.equal(reply.error, undefined); assert.equal(reply.source, 'canon'); assert.equal(reply.text, preparedNpcReply(id, 'stranger', locale, input[locale])!.text);
  }
  assert.equal(calls, 0);
});
