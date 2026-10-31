import fs from 'node:fs';
import path from 'node:path';
import { fantasyCombatPlayer } from '../server/fantasy-combat-adapter.ts';
import { createBenchmarkProfile, benchmarkSupplies } from './fantasy-balance-fixtures.ts';
import { partyBenchmarkOrder } from './fantasy-party-balance-report.ts';
import { createFantasyCombat, submitFantasyCombatOrder, validFantasyCombatState, type FantasyCombatUnitOrder } from '../shared/fantasy-combat.ts';
import { fantasyCombatContributionTotals, emptyFantasyCombatContribution, FANTASY_COMBAT_RECEIPTS } from '../shared/fantasy-combat-contribution.ts';
const directory='work/qa/institutions-v9-2026-10-31';
const jobs=['warrior','shieldbearer','priest','spy','summoner','mage'];
const enemies=['monster-stone-golem','monster-lich'];
const samples=[];
for(let size=1;size<=6;size++)for(const enemy of enemies)for(let seed=41001;seed<41013;seed++){
 const players=jobs.slice(0,size).map((job,i)=>{const profile=createBenchmarkProfile('human',job,'basic',20,300,'full',job==='summoner');const actor=fantasyCombatPlayer(profile,`p${i}`);actor.names={ko:job,en:job,ja:job};return actor;});
 const supplies=Object.assign({},...players.map(p=>benchmarkSupplies(p,'prepared',6).supplies)),options={supplies};
 let state=createFantasyCombat({id:'contribution-audit',source:'apex:contribution-audit',location:'sunmeadow',hour:108,seed,tactical:true,players,enemies:[{id:'enemy',template:enemy}]});
 let error:string|undefined;
 while(state.status==='active'&&state.round<=100){
  const before=state.round;
  const pending=[...(state.units??[]).filter(f=>f.hp>0&&!f.fled&&state.fighters.some(p=>p.userId===f.companion!.ownerId&&p.hp>0&&!p.fled)).map(f=>({user:f.companion!.ownerId,unit:f.id})),...state.fighters.filter(f=>f.userId&&f.hp>0&&!f.fled).map(f=>({user:f.userId!,unit:undefined as string|undefined}))];
  for(const actor of pending){
   const action=partyBenchmarkOrder(state,options,actor.user,actor.unit);
   const result=submitFantasyCombatOrder(state,actor.user,state.revision,actor.unit?{type:'unit',unit:actor.unit,order:action as FantasyCombatUnitOrder}:action,state.hour,options);
   if(result.error||!result.changed){error=result.error??'unchanged';break;}
   for(const spent of result.spentItems)supplies[spent.userId][spent.item].count--;
   state=result.state;
   if(!validFantasyCombatState(state)){error='invalid-state';break;}
  }
  if(error)break;
  if(state.status==='active'&&state.round===before){error='round-stalled';break;}
 }
 samples.push({size,enemy,seed,outcome:error?'invalid':state.status,rounds:state.round,error,players:state.fighters.filter(f=>f.userId).map(f=>({job:f.vocation?.job,hp:f.hp,receipts:fantasyCombatContributionTotals(state,f.userId!,f.generation!),direct:f.contribution.receipts??{},units:(state.units??[]).filter(u=>u.companion!.ownerId===f.userId).map(u=>({kind:u.companion!.kind,receipts:u.contribution.receipts??{}}))}))});
}
const summaries=[];
for(let size=1;size<=6;size++)for(const enemy of enemies){
 const cases=samples.filter(s=>s.size===size&&s.enemy===enemy);
 summaries.push({size,enemy,battles:cases.length,wins:cases.filter(s=>s.outcome==='victory').length,invalid:cases.filter(s=>s.outcome==='invalid').length,timeouts:cases.filter(s=>s.outcome==='active').length,roles:jobs.slice(0,size).map(job=>{const actors=cases.flatMap(s=>s.players.filter(p=>p.job===job)),totals=emptyFantasyCombatContribution();for(const actor of actors)for(const key of FANTASY_COMBAT_RECEIPTS)totals[key]+=actor.receipts[key];return {job,mean:Object.fromEntries(FANTASY_COMBAT_RECEIPTS.map(key=>[key,Number((totals[key]/cases.length).toFixed(2))]))};})});
}
fs.mkdirSync(directory,{recursive:true});fs.writeFileSync(path.join(directory,'party-contribution-audit.json'),JSON.stringify({scope:'Actual 1–6 player combat, fixed level20/basic gear/training300, support-aware actions, assigned summons, 12 paired seeds/enemy. No solo win targets or coefficient tuning.',summaries,samples},null,2));
console.log(JSON.stringify({battles:samples.length,invalid:samples.filter(s=>s.outcome==='invalid').length,timeouts:samples.filter(s=>s.outcome==='active').length,summaries},null,2));
if(samples.some(s=>s.outcome==='invalid'))process.exitCode=1;
