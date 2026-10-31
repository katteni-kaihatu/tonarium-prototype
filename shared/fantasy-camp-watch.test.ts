import test from 'node:test';
import assert from 'node:assert/strict';
import * as camps from './fantasy-camping.ts';
import { applyFantasyAction, startFantasyActivity, advanceFantasyWorld, newFantasyProfile } from './fantasy-engine.ts';
import { applyFantasyDungeonAction } from './fantasy-dungeon.ts';
function player(location='greenwood') { const p=applyFantasyAction(newFantasyProfile(),{type:'create',source:'human',name:'Watch',gender:'female'},()=>.5).profile; Object.assign(p.character!,{location,hour:8,fatigue:80,hunger:0,hp:30,mp:10});p.character!.inventory['rain-cape']=1;p.character!.outfit='rain-cape';p.character!.visited.push(location);return p; }

test('watch rotations count only assigned healthy available human companions and exact physical camp sites',()=>{
 const a=player(),b=player(); assert.ok(camps.fantasyCampTogether(a.character!,b.character!));
 a.character!.travelPosition={from:'hearth',to:'greenwood',fraction:.4};assert.equal(camps.fantasyCampTogether(a.character!,b.character!),false);b.character!.travelPosition={from:'hearth',to:'greenwood',fraction:.5};assert.equal(camps.fantasyCampTogether(a.character!,b.character!),false);
 const da=applyFantasyDungeonAction(player('oldwatch'),{type:'dungeonEnter',site:'oldwatch'},()=>.1).profile.character!,db=applyFantasyDungeonAction(player('oldwatch'),{type:'dungeonEnter',site:'oldwatch'},()=>.2).profile.character!;assert.equal(camps.fantasyCampTogether(da,db),false);db.dungeon!.sites.oldwatch.layoutSeed=da.dungeon!.sites.oldwatch.layoutSeed;assert.equal(camps.fantasyCampTogether(da,db),true);
 a.character!.job='leader';a.character!.specialization={companies:{troop:{members:[{id:'troop-guard',hp:20,condition:'ready',assigned:true,missions:0},{id:'troop-scout',hp:20,condition:'injured',assigned:true,missions:0},{id:'troop-carrier',hp:20,condition:'ready',assigned:false,missions:0}]},summons:{members:[{id:'summon-wisp',hp:20,condition:'ready',assigned:true,missions:0}]}}};
 assert.equal(camps.fantasyCampCompanions(a.character!),1);a.character!.job='none';assert.equal(camps.fantasyCampCompanions(a.character!),0);
});

test('authenticated active camp rotations recover less fatigue and process each ambush slot only once',()=>{
 const p=player(),solo=startFantasyActivity(p,{type:'rest',watch:true},8,()=>.5,{camp:true}).profile;
 const plain=advanceFantasyWorld(solo,16,{campWatch:[]}).profile;
 const watched=advanceFantasyWorld(solo,16,{campWatch:[{startedAt:8,endsAt:16,watchers:2}]}).profile;
 assert.equal(plain.character!.fatigue,65);assert.equal(watched.character!.fatigue,69);
 assert.ok(watched.log.some(entry=>entry.text==='交代で見張りをした。担当時間2時間、疲労回復-11。'));
 assert.ok(watched.log.some(entry=>entry.text.startsWith('野営を終えた。疲労-11、')));
 const half=advanceFantasyWorld(solo,12,{campWatch:[{startedAt:8,endsAt:16,watchers:2}]}).profile;assert.equal(half.character!.fatigue,75);
 assert.deepEqual(advanceFantasyWorld(JSON.parse(JSON.stringify(half)),16,{campWatch:[{startedAt:8,endsAt:16,watchers:2}]}).profile,watched);
 assert.equal(advanceFantasyWorld(half,12,{ambush:true}).changed,false);
});

test('camp ambush interrupts actual sleep, retains partial fatigue recovery and never awards full healing',()=>{
 const p=player();let attacked:ReturnType<typeof advanceFantasyWorld>|undefined;
 for(let i=1;i<1000;i++){const start=startFantasyActivity(p,{type:'rest'},8,()=>i/1000,{camp:true}).profile;const result=advanceFantasyWorld(start,16,{ambush:true});if(result.profile.event){attacked=result;break;}}
 assert.ok(attacked);const c=attacked.profile.character!;assert.equal(attacked.profile.activity,undefined);assert.ok(c.hour>8&&c.hour<16);assert.equal(c.hp,30);assert.equal(c.mp,10);assert.ok(c.fatigue<80&&c.fatigue>65);
 const later=advanceFantasyWorld(attacked.profile,c.hour,{ambush:true});assert.equal(later.changed,false);
});

test('dungeon camps require a secured room and retain their position through completion or interruption',()=>{
 let p=applyFantasyDungeonAction(player('oldwatch'),{type:'dungeonEnter',site:'oldwatch'},()=>.5).profile;
 assert.ok(startFantasyActivity(p,{type:'rest'},8,()=>.5,{camp:true}).error);
 p=applyFantasyDungeonAction(p,{type:'dungeonInspect'},()=>.999).profile;
 const active=structuredClone(p.character!.dungeon!.active),start=startFantasyActivity(p,{type:'rest'},8,()=>.5,{camp:true});assert.equal(start.error,undefined);
 const done=advanceFantasyWorld(start.profile,16);assert.deepEqual(done.profile.character!.dungeon!.active,active);
});


test('active camp watch lowers deterministic monster risk while wards prevent only actual attacks',()=>{
 const p=player(),windows=[{startedAt:8,endsAt:16,watchers:2}];let plain=0,watched=0;let warded=false;
 for(let seed=1;seed<=500;seed++){
  const start=startFantasyActivity(p,{type:'rest',watch:true},8,()=>seed/501,{camp:true}).profile;
  const solo=advanceFantasyWorld(start,16,{ambush:true}),guarded=advanceFantasyWorld(start,16,{ambush:true,campWatch:windows});
  if(solo.profile.event)plain++;if(guarded.profile.event)watched++;
  if(solo.profile.event&&!warded){const withWard=structuredClone(start);withWard.character!.inventory['ward-seal']=10;const result=advanceFantasyWorld(withWard,16,{ambush:true});assert.equal(result.profile.event,null);assert.ok(result.profile.character!.inventory['ward-seal']<10);assert.ok(result.profile.character!.hp>30);warded=true;}
 }
 assert.ok(plain>30);assert.ok(watched<plain*.6);assert.ok(warded);
});

test('camp progress cannot replay old ambush slots or move the clock backwards',()=>{
 const p=startFantasyActivity(player(),{type:'rest'},8,()=>.5,{camp:true}).profile;
 const half=advanceFantasyWorld(p,12).profile;half.activity!.camp!.checked=0;
 assert.ok(advanceFantasyWorld(half,16,{ambush:true}).error);
});
