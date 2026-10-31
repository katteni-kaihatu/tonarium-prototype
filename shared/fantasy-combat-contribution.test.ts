import test from 'node:test';
import assert from 'node:assert/strict';
import { createFantasyCombat, submitFantasyCombatOrder, validFantasyCombatState, type FantasyCombatPlayer, type FantasyCombatSkill, type FantasyCombatState } from './fantasy-combat.ts';
import { fantasyCombatContributionTotals } from './fantasy-combat-contribution.ts';
const names = {ko:'동료', en:'Ally', ja:'仲間'};
const stats = {hp:300, mp:100, attack:70, defense:12, agility:30, intelligence:30, accuracy:100, magicResist:12};
const heal:FantasyCombatSkill={id:'test-heal',names,kind:'heal',power:50,mp:5};
const mana:FantasyCombatSkill={id:'test-mana',names,kind:'mana',power:50,mp:5};
const ward:FantasyCombatSkill={id:'test-ward',names,kind:'guard',power:50,mp:5};
function player(id:string,skills:FantasyCombatSkill[]=[]):FantasyCombatPlayer{return {id,userId:id,generation:1,names,stats:{...stats},hp:stats.hp,mp:stats.mp,position:'front',range:'melee',skills};}
function battle(players:FantasyCombatPlayer[],seed=1){return createFantasyCombat({id:'contribution',source:'hunt:monster-forest-wolf',location:'greenwood',seed,hour:12,players,enemies:[{id:'enemy',template:'monster-forest-wolf'}]});}
function round(state:FantasyCombatState,orders:Record<string,any>){for(const unit of state.units??[]){if(unit.hp>0&&!unit.fled&&!state.unitOrders?.[unit.id]&&state.fighters.some(f=>f.userId===unit.companion!.ownerId&&f.hp>0)){const result=submitFantasyCombatOrder(state,unit.companion!.ownerId,state.revision,{type:'unit',unit:unit.id,order:{type:'guard'}},state.hour);assert.equal(result.error,undefined);state=result.state;}}for(const p of state.fighters.filter(f=>f.userId&&f.hp>0&&!f.fled)){const result=submitFantasyCombatOrder(state,p.userId!,state.revision,orders[p.userId!]??{type:'guard'},state.hour);assert.equal(result.error,undefined);state=result.state;}assert.ok(validFantasyCombatState(state));return state;}
test('records capped HP healing and net self MP restoration; old snapshots remain valid',()=>{
 let state=battle([player('healer',[heal,mana]),player('ally')]);state.fighters[1].hp-=7;
 state=round(state,{healer:{type:'skill',skill:heal.id,target:'ally'}});
 assert.equal(fantasyCombatContributionTotals(state,'healer',1).healing,7);
 state.fighters[0].mp=90;
 state=round(state,{healer:{type:'skill',skill:mana.id,target:'healer'}});
 assert.equal(fantasyCombatContributionTotals(state,'healer',1).mana,10);
 const legacy=structuredClone(state);for(const f of legacy.fighters)delete f.contribution.receipts;
 assert.ok(validFantasyCombatState(legacy));
});
test('caps overkill damage and sums owned summons exactly once with generation ownership',()=>{
 let state=battle([player('owner')]);
 for(let seed=1;seed<=20;seed++){state=battle([player('owner')],seed);state.fighters.find(f=>f.id==='enemy')!.hp=3;state=round(state,{owner:{type:'attack',target:'enemy'}});if(fantasyCombatContributionTotals(state,'owner',1).damage)break;}
 assert.equal(fantasyCombatContributionTotals(state,'owner',1).damage,3);
 assert.equal(fantasyCombatContributionTotals(state,'owner',2).damage,0);
 const owner=player('summoner');owner.companions=[{id:'pet',kind:'summons',names,stats:{...stats},hp:300,mp:100,range:'melee',skills:[]}];
 for(let seed=1;seed<=20;seed++){state=battle([owner],seed);const unit=state.units![0];state.fighters.find(f=>f.id==='enemy')!.hp=3;
 const result=submitFantasyCombatOrder(state,'summoner',state.revision,{type:'unit',unit:unit.id,order:{type:'attack',target:'enemy'}},state.hour);assert.equal(result.error,undefined);
 state=round(result.state,{});if(fantasyCombatContributionTotals(state,'summoner',1).damage)break;}
 assert.equal(fantasyCombatContributionTotals(state,'summoner',1).damage,3);
 assert.equal(state.fighters[0].contribution.receipts?.damage??0,0);
 assert.equal(state.units![0].contribution.receipts?.damage,3);
});
test('records protection only on consumed wards and caps prevention to threatened HP',()=>{
 let protectedHits=0;
 for(let seed=1;seed<=12;seed++){
  let state=battle([player('tank',[ward])],seed);state.fighters[0].hp=2;
  state=round(state,{tank:{type:'skill',skill:ward.id,target:'tank'}});
  const total=fantasyCombatContributionTotals(state,'tank',1);assert.ok(total.protection<=2);
  if(total.protection>0)protectedHits++;
 }
 assert.ok(protectedHits>0);
});
test('invalid and ineffective actions never create contribution receipts',()=>{
 const state=battle([player('healer',[heal])]);
 const result=submitFantasyCombatOrder(state,'healer',state.revision,{type:'skill',skill:heal.id,target:'healer'},state.hour);
 assert.equal(result.error,'unnecessary');assert.equal(fantasyCombatContributionTotals(result.state,'healer',1).healing,0);
 const forged=structuredClone(state);forged.fighters[0].contribution.receipts={damage:-1};assert.equal(validFantasyCombatState(forged),false);
});

test('ally aid excludes self and owned units, while effective healing survives caster collapse',()=>{
 const caster=player('healer',[heal]);caster.companions=[{id:'pet',kind:'summons',names,stats:{...stats},hp:300,mp:100,range:'melee',skills:[]}];
 let state=battle([caster,player('ally')],42);const pet=state.units![0];pet.hp=290;state.fighters[1].hp=290;
 state=round(state,{healer:{type:'skill',skill:heal.id,target:pet.id}});assert.equal(fantasyCombatContributionTotals(state,'healer',1).allyHealing,0);
 const missing=300-state.fighters[1].hp;state=round(state,{healer:{type:'skill',skill:heal.id,target:'ally'}});assert.equal(fantasyCombatContributionTotals(state,'healer',1).allyHealing,missing);
 state.fighters[0].hp=0;assert.equal(fantasyCombatContributionTotals(state,'healer',1).allyHealing,missing);
});
test('real debuff interference is recorded and unused casts are not control credit',()=>{
 const root:FantasyCombatSkill={id:'test-root',names,kind:'hex',utility:'root',range:'magic',reach:8,power:8,mp:5};
 let state=createFantasyCombat({id:'root-receipt',source:'hunt:monster-forest-wolf',location:'greenwood',seed:42,hour:12,tactical:true,players:[player('debuffer',[root])],enemies:[{id:'enemy',template:'monster-forest-wolf'}]});
 state.fighters[0].tile={x:1,y:1};state.fighters[1].tile={x:8,y:1};
 state=round(state,{debuffer:{type:'skill',skill:root.id,target:'enemy'}});
 assert.equal(fantasyCombatContributionTotals(state,'debuffer',1).control,1);
 state=round(state,{});assert.equal(fantasyCombatContributionTotals(state,'debuffer',1).control,2);
 const clarity:FantasyCombatSkill={id:'test-clarity',names,kind:'boon',utility:'clarity',range:'magic',power:8,mp:5};
 let idle=battle([player('buffer',[clarity]),player('ally')],42);idle=round(idle,{buffer:{type:'skill',skill:clarity.id,target:'ally'}});
 assert.equal(fantasyCombatContributionTotals(idle,'buffer',1).control,0);
 assert.equal(fantasyCombatContributionTotals(idle,'buffer',1).assistance,0);
});
test('overlapping shields retain both casters instead of attributing all absorption to the last cast',()=>{
 let found=false;
 const small={...ward,power:1};
 for(let seed=1;seed<=30&&!found;seed++){
  let state=battle([player('first',[small]),player('second',[small]),player('patient')],seed);
  for(const actor of state.fighters.filter(f=>f.userId)){actor.stats.intelligence=0;actor.position=actor.id==='patient'?'front':'rear';}
  state.fighters.find(f=>f.id==='enemy')!.stats.attack=50;
  state=round(state,{first:{type:'skill',skill:ward.id,target:'patient'},second:{type:'skill',skill:ward.id,target:'patient'},patient:{type:'attack',target:'enemy'}});
  const a=fantasyCombatContributionTotals(state,'first',1),b=fantasyCombatContributionTotals(state,'second',1);
  if(a.protection){assert.equal(a.protection,1);assert.equal(b.protection,1);assert.equal(a.allyProtection,1);assert.equal(b.allyProtection,1);found=true;}
 }
 assert.ok(found);
});
test('ongoing bleed remains attributed once per actual tick after its caster is down',()=>{
 const bleed:FantasyCombatSkill={id:'test-bleed',names,kind:'hex',utility:'bleed',range:'magic',power:8,mp:5};
 let state=battle([player('debuffer',[bleed]),player('ally')],42);state.fighters.find(f=>f.id==='enemy')!.hp=state.fighters.find(f=>f.id==='enemy')!.stats.hp=1000;
 state=round(state,{debuffer:{type:'skill',skill:bleed.id,target:'enemy'}});
 assert.equal(fantasyCombatContributionTotals(state,'debuffer',1).damage,8);
 state.fighters[0].hp=0;state=round(state,{});
 assert.equal(fantasyCombatContributionTotals(state,'debuffer',1).damage,16);
});

test('blind credit requires a changed roll, not merely an active debuff',()=>{
 const blind:FantasyCombatSkill={id:'test-blind',names,kind:'hex',utility:'blind',range:'magic',power:12,mp:5};
 let changed=0,unchanged=0;
 for(let seed=1;seed<=80;seed++){
  let state=battle([player('spy',[blind])],seed);const enemy=state.fighters.find(f=>f.id==='enemy')!;
  state=round(state,{spy:{type:'skill',skill:blind.id,target:'enemy'}});
  const total=fantasyCombatContributionTotals(state,'spy',1);assert.ok(total.control<=1);
  if(total.control)changed++;else unchanged++;
 }
 assert.ok(changed>0);assert.ok(unchanged>0);
});
test('ordinary healing cannot revive a downed ally or invent support receipts',()=>{
 const state=battle([player('healer',[heal]),player('ally')],42);state.fighters[1].hp=0;
 const result=submitFantasyCombatOrder(state,'healer',state.revision,{type:'skill',skill:heal.id,target:'ally'},state.hour);
 assert.equal(result.error,'target');assert.equal(fantasyCombatContributionTotals(result.state,'healer',1).allyHealing,0);
});
test('resuscitation records one actual revival with capped restored HP',()=>{
 const revive:FantasyCombatSkill={id:'test-revive',names,kind:'miracle',power:50,mp:5,reach:8};
 let state=battle([player('healer',[revive]),player('ally')],42);state.fighters[1].hp=0;
 state=round(state,{healer:{type:'skill',skill:revive.id,target:'ally'}});
 const total=fantasyCombatContributionTotals(state,'healer',1);assert.equal(total.rescue,1);assert.equal(total.allyRescue,1);assert.equal(total.healing,65);assert.equal(total.allyHealing,65);
});

test('weakening credits the caster for HP actually saved on another player',()=>{
 const weaken:FantasyCombatSkill={id:'test-weaken',names,kind:'hex',utility:'weaken',range:'magic',power:12,mp:5};
 let found=false;
 for(let seed=1;seed<=30&&!found;seed++){
  let state=battle([player('debuffer',[weaken]),player('patient')],seed);state.fighters[0].position='rear';state.fighters[1].stats.agility=0;
  const baseline=structuredClone(state);
  const plain=round(baseline,{debuffer:{type:'guard'},patient:{type:'attack',target:'enemy'}});
  const protectedState=round(state,{debuffer:{type:'skill',skill:weaken.id,target:'enemy'},patient:{type:'attack',target:'enemy'}});
  const total=fantasyCombatContributionTotals(protectedState,'debuffer',1),saved=protectedState.fighters[1].hp-plain.fighters[1].hp;
  if(total.allyProtection){assert.ok(saved>0);assert.equal(total.allyProtection,saved);found=true;}
 }
 assert.ok(found);
});

test('consumable utility keeps contributor attribution without granting learned skill receipts',()=>{
 let state=battle([player('alchemist')],42);
 const supplies={supplies:{alchemist:{flask:{count:1,names,combat:{id:'flask-bleed',names,kind:'hex' as const,utility:'bleed',power:8,mp:0,range:'magic' as const}}}}};
 const result=submitFantasyCombatOrder(state,'alchemist',state.revision,{type:'item',item:'flask',target:'enemy'},state.hour,supplies);
 assert.equal(result.error,undefined);assert.ok(validFantasyCombatState(result.state));assert.equal(result.usedSkills,undefined);
 assert.equal(fantasyCombatContributionTotals(result.state,'alchemist',1).damage,8);
});
