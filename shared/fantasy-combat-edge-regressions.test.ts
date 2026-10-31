import test from 'node:test';
import assert from 'node:assert/strict';
import {createFantasyCombat,submitFantasyCombatOrder,validFantasyCombatState,type FantasyCombatPlayer} from './fantasy-combat.ts';
import {fantasyCombatMoveAttempt} from './fantasy-combat-move-attempt.ts';
const player=(id:string):FantasyCombatPlayer=>({id,userId:id,generation:1,names:{ko:id,en:id,ja:id},stats:{hp:5000,mp:50,attack:10,defense:10,agility:1,intelligence:10,accuracy:80,magicResist:10},hp:5000,mp:50,range:'melee',position:'front',skills:[]});
function battle(seed=1,party=false,template='monster-forest-wolf'){const state=createFantasyCombat({id:'edge-regression',location:'hearth',source:'hunt:monster-forest-wolf',hour:108,seed,tactical:true,players:party?[player('p'),player('q')]:[player('p')],enemies:[{id:'foe',template}]});state.battlefield={width:10,height:8,blocked:[],cover:[]};return state;}

test('failed overrun stops before a passable obstacle rather than saving an actor on it',()=>{
 const state=battle(),actor=state.fighters[0],foe=state.fighters[1];actor.tile={x:1,y:1};actor.body={small:true};foe.tile={x:9,y:7};foe.skills=[];
 state.battlefield!.obstacles=[{kind:'low-wall',tile:{x:3,y:1},hp:8}];assert.ok(validFantasyCombatState(state));
 const preview=fantasyCombatMoveAttempt(state,actor,{x:4,y:1})!;assert.deepEqual(preview.failureTile,{x:2,y:1});
 const result=submitFantasyCombatOrder(state,'p',state.revision,{type:'moveTo',tile:{x:4,y:1}},108);assert.equal(result.error,undefined);assert.ok(validFantasyCombatState(result.state));
 assert.deepEqual(result.state.fighters[0].tile,preview.failureTile);assert.equal(result.state.logs.find(log=>log.text.en.includes('overextended move'))!.roll!.success,false);
 assert.ok(!result.state.logs.some(log=>log.text.en.includes('passage succeeded')));
});
test('a single enemy approach emits exactly one movement presentation',()=>{
 const state=battle();state.fighters[0].tile={x:1,y:1};state.fighters[1].tile={x:9,y:7};
 const result=submitFantasyCombatOrder(state,'p',state.revision,{type:'guard'},108);assert.equal(result.error,undefined);
 const moves=result.state.logs.filter(log=>log.presentation?.kind==='move'&&log.presentation.actor===state.fighters[1].id);assert.equal(moves.length,1);
 assert.deepEqual(moves[0].presentation!.to,result.state.fighters[1].tile);
});
test('an enemy killed by reflected damage cannot continue attacking the remaining area victims',()=>{
 let state=battle(2,true);state.round=4;state.fighters[0].tile={x:4,y:3};state.fighters[1].tile={x:4,y:4};state.fighters[2].tile={x:5,y:3};state.fighters[2].hp=1;
 for(const actor of state.fighters.slice(0,2))actor.conditions=[{id:'thorns',power:10,turns:3}];
 for(const id of ['p','q']){const result=submitFantasyCombatOrder(state,id,state.revision,{type:'guard'},108);assert.equal(result.error,undefined);state=result.state;}
 assert.ok(validFantasyCombatState(state));assert.equal(state.fighters[2].hp,0);assert.equal(state.fighters.slice(0,2).filter(actor=>actor.hp<actor.stats.hp).length,1);
});

test('life drain does not resurrect an enemy killed by the first victim reflection',()=>{
 let state=battle(2,true,'monster-wight');state.round=2;state.fighters[0].tile={x:4,y:3};state.fighters[1].tile={x:4,y:4};state.fighters[2].tile={x:5,y:3};state.fighters[2].hp=1;
 for(const actor of state.fighters.slice(0,2))actor.conditions=[{id:'thorns',power:10,turns:3}];
 for(let round=0;round<2;round++)for(const id of ['p','q']){const result=submitFantasyCombatOrder(state,id,state.revision,{type:'guard'},108);assert.equal(result.error,undefined);state=result.state;}
 assert.ok(validFantasyCombatState(state));assert.equal(state.fighters[2].hp,0);assert.equal(state.fighters.slice(0,2).filter(actor=>actor.hp<actor.stats.hp).length,1);
});
