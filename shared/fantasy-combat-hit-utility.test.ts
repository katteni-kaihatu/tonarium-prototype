import test from 'node:test';
import assert from 'node:assert/strict';
import { createFantasyCombat, submitFantasyCombatOrder, validFantasyCombatState, type FantasyCombatState } from './fantasy-combat.ts';
const names={ko:'방패 강타',en:'Shield strike',ja:'盾の打撃'};
function attack(seed:number){
  const state=createFantasyCombat({id:'hit-utility',location:'greenwood',source:'hunt:monster-forest-wolf',seed,hour:12,tactical:true,
    players:[{id:'p',userId:'u',generation:1,names,stats:{hp:500,mp:100,attack:12,defense:10,agility:20,intelligence:10,accuracy:95,magicResist:10},hp:500,mp:100,position:'front',range:'melee',
      skills:[{id:'shield-strike',names,kind:'attack',mp:8,power:3,range:'melee',reach:1,radius:0,hitUtility:{id:'vulnerable',power:2,chance:1}}]}],
    enemies:[{id:'e',template:'monster-forest-wolf'}]});
  state.fighters[0].tile={x:4,y:2};state.fighters[1].tile={x:5,y:2};state.fighters[1].hp=state.fighters[1].stats.hp=1000;
  return submitFantasyCombatOrder(state,'u',state.revision,{type:'skill',skill:'shield-strike',target:'e'},state.hour);
}
test('secondary attack conditions retain a valid source receipt and allow the next turn',()=>{
  let hits=0;
  for(let seed=1;seed<=20;seed++){
    const result=attack(seed);assert.equal(result.error,undefined);assert.ok(validFantasyCombatState(result.state));
    const condition=result.state.fighters.find(f=>f.id==='e')?.conditions?.find(c=>c.id==='vulnerable');
    if(condition){hits++;assert.equal(condition.source?.skill,'shield-strike');assert.equal(condition.source?.mp,8);
      if(result.state.status==='active'){const next=submitFantasyCombatOrder(result.state,'u',result.state.revision,{type:'guard'},result.state.hour);assert.equal(next.error,undefined);assert.ok(validFantasyCombatState(next.state));}}
  }
  assert.ok(hits>0);
});
test('secondary conditions cannot forge a stronger value, different kind or caster',()=>{
  const result=Array.from({length:20},(_,i)=>attack(i+1)).find(r=>r.state.fighters.find(f=>f.id==='e')?.conditions?.length);
  assert.ok(result);assert.ok(validFantasyCombatState(result.state));
  for(const change of ['power','kind','owner'] as const){
    const state:FantasyCombatState=structuredClone(result.state),condition=state.fighters.find(f=>f.id==='e')!.conditions![0];
    if(change==='power')condition.power=3;else if(change==='kind')condition.id='silence';else condition.source!.owner='intruder';
    assert.equal(validFantasyCombatState(state),false);
  }
});
