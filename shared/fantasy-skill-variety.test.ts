import{fantasyNpcMentorSkills,fantasyApprenticeshipError}from'./fantasy-apprenticeship.ts';
import{NPC_PUBLIC}from'./npc.ts';
import test from 'node:test';
import assert from 'node:assert/strict';
import { FANTASY_JOBS, FANTASY_RACES } from './fantasy-data.ts';
import { FANTASY_SKILL_UTILITIES, fantasyJobSkillVariety, fantasyRaceSkillVariety } from './fantasy-skill-variety.ts';
import { fantasyAvailableJobSkills, fantasySkillUnlocked, validFantasyProgression } from './fantasy-progression.ts';
import { applyFantasyAction, newFantasyProfile } from './fantasy-engine.ts';

function veteran(job: string) {
  const p = applyFantasyAction(newFantasyProfile(), { type: 'create', source: 'human', name: 'Variety', gender: 'female' }, () => .5).profile, c = p.character!;
  c.job = job; c.jobXp[job] = 1000; c.skillXp = Object.fromEntries(FANTASY_JOBS.flatMap(job => job.skills.map(skill => [skill.id, 1000])));
  c.readBooks = ['traveler-guide', 'advanced-mana-forms', 'mana-primer', 'remedies-and-rites', 'martial-practice'];
  c.unlockedSkills = FANTASY_JOBS.flatMap(job => job.skills.filter(skill => skill.unlock?.kind === 'mentor').map(skill => skill.id)); c.practice = { explore: 1000, craft: 1000, gather: 1000, hunt: 1000, fish: 1000, command: 1000 }; return c;
}
test('mage and priest retain four foundations alongside the mage ultimate while old skill ids and XP remain valid saved records', () => {
  for (const job of ['mage', 'priest']) {
    const c = veteran(job), catalog = FANTASY_JOBS.find(entry => entry.id === job)!.skills;
    assert.equal(catalog.filter(skill => !skill.retired && !skill.id.startsWith('ultimate-')).length, 4);
    const expected = job === 'mage' ? 5 : 4;
    assert.equal(catalog.filter(skill => !skill.retired).length, expected);
    assert.equal(fantasyAvailableJobSkills(c).length, expected); assert.ok(validFantasyProgression(c));
    for (const skill of catalog.filter(skill => skill.retired)) assert.equal(fantasySkillUnlocked(c, skill), false);
    assert.ok(catalog.some(skill => skill.restore === 'mp' && !skill.retired));
  }
});
test('every other profession gains distinct advanced active utilities without changing foundations, MP restoration or unlock conditions', () => {
  for (const job of FANTASY_JOBS.filter(job => !['unassigned', 'mage', 'priest'].includes(job.id))) {
    const advanced = job.skills.filter(skill => skill.kind === 'active' && skill.id.startsWith(`job-${job.id}-advanced-`) && skill.restore !== 'mp');
    assert.ok(advanced.length >= 3, job.id); assert.equal(new Set(advanced.map(skill => skill.utility)).size, advanced.length, job.id);
    for (const skill of advanced) {
      assert.ok(FANTASY_SKILL_UTILITIES.some(utility => utility.id === skill.utility)); assert.ok(skill.unlock); assert.equal(skill.retired, undefined);
      for (const locale of ['ko', 'en', 'ja'] as const) { assert.ok(skill.names?.[locale]); assert.ok(skill.descriptions?.[locale]); }
      assert.equal(skill.diceFaces, undefined);
    }
    for (const skill of job.skills.filter(skill => !skill.id.startsWith(`job-${job.id}-advanced-`))) assert.equal(skill.utility, undefined);
  }
  assert.equal(FANTASY_JOBS.find(job => job.id === 'bard')!.skills.find(skill => skill.id === 'job-bard-advanced-6')!.restore, 'mp');
});
test('utility catalog contains genuine friendly and hostile effects with fixed localized behavior', () => {
  assert.equal(FANTASY_SKILL_UTILITIES.length, 12); assert.equal(new Set(FANTASY_SKILL_UTILITIES.map(entry => entry.id)).size, 12);
  assert.equal(FANTASY_SKILL_UTILITIES.filter(entry => entry.target === 'ally').length, 6);
  for (const utility of FANTASY_SKILL_UTILITIES) for (const locale of ['ko', 'en', 'ja'] as const) { assert.ok(utility.names[locale]); assert.ok(utility.descriptions[locale]); }
});
test('mappers preserve unknown skills and human racial foundations while adapting fitting nonhuman actions', () => {
  const human = FANTASY_RACES.find(race => race.id === 'human')!, sample = human.skills[1];
  assert.deepEqual(fantasyRaceSkillVariety(human, sample), sample);
  assert.deepEqual(fantasyJobSkillVariety({ id: 'missing', names: human.names }, sample), sample);
  const dragon = FANTASY_RACES.find(race => race.id === 'dragonblood')!;
  assert.equal(fantasyRaceSkillVariety(dragon, dragon.skills[1]).utility, 'vulnerable');
});

test('legacy racial skill names obtain their authored KO/EN names before utility labels are appended', () => {
  const skill = FANTASY_RACES.find(race => race.id === 'elf')!.skills[1];
  assert.ok(!/[ぁ-ゟ゠-ヿ一-龯]/u.test(skill.names!.ko)); assert.ok(!/[ぁ-ゟ゠-ヿ一-龯]/u.test(skill.names!.en));
});


test('retired caster arts cannot be offered or sold by a profession mentor',()=>{
  for(const job of ['mage','priest']){
    const npc=NPC_PUBLIC.find(npc=>npc.trainableJobs?.includes(job))!,p=applyFantasyAction(newFantasyProfile(),{type:'create',source:'human',gender:'female',name:'Mentor test'},()=>.5).profile,c=p.character!;
    c.job=job;c.jobXp[job]=1000;c.location=npc.homeLocation;c.gold=100;
    assert.ok(fantasyNpcMentorSkills(npc.id,c).every(skill=>!skill.retired));
    for(const skill of FANTASY_JOBS.find(entry=>entry.id===job)!.skills.filter(skill=>skill.retired&&skill.unlock?.kind==='mentor'))assert.ok(fantasyApprenticeshipError(c,npc.id,skill.id));
  }
});
