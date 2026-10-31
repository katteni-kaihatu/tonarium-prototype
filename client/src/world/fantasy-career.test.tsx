import test from 'node:test';
import assert from 'node:assert/strict';
import { createElement } from 'react';
import { renderToStaticMarkup } from 'react-dom/server';
import type { FantasyProfile } from '../../../shared/fantasy.ts';
import type { NpcLocale } from '../../../shared/npc.ts';
import { FANTASY_JOBS } from '../../../shared/fantasy-data.ts';
import { FANTASY_READABLE_LIBRARY_BOOKS } from '../../../shared/fantasy-library.ts';
import { applyFantasyAction, fantasySkills, newFantasyProfile } from '../../../shared/fantasy-engine.ts';
import { FANTASY_JOB_PATHS, fantasyJobPathError, fantasyJobPathSkills } from '../../../shared/fantasy-job-paths.ts';
import { FANTASY_PRIEST_BRANCHES, FANTASY_PRIEST_PATH_SKILLS, fantasyPriestActionError, syncFantasyPriestGrowth, validFantasyPriestGrowth } from '../../../shared/fantasy-priest-growth.ts';
import { applyFantasyPrayer } from '../../../shared/fantasy-prayer.ts';
import { fantasyCombatPlayer } from '../../../server/fantasy-combat-adapter.ts';
import { createFantasyCombat } from '../../../shared/fantasy-combat.ts';
import { FANTASY_JOB_DISCOVERY_BOOKS, fantasyJobPathDiscovered } from '../../../shared/fantasy-job-discovery.ts';
import { fantasyGmKnowledge } from '../../../shared/fantasy-gm-knowledge.ts';
import { FantasyCareerPanel } from './FantasyCareerPanel.tsx';
import { FantasyGuildAssessment } from './FantasyGuildAssessment.tsx';
import { FantasyRankBenefits } from './FantasyRankBenefits.tsx';
import { fantasyIsLifeJob } from '../../../shared/fantasy-careers.ts';
import { FantasyFishingPanel } from './FantasyFieldActions.tsx';
import { FantasyInteriorMapSurvey } from './FantasyInteriorMaps.tsx';
import { FantasyPriestPanel } from './FantasyPriestPanel.tsx';
import { FantasyCombatPanel } from './FantasyCombatPanel.tsx';
import { setLocale } from '../locale.ts';
import { set } from '../store.ts';

const react = require('react') as typeof import('react');
const originalSnapshot = react.useSyncExternalStore, originalState = react.useState;
react.useSyncExternalStore = (subscribe, snapshot) => originalSnapshot(subscribe, snapshot, snapshot);
let stateOverrides: unknown[] = [];
react.useState = ((initial: unknown) => originalState(stateOverrides.length ? stateOverrides.shift() : initial)) as typeof react.useState;
const locales = ['ko', 'en', 'ja'] as const;
const offers = FANTASY_JOBS.filter(job => job.category !== 'none').map(job => ({ job: job.id, via: 'guild' as const }));
function player(job = 'mage'): FantasyProfile {
  const p = applyFantasyAction(newFantasyProfile(), { type: 'create', source: 'human', name: 'Career QA', gender: 'female' }, () => .5).profile;
  const c = p.character!; c.job = job; c.jobXp[job] = 0; c.hour = 108; c.location = 'hearth'; c.visited = ['hearth']; return p;
}
function render(p: FantasyProfile, locale: NpcLocale, changing = false, blocked = false) {
  setLocale(locale); set({ fantasyProfile: p, fantasyPending: blocked, wsConnected: true }); stateOverrides = [changing];
  const html = renderToStaticMarkup(createElement(FantasyCareerPanel, { c: p.character!, offers, onAction: () => {}, blocked })); stateOverrides = []; return html;
}
function experienced(job = 'mage') {
  const p = player(job), c = p.character!; c.jobXp[job] = 1000;
  c.readBooks = FANTASY_READABLE_LIBRARY_BOOKS.map(book => book.id);
  c.unlockedSkills = FANTASY_JOBS.flatMap(job => job.skills.filter(skill => skill.unlock?.kind === 'mentor').map(skill => skill.id));
  c.practice = { explore: 1000, craft: 1000, gather: 1000, hunt: 1000, fish: 1000, command: 1000 };
  c.skillXp = Object.fromEntries(FANTASY_JOBS.flatMap(job => job.skills.map(skill => [skill.id, 1000])));
  return p;
}
function readyPriest() {
  let p = player('priest'); const c = p.character!; c.hour = 12; c.jobXp.priest = 30;
  c.visited = ['hearth', 'suncourt', 'greenwood']; c.readBooks = ['traveler-guide', 'remedies-and-rites', 'quiet-sword', 'words-and-promises']; c.quests = ['quest-herbalist']; c.inventory.herb = 3;
  p = applyFantasyAction(p, { type: 'priestVow', quest: 'quest-herbalist' }).profile; p = applyFantasyAction(p, { type: 'complete', quest: 'quest-herbalist' }).profile;
  for (let day = 1; day <= 4; day++) { p.character!.hour = day * 24; applyFantasyPrayer(p.character!); }
  p.character!.hour+=12;return p;
}
const forbiddenHelp = /숙련\s*30|신앙\s*45|성소\s*2곳|이행한 서약\s*1건|같은 봉사·책·성소|기도만으로는 분기|Requires priest practice|practice 30|faith 45|2 sanctuaries|Each service, book, sanctuary|司祭熟練30|信仰45|聖所2か所|同じ奉仕・本・聖所/;

function slotMarkup(html: string, slot: 'combat' | 'life') {
  const start = html.indexOf(`data-career-slot="${slot}"`);
  return slot === 'combat' ? html.slice(start, html.indexOf('data-career-slot="life"')) : html.slice(start);
}
test('each existing profession hides alternatives in its own slot while the second career can be chosen independently', () => {
  for (const locale of locales) for (const job of FANTASY_JOBS.filter(job => job.category !== 'none')) {
    const html = render(player(job.id), locale);
    assert.ok(html.includes(job.names[locale]), `${locale}/${job.id} is not the current profession`);
    const own = slotMarkup(html, fantasyIsLifeJob(job.id) ? 'life' : 'combat');
    assert.ok(!own.includes('fr-career-offers'), `${locale}/${job.id} renders alternatives before opt-in`);
    assert.ok(html.includes('fr-career-offers'), `${locale}/${job.id} must allow choosing the second career`);
    assert.ok(html.includes('fr-career-change'));
    assert.ok(!forbiddenHelp.test(html), `${locale}/${job.id} exposes advancement requirements`);
  }
});

test('an unassigned traveler sees base-job choices immediately and no profession-change toggle', () => {
  for (const locale of locales) {
    const html = render(player('unassigned'), locale);
    assert.ok(html.includes('fr-career-offers')); assert.ok(!html.includes('fr-career-change')); assert.ok(!html.includes('fr-advancement'));
    for (const id of ['mage', 'warrior', 'cook', 'merchant']) assert.ok(html.includes(FANTASY_JOBS.find(job => job.id === id)!.names[locale]));
  }
});

test('profession-change controls expand the matching slot without replacing the other career', () => {
  for (const locale of locales) {
    const p = player('mage'); p.character!.lifeJob = 'cook';
    const closed = render(p, locale), open = render(p, locale, true);
    assert.ok(!closed.includes('fr-career-offers')); assert.ok(open.includes('fr-career-offers'));
    assert.ok(open.indexOf('fr-career-offers') < open.indexOf('fr-career-change'));
    assert.ok(open.includes(FANTASY_JOBS.find(job => job.id === 'cook')!.names[locale]));
    assert.ok(slotMarkup(open, 'combat').includes({ ko: '직업 변경 닫기', en: 'Close profession change', ja: '職業変更を閉じる' }[locale]));
    assert.ok(!slotMarkup(open, 'life').includes('fr-career-offers'));
    assert.ok(slotMarkup(closed, 'life').includes({ ko: '서브직업으로 일하기', en: 'Work in your secondary profession', ja: '副職で働く' }[locale]));
  }
});

test('blocked career controls remain disabled and reveal no different profession through disabled markup', () => {
  for (const locale of locales) {
    const p = player('mage'); p.character!.lifeJob = 'cook';
    const html = render(p, locale, false, true), buttons = [...html.matchAll(/<button\b([^>]*)>/g)];
    assert.ok(buttons.length > 0); assert.ok(buttons.every(button => /\bdisabled/.test(button[1]))); assert.ok(!html.includes('fr-career-offers'));
  }
});

test('combat and life specializations use their own records and the life work control remains available', () => {
  for (const locale of locales) {
    const p = experienced('warrior'), c = p.character!; c.lifeJob = 'tailor'; c.jobXp.tailor = 1000;
    const html = render(p, locale), combat = slotMarkup(html, 'combat'), life = slotMarkup(html, 'life');
    assert.ok(combat.includes(FANTASY_JOBS.find(job => job.id === 'warrior')!.names[locale]));
    assert.ok(life.includes(FANTASY_JOBS.find(job => job.id === 'tailor')!.names[locale]));
    for (const path of FANTASY_JOB_PATHS.filter(path => path.job === 'tailor')) assert.ok(life.includes(path.names[locale]));
    assert.ok(life.includes({ ko: '서브직업으로 일하기', en: 'Work in your secondary profession', ja: '副職で働く' }[locale]));
    assert.ok(!combat.includes('data-career-slot="life"'));
  }
});

test('fishing and scribe survey controls remain visible with an independent combat profession', () => {
  for (const locale of locales) {
    const p = player('warrior'), c = p.character!; c.lifeJob = 'fisher'; c.location = 'tidehaven';
    setLocale(locale); set({ fantasyProfile: p, wsConnected: true }); stateOverrides = [];
    const fishing = renderToStaticMarkup(createElement(FantasyFishingPanel, { c, blocked: false, onAction: () => {} }));
    assert.ok(fishing.includes({ ko: '부두 낚시', en: 'Pier fishing', ja: '桟橋釣り' }[locale]));
    c.lifeJob = 'scribe'; c.jobPaths = { scribe: { path: 'scribe-maps', hour: c.hour } };
    const survey = renderToStaticMarkup(createElement(FantasyInteriorMapSurvey, { c, blocked: false, onAction: () => {} }));
    assert.ok(survey.includes({ ko: '내부 지도 기록', en: 'Record an interior map', ja: '内部図を記録' }[locale]));
  }
});

test('priest records contain personal scores but no help paragraph or advancement formula, including tooltips', () => {
  for (const locale of locales) {
    const p = player('priest'); syncFantasyPriestGrowth(p.character!); setLocale(locale); set({ fantasyProfile: p, fantasyPending: false, wsConnected: true });
    const html = renderToStaticMarkup(createElement(FantasyPriestPanel, { profile: p, onAction: () => {} }));
    assert.ok(html.includes({ ko: '신앙 기록', en: 'Faith record', ja: '信仰の記録' }[locale]));
    assert.ok(!forbiddenHelp.test(html)); assert.ok(!/requirements|t\.hint|숙련\s*30|practice 30|熟練30/.test(html));
    const error = fantasyPriestActionError(p.character!, { type: 'priestBranch', branch: 'care' }, locale)!;
    assert.ok(error); assert.ok(!/\d/.test(error)); assert.ok(!forbiddenHelp.test(error));
  }
});

test('locked specialization descriptions and errors never reveal exact mastery or prerequisite skill IDs', () => {
  for (const locale of locales) for (const job of FANTASY_JOBS.filter(job => job.category !== 'none' && job.id !== 'priest')) {
    const p = player(job.id); p.character!.readBooks = FANTASY_READABLE_LIBRARY_BOOKS.map(book => book.id); const html = render(p, locale);
    for (const path of FANTASY_JOB_PATHS.filter(path => path.job === job.id)) {
      assert.equal(html.includes(path.names[locale]),path.id!=='mage-star');
      const error = fantasyJobPathError(p.character!, path.id, locale)!; assert.ok(error); assert.ok(!/\d/.test(error));
    }
    assert.ok(!/requiredSkill|threshold|REQUIREMENTS|job-[a-z]+-advanced-[0-9]|숙련\s*100|practice 100|熟練100/.test(html));
  }
});

test('only a chosen specialization grants its skill and earlier mastery does not activate another path', () => {
  const p = experienced(), c = p.character!, paths = FANTASY_JOB_PATHS.filter(path => path.job === 'mage');
  assert.equal(paths.length, 5); c.jobPaths = { mage: { path: paths[0].id, hour: c.hour } };
  const chosen = fantasyJobPathSkills(c); assert.equal(chosen.length, 2); assert.equal(chosen.filter(skill => skill.kind === 'passive').length, 1); assert.equal(chosen.filter(skill => skill.kind === 'active').length, 1);
  for (const path of paths.slice(1)) c.skillXp![`path-${path.id}-insight`] = 500;
  assert.deepEqual(fantasySkills(c).filter(skill => skill.id.startsWith('path-')).map(skill => skill.id), chosen.map(skill => skill.id));
  const base = fantasySkills(c).find(skill => skill.id === chosen[0].id)!.power;
  c.skillXp![chosen[0].id] = 200; assert.ok(fantasySkills(c).find(skill => skill.id === chosen[0].id)!.power > base);
  c.job = 'merchant'; assert.equal(fantasySkills(c).filter(skill => skill.id.startsWith('path-')).length, 0);
  c.job = 'mage'; assert.equal(fantasyJobPathSkills(c)[0].id, chosen[0].id);
});

test('GM knowledge reports only personal path skills and never imports secret advancement prerequisites', () => {
  for (const locale of locales) {
    const p = experienced(), paths = FANTASY_JOB_PATHS.filter(path => path.job === 'mage'); p.character!.jobPaths = { mage: { path: paths[0].id, hour: p.character!.hour } };
    const chosen = fantasyJobPathSkills(p.character!)[0], knowledge = fantasyGmKnowledge(p, locale);
    assert.ok(knowledge.includes(chosen.names![locale]));
    for (const path of paths.slice(1)) assert.ok(!knowledge.includes(`path-${path.id}-insight`));
    assert.ok(!/requiredSkill|threshold\s*[:=]\s*\d|REQUIREMENTS|job-mage-advanced-[0-9]|숙련\s*100(?!\d).*필요|practice 100(?!\d).*require|熟練100(?!\d).*必要/.test(knowledge));
    const priest = player('priest'); syncFantasyPriestGrowth(priest.character!); const priestKnowledge = fantasyGmKnowledge(priest, locale);
    assert.ok(!forbiddenHelp.test(priestKnowledge));
  }
});

test('all four base priest branches show only their learned combat arts in Korean, English and Japanese', () => {
  const active = { care: 'priest-care-mercy', ward: 'priest-ward-aegis', oath: 'priest-oath-clarity', pilgrim: 'priest-pilgrim-lantern' } as const;
  for (const locale of locales) for (const branch of Object.keys(active) as (keyof typeof active)[]) {
    let p = readyPriest(); const result = applyFantasyAction(p, { type: 'priestBranch', branch }); assert.equal(result.error, undefined); p = result.profile;
    const state = createFantasyCombat({ id: 'priest-career-ui', source: 'hunt:monster-forest-wolf', location: 'greenwood', players: [fantasyCombatPlayer(p, 'priest')], enemies: [{ id: 'enemy', template: 'monster-forest-wolf' }], seed: 1, hour: p.character!.hour, tactical: true });
    setLocale(locale); set({ selfId: 'priest', fantasyProfile: p, fantasyCombat: state, fantasyCombatPending: false, fantasyPending: false, fantasyCombatError: null, wsConnected: true });
    stateOverrides = ['skill', active[branch], '', '', undefined];
    const html = renderToStaticMarkup(createElement(FantasyCombatPanel, { profile: p })); stateOverrides = [];
    const current = FANTASY_PRIEST_PATH_SKILLS.find(skill => skill.id === active[branch])!;
    assert.ok(html.includes(current.names![locale]));
    const learned = FANTASY_PRIEST_PATH_SKILLS.filter(skill => skill.kind === 'active' && skill.id.startsWith(`priest-${branch}-`));
    const combatSkills = state.fighters.find(fighter => fighter.userId === 'priest')!.skills;
    assert.deepEqual(combatSkills.filter(skill => FANTASY_PRIEST_PATH_SKILLS.some(pathSkill => pathSkill.id === skill.id)).map(skill => skill.id).sort(), learned.map(skill => skill.id).sort());
    for (const skill of FANTASY_PRIEST_PATH_SKILLS.filter(skill => skill.kind === 'active')) {
      if (learned.some(entry => entry.id === skill.id)) assert.ok(html.includes(`<b>${skill.names![locale]}</b>`), `${locale}/${branch} omits ${skill.id}`);
      else assert.ok(!html.includes(skill.names![locale]), `${locale}/${branch} exposes ${skill.id}`);
    }
    assert.ok(!forbiddenHelp.test(html));
  }
});

test('priest discovery physically omits unknown branches and keeps an existing path without its clue book', () => {
  for (const locale of locales) {
    const p = player('priest'); p.character!.readBooks = [];
    let html = render(p, locale);
    for (const branch of FANTASY_PRIEST_BRANCHES) assert.ok(!html.includes(branch.names[locale]));
    p.character!.readBooks = ['quiet-sword']; html = render(p, locale);
    for (const branch of FANTASY_PRIEST_BRANCHES) assert.equal(html.includes(branch.names[locale]), branch.id === 'ward');
    const old = applyFantasyAction(readyPriest(), { type: 'priestBranch', branch: 'ward' }).profile;
    old.character!.readBooks = ['traveler-guide']; old.character!.priestGrowth!.doctrine = ['traveler-guide'];
    assert.equal(validFantasyPriestGrowth(old.character!), true); html = render(old, locale);
    assert.ok(html.includes(FANTASY_PRIEST_BRANCHES.find(branch => branch.id === 'ward')!.names[locale]));
    assert.ok(!html.includes(FANTASY_PRIEST_BRANCHES.find(branch => branch.id === 'care')!.names[locale]));
    assert.ok(!forbiddenHelp.test(html));
  }
});

test('generic career discovery omits unread specialties from the DOM and reveals only completed-book discoveries', () => {
  const paths = FANTASY_JOB_PATHS.filter(path => path.job === 'mage');
  for (const locale of locales) {
    const p = player('mage'); p.character!.readBooks = [];
    let html = render(p, locale); for (const path of paths) assert.ok(!html.includes(path.names[locale]));
    p.character!.readBooks = [FANTASY_JOB_DISCOVERY_BOOKS[paths[0].id]];
    html = render(p, locale); for (const path of paths) assert.equal(html.includes(path.names[locale]), fantasyJobPathDiscovered(p.character!, path.id));
    const old = experienced('mage'); old.character!.jobPaths = { mage: { path: paths[0].id, hour: old.character!.hour } }; old.character!.readBooks = [];
    html = render(old, locale); assert.ok(html.includes(paths[0].names[locale])); for (const path of paths.slice(1)) assert.ok(!html.includes(path.names[locale]));
    assert.ok(!/requiredSkill|threshold\s*[:=]\s*\d|job-mage-advanced-[0-9]/.test(html));
  }
});

test('priests and criminals have no adventurer rank panels but can return a former guild loan in every locale',()=>{
 for(const locale of locales)for(const job of ['priest',...FANTASY_JOBS.filter(job=>job.category==='crime').map(job=>job.id)]){
  const p=player(job),c=p.character!;c.guildProgress={version:1,grade:8,completedAtGrade:5,creditedQuests:[]};
  setLocale(locale);set({fantasyProfile:p,fantasyPending:false,wsConnected:true});stateOverrides=[];
  assert.equal(renderToStaticMarkup(createElement(FantasyGuildAssessment,{c,blocked:false,onAction:()=>{}})),'');
  assert.equal(renderToStaticMarkup(createElement(FantasyRankBenefits,{c,source:'adventurer',blocked:false,onAction:()=>{}})),'');
  c.rankBenefits={claims:{},loans:{'guild-rental':{deposit:30,claimedAt:c.hour}}};c.inventory['guild-loan-lantern']=1;c.inventory['guild-loan-bedroll']=1;
  const html=renderToStaticMarkup(createElement(FantasyRankBenefits,{c,source:'adventurer',blocked:false,onAction:()=>{}}));
  assert.ok(html.includes({ko:'장비 반환',en:'Return equipment',ja:'道具を返す'}[locale]));assert.ok(!/마스터|Master|マスター/.test(html));
 }
});

test.after(() => { react.useSyncExternalStore = originalSnapshot; react.useState = originalState; });
