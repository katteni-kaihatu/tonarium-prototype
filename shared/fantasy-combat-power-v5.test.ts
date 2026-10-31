import test from 'node:test';
import assert from 'node:assert/strict';
import {fantasyCombatPower} from './fantasy-adventurer.ts';
import type {FantasyCombatSkill} from './fantasy-combat.ts';
const stats={hp:300,mp:60,attack:60,defense:20,agility:20,intelligence:30,accuracy:80,magicResist:20};
const names={ko:'평가',en:'Rating',ja:'評価'};
const skill=(patch:Partial<FantasyCombatSkill>={}):FantasyCombatSkill=>({id:'art',names,kind:'attack',power:30,mp:10,range:'melee',reach:1,...patch});
const rate=(s=stats,skills:FantasyCombatSkill[]=[])=>fantasyCombatPower(s,{range:'melee',skills});

test('modern agility includes incoming evasion in addition to the legacy outgoing bonus',()=>{
 assert.ok(rate({...stats,agility:80})/rate(stats)>fantasyCombatPower({...stats,agility:80})/fantasyCombatPower(stats)*1.01);
});

test('unused MP is not phantom strength while affordable casts retain their shared budget',()=>{
 assert.equal(rate({...stats,mp:0}),rate({...stats,mp:1000000}));
 assert.ok(rate({...stats,mp:60},[skill()])>rate({...stats,mp:10},[skill()]));
 assert.equal(rate(stats,[skill({mp:61})]),rate(stats));
});

test('explicit fire and poison fields count sustained damage without rewarding cold as damage over time',()=>{
 const s={...stats,mp:1000};const attack=skill({mp:0});
 assert.ok(rate(s,[{...attack,field:'fire'}])>rate(s,[attack]));
 assert.ok(rate(s,[{...attack,field:'poison'}])>rate(s,[attack]));
 assert.equal(rate(s,[{...attack,onHit:{id:'frost',power:5,chance:1,turns:3}}]),rate(s,[attack]));
 assert.ok(rate(s,[{...attack,onHit:{id:'poison',power:5,chance:1,turns:3}}])>rate(s,[attack]));
 const legacy={...attack,reach:undefined};assert.equal(rate(s,[{...legacy,field:'fire'}]),rate(s,[legacy]));
 assert.equal(rate(s,[{...legacy,effects:{slow:1}}]),rate(s,[legacy]));
});

test('additional reach and advance pay MP without stacking duplicate skillbook credits',()=>{
 const attack=skill({reach:4,motion:{kind:'advance',distance:3}});
 assert.equal(rate(stats,[attack,attack,{...attack,id:'duplicate'}]),rate(stats,[attack]));
 assert.equal(rate({...stats,mp:0},[attack]),rate({...stats,mp:0}));
});

test('useful defensive agility never decreases the assessment',()=>{
 let previous=0;for(let agility=0;agility<=100;agility++){
  const current=rate({...stats,agility});assert.ok(current>=previous);previous=current;
 }
});

test('legacy stat-only and no-capability estimates retain their original contract',()=>{
 assert.equal(fantasyCombatPower(stats),170);assert.equal(fantasyCombatPower(stats,{range:'ranged'}),177);
});


test('the real third movement tile has conditional warning-survival value',()=>{
 assert.ok(rate({...stats,agility:20})>rate({...stats,agility:19})*1.025);
 const reposition=skill({kind:'focus',power:1,mp:10,selfOnly:true,motion:{kind:'reposition',distance:6}});
 const slow={...stats,agility:19};assert.ok(rate(slow,[reposition])>rate(slow));
 assert.equal(rate(slow,[{...reposition,motion:{kind:'reposition',distance:3}}]),rate(slow,[reposition]));
 assert.equal(rate(stats,[{...reposition,mp:61}]),rate(stats));
});
