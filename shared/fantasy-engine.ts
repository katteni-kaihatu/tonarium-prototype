import type {
  FantasyAction, FantasyCharacter, FantasyCheckContext, FantasyItem, FantasyLog, FantasyProfile, FantasyResult,
  FantasySkill, FantasyStat, FantasyStats, FantasyTransport,
} from './fantasy.ts';
import { FANTASY_EVENT_CHANCE } from './fantasy.ts';
import { FANTASY_GATE_HOURS, fantasyGateFare, fantasyHasGate } from './fantasy-gates.ts';
import { fantasyEscortAccept, fantasyEscortAcceptError, fantasyEscortComplete, fantasyEscortTerms, fantasyEscortTransportError } from './fantasy-escort.ts';
import { fantasyIsleLocationVisible } from './fantasy-isle-access.ts';
import { fantasyMainApproachStat, fantasyMainInvestigationError, fantasyMainProgress, fantasyMainReady, fantasyMainStage, fantasyMainTrial, validFantasyMainTrials } from './fantasy-main-trials.ts';
import { fantasyTaskObjective, fantasyTaskProgress, fantasyTaskReady, grantFantasyTaskProgress } from './fantasy-task-progress.ts';
import {
  FANTASY_EVENTS, FANTASY_ITEMS, FANTASY_JOBS, FANTASY_LOCATIONS,
  FANTASY_QUESTS, FANTASY_RACES, FANTASY_RECIPES, FANTASY_ROUTES,
} from './fantasy-data.ts';
import { boundedNeed, fantasyNeedPenalty, FANTASY_DINING, FANTASY_LODGINGS, foodDetails, foodMeta, reconcileFoodLots } from './fantasy-life.ts';
import { FANTASY_MAPS, FANTASY_SETTLEMENTS, canAcquireJob, canBuyItem, canSellItem, fantasyBuildings, fantasyCanCraft, fantasyCraftFacility, fantasyFrontierLocations, fantasyKnownLocations } from './fantasy-town.ts';
import { fantasyEventEligible, fantasyQuestEligible } from './fantasy-access.ts';
import { FANTASY_CONTEXT_NAMES, fantasyContextBonus } from './fantasy-physiology.ts';
import { FANTASY_STARTING_GOLD, FANTASY_STARTING_INVENTORY, fantasyStartingInventory } from './fantasy-starting-kit.ts';
import { addFantasyStatus, applyFantasyItemUse, fantasyEffectDamage, fantasyItemBonuses, pruneFantasyEffects } from './fantasy-effects.ts';
import { fantasyHaggle, fantasyPrice, grantFantasyReputation } from './fantasy-reputation.ts';
import { fantasyMana, fantasyManaAfterSkill, fantasyManaOnUse, fantasyManaRecover, fantasyManaSkillError, fantasyManaSkills, fantasyManaStatBonuses } from './fantasy-mana.ts';
import { fantasyApprenticeshipError, fantasyLearnedSkills, fantasyNpcMentorSkills } from './fantasy-apprenticeship.ts';
import { fantasyAvailableJobSkills, fantasyPracticeMultiplier, fantasyProfessionGrade, fantasyProficiencyBonus, fantasySkilledPower, grantFantasyPractice } from './fantasy-progression.ts';
import { createFantasyGear, fantasyCombatStat, fantasyCraftInputs, fantasyEquipGear, fantasySpendItem } from './fantasy-equipment.ts';
import { FANTASY_BOAT_OPTIONS, fantasyBoatError, fantasyFishingError, fantasyFishingItem, fantasyGatheringOptions, fantasyGatherItem, fantasyHuntLoot, fantasyHuntTarget, fantasySkinError } from './fantasy-gathering.ts';
import { fantasyActivityAtSea, fantasyRescueTown, recordFantasyDeath } from './fantasy-mortality.ts';
import { applyFantasySpecialization, fantasyCompanionBonus, fantasyCompanionRescue, fantasySpecializationHours, settleFantasyCompanions } from './fantasy-specializations.ts';
import { FANTASY_READABLE_LIBRARY_BOOKS } from './fantasy-library.ts';
import { fantasyLibraryHoldings } from './fantasy-town.ts';
import { fantasyEnvironment, fantasyEnvironmentActionError, fantasyEnvironmentPenalty } from './fantasy-environment.ts';
import type { FantasyContractGrant } from './fantasy-contracts.ts';
import { fantasyDieFace, type FantasyFacePattern } from './fantasy-dice.ts';
import { applyFantasyTerrain, FANTASY_TERRAIN_ACTIVITIES, fantasyTerrainHours } from './fantasy-terrain.ts';
import { fantasyBirthBonuses } from './fantasy-birth.ts';
import { fantasyWorkInterval, fantasyWorkSteps, fantasyWorkStepRewards, fantasyWorkSummaryLog, fantasyWorkTickLog, newFantasyWorkProgress, validFantasyWorkProgress } from './fantasy-work.ts';
import { applyFantasyPrayer } from './fantasy-prayer.ts';
import { applyFantasyPriestAction, fantasyPriestActionHours, fantasyPriestSkills, syncFantasyPriestGrowth } from './fantasy-priest-growth.ts';
import { applyFantasyPropertyUse, FANTASY_PROPERTY_PLOTS, fantasyPropertyUseHours } from './fantasy-property.ts';
import { applyFantasyJobPath, fantasyJobPathHours, fantasyJobPathSkills } from './fantasy-job-paths.ts';
import { fantasySell } from './fantasy-sales.ts';
import { fantasyCampingKit } from './fantasy-camping.ts';
import { fantasyVoyageFinishError, FANTASY_VOYAGE_CHART_QUEST, FANTASY_VOYAGE_FINAL_QUEST } from './fantasy-voyage-ending.ts';
import { fantasyIsleAccess, FANTASY_FINAL_ISLE_ID } from './fantasy-isle-access.ts';
import { fantasyVoyageScene } from './fantasy-voyage-scenes.ts';
import { FANTASY_VOYAGE_DECISIONS, fantasyVoyageDecisionError } from './fantasy-voyage-decisions.ts';
import { fantasyCovertWork, fantasyEncounterChoiceStat, fantasyEncounterFor, fantasyEncounterOriginLog, fantasyEncounterOutcomeLog, fantasyFailedEventPursuit, fantasyHostileEncounter, type FantasyEncounterCause } from './fantasy-encounters.ts';
export { fantasyEventEligible, fantasyQuestEligible } from './fantasy-access.ts';

const raceOf = (id: string) => FANTASY_RACES.find(v => v.id === id);
const jobOf = (id: string) => FANTASY_JOBS.find(v => v.id === id);
const placeOf = (id: string) => FANTASY_LOCATIONS.find(v => v.id === id);
const itemOf = (id: string): FantasyItem | undefined => FANTASY_ITEMS.find(v => v.id === id) ?? FANTASY_MAPS.filter(map => map.item === id).map(map => ({ id: map.item, name: map.name.ja, price: map.price, description: map.description.ja }))[0];
const hasBuilding = (character: FantasyCharacter, id: string) => fantasyBuildings(character).some(building => building.id === id);
const random = (rng: () => number) => Math.max(0, Math.min(1 - Number.EPSILON, Number(rng()) || 0));
const practiceKeys = new WeakMap<FantasyProfile, string>();
const effectiveSkills = new WeakSet<FantasyProfile>();
const diceSides = new WeakMap<FantasyProfile, number>();

export function newFantasyProfile(): FantasyProfile {
  return { version: 1, revision: 0, draft: { remaining: 5, candidate: null, kept: null }, character: null, event: null, log: [], generation: 1, pastLives: [] };
}

export function fantasyStats(character: FantasyCharacter): FantasyStats {
  const modifiers = raceOf(character.race)?.modifiers ?? {};
  const growth = Math.floor((character.level - 1) / 3);
  const stats: FantasyStats = {
    hp: 100, mp: 50, strength: 10, agility: 10, intelligence: 10, luck: 10, vitality: 10,
  };
  for (const stat of ['strength', 'agility', 'intelligence', 'luck', 'vitality'] as const) {
    stats[stat] = Math.max(1, 10 + (modifiers[stat] ?? 0) + (character.birthBonuses?.[stat] ?? 0) + growth);
  }
  const job = jobOf(character.job);
  if (job?.extra) stats[job.extra] = Math.max(1, 10 + (modifiers[job.extra] ?? 0) + Math.min(8, Math.floor((character.jobXp[job.id] ?? 0) / 15)) + growth);
  const bonuses = fantasyItemBonuses(character, FANTASY_ITEMS).stats;
  for (const [key, value] of Object.entries(fantasyManaStatBonuses(character))) bonuses[key as keyof FantasyStats] = (bonuses[key as keyof FantasyStats] ?? 0) + value;
  for (const [key, value] of Object.entries(bonuses)) if (!['hp', 'mp'].includes(key) && stats[key as keyof FantasyStats] !== undefined) stats[key as keyof FantasyStats] = Math.max(1, stats[key as keyof FantasyStats]! + value);
  stats.hp = Math.max(20, 100 + (modifiers.hp ?? 0) + (character.birthBonuses?.hp ?? 0) + (stats.vitality - 10) * 4 + (character.level - 1) * 8 + (bonuses.hp ?? 0));
  stats.mp = Math.max(5, 50 + (modifiers.mp ?? 0) + (character.birthBonuses?.mp ?? 0) + (stats.intelligence - 10) * 3 + (character.level - 1) * 4 + (bonuses.mp ?? 0));
  return stats;
}

export function fantasySkills(character: FantasyCharacter): FantasySkill[] {
  return [...(raceOf(character.race)?.skills ?? []), ...fantasyAvailableJobSkills(character), ...fantasyManaSkills(character), ...fantasyLearnedSkills(character), ...fantasyPriestSkills(character), ...fantasyJobPathSkills(character)].map(skill => ({ ...skill, power: fantasySkilledPower(character, skill) }));
}

function creditSkill(profile: FantasyProfile, skill?: string, mp = 0) {
  const c = profile.character!;
  const key = practiceKeys.get(profile) ?? 'effect-use';
  if (skill) grantFantasyPractice(c, { key, amount: 4, success: true, skill });
  if (mp > 0) c.mana = fantasyManaOnUse(c, mp, fantasyPracticeMultiplier(c, key));
  effectiveSkills.add(profile);
}

function creditBuff(profile: FantasyProfile, buff: NonNullable<FantasyCharacter['buff']>) {
  if (buff.skill || buff.mp) creditSkill(profile, buff.skill, buff.mp ?? 0);
}

function passive(character: FantasyCharacter, effect: FantasySkill['effect'], stat?: FantasyStat) {
  return fantasySkills(character).filter(s => s.kind === 'passive' && s.effect === effect && (effect !== 'check' || !s.stat || s.stat === stat))
    .reduce((total, s) => total + s.power, 0);
}

function shortest(from: string, to: string, modes: ('land' | 'sea' | 'gate')[], seaFactor = 1): { path: string[]; hours: number; seaHours: number } | null {
  const distance = new Map<string, number>([[from, 0]]);
  const previous = new Map<string, { from: string; seaHours: number }>();
  const remaining = new Set(FANTASY_LOCATIONS.map(v => v.id));
  while (remaining.size) {
    let current: string | undefined;
    let best = Infinity;
    for (const id of remaining) {
      const d = distance.get(id) ?? Infinity;
      if (d < best) { current = id; best = d; }
    }
    if (!current) return null;
    if (current === to) {
      const path = [to];
      let seaHours = 0;
      while (path[0] !== from) {
        const step = previous.get(path[0])!;
        seaHours += step.seaHours;
        path.unshift(step.from);
      }
      return { path, hours: best, seaHours };
    }
    remaining.delete(current);
    for (const route of FANTASY_ROUTES) {
      if (!modes.includes(route.mode)) continue;
      if (route.mode === 'gate' && (!fantasyHasGate(route.from) || !fantasyHasGate(route.to))) continue;
      if (route.mode === 'sea' && (!placeOf(route.from)?.services.includes('port') || !placeOf(route.to)?.services.includes('port'))) continue;
      const next = route.from === current ? route.to : route.to === current ? route.from : null;
      if (!next || !remaining.has(next)) continue;
      const candidate = best + route.hours * (route.mode === 'sea' ? seaFactor : 1);
      if (candidate < (distance.get(next) ?? Infinity)) {
        distance.set(next, candidate);
        previous.set(next, { from: current, seaHours: route.mode === 'sea' ? route.hours : 0 });
      }
    }
  }
  return null;
}

function fantasyTransportChoices(character: FantasyCharacter, destination: string, reductionOverride?: number): FantasyTransport[] {
  const from = placeOf(character.location);
  const to = placeOf(destination);
  if (!from || !to || from.id === to.id) return [];
  if (!fantasyIsleLocationVisible(character, from.id) || !fantasyIsleLocationVisible(character, to.id)) return [];
  const finalIslePassage = from.id === FANTASY_FINAL_ISLE_ID || to.id === FANTASY_FINAL_ISLE_ID;
  const land = shortest(from.id, to.id, ['land']);
  const ship = shortest(from.id, to.id, ['land', 'sea'], 0.7);
  const workingShip = shortest(from.id, to.id, ['land', 'sea'], 2.5);
  const flight = shortest(from.id, to.id, ['land', 'sea']);
  const reduction = reductionOverride ?? passive(character, 'travel') + (character.buff?.effect === 'travel' ? character.buff.power : 0);
  const freeHours = (hours: number) => Math.max(1, Math.ceil((hours - reduction) * (1 + fantasyNeedPenalty(character) * 0.1)));
  const footHours = land ? freeHours(land.hours) : Infinity;
  const workingHours = workingShip?.seaHours ? freeHours(workingShip.hours) : Infinity;
  const known = fantasyKnownLocations(character).includes(destination) || fantasyFrontierLocations(character).includes(destination);
  const make = (id: string, name: string, description: string, route: ReturnType<typeof shortest>, factor: number, cost: number, reason?: string): FantasyTransport => {
    const actualReason = !known || id === 'gate' && !fantasyKnownLocations(character).includes(destination) ? '目的地はまだ地図にありません。隣接地域を探索するか地図を入手してください。' : finalIslePassage && !['ship','working-ship'].includes(id) ? 'この島への出入りは、確かめた航路を通る船で行ってください。' : reason ?? (!route ? 'この交通手段で通れる経路がありません。' : character.gold < cost ? `金貨が${cost - character.gold}枚足りません。` : undefined);
    const strain = ['foot', 'working-ship'].includes(id) ? 1 + fantasyNeedPenalty(character) * 0.1 : 1;
    const paid = ['carriage', 'ship', 'airship', 'gate'].includes(id);
    let hours = route ? paid ? Math.max(0.25, Math.ceil(Math.max(0.25, route.hours * factor - reduction) * 4) / 4) : Math.max(1, Math.ceil((route.hours * factor - reduction) * strain)) : 0;
    const alternative = id === 'carriage' ? footHours : id === 'ship' ? workingHours : Math.min(footHours, workingHours);
    if (paid && route && Number.isFinite(alternative)) hours = Math.max(0.25, Math.min(hours, alternative - 0.25));
    return {
      id, name, description, hours,
      cost, available: !actualReason, ...(actualReason ? { reason: actualReason } : {}), path: id === 'gate' && !fantasyKnownLocations(character).includes(destination) ? [] : route?.path ?? [],
    };
  };
  const ports = from.services.includes('port') && to.services.includes('port');
  const gates = fantasyHasGate(from.id) && fantasyHasGate(to.id);
  const gateFare = fantasyGateFare(flight?.hours ?? 0, [land ? Math.ceil(land.hours * 3) : 0, ship ? Math.ceil(ship.seaHours * 2) : 0]);
  const assignment = character.escort?.from === from.id && character.escort.destination === to.id ? character.escort : undefined;
  const escortPath = assignment ? fantasyEscortTerms(from.id,to.id)?.path : undefined;
  const escort = make('escort','護衛付き添い','ギルドの受注区間に同行する。到着後に報酬を受け取る。',assignment&&escortPath?{path:escortPath,hours:assignment.hours,seaHours:0}:null,1,0,fantasyEscortTransportError(character,destination));
  return [
    make('foot', '徒歩', '陸路を歩く。費用はかからない。', land, 1, 0),
    make('carriage', '乗合馬車', '都市から陸路を速く移動する。', land, 0.5, land ? Math.ceil(land.hours * 3) : 0, from.kind !== 'city' ? '馬車は都市から出発します。' : undefined),
    make('ship', ports ? '定期船' : '徒歩＋定期船', '港間を船で結び、陸路の区間は徒歩で移動する。', ship?.seaHours ? ship : null, 1, ship ? Math.ceil(ship.seaHours * 2) : 0),
    make('working-ship', ports ? '手伝い船' : '徒歩＋手伝い船', '港までは歩き、船仕事を手伝って無料で渡航する。時間はかかる。', workingShip?.seaHours ? workingShip : null, 1, 0),
    make('airship', '飛空艇', '冒険者レベル3で利用可能。陸と海を飛び越える。', flight, 0.2, flight ? 35 + Math.ceil(flight.hours * 4) : 0, character.level < 3 ? '冒険者レベル3で解禁されます。' : undefined),
    make('gate', '転移門', '大きな街や里の転移門を結ぶ。高額だが15分で到着する。', gates ? { path: [from.id, to.id], hours: FANTASY_GATE_HOURS, seaHours: 0 } : null, 1, gateFare, !gates ? '出発地と目的地の両方に、稼働中の転移門が必要です。' : undefined),
    { ...escort, hours:assignment?.hours??0, ...(assignment?{reward:assignment.reward}:{}) },
  ];
}

export function fantasyTransports(character: FantasyCharacter, destination: string): FantasyTransport[] {
  return fantasyTransportChoices(character, destination);
}

function addLog(profile: FantasyProfile, text: string, kind: FantasyLog['kind'] = 'story') {
  const id = (profile.log.at(-1)?.id ?? 0) + 1;
  profile.log.push({ id, hour: profile.character?.hour ?? 0, text, kind });
  if (profile.log.length > 100) profile.log.splice(0, profile.log.length - 100);
}

function addItem(character: FantasyCharacter, item: string, count = 1) {
  character.inventory[item] = (character.inventory[item] ?? 0) + count;
}

function rewardBonus(character: FantasyCharacter, profile?: FantasyProfile) {
  let bonus = passive(character, 'reward');
  if (profile) for (const skill of fantasySkills(character).filter(skill => skill.kind === 'passive' && skill.effect === 'reward')) creditSkill(profile, skill.id);
  if (character.buff?.effect === 'reward') { bonus += character.buff.power; if (profile) creditBuff(profile, character.buff); character.buff = null; }
  return bonus;
}

function gainXp(profile: FantasyProfile, amount: number, job = true) {
  const character = profile.character!;
  const before = fantasyStats(character);
  character.xp += amount;
  while (character.xp >= character.level * 30) {
    character.xp -= character.level * 30;
    character.level++;
    addLog(profile, `冒険者レベルが${character.level}になった。最大HP・MPと判定が成長した。`, 'success');
  }
  const after = fantasyStats(character);
  character.hp = Math.min(after.hp, character.hp + Math.max(0, after.hp - before.hp));
  character.mp = Math.min(after.mp, character.mp + Math.max(0, after.mp - before.mp));
}

function check(profile: FantasyProfile, stat: FantasyStat, dc: number, rng: () => number, context: string, affinity = false, bodyContext?: FantasyCheckContext, sidesOverride?: number) {
  const character = profile.character!;
  const stats = fantasyStats(character);
  const sides = sidesOverride ?? diceSides.get(profile) ?? 20;
  const covert = practiceKeys.get(profile)?.startsWith('work:') === true && jobOf(character.job)?.category === 'crime';
  const environment = fantasyEnvironmentPenalty(character, covert);
  if (character.buff?.expiresAt !== undefined && character.buff.expiresAt <= character.hour) character.buff = null;
  const prepared = character.buff?.effect === 'check' && (!character.buff.stat || character.buff.stat === stat) ? character.buff : undefined;
  const temporary = (character.effects ?? []).filter(effect => effect.expiresAt > character.hour && (effect.id === 'frost' ? stat === 'agility' : effect.id === 'weakness' ? stat === 'strength' : effect.id === 'poison' ? stat === 'vitality' : true));
  const passiveFace = fantasySkills(character).filter(skill => skill.kind === 'passive' && skill.effect === 'check' && (!skill.stat || skill.stat === stat) && skill.diceFaces).sort((a, b) => ['upper', 'even', 'steady'].indexOf(a.diceFaces!) - ['upper', 'even', 'steady'].indexOf(b.diceFaces!))[0]?.diceFaces;
  const pattern: FantasyFacePattern | undefined = prepared?.diceFaces ?? temporary.find(effect => effect.diceFaces)?.diceFaces ?? passiveFace;
  const facePenalty = Math.max(0, ...temporary.map(effect => effect.dicePenalty ?? 0));
  const positive = prepared ? 1 : 0;
  const negative = Math.min(2, (character.effects ?? []).filter(effect => effect.expiresAt > character.hour && (effect.id === 'frost' && stat === 'agility' || effect.id === 'weakness' && stat === 'strength' || effect.id === 'poison' && stat === 'vitality')).length);
  const net = positive - negative;
  const rawRolls = Array.from({ length: 1 + Math.min(2, Math.abs(net)) }, () => 1 + Math.floor(random(rng) * sides));
  const rolls = rawRolls.map(face => fantasyDieFace(face, sides, pattern, facePenalty));
  const die = net >= 0 ? Math.max(...rolls) : Math.min(...rolls);
  let modifier = Math.floor(((stats[stat] ?? 10) - 10) / 2) + character.level - 1 + passive(character, 'check', stat);
  const needPenalty = fantasyNeedPenalty(character);
  modifier -= needPenalty;
  modifier -= environment;
  if (covert && fantasyEnvironment(character).night) modifier += 1;
  modifier += fantasyItemBonuses(character, FANTASY_ITEMS).check;
  modifier += fantasyCompanionBonus(character).check;
  if (bodyContext) modifier += fantasyContextBonus(character, bodyContext);
  if (jobOf(character.job)?.stat === stat) modifier += fantasyProficiencyBonus(character);
  if (affinity && raceOf(character.race)?.affinity.includes(placeOf(character.location)!.kind)) modifier += 2;
  if (character.buff?.effect === 'check' && (!character.buff.stat || character.buff.stat === stat)) {
    modifier += character.buff.power;
    character.buff = null;
  }
  const limited = (value: number) => sides < 20 ? Math.max(-Math.floor(sides / 2), Math.min(Math.floor(sides / 2), value)) : value;
  if (prepared && (positive > 0 || limited(modifier) > limited(modifier - prepared.power))) creditBuff(profile, prepared);
  // 小さいダイスの上限に達した熟練者も、空腹と疲労を無視できない。
  modifier = sides < 20 ? Math.max(-Math.floor(sides / 2), limited(modifier + needPenalty) - needPenalty) : modifier;
  for (const skill of fantasySkills(character).filter(skill => skill.kind === 'passive' && skill.effect === 'check' && (!skill.stat || skill.stat === stat))) creditSkill(profile, skill.id);
  const actualDc = sides < 20 ? Math.max(1, Math.ceil(dc * sides / 20)) : dc;
  const success = die + modifier >= actualDc;
  const dice = rolls.length === 1 ? `d${sides}=${die}` : `${rolls.length}d${sides}=[${rolls.join(',')}]、採用${die}（${net >= 0 ? '最高' : '最低'}）`;
  addLog(profile, `${context}：${dice}、補正${modifier >= 0 ? '+' : ''}${modifier}、合計${die + modifier} / DC${actualDc} → ${success ? '成功' : '失敗'}`, success ? 'success' : 'failure');
  if (pattern || facePenalty) addLog(profile, `判定の面：${pattern ?? '通常'}${facePenalty ? `、各面-${facePenalty}` : ''}。元の出目[${rawRolls.join(',')}] → [${rolls.join(',')}]。`, 'system');
  return success;
}

function damage(profile: FantasyProfile, amount: number, unprotected = false, advanceRescueTime = true, atSea = false): boolean {
  const character = profile.character!;
  if (profile.death) return true;
  let guard = unprotected ? 0 : passive(character, 'guard') + fantasyItemBonuses(character, FANTASY_ITEMS).guard + fantasyCompanionBonus(character).guard;
  if (!unprotected && character.buff?.effect === 'guard') { if (amount > guard) creditBuff(profile, character.buff); guard += character.buff.power; character.buff = null; }
  if (!unprotected && amount > 0) for (const skill of fantasySkills(character).filter(skill => skill.kind === 'passive' && skill.effect === 'guard')) creditSkill(profile, skill.id);
  const loss = unprotected ? amount : Math.max(0, amount - guard - Math.max(0, Math.floor((fantasyStats(character).vitality - 10) / 2)));
  character.hp = Math.max(0, character.hp - loss);
  addLog(profile, `${loss}のダメージを受けた${guard ? `（防護で${guard}軽減）` : ''}。`, loss ? 'failure' : 'success');
  if (!character.hp) {
    const rescue = fantasyRescueTown(character, atSea, fantasyCompanionRescue(character));
    if (!rescue) {
      recordFantasyDeath(profile, atSea ? '海上で力尽きた' : '危険地で力尽きた', atSea);
      addLog(profile, '救助が届かず、この人生は終わった。足跡は記録され、新しい人生を始められる。', 'failure');
      return true;
    }
    const lossGold = Math.min(character.gold, Math.floor(character.gold * 0.1));
    character.gold -= lossGold;
    character.location = rescue;
    character.hp = Math.max(1, Math.floor(fantasyStats(character).hp * 0.5));
    character.fatigue = 25;
    character.hunger = 35;
    character.effects = [];
    if (!character.visited.includes(rescue)) character.visited.push(rescue);
    profile.event = null;
    addLog(profile, `近くの人々や仲間に保護され、${placeOf(rescue)!.name}へ運ばれた。救護費は金貨${lossGold}枚。依頼品と道具は無事だった。`, 'system');
    return true;
  }
  return false;
}

function maybeEvent(profile: FantasyProfile, rng: () => number) {
  if (profile.event || profile.death) return;
  const events = FANTASY_EVENTS.filter(event => !fantasyHostileEncounter(event.id) && fantasyEventEligible(profile.character!, event));
  if (!events.length) return;
  if (random(rng) >= FANTASY_EVENT_CHANCE) return;
  const event = events[Math.floor(random(rng) * events.length)];
  profile.event = event.id;
  addLog(profile, `${event.name}：${event.description}`, 'story');
}

function confront(profile: FantasyProfile, cause: FantasyEncounterCause): boolean {
  if (profile.event || profile.death || !profile.character || profile.character.hp <= 0) return false;
  const c = profile.character, place = placeOf(c.location)!;
  const event = fantasyEncounterFor(place.kind, cause, jobOf(c.job)?.category === 'crime');
  profile.event = event.id;
  addLog(profile, fantasyEncounterOriginLog(cause), 'failure');
  addLog(profile, `${event.name}：${event.description}`, 'story');
  return true;
}

function settleWorkStep(profile: FantasyProfile, activity: NonNullable<FantasyProfile['activity']>) {
  const character = profile.character!, work = activity.work!, job = jobOf(character.job)!;
  const step = work.completed + 1, steps = fantasyWorkSteps(work);
  const rng = activityRandom((activity.seed ^ Math.imul(step, 0x9e3779b1)) >>> 0);
  practiceKeys.set(profile, `work:${character.job}:${character.location}`);
  diceSides.set(profile, 8);
  const success = check(profile, job.stat, 11, rng, `${job.name}の仕事（${step}/${steps}）`);
  const last = step === steps, rewards = fantasyWorkStepRewards(work, success);
  const bonus = step === 1 ? rewardBonus(character, profile) : 0;
  const gold = rewards.gold + bonus, xp = rewards.xp;
  work.completed = step; work.successes += success ? 1 : 0;
  work.gold += gold; work.xp += xp;
  character.gold += gold;
  if (job.category === 'crime' && (steps === 8 || step % 2 === 1)) character.notoriety = Math.min(100, (character.notoriety ?? 0) + (success ? 1 : 2));
  gainXp(profile, xp);
  addLog(profile, fantasyWorkTickLog(job.id, step, success, gold, xp, steps), success ? 'success' : 'failure');
  if (!last) return;
  const succeeded = work.successes >= steps / 2;
  grantFantasyPractice(character, { key: `work:${character.job}:${character.location}`, amount: 6, success: succeeded, ...(job.stat === 'charisma' ? { practice: 'command' as const } : {}) });
  const location = placeOf(character.location)!;
  const cultivated = ['sunmeadow', 'loom-village'].includes(location.id) || !!FANTASY_SETTLEMENTS[location.id] && location.kind === 'city';
  if (character.job === 'farmer' && cultivated) {
    addItem(character, 'grain', succeeded ? 2 : 1);
    if (succeeded) addItem(character, 'flax');
    addLog(profile, `共同の畑で穀物を${succeeded ? 2 : 1}個${succeeded ? 'と亜麻の繊維を1個' : ''}収穫した。`, 'success');
  }
  if (character.job === 'fisher' && (['coast', 'swamp', 'island'].includes(location.kind) || location.services.includes('port'))) {
    addItem(character, 'fish', succeeded ? 2 : 1);
    addLog(profile, `共同の漁場で魚を${succeeded ? 2 : 1}個確保した。`, 'success');
  }
  if (succeeded && job.category !== 'crime') grantFantasyReputation(character, 1);
  addLog(profile, fantasyWorkSummaryLog(job.id, work), 'success');
  if (!success && fantasyCovertWork(job.id) && random(rng) < .35) confront(profile, 'crime-exposed');
}

export interface FantasyActionOptions {
  advanceTime?: boolean;
  worldHour?: number;
  durationHours?: number;
  priceHour?: number;
  contract?: FantasyContractGrant;
}

export function applyFantasyAction(profile: FantasyProfile, action: FantasyAction, rng: () => number = Math.random, options: FantasyActionOptions = {}): FantasyResult {
  const fail = (error: string): FantasyResult => ({ profile, error, changed: false });
  if (!action || typeof action !== 'object' || typeof action.type !== 'string') return fail('操作が正しくありません。');
  if (action.type === 'sync') return { profile, changed: false };
  if (action.type === 'rebirth') {
    if (!profile.death) return fail('新しい人生は、今の人生が終わった後に始められます。');
    const reborn = structuredClone(profile);
    reborn.character = null; reborn.event = null; reborn.draft = { remaining: 5, candidate: null, kept: null };
    reborn.generation = (profile.generation ?? 1) + 1; reborn.log = [];
    delete reborn.activity; delete reborn.death; delete reborn.combatId;
    reborn.revision++;
    addLog(reborn, '過去の足跡を残し、新しい人生の支度を始めた。', 'system');
    return { profile: reborn, changed: true };
  }
  if (profile.death) return fail('この人生は終わっています。新しい人生を始めてください。');
  if (profile.combatId) return fail('戦闘を終えるか離脱してから行動してください。');
  if (profile.activity) return fail('現在の行動が終わるまで、新しい行動は開始できません。');
  let next = structuredClone(profile);
  const target = action.type === 'investigate' ? `${action.quest}:${profile.character ? fantasyMainProgress(profile.character, action.quest) : 0}:${action.approach}` : action.type === 'craft' ? action.recipe : action.type === 'gather' ? action.resource : action.type === 'fish' ? action.mode : action.type === 'skill' ? action.skill : '';
  const practiceKey = `${action.type}:${profile.character?.job ?? 'unassigned'}:${profile.character?.location ?? 'hearth'}:${target}`.replace(/:$/, '').slice(0, 120);
  practiceKeys.set(next, practiceKey);
  const sides = action.type === 'gather' ? 6 : ['work', 'skin'].includes(action.type) ? 8 : ['craft', 'fish', 'alchemy'].includes(action.type) ? 12 : 20;
  diceSides.set(next, sides);
  let practiceSuccess = true;
  let unresolvedEncounter = false;
  let atSea = action.type === 'fish' && action.mode === 'sea';
  const extraPractice = new Set<keyof NonNullable<FantasyCharacter['practice']>>();
  const advance = (hours: number) => { if (options.advanceTime !== false && next.character) next.character.hour += hours; };
  const hurt = (amount: number, unprotected = false) => damage(next, amount, unprotected, false, atSea);
  let nutritionRecovery = 0;
  let fatigueRecovery = 0;
  const finish = (): FantasyResult => {
    if (next.character) {
      const c = next.character;
      if (!next.death) syncFantasyPriestGrowth(c);
      const practice = ['explore', 'craft', 'gather', 'hunt', 'fish', 'command'].includes(action.type) ? action.type as keyof NonNullable<FantasyCharacter['practice']> : undefined;
      const progresses = ['work', 'explore', 'craft', 'gather', 'hunt', 'skin', 'fish', 'event', 'alchemy', 'terrain', 'investigate'].includes(action.type) || action.type === 'command' && ['mission', 'recover', 'recontract'].includes(action.operation);
      if (!next.death && !unresolvedEncounter && (progresses || effectiveSkills.has(next))) {
        grantFantasyPractice(c, { key: practiceKey, amount: ['work', 'craft', 'hunt'].includes(action.type) ? 6 : 3, success: practiceSuccess, practice });
        for (const key of extraPractice) if (key !== practice) { c.practice ??= {}; c.practice[key] = Math.min(1_000_000, (c.practice[key] ?? 0) + 1); }
      }
      const elapsed = profile.character ? Math.max(0, c.hour - profile.character.hour) : 0;
      const elapsedWhole = profile.character ? Math.max(0, Math.floor(c.hour) - Math.floor(profile.character.hour)) : 0;
      const resting = action.type === 'rest' || action.type === 'lodge' || action.type === 'propertyUse' && FANTASY_PROPERTY_PLOTS.some(plot => plot.id === action.plot && plot.kind === 'residence');
      if (!next.death) c.hunger = boundedNeed(c.hunger + elapsedWhole * 2 - nutritionRecovery);
      if (!next.death) c.fatigue = boundedNeed(c.fatigue + (resting ? 0 : elapsedWhole * 3) - fatigueRecovery);
      if (!next.death && elapsedWhole > 0) {
        const strain = (c.hunger >= 90 ? Math.ceil(elapsedWhole * (c.hunger >= 100 ? 1 : 0.5)) : 0)
          + (!resting && c.fatigue >= 95 ? Math.ceil(elapsedWhole * 0.25) : 0);
        const statusDamage = fantasyEffectDamage(profile.character!, Math.floor(profile.character!.hour), Math.floor(c.hour));
        if (strain) addLog(next, '空腹や疲労が体にこたえる。', 'failure');
        if (statusDamage) addLog(next, '状態異常が体をむしばんだ。', 'failure');
        if (strain + statusDamage) hurt(strain + statusDamage, true);
      }
      reconcileFoodLots(c);
      if (c.mana && elapsed > 0 && profile.character) {
        const addedStrain = c.mana.strain - fantasyMana(profile.character).strain;
        c.mana.strain = Math.max(0, Math.min(100, fantasyManaRecover(profile.character, elapsedWhole).strain + addedStrain));
      }
      pruneFantasyEffects(c);
      const max = fantasyStats(c);
      c.hp = Math.min(c.hp, max.hp); c.mp = Math.min(c.mp, max.mp);
      if (!next.death && !unresolvedEncounter && !fantasyHostileEncounter(next.event)) {
        const advanced = grantFantasyTaskProgress(c, action, options.priceHour ?? profile.character?.hour ?? c.hour, profile.character?.location ?? c.location, practiceSuccess);
        for (const id of advanced) addLog(next, `行動依頼「${id}」：${fantasyTaskProgress(c, id)}/${fantasyTaskObjective(id)!.count}。`, 'success');
      }
    }
    next.revision = profile.revision + 1;
    return { profile: next, changed: true };
  };
  if (!next.character) {
    if (action.type === 'draw') {
      if (next.draft.candidate) return fail('先に候補をキープするか、見送ってください。');
      if (next.draft.remaining <= 0) return fail('種族の抽選は5回までです。');
      const total = FANTASY_RACES.reduce((sum, race) => sum + race.weight, 0);
      let ticket = random(rng) * total;
      const race = FANTASY_RACES.find(r => { ticket -= r.weight; return ticket < 0; }) ?? FANTASY_RACES.at(-1)!;
      next.draft.remaining--;
      next.draft.candidate = race.id;
      addLog(next, `種族候補：${race.name}。残り${next.draft.remaining}回。`, 'system');
      return finish();
    }
    if (action.type === 'keep' || action.type === 'skip') {
      if (!next.draft.candidate) return fail('種族候補がありません。');
      if (action.type === 'keep') next.draft.kept = next.draft.candidate;
      next.draft.candidate = null;
      return finish();
    }
    if (action.type !== 'create') return fail('先にキャラクターを作成してください。');
    if (typeof action.name !== 'string') return fail('名前を入力してください。');
    const name = action.name.trim();
    if (!name || [...name].length > 24 || /[\u0000-\u001f\u007f]/u.test(name)) return fail('名前は制御文字を使わず1〜24文字で入力してください。');
    if (action.gender !== 'male' && action.gender !== 'female') return fail('性別を選択してください。');
    if (action.job !== undefined && !jobOf(action.job)) return fail('職業が見つかりません。');
    const raceId = action.source === 'human' ? 'human' : action.source === 'candidate' ? next.draft.candidate : action.source === 'kept' ? next.draft.kept : null;
    const race = raceId ? raceOf(raceId) : null;
    if (!race) return fail('選んだ種族候補がありません。');
    const character: FantasyCharacter = {
      name, race: race.id, gender: race.gender ?? action.gender, job: 'unassigned',
      level: 1, xp: 0, gold: FANTASY_STARTING_GOLD, hp: 100, mp: 50, location: 'hearth', hour: options.worldHour ?? 8,
      lifeStartedAt: options.worldHour ?? 8,
      fatigue: 0, hunger: 0, foodLots: [], charted: [],
      inventory: fantasyStartingInventory(race, rng), quests: [], completed: [], visited: ['hearth'],
      jobXp: { unassigned: 0 }, buff: null,
    };
    character.birthBonuses = fantasyBirthBonuses(rng);
    next.character = character;
    character.hp = fantasyStats(character).hp;
    character.mp = fantasyStats(character).mp;
    addLog(next, `${name}は${race.name}の${jobOf(character.job)!.name}として、新しい人生を歩み始めた。`, 'success');
    const gifts = Object.entries(character.inventory).flatMap(([id, count]) => count > (FANTASY_STARTING_INVENTORY[id] ?? 0) ? [`${itemOf(id)!.name}×${count - (FANTASY_STARTING_INVENTORY[id] ?? 0)}`] : []);
    if (gifts.length) addLog(next, `旅支度の贈り物：${gifts.join('、')}。`, 'success');
    return finish();
  }
  const character = next.character;
  if (character.buff?.expiresAt !== undefined && character.buff.expiresAt <= character.hour) character.buff = null;
  reconcileFoodLots(character);
  const location = placeOf(character.location);
  if (!location || !raceOf(character.race) || !jobOf(character.job)) return fail('冒険記録の種族・職業・現在地を確認できません。');
  const environmentalError = fantasyEnvironmentActionError(character, action);
  if (environmentalError) return fail(environmentalError);
  if (['draw', 'keep', 'skip', 'create'].includes(action.type)) return fail('キャラクターはすでに作成されています。');
  if (next.event && !['event', 'rest', 'lodge', 'eat', 'use', 'skill'].includes(action.type)) return fail('先に発生中のイベントを選択してください。');
  if (fantasyHostileEncounter(next.event) && !['event', 'use', 'skill'].includes(action.type)) return fail('脅威が目前にいます。戦う・逃げる・話す対応か、手持ちの品・技能を選んでください。');
  switch (action.type) {
    case 'finishVoyage': {
      if (Object.keys(action).length !== 1) return fail('航海の記録の指定が正しくありません。');
      const error = fantasyVoyageFinishError(character);
      if (error) return fail(error);
      character.voyageEnding = { hour: character.hour };
      addLog(next, '島への航海を結び、旅の終章を記した。', 'story');
      addLog(next, '航海場面［main-night-18:closing］。', 'story');
      return finish();
    }
    case 'wear': {
      const item = itemOf(action.item);
      if (!item?.wear || (character.inventory[item.id] ?? 0) < 1) return fail('所有する衣服を選んでください。');
      if (character.outfit === item.id) return fail('その衣服はすでに着用しています。');
      character.outfit = item.id; addLog(next, `${item.name}を着用した。`, 'system');
      return finish();
    }
    case 'learn': {
      const error = fantasyApprenticeshipError(character, action.npcId, action.skill);
      if (error) return fail(error);
      character.gold -= 5;
      const skill = fantasyNpcMentorSkills(action.npcId, character).find(skill => skill.id === action.skill)!;
      if (skill.unlock?.kind === 'mentor') character.unlockedSkills = [...(character.unlockedSkills ?? []), skill.id];
      else character.learnedSkills = [...(character.learnedSkills ?? []), action.skill];
      advance(1);
      addLog(next, `指導料5Gを払い、${skill.name}を習得した。`, 'success');
      return finish();
    }
    case 'equip': {
      const item = itemOf(action.item);
      const error = fantasyEquipGear(character, action.item, action.instance);
      if (error) return fail(error);
      addLog(next, `${item!.name}を装備した。`, 'system');
      return finish();
    }
    case 'unequip': {
      if (!['weapon', 'armor', 'accessory', 'offhand'].includes(action.slot) || !character.equipment?.[action.slot]) return fail('その部位には装備がありません。');
      delete character.equipment[action.slot];
      if (character.equippedGear) delete character.equippedGear[action.slot];
      addLog(next, '装備を外した。', 'system');
      return finish();
    }
    case 'haggle': {
      if (!['room', 'food', 'goods'].includes(action.service)) return fail('値引きの種類が正しくありません。');
      const bargain = fantasyHaggle(character, action.service, rng);
      if (!bargain) return fail('この場所では交渉できないか、次の交渉まで待つ必要があります。');
      addLog(next, `値段交渉（目標以下）：d100=${bargain.roll}、補正+0、合計${bargain.roll} / DC${bargain.target} → ${bargain.success ? '成功' : '失敗'}`, bargain.success ? 'success' : 'failure');
      addLog(next, bargain.success ? `交渉に成功し、${Math.round(bargain.discount * 100)}%の値引きを得た。` : '交渉はまとまらなかった。時間をおいて再挑戦できる。', bargain.success ? 'success' : 'story');
      return finish();
    }
    case 'manaTrain': {
      return fail('マナは実際にMPを使い、効果が働いた経験で成長します。修練ボタンでは学べません。');
    }
    case 'read': {
      const book = FANTASY_READABLE_LIBRARY_BOOKS.find(book => book.id === action.book && fantasyLibraryHoldings(character).includes(book.id));
      if (!book) return fail('この図書館には、その本がありません。');
      if (character.readBooks?.includes(book.id)) return fail('その本はすでに読み終えています。');
      advance(1);
      character.readBooks = [...(character.readBooks ?? []), book.id];
      addLog(next, `「${book.title.ja}」を読み、知識を記録した。`, 'system');
      return finish();
    }
    case 'escortAccept': {
      const error = fantasyEscortAcceptError(character, action.destination);
      if (error || !fantasyEscortAccept(character, action.destination)) return fail(error ?? '護衛依頼を受注できません。');
      addLog(next, `ギルドで${placeOf(action.destination)!.name}行きの護衛依頼を受注した。到着後に金貨${character.escort!.reward}枚。`, 'system');
      return finish();
    }
    case 'escortAbandon': {
      if (!character.escort) return fail('受注中の護衛依頼はありません。');
      delete character.escort;
      addLog(next, '護衛依頼を辞退した。報酬は受け取っていない。', 'system');
      return finish();
    }
    case 'travel': {
      if (typeof action.destination !== 'string' || typeof action.transport !== 'string') return fail('目的地と交通手段を選んでください。');
      const transport = fantasyTransports(character, action.destination).find(v => v.id === action.transport);
      if (!transport) return fail('その交通手段は利用できません。');
      if (!transport.available) return fail(transport.reason!);
      if (['gate','escort'].includes(action.transport) && options.durationHours !== undefined && options.durationHours !== transport.hours) return fail('予約された移動時間を確認できません。');
      if (action.transport === 'escort' && options.advanceTime === false && options.durationHours === undefined) return { profile, changed: false };
      const departure = character.location;
      const withoutPassive = fantasyTransportChoices(character, action.destination, character.buff?.effect === 'travel' ? character.buff.power : 0).find(route => route.id === action.transport);
      if (withoutPassive && withoutPassive.hours > transport.hours) for (const skill of fantasySkills(character).filter(skill => skill.kind === 'passive' && skill.effect === 'travel')) creditSkill(next, skill.id);
      atSea = transport.path.some((id, index) => index > 0 && FANTASY_ROUTES.some(route => route.mode === 'sea' && (route.from === id && route.to === transport.path[index - 1] || route.to === id && route.from === transport.path[index - 1])));
      character.gold -= transport.cost;
      advance(transport.hours);
      character.location = action.destination;
      for (const id of transport.path) if (!character.visited.includes(id)) character.visited.push(id);
      const escortReward = action.transport === 'escort' ? fantasyEscortComplete(character, departure, action.destination) : 0;
      if (character.buff?.effect === 'travel') { if (fantasyTransports({ ...profile.character!, buff: null }, action.destination).find(route => route.id === action.transport)!.hours > transport.hours) creditBuff(next, character.buff); character.buff = null; }
      addLog(next, `${transport.name}で${placeOf(action.destination)!.name}へ到着。${options.durationHours ?? transport.hours}時間・金貨${transport.cost}枚。経路：${transport.path.map(id => placeOf(id)!.name).join(' → ')}`, 'story');
      if (escortReward) addLog(next, `護衛を完了し、金貨${escortReward}枚の報酬を受け取った。`, 'success');
      gainXp(next, 2, false);
      return finish();
    }
    case 'rest': {
      advance(8);
      const stats = fantasyStats(character);
      const kit = fantasyCampingKit(character);
      character.hp = Math.min(stats.hp, character.hp + Math.ceil(stats.hp * kit.hp));
      character.mp = Math.min(stats.mp, character.mp + Math.ceil(stats.mp * kit.mp));
      character.buff = null;
      fatigueRecovery = kit.fatigue;
      addLog(next, kit.fatigue === 15 && kit.mp === .15 && kit.riskMultiplier === 1 && !kit.ward ? '8時間の野宿。HPを最大値の20%、MPを15%回復し、疲労を15軽減。一時強化を解除した。費用は無料。' : `野営を終えた。疲労-${kit.fatigue}、HP+${Math.round(kit.hp * 100)}%、MP+${Math.round(kit.mp * 100)}%、危険軽減${Math.round((1 - kit.riskMultiplier) * 100)}%。`, 'success');
      const settled = !!FANTASY_SETTLEMENTS[character.location];
      if (random(rng) < (settled ? 0.08 : 0.18 + location.danger * 0.04) * kit.riskMultiplier) {
        const incident = Math.floor(random(rng) * 3);
        if (incident === 0) {
          const lost = Math.min(character.gold, Math.max(1, Math.floor(character.gold * 0.1)));
          character.gold -= lost;
          addLog(next, `野宿中に小銭を盗まれた。金貨${lost}枚を失った。依頼品は無事。`, 'failure');
        } else if (incident === 1) {
          if (kit.ward && fantasySpendItem(character, 'ward-seal', 1)) addLog(next, '野営の結界符が襲撃を防ぎ、1枚燃え尽きた。', 'success');
          else {
            addLog(next, '野宿中に小さな襲撃を受けた。', 'failure');
            hurt(6 + location.danger * 2);
          }
        } else {
          character.fatigue = boundedNeed(character.fatigue + 8);
          addLog(next, '野生の物音で何度も目覚め、疲労回復が8少なくなった。', 'story');
        }
      }
      return finish();
    }
    case 'lodge': {
      const room = FANTASY_LODGINGS.find(entry => entry.id === action.room);
      if (!room) return fail('客室の種類が正しくありません。');
      if (!hasBuilding(character, 'inn')) return fail('現在地には宿屋がありません。');
      const cost = fantasyPrice({ ...character, hour: options.priceHour ?? character.hour }, room.cost, 'room');
      if (character.gold < cost) return fail('宿泊代が足りません。野宿や無料の仕事を利用できます。');
      character.gold -= cost;
      advance(room.hours);
      const stats = fantasyStats(character);
      character.hp = Math.min(stats.hp, character.hp + Math.ceil(stats.hp * room.hpRecovery));
      character.mp = Math.min(stats.mp, character.mp + Math.ceil(stats.mp * room.mpRecovery));
      character.buff = null;
      fatigueRecovery = room.fatigueRecovery;
      addLog(next, `${room.name.ja}に8時間宿泊。金貨${cost}枚。疲労を${room.fatigueRecovery}軽減し、HP・MPを回復した。`, 'success');
      return finish();
    }
    case 'eat': {
      const meal = FANTASY_DINING.find(entry => entry.id === action.meal);
      if (!meal) return fail('食事の種類が正しくありません。');
      if (!hasBuilding(character, 'inn') && !hasBuilding(character, 'restaurant')) return fail('現在地には食事を頼める宿屋・食堂がありません。');
      const cost = fantasyPrice({ ...character, hour: options.priceHour ?? character.hour }, meal.cost, 'food');
      if (character.gold < cost) return fail('食事代が足りません。無料の仕事で代金を用意できます。');
      character.gold -= cost;
      advance(meal.hours);
      nutritionRecovery = meal.nutrition;
      const stats = fantasyStats(character);
      character.hp = Math.min(stats.hp, character.hp + meal.hp);
      character.mp = Math.min(stats.mp, character.mp + meal.mp);
      addLog(next, `${meal.name.ja}を食べた。金貨${cost}枚、${meal.hours}時間。空腹を${meal.nutrition}軽減した。`, 'success');
      return finish();
    }
    case 'propertyUse': {
      advance(fantasyPropertyUseHours(action.plot));
      const result = applyFantasyPropertyUse(next, action.plot, fantasyStats(character));
      if (result.error || !result.changed) return fail(result.error ?? 'property:unavailable');
      next = result.profile;
      return finish();
    }
    case 'priestVow': case 'priestReleaseVow': case 'priestBranch': {
      const result = applyFantasyPriestAction(character, action);
      if (result.error) return fail(result.error);
      advance(fantasyPriestActionHours(action));
      if (result.message) addLog(next, result.message, 'success');
      return finish();
    }
    case 'pray': {
      advance(.5);
      const prayer = applyFantasyPrayer(character);
      if (prayer.error) return fail(prayer.error);
      addLog(next, `神殿で静かに祈った。司祭の熟練+${prayer.priestXp}、悪名-${prayer.notorietyReduction}。`, 'success');
      return finish();
    }
    case 'advanceJob': {
      const result = applyFantasyJobPath(character, action.path);
      if (result.error) return fail(result.error);
      advance(fantasyJobPathHours());
      if (result.message) addLog(next, result.message, 'success');
      return finish();
    }
    case 'job': {
      const job = jobOf(action.job);
      if (!job) return fail('職業が見つかりません。');
      const via = action.via ?? 'guild';
      if (!['guild', 'npc', 'gm'].includes(via) || (via !== 'npc' && action.npcId !== undefined)) return fail('職業を学ぶ方法が正しくありません。');
      if (!canAcquireJob(character, job.id, via, action.npcId)) return fail('この場所・相手・方法では、その職業を学べません。');
      if (character.job === job.id) return fail('すでにその職業です。');
      character.job = job.id;
      character.jobXp[job.id] ??= 0;
      character.buff = null;
      advance(1);
      addLog(next, `${via === 'npc' ? '師匠の指導' : via === 'gm' ? 'GMの提案' : 'ギルドへの加入'}で${job.name}になった。これまでの職業熟練度は保存される。`, 'system');
      return finish();
    }
    case 'boat': {
      const error = fantasyBoatError(character, action.mode);
      if (error) return fail(error);
      const option = FANTASY_BOAT_OPTIONS.find(option => option.mode === action.mode)!;
      character.gold -= option.price; advance(0.25);
      character.fishingBoat = action.mode === 'buy' ? { kind: 'owned' } : { kind: 'rented', expiresAt: character.hour + 24 };
      addLog(next, `金貨${option.price}枚で${action.mode === 'buy' ? '漁船を購入した' : '24時間使える漁船を借りた'}。`, 'system');
      return finish();
    }
    case 'gather': {
      const option = fantasyGatheringOptions(character).find(option => option.resource === action.resource);
      if (!option?.available) return fail(option?.reason ?? '採集する資源を選んでください。');
      advance(option.hours);
      const success = check(next, option.stat, option.dc, rng, option.name.ja, true);
      practiceSuccess = success;
      if (success || random(rng) < 0.35) {
        const item = fantasyGatherItem(character, action.resource, rng)!;
        const quantity = Math.min(8, (success ? 2 : 1) + rewardBonus(character, next));
        addItem(character, item, quantity); addLog(next, `${itemOf(item)!.name}を${quantity}個採集した。`, 'success');
      } else addLog(next, '採集を試したが、使える資源は確保できなかった。', 'story');
      if (!success && location.danger > 0 && random(rng) < 0.3) hurt(3 + location.danger * 2);
      if (next.death) return finish();
      gainXp(next, success ? 8 : 3); maybeEvent(next, rng);
      return finish();
    }
    case 'hunt': {
      const target = fantasyHuntTarget(character, action.monster);
      if (!target) return fail('この場所で狩れる獲物を選んでください。');
      advance(target.hours);
      const tracked = check(next, 'agility', 10 + target.danger, rng, '獲物の追跡');
      const success = check(next, fantasyCombatStat(character), target.dc + (tracked ? 0 : 2), rng, `${target.names.ja}の狩猟`);
      practiceSuccess = success;
      character.lastHunt = { id: target.id, location: location.id, hour: character.hour, success };
      if (!success) hurt(target.damage);
      else if (random(rng) < 0.25) hurt(Math.ceil(target.damage / 3));
      if (next.death) return finish();
      if (success) {
        if (target.meat) addItem(character, 'meat', target.meat);
        const loot = fantasyHuntLoot(target, rng);
        if (loot) addItem(character, loot, 1 + rewardBonus(character, next));
        if (target.hide) character.carcass = { location: location.id, hour: character.hour, monster: target.id, hide: target.hide, count: Math.min(8, (target.skinCount ?? 1) + fantasyProfessionGrade(character)) };
        addLog(next, `${target.names.ja}の狩猟を終えた。${loot ? `${itemOf(loot)!.name}を確保。` : ''}${target.meat ? `生肉${target.meat}個を確保。` : ''}${target.hide ? '皮は解体で回収できる。' : ''}`, 'success');
      } else addLog(next, '獲物を逃したが、追跡と実戦の経験を得た。', 'story');
      const companionMp = settleFantasyCompanions(next, success, rng);
      if (companionMp > 0) creditSkill(next, undefined, companionMp);
      gainXp(next, success ? 14 : 4);
      return finish();
    }
    case 'skin': {
      const error = fantasySkinError(character); if (error) return fail(error);
      const carcass = character.carcass!; advance(1);
      const success = check(next, 'agility', 10 + location.danger, rng, '獲物の解体'); practiceSuccess = success;
      const quantity = success ? Math.min(8, carcass.count + rewardBonus(character, next)) : 1;
      delete character.carcass;
      addItem(character, carcass.hide, quantity); addLog(next, `${itemOf(carcass.hide)!.name}を${quantity}個回収した。獲物は一度だけ解体できる。`, 'success');
      gainXp(next, success ? 5 : 2);
      return finish();
    }
    case 'fish': {
      const error = fantasyFishingError(character, action.mode, options.priceHour ?? character.hour); if (error) return fail(error);
      advance(action.mode === 'sea' ? 4 : 2);
      const success = check(next, 'agility', action.mode === 'sea' ? 14 : 10, rng, action.mode === 'sea' ? '海釣り' : '桟橋釣り'); practiceSuccess = success;
      if (action.mode === 'sea' && !success && random(rng) < 0.4) hurt(10 + location.danger * 2);
      if (next.death) return finish();
      if (success || random(rng) < 0.4) {
        const item = fantasyFishingItem(action.mode, rng);
        const quantity = Math.min(8, (success ? action.mode === 'sea' ? 3 : 2 : 1) + rewardBonus(character, next));
        addItem(character, item, quantity); addLog(next, `${itemOf(item)!.name}を${quantity}匹釣り上げた。`, 'success');
      } else addLog(next, '魚には逃げられたが、釣りの経験を得た。', 'story');
      gainXp(next, success ? 8 : 3);
      return finish();
    }
    case 'work': {
      const job = jobOf(character.job)!;
      advance(4);
      const success = check(next, job.stat, 11, rng, `${job.name}の仕事`);
      practiceSuccess = success;
      if (job.stat === 'charisma') extraPractice.add('command');
      const wages = (success ? 14 : 5) + rewardBonus(character, next);
      character.gold += wages;
      if (job.category === 'crime') character.notoriety = Math.min(100, (character.notoriety ?? 0) + (success ? 1 : 2));
      const cultivated = ['sunmeadow', 'loom-village'].includes(location.id) || !!FANTASY_SETTLEMENTS[location.id] && location.kind === 'city';
      if (character.job === 'farmer' && cultivated) {
        addItem(character, 'grain', success ? 2 : 1);
        if (success) addItem(character, 'flax');
        addLog(next, `共同の畑で穀物を${success ? 2 : 1}個${success ? 'と亜麻の繊維を1個' : ''}収穫した。私有地は必要ない。`, 'success');
      }
      if (character.job === 'fisher' && (['coast', 'swamp', 'island'].includes(location.kind) || location.services.includes('port'))) {
        addItem(character, 'fish', success ? 2 : 1);
        addLog(next, `共同の漁場で魚を${success ? 2 : 1}個確保した。自分の船は必要ない。`, 'success');
      }
      if (success && job.category !== 'crime') grantFantasyReputation(character, 1);
      gainXp(next, success ? 10 : 4);
      addLog(next, `${success ? '仕事を無事に終え' : '簡単な手伝いを終え'}、金貨${wages}枚を受け取った。`, 'success');
      if (!success && fantasyCovertWork(job.id) && random(rng) < .35) confront(next, 'crime-exposed');
      maybeEvent(next, rng);
      return finish();
    }
    case 'explore': {
      advance(3);
      const explorationStats: Partial<Record<typeof location.kind, FantasyStat>> = {
        mountain: 'strength', volcano: 'strength', cave: 'vitality', swamp: 'vitality',
        desert: 'vitality', snow: 'vitality', ruin: 'intelligence', tower: 'intelligence', city: 'charisma',
      };
      const success = check(next, explorationStats[location.kind] ?? 'agility', 10 + location.danger, rng, `${location.name}の探索`, true);
      practiceSuccess = success;
      const resources = location.resources.filter(id => itemOf(id));
      if (resources.length) {
        const item = resources[Math.floor(random(rng) * resources.length)];
        const lucky = check(next, 'luck', 16, rng, '発見運');
        const amount = (success ? 2 : 1) + (lucky ? 1 : 0) + rewardBonus(character, next);
        extraPractice.add('gather');
        addItem(character, item, amount);
        addLog(next, `${itemOf(item)!.name}を${amount}個見つけた。`, 'success');
      }
      if (character.job === 'hunter' && location.kind === 'forest') {
        addItem(character, 'meat');
        addLog(next, '狩人の技で生肉を1個確保した。', 'success');
      }
      for (const questId of character.quests) {
        const quest = FANTASY_QUESTS.find(q => q.id === questId)!;
        if (quest.destination !== character.location || !resources.includes(quest.item) || (character.inventory[quest.item] ?? 0) >= quest.count) continue;
        addItem(character, quest.item);
        addLog(next, `依頼「${quest.name}」の${itemOf(quest.item)!.name}を1個確保した。`, 'success');
      }
      const situations: Record<typeof location.kind, { context: FantasyCheckContext; stat: FantasyStat }> = {
        cave: { context: 'narrow-space', stat: 'agility' }, ruin: { context: 'trap', stat: 'agility' },
        coast: { context: 'deep-water', stat: 'vitality' }, island: { context: 'deep-water', stat: 'vitality' }, swamp: { context: 'deep-water', stat: 'vitality' },
        mountain: { context: 'high-place', stat: 'agility' }, tower: { context: 'high-place', stat: 'agility' },
        volcano: { context: 'heat', stat: 'vitality' }, desert: { context: 'heat', stat: 'vitality' }, snow: { context: 'cold', stat: 'vitality' },
        forest: { context: 'keen-senses', stat: 'intelligence' }, city: { context: 'heavy-lifting', stat: 'strength' },
      };
      const situation = situations[location.kind];
      if (check(next, situation.stat, 12 + location.danger, rng, FANTASY_CONTEXT_NAMES[situation.context].ja, false, situation.context) && resources.length) {
        addItem(character, resources[0]);
        addLog(next, `地形に合わせた体の使い方で${itemOf(resources[0])!.name}を1個確保した。`, 'success');
      }
      if (location.danger > 0 && !success) {
        const escaped = check(next, 'agility', 11 + location.danger, rng, '危険からの回避');
        if (!escaped) {
          confront(next, 'escape-failed');
        }
      }
      const specialDrops = FANTASY_ITEMS.filter(item => item.drop && (!item.drop.kinds || item.drop.kinds.includes(location.kind)) && location.danger >= (item.drop.minDanger ?? 0));
      if (character.location === location.id && specialDrops.length && random(rng) < 0.35) {
        const item = specialDrops[Math.floor(random(rng) * specialDrops.length)];
        if (random(rng) < item.drop!.chance) { addItem(character, item.id); addLog(next, `${item.name}を1個見つけた。`, 'success'); }
      }
      gainXp(next, success ? 12 : 5);
      const companionMp = settleFantasyCompanions(next, success, rng);
      if (companionMp > 0) creditSkill(next, undefined, companionMp);
      if (character.location === location.id) maybeEvent(next, rng);
      return finish();
    }
    case 'accept': {
      const quest = FANTASY_QUESTS.find(q => q.id === action.quest);
      if (!quest) return fail('依頼が見つかりません。');
      if (!fantasyQuestEligible(character, quest)) return fail('この依頼の条件をまだ満たしていません。');
      const grant = options.contract;
      if (action.offer && (!grant || grant.offerId !== action.offer || grant.boardLocation !== character.location || grant.acceptedAt > character.hour || grant.expiresAt <= character.hour)) return fail('依頼掲示の受付情報を確認できません。');
      if (!action.offer && quest.giver !== character.location) return fail('依頼人のいる拠点で受注してください。');
      if (character.quests.includes(quest.id) || character.completed.includes(quest.id)) return fail('その依頼は受注済み、または達成済みです。');
      character.quests.push(quest.id);
      if (fantasyMainTrial(quest.id)) { character.mainTrials ??= {}; character.mainTrials[quest.id] ??= { acceptedAt: character.hour, proofs: [], attempts: 0 }; }
      if (fantasyTaskObjective(quest)) { character.taskProgress ??= {}; character.taskProgress[quest.id] = { acceptedAt: character.hour, progress: 0, lastAt: character.hour }; }
      if (action.offer && grant) { character.contracts ??= {}; character.contracts[quest.id] = structuredClone(grant); }
      addLog(next, fantasyMainTrial(quest.id) ? `主依頼「${quest.id}」を受注した。調査と照合が必要です。補助物資は報告時に用意します。` : fantasyTaskObjective(quest) ? `行動依頼「${quest.id}」を受注した。指定地で成功した行動を記録し、依頼人へ報告します。` : quest.objective?.type === 'hunt' ? `依頼「${quest.name}」を受注した。指定された獲物の討伐を進め、依頼人へ報告しよう。` : `依頼「${quest.name}」を受注した。${placeOf(quest.destination)!.name}で${itemOf(quest.item)!.name}を${quest.count}個集め、依頼人へ届けよう。`, 'system');
      if (fantasyMainTrial(quest.id)) addLog(next, `航海場面［${quest.id}:opening］。`, 'story');
      return finish();
    }
    case 'abandon': {
      if (!character.quests.includes(action.quest)) return fail('放棄できる受注済み依頼がありません。');
      character.quests = character.quests.filter(id => id !== action.quest);
      if (character.contracts) delete character.contracts[action.quest];
      if (character.taskProgress) delete character.taskProgress[action.quest];
      addLog(next, fantasyMainTrial(action.quest) ? `主依頼「${action.quest}」を手放した。確かめた手掛かりは残る。` : '依頼を放棄した。報酬や品物は受け取らない。', 'system');
      return finish();
    }
    case 'complete': {
      const quest = FANTASY_QUESTS.find(q => q.id === action.quest);
      if (!quest || !character.quests.includes(quest.id) || character.completed.includes(quest.id)) return fail('達成できる依頼がありません。');
      if (!fantasyQuestEligible(character, quest)) return fail('この依頼の条件をまだ満たしていません。');
      if (character.location !== (quest.reportAt ?? quest.giver)) return fail(quest.reportAt ? '指定された報告場所へ移動してください。' : '依頼人のいる拠点へ戻ってください。');
      if (quest.id === FANTASY_VOYAGE_FINAL_QUEST && (character.location !== FANTASY_FINAL_ISLE_ID || !character.visited.includes(FANTASY_FINAL_ISLE_ID) || !fantasyIsleAccess(character))) return fail('最後の主依頼は、実際に島へ到着してから報告してください。');
      if (fantasyMainTrial(quest.id) && (!validFantasyMainTrials(character) || !fantasyMainReady(character, quest.id))) return fail('主依頼の調査と証拠の照合を終えてから報告してください。');
      const contract = character.contracts?.[quest.id];
      if (contract && contract.expiresAt <= character.hour) return fail('依頼の期限を過ぎています。放棄して新しい掲示を確認してください。');
      if (fantasyTaskObjective(quest)) {
        if (!fantasyTaskReady(character, quest)) return fail('指定地で依頼された行動を成功させてから報告してください。');
      } else if (quest.objective?.type === 'hunt') {
        if (!contract || contract.progress < quest.objective.count) return fail('討伐依頼の進行がまだ足りません。');
      } else {
        if ((character.inventory[quest.item] ?? 0) < quest.count) return fail('依頼の品が足りません。');
        if ((character.inventory[quest.item] ?? 0) - (Object.values(character.equipment ?? {}).includes(quest.item) || character.outfit === quest.item ? 1 : 0) < quest.count) return fail('着用中の装備は納品できません。先に装備を外すか、納品する数とは別に1個残してください。');
        if (!character.visited.includes(quest.destination)) return fail('まず指定された地域を訪れてください。');
        if (!fantasySpendItem(character, quest.item, quest.count)) return fail('着用中の装備や個体の在庫を確認してください。');
      }
      character.quests = character.quests.filter(id => id !== quest.id);
      character.completed.push(quest.id);
      if (quest.id === FANTASY_VOYAGE_CHART_QUEST && !character.charted.includes(FANTASY_FINAL_ISLE_ID)) {
        character.charted.push(FANTASY_FINAL_ISLE_ID);
        addLog(next, '航海の記録から、新しい島への航路を地図に記した。', 'story');
      }
      if (quest.id === FANTASY_VOYAGE_FINAL_QUEST) {
        character.voyageEnding = { hour: character.hour };
        addLog(next, '島への航海を結び、旅の終章を記した。', 'story');
      }
      const gold = (contract?.gold ?? quest.gold) + rewardBonus(character, next);
      if (character.contracts) delete character.contracts[quest.id];
      if (character.taskProgress) delete character.taskProgress[quest.id];
      character.gold += gold;
      grantFantasyReputation(character, 6);
      gainXp(next, quest.xp);
      addLog(next, `依頼「${quest.name}」達成。金貨${gold}枚、経験値${quest.xp}を獲得した。`, 'success');
      if (fantasyMainTrial(quest.id)) addLog(next, `航海場面［${quest.id}:closing］。`, 'story');
      return finish();
    }
    case 'voyageDecision': {
      const invalid = fantasyVoyageDecisionError(character, action.decision, action.choice);
      if (invalid) return fail(invalid);
      const decision = FANTASY_VOYAGE_DECISIONS.find(item => item.id === action.decision)!;
      const choice = decision.choices.find(item => item.id === action.choice)!;
      character.gold -= choice.gold;
      character.fatigue = boundedNeed(character.fatigue + choice.fatigue);
      character.voyageDecisions ??= {};
      character.voyageDecisions[decision.id] = { choice: choice.id, hour: character.hour };
      addLog(next, `航海の返事［${decision.id}］。`, 'story');
      return finish();
    }
    case 'investigate': {
      const invalid = fantasyMainInvestigationError(character, action);
      if (invalid) return fail(invalid);
      if (!fantasyVoyageScene(character, action.quest)) return fail('航海場面の手掛かりの順序を確認できません。');
      const quest = FANTASY_QUESTS.find(quest => quest.id === action.quest)!;
      if (!fantasyQuestEligible(character, quest)) return fail('この依頼の条件をまだ満たしていません。');
      const trial = fantasyMainTrial(action.quest)!, stage = fantasyMainStage(character, action.quest)!;
      // 予約前の検証では抽選や成長を行わず、終了時だけ証拠を確定する。
      if (options.advanceTime === false && options.durationHours === undefined) return { profile, changed: false };
      if (options.advanceTime === false && options.durationHours !== stage.hours) return fail('調査の予約時間を確認できません。');
      const startedAt = options.priceHour ?? character.hour;
      character.mainTrials ??= {};
      const record = character.mainTrials[action.quest] ??= { acceptedAt: startedAt, proofs: [], attempts: 0 };
      const step = record.proofs.length;
      advance(stage.hours);
      const stat = fantasyMainApproachStat(fantasyStats(character), stage, action.approach);
      const success = check(next, stat, stage.dc, rng, stage.labels.ja, stage.kind === 'field', stage.context);
      record.attempts = Math.min(1_000_000, record.attempts + 1);
      practiceSuccess = success;
      if (success) {
        record.proofs.push({ stage: stage.id, approach: action.approach, hour: character.hour });
        gainXp(next, 6 + Math.floor(trial.chapter / 2));
      } else {
        character.fatigue = boundedNeed(character.fatigue + 4);
        const place = placeOf(character.location)!;
        if (stage.kind === 'field' && place.danger > 0 && !['city', 'tower'].includes(place.kind)) hurt(3 + Math.floor(trial.chapter / 4));
      }
      addLog(next, `主調査「${quest.id}」${step + 1}/${trial.stages.length}：${success ? '成功' : '失敗'}。`, success ? 'success' : 'failure');
      addLog(next, `航海場面［${quest.id}:${stage.id}:${action.approach}:${success ? 'success' : 'failure'}］。`, success ? 'story' : 'failure');
      return finish();
    }
    case 'craft': {
      const recipe = FANTASY_RECIPES.find(r => r.id === action.recipe);
      if (!recipe) return fail('製法が見つかりません。');
      if (recipe.job !== character.job) return fail('この製法は対応する職業への転職が必要です。');
      const facility = fantasyCraftFacility(character.job);
      if (!facility || !hasBuilding(character, facility)) return fail('この製法に対応する制作設備が現在地にありません。');
      if (!fantasyCanCraft(character, recipe)) return fail('写図を作るには、記載する地域をすべて訪問するか地図に記録してください。');
      const supplies = fantasyCraftInputs(character, recipe, action.material, action.gem);
      if (supplies.error) return fail(supplies.error);
      if (Object.keys(supplies.inputs).some(id => foodDetails(character, id)?.quality === 'spoiled')) return fail('傷んだ食材は制作に使えません。別の食材を用意してください。');
      const job = jobOf(character.job)!;
      advance(3);
      const success = check(next, job.stat, recipe.dc, rng, recipe.name);
      practiceSuccess = success;
      if (success) {
        const amount = recipe.count + rewardBonus(character, next);
        if (Object.entries(supplies.inputs).some(([id, count]) => (character.inventory[id] ?? 0) < count)) return fail('各装備に取り付ける宝石が足りません。');
        if (itemOf(recipe.output)?.equipment && (character.gear?.length ?? 0) + amount > 1000) return fail('装備の保管上限に達しています。不要な装備を整理してください。');
        for (const [id, count] of Object.entries(supplies.inputs)) if (!fantasySpendItem(character, id, count)) return fail('制作に使える未装着の材料が足りません。');
        addItem(character, recipe.output, amount);
        if (itemOf(recipe.output)?.equipment) for (let i = 0; i < amount; i++) createFantasyGear(character, recipe.output, rng, supplies.material, action.gem);
        addLog(next, `${itemOf(recipe.output)!.name}を${amount}個制作した。`, 'success');
        gainXp(next, 12);
      } else {
        addLog(next, '出来栄えに納得できず作業を止めた。材料は回収できた。再挑戦できる。', 'failure');
        gainXp(next, 3);
      }
      maybeEvent(next, rng);
      return finish();
    }
    case 'sell': {
      const sale = fantasySell(character, action);
      if (sale.error) return fail(sale.error);
      addLog(next, `${sale.name}を1個売り、金貨${sale.price}枚を得た。`, 'success');
      return finish();
    }
    case 'buy': {
      const item = itemOf(action.item);
      if (!item) return fail('品物が見つかりません。');
      if (!canBuyItem(character, item.id)) return fail('現在地にはこの品物を扱う店がありません。');
      const price = fantasyPrice(character, item.price, 'goods');
      if (character.gold < price) return fail('金貨が足りません。');
      character.gold -= price;
      addItem(character, item.id);
      addLog(next, `${item.name}を金貨${price}枚で1個購入した。`, 'story');
      return finish();
    }
    case 'use': {
      const map = FANTASY_MAPS.find(entry => entry.item === action.item);
      if (map) {
        if ((character.inventory[map.item] ?? 0) < 1) return fail('その地図を持っていません。');
        if (map.locationIds.every(id => character.charted.includes(id) || character.visited.includes(id))) return fail('この地図の地域はすべて記録済みです。');
        character.inventory[map.item]--;
        character.charted = [...new Set([...character.charted, ...map.locationIds])];
        addLog(next, `${map.name.ja}を広げ、地図に地域を記録した。訪問した扱いにはならない。`, 'system');
        return finish();
      }
      const usable = itemOf(action.item);
      if (usable?.use) {
        if ((character.inventory[usable.id] ?? 0) < 1) return fail('その品物を持っていません。');
        const details = foodDetails(character, usable.id);
        const actual = structuredClone(usable);
        if (details && details.quality !== 'fresh') {
          const fraction = details.quality === 'spoiled' ? 0.25 : 0.6;
          actual.use = { ...actual.use!, hp: Math.floor((actual.use!.hp ?? 0) * fraction), mp: Math.floor((actual.use!.mp ?? 0) * fraction), hunger: Math.floor((actual.use!.hunger ?? 0) * fraction), effect: undefined };
        }
        const result = applyFantasyItemUse(character, actual, fantasyStats(character));
        if (!result.changed) return fail('この品物で回復・治療・強化できる状態ではありません。');
        character.inventory[usable.id]--;
        addLog(next, result.hp || result.mp ? `${usable.name}を使った。HPを${result.hp}、MPを${result.mp}回復。` : `${usable.name}を使い、品物の効果を適用した。`, 'success');
        if (details?.quality === 'spoiled' && random(rng) < 0.65) { addLog(next, '傷んだ食べ物で腹を壊した。', 'failure'); hurt(10, true); }
        return finish();
      }
      const food = foodMeta(action.item);
      if (!food && !['potion', 'antidote'].includes(action.item)) return fail('その品物は直接使用できません。');
      if ((character.inventory[action.item] ?? 0) < 1) return fail('その品物を持っていません。');
      const stats = fantasyStats(character);
      let hp = action.item === 'meal' ? 25 : action.item === 'potion' ? 35 : action.item === 'antidote' ? 10 : action.item === 'jerky' ? 12 : action.item === 'bread' ? 6 : 0;
      let mp = action.item === 'meal' ? 8 : action.item === 'potion' ? 20 : action.item === 'antidote' ? 12 : 0;
      if (character.hp >= stats.hp && character.mp >= stats.mp && (!food || character.hunger <= 0)) return fail('回復する必要がありません。');
      const details = foodDetails(character, action.item);
      if (details) {
        const multiplier = details.quality === 'spoiled' ? 0.25 : details.quality === 'stale' ? 0.6 : 1;
        nutritionRecovery = Math.floor(food!.nutrition * multiplier);
        hp = Math.floor(hp * multiplier);
        mp = Math.floor(mp * multiplier);
      }
      character.inventory[action.item]--;
      character.hp = Math.min(stats.hp, character.hp + hp);
      character.mp = Math.min(stats.mp, character.mp + mp);
      addLog(next, `${itemOf(action.item)!.name}を使った。HPを${hp}、MPを${mp}回復。`, 'success');
      if (details?.quality === 'spoiled' && random(rng) < 0.65) {
        addLog(next, '傷んだ食べ物で腹を壊した。', 'failure');
        hurt(10, true);
      }
      return finish();
    }
    case 'skill': {
      const manaError = fantasyManaSkillError(character, action.skill);
      if (manaError) return fail(manaError);
      const skill = fantasySkills(character).find(s => s.id === action.skill && s.kind === 'active');
      if (!skill) return fail('使用できるアクティブスキルではありません。');
      if (character.mp < skill.mp) return fail('MPが足りません。無料の休息で回復できます。');
      if (skill.effect === 'heal' && character.hp >= fantasyStats(character).hp) return fail('HPはすでに満タンです。');
      if (skill.effect !== 'heal' && character.buff) return fail('先に現在の強化効果を使ってください。');
      character.mp -= skill.mp;
      if (skill.effect === 'heal') { character.hp = Math.min(fantasyStats(character).hp, character.hp + skill.power); creditSkill(next, skill.id, skill.mp); }
      else character.buff = { effect: skill.effect, power: skill.power, skill: skill.id, mp: skill.mp, ...(skill.stat ? { stat: skill.stat } : {}), ...(skill.diceFaces ? { diceFaces: skill.diceFaces } : {}), ...(skill.effect === 'check' ? { dice: 1, expiresAt: character.hour + 6 } : {}) };
      if (skill.mp > 0) {
        const result = fantasyManaAfterSkill(character, skill.id, skill.mp);
        character.mana = result.mana; character.fatigue = result.fatigue;
        if (result.hpDamage) hurt(result.hpDamage, true);
      }
      addLog(next, `${skill.name}を使用した。MPを${skill.mp}消費。${skill.description}`, 'success');
      return finish();
    }
    case 'event': {
      const event = FANTASY_EVENTS.find(e => e.id === next.event);
      const choice = event?.choices.find(c => c.id === action.choice);
      if (!event || !choice) return fail('イベントの選択肢が見つかりません。');
      if (!fantasyEventEligible(character, event)) return fail('この種族・職業・場所では、そのイベントを選べません。');
      const hostile = fantasyHostileEncounter(event.id);
      if (hostile) {
        advance(.5);
        const stat = fantasyEncounterChoiceStat(event.id, choice.id, fantasyCombatStat(character))!;
        const success = check(next, stat, choice.dc, rng, `${event.name}：${choice.label}`);
        practiceSuccess = success;
        if (choice.id === 'fight' && event.id === 'encounter-watch') character.notoriety = Math.min(100, (character.notoriety ?? 0) + 5);
        if (success) next.event = null;
        const stopped = choice.id === 'fight' ? hurt(success ? Math.max(1, location.danger) : 8 + location.danger * 3)
          : !success && hurt(5 + location.danger * 2);
        unresolvedEncounter = !success;
        if (stopped) { next.event = null; return finish(); }
        if (success) {
          gainXp(next, choice.id === 'fight' ? 6 : 2);
          if (choice.id === 'fight') extraPractice.add('hunt');
        }
        addLog(next, fantasyEncounterOutcomeLog(event.id, choice.id, success), success ? 'success' : 'failure');
        return finish();
      }
      advance(2);
      const success = check(next, choice.stat, choice.dc, rng, `${event.name}：${choice.label}`, false, choice.context);
      practiceSuccess = success;
      next.event = null;
      if (event.job && jobOf(event.job)?.category === 'crime') character.notoriety = Math.min(100, (character.notoriety ?? 0) + (success ? 1 : 2));
      if (success) {
        const gold = choice.gold + rewardBonus(character, next);
        character.gold += gold;
        if (!event.job || jobOf(event.job)?.category !== 'crime') grantFantasyReputation(character, 2);
        if (choice.item) addItem(character, choice.item);
        gainXp(next, 14);
        addLog(next, `${choice.success} 金貨${gold}枚${choice.item ? `、${itemOf(choice.item)!.name}1個` : ''}を獲得。`, 'success');
      } else {
        const loss = Math.min(character.gold, Math.max(1, Math.floor(choice.gold / 5)));
        character.gold -= loss;
        gainXp(next, 4);
        addLog(next, `${choice.failure} 出費は金貨${loss}枚。再び仕事で挑戦できる。`, 'failure');
        if (fantasyFailedEventPursuit(event.id, choice.id) && random(rng) < .55) confront(next, event.id === 'merchant-bandits' ? 'pursuit-failed' : 'crime-exposed');
      }
      return finish();
    }
    default: {
      if (action.type === 'magicCast' && fantasyMana(character).strain >= 80) return fail('マナの負荷が高すぎます。休息してください。');
      const beforeMp = character.mp, beforeHp = character.hp;
      const context = {
        stats: fantasyStats(character),
        check: (p: FantasyProfile, stat: FantasyStat, dc: number, label: string, r: () => number, actionSides?: number) => { practiceKeys.set(p, practiceKey); diceSides.set(p, actionSides ?? sides); const success = check(p, stat, dc, r, label); practiceSuccess = success; return success; },
        addItem: (p: FantasyProfile, item: string, count: number) => addItem(p.character!, item, count),
        hurt: (p: FantasyProfile, amount: number) => { damage(p, amount, false, false, atSea); },
      };
      const result = applyFantasyTerrain(next, action, rng, context) ?? applyFantasySpecialization(next, action, rng, context);
      if (!result) return fail('その操作には対応していません。');
      if (result.error || !result.changed) return fail(result.error ?? '行動を変更できませんでした。');
      next = result.profile; practiceKeys.set(next, practiceKey);
      advance(fantasyTerrainHours(action) || fantasySpecializationHours(profile, action));
      if (action.type === 'terrain') extraPractice.add(FANTASY_TERRAIN_ACTIVITIES.find(activity => activity.id === action.activity)!.practice);
      if (action.type === 'terrain' && action.activity === 'stealth-scout' && !practiceSuccess && !next.death && random(rng) < .55) confront(next, 'stealth-failed');
      if (!next.death && next.character!.mp < beforeMp && (action.type === 'terrain' || action.type === 'magicCast' && next.character!.hp > beforeHp || action.type === 'command' && action.operation === 'mission')) creditSkill(next, undefined, beforeMp - next.character!.mp);
      return finish();
    }
  }
}

/** 判定や状態を変えず、行動に必要なゲーム内時間を求める。 */
export function fantasyActionHours(profile: FantasyProfile, action: FantasyAction): number {
  if (!profile.character) return 0;
  switch (action.type) {
    case 'travel': return fantasyTransports(profile.character, action.destination).find(transport => transport.id === action.transport)?.hours ?? 0;
    case 'rest': case 'lodge': return 8;
    case 'eat': return FANTASY_DINING.find(meal => meal.id === action.meal)?.hours ?? .5;
    case 'pray': return .5;
    case 'priestBranch': return fantasyPriestActionHours(action);
    case 'propertyUse': return fantasyPropertyUseHours(action.plot);
    case 'advanceJob': return fantasyJobPathHours();
    case 'investigate': return fantasyMainStage(profile.character, action.quest)?.hours ?? 0;
    case 'job': case 'learn': case 'read': return 1;
    case 'work': return 4;
    case 'explore': case 'craft': return 3;
    case 'event': return fantasyHostileEncounter(profile.event) ? .5 : 2;
    case 'gather': return 2;
    case 'hunt': return 3;
    case 'skin': return 1;
    case 'fish': return action.mode === 'sea' ? 4 : 2;
    case 'boat': return 0.25;
    case 'manaTrain': return 0;
    case 'terrain': return fantasyTerrainHours(action);
    default: return fantasySpecializationHours(profile, action);
  }
}

function activityRandom(seed: number): () => number {
  let state = seed >>> 0;
  return () => {
    state = (state + 0x6d2b79f5) >>> 0;
    let value = state;
    value = Math.imul(value ^ value >>> 15, value | 1);
    value ^= value + Math.imul(value ^ value >>> 7, value | 61);
    return ((value ^ value >>> 14) >>> 0) / 4294967296;
  };
}

/** 期限までは結果を適用せず、検証済みの行動と抽選種を保存する。 */
export function startFantasyActivity(profile: FantasyProfile, action: FantasyAction, worldHour: number, rng: () => number = Math.random, options: { contract?: FantasyContractGrant } = {}): FantasyResult {
  const fail = (error: string): FantasyResult => ({ profile, error, changed: false });
  if (!Number.isFinite(worldHour) || worldHour < 0) return fail('世界の時刻を確認できません。');
  if (!action || typeof action !== 'object' || typeof action.type !== 'string') return fail('操作が正しくありません。');
  if (action.type === 'sync') return { profile, changed: false };
  if (profile.activity) return fail('現在の行動が終わるまで、新しい行動は開始できません。');
  const current = structuredClone(profile);
  if (current.character) current.character.hour = Math.max(current.character.hour, worldHour);
  const checked = applyFantasyAction(current, action, () => 0.999, { advanceTime: false, worldHour, ...options });
  if (checked.error) return fail(checked.error);
  const seed = Math.floor(random(rng) * 4294967296);
  const hours = fantasyActionHours(current, action);
  if (hours <= 0) return applyFantasyAction(current, action, activityRandom(seed), { advanceTime: false, worldHour, ...options });
  const startedAt = current.character!.hour;
  current.activity = { action: structuredClone(action), startedAt, endsAt: startedAt + hours, seed };
  if (action.type === 'work') current.activity.work = newFantasyWorkProgress();
  current.revision = profile.revision + 1;
  addLog(current, action.type === 'travel' && action.transport === 'escort'
    ? `護衛に出発した。${placeOf(action.destination)!.name}まで${hours}時間。到着後に金貨${current.character!.escort!.reward}枚。`
    : `行動を開始した。完了まで${hours}時間。`, 'system');
  return { profile: current, changed: true };
}

/** 共通時計に追従する。オフラインの待機中は食品だけが経時変化し、進行中の行動は続ける。 */
export function advanceFantasyWorld(profile: FantasyProfile, worldHour: number, options: { accrueIdleNeeds?: boolean } = {}): FantasyResult {
  if (!Number.isFinite(worldHour) || worldHour < 0) return { profile, changed: false, error: '世界の時刻を確認できません。' };
  if (profile.activity && (!Number.isFinite(profile.activity.startedAt) || !Number.isFinite(profile.activity.endsAt)
    || profile.activity.startedAt < 0 || profile.activity.endsAt <= profile.activity.startedAt
    || !Number.isSafeInteger(profile.activity.seed) || profile.activity.seed < 0 || profile.activity.seed > 0xffffffff)) {
    return { profile, changed: false, error: '進行中の行動記録を確認できません。' };
  }
  if (profile.activity?.work !== undefined && (profile.activity.action.type !== 'work' || !validFantasyWorkProgress(profile.activity.work)
    || profile.activity.work.completed >= fantasyWorkSteps(profile.activity.work) || profile.activity.endsAt - profile.activity.startedAt !== 4
    || !!profile.character && profile.activity.startedAt + (profile.activity.work.completed + 1) * fantasyWorkInterval(profile.activity) < profile.character.hour - 1e-8)) {
    return { profile, changed: false, error: '進行中の仕事記録を確認できません。' };
  }
  if (!profile.character || worldHour < profile.character.hour || (worldHour === profile.character.hour && (!profile.activity || profile.activity.endsAt > worldHour))) return { profile, changed: false };
  let next = structuredClone(profile);
  if (next.death) { next.character!.hour = worldHour; return { profile: next, changed: true }; }
  const target = worldHour;
  const advanceTo = (end: number, active: boolean): boolean => {
    const character = next.character!;
    const old = character.hour;
    const currentAction = next.activity?.action;
    const resting = active && (currentAction?.type === 'rest' || currentAction?.type === 'lodge'
      || currentAction?.type === 'propertyUse' && FANTASY_PROPERTY_PLOTS.some(plot => plot.id === currentAction.plot && plot.kind === 'residence'));
    const accrue = active || options.accrueIdleNeeds === true;
    if (accrue) {
      for (let hour = Math.floor(old) + 1; hour <= Math.floor(end); hour++) {
        character.hour = hour;
        character.hunger = boundedNeed(character.hunger + 2);
        character.fatigue = boundedNeed(character.fatigue + (resting ? 0 : active ? 3 : 1));
        const strain = (character.hunger >= 90 ? 1 : 0) + (active && !resting && character.fatigue >= 95 ? 1 : 0) + fantasyEffectDamage(character, hour - 1, hour);
        if (strain && damage(next, strain, true, false, fantasyActivityAtSea(next))) {
          next.revision++;
          if (next.activity) {
            if (next.activity.work?.completed) addLog(next, fantasyWorkSummaryLog(character.job, next.activity.work), 'system');
            delete next.activity;
            addLog(next, '救助のため、進行中の行動は中止された。', 'system');
          }
          return true;
        }
      }
    }
    character.hour = end;
    if (character.mana) character.mana = fantasyManaRecover(character, Math.floor(end) - Math.floor(old));
    pruneFantasyEffects(character);
    if (character.buff?.expiresAt !== undefined && character.buff.expiresAt <= character.hour) character.buff = null;
    const maximum = fantasyStats(character);
    character.hp = Math.min(character.hp, maximum.hp); character.mp = Math.min(character.mp, maximum.mp);
    return false;
  };
  while (next.character!.hour < target || !!next.activity && next.activity.endsAt <= target) {
    if (next.death) { next.character!.hour = target; break; }
    const activity = next.activity;
    if (!activity) {
      if (advanceTo(target, false)) continue;
      break;
    }
    const nextWork = activity.action.type === 'work' && activity.work ? activity.startedAt + (activity.work.completed + 1) * fantasyWorkInterval(activity) : undefined;
    const end = Math.min(target, activity.endsAt, nextWork ?? Infinity);
    if (advanceTo(end, true)) continue;
    if (nextWork !== undefined && end >= nextWork) {
      settleWorkStep(next, activity);
      next.revision++;
    }
    if (end < activity.endsAt) {
      if (nextWork !== undefined && end >= nextWork && end < target) continue;
      break;
    }
    delete next.activity;
    if (activity.work) {
      maybeEvent(next, activityRandom((activity.seed ^ 0xa511e9b3) >>> 0));
      continue;
    }
    const completed = applyFantasyAction(next, activity.action, activityRandom(activity.seed), {
      advanceTime: false, worldHour: end, durationHours: activity.endsAt - activity.startedAt, priceHour: activity.startedAt,
    });
    if (completed.error) {
      next.revision++;
      addLog(next, `行動を完了できなかった。${completed.error}`, 'failure');
    } else {
      next = completed.profile;
    }
  }
  return { profile: next, changed: true };
}
