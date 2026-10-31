import test from 'node:test';
import assert from 'node:assert/strict';
import { createFantasyCombat, submitFantasyCombatOrder, fantasyCombatOrderError, fantasyCombatTelegraph, validFantasyCombatState, type FantasyCombatPlayer, type FantasyCombatState, type FantasyCombatOrder } from './fantasy-combat.ts';
import { fantasyCombatMoveRange, fantasyCombatDistance, fantasyCombatPath, fantasyCombatTileKey } from './fantasy-combat-tactics.ts';

const player=(id='p',x=1):FantasyCombatPlayer=>({id,userId:id,names:{ko:id,en:id,ja:id},stats:{hp:5000,mp:100,attack:10,defense:10,agility:x,intelligence:10,accuracy:90,magicResist:10},hp:5000,mp:100,position:'front',range:'ranged',skills:[],generation:1});
function battle(enemy='monster-forest-wolf',seed=71){const s=createFantasyCombat({id:'enemy-art-test',location:'sunmeadow',source:`hunt:${enemy}`,players:[player()],enemies:[{id:'foe',template:enemy}],seed,hour:108,tactical:true});s.fighters[0].tile={x:2,y:4};s.fighters[1].tile={x:4,y:4};return s;}
function order(state:FantasyCombatState,action:FantasyCombatOrder={type:'guard'}){const r=submitFantasyCombatOrder(state,'p',state.revision,action,state.hour);assert.equal(r.error,undefined);assert.ok(r.changed);assert.ok(validFantasyCombatState(r.state));return r.state;}
function prepared(enemy='monster-forest-wolf'){
 let s=battle(enemy);
 for(let i=0;i<8;i++){const hp=s.fighters[0].hp,mp=s.fighters[1].mp;const n=order(s);if(n.fighters[1].enemyCharge)return {state:n,hp,mp};s=n;}
 throw Error('No prepared attack');
}
test('new enemies expose trait skills and spend a whole turn preparing their locked area',()=>{
 const initial=battle();assert.ok(initial.fighters[1].skills.length>=2);
 const {state,hp,mp}=prepared(),foe=state.fighters[1],charge=foe.enemyCharge!;
 assert.equal(state.fighters[0].hp,hp);
 assert.equal(charge.resolvesRound,charge.preparedRound+1);assert.equal(state.round,charge.resolvesRound);
 assert.ok(charge.tiles.length);assert.equal(new Set(charge.tiles.map(fantasyCombatTileKey)).size,charge.tiles.length);
 assert.equal(foe.mp,mp-foe.skills.find(s=>s.id===charge.skill)!.mp);
 assert.ok(state.logs.some(log=>log.presentation?.kind==='prepare'&&log.presentation.skill===charge.skill));
});
test('a slow player can leave the displayed charge before the faster enemy releases without retargeting',()=>{
 const {state}=prepared(),actor=state.fighters[0],charge=structuredClone(state.fighters[1].enemyCharge!),danger=new Set(charge.tiles.map(fantasyCombatTileKey));
 const field=state.battlefield!,safe=Array.from({length:field.width*field.height},(_,i)=>({x:i%field.width,y:Math.floor(i/field.width)})).find(tile=>!danger.has(fantasyCombatTileKey(tile))&&fantasyCombatDistance(actor.tile!,tile)<=fantasyCombatMoveRange(actor)&&!fantasyCombatOrderError(state,'p',{type:'moveTo',tile}));
 assert.ok(safe);assert.ok(state.fighters[1].stats.agility>actor.stats.agility);
 const hp=actor.hp,next=order(state,{type:'moveTo',tile:safe});assert.equal(next.fighters[0].hp,hp);assert.equal(next.fighters[1].enemyCharge,undefined);
 const cast=next.logs.find(log=>log.round===charge.resolvesRound&&log.presentation?.skill===charge.skill&&log.presentation.kind==='attack');
 assert.deepEqual(cast?.presentation?.tiles,charge.tiles);
});
test('magical preparation spends MP once and silence cancels the release without a refund',()=>{
 const {state,mp}=prepared('monster-lich'),enemy=state.fighters[1],charge=enemy.enemyCharge!,spent=mp-enemy.mp;assert.ok(spent>0);
 enemy.conditions=[{id:'silence',power:3,turns:3}];const hp=state.fighters[0].hp,next=order(state);
 assert.equal(next.fighters[0].hp,hp);assert.equal(next.fighters[1].mp,mp-spent);assert.equal(next.fighters[1].enemyCharge,undefined);
});
test('pending attacks survive reload but reject forged shapes, duplicate tiles, timing and player charges',()=>{
 const {state}=prepared();assert.ok(validFantasyCombatState(JSON.parse(JSON.stringify(state))));
 for(const mutate of [
  (s:FantasyCombatState)=>s.fighters[1].enemyCharge!.resolvesRound++,
  (s:FantasyCombatState)=>s.fighters[1].enemyCharge!.tiles.push({...s.fighters[1].enemyCharge!.tiles[0]}),
  (s:FantasyCombatState)=>s.fighters[1].enemyCharge!.skill='unknown-art',
  (s:FantasyCombatState)=>s.fighters[0].enemyCharge=structuredClone(s.fighters[1].enemyCharge),
  (s:FantasyCombatState)=>s.fighters[1].enemyCharge!.tiles.push({x:99,y:99}),
 ]){const forged=structuredClone(state);mutate(forged);assert.equal(validFantasyCombatState(forged),false);}
});
test('old saved enemies without skill metadata remain valid and can finish ordinary turns',()=>{
 const s=battle();s.fighters[1].skills=[];assert.ok(validFantasyCombatState(s));const n=order(s);assert.equal(n.fighters[1].enemyCharge,undefined);
});
test('a pending charge cannot enlarge its canonical area by modifying the saved enemy skill',()=>{
 const {state}=prepared('monster-lich'),charge=state.fighters[1].enemyCharge!,skill=state.fighters[1].skills.find(skill=>skill.id===charge.skill)!;
 skill.radius=4;skill.reach=12;charge.tiles.push({x:charge.target.x,y:charge.target.y+3});
 assert.equal(validFantasyCombatState(state),false);
});
test('prepared attacks deliver materially more damage than ordinary attacks after spending a turn',()=>{
 let ordinary=0,charged=0;
 for(let seed=1;seed<=32;seed++){
  let s=battle('monster-forest-wolf',seed);s.fighters[1].tile={x:3,y:4};
  let hp=s.fighters[0].hp;s=order(s,{type:'attack',target:'foe'});ordinary+=hp-s.fighters[0].hp;
  hp=s.fighters[0].hp;s=order(s,{type:'attack',target:'foe'});assert.ok(s.fighters[1].enemyCharge);assert.equal(s.fighters[0].hp,hp);
  hp=s.fighters[0].hp;s=order(s,{type:'attack',target:'foe'});charged+=hp-s.fighters[0].hp;
 }
 assert.ok(ordinary>0);assert.ok(charged>ordinary*1.5,`${charged} vs ${ordinary}`);
});
test('one prepared area independently rolls against each party member inside its marked tiles',()=>{
 let s=createFantasyCombat({id:'party-charge',location:'sunmeadow',source:'hunt:monster-lich',players:[player('p'),player('q')],enemies:[{id:'foe',template:'monster-lich'}],seed:2,hour:108,tactical:true});
 s.fighters[0].tile={x:2,y:4};s.fighters[1].tile={x:2,y:5};s.fighters[2].tile={x:4,y:4};
 const nextRound=(state:FantasyCombatState)=>{for(const id of ['p','q']){const r=submitFantasyCombatOrder(state,id,state.revision,{type:'guard'},state.hour);assert.equal(r.error,undefined);state=r.state;}return state;};
 for(let i=0;i<6&&!s.fighters[2].enemyCharge;i++)s=nextRound(s);
 const charge=s.fighters[2].enemyCharge!;assert.ok(charge);const inside=s.fighters.filter(f=>f.side==='players'&&charge.tiles.some(tile=>fantasyCombatTileKey(tile)===fantasyCombatTileKey(f.tile!)));
 assert.equal(inside.length,2);s=nextRound(s);
 const targets=s.logs.filter(log=>log.round===charge.resolvesRound&&log.roll&&log.presentation?.skill===charge.skill).map(log=>log.presentation!.target);
 assert.deepEqual(new Set(targets),new Set(inside.map(f=>f.id)));assert.ok(validFantasyCombatState(s));
});
test('enemy intent names the pending skill and exact release round in every supported language',()=>{
 const {state}=prepared('monster-lich'),enemy=state.fighters[1],pending=enemy.enemyCharge!,skill=enemy.skills.find(skill=>skill.id===pending.skill)!;
 for(const locale of ['ko','en','ja'] as const){const message=fantasyCombatTelegraph(enemy,state.round,locale);assert.ok(message.includes(skill.names[locale]));assert.ok(message.includes(String(pending.resolvesRound)));}
});
