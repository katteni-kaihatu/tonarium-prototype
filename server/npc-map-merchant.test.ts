import test from 'node:test';
import assert from 'node:assert/strict';
import { NpcChat,npcSystemPrompt } from './npc.ts';
import { applyFantasyAction,newFantasyProfile } from '../shared/fantasy-engine.ts';
import { fantasyEconomyState,newFantasyEconomyLedger } from '../shared/fantasy-economy.ts';
import { FANTASY_MAP_MERCHANT_EVENT,FANTASY_MAP_MERCHANT_NPC } from '../shared/fantasy-map-merchant.ts';
import { FANTASY_MAPS } from '../shared/fantasy-town.ts';
const context=()=>{const p=applyFantasyAction(newFantasyProfile(),{type:'create',name:'Road visitor',source:'human',gender:'female'},()=>.5).profile;p.event=FANTASY_MAP_MERCHANT_EVENT;p.character!.location='greenwood';p.character!.visited.push('greenwood');p.character!.hour=12;p.character!.travelPosition={from:'hearth',to:'greenwood',fraction:.5};const merchant=fantasyEconomyState(newFantasyEconomyLedger(),new Map([['a',p]]),'a',{hour:12,peers:['a']}).merchant!;return {character:p.character!,travelEncounter:FANTASY_MAP_MERCHANT_EVENT,merchant};};
const ask=(text:string,locale:'ko'|'en'|'ja'='en')=>({requestId:crypto.randomUUID(),npcId:FANTASY_MAP_MERCHANT_NPC,locale,text});
test('travel-only merchant speech requires a trusted actual daylight encounter instead of a forged request or fixed hometown',async()=>{
 let calls=0;const service=new NpcChat({url:'http://127.0.0.1:18081/v1',fetch:(async()=>{calls++;throw Error('must not fetch');}) as typeof fetch}),c=context();
 assert.equal((await service.chat('missing',ask('What maps do you sell?'),{character:{...c.character,location:'hearth'}})).error,'invalid');
 assert.equal((await service.chat('forged',{...ask('What maps do you sell?'),travelEncounter:FANTASY_MAP_MERCHANT_EVENT} as any,{character:c.character})).error,'invalid');
 assert.equal((await service.chat('night',ask('What maps do you sell?'),{...c,character:{...c.character,hour:20}})).error,'invalid');assert.equal(calls,0);
});
test('road merchant answers exact current map prices and remaining stock canonically in all three languages',async()=>{
 let calls=0;const service=new NpcChat({url:'http://127.0.0.1:18081/v1',fetch:(async()=>{calls++;throw Error('must not fetch');}) as typeof fetch}),c=context();
 for(const [locale,text]of [['ko','어떤 지도를 얼마에 팔아요?'],['en','What maps do you sell and how much do they cost?'],['ja','どんな地図をいくらで売っていますか？']] as const){const reply=await service.chat(locale,ask(text,locale),c);assert.equal(reply.error,undefined);assert.equal(reply.source,'canon');for(const offer of c.merchant.offers){assert.ok(reply.text.includes(FANTASY_MAPS.find(map=>map.item===offer.item)!.name[locale]),reply.text);assert.ok(reply.text.includes(String(offer.unitPrice)),reply.text);}assert.doesNotMatch(reply.text,/Hearth|ハース|하스/);}
 assert.equal(calls,0);
});
test('unprepared cartographer dialogue reaches inference with current merchant premises and no fictional hometown stock',async()=>{
 const bodies:any[]=[];const c=context(),service=new NpcChat({url:'http://127.0.0.1:18081/v1',fetch:(async(_url,init)=>{bodies.push(JSON.parse(String(init?.body)));return new Response(JSON.stringify({choices:[{message:{role:'assistant',content:'A quiet pause can make the road feel shorter.'}}]}),{status:200,headers:{'Content-Type':'application/json'}});}) as typeof fetch});
 const result=await service.chat('free',ask('A quiet evening sounds pleasant.'),c);assert.equal(result.error,undefined);assert.equal(result.source,'local');assert.equal(bodies.length,1);
 const prompt=bodies[0].messages.map((message:any)=>message.content).join('\n');for(const offer of c.merchant.offers)assert.ok(prompt.includes(String(offer.unitPrice))&&prompt.includes(offer.item),prompt);
 assert.doesNotMatch(npcSystemPrompt('en',FANTASY_MAP_MERCHANT_NPC,'stranger',c,'A quiet evening sounds pleasant.'),/lives in Hearth|works in Hearth|market in Hearth|home in Hearth/i);
});
test('an invented merchant stock or magical map claim from inference is replaced by current verified stock',async()=>{
 const c=context(),service=new NpcChat({url:'http://127.0.0.1:18081/v1',fetch:(async()=>new Response(JSON.stringify({choices:[{message:{role:'assistant',content:'At my Hearth market I sell a teleportation map for 1 gold.'}}]}),{status:200,headers:{'Content-Type':'application/json'}})) as typeof fetch});
 const reply=await service.chat('fabrication',ask('A quiet evening sounds pleasant.'),c);assert.equal(reply.error,undefined);assert.equal(reply.source,'canon');assert.doesNotMatch(reply.text,/teleportation|Hearth market|1 gold\./);for(const offer of c.merchant.offers)assert.ok(reply.text.includes(String(offer.unitPrice)));
});
test('a remaining-stock question reflects depletion without treating old dialogue as inventory',async()=>{
 const c=context(),service=new NpcChat({url:'http://127.0.0.1:18081/v1',fetch:(async()=>{throw Error('stock is already verified');}) as typeof fetch,onError:()=>{}});
 const reply=await service.chat('remaining',ask('How many are left?'),c);assert.equal(reply.error,undefined);assert.equal(reply.source,'canon');
 const empty={...c,merchant:{...c.merchant,revision:c.merchant.revision+1,offers:[]}};
 const sold=await service.chat('remaining',ask('How many are left?'),empty);assert.equal(sold.error,undefined);assert.equal(sold.source,'canon');assert.match(sold.text,/sold out|sold/i);
});
test('unverified magical map capabilities never pass through free merchant inference',async()=>{
 for(const answer of ['This map teleports you into the unopened vault.','이 마법지도는 보물이 있는 방으로 보내 줍니다.','この魔法地図で宝物室へ飛べます。']){
  const c=context(),service=new NpcChat({url:'http://127.0.0.1:18081/v1',fetch:(async()=>new Response(JSON.stringify({choices:[{message:{role:'assistant',content:answer}}]}),{status:200,headers:{'Content-Type':'application/json'}})) as typeof fetch});
  const reply=await service.chat('magic-claim',ask('A quiet evening sounds pleasant.'),c);assert.equal(reply.error,undefined);assert.equal(reply.source,'canon',answer);assert.notEqual(reply.text,answer);
 }
});
