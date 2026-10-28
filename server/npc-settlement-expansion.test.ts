import test from 'node:test';
import assert from 'node:assert/strict';
import { NPC_PUBLIC } from '../shared/npc.ts';
import { NPC_SETTLEMENT_APPEARANCE, NPC_SETTLEMENT_EXPANSION } from '../shared/npc-settlement-expansion.ts';
import { FANTASY_JOBS, FANTASY_LOCATIONS, FANTASY_QUESTS, FANTASY_RACES } from '../shared/fantasy-data.ts';
import { FANTASY_MENTOR_SKILLS } from '../shared/fantasy-apprenticeship.ts';
import { FANTASY_SETTLEMENTS, fantasyBuildings, fantasyBuildingStock, fantasyLibraryHoldings } from '../shared/fantasy-town.ts';
import { FANTASY_DINING, FANTASY_LODGINGS } from '../shared/fantasy-life.ts';
import { applyFantasyAction, newFantasyProfile } from '../shared/fantasy-engine.ts';
import { npcFacilityKnowledge, npcFacilityReply } from './npc-facility.ts';
import { npcAllowedFacts, NpcChat, npcSystemPrompt } from './npc.ts';
import { npcBreaksFourthWall } from './npc-speech.ts';
import { NPC_SERVER } from './npc-catalog.ts';
import { FantasyBargaining } from './fantasy-bargaining.ts';
import { fantasyEnvironment } from '../shared/fantasy-environment.ts';
import { fantasyContractIssuer, fantasyPersonalQuest, type FantasyContractBoard } from '../shared/fantasy-contracts.ts';
import { fantasyQuestEligible } from '../shared/fantasy-access.ts';
import { fantasyQuestText } from '../shared/fantasy-narrative.ts';

const settlements = ['inkstone-city', 'pinewatch', 'reedcross', 'canopy-hall', 'mossbrook', 'leafshade', 'sunloom', 'wellrest', 'rockshade'];
const locales = ['ko', 'en', 'ja'] as const;
const character = (location: string) => {
  const c = applyFantasyAction(newFantasyProfile(), { type: 'create', name: 'Guest', gender: 'female', source: 'human' }, () => .5).profile.character!;
  c.location = location; return c;
};

test('43 new adults have distinct localized identities, roles, personalities and speaking styles', () => {
  assert.equal(NPC_SETTLEMENT_EXPANSION.length, 43);
  assert.equal(new Set(NPC_PUBLIC.map(npc => npc.id)).size, NPC_PUBLIC.length);
  for (const locale of locales) {
    assert.equal(new Set(NPC_SETTLEMENT_EXPANSION.map(npc => npc.name[locale])).size, 43);
    assert.equal(new Set(NPC_SETTLEMENT_EXPANSION.map(npc => npc.personality[locale])).size, 43);
    assert.equal(new Set(NPC_SETTLEMENT_EXPANSION.map(npc => npc.speech[locale])).size, 43);
  }
  for (const npc of NPC_SETTLEMENT_EXPANSION) {
    assert.equal(NPC_PUBLIC.find(value => value.id === npc.id), npc);
    assert.ok(npc.age >= 18); assert.ok(FANTASY_RACES.some(race => race.id === npc.race));
    assert.ok(FANTASY_LOCATIONS.some(place => place.id === npc.homeLocation));
    for (const locale of locales) for (const text of [npc.name[locale], npc.role[locale], npc.personality[locale], npc.speech[locale], ...npc.knownTopics[locale]]) {
      assert.ok(text.trim().length); assert.equal(npcBreaksFourthWall(text), false, `${npc.id}: ${text}`);
    }
    for (const id of npc.trainableJobs ?? []) assert.ok(FANTASY_JOBS.some(job => job.id === id), `${npc.id}: ${id}`);
    for (const id of npc.trainableSkills ?? []) assert.ok(FANTASY_MENTOR_SKILLS.some(skill => skill.id === id), `${npc.id}: ${id}`);
  }
  assert.deepEqual(NPC_PUBLIC.filter(npc => npc.homeLocation === 'sunmeadow' && npc.building === 'inn').map(npc => npc.id), ['sunmeadow-faye']);
  assert.equal(NPC_PUBLIC.find(npc => npc.id === 'rin')!.homeLocation, 'hearth');
  assert.equal(NPC_PUBLIC.find(npc => npc.id === 'eris')!.homeLocation, 'mooncity');
  assert.equal(NPC_PUBLIC.find(npc => npc.id === 'mooncity-nera')!.building, 'temple');
});

test('every new facility has its own local staff, each new settlement a resident and every settlement an innkeeper', () => {
  let facilityStaff = 0;
  for (const location of settlements) {
    const locals = NPC_SETTLEMENT_EXPANSION.filter(npc => npc.homeLocation === location);
    const buildings = fantasyBuildings({ location });
    assert.ok(buildings.some(building => building.id === 'inn'));
    assert.equal(locals.filter(npc => npc.building === 'residence').length, 1, location);
    for (const building of buildings) {
      assert.equal(building.npcIds.length, 1, `${location}: ${building.id}`);
      const staff = locals.find(npc => npc.id === building.npcIds[0]);
      assert.equal(staff?.building, building.id); facilityStaff++;
    }
  }
  assert.equal(facilityStaff, 33);
  for (const npc of NPC_SETTLEMENT_EXPANSION.filter(npc => npc.building !== 'residence')) assert.ok(fantasyBuildings({ location: npc.homeLocation }).some(building => building.id === npc.building && building.npcIds.includes(npc.id)), npc.id);
});

test('all twenty cities, villages and ports have a real innkeeper while the research tower remains distinct', () => {
  const places = Object.entries(FANTASY_SETTLEMENTS).filter(([, place]) => ['city', 'village', 'port'].includes(place.kind));
  assert.equal(places.length, 20); assert.equal(NPC_PUBLIC.filter(npc => npc.building === 'inn').length, 20);
  for (const [location] of places) {
    const inn = fantasyBuildings({ location }).find(building => building.id === 'inn');
    assert.ok(inn, location); assert.equal(inn.npcIds.length, 1, location);
    assert.equal(NPC_PUBLIC.find(npc => npc.id === inn.npcIds[0])!.homeLocation, location);
  }
  assert.ok(!fantasyBuildings({ location: 'starspire' }).some(building => building.id === 'inn'));
});

test('new innkeepers explain actual rooms and meals in three languages without invoking AI or changing the guest', async () => {
  let aiCalls = 0;
  const service = new NpcChat({ url: 'http://127.0.0.1:18081/v1', fetch: (async () => { aiCalls++; throw Error('canonical inn knowledge expected'); }) as typeof fetch });
  for (const npc of NPC_SETTLEMENT_EXPANSION.filter(npc => npc.building === 'inn')) for (const locale of locales) {
    const c = character(npc.homeLocation), before = structuredClone(c);
    const ask = (text: string) => service.chat(`${npc.id}-${locale}`, { requestId: crypto.randomUUID(), npcId: npc.id, locale, text }, { character: c });
    const rooms = await ask({ ko: '객실 종류를 알려주세요', en: 'What rooms do you have?', ja: '部屋の種類を教えて' }[locale]);
    assert.equal(rooms.source, 'canon'); assert.equal(rooms.error, undefined);
    for (const room of FANTASY_LODGINGS) assert.ok(rooms.text.includes(room.name[locale]));
    const meals = await ask({ ko: '식사 메뉴를 알려주세요', en: 'What meals do you serve?', ja: '食事の献立を教えて' }[locale]);
    assert.equal(meals.source, 'canon');
    for (const meal of FANTASY_DINING) assert.ok(meals.text.includes(meal.name[locale]));
    assert.deepEqual(c, before);
  }
  assert.equal(aiCalls, 0);
});

test('new specialists inherit actual stock, local books and valid lessons, with no imaginary facilities', () => {
  for (const npc of NPC_SETTLEMENT_EXPANSION) {
    const c = character(npc.homeLocation), before = structuredClone(c), k = npcFacilityKnowledge(npc.id, c);
    if (npc.building === 'residence') assert.equal(k.building, undefined);
    else assert.deepEqual(k.stock, fantasyBuildingStock(c, k.building!.id));
    if (npc.building === 'library') assert.deepEqual(k.books.map(book => book.id).sort(), fantasyLibraryHoldings(c).sort());
    assert.deepEqual(k.jobs.map(job => job.id).sort(), [...npc.trainableJobs ?? []].sort());
    for (const locale of locales) {
      const text = npcFacilityReply(locale, npc.id, { ko: '어떤 직업을 배울 수 있어?', en: 'Which professions can you teach?', ja: 'どんな職業を学べますか？' }[locale], c)!;
      assert.ok(text); assert.equal(npcBreaksFourthWall(text), false);
      for (const job of k.jobs) assert.ok(text.includes(job.names[locale]));
    }
    assert.deepEqual(c, before);
  }
});

test('public culture and clothing remain separate from conditional knowledge and private notes', () => {
  for (const npc of NPC_SETTLEMENT_EXPANSION) {
    const look = NPC_SETTLEMENT_APPEARANCE[npc.id]; assert.ok(look);
    const land = FANTASY_LOCATIONS.find(place => place.id === npc.homeLocation)!.land;
    assert.equal(look.culture, ({ noctis: 'moon-wrap', sylvara: 'rain-hanbok', kazaran: 'caravan', aurelia: 'western' } as Record<string, string>)[land]);
    assert.equal(look.climate, npc.homeLocation === 'pinewatch' ? 'cold' : land === 'sylvara' ? 'humid' : land === 'kazaran' ? 'hot' : 'temperate');
    for (const locale of locales) assert.ok(npc.knownTopics[locale].includes(look.clothing[locale]));
    const publicFacts = npcAllowedFacts(npc.id, 'stranger');
    assert.ok(publicFacts.some(fact => fact.includes(look.visualNotes)), npc.id);
    for (const privateFact of [...NPC_SERVER[npc.id].privateSecrets, ...NPC_SERVER[npc.id].conditionalFacts.map(fact => fact.fact)]) assert.ok(!publicFacts.includes(privateFact));
    const prompt = npcSystemPrompt('en', npc.id, 'stranger', {}, 'What clothing are you wearing?');
    assert.ok(prompt.includes(look.visualNotes), npc.id);
    for (const secret of NPC_SERVER[npc.id].privateSecrets) assert.ok(!prompt.includes(secret));
  }
});

test('every new shopkeeper bargains only after separate consent using the real local service', () => {
  for (const npc of NPC_SETTLEMENT_EXPANSION) {
    const services = npc.building === 'inn' ? ['room', 'food'] as const : npc.building === 'restaurant' ? ['food'] as const : ['market', 'alchemist', 'blacksmith'].includes(npc.building) ? ['goods'] as const : [];
    for (const service of services) for (const locale of locales) {
      const p = newFantasyProfile(); p.character = character(npc.homeLocation);
      const bargaining = new FantasyBargaining(); let calls = 0;
      const phrases = { room: { ko: '객실값 깎아줘', en: 'negotiate room prices', ja: '客室代を値引きして' }, food: { ko: '식사비 깎아줘', en: 'negotiate meal prices', ja: '食事代を値引きして' }, goods: { ko: '물품 가격 깎아줘', en: 'negotiate goods prices', ja: '品物の値段を値引きして' } };
      const request = (text: string) => ({ user: npc.id, npcId: npc.id, text, locale, profile: p, revision: p.revision });
      const apply = (revision: number, action: { type: 'haggle'; service: 'room' | 'food' | 'goods' }) => { calls++; assert.equal(revision, p.revision); assert.equal(action.service, service); return applyFantasyAction(p, action, () => 0); };
      const before = structuredClone(p);
      const proposal = bargaining.chat(request(phrases[service][locale]), apply);
      assert.equal(proposal.handled, true); assert.equal(proposal.result, undefined); assert.equal(calls, 0); assert.deepEqual(p, before);
      const result = bargaining.chat(request({ ko: '응', en: 'yes', ja: 'はい' }[locale]), apply);
      assert.equal(calls, 1); assert.equal(result.result?.error, undefined); assert.equal(result.result?.changed, true);
      assert.equal(result.result?.profile.character?.bargains?.[service]?.location, npc.homeLocation);
      assert.equal(npcBreaksFourthWall(result.text!), false);
    }
  }
});

test('new guild staff describe the current eligible postings with real local named issuers', () => {
  for (const npc of NPC_SETTLEMENT_EXPANSION.filter(npc => npc.building === 'guild')) {
    const c = character(npc.homeLocation);
    const quest = FANTASY_QUESTS.find(quest => quest.giver === npc.homeLocation && !fantasyPersonalQuest(quest));
    assert.ok(quest, npc.id);
    if (quest.jobs?.length) c.job = quest.jobs[0];
    assert.equal(fantasyQuestEligible(c, quest), true);
    const issuer = fantasyContractIssuer(quest); assert.ok(NPC_PUBLIC.some(person => person.id === issuer && person.homeLocation === quest.giver));
    const board: FantasyContractBoard = { revision: 1, hour: c.hour, location: c.location, environment: { ...fantasyEnvironment(c), monsterPressure: 50, bountyMultiplier: 1 }, offers: [
      { id: `offer-${npc.homeLocation}-test`, quest: quest.id, boardLocation: c.location, issuer: issuer!, createdAt: c.hour, expiresAt: c.hour + 12, deadline: c.hour + 36, mode: 'exclusive', gold: quest.gold, participants: 0, mine: false, available: true },
    ] };
    for (const locale of locales) {
      const text = npcFacilityReply(locale, npc.id, { ko: '지금 어떤 의뢰가 있어?', en: 'Which contracts are posted?', ja: 'いまどんな依頼がありますか？' }[locale], c, board)!;
      assert.ok(text.includes(fantasyQuestText(quest, locale).name)); assert.ok(text.includes(`${quest.gold}G`));
    }
    board.offers[0].available = false;
    assert.ok(!npcFacilityReply('en', npc.id, 'Which contracts are posted?', c, board)!.includes(fantasyQuestText(quest, 'en').name));
  }
});
