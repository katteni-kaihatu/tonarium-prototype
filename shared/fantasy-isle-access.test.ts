import test from 'node:test';
import assert from 'node:assert/strict';
import { createElement } from 'react';
import { renderToStaticMarkup } from 'react-dom/server';
import { FantasyMap } from '../client/src/world/FantasyMap.tsx';
import { FANTASY_ITEMS, FANTASY_LOCATIONS, FANTASY_RACES, FANTASY_ROUTES } from './fantasy-data.ts';
import { applyFantasyAction, advanceFantasyWorld, fantasyTransports, newFantasyProfile, startFantasyActivity } from './fantasy-engine.ts';
import { FANTASY_FINAL_ISLE_ID, FANTASY_FINAL_ISLE_LAST_QUEST, FANTASY_FINAL_ISLE_UNLOCK_QUEST, fantasyIsleAccess } from './fantasy-isle-access.ts';
import { FANTASY_MAPS, FANTASY_SETTLEMENTS, fantasyBuildings, fantasyFrontierLocations, fantasyKnownLocations } from './fantasy-town.ts';
import { fantasyHasGate } from './fantasy-gates.ts';

const fresh = () => {
  const p=applyFantasyAction(newFantasyProfile(),{type:'create',name:'Dawn voyager',gender:'female',source:'human'},()=>.5).profile;
  const c=p.character!;c.location='saffron-port';c.visited.push('saffron-port');c.inventory.lantern=1;c.gold=100;c.level=15;
  return p;
};
const unlock = () => {const p=fresh();p.character!.completed.push(FANTASY_FINAL_ISLE_UNLOCK_QUEST);p.character!.charted.push(FANTASY_FINAL_ISLE_ID);return p;};

test('the new seed-garden island is an isolated uninhabited region with a single real sea approach',()=>{
  const island=FANTASY_LOCATIONS.find(place=>place.id===FANTASY_FINAL_ISLE_ID)!;
  assert.equal(FANTASY_LOCATIONS.length,45);assert.equal(FANTASY_LOCATIONS.filter(place=>place.kind==='island').length,7);
  assert.equal(island.kind,'island');assert.equal(island.land,'islands');assert.equal(island.danger,3);
  assert.deepEqual(island.names,{ko:'새벽너머섬',en:'Beyond-Dawn Isle',ja:'暁の向こうの島'});
  assert.equal(FANTASY_SETTLEMENTS[island.id],undefined);assert.deepEqual(fantasyBuildings({location:island.id}),[]);
  assert.deepEqual(island.services,['port']);assert.equal(fantasyHasGate(island.id),false);
  assert.ok(island.resources.every(id=>FANTASY_ITEMS.some(item=>item.id===id)));
  const routes=FANTASY_ROUTES.filter(route=>route.from===island.id||route.to===island.id);
  assert.deepEqual(routes,[{from:'saffron-port',to:island.id,mode:'sea',hours:3}]);
  assert.ok(FANTASY_LOCATIONS.filter(place=>place.id!==island.id).every(place=>Math.hypot(place.x-island.x,place.y-island.y)>150),'new shoreline and icon have space between existing locations');
});

test('ordinary visits, old maps, early chapters and all rare races cannot expose or reach the island before chapter seventeen',()=>{
  const p=fresh(),c=p.character!;
  c.visited=FANTASY_LOCATIONS.map(place=>place.id);c.charted=[FANTASY_FINAL_ISLE_ID];
  c.completed=Array.from({length:16},(_,index)=>`main-night-${String(index+1).padStart(2,'0')}`);
  assert.equal(fantasyIsleAccess(c),false);assert.ok(!fantasyKnownLocations(c).includes(FANTASY_FINAL_ISLE_ID));
  assert.ok(!fantasyFrontierLocations(c).includes(FANTASY_FINAL_ISLE_ID));
  assert.ok(FANTASY_MAPS.every(map=>!map.locationIds.includes(FANTASY_FINAL_ISLE_ID)),'no ordinary or legacy chart contains the story island');
  for(const race of FANTASY_RACES){
    c.race=race.id;c.buff={effect:'travel',power:100};
    assert.deepEqual(fantasyTransports(c,FANTASY_FINAL_ISLE_ID),[],race.id);
    for(const mode of ['ship','working-ship','airship','gate','foot']){
      const before=structuredClone(p),attempt=startFantasyActivity(p,{type:'travel',destination:FANTASY_FINAL_ISLE_ID,transport:mode},c.hour,()=>.999);
      assert.equal(attempt.changed,false,`${race.id}/${mode}`);assert.ok(attempt.error);assert.deepEqual(p,before);
    }
  }
  c.location=FANTASY_FINAL_ISLE_ID;assert.deepEqual(fantasyFrontierLocations(c),[]);assert.deepEqual(fantasyTransports(c,'saffron-port'),[]);
});

test('chapter seventeen and legacy final completion unlock a permanent chart and only the verified boat passage',()=>{
  for(const quest of [FANTASY_FINAL_ISLE_UNLOCK_QUEST,FANTASY_FINAL_ISLE_LAST_QUEST]){
    const p=fresh(),c=p.character!;c.completed=[quest];
    assert.equal(fantasyIsleAccess(c),true);assert.ok(fantasyKnownLocations(c).includes(FANTASY_FINAL_ISLE_ID));
    assert.ok(fantasyFrontierLocations(c).includes(FANTASY_FINAL_ISLE_ID));
    const choices=fantasyTransports(c,FANTASY_FINAL_ISLE_ID);
    assert.deepEqual(choices.filter(choice=>choice.available).map(choice=>choice.id),['ship','working-ship']);
    const ship=choices.find(choice=>choice.id==='ship')!,free=choices.find(choice=>choice.id==='working-ship')!;
    assert.equal(ship.cost,6);assert.equal(ship.hours,2.25);assert.ok(ship.hours>=2&&ship.hours<=4);
    assert.equal(free.cost,0);assert.equal(free.hours,8);assert.ok(ship.hours<free.hours);
    for(const choice of [ship,free])assert.deepEqual(choice.path,['saffron-port',FANTASY_FINAL_ISLE_ID]);
    c.hour+=1440;assert.ok(fantasyKnownLocations(c).includes(FANTASY_FINAL_ISLE_ID));assert.ok(fantasyIsleAccess(c));
  }
});

test('an actual expedition arrives after its deadline and has a free working-passage return without a village or inn',()=>{
  const p=unlock(),gold=p.character!.gold;
  const sailing=startFantasyActivity(p,{type:'travel',destination:FANTASY_FINAL_ISLE_ID,transport:'ship'},8,()=>.999);
  assert.equal(sailing.error,undefined);assert.ok(sailing.profile.activity);assert.equal(sailing.profile.character!.location,'saffron-port');
  const middle=advanceFantasyWorld(sailing.profile,9).profile;assert.equal(middle.character!.location,'saffron-port');
  const arrived=advanceFantasyWorld(middle,sailing.profile.activity!.endsAt).profile;
  assert.equal(arrived.character!.location,FANTASY_FINAL_ISLE_ID);assert.equal(arrived.character!.gold,gold-6);
  assert.ok(arrived.character!.visited.includes(FANTASY_FINAL_ISLE_ID));assert.equal(arrived.death,undefined);
  arrived.character!.gold=0;
  const returnChoice=fantasyTransports(arrived.character!,'saffron-port').find(choice=>choice.id==='working-ship')!;
  assert.equal(returnChoice.available,true);assert.equal(returnChoice.cost,0);
  const returning=startFantasyActivity(arrived,{type:'travel',destination:'saffron-port',transport:'working-ship'},arrived.character!.hour,()=>.999);
  assert.equal(returning.error,undefined);
  const home=advanceFantasyWorld(returning.profile,returning.profile.activity!.endsAt).profile;
  assert.equal(home.character!.location,'saffron-port');assert.equal(home.character!.gold,0);assert.equal(home.death,undefined);
  assert.ok(fantasyKnownLocations(home.character!).includes(FANTASY_FINAL_ISLE_ID));
  assert.ok(fantasyTransports(home.character!,FANTASY_FINAL_ISLE_ID).find(choice=>choice.id==='working-ship')!.available);
});

test('the actual map component omits the island coast, name and route until its earned chart is known',()=>{
  const p=fresh(),c=p.character!;c.charted=FANTASY_LOCATIONS.map(place=>place.id);
  const render=()=>renderToStaticMarkup(createElement(FantasyMap,{current:c.location,selected:c.location,visited:c.visited,known:fantasyKnownLocations(c),frontier:fantasyFrontierLocations(c),onSelect:()=>{}}));
  const before=render();
  assert.ok(!before.includes('새벽너머섬'));assert.ok(!before.includes('M1049 532'));assert.ok(!before.includes('M1180 730L1080 555'));
  c.completed.push(FANTASY_FINAL_ISLE_UNLOCK_QUEST);
  const after=render();assert.ok(after.includes('새벽너머섬'));assert.ok(after.includes('M1049 532'));assert.ok(after.includes('M1180 730L1080 555'));
  assert.ok(after.includes('fr-fog-mask'));assert.ok(after.includes('fr-fog-feather'));
});
