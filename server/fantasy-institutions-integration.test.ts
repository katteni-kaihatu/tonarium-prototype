import test, {type TestContext} from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import { FantasyStore } from './fantasy-store.ts';
import { FantasyContracts } from './fantasy-contracts.ts';
import { applyFantasyAction, fantasyStats, newFantasyProfile } from '../shared/fantasy-engine.ts';
import { FANTASY_QUESTS } from '../shared/fantasy-data.ts';
import { fantasyQuestInstitution } from '../shared/fantasy-institutions.ts';
import type { FantasyProfile } from '../shared/fantasy.ts';
import type { FantasyContractGrant } from '../shared/fantasy-contracts.ts';

function person(name:string,job:string){
 const p=applyFantasyAction(newFantasyProfile(),{type:'create',source:'human',name,gender:'female'},()=>.99).profile,c=p.character!;
 c.job=job;c.jobXp[job]=0;c.hour=12;c.location='hearth';c.inventory.herb=20;c.hp=Math.min(c.hp,fantasyStats(c).hp);c.mp=Math.min(c.mp,fantasyStats(c).mp);return p;
}
function setup(t:TestContext){
 const dir=fs.mkdtempSync(path.join(os.tmpdir(),'fantasy-institution-'));t.after(()=>fs.rmSync(dir,{recursive:true,force:true}));
 const file=path.join(dir,'world.json'),profiles={a:person('A','thief'),b:person('B','priest'),c:person('C','warrior')};
 fs.writeFileSync(file,JSON.stringify(profiles));let fail=false;const errors:unknown[]=[];
 const options={onError:(e:unknown)=>errors.push(e),save:(file:string,data:string)=>{if(fail)throw Error('disk full');fs.writeFileSync(file,data);}};
 const store=new FantasyStore(file,options);assert.equal(store.loadError,undefined);
 assert.equal(store.savePartyState({parties:[{id:'party-test',leader:'a',members:['a','b','c']}]}),true);
 return {file,store,errors,options,fail:(value:boolean)=>{fail=value;}};
}
const quest='underworld-nyx-dressing';
const grant:FantasyContractGrant={offerId:'offer-v9-test',issuer:'hearth-nyx',boardLocation:'hearth',acceptedAt:12,expiresAt:48,progress:0,gold:30};

test('underworld party acceptance and reporting split one payment across professions and persist once',t=>{
 const f=setup(t);const accepted=f.store.apply('a',f.store.profile('a').revision,{type:'accept',quest,offer:grant.offerId},()=>.99,{contract:grant});assert.equal(accepted.error,undefined);
 for(const user of ['a','b','c'])assert.ok(f.store.profile(user).character!.quests.includes(quest));
 const p=f.store.profile('a'),single=applyFantasyAction(p,{type:'complete',quest},()=>.99);assert.equal(single.error,undefined);
 const before=Object.fromEntries(['a','b','c'].map(user=>[user,f.store.profile(user).character!.gold]));
 const denied=f.store.apply('b',f.store.profile('b').revision,{type:'complete',quest},()=>.99);assert.equal(denied.error,'party-contract:owner-only');
 const paid=f.store.apply('a',f.store.profile('a').revision,{type:'complete',quest},()=>.99);assert.equal(paid.error,undefined);
 const deltas=['a','b','c'].map(user=>f.store.profile(user).character!.gold-before[user]);
 assert.equal(deltas.reduce((a,b)=>a+b,0),single.profile.character!.gold-p.character!.gold);assert.ok(Math.max(...deltas)-Math.min(...deltas)<=1);
 for(const user of ['a','b','c'])assert.ok(f.store.profile(user).character!.completed.includes(quest));
 assert.equal(f.store.profile('a').character!.underworld!.trust,20);assert.equal(f.store.profile('b').character!.underworld,undefined);
 assert.equal(f.store.profile('a').character!.reputation,undefined);
 const restored=new FantasyStore(f.file,f.options);assert.equal(restored.loadError,undefined);
 assert.ok(restored.apply('a',restored.profile('a').revision,{type:'complete',quest},()=>.99).error);
 for(const user of ['a','b','c'])assert.equal(restored.profile(user).character!.gold,f.store.profile(user).character!.gold);
});

test('party payout and organization merit roll back together when saving fails',t=>{
 const f=setup(t);assert.equal(f.store.apply('a',f.store.profile('a').revision,{type:'accept',quest,offer:grant.offerId},()=>.99,{contract:grant}).error,undefined);
 const before=Object.fromEntries(['a','b','c'].map(user=>[user,f.store.profile(user)]));f.fail(true);
 assert.ok(f.store.apply('a',before.a.revision,{type:'complete',quest},()=>.99).error);
 for(const user of ['a','b','c'])assert.deepEqual(f.store.profile(user),before[user]);
 f.fail(false);assert.equal(f.store.apply('a',before.a.revision,{type:'complete',quest},()=>.99).error,undefined);
 assert.equal(f.store.profile('a').character!.underworld!.trust,20);
});

test('institution publication is deterministic and formal guild claims require registration',t=>{
 const f=setup(t),ledger=new FantasyContracts(path.join(path.dirname(f.file),'contracts.json'));
 const actor=(user:string)=>({id:user,session:'fantasy',world:'fantasy',character:f.store.profile(user).character!});
 const board=ledger.state(actor('a'),12)!;assert.ok(board.offers.some(o=>fantasyQuestInstitution(FANTASY_QUESTS.find(q=>q.id===o.quest)!)==='underworld'));
 assert.ok(board.offers.every(o=>fantasyQuestInstitution(FANTASY_QUESTS.find(q=>q.id===o.quest)!)!=='guild'));
 const temple=ledger.state(actor('b'),12)!;assert.ok(temple.offers.some(o=>fantasyQuestInstitution(FANTASY_QUESTS.find(q=>q.id===o.quest)!)==='temple'));
 const plain=ledger.state(actor('c'),12)!;assert.ok(plain.offers.every(o=>fantasyQuestInstitution(FANTASY_QUESTS.find(q=>q.id===o.quest)!)!=='guild'));
});
