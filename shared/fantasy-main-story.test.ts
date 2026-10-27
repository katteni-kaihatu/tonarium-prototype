import test from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import type { FantasyCharacter, FantasyMainApproach, FantasyProfile } from './fantasy.ts';
import { FANTASY_LOCATIONS } from './fantasy-data.ts';
import { FANTASY_MAIN_QUESTS, FANTASY_MAIN_REVEALS } from './fantasy-second-content.ts';
import { applyFantasyAction, fantasyStats, newFantasyProfile } from './fantasy-engine.ts';
import { fantasyMainApproachStat, fantasyMainProgress, fantasyMainReady, fantasyMainStage, fantasyMainTrial, validFantasyMainTrials } from './fantasy-main-trials.ts';
import { fantasyGmKnowledge } from './fantasy-gm-knowledge.ts';
import { fantasyTermName } from './fantasy-lore.ts';
import { fantasyContractIssuer } from './fantasy-contracts.ts';
import { recordFantasyDeath } from './fantasy-mortality.ts';
import { NPC_PUBLIC } from './npc.ts';
import { npcAllowedFacts } from '../server/npc.ts';
import { FantasyStore } from '../server/fantasy-store.ts';

const mains = [...FANTASY_MAIN_QUESTS].sort((a,b)=>a.chapter!-b.chapter!);
const totalXp = (c: FantasyCharacter) => 15*c.level*(c.level-1)+c.xp;
const visit = (c: FantasyCharacter, location: string) => { c.location=location; if(!c.visited.includes(location))c.visited.push(location); };
const fresh = () => {
  const p=applyFantasyAction(newFantasyProfile(),{type:'create',name:'Story traveler',gender:'female',source:'human'},()=>.5).profile;
  p.character!.visited=FANTASY_LOCATIONS.map(place=>place.id);
  p.character!.gold=5000;p.character!.inventory.lantern=1;
  return p;
};
function investigate(profile: FantasyProfile, questId: string, approach: FantasyMainApproach='observe') {
  const c=profile.character!,trial=fantasyMainTrial(questId)!,stage=fantasyMainStage(c,questId)!;
  assert.ok(stage,questId);c.level=Math.max(c.level,trial.recommendedLevel);
  visit(c,stage.location);c.hunger=0;c.fatigue=0;c.hp=fantasyStats(c).hp;c.mp=fantasyStats(c).mp;
  const before=fantasyMainProgress(c,questId),result=applyFantasyAction(profile,{type:'investigate',quest:questId,approach},()=>.999);
  assert.equal(result.changed,true,result.error??questId);assert.equal(fantasyMainProgress(result.profile.character!,questId),before+1);
  assert.ok(validFantasyMainTrials(result.profile.character!));
  return result.profile;
}

test('all eighteen chapters have coherent local stages, growing difficulty and unrestricted basic approaches',()=>{
  assert.equal(mains.length,18);
  let priorDc=0,priorLevel=0;
  for(const [index,quest] of mains.entries()){
    const trial=fantasyMainTrial(quest.id)!;
    assert.ok(trial);assert.equal(trial.chapter,index+1);
    assert.equal(trial.stages.length,index<6?2:3);
    assert.equal(quest.races,undefined);assert.equal(quest.families,undefined);assert.equal(quest.jobs,undefined);assert.equal(quest.seasons,undefined);
    if(index)assert.ok(quest.requiresCompleted?.includes(mains[index-1].id));
    assert.ok(trial.recommendedLevel>=priorLevel);assert.ok(trial.stages[0].dc>=priorDc);
    priorLevel=trial.recommendedLevel;priorDc=trial.stages[0].dc;
    const ordinary=fantasyStats(fresh().character!);
    assert.equal(ordinary.dexterity,undefined);assert.equal(ordinary.charisma,undefined);
    for(const [step,stage] of trial.stages.entries()){
      assert.equal(stage.location,step===trial.stages.length-1?(quest.reportAt??quest.giver):quest.destination);
      assert.ok(FANTASY_LOCATIONS.some(place=>place.id===stage.location));assert.equal(stage.hours,.5);
      assert.equal(stage.dc,trial.stages[0].dc+step);
      for(const locale of ['ko','en','ja'] as const)assert.ok(stage.labels[locale].length>5);
      for(const approach of ['observe','analyze','restore'] as const){const stat=fantasyMainApproachStat(ordinary,stage,approach);assert.equal(typeof ordinary[stat],'number',`${quest.id}/${approach}`);}
    }
    if([2,12].includes(index+1))assert.ok(trial.stages.every(stage=>stage.kind==='archive'));
  }
  assert.ok(priorDc>=29);assert.ok(priorLevel>=15);
});

test('the full eighteen-chapter story requires fresh investigations and grants each chapter and its evidence exactly once',()=>{
  let p=fresh();
  for(const [index,quest] of mains.entries()){
    const c=p.character!;visit(c,quest.giver);c.inventory[quest.item]=quest.count;
    const next=mains[index+1];
    if(next){visit(c,next.giver);const denied=applyFantasyAction(p,{type:'accept',quest:next.id},()=>.5);assert.equal(denied.changed,false,next.id);visit(c,quest.giver);}
    const accepted=applyFantasyAction(p,{type:'accept',quest:quest.id},()=>.5);assert.equal(accepted.changed,true,accepted.error??quest.id);p=accepted.profile;
    assert.equal(fantasyMainProgress(p.character!,quest.id),0);
    assert.equal(applyFantasyAction(p,{type:'complete',quest:quest.id},()=>.999).changed,false,'previsited sites and shop goods are insufficient');
    let count=0;
    while(!fantasyMainReady(p.character!,quest.id)){
      p=investigate(p,quest.id,(['observe','analyze','restore'] as const)[count++%3]);
      const knowledge=fantasyGmKnowledge(p,'en'),npc=npcAllowedFacts('rin','trusted',{completedQuests:p.character!.completed}).join('\n');
      for(const future of FANTASY_MAIN_REVEALS.filter(fact=>!p.character!.completed.includes(fact.questId))){assert.ok(!knowledge.includes(future.text.en),future.id);assert.ok(!npc.includes(future.text.en),future.id);}
    }
    const before=p.character!;visit(before,quest.reportAt??quest.giver);
    const itemCount=before.inventory[quest.item],gold=before.gold;
    const completed=applyFantasyAction(p,{type:'complete',quest:quest.id},()=>.5);assert.equal(completed.changed,true,completed.error??quest.id);p=completed.profile;
    assert.deepEqual(p.character!.completed,mains.slice(0,index+1).map(value=>value.id));
    assert.equal(p.character!.inventory[quest.item],itemCount-quest.count);assert.ok(p.character!.gold>=gold+quest.gold);
    assert.ok(fantasyGmKnowledge(p,'en').includes(FANTASY_MAIN_REVEALS.find(fact=>fact.questId===quest.id)!.text.en));
    const balance=p.character!.gold,xp=totalXp(p.character!);
    assert.equal(applyFantasyAction(p,{type:'complete',quest:quest.id},()=>.999).changed,false);
    assert.equal(applyFantasyAction(p,{type:'investigate',quest:quest.id,approach:'analyze'},()=>.999).changed,false);
    assert.equal(p.character!.gold,balance);assert.equal(totalXp(p.character!),xp);
  }
  assert.ok(validFantasyMainTrials(p.character!));assert.equal(p.character!.job,'unassigned');assert.equal(p.character!.race,'human');
  assert.ok(p.character!.voyageEnding);assert.equal(p.character!.location,'beyond-dawn-isle');
});

test('unaccepted and out-of-order investigation cannot create evidence or rewards',()=>{
  const quest=mains[0];let p=fresh();visit(p.character!,quest.destination);
  const original=structuredClone(p);
  assert.equal(applyFantasyAction(p,{type:'investigate',quest:quest.id,approach:'observe'},()=>.999).changed,false);assert.deepEqual(p,original);
  visit(p.character!,quest.giver);p=applyFantasyAction(p,{type:'accept',quest:quest.id},()=>.5).profile;
  const before=structuredClone(p);
  assert.equal(applyFantasyAction(p,{type:'investigate',quest:quest.id,approach:'restore'},()=>.999).changed,false);assert.deepEqual(p,before);
  p=investigate(p,quest.id);
  assert.equal(applyFantasyAction(p,{type:'investigate',quest:quest.id,approach:'observe'},()=>.999).changed,false);
  assert.equal(fantasyMainProgress(p.character!,quest.id),1);
});

test('abandoning and reaccepting preserves clues without farming investigation XP or replaying completed stages',()=>{
  const quest=mains[0];let p=fresh();p=applyFantasyAction(p,{type:'accept',quest:quest.id},()=>.5).profile;p=investigate(p,quest.id);
  const originalAcceptedAt=p.character!.mainTrials![quest.id].acceptedAt,xp=totalXp(p.character!);
  visit(p.character!,quest.giver);p=applyFantasyAction(p,{type:'abandon',quest:quest.id},()=>.5).profile;
  assert.equal(fantasyMainProgress(p.character!,quest.id),1);assert.ok(validFantasyMainTrials(p.character!));
  assert.equal(applyFantasyAction(p,{type:'investigate',quest:quest.id,approach:'observe'},()=>.999).changed,false);
  p=applyFantasyAction(p,{type:'accept',quest:quest.id},()=>.5).profile;
  assert.equal(totalXp(p.character!),xp);assert.equal(fantasyMainProgress(p.character!,quest.id),1);assert.equal(p.character!.mainTrials![quest.id].acceptedAt,originalAcceptedAt);
  visit(p.character!,quest.destination);assert.equal(applyFantasyAction(p,{type:'investigate',quest:quest.id,approach:'observe'},()=>.999).changed,false);assert.equal(totalXp(p.character!),xp);
  p=investigate(p,quest.id);const completeXp=totalXp(p.character!);
  p=applyFantasyAction(p,{type:'abandon',quest:quest.id},()=>.5).profile;p=applyFantasyAction(p,{type:'accept',quest:quest.id},()=>.5).profile;
  assert.ok(fantasyMainReady(p.character!,quest.id));assert.equal(totalXp(p.character!),completeXp);
  assert.equal(applyFantasyAction(p,{type:'investigate',quest:quest.id,approach:'analyze'},()=>.999).changed,false);
});

test('a new life inherits the public legacy but does not inherit the old life investigation proofs',()=>{
  let p=fresh();p=applyFantasyAction(p,{type:'accept',quest:mains[0].id},()=>.5).profile;p=investigate(p,mains[0].id);
  assert.ok(p.character!.mainTrials);visit(p.character!,'oldwatch');recordFantasyDeath(p,'Story regression fixture');
  p=applyFantasyAction(p,{type:'rebirth'},()=>.5).profile;assert.equal(p.character,null);assert.equal(p.pastLives!.length,1);
  p=applyFantasyAction(p,{type:'create',name:'Next life',gender:'male',source:'human'},()=>.5).profile;
  assert.equal(p.character!.mainTrials,undefined);assert.equal(fantasyMainProgress(p.character!,mains[0].id),0);assert.equal(p.character!.completed.length,0);
});

test('legacy low-level completed and accepted chapters reload intact without retroactive investigation or level gates',t=>{
  const dir=fs.mkdtempSync(path.join(os.tmpdir(),'fantasy-main-story-'));t.after(()=>{assert.equal(path.dirname(path.resolve(dir)),path.resolve(os.tmpdir()));assert.ok(path.basename(dir).startsWith('fantasy-main-story-'));fs.rmSync(dir,{recursive:true,force:true});});
  const file=path.join(dir,'fixture.json'),completed=fresh(),accepted=fresh(),chapter13=mains[12];
  for(const p of [completed,accepted]){p.character!.completed=mains.slice(0,12).map(quest=>quest.id);visit(p.character!,chapter13.giver);p.character!.inventory[chapter13.item]=chapter13.count;}
  accepted.character!.quests.push(chapter13.id);fs.writeFileSync(file,JSON.stringify({completed,accepted}));
  const store=new FantasyStore(file,{onError:error=>{throw error;}});assert.equal(store.loadError,undefined);
  assert.deepEqual(store.profile('completed').character!.completed,completed.character!.completed);
  assert.equal(store.profile('accepted').character!.level,1);assert.equal(fantasyMainProgress(store.profile('accepted').character!,chapter13.id),0);
  const start=store.apply('completed',completed.revision,{type:'accept',quest:chapter13.id},()=>.5);assert.equal(start.changed,true,start.error??chapter13.id);
  const pending=store.profile('accepted');assert.equal(store.apply('accepted',pending.revision,{type:'complete',quest:chapter13.id},()=>.5).changed,false);
  const reload=new FantasyStore(file,{onError:error=>{throw error;}});assert.equal(reload.loadError,undefined);assert.equal(reload.profile('completed').character!.completed.length,12);
});

test('every earned lead names the actual next local issuer in all three languages',()=>{
  for(const [index,quest] of mains.entries()){
    const reveal=FANTASY_MAIN_REVEALS.find(fact=>fact.questId===quest.id)!;assert.ok(reveal);
    const next=mains[index+1];if(!next)continue;
    const issuer=NPC_PUBLIC.find(npc=>npc.id===fantasyContractIssuer(next))!;assert.ok(issuer);assert.equal(issuer.homeLocation,next.giver);
    for(const locale of ['ko','en','ja'] as const){assert.ok(reveal.text[locale].includes(issuer.name[locale]),`${quest.id}: next issuer ${locale}`);assert.ok(reveal.text[locale].includes(fantasyTermName(next.giver,locale)),`${quest.id}: next location ${locale}`);}
  }
});
