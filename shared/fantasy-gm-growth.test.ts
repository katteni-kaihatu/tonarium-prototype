import test from 'node:test';
import assert from 'node:assert/strict';
import { applyFantasyAction, newFantasyProfile, startFantasyActivity } from './fantasy-engine.ts';
import { fantasyGmCanAnswer, fantasyGmReply } from './fantasy-gm.ts';
import { FANTASY_JOBS, FANTASY_LOCATIONS } from './fantasy-data.ts';
import { fantasySkillName } from './fantasy-skill-names.ts';
import type { FantasyCharacter } from './fantasy.ts';

const queries = { ko: '어떻게 성장하면 좋을까요?', en: 'How can I grow stronger?', ja: 'どうすれば成長できますか？' } as const;
function player(changes: Partial<FantasyCharacter> = {}) {
  const p = applyFantasyAction(newFantasyProfile(), { type: 'create', source: 'human', name: 'Growth', gender: 'female' }).profile;
  Object.assign(p.character!, { job: 'warrior', location: 'hearth', hour: 12, jobXp: { warrior: 73 }, ...changes });
  return p;
}

test('growth questions identify actual simultaneous careers and their own practice in all locales', () => {
  for (const locale of ['ko', 'en', 'ja'] as const) {
    const p = player({ lifeJob: 'cook', jobXp: { warrior: 73, cook: 19, mage: 999 } });
    const before = structuredClone(p), answer = fantasyGmReply(p, queries[locale], locale);
    assert.equal(fantasyGmCanAnswer(p, queries[locale]), true);
    for (const id of ['warrior', 'cook']) assert.ok(answer.text.includes(FANTASY_JOBS.find(j => j.id === id)!.names[locale]));
    assert.match(answer.text, /73/); assert.match(answer.text, /19/); assert.doesNotMatch(answer.text, /999/);
    assert.match(answer.text, /반복|repeat|反復/i);
    assert.match(answer.text, /도서|library|図書/);
    assert.ok(answer.suggestions.every(s => !s.action && !s.location));
    assert.deepEqual(p, before);
  }
});

test('growth intent precedes skill, status, named-profession training and current-activity branches', () => {
  const active = startFantasyActivity(player({ lifeJob: 'cook' }), { type: 'work', career: 'life' }, 12, () => .5).profile;
  assert.ok(active.activity);
  for (const locale of ['ko', 'en', 'ja'] as const) {
    for (const query of [queries[locale], 'How can I improve my skills and MP?', 'How should I train as a warrior to grow stronger?', '성장하려면 지금 무슨 행동을 해야 하나요?']) {
      const before = structuredClone(active), answer = fantasyGmReply(active, query, locale);
      assert.match(answer.text, /반복|repeat|反復/i, query);
      assert.ok(answer.text.includes(FANTASY_JOBS.find(j => j.id === 'cook')!.names[locale]));
      assert.match(answer.text, /완료|finish|完了/);
      assert.ok(answer.suggestions.every(s => !s.action && !s.location));
      assert.deepEqual(active, before);
    }
  }
});

test('mage mana hints describe actual effective MP use without starting retired training', () => {
  for (const locale of ['ko', 'en', 'ja'] as const) {
    const p = player({ job: 'mage', jobXp: { mage: 31 }, mana: { stage: 2, mastery: 6, strain: 17, affinity: 'balanced' } });
    const answer = fantasyGmReply(p, 'How can I improve my mana and skills?', locale);
    assert.match(answer.text, /MP/); assert.match(answer.text, /17/);
    assert.match(answer.text, /31/);
    assert.match(answer.text, /실제|effective|実際/);
    assert.ok(answer.suggestions.every(s => !s.action));
    assert.match(answer.text, /반복|repeat|反復/i);
  }
});

test('priest growth respects daily prayer state and temple-only rank guidance', () => {
  for (const locale of ['ko', 'en', 'ja'] as const) {
    const p = player({ job: 'priest', jobXp: { priest: 22 }, lastPrayerDay: 0,
      guildProgress: { version: 1, grade: 6, completedAtGrade: 4, creditedQuests: [] } });
    const before = structuredClone(p), answer = fantasyGmReply(p, queries[locale], locale);
    assert.match(answer.text, /이미.*기도|already prayed|すでに祈/);
    assert.match(answer.text, /다음.*날|next world day|次の世界日/);
    assert.match(answer.text, /봉사|service|奉仕/);
    assert.match(answer.text, /신전|temple|神殿/);
    assert.doesNotMatch(answer.text, /길드|guild|ギルド/i);
    assert.deepEqual(p, before);
    p.character!.lastPrayerDay = undefined;
    const fresh = fantasyGmReply(p, queries[locale], locale);
    assert.match(fresh.text, /한 번|once|一度/);
    assert.doesNotMatch(fresh.text, /이미.*기도|already prayed|すでに祈/);
  }
});

test('criminal growth never recommends guild ranks even with a preserved guild record and life career', () => {
  for (const locale of ['ko', 'en', 'ja'] as const) {
    const p = player({ job: 'thief', lifeJob: 'blacksmith', jobXp: { thief: 29, blacksmith: 11 }, guildProgress: { version: 1, grade: 8, completedAtGrade: 0, creditedQuests: [] } });
    const answer = fantasyGmReply(p, queries[locale], locale);
    assert.ok(answer.text.includes(FANTASY_JOBS.find(j => j.id === 'thief')!.names[locale]));
    assert.doesNotMatch(answer.text, /길드|guild|ギルド/i);
    assert.match(answer.text, /뒷골목|underworld|裏社会/i);
  }
});

test('growth guidance distinguishes available production facilities and guild registration', () => {
  const p = player({ lifeJob: 'blacksmith', location: 'emberhall' });
  const local = fantasyGmReply(p, 'How can I grow stronger?', 'en');
  assert.match(local.text, /suitable crafting facility/);
  assert.match(local.text, /Register at a guild/);
  p.character!.location = 'greenwood';
  p.character!.guildProgress = { version: 1, grade: 2, completedAtGrade: 1, creditedQuests: [] };
  const field = fantasyGmReply(p, 'How can I grow stronger?', 'en');
  assert.doesNotMatch(field.text, /suitable crafting facility/);
  assert.match(field.text, /Check local facilities, resources and tools/);
  assert.match(field.text, /Guild rank advances/);
});

test('growth hints reveal no unavailable skill names, hidden locations, secret thresholds or miracle triggers', () => {
  for (const locale of ['ko', 'en', 'ja'] as const) {
    const p = player({ job: 'priest', jobXp: { priest: 0 }, charted: [], visited: ['hearth'] });
    const answer = fantasyGmReply(p, queries[locale], locale);
    for (const skill of FANTASY_JOBS.find(j => j.id === 'mage')!.skills) assert.ok(!answer.text.includes(fantasySkillName(skill, locale)));
    for (const place of FANTASY_LOCATIONS.filter(p => /isle/.test(p.id))) assert.ok(!answer.text.includes(place.names?.[locale] ?? place.name));
    assert.doesNotMatch(answer.text, /last.?dawn|마지막.*새벽|最後の暁|315|240|miracle|기적|奇跡/i);
    const hidden = fantasyGmReply(p, 'How can I grow stronger and unlock the saint subclass?', locale);
    assert.doesNotMatch(hidden.text, /315|240|prayerDays|last.?dawn|마지막.*새벽|最後の暁/i);
  }
});

test('unassigned characters get career discovery hints and unrelated requests keep free dialogue fallback', () => {
  const p = player({ job: 'unassigned', jobXp: {} });
  for (const locale of ['ko', 'en', 'ja'] as const) {
    const answer = fantasyGmReply(p, queries[locale], locale);
    assert.match(answer.text, /직업|profession|職業/);
    assert.ok(answer.suggestions.every(s => !s.action));
  }
  for (const query of ['How do flowers grow?', 'I would like to discuss a difficult memory.']) assert.equal(fantasyGmCanAnswer(p, query), false);
});

test('growth questions retain invalid-record handling instead of throwing on unknown stored careers', () => {
  const p = player({ job: 'missing-career' });
  assert.doesNotThrow(() => fantasyGmReply(p, 'How can I grow stronger?', 'en'));
  assert.match(fantasyGmReply(p, 'How can I grow stronger?', 'en').text, /record|reconnect/i);
});
