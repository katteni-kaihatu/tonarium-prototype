import fs from 'node:fs';
import path from 'node:path';
import { createHash } from 'node:crypto';
import { fileURLToPath } from 'node:url';
import { fantasyCombatPlayer } from '../server/fantasy-combat-adapter.ts';
import { fantasyAdventurerGrade, type FantasyAdventurerGrade } from '../shared/fantasy-adventurer.ts';
import { FANTASY_COMBAT_ENEMIES } from '../shared/fantasy-combat-catalog.ts';
import { fantasyJobHealingBonus, fantasyJobMagicAttackRatio } from '../shared/fantasy-job-balance.ts';
import { fantasyCombatDistance, fantasyCombatLineOfSight, fantasyCombatWithinRange } from '../shared/fantasy-combat-tactics.ts';
import { createFantasyCombat, fantasyCombatHitChance, fantasyCombatOrderError, submitFantasyCombatOrder, validFantasyCombatState,
  type FantasyCombatFighter, type FantasyCombatOptions, type FantasyCombatOrder, type FantasyCombatPlayer, type FantasyCombatState, type FantasyCombatUnitOrder } from '../shared/fantasy-combat.ts';
import { benchmarkOrder, benchmarkSupplies, createBenchmarkProfile, type Gear } from './fantasy-balance-fixtures.ts';

const alive = (fighter: FantasyCombatFighter) => fighter.hp > 0 && !fighter.fled;
const actors = (state: FantasyCombatState) => [...state.fighters,...state.units??[]];
const template = (fighter: FantasyCombatFighter) => FANTASY_COMBAT_ENEMIES.find(enemy=>enemy.id===fighter.template);
const mean = (values: number[]) => values.length ? values.reduce((a,b)=>a+b,0)/values.length : 0;
const sum = (values: number[]) => values.reduce((a,b)=>a+b,0);

function estimatedDamage(state: FantasyCombatState, attacker: FantasyCombatFighter, target: FantasyCombatFighter) {
  const enemy=template(attacker),magic=enemy?['arcane','drain'].includes(enemy.pattern)&&attacker.mp>=4&&!attacker.conditions?.some(condition=>condition.id==='silence'):attacker.range==='magic';
  const raw=magic?attacker.stats.intelligence*1.3+attacker.stats.attack*fantasyJobMagicAttackRatio(attacker.vocation?.job)-target.stats.magicResist*.65:attacker.stats.attack-target.stats.defense*.7;
  return Math.max(1,raw)*fantasyCombatHitChance(state,attacker,target,undefined,{magic,range:attacker.range}).chance;
}

export function partyBenchmarkOrder(state: FantasyCombatState, options: FantasyCombatOptions, playerId: string, unitId?: string): FantasyCombatOrder {
  const actor=actors(state).find(fighter=>unitId?fighter.id===unitId:fighter.userId===playerId)!;
  const allies=actors(state).filter(fighter=>fighter.side==='players'&&alive(fighter)), enemies=state.fighters.filter(fighter=>fighter.side==='enemies'&&alive(fighter));
  const legal=(order:FantasyCombatOrder)=>!fantasyCombatOrderError(state,playerId,unitId?{type:'unit',unit:unitId,order:order as FantasyCombatUnitOrder}:order,options);
  const fallback=benchmarkOrder(state,'prepared',options,unitId,playerId);
  if(actor.tile&&enemies.some(enemy=>enemy.enemyCharge?.resolvesRound===state.round&&enemy.enemyCharge.tiles.some(tile=>tile.x===actor.tile!.x&&tile.y===actor.tile!.y)))return fallback;
  if(enemies.some(enemy=>!enemy.skills.length&&template(enemy)?.pattern==='breath'&&enemy.mp>=6&&state.round%3===0))return fallback;
  const opportunity=Math.max(...enemies.filter(enemy=>legal({type:'attack',target:enemy.id})).map(enemy=>estimatedDamage(state,actor,enemy)),1);
  const incoming=(ally:FantasyCombatFighter)=>sum(enemies.map(enemy=>{
    if(state.battlefield&&!fantasyCombatWithinRange(state,enemy,ally,enemy.range))return 0;
    const reachable=allies.filter(target=>!state.battlefield||fantasyCombatWithinRange(state,enemy,target,enemy.range));
    return estimatedDamage(state,enemy,ally)/Math.max(1,reachable.length);
  }));
  const candidates:{order:FantasyCombatOrder;value:number}[]=[];
  for(const skill of actor.skills.filter(skill=>skill.mp<=actor.mp&&!skill.motion))for(const target of skill.kind==='hex'?enemies:allies){
    const order:FantasyCombatOrder={type:'skill',skill:skill.id,target:target.id}; if(!legal(order))continue;
    const reaches=(ally:FantasyCombatFighter)=>!skill.radius||!target.tile||!ally.tile?ally.id===target.id:fantasyCombatDistance(target.tile,ally.tile)<=skill.radius&&fantasyCombatLineOfSight(state,target.tile,ally.tile);
    const recipients=allies.filter(reaches), turns=Math.min(3,Math.max(1,Math.ceil(sum(enemies.map(enemy=>enemy.hp))/Math.max(1,sum(allies.map(ally=>estimatedDamage(state,ally,enemies[0])))))));
    let value=0;
    if(skill.kind==='heal')value=sum(recipients.map(ally=>Math.min(ally.stats.hp-ally.hp,skill.power+Math.floor(actor.stats.intelligence*.8)+fantasyJobHealingBonus(actor.vocation?.job,actor.stats.hp))*(ally.hp<ally.stats.hp*.4?1.5:1)));
    if(skill.kind==='mana'){
      const restored=Math.min(target.stats.mp-target.mp,skill.power+Math.floor(actor.stats.intelligence*.4));
      const useful=target.skills.filter(ability=>ability.kind==='attack'&&ability.mp>0);
      if(useful.length&&target.mp<Math.min(...useful.map(ability=>ability.mp)))value=restored*2;
    }
    if(skill.kind==='focus'&&!target.aim&&enemies.some(enemy=>!state.battlefield||fantasyCombatWithinRange(state,target,enemy,target.range)))value=estimatedDamage(state,target,enemies[0])*Math.min(.3,skill.power/50)*turns;
    if(skill.kind==='guard')value=sum(recipients.map(ally=>Math.min(incoming(ally),skill.power+Math.floor(actor.stats.intelligence*.3))));
    if(skill.utility&&!target.conditions?.some(condition=>condition.id===skill.utility&&condition.turns>=2)){
      if(skill.utility==='regen')value=sum(recipients.map(ally=>Math.min(ally.stats.hp-ally.hp+incoming(ally),skill.power*turns)));
      if(skill.utility==='resolve')value=sum(recipients.map(ally=>incoming(ally)*Math.min(.3,skill.power*.02)*turns));
      if(skill.utility==='haste')value=sum(recipients.map(ally=>incoming(ally)*Math.min(.15,skill.power*.01)*turns));
      if(skill.utility==='clarity')value=sum(recipients.map(ally=>((enemies.some(enemy=>['arcane','drain'].includes(template(enemy)?.pattern??'')&&enemy.mp>=4)?incoming(ally)*.05:0)+(ally.range==='magic'?estimatedDamage(state,ally,enemies[0])*Math.min(.15,skill.power*.01):0))*turns));
      if(skill.utility==='thorns')value=sum(recipients.map(ally=>Math.min(incoming(ally),skill.power)*turns));
      if(skill.utility==='lifesteal')value=sum(recipients.map(ally=>Math.min(ally.stats.hp-ally.hp,estimatedDamage(state,ally,enemies[0])*Math.min(.3,skill.power*.02)*turns)));
      if(skill.utility==='weaken'||skill.utility==='blind')value=sum(allies.map(ally=>estimatedDamage(state,target,ally)))/Math.max(1,allies.length)*Math.min(.3,skill.power*.02)*turns;
      if(skill.utility==='vulnerable')value=sum(allies.map(ally=>estimatedDamage(state,ally,target)))*Math.min(.35,skill.power*.025)*turns;
    }
    if(value>opportunity*1.1)candidates.push({order,value});
  }
  const best=candidates.sort((a,b)=>b.value-a.value||JSON.stringify(a.order).localeCompare(JSON.stringify(b.order)))[0];
  if(best)return best.order;
  const fallbackSkill=fallback.type==='skill'?actor.skills.find(skill=>skill.id===fallback.skill):undefined;
  return fallbackSkill&&['boon','hex','focus','guard','mana'].includes(fallbackSkill.kind)?benchmarkOrder(state,'basic',options,unitId,playerId):fallback;
}

export function runPartyBattle(players: FantasyCombatPlayer[], enemyIds: string[], seed: number, support = true, maxRounds = 100, supplyGrade:FantasyAdventurerGrade = 6) {
  const options:FantasyCombatOptions={supplies:Object.assign({},...players.map(player=>benchmarkSupplies(player,'prepared',supplyGrade).supplies))};
  let state=createFantasyCombat({id:'party-balance',location:'sunmeadow',source:'apex:party-balance-fixed-field',players:structuredClone(players),
    enemies:enemyIds.map((id,index)=>({id:`enemy-${index}`,template:id,position:'front'})),seed,hour:108,tactical:true});
  const initialEnemies=state.fighters.filter(fighter=>fighter.side==='enemies').map(fighter=>({id:fighter.id,template:fighter.template,stats:fighter.stats,tile:fighter.tile,variation:fighter.variation}));
  const actions:Record<string,number>={},effectiveSkills:Record<string,number>={},damage:Record<string,number>={},healing:Record<string,number>={};
  let submittedOrders=0,items=0,error:string|undefined,lastLog=0;
  while(state.status==='active'&&state.round<=maxRounds){
    const round=state.round;
    const pending:{user:string;unit?:string}[]=[...state.units??[]].filter(unit=>alive(unit)&&state.fighters.some(owner=>owner.userId===unit.companion?.ownerId&&alive(owner)))
      .map(unit=>({user:unit.companion!.ownerId,unit:unit.id}));
    pending.push(...state.fighters.filter(fighter=>fighter.side==='players'&&alive(fighter)).map(fighter=>({user:fighter.userId!,unit:undefined as string|undefined})));
    for(const entry of pending){
      const selected=support?partyBenchmarkOrder(state,options,entry.user,entry.unit):benchmarkOrder(state,'prepared',options,entry.unit,entry.user);
      const order:FantasyCombatOrder=entry.unit?{type:'unit',unit:entry.unit,order:selected as FantasyCombatUnitOrder}:selected;
      const key=`${entry.unit??entry.user}:${selected.type==='skill'?selected.skill:selected.type}`;
      actions[key]=(actions[key]??0)+1;
      const result=submitFantasyCombatOrder(state,entry.user,state.revision,order,state.hour,options);submittedOrders++;
      if(result.error||!result.changed){error=result.error??'no-progress';break;}
      for(const spent of result.spentItems){options.supplies![spent.userId][spent.item].count--;items++;}
      for(const skill of result.usedSkills??[]){const key=`${skill.userId}:${skill.skill}`;effectiveSkills[key]=(effectiveSkills[key]??0)+1;}
      state=result.state;
      for(const log of state.logs.filter(log=>log.id>lastLog)){
        const dealt=log.text.en.match(/: (\d+) damage\.$/); if(dealt&&log.presentation?.kind==='attack')damage[log.presentation.actor]=(damage[log.presentation.actor]??0)+Number(dealt[1]);
        const restored=log.text.en.match(/^(.*?) restores (\d+) HP to /);if(restored)healing[restored[1]]=(healing[restored[1]]??0)+Number(restored[2]);
      }
      lastLog=Math.max(lastLog,...state.logs.map(log=>log.id));
      if(!validFantasyCombatState(state)){error='invalid-state-after-order';break;}
    }
    if(error)break;
    if(state.status==='active'&&state.round===round){error='round-did-not-resolve';break;}
  }
  const projection=(fighter:FantasyCombatFighter)=>({id:fighter.id,userId:fighter.userId,job:fighter.vocation?.job,hp:fighter.hp,mp:fighter.mp,maxHp:fighter.stats.hp,contribution:fighter.contribution,directDamage:damage[fighter.id]??0});
  return {outcome:error?'invalid':state.status==='active'?'timeout':state.status,seed,rounds:state.round,submittedOrders,items,actions,effectiveSkills,healing,
    initialEnemies,scalingParticipants:state.scaling.participantIds.length,participants:state.fighters.filter(fighter=>fighter.side==='players').map(projection),units:(state.units??[]).map(projection),...(error?{error}:{})};
}

interface Scenario {id:string;group:'scaling'|'support'|'retinue';jobs:string[];retinue?:boolean;support?:boolean}
interface PartyRow {
  scenario:string;enemy:string;players:number;companions:number;count:number;wins:number;winRate:number;meanRounds:number;meanLivingPlayers:number;
  meanRemainingHpFraction:number;meanEffectiveActions:number;errors:{seed:number;error?:string}[];timeouts:number;samples:ReturnType<typeof runPartyBattle>[];
}
export function partyScenarios():Scenario[]{
  const dps=['warrior','archer','mage','warrior','archer','mage'];
  return [
    ...Array.from({length:6},(_,index)=>({id:`scale-${index+1}`,group:'scaling' as const,jobs:dps.slice(0,index+1)})),
    ...[3,6].flatMap(size=>['priest','shieldbearer','bard'].flatMap(job=>[true,false].map(support=>({id:`support-${size}-${job}-${support?'team':'self'}`,group:'support' as const,jobs:[...dps.slice(0,size-1),job],support})))),
    ...['summoner','leader','crimeboss'].flatMap(job=>[false,true].map(retinue=>({id:`retinue-${job}-${retinue?'assigned':'none'}`,group:'retinue' as const,jobs:[job],retinue})))
  ];
}

function main(){
  const args=process.argv.slice(2),arg=(name:string,fallback:string)=>args.includes(name)?args[args.indexOf(name)+1]:fallback;
  const count=Number(arg('--seeds','30')),firstSeed=Number(arg('--start-seed','30001')),level=Number(arg('--level','20')),training=Number(arg('--training','300')),gear=arg('--gear','basic') as Gear,supplyGrade=Number(arg('--supply-grade','6')) as FantasyAdventurerGrade;
  if(!Number.isSafeInteger(count)||count<1||!Number.isSafeInteger(firstSeed)||firstSeed<0||firstSeed+count>0x100000000)throw new Error('Invalid seed range');
  if(!Number.isInteger(supplyGrade)||supplyGrade<1||supplyGrade>8)throw new Error('Invalid supply grade');
  const out=arg('--out','work/qa/balance-v3-2026-10-30/party-current.json');
  const enemyIds=arg('--enemies','monster-flame-lizard+monster-stone-golem,monster-ogre,monster-cliff-wyvern,monster-red-dragon,monster-lich').split(',');
  if(enemyIds.some(roster=>roster.split('+').some(id=>!FANTASY_COMBAT_ENEMIES.some(enemy=>enemy.id===id))))throw new Error('Unknown enemy');
  const sourceFiles=[...fs.readdirSync('shared').filter(file=>/^fantasy.*\.ts$/.test(file)&&!file.endsWith('.test.ts')).sort().map(file=>`shared/${file}`),'server/fantasy-combat-adapter.ts','scripts/fantasy-balance-fixtures.ts','scripts/fantasy-party-balance-report.ts'];
  const hashes=()=>Object.fromEntries(sourceFiles.map(file=>[file,createHash('sha256').update(fs.readFileSync(file)).digest('hex')]));
  const sourceHashes=hashes(),coverageGaps:unknown[]=[],loadouts:Record<string,unknown>={};
  const chosen=arg('--scenarios','all'),scenarios=partyScenarios().filter(scenario=>chosen==='all'||chosen.split(',').includes(scenario.id));
  if(!scenarios.length)throw new Error('No matching scenarios');
  const rows:PartyRow[]=[];
  for(const scenario of scenarios){
    let players:FantasyCombatPlayer[];
    try{players=scenario.jobs.map((job,index)=>{const profile=createBenchmarkProfile('human',job,gear,level,training,'full',scenario.retinue),player=fantasyCombatPlayer(profile,`p${index}`); player.names={en:`p${index}-${job}`,ko:`p${index}-${job}`,ja:`p${index}-${job}`}; if(!scenario.retinue)delete player.companions;
      loadouts[`${scenario.id}:p${index}`]={job,level,training,gear,grade:fantasyAdventurerGrade(player.stats,player),stats:player.stats,skills:player.skills,companions:player.companions??[],equipment:profile.character!.equipment,profileHash:createHash('sha256').update(JSON.stringify(profile)).digest('hex')};return player;});}
    catch(error){coverageGaps.push({scenario:scenario.id,error:String(error)});continue;}
    for(const enemy of enemyIds){
      const samples=[];for(let index=0;index<count;index++)samples.push(runPartyBattle(players,enemy.split('+'),firstSeed+index,scenario.support!==false,100,supplyGrade));
      rows.push({scenario:scenario.id,enemy,players:players.length,companions:sum(players.map(player=>player.companions?.length??0)),count,wins:samples.filter(sample=>sample.outcome==='victory').length,
        winRate:mean(samples.map(sample=>Number(sample.outcome==='victory'))),meanRounds:mean(samples.map(sample=>sample.rounds)),meanLivingPlayers:mean(samples.map(sample=>sample.participants.filter(player=>player.hp>0).length)),
        meanRemainingHpFraction:mean(samples.map(sample=>sum(sample.participants.map(player=>player.hp))/sum(sample.participants.map(player=>player.maxHp)))),meanEffectiveActions:mean(samples.map(sample=>sum(sample.participants.map(player=>player.contribution.effectiveActions)))),
        errors:samples.filter(sample=>sample.error).map(sample=>({seed:sample.seed,error:sample.error})),timeouts:samples.filter(sample=>sample.outcome==='timeout').length,samples});
      console.log(`${scenario.id} ${enemy}: ${rows.at(-1)!.wins}/${count}, errors=${rows.at(-1)!.errors.length}`);
    }
  }
  const scalingChecks=enemyIds.map(enemy=>{const selected=rows.filter(row=>row.enemy===enemy&&row.scenario.startsWith('scale-')).sort((a,b)=>a.players-b.players);
    const members=enemy.split('+').map((_,member)=>{const stats=selected.map(row=>({players:row.players,...row.samples[0].initialEnemies[member].stats}));return {member,stats,monotonicHp:stats.every((row,index)=>!index||row.hp>=stats[index-1].hp),monotonicAttack:stats.every((row,index)=>!index||row.attack>=stats[index-1].attack),fixedVariation:new Set(selected.map(row=>row.samples[0].initialEnemies[member].variation)).size<=1};});return {enemy,members};});
  const contrasts=scenarios.filter(scenario=>scenario.group!=='scaling'&&(scenario.group!=='retinue'||scenario.retinue)).flatMap(scenario=>{
    const baseline=scenario.group==='retinue'?scenario.id.replace('assigned','none'):`scale-${scenario.jobs.length}`;
    return [{scenario:scenario.id,baseline,kind:scenario.group==='retinue'?'retinue':'dps-substitution'},...scenario.group==='support'&&scenario.support?[{scenario:scenario.id,baseline:scenario.id.replace('-team','-self'),kind:'party-policy'}]:[]];
  });
  const comparisons=contrasts.map(contrast=>{
    return {...contrast,enemyDeltas:enemyIds.flatMap(enemy=>{const row=rows.find(row=>row.scenario===contrast.scenario&&row.enemy===enemy),base=rows.find(row=>row.scenario===contrast.baseline&&row.enemy===enemy);if(!row||!base)return[];
      const deltas=row.samples.map((sample,index)=>Number(sample.outcome==='victory')-Number(base.samples[index].outcome==='victory'));
      const center=mean(deltas),radius=deltas.length>1?1.96*Math.sqrt(sum(deltas.map(value=>(value-center)**2))/(deltas.length-1)/deltas.length):1;
      return [{enemy,winRateDelta:center,pairedSeedMean95:[Math.max(-1,center-radius),Math.min(1,center+radius)],pairedWins:deltas.filter(delta=>delta>0).length,pairedLosses:deltas.filter(delta=>delta<0).length,roundDelta:row.meanRounds-base.meanRounds,hpFractionDelta:row.meanRemainingHpFraction-base.meanRemainingHpFraction}];})};});
  const sourceHashesAfterRun=hashes(),sourcesChangedDuringRun=sourceFiles.filter(file=>sourceHashes[file]!==sourceHashesAfterRun[file]);
  const errors=rows.flatMap(row=>row.errors.map(error=>({scenario:row.scenario,enemy:row.enemy,...error})));
  const report={version:'2026-10-30-party-v3',protocol:{count,firstSeed,lastSeed:firstSeed+count-1,level,training,gear,supplyGrade,outfit:'full',race:'human',enemyIds,scenarios,
    seed:'Sequential uint32 indices equal actual engine Mulberry32 seeds; paired scenario comparisons use identical seed and roster; no RNG lookahead or retries',
    field:'Production tactical empty apex field, fixed initial player/companion and enemy positions; + separates enemies in a fixed roster; no stat overrides',
    budget:'Same level/training/crafted quality and four equipment slots per player; one HP/MP potion of fixed supplyGrade for every player; retinue hired/assigned by real actions using default creation resources and production capacity/max two',
    policy:'Shared reference self/attack/movement policy, plus public-state legal ally heal/ward and utility estimates. self controls disable only party support wrapper.',
    scope:'Representative 1–6 player scaling, DPS substitution and real assigned retinue outcomes. No target party win rate specified; support usefulness includes survival/resources/effective contribution, not equal solo win rates.',
    directDamage:'Attack presentation amounts collected incrementally; excludes ongoing status/terrain damage. Healing log totals can include self healing. Effective actions are engine contribution receipts.',maxRounds:100},
    sourceHashes,sourceHashesAfterRun,sourcesChangedDuringRun,loadouts,coverageGaps,errors,scalingChecks,comparisons,rows,valid:coverageGaps.length===0&&errors.length===0&&sourcesChangedDuringRun.length===0};
  fs.mkdirSync(path.dirname(out),{recursive:true});fs.writeFileSync(out,JSON.stringify(report,null,2));console.log(JSON.stringify({out,valid:report.valid,battles:rows.length*count,coverageGaps:coverageGaps.length,errors:errors.length,sourcesChangedDuringRun}));
  if(!report.valid)process.exitCode=1;
}
if(process.argv[1]&&path.resolve(process.argv[1])===fileURLToPath(import.meta.url))main();
