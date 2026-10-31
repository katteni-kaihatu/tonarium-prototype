import fs from 'node:fs';
import path from 'node:path';
import { execFileSync } from 'node:child_process';
import { FANTASY_COMBAT_ENEMIES } from '../shared/fantasy-combat-catalog.ts';
import { FANTASY_MONSTER_TIER_STATS, fantasyMonsterCombatStats, type FantasyMonsterCombatRole } from '../shared/fantasy-monster-balance.ts';

// Exploratory search only. Child reports always carry experimental overrides and never pass acceptance.
const args=process.argv.slice(2);
const arg=(name:string,fallback:string)=>{const index=args.indexOf(name);return index<0?fallback:args[index+1];};
const seeds=Number(arg('--seeds','20'));
const values=(name:string,fallback:string)=>arg(name,fallback).split(',').map(Number);
const hpValues=values('--hp','500,600,700'),attackValues=values('--attack','550,750,950'),accuracyValues=values('--accuracy','20,26,32');
const agilityValues=values('--agility',String(FANTASY_MONSTER_TIER_STATS[7].agility));
const defenseValues=values('--defense',String(FANTASY_MONSTER_TIER_STATS[7].defense));
const resistValues=values('--resist',String(FANTASY_MONSTER_TIER_STATS[7].magicResist));
const casterMultiplier=Number(arg('--caster-multiplier','1'));
const gear=arg('--gear','basic');
const outfit=arg('--outfit',gear==='fine'?'full':'');
const outDir=path.resolve(arg('--out-dir','work/qa/recent-features-2026-10-30/balance-grid-exploratory'));
if(!Number.isSafeInteger(seeds)||seeds<1||[...hpValues,...attackValues,...accuracyValues,...defenseValues,...resistValues,...agilityValues,casterMultiplier].some(value=>!Number.isFinite(value)||value<=0))throw new Error('Invalid grid parameters');
fs.mkdirSync(outDir,{recursive:true});
const base=FANTASY_MONSTER_TIER_STATS[7],originalBase={...FANTASY_MONSTER_TIER_STATS[7]};
const roles:Record<string,FantasyMonsterCombatRole>={'monster-red-dragon':'dragon','monster-frost-dragon':'dragon','monster-storm-dragon':'dragon','monster-abyss-hydra':'beast','monster-obsidian-guardian':'golem','monster-lich':'caster','monster-phoenix':'flying'};
const selectedIds=arg('--enemies','').split(',').filter(Boolean);
const enemies=FANTASY_COMBAT_ENEMIES.filter((enemy,index,all)=>enemy.kind==='monster'&&enemy.tier===7&&(!selectedIds.length||selectedIds.includes(enemy.id))&&all.findIndex(entry=>entry.id===enemy.id)===index);
interface Cell{grade:number;tier:number;rate:number;wins:number;samples:number;wilson95:number[]}
interface Row{grade:number;tier:number;enemy:string;loadout:string;wins:number;count:number;rate:number;errors:unknown[]}
interface Report{cells:Cell[];rows:Row[];durationSeconds:number;catalogDuplicates:unknown[];coverageGaps:unknown[];sourceHashes:Record<string,string>;sourcesChangedDuringRun:string[];experimentalEnemyOverrides:unknown}
const results:unknown[]=[];
let index=0;
for(const hp of hpValues)for(const attack of attackValues)for(const accuracy of accuracyValues)for(const defense of defenseValues)for(const magicResist of resistValues)for(const agility of agilityValues){
  const parameters={hp,attack,accuracy,defense,magicResist,agility,casterMultiplier,gear,outfit,seeds},id=String(++index).padStart(3,'0');
  Object.assign(base,{hp,attack,accuracy,defense,magicResist,agility});
  const overrides=Object.fromEntries(enemies.map(enemy=>{
    const role=roles[enemy.id];if(!role)throw new Error(`Add explicit calibration role mapping for ${enemy.id}`);
    const stats=fantasyMonsterCombatStats(7,role);
    if(enemy.id==='monster-lich')stats.attack=Math.round(stats.attack*casterMultiplier);
    return [enemy.id,stats];
  }));
  Object.assign(base,originalBase);
  const overrideFile=path.join(outDir,`${id}-overrides.json`),reportFile=path.join(outDir,`${id}-report.json`),logFile=path.join(outDir,`${id}.log`);
  fs.writeFileSync(overrideFile,JSON.stringify(overrides,null,2));
  const log=fs.openSync(logFile,'w');
  try{execFileSync(process.execPath,['--import','tsx','scripts/fantasy-monster-balance-report.ts','--jobs','warrior,knight,archer,mage,priest','--grades','6,7,8','--gears',gear,...(outfit?['--outfit',outfit]:[]),'--training','progression','--enemies',enemies.map(enemy=>enemy.id).join(','),'--seeds',String(seeds),'--enemy-overrides',overrideFile,'--cache',path.join(outDir,'loadouts-cache.json'),'--report-only','--out',reportFile],{cwd:process.cwd(),stdio:['ignore',log,log]});}finally{fs.closeSync(log);}
  const report=JSON.parse(fs.readFileSync(reportFile,'utf8')) as Report;
  const cells=report.cells.filter(cell=>cell.tier===7),a6=cells.find(cell=>cell.grade===6)!,a7=cells.find(cell=>cell.grade===7)!,a8=cells.find(cell=>cell.grade===8)!;
  const invalid=report.rows.reduce((sum,row)=>sum+row.errors.length,0);
  const species=enemies.map(enemy=>{const rows=report.rows.filter(row=>row.grade===6&&row.enemy===enemy.id);return{id:enemy.id,rate:rows.reduce((sum,row)=>sum+row.wins,0)/rows.reduce((sum,row)=>sum+row.count,0)};});
  const worstA6=Math.max(...species.map(entry=>entry.rate));
  const outside=(value:number,min:number,max:number)=>value<min?min-value:value>max?value-max:0;
  const score=outside(a6.rate,0,.05)*8+outside(a7.rate,.35,.45)*4+outside(a8.rate,.55,.65)*4+Math.max(0,worstA6-.1)*2+Math.abs(a7.rate-.4)*.1+Math.abs(a8.rate-.6)*.1;
  const result={id,parameters,score,a6:a6.rate,a7:a7.rate,a8:a8.rate,worstA6,invalid,coverageGaps:report.coverageGaps.length,speciesA6:species,reportFile,durationSeconds:report.durationSeconds,sourcesChangedDuringRun:report.sourcesChangedDuringRun};
  results.push(result);fs.writeFileSync(path.join(outDir,'summary.json'),JSON.stringify({exploratory:true,warning:'Real engine with explicit in-memory enemy stat overrides. This is tuning evidence, never final production acceptance. Seeds overlap across candidates.',sourceHashes:report.sourceHashes,results},null,2));
  process.stdout.write(JSON.stringify(result)+'\n');
}
