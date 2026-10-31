import assert from 'node:assert/strict';
import test from 'node:test';
import { createFantasyCombat, fantasyCombatOrderError, submitFantasyCombatOrder } from '../shared/fantasy-combat.ts';
import { fantasyCombatPlayer } from '../server/fantasy-combat-adapter.ts';
import { createBenchmarkProfile, benchmarkOrder } from './fantasy-balance-fixtures.ts';
import { partyBenchmarkOrder, runPartyBattle } from './fantasy-party-balance-report.ts';

test('six identical jobs resolve actual rounds with distinct participant identities', () => {
  const players = Array.from({length:6},(_,index)=>fantasyCombatPlayer(createBenchmarkProfile('human','warrior','basic',20,300,'full'),`p${index}`));
  const result = runPartyBattle(players, ['monster-meadow-slime'], 10001);
  assert.equal(result.error, undefined);
  assert.equal(result.outcome, 'victory');
  assert.equal(result.participants.length, 6);
  assert.equal(new Set(result.participants.map(player=>player.id)).size,6);
  assert.ok(result.submittedOrders >= 6);
  assert.ok(result.participants.every(player=>player.contribution.manualActions>0));
});

test('duplicate companion member types under different owners remain distinct legal units', () => {
  const players = ['a','b','c','d','e','f'].map(id=>fantasyCombatPlayer(createBenchmarkProfile('human','leader','basic',20,300,'full',true),id));
  const result = runPartyBattle(players, ['monster-meadow-slime'], 10001);
  assert.equal(result.error, undefined);
  assert.equal(result.units.length,12);
  assert.equal(new Set(result.units.map(unit=>unit.id)).size,result.units.length);
  assert.ok(result.units.every(unit=>unit.contribution.manualActions>0));
  assert.equal(result.scalingParticipants,6);
});

test('bard can spend a real mana support action on an exhausted allied caster', () => {
  const players = ['bard','mage'].map((job,index)=>fantasyCombatPlayer(createBenchmarkProfile('human',job,'basic',20,300,'full'),`p${index}`));
  const state = createFantasyCombat({id:'mana-test',location:'sunmeadow',source:'apex:party-test',hour:108,seed:1,tactical:true,players,enemies:[{id:'foe',template:'monster-ogre'}]});
  const ally=state.fighters.find(player=>player.userId==='p1')!; ally.mp=0;
  const order=partyBenchmarkOrder(state,{},'p0');
  assert.ok(order.type==='skill' && order.target===ally.id);
  assert.equal(order.type==='skill'&&players[0].skills.find(skill=>skill.id===order.skill)?.kind,'mana');
  assert.equal(fantasyCombatOrderError(state,'p0',order),undefined);
});

test('party policy heals an injured ally using a legal actual skill', () => {
  const players = ['priest','warrior'].map((job,index)=>fantasyCombatPlayer(createBenchmarkProfile('human',job,'basic',20,300,'full'),`p${index}`));
  const state = createFantasyCombat({id:'heal-test',location:'sunmeadow',source:'apex:party-test',hour:108,seed:1,tactical:true,players,enemies:[{id:'foe',template:'monster-meadow-slime'}]});
  const ally=state.fighters.find(player=>player.userId==='p1')!; ally.hp=1;
  const order=partyBenchmarkOrder(state,{},'p0');
  assert.equal(order.type,'skill');
  assert.ok(order.type==='skill' && order.target===ally.id);
  assert.equal(fantasyCombatOrderError(state,'p0',order),undefined);
});

test('fixed two-enemy roster keeps unique identities and resolves real rounds', () => {
  const players=['warrior','archer','priest'].map((job,index)=>fantasyCombatPlayer(createBenchmarkProfile('human',job,'basic',20,300,'full'),`p${index}`));
  const result=runPartyBattle(players,['monster-flame-lizard','monster-stone-golem'],31001);
  assert.equal(result.error,undefined);
  assert.equal(result.initialEnemies.length,2);
  assert.equal(new Set(result.initialEnemies.map(enemy=>enemy.id)).size,2);
  assert.notEqual(result.outcome,'timeout');
});

test('unengaged support helps an engaged ally or advances instead of recycling a self buff', () => {
  const players=['warrior','archer','bard'].map((job,index)=>fantasyCombatPlayer(createBenchmarkProfile('human',job,'fine',20,300,'full'),`p${index}`));
  const state=createFantasyCombat({id:'support-move-test',location:'sunmeadow',source:'apex:party-test',hour:108,seed:1,tactical:true,players,enemies:[{id:'foe',template:'monster-ogre'}]});
  const order=partyBenchmarkOrder(state,{},'p2');
  const actor=state.fighters.find(fighter=>fighter.userId==='p2')!;
  assert.ok(order.type==='moveTo'||order.type==='skill'&&order.target!==actor.id);
  assert.equal(fantasyCombatOrderError(state,'p2',order),undefined);
});

test('party support preserves the actual charge response before healing an ally in the same danger area',()=>{
 const players=['priest','warrior'].map((job,index)=>fantasyCombatPlayer(createBenchmarkProfile('human',job,'fine',36,1500,'full'),`p${index}`));
 let state=createFantasyCombat({id:'party-charge-test',location:'oldwatch',source:'hunt:monster-lich',hour:108,seed:1,tactical:true,players,enemies:[{id:'foe',template:'monster-lich'}]});
 state.battlefield={width:10,height:8,blocked:[],cover:[]};state.fighters[0].tile={x:1,y:1};state.fighters[1].tile={x:1,y:2};state.fighters[2].tile={x:5,y:1};
 for(let round=0;round<2;round++)for(const id of ['p0','p1']){const r=submitFantasyCombatOrder(state,id,state.revision,{type:'guard'},state.hour);assert.equal(r.error,undefined);state=r.state;}
 assert.ok(state.fighters[2].enemyCharge?.tiles.some(tile=>tile.x===1&&tile.y===1));state.fighters[1].hp=1;
 const solo=benchmarkOrder(state,'prepared',{},undefined,'p0');assert.ok(solo.type==='moveTo'||solo.type==='skillMove');
 assert.deepEqual(partyBenchmarkOrder(state,{},'p0'),solo);
});
