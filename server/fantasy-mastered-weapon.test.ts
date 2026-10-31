import test from 'node:test';
import assert from 'node:assert/strict';
import { createBenchmarkProfile } from '../scripts/fantasy-balance-fixtures.ts';
import { fantasyCombatPlayer } from './fantasy-combat-adapter.ts';
import { createFantasyCombat, submitFantasyCombatOrder } from '../shared/fantasy-combat.ts';
import { fantasyCombatSkillSummary } from '../shared/fantasy-combat-preview.ts';

function trained(job:'archer'|'knight',xp:number){
 const profile=createBenchmarkProfile('human',job,'fine',40,1500,'full');
 const id=job==='archer'?'tech-archer-piercing':'tech-knight-shieldbreak';
 profile.character!.skillXp![id]=xp;
 const player=fantasyCombatPlayer(profile,'reference');
 return {profile,player,skill:player.skills.find(skill=>skill.id===id)!};
}

test('mastered piercing and shieldbreaking expose finite, nonstacking weakness after practice',()=>{
 for(const job of ['archer','knight']as const){
  const before=trained(job,199),after=trained(job,200);
  assert.ok(before.skill&&after.skill);
  assert.deepEqual(after.skill.hitUtility,{id:'vulnerable',power:6,chance:1});
  assert.notDeepEqual(before.skill.hitUtility,after.skill.hitUtility);
  for(const key of ['mp','range','reach','shape','secondaryDamage']as const)assert.equal(after.skill[key],before.skill[key]);
  assert.deepEqual(after.player.stats,before.player.stats);
 }
});

test('mastered weakness produces actual extra damage and does not stack its power',()=>{
 let checked=false;
 for(let seed=1;seed<=50&&!checked;seed++){
  const {player,skill}=trained('archer',200);
  const initial=createFantasyCombat({id:'mastery-test',location:'sunmeadow',source:'apex:monster-obsidian-guardian',players:[player],enemies:[{id:'foe',template:'monster-obsidian-guardian'}],seed,hour:108,tactical:true});
  const hit=submitFantasyCombatOrder(initial,'reference',initial.revision,{type:'skill',skill:skill.id,target:'foe'},108);
  assert.equal(hit.error,undefined);const state=hit.state,foe=state.fighters.find(f=>f.id==='foe')!;
  if(!foe.conditions?.some(c=>c.id==='vulnerable'&&c.power===6))continue;
  const control=structuredClone(state);control.fighters.find(f=>f.id==='foe')!.conditions=[];
  const attack={type:'attack' as const,target:'foe'};
  const enhanced=submitFantasyCombatOrder(state,'reference',state.revision,attack,state.hour);
  const ordinary=submitFantasyCombatOrder(control,'reference',control.revision,attack,control.hour);
  assert.equal(enhanced.error,undefined);assert.equal(ordinary.error,undefined);
  const markedHP=enhanced.state.fighters.find(f=>f.id==='foe')!.hp,plainHP=ordinary.state.fighters.find(f=>f.id==='foe')!.hp;
  if(markedHP===plainHP)continue;
  assert.ok(markedHP<plainHP);
  const repeated=submitFantasyCombatOrder(state,'reference',state.revision,{type:'skill',skill:skill.id,target:'foe'},state.hour);
  assert.equal(repeated.error,undefined);
  assert.ok(repeated.state.fighters.find(f=>f.id==='foe')!.conditions!.filter(c=>c.id==='vulnerable').every(c=>c.power===6));
  checked=true;
 }
 assert.ok(checked,'a deterministic pair must demonstrate the real follow-up benefit');
});

test('mastered job techniques disappear on profession change without losing practice',()=>{
 const {profile,skill}=trained('archer',200);profile.character!.job='cook';
 assert.equal(fantasyCombatPlayer(profile,'reference').skills.some(s=>s.id===skill.id),false);
 assert.equal(profile.character!.skillXp![skill.id],200);
});

test('mastered combat details display real damage percentages in all three languages',()=>{
 for(const job of ['archer','knight']as const)for(const locale of ['ko','en','ja']as const){
  const {skill}=trained(job,200);const text=fantasyCombatSkillSummary(skill,locale);
  assert.ok(text.includes('15%'));assert.ok(text.includes('3'));
 }
});

test('practiced warrior charge gains limited protective utility without changing novice attacks',()=>{
 const profile=createBenchmarkProfile('human','warrior','fine',40,1500,'full');
 const id='tech-warrior-charge';
 profile.character!.skillXp![id]=199;
 const novice=fantasyCombatPlayer(profile,'reference').skills.find(s=>s.id===id)!;
 profile.character!.skillXp![id]=200;
 const player=fantasyCombatPlayer(profile,'reference'),master=player.skills.find(s=>s.id===id)!;
 assert.deepEqual(novice.hitUtility,{id:'weaken',power:2,chance:.4});
 assert.equal(master.hitUtility?.id,'weaken');
 assert.ok(master.hitUtility!.power>novice.hitUtility!.power);
 assert.ok(master.hitUtility!.chance>novice.hitUtility!.chance&&master.hitUtility!.chance<1);
 for(const key of ['mp','power','range','reach','shape','motion']as const)assert.deepEqual(master[key],novice[key]);
 let protectedAlly=false;
 for(let seed=1;seed<=50&&!protectedAlly;seed++){
  const state=createFantasyCombat({id:'charge-protection',location:'sunmeadow',source:'apex:charge-test',players:[player],enemies:[{id:'foe',template:'monster-forest-wolf'}],seed,hour:108,tactical:true});
  state.fighters[0].tile={x:2,y:3};state.fighters[1].tile={x:4,y:3};state.fighters[1].hp=state.fighters[1].stats.hp=2000;
  // 高級防具による最小ダメージの丸めを避ける。
  state.fighters[1].stats.attack=180;
  const charged=submitFantasyCombatOrder(state,'reference',state.revision,{type:'skill',skill:id,target:'foe'},108);
  assert.equal(charged.error,undefined);
  const weakened=charged.state.fighters[1].conditions?.find(c=>c.id==='weaken');
  if(!weakened||weakened.power<=novice.hitUtility!.power)continue;
  assert.ok(weakened.turns>0&&weakened.turns<=3);
  let marked=charged.state,control=structuredClone(marked);control.fighters[1].conditions=[];
  for(let turn=0;turn<2;turn++){
   const guarded=submitFantasyCombatOrder(marked,'reference',marked.revision,{type:'guard'},108);
   const ordinary=submitFantasyCombatOrder(control,'reference',control.revision,{type:'guard'},108);
   assert.equal(guarded.error,undefined);assert.equal(ordinary.error,undefined);
   marked=guarded.state;control=ordinary.state;
   protectedAlly ||= marked.fighters[0].hp>control.fighters[0].hp;
  }
 }
 assert.ok(protectedAlly,'mastered charge must reduce an actual follow-up hit');
});
