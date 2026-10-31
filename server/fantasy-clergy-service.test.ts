import test from 'node:test';
import assert from 'node:assert/strict';
import { applyFantasyAction, newFantasyProfile } from '../shared/fantasy-engine.ts';
import { createFantasyCombat, type FantasyCombatState } from '../shared/fantasy-combat.ts';
import { fantasyCombatPlayer } from './fantasy-combat-adapter.ts';
import { fantasyPriestGrowthStatus, validFantasyPriestGrowth } from '../shared/fantasy-priest-growth.ts';
import { recordFantasyClergyCombatService } from './fantasy-clergy-service.ts';
function fixture(id='service-battle',hour=12){
 const profile=applyFantasyAction(newFantasyProfile(),{type:'create',source:'human',gender:'female',name:'司祭'},()=>.99).profile;
 profile.character!.job='priest';profile.character!.hour=hour;
 const priest=fantasyCombatPlayer(profile,'priest'),ally={...structuredClone(priest),id:'ally',userId:'ally',vocation:{job:'warrior'}};
 const state=createFantasyCombat({id,source:'hunt:monster-forest-wolf',location:profile.character!.location,hour,seed:42,players:[priest,ally],enemies:[{id:'e',template:'monster-forest-wolf'}]});
 state.status='victory';state.fighters.find(f=>f.id==='e')!.hp=0;
 state.fighters[0].contribution.receipts={healing:80,allyHealing:80};
 return {profile,state};
}
test('victorious mixed-party actual aid grants bounded temple faith once with canonical proof',()=>{
 const {profile,state}=fixture();const c=profile.character!,before=fantasyPriestGrowthStatus(c).faith;
 assert.equal(recordFantasyClergyCombatService(profile,state,'priest'),true);
 assert.equal(c.priestGrowth!.support?.[0].points,2);assert.equal(c.combatVictories?.[`service:${state.id}`],c.hour);
 assert.equal(fantasyPriestGrowthStatus(c).faith,before+2);assert.ok(validFantasyPriestGrowth(c));
 const saved=structuredClone(profile);assert.equal(recordFantasyClergyCombatService(profile,state,'priest'),false);assert.deepEqual(profile,saved);
});
test('day budget is four and lifetime faith is forty without replacing other advancement evidence',()=>{
 const {profile,state}=fixture();const c=profile.character!,before=fantasyPriestGrowthStatus(c).faith;
 for(let n=0;n<25;n++){const day=Math.floor(n/2);c.hour=12+day*24;const next={...structuredClone(state),id:`battle-${n}`,hour:c.hour};next.scaling={...next.scaling,combatId:next.id};next.deadline=next.hour+.5;const granted=recordFantasyClergyCombatService(profile,next,'priest');assert.equal(granted,n<20);}
 assert.equal(c.priestGrowth!.support!.length,20);assert.equal(fantasyPriestGrowthStatus(c).faith,before+40);
 assert.equal(fantasyPriestGrowthStatus(c).saintEligible,false);assert.equal(fantasyPriestGrowthStatus(c).service,0);assert.ok(validFantasyPriestGrowth(c));
});
test('defeat solo fled stale generation former priest and self aid never earn service faith',()=>{
 for(const kind of ['defeat','solo','fled','generation','job','vocation','self','own-unit','death'] as const){const {profile,state}=fixture();
  if(kind==='defeat')state.status='defeat';if(kind==='solo'){state.fighters.splice(1,1);state.scaling={...state.scaling,participantIds:['priest']};}
  if(kind==='fled')state.fighters[0].fled=true;if(kind==='generation')profile.generation=(profile.generation??1)+1;
  if(kind==='job')profile.character!.job='warrior';if(kind==='vocation')state.fighters[0].vocation={job:'warrior'};
  if(kind==='self'||kind==='own-unit')state.fighters[0].contribution.receipts={healing:80};
  if(kind==='death')profile.death={location:state.location,hour:profile.character!.hour,cause:'battle'};
  const before=structuredClone(profile);assert.equal(recordFantasyClergyCombatService(profile,state,'priest'),false,kind);assert.deepEqual(profile,before);
 }
});
test('small real aid earns one, rescues earn two, and remaining day budget never overflows',()=>{
 const {profile,state}=fixture();state.fighters[0].contribution.receipts={protection:1,allyProtection:1};assert.ok(recordFantasyClergyCombatService(profile,state,'priest'));
 state.id='rescue';state.scaling={...state.scaling,combatId:state.id};state.fighters[0].contribution.receipts={rescue:1,allyRescue:1};assert.ok(recordFantasyClergyCombatService(profile,state,'priest'));
 state.id='remaining';state.scaling={...state.scaling,combatId:state.id};assert.ok(recordFantasyClergyCombatService(profile,state,'priest'));
 assert.deepEqual(profile.character!.priestGrowth!.support!.map(r=>r.points),[1,2,1]);
 state.id='daily-full';state.scaling={...state.scaling,combatId:state.id};assert.equal(recordFantasyClergyCombatService(profile,state,'priest'),false);assert.ok(validFantasyPriestGrowth(profile.character!));
});

test('actual party healing followed by victory awards faith from observed combat receipts',async()=>{
 const {submitFantasyCombatOrder}=await import('../shared/fantasy-combat.ts');
 const {profile,state:ended}=fixture('actual-service');let state=ended;state.status='active';state.fighters[0].contribution.receipts=undefined;state.fighters.find(f=>f.id==='e')!.hp=1;state.fighters[1].hp-=5;
 for(let turn=0;turn<10&&state.status==='active';turn++){
  const priest=state.fighters.find(f=>f.userId==='priest')!,ally=state.fighters.find(f=>f.userId==='ally')!;
  const own=turn===0?{type:'skill' as const,skill:'priest-grace',target:ally.id}:{type:'guard' as const};
  const one=submitFantasyCombatOrder(state,'priest',state.revision,own,state.hour);assert.equal(one.error,undefined);state=one.state;
  const two=submitFantasyCombatOrder(state,'ally',state.revision,turn===0?{type:'guard'}:{type:'attack',target:'e'},state.hour);assert.equal(two.error,undefined);state=two.state;
 }
 assert.equal(state.status,'victory');assert.equal(state.fighters[0].contribution.receipts?.allyHealing,5);
 assert.ok(recordFantasyClergyCombatService(profile,state,'priest'));assert.equal(profile.character!.priestGrowth!.support![0].points,1);
 const restored=JSON.parse(JSON.stringify(profile));assert.ok(validFantasyPriestGrowth(restored.character!));
 assert.equal(recordFantasyClergyCombatService(restored,state,'priest'),false);
});
test('thirty small support records are bounded without dropping old duplicate proofs',()=>{
 const {profile,state}=fixture();state.fighters[0].contribution.receipts={healing:1,allyHealing:1};
 for(let n=0;n<31;n++){profile.character!.hour=n*24+12;const battle={...structuredClone(state),id:`small-${n}`,hour:profile.character!.hour,deadline:profile.character!.hour+.5};battle.scaling={...battle.scaling,combatId:battle.id};assert.equal(recordFantasyClergyCombatService(profile,battle,'priest'),n<30);}
 assert.equal(profile.character!.priestGrowth!.support!.length,30);assert.equal(fantasyPriestGrowthStatus(profile.character!).supportFaith,30);assert.ok(validFantasyPriestGrowth(profile.character!));
});
