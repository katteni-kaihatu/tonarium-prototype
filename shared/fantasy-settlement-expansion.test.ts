import test from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { FANTASY_LOCATIONS, FANTASY_ROUTES } from './fantasy-data.ts';
import { advanceFantasyWorld, applyFantasyAction, fantasyTransports, newFantasyProfile, startFantasyActivity } from './fantasy-engine.ts';
import { FANTASY_SETTLEMENTS, FANTASY_MAPS, fantasyBuildings, fantasyFrontierLocations, fantasyKnownLocations, fantasyLibraryHoldings } from './fantasy-town.ts';
import { FANTASY_LIBRARY_BOOKS } from './fantasy-library.ts';
import { FANTASY_TERMS } from './fantasy-lore.ts';

const ids = ['inkstone-city','pinewatch','reedcross','canopy-hall','mossbrook','leafshade','sunloom','wellrest','rockshade'];
const fresh = (location: string) => {
  const profile = applyFantasyAction(newFantasyProfile(), { type:'create',name:'Settlement traveler',gender:'female',source:'human' },()=>.5).profile;
  Object.assign(profile.character!, { location,hour:12,gold:5000,hunger:20,fatigue:20,visited:[location],charted:[] });
  return profile;
};

test('every inhabited city, village and port provides an actual inn without filling wilderness with facilities',()=>{
  for(const [id,settlement] of Object.entries(FANTASY_SETTLEMENTS)){
    if(settlement.kind==='tower')continue;
    assert.ok(fantasyBuildings({location:id}).some(building=>building.id==='inn'),id);
    assert.ok(FANTASY_LOCATIONS.find(place=>place.id===id)?.services.includes('inn'),id);
  }
  for(const id of ['greenwood','deepcave','mushroom-isle','starspire'])assert.ok(!fantasyBuildings({location:id}).some(building=>building.id==='inn'),id);
});

test('new settlements are localized, separated and placed within their visible continent coastlines',()=>{
  const source=readFileSync(new URL('../client/src/world/FantasyMap.tsx',import.meta.url),'utf8');
  const polygons=Object.fromEntries([['noctis','east'],['sylvara','southWest'],['kazaran','southEast']].map(([land,key])=>{
    const numbers=source.match(new RegExp(`const ${key} = '([^']+)'`))![1].match(/-?\d+(?:\.\d+)?/g)!.map(Number);
    return [land,Array.from({length:numbers.length/2},(_,i)=>[numbers[i*2],numbers[i*2+1]])];
  }));
  for(const id of ids){
    const place=FANTASY_LOCATIONS.find(place=>place.id===id)!;
    const points=polygons[place.land];let inside=false;
    for(let i=0,j=points.length-1;i<points.length;j=i++){
      const [xi,yi]=points[i],[xj,yj]=points[j];
      if((yi>place.y)!==(yj>place.y)&&place.x<(xj-xi)*(place.y-yi)/(yj-yi)+xi)inside=!inside;
    }
    assert.ok(inside,id);
    for(const other of FANTASY_LOCATIONS.filter(other=>other.id!==id))assert.ok(Math.hypot(place.x-other.x,place.y-other.y)>=60,`${id}/${other.id}`);
    const term=FANTASY_TERMS.find(term=>term.id===id)!;
    for(const locale of ['ko','en','ja'] as const){assert.ok(term.names[locale]);assert.ok(term.summary[locale]);}
  }
});

test('all new settlements have traversable two-way roads and a faster paid carriage',()=>{
  for(const id of ids){
    const road=FANTASY_ROUTES.find(route=>route.mode==='land'&&(route.from===id||route.to===id)&&FANTASY_LOCATIONS.find(place=>place.id===(route.from===id?route.to:route.from))?.kind==='city')!;
    const neighbor=road.from===id?road.to:road.from;
    for(const [from,to] of [[neighbor,id],[id,neighbor]]){
      let profile=fresh(from);const c=profile.character!;
      assert.ok(fantasyFrontierLocations(c).includes(to));
      const routes=fantasyTransports(c,to),foot=routes.find(route=>route.id==='foot')!,carriage=routes.find(route=>route.id==='carriage')!;
      assert.ok(foot.available);assert.ok(carriage.available);assert.ok(carriage.hours<foot.hours);assert.ok(carriage.cost>foot.cost);
      const started=startFantasyActivity(profile,{type:'travel',destination:to,transport:'carriage'},c.hour,()=>.5);
      assert.equal(started.error,undefined);assert.ok(started.profile.activity);
      profile=advanceFantasyWorld(started.profile,started.profile.activity!.endsAt).profile;
      assert.equal(profile.character!.location,to);assert.ok(profile.character!.visited.includes(to));assert.equal(profile.activity,undefined);
    }
  }
});

test('new inns and the meadow inn complete timed lodging and a one-minute meal with recovery',()=>{
  for(const id of [...ids,'sunmeadow']){
    for(const action of [{type:'lodge',room:'common'},{type:'eat',meal:'hearty'}] as const){
      const profile=fresh(id),c=profile.character!;c.hunger=85;c.fatigue=85;c.hp=20;c.mp=1;
      const started=startFantasyActivity(profile,action,c.hour,()=>.5);
      assert.equal(started.error,undefined,`${id}/${action.type}`);assert.ok(started.profile.activity);
      if(action.type==='eat')assert.equal(started.profile.activity!.endsAt-started.profile.activity!.startedAt,.5);
      const completed=advanceFantasyWorld(started.profile,started.profile.activity!.endsAt).profile;
      assert.equal(completed.activity,undefined);assert.ok(completed.character!.gold<c.gold);assert.ok(completed.character!.hp>c.hp);
      if(action.type==='lodge')assert.ok(completed.character!.fatigue<c.fatigue);
      else assert.ok(completed.character!.hunger<c.hunger);
    }
  }
});

test('new libraries keep different valid holdings and small charts reveal only their recorded settlements',()=>{
  const libraries=['inkstone-city','canopy-hall','sunloom'].map(location=>fantasyLibraryHoldings({location}));
  for(const books of libraries){assert.ok(books.includes('traveler-guide'));assert.equal(new Set(books).size,books.length);for(const id of books)assert.ok(FANTASY_LIBRARY_BOOKS.some(book=>book.id===id),id);}
  assert.equal(new Set(libraries.map(books=>JSON.stringify(books))).size,3);
  for(const item of ['map-ink-and-reeds','map-canopy-villages','map-caravan-springs']){
    const map=FANTASY_MAPS.find(map=>map.item===item)!;assert.equal(map.locationIds.length,3);
    const profile=fresh('hearth');profile.character!.inventory[item]=1;
    for(const id of map.locationIds)assert.ok(!fantasyKnownLocations(profile.character!).includes(id));
    const used=applyFantasyAction(profile,{type:'use',item},()=>.5);assert.equal(used.error,undefined);
    for(const id of map.locationIds){assert.ok(fantasyKnownLocations(used.profile.character!).includes(id));assert.ok(!used.profile.character!.visited.includes(id));}
    for(const id of ids.filter(id=>!map.locationIds.includes(id)))assert.ok(!fantasyKnownLocations(used.profile.character!).includes(id));
  }
});
