import assert from 'node:assert/strict';
import test from 'node:test';
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import { execFileSync } from 'node:child_process';
import { fantasyCombatPlayer } from '../server/fantasy-combat-adapter.ts';
import { FANTASY_COMBAT_ENEMIES } from '../shared/fantasy-combat-catalog.ts';
import { createFantasyCombat, fantasyCombatHitChance, fantasyCombatOrderError, type FantasyCombatSkill } from '../shared/fantasy-combat.ts';
import { command as elderBenchmarkCommand, fantasyElderBenchmarkSquad } from '../shared/fantasy-elder-benchmark-fixture.ts';
import { fantasyEnemyAttacks, fantasyEnemyChargeTiles } from '../shared/fantasy-enemy-attacks.ts';
import { fantasyJobHealingBonus } from '../shared/fantasy-job-balance.ts';
import { benchmarkDamageForecast, benchmarkOrder, createBenchmarkProfile } from './fantasy-balance-fixtures.ts';

test('benchmark retinue profile hires and assigns available companions through actual actions', () => {
  for (const job of ['leader', 'crimeboss', 'summoner']) {
    const profile = createBenchmarkProfile('human', job, 'basic', 20, 1000, 'full', true);
    const player = fantasyCombatPlayer(profile, 'reference');
    assert.ok(player.companions?.length, `${job} must have actual assigned companions before scoring`);
    assert.ok(profile.character!.gold < 35 && profile.character!.gold >= 0);
    assert.equal(profile.character!.hp, player.stats.hp);
    assert.equal(profile.character!.mp, player.stats.mp);
  }
});

test('healing cannot claim to prevent ongoing damage when restored HP still cannot survive it', () => {
  const player = fantasyCombatPlayer(createBenchmarkProfile('human', 'priest', 'basic', 1, 30, 'weapon'), 'reference');
  const template = FANTASY_COMBAT_ENEMIES.find(enemy => enemy.kind === 'monster' && enemy.tier === 1)!;
  const state = createFantasyCombat({ id: 'policy-test', location: 'sunmeadow', source: 'hunt:slime', players: [player], enemies: [{ id: 'foe', template: template.id }], seed: 1, hour: 108, tactical: true });
  const actor = state.fighters.find(fighter => fighter.userId === 'reference')!, enemy = state.fighters.find(fighter => fighter.side === 'enemies')!;
  actor.hp = 1; actor.effects = [{ id: 'burn', power: actor.stats.hp * 2, turns: 3 }];
  enemy.stats.attack = actor.stats.hp * 3;
  const selected = benchmarkOrder(state, 'trained', {});
  assert.ok(selected.type !== 'skill' || !actor.skills.some(skill => skill.id === selected.skill && skill.kind === 'heal'), 'an insufficient heal must not be selected as a rescue');
});

test('fixed-level report explicitly records a missing legitimate requested grade', () => {
  const directory = fs.mkdtempSync(path.join(os.tmpdir(), 'fantasy-balance-policy-'));
  const out = path.join(directory, 'report.json');
  try {
    execFileSync(process.execPath, ['--import', 'tsx', 'scripts/fantasy-monster-balance-report.ts', '--jobs', 'warrior', '--grades', '8', '--level', '1', '--loadouts-only', '--report-only', '--out', out]);
    const report = JSON.parse(fs.readFileSync(out, 'utf8'));
    assert.equal(report.loadouts.length, 0);
    assert.equal(report.coverageGaps.length, 1);
    assert.equal(report.coverageGaps[0].grade, 8);
  } finally { fs.rmSync(directory, { recursive: true, force: true }); }
});


test('a silenced breath enemy falls back to its ordinary attack instead of forcing a breath guard', () => {
  const player = fantasyCombatPlayer(createBenchmarkProfile('human', 'warrior', 'basic', 20, 1000, 'full'), 'reference');
  const template = FANTASY_COMBAT_ENEMIES.find(enemy => enemy.pattern === 'breath')!;
  const state = createFantasyCombat({ id: 'silenced-policy', location: 'sunmeadow', source: `hunt:${template.id}`, players: [player], enemies: [{ id: 'foe', template: template.id }], seed: 1, hour: 108 });
  state.round = 3;
  const enemy = state.fighters.find(fighter => fighter.side === 'enemies')!;
  enemy.conditions = [{ id: 'silence', power: 6, turns: 3 }];
  const selected = benchmarkOrder(state, 'trained', {});
  assert.notEqual(selected.type, 'guard');
});

test('a slower healer begins a useful heal before the next enemy pre-heal attack becomes fatal', () => {
  const player = fantasyCombatPlayer(createBenchmarkProfile('human', 'priest', 'basic', 10, 700, 'full'), 'reference');
  // 魔物の調整とは独立した既存の人間敵で、回復の緊急性と有用性を両方確認する。
  const state = createFantasyCombat({ id: 'slow-heal-policy', location: 'sunmeadow', source: 'hunt:human-order-knight', players: [player], enemies: [{ id: 'foe', template: 'human-order-knight' }], seed: 102, hour: 108, tactical: true });
  const actor = state.fighters.find(fighter => fighter.userId === 'reference')!, enemy = state.fighters.find(fighter => fighter.side === 'enemies')!;
  actor.tile = { x: 1, y: 4 }; enemy.tile = { x: 2, y: 4 };
  const covered = fantasyCombatHitChance(state, enemy, actor, undefined, { magic: false, range: enemy.range }).covered;
  const raw = Math.max(1, enemy.stats.attack + (enemy.skills[0]?.power ?? 0) - actor.stats.defense * .7) * (covered ? .75 : 1);
  const normalHit = Math.max(1, Math.round(raw)), criticalHit = Math.max(1, Math.round(raw * 1.4));
  const lower = Math.floor(actor.stats.hp * .5) + 1, upper = Math.min(actor.stats.hp - 1, criticalHit * 2);
  const heals = actor.skills.filter(skill => skill.kind === 'heal' && skill.mp <= actor.mp)
    .map(skill => skill.power + Math.floor(actor.stats.intelligence * .8) + fantasyJobHealingBonus(actor.vocation?.job, actor.stats.hp));
  const usefulHP = Array.from({ length: Math.max(0, upper - lower + 1) }, (_, index) => lower + index)
    .find(hp => heals.some(amount => Math.ceil(Math.min(actor.stats.hp, hp + amount) / normalHit) > Math.ceil(hp / normalHit)));
  assert.notEqual(usefulHP, undefined, 'the real fixture must have useful healing above half HP and inside the two-critical recovery reserve');
  assert.ok(criticalHit * 2 + 1 < actor.stats.hp, 'the same real fixture must also cover nonurgent injured HP');
  assert.ok(actor.stats.agility < enemy.stats.agility);
  actor.hp = usefulHP!;
  const selected = benchmarkOrder(state, 'trained', {});
  assert.ok(selected.type === 'skill' && actor.skills.some(skill => skill.id === selected.skill && skill.kind === 'heal'));
  actor.hp = criticalHit * 2 + 1;
  const nonurgent = benchmarkOrder(state, 'trained', {});
  assert.ok(nonurgent.type !== 'skill' || !actor.skills.some(skill => skill.id === nonurgent.skill && skill.kind === 'heal'));
});

test('a fast healer defers a safe nonurgent heal and can recover before the following enemy turn', () => {
  const player = fantasyCombatPlayer(createBenchmarkProfile('human', 'priest', 'basic', 100, 1500, 'full'), 'reference');
  const state = createFantasyCombat({ id: 'fast-heal-policy', location: 'sunmeadow', source: 'hunt:monster-cliff-wyvern', players: [player], enemies: [{ id: 'foe', template: 'monster-cliff-wyvern' }], seed: 102, hour: 108, tactical: true });
  const actor = state.fighters.find(fighter => fighter.userId === 'reference')!, enemy = state.fighters.find(fighter => fighter.side === 'enemies')!;
  const normalHit = Math.max(1, Math.round(enemy.stats.attack + (enemy.skills[0]?.power ?? 0) - actor.stats.defense * .7));
  actor.hp = Math.ceil(normalHit * 1.8); actor.tile = { x: 1, y: 4 }; enemy.tile = { x: 2, y: 4 };
  assert.ok(actor.hp < actor.stats.hp * .5);
  assert.ok(actor.stats.agility > enemy.stats.agility);
  const selected = benchmarkOrder(state, 'trained', {});
  assert.ok(selected.type !== 'skill' || !actor.skills.some(skill => skill.id === selected.skill && skill.kind === 'heal'));
});

test('a reliable finisher precedes an urgent heal only with safe initiative and recovery after a miss', () => {
  const player = fantasyCombatPlayer(createBenchmarkProfile('human', 'priest', 'basic', 100, 1500, 'full'), 'reference');
  const state = createFantasyCombat({ id: 'safe-finisher-policy', location: 'sunmeadow', source: 'hunt:monster-cliff-wyvern', players: [player], enemies: [{ id: 'foe', template: 'monster-cliff-wyvern' }], seed: 102, hour: 108, tactical: true });
  const actor = state.fighters.find(fighter => fighter.userId === 'reference')!, enemy = state.fighters.find(fighter => fighter.side === 'enemies')!;
  const normalHit = Math.max(1, Math.round(enemy.stats.attack + (enemy.skills[0]?.power ?? 0) - actor.stats.defense * .7));
  actor.hp = Math.ceil(normalHit * 1.45); actor.tile = { x: 1, y: 4 }; enemy.tile = { x: 2, y: 4 }; enemy.hp = 1;
  const selected = benchmarkOrder(state, 'trained', {});
  assert.ok(selected.type === 'attack' || selected.type === 'skill' && actor.skills.some(skill => skill.id === selected.skill && skill.kind === 'attack'));
});

test('a slower healer keeps the heal when deferring would expose two enemy attacks before recovery', () => {
  const player = fantasyCombatPlayer(createBenchmarkProfile('human', 'priest', 'basic', 18, 700, 'full'), 'reference');
  const state = createFantasyCombat({ id: 'slow-recovery-policy', location: 'sunmeadow', source: 'hunt:monster-cliff-wyvern', players: [player], enemies: [{ id: 'foe', template: 'monster-cliff-wyvern' }], seed: 102, hour: 108, tactical: true });
  const actor = state.fighters.find(fighter => fighter.userId === 'reference')!, enemy = state.fighters.find(fighter => fighter.side === 'enemies')!;
  actor.hp = 114; actor.tile = { x: 1, y: 4 }; enemy.tile = { x: 2, y: 4 }; enemy.hp = 1;
  const selected = benchmarkOrder(state, 'trained', {});
  assert.ok(selected.type === 'skill' && actor.skills.some(skill => skill.id === selected.skill && skill.kind === 'heal'));
});

test('a near-certain finisher does not replace healing when a missed attack could be immediately fatal', () => {
  const player = fantasyCombatPlayer(createBenchmarkProfile('human', 'priest', 'basic', 100, 1500, 'full'), 'reference');
  const state = createFantasyCombat({ id: 'risky-finisher-policy', location: 'sunmeadow', source: 'hunt:monster-cliff-wyvern', players: [player], enemies: [{ id: 'foe', template: 'monster-cliff-wyvern' }], seed: 102, hour: 108, tactical: true });
  const actor = state.fighters.find(fighter => fighter.userId === 'reference')!, enemy = state.fighters.find(fighter => fighter.side === 'enemies')!;
  actor.hp = 1; actor.tile = { x: 1, y: 4 }; enemy.tile = { x: 2, y: 4 }; enemy.hp = 1;
  const selected = benchmarkOrder(state, 'trained', {});
  assert.ok(selected.type === 'skill' && actor.skills.some(skill => skill.id === selected.skill && skill.kind === 'heal'));
});

test('a slower healer values the missing HP after the incoming hit rather than pre-hit overheal', () => {
  const player = fantasyCombatPlayer(createBenchmarkProfile('human', 'priest', 'basic', 1, 100, 'weapon'), 'reference');
  const state = createFantasyCombat({ id: 'slow-heal-amount-policy', location: 'sunmeadow', source: 'hunt:monster-restless-zombie', players: [player], enemies: [{ id: 'foe', template: 'monster-restless-zombie' }], seed: 102, hour: 108, tactical: true });
  const actor = state.fighters.find(fighter => fighter.userId === 'reference')!, enemy = state.fighters.find(fighter => fighter.side === 'enemies')!;
  actor.hp = 65; actor.tile = { x: 1, y: 4 }; enemy.tile = { x: 2, y: 4 };
  assert.ok(actor.stats.agility < enemy.stats.agility);
  const healingBase=Math.floor(actor.stats.intelligence*.8)+fantasyJobHealingBonus(actor.vocation?.job,actor.stats.hp);
  const nativeHeal=actor.skills.find(skill=>skill.id==='priest-grace')!.power+healingBase,circleHeal=actor.skills.find(skill=>skill.id==='prepared-spell-2')!.power+healingBase;
  const missingBeforeHit=actor.stats.hp-actor.hp,incoming=Math.max(1,Math.round(enemy.stats.attack+(enemy.skills[0]?.power??0)-actor.stats.defense*.7));
  assert.ok(nativeHeal>missingBeforeHit&&circleHeal>nativeHeal&&circleHeal<=missingBeforeHit+incoming);
  assert.deepEqual(benchmarkOrder(state, 'trained', {}), { type: 'skill', skill: 'prepared-spell-2', target: actor.id });
});


function fixture() {
  const player = fantasyCombatPlayer(createBenchmarkProfile('human', 'warrior', 'basic', 20, 1000, 'full'), 'reference');
  const state = createFantasyCombat({id:'forecast-test',location:'sunmeadow',source:'hunt:human-order-knight',players:[player],enemies:[{id:'foe',template:'human-order-knight'}],seed:1,hour:108,tactical:true});
  state.battlefield = {width:10,height:8,blocked:[],cover:[]};
  const actor = state.fighters.find(fighter=>fighter.userId==='reference')!, enemy=state.fighters.find(fighter=>fighter.side==='enemies')!;
  for (const fighter of [actor,enemy]) {
    fighter.stats = {hp:1000,mp:100,attack:100,defense:20,intelligence:80,magicResist:30,agility:0,accuracy:100};
    fighter.hp=1000;fighter.mp=100;fighter.effects=[];fighter.conditions=[];fighter.ward=0;fighter.skills=[];
    delete fighter.vocation; delete fighter.template; delete fighter.blessing; delete fighter.miracles;delete fighter.aim;
  }
  actor.tile={x:3,y:4};enemy.tile={x:4,y:4};actor.range='melee';enemy.range='melee';
  return {state,actor,enemy};
}
const names={en:'Test',ko:'검사',ja:'検査'};

test('damage forecast uses physical dispatch for explicit reach without magic and weights the natural twenty once',()=>{
  const {state,actor,enemy}=fixture();
  actor.range='magic';
  const skill:FantasyCombatSkill={id:'test-reach',names,kind:'attack',mp:0,power:0,reach:2,range:'magic'};
  assert.deepEqual(benchmarkDamageForecast(state,actor,enemy,skill),{magic:false,chance:.9,normal:86,critical:120,expected:79.1});
  assert.equal(benchmarkDamageForecast(state,actor,enemy,{...skill,reach:undefined}).normal,125);
});

test('damage forecast includes visible damage conditions, blessing, and afflictions before rounding',()=>{
  const {state,actor,enemy}=fixture();
  actor.conditions=[{id:'weaken',power:10,turns:3}];
  enemy.conditions=[{id:'resolve',power:5,turns:3},{id:'vulnerable',power:8,turns:3},{id:'clarity',power:5,turns:3}];
  actor.blessing={power:6,turns:3,owner:'reference',generation:1,skill:'test',mp:0,credited:false};
  actor.miracles={afflictions:['possession']};enemy.miracles={afflictions:['curse']};
  const forecast=benchmarkDamageForecast(state,actor,enemy,{id:'test-magic',names,kind:'attack',mp:0,power:0,magic:true});
  assert.equal(forecast.normal,105);
  assert.equal(forecast.critical,147);
  assert.equal(forecast.expected,96.6);
});

test('damage forecast includes current public rage, cover, guarding and ward without reading random state',()=>{
  const {state,actor,enemy}=fixture();
  actor.template=FANTASY_COMBAT_ENEMIES.find(template=>template.provocationOnly)!.id;
  state.round=23;enemy.guarding=true;enemy.ward=4;state.battlefield!.cover=[{...enemy.tile!}];
  const before=JSON.stringify(state);
  const forecast=benchmarkDamageForecast(state,actor,enemy);
  assert.equal(forecast.normal,23);
  assert.equal(forecast.critical,34);
  state.seed=123456;
  assert.deepEqual(benchmarkDamageForecast(state,actor,enemy),forecast);
  state.seed=JSON.parse(before).seed;
  assert.equal(JSON.stringify(state),before);
});

test('trained policy ranks explicit reach physical skills by actual damage rather than the displayed magic range',()=>{
  const {state,actor,enemy}=fixture();enemy.template='human-order-knight';
  actor.range='melee';
  actor.skills=[{id:'magic-labeled-physical',names,kind:'attack',mp:0,power:0,reach:2,range:'magic'}, {id:'stronger-physical',names,kind:'attack',mp:0,power:50,reach:2,range:'melee'}];
  actor.stats.intelligence=200;
  assert.deepEqual(benchmarkOrder(state,'trained',{}),{type:'skill',skill:'stronger-physical',target:enemy.id});
});

test('trained healer includes public late-fight rage in the two-hit recovery reserve',()=>{
  const {state,actor,enemy}=fixture();enemy.template=FANTASY_COMBAT_ENEMIES.find(template=>template.provocationOnly&&template.pattern==='breath')!.id;
  state.round=50;actor.stats.agility=0;enemy.stats.agility=1;actor.hp=260;
  actor.skills=[{id:'recover',names,kind:'heal',mp:1,power:400}];
  assert.deepEqual(benchmarkOrder(state,'trained',{}),{type:'skill',skill:'recover',target:actor.id});
});



function chargeFixture() {
  const result=fixture(),{state,enemy}=result;enemy.template='human-order-knight';
  state.round=2;
  enemy.skills=[{id:'charged-test',names,kind:'attack',mp:1,power:100,magic:true,range:'magic',reach:8,shape:'burst',radius:2}];
  enemy.enemyCharge={skill:'charged-test',preparedRound:1,resolvesRound:2,origin:{...enemy.tile!},target:{...result.actor.tile!},tiles:[{...result.actor.tile!}]};
  return result;
}

test('trained policy leaves a public locked area using a legal route and does not consult future rolls',()=>{
  const {state,actor,enemy}=chargeFixture();
  const before=JSON.stringify(state),selected=benchmarkOrder(state,'trained',{});
  assert.equal(selected.type,'moveTo');
  assert.equal(JSON.stringify(state),before);
  if(selected.type!=='moveTo')return;
  assert.ok(!enemy.enemyCharge!.tiles.some(tile=>tile.x===selected.tile.x&&tile.y===selected.tile.y));
  assert.equal(fantasyCombatOrderError(state,'reference',selected),undefined);
  state.seed=98765;assert.deepEqual(benchmarkOrder(state,'trained',{}),selected);
});

test('trained policy guards when root or blocked exits prevent leaving the locked area',()=>{
  const {state,actor}=chargeFixture();
  actor.conditions=[{id:'root',power:5,turns:2}];
  assert.deepEqual(benchmarkOrder(state,'trained',{}),{type:'guard'});
  actor.conditions=[];
  state.battlefield!.blocked=[{x:3,y:3},{x:3,y:5},{x:2,y:4}];
  assert.deepEqual(benchmarkOrder(state,'trained',{}),{type:'guard'});
});

test('trained policy avoids damaging fields and additional enemy reach when leaving a locked area',()=>{
  const {state,actor,enemy}=chargeFixture();
  state.fields=[{kind:'fire',tile:{x:2,y:4},power:8,expiresRound:4,source:enemy.id,appliedRound:{}}];
  const extra=structuredClone(enemy);extra.id='extra';extra.enemyCharge=undefined;extra.skills=[];extra.tile={x:3,y:2};extra.range='melee';
  state.fighters.push(extra);
  const selected=benchmarkOrder(state,'trained',{});
  assert.equal(selected.type,'moveTo');
  if(selected.type!=='moveTo')return;
  assert.notDeepEqual(selected.tile,{x:2,y:4});
  assert.ok(Math.abs(selected.tile.x-extra.tile!.x)+Math.abs(selected.tile.y-extra.tile!.y)>1);
});

test('an enemy with populated trait attacks does not force the obsolete every-third-round breath guard',()=>{
  const {state,actor,enemy}=chargeFixture();
  enemy.template=FANTASY_COMBAT_ENEMIES.find(template=>template.pattern==='breath')!.id;
  delete enemy.enemyCharge;state.round=3;
  assert.notEqual(benchmarkOrder(state,'trained',{}).type,'guard');
});



test('trained healer forecasts the public trait spell instead of the old frost pattern physical fallback',()=>{
  const {state,actor,enemy}=fixture();
  const template=FANTASY_COMBAT_ENEMIES.find(template=>template.id==='monster-ancient-frost-dragon')!;
  enemy.template=template.id;enemy.skills=fantasyEnemyAttacks(template);enemy.stats.intelligence=300;enemy.stats.agility=1;
  actor.hp=260;actor.skills=[{id:'recover',names,kind:'heal',mp:1,power:800}];
  assert.deepEqual(benchmarkOrder(state,'trained',{}),{type:'skill',skill:'recover',target:actor.id});
});


test('trained healer accounts for an affordable regular spell when the scheduled charge lacks mana',()=>{
  const {state,actor,enemy}=fixture();
  const template=FANTASY_COMBAT_ENEMIES.find(template=>template.id==='monster-ancient-frost-dragon')!;
  state.round=2;enemy.template=template.id;enemy.skills=fantasyEnemyAttacks(template);enemy.stats.intelligence=300;enemy.stats.agility=1;enemy.mp=5;
  actor.hp=260;actor.skills=[{id:'recover',names,kind:'heal',mp:1,power:800}];
  assert.deepEqual(benchmarkOrder(state,'trained',{}),{type:'skill',skill:'recover',target:actor.id});
});


test('trained healer uses the reachable regular attack instead of the stronger out-of-reach scheduled attack',()=>{
  const {state,actor,enemy}=fixture();
  const template=FANTASY_COMBAT_ENEMIES.find(template=>template.id==='human-order-knight')!;
  enemy.template=template.id;enemy.skills=fantasyEnemyAttacks(template);enemy.tile={x:5,y:4};enemy.stats.agility=1;
  actor.range='ranged';actor.hp=230;actor.skills=[{id:'recover',names,kind:'heal',mp:1,power:400}];
  assert.deepEqual(benchmarkOrder(state,'trained',{}),{type:'attack',target:enemy.id});
});

test('trained healer does not forecast an immediate strike when every enemy attack is out of range',()=>{
  const {state,actor,enemy}=fixture();
  const template=FANTASY_COMBAT_ENEMIES.find(template=>template.id==='human-order-knight')!;
  enemy.template=template.id;enemy.skills=fantasyEnemyAttacks(template);enemy.tile={x:8,y:4};enemy.stats.agility=1;
  actor.range='ranged';actor.hp=230;actor.skills=[{id:'recover',names,kind:'heal',mp:1,power:400}];
  assert.deepEqual(benchmarkOrder(state,'trained',{}),{type:'attack',target:enemy.id});
});

function elderTelegraphFixture() {
  const profiles = new Map([['member-0',fantasyElderBenchmarkSquad(true).get('member-0')!]]);
  const player=fantasyCombatPlayer(profiles.get('member-0')!,'member-0');
  const state=createFantasyCombat({id:'elder-public-tactic',location:'ashpeak',source:'apex:apex-elder-dragon',players:[player],enemies:[{id:'foe',template:'monster-elder-dragon'}],seed:42,hour:108,tactical:true});
  state.battlefield={width:10,height:8,blocked:[],cover:[]};state.round=3;
  const actor=state.fighters[0],enemy=state.fighters[1];actor.tile={x:3,y:4};enemy.tile={x:4,y:4};
  const attack=fantasyEnemyAttacks(FANTASY_COMBAT_ENEMIES.find(template=>template.id===enemy.template)!).find(attack=>attack.prepare)!;
  enemy.enemyCharge={skill:attack.id,preparedRound:2,resolvesRound:3,origin:{...enemy.tile},target:{...actor.tile},tiles:fantasyEnemyChargeTiles(state,enemy,attack,actor.tile)};
  return {state,actor,enemy,profiles};
}

test('legacy party command leaves the actual public dragon charge through a legal safe tile',()=>{
  const {state,actor,enemy,profiles}=elderTelegraphFixture(),before=JSON.stringify(state);
  const selected=elderBenchmarkCommand(state,actor,profiles);
  assert.equal(selected.type,'moveTo');
  assert.equal(JSON.stringify(state),before);
  if(selected.type!=='moveTo')return;
  assert.equal(fantasyCombatOrderError(state,'member-0',selected),undefined);
  assert.ok(!enemy.enemyCharge!.tiles.some(tile=>tile.x===selected.tile.x&&tile.y===selected.tile.y));
});

test('legacy party command guards when root prevents leaving the public dragon charge',()=>{
  const {state,actor,profiles}=elderTelegraphFixture();actor.conditions=[{id:'root',power:3,turns:2}];
  assert.deepEqual(elderBenchmarkCommand(state,actor,profiles),{type:'guard'});
});

test('legacy party command uses an available attack on uncharged third rounds with new enemy skills',()=>{
  const {state,actor,enemy,profiles}=elderTelegraphFixture();delete enemy.enemyCharge;
  assert.notEqual(elderBenchmarkCommand(state,actor,profiles).type,'guard');
});


function silenceChoiceFixture(templateId:string,legacy=false) {
  const result=fixture(),{actor,enemy}=result,template=FANTASY_COMBAT_ENEMIES.find(template=>template.id===templateId)!;
  enemy.template=template.id;enemy.skills=legacy?[]:fantasyEnemyAttacks(template);enemy.stats.intelligence=300;
  actor.skills=[{id:'suppress-casting',names,kind:'hex',utility:'silence',mp:1,power:6,range:'magic'}];
  return result;
}

test('trained policy values silence against the actual new frost spell even though its legacy pattern was physical',()=>{
  const {state,actor,enemy}=silenceChoiceFixture('monster-ancient-frost-dragon');
  assert.deepEqual(benchmarkOrder(state,'trained',{}),{type:'skill',skill:'suppress-casting',target:enemy.id});
});

test('trained policy does not value silence against physical undead attacks merely because the legacy pattern drained magic',()=>{
  const {state,enemy}=silenceChoiceFixture('monster-wight');
  assert.deepEqual(benchmarkOrder(state,'trained',{}),{type:'attack',target:enemy.id});
});

test('trained policy retains silence value for legacy saved magical enemies without trait skills',()=>{
  const {state,enemy}=silenceChoiceFixture('monster-wight',true);
  assert.deepEqual(benchmarkOrder(state,'trained',{}),{type:'skill',skill:'suppress-casting',target:enemy.id});
});

test('mana recovery can fund timely healing before MP is completely exhausted by cheaper attacks',()=>{
  const {state,actor,enemy}=fixture();enemy.template='human-order-knight';enemy.skills=[];
  actor.hp=140;actor.mp=4;actor.skills=[{id:'cheap',names,kind:'attack',mp:1,power:5},{id:'restore-health',names,kind:'heal',mp:10,power:200},{id:'restore-mana',names,kind:'mana',mp:4,power:25}];
  assert.deepEqual(benchmarkOrder(state,'trained',{}),{type:'skill',skill:'restore-mana',target:actor.id});
});

test('mana recovery never spends a fatal turn or restores MP without enabling a useful skill',()=>{
  const {state,actor,enemy}=fixture();enemy.template='human-order-knight';enemy.skills=[];
  actor.mp=4;actor.hp=1;actor.skills=[{id:'heavy',names,kind:'attack',mp:10,power:100},{id:'restore-mana',names,kind:'mana',mp:4,power:25}];
  assert.notDeepEqual(benchmarkOrder(state,'trained',{}),{type:'skill',skill:'restore-mana',target:actor.id});
  actor.hp=actor.stats.hp;actor.skills=actor.skills.filter(skill=>skill.kind==='mana');
  assert.deepEqual(benchmarkOrder(state,'trained',{}),{type:'attack',target:enemy.id});
});

function wideChargeFixture() {
  const result=chargeFixture(),{actor,enemy}=result;
  enemy.enemyCharge!.tiles=Array.from({length:80},(_,index)=>({x:index%10,y:Math.floor(index/10)})).filter(tile=>Math.abs(tile.x-actor.tile!.x)+Math.abs(tile.y-actor.tile!.y)<=2);
  actor.skills=[{id:'safe-reposition',names,kind:'focus',mp:7,power:1,range:'ranged',selfOnly:true,motion:{kind:'reposition',distance:6}}];
  return result;
}

test('public charge response uses an owned affordable reposition when ordinary movement cannot leave the area',()=>{
  const {state,actor,enemy}=wideChargeFixture(),before=JSON.stringify(state);
  const selected=benchmarkOrder(state,'trained',{});
  assert.equal(selected.type,'skillMove');assert.equal(JSON.stringify(state),before);
  if(selected.type!=='skillMove')return;
  assert.equal(selected.skill,'safe-reposition');assert.equal(fantasyCombatOrderError(state,'reference',selected),undefined);
  assert.ok(!enemy.enemyCharge!.tiles.some(tile=>tile.x===selected.tile.x&&tile.y===selected.tile.y));
  actor.mp=6;assert.deepEqual(benchmarkOrder(state,'trained',{}),{type:'guard'});
  actor.mp=100;actor.conditions=[{id:'root',power:1,turns:2}];assert.deepEqual(benchmarkOrder(state,'trained',{}),{type:'guard'});
});

test('public charge response conserves MP when a guaranteed ordinary safe move is available',()=>{
  const {state,actor}=chargeFixture();actor.skills=wideChargeFixture().actor.skills;
  assert.equal(benchmarkOrder(state,'trained',{}).type,'moveTo');
});

test('public charge response prefers a damaging legal dash ending safely over pure reposition',()=>{
  const {state,actor,enemy}=wideChargeFixture();
  const other=structuredClone(enemy);other.id='other';other.enemyCharge=undefined;other.skills=[];other.range='ranged';other.tile={x:3,y:1};
  state.fighters.push(other);
  actor.skills.push({id:'safe-dash',names,kind:'attack',mp:8,power:20,reach:6,range:'melee',motion:{kind:'dash',distance:6}});
  assert.deepEqual(benchmarkOrder(state,'trained',{}),{type:'skill',skill:'safe-dash',target:other.id});
});

test('a preparation turn is not forecast as immediate damage or used to panic-heal instead of a legal finisher',()=>{
 const player=fantasyCombatPlayer(createBenchmarkProfile('human','priest','basic',30,700,'full'),'reference');
 const state=createFantasyCombat({id:'prepare-forecast',location:'sunmeadow',source:'hunt:monster-lich',players:[player],enemies:[{id:'foe',template:'monster-lich'}],seed:2,hour:108,tactical:true});
 state.battlefield={width:10,height:8,blocked:[],cover:[]};state.round=2;
 const actor=state.fighters[0],enemy=state.fighters[1];actor.stats={hp:300,mp:100,attack:50,defense:10,agility:1,intelligence:30,accuracy:90,magicResist:10};actor.hp=200;actor.mp=100;actor.tile={x:1,y:4};actor.skills=[{id:'test-heal',names:{ko:'회복',en:'Heal',ja:'回復'},kind:'heal',power:90,mp:10}];enemy.tile={x:2,y:4};enemy.hp=1;
 assert.ok(fantasyEnemyAttacks(FANTASY_COMBAT_ENEMIES.find(t=>t.id===enemy.template)!).find(t=>t.prepare));
 assert.deepEqual(benchmarkOrder(state,'trained',{}),{type:'attack',target:enemy.id});
});

test('opening focus is not wasted against a ranged enemy that will remain out of melee reach',()=>{
 const player=fantasyCombatPlayer(createBenchmarkProfile('human','warrior','basic',20,100,'full'),'reference');
 const state=createFantasyCombat({id:'focus-ranged',location:'sunmeadow',source:'hunt:monster-lich',players:[player],enemies:[{id:'foe',template:'monster-lich'}],seed:2,hour:108,tactical:true});
 state.battlefield={width:10,height:8,blocked:[],cover:[]};const actor=state.fighters[0];actor.tile={x:1,y:1};state.fighters[1].tile={x:5,y:1};actor.skills=actor.skills.filter(s=>s.id==='human-ingenuity');
 assert.equal(benchmarkOrder(state,'trained',{}).type,'moveTo');
});
test('opening focus remains useful when a nearby melee enemy will approach into reach',()=>{
 const player=fantasyCombatPlayer(createBenchmarkProfile('human','warrior','basic',20,100,'full'),'reference');
 const state=createFantasyCombat({id:'focus-melee',location:'sunmeadow',source:'hunt:monster-forest-wolf',players:[player],enemies:[{id:'foe',template:'monster-forest-wolf'}],seed:2,hour:108,tactical:true});
 state.battlefield={width:10,height:8,blocked:[],cover:[]};const actor=state.fighters[0];actor.tile={x:1,y:1};state.fighters[1].tile={x:4,y:1};actor.skills=actor.skills.filter(s=>s.id==='human-ingenuity');
 assert.deepEqual(benchmarkOrder(state,'trained',{}),{type:'skill',skill:'human-ingenuity',target:actor.id});
});


test('a healthy close fighter can hold against a cheaper guarded charge than the ranged re-approach',()=>{
 const {state,actor,enemy}=fixture();state.round=4;
 actor.stats.agility=20;enemy.template='monster-ancient-storm-dragon';enemy.range='magic';
 const definition=FANTASY_COMBAT_ENEMIES.find(entry=>entry.id===enemy.template)!;
 enemy.skills=fantasyEnemyAttacks(definition);const charge=enemy.skills.find(skill=>(skill as {prepare?:boolean}).prepare)!;
 enemy.enemyCharge={skill:charge.id,preparedRound:3,resolvesRound:4,origin:{...enemy.tile!},target:{...actor.tile!},tiles:fantasyEnemyChargeTiles(state,enemy,charge as ReturnType<typeof fantasyEnemyAttacks>[number],actor.tile!)};
 assert.deepEqual(benchmarkOrder(state,'prepared',{}),{type:'guard'});
 actor.hp=30;
 assert.equal(benchmarkOrder(state,'prepared',{}).type,'moveTo','a nearly defeated actor must still escape');
 actor.hp=actor.stats.hp;actor.range='ranged';
 assert.equal(benchmarkOrder(state,'prepared',{}).type,'moveTo','a ranged actor can keep attacking after dodging');
 actor.range='melee';actor.skills=[{id:'advance',names,kind:'attack',mp:0,power:10,reach:4,range:'melee',magic:false,motion:{kind:'advance',distance:3}}];
 assert.equal(benchmarkOrder(state,'prepared',{}).type,'moveTo','an advance attack can close the gap after dodging');
});
