import test from 'node:test';
import assert from 'node:assert/strict';
import { applyFantasyAction, newFantasyProfile } from './fantasy-engine.ts';
import { fantasyGmReply } from './fantasy-gm.ts';
import { fantasyGmKnowledge } from './fantasy-gm-knowledge.ts';
import { FANTASY_JOBS, FANTASY_RECIPES } from './fantasy-data.ts';

function person(lifeJob = 'cook') {
  const p = applyFantasyAction(newFantasyProfile(), { type: 'create', source: 'human', name: 'Both careers', gender: 'female' }, () => .5).profile;
  Object.assign(p.character!, { job: 'warrior', lifeJob, location: 'emberhall', hour: 12, inventory: { ore: 20, wood: 20 }, jobXp: { warrior: 1000, [lifeJob]: 1000 } });
  return p;
}
test('GM current career and status responses name both selected careers in all locales', () => {
  const p = person();
  for (const locale of ['ko', 'en', 'ja'] as const) for (const query of ['profession', 'status']) {
    const result = fantasyGmReply(p, query, locale);
    for (const job of ['warrior', 'cook']) assert.ok(result.text.includes(FANTASY_JOBS.find(j => j.id === job)!.names[locale]), `${locale} ${query}: ${job}`);
  }
});
test('GM does not offer to relearn the active life career and can still offer a different life career', () => {
  for (const locale of ['ko', 'en', 'ja'] as const) {
    const known = fantasyGmReply(person(), 'learn cook', locale);
    assert.ok(!known.suggestions.some(s => s.action?.type === 'job' && s.action.job === 'cook'));
    assert.match(known.text, /already|이미|すでに/);
    const next = fantasyGmReply(person(), 'learn blacksmith', locale);
    assert.ok(next.suggestions.some(s => s.action?.type === 'job' && s.action.job === 'blacksmith'));
  }
});
test('GM offers actual life-career recipes while preserving the combat career', () => {
  const p = person('blacksmith');
  for (const locale of ['ko', 'en', 'ja'] as const) {
    const result = fantasyGmReply(p, 'craft', locale);
    assert.ok(result.suggestions.some(s => { const a = s.action; return a?.type === 'craft' && FANTASY_RECIPES.find(r => r.id === a.recipe)?.job === 'blacksmith'; }));
  }
  assert.equal(p.character!.job, 'warrior');
});
test('authorized GM knowledge includes life career and its own practice independently', () => {
  const p = person('cook'); p.character!.jobXp.cook = 123;
  for (const locale of ['ko', 'en', 'ja'] as const) {
    const knowledge = fantasyGmKnowledge(p, locale);
    assert.ok(knowledge.includes(FANTASY_JOBS.find(j => j.id === 'cook')!.names[locale]));
    assert.ok(knowledge.includes('123'));
  }
});
test('named life work selects that career while generic work retains the combat career', () => {
  for (const locale of ['ko', 'en', 'ja'] as const) {
    const p = person('cook');
    const named = fantasyGmReply(p, 'work as cook', locale).suggestions.find(s => s.action?.type === 'work');
    assert.deepEqual(named?.action, { type: 'work', career: 'life' });
    assert.ok(named?.label.includes(FANTASY_JOBS.find(j => j.id === 'cook')!.names[locale]));
    const generic = fantasyGmReply(p, 'work', locale).suggestions.find(s => s.action?.type === 'work');
    assert.deepEqual(generic?.action, { type: 'work' });
    assert.ok(generic?.label.includes(FANTASY_JOBS.find(j => j.id === 'warrior')!.names[locale]));
  }
});
