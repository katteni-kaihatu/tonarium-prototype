import test from 'node:test';
import assert from 'node:assert/strict';
import { FANTASY_JOBS, FANTASY_QUESTS } from './fantasy-data.ts';
import { applyFantasyAction, newFantasyProfile } from './fantasy-engine.ts';
import { fantasyQuestInstitution, fantasyInstitutionEligible } from './fantasy-institutions.ts';

test('institution claims require the correct current job and actual guild registration',()=>{
 const c=applyFantasyAction(newFantasyProfile(),{type:'create',name:'Sources',gender:'female',source:'human'},()=>.5).profile.character!;
 c.job='warrior';c.lifeJob='cook';assert.equal(fantasyInstitutionEligible(c,'guild'),false);
 c.guildProgress={version:1,grade:1,completedAtGrade:0,creditedQuests:[]};assert.equal(fantasyInstitutionEligible(c,'guild'),true);
 c.job='priest';assert.equal(fantasyInstitutionEligible(c,'guild'),false);assert.equal(fantasyInstitutionEligible(c,'temple'),true);
 for(const job of FANTASY_JOBS.filter(job=>job.category==='crime')){c.job=job.id;assert.equal(fantasyInstitutionEligible(c,'guild'),false);assert.equal(fantasyInstitutionEligible(c,'underworld'),true);assert.equal(fantasyInstitutionEligible(c,'personal'),true);}
});

test('canonical quest institution separates story, clergy, criminal and guild hunts',()=>{
 const q={...FANTASY_QUESTS[0],id:'institution-test',institution:undefined,issuer:undefined,jobs:undefined};
 assert.equal(fantasyQuestInstitution({...q,chapter:1}),'personal');
 assert.equal(fantasyQuestInstitution({...q,jobs:['priest']}),'temple');
 assert.equal(fantasyQuestInstitution({...q,jobs:['thief']}),'underworld');
 assert.equal(fantasyQuestInstitution({...q,id:'guild-hunt-test',jobs:undefined}),'guild');
 assert.equal(fantasyQuestInstitution({...q,institution:'personal',id:'guild-hunt-test'}),'personal');
});
