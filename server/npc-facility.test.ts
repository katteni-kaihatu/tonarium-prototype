import test from 'node:test';
import assert from 'node:assert/strict';
import { NPC_PUBLIC, type NpcLocale } from '../shared/npc.ts';
import { NpcChat, npcSystemPrompt } from './npc.ts';
import { npcFacilityKnowledge, npcFacilityReply, npcLibraryReading, npcFacilityQuerySupported } from './npc-facility.ts';
import { fantasyNpcTone } from '../shared/fantasy-dialogue-voice.ts';
import { npcBreaksFourthWall } from './npc-speech.ts';
import { FANTASY_DINING, FANTASY_LODGINGS } from '../shared/fantasy-life.ts';
import { FANTASY_ITEMS, FANTASY_JOBS, FANTASY_QUESTS } from '../shared/fantasy-data.ts';
import { FANTASY_MAPS, fantasyBuildingStock, fantasyLibraryHoldings } from '../shared/fantasy-town.ts';
import { FANTASY_LIBRARY_BOOKS } from '../shared/fantasy-library.ts';
import { fantasyPrice } from '../shared/fantasy-reputation.ts';
import { fantasyTermName } from '../shared/fantasy-lore.ts';
import { advanceFantasyWorld, applyFantasyAction, newFantasyProfile, startFantasyActivity } from '../shared/fantasy-engine.ts';
import { fantasyEnvironment } from '../shared/fantasy-environment.ts';
import type { FantasyContractBoard } from '../shared/fantasy-contracts.ts';
import { npcReadingRequest } from '../shared/npc-reading.ts';
import { FantasyConversationActions } from './fantasy-conversation-actions.ts';

const locales = ['ko', 'en', 'ja'] as const;
const character = () => applyFantasyAction(newFantasyProfile(), { type: 'create', name: 'Visitor', gender: 'female', source: 'human' }, () => .5).profile.character!;
const ask = (text: string, locale: NpcLocale = 'ko', npcId = 'rin') => ({ requestId: crypto.randomUUID(), npcId, locale, text });
const name = (id: string, locale: NpcLocale) => FANTASY_ITEMS.find(item => item.id === id)?.names?.[locale] ?? FANTASY_MAPS.find(map => map.item === id)?.name[locale] ?? fantasyTermName(id, locale);

test('every innkeeper knows the actual rooms and corrects invented room types without breaking character', async () => {
  let generated = 0;
  const service = new NpcChat({ fetch: (async () => { generated++; throw Error('No model needed'); }) as typeof fetch });
  for (const npc of NPC_PUBLIC.filter(npc => npc.building === 'inn')) for (const locale of locales) {
    const c = character(); c.location = npc.homeLocation;
    c.bargains = { room: { location: c.location, discount: .2, expiresAt: c.hour + 8, nextAt: c.hour + 4 } };
    const question = { ko: '객실 종류를 알려주세요', en: 'What rooms do you have?', ja: '部屋の種類を教えて' }[locale];
    const response = await service.chat(`${npc.id}-${locale}`, ask(question, locale, npc.id), { character: c });
    assert.equal(response.source, 'canon'); assert.equal(response.error, undefined); assert.equal(npcBreaksFourthWall(response.text), false);
    for (const room of FANTASY_LODGINGS) { assert.ok(response.text.includes(room.name[locale])); assert.ok(response.text.includes(`${fantasyPrice(c, room.cost, 'room')}G`)); }
    const wrong = npcFacilityReply(locale, npc.id, { ko: '특별 할인 객실은 뭔가요?', en: 'What is the discount room?', ja: '割引客室って何ですか？' }[locale], c)!;
    assert.equal(npcBreaksFourthWall(wrong), false); assert.ok(!wrong.includes('official')); assert.ok(wrong.includes(FANTASY_LODGINGS[0].name[locale]));
  }
  assert.equal(generated, 0);
});

test('all stock is searchable with the same prices and localized names as the real facility', () => {
  for (const npc of NPC_PUBLIC.filter(npc => npc.building !== 'residence')) {
    const c = character(); c.location = npc.homeLocation;
    c.bargains = { goods: { location: c.location, discount: .12, expiresAt: c.hour + 8, nextAt: c.hour + 4 } };
    const k = npcFacilityKnowledge(npc.id, c);
    assert.deepEqual(k.stock, fantasyBuildingStock(c, k.building!.id));
    const dynamicFacts = { hour:c.hour,location:c.location,rumors:[],shops:[{building:k.building!.id,lots:k.stock.map(item=>({id:`test-${item}`,item,count:3,unitPrice:fantasyPrice(c,FANTASY_MAPS.find(map=>map.item===item)?.price??FANTASY_ITEMS.find(value=>value.id===item)!.price,'goods')})),sales:[]}] };
    for (const item of k.stock) for (const locale of locales) {
      const text = npcFacilityReply(locale, npc.id, `${name(item, locale)} 가격 price 値段`, c, undefined, dynamicFacts)!;
      const base = FANTASY_MAPS.find(map => map.item === item)?.price ?? FANTASY_ITEMS.find(value => value.id === item)!.price;
      assert.ok(text.includes(name(item, locale)), `${npc.id}: ${item}: ${text}`);
      assert.ok(text.includes(`${fantasyPrice(c, base, 'goods')}G`), `${npc.id}: ${item}: ${text}`);
      assert.equal(npcBreaksFourthWall(text), false, text);
    }
  }
});

test('facility prices and quantities are spoken in each NPC register instead of read as a price label', () => {
  for (const npc of NPC_PUBLIC.filter(npc => npc.building !== 'residence')) {
    const c = character(); c.location = npc.homeLocation;
    const k = npcFacilityKnowledge(npc.id, c), item = k.stock[0];
    if (!item) continue;
    const facts = { hour:c.hour, location:c.location, rumors:[], shops:[{building:k.building!.id,lots:[{id:'spoken-one',item,count:14,unitPrice:37}],sales:[]}] };
    for (const locale of locales) {
      const text = npcFacilityReply(locale,npc.id,`${name(item,locale)} 가격 price 値段`,c,undefined,facts)!;
      assert.ok(text.includes(name(item,locale))); assert.match(text,/37G/); assert.match(text,/14/);
      assert.doesNotMatch(text,/[:：×·]|현재 가격|Current prices|現在の価格/u);
      assert.match(text,locale === 'ko' ? /한 개에.*14개/u : locale === 'en' ? /(?:each|apiece)/u : /1個.*14個/u);
      assert.equal(npcBreaksFourthWall(text),false);
    }
  }
  const c=character(),facts={hour:c.hour,location:c.location,rumors:[],shops:[{building:'market' as const,lots:[{id:'spoken-one',item:'herb',count:2,unitPrice:37},{id:'spoken-two',item:'herb',count:5,unitPrice:43}],sales:[]}]};
  for(const locale of locales){
    const text=npcFacilityReply(locale,'hearth-alia',`${name('herb',locale)} 가격 price 値段`,c,undefined,facts)!;
    for(const value of ['37G','43G','2','5'])assert.ok(text.includes(value));
    assert.doesNotMatch(text,/[:：×·]/u);
  }
});

test('general facility introductions use localized places and do not invent physical workshops', () => {
  const queries = {ko:'여기서 뭘 할 수 있어?',en:'What does this place offer?',ja:'ここでは何ができる？'};
  for(const npc of NPC_PUBLIC) for(const locale of locales){
    const c=character(); c.location=npc.homeLocation;
    const k=npcFacilityKnowledge(npc.id,c);
    const text=npcFacilityReply(locale,npc.id,queries[locale],c);
    if(!k.building&&!k.stock.length&&!k.books.length&&!k.jobs.length&&!k.skills.length&&!k.recipes.length){assert.equal(text,undefined);continue;}
    assert.ok(text,`${npc.id}/${locale}`);
    assert.equal(text.includes(npc.homeLocation),false,`${npc.id}/${locale}: ${text}`);
    if(k.building)assert.ok(text.includes(fantasyTermName(npc.homeLocation,locale)),`${npc.id}/${locale}: ${text}`);
    assert.doesNotMatch(text,/물건을 만들 작업장도|There is a workshop here|物を作るための工房も/u);
    if(k.recipes.length)assert.match(text,locale==='ko'?/여기서 만들 수 있는 물건/u:locale==='en'?/make certain items here/u:/ここで作れる物/u);
    assert.equal(npcBreaksFourthWall(text),false);
  }
});

test('facility introductions have distinct professional attitudes without repeated ask-me endings',()=>{
  const selected=new Map<string,string>();
  for(const npc of NPC_PUBLIC){const tone=fantasyNpcTone(npc.id);if(selected.has(tone))continue;const text=npcFacilityReply('ko',npc.id,'여기서 뭘 할 수 있어?',{...character(),location:npc.homeLocation});if(text)selected.set(tone,npc.id);}
  assert.equal(selected.size,8);
  for(const locale of locales){const endings:string[]=[];for(const npcId of selected.values()){
    const npc=NPC_PUBLIC.find(npc=>npc.id===npcId)!;
    const text=npcFacilityReply(locale,npcId,{ko:'여기서 뭘 할 수 있어?',en:'What does this place offer?',ja:'ここでは何ができる？'}[locale],{...character(),location:npc.homeLocation})!;
    assert.ok(text);assert.doesNotMatch(text,/물어|말씀해|말해|ask|tell me|教えて|聞いて|声をかけ/u);
    endings.push(text.match(/[^.!。]+[.!。]$/u)?.[0]??text);
  }assert.equal(new Set(endings).size,8,locale);}
});

test('facility templates decline questions they can only partially answer so live conversation can respond',()=>{
  const rejected=[
    '객실 종류와 오늘 날씨를 알려줘','회복 약초는 얼마고 왜 그렇게 비싸?', '여기서 물건을 사면 내 기분이 나아질까?', '여기서 뭘 할 수 있어? 그리고 내 친구는 어디야?',
    'What rooms do you have and is it raining?', 'What do you sell if I feel lonely?', 'Why is Healing Herb so expensive?', 'What books do you hold and what is my quest progress?',
    '部屋の種類と今日の天気を教えて','回復薬草はなぜ高いの？','ここでは何ができる？それから私の依頼は？',
  ];
  for(const text of rejected)for(const npcId of ['rin','hearth-mira','hearth-alia']){assert.equal(npcFacilityQuerySupported(npcId,text,character()),false,text);assert.equal(npcFacilityReply('ko',npcId,text,character()),undefined,text);}
  for(const [npcId,text]of [['rin','객실 종류를 알려주세요'],['rin','What rooms do you have?'],['rin','部屋の種類を教えて'],['rin','어떤 식사를 주문할 수 있어?'],['rin','이 시설에서 무엇을 할 수 있어?'],['hearth-daren','지금 받을 수 있는 의뢰는 뭐야?'],['hearth-daren','いまどんな依頼がありますか？'],['hearth-mira','どんな職業を学べますか？'],['hearth-alia','회복 약초 가격 알려줘'],['hearth-mira','What is Mana Begins with Breath about?']] as const)assert.equal(npcFacilityQuerySupported(npcId,text,character()),true,text);
});

test('menus and individual libraries use their own real holdings and never announce foreign collections', () => {
  for (const npc of NPC_PUBLIC.filter(npc => ['inn', 'restaurant', 'library'].includes(npc.building))) for (const locale of locales) {
    const c = character(); c.location = npc.homeLocation;
    if (npc.building === 'library') {
      const text = npcFacilityReply(locale, npc.id, 'books 책 蔵書', c)!;
      const holdings = fantasyLibraryHoldings(c);
      for (const book of FANTASY_LIBRARY_BOOKS.filter(book => book.inGame !== false)) assert.equal(text.includes(book.title[locale]), holdings.includes(book.id), `${npc.id}: ${book.id}`);
    } else {
      const before = structuredClone(c);
      const text = npcFacilityReply(locale, npc.id, 'menu 식사 メニュー', c)!;
      for (const meal of FANTASY_DINING) { assert.ok(text.includes(meal.name[locale])); assert.ok(text.includes(`${fantasyPrice(c, meal.cost, 'food')}G`)); }
      assert.deepEqual(c, before);
    }
  }
});

test('facility staff know their lessons, workbenches and boat terms without changing the visitor', () => {
  for (const npc of NPC_PUBLIC) {
    const c = character(); c.location = npc.homeLocation;
    const before = structuredClone(c);
    const text = npcFacilityReply('ko', npc.id, '어떤 기술을 배울 수 있어?', c)!;
    for (const job of FANTASY_JOBS.filter(job => npc.trainableJobs?.includes(job.id))) assert.ok(text.includes(job.names.ko));
    assert.deepEqual(c, before); assert.equal(npcBreaksFourthWall(text), false);
  }
  const shipwright = NPC_PUBLIC.find(npc => npc.building === 'shipyard')!;
  const boat = npcFacilityReply('en', shipwright.id, 'Can I rent a fishing boat?')!;
  assert.match(boat, /20G/); assert.match(boat, /24 hours/); assert.match(boat, /180G/);
});

test('both browser and central generation replace fourth-wall speech with an in-world reply and discard it from later history', async () => {
  const unsafe = ['I am an AI model. Click the button below.', '게임 시스템의 공식 설정집을 확인해 주세요.', 'ゲームのデータベースにはありません。', 'According to the provided context, this NPC knows the official world records.'];
  for (const browser of [true, false]) for (const [index, text] of unsafe.entries()) {
    let now = 0; const captured: { role: string; content: string }[][] = [];
    const service = new NpcChat({ now: () => now, fetch: (async (_url, init) => { captured.push(JSON.parse(String(init?.body)).messages); return new Response(JSON.stringify({ choices: [{ message: { content: text } }] })); }) as typeof fetch });
    const generate = async (job: { messages: { role: string; content: string }[] }) => { captured.push(job.messages); return text; };
    const response = await service.chat(`unsafe-${index}`, ask('긴 여행 뒤라 조금 외로워.'), browser ? { browserGenerate: generate } : {});
    assert.equal(response.source, 'canon'); assert.equal(response.error, undefined); assert.equal(npcBreaksFourthWall(response.text), false); assert.notEqual(response.text, text);
    now += 2000;
    await service.chat(`unsafe-${index}`, ask('계속 이야기해 줘.'), browser ? { browserGenerate: generate } : {});
    assert.equal(captured[1].slice(1).some(message => message.role === 'assistant' && message.content === text), false);
  }
  assert.equal(npcBreaksFourthWall('도서관의 기록과 책을 읽고 비교했어.'), false);
  assert.equal(npcBreaksFourthWall('I compared the library books and records.'), false);
});

test('old invented room and meta dialogue is excluded while current premises outrank stale history', async () => {
  const service = new NpcChat({ fetch: (async () => { throw Error('browser expected'); }) as typeof fetch });
  const old = service as unknown as { conversations: Map<string, Map<string, { turns: number; histories: { ko: { role: 'user' | 'assistant'; content: string }[] } }>> };
  old.conversations.set('old', new Map([['rin', { turns: 2, histories: { ko: [{ role: 'user', content: '객실은?' }, { role: 'assistant', content: '트리플과 특별 할인 객실이 있어.' }, { role: 'user', content: '그건 뭐야?' }, { role: 'assistant', content: '공식 설정집의 시스템 기록을 보세요.' }] } }]]));
  let prompt = '';
  const reply = await service.chat('old', ask('객실을 고르는 손님에게 어떤 조언을 해?'), { browserGenerate: async job => { prompt = JSON.stringify(job.messages); return '쉴 시간을 먼저 생각하고, 필요한 만큼의 방을 고르면 돼.'; } });
  assert.equal(reply.source, 'browser'); assert.ok(!prompt.includes('트리플')); assert.ok(!prompt.includes('특별 할인 객실')); assert.ok(!prompt.includes('공식 설정집의 시스템 기록'));
  assert.ok(prompt.includes('공동 객실')); assert.ok(prompt.includes('개인 객실')); assert.ok(prompt.includes('특실'));
  assert.ok(npcSystemPrompt('en', 'rin').includes('earlier dialogue is not evidence'));
});

test('guild staff only quote currently available eligible contracts from their actual board', () => {
  const npc = NPC_PUBLIC.find(npc => npc.building === 'guild' && npc.homeLocation === 'hearth')!;
  const c = character();
  const quest = FANTASY_QUESTS.find(quest => quest.giver === c.location && !quest.jobs && !quest.requiresCompleted && !quest.races && !quest.families)!;
  const board: FantasyContractBoard = { revision: 1, hour: c.hour, location: c.location, environment: { ...fantasyEnvironment(c), monsterPressure: 50, bountyMultiplier: 1 }, offers: [
    { id: 'offer-test', quest: quest.id, boardLocation: c.location, issuer: 'rin', createdAt: c.hour, expiresAt: c.hour + 12, deadline: c.hour + 36, mode: 'exclusive', gold: 23, participants: 0, mine: false, available: true },
  ] };
  assert.match(npcFacilityReply('ko', npc.id, '지금 어떤 의뢰가 있어?', c, board)!, /23G/);
  board.offers[0].available = false;
  assert.ok(!npcFacilityReply('ko', npc.id, '지금 어떤 의뢰가 있어?', c, board)!.includes('23G'));
  board.offers[0].available = true; board.offers[0].expiresAt = c.hour;
  assert.ok(!npcFacilityReply('ko', npc.id, '지금 어떤 의뢰가 있어?', c, board)!.includes('23G'));
});

test('reading intent distinguishes deliberate requests from descriptions, hypotheticals and refusals in all locales', () => {
  for (const text of ['시작하는 마나 를 읽고싶어', '숨에서 시작하는 마나 책을 읽어 주세요', '마나를 읽어도 될까요?', 'Mana Begins with Breath, please', 'I want to read Begins with Breath', 'Read Mana Begins with Breath', 'Could I read Mana Begins with Breath?', '息から始まるマナを読みたい', '始まるマナを読ませてください', '息から始まるマナを読んでもいいですか？']) {
    assert.equal(npcReadingRequest(text), text !== 'Mana Begins with Breath, please', text);
  }
  for (const text of ['숨에서 시작하는 마나는 어떤 내용이야?', '이 책을 읽으면 무슨 효과가 있어?', '마나 책을 읽고 싶지 않아', '만약 읽고싶어라고 말하면 어떻게 돼?', 'What is Mana Begins with Breath about?', 'What happens if I read Mana Begins with Breath?', 'How long does it take to read this book?', "I don’t want to read Mana Begins with Breath", '息から始まるマナはどんな本？', 'この本を読むと何を学べますか？', '息から始まるマナは読みたくない']) assert.equal(npcReadingRequest(text), false, text);
});

test('local librarians resolve complete, spaced and unique partial titles without model generation or state changes', async () => {
  let generated = 0;
  const service = new NpcChat({ fetch: (async () => { generated++; throw Error('Reading must not need a model'); }) as typeof fetch });
  const queries = [
    ['ko', '시작하는 마나 를 읽고싶어'], ['ko', '숨 에서 시작 하는 마나 를 읽고 싶어요'], ['ko', '『숨에서 시작하는 마나』 책을 읽어 주세요'],
    ['en', 'I want to read Mana Begins with Breath'], ['en', 'I’d like to read Begins with Breath, please.'], ['en', 'Read Mana Begins with Breath'],
    ['ja', '息から始まるマナを読みたい'], ['ja', '『始まるマナ』を読ませてください'],
  ] as const;
  for (const [locale, text] of queries) {
    const c = character(), before = structuredClone(c);
    const reply = await service.chat(crypto.randomUUID(), ask(text, locale, 'hearth-mira'), { character: c });
    assert.equal(reply.source, 'canon', text); assert.equal(reply.error, undefined, text);
    assert.deepEqual(reply.actions, [{ type: 'read', book: 'mana-primer' }], text);
    assert.equal(npcBreaksFourthWall(reply.text), false); assert.deepEqual(c, before);
  }
  assert.equal(generated, 0);
});

test('unknown, foreign, ambiguous-short and already-studied books never grant a reading action', async () => {
  let generated = 0;
  const service = new NpcChat({ fetch: (async () => { generated++; throw Error('Shelf checks must not need a model'); }) as typeof fetch });
  const foreign = FANTASY_LIBRARY_BOOKS.find(book => book.id === 'staff-and-footwork')!;
  for (const locale of locales) for (const unknown of [false, true]) {
    const title = unknown ? { ko: '존재하지 않는 자주색 구름', en: 'Unwritten Purple Clouds', ja: '存在しない紫の雲' }[locale] : foreign.title[locale];
    const text = { ko: `${title}를 읽고싶어`, en: `I want to read ${title}`, ja: `${title}を読みたい` }[locale];
    const c = character(), before = structuredClone(c);
    const reply = await service.chat(crypto.randomUUID(), ask(text, locale, 'hearth-mira'), { character: c });
    assert.equal(reply.source, 'canon'); assert.equal(reply.error, undefined); assert.ok(!reply.actions?.length); assert.deepEqual(c, before);
  }
  for (const text of ['나를 읽고싶어', 'I want to read the', '本を読みたいです']) {
    const request = npcLibraryReading('ko', 'hearth-mira', text, character())!;
    assert.equal(request.actions.length, 0, text);
  }
  for (const [locale, text] of [['ko', '숨에서 시작하는 마나 비밀 속편을 읽고싶어'], ['en', 'Read Mana Begins with Breath: The Unknown Sequel'], ['ja', '息から始まるマナの未刊続編を読みたい']] as const) assert.equal(npcLibraryReading(locale, 'hearth-mira', text, character())!.actions.length, 0, text);
  const c = character(); c.readBooks = ['mana-primer'];
  const known = await service.chat('already-read', ask('시작하는 마나를 읽고싶어', 'ko', 'hearth-mira'), { character: c });
  assert.equal(known.source, 'canon'); assert.ok(!known.actions?.length);
  assert.equal(npcLibraryReading('ko', 'rin', '시작하는 마나 를 읽고싶어', c), undefined);
  const remote = { ...c, location: 'emberhall' };
  assert.equal(npcLibraryReading('ko', 'hearth-mira', '시작하는 마나 를 읽고싶어', remote)!.actions.length, 0);
  assert.equal((await service.chat('remote-reader', ask('시작하는 마나 를 읽고싶어', 'ko', 'hearth-mira'), { character: remote })).error, 'invalid');
  assert.equal(generated, 0);
});

test('describing a named book remains information only, while reading offers require a separate final approval', async () => {
  const service = new NpcChat({ fetch: (async () => { throw Error('No model expected'); }) as typeof fetch });
  const book = FANTASY_LIBRARY_BOOKS.find(book => book.id === 'mana-primer')!;
  for (const locale of locales) {
    const profile = applyFantasyAction(newFantasyProfile(), { type: 'create', name: 'Reader', gender: 'female', source: 'human' }, () => .5).profile;
    const text = { ko: `${book.title.ko}는 어떤 내용이야?`, en: `What is ${book.title.en} about?`, ja: `${book.title.ja}はどんな本？` }[locale];
    const info = await service.chat(crypto.randomUUID(), ask(text, locale, 'hearth-mira'), { character: profile.character! });
    assert.equal(info.source, 'canon'); assert.ok(!info.actions?.length); assert.ok(info.text.includes(book.title[locale]));
    const request = { ko: '시작하는 마나 를 읽고싶어', en: 'I want to read Begins with Breath', ja: '始まるマナを読みたい' }[locale];
    const offered = await service.chat(crypto.randomUUID(), ask(request, locale, 'hearth-mira'), { character: profile.character! });
    const actions = new FantasyConversationActions();
    const context = { user: `reader-${locale}`, speaker: 'hearth-mira', locale, profile };
    const before = structuredClone(profile);
    const proposal = actions.propose(context, offered.actions!.map(action => ({ action, label: book.title[locale] })));
    assert.ok(proposal.text.includes({ko:'돈은 따로 들지 않아',en:'There’s no gold cost',ja:'お金はかかりません'}[locale])); assert.deepEqual(profile, before);
    let applied = 0;
    const confirmed = actions.confirm({ ...context, text: { ko: '응', en: 'yes', ja: 'はい' }[locale] }, (revision, action) => {
      applied++; assert.equal(revision, profile.revision);
      return startFantasyActivity(profile, action, profile.character!.hour, () => .5);
    });
    assert.equal(applied, 1); assert.equal(confirmed.result!.profile.activity!.action.type, 'read');
    assert.ok(!confirmed.result!.profile.character!.readBooks?.includes(book.id));
    const completed = advanceFantasyWorld(confirmed.result!.profile, profile.character!.hour + 1).profile;
    assert.ok(completed.character!.readBooks!.includes(book.id)); assert.equal(completed.character!.gold, profile.character!.gold);
    assert.equal(actions.confirm({ ...context, text: 'yes' }, () => { throw Error('must not repeat'); }).handled, false);
  }
});

test('multiple shelf matches select a book and still require final approval rather than guessing', () => {
  const profile = applyFantasyAction(newFantasyProfile(), { type: 'create', name: 'Reader', gender: 'female', source: 'human' }, () => .5).profile;
  const query = '등불을 빌린 여우와 양철냄비 왕을 읽고싶어';
  const reply = npcLibraryReading('ko', 'hearth-mira', query, profile.character!)!;
  assert.deepEqual(reply.actions.map(action => action.type === 'read' && action.book), ['lantern-fox', 'tin-pot-king']);
  const actions = new FantasyConversationActions(), context = { user: 'choose-reader', speaker: 'hearth-mira', locale: 'ko' as const, profile };
  const choices = reply.actions.map(action => ({ action, label: FANTASY_LIBRARY_BOOKS.find(book => action.type === 'read' && book.id === action.book)!.title.ko }));
  actions.propose({ ...context, query }, choices);
  const never = () => { throw Error('Selection is not final approval'); };
  assert.ok(actions.confirm({ ...context, text: '응' }, never).text!.includes('번호'));
  assert.ok(actions.confirm({ ...context, text: '2번' }, never).text!.includes('양철냄비 왕'));
  let chosen = '';
  actions.confirm({ ...context, text: '응' }, (_revision, action) => { if (action.type === 'read') chosen = action.book; return { profile, changed: false }; });
  assert.equal(chosen, 'tin-pot-king');
});
