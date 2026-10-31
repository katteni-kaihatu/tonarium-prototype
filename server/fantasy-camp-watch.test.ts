import test,{type TestContext} from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';import os from 'node:os';import path from 'node:path';
import {FantasyStore,isFantasyAction} from './fantasy-store.ts';
import {FantasyParty} from './fantasy-party.ts';
import {applyFantasyAction,newFantasyProfile,startFantasyActivity,advanceFantasyWorld} from '../shared/fantasy-engine.ts';
import {applyFantasyDungeonAction} from '../shared/fantasy-dungeon.ts';
function fixture(t:TestContext,npc=false,ambush=false,dungeon=false){const dir=fs.mkdtempSync(path.join(os.tmpdir(),'fantasy-watch-'));t.after(()=>fs.rmSync(dir,{recursive:true,force:true}));const file=path.join(dir,'save.json');
 const profiles=Object.fromEntries(['a','b'].map(user=>{let p=applyFantasyAction(newFantasyProfile(),{type:'create',source:'human',name:user,gender:'female'},()=>.5).profile;Object.assign(p.character!,{location:'greenwood',fatigue:80,hunger:0,hour:8,hp:30,mp:10});p.character!.inventory['rain-cape']=1;p.character!.outfit='rain-cape';p.character!.visited.push('greenwood');if(npc&&user==='a'){p.character!.job='leader';p.character!.jobXp.leader=0;p.character!.specialization={companies:{troop:{members:[{id:'troop-guard',condition:'ready',hp:30,assigned:true,missions:0}]}}};}if(dungeon){p.character!.location='oldwatch';p.character!.visited.push('oldwatch');p=applyFantasyDungeonAction(p,{type:'dungeonEnter',site:'oldwatch'},()=>.5).profile;p=applyFantasyDungeonAction(p,{type:'dungeonInspect'},()=>.999).profile;}return[user,p];}));fs.writeFileSync(file,JSON.stringify(profiles));let hour=8,fail=false;
 const store=new FantasyStore(file,{worldHour:()=>hour,ambush,save:(file,data)=>{if(fail)throw Error('disk');fs.writeFileSync(file,data);},onError:()=>{}});assert.equal(store.loadError,undefined);
 const party=new FantasyParty({lookup:user=>({id:user,name:user,session:'s',world:'fantasy',profile:store.profile(user)}),start:()=>({users:[],updates:[],error:'unavailable'}),transaction:(run,snapshot)=>store.partyTransaction(run,snapshot),load:()=>store.partyState(),now:(()=>{let time=0;return()=>time+=1001;})()});party.request('a',{type:'create'});party.request('a',{type:'invite',target:'b'});party.request('b',{type:'respond',invite:party.state('b').invitations[0].id,accept:true});
 return {store,file,at:(at:number)=>{hour=at;return store.tick(new Set(['a','b']));},fail:(value:boolean)=>fail=value,rest:(user:string,watch=true,rng=()=>.5)=>store.apply(user,store.profile(user).revision,{type:'rest',watch},rng)};
}

test('each player opts into camp and watch independently; an idle party member never supplies a rotation',t=>{const f=fixture(t);assert.equal(f.rest('a').error,undefined);assert.equal(f.store.profile('b').activity,undefined);f.at(16);assert.equal(f.store.profile('a').character!.fatigue,65);assert.equal(f.store.profile('b').activity,undefined);});
test('two co-located consenting resting players rotate watch and recover less fatigue',t=>{const f=fixture(t);assert.equal(f.rest('a').error,undefined);assert.equal(f.rest('b').error,undefined);assert.ok(f.store.profile('a').activity!.camp);f.at(16);assert.equal(f.store.profile('a').character!.fatigue,69);assert.equal(f.store.profile('b').character!.fatigue,69);const disk=new FantasyStore(f.file,{worldHour:()=>16,onError:()=>{}});assert.equal(disk.loadError,undefined);});
test('a player who rests without opting into watch does not supply another person a rotation',t=>{const f=fixture(t);f.rest('a');f.rest('b',false);f.at(16);assert.equal(f.store.profile('a').character!.fatigue,65);assert.equal(f.store.profile('b').character!.fatigue,65);});
test('assigned healthy NPC companions can rotate with their consenting owner',t=>{const f=fixture(t,true);assert.equal(f.rest('a').error,undefined);f.at(16);assert.equal(f.store.profile('a').character!.fatigue,69);});
test('watch support ends when the other camper cancels and partial recovery cannot become a full reward',t=>{const f=fixture(t);f.rest('a');f.rest('b');f.at(12);assert.equal(f.store.profile('a').character!.fatigue,75);const cancelled=f.store.apply('b',f.store.profile('b').revision,{type:'cancel'});assert.equal(cancelled.error,undefined);assert.equal(cancelled.profile.character!.fatigue,75);f.at(16);assert.equal(f.store.profile('a').character!.fatigue,67);});
test('failed camp registration publishes no watcher, no companion action and no recovery',t=>{const f=fixture(t);f.rest('a');const before=f.store.profile('b');f.fail(true);assert.ok(f.rest('b').error);assert.deepEqual(f.store.profile('b'),before);f.fail(false);f.at(16);assert.equal(f.store.profile('a').character!.fatigue,65);});
test('rest transport accepts only a watch preference and rejects all client-authored watcher rosters',()=>{assert.ok(isFantasyAction({type:'rest',watch:true}));assert.equal(isFantasyAction({type:'rest',watch:1}),false);assert.equal(isFantasyAction({type:'rest',watchers:['someone']}),false);assert.equal(isFantasyAction({type:'rest',camp:{checked:0}}),false);});


test('failed partial camp ticks roll back all watch records and reload resumes the same recovery exactly once',t=>{
 const f=fixture(t);f.rest('a');f.rest('b');const before=['a','b'].map(user=>f.store.profile(user)),bytes=fs.readFileSync(f.file,'utf8');f.fail(true);assert.ok(f.at(12).some(update=>update.error));assert.deepEqual(['a','b'].map(user=>f.store.profile(user)),before);assert.equal(fs.readFileSync(f.file,'utf8'),bytes);
 f.fail(false);f.at(12);assert.equal(f.store.profile('a').activity!.camp!.checked,4);assert.equal(f.store.profile('a').character!.fatigue,75);
 const resumed=new FantasyStore(f.file,{worldHour:()=>16,ambush:false,onError:()=>{}});assert.equal(resumed.loadError,undefined);resumed.tick(new Set(['a','b']));assert.equal(resumed.profile('a').character!.fatigue,69);assert.equal(resumed.profile('b').character!.fatigue,69);assert.equal(resumed.tick(new Set(['a','b'])).length,0);
});

test('malformed persisted camp progress is rejected before any reward or encounter can be published',t=>{
 const f=fixture(t);f.rest('a');const data=JSON.parse(fs.readFileSync(f.file,'utf8'));data.profiles.a.activity.camp={checked:900,watchHours:100,fatigueRecovered:500};fs.writeFileSync(f.file,JSON.stringify(data));assert.ok(new FantasyStore(f.file,{onError:()=>{}}).loadError);
});

test('real server camps open monster encounters and preserve actual sleep recovery and dungeon position',t=>{
 for(const dungeon of [false,true]){
  const f=fixture(t,false,true,dungeon),before=f.store.profile('a'),fatigue=before.character!.fatigue,active=structuredClone(before.character!.dungeon?.active);let roll=0;
  for(let i=1;i<1000;i++){const p=startFantasyActivity(before,{type:'rest'},8,()=>i/1000,{camp:true}).profile;if(advanceFantasyWorld(p,16,{ambush:true}).profile.event){roll=i/1000;break;}}
  assert.ok(roll);assert.equal(f.rest('a',false,()=>roll).error,undefined);f.at(16);const after=f.store.profile('a');assert.ok(after.event);assert.equal(after.activity,undefined);assert.equal(after.character!.hp,before.character!.hp);assert.ok(after.character!.fatigue<fatigue&&after.character!.fatigue>fatigue-15);assert.deepEqual(after.character!.dungeon?.active,active);
 }
});

test('offline active camps finish normally without creating retroactive monster encounters',t=>{
 const f=fixture(t,false,true);assert.equal(f.rest('a',false,()=>.001).error,undefined);const offline=new FantasyStore(f.file,{worldHour:()=>16,ambush:true,onError:()=>{}});assert.equal(offline.loadError,undefined);offline.tick(new Set());assert.equal(offline.profile('a').activity,undefined);assert.equal(offline.profile('a').event,null);assert.equal(offline.profile('a').character!.fatigue,65);assert.ok(offline.profile('a').character!.hp>30);
});
