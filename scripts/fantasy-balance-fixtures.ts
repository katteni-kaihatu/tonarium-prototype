import { fantasyOffhandEquipError } from '../shared/fantasy-equipment-slots.ts';
import { applyFantasyAction, fantasyStats, newFantasyProfile } from '../shared/fantasy-engine.ts';
import { FANTASY_ITEMS, FANTASY_JOBS, FANTASY_LOCATIONS, FANTASY_RECIPES } from '../shared/fantasy-data.ts';
import { createFantasyGear, fantasyCraftInputs, fantasyEquipGear } from '../shared/fantasy-equipment.ts';
import { fantasyCanCraft } from '../shared/fantasy-town.ts';
import { fantasyCompileCircle, grantFantasyCircleBasics } from '../shared/fantasy-magic-circle.ts';
import { fantasyCompanyCapacity, fantasySpellCapacity, type FantasyCompanyKind } from '../shared/fantasy-specializations.ts';
import { fantasyJobMagicAttackRatio, fantasyJobHealingBonus } from '../shared/fantasy-job-balance.ts';
import { type FantasyAdventurerGrade } from '../shared/fantasy-adventurer.ts';
import { FANTASY_COMBAT_ENEMIES, type FantasyCombatEnemyTemplate } from '../shared/fantasy-combat-catalog.ts';
import { createFantasyCombat, fantasyCombatAttackError, fantasyCombatHitChance, fantasyCombatOrderError, fantasyCombatRageMultiplier, submitFantasyCombatOrder, type FantasyCombatFighter, type FantasyCombatSkill, type FantasyCombatOptions, type FantasyCombatOrder, type FantasyCombatUnitOrder, type FantasyCombatPlayer, type FantasyCombatState } from '../shared/fantasy-combat.ts';
import { fantasyCombatSituationalBonus } from '../shared/fantasy-situational.ts';
import { fantasyEnemyAttackById } from '../shared/fantasy-enemy-attacks.ts';
import { fantasyEnemyAttackChoice } from '../shared/fantasy-enemy-combat.ts';
import { fantasyCombatDashLanding, fantasyCombatDashTrail, fantasyCombatSkillMovePath } from '../shared/fantasy-combat-movement.ts';
import { fantasyCombatActors, fantasyCombatWithinRange, fantasyCombatDistance, fantasyCombatMoveRange, fantasyCombatPath, fantasyCombatLineOfSight, fantasyCombatTileKey } from '../shared/fantasy-combat-tactics.ts';
import type { FantasyProfile } from '../shared/fantasy.ts';


export type Gear = 'basic' | 'ordinary' | 'fine';
export type Policy = 'basic' | 'trained' | 'prepared';
const localized = (ko: string, en: string, ja: string) => ({ ko, en, ja });

export function createdBenchmarkProfile(race: string): FantasyProfile {
  const draft = newFantasyProfile(); draft.draft.candidate = race;
  const created = applyFantasyAction(draft, { type: 'create', source: 'candidate', name: '기준 모험가', gender: 'female' }, () => .5);
  if (created.error || !created.profile.character) throw new Error(`Creation failed: ${created.error}`);
  return created.profile;
}
export function baseBenchmarkProfile(race: string, job: string, gear: Gear, craftingAudit: Record<string, unknown[]> = {}): FantasyProfile {
  const profile = createdBenchmarkProfile(race), character = profile.character!, definition = FANTASY_JOBS.find(entry => entry.id === job)!;
  character.job = job; character.jobXp[job] = 1000; character.hour = 108; character.location = 'sunmeadow'; character.fatigue = character.hunger = 0;
  character.skillXp = Object.fromEntries(definition.skills.map(skill => [skill.id, 200]));
  character.unlockedSkills = definition.skills.filter(skill => skill.unlock?.kind === 'mentor').map(skill => skill.id);
  character.readBooks = [];
  character.specialization = undefined;
  character.equipment = {}; character.equippedGear = {}; character.gear = []; character.inventory = { lantern: 1 };
  craftingAudit[`${race}:${job}:${gear}`] = [];
  const caster = ['mage','priest','summoner'].includes(job), bow = ['archer','hunter','ranger','scout'].includes(job), spear = job === 'spearfighter';
  const recipes = [[caster ? 'carpenter-mana-staff' : bow ? 'carpenter-bow' : spear ? 'forge-spear' : 'smith-blade', caster || bow ? 'worldtree-branch' : 'starsteel-ingot', caster ? 'sapphire' : bow ? 'emerald' : 'ruby'],
    ['sew-lizard-armor', 'moon-silk', 'diamond'], ['forge-shield', 'starsteel-ingot', 'diamond'], [caster ? 'gemcutter-charm' : 'gemcutter-ruby-ring', 'starsteel-ingot', caster ? 'sapphire' : 'ruby']];
  for (const [recipeId, material, gem] of recipes) {
    const recipe = FANTASY_RECIPES.find(entry => entry.id === recipeId);
    if (!recipe) throw new Error(`Missing recipe: ${recipeId}`);
    const output = FANTASY_ITEMS.find(item => item.id === recipe.output);
    if (!output) throw new Error(`Missing output: ${recipe.output}`);
    if (fantasyOffhandEquipError(character, output)) continue;
    const crafter = structuredClone(character); crafter.job = recipe.job; crafter.jobXp[recipe.job] = gear === 'basic' ? 0 : 1000;
    crafter.inventory = Object.fromEntries(FANTASY_ITEMS.map(item => [item.id, 100]));
    const workshop = FANTASY_LOCATIONS.find(place => fantasyCanCraft({ ...crafter, location: place.id }, recipe));
    if (!workshop) throw new Error(`No valid workshop: ${recipeId}`);
    const inputs = fantasyCraftInputs(crafter, recipe, gear === 'fine' ? material : undefined, gear === 'fine' ? gem : undefined);
    if (inputs.error) throw new Error(`${recipeId}: ${inputs.error}`);
    character.inventory[recipe.output] = 1;
    // 制作者の熟練度で品質を決め、装備の品質を直接書き換えない。
    const instance = createFantasyGear(crafter, recipe.output, () => gear === 'fine' ? .999 : gear === 'ordinary' ? .5 : .1, inputs.material, gear === 'fine' ? gem : undefined);
    if (!instance) throw new Error(`Gear creation failed: ${recipeId}`);
    character.gear.push(instance);
    const error = fantasyEquipGear(character, recipe.output, instance.id);
    if (error) throw new Error(`${recipeId}: ${error}`);
    craftingAudit[`${race}:${job}:${gear}`].push({ recipe: recipeId, workshop: workshop.id, inputs: inputs.inputs, item: recipe.output, quality: instance.quality, material: instance.material, gem: instance.gem });
  }
  return profile;
}

export function createBenchmarkProfile(race: string, job: string, gear: Gear, level: number, training: number, outfit: string, retinue = false, base?: FantasyProfile, starterCharacter?: NonNullable<FantasyProfile['character']>): FantasyProfile {
    const profile = structuredClone(base ?? baseBenchmarkProfile(race,job,gear)), character = profile.character!;
    const starter = starterCharacter ?? createdBenchmarkProfile(race).character!; character.level = level; character.jobXp[job] = training;
    const definition = FANTASY_JOBS.find(entry => entry.id === job)!;
    character.skillXp = Object.fromEntries(definition.skills.map(skill => [skill.id, Math.min(200, Math.floor(training / 5))]));
    character.unlockedSkills = training >= 150 ? definition.skills.filter(skill => skill.unlock?.kind === 'mentor').map(skill => skill.id) : [];
    if (outfit === 'starter') { character.inventory = structuredClone(starter.inventory); character.equipment = structuredClone(starter.equipment ?? {}); character.equippedGear = structuredClone(starter.equippedGear ?? {}); character.gear = structuredClone(starter.gear ?? []); }
    if (outfit === 'weapon') { character.equipment = { weapon: character.equipment?.weapon }; character.equippedGear = { weapon: character.equippedGear?.weapon }; }
    if (job === 'mage' || job === 'priest') {
      grantFantasyCircleBasics(character);
      const circles=job==='mage'?[{core:'flame',runes:['focus','scatter']},{core:'flame',runes:['economy']},{core:'gale',runes:['focus','scatter']}]:[{core:'holy',runes:['focus','scatter']},{core:'healing',runes:['focus']},{core:'barrier',runes:['scatter','economy']}];
      character.specialization={spells:circles.slice(0,fantasySpellCapacity(character)).map((recipe,index)=>{
        const circle=fantasyCompileCircle(character,recipe.core,recipe.runes);if(!circle)throw new Error(`Illegal circle ${job}:${training}:${recipe.core}`);
        return {slot:index+1,element:job==='mage'?(recipe.core as 'flame'|'gale'):'light' as const,form:circle.kind==='heal'?'mend' as const:'bolt' as const,circle:recipe};
      })};
    }
    const maximum = fantasyStats(character); character.hp = maximum.hp; character.mp = maximum.mp;
    if(retinue && ['leader','crimeboss','summoner'].includes(job)) {
      let equipped=profile;
      const kind:FantasyCompanyKind=job==='leader'?'troop':job==='crimeboss'?'syndicate':'summons';
      const memberIds=kind==='troop'?['troop-guard','troop-scout']:kind==='syndicate'?['syndicate-lookout','syndicate-keeper']:['summon-wisp','summon-stone'];
      equipped.character!.location=kind==='summons'?'starspire':'hearth';
      for(const member of memberIds.slice(0,Math.min(2,fantasyCompanyCapacity(equipped.character!,kind))))for(const operation of ['hire','assign'] as const){
        const result=applyFantasyAction(equipped,{type:'command',kind,operation,member},()=>.5); if(result.error)throw new Error(`${job} ${operation} ${member}: ${result.error}`); equipped=result.profile;
      }
      const character=equipped.character!; character.location='sunmeadow'; character.fatigue=character.hunger=0; const maximum=fantasyStats(character); character.hp=maximum.hp; character.mp=maximum.mp;
      return equipped;
    }
    return profile;
}

export function benchmarkSupplies(player: FantasyCombatPlayer, policy: Policy, grade: FantasyAdventurerGrade): FantasyCombatOptions {
  if (policy !== 'prepared') return {};
  const tier = Math.min(4, Math.max(1, Math.ceil(grade / 2)));
  const items = [`hp-potion-${tier}`, `mp-potion-${tier}`].map(id => {
    const item = FANTASY_ITEMS.find(entry => entry.id === id);
    if (!item?.use) throw new Error(`Missing potion: ${id}`);
    return [id, { count: 1, names: localized('기준 회복약', 'Benchmark potion', '基準回復薬'), ...(item.use.hp ? { hp: item.use.hp } : {}), ...(item.use.mp ? { mp: item.use.mp } : {}) }] as const;
  });
  return { supplies: { [player.userId]: Object.fromEntries(items) } };
}

export function benchmarkDamageForecast(state: FantasyCombatState, attacker: FantasyCombatFighter, target: FantasyCombatFighter, skill?: FantasyCombatSkill, options: { magic?: boolean; coefficient?: number; guarding?: boolean } = {}) {
  const range = skill?.range ?? (skill?.magic ? 'magic' : attacker.range);
  const magic = options.magic ?? (skill?.reach !== undefined ? skill.magic === true : skill?.magic === true || range === 'magic');
  const hit = fantasyCombatHitChance(state, attacker, target, skill, { magic, range });
  const condition = (fighter: FantasyCombatFighter, id: string) => fighter.conditions?.find(entry => entry.id === id)?.power ?? 0;
  const resistance = target.template ? FANTASY_COMBAT_ENEMIES.find(enemy => enemy.id === target.template) : undefined;
  const power = (skill?.power ?? 0) + (attacker.blessing?.power ?? 0) + fantasyCombatSituationalBonus(attacker.vocation, { id: target.template, kind: resistance?.kind }).power;
  const multiplier = (target.miracles?.afflictions?.includes('curse') ? 1.15 : 1) * (attacker.miracles?.afflictions?.includes('possession') ? .85 : 1) * Math.max(.5, Math.min(1.5, (magic ? resistance?.magicMultiplier : resistance?.physicalMultiplier) ?? 1));
  const mitigation = (1 - Math.min(.3, condition(attacker, 'weaken') * .02)) * (1 + Math.min(.35, condition(target, 'vulnerable') * .025)) * (1 - Math.min(.3, condition(target, 'resolve') * .02));
  const attackerTemplate = FANTASY_COMBAT_ENEMIES.find(enemy => enemy.id === attacker.template);
  const coefficient = options.coefficient ?? (attackerTemplate && skill ? fantasyEnemyAttackById(attackerTemplate, skill.id)?.damageScale : undefined) ?? 1;
  const raw = Math.max(1, (magic ? attacker.stats.intelligence * 1.3 + attacker.stats.attack * fantasyJobMagicAttackRatio(attacker.vocation?.job) + power - (target.stats.magicResist + condition(target, 'clarity') * 2) * .65 : attacker.stats.attack + power - target.stats.defense * .7) * coefficient * fantasyCombatRageMultiplier(attacker, state.round) * multiplier * mitigation);
  const damage = (critical: boolean) => Math.max(0, Math.max(1, Math.round(Math.max(1, Math.round(raw * (critical ? 1.4 : 1) * (hit.covered ? magic ? .9 : .75 : 1))) * ((options.guarding ?? target.guarding) ? .35 : 1))) - target.ward);
  const normal = damage(false), critical = damage(true);
  return { magic, chance: hit.chance, normal, critical, expected: (hit.chance - .05) * normal + .05 * critical };
}

export function benchmarkOrder(state: FantasyCombatState, policy: Policy, options: FantasyCombatOptions, unitId?: string, playerId = 'reference'): FantasyCombatOrder {
  const actor = unitId ? state.units!.find(unit=>unit.id===unitId)! : state.fighters.find(fighter => fighter.userId === playerId)!, target = state.fighters.find(fighter => fighter.side === 'enemies' && fighter.hp > 0)!;
  const legal = (candidate: FantasyCombatOrder) => !fantasyCombatOrderError(state, playerId, unitId?{type:'unit',unit:unitId,order:candidate as FantasyCombatUnitOrder}:candidate, options);
  if (policy !== 'basic') {
    const enemies = state.fighters.filter(fighter => fighter.side === 'enemies' && fighter.hp > 0 && !fighter.fled);
    const players = fantasyCombatActors(state).filter(fighter => fighter.side === 'players' && fighter.hp > 0 && !fighter.fled);
    const imminent = enemies.filter(enemy => enemy.enemyCharge && enemy.enemyCharge.resolvesRound <= state.round);
    const danger = new Set(imminent.flatMap(enemy => enemy.enemyCharge!.tiles.map(fantasyCombatTileKey)));
    if (actor.tile && danger.has(fantasyCombatTileKey(actor.tile))) {
      const fields = new Set((state.fields ?? []).filter(field => field.expiresRound > state.round).map(field => fantasyCombatTileKey(field.tile)));
      const threat = (tile: NonNullable<typeof actor.tile>) => {
        const moved = { ...actor, tile };
        return enemies.filter(enemy => !imminent.includes(enemy)).reduce((sum, enemy) => {
          const choice = fantasyEnemyAttackChoice(state, enemy, players.map(player => player.id === actor.id ? moved : player));
          if (choice) return sum + (!choice.skill.prepare && choice.reachable.some(player => player.id === actor.id) ? benchmarkDamageForecast(state, enemy, moved, choice.skill).expected : 0);
          const attacks = [undefined, ...enemy.skills.filter(skill => skill.kind === 'attack' && skill.mp <= enemy.mp)];
          return sum + Math.max(0, ...attacks.map(skill => {
            if (fantasyCombatAttackError(state, enemy, moved, skill)) return 0;
            return benchmarkDamageForecast(state, enemy, moved, skill).expected;
          }));
        }, 0);
      };
      const occupied = new Set(fantasyCombatActors(state).filter(fighter => fighter.hp > 0 && !fighter.fled && fighter.tile).map(fighter => fantasyCombatTileKey(fighter.tile!)));
      const originThreat=threat(actor.tile);
      const safePath=(path:NonNullable<ReturnType<typeof fantasyCombatPath>>)=>path.length>1&&!danger.has(fantasyCombatTileKey(path.at(-1)!))&&!path.slice(1).some(step=>fields.has(fantasyCombatTileKey(step)))&&threat(path.at(-1)!)<=originThreat;
      const movingAttacks=actor.skills.filter(skill=>skill.kind==='attack'&&skill.motion&&skill.motion.kind!=='reposition').flatMap(skill=>enemies.flatMap(victim=>{
        const candidate:FantasyCombatOrder={type:'skill',skill:skill.id,target:victim.id};if(!legal(candidate))return [];
        const landing=fantasyCombatDashLanding(state,actor,victim,skill);if(!landing||!actor.tile||!victim.tile)return [];
        const path=fantasyCombatDashTrail(actor.tile,victim.tile,landing,skill.motion!.kind!=='advance'),damage=benchmarkDamageForecast(state,actor,victim,skill);
        return safePath(path)&&damage.normal>0?[{candidate,damage:damage.expected,mp:skill.mp}]:[];
      })).sort((a,b)=>b.damage-a.damage||a.mp-b.mp||JSON.stringify(a.candidate).localeCompare(JSON.stringify(b.candidate)));
      if(movingAttacks[0])return movingAttacks[0].candidate;
      const exits = Array.from({ length: (state.battlefield?.width ?? 0) * (state.battlefield?.height ?? 0) }, (_, index) => ({ x: index % 10, y: Math.floor(index / 10) }))
        .filter(tile => !danger.has(fantasyCombatTileKey(tile)) && !occupied.has(fantasyCombatTileKey(tile)))
        .flatMap(tile => {
          const path = fantasyCombatPath(state, actor, tile), candidate: FantasyCombatOrder = { type: 'moveTo', tile };
          return path && path.length > 1 && path.length - 1 <= fantasyCombatMoveRange(actor) && !path.slice(1).some(step => fields.has(fantasyCombatTileKey(step))) && legal(candidate) ? [{ tile, path, threat: threat(tile) }] : [];
        }).sort((a,b) => a.threat-b.threat || a.path.length-b.path.length || fantasyCombatDistance(a.tile,target.tile!)-fantasyCombatDistance(b.tile,target.tile!) || a.tile.y-b.tile.y || a.tile.x-b.tile.x);
      if (exits[0] && exits[0].threat <= originThreat) {
        const relocated={...actor,tile:exits[0].tile};
        const relocatedState={...state,fighters:state.fighters.map(fighter=>fighter.id===actor.id?relocated:fighter),...(state.units?{units:state.units.map(unit=>unit.id===actor.id?relocated:unit)}:{})};
        const canCounter=[undefined,...actor.skills.filter(skill=>skill.kind==='attack'&&skill.mp<=actor.mp)].some(skill=>!fantasyCombatAttackError(relocatedState,relocated,target,skill));
        // 接敵し直す間の確定的な遠隔攻撃より、今の防御が安全なら位置を保つ。
        if(enemies.length===1&&!state.fields?.length&&!canCounter&&imminent.every(enemy=>enemy.enemyCharge!.skill.startsWith('enemy-'))){
          const pending=imminent.map(enemy=>({enemy,skill:enemy.skills.find(skill=>skill.id===enemy.enemyCharge!.skill)!}));
          if(pending.every(entry=>entry.skill)){
            const guarded=pending.map(({enemy,skill})=>benchmarkDamageForecast(state,enemy,actor,skill,{guarding:true}));
            const following={...relocatedState,round:state.round+1};
            const returnDamage=enemies.reduce((sum,enemy)=>{
              const choice=fantasyEnemyAttackChoice(following,enemy,players.map(player=>player.id===actor.id?relocated:player));
              return sum+(choice&&!choice.skill.prepare&&choice.reachable.some(player=>player.id===actor.id)?benchmarkDamageForecast(following,enemy,relocated,choice.skill).expected:0);
            },0);
            const ongoing=actor.effects.filter(effect=>effect.id!=='frost').reduce((sum,effect)=>sum+effect.power,0)+(actor.conditions??[]).filter(condition=>condition.id==='bleed').reduce((sum,condition)=>sum+condition.power,0);
            if(guarded.reduce((sum,hit)=>sum+hit.expected,0)+ongoing<returnDamage*.9&&actor.hp>guarded.reduce((sum,hit)=>sum+hit.critical,0)+ongoing*2)return {type:'guard'};
          }
        }
        return { type: 'moveTo', tile: exits[0].tile };
      }
      const repositions=actor.skills.filter(skill=>skill.motion?.kind==='reposition'&&skill.mp<=actor.mp).flatMap(skill=>Array.from({length:80},(_,index)=>({x:index%10,y:Math.floor(index/10)})).flatMap(tile=>{
        const candidate:FantasyCombatOrder={type:'skillMove',skill:skill.id,tile},path=fantasyCombatSkillMovePath(state,actor,skill,tile);
        return path&&safePath(path)&&legal(candidate)?[{candidate,path,mp:skill.mp}]:[];
      })).sort((a,b)=>a.mp-b.mp||a.path.length-b.path.length||JSON.stringify(a.candidate).localeCompare(JSON.stringify(b.candidate)));
      if(repositions[0])return repositions[0].candidate;
      return { type: 'guard' };
    }
    const template = FANTASY_COMBAT_ENEMIES.find(enemy => enemy.id === target.template)!;
    const basePattern = template.pattern;
    const cost = basePattern === 'breath' && state.round % 3 === 0 ? 6 : ['arcane','frost','drain'].includes(basePattern) ? 4 : 0;
    const pattern = cost > target.mp || cost > 0 && target.conditions?.some(condition=>condition.id==='silence') ? 'strike' : basePattern;
    if (!target.skills.length && pattern === 'breath' && state.round % 3 === 0 && target.mp >= 6) return { type: 'guard' };
    const expected = (attacker: typeof actor, victim: typeof actor, skill?: typeof actor.skills[number], forceMagic?: boolean) => benchmarkDamageForecast(state, attacker, victim, skill, { magic: forceMagic }).expected;
    const enemyChoice = fantasyEnemyAttackChoice(state,target,players), traitAttack = enemyChoice?.skill;
    const enemyForecast = enemyChoice && (!enemyChoice.reachable.some(player=>player.id===actor.id) || enemyChoice.skill.prepare) || target.enemyCharge ? {normal:0,critical:0,expected:0} : benchmarkDamageForecast(state,target,actor,traitAttack,{magic:enemyChoice ? traitAttack?.magic===true : ['arcane','drain'].includes(pattern)&&target.mp>=4});
    const healingAmount=(skill:typeof actor.skills[number])=>skill.power+Math.floor(actor.stats.intelligence*.8)+fantasyJobHealingBonus(actor.vocation?.job,actor.stats.hp);
    const normalHit=Math.max(1,enemyForecast.normal), criticalHit=Math.max(1,enemyForecast.critical);
    const ongoing=actor.effects.filter(effect=>effect.id!=='frost').reduce((sum,effect)=>sum+effect.power,0)+(actor.conditions?.find(condition=>condition.id==='bleed')?.power??0);
    const chill=actor.effects.find(effect=>effect.id==='frost')?.power??0;
    const initiative=actor.stats.agility-(chill?Math.min(9,2+chill):0);
    const healsFirstNext=initiative>target.stats.agility||initiative===target.stats.agility&&actor.id.localeCompare(target.id)<0;
    if (actor.hp < actor.stats.hp) {
      const guardWindow=!target.skills.length&&pattern==='guard'&&state.round%3===0;
      // 遅い回復役は、次の回復が解決する前の二撃も見込む。敵の凍結切れにも頼らない。
      const urgent=actor.hp<=(healsFirstNext?normalHit*1.5:criticalHit*2)+ongoing*(healsFirstNext?1:2)||ongoing>=actor.hp||guardWindow&&actor.hp<actor.stats.hp*.5;
      const usefulHeal=(amount:number)=>urgent&&Math.min(actor.stats.hp,actor.hp+amount)>ongoing&&(guardWindow||ongoing>=actor.hp||Math.ceil(Math.min(actor.stats.hp,actor.hp+amount)/normalHit)>Math.ceil(actor.hp/normalHit));
      if(!state.fields?.length&&['strike','swarm','guard','regen'].includes(pattern)&&healsFirstNext&&actor.hp>criticalHit+ongoing&&!actor.conditions?.length&&!target.conditions?.length&&!actor.miracles?.afflictions?.includes('possession')){
        const finishers:[FantasyCombatOrder,typeof actor.skills[number]|undefined][]=[
          [{type:'attack',target:target.id},undefined],...actor.skills.filter(skill=>skill.kind==='attack').map(skill=>[{type:'skill',skill:skill.id,target:target.id},skill] as [FantasyCombatOrder,typeof skill]),
        ];
        for(const [candidate,skill] of finishers){
          if(!legal(candidate)||skill?.field||skill?.motion)continue;
          const hit=benchmarkDamageForecast(state,actor,target,skill,{guarding:guardWindow});
          const damage=hit.normal;
          const recovery=actor.skills.some(heal=>heal.kind==='heal'&&heal.mp<=actor.mp-(skill?.mp??0)&&Math.min(actor.stats.hp,actor.hp-criticalHit-ongoing+healingAmount(heal))>criticalHit+ongoing&&legal({type:'skill',skill:heal.id,target:actor.id}));
          if(hit.chance>=.8&&damage>=target.hp&&recovery)return candidate;
        }
      }
      const missingAtHeal=Math.min(actor.stats.hp,actor.stats.hp-actor.hp+(!healsFirstNext&&!guardWindow?normalHit:0));
      const heal = actor.skills.filter(skill => skill.kind === 'heal' && skill.mp <= actor.mp && usefulHeal(healingAmount(skill))).sort((a, b) => Math.min(missingAtHeal,healingAmount(b))-Math.min(missingAtHeal,healingAmount(a)) || a.mp-b.mp || a.id.localeCompare(b.id));
      for (const skill of heal) { const candidate: FantasyCombatOrder = { type: 'skill', skill: skill.id, target: actor.id }; if (legal(candidate)) return candidate; }
      for (const [item, supply] of Object.entries(options.supplies?.[playerId] ?? {})) {
        const candidate: FantasyCombatOrder = { type: 'item', item, target: actor.id }; if (supply.hp && usefulHeal(supply.hp) && legal(candidate)) return candidate;
      }
    }
    const basicDamage=expected(actor,target), incoming=!target.skills.length&&pattern==='guard'&&state.round%3===0||traitAttack?.prepare?0:enemyForecast.expected;
    const silenceBenefit=()=>{
      if(enemyChoice){
        if(!enemyChoice.skill.magic||!enemyChoice.reachable.some(player=>player.id===actor.id))return 0;
        const silenced={...target,conditions:[...(target.conditions??[]).filter(condition=>condition.id!=='silence'),{id:'silence' as const,power:1,turns:1}]};
        const fallback=fantasyEnemyAttackChoice(state,silenced,players),reachable=fallback?.reachable.some(player=>player.id===actor.id);
        const casting=benchmarkDamageForecast(state,target,actor,enemyChoice.skill),ordinary=fallback&&reachable?benchmarkDamageForecast(state,silenced,actor,fallback.skill):undefined;
        const drain=basePattern==='drain'?Math.max(1,Math.floor(target.stats.attack*.2))*(casting.chance-(ordinary?.chance??0)):0;
        return Math.max(0,casting.expected-(ordinary?.expected??0)+drain);
      }
      if(!['arcane','drain'].includes(pattern)||target.mp<4)return 0;
      const casting=expected(target,actor,undefined,true),fallback=expected(target,actor,undefined,false);
      const drain=pattern==='drain'?Math.max(1,Math.floor(target.stats.attack*.2))*fantasyCombatHitChance(state,target,actor,undefined,{magic:true,range:target.range}).chance:0;
      return Math.max(0,casting-fallback+drain);
    };
    const offensive = actor.skills.filter(skill => skill.kind === 'attack').map(skill => ({skill,value:expected(actor,target,skill)}))
      .sort((a,b)=>b.value-a.value || a.skill.mp-b.skill.mp || a.skill.id.localeCompare(b.skill.id));
    const bestAttack=offensive.find(entry=>legal({type:'skill',skill:entry.skill.id,target:target.id}));
    const ordinaryLegal=legal({type:'attack',target:target.id});
    const opportunity=bestAttack?.value??(ordinaryLegal?basicDamage:0);
    const remainingTurns=Math.min(3,Math.max(1,Math.ceil(target.hp/Math.max(1,opportunity||basicDamage))));
    const setupReach = actor.range === 'melee' ? 1 : actor.range === 'ranged' ? 7 : 8;
    const approaching = !target.enemyCharge && !target.conditions?.some(condition=>condition.id==='root') && (enemyChoice ? !enemyChoice.reachable.length : !fantasyCombatWithinRange(state,target,actor,target.range));
    const usefulOpeningFocus = approaching && !!actor.tile && !!target.tile && fantasyCombatLineOfSight(state,actor.tile,target.tile) && fantasyCombatDistance(actor.tile,target.tile) <= setupReach + fantasyCombatMoveRange(target);
    const utility=actor.skills.filter(skill=>['boon','hex','focus','guard'].includes(skill.kind)&&!skill.motion).map(skill=>{
      const recipient=skill.kind==='hex'?target:actor;
      if(skill.utility&&recipient.conditions?.some(condition=>condition.id===skill.utility&&condition.turns>=2))return {skill,value:0,recipient};
      const turns=remainingTurns,power=skill.power;
      const value=skill.kind==='focus'?(!actor.aim&&!ordinaryLegal&&!bestAttack&&usefulOpeningFocus?basicDamage*Math.min(.2,power/100):0)
        :skill.kind==='guard'?(actor.hp<incoming*1.5?Math.min(incoming,power+actor.stats.intelligence*.3):0)
        :skill.utility==='regen'?Math.min(actor.stats.hp-actor.hp,power*turns)
        :skill.utility==='thorns'?Math.min(target.hp,power*turns)
        :skill.utility==='lifesteal'?Math.min(actor.stats.hp-actor.hp,basicDamage*Math.min(.3,power*.02)*turns)
        :skill.utility==='resolve'?incoming*Math.min(.3,power*.02)*turns
        :skill.utility==='weaken'?incoming*Math.min(.3,power*.02)*turns
        :skill.utility==='vulnerable'?basicDamage*Math.min(.35,power*.025)*turns
        :skill.utility==='bleed'?Math.min(target.hp,power*turns)
        :skill.utility==='blind'?incoming*Math.min(.35,power*.02)*turns
        :skill.utility==='silence'?silenceBenefit()*turns
        :skill.utility==='clarity'?incoming*Math.min(.25,power*.015)*turns
        :skill.utility==='haste'?incoming*Math.min(.15,power*.01)*turns:0;
      return {skill,recipient,value};
    }).filter(entry=>entry.value>opportunity&&entry.skill.mp<=actor.mp*.6).sort((a,b)=>b.value-a.value||a.skill.id.localeCompare(b.skill.id));
    for(const {skill,recipient} of utility){const candidate:FantasyCombatOrder={type:'skill',skill:skill.id,target:recipient.id};if(legal(candidate))return candidate;}
    const recoveryDamage = traitAttack?.prepare ? 0 : enemyForecast.critical;
    const recoveryReserve = recoveryDamage * (healsFirstNext ? 1 : 2) + ongoing * (healsFirstNext ? 1 : 2);
    if(!actor.manaRecoveryUsed&&actor.hp>recoveryReserve){
      const recoveries=actor.skills.filter(skill=>skill.kind==='mana').map(skill=>({skill,gain:Math.min(actor.stats.mp-actor.mp+skill.mp,skill.power+Math.floor(actor.stats.intelligence*.4))-skill.mp})).filter(entry=>entry.gain>0).sort((a,b)=>b.gain-a.gain||a.skill.mp-b.skill.mp||a.skill.id.localeCompare(b.skill.id));
      for(const {skill,gain} of recoveries){
        const candidate:FantasyCombatOrder={type:'skill',skill:skill.id,target:actor.id};if(!legal(candidate))continue;
        const funded={...actor,mp:actor.mp+gain},fundedState={...state,fighters:state.fighters.map(fighter=>fighter.id===actor.id?funded:fighter),...(state.units?{units:state.units.map(unit=>unit.id===actor.id?funded:unit)}:{})};
        const funds=(ability:FantasyCombatSkill,recipient:FantasyCombatFighter)=>{
          if(ability.mp<=actor.mp||ability.mp>funded.mp)return false;
          const action:FantasyCombatOrder={type:'skill',skill:ability.id,target:recipient.id};
          return !fantasyCombatOrderError(fundedState,playerId,unitId?{type:'unit',unit:unitId,order:action as FantasyCombatUnitOrder}:action,options);
        };
        const neededAttack=offensive.some(entry=>entry.value>basicDamage&&target.hp>basicDamage&&funds(entry.skill,target));
        const neededHeal=actor.hp<actor.stats.hp&&actor.hp<=recoveryDamage+(healsFirstNext?normalHit*1.5:criticalHit*2)+ongoing*(healsFirstNext?1:2)&&actor.skills.some(heal=>heal.kind==='heal'&&healingAmount(heal)>0&&funds(heal,actor));
        if(neededAttack||neededHeal)return candidate;
      }
    }
    if(bestAttack && bestAttack.value < basicDamage && ordinaryLegal) return {type:'attack',target:target.id};
    for (const { skill } of offensive) { const candidate: FantasyCombatOrder = { type: 'skill', skill: skill.id, target: target.id }; if (legal(candidate)) return candidate; }
    if (offensive.length && offensive.every(entry => entry.skill.mp > actor.mp)) for (const [item, supply] of Object.entries(options.supplies?.[playerId] ?? {})) {
      const candidate: FantasyCombatOrder = { type: 'item', item, target: actor.id }; if (supply.mp && legal(candidate)) return candidate;
    }
  }
  const attack: FantasyCombatOrder = { type: 'attack', target: target.id }; if (legal(attack)) return attack;
  const reach = actor.range === 'melee' ? 1 : actor.range === 'ranged' ? 7 : 8;
  const tiles = Array.from({ length: 80 }, (_, index) => ({ x: index % 10, y: Math.floor(index / 10) }))
    .filter(tile => target.tile && actor.tile && fantasyCombatDistance(tile, target.tile) <= reach && fantasyCombatLineOfSight(state, tile, target.tile))
    .sort((a, b) => fantasyCombatDistance(actor.tile!,a)-fantasyCombatDistance(actor.tile!,b) || a.y-b.y || a.x-b.x);
  let best: NonNullable<ReturnType<typeof fantasyCombatPath>> | undefined;
  for (const tile of tiles) {
    if(best && fantasyCombatDistance(actor.tile!,tile)>best.length-1)break;
    const path=fantasyCombatPath(state,actor,tile);
    if(path && path.length>1 && (!best || path.length<best.length))best=path;
  }
  if(best){const candidate: FantasyCombatOrder={type:'moveTo',tile:best[Math.min(best.length-1,fantasyCombatMoveRange(actor))]};if(legal(candidate))return candidate;}
  return { type: 'guard' };
}

export function benchmarkFight(loadout: {player: FantasyCombatPlayer; grade: FantasyAdventurerGrade}, enemy: FantasyCombatEnemyTemplate, policy: Policy, seed: number, onInvalid?: (selected: FantasyCombatOrder, options: FantasyCombatOptions, state: FantasyCombatState) => void) {
  const options = benchmarkSupplies(loadout.player, policy, loadout.grade);
  let state = createFantasyCombat({ id: 'balance-report', location: 'sunmeadow', source: `${enemy.provocationOnly ? 'apex' : 'hunt'}:${enemy.id}`, players: [structuredClone(loadout.player)], enemies: [{ id: 'foe', template: enemy.id }], seed, hour: 108, tactical: true });
  let items = 0, error: string | undefined; const actions: Record<string,number>={};
  while (state.status === 'active' && state.round <= 100) {
    for(const unit of state.units??[]){
      if(unit.hp<=0||unit.fled)continue;
      const selected=benchmarkOrder(state,policy,options,unit.id), key=`unit:${unit.id}:${selected.type==='skill'?selected.skill:selected.type}`; actions[key]=(actions[key]??0)+1;
      const result=submitFantasyCombatOrder(state,'reference',state.revision,{type:'unit',unit:unit.id,order:selected as FantasyCombatUnitOrder},state.hour,options);
      if(result.error||!result.changed){error=result.error??'unit-no-progress';break;} state=result.state;
    }
    if(error)break;
    const selected = benchmarkOrder(state, policy, options);
    const actionKey=selected.type==='skill'?`skill:${selected.skill}`:selected.type; actions[actionKey]=(actions[actionKey]??0)+1;
    const result = submitFantasyCombatOrder(state, 'reference', state.revision, selected, state.hour, options);
    if (result.error) onInvalid?.(selected, options, state);
    if (result.error || !result.changed || result.state.revision === state.revision) { error = result.error ?? 'no-progress'; break; }
    for (const spent of result.spentItems) { options.supplies![spent.userId][spent.item].count--; items++; }
    state = result.state;
  }
  const actor = state.fighters.find(fighter => fighter.userId === 'reference')!;
  const outcome = error ? 'I' : state.status === 'victory' ? 'V' : state.status === 'defeat' ? 'D' : state.status === 'escaped' ? 'E' : 'T';
  let directDamageDealt=0,directDamageTaken=0;
  for(const entry of state.logs){const amount=entry.text.en.match(/: (\d+) damage\.$/);if(!amount||entry.presentation?.kind!=='attack')continue;if(entry.presentation.actor===actor.id)directDamageDealt+=Number(amount[1]);else if(entry.presentation.target===actor.id)directDamageTaken+=Number(amount[1]);}
  return { outcome, variation:state.fighters.find(fighter=>fighter.side==='enemies')!.variation!, rounds: state.round, hp: actor.hp, mp: actor.mp, items, directDamageDealt, directDamageTaken, actions, ...(error ? { error } : {}) };
}
