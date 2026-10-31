import test from 'node:test';
import assert from 'node:assert/strict';
import { createFantasyCombat, fantasyCombatOrderError, advanceFantasyCombat, type FantasyCombatPlayer, validFantasyCombatState } from './fantasy-combat.ts';
import { FANTASY_COMBAT_ENEMIES } from './fantasy-combat-catalog.ts';
import { fantasyLastDawnAvailable, refreshFantasyMiracleAwakening, castFantasyMiracle } from './fantasy-miracle-combat.ts';
import { FANTASY_LAST_DAWN, FANTASY_LAST_DAWN_SKILL } from './fantasy-miracle-catalog.ts';

function fixture(tier=8,count=5){
 const template=FANTASY_COMBAT_ENEMIES.find(enemy=>enemy.tier===tier)!;
 const players:FantasyCombatPlayer[]=Array.from({length:count},(_,i)=>({id:`hero-${i}`,userId:`user-${i}`,generation:1,names:{ko:`인물${i}`,en:`Hero ${i}`,ja:`人物${i}`},
 stats:{hp:200,mp:100,attack:30,defense:20,agility:100,intelligence:40,accuracy:90,magicResist:10},hp:200,mp:100,position:'front',range:'magic',skills:[],vocation:i===0?{job:'priest',path:'priest-saint'}:{job:'warrior'}}));
 const state=createFantasyCombat({id:'last-dawn-check',location:'oldwatch',source:`apex:${template.id}`,players,enemies:[{id:'boss',template:template.id}],hour:12,seed:42,tactical:true});
 const actor=state.fighters[0],enemy=state.fighters.find(f=>f.side==='enemies')!;
 actor.hp=40;actor.mp=15;
 for(const ally of state.fighters.filter(f=>f.side==='players'&&f.id!==actor.id).slice(0,3)){ally.hp=0;ally.miracles={downedKind:'damage',severity:2};}
 return {state,actor,enemy};
}

test('Last Dawn ignores HP/MP ratios but still requires a conscious saint',()=>{
 const {state,actor}=fixture();assert.equal(fantasyLastDawnAvailable(state,actor),true);
 for(const [hp,mp] of [[1,0],[100,15],[101,100],[200,0],[200,100]]){const f=fixture();f.actor.hp=hp;f.actor.mp=mp;assert.equal(fantasyLastDawnAvailable(f.state,f.actor),true,`HP ${hp}, MP ${mp}`);}
 for(const change of [(a:typeof actor)=>a.hp=0,(a:typeof actor)=>a.fled=true,(a:typeof actor)=>a.miracles={dawnDebt:true},(a:typeof actor)=>a.vocation={job:'mage'},(a:typeof actor)=>a.vocation={job:'priest',path:'priest-paladin'}]){
  const f=fixture();change(f.actor);assert.equal(fantasyLastDawnAvailable(f.state,f.actor),false);
 }
});
test('strict majority of other present players, never summons or solo, is required',()=>{
 const f=fixture(),allies=f.state.fighters.filter(a=>a.side==='players'&&a.id!==f.actor.id);
 allies[2].hp=100;assert.equal(fantasyLastDawnAvailable(f.state,f.actor),false);
 allies[2].hp=0;assert.equal(fantasyLastDawnAvailable(f.state,f.actor),true);
 allies[0].fled=true;allies[1].fled=true;assert.equal(fantasyLastDawnAvailable(f.state,f.actor),false);
 const solo=fixture(8,1);assert.equal(fantasyLastDawnAvailable(solo.state,solo.actor),false);
});
test('all tier7 and tier8 enemies qualify regardless of stats; fallen/fled/lesser enemies never qualify',()=>{
 const f=fixture(7);f.enemy.stats.attack=1;f.actor.stats.defense=10000;assert.equal(fantasyLastDawnAvailable(f.state,f.actor),true);
 for(const template of FANTASY_COMBAT_ENEMIES.filter(enemy=>enemy.tier>=7)){const g=fixture(template.tier);g.enemy.template=template.id;g.enemy.stats.attack=1;g.actor.stats.defense=10000;assert.equal(fantasyLastDawnAvailable(g.state,g.actor),true,template.names.ko);}
 f.enemy.hp=0;assert.equal(fantasyLastDawnAvailable(f.state,f.actor),false);
 f.enemy.hp=10;f.enemy.fled=true;assert.equal(fantasyLastDawnAvailable(f.state,f.actor),false);
 const weak=fixture(6);weak.enemy.stats.attack=10000;assert.equal(fantasyLastDawnAvailable(weak.state,weak.actor),false);
 for(const status of ['victory','defeat','escaped'] as const){const g=fixture();g.state.status=status;assert.equal(fantasyLastDawnAvailable(g.state,g.actor),false);}
});
test('temporary unlock is announced once, removed after recovery and protected against stale skill orders',()=>{
 const {state,actor,enemy}=fixture(),announcements:string[]=[];
 refreshFantasyMiracleAwakening(state,t=>announcements.push(t.ko));refreshFantasyMiracleAwakening(state,t=>announcements.push(t.ko));
 assert.equal(announcements.length,1);assert.equal(actor.skills.filter(s=>s.id===FANTASY_LAST_DAWN).length,1);assert.ok(validFantasyCombatState(state));
 assert.equal(fantasyCombatOrderError(state,'user-0',{type:'skill',skill:FANTASY_LAST_DAWN,target:enemy.id}),undefined);
 actor.hp=200;actor.mp=100;assert.equal(fantasyLastDawnAvailable(state,actor),true);state.fighters[1].hp=100;assert.equal(fantasyCombatOrderError(state,'user-0',{type:'skill',skill:FANTASY_LAST_DAWN,target:enemy.id}),'unnecessary');
 refreshFantasyMiracleAwakening(state);assert.ok(!actor.skills.some(s=>s.id===FANTASY_LAST_DAWN));
});
test('round resolution actually creates awakening log and usable temporary skill',()=>{
 const {state,enemy}=fixture();state.battlefield={width:10,height:8,blocked:[],cover:[],obstacles:[]};enemy.tile={x:9,y:7};
 const result=advanceFantasyCombat(state,state.deadline);assert.equal(result.error,undefined);assert.equal(result.changed,true);
 assert.ok(validFantasyCombatState(result.state));assert.ok(result.state.fighters[0].skills.some(s=>s.id===FANTASY_LAST_DAWN),JSON.stringify({status:result.state.status,actors:result.state.fighters.map(a=>({id:a.id,hp:a.hp,mp:a.mp,ward:a.ward,fled:a.fled})),logs:result.state.logs.slice(-5)}));
 assert.ok(result.state.logs.some(log=>log.presentation?.skill==='miracle-last-dawn-awakening'));
});
test('full-field cast bypasses range/armor, revives wounded allies and binds the caster sacrifice',()=>{
 const {state,actor,enemy}=fixture();refreshFantasyMiracleAwakening(state);
 state.battlefield={width:10,height:8,blocked:[{x:5,y:3}],cover:[],obstacles:[]};actor.tile={x:0,y:0};enemy.tile={x:9,y:7};enemy.stats.magicResist=10000;
 const wounded=state.fighters[1];wounded.tile={x:8,y:7};const before=enemy.hp;
 assert.equal(castFantasyMiracle(state,actor,undefined,FANTASY_LAST_DAWN_SKILL,()=>{}),true);
 assert.ok(enemy.hp<before);assert.ok(wounded.hp>0);assert.equal(actor.hp,0);assert.equal(actor.miracles?.downedKind,'sacrifice');assert.equal(actor.miracles?.dawnDebt,true);
 assert.equal(fantasyLastDawnAvailable(state,actor),false);
});
test('Last Dawn cannot bypass the sacrifice by using the obstacle-break action',()=>{
 const {state,actor}=fixture();refreshFantasyMiracleAwakening(state);actor.tile={x:1,y:1};
 state.battlefield={width:10,height:8,blocked:[],cover:[],obstacles:[{kind:'thick-vine',tile:{x:2,y:1},hp:6}]};
 assert.equal(fantasyCombatOrderError(state,'user-0',{type:'break',tile:{x:2,y:1},skill:FANTASY_LAST_DAWN}),'blocked');
});

test('multiple saints awaken separately and a prior revival invalidates another queued sacrifice',()=>{
 const {state,actor,enemy}=fixture();const other=state.fighters[4];other.vocation={job:'priest',path:'priest-saint'};
 const notices:string[]=[];refreshFantasyMiracleAwakening(state,(_text,event)=>notices.push(event!.actor));assert.deepEqual(notices,[actor.id,other.id]);
 assert.equal(castFantasyMiracle(state,actor,enemy,FANTASY_LAST_DAWN_SKILL,()=>{}),true);
 assert.equal(fantasyCombatOrderError(state,other.userId!,{type:'skill',skill:FANTASY_LAST_DAWN,target:enemy.id}),'unnecessary');
 refreshFantasyMiracleAwakening(state);assert.ok(!other.skills.some(s=>s.id===FANTASY_LAST_DAWN));
});
