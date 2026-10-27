import { test } from 'node:test';
import assert from 'node:assert/strict';
import { FANTASY_EVENTS, FANTASY_ITEMS, FANTASY_JOBS, FANTASY_LOCATIONS, FANTASY_QUESTS } from './fantasy-data.ts';
import { applyFantasyAction, newFantasyProfile } from './fantasy-engine.ts';
import { fantasyDialogueJob, fantasyGmReply } from './fantasy-gm.ts';
import { FANTASY_MENTOR_SKILLS, fantasyNpcMentorSkills } from './fantasy-apprenticeship.ts';
import { NPC_PUBLIC, type NpcLocale } from './npc.ts';
import { NpcChat } from '../server/npc.ts';
import type { FantasyAction } from './fantasy.ts';
import { FANTASY_REGIONAL_EVENTS } from './fantasy-regional-events.ts';
import { fantasyEventEligible } from './fantasy-access.ts';

const IDS = ['warrior', 'knight', 'spearfighter', 'archer', 'scout', 'pugilist', 'spellblade', 'shieldbearer', 'summoner', 'carpenter', 'tailor', 'weaver', 'leatherworker', 'gemcutter', 'herbalist', 'farmer', 'fisher', 'baker', 'potter', 'shipwright', 'scribe'];
const player = (location = 'hearth') => {
  const profile = applyFantasyAction(newFantasyProfile(), { type: 'create', source: 'human', name: 'Learner', gender: 'female' }, () => .999).profile;
  profile.character!.location = location;
  profile.character!.visited = [...new Set(['hearth', location])];
  return profile;
};
const request = (text: string, npcId: string, locale: NpcLocale) => ({ requestId: crypto.randomUUID(), text, npcId, locale });
const phrase = (name: string, locale: NpcLocale) => ({ ko: `${name}가 되고 싶어. 가르쳐줘.`, en: `Teach me to become ${name}.`, ja: `${name}になりたい。教えてください。` })[locale];
const action = (job: string, via: 'gm' | 'npc' | 'guild', npcId?: string): FantasyAction => ({ type: 'job', job, via, ...(npcId ? { npcId } : {}) });

test('all twenty-one approved professions have one explicit localized GM acquisition proposal', () => {
  for (const id of IDS) {
    const job = FANTASY_JOBS.find(job => job.id === id); assert.ok(job, id);
    for (const locale of ['ko', 'en', 'ja'] as const) {
      const profile = player(); const before = JSON.stringify(profile);
      const reply = fantasyGmReply(profile, phrase(job.names[locale], locale), locale);
      assert.deepEqual(reply.suggestions.flatMap(s => s.action ? [s.action] : []), [action(id, 'gm')], `${id}/${locale}`);
      assert.equal(applyFantasyAction(profile, reply.suggestions[0].action!, () => .999).error, undefined);
      assert.equal(JSON.stringify(profile), before);
    }
  }
});

test('profession synonyms prefer the longest meaning and never confuse magic warriors with mage or warrior', () => {
  for (const [query, id] of [
    ['마법전사를 배우고 싶어', 'spellblade'], ['Teach me magic swordsman', 'spellblade'], ['魔法剣士になりたい', 'spellblade'],
    ['창병이 되고싶어', 'spearfighter'], ['권사를 배우고 싶어', 'pugilist'], ['배목수가 되고싶어', 'shipwright'],
    ['필경사가 되고싶어', 'scribe'], ['직조공이 되고싶어', 'weaver'], ['성직자가 되고싶어', 'priest'],
  ]) assert.equal(fantasyDialogueJob(query)?.id, id, query);
});

test('every approved profession has a local NPC profession teacher and a bounded existing mentor skill', async () => {
  const service = new NpcChat({ fetch: (async () => { throw new Error('No model for deterministic lessons'); }) as typeof fetch });
  for (const id of IDS) {
    const npc = NPC_PUBLIC.find(npc => npc.trainableJobs?.includes(id)); assert.ok(npc, id);
    const profile = player(npc.homeLocation); const before = JSON.stringify(profile);
    for (const locale of ['ko', 'en', 'ja'] as const) {
      const reply = await service.chat(`teacher-${id}-${locale}`, request(phrase(FANTASY_JOBS.find(job => job.id === id)!.names[locale], locale), npc.id, locale), { character: profile.character! });
      assert.equal(reply.source, 'canon'); assert.deepEqual(reply.actions, [action(id, 'npc', npc.id)]);
      assert.equal(applyFantasyAction(profile, reply.actions![0], () => .999).error, undefined);
    }
    const skills = fantasyNpcMentorSkills(npc.id); assert.ok(skills.length, id);
    const lesson = await service.chat(`skill-${id}`, request('기술을 배우고 싶어', npc.id, 'ko'), { character: profile.character! });
    assert.ok(lesson.actions?.length, id);
    for (const proposed of lesson.actions!) {
      assert.equal(proposed.type, 'learn');
      assert.ok(proposed.type === 'learn' && FANTASY_MENTOR_SKILLS.some(skill => skill.id === proposed.skill));
      assert.equal(applyFantasyAction(profile, proposed, () => .999).error, undefined);
    }
    assert.equal(JSON.stringify(profile), before);
  }
  assert.equal(FANTASY_MENTOR_SKILLS.length, 3);
});

test('priest ordination requires a current temple through GM guild or NPC and never comes from alchemy', async () => {
  const service = new NpcChat({ fetch: (async () => { throw new Error('No model for ordination'); }) as typeof fetch });
  assert.ok(FANTASY_JOBS.some(job => job.id === 'priest'));
  assert.ok(!FANTASY_JOBS.some(job => job.id === 'healer'));
  for (const location of ['hearth', 'suncourt', 'mooncity']) {
    const npc = NPC_PUBLIC.find(npc => npc.homeLocation === location && npc.building === 'temple')!;
    assert.deepEqual(npc.trainableJobs, ['priest']);
    const profile = player(location);
    const reply = await service.chat(location, request('사제를 가르쳐줘', npc.id, 'ko'), { character: profile.character! });
    assert.deepEqual(reply.actions, [action('priest', 'npc', npc.id)]);
    assert.equal(applyFantasyAction(profile, action('priest', 'gm'), () => .999).error, undefined);
  }
  for (const locale of ['ko', 'en', 'ja'] as const) {
    const profile = player('greenwood');
    const reply = fantasyGmReply(profile, phrase(FANTASY_JOBS.find(job => job.id === 'priest')!.names[locale], locale), locale);
    assert.deepEqual(reply.suggestions.filter(s => s.action), []);
    assert.match(reply.text, /신전|temple|神殿/);
    assert.ok(applyFantasyAction(profile, action('priest', 'gm')).error);
    assert.ok(applyFantasyAction(profile, action('priest', 'guild')).error);
  }
  const alchemist = NPC_PUBLIC.find(npc => npc.homeLocation === 'mooncity' && npc.building === 'alchemist')!;
  assert.deepEqual(alchemist.trainableJobs, ['alchemist']);
  assert.equal((await service.chat('wrong-teacher', request('사제를 가르쳐줘', alchemist.id, 'ko'), { character: player('mooncity').character! })).actions, undefined);
});

test('summoner dialogue proposes training without inventing creatures rewards or cross-profession active skills', () => {
  const profile = player(); const before = JSON.stringify(profile);
  const reply = fantasyGmReply(profile, '소환술사가 되고싶어', 'ko');
  assert.deepEqual(reply.suggestions.map(s => s.action), [action('summoner', 'gm')]);
  assert.equal(JSON.stringify(profile), before);
  assert.ok(!FANTASY_MENTOR_SKILLS.some(skill => skill.id.startsWith('approved-')));
});

test('regional scenes have valid local-only authority and complete distinct localized outcomes', () => {
  assert.equal(FANTASY_REGIONAL_EVENTS.length, 12);
  assert.equal(new Set(FANTASY_REGIONAL_EVENTS.map(event => event.id)).size, 12);
  for (const event of FANTASY_REGIONAL_EVENTS) {
    assert.ok(FANTASY_EVENTS.some(registered => registered.id === event.id));
    assert.equal(event.job, undefined); assert.equal(event.races, undefined); assert.equal(event.families, undefined);
    assert.ok(event.locations?.length);
    assert.ok(event.locations.every(id => FANTASY_LOCATIONS.some(place => place.id === id)));
    assert.equal(event.choices.length, 2);
    assert.notEqual(event.choices[0].success, event.choices[1].success);
    assert.notEqual(event.choices[0].failure, event.choices[1].failure);
    for (const locale of ['ko', 'en', 'ja'] as const) {
      assert.ok(event.names?.[locale]); assert.ok(event.descriptions?.[locale]);
      for (const choice of event.choices) {
        assert.ok(choice.labels?.[locale] && choice.successes?.[locale] && choice.failures?.[locale]);
        assert.notEqual(choice.successes?.[locale], choice.failures?.[locale]);
        assert.ok(choice.context);
        assert.ok(FANTASY_ITEMS.some(item => item.id === choice.item));
      }
    }
    const local = player(event.locations[0]);
    assert.ok(fantasyEventEligible(local.character!, event));
    const foreign = FANTASY_LOCATIONS.find(place => !event.locations!.includes(place.id))!;
    assert.equal(fantasyEventEligible({ ...local.character!, location: foreign.id }, event), false);
  }
});

test('every regional option resolves through the actual engine with separate success and failure records', () => {
  for (const event of FANTASY_REGIONAL_EVENTS) {
    for (const choice of event.choices) {
      for (const success of [true, false]) {
        const profile = player(event.locations![0]); profile.event = event.id;
        const result = applyFantasyAction(profile, { type: 'event', choice: choice.id }, () => success ? .999 : 0);
        assert.equal(result.error, undefined, event.id);
        assert.equal(result.profile.event, null);
        assert.ok(result.profile.log.some(entry => entry.text.includes(success ? choice.success : choice.failure)), event.id);
      }
    }
  }
});

test('changing profession preserves accepted and completed quest knowledge without offering an ineligible delivery', () => {
  const quest = FANTASY_QUESTS.find(quest => quest.jobs?.includes('warrior'))!; const prior = quest.jobs;
  quest.jobs = ['warrior'];
  try {
    for (const locale of ['ko', 'en', 'ja'] as const) {
      const profile = player(quest.giver); const c = profile.character!;
      c.jobXp.warrior = 0;
      c.completed = [...quest.requiresCompleted ?? []]; c.quests = [quest.id];
      const query = `${quest.names?.[locale] ?? quest.name} quest`;
      const active = fantasyGmReply(profile, query, locale);
      assert.ok(active.text.includes(quest.names?.[locale] ?? quest.name));
      assert.ok(!active.suggestions.some(s => s.action?.type === 'complete' || s.action?.type === 'job'));
      c.quests = []; c.completed.push(quest.id);
      const completed = fantasyGmReply(profile, query, locale);
      assert.match(completed.text, /완료|completed|達成済/);
      assert.ok(!completed.suggestions.some(s => s.action));
    }
  } finally { if (prior === undefined) delete quest.jobs; else quest.jobs = prior; }
});
