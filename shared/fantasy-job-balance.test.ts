import { fantasyCombatPower, fantasyAdventurerGrade, fantasyRegularEncounterTier } from './fantasy-adventurer.ts';
import test from 'node:test';
import assert from 'node:assert/strict';
import { fantasyJobCombatProfile, fantasyJobHpMultiplier, fantasyJobMagicAttackRatio, fantasyJobHealingBonus } from './fantasy-job-balance.ts';
import { createFantasyCombat, submitFantasyCombatOrder, validFantasyCombatState } from './fantasy-combat.ts';
import { FANTASY_COMBAT_ENEMIES } from './fantasy-combat-catalog.ts';
import { applyFantasyAction, fantasyStats, newFantasyProfile } from './fantasy-engine.ts';
import { fantasyCombatPlayer } from '../server/fantasy-combat-adapter.ts';
const names={ko:'측정',en:'Measure',ja:'計測'};
test('ordinary combat roles trade spell damage, HP, armor and physical offense without altering special path records',()=>{
  assert.ok(fantasyJobHpMultiplier('mage')<fantasyJobHpMultiplier('warrior'));
  assert.ok(fantasyJobHpMultiplier('shieldbearer')>fantasyJobHpMultiplier('warrior'));
  assert.ok(fantasyJobCombatProfile('shieldbearer').attack<1);
  assert.ok(fantasyJobCombatProfile('shieldbearer').defense>1);
  assert.ok(fantasyJobCombatProfile('mage').intelligence>1);
  assert.ok(fantasyJobMagicAttackRatio('mage')>fantasyJobMagicAttackRatio('priest'));
  assert.deepEqual(fantasyJobCombatProfile('unrecognized-special-path'),{attack:1,defense:1,intelligence:1,magicResist:1});
  assert.equal(fantasyJobHealingBonus('priest',500),20);assert.equal(fantasyJobHealingBonus('mage',500),0);
});
test('adapter derives combat role bonuses once and clamps old HP when maximum HP decreases',()=>{
  const p=applyFantasyAction(newFantasyProfile(),{type:'create',source:'human',name:'Roles',gender:'female'},()=>.5).profile,c=p.character!;
  c.level=30;c.job='mage';c.jobXp.mage=0;c.hp=10000;c.mp=10000;
  const before=structuredClone(p),first=fantasyCombatPlayer(p,'role-user'),second=fantasyCombatPlayer(p,'role-user');
  assert.deepEqual(first,second);assert.deepEqual(p,before);
  assert.equal(first.hp,fantasyStats(c).hp);assert.equal(first.mp,fantasyStats(c).mp);
  assert.ok(first.stats.intelligence>=Math.round(fantasyStats(c).intelligence*fantasyJobCombatProfile('mage').intelligence));
});
test('caster offense bonuses change real attacks and do not leak into unrelated physical jobs',()=>{
  const trial=(job:string|undefined,seed:number)=>{
    const state=createFantasyCombat({id:'role-balance',location:'greenwood',source:'hunt:monster-forest-wolf',seed,hour:12,tactical:false,
      players:[{id:'p',userId:'u',generation:1,names,stats:{hp:1000,mp:100,attack:100,defense:20,intelligence:30,agility:30,accuracy:95,magicResist:20},hp:1000,mp:100,position:'front',range:'magic',skills:[],...(job?{vocation:{job}}:{})}],enemies:[{id:'e',template:'monster-forest-wolf'}]});
    state.fighters[1].hp=state.fighters[1].stats.hp=1000;
    const result=submitFantasyCombatOrder(state,'u',state.revision,{type:'attack',target:'e'},state.hour);assert.equal(result.error,undefined);assert.ok(validFantasyCombatState(result.state));
    return 1000-result.state.fighters[1].hp;
  };
  let improvement=0;
  for(let seed=1;seed<=30;seed++){const plain=trial(undefined,seed);assert.equal(trial('warrior',seed),plain);const mage=trial('mage',seed);assert.ok(mage>=plain);improvement+=mage-plain;}
  assert.ok(improvement>0);
});
test('monster registry is unambiguous across the original and new species variants',()=>{
  assert.equal(new Set(FANTASY_COMBAT_ENEMIES.map(enemy=>enemy.id)).size,FANTASY_COMBAT_ENEMIES.length);
  assert.equal(FANTASY_COMBAT_ENEMIES.find(enemy=>enemy.id==='monster-basilisk')?.tier,4);
  assert.equal(FANTASY_COMBAT_ENEMIES.find(enemy=>enemy.id==='monster-cavern-basilisk')?.tier,5);
  assert.equal(FANTASY_COMBAT_ENEMIES.find(enemy=>enemy.id==='monster-manticore')?.tier,5);
  assert.equal(FANTASY_COMBAT_ENEMIES.find(enemy=>enemy.id==='monster-venom-manticore')?.tier,5);
});

test('guild and encounter power include real spell offense and range while legacy raw-stat references stay stable',()=>{
  const stats={hp:400,mp:300,attack:144,defense:23,agility:27,intelligence:36,accuracy:86,magicResist:25};
  const raw=fantasyCombatPower(stats),mage={range:'magic' as const,vocation:{job:'mage'}},priest={range:'magic' as const,vocation:{job:'priest'}};
  assert.equal(fantasyCombatPower(stats,{range:'melee'}),raw);
  assert.ok(fantasyCombatPower(stats,mage)>raw);
  assert.ok(fantasyCombatPower(stats,mage)>fantasyCombatPower(stats,priest));
  assert.ok(fantasyCombatPower(stats,{range:'ranged'})>raw);
  assert.equal(fantasyRegularEncounterTier(stats,mage),Math.min(6,fantasyAdventurerGrade(stats,mage)));
  assert.equal(fantasyRegularEncounterTier({...stats,hp:10000,attack:1000},mage),6);
});
