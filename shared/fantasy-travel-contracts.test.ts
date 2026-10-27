import test, { type TestContext } from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import type { FantasyAction, FantasyProfile } from './fantasy.ts';
import { FANTASY_JOBS, FANTASY_LOCATIONS, FANTASY_ROUTES } from './fantasy-data.ts';
import { applyFantasyAction, advanceFantasyWorld, fantasyTransports, newFantasyProfile, startFantasyActivity } from './fantasy-engine.ts';
import { FANTASY_GATE_HOURS, FANTASY_GATE_SETTLEMENTS, fantasyGateFare, fantasyHasGate } from './fantasy-gates.ts';
import { FANTASY_ESCORT_JOBS, FANTASY_ESCORT_COOLDOWN_HOURS, fantasyEscortOffers, fantasyEscortPair, fantasyEscortTransportError, validFantasyEscort } from './fantasy-escort.ts';
import { FANTASY_SETTLEMENTS, fantasyFrontierLocations, fantasyKnownLocations } from './fantasy-town.ts';
import { recordFantasyDeath } from './fantasy-mortality.ts';
import { FantasyStore, isFantasyAction } from '../server/fantasy-store.ts';

const high = () => .999;
const fresh = (charted = true) => {
  const p = applyFantasyAction(newFantasyProfile(), {type:'create',name:'Roadwarden',gender:'female',source:'human'}, () => .5).profile;
  const c = p.character!;
  c.job='warrior'; c.jobXp.warrior=0; c.gold=5000; c.inventory.lantern=1;
  if(charted)c.charted=FANTASY_LOCATIONS.map(place=>place.id);
  return p;
};
const apply = (profile: FantasyProfile, action: FantasyAction) => {
  const result=applyFantasyAction(profile,action,high);
  assert.equal(result.error,undefined);assert.equal(result.changed,true);
  return result.profile;
};
const transport = (p: FantasyProfile, destination: string, id: string) => fantasyTransports(p.character!,destination).find(option=>option.id===id)!;
function fixture(t: TestContext, profile: FantasyProfile) {
  const folder=fs.mkdtempSync(path.join(os.tmpdir(),'tonarium-travel-contracts-'));
  const file=path.join(folder,'profiles.json');
  fs.writeFileSync(file,JSON.stringify({traveler:profile}));
  t.after(()=>{
    assert.equal(path.dirname(path.resolve(folder)),path.resolve(os.tmpdir()));
    assert.ok(path.basename(folder).startsWith('tonarium-travel-contracts-'));
    fs.rmSync(folder,{recursive:true,force:true});
  });
  return file;
}

test('the explicit gate network matches settlement services and has no wild, island or tower endpoint',()=>{
  const hubs=[...FANTASY_GATE_SETTLEMENTS].sort();
  assert.equal(hubs.length,8);
  assert.deepEqual(FANTASY_LOCATIONS.filter(place=>place.services.includes('gate')).map(place=>place.id).sort(),hubs);
  for(const id of hubs){assert.ok(fantasyHasGate(id));assert.ok(['city','village'].includes(FANTASY_SETTLEMENTS[id]?.kind));}
  const edges=FANTASY_ROUTES.filter(route=>route.mode==='gate');assert.ok(edges.length>=7);
  for(const edge of edges){assert.ok(fantasyHasGate(edge.from)&&fantasyHasGate(edge.to));assert.equal(edge.hours,FANTASY_GATE_HOURS);}
  for(const id of ['whispergrove','starspire','eclipsevault','drift-isle','sunmeadow','tidehaven'])assert.equal(fantasyHasGate(id),false);
});

test('gates require both hubs, known destinations and server-calculated high fares while staying fast under buffs',()=>{
  const p=fresh(),c=p.character!;c.level=3;
  for(const from of FANTASY_GATE_SETTLEMENTS){
    c.location=from;
    for(const to of FANTASY_GATE_SETTLEMENTS.filter(id=>id!==from)){
      const choices=fantasyTransports(c,to),gate=choices.find(choice=>choice.id==='gate')!;
      assert.equal(gate.available,true,`${from}->${to}: ${gate.reason}`);assert.equal(gate.hours,.25);
      assert.ok(gate.cost>=120);assert.deepEqual(gate.path,[from,to]);
      for(const ordinary of choices.filter(choice=>choice.available&&['carriage','ship'].includes(choice.id)))assert.ok(gate.cost>=ordinary.cost+80);
      c.buff={effect:'travel',power:100};
      const boosted=transport(p,to,'gate');assert.equal(boosted.hours,.25);assert.equal(boosted.cost,gate.cost);c.buff=null;
    }
  }
  for(const outside of FANTASY_LOCATIONS.filter(place=>!fantasyHasGate(place.id))){
    c.location='hearth';assert.equal(transport(p,outside.id,'gate')?.available??false,false,outside.id);
    c.location=outside.id;assert.equal(transport(p,'hearth','gate')?.available??false,false,outside.id);
  }
  c.location='hearth';c.gold=0;assert.equal(transport(p,'suncourt','gate').available,false);
  const unseen=fresh(false),before=structuredClone(unseen.character!);
  const hidden=transport(unseen,'sunloom','gate');assert.equal(hidden.available,false);assert.deepEqual(hidden.path,[]);
  assert.ok(!fantasyFrontierLocations(unseen.character!).includes('sunloom'));
  assert.deepEqual(unseen.character,before);assert.deepEqual(fantasyKnownLocations(unseen.character!),['hearth']);
  assert.equal(fantasyGateFare(2,[400]),480);
});

test('a gate trip takes a fixed quarter hour and charges once only on real arrival',()=>{
  const p=fresh(),fare=transport(p,'suncourt','gate').cost;
  const started=startFantasyActivity(p,{type:'travel',destination:'suncourt',transport:'gate'},8,high);
  assert.equal(started.error,undefined);assert.equal(started.profile.activity!.endsAt,8.25);
  assert.equal(started.profile.character!.location,'hearth');assert.equal(started.profile.character!.gold,5000);
  const halfway=advanceFantasyWorld(started.profile,8.125).profile;
  assert.equal(halfway.character!.location,'hearth');assert.equal(halfway.character!.gold,5000);
  const arrived=advanceFantasyWorld(halfway,8.25).profile;
  assert.equal(arrived.activity,undefined);assert.equal(arrived.character!.location,'suncourt');assert.equal(arrived.character!.gold,5000-fare);
  assert.equal(advanceFantasyWorld(arrived,9).profile.character!.gold,5000-fare);
  const forged=applyFantasyAction(p,{type:'travel',destination:'suncourt',transport:'gate'},high,{advanceTime:false,durationHours:.01});
  assert.equal(forged.changed,false);assert.ok(forged.error);assert.equal(p.character!.gold,5000);
});

test('server actions reject invented fares, unknown gate destinations and wilderness egress',t=>{
  const p=fresh(),file=fixture(t,p),store=new FantasyStore(file,{onError:()=>{}});
  assert.equal(store.loadError,undefined);
  assert.equal(isFantasyAction({type:'travel',destination:'suncourt',transport:'gate',cost:0,hours:.001}),false);
  const before=store.profile('traveler');
  assert.equal(store.apply('traveler',before.revision,{type:'travel',destination:'eclipsevault',transport:'gate'},high).changed,false);
  assert.deepEqual(store.profile('traveler'),before);
  const unseen=fresh(false),unknownStore=new FantasyStore(fixture(t,unseen),{onError:()=>{}});
  assert.equal(unknownStore.apply('traveler',unseen.revision,{type:'travel',destination:'sunloom',transport:'gate'},high).changed,false);
  const wild=fresh();wild.character!.location='eclipsevault';wild.character!.visited.push('eclipsevault');
  const wildStore=new FantasyStore(fixture(t,wild),{onError:()=>{}});assert.equal(wildStore.loadError,undefined);
  assert.equal(wildStore.apply('traveler',wild.revision,{type:'travel',destination:'hearth',transport:'gate'},high).changed,false);
});

test('every real guild has bounded land escort offers for combat jobs, with no unknown itinerary leakage',()=>{
  const p=fresh(),c=p.character!;
  for(const id of FANTASY_ESCORT_JOBS)assert.ok(FANTASY_JOBS.some(job=>job.id===id),id);
  const guilds=Object.entries(FANTASY_SETTLEMENTS).filter(([,town])=>town.buildingIds.includes('guild'));
  assert.equal(guilds.length,7);
  for(const [from] of guilds){
    c.location=from;const offers=fantasyEscortOffers(c);assert.ok(offers.length>0,from);
    for(const offer of offers){
      assert.equal(offer.available,true);assert.equal(offer.from,from);assert.ok(FANTASY_SETTLEMENTS[offer.destination]);
      assert.ok(offer.hours>0&&offer.hours<=15);assert.ok(offer.reward>=3&&offer.reward<=40);
      let base=0;
      for(let i=1;i<offer.path.length;i++){
        const edge=FANTASY_ROUTES.find(route=>route.mode==='land'&&(route.from===offer.path[i-1]&&route.to===offer.path[i]||route.to===offer.path[i-1]&&route.from===offer.path[i]));
        assert.ok(edge);base+=edge.hours;
      }
      assert.ok(base<=12);assert.ok(offer.hours>=base*1.25);
    }
  }
  c.location='redweave';assert.ok(fantasyEscortOffers(c).some(offer=>offer.path.includes('windstep')));
  for(const job of FANTASY_ESCORT_JOBS){c.job=job;c.location='hearth';assert.ok(fantasyEscortOffers(c).length>0,job);}
  for(const job of ['unassigned','cook','thief']){c.job=job;assert.deepEqual(fantasyEscortOffers(c),[]);}
  c.job='warrior';c.location='sunmeadow';assert.deepEqual(fantasyEscortOffers(c),[]);
  const unseen=fresh(false),visible=new Set([...fantasyKnownLocations(unseen.character!),...fantasyFrontierLocations(unseen.character!)]);
  for(const offer of fantasyEscortOffers(unseen.character!))assert.ok(offer.path.every(id=>visible.has(id)));
  assert.ok(!fantasyEscortOffers(unseen.character!).some(offer=>offer.destination==='sunloom'));
});

test('escort assignments require guild acceptance and cannot pay on acceptance, departure or a partial journey',()=>{
  const original=fresh();original.character!.gold=0;
  assert.equal(transport(original,'suncourt','escort').available,false);
  const rejected=applyFantasyAction(original,{type:'travel',destination:'suncourt',transport:'escort'},high);assert.equal(rejected.changed,false);
  const accepted=apply(original,{type:'escortAccept',destination:'suncourt'}),contract=accepted.character!.escort!;
  assert.equal(accepted.character!.gold,0);assert.ok(validFantasyEscort(accepted.character!));
  assert.equal(applyFantasyAction(accepted,{type:'escortAccept',destination:'tidehaven'},high).changed,false);
  assert.equal(transport(accepted,'tidehaven','escort').available,false);
  const offer=transport(accepted,'suncourt','escort');assert.equal(offer.cost,0);assert.equal(offer.reward,contract.reward);assert.equal(offer.hours,contract.hours);
  const boosted=structuredClone(accepted);boosted.character!.buff={effect:'travel',power:100};
  assert.equal(transport(boosted,'suncourt','escort').hours,contract.hours);
  const started=startFantasyActivity(accepted,{type:'travel',destination:'suncourt',transport:'escort'},8,high);
  assert.equal(started.error,undefined);assert.equal(started.profile.character!.gold,0);assert.equal(started.profile.character!.location,'hearth');
  assert.ok(started.profile.log.some(log=>/護衛に出発/.test(log.text)));
  const middle=advanceFantasyWorld(started.profile,8+contract.hours/2).profile;
  assert.equal(middle.character!.gold,0);assert.equal(middle.character!.location,'hearth');assert.ok(middle.activity);
  const arrived=advanceFantasyWorld(middle,8+contract.hours).profile;
  assert.equal(arrived.activity,undefined);assert.equal(arrived.character!.escort,undefined);
  assert.equal(arrived.character!.location,'suncourt');assert.equal(arrived.character!.gold,contract.reward);
  assert.equal(arrived.character!.escortHistory![fantasyEscortPair('hearth','suncourt')],arrived.character!.hour);
  assert.ok(arrived.log.some(log=>/護衛を完了/.test(log.text)));assert.ok(validFantasyEscort(arrived.character!));
  assert.equal(advanceFantasyWorld(arrived,arrived.character!.hour+1).profile.character!.gold,contract.reward);
  assert.equal(applyFantasyAction(arrived,{type:'travel',destination:'hearth',transport:'escort'},high).changed,false);
});

test('escort completion cooldown covers reverse routes, ordinary travel cannot collect its reward, and abandoning earns nothing',()=>{
  let p=apply(fresh(),{type:'escortAccept',destination:'suncourt'});const gold=p.character!.gold;
  const walked=apply(p,{type:'travel',destination:'suncourt',transport:'foot'});
  assert.equal(walked.character!.gold,gold);assert.ok(walked.character!.escort);
  p=apply(walked,{type:'escortAbandon'});assert.equal(p.character!.gold,gold);assert.equal(p.character!.escort,undefined);
  p.character!.location='hearth';
  p=apply(p,{type:'escortAccept',destination:'suncourt'});p=apply(p,{type:'travel',destination:'suncourt',transport:'escort'});
  const completedAt=p.character!.hour,paid=p.character!.gold;
  const reverse=fantasyEscortOffers(p.character!).find(offer=>offer.destination==='hearth')!;
  assert.equal(reverse.available,false);
  assert.equal(applyFantasyAction(p,{type:'escortAccept',destination:'hearth'},high).changed,false);
  assert.ok(fantasyEscortOffers(p.character!).some(offer=>offer.destination!=='hearth'&&offer.available));
  p.character!.hour=completedAt+FANTASY_ESCORT_COOLDOWN_HOURS-.01;
  assert.equal(fantasyEscortOffers(p.character!).find(offer=>offer.destination==='hearth')!.available,false);
  p.character!.hour=completedAt+FANTASY_ESCORT_COOLDOWN_HOURS;
  assert.equal(fantasyEscortOffers(p.character!).find(offer=>offer.destination==='hearth')!.available,true);
  assert.equal(p.character!.gold,paid);
});

test('forged escort terms and pending duration cannot change money or pass saved-state validation',t=>{
  const p=apply(fresh(),{type:'escortAccept',destination:'suncourt'});
  for(const change of [{reward:1000000},{hours:.25},{acceptedAt:9},{id:'invented'},{from:'greenwood'}]){
    const forged=structuredClone(p);Object.assign(forged.character!.escort!,change);
    assert.equal(validFantasyEscort(forged.character!),false,JSON.stringify(change));
    assert.ok(fantasyEscortTransportError(forged.character!,'suncourt'));
    const store=new FantasyStore(fixture(t,forged),{onError:()=>{}});assert.ok(store.loadError);
  }
  assert.equal(isFantasyAction({type:'escortAccept',destination:'suncourt',reward:999}),false);
  const bad=applyFantasyAction(p,{type:'travel',destination:'suncourt',transport:'escort'},high,{advanceTime:false,durationHours:.25});
  assert.equal(bad.changed,false);assert.equal(bad.profile.character!.gold,p.character!.gold);
  const pending=startFantasyActivity(p,{type:'travel',destination:'suncourt',transport:'escort'},8,high).profile;
  pending.activity!.endsAt=pending.activity!.startedAt+.25;
  assert.ok(new FantasyStore(fixture(t,pending),{onError:()=>{}}).loadError);
  const history=structuredClone(p.character!);history.escortHistory={'hearth~suncourt':Infinity};assert.equal(validFantasyEscort(history),false);
  history.escortHistory={'eclipsevault~hearth':8};assert.equal(validFantasyEscort(history),false);
});

test('server reload halfway through escort travel retains the assignment and pays exactly once at the original deadline',t=>{
  let worldHour=8;
  const p=fresh(),file=fixture(t,p),opts={worldHour:()=>worldHour,onError:()=>{}};
  let store=new FantasyStore(file,opts);
  let result=store.apply('traveler',p.revision,{type:'escortAccept',destination:'suncourt'},high);assert.equal(result.error,undefined);
  const before=result.profile.character!.gold,reward=result.profile.character!.escort!.reward;
  result=store.apply('traveler',result.profile.revision,{type:'travel',destination:'suncourt',transport:'escort'},high);assert.equal(result.error,undefined);
  const endsAt=result.profile.activity!.endsAt;
  worldHour=8+(endsAt-8)/2;store.synchronize('traveler');
  assert.equal(store.profile('traveler').character!.gold,before);
  store=new FantasyStore(file,opts);assert.equal(store.loadError,undefined);assert.equal(store.profile('traveler').activity!.endsAt,endsAt);
  worldHour=endsAt;store.synchronize('traveler');
  assert.equal(store.profile('traveler').character!.gold,before+reward);assert.equal(store.profile('traveler').character!.escort,undefined);
  store=new FantasyStore(file,opts);assert.equal(store.loadError,undefined);worldHour+=1;store.synchronize('traveler');
  assert.equal(store.profile('traveler').character!.gold,before+reward);
});

test('legacy characters need no escort fields, and a new life does not inherit a prior escort or its cooldown',t=>{
  const old=fresh();assert.equal(old.character!.escort,undefined);assert.ok(validFantasyEscort(old.character!));
  assert.equal(new FantasyStore(fixture(t,old),{onError:()=>{}}).loadError,undefined);
  let p=apply(old,{type:'escortAccept',destination:'suncourt'});
  recordFantasyDeath(p,'test distant journey');
  p=apply(p,{type:'rebirth'});p=apply(p,{type:'create',name:'New traveler',gender:'male',source:'human'});
  assert.equal(p.character!.escort,undefined);assert.equal(p.character!.escortHistory,undefined);
  assert.ok(validFantasyEscort(p.character!));assert.equal(p.pastLives!.length,1);
});
