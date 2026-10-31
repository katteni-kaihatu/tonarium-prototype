import test from 'node:test';
import assert from 'node:assert/strict';
import { createFantasyCombat, fantasyCombatOrderError, submitFantasyCombatOrder, validFantasyCombatState, type FantasyCombatPlayer } from './fantasy-combat.ts';
import { fantasyCombatMoveAttempt } from './fantasy-combat-move-attempt.ts';
const player:FantasyCombatPlayer={id:'p',userId:'p',names:{ko:'p',en:'p',ja:'p'},stats:{hp:5000,mp:50,attack:10,defense:10,agility:1,intelligence:10,accuracy:80,magicResist:10},hp:5000,mp:50,position:'front',range:'melee',skills:[],generation:1};
function setup(seed:number){const s=createFantasyCombat({id:'overrun-test',source:'hunt:monster-forest-wolf',location:'sunmeadow',players:[player],enemies:[{id:'foe',template:'monster-forest-wolf'}],seed,hour:108,tactical:true});s.battlefield={width:10,height:8,blocked:[],cover:[]};s.fighters[0].tile={x:1,y:1};s.fighters[1].tile={x:8,y:7};s.fighters[1].skills=[];return s;}
test('ordinary AGI distance is guaranteed without an extra movement roll',()=>{
 const s=setup(1),actor=s.fighters[0],destination={x:1,y:3},preview=fantasyCombatMoveAttempt(s,actor,destination)!;assert.equal(preview.extra,0);
 const r=submitFantasyCombatOrder(s,'p',s.revision,{type:'moveTo',tile:destination},s.hour);assert.equal(r.error,undefined);assert.deepEqual(r.state.fighters[0].tile,destination);assert.ok(!r.state.logs.some(log=>log.text.en.includes('overextended move')));
});
test('a longer route rolls once and either reaches the selected tile or the exact guaranteed prefix',()=>{
 let success=0,failed=0;
 for(let seed=1;seed<=100;seed++){
  const s=setup(seed),destination={x:1,y:4},preview=fantasyCombatMoveAttempt(s,s.fighters[0],destination)!;assert.equal(preview.chance,.15);assert.equal(fantasyCombatOrderError(s,'p',{type:'moveTo',tile:destination}),undefined);
  const original=structuredClone(s),r=submitFantasyCombatOrder(s,'p',s.revision,{type:'moveTo',tile:destination},s.hour);assert.equal(r.error,undefined);assert.deepEqual(s,original);assert.ok(validFantasyCombatState(r.state));
  const rolls=r.state.logs.filter(log=>log.text.en.includes('overextended move'));assert.equal(rolls.length,1);const roll=rolls[0].roll!;assert.equal(roll.sides,20);assert.equal(roll.target,18);
  assert.deepEqual(r.state.fighters[0].tile,roll.success?destination:preview.failureTile);if(roll.success)success++;else failed++;
 }
 assert.ok(success>0&&failed>0);
});
test('blocked, occupied and rooted routes remain impossible rather than becoming lucky teleports',()=>{
 const s=setup(1);s.battlefield!.blocked=[{x:1,y:2},{x:0,y:1},{x:2,y:1},{x:1,y:0}];assert.equal(fantasyCombatOrderError(s,'p',{type:'moveTo',tile:{x:1,y:4}}),'blocked');
 const rooted=setup(2);rooted.fighters[0].conditions=[{id:'root',power:1,turns:3}];assert.equal(fantasyCombatOrderError(rooted,'p',{type:'moveTo',tile:{x:1,y:4}}),'blocked');
});
