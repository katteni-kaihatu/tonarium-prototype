import test from 'node:test';
import assert from 'node:assert/strict';
import { applyFantasyAction, newFantasyProfile, startFantasyActivity, advanceFantasyWorld, fantasySkills, fantasyStats } from './fantasy-engine.ts';
import { FANTASY_JOBS, FANTASY_RECIPES } from './fantasy-data.ts';
import { FANTASY_READABLE_LIBRARY_BOOKS } from './fantasy-library.ts';
import { FANTASY_JOB_PATHS, FANTASY_JOB_PATH_CHANGE_COST, FANTASY_JOB_PATH_CHANGE_COOLDOWN, fantasyJobPathError, applyFantasyJobPath, validFantasyJobPaths, fantasyJobPathSkills, fantasyIsJobPathSkill, fantasyJobPathText, fantasyJobPathHours, fantasyJobPathCombatSkill, fantasyJobPathCombatPassive } from './fantasy-job-paths.ts';
import type { FantasyCharacter } from './fantasy.ts';

function prepared(job = 'mage') {
  const p = applyFantasyAction(newFantasyProfile(), { type: 'create', name: '전문 분야 검증', gender: 'female', source: 'human' }, () => .999).profile;
  const c = p.character!, data = FANTASY_JOBS.find(entry => entry.id === job)!;
  c.job = job; c.jobXp[job] = 1000; c.hour = 100; c.gold = 1000;
  c.readBooks = FANTASY_READABLE_LIBRARY_BOOKS.map(book => book.id);
  c.unlockedSkills = data.skills.filter(skill => skill.unlock?.kind === 'mentor').map(skill => skill.id);
  c.skillXp = Object.fromEntries(data.skills.map(skill => [skill.id, 30]));
  c.practice = { explore: 10, craft: 10, gather: 10, hunt: 10, fish: 10, command: 10 };
  return p;
}

test('all 36 eligible jobs have exactly their 145 translated candidate paths and priest stays separate', () => {
  assert.equal(FANTASY_JOB_PATHS.length, 145); assert.equal(new Set(FANTASY_JOB_PATHS.map(path => path.id)).size, 145);
  const jobs = FANTASY_JOBS.filter(job => job.id !== 'priest' && job.category !== 'none'); assert.equal(jobs.length, 36);
  for (const job of jobs) {
    const paths = FANTASY_JOB_PATHS.filter(path => path.job === job.id); assert.equal(paths.length, job.id === 'mage' ? 5 : 4);
    for (const path of paths) { assert.deepEqual(Object.keys(path).sort(), ['fields', 'id', 'job', 'names']); for (const locale of ['ko', 'en', 'ja'] as const) { assert.ok(path.names[locale]); assert.ok(path.fields[locale]); } }
  }
  assert.equal(FANTASY_JOB_PATHS.some(path => path.job === 'priest' || path.job === 'unemployed'), false);
  assert.deepEqual(FANTASY_JOB_PATHS.filter(path => path.job === 'mage').map(path => path.names.ko), ['별마법사', '화염술사', '빙결술사', '대지술사', '바람술사']);
});
test('every path can be earned through its actual base job and yields exactly one passive and one active', () => {
  for (const path of FANTASY_JOB_PATHS) {
    const c = prepared(path.job).character!;
    assert.equal(fantasyJobPathError(c, path.id), undefined, path.id);
    const before = c.gold; assert.equal(applyFantasyJobPath(c, path.id).error, undefined, path.id);
    assert.equal(c.gold, before); assert.equal(c.job, path.job); assert.equal(c.jobXp[path.job], 1000); assert.equal(validFantasyJobPaths(c), true);
    const skills = fantasyJobPathSkills(c); assert.equal(skills.length, 2); assert.equal(skills[0].kind, 'passive'); assert.equal(skills[0].power, 1); assert.equal(skills[0].mp, 0);
    assert.equal(skills[1].kind, 'active'); assert.ok(skills[1].mp > 0); assert.ok(skills[1].descriptions?.ko); assert.equal(fantasyIsJobPathSkill(skills[1].id), true);
    if (skills[0].stat) assert.equal(typeof fantasyStats(c)[skills[0].stat], 'number');
    assert.equal(fantasyIsJobPathSkill(skills[0].id), true);
  }
});
test('base job and high profession practice alone never unlock the required additional skill', () => {
  for (const job of FANTASY_JOBS.filter(job => job.id !== 'priest' && job.category !== 'none')) {
    const c = prepared(job.id).character!; c.readBooks = []; c.skillXp = {}; c.unlockedSkills = []; c.practice = {};
    for (const path of FANTASY_JOB_PATHS.filter(path => path.job === job.id)) {
      assert.ok(fantasyJobPathError(c, path.id), path.id); const before = structuredClone(c); assert.ok(applyFantasyJobPath(c, path.id).error); assert.deepEqual(c, before);
    }
  }
});
test('book, real usage, field practice and mentor evidence remain distinct eligibility sources', () => {
  const p = prepared(), c = p.character!;
  const star = FANTASY_JOB_PATHS.find(path => path.id === 'mage-star')!, flame = FANTASY_JOB_PATHS.find(path => path.id === 'mage-flame')!, ice = FANTASY_JOB_PATHS.find(path => path.id === 'mage-ice')!, earth = FANTASY_JOB_PATHS.find(path => path.id === 'mage-earth')!;
  c.skillXp = {}; assert.ok(fantasyJobPathError(c, star.id)); assert.equal(fantasyJobPathError(c, flame.id), undefined);
  c.readBooks = c.readBooks!.filter(book => book !== 'mana-primer'); assert.ok(fantasyJobPathError(c, flame.id)); assert.equal(fantasyJobPathError(c, ice.id), undefined);
  c.practice = {}; assert.ok(fantasyJobPathError(c, ice.id)); assert.equal(fantasyJobPathError(c, earth.id), undefined);
  c.unlockedSkills = []; assert.ok(fantasyJobPathError(c, earth.id));
});
test('low practice, wrong job, unknown path, priest and incapacitated characters are rejected without costs', () => {
  for (const mutate of [(c: FantasyCharacter) => { c.jobXp.mage = 99; }, (c: FantasyCharacter) => { c.hp = 0; }, (c: FantasyCharacter) => { c.job = 'warrior'; }, (c: FantasyCharacter) => { c.job = 'priest'; }]) {
    const c = prepared().character!; mutate(c); const before = structuredClone(c); assert.ok(applyFantasyJobPath(c, 'mage-star').error); assert.deepEqual(c, before);
  }
  assert.ok(applyFantasyJobPath(prepared().character!, 'invented-path').error);
});
test('first selection is free and changes preserve practice while charging once after the wait', () => {
  const c = prepared().character!, beforeXp = structuredClone(c.jobXp);
  assert.equal(applyFantasyJobPath(c, 'mage-star').error, undefined); assert.equal(c.gold, 1000);
  const first = structuredClone(c); assert.ok(applyFantasyJobPath(c, 'mage-flame').error); assert.deepEqual(c, first);
  c.hour += FANTASY_JOB_PATH_CHANGE_COOLDOWN; c.gold = FANTASY_JOB_PATH_CHANGE_COST - 1;
  const poor = structuredClone(c); assert.ok(applyFantasyJobPath(c, 'mage-flame').error); assert.deepEqual(c, poor);
  c.gold = 1000; assert.equal(applyFantasyJobPath(c, 'mage-flame').error, undefined); assert.equal(c.gold, 900); assert.equal(c.jobPaths!.mage.path, 'mage-flame'); assert.deepEqual(c.jobXp, beforeXp);
  const final = structuredClone(c); assert.ok(applyFantasyJobPath(c, 'mage-flame').error); assert.deepEqual(c, final); assert.equal(fantasyJobPathSkills(c).length, 2);
});
test('switching base professions deactivates the old path and restores only that job’s saved path', () => {
  const c = prepared('mage').character!; applyFantasyJobPath(c, 'mage-star');
  const mageSkill = fantasyJobPathSkills(c)[0].id;
  const warrior = prepared('warrior').character!;
  c.job = 'warrior'; Object.assign(c.jobXp, warrior.jobXp); Object.assign(c.skillXp!, warrior.skillXp); c.unlockedSkills!.push(...warrior.unlockedSkills!);
  assert.equal(fantasyJobPathSkills(c).length, 0); assert.equal(applyFantasyJobPath(c, 'warrior-greatsword').error, undefined); assert.equal(Object.keys(c.jobPaths!).length, 2);
  assert.equal(fantasyJobPathSkills(c).length, 2); assert.notEqual(fantasyJobPathSkills(c)[0].id, mageSkill);
  c.job = 'mage'; assert.equal(fantasyJobPathSkills(c)[0].id, mageSkill); assert.equal(validFantasyJobPaths(c), true);
});
test('path records reject cross-job choices, fabricated eligibility, future clocks and extra fields', () => {
  const c = prepared().character!; applyFantasyJobPath(c, 'mage-star'); assert.equal(validFantasyJobPaths(c), true);
  for (const mutate of [(copy: FantasyCharacter) => { copy.jobPaths!.warrior = copy.jobPaths!.mage; }, (copy: FantasyCharacter) => { copy.jobPaths!.mage.path = 'fake'; },
    (copy: FantasyCharacter) => { copy.jobPaths!.mage.hour = 101; }, (copy: FantasyCharacter) => { (copy.jobPaths!.mage as unknown as Record<string, unknown>).power = 999; },
    (copy: FantasyCharacter) => { copy.skillXp = {}; }, (copy: FantasyCharacter) => { copy.jobPaths!.mage.hour = Number.NaN; }]) {
    const copy = structuredClone(c); mutate(copy); assert.equal(validFantasyJobPaths(copy), false);
  }
});
test('passive snapshots cannot mutate the catalog and previous path abilities never stack', () => {
  const c = prepared().character!; applyFantasyJobPath(c, 'mage-star');
  const skills = fantasyJobPathSkills(c); skills[0].power = 999; skills[0].names!.ko = 'forged';
  assert.equal(fantasyJobPathSkills(c)[0].power, 1); assert.notEqual(fantasyJobPathSkills(c)[0].names!.ko, 'forged');
  c.hour += 24; applyFantasyJobPath(c, 'mage-flame'); assert.equal(fantasyJobPathSkills(c).length, 2);
  assert.equal(fantasyIsJobPathSkill('path-unknown-insight'), false);
});
test('public errors and records never reveal an exact requirement or its skill ID', () => {
  const c = prepared().character!; c.skillXp = {}; c.readBooks = []; c.unlockedSkills = []; c.practice = {};
  for (const locale of ['ko', 'en', 'ja'] as const) {
    const error = fantasyJobPathError(c, 'mage-star', locale)!; assert.ok(error); assert.doesNotMatch(error, /100|advanced-|숙련|스킬|技術|技能|skill|book|도서|mentor/i);
    assert.equal(fantasyJobPathText(error, locale), error); assert.ok(fantasyJobPathText('jobpath:advance:mage-star:0', locale));
  }
  assert.equal(fantasyJobPathHours(), 1); assert.equal(JSON.stringify(FANTASY_JOB_PATHS).includes('advanced-'), false);
});
test('engine reserves advancement and applies only the selected path after the shared deadline', () => {
  const p = prepared(), gold = p.character!.gold, started = startFantasyActivity(p, { type: 'advanceJob', path: 'mage-star' }, p.character!.hour, () => .999);
  assert.equal(started.error, undefined); assert.equal(started.profile.activity?.endsAt, 101); assert.equal(started.profile.character!.jobPaths, undefined);
  assert.equal(advanceFantasyWorld(started.profile, 100.99).profile.character!.jobPaths, undefined);
  const done = advanceFantasyWorld(started.profile, 101).profile; assert.equal(done.activity, undefined); assert.equal(done.character!.jobPaths!.mage.path, 'mage-star'); assert.equal(done.character!.gold, gold);
  assert.equal(fantasySkills(done.character!).filter(skill => skill.id.startsWith('path-')).length, 2);
});
test('all 290 specialization skills have distinct characterful names in all three languages', () => {
  const names: Record<string, string[]> = { ko: [], en: [], ja: [] };
  for (const path of FANTASY_JOB_PATHS) {
    const c = prepared(path.job).character!; applyFantasyJobPath(c, path.id);
    for (const skill of fantasyJobPathSkills(c)) for (const locale of ['ko', 'en', 'ja'] as const) {
      assert.ok(skill.names![locale]); assert.ok(skill.descriptions![locale]); assert.notEqual(skill.names![locale], path.names[locale]);
      names[locale].push(skill.names![locale]);
    }
  }
  for (const [locale, values] of Object.entries(names)) assert.equal(new Set(values).size, 290, locale);
});
test('field skills use real work effects while combat metadata stays bounded and independent', () => {
  const combatJobs = new Set(['adventurer', 'hunter', 'bard', 'mage', 'leader', 'warrior', 'knight', 'spearfighter', 'archer', 'scout', 'pugilist', 'spellblade', 'shieldbearer', 'summoner', 'thief', 'smuggler', 'assassin', 'bandit', 'spy', 'crimeboss']);
  for (const path of FANTASY_JOB_PATHS) {
    const c = prepared(path.job).character!; applyFantasyJobPath(c, path.id); const [passive, active] = fantasyJobPathSkills(c);
    const meta = fantasyJobPathCombatSkill(active.id), bonus = fantasyJobPathCombatPassive(passive.id);
    if (!combatJobs.has(path.job)) { assert.equal(meta, undefined); assert.equal(bonus, undefined); assert.ok(['check', 'heal', 'guard', 'reward', 'travel'].includes(active.effect)); continue; }
    assert.ok(meta); assert.ok(bonus); assert.ok(meta.mp >= 5); assert.ok(meta.power <= 14); assert.equal(Object.keys(bonus).length, 1);
    if (meta.onHit) { assert.equal(meta.onHit.turns, 3); assert.equal(meta.onHit.power, 1); assert.ok(meta.onHit.chance <= .35); }
    assert.equal(fantasyJobPathCombatSkill(active.id, active.power + 999)!.power, meta.power + 3);
    if (meta.onHit) { meta.onHit.power = 999; assert.equal(fantasyJobPathCombatSkill(active.id)!.onHit!.power, 1); }
  }
  assert.equal(fantasyJobPathCombatSkill('path-mage-invented-art'), undefined);
  assert.equal(fantasyJobPathCombatSkill('path-mage-flame-art')!.onHit!.id, 'burn');
  assert.equal(fantasyJobPathCombatSkill('path-mage-ice-art')!.onHit!.id, 'frost');
  assert.equal(fantasyJobPathCombatSkill('path-assassin-poison-art')!.onHit!.id, 'poison');
});
test('preparing a field art grants no practice until its buff is actually used and cannot be spammed', () => {
  let p = prepared('carpenter'); applyFantasyJobPath(p.character!, 'carpenter-bowyer'); const skill = fantasyJobPathSkills(p.character!)[1];
  const before = p.character!.skillXp?.[skill.id] ?? 0, started = applyFantasyAction(p, { type: 'skill', skill: skill.id });
  assert.equal(started.error, undefined); assert.equal(started.profile.character!.skillXp?.[skill.id] ?? 0, before); assert.equal(started.profile.character!.buff!.skill, skill.id);
  const duplicate = applyFantasyAction(started.profile, { type: 'skill', skill: skill.id }); assert.ok(duplicate.error); assert.equal(duplicate.changed, false);
  p = started.profile; p.character!.location = 'tidehaven'; p.character!.inventory.lantern = 1;
  const recipe = FANTASY_RECIPES.find(recipe => recipe.job === 'carpenter')!; assert.ok(recipe);
  for (const [item, count] of Object.entries(recipe.inputs)) p.character!.inventory[item] = count + 5;
  const used = applyFantasyAction(p, { type: 'craft', recipe: recipe.id }, () => .999);
  assert.equal(used.error, undefined); assert.equal(used.profile.character!.buff, null);
  assert.ok((used.profile.character!.skillXp?.[skill.id] ?? 0) > before);
});
test('old and unselected branch active IDs cannot be used to gain free mana or skills', () => {
  const p = prepared(); applyFantasyJobPath(p.character!, 'mage-star'); const old = fantasyJobPathSkills(p.character!)[1].id;
  p.character!.hour += 24; applyFantasyJobPath(p.character!, 'mage-flame'); const before = structuredClone(p);
  const result = applyFantasyAction(p, { type: 'skill', skill: old }); assert.ok(result.error); assert.deepEqual(result.profile, before);
  const notSelected = applyFantasyAction(p, { type: 'skill', skill: 'path-mage-wind-art' }); assert.ok(notSelected.error);
});
test('learned skill descriptions and combat metadata track bounded mastery growth', () => {
  const c = prepared().character!; applyFantasyJobPath(c, 'mage-star'); const [passive, active] = fantasyJobPathSkills(c);
  c.skillXp![passive.id] = 100; c.skillXp![active.id] = 50;
  const learned = fantasyJobPathSkills(c), effective = fantasySkills(c);
  assert.ok(learned[0].descriptions!.ko.includes('명중 +2'));
  const trained = effective.find(skill => skill.id === active.id)!;
  const combat = fantasyJobPathCombatSkill(active.id, trained.power)!;
  assert.ok(learned[1].descriptions!.ko.includes(`공격 보정 +${combat.power}`));
  assert.equal(trained.power, active.power + 1); assert.equal(combat.power, fantasyJobPathCombatSkill(active.id)!.power + 1);
});
