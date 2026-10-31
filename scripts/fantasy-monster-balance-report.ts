import fs from 'node:fs';
import { execFileSync } from 'node:child_process';
import { createHash } from 'node:crypto';
import { fantasyCombatPlayer } from '../server/fantasy-combat-adapter.ts';
import { applyFantasyAction, fantasyStats, newFantasyProfile } from '../shared/fantasy-engine.ts';
import { FANTASY_ITEMS, FANTASY_JOBS, FANTASY_RACES, FANTASY_LOCATIONS, FANTASY_RECIPES } from '../shared/fantasy-data.ts';
import { createFantasyGear, fantasyCraftInputs, fantasyEquipGear } from '../shared/fantasy-equipment.ts';
import { fantasyCanCraft } from '../shared/fantasy-town.ts';
import { fantasyCompileCircle, grantFantasyCircleBasics } from '../shared/fantasy-magic-circle.ts';
import { fantasyCompanyCapacity, fantasySpellCapacity, type FantasyCompanyKind } from '../shared/fantasy-specializations.ts';
import { fantasyJobMagicAttackRatio, fantasyJobHealingBonus } from '../shared/fantasy-job-balance.ts';
import { fantasyAdventurerGrade, fantasyCombatPower, type FantasyAdventurerGrade } from '../shared/fantasy-adventurer.ts';
import { FANTASY_COMBAT_ENEMIES, type FantasyCombatEnemyTemplate } from '../shared/fantasy-combat-catalog.ts';
import { FANTASY_MONSTER_BALANCE_VERSION, fantasyMonsterGradePowerReference, fantasyMonsterSoloWinTarget } from '../shared/fantasy-monster-balance.ts';
import { fantasyMonsterBenchmarkStats } from '../shared/fantasy-monster-benchmark-fixture.ts';
import { createFantasyCombat, fantasyCombatHitChance, fantasyCombatOrderError, submitFantasyCombatOrder,
  validFantasyCombatState, type FantasyCombatOptions, type FantasyCombatOrder, type FantasyCombatUnitOrder, type FantasyCombatPlayer, type FantasyCombatState } from '../shared/fantasy-combat.ts';
import { fantasyCombatDistance, fantasyCombatMoveRange, fantasyCombatPath, fantasyCombatLineOfSight } from '../shared/fantasy-combat-tactics.ts';
import type { FantasyProfile } from '../shared/fantasy.ts';

import { baseBenchmarkProfile, createdBenchmarkProfile, createBenchmarkProfile, benchmarkFight, type Gear, type Policy } from './fantasy-balance-fixtures.ts';
let grades: FantasyAdventurerGrade[] = [1, 2, 3, 4, 5, 6, 7, 8];
let jobs = ['warrior', 'knight', 'archer', 'mage', 'priest'];
let gears: Gear[] = ['basic'];
const args = process.argv.slice(2);
function argument(flag: string, fallback?: string): string | undefined {
  const index = args.indexOf(flag);
  if (index < 0) return fallback;
  if (!args[index + 1] || args[index + 1].startsWith('--')) throw new Error(`Missing value: ${flag}`);
  return args[index + 1];
}
const known = new Set(['--seeds', '--start-seed', '--out', '--policies', '--all-cells', '--report-only', '--jobs', '--gears', '--grades', '--enemies', '--races', '--species-per-tier', '--cache', '--training', '--level', '--outfit', '--loadouts-only', '--retinue', '--enemy-overrides']);
for (let index = 0; index < args.length; index++) {
  if (!known.has(args[index])) throw new Error(`Unknown argument: ${args[index]}`);
  if (!['--all-cells', '--report-only', '--loadouts-only', '--retinue'].includes(args[index])) index++;
}
if (argument('--jobs')) jobs = argument('--jobs')!.split(',');
if (jobs.some(job => !FANTASY_JOBS.some(entry => entry.id === job))) throw new Error('Unknown job');
if (argument('--gears')) gears = argument('--gears')!.split(',') as Gear[];
if (gears.some(gear => !['basic', 'ordinary', 'fine'].includes(gear))) throw new Error('Unknown gear');
if (argument('--grades')) grades = argument('--grades')!.split(',').map(Number) as FantasyAdventurerGrade[];
if (grades.some(grade => !Number.isInteger(grade) || grade < 1 || grade > 8)) throw new Error('Unknown grade');
const enemyIds = argument('--enemies')?.split(',');
const normalRaces = FANTASY_RACES.filter(race => race.rarity === '一般').map(race => race.id);
const races = argument('--races', 'human') === 'normal' ? normalRaces : argument('--races', 'human')!.split(',');
if (races.some(race => !normalRaces.includes(race))) throw new Error('Only normal-rarity races are allowed');
const progressionTraining=[0,30,100,200,400,700,1000,1500];
const progression = argument('--training', 'progression') === 'progression';
const trainingCandidates = progression ? progressionTraining : argument('--training') ? argument('--training')!.split(',').map(Number) : [0, 30, 100, 300, 1000];
if (trainingCandidates.some(value => !Number.isSafeInteger(value) || value < 0)) throw new Error('Invalid training XP');
const fixedLevel = argument('--level') ? Number(argument('--level')) : undefined;
if (fixedLevel !== undefined && (!Number.isInteger(fixedLevel) || fixedLevel < 1 || fixedLevel > 100)) throw new Error('Invalid fixed level');
const fixedOutfit = argument('--outfit');
if (fixedOutfit && !['starter','weapon','full'].includes(fixedOutfit)) throw new Error('Invalid outfit');
const speciesPerTier = Number(argument('--species-per-tier', '0'));
if (!Number.isSafeInteger(speciesPerTier) || speciesPerTier < 0) throw new Error('Invalid species-per-tier');
const catalogDuplicates=FANTASY_COMBAT_ENEMIES.filter((enemy,index,all)=>all.findIndex(entry=>entry.id===enemy.id)!==index).map(enemy=>({id:enemy.id,tier:enemy.tier,pattern:enemy.pattern,canonicalTier:FANTASY_COMBAT_ENEMIES.find(entry=>entry.id===enemy.id)!.tier}));
// Production resolves IDs with first-match lookup. Never label an alias as a different tier.
const selectedEnemies = FANTASY_COMBAT_ENEMIES.filter((enemy,index,all) => enemy.kind === 'monster' && all.findIndex(entry=>entry.id===enemy.id)===index && (!enemyIds || enemyIds.includes(enemy.id)));
const enemies = !speciesPerTier ? selectedEnemies : [1,2,3,4,5,6,7,8].flatMap(tier => { const all=selectedEnemies.filter(enemy=>enemy.tier===tier), chosen: typeof all=[]; for(const enemy of all) if(!chosen.some(entry=>entry.pattern===enemy.pattern)&&chosen.length<speciesPerTier) chosen.push(enemy); for(const enemy of all) if(!chosen.includes(enemy)&&chosen.length<speciesPerTier) chosen.push(enemy); return chosen; });
const count = Number(argument('--seeds', '30')), firstSeed = Number(argument('--start-seed', '1'));
if (!Number.isSafeInteger(count) || count < 1 || count > 100000 || !Number.isSafeInteger(firstSeed) || firstSeed < 0 || firstSeed + count - 1 > 0xffffffff) throw new Error('Invalid seed range');
const policies = argument('--policies', 'prepared')!.split(',') as Policy[];
if (!policies.length || new Set(policies).size !== policies.length || policies.some(policy => !['basic', 'trained', 'prepared'].includes(policy))) throw new Error('Invalid policies');
const retinue=args.includes('--retinue');
const output = argument('--out');
const overrideFile=argument('--enemy-overrides');
const experimentalEnemyOverrides: Record<string,{original:FantasyCombatEnemyTemplate['stats'];effective:FantasyCombatEnemyTemplate['stats']}>={};
if(overrideFile){
  const overrides=JSON.parse(fs.readFileSync(overrideFile,'utf8')) as Record<string,Partial<FantasyCombatEnemyTemplate['stats']>>;
  const allowed=['hp','mp','attack','defense','agility','intelligence','accuracy','magicResist'];
  for(const [id,patch]of Object.entries(overrides)){
    const enemy=FANTASY_COMBAT_ENEMIES.find(entry=>entry.id===id);
    if(!enemy||enemy.kind!=='monster'||!patch||typeof patch!=='object'||Array.isArray(patch)||Object.keys(patch).some(key=>!allowed.includes(key))||Object.values(patch).some(value=>!Number.isSafeInteger(value)||Number(value)<0))throw new Error(`Invalid experimental enemy override: ${id}`);
    const effective={...enemy.stats,...patch};
    if(effective.hp<1||effective.accuracy>100)throw new Error(`Invalid experimental enemy stats: ${id}`);
    experimentalEnemyOverrides[id]={original:{...enemy.stats},effective};enemy.stats=effective;
  }
}
const overrideHash=overrideFile?createHash('sha256').update(fs.readFileSync(overrideFile)).digest('hex'):undefined;
const startedAt=Date.now();
const sourceFiles = [...fs.readdirSync('shared').filter(file => /^fantasy.*\.ts$/.test(file) && !file.endsWith('.test.ts')).sort().map(file => `shared/${file}`), 'server/fantasy-combat-adapter.ts', 'scripts/fantasy-monster-balance-report.ts', 'scripts/fantasy-balance-fixtures.ts'];
const sourceHashes = Object.fromEntries(sourceFiles.map(file => [file, createHash('sha256').update(fs.readFileSync(file)).digest('hex')]));

const localized = (ko: string, en: string, ja: string) => ({ ko, en, ja });
const craftingAudit: Record<string, unknown[]> = {};

interface Loadout { id: string; race: string; grade: FantasyAdventurerGrade; job: string; gear: Gear; level: number; training: number; outfit: string; score: number; player: FantasyCombatPlayer; equipment: unknown; profileHash: string; profile?: FantasyProfile }
const loadouts: Loadout[] = [], coverageGaps: unknown[] = [];
const cacheFile = argument('--cache');
const cacheSources = fs.readdirSync('shared').filter(file => /^fantasy.*\.ts$/.test(file) && !file.endsWith('.test.ts')).map(file => fs.readFileSync(`shared/${file}`));
const cacheKey = createHash('sha256').update(JSON.stringify({races,jobs,gears,grades,trainingCandidates,progression,fixedLevel,fixedOutfit,retinue})).update(fs.readFileSync('server/fantasy-combat-adapter.ts')).update(fs.readFileSync('scripts/fantasy-monster-balance-report.ts')).update(fs.readFileSync('scripts/fantasy-balance-fixtures.ts'));
for (const source of cacheSources) cacheKey.update(source);
const cacheHash = cacheKey.digest('hex');
const cached = cacheFile && fs.existsSync(cacheFile) ? JSON.parse(fs.readFileSync(cacheFile, 'utf8')) : undefined;
if (cached?.hash === cacheHash) { loadouts.push(...cached.loadouts); coverageGaps.push(...cached.coverageGaps); Object.assign(craftingAudit,cached.craftingAudit); }
else for (const race of races) for (const job of jobs) for (const gear of gears) {
  const base = baseBenchmarkProfile(race, job, gear, craftingAudit), starter = createdBenchmarkProfile(race).character!;
  const candidates: Omit<Loadout, 'id' | 'race' | 'job' | 'gear'>[] = [];
  const outfits = (fixedOutfit ? [fixedOutfit] : gear === 'fine' ? ['full'] : gear === 'basic' ? ['starter', 'weapon', 'full'] : ['weapon', 'full']).filter(outfit=>outfit!=='starter'||grades.includes(1));
  const relevantTraining = progression ? trainingCandidates.filter(training=>grades.some(grade=>progressionTraining[grade-1]===training)) : trainingCandidates;
  for (const outfit of outfits) for (const training of relevantTraining) for (const level of fixedLevel === undefined ? Array.from({length:100},(_,index)=>index+1) : [fixedLevel]) {
    const profile = createBenchmarkProfile(race,job,gear,level,training,outfit,retinue,base,starter), character = profile.character!;
    const player = fantasyCombatPlayer(profile, 'reference'); if (!retinue) delete player.companions;
    if (outfit === 'starter' && fantasyAdventurerGrade(player.stats,player) > 1) continue;
    candidates.push({ ...(retinue?{profile}:{}), level, training, outfit, score: fantasyCombatPower(player.stats,player), grade: fantasyAdventurerGrade(player.stats,player), player,
      equipment: { slots: character.equipment, instances: character.gear?.filter(instance => Object.values(character.equippedGear ?? {}).includes(instance.id)) },
      profileHash: createHash('sha256').update(JSON.stringify(profile)).digest('hex') });
  }
  for (const grade of grades) {
    const reference = fantasyMonsterGradePowerReference(grade).reference;
    const chosen = candidates.filter(candidate => candidate.grade === grade && (!progression || candidate.training === progressionTraining[grade-1])).sort((a, b) => Math.abs(a.score - reference) - Math.abs(b.score - reference) || a.level - b.level)[0];
    if (!chosen) { coverageGaps.push({ grade, race, job, gear, reason: 'No matching legitimate level/training/outfit combination' }); continue; }
    loadouts.push({ id: `${grade}:${job}:${gear}:${race}`, race, job, gear, ...chosen });
  }
}

if (cacheFile && cached?.hash !== cacheHash) fs.writeFileSync(cacheFile, JSON.stringify({hash:cacheHash,loadouts,coverageGaps,craftingAudit}));

function fight(loadout: Loadout, enemy: FantasyCombatEnemyTemplate, policy: Policy, seed: number) {
  return benchmarkFight(loadout,enemy,policy,seed,(selected,options,state)=>{
    if (output && !fs.existsSync(output + '.invalid.json')) fs.writeFileSync(output + '.invalid.json', JSON.stringify({loadout:loadout.id, enemy:enemy.id, seed, stateValid:validFantasyCombatState(state), selected, options, state}, null, 2));
  });
}

function wilson(wins: number, total: number) {
  const z = 1.959963984540054, fraction = wins / total, denominator = 1 + z * z / total;
  const center = (fraction + z * z / (2 * total)) / denominator;
  const radius = z * Math.sqrt(fraction * (1 - fraction) / total + z * z / (4 * total * total)) / denominator;
  return [Math.max(0, center - radius), Math.min(1, center + radius)];
}
interface Row { loadout: string; grade: FantasyAdventurerGrade; gear: Gear; enemy: string; tier: FantasyAdventurerGrade; policy: Policy; wins: number; count: number; validCount: number; actions: Record<string,number>; rate: number; wilson95: number[]; outcomes: string; measurements: number[][]; meanRounds: number; meanItems: number; meanDirectDamageDealt: number; meanDirectDamageTaken: number; directDamagePerRound: number; errors: unknown[] }
const rows: Row[] = [];
const seedObservations=new Map<number,{seedIndex:number;actualSeed:number;variation:number}>();
for (const loadout of args.includes('--loadouts-only') ? [] : loadouts) for (const enemy of enemies) {
  if (!args.includes('--all-cells') && !fantasyMonsterSoloWinTarget(loadout.grade, enemy.tier)) continue;
  for (const policy of policies) {
    let wins = 0, outcomes = '', rounds = 0, items = 0, directDamageDealt=0,directDamageTaken=0; const errors: unknown[] = [], measurements: number[][] = [], actions: Record<string,number>={};
    for (let offset = 0; offset < count; offset++) {
      const seed = firstSeed + offset, result = fight(loadout, enemy, policy, seed);
      for(const [key,value] of Object.entries(result.actions))actions[key]=(actions[key]??0)+value;
      if(!seedObservations.has(seed))seedObservations.set(seed,{seedIndex:seed,actualSeed:seed,variation:result.variation});
      outcomes += result.outcome; if (result.outcome === 'V') wins++; rounds += result.rounds; items += result.items; directDamageDealt+=result.directDamageDealt; directDamageTaken+=result.directDamageTaken;
      measurements.push([result.rounds, result.hp, result.mp, result.items]);
      if (result.error) errors.push({ seed, error: result.error });
    }
    rows.push({ loadout: loadout.id, grade: loadout.grade, gear: loadout.gear, enemy: enemy.id, tier: enemy.tier, policy, wins, count, validCount: count-errors.length, actions, rate: count>errors.length?wins / (count-errors.length):0, wilson95: count>errors.length?wilson(wins, count-errors.length):[0,1], outcomes, measurements, meanRounds: rounds / count, meanItems: items / count, meanDirectDamageDealt:directDamageDealt/count, meanDirectDamageTaken:directDamageTaken/count, directDamagePerRound:directDamageDealt/Math.max(1,rounds), errors });
  }
  process.stderr.write(`Finished ${loadout.id} vs ${enemy.id}\n`);
}

function aggregate(group: Row[]) {
  const validRows=group.filter(row=>row.validCount>0);
  const rate = validRows.length?validRows.reduce((total,row)=>total+row.rate,0)/validRows.length:0;
  const seedRates=Array.from({length:count},(_,offset)=>{const observed=group.filter(row=>row.outcomes[offset]!=='I');return observed.length?observed.filter(row=>row.outcomes[offset]==='V').length/observed.length:undefined;}).filter((value):value is number=>value!==undefined);
  const n=seedRates.length,mean=n?seedRates.reduce((sum,value)=>sum+value,0)/n:0;
  const variance=n>1?seedRates.reduce((sum,value)=>sum+(value-mean)**2,0)/(n-1):0,se=n>1?Math.sqrt(variance/n):0;
  const df=Math.max(1,n-1),z=1.959963984540054,t=z+(z**3+z)/(4*df)+(5*z**5+16*z**3+3*z)/(96*df**2);
  const seedCluster95=n<2?[0,1]:mean===0?[0,1-.025**(1/n)]:mean===1?[.025**(1/n),1]:[Math.max(0,mean-t*se),Math.min(1,mean+t*se)];
  const wins = group.reduce((total, row) => total + row.wins, 0), samples = group.reduce((total, row) => total + row.validCount, 0);
  const target = fantasyMonsterSoloWinTarget(group[0].grade, group[0].tier);
  return { grade: group[0].grade, seedCluster95, seedClusters:n, seedRateMean:mean, seedRateStandardError:se, invalid: group.reduce((total,row)=>total+row.errors.length,0), tier: group[0].tier, policy: group[0].policy, rate, wins, samples, wilson95: samples?wilson(wins, samples):[0,1], target,
    withinTarget: target === undefined ? undefined : rate >= target.min && rate <= target.max,
    profiles: new Set(group.map(row => row.loadout)).size, species: new Set(group.map(row => row.enemy)).size };
}
const groups = new Map<string, Row[]>(), gearGroups = new Map<string, Row[]>();
for (const row of rows) {
  const key = `${row.grade}:${row.tier}:${row.policy}`, gearKey = `${key}:${row.gear}`;
  groups.set(key, [...(groups.get(key) ?? []), row]); gearGroups.set(gearKey, [...(gearGroups.get(gearKey) ?? []), row]);
}
const jobGroups=new Map<string,Row[]>(); for(const row of rows){const job=loadouts.find(loadout=>loadout.id===row.loadout)!.job,key=`${row.grade}:${row.tier}:${row.policy}:${job}`;jobGroups.set(key,[...(jobGroups.get(key)??[]),row]);}
const jobCells=[...jobGroups.values()].map(group=>({...aggregate(group),job:loadouts.find(loadout=>loadout.id===group[0].loadout)!.job}));
const cells = [...groups.values()].map(aggregate), equipmentCells = [...gearGroups.values()].map(group => ({ ...aggregate(group), gear: group[0].gear }));
let revision = 'unavailable', dirty = 'unavailable';
try { revision = execFileSync('git', ['rev-parse', 'HEAD'], { encoding: 'utf8' }).trim(); dirty = execFileSync('git', ['status', '--porcelain'], { encoding: 'utf8' }); } catch { /* ソース識別が取れなくても測定値は失わない。 */ }
const primary = policies.includes('prepared') ? 'prepared' : policies[0];
const jobFailures=jobCells.filter(cell=>cell.policy===primary&&cell.withinTarget===false);
const failures = cells.filter(cell => cell.policy === primary && cell.withinTarget === false);
const equipmentFailures = equipmentCells.filter(cell => cell.policy === primary && cell.withinTarget === false);
const sourceHashesAfterRun=Object.fromEntries(sourceFiles.map(file=>[file,createHash('sha256').update(fs.readFileSync(file)).digest('hex')]));
const sourcesChangedDuringRun=sourceFiles.filter(file=>sourceHashes[file]!==sourceHashesAfterRun[file]);
const seedSamples=[...seedObservations.values()];
const seedAudit={protocol:'Sequential uint32 seed indices equal actual combat seeds; engine Mulberry32',samples:seedSamples,duplicates:seedSamples.length-new Set(seedSamples.map(sample=>sample.actualSeed)).size,firstEnemyVariation:seedSamples.length?{minimum:Math.min(...seedSamples.map(sample=>sample.variation)),mean:seedSamples.reduce((sum,sample)=>sum+sample.variation,0)/seedSamples.length,maximum:Math.max(...seedSamples.map(sample=>sample.variation))}:undefined};
const report = { seedAudit, balance: FANTASY_MONSTER_BALANCE_VERSION, assessment: '2026-10-31-v5-capability-corrections', generatedAt: new Date().toISOString(), durationSeconds:(Date.now()-startedAt)/1000, revision, dirty, sourceHashes, sourcesChangedDuringRun,
  protocol: { firstSeed, lastSeed: firstSeed + count - 1, count, policies, primary, enemyIds, allCells: args.includes('--all-cells'), maxRounds: 100, jobs, gears, races, trainingCandidates, progression, fixedLevel, fixedOutfit, speciesPerTier, enemySampling: speciesPerTier ? 'first distinct patterns, then catalog order; deterministic' : 'all monster species', tacticsVersion:'2026-10-31-v5-preparation-openers-and-return-cost', experimentalCalibrationOnly:!!overrideFile, strictSingleFighter: !retinue, retinue:retinue?'Actual hire/assign per candidate BEFORE power/grade selection, up to2 basic available companions, starting35G; all rested before battle':'none', directDamage: 'Attack presentation log amounts only; excludes ongoing terrain/status damage', acceptanceScope: 'Solo selected filters and sampled species only; does not assert exhaustive normal-race/job coverage',
    qualityDraws: { basic: .1, ordinary: .5, fine: .999 }, referencePower: grades.map(grade => ({ grade, ...fantasyMonsterGradePowerReference(grade), syntheticStats: fantasyMonsterBenchmarkStats(grade) })),
    skills: 'Explicit candidate/progression job XP; skill practice XP/5 up to200; mentor skills learned above150. Mage/priest compile only admission-granted basic cores/runes; slots obey actual jobXP. No books, job paths or apex gear', magic: 'Mage flame+focus+scatter; economy flame; gale+focus+scatter. Priest holy+focus+scatter; self healing+focus; barrier+scatter+economy. Include only actual unlocked slots; every recipe is checked by production fantasyCompileCircle', healingPolicy:'Useful healing reserves 1.5 ordinary hits when able to heal before the next enemy turn; otherwise two ordinary critical hits, plus ongoing damage. Preserve ongoing-death and below50%HP guard windows. A >=80% legal finisher precedes healing only with safe initiative, survival after a miss, affordable next-turn recovery, and no new status-damage pattern. No future RNG inspection', tacticsPolicies:{basic:'Legal ordinary attack and movement only',trained:'Public-state skills, healing, utility, guarding and movement; no supplies',prepared:'Same trained tactics plus one grade-appropriate HP and MP potion'}, supplies: 'Prepared: one current-grade HP potion and one MP potion; other policies: none',
    outcomesLegend: { V: 'victory', D: 'defeat', E: 'escape', T: '100-round timeout', I: 'invalid action or stalled revision' }, measurementsColumns: ['rounds', 'remainingHP', 'remainingMP', 'itemsSpent'],
    confidenceIntervals: 'Primary seedCluster95: t interval over independent seed-index means across paired jobs/species; all0/all1 use exact binomial endpoint bound for any nonzero seed event. Wilson95 retained as descriptive pooled interval only. Selected-loadout and species generalization is not guaranteed', invalidPolicy: 'Invalid battles are excluded from win-rate denominators and always fail acceptance', warning: 'Actual equipment is crafted through validated recipe inputs; levels are chosen nearest the fixed grade reference using the same actor-context power/grade calculation as live production assessment. Synthetic stats are metadata only. Missing grade/loadout coverage is a failure.' },
  craftingAudit, catalogDuplicates, experimentalEnemyOverrides, overrideHash, coverageGaps, loadouts, cells, jobCells, equipmentCells, failures, jobFailures, equipmentFailures, rows,
  accepted: !overrideFile && catalogDuplicates.length === 0 && sourcesChangedDuringRun.length === 0 && !retinue && !args.includes('--loadouts-only') && rows.length > 0 && !!primary && count >= 200 && coverageGaps.length === 0 && failures.length === 0 && equipmentFailures.length === 0 && rows.every(row => row.errors.length === 0) };
const serialized = JSON.stringify(report, null, 2) + '\n';
if (output) fs.writeFileSync(output, serialized); else process.stdout.write(serialized);
if (!report.accepted && !args.includes('--report-only')) process.exitCode = 1;
