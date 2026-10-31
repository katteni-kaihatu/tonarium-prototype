import test from 'node:test';
import assert from 'node:assert/strict';
import { advanceFantasyWorld, applyFantasyAction, fantasyTransports, newFantasyProfile, startFantasyActivity } from './fantasy-engine.ts';
import { FANTASY_LOCATIONS } from './fantasy-data.ts';
const fresh=()=>{const p=applyFantasyAction(newFantasyProfile(),{type:'create',name:'Boundary',gender:'female',source:'human'},()=>.5).profile;Object.assign(p.character!,{gold:5000,job:'warrior',charted:FANTASY_LOCATIONS.map(x=>x.id)});return p;};
test('offline travel never rolls historical ambush slots or rewinds time on reconnect',()=>{
 const p=startFantasyActivity(fresh(),{type:'travel',destination:'greenwood',transport:'foot'},8,()=>(39+.5)/4294967296).profile;
 const offline=advanceFantasyWorld(p,9,{ambush:false}).profile;
 const reconnect=advanceFantasyWorld(offline,9.1,{ambush:true}).profile;
 assert.ok(reconnect.character!.hour>=9,'the already elapsed first-slot ambush must never rewind the clock');
});
test('a carriage fare is paid on departure and cannot be recovered by cancellation or forced dismount',()=>{
 const p=fresh(),fare=fantasyTransports(p.character!,'greenwood').find(x=>x.id==='carriage')!.cost;
 const s=startFantasyActivity(p,{type:'travel',destination:'greenwood',transport:'carriage'},8,()=>.5).profile;
 assert.equal(s.character!.gold,5000-fare);
 const mid=advanceFantasyWorld(s,8.25).profile;
 assert.equal(applyFantasyAction(mid,{type:'cancel'}).profile.character!.gold,5000-fare);
 const turn=applyFantasyAction(mid,{type:'redirect',destination:'suncourt',transport:'carriage'},()=>.5).profile;
 assert.equal(turn.activity!.action.type==='travel'&&turn.activity!.action.transport,'foot');
 assert.equal(turn.character!.gold,5000-fare);
});
test('midpoint redirection starts at the persisted road position instead of teleporting to departure',()=>{
 const s=startFantasyActivity(fresh(),{type:'travel',destination:'greenwood',transport:'foot'},8,()=>.5).profile;
 const mid=advanceFantasyWorld(s,9).profile;
 const turn=applyFantasyAction(mid,{type:'redirect',destination:'hearth'},()=>.5);
 assert.equal(turn.error,undefined,'returning toward departure is possible from the road');
 assert.ok(turn.profile.character!.travelPosition);
 assert.ok(turn.profile.activity!.endsAt-turn.profile.activity!.startedAt<2);
 const stop=applyFantasyAction(mid,{type:'cancel'}).profile;
 assert.deepEqual(stop.character!.travelPosition,mid.character!.travelPosition);
});
test('fog is revealed as intermediate nodes are passed and remains when travel is cancelled',()=>{
 const p=fresh();p.character!.charted=['whispergrove'];
 const s=startFantasyActivity(p,{type:'travel',destination:'whispergrove',transport:'foot'},8,()=>.5).profile;
 const passedAt=s.activity!.startedAt+s.activity!.travel!.legs[0].hours;
 const beforeNode=advanceFantasyWorld(s,passedAt-.001).profile;
 assert.ok(!beforeNode.character!.visited.includes('greenwood'));
 const mid=advanceFantasyWorld(beforeNode,passedAt+.001).profile;
 assert.ok(mid.activity);assert.ok(mid.character!.visited.includes('greenwood'));
 assert.ok(mid.character!.seen?.includes('ironridge'));
 const stop=applyFantasyAction(mid,{type:'cancel'}).profile;
 assert.ok(stop.character!.visited.includes('greenwood'));assert.ok(!stop.character!.visited.includes('whispergrove'));
});
test('a village departure offers walking to a city then carriage with an actual transfer boundary',()=>{
 const p=fresh();p.character!.location='sunmeadow';p.character!.visited.push('sunmeadow');
 const quote=fantasyTransports(p.character!,'emberhall').find(x=>x.id==='carriage');
 assert.ok(quote?.available);assert.deepEqual(quote!.legs!.map(x=>x.transport),['foot','carriage']);
 const s=startFantasyActivity(p,{type:'travel',destination:'emberhall',transport:'carriage'},8,()=>.5).profile;
 assert.ok(s.activity!.travel);assert.equal(s.activity!.travel!.legs[0].to,'hearth');
});

import { fantasyTravelCurrentTransport, fantasyTravelPoint, fantasyTravelPosition, validFantasyTravel } from './fantasy-travel.ts';

test('turning back from a partial edge never invents a visit to its far endpoint',()=>{
 const s=startFantasyActivity(fresh(),{type:'travel',destination:'greenwood',transport:'foot'},8,()=>.5).profile;
 const mid=advanceFantasyWorld(s,8.5).profile;
 const turned=applyFantasyAction(mid,{type:'redirect',destination:'hearth'},()=>.5).profile;
 const done=advanceFantasyWorld(turned,turned.activity!.endsAt).profile;
 assert.equal(done.character!.location,'hearth');assert.ok(!done.character!.visited.includes('greenwood'));
});
test('serialized route receipts preserve exact point, transfer schedule and single fare on arrival',()=>{
 const p=fresh();p.character!.location='sunmeadow';p.character!.visited.push('sunmeadow');
 const s=startFantasyActivity(p,{type:'travel',destination:'emberhall',transport:'carriage'},8,()=>.5).profile;
 const a=s.activity!,transfer=8+a.travel!.legs[0].hours;
 assert.equal(fantasyTravelCurrentTransport(a,transfer-1e-6),'foot');
 assert.equal(fantasyTravelCurrentTransport(a,transfer),'carriage');
 const middle=advanceFantasyWorld(s,transfer+.25).profile;
 const restored=JSON.parse(JSON.stringify(middle));
 assert.ok(validFantasyTravel(restored.character,restored.activity));
 assert.deepEqual(fantasyTravelPoint(fantasyTravelPosition(restored.activity,restored.character.hour)!),fantasyTravelPoint(middle.character!.travelPosition!));
 const gold=restored.character.gold,done=advanceFantasyWorld(restored,restored.activity.endsAt).profile;
 assert.equal(done.character!.gold,gold);assert.equal(done.character!.travelPosition,undefined);
 assert.equal(advanceFantasyWorld(done,done.character!.hour+1).profile.character!.gold,gold);
});
test('an interrupted escort can continue from its defended road position instead of replaying the whole route',()=>{
 const accepted=applyFantasyAction(fresh(),{type:'escortAccept',destination:'suncourt'},()=>.5).profile;
 const s=startFantasyActivity(accepted,{type:'travel',destination:'suncourt',transport:'escort'},8,()=>.5).profile;
 const middle=advanceFantasyWorld(s,9).profile;
 delete middle.activity;middle.event=null;
 const continued=startFantasyActivity(middle,{type:'travel',destination:'suncourt',transport:'escort'},9,()=>.5);
 assert.equal(continued.error,undefined);
 assert.ok(continued.profile.activity!.endsAt<s.activity!.endsAt+1);
 const done=advanceFantasyWorld(continued.profile,continued.profile.activity!.endsAt).profile;
 assert.equal(done.character!.escort,undefined);
 assert.equal(done.character!.gold,5000+accepted.character!.escort!.reward);
});
test('an in-flight redirect to the same destination does not reset already processed ambush slots',()=>{
 const s=startFantasyActivity(fresh(),{type:'travel',destination:'greenwood',transport:'foot'},8,()=>.5).profile;
 const mid=advanceFantasyWorld(s,8.5).profile;
 const same=applyFantasyAction(mid,{type:'redirect',destination:'greenwood'},()=>.1);
 assert.equal(same.changed,false);assert.deepEqual(same.profile,mid);
});
test('saved routes reject forged position, fare, cursor, modes and unknown receipt fields',()=>{
 const s=startFantasyActivity(fresh(),{type:'travel',destination:'greenwood',transport:'foot'},8,()=>.5).profile;
 const mid=advanceFantasyWorld(s,8.5).profile;
 assert.ok(validFantasyTravel(mid.character!,mid.activity));
 for(const tamper of [
  (p:typeof mid)=>{p.character!.travelPosition!.fraction=.99;},
  (p:typeof mid)=>{p.activity!.travel!.paid=999;},
  (p:typeof mid)=>{p.activity!.travel!.ambushChecked=999;},
  (p:typeof mid)=>{p.activity!.travel!.legs[0].transport='carriage';},
  (p:typeof mid)=>{Object.assign(p.activity!.travel!,{admin:true});},
 ]){const p=structuredClone(mid);tamper(p);assert.equal(validFantasyTravel(p.character!,p.activity),false);}
});
test('a scheduled mixed carriage trip can choose another carriage itinerary before actually boarding',()=>{
 const p=fresh();p.character!.location='sunmeadow';p.character!.visited.push('sunmeadow');
 const s=startFantasyActivity(p,{type:'travel',destination:'emberhall',transport:'carriage'},8,()=>.5).profile;
 const mid=advanceFantasyWorld(s,8.25).profile;
 const result=applyFantasyAction(mid,{type:'redirect',destination:'suncourt',transport:'carriage'},()=>.5);
 assert.equal(result.error,undefined);assert.equal(result.profile.activity!.action.type==='travel'&&result.profile.activity!.action.transport,'carriage');
 assert.equal(result.profile.activity!.travel!.legs[0].transport,'foot');
});
test('a legacy unpaid carriage journey charges its fare once when upgraded and preserves it after reload',()=>{
 const p=fresh();p.activity={action:{type:'travel',destination:'greenwood',transport:'carriage'},startedAt:8,endsAt:9,seed:5};
 const upgraded=advanceFantasyWorld(p,8.25).profile;
 assert.equal(upgraded.character!.gold,4994);
 const resumed=advanceFantasyWorld(JSON.parse(JSON.stringify(upgraded)),8.5).profile;
 assert.equal(resumed.character!.gold,4994);
 assert.equal(advanceFantasyWorld(resumed,9).profile.character!.gold,4994);
});
test('a passenger cannot cancel or redirect a sea, airborne or gate leg into an unreachable midpoint',()=>{
 for(const transport of ['ship','working-ship','airship','gate']){
  const p=fresh();p.activity={action:{type:'travel',destination:'suncourt',transport},startedAt:8,endsAt:10,seed:5};
  assert.ok(applyFantasyAction(p,{type:'cancel'}).error,transport);
  assert.ok(applyFantasyAction(p,{type:'redirect',destination:'greenwood'}).error,transport);
 }
 const p=fresh();p.activity={action:{type:'travel',destination:'suncourt',transport:'ship'},startedAt:8,endsAt:10,seed:5,travel:{paid:2,ambushChecked:0,legs:[{from:'sunmeadow',to:'hearth',transport:'foot',hours:1,cost:0},{from:'hearth',to:'tidehaven',transport:'ship',hours:1,cost:2}]}};
 p.character!.travelPosition={from:'sunmeadow',to:'hearth',fraction:0};
 assert.equal(applyFantasyAction(p,{type:'cancel'}).error,undefined,'walking feeder legs can stop safely');
});
test('a cancelled fractional-road traveler cannot use departure town services but can rest or manage inventory',()=>{
 const s=startFantasyActivity(fresh(),{type:'travel',destination:'greenwood',transport:'foot'},8,()=>.5).profile;
 const stopped=applyFantasyAction(advanceFantasyWorld(s,8.5).profile,{type:'cancel'}).profile;
 for(const action of [{type:'work'},{type:'explore'},{type:'gather',resource:'herbs'},{type:'escortAccept',destination:'suncourt'}] as const){
  const result=startFantasyActivity(stopped,action,stopped.character!.hour,()=>.5);assert.ok(result.error,action.type);assert.deepEqual(result.profile,stopped);
 }
 assert.equal(startFantasyActivity(stopped,{type:'rest'},stopped.character!.hour,()=>.5).error,undefined);
});
test('cancelling exactly at a passed node anchors local interactions at that node',()=>{
 const s=startFantasyActivity(fresh(),{type:'travel',destination:'whispergrove',transport:'foot'},8,()=>.5).profile;
 const passedAt=s.activity!.startedAt+s.activity!.travel!.legs[0].hours;
 const before=advanceFantasyWorld(s,passedAt-.001).profile;
 const early=applyFantasyAction(before,{type:'cancel'}).profile;
 assert.equal(early.character!.location,'hearth');assert.ok(early.character!.travelPosition);
 assert.ok(!early.character!.visited.includes('greenwood'));
 const atNode=advanceFantasyWorld(s,passedAt).profile;
 const stopped=applyFantasyAction(atNode,{type:'cancel'}).profile;
 assert.equal(stopped.character!.location,'greenwood');assert.ok(stopped.character!.visited.includes('greenwood'));
 assert.equal(stopped.character!.travelPosition,undefined);
});
import { fantasyLibraryHoldings } from './fantasy-town.ts';
test('a road stop cannot borrow the previous town temple or library',()=>{
 const p=fresh(),book=fantasyLibraryHoldings(p.character!)[0];assert.ok(book);
 assert.equal(startFantasyActivity(p,{type:'pray'},8,()=>.5).error,undefined);
 assert.equal(startFantasyActivity(p,{type:'read',book},8,()=>.5).error,undefined);
 const s=startFantasyActivity(p,{type:'travel',destination:'greenwood',transport:'foot'},8,()=>.5).profile;
 const stopped=applyFantasyAction(advanceFantasyWorld(s,8.5).profile,{type:'cancel'}).profile;
 assert.ok(startFantasyActivity(stopped,{type:'pray'},8.5,()=>.5).error);
 assert.ok(startFantasyActivity(stopped,{type:'read',book},8.5,()=>.5).error);
});
