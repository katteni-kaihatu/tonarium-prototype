import test from 'node:test';
import assert from 'node:assert/strict';
import { applyFantasyAction,newFantasyProfile } from './fantasy-engine.ts';
import { applyFantasyEconomyCommand,fantasyEconomyState,isFantasyEconomyCommand,newFantasyEconomyLedger,validFantasyEconomyLedger, fantasyRareMapStock } from './fantasy-economy.ts';
import { FANTASY_MAPS, fantasyBuildingStock } from './fantasy-town.ts';
import { FANTASY_RETREAT_MAPS } from './fantasy-retreats.ts';
const people=()=>{const p=applyFantasyAction(newFantasyProfile(),{type:'create',name:'Map buyer',source:'human',gender:'female'},()=>.5).profile;p.character!.gold=10000;return new Map([['a',p],['b',structuredClone(p)]]);};
const context=(hour=12)=>({hour,peers:['a','b'],token:'merchant-test'});
test('merchant purchases use a strict server command and cannot invent prices or source events',()=>{
 assert.equal(isFantasyEconomyCommand({type:'merchantBuy',item:'map-dungeon-oldwatch',count:1,day:0,revision:0}),true);
 for(const command of [{type:'merchantBuy',item:'map-dungeon-oldwatch',count:2,day:0,revision:0},{type:'merchantBuy',item:'map-dungeon-oldwatch',count:1,day:0,revision:0,price:0}])assert.equal(isFantasyEconomyCommand(command),false);
});
test('a daylight road merchant publishes shared finite offers only for the actual encounter',()=>{
 const profiles=people(),ledger=newFantasyEconomyLedger();
 assert.equal((fantasyEconomyState(ledger,profiles,'a',context()) as any).merchant,undefined);
 for(const p of profiles.values()){p.event='encounter-wandering-merchant';p.character!.travelPosition={from:'hearth',to:'greenwood',fraction:.5};}
 profiles.get('b')!.character!.travelPosition={from:'greenwood',to:'hearth',fraction:.5};
 const view=(fantasyEconomyState(ledger,profiles,'a',context()) as any).merchant;assert.ok(view);assert.ok(view.offers.length>=1&&view.offers.length<=2);assert.ok(view.offers.every((offer:any)=>offer.count===1&&offer.unitPrice>0));
 const offer=view.offers[0],before=profiles.get('a')!.character!.gold;
 const buy=applyFantasyEconomyCommand(ledger,profiles,'a',{type:'merchantBuy',item:offer.item,count:1,day:view.day,revision:view.revision} as any,context());assert.equal(buy.error,undefined);assert.ok(validFantasyEconomyLedger(buy.ledger));
 assert.equal(buy.profiles.get('a')!.character!.gold,before-offer.unitPrice);assert.equal(buy.profiles.get('a')!.character!.inventory[offer.item],1);
 const again=(fantasyEconomyState(JSON.parse(JSON.stringify(buy.ledger)),buy.profiles,'b',context()) as any).merchant;assert.ok(!again.offers.some((value:any)=>value.item===offer.item));
 const stale=applyFantasyEconomyCommand(buy.ledger,buy.profiles,'b',{type:'merchantBuy',item:offer.item,count:1,day:view.day,revision:view.revision} as any,context());assert.equal(stale.error,'stale');assert.deepEqual(stale.ledger,buy.ledger);
 assert.equal((fantasyEconomyState(buy.ledger,buy.profiles,'a',context(18)) as any).merchant,undefined);
});
test('daily market stock does not restock at the former six-hour boundary, and night purchases stay closed',()=>{
 const profiles=people();let ledger=newFantasyEconomyLedger();
 const initial=fantasyEconomyState(ledger,profiles,'a',context()).shops.find(shop=>shop.building==='market')!,herb=initial.lots.find(lot=>lot.item==='herb')!;
 const bought=applyFantasyEconomyCommand(ledger,profiles,'a',{type:'shopBuy',building:'market',item:'herb',count:herb.count,revision:initial.revision},context());assert.equal(bought.error,undefined);ledger=bought.ledger;
 for(const hour of [18,23.99])assert.equal(fantasyEconomyState(ledger,bought.profiles,'b',context(hour)).shops.find(shop=>shop.building==='market')!.lots.find(lot=>lot.item==='herb')!.count,0);
 const reset=fantasyEconomyState(ledger,bought.profiles,'b',context(24)).shops.find(shop=>shop.building==='market')!;assert.equal(reset.lots.find(lot=>lot.item==='herb')!.count,herb.count);
 assert.equal(applyFantasyEconomyCommand(ledger,bought.profiles,'b',{type:'shopBuy',building:'market',item:'herb',count:1,revision:reset.revision},context(24)).error,'closed');
});
test('legacy six-hour epochs migrate once without replenishing already spent stock in the same day',()=>{
 const profiles=people();const synced=applyFantasyEconomyCommand(newFantasyEconomyLedger(),profiles,'a',{type:'sync'},context());const legacy=structuredClone(synced.ledger);
 for(const shop of Object.values(legacy.shops)){delete shop.period;shop.epoch=2;shop.lots=shop.lots.filter(lot=>lot.item!=='herb');}
 assert.ok(validFantasyEconomyLedger(legacy));const upgraded=applyFantasyEconomyCommand(legacy,synced.profiles,'a',{type:'sync'},context(17));assert.equal(upgraded.error,undefined);
 assert.equal(upgraded.ledger.shops['hearth:market'].period,24);assert.equal(upgraded.ledger.shops['hearth:market'].epoch,0);
 assert.equal(fantasyEconomyState(upgraded.ledger,upgraded.profiles,'b',context(17)).shops.find(shop=>shop.building==='market')!.lots.find(lot=>lot.item==='herb')!.count,0);
 const reload=applyFantasyEconomyCommand(JSON.parse(JSON.stringify(upgraded.ledger)),upgraded.profiles,'a',{type:'sync'},context(17));assert.equal(reload.changed,false);assert.equal(reload.ledger.revision,upgraded.ledger.revision);
});
test('standard rare market maps use their daily stock rule and cannot be purchased again by another player',()=>{
 const retreatItems=new Set(FANTASY_RETREAT_MAPS.map(map=>map.item)),marketItems=new Set(fantasyBuildingStock({location:'hearth'},'market'));
 const map=FANTASY_MAPS.find(map=>map.rare&&!retreatItems.has(map.item)&&marketItems.has(map.item))!;assert.ok(map);
 let day=0;while(day<365&&!fantasyRareMapStock('hearth',day,map.item))day++;assert.ok(day<365,'a standard rare map has an actual stocked day');const hour=day*24+12,profiles=people(),ledger=newFantasyEconomyLedger();
 const market=fantasyEconomyState(ledger,profiles,'a',context(hour)).shops.find(shop=>shop.building==='market')!,offer=market.lots.find(lot=>lot.item===map.item)!;assert.equal(offer.count,1);
 const buy=applyFantasyEconomyCommand(ledger,profiles,'a',{type:'shopBuy',building:'market',item:map.item,count:1,revision:market.revision},context(hour));assert.equal(buy.error,undefined);
 const other=fantasyEconomyState(JSON.parse(JSON.stringify(buy.ledger)),buy.profiles,'b',context(hour)).shops.find(shop=>shop.building==='market')!;assert.ok(!other.lots.some(lot=>lot.item===map.item));
 const denied=applyFantasyEconomyCommand(buy.ledger,buy.profiles,'b',{type:'shopBuy',building:'market',item:map.item,count:1,revision:other.revision},context(hour));assert.equal(denied.error,'stock');
 assert.deepEqual(denied.ledger,buy.ledger);assert.deepEqual(denied.profiles,buy.profiles);
});
import { NPC_PUBLIC } from './npc.ts';
import { npcIllustrationUrl } from './npc-portrait-illustrations.ts';
test('the traveling cartographer has a distinct localized profile and an individual raster portrait',()=>{
 const npc=NPC_PUBLIC.find(npc=>npc.id==='wandering-cartographer');assert.ok(npc);
 assert.equal(npc.travelOnly,true);for(const locale of ['ko','en','ja'] as const){assert.ok(npc.name[locale]);assert.ok(npc.role[locale]);assert.ok(npc.personality[locale]);assert.ok(npc.speech[locale]);assert.ok(npc.knownTopics[locale].length);}
 assert.equal(npcIllustrationUrl(npc.id),`/fantasy/npc-illustrations/${npc.id}.webp`);
});
import { fantasyMapMerchantHit,FANTASY_MAP_MERCHANT_EVENT } from './fantasy-map-merchant.ts';
import type { FantasyActivity } from './fantasy.ts';
test('road merchant encounter slots are reproducible, daylight-only and never replay elapsed slots',()=>{
 const plan:FantasyActivity={action:{type:'travel',destination:'greenwood',transport:'foot'},startedAt:6,endsAt:10,seed:0};
 let seed=0;for(;seed<50000;seed++)if(fantasyMapMerchantHit({...plan,seed},10)?.slot===0)break;assert.ok(seed<50000);
 const activity={...plan,seed},hit=fantasyMapMerchantHit(activity,10)!;assert.equal(hit.hour,6+1/12);
 assert.equal(fantasyMapMerchantHit(activity,hit.hour-1e-6),undefined);
 const later=fantasyMapMerchantHit(activity,9.1,9);assert.ok(!later||later.hour>9);
 for(const mode of ['ship','working-ship','airship','gate','escort'])assert.equal(fantasyMapMerchantHit({...activity,action:{type:'travel',destination:'greenwood',transport:mode}},10),undefined);
 assert.equal(fantasyMapMerchantHit({...activity,startedAt:18,endsAt:22},22),undefined);
});
test('merchant authority rejects purchases outside the event, at night or using yesterday quotes without any mutation',()=>{
 const profiles=people(),ledger=newFantasyEconomyLedger();for(const p of profiles.values()){p.event=FANTASY_MAP_MERCHANT_EVENT;p.character!.travelPosition={from:'hearth',to:'greenwood',fraction:.5};}
 const view=fantasyEconomyState(ledger,profiles,'a',context()).merchant!,offer=view.offers[0];
 const command={type:'merchantBuy',item:offer.item,count:1,day:0,revision:0} as const;
 for(const [hour,error]of [[18,'closed'],[36,'stale']]as const){const result=applyFantasyEconomyCommand(ledger,profiles,'a',command,context(hour));assert.equal(result.error,error);assert.deepEqual(result.ledger,ledger);assert.deepEqual(result.profiles,profiles);}
 const absent=structuredClone(profiles);absent.get('a')!.event=null;assert.equal(applyFantasyEconomyCommand(ledger,absent,'a',command,context()).error,'unavailable');
 profiles.get('a')!.character!.gold=0;assert.equal(applyFantasyEconomyCommand(ledger,profiles,'a',command,context()).error,'insufficient-gold');
});
test('merchant saved stock rejects invented maps, replenished quantities and foreign ledger keys',()=>{
 const profiles=people();profiles.get('a')!.event=FANTASY_MAP_MERCHANT_EVENT;profiles.get('a')!.character!.travelPosition={from:'hearth',to:'greenwood',fraction:.5};
 const ledger=newFantasyEconomyLedger(),view=fantasyEconomyState(ledger,profiles,'a',context()).merchant!;
 const buy=applyFantasyEconomyCommand(ledger,profiles,'a',{type:'merchantBuy',item:view.offers[0].item,count:1,day:0,revision:0},context());assert.equal(buy.error,undefined);
 for(const tamper of [(x:typeof buy.ledger)=>{Object.values(x.merchants!)[0].lots[0].count=2;},(x:typeof buy.ledger)=>{Object.values(x.merchants!)[0].lots[0].item='map-unknown';},(x:typeof buy.ledger)=>{x.merchants!['__proto__~constructor']=Object.values(x.merchants!)[0];}]){const copy=structuredClone(buy.ledger);tamper(copy);assert.equal(validFantasyEconomyLedger(copy),false);}
});
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import { FantasyStore } from '../server/fantasy-store.ts';
test('merchant purchase save failure changes nobody, retry saves once and reload retains global depletion',t=>{
 const directory=fs.mkdtempSync(path.join(os.tmpdir(),'fantasy-merchant-'));
 t.after(()=>{assert.equal(path.dirname(path.resolve(directory)),path.resolve(os.tmpdir()));assert.ok(path.basename(directory).startsWith('fantasy-merchant-'));fs.rmSync(directory,{recursive:true,force:true});});
 const file=path.join(directory,'profiles.json'),profiles=people();for(const p of profiles.values()){p.event=FANTASY_MAP_MERCHANT_EVENT;p.character!.hour=12;p.character!.travelPosition={from:'hearth',to:'greenwood',fraction:.5};}
 fs.writeFileSync(file,JSON.stringify(Object.fromEntries(profiles)));let fail=false;
 const opts={worldHour:()=>12,onError:()=>{},save:(target:string,text:string)=>{if(fail)throw Error('merchant test write failure');fs.writeFileSync(target,text);}};
 let store=new FantasyStore(file,opts);assert.equal(store.loadError,undefined);const realm={session:'merchant-world',publicSession:true,peers:['a','b']};
 const view=store.realmState('a',realm).economy.merchant!,offer=view.offers[0];assert.ok(view);
 const command={domain:'economy',command:{type:'merchantBuy',item:offer.item,count:1,day:view.day,revision:view.revision}},before=store.profile('a'),bytes=fs.readFileSync(file,'utf8');
 fail=true;assert.equal(store.realmRequest('a',command,realm).error,'save-failed');assert.deepEqual(store.profile('a'),before);assert.equal(fs.readFileSync(file,'utf8'),bytes);
 fail=false;assert.equal(store.realmRequest('a',command,realm).error,undefined);assert.equal(store.profile('a').character!.inventory[offer.item],1);
 store=new FantasyStore(file,opts);assert.equal(store.loadError,undefined);const other=store.realmState('b',realm).economy.merchant!;assert.ok(!other.offers.some(value=>value.item===offer.item));
 assert.equal(store.realmRequest('b',{...command,command:{...command.command,revision:other.revision}},realm).error,'stock');
});
import { advanceFantasyWorld,startFantasyActivity } from './fantasy-engine.ts';
import { fantasyAmbushHit } from './fantasy-ambush.ts';
test('actual travel meets the cartographer before a later ambush, and leaving awards nothing or invents no travel time',()=>{
 const profiles=people(),p=profiles.get('a')!;let seed=0;
 for(;seed<50000;seed++){const activity:FantasyActivity={action:{type:'travel',destination:'greenwood',transport:'foot'},startedAt:8,endsAt:10,seed};const merchant=fantasyMapMerchantHit(activity,10),ambush=fantasyAmbushHit(activity,10);if(merchant?.slot===0&&(!ambush||ambush.hour>merchant.hour))break;}
 assert.ok(seed<50000);const start=startFantasyActivity(p,{type:'travel',destination:'greenwood',transport:'foot'},8,()=>(seed+.5)/4294967296).profile;
 const met=advanceFantasyWorld(start,start.activity!.endsAt,{ambush:true}).profile;assert.equal(met.event,FANTASY_MAP_MERCHANT_EVENT);assert.equal(met.activity,undefined);assert.ok(met.character!.travelPosition!.fraction>0);
 const before=structuredClone(met.character!),left=applyFantasyAction(met,{type:'event',choice:'leave'},()=>0);assert.equal(left.error,undefined);assert.equal(left.profile.event,null);assert.equal(left.profile.character!.hour,before.hour);assert.equal(left.profile.character!.gold,before.gold);assert.equal(left.profile.character!.xp,before.xp);assert.deepEqual(left.profile.character!.inventory,before.inventory);assert.deepEqual(left.profile.character!.travelPosition,before.travelPosition);
});
