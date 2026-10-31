import test from 'node:test';
import assert from 'node:assert/strict';
import {applyFantasyAction,newFantasyProfile} from './fantasy-engine.ts';
import {applyFantasyDungeonAction,validFantasyDungeon,fantasyDungeonSiteFor,fantasyDungeonView,markFantasyDungeonVictory,fantasyDungeonQuestProgress} from './fantasy-dungeon.ts';
import {alignFantasyDungeonLayout} from './fantasy-dungeon-party-layout.ts';

test('party layout alignment preserves personal findings and claims across independently generated entrances',()=>{
  let p=applyFantasyAction(newFantasyProfile(),{type:'create',source:'human',name:'Explorer',gender:'female'},()=>.5).profile;
  const c=p.character!;c.location='oldwatch';c.visited.push('oldwatch');
  p=applyFantasyDungeonAction(p,{type:'dungeonEnter',site:'oldwatch'},()=>.1).profile;
  const progress=p.character!.dungeon!.sites.oldwatch;
  progress.inspected.push('entrance');progress.findings.push('entrance');progress.inspectionDays.entrance=Math.floor(c.hour/24);
  const previous=p.character!.inventory;
  assert.equal(alignFantasyDungeonLayout(p.character!,'oldwatch',123456),true);
  assert.equal(p.character!.dungeon!.sites.oldwatch.layoutSeed,123456);
  assert.deepEqual(p.character!.dungeon!.sites.oldwatch.findings,['entrance']);
  assert.deepEqual(p.character!.dungeon!.active,{site:'oldwatch',room:'entrance'});
  assert.deepEqual(p.character!.inventory,previous);assert.ok(validFantasyDungeon(p.character!));
  assert.deepEqual(fantasyDungeonSiteFor(p.character!,'oldwatch'),fantasyDungeonSiteFor({dungeon:{sites:{oldwatch:{...p.character!.dungeon!.sites.oldwatch,layoutSeed:123456}}}},'oldwatch'));
});

test('invalid or missing shared layouts never mutate the member',()=>{
  const p=applyFantasyAction(newFantasyProfile(),{type:'create',source:'human',name:'Explorer',gender:'male'},()=>.5).profile;
  const c=p.character!,before=structuredClone(c);
  assert.equal(alignFantasyDungeonLayout(c,'oldwatch',Number.NaN),false);
  assert.equal(alignFantasyDungeonLayout(c,'not-a-site',1),false);assert.deepEqual(c,before);
});


function expedition(seed=1){let p=applyFantasyAction(newFantasyProfile(),{type:'create',source:'human',name:'Receipt explorer',gender:'female'},()=>.5).profile;p.character!.location='oldwatch';p.character!.visited.push('oldwatch');assert.ok(alignFantasyDungeonLayout(p.character!,'oldwatch',seed));return enter(p);}
function enter(p:ReturnType<typeof newFantasyProfile>){const result=applyFantasyDungeonAction(p,{type:'dungeonEnter',site:'oldwatch'},()=>.999);assert.equal(result.error,undefined);return result.profile;}
function move(p:ReturnType<typeof newFantasyProfile>,target:string){
 const site=fantasyDungeonSiteFor(p.character!,'oldwatch')!,start=p.character!.dungeon!.active!.room,paths=[[start]],seen=new Set([start]);let path:string[]|undefined;
 while(paths.length){const route=paths.shift()!;if(route.at(-1)===target){path=route;break;}for(const id of site.rooms.find(room=>room.id===route.at(-1))!.exits)if(!seen.has(id)){seen.add(id);paths.push([...route,id]);}}
 assert.ok(path);
 for(const room of path.slice(1)){markFantasyDungeonVictory(p.character!,`oldwatch:${p.character!.dungeon!.active!.room}`);const result=applyFantasyDungeonAction(p,{type:'dungeonMove',room},()=>.999);assert.equal(result.error,undefined);p=result.profile;}
 return p;
}
function leave(p:ReturnType<typeof newFantasyProfile>){p=move(p,'entrance');const result=applyFantasyDungeonAction(p,{type:'dungeonExit'});assert.equal(result.error,undefined);return result.profile;}

test('earned treasure and same-day inspection receipts survive real moves across a smaller party map and back',()=>{
 let p=move(expedition(),'chamber-9');p=applyFantasyDungeonAction(p,{type:'dungeonInspect'},()=>.999).profile;p=applyFantasyDungeonAction(p,{type:'dungeonInteract'},()=>.999).profile;const paid=p.character!.gold;
 assert.ok(p.character!.dungeon!.sites.oldwatch.claimed.includes('chamber-9'));p=leave(p);assert.ok(alignFantasyDungeonLayout(p.character!,'oldwatch',7));assert.equal(fantasyDungeonSiteFor(p.character!,'oldwatch')!.rooms.some(room=>room.id==='chamber-9'),false);
 const q={objective:{type:'dungeon' as const,site:'oldwatch',goal:'inspect' as const,count:3}};assert.equal(fantasyDungeonQuestProgress(p.character!,q),1);
 p=leave(enter(p));assert.ok(alignFantasyDungeonLayout(p.character!,'oldwatch',1));p=move(enter(JSON.parse(JSON.stringify(p))),'chamber-9');
 const before=structuredClone(p),reward=applyFantasyDungeonAction(p,{type:'dungeonInteract'},()=>.999),inspect=applyFantasyDungeonAction(p,{type:'dungeonInspect'},()=>.999);
 assert.ok(reward.error);assert.equal(reward.changed,false);assert.equal(reward.profile.character!.gold,paid);assert.ok(inspect.error);assert.equal(inspect.changed,false);assert.deepEqual(p,before);assert.equal(fantasyDungeonView(p.character!,'en')!.canInteract,false);assert.equal(fantasyDungeonView(p.character!,'en')!.canInspect,false);assert.ok(validFantasyDungeon(p.character!));
});

test('one-shot special choices remain consumed after joining a legacy layout and returning to the generated expedition',()=>{
 let p=move(expedition(),'chamber-1');p.character!.hp=1;const chosen=applyFantasyDungeonAction(p,{type:'dungeonChoose',choice:'touch'},()=>.999);assert.equal(chosen.error,undefined);p=leave(chosen.profile);
 assert.ok(alignFantasyDungeonLayout(p.character!,'oldwatch',undefined));assert.equal(fantasyDungeonSiteFor(p.character!,'oldwatch')!.rooms.length,5);p=leave(enter(p));assert.ok(alignFantasyDungeonLayout(p.character!,'oldwatch',1));p=move(enter(p),'chamber-1');p.character!.hp=1;
 const result=applyFantasyDungeonAction(p,{type:'dungeonChoose',choice:'touch'},()=>.999);assert.ok(result.error);assert.equal(result.profile.character!.hp,1);assert.equal(fantasyDungeonView(p.character!,'en')!.special!.claimed,true);
});

test('cross-layout memory validates a bounded room namespace, complete receipt shapes and historical days',()=>{
 let p=move(expedition(),'chamber-9');p=applyFantasyDungeonAction(p,{type:'dungeonInspect'},()=>.999).profile;p=applyFantasyDungeonAction(p,{type:'dungeonInteract'},()=>.999).profile;p=leave(p);assert.ok(alignFantasyDungeonLayout(p.character!,'oldwatch',7));
 const original=structuredClone(p.character!),valid=original.dungeon!.memory!.oldwatch;assert.ok(validFantasyDungeon(original));
 const variants=[{...valid,claimed:['chamber-14']},{...valid,claimed:['chamber-4']},{...valid,claimed:['entrance']},{...valid,claimed:['chamber-9','chamber-9']},{...valid,findings:['invented-room']},{...valid,inspectionDays:{'chamber-9':-1}},{...valid,inspectionDays:{'chamber-9':.5}},{...valid,inspectionDays:{'chamber-9':Math.floor(original.hour/24)+1}},{...valid,inspectionDays:{'chamber-99':0}},{...valid,extra:1},{claimed:[],inspectionDays:{}}];
 for(const memory of variants){const forged=structuredClone(original);forged.dungeon!.memory!.oldwatch=memory as never;assert.equal(validFantasyDungeon(forged),false);const before=structuredClone(forged);assert.equal(alignFantasyDungeonLayout(forged,'oldwatch',1),false);assert.deepEqual(forged,before);}
 const legacy=structuredClone(original);delete legacy.dungeon!.memory;assert.ok(validFantasyDungeon(legacy));
});

test('failed inspections keep their same-day cooldown through layout changes without creating quest findings',()=>{
 let p=move(expedition(),'chamber-9');const failed=applyFantasyDungeonAction(p,{type:'dungeonInspect'},()=>0);assert.equal(failed.error,undefined);p=leave(failed.profile);assert.ok(alignFantasyDungeonLayout(p.character!,'oldwatch',7));assert.ok(alignFantasyDungeonLayout(p.character!,'oldwatch',1));p=move(enter(p),'chamber-9');
 assert.ok(applyFantasyDungeonAction(p,{type:'dungeonInspect'},()=>.999).error);assert.equal(fantasyDungeonQuestProgress(p.character!,{objective:{type:'dungeon',site:'oldwatch',goal:'inspect',count:3}}),0);
 p.character!.hour=24;const nextDay=applyFantasyDungeonAction(p,{type:'dungeonInspect'},()=>.999);assert.equal(nextDay.error,undefined);assert.ok(validFantasyDungeon(nextDay.profile.character!));
});
