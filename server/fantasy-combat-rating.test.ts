import test from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import { FantasyStore } from './fantasy-store.ts';
import { fantasyCombatPlayer } from './fantasy-combat-adapter.ts';
import { fantasyCombatPower, fantasyRegularEncounterTier } from '../shared/fantasy-adventurer.ts';
import { applyFantasyAction, fantasyStats, newFantasyProfile } from '../shared/fantasy-engine.ts';
import { assessFantasyGuildProfile } from './fantasy-guild-assessment.ts';
import { recordFantasyGuildCompletions } from './fantasy-guild-progression.ts';
import { fantasyRegisteredGuildGrade, fantasyCanRegisterGuild } from '../shared/fantasy-guild-progression.ts';
import { fantasyRankBenefits, fantasyRankBenefitActionError, fantasyRankBenefitGrade, fantasyRankBenefitEscortBonus } from '../shared/fantasy-rank-benefits.ts';
import { fantasyRankBookEligible } from '../shared/fantasy-rank-rewards.ts';
import { fantasyPrice } from '../shared/fantasy-reputation.ts';
import { FANTASY_QUESTS, FANTASY_JOBS } from '../shared/fantasy-data.ts';
import { handleFantasyNpcRankBenefits } from './npc-rank-benefits.ts';
import { FantasyConversationActions } from './fantasy-conversation-actions.ts';
import { NPC_PUBLIC } from '../shared/npc.ts';

function priestProfile() {
 const p=applyFantasyAction(newFantasyProfile(),{type:'create',source:'human',name:'Temple',gender:'female'},()=>.5).profile;
 Object.assign(p.character!,{job:'priest',lifeJob:'cook',hour:108,location:'hearth'});p.character!.jobXp.priest=100;p.character!.jobXp.cook=0;
 p.character!.hp=Math.min(p.character!.hp,fantasyStats(p.character!).hp);p.character!.mp=Math.min(p.character!.mp,fantasyStats(p.character!).mp);
 return p;
}

test('priests cannot register or promote at the adventurer guild',()=>{
 const p=priestProfile(),before=structuredClone(p),result=assessFantasyGuildProfile(p,108);
 assert.equal(result.error,'guild:profession');assert.equal(result.changed,false);assert.deepEqual(result.profile,before);assert.deepEqual(p,before);
 p.character!.guildProgress={version:1,grade:5,completedAtGrade:5,creditedQuests:[]};
 assert.equal(assessFantasyGuildProfile(p,108).error,'guild:profession');
});

test('a priest keeps historical guild records dormant without adventurer rank, discounts, pay or rewards',()=>{
 const p=priestProfile(),c=p.character!;
 c.guildProgress={version:1,grade:8,completedAtGrade:5,creditedQuests:[]};
 const history=structuredClone(c.guildProgress);
 assert.equal(fantasyRegisteredGuildGrade(c),0);assert.equal(fantasyRankBenefitGrade(c,'adventurer'),0);
 assert.ok(fantasyRankBenefitGrade(c,'priest')>0);assert.ok(fantasyRankBenefits(c,'adventurer').every(b=>!b.unlocked));
 assert.equal(fantasyRankBookEligible(c,'adventurer'),false);assert.equal(fantasyPrice(c,100,'room'),100);
 assert.equal(fantasyRankBenefitEscortBonus(c,100).bonus,0);
 assert.ok(fantasyRankBenefitActionError(c,{type:'rankBenefitClaim',benefit:'guild-title'},'ko'));
 assert.deepEqual(c.guildProgress,history);c.job='warrior';assert.equal(fantasyRegisteredGuildGrade(c),8);
});

test('quest reports do not create guild rank or promotion credit for priests',()=>{
 const p=priestProfile(),q=FANTASY_QUESTS.find(q=>q.id==='quest-herbalist')!;assert.ok(q);
 p.character!.quests=[q.id];const after=structuredClone(p);after.character!.quests=[];after.character!.completed.push(q.id);
 assert.equal(recordFantasyGuildCompletions(p,after),false);assert.equal(after.character!.guildProgress,undefined);
});

test('a former adventurer can still return borrowed guild equipment as a priest',()=>{
 const c=priestProfile().character!;c.rankBenefits={claims:{},loans:{'guild-rental':{deposit:30,claimedAt:100}}};
 c.inventory['guild-loan-lantern']=1;c.inventory['guild-loan-bedroll']=1;
 assert.equal(fantasyRankBenefitActionError(c,{type:'rankBenefitReturn',benefit:'guild-rental'},'ko'),undefined);
});

test('NPC and GM guild rank answers direct priests to temple ranks in all locales',()=>{
 const p=priestProfile();p.character!.guildProgress={version:1,grade:8,completedAtGrade:5,creditedQuests:[]};
 const guildNpc=NPC_PUBLIC.find(npc=>npc.homeLocation==='hearth'&&npc.building==='guild');assert.ok(guildNpc);
 for(const locale of ['ko','en','ja'] as const){
  const text={ko:'내 모험가 등급과 혜택 알려줘',en:'my adventurer rank benefits',ja:'冒険者等級の特典を教えて'}[locale];
  for(const speaker of ['gm',guildNpc.id]){
   const result=handleFantasyNpcRankBenefits({profile:p,user:'temple-rank',speaker,locale,text},new FantasyConversationActions());
   assert.equal(result.handled,true);assert.match(result.text!,{ko:/신전/,en:/temple/i,ja:/神殿/}[locale]);
   assert.doesNotMatch(result.text!,/마스터|Master|マスター/);
  }
 }
});

test('stored priest guild history cannot bypass rejection before or after reload',t=>{
 const dir=fs.mkdtempSync(path.join(os.tmpdir(),'fantasy-temple-rank-'));t.after(()=>fs.rmSync(dir,{recursive:true,force:true}));
 const file=path.join(dir,'world.json'),p=priestProfile();
 p.character!.guildProgress={version:1,grade:8,completedAtGrade:5,creditedQuests:[]};
 fs.writeFileSync(file,JSON.stringify({u:p}));const errors:unknown[]=[];
 const store=new FantasyStore(file,{worldHour:()=>108,onError:error=>errors.push(error)});assert.equal(store.loadError,undefined);
 const loaded=store.profile('u'),history=structuredClone(loaded.character!.guildProgress);
 assert.equal(fantasyRegisteredGuildGrade(loaded.character!),0);
 const rejected=store.apply('u',loaded.revision,{type:'guildAssess'});assert.equal(rejected.error,'guild:profession');
 assert.equal(store.profile('u').revision,loaded.revision);
 const restored=new FantasyStore(file,{worldHour:()=>108,onError:error=>errors.push(error)}).profile('u');
 assert.equal(fantasyRegisteredGuildGrade(restored.character!),0);assert.deepEqual(restored.character!.guildProgress,history);assert.deepEqual(errors,[]);
});

test('every criminal profession is refused registration and promotion without guild perks or report credit',()=>{
 const jobs=FANTASY_JOBS.filter(job=>job.category==='crime');assert.equal(jobs.length,6);
 for(const job of FANTASY_JOBS)assert.equal(fantasyCanRegisterGuild({job:job.id}),job.id!=='priest'&&job.category!=='crime',job.id);
 for(const job of jobs){
  const p=priestProfile(),c=p.character!;c.job=job.id;c.jobXp[job.id]=100;
  c.hp=Math.min(c.hp,fantasyStats(c).hp);c.mp=Math.min(c.mp,fantasyStats(c).mp);
  assert.equal(assessFantasyGuildProfile(p,108).error,'guild:crime',job.id);
  c.guildProgress={version:1,grade:8,completedAtGrade:5,creditedQuests:[]};const history=structuredClone(c.guildProgress);
  assert.equal(assessFantasyGuildProfile(p,108).error,'guild:crime',job.id);assert.equal(fantasyRegisteredGuildGrade(c),0);
  assert.ok(fantasyRankBenefits(c,'adventurer').every(b=>!b.unlocked));assert.equal(fantasyRankBookEligible(c,'adventurer'),false);
  assert.equal(fantasyPrice(c,100,'room'),100);assert.equal(fantasyRankBenefitEscortBonus(c,100).bonus,0);
  assert.ok(fantasyRankBenefitActionError(c,{type:'rankBenefitClaim',benefit:'guild-title'},'ko'));
  c.quests=['quest-herbalist'];const after=structuredClone(p);after.character!.quests=[];after.character!.completed.push('quest-herbalist');
  assert.equal(recordFantasyGuildCompletions(p,after),false);assert.deepEqual(after.character!.guildProgress,history);
  c.job='warrior';assert.equal(fantasyRegisteredGuildGrade(c),8);
 }
});

test('criminal guild history remains inactive across reload and cannot be promoted through the server',t=>{
 const dir=fs.mkdtempSync(path.join(os.tmpdir(),'fantasy-crime-rank-'));t.after(()=>fs.rmSync(dir,{recursive:true,force:true}));
 for(const job of FANTASY_JOBS.filter(job=>job.category==='crime')){
  const p=priestProfile(),c=p.character!;c.job=job.id;c.jobXp[job.id]=100;c.hp=Math.min(c.hp,fantasyStats(c).hp);c.mp=Math.min(c.mp,fantasyStats(c).mp);
  c.guildProgress={version:1,grade:8,completedAtGrade:5,creditedQuests:[]};
  const file=path.join(dir,job.id+'.json');fs.writeFileSync(file,JSON.stringify({u:p}));const errors:unknown[]=[];
  const options={worldHour:()=>108,onError:(error:unknown)=>errors.push(error)};
  const store=new FantasyStore(file,options);assert.equal(store.loadError,undefined,job.id);const loaded=store.profile('u');
  assert.equal(fantasyRegisteredGuildGrade(loaded.character!),0);assert.equal(store.apply('u',loaded.revision,{type:'guildAssess'}).error,'guild:crime');
  const restored=new FantasyStore(file,options).profile('u');assert.equal(fantasyRegisteredGuildGrade(restored.character!),0);
  assert.deepEqual(restored.character!.guildProgress,c.guildProgress);assert.deepEqual(errors,[]);
 }
});

test('NPC and GM explain criminal guild refusal without offering temple or guild ranks',()=>{
 const guildNpc=NPC_PUBLIC.find(npc=>npc.homeLocation==='hearth'&&npc.building==='guild')!;assert.ok(guildNpc);
 for(const job of FANTASY_JOBS.filter(job=>job.category==='crime'))for(const locale of ['ko','en','ja'] as const){
  const p=priestProfile();p.character!.job=job.id;p.character!.jobXp[job.id]=0;p.character!.guildProgress={version:1,grade:8,completedAtGrade:0,creditedQuests:[]};
  const text={ko:'내 모험가 등급과 혜택 알려줘',en:'my adventurer rank benefits',ja:'冒険者等級の特典を教えて'}[locale];
  for(const speaker of ['gm',guildNpc.id]){
   const result=handleFantasyNpcRankBenefits({profile:p,user:'crime-rank-'+job.id,speaker,locale,text},new FantasyConversationActions());
   assert.equal(result.handled,true);assert.match(result.text!,{ko:/등록.*(?:불가|않|없)|등록할 수/,en:/not|cannot|ineligible/i,ja:/登録.*(?:でき|不可|認め)/}[locale]);
   assert.doesNotMatch(result.text!,/신전|temple|神殿|마스터|Master|マスター/);
  }
 }
});
test('actual guild assessment and world encounter rating use the same spell-aware character power and survive reload',t=>{
  const dir=fs.mkdtempSync(path.join(os.tmpdir(),'fantasy-rating-'));t.after(()=>fs.rmSync(dir,{recursive:true,force:true}));
  const file=path.join(dir,'world.json'),profile=applyFantasyAction(newFantasyProfile(),{type:'create',source:'human',name:'Rating',gender:'female'},()=>.5).profile,c=profile.character!;
  c.job='mage';c.jobXp.mage=300;c.location='hearth';c.hour=108;c.hunger=c.fatigue=0;
  let differs=false;
  for(let level=1;level<=80;level++){
    c.level=level;const max=fantasyStats(c);c.hp=max.hp;c.mp=max.mp;
    const actor=fantasyCombatPlayer(profile,'u');
    if(fantasyRegularEncounterTier(actor.stats,actor)!==fantasyRegularEncounterTier(actor.stats)){differs=true;break;}
  }
  assert.ok(differs,'fixture must distinguish the real spell-aware assessment from the obsolete raw-stat estimate');
  fs.writeFileSync(file,JSON.stringify({u:profile}));
  const errors:unknown[]=[],store=new FantasyStore(file,{worldHour:()=>108,combatEnabled:true,onError:error=>errors.push(error)});
  assert.equal(store.loadError,undefined);const loaded=store.profile('u'),actor=fantasyCombatPlayer(loaded,'u');
  assert.equal(loaded.character!.encounterTier,fantasyRegularEncounterTier(actor.stats,actor));
  const assessed=store.apply('u',loaded.revision,{type:'guildAssess'});assert.equal(assessed.error,undefined);
  assert.equal(assessed.profile.character!.guildAssessment!.score,fantasyCombatPower(actor.stats,actor));
  assert.equal(assessed.profile.character!.guildProgress!.grade,1,'power does not skip the first registered guild rank');
  const restored=new FantasyStore(file,{worldHour:()=>108,combatEnabled:true,onError:error=>errors.push(error)});
  assert.equal(restored.loadError,undefined);assert.deepEqual(restored.profile('u').character!.guildAssessment,assessed.profile.character!.guildAssessment);assert.deepEqual(errors,[]);
});
