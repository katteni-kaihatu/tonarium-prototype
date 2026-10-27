import { test } from 'node:test';
import assert from 'node:assert/strict';
import type { FantasyProfile } from './fantasy.ts';
import { applyFantasyAction, fantasyStats, newFantasyProfile } from './fantasy-engine.ts';
import { fantasyGmKnowledge } from './fantasy-gm-knowledge.ts';
import { FANTASY_EVENTS, FANTASY_JOBS, FANTASY_LOCATIONS, FANTASY_QUESTS } from './fantasy-data.ts';
import { FANTASY_TERMS } from './fantasy-lore.ts';
import { fantasyQuestText } from './fantasy-narrative.ts';
import { NPC_PUBLIC, type NpcLocale } from './npc.ts';
import { NPC_SERVER } from '../server/npc-catalog.ts';
import { addFantasyStatus } from './fantasy-effects.ts';
import { fantasyBuildings } from './fantasy-town.ts';

function player(): FantasyProfile {
  const profile = applyFantasyAction(newFantasyProfile(), { type: 'create', name: '아린', gender: 'female', source: 'human' }, () => 0.999).profile;
  profile.character!.birthBonuses = {}; profile.character!.hp = 100; profile.character!.mp = 50;
  return profile;
}
function label(id: string, locale: NpcLocale) { return FANTASY_TERMS.find(term => term.id === id)!.names[locale]; }
function freeze(value: unknown): void {
  if (value && typeof value === 'object') { Object.freeze(value); for (const child of Object.values(value)) freeze(child); }
}

test('knowledge is deterministic, immutable, and localized for the current character', () => {
  const p = player();
  const snapshot = structuredClone(p);
  freeze(p);
  for (const locale of ['ko', 'en', 'ja'] as const) {
    const text = fantasyGmKnowledge(p, locale);
    assert.equal(text, fantasyGmKnowledge(p, locale));
    assert.ok(text.includes('아린'));
    assert.ok(text.includes(label('human', locale)));
    assert.ok(text.includes(label('hearth', locale)));
    assert.ok(text.includes('HP 100/100'));
    assert.ok(text.includes('30'));
  }
  assert.deepEqual(p, snapshot);
});

test('own mana, equipment, learned skills and active status effects are authorized current knowledge', () => {
  const p = player(); const c = p.character!;
  c.inventory['steel-sword'] = 1; c.equipment = { weapon: 'steel-sword' };
  c.mana = { stage: 2, mastery: 7, strain: 38, affinity: 'balanced' }; c.learnedSkills = ['mentor-focus'];
  addFantasyStatus(c, 'poison'); const before = structuredClone(p);
  const text = fantasyGmKnowledge(p, 'en');
  assert.ok(text.includes('Own mana training: stage 2/4, effective-use experience 0'));
  assert.ok(text.includes('Strain 38/100'));
  assert.ok(text.includes('Equipped item: Steel Sword'));
  assert.ok(text.includes('Current timed effect: poison'));
  assert.ok(text.includes('Skills learned from mentors'));
  assert.ok(!text.includes('Ancient Aegis'));
  assert.deepEqual(p, before);
  p.activity = { action: { type: 'explore' }, startedAt: c.hour, endsAt: c.hour + 3, seed: 1 };
  const pending = fantasyGmKnowledge(p, 'en');
  assert.match(pending,/Current activity: [^\n]*[Ee]xplor/);
  assert.ok(pending.includes('Results and rewards are still pending'));
});

test('hidden places and their resources are absent, including all language aliases in quest text', () => {
  const p = player();
  for (const locale of ['ko', 'en', 'ja'] as const) {
    const text = fantasyGmKnowledge(p, locale);
    for (const place of FANTASY_LOCATIONS.filter(place => place.id !== 'hearth')) {
      const term = FANTASY_TERMS.find(term => term.id === place.id)!;
      for (const name of [place.name, ...Object.values(term.names), ...Object.values(term.aliases ?? {}).flat()]) assert.ok(!text.toLowerCase().includes(name.toLowerCase()), name);
    }
    assert.ok(!text.includes(label('crystal', locale)));
    assert.ok(!text.includes(label('gem', locale)));
  }
});

test('a charted location reveals its name while resource knowledge requires a visit', () => {
  const p = player(); p.character!.charted = ['deepcave'];
  const charted = fantasyGmKnowledge(p, 'en');
  assert.ok(charted.includes(label('deepcave', 'en')));
  assert.ok(!charted.includes(label('crystal', 'en')));
  p.character!.visited.push('deepcave');
  const visited = fantasyGmKnowledge(p, 'en');
  assert.ok(visited.includes(label('crystal', 'en')));
  assert.ok(visited.includes(label('gem', 'en')));
});

test('unaccepted remote quests and quests for other races are excluded', () => {
  const p = player();
  const remote = FANTASY_QUESTS.find(quest => quest.id === 'quest-ore')!;
  for (const locale of ['ko', 'en', 'ja'] as const) {
    const text = fantasyGmKnowledge(p, locale);
    assert.ok(!text.includes(fantasyQuestText(remote, locale).name));
    for (const quest of FANTASY_QUESTS.filter(quest => quest.races || quest.families)) assert.ok(!text.includes(fantasyQuestText(quest, locale).name));
  }
  p.character!.race = 'demigod';
  const divine = fantasyGmKnowledge(p, 'en');
  const local = FANTASY_QUESTS.filter(quest => quest.giver === 'hearth' && quest.races?.includes('demigod'));
  assert.ok(local.length > 0);
  assert.ok(local.every(quest => !divine.includes(fantasyQuestText(quest, 'en').name)));
  p.character!.quests = [local[0].id];
  assert.ok(fantasyGmKnowledge(p, 'en').includes(fantasyQuestText(local[0], 'en').name));
});

test('accepted and completed eligible quests remain known away from their giver', () => {
  const p = player();
  p.character!.location = 'emberhall'; p.character!.visited.push('emberhall');
  p.character!.quests = ['quest-herbalist']; p.character!.completed = ['quest-timber'];
  const text = fantasyGmKnowledge(p, 'en');
  assert.ok(text.includes(fantasyQuestText(FANTASY_QUESTS.find(quest => quest.id === 'quest-herbalist')!, 'en').name));
  assert.ok(text.includes('[accepted]'));
  assert.ok(text.includes('[completed]'));
  assert.ok(!text.includes(label('greenwood', 'en')));
  assert.ok(!text.includes(label('sunmeadow', 'en')));
});

test('food observation stays sensory for ordinary characters and exact only for cooks', () => {
  const p = player();
  p.character!.hour = 40;
  for (const locale of ['ko', 'en', 'ja'] as const) {
    const ordinary = fantasyGmKnowledge(p, locale);
    assert.ok(!ordinary.includes('shelfLife='));
    assert.ok(!ordinary.includes('nutrition='));
    assert.ok(!ordinary.includes('quality='));
    assert.ok(!ordinary.includes('age='));
  }
  p.character!.job = 'cook'; p.character!.jobXp.cook = 0;
  const cook = fantasyGmKnowledge(p, 'en');
  assert.ok(cook.includes('age=32.000 h'));
  assert.ok(cook.includes('shelfLife=24 h'));
  assert.ok(cook.includes('nutrition=38'));
  assert.ok(cook.includes('quality=spoiled'));
});

test('only local public NPCs are included and server-only secrets never enter knowledge', () => {
  const p = player();
  p.character!.charted = FANTASY_LOCATIONS.map(place => place.id);
  for (const locale of ['ko', 'en', 'ja'] as const) {
    const text = fantasyGmKnowledge(p, locale);
    assert.ok(text.includes(NPC_PUBLIC.find(npc => npc.id === 'rin')!.name[locale]));
    const present = new Set(fantasyBuildings(p.character!).flatMap(building => building.npcIds));
    for (const npc of NPC_PUBLIC) {
      const local = npc.homeLocation === p.character!.location && (npc.building === 'residence' || present.has(npc.id));
      assert.equal(text.includes(`: ${npc.name[locale]}; ${npc.role[locale]};`), local, npc.id);
    }
    for (const npc of Object.values(NPC_SERVER)) for (const secret of npc.privateSecrets) assert.ok(!text.includes(secret));
  }
});

test('pending activity reveals its type and permitted details but masks an unexplored destination', () => {
  const p = player();
  p.activity = { action: { type: 'travel', destination: 'deepcave', transport: 'foot' }, startedAt: 8, endsAt: 12, seed: 123 };
  p.character!.hour = 9;
  const hidden = fantasyGmKnowledge(p, 'en');
  assert.ok(hidden.includes('Current activity: travel'));
  assert.ok(hidden.includes('3.000 h (6.0 real minutes)'));
  assert.ok(!hidden.includes(label('deepcave', 'en')));
  assert.ok(!hidden.includes('seed'));
  p.character!.charted = ['deepcave'];
  assert.ok(fantasyGmKnowledge(p, 'en').includes(label('deepcave', 'en')));
  p.activity.action = { type: 'job', job: 'cook', via: 'gm' };
  assert.ok(fantasyGmKnowledge(p, 'en').includes(FANTASY_JOBS.find(job => job.id === 'cook')!.names.en));
});

test('current body modifiers are available but an unrelated racial event is excluded', () => {
  const p = player(); p.character!.race = 'halfling';
  p.character!.hp = fantasyStats(p.character!).hp;
  const own = fantasyGmKnowledge(p, 'en');
  assert.ok(own.includes('Small stature'));
  assert.ok(own.includes('Narrow passages +3'));
  const other = FANTASY_EVENTS.find(event => event.races?.includes('archdemon'))!;
  p.event = other.id;
  assert.ok(!fantasyGmKnowledge(p, 'en').includes(other.names!.en));
});

test('an uncreated profile exposes only its draft and no settlement or character details', () => {
  const p = newFantasyProfile(); p.draft.remaining = 4; p.draft.kept = 'catkin';
  const text = fantasyGmKnowledge(p, 'ko');
  assert.ok(text.includes('캐릭터 미생성'));
  assert.ok(text.includes('4/5'));
  assert.ok(text.includes(label('catkin', 'ko')));
  assert.ok(!text.includes('HP'));
  assert.ok(!text.includes(NPC_PUBLIC[0].name.ko));
  assert.ok(!text.includes(label('hearth', 'ko')));
});

test('public basics explain the calendar mana gender rules and unverified island rumors without undiscovered geography', () => {
  const p = player();
  const text = fantasyGmKnowledge(p, 'en');
  assert.ok(text.includes('The Long Journey'));
  assert.ok(text.includes('Afterglow Calendar'));
  assert.ok(text.includes('312'));
  assert.ok(text.includes('Gender itself adds no stat bonus or job restriction'));
  assert.ok(text.includes('A reliable route and the island’s true nature have not yet been verified'));
  assert.ok(!text.includes(label('beyond-dawn-isle', 'en')));
  assert.ok(!text.includes('In Afterglow 276'));
  assert.ok(!text.includes('Ruler names'));
});
