import test from 'node:test';
import assert from 'node:assert/strict';
import { fantasyCombatPlayer } from './fantasy-combat-adapter.ts';
import { createBenchmarkProfile } from '../scripts/fantasy-balance-fixtures.ts';
import { fantasyCombatSkillRole } from '../shared/fantasy-combat-capabilities.ts';
import { createFantasyCombat, submitFantasyCombatOrder } from '../shared/fantasy-combat.ts';
import { fantasyJobHealingBonus } from '../shared/fantasy-job-balance.ts';

test('native priest healing keeps its own power rather than silently doubling it, while circle healing stays distinct',()=>{
 const novice=fantasyCombatPlayer(createBenchmarkProfile('human','priest','basic',1,0,'full'),'p');
 assert.equal(novice.skills.find(skill=>skill.id==='priest-grace')!.power,28);
 const trained=fantasyCombatPlayer(createBenchmarkProfile('human','priest','fine',39,1500,'full'),'p');
 assert.equal(trained.skills.find(skill=>skill.id==='priest-grace')!.power,31);
 assert.equal(trained.skills.find(skill=>skill.id==='prepared-spell-2')!.power,38);
});
test('other racial healing still retains its established conversion',()=>{
 assert.equal(fantasyCombatSkillRole({id:'other-heal',name:'Heal',description:'Heal',kind:'active',effect:'heal',power:12,mp:5,stat:'intelligence'},'race','forest-elf')!.power,24);
});
test('native healing still helps another living party member and pays the real mana cost',()=>{
 const healer=fantasyCombatPlayer(createBenchmarkProfile('human','priest','fine',39,1500,'full'),'p');
 const ally={...structuredClone(healer),id:'ally',userId:'ally',hp:1};
 let state=createFantasyCombat({id:'healing-role',location:'oldwatch',source:'hunt:monster-forest-wolf',players:[healer,ally],enemies:[{id:'foe',template:'monster-forest-wolf'}],seed:1,hour:108,tactical:true});
 state.battlefield={width:10,height:8,blocked:[],cover:[]};state.fighters[0].tile={x:1,y:1};state.fighters[1].tile={x:1,y:2};state.fighters[2].tile={x:9,y:7};
 const target=state.fighters[1],before=target.hp,mp=state.fighters[0].mp;
 state=submitFantasyCombatOrder(state,'p',state.revision,{type:'skill',skill:'priest-grace',target:target.id},108).state;
 state=submitFantasyCombatOrder(state,'ally',state.revision,{type:'guard'},108).state;
 assert.equal(state.fighters[1].hp-before,31+Math.floor(healer.stats.intelligence*.8)+fantasyJobHealingBonus('priest',healer.stats.hp));
 assert.equal(state.fighters[0].mp,mp-10);
});
