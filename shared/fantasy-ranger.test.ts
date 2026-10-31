import test from 'node:test';
import assert from 'node:assert/strict';
import { FANTASY_JOBS, FANTASY_EVENTS, FANTASY_ITEMS } from './fantasy-data.ts';
import { applyFantasyAction, newFantasyProfile, fantasySkills } from './fantasy-engine.ts';
import { canAcquireJob } from './fantasy-town.ts';
import { fantasySkillName } from './fantasy-skill-names.ts';
import { fantasyCombatStat } from './fantasy-equipment.ts';
import { FANTASY_COMBAT_CAPABILITIES, fantasyCombatSkillRole } from './fantasy-combat-capabilities.ts';
import { FANTASY_JOB_PATHS, applyFantasyJobPath, fantasyJobPathCombatSkill, fantasyJobPathError, fantasyJobPathSkills } from './fantasy-job-paths.ts';
import { FANTASY_JOB_DISCOVERY_BOOKS, fantasyJobPathDiscovered } from './fantasy-job-discovery.ts';
import { FANTASY_READABLE_LIBRARY_BOOKS } from './fantasy-library.ts';
import { fantasyAvailableJobSkills, validFantasyProgression } from './fantasy-progression.ts';
import { fantasyCombatPlayer, fantasyCombatProfessionUsesCombat } from '../server/fantasy-combat-adapter.ts';
const fresh=()=>applyFantasyAction(newFantasyProfile(),{type:'create',name:'길을 읽는 이',gender:'female',source:'human'},()=>.5).profile;
test('ranger is a distinct guild-acquired agility profession with localized tracking, trap and bow skills',()=>{
 const ranger=FANTASY_JOBS.find(job=>job.id==='ranger');assert.ok(ranger);
 assert.deepEqual(ranger.names,{ko:'레인저',en:'Ranger',ja:'レンジャー'});assert.equal(ranger.category,'ordinary');assert.equal(ranger.stat,'agility');
 assert.ok(ranger.skills.filter(skill=>skill.kind==='passive').length>=4);assert.ok(ranger.skills.filter(skill=>skill.kind==='active').length>=4);
 for(const skill of ranger.skills)for(const locale of ['ko','en','ja'] as const){assert.ok(skill.names?.[locale]);assert.ok(skill.descriptions?.[locale]);assert.equal(fantasySkillName(skill,locale),skill.names![locale]);}
 assert.ok(ranger.skills.some(skill=>skill.kind==='passive'&&skill.stat==='intelligence'));
 assert.ok(ranger.skills.some(skill=>skill.kind==='active'&&skill.utility==='root'));
 const p=fresh();assert.equal(canAcquireJob(p.character!,'ranger','guild'),true);
 const acquired=applyFantasyAction(p,{type:'job',job:'ranger',via:'guild'},()=>.999);assert.equal(acquired.error,undefined);assert.equal(acquired.profile.character!.job,'ranger');
 const events=FANTASY_EVENTS.filter(event=>event.job==='ranger');assert.equal(events.length,3);
 for(const event of events)for(const locale of ['ko','en','ja'] as const){assert.ok(event.names?.[locale]);assert.ok(event.descriptions?.[locale]);for(const choice of event.choices){assert.ok(choice.labels?.[locale]);assert.ok(choice.successes?.[locale]);assert.ok(choice.failures?.[locale]);}}
});
test('all four ranger paths require their discovered library book and yield real ranged combat arts',()=>{
 const ranger=FANTASY_JOBS.find(job=>job.id==='ranger');assert.ok(ranger);
 const paths=FANTASY_JOB_PATHS.filter(path=>path.job==='ranger');assert.equal(paths.length,4);
 assert.deepEqual(paths.map(path=>path.id),['ranger-tracker','ranger-traps','ranger-marksman','ranger-warden']);
 for(const path of paths){const c=fresh().character!;c.job='ranger';c.jobXp.ranger=1000;c.hour=100;c.gold=5000;c.practice={explore:10};c.skillXp=Object.fromEntries(ranger.skills.map(skill=>[skill.id,30]));c.readBooks=[];
  assert.equal(fantasyJobPathDiscovered(c,path.id),false);assert.ok(fantasyJobPathError(c,path.id));
  const book=FANTASY_JOB_DISCOVERY_BOOKS[path.id];assert.ok(FANTASY_READABLE_LIBRARY_BOOKS.some(value=>value.id===book));
  c.readBooks=FANTASY_READABLE_LIBRARY_BOOKS.map(value=>value.id);assert.equal(fantasyJobPathError(c,path.id),undefined);
  assert.equal(applyFantasyJobPath(c,path.id).error,undefined);assert.equal(fantasyJobPathSkills(c).length,2);
  const art=fantasyJobPathCombatSkill(`path-${path.id}-art`);assert.ok(art);assert.equal(art.kind,path.id==='ranger-warden'?'guard':'attack');if(art.kind==='attack')assert.equal(art.range,'ranged');
  for(const locale of ['ko','en','ja'] as const){assert.ok(path.names[locale]);assert.ok(path.fields[locale]);}
 }
});
test('ranger bow combat uses agility and owned skills, then profession changes hide those skills without erasing practice',()=>{
 const ranger=FANTASY_JOBS.find(job=>job.id==='ranger');assert.ok(ranger);const p=fresh(),c=p.character!;c.job='ranger';c.jobXp.ranger=1000;c.readBooks=FANTASY_READABLE_LIBRARY_BOOKS.map(book=>book.id);c.practice={explore:10};c.skillXp=Object.fromEntries(ranger.skills.map(skill=>[skill.id,30]));
 const bow=FANTASY_ITEMS.find(item=>item.equipment?.slot==='weapon'&&item.id.includes('bow'))!;assert.ok(bow);c.inventory[bow.id]=1;c.equipment={weapon:bow.id};
 assert.equal(fantasyCombatStat(c),'agility');assert.equal(fantasyCombatProfessionUsesCombat('ranger'),true);const fighter=fantasyCombatPlayer(p,'ranger-player');assert.equal(fighter.range,'ranged');assert.equal(fighter.attackDamageType,'pierce');const shot=fighter.skills.find(skill=>skill.id==='ranger-aim');assert.ok(shot);assert.equal(shot.kind,'attack');assert.equal(shot.range,'ranged');assert.equal(shot.magic,false);
 const aim=ranger.skills.find(skill=>skill.id==='ranger-aim')!;assert.equal(fantasyCombatSkillRole(aim,'job','ranger')?.kind,'attack');assert.ok(FANTASY_COMBAT_CAPABILITIES.some(cap=>cap.id===aim.id&&cap.owner==='ranger'&&cap.mode==='attack'));
 assert.ok(fantasySkills(c).some(skill=>skill.id==='ranger-aim'));assert.ok(fantasyAvailableJobSkills(c).some(skill=>skill.id==='job-ranger-advanced-2'));assert.equal(validFantasyProgression(c),true);
 const xp=structuredClone(c.skillXp);c.job='hunter';c.jobXp.hunter=0;assert.ok(!fantasySkills(c).some(skill=>skill.id.includes('ranger')));assert.deepEqual(c.skillXp,xp);c.job='ranger';assert.ok(fantasySkills(c).some(skill=>skill.id==='ranger-aim'));
});
