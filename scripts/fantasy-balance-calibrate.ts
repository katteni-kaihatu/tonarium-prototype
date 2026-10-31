import fs from 'node:fs';
import path from 'node:path';
import { createHash } from 'node:crypto';
import { fileURLToPath } from 'node:url';
import { isDeepStrictEqual } from 'node:util';
import { FANTASY_COMBAT_ENEMIES, type FantasyCombatStats } from '../shared/fantasy-combat-catalog.ts';
import { fantasyAdventurerGrade, fantasyCombatPower, type FantasyAdventurerGrade } from '../shared/fantasy-adventurer.ts';
import { FANTASY_MONSTER_TIER_STATS, fantasyMonsterSoloWinTarget } from '../shared/fantasy-monster-balance.ts';
import { benchmarkFight } from './fantasy-balance-fixtures.ts';

type Variant = { id: string } & Partial<FantasyCombatStats>;
const keys = ['hp','mp','attack','defense','agility','intelligence','accuracy','magicResist'] as const;
export function validateCalibrationVariants(value: unknown): Variant[] {
 if(!Array.isArray(value)||!value.length||value.length>256)throw new Error('Provide1..256 fixed variants');
 const ids=new Set<string>();
 for(const row of value){
  if(!row||typeof row!=='object'||Array.isArray(row)||typeof row.id!=='string'||!row.id||ids.has(row.id)||Object.keys(row).length<2)throw new Error('Invalid variant identity');
  ids.add(row.id);
  for(const [key,number]of Object.entries(row))if(key!=='id'&&(!keys.includes(key as typeof keys[number])||!Number.isSafeInteger(number)||Number(number)<0||key==='hp'&&number===0||key==='accuracy'&&Number(number)>100))throw new Error('Invalid fixed stat patch');
 }
 return value as Variant[];
}
export function calibrationDistance(grade: FantasyAdventurerGrade,tier: FantasyAdventurerGrade,rate:number,invalid:number):number{
 const target=fantasyMonsterSoloWinTarget(grade,tier);
 if(!target)return 0;
 return invalid*1000+Math.max(0,target.min-rate,rate-target.max)*(grade===6&&tier===7?2:1);
}
type CalibrationLoadout={id:string;grade:FantasyAdventurerGrade;score:number;profileHash:string;job:string;player:Parameters<typeof benchmarkFight>[0]['player']};
type CalibrationRow={loadout:string;job:string;grade:FantasyAdventurerGrade;enemy:string;wins:number;count:number;invalid:number;rate:number;meanRounds:number};
export function validateCalibrationLoadouts(cached:unknown,recorded:unknown,tier:FantasyAdventurerGrade):CalibrationLoadout[]{
 const index=(value:unknown)=>{
  if(!Array.isArray(value))throw new Error('Invalid loadout collection');
  const entries=new Map<string,CalibrationLoadout>();
  for(const row of value){
   if(!row||typeof row!=='object'||typeof row.id!=='string'||!row.id||entries.has(row.id))throw new Error('Invalid or duplicate loadout identity');
   entries.set(row.id,row as CalibrationLoadout);
  }
  return entries;
 };
 const cache=index(cached),reference=index(recorded),eligible=[...reference.values()].filter(row=>fantasyMonsterSoloWinTarget(row.grade,tier));
 const supplied=[...cache.values()].filter(row=>fantasyMonsterSoloWinTarget(row.grade,tier));
 if(!eligible.length||supplied.length!==eligible.length||eligible.some(row=>!cache.has(row.id)))throw new Error('Incomplete calibration loadout coverage');
 // 最大値による評価だけでは、消耗や身体特性の改変を検出できない。
 for(const row of supplied){
  const expected=reference.get(row.id),player=row.player;
  if(!expected||row.grade!==expected.grade||row.job!==expected.job||row.profileHash!==expected.profileHash||row.score!==expected.score
   ||!isDeepStrictEqual(player,expected.player)||!player||player.hp!==player.stats.hp||player.mp!==player.stats.mp
   ||fantasyCombatPower(player.stats,player)!==row.score||fantasyAdventurerGrade(player.stats,player)!==row.grade)throw new Error(`Stale or mismatched loadout:${row.id}`);
 }
 return supplied;
}
function run(args:string[]){
 const options=new Map<string,string>();
 for(let i=0;i<args.length;i+=2){if(!['--cache','--reference','--tier','--seeds','--start-seed','--out','--variants'].includes(args[i])||!args[i+1])throw new Error('Invalid calibration arguments');options.set(args[i],args[i+1]);}
 const required=(key:string)=>{const v=options.get(key);if(!v)throw new Error(`Missing ${key}`);return v;};
 const tier=Number(required('--tier')) as FantasyAdventurerGrade,count=Number(options.get('--seeds')??20),first=Number(options.get('--start-seed')??101);
 if(!Number.isInteger(tier)||tier<1||tier>8||!Number.isSafeInteger(count)||count<1||count>3000||!Number.isSafeInteger(first)||first<0||first+count-1>0xffffffff)throw new Error('Invalid tier or seed range');
 const reference=JSON.parse(fs.readFileSync(required('--reference'),'utf8')),cache=JSON.parse(fs.readFileSync(required('--cache'),'utf8'));
 if(reference.experimentalEnemyOverrides&&Object.keys(reference.experimentalEnemyOverrides).length)throw new Error('Reference must use actual unpatched production data');
 if(reference.sourcesChangedDuringRun?.length)throw new Error('Reference source changed while running');
 const sourceFiles=[...Object.keys(reference.sourceHashes),fileURLToPath(import.meta.url)],hashes=()=>Object.fromEntries(sourceFiles.map(file=>[file,createHash('sha256').update(fs.readFileSync(file)).digest('hex')]));
 const before=hashes();
 for(const [file,hash]of Object.entries(reference.sourceHashes))if(before[file]!==hash)throw new Error(`Reference is stale:${file}`);
 const variants=validateCalibrationVariants(JSON.parse(fs.readFileSync(required('--variants'),'utf8')));
 const loadouts=validateCalibrationLoadouts(cache.loadouts,reference.loadouts,tier);
 const enemies=FANTASY_COMBAT_ENEMIES.filter((enemy,index,all)=>enemy.kind==='monster'&&enemy.tier===tier&&all.findIndex(e=>e.id===enemy.id)===index);
 const originals=new Map(enemies.map(enemy=>[enemy.id,{...enemy.stats}])),base=FANTASY_MONSTER_TIER_STATS[tier];
 const results:unknown[]=[];const began=Date.now();
 try{
  for(const variant of variants){
   for(const enemy of enemies){const original=originals.get(enemy.id)!,stats={...original};for(const key of keys)if(variant[key]!==undefined)stats[key]=Math.round(base[key]?original[key]*variant[key]!/base[key]:variant[key]!);stats.hp=Math.max(1,stats.hp);stats.accuracy=Math.min(95,stats.accuracy);enemy.stats=stats;}
   const rows:CalibrationRow[]=[];
   for(const loadout of loadouts)for(const enemy of enemies){let wins=0,invalid=0,rounds=0;for(let index=0;index<count;index++){const result=benchmarkFight(loadout,enemy,'prepared',first+index);if(result.error)invalid++;else if(result.outcome==='V')wins++;rounds+=result.rounds;}rows.push({loadout:loadout.id,job:loadout.job,grade:loadout.grade,enemy:enemy.id,wins,count,invalid,rate:invalid<count?wins/(count-invalid):0,meanRounds:rounds/count});}
   const cells=[...new Set(rows.map(row=>row.grade))].map(grade=>{const group=rows.filter(row=>row.grade===grade),invalid=group.reduce((s,r)=>s+r.invalid,0),rate=group.reduce((s,r)=>s+r.rate,0)/group.length;return{grade,tier,rate,invalid,target:fantasyMonsterSoloWinTarget(grade,tier),distance:calibrationDistance(grade,tier,rate,invalid)};});
   const distance=cells.reduce((s,c)=>s+c.distance,0),entry={variant,cells,distance,rows};results.push(entry);
   process.stdout.write(JSON.stringify({variant:variant.id,cells:cells.map(c=>[c.grade,Math.round(c.rate*1000)/10,c.invalid]),distance})+'\n');
  }
 }finally{for(const enemy of enemies)enemy.stats={...originals.get(enemy.id)!};}
 const after=hashes(),out=path.resolve(required('--out'));fs.mkdirSync(path.dirname(out),{recursive:true});
 fs.writeFileSync(out,JSON.stringify({experimentalCalibrationOnly:true,accepted:false,cacheHash:cache.hash,reference:required('--reference'),protocol:{tier,count,first,last:first+count-1,loadouts:loadouts.map(l=>l.id),enemyIds:enemies.map(e=>e.id)},originals:Object.fromEntries(originals),sourceHashes:before,sourceChanges:sourceFiles.filter(f=>before[f]!==after[f]),durationSeconds:(Date.now()-began)/1000,results},null,2));
}
if(process.argv[1]&&path.resolve(process.argv[1])===fileURLToPath(import.meta.url))run(process.argv.slice(2));
