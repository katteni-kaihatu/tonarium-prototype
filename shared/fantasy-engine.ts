import { fantasySeaPosition } from './fantasy-sea.ts';
import { fantasyArtifactEffects } from './fantasy-frontier-artifacts.ts';
import { FANTASY_FRONTIER_BASE, FANTASY_FRONTIER_SITE_DISCOVERY } from './fantasy-frontier-data.ts';
import { joinFantasyExpedition, fantasyExpeditionTravelError, fantasyFrontierDiscoveryCandidate } from './fantasy-expedition.ts';
import { applyFantasyUnderworld } from './fantasy-underworld.ts';
import { fantasyCanChangeTravelGear } from './fantasy-travel-gear.ts';
import { fantasyEquipmentSlot, fantasyEquipmentEntries, fantasyWornItemCount, migrateFantasyEquipment } from './fantasy-equipment-slots.ts';
import { fantasyInstitutionEligible, fantasyQuestInstitution } from './fantasy-institutions.ts';
import { fantasyLifeJob, fantasyHasJob, fantasyIsLifeJob } from './fantasy-careers.ts';
import { applyFantasyCommission, type FantasyCommissionContext, type FantasyCommissionResult } from './fantasy-commissions.ts';
import { validFantasyCookingProgress, fantasyCookingInterval } from './fantasy-cooking-progress.ts';
import { fantasyTravelBurdenHours, fantasyTravelBurdenQuote } from './fantasy-travel-burden.ts';
import { applyFantasyCooking, fantasyCookingActionHours, fantasyCookingError, fantasyCookingPlan, fantasyLegacyCookingAction, type FantasyCookingStock } from './fantasy-cooking.ts';
import { advanceFantasyFoodPreservation } from './fantasy-food-preservation.ts';
import { isFantasyRetreat } from './fantasy-retreats.ts';
import { applyFantasyOutdoorCooking, validFantasyOutdoorCookingAction, fantasyOutdoorCookingActionHours } from './fantasy-outdoor-cooking.ts';
import { applyFantasyRankBenefitAction, fantasyRankBenefitHours } from './fantasy-rank-benefits.ts';
import { fantasyJobMaxHp, fantasyClampJobHp } from './fantasy-job-balance.ts';
import { claimFantasyRankBook, readFantasyRankBook } from './fantasy-rank-rewards.ts';
import { applyFantasyMiracleAction, discoverFantasyMiracle } from './fantasy-miracles.ts';
import { fantasyCombatOnlySkill } from './fantasy-body-combat-catalog.ts';
import type {
  FantasyAction, FantasyCharacter, FantasyCheckContext, FantasyItem, FantasyLog, FantasyProfile, FantasyResult,
  FantasySkill, FantasyStat, FantasyStats, FantasyTransport, FantasyTravelState, FantasyTravelLeg,
} from './fantasy.ts';
import { FANTASY_EVENT_CHANCE } from './fantasy.ts';
import {applyFantasyBlackMarketToken} from './fantasy-black-market.ts';
import { fantasyMonsterSiteForItem } from './fantasy-monster-sites.ts';
import { FANTASY_GATE_HOURS, fantasyGateFare, fantasyHasGate } from './fantasy-gates.ts';
import { fantasyEscortAccept, fantasyEscortAcceptError, fantasyEscortComplete, fantasyEscortPenalty, fantasyEscortTerms, fantasyEscortTransportError } from './fantasy-escort.ts';
import { fantasyIsleLocationVisible } from './fantasy-isle-access.ts';
import { fantasyMainApproachStat, fantasyMainInvestigationError, fantasyMainProgress, fantasyMainReady, fantasyMainStage, fantasyMainTrial, validFantasyMainTrials } from './fantasy-main-trials.ts';
import { fantasyTaskObjective, fantasyTaskProgress, fantasyTaskReady, grantFantasyTaskProgress } from './fantasy-task-progress.ts';
import {
  FANTASY_EVENTS, FANTASY_ITEMS, FANTASY_JOBS, FANTASY_LOCATIONS,
  FANTASY_QUESTS, FANTASY_RACES, FANTASY_RECIPES, FANTASY_ROUTES,
} from './fantasy-data.ts';
import { boundedNeed, fantasyNeedPenalty, FANTASY_DINING, FANTASY_LODGINGS, foodDetails, foodMeta, reconcileFoodLots, fantasyHasSpoiledIngredients } from './fantasy-life.ts';
import { FANTASY_MAPS, FANTASY_SETTLEMENTS, canAcquireJob, canBuyItem, fantasyBuildingStock, fantasyBuildings, fantasyCanCraft, fantasyCraftFacility, fantasyFrontierLocations, fantasyKnownLocations } from './fantasy-town.ts';
import { fantasyEventEligible, fantasyQuestEligible } from './fantasy-access.ts';
import { FANTASY_CONTEXT_NAMES, fantasyContextBonus } from './fantasy-physiology.ts';
import { FANTASY_STARTING_GOLD, FANTASY_STARTING_INVENTORY, fantasyStartingInventory } from './fantasy-starting-kit.ts';
import { addFantasyStatus, applyFantasyItemUse, fantasyEffectDamage, fantasyItemBonuses, pruneFantasyEffects } from './fantasy-effects.ts';
import { fantasyHaggle, fantasyPrice, grantFantasyReputation } from './fantasy-reputation.ts';
import { fantasyMana, fantasyManaAfterSkill, fantasyManaOnUse, fantasyManaRecover, fantasyManaSkillError, fantasyManaSkills, fantasyManaStatBonuses } from './fantasy-mana.ts';
import { fantasyApprenticeshipError, fantasyLearnedSkills, fantasyNpcMentorSkills } from './fantasy-apprenticeship.ts';
import { fantasyAvailableJobSkills, fantasyPracticeMultiplier, fantasyProfessionGrade, fantasyProficiencyBonus, fantasySkilledPower, grantFantasyPractice } from './fantasy-progression.ts';
import { fantasyFacilityActionError, fantasyTempleTreatment } from './fantasy-facility-hours.ts';
import { initializeFantasyMagicKnowledge, learnFantasyMagicBook, learnFantasyMagicDungeon, completeFantasyMagicPrayer, fantasyMagicDiscoveryText } from './fantasy-magic-discovery.ts';
import {grantFantasyCircleBasics,learnFantasyCircleBook,learnFantasyCircleDungeon,completeFantasyCirclePrayer,fantasyCircleDiscoveryText} from './fantasy-magic-circle.ts';
import {learnFantasyAlchemyBook} from './fantasy-alchemy-discovery.ts';
import {fantasyOccultAction,fantasyOccultHours,fantasyOccultDungeonClaim} from './fantasy-occult.ts';
import {advanceFantasyDowned,stabilizeFantasyDowned,wakeFantasyDowned} from './fantasy-downed.ts';
import {fantasyBodyStatModifiers} from './fantasy-body-diversity.ts';
import {applyFantasyWorldUtility,recordFantasyWorldUtilityUse} from './fantasy-world-utilities.ts';
import {fantasyEffectHealing,fantasyActiveEffects} from './fantasy-effects.ts';
import {fantasyWorldSituationalBonus} from './fantasy-situational.ts';
import {applyFantasyAlchemySynthesis,fantasyAlchemySynthesisHours} from './fantasy-alchemy-synthesis.ts';
import {applyFantasyBagAction,fantasyBagChangeError,fantasyEscrowBagOverflow} from './fantasy-bags.ts';
import { applyFantasyProductionStudy, grantFantasyProductionRuins } from './fantasy-production-expansion.ts';
import { applyFantasyDungeonAction, isFantasyDungeonAction, learnFantasyDungeonMap, fantasyDungeonCampError } from './fantasy-dungeon.ts';
import { applyFantasyInteriorMapAction, isFantasyInteriorMapAction, fantasyInteriorMapHours } from './fantasy-interior-maps.ts';
import { FANTASY_MAP_MERCHANT_EVENT, fantasyMapMerchantHit } from './fantasy-map-merchant.ts';
import { createFantasyGear, fantasyCombatStat, fantasyCraftInputs, fantasyEquipGear, fantasySpendItem } from './fantasy-equipment.ts';
import { FANTASY_BOAT_OPTIONS, fantasyBoatError, fantasyFishingError, fantasyFishingDifficulty, fantasyFishingItem, fantasyGatheringOptions, fantasyGatherItem, fantasyHuntLoot, fantasyHuntTarget, fantasySkinError } from './fantasy-gathering.ts';
import { fantasyActivityAtSea, fantasyRescueTown, recordFantasyDeath } from './fantasy-mortality.ts';
import { applyFantasySpecialization, fantasyCompanionBonus, fantasyCompanionRescue, fantasySpecializationHours, settleFantasyCompanions } from './fantasy-specializations.ts';
import { FANTASY_READABLE_LIBRARY_BOOKS } from './fantasy-library.ts';
import { fantasyLibraryHoldings, fantasyTempleLibraryHoldings } from './fantasy-town.ts';
import { fantasyEnvironment, fantasyEnvironmentActionError, fantasyEnvironmentPenalty, fantasyCampWeatherLoss } from './fantasy-environment.ts';
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
import { lightFantasyCampFire, fantasyCampFireText, fantasyCampingKit, fantasyCampCompanions, fantasyCampAmbushHit, advanceFantasyCamp, validFantasyCampProgress, type FantasyCampProgress, type FantasyCampWatchWindow } from './fantasy-camping.ts';
import { fantasyVoyageFinishError, FANTASY_VOYAGE_CHART_QUEST, FANTASY_VOYAGE_FINAL_QUEST } from './fantasy-voyage-ending.ts';
import { fantasyIsleAccess, FANTASY_FINAL_ISLE_ID } from './fantasy-isle-access.ts';
import { fantasyVoyageScene } from './fantasy-voyage-scenes.ts';
import { FANTASY_VOYAGE_DECISIONS, fantasyVoyageDecisionError } from './fantasy-voyage-decisions.ts';
import { fantasyAmbushHit, FANTASY_AMBUSH_SLOT_HOURS } from './fantasy-ambush.ts';
import { fantasyTravelLegs, fantasyTravelPosition, fantasyTravelCurrentTransport, fantasyTravelPassed, fantasyOnRoad, fantasyTravelAnchor, fantasyTravelContinuation } from './fantasy-travel.ts';
import { fantasyCovertWork, fantasyEncounterChoiceStat, fantasyEncounterFor, fantasyEncounterOriginLog, fantasyEncounterOutcomeLog, fantasyFailedEventPursuit, fantasyHostileEncounter, fantasyEncounterSite, type FantasyEncounterCause } from './fantasy-encounters.ts';
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

function fantasyUnscaledStats(character: FantasyCharacter): FantasyStats {
  const racial= raceOf(character.race)?.modifiers??{},body=fantasyBodyStatModifiers(character);const modifiers={...racial};for(const [key,value] of Object.entries(body)){const stat=key as keyof FantasyStats;modifiers[stat]=(modifiers[stat]??0)+value;}
  const growth = Math.floor((character.level - 1) / 3);
  const stats: FantasyStats = {
    hp: 100, mp: 50, strength: 10, agility: 10, intelligence: 10, luck: 10, vitality: 10,
  };
  for (const stat of ['strength', 'agility', 'intelligence', 'luck', 'vitality'] as const) {
    stats[stat] = Math.max(1, 10 + (modifiers[stat] ?? 0) + (character.birthBonuses?.[stat] ?? 0) + growth);
  }
  const job = jobOf(character.job);
  const life=jobOf(fantasyLifeJob(character)??'');
  if(life?.extra&&life.id!==job?.id)stats[life.extra]=Math.max(1,10+(modifiers[life.extra]??0)+Math.min(8,Math.floor((character.jobXp[life.id]??0)/15))+growth);
  if (job?.extra) stats[job.extra] = Math.max(1, 10 + (modifiers[job.extra] ?? 0) + Math.min(8, Math.floor((character.jobXp[job.id] ?? 0) / 15)) + growth);
  const bonuses = fantasyItemBonuses(character, FANTASY_ITEMS).stats;
  for (const [key, value] of Object.entries(fantasyManaStatBonuses(character))) bonuses[key as keyof FantasyStats] = (bonuses[key as keyof FantasyStats] ?? 0) + value;
  for (const [key, value] of Object.entries(bonuses)) if (!['hp', 'mp'].includes(key) && stats[key as keyof FantasyStats] !== undefined) stats[key as keyof FantasyStats] = Math.max(1, stats[key as keyof FantasyStats]! + value);
  stats.hp = Math.max(20, 100 + (modifiers.hp ?? 0) + (character.birthBonuses?.hp ?? 0) + (stats.vitality - 10) * 4 + (character.level - 1) * 8 + (bonuses.hp ?? 0));
  stats.mp = Math.max(5, 50 + (modifiers.mp ?? 0) + (character.birthBonuses?.mp ?? 0) + (stats.intelligence - 10) * 3 + (character.level - 1) * 4 + (bonuses.mp ?? 0));
  return stats;
}

/** Exact equipment, ancestry and vitality HP before the current job multiplier. */
export function fantasyUnscaledMaxHp(character: FantasyCharacter): number {
  return fantasyUnscaledStats(character).hp;
}

export function fantasyStats(character: FantasyCharacter): FantasyStats {
  const stats = fantasyUnscaledStats(character);
  stats.hp = fantasyJobMaxHp(character.job, stats.hp);
  return stats;
}

export function fantasySkills(character: FantasyCharacter): FantasySkill[] {
  return [...(raceOf(character.race)?.skills ?? []), ...fantasyBodyCombatSkills(character), ...fantasyAvailableJobSkills(character), ...fantasyManaSkills(character), ...fantasyLearnedSkills(character), ...fantasyPriestSkills(character), ...fantasyJobPathSkills(character), ...(fantasyLifeJob(character)&&fantasyLifeJob(character)!==character.job?fantasyJobPathSkills({...character,job:fantasyLifeJob(character)!}):[])].map(skill => ({ ...skill, power: fantasySkilledPower(character, skill) }));
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
    const expeditionError = fantasyExpeditionTravelError(character,destination,id);
    const actualReason = expeditionError ?? (!known || id === 'gate' && !fantasyKnownLocations(character).includes(destination) ? '目的地はまだ地図にありません。隣接地域を探索するか地図を入手してください。' : finalIslePassage && !['ship','working-ship'].includes(id) ? 'この島への出入りは、確かめた航路を通る船で行ってください。' : reason ?? (!route ? 'この交通手段で通れる経路がありません。' : character.gold < cost ? `金貨が${cost - character.gold}枚足りません。` : undefined));
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

/** Server quotes include every transfer leg; positions on roads quote the remaining edge first. */
export function fantasyTransports(character: FantasyCharacter, destination: string): FantasyTransport[] {
  if(isFantasyRetreat(destination)&&!character.charted.includes(destination)&&!character.visited.includes(destination))return [];
  const position = character.travelPosition;
  if (position) {
    const continuation = fantasyTravelContinuation(position);
    if (continuation) {
      if (destination !== position.to) return [];
      const labels = { ship: '定期船', 'working-ship': '手伝い船', airship: '飛空艇', gate: '転移門' };
      return [{ id: continuation.transport, name: labels[continuation.transport], description: '支払済みの移動を、そのまま到着地点まで続ける。', hours: continuation.hours, cost: 0, available: true,
        path: [position.from, position.to], legs: [{ from: position.from, to: position.to, transport: continuation.transport, hours: continuation.hours, cost: 0, startFraction: position.fraction }] }];
    }
    if (character.escort?.destination === destination && !fantasyEscortTransportError(character, destination)) {
      const contract = character.escort, terms = fantasyEscortTerms(contract.from, destination)!;
      const legs = fantasyTravelLegs(terms.path, 'escort', contract.hours, 0);
      const index = legs.findIndex(leg => leg.from === position.from && (position.from === position.to || leg.to === position.to));
      if (index >= 0) {
        const remaining = structuredClone(legs.slice(index));
        remaining[0].hours *= 1 - position.fraction;
        remaining[0].startFraction = position.fraction;
        return [fantasyTravelBurdenQuote(character,{ id: 'escort', name: '護衛付き添い', description: '停止した隊列から護衛を続ける。', hours: remaining.reduce((sum, leg) => sum + leg.hours, 0), cost: 0, reward: contract.reward, available: true,
          path: [remaining[0].from, ...remaining.map(leg => leg.to)], legs: remaining })];
      }
    }
    const anchor = (id: string) => { const c = { ...character, location: id }; delete c.travelPosition; return c; };
    if (position.from === position.to || position.fraction <= 1e-8) return fantasyTransports(anchor(position.from), destination);
    const edge = FANTASY_ROUTES.find(route => route.from === position.from && route.to === position.to || route.from === position.to && route.to === position.from);
    if (!edge) return [];
    const quotes = new Map<string, FantasyTransport>();
    for (const [endpoint, fraction, reverse] of [[position.from, position.fraction, true], [position.to, 1 - position.fraction, false]] as const) {
      const c = anchor(endpoint), prefixHours = fantasyTravelBurdenHours(character,edge.hours * fraction * (1 + fantasyNeedPenalty(character) * .1),'foot');
      const options = endpoint === destination ? [{ id: 'foot', name: '徒歩', description: '陸路を歩く。', hours: 0, cost: 0, available: true, path: [endpoint], legs: [] } as FantasyTransport] : fantasyTransports(c, destination);
      for (const quote of options) {
        if (['gate', 'airship', 'escort'].includes(quote.id) || edge.mode !== 'land') continue;
        const prefix: FantasyTravelLeg = { from: reverse ? position.to : position.from, to: endpoint, startFraction: reverse ? 1 - position.fraction : position.fraction, transport: 'foot', hours: prefixHours, cost: 0 };
        const option = { ...quote, hours: prefixHours + quote.hours, path: [prefix.from, ...quote.path], legs: [prefix, ...(quote.legs ?? [])] };
        const previous = quotes.get(option.id);
        if (!previous || (!previous.available && option.available) || previous.available === option.available && option.hours < previous.hours) quotes.set(option.id, option);
      }
    }
    return [...quotes.values()];
  }
  const options = fantasyTransportChoices(character, destination).map(quote => fantasyTravelBurdenQuote(character,{ ...quote, legs: fantasyTravelLegs(quote.path, quote.id, quote.hours, quote.cost) }));
  if (placeOf(character.location)?.kind !== 'city' && character.location !== destination) {
    let best: FantasyTransport | undefined;
    for (const city of FANTASY_LOCATIONS.filter(place => place.kind === 'city' && place.id !== destination)) {
      const walk = shortest(character.location, city.id, ['land']), ride = shortest(city.id, destination, ['land']);
      if (!walk || !ride || !walk.hours || !ride.hours) continue;
      const walkHours = Math.max(.25, Math.ceil(walk.hours * (1 + fantasyNeedPenalty(character) * .1)));
      const rideHours = Math.max(.25, Math.ceil(ride.hours * .5 * 4) / 4), cost = Math.ceil(ride.hours * 3);
      const visible = fantasyKnownLocations(character).includes(destination) || fantasyFrontierLocations(character).includes(destination);
      const reason = !visible ? '目的地はまだ地図にありません。隣接地域を探索するか地図を入手してください。' : character.gold < cost ? `金貨が${cost - character.gold}枚足りません。` : undefined;
      const option: FantasyTransport = fantasyTravelBurdenQuote(character,{ id: 'carriage', name: '徒歩＋乗合馬車', description: '街までは歩き、街で乗合馬車に乗り換える。', hours: walkHours + rideHours, cost, available: !reason, ...(reason ? { reason } : {}), path: [...walk.path, ...ride.path.slice(1)], legs: [...fantasyTravelLegs(walk.path, 'foot', walkHours, 0), ...fantasyTravelLegs(ride.path, 'carriage', rideHours, cost)] });
      if (!best || option.hours < best.hours) best = option;
    }
    const foot = options.find(quote => quote.id === 'foot');
    if (best && (!foot?.available || best.hours < foot.hours)) {
      const index = options.findIndex(quote => quote.id === 'carriage');
      if (index >= 0) options[index] = { ...best, legs: best.legs! }; else options.push({ ...best, legs: best.legs! });
    }
  }
  return options;
}

/** A proposal can inspect this quote without spending, moving, or rerolling anything. */
export function fantasyTravelRedirectQuote(profile: FantasyProfile, destination: string, transport?: string, hour = profile.character?.hour ?? 0): FantasyTransport | undefined {
  const activity = profile.activity, c = profile.character;
  if (!activity || activity.action.type !== 'travel' || !c) return undefined;
  const riding = fantasyTravelCurrentTransport(activity, hour) ?? activity.action.transport;
  if (['ship', 'working-ship', 'airship', 'gate', 'escort'].includes(riding) || activity.action.transport === 'escort') return undefined;
  if (destination === activity.action.destination && (!transport || transport === riding) && riding !== 'carriage') return undefined;
  const character = { ...c, travelPosition: fantasyTravelPosition(activity, hour) ?? c.travelPosition };
  const wanted = riding === 'carriage' ? 'foot' : transport ?? riding;
  return fantasyTransports(character, destination).find(quote => quote.id === wanted && quote.available);
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

/** 共同報告で経験を得ても、負傷で倒れた仲間をレベル上昇だけで起こさない。 */
export function grantFantasyExperience(profile:FantasyProfile,amount:number):void {
  if(!profile.character||!Number.isSafeInteger(amount)||amount<0)return;
  const hp=profile.character.hp,downed=!!profile.character.downed||hp<=0;
  gainXp(profile,amount);if(downed)profile.character.hp=hp;
}

function check(profile: FantasyProfile, stat: FantasyStat, dc: number, rng: () => number, context: string, affinity = false, bodyContext?: FantasyCheckContext, sidesOverride?: number, modifierBonus=0, naturalLimits=false) {
  const character = profile.character!;
  const stats = fantasyStats(character);
  const sides = sidesOverride ?? diceSides.get(profile) ?? 20;
  const covert = practiceKeys.get(profile)?.startsWith('work:') === true && jobOf(practiceKeys.get(profile)?.split(':')[1]??character.job)?.category === 'crime';
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
  const situation=fantasyWorldSituationalBonus(character,placeOf(character.location)?.kind??'',practiceKeys.get(profile)?.split(':')[0]??(character.dungeon?.active?'dungeon':''),stat);
  modifier+=situation;if(situation)addLog(profile,`職業の状況補正+${situation}。`,'system');
  modifier+=modifierBonus;
  const needPenalty = fantasyNeedPenalty(character);
  modifier -= needPenalty;
  modifier -= environment;
  if (covert && fantasyEnvironment(character).night) modifier += 1;
  modifier += fantasyItemBonuses(character, FANTASY_ITEMS).check;
  modifier += fantasyCompanionBonus(character).check;
  if (bodyContext) modifier += fantasyContextBonus(character, bodyContext);
  const checkJob=jobOf(practiceKeys.get(profile)?.split(':')[1]??character.job);
  if (checkJob?.stat === stat) modifier += fantasyProficiencyBonus(character,checkJob.id);
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
  const success = naturalLimits&&sides===20?die===20||die!==1&&die+modifier>=actualDc:die+modifier>=actualDc;
  if(recordFantasyWorldUtilityUse(profile,'check',stat))effectiveSkills.add(profile);
  const dice = rolls.length === 1 ? `d${sides}=${die}` : `${rolls.length}d${sides}=[${rolls.join(',')}]、採用${die}（${net >= 0 ? '最高' : '最低'}）`;
  addLog(profile, `${context}：${dice}、補正${modifier >= 0 ? '+' : ''}${modifier}、合計${die + modifier} / DC${actualDc} → ${success ? '成功' : '失敗'}`, success ? 'success' : 'failure');
  if (pattern || facePenalty) addLog(profile, `判定の面：${pattern ?? '通常'}${facePenalty ? `、各面-${facePenalty}` : ''}。元の出目[${rawRolls.join(',')}] → [${rolls.join(',')}]。`, 'system');
  return success;
}

export function fantasyWorldCheck(profile:FantasyProfile,stat:FantasyStat,dc:number,rng:()=>number,label:string,bonus=0):boolean {
  return check(profile,stat,dc,rng,label,false,undefined,20,bonus,true);
}
export function fantasyWorldDamage(profile:FantasyProfile,amount:number):boolean {return damage(profile,amount,false,false);}

function damage(profile: FantasyProfile, amount: number, unprotected = false, advanceRescueTime = true, atSea = false): boolean {
  const character = profile.character!;
  if (profile.death) return true;
  let guard = unprotected ? 0 : passive(character, 'guard') + fantasyItemBonuses(character, FANTASY_ITEMS).guard + fantasyCompanionBonus(character).guard;
  if(!unprotected&&amount>Math.max(0,guard-(fantasyActiveEffects(character).find(effect=>effect.id==='skill-resolve')?.guard??0))&&recordFantasyWorldUtilityUse(profile,'guard'))effectiveSkills.add(profile);
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
    if(character.dungeon)delete character.dungeon.active;
    delete character.travelPosition;
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
  if (profile.character&&isFantasyRetreat(profile.character.location) || profile.event || profile.death) return;
  const events = FANTASY_EVENTS.filter(event => event.id!==FANTASY_MAP_MERCHANT_EVENT&&(!placeOf(profile.character!.location)?.land.startsWith('frontier')||event.locations?.includes(profile.character!.location))&&!fantasyHostileEncounter(event.id) && fantasyEventEligible(profile.character!, event));
  if (!events.length) return;
  if (random(rng) >= FANTASY_EVENT_CHANCE) return;
  const event = events[Math.floor(random(rng) * events.length)];
  profile.event = event.id;
  addLog(profile, `${event.name}：${event.description}`, 'story');
}

/** 護衛を辞退する。報酬は受け取らず、報酬の半分（最低1枚）を違約金として負う。 */
function abandonEscort(profile: FantasyProfile): boolean {
  const character = profile.character;
  if (!character?.escort) return false;
  const amount = fantasyEscortPenalty(character.escort.reward), paid = Math.min(character.gold, amount);
  character.gold -= paid;
  character.escortPenalty = { amount, paid, hour: character.hour, destination: character.escort.destination };
  delete character.escort;
  addLog(profile, `護衛依頼を辞退した。報酬は受け取らず、違約金${amount}枚（支払い${paid}枚）を負った。`, 'system');
  return true;
}

function confront(profile: FantasyProfile, cause: FantasyEncounterCause): boolean {  if (profile.event || profile.death || !profile.character || profile.character.hp <= 0) return false;
  const c = profile.character, place = fantasyEncounterSite(c) ?? placeOf(c.location)!;
  if(c.location===FANTASY_FRONTIER_BASE&&!fantasyOnRoad(c))return false;
  const event = fantasyEncounterFor(fantasySeaPosition(c)?'coast':place.kind, cause, jobOf(c.job)?.category === 'crime');
  profile.event = event.id;
  addLog(profile, fantasyEncounterOriginLog(cause), 'failure');
  addLog(profile, `${event.name}：${event.description}`, 'story');
  return true;
}

function settleWorkStep(profile: FantasyProfile, activity: NonNullable<FantasyProfile['activity']>) {
  const character = profile.character!, work = activity.work!, jobId=activity.action.type==='work'&&activity.action.career==='life'?fantasyLifeJob(character):character.job, job = jobOf(jobId??'unassigned')!;
  const step = work.completed + 1, steps = fantasyWorkSteps(work);
  const rng = activityRandom((activity.seed ^ Math.imul(step, 0x9e3779b1)) >>> 0);
  practiceKeys.set(profile, `work:${job.id}:${character.location}`);
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
  grantFantasyPractice(character, { key: `work:${job.id}:${character.location}`, job:job.id, amount: 6, success: succeeded, ...(job.stat === 'charisma' ? { practice: 'command' as const } : {}) });
  const location = placeOf(character.location)!;
  const cultivated = ['sunmeadow', 'loom-village'].includes(location.id) || !!FANTASY_SETTLEMENTS[location.id] && location.kind === 'city';
  if (job.id === 'farmer' && cultivated) {
    addItem(character, 'grain', succeeded ? 2 : 1);
    if (succeeded) addItem(character, 'flax');
    addLog(profile, `共同の畑で穀物を${succeeded ? 2 : 1}個${succeeded ? 'と亜麻の繊維を1個' : ''}収穫した。`, 'success');
  }
  if (job.id === 'fisher' && (['coast', 'swamp', 'island'].includes(location.kind) || location.services.includes('port'))) {
    addItem(character, 'fish', succeeded ? 2 : 1);
    addLog(profile, `共同の漁場で魚を${succeeded ? 2 : 1}個確保した。`, 'success');
  }
  if (succeeded && job.category !== 'crime') grantFantasyReputation(character, 1);
  addLog(profile, fantasyWorkSummaryLog(job.id, work), 'success');
  if (!success && fantasyCovertWork(job.id) && random(rng) < .35) confront(profile, 'crime-exposed');
}

export interface FantasyActionOptions {
  queuedCompletion?: boolean;
  advanceTime?: boolean;
  worldHour?: number;
  durationHours?: number;
  priceHour?: number;
  contract?: FantasyContractGrant;
  travel?: FantasyTravelState;
  camp?: FantasyCampProgress;
  mageAvailable?: boolean;
  cookingStock?: FantasyCookingStock;
  commissionContext?: FantasyCommissionContext;
  onCommission?: (result: FantasyCommissionResult) => void;
}

export function applyFantasyAction(profile: FantasyProfile, action: FantasyAction, rng: () => number = Math.random, options: FantasyActionOptions = {}): FantasyResult {
  const stock = options.cookingStock, beforeStock = stock ? structuredClone(stock) : undefined;
  const restoreStock = () => { if (stock && beforeStock) { stock.inventory = beforeStock.inventory; stock.foodLots = beforeStock.foodLots; } };
  const result=applyFantasyActionUnchecked(profile,action,rng,options);
  if(!result.changed||result.error||!result.profile.character){restoreStock();return result;}
  const capacity=fantasyBagChangeError(profile,result.profile);
  if (capacity && options.queuedCompletion) return { ...result, profile: fantasyEscrowBagOverflow(profile, result.profile) };
  if(capacity){restoreStock();return {profile,error:capacity,changed:false};}
  return result;
}
function applyFantasyActionUnchecked(profile: FantasyProfile, action: FantasyAction, rng: () => number = Math.random, options: FantasyActionOptions = {}): FantasyResult {
  const fail = (error: string): FantasyResult => ({ profile, error, changed: false });
  if (!action || typeof action !== 'object' || typeof action.type !== 'string') return fail('操作が正しくありません。');
  if (action.type === 'sync') return { profile, changed: false };
  action = fantasyLegacyCookingAction(action) ?? action;
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
  if(action.type==='magicCompose'&&action.core==='miracle')return fail('miracle:prepare-error');
  if(profile.character?.lastDawnPledge)return fail('miracle:pledge-bound');
  const miracleAction = applyFantasyMiracleAction(profile, action); if (miracleAction) return miracleAction;
  if (profile.character?.returnLantern) return fail('return:pending');
  if (profile.combatId) return fail('戦闘を終えるか離脱してから行動してください。');
  if(profile.character?.downed){
    if(action.type!=='downedCare')return fail('意識が戻るまで、手当てを待ってください。');
    const next=structuredClone(profile),c=next.character!;
    if(c.hour>=c.downed!.expiresAt)return fail('手当ての期限を過ぎています。最新の状態を確認してください。');
    if(action.method==='potion'){
      const item=FANTASY_ITEMS.find(item=>(c.inventory[item.id]??0)>0&&(item.id==='potion'||item.category==='potion'&&(item.use?.hp??0)>0)&&!item.food&&item.category!=='food');
      if(!item||!stabilizeFantasyDowned(next,c.hour))return fail('応急手当てに使える回復薬がありません。');
      c.inventory[item.id]--;
    }else{
      const cost=Math.ceil(fantasyStats(c).hp/4)+5;
      if(!fantasyBuildings(c).some(place=>place.id==='temple')||c.gold<cost)return fail('神殿で目覚めるには、治療費が必要です。');
      c.gold-=cost;wakeFantasyDowned(next,fantasyStats(c).hp);c.effects=c.effects?.filter(effect=>!['poison','burn','frost','weakness'].includes(effect.id));
    }
    next.revision++;return {profile:next,changed:true};
  }
  if(action.type==='downedCare')return fail('手当てを待つ人はいません。');
  // 途中で取り消しても、判定が済んだ分（仕事の各手番の金貨・経験値）は確定済みなので残す。
  if (action.type === 'cancel') {
    const activity = profile.activity;
    if (!activity) return fail('取り消せる行動がありません。');
    if (['ship', 'working-ship', 'airship', 'gate'].includes(fantasyTravelCurrentTransport(activity, profile.character?.hour ?? activity.startedAt) ?? '')) return fail('到着前の船・飛空艇・転移門からは途中で降りられません。');
    if (activity.action.type === 'travel' && activity.action.transport === 'escort') return fail('護衛の移動は途中で取り消せません。依頼の辞退を使ってください。');
    const cancelled = structuredClone(profile), work = cancelled.activity?.work;
    delete cancelled.activity;
    if (cancelled.character) fantasyTravelAnchor(cancelled.character);
    if (work && work.completed > 0 && cancelled.character) addLog(cancelled, fantasyWorkSummaryLog(cancelled.character.job, work), 'system');
    addLog(cancelled, '行動を途中で取り消した。判定済みの受取分は残り、依頼や調査の完了は数えない。', 'system');
    cancelled.revision++;
    return { profile: cancelled, changed: true };
  }
  // 移動中に進路を変える。船と護衛は途中変更できず、馬車からは降りて徒歩になる。
  if (action.type === 'redirect') {
    const activity = profile.activity;
    if (!activity || activity.action.type !== 'travel') return fail('移動中にだけ進路を変えられます。');
    const riding = fantasyTravelCurrentTransport(activity, profile.character!.hour) ?? activity.action.transport;
    if (['ship', 'working-ship'].includes(riding)) return fail('船の上では目的地を変えられません。');
    if (['airship', 'gate'].includes(riding)) return fail('船・飛空艇・転移門の移動中は目的地を変えられません。');
    if (activity.action.transport === 'escort') return fail('護衛中は目的地を変えられません。依頼を辞退してから移動してください。');
    const chosen = fantasyTravelRedirectQuote(profile, action.destination, action.transport);
    if (!chosen) return fail('その目的地へ進める手段がありません。');
    const changed = structuredClone(profile), character = changed.character!;
    character.travelPosition = fantasyTravelPosition(activity, character.hour) ?? character.travelPosition;
    const seed = activity.seed;
    character.gold -= chosen.cost;
    changed.activity = { action: { type: 'travel', destination: action.destination, transport: chosen.id }, startedAt: character.hour, endsAt: character.hour + chosen.hours, seed,
      travel: { legs: structuredClone(chosen.legs!), paid: chosen.cost, ambushChecked: activity.travel?.ambushChecked ?? 0, ambushStartedAt: activity.travel?.ambushStartedAt ?? activity.startedAt } };
    addLog(changed, `進路を変え、${placeOf(action.destination)!.name}へ${chosen.name}で向かう。`, 'system');
    changed.revision++;
    return { profile: changed, changed: true };
  }
  // 護衛の移動中でも、依頼を辞退すればそこで足を止める。違約金は同じ規則。
  if (action.type === 'escortAbandon' && profile.activity?.action.type === 'travel' && profile.activity.action.transport === 'escort') {
    const left = structuredClone(profile);
    delete left.activity;
    if (!abandonEscort(left)) return fail('受注中の護衛依頼はありません。');
    fantasyTravelAnchor(left.character!);
    left.revision++;
    return { profile: left, changed: true };
  }
  if (fantasyCanChangeTravelGear(profile, action)) {
    // 移動の予約を残し、時刻を進めない装備操作だけを通す。
    const ready = structuredClone(profile); delete ready.activity;
    const result = applyFantasyAction(ready, action, rng, options);
    if (result.error) return fail(result.error);
    result.profile.activity = structuredClone(profile.activity);
    return result;
  }
  if (profile.activity) return fail('現在の行動が終わるまで、新しい行動は開始できません。');
  const roadAction = ['travel', 'rest', 'use', 'equip', 'unequip', 'wear', 'skill', 'magicPrepare', 'magicCompose', 'magicCast', 'manaTrain', 'event', 'skin', 'priestReleaseVow', 'escortAbandon'].includes(action.type)
    || action.type === 'command' && ['assign', 'dismiss'].includes(action.operation);
  if (fantasyOnRoad(profile.character) && !roadAction) return fail('移動経路の途中です。施設や現地の行動は、地域に到着してから行ってください。');
  const facilityError=profile.character?fantasyFacilityActionError({...profile.character,hour:options.priceHour??profile.character.hour},action):undefined;
  if(facilityError)return fail(facilityError);
  const bag=applyFantasyBagAction(profile,action);if(bag)return bag;
  const alchemy=applyFantasyAlchemySynthesis(profile,action,rng,{advanceTime:options.advanceTime,startedAt:options.priceHour});if(alchemy)return alchemy;
  const occult=fantasyOccultAction(profile,action,rng,{advanceTime:options.advanceTime,startedAt:options.priceHour});if(occult)return occult;
  if (isFantasyInteriorMapAction(action)) return applyFantasyInteriorMapAction(profile, action, rng, { advanceTime: options.advanceTime });
  if(isFantasyDungeonAction(action)){
    const result=applyFantasyDungeonAction(profile,action,rng);
    if(result.changed&&result.profile.character){const c=result.profile.character;if(result.discovery){const learned=learnFantasyMagicDungeon(c,result.discovery);if(learned.length)addLog(result.profile,fantasyMagicDiscoveryText(learned,'ja'),'success');const runes=learnFantasyCircleDungeon(c,result.discovery);if(runes.length)addLog(result.profile,fantasyCircleDiscoveryText(runes,'ja'),'success');}if(action.type==='dungeonInteract'&&c.dungeon?.active){fantasyOccultDungeonClaim(c,c.dungeon.active.site,c.dungeon.active.room);grantFantasyProductionRuins(c,c.dungeon.active.site,c.dungeon.active.room);}}
    return result;
  }
  if(profile.character?.dungeon?.active&&!['sync','use','equip','unequip','wear','skill','magicPrepare','magicCast','event','rest','campCook','cookMix','abandon'].includes(action.type))return fail('遺跡の入口へ戻り、外へ出てから行ってください。');
  let next = structuredClone(profile);
  const target = action.type === 'investigate' ? `${action.quest}:${profile.character ? fantasyMainProgress(profile.character, action.quest) : 0}:${action.approach}` : action.type === 'craft' || action.type === 'campCook' ? action.recipe : action.type === 'gather' ? action.resource : action.type === 'fish' ? action.mode : action.type === 'skill' ? action.skill : '';
  const actionJob=action.type==='craft'?FANTASY_RECIPES.find(r=>r.id===action.recipe)?.job:action.type==='work'&&action.career==='life'?fantasyLifeJob(profile.character!):['gather','fish','alchemy','alchemyCompose','cookMix'].includes(action.type)?fantasyLifeJob(profile.character!):undefined;
  const practiceKey = `${action.type === 'campCook' ? 'camp-cook' : action.type}:${actionJob??profile.character?.job ?? 'unassigned'}:${profile.character?.location ?? 'hearth'}:${target}`.replace(/:$/, '').slice(0, 120);
  practiceKeys.set(next, practiceKey);
  const sides = action.type === 'gather' ? 6 : ['work', 'skin'].includes(action.type) ? 8 : ['craft', 'fish', 'alchemy'].includes(action.type) ? 12 : 20;
  diceSides.set(next, sides);
  let practiceSuccess = true;
  let unresolvedEncounter = false;
  let atSea = action.type === 'fish' && action.mode === 'sea';
  const extraPractice = new Set<keyof NonNullable<FantasyCharacter['practice']>>();
  const advance = (hours: number) => { if (options.advanceTime !== false && next.character) {advanceFantasyFoodPreservation(next.character,next.character.hour,next.character.hour+hours);next.character.hour += hours;} };
  const hurt = (amount: number, unprotected = false) => damage(next, amount, unprotected, false, atSea);
  let nutritionRecovery = 0;
  let fatigueRecovery = 0;
  const finish = (): FantasyResult => {
    if (next.character) {
      const c = next.character;
      if (!next.death) { syncFantasyPriestGrowth(c); c.hp = fantasyClampJobHp(c.hp, fantasyStats(c).hp); }
      const practice = ['explore', 'craft', 'gather', 'hunt', 'fish', 'command'].includes(action.type) ? action.type as keyof NonNullable<FantasyCharacter['practice']> : undefined;
      const progresses = ['work', 'craft', 'gather', 'hunt', 'skin', 'fish', 'event', 'alchemy', 'terrain', 'investigate'].includes(action.type) || action.type==='explore'&&!isFantasyRetreat(character.location) || action.type === 'command' && ['mission', 'recover', 'recontract'].includes(action.operation);
      if (!next.death && !unresolvedEncounter && (progresses || effectiveSkills.has(next))) {
        grantFantasyPractice(c, { key: practiceKey, ...(actionJob?{job:actionJob}:{}), amount: ['work', 'craft', 'hunt'].includes(action.type) ? 6 : 3, success: practiceSuccess, practice });
        for (const key of extraPractice) if (key !== practice) { c.practice ??= {}; c.practice[key] = Math.min(1_000_000, (c.practice[key] ?? 0) + 1); }
      }
      const elapsed = profile.character ? Math.max(0, c.hour - profile.character.hour) : 0;
      const elapsedWhole = profile.character ? Math.max(0, Math.floor(c.hour) - Math.floor(profile.character.hour)) : 0;
      const resting = action.type === 'rest' || action.type === 'lodge' || fantasyRankBenefitHours(action)>0 || action.type === 'propertyUse' && FANTASY_PROPERTY_PLOTS.some(plot => plot.id === action.plot && plot.kind === 'residence');
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
        const cooked = action.type === 'cookMix' && action.station === 'kitchen' ? fantasyCookingPlan(action) : undefined;
        const taskAction: FantasyAction = cooked ? { type: 'craft', recipe: cooked.recipe.id } : action;
        const advanced = grantFantasyTaskProgress(c, taskAction, options.priceHour ?? profile.character?.hour ?? c.hour, profile.character?.location ?? c.location, practiceSuccess);
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
      level: 1, xp: 0, gold: FANTASY_STARTING_GOLD, hp: 100, jobHpVersion: 1, mp: 50, location: 'hearth', hour: options.worldHour ?? 8,
      lifeStartedAt: options.worldHour ?? 8,
      equipmentVersion: 1, fatigue: 0, hunger: 0, foodLots: [], charted: [],
      inventory: fantasyStartingInventory(race, rng), quests: [], completed: [], visited: ['hearth'],
      jobXp: { unassigned: 0 }, buff: null,
    };
    character.birthBonuses = fantasyBirthBonuses(rng);
    next.character = character;
    initializeFantasyMagicKnowledge(character);
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
    case 'expeditionJoin': {
      const error=joinFantasyExpedition(character,action.route);if(error)return fail(error);addLog(next,'expedition:joined','story');return finish();
    }
    case 'wear': {
      const item = itemOf(action.item);
      if (!item?.wear || (character.inventory[item.id] ?? 0) < 1) return fail('所有する衣服を選んでください。');
      if (character.outfit === item.id) return fail('その衣服はすでに着用しています。');
      character.outfit = item.id; addLog(next, `${item.name}を着用した。`, 'system');
      return finish();
    }
    case 'cookMix': {
      const context = { mageAvailable: options.mageAvailable, stock: options.cookingStock };
      const error = fantasyCookingError(character, action, context);
      if (error) return fail(error);
      const unit = { ...action, repeats: 1 }, repeats = action.repeats ?? 1;
      if (repeats > 1) {
        let completed = profile;
        for (let index = 0; index < repeats; index++) {
          const result = applyFantasyActionUnchecked(completed, unit, rng, {
            ...options, durationHours: fantasyCookingActionHours(unit),
            ...(options.priceHour === undefined ? {} : { priceHour: options.priceHour + index * fantasyCookingActionHours(unit) }),
          });
          if (result.error) {
            if (completed === profile) return fail(result.error);
            addLog(completed, `行動を完了できなかった：${result.error}`, 'system');
            break;
          }
          completed = result.profile;
          addLog(completed, `cooking:repeat:${index + 1}:${repeats}`, 'system');
          if (completed.death || completed.character?.downed || completed.event) break;
        }
        completed.revision = profile.revision + 1;
        return { profile: completed, changed: true };
      }
      advance(fantasyCookingActionHours(unit));
      if (next.death || character.downed || character.hp <= 0) return finish();
      const result = applyFantasyCooking(character, unit, rng, context);
      if (result.error) return fail(result.error);
      practiceSuccess = result.success && !result.harmful;
      for (const text of result.logs) addLog(next, text, practiceSuccess ? 'success' : 'failure');
      return finish();
    }
    case 'campCook': {
      practiceSuccess=true;extraPractice.add('craft');
      if(!validFantasyOutdoorCookingAction(action))return fail('その野外料理はありません。');
      const hours=fantasyOutdoorCookingActionHours(action);advance(hours);
      const result=applyFantasyOutdoorCooking(character,action,{mageAvailable:options.mageAvailable});
      if(!result||result.error)return fail(result?.error??'その野外料理はありません。');
      if(result.log)addLog(next,result.log,'story');
      return finish();
    }
    case 'rankBenefitClaim': case 'rankBenefitReturn': {
      const maximum=fantasyStats(character);
      const result=applyFantasyRankBenefitAction(character,action,{maxHp:maximum.hp,maxMp:maximum.mp,serviceHour:options.priceHour??character.hour});
      if(result.error)return fail(result.error);
      advance(result.hours??0);fatigueRecovery=result.fatigueRecovery??0;
      if(result.message)addLog(next,result.message,'story');
      return finish();
    }
    case 'underworldClaim': return applyFantasyUnderworld(profile,action,{hour:character.hour,realm:'fantasy'});
    case 'rankBookClaim': {
      const error = claimFantasyRankBook(character, action); if (error) return fail(error);
      addLog(next, `rank-book:claimed:${action.skill}`, 'success');
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
      const error = fantasyEquipGear(character, action.item, action.instance, action.slot);
      if (error) return fail(error);
      addLog(next, `${item!.name}を装備した。`, 'system');
      return finish();
    }
    case 'unequip': {
      const legacyItem = character.equipment?.[action.slot];
      migrateFantasyEquipment(character, FANTASY_ITEMS);
      const slot = action.slot === 'accessory' && !legacyItem ? fantasyEquipmentEntries(character,FANTASY_ITEMS).find(entry=>['ring1','ring2','necklace','gloves','head','artifact'].includes(entry.slot))?.slot : fantasyEquipmentSlot(action.slot, legacyItem ? itemOf(legacyItem) : undefined);
      if (!slot || !character.equipment?.[slot]) return fail('その部位には装備がありません。');
      delete character.equipment[slot];
      if (character.equippedGear) delete character.equippedGear[slot];
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
      const book = FANTASY_READABLE_LIBRARY_BOOKS.find(book => book.id === action.book && [...fantasyLibraryHoldings(character),...fantasyTempleLibraryHoldings(character)].includes(book.id));
      if (!book) return fail('この図書館には、その本がありません。');
      if (character.readBooks?.includes(book.id)) return fail('その本はすでに読み終えています。');
      advance(1);
      const learned=learnFantasyMagicBook(character,book.id);
      const runes=learnFantasyCircleBook(character,book.id);if(runes.length)addLog(next,fantasyCircleDiscoveryText(runes,'ja'),'success');
      character.readBooks = [...(character.readBooks ?? []), book.id];
      learnFantasyAlchemyBook(character,book.id);
      if(learned.length)addLog(next,fantasyMagicDiscoveryText(learned,'ja'),'success');
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
      if (!abandonEscort(next)) return fail('受注中の護衛依頼はありません。');
      fantasyTravelAnchor(character);
      return finish();
    }
    case 'travel': {
      if (typeof action.destination !== 'string' || typeof action.transport !== 'string') return fail('目的地と交通手段を選んでください。');
      const transport: FantasyTransport | undefined = options.travel ? {
        id: action.transport, name: fantasyTransportChoices({ ...character, gold: Number.MAX_SAFE_INTEGER, travelPosition: undefined }, action.destination).find(v => v.id === action.transport)?.name ?? action.transport,
        description: '',
        hours: options.durationHours ?? options.travel.legs.reduce((sum, leg) => sum + leg.hours, 0), cost: 0, available: true,
        path: [options.travel.legs[0].from, ...options.travel.legs.map(leg => leg.to)], legs: options.travel.legs,
      } : fantasyTransports(character, action.destination).find(v => v.id === action.transport);
      if (!transport) return fail('その交通手段は利用できません。');
      if (!transport.available) return fail(transport.reason!);
      if (!options.travel && ['gate','escort'].includes(action.transport) && options.durationHours !== undefined && options.durationHours !== transport.hours) return fail('予約された移動時間を確認できません。');
      if (action.transport === 'escort' && options.advanceTime === false && options.durationHours === undefined) return { profile, changed: false };
      const departure = character.location;
      const firstLeg=options.travel?.legs[0];
      const departureCharacter={...profile.character!,gold:Number.MAX_SAFE_INTEGER,location:firstLeg?.from??profile.character!.location,travelPosition:firstLeg?(firstLeg.startFraction===undefined?undefined:{from:firstLeg.from,to:firstLeg.to,fraction:firstLeg.startFraction}):profile.character!.travelPosition};
      const withoutPassive = fantasyTransportChoices(departureCharacter, action.destination, character.buff?.effect === 'travel' ? character.buff.power : 0).find(route => route.id === action.transport);
      if (withoutPassive && withoutPassive.hours > transport.hours) for (const skill of fantasySkills(character).filter(skill => skill.kind === 'passive' && skill.effect === 'travel')) creditSkill(next, skill.id);
      atSea = transport.path.some((id, index) => index > 0 && FANTASY_ROUTES.some(route => route.mode === 'sea' && (route.from === id && route.to === transport.path[index - 1] || route.to === id && route.from === transport.path[index - 1])));
      character.gold -= transport.cost;
      advance(transport.hours);
      character.location = action.destination;
      delete character.travelPosition;
      for (const id of options.travel ? options.travel.legs.map(leg => leg.to) : transport.path) if (!character.visited.includes(id)) character.visited.push(id);
      // 経由地の周辺は霧が晴れる。通過しただけの場所は訪問記録に数えない。
      const scouted = new Set(character.seen ?? []);
      for (const id of transport.path.slice(1, -1)) for (const route of FANTASY_ROUTES) {
        if (route.mode === 'gate') continue;
        for (const other of route.from === id ? [route.to] : route.to === id ? [route.from] : []) if (!character.visited.includes(other) && other !== character.location) scouted.add(other);
      }
      if (scouted.size) character.seen = [...scouted];
      const escortReward = action.transport === 'escort' ? fantasyEscortComplete(character, departure, action.destination) : 0;
      if (character.buff?.effect === 'travel') { if ((fantasyTransports({ ...departureCharacter, buff: null }, action.destination).find(route => route.id === action.transport)?.hours ?? 0) > transport.hours) creditBuff(next, character.buff); character.buff = null; }
      addLog(next, `${transport.name}で${placeOf(action.destination)!.name}へ到着。${options.durationHours ?? transport.hours}時間・金貨${transport.cost}枚。経路：${transport.path.map(id => placeOf(id)!.name).join(' → ')}`, 'story');
      if (escortReward) addLog(next, `護衛を完了し、金貨${escortReward}枚の報酬を受け取った。`, 'success');
      gainXp(next, 2, false);
      return finish();
    }
    case 'rest': {
      const campError = character.dungeon?.active && fantasyDungeonCampError(character);
      if(campError)return fail(campError);
      if(action.watch !== undefined && typeof action.watch !== 'boolean')return fail('操作が正しくありません。');
      advance(8);
      const stats = fantasyStats(character);
      const kit = fantasyCampingKit(character);
      character.hp = Math.min(stats.hp, character.hp + Math.ceil(stats.hp * kit.hp));
      character.mp = Math.min(stats.mp, character.mp + Math.ceil(stats.mp * kit.mp));
      character.buff = null;
      const rotation = action.watch === true && fantasyCampCompanions(character) > 0;
      fatigueRecovery = options.camp ? 0 : Math.floor(Math.max(0, kit.baseFatigue - fantasyCampWeatherLoss(character, character.hour - 8, character.hour)) * (rotation ? .75 : 1));
      const recovered=options.camp?.fatigueRecovered??fatigueRecovery;
      if(options.camp?.watchHours)addLog(next,`交代で見張りをした。担当時間${Number((options.camp.watchHours*.25).toFixed(2))}時間、疲労回復-${recovered}。`,'story');
      addLog(next, recovered === 15 && kit.mp === .15 && kit.riskMultiplier === 1 && !kit.ward ? '8時間の野宿。HPを最大値の20%、MPを15%回復し、疲労を15軽減。一時強化を解除した。費用は無料。' : `野営を終えた。疲労-${recovered}、HP+${Math.round(kit.hp * 100)}%、MP+${Math.round(kit.mp * 100)}%、危険軽減${Math.round((1 - kit.riskMultiplier) * 100)}%。`, 'success');
      const settled = !!FANTASY_SETTLEMENTS[character.location];
      if (!isFantasyRetreat(character.location) && character.location!==FANTASY_FRONTIER_BASE && !options.camp && random(rng) < (settled ? 0.08 : 0.18 + location.danger * 0.04) * kit.riskMultiplier * (rotation ? .35 : 1)) {
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
      const miracle = discoverFantasyMiracle(character, rng()); if (miracle) addLog(next, `miracle:discovered:${miracle}`, 'success');
      const learned=completeFantasyMagicPrayer(character,Math.floor(character.hour/24),rng);
      if(learned.length)addLog(next,fantasyMagicDiscoveryText(learned,'ja'),'success');
      const runes=completeFantasyCirclePrayer(character,Math.floor(character.hour/24),rng);if(runes.length)addLog(next,fantasyCircleDiscoveryText(runes,'ja'),'success');
      addLog(next, `神殿で静かに祈った。司祭の熟練+${prayer.priestXp}、悪名-${prayer.notorietyReduction}。`, 'success');
      return finish();
    }
    case 'templeTreat': {
      const treatment=fantasyTempleTreatment(character,fantasyStats(character).hp);
      if(!treatment.eligible)return fail('神殿の治療には、実際の負傷・病気と治療費が必要です。');
      character.gold-=treatment.cost;character.hp+=treatment.hp;
      character.effects=character.effects?.filter(effect=>!treatment.cures.includes(effect.id));
      advance(treatment.hours);addLog(next,`神殿で治療を受け、金貨${treatment.cost}枚を支払った。`,'success');
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
      if(fantasyIsLifeJob(character.job)){character.lifeJob=character.job;character.job='unassigned';character.jobXp.unassigned??=0;}
      const via = action.via ?? 'guild';
      if (!['guild', 'npc', 'gm'].includes(via) || (via !== 'npc' && action.npcId !== undefined)) return fail('職業を学ぶ方法が正しくありません。');
      if (!canAcquireJob(character, job.id, via, action.npcId)) return fail('この場所・相手・方法では、その職業を学べません。');
      if (fantasyHasJob(character,job.id)) return fail('すでにその職業です。');
      if(fantasyIsLifeJob(job.id))character.lifeJob=job.id;else character.job=job.id;
      grantFantasyCircleBasics(character);
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
        const quantity = Math.min(8, (success ? 2 : 1) + rewardBonus(character, next) + (success?fantasyArtifactEffects(character).gatherYieldBonus:0));
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
      if (target.tier >= 7) return fail('この強敵は通常の狩猟では戦えません。指定された依頼か秘密の地図から挑んでください。');
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
      const success = check(next, 'agility', fantasyFishingDifficulty(character,action.mode), rng, action.mode === 'sea' ? '海釣り' : '桟橋釣り'); practiceSuccess = success;
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
      const selected=action.career==='life'?fantasyLifeJob(character):character.job;
      if(!selected)return fail('生活職業を選んでください。');
      const job = jobOf(selected)!;
      advance(4);
      const success = check(next, job.stat, 11, rng, `${job.name}の仕事`);
      practiceSuccess = success;
      if (job.stat === 'charisma') extraPractice.add('command');
      const wages = (success ? 14 : 5) + rewardBonus(character, next);
      character.gold += wages;
      if (job.category === 'crime') character.notoriety = Math.min(100, (character.notoriety ?? 0) + (success ? 1 : 2));
      const cultivated = ['sunmeadow', 'loom-village'].includes(location.id) || !!FANTASY_SETTLEMENTS[location.id] && location.kind === 'city';
      if (job.id === 'farmer' && cultivated) {
        addItem(character, 'grain', success ? 2 : 1);
        if (success) addItem(character, 'flax');
        addLog(next, `共同の畑で穀物を${success ? 2 : 1}個${success ? 'と亜麻の繊維を1個' : ''}収穫した。私有地は必要ない。`, 'success');
      }
      if (job.id === 'fisher' && (['coast', 'swamp', 'island'].includes(location.kind) || location.services.includes('port'))) {
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
      if(isFantasyRetreat(character.location)){advance(3);addLog(next,location.description,'story');return finish();}
      advance(3);
      const explorationStats: Partial<Record<typeof location.kind, FantasyStat>> = {
        mountain: 'strength', volcano: 'strength', cave: 'vitality', swamp: 'vitality',
        desert: 'vitality', snow: 'vitality', ruin: 'intelligence', tower: 'intelligence', city: 'charisma',
      };
      const success = check(next, explorationStats[location.kind] ?? 'agility', 10 + location.danger, rng, `${location.name}の探索`, true);
      practiceSuccess = success;
      const discovered=success?fantasyFrontierDiscoveryCandidate(character,rng):undefined;
      if(discovered&&check(next,'intelligence',FANTASY_FRONTIER_SITE_DISCOVERY[discovered.id].dc,rng,'隠された入口の捜索',true,'keen-senses')){
        character.dungeon??={sites:{}};character.dungeon.known??=[];character.dungeon.known.push(discovered.id);
        addLog(next,`expedition:discovered:${discovered.id}`,'story');
      }
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
      if (!isFantasyRetreat(character.location) && character.location!==FANTASY_FRONTIER_BASE && character.location === location.id && !FANTASY_SETTLEMENTS[location.id] && !['city', 'tower'].includes(location.kind)
        && !next.event && !next.death && random(rng) < .25) confront(next, 'exploration');
      if (character.location === location.id) maybeEvent(next, rng);
      return finish();
    }
    case 'accept': {
      const quest = FANTASY_QUESTS.find(q => q.id === action.quest);
      if (!quest) return fail('依頼が見つかりません。');
      if (!fantasyQuestEligible(character, quest)) return fail('この依頼の条件をまだ満たしていません。');
      const grant = options.contract;
      if(grant&&!fantasyInstitutionEligible(character,fantasyQuestInstitution(quest)))return fail('この依頼を受ける所属資格がありません。');
      if (action.offer && (!grant || grant.offerId !== action.offer || grant.boardLocation !== character.location || grant.acceptedAt > character.hour || grant.expiresAt <= character.hour)) return fail('依頼掲示の受付情報を確認できません。');
      if (!action.offer && quest.giver !== character.location) return fail('依頼人のいる拠点で受注してください。');
      if (character.quests.includes(quest.id) || character.completed.includes(quest.id)) return fail('その依頼は受注済み、または達成済みです。');
      character.quests.push(quest.id);
      if (fantasyMainTrial(quest.id)) { character.mainTrials ??= {}; character.mainTrials[quest.id] ??= { acceptedAt: character.hour, proofs: [], attempts: 0 }; }
      if (fantasyTaskObjective(quest)&&quest.objective?.type!=='dungeon') { character.taskProgress ??= {}; character.taskProgress[quest.id] = { acceptedAt: character.hour, progress: 0, lastAt: character.hour }; }
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
        if ((character.inventory[quest.item] ?? 0) - fantasyWornItemCount(character,quest.item) < quest.count) return fail('着用中の装備は納品できません。先に装備を外すか、納品する数とは別に1個残してください。');
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
      if(fantasyQuestInstitution(quest)!=='underworld')grantFantasyReputation(character, 6);
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
    case 'commission': {
      const commissioned=applyFantasyCommission(next,action,rng,{...options.commissionContext,startedAt:options.priceHour??character.hour});
      if(commissioned.error)return fail(commissioned.error);
      next=commissioned.profile;advance(3);
      const settled=finish();options.onCommission?.(commissioned);return settled;
    }
    case 'craft': {
      const recipe = FANTASY_RECIPES.find(r => r.id === action.recipe);
      if (!recipe) return fail('製法が見つかりません。');
      if (!fantasyHasJob(character,recipe.job)) return fail('この製法は対応する職業への転職が必要です。');
      const facility = fantasyCraftFacility(recipe.job);
      const propertyWorkshop = action.workshop === `${character.location}-commercial`;
      if (!facility || !propertyWorkshop && !hasBuilding(character, facility)) return fail('この製法に対応する制作設備が現在地にありません。');
      if (!fantasyCanCraft(character, recipe, propertyWorkshop)) return fail('写図を作るには、記載する地域をすべて訪問するか地図に記録してください。');
      const supplies = fantasyCraftInputs(character, recipe, action.material, action.gem);
      if (supplies.error) return fail(supplies.error);
      if (fantasyHasSpoiledIngredients(character, supplies.inputs)) return fail('傷んだ食材は制作に使えません。別の食材を用意してください。');
      const job = jobOf(recipe.job)!;
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
      if (!canBuyItem(character, item.id) || action.building && !fantasyBuildingStock(character,action.building).includes(item.id)) return fail('現在地にはこの品物を扱う店がありません。');
      const count = action.count ?? 1;
      if (!Number.isSafeInteger(count) || count < 1 || count > 99) return fail('購入数が正しくありません。');
      const price = fantasyPrice(character, item.price, 'goods') * count;
      if (character.gold < price) return fail('金貨が足りません。');
      character.gold -= price;
      addItem(character, item.id, count);
      addLog(next, `${item.name}を金貨${price}枚で${count}個購入した。`, 'story');
      return finish();
    }
    case 'use': {
      if (itemOf(action.item)?.category === 'rank-skill-book') {
        const error = readFantasyRankBook(character, action.item); if (error) return fail(error);
        addLog(next, `rank-book:read:${action.item.slice('rank-manual-'.length)}`, 'success');
        return finish();
      }
      const monsterSite = fantasyMonsterSiteForItem(action.item);
      if (monsterSite) {
        if ((character.inventory[action.item] ?? 0) < 1) return fail('その地図を持っていません。');
        if (character.monsterSites?.includes(monsterSite.id)) return fail('この秘密の入口はすでに記録済みです。');
        character.inventory[action.item]--;
        character.monsterSites = [...(character.monsterSites ?? []), monsterSite.id];
        character.charted = [...new Set([...character.charted, monsterSite.location])];
        addLog(next, `魔物の地図［${monsterSite.id}］を読み、秘密の入口を地図に記録した。`, 'system');
        return finish();
      }
      if(itemOf(action.item)?.category?.startsWith('black-market')){
        if(!applyFantasyBlackMarketToken(character,action.item))return fail('この文献から今は新しい知識を得られません。');
        addLog(next,'闇市で得た文献を読み、知識を身につけた。','success');return finish();
      }
      const study = applyFantasyProductionStudy(next, action.item);
      if (study) { if (study.error) return fail(study.error); next = study.profile; next.revision = profile.revision; return finish(); }
      const map = FANTASY_MAPS.find(entry => entry.item === action.item);
      if (map) {
        if ((character.inventory[map.item] ?? 0) < 1) return fail('その地図を持っていません。');
        if (map.locationIds.every(id => character.charted.includes(id) || character.visited.includes(id))) return fail('この地図の地域はすべて記録済みです。');
        character.inventory[map.item]--;
        if(map.dungeon)learnFantasyDungeonMap(character,map.dungeon);
        character.charted = [...new Set([...character.charted, ...map.locationIds])];
        addLog(next, `${map.name.ja}を広げ、地図に地域を記録した。訪問した扱いにはならない。`, 'system');
        return finish();
      }
      const usable = itemOf(action.item);
      if (usable?.foodPenalty) {
        if ((character.inventory[usable.id] ?? 0) < 1) return fail('その品物を持っていません。');
        const penalty = usable.foodPenalty, details = foodDetails(character, usable.id);
        const nutrition = Math.floor((details?.nutrition ?? 0) * (details?.quality === 'spoiled' ? .25 : details?.quality === 'stale' ? .6 : 1));
        character.hunger = boundedNeed(character.hunger - nutrition);
        character.fatigue = boundedNeed(character.fatigue + penalty.fatigue);
        if (penalty.status) addFantasyStatus(character, penalty.status);
        character.inventory[usable.id]--;
        addLog(next, `cooking:eaten:${usable.id}`, 'failure');
        return finish();
      }
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
      if (fantasyCombatOnlySkill(skill.id)) return fail('この技は戦場で使ってください。');
      const utility=applyFantasyWorldUtility(next,skill);
      if(utility?.error||utility&&!utility.changed)return fail(utility.error??'今はこの術を使えません。');
      if (character.mp < skill.mp) return fail('MPが足りません。無料の休息で回復できます。');
      if(skill.restore==='mp'&&(character.mp>=fantasyStats(character).mp||character.manaRecoveryAt!==undefined&&character.hour-character.manaRecoveryAt<6))return fail('魔力回復の準備が整っていないか、MPはすでに満タンです。');
      if (skill.effect === 'heal' && skill.restore!=='mp'&&character.hp >= fantasyStats(character).hp) return fail('HPはすでに満タンです。');
      if (!skill.utility&&skill.effect !== 'heal' && character.buff) return fail('先に現在の強化効果を使ってください。');
      character.mp -= skill.mp;
      if(utility){character.effects=utility.profile.character!.effects;character.utilityPractice=utility.profile.character!.utilityPractice;}
      else if(skill.restore==='mp'){advance(1);character.mp=Math.min(fantasyStats(character).mp,character.mp+skill.power);character.manaRecoveryAt=character.hour;creditSkill(next,skill.id,skill.mp);}
      else if (skill.effect === 'heal') { character.hp = Math.min(fantasyStats(character).hp, character.hp + skill.power); creditSkill(next, skill.id, skill.mp); }
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
      if(next.event===FANTASY_MAP_MERCHANT_EVENT){if(action.choice!=='leave')return fail('行商との行動を選び直してください。');next.event=null;addLog(next,'地図売りに別れを告げた。','system');return finish();}
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
  if(action.type==='underworldClaim')return 0;
  if(action.type==='cookMix')return fantasyCookingActionHours(action);
  if(action.type==='campCook')return fantasyOutdoorCookingActionHours(action);
  if(fantasyRankBenefitHours(action))return fantasyRankBenefitHours(action);
  if (isFantasyInteriorMapAction(action)) return fantasyInteriorMapHours(action);
  const occult=fantasyOccultHours(profile,action);if(occult)return occult;
  const alchemy=fantasyAlchemySynthesisHours(profile,action);if(alchemy)return alchemy;
  if(action.type==='skill'&&profile.character&&fantasySkills(profile.character).some(skill=>skill.id===action.skill&&skill.restore==='mp'))return 1;
  if (!profile.character) return 0;
  switch (action.type) {
    case 'travel': return fantasyTransports(profile.character, action.destination).find(transport => transport.id === action.transport)?.hours ?? 0;
    case 'rest': case 'lodge': return 8;
    case 'eat': return FANTASY_DINING.find(meal => meal.id === action.meal)?.hours ?? .5;
    case 'pray': return .5;
    case 'templeTreat': return .25;
    case 'priestBranch': return fantasyPriestActionHours(action);
    case 'propertyUse': return fantasyPropertyUseHours(action.plot);
    case 'advanceJob': return fantasyJobPathHours();
    case 'investigate': return fantasyMainStage(profile.character, action.quest)?.hours ?? 0;
    case 'job': case 'learn': case 'read': return 1;
    case 'work': return 4;
    case 'explore': case 'craft': case 'commission': return 3;
    case 'event': return profile.event===FANTASY_MAP_MERCHANT_EVENT?0:fantasyHostileEncounter(profile.event) ? .5 : 2;
    case 'gather': return 2;
    case 'hunt': return 3;
    case 'skin': return 1;
    case 'fish': return action.mode === 'sea' ? 4 : 2;
    case 'boat': return 0.25;
    case 'manaTrain': return 0;
    case 'cancel': return 0;
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
export function startFantasyActivity(profile: FantasyProfile, action: FantasyAction, worldHour: number, rng: () => number = Math.random, options: { contract?: FantasyContractGrant; camp?: boolean; mageAvailable?:boolean; cookingStock?:FantasyCookingStock; commissionContext?:FantasyCommissionContext } = {}): FantasyResult {
  const fail = (error: string): FantasyResult => ({ profile, error, changed: false });
  if (!Number.isFinite(worldHour) || worldHour < 0) return fail('世界の時刻を確認できません。');
  if (!action || typeof action !== 'object' || typeof action.type !== 'string') return fail('操作が正しくありません。');
  if (action.type === 'sync') return { profile, changed: false };
  if (fantasyCanChangeTravelGear(profile, action)) {
    const { camp: _, ...gearOptions } = options;
    return applyFantasyAction(profile, action, rng, gearOptions);
  }
  if (profile.activity) return fail('現在の行動が終わるまで、新しい行動は開始できません。');
  const current = structuredClone(profile);
  if (current.character) current.character.hour = Math.max(current.character.hour, worldHour);
  if (action.type === 'cookMix' && current.character) {
    const error = fantasyCookingError(current.character, action, { mageAvailable: options.mageAvailable, stock: options.cookingStock });
    if (error) return fail(error);
  }
  const preview = action.type === 'cookMix' ? { ...action, repeats: 1 } : action;
  const checked = applyFantasyAction(current, preview, () => 0.999, { advanceTime: false, worldHour, mageAvailable:options.mageAvailable, commissionContext:options.commissionContext,
    ...(action.type === 'cookMix' ? { queuedCompletion: true } : {}), cookingStock: options.cookingStock ? structuredClone(options.cookingStock) : undefined,
    ...(options.contract ? { contract: options.contract } : {}) });
  if (checked.error) return fail(checked.error);
  const seed = Math.floor(random(rng) * 4294967296);
  const hours = fantasyActionHours(current, action);
  if (hours <= 0) return applyFantasyAction(current, action, activityRandom(seed), { advanceTime: false, worldHour, mageAvailable:options.mageAvailable, cookingStock:options.cookingStock, ...(options.contract ? { contract: options.contract } : {}) });
  const startedAt = current.character!.hour;
  current.activity = { action: structuredClone(action), startedAt, endsAt: startedAt + hours, seed };
  if (action.type === 'rest' && options.camp) { const fire=lightFantasyCampFire(current.character!,options.mageAvailable);current.activity.camp = {checked:0,watchHours:0,fatigueRecovered:0,fire};addLog(current,fantasyCampFireText(fire,'ja'),'story'); }
  if(action.type==='campCook'||action.type==='cookMix'&&action.station==='outdoor')current.activity.cookingMage=options.mageAvailable===true;
  if (action.type === 'work') current.activity.work = newFantasyWorkProgress();
  if (action.type === 'cookMix' && (action.repeats ?? 1) > 1) current.activity.cooking = { completed: 0 };
  if (action.type === 'travel') {
    const quote = fantasyTransports(current.character!, action.destination).find(route => route.id === action.transport && route.available)!;
    current.activity.travel = { legs: structuredClone(quote.legs!), paid: quote.cost, ambushChecked: 0 };
    current.character!.gold -= quote.cost;
    current.character!.travelPosition = fantasyTravelPosition(current.activity, startedAt);
  }
  current.revision = profile.revision + 1;
  addLog(current, action.type === 'travel' && action.transport === 'escort'
    ? `護衛に出発した。${placeOf(action.destination)!.name}まで${hours}時間。到着後に金貨${current.character!.escort!.reward}枚。`
    : `行動を開始した。完了まで${hours}時間。`, 'system');
  return { profile: current, changed: true };
}

/** 共通時計に追従する。オフラインの待機中は食品だけが経時変化し、進行中の行動は続ける。 */
export function advanceFantasyWorld(profile: FantasyProfile, worldHour: number, options: { accrueIdleNeeds?: boolean; ambush?: boolean; campWatch?: readonly FantasyCampWatchWindow[]; cookingStock?:FantasyCookingStock; commissionContext?:FantasyCommissionContext;onCommission?:(result:FantasyCommissionResult)=>void } = {}): FantasyResult {
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
  if (profile.activity && profile.character && !validFantasyCookingProgress(profile.activity, profile.character)) return { profile, changed: false, error: 'cooking:progress' };
  if(profile.activity?.camp && profile.character && !validFantasyCampProgress(profile.activity,profile.character))return {profile,changed:false,error:'進行中の野営記録を確認できません。'};
  if (!profile.character || worldHour < profile.character.hour || (worldHour === profile.character.hour && (!profile.activity || profile.activity.endsAt > worldHour))) return { profile, changed: false };
  const cooking = profile.activity;
  if (cooking?.action.type === 'cookMix' && cooking.action.storage && !options.cookingStock) {
    const boundary = cooking.cooking ? cooking.startedAt + (cooking.cooking.completed + 1) * fantasyCookingInterval(cooking) : cooking.endsAt;
    if (worldHour + 1e-8 >= boundary) return { profile, changed: false, error: 'cooking:storage' };
  }
  let next = structuredClone(profile);
  if (next.death) { next.character!.hour = worldHour; return { profile: next, changed: true }; }
  if(next.character?.downed){advanceFantasyFoodPreservation(next.character,next.character.hour,worldHour);next.character.hour=worldHour;advanceFantasyDowned(next,worldHour);next.revision++;return {profile:next,changed:true};}
  const target = worldHour;
  let cookingSteps = 0;
  const advanceTo = (end: number, active: boolean): boolean => {
    const character = next.character!;
    const old = character.hour;
    const currentAction = next.activity?.action;
    const resting = active && (currentAction?.type === 'rest' || currentAction?.type === 'lodge' || !!currentAction&&fantasyRankBenefitHours(currentAction)>0
      || currentAction?.type === 'propertyUse' && FANTASY_PROPERTY_PLOTS.some(plot => plot.id === currentAction.plot && plot.kind === 'residence'));
    const accrue = active || options.accrueIdleNeeds === true;
    const recover=(from:number,to:number)=>{const healing=fantasyEffectHealing(character,from,to);if(healing&&character.hp>0&&character.hp<fantasyStats(character).hp){character.hp=Math.min(fantasyStats(character).hp,character.hp+healing);recordFantasyWorldUtilityUse(next,'regen');}};
    if(!accrue)recover(old,end);
    if (accrue) {
      for (let hour = Math.floor(old) + 1; hour <= Math.floor(end); hour++) {
        character.hour = hour;
        recover(hour-1,hour);
        character.hunger = boundedNeed(character.hunger + 2);
        character.fatigue = boundedNeed(character.fatigue + (resting ? 0 : active ? 3 : 1));
        const strain = (character.hunger >= 90 ? 1 : 0) + (active && !resting && character.fatigue >= 95 ? 1 : 0) + fantasyEffectDamage(character, hour - 1, hour);
        if (strain && damage(next, strain, true, false, fantasyActivityAtSea(next))) {
          advanceFantasyFoodPreservation(character,old,character.hour);
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
    advanceFantasyFoodPreservation(character,old,end);
    character.hour = end;
    if(next.activity?.camp)advanceFantasyCamp(character,next.activity,old,end,options.campWatch);
    if (next.activity?.action.type === 'travel' && next.activity.travel) {
      const activity = next.activity;
      character.travelPosition = fantasyTravelPosition(activity, end);
      const passed = fantasyTravelPassed(activity, end);
      for (const id of passed) if (!character.visited.includes(id)) character.visited.push(id);
      const seen = new Set(character.seen ?? []);
      for (const id of passed.filter(id => activity.action.type === 'travel' && id !== activity.action.destination)) for (const route of FANTASY_ROUTES) {
        if (route.mode === 'gate') continue;
        const other = route.from === id ? route.to : route.to === id ? route.from : undefined;
        if (other && !character.visited.includes(other)) seen.add(other);
      }
      if (seen.size) character.seen = [...seen];
      activity.travel!.ambushChecked = Math.max(activity.travel!.ambushChecked, Math.floor((end - (activity.travel!.ambushStartedAt ?? activity.startedAt) + 1e-8) / FANTASY_AMBUSH_SLOT_HOURS));
    }
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
    if (activity.action.type === 'travel' && !activity.travel) {
      const transport = activity.action.transport;
      const quote = fantasyTransports({ ...next.character!, gold: Number.MAX_SAFE_INTEGER }, activity.action.destination).find(quote => quote.id === transport);
      if (quote?.legs?.length) {
        if (next.character!.gold < quote.cost) {
          delete next.activity;
          next.revision++;
          addLog(next, '運賃が足りず、以前の移動予約を中止した。', 'failure');
          break;
        }
        const factor = (activity.endsAt - activity.startedAt) / quote.hours;
        next.character!.gold -= quote.cost;
        activity.travel = { legs: quote.legs.map(leg => ({ ...leg, hours: leg.hours * factor })), paid: quote.cost,
          ambushChecked: Math.max(0, Math.floor((next.character!.hour - activity.startedAt + 1e-8) / FANTASY_AMBUSH_SLOT_HOURS)) };
      }
    }
    // 移動中は実時間10秒ごとに襲撃を抽選する。当たればその場で足を止め、遭遇として扱う。
    if (options.ambush && activity.action.type === 'travel') {
      const ambushStart = activity.travel?.ambushStartedAt ?? activity.startedAt;
      const ambushed = fantasyAmbushHit({ ...activity, startedAt: ambushStart }, Math.min(target, activity.endsAt), Math.max(next.character!.hour, ambushStart + (activity.travel?.ambushChecked ?? 0) * FANTASY_AMBUSH_SLOT_HOURS));
      const merchant=fantasyMapMerchantHit(activity,Math.min(target,activity.endsAt),Math.max(next.character!.hour,ambushStart+(activity.travel?.ambushChecked??0)*FANTASY_AMBUSH_SLOT_HOURS));
      if(merchant&&(!ambushed||merchant.hour<ambushed.hour)){
        if(advanceTo(merchant.hour,true))continue;
        delete next.activity;next.event=FANTASY_MAP_MERCHANT_EVENT;next.revision++;
        addLog(next,'街道で、地図を広げる行商に出会った。','story');break;
      }
      if (ambushed) {
        if (advanceTo(ambushed.hour, true)) continue;
        // 護衛の隊列は荷ごと狙われるため、契約の馬車を守る戦闘へ引き継ぐ専用の遭遇にする。
        const escort = activity.action.transport === 'escort';
        delete next.activity;
        next.revision++;
        addLog(next, escort ? '護送中の隊列が襲撃を受け、足を止めた。' : '移動中に襲撃を受け、足を止めた。', 'failure');
        confront(next, escort ? 'escort-ambush' : 'travel-ambush');
        break;
      }
    }
    if(activity.action.type==='rest'&&activity.camp){
      const hit=options.ambush?fantasyCampAmbushHit(activity,next.character!,placeOf(next.character!.location)?.danger??1,Math.min(target,activity.endsAt),options.campWatch):undefined;
      if(hit){
        if(advanceTo(hit.hour,true))continue;
        if(fantasyCampingKit(next.character!).ward&&fantasySpendItem(next.character!,'ward-seal',1)){addLog(next,'野営の結界符が襲撃を防ぎ、1枚燃え尽きた。','success');next.revision++;if(hit.hour<target)continue;break;}
        delete next.activity;next.revision++;
        const kind=placeOf(next.character!.location)!.kind;
        next.event=fantasyEncounterFor(kind==='city'?'forest':kind,'travel-ambush',false).id;
        addLog(next,'野営中に魔物が現れ、休息を中断した。','failure');break;
      }
    }
    const nextWork = activity.action.type === 'work' && activity.work ? activity.startedAt + (activity.work.completed + 1) * fantasyWorkInterval(activity) : undefined;
    const nextCooking = activity.action.type === 'cookMix' && activity.cooking ? activity.startedAt + (activity.cooking.completed + 1) * fantasyCookingInterval(activity) : undefined;
    const end = Math.min(target, activity.endsAt, nextWork ?? Infinity, nextCooking ?? Infinity);
    if (advanceTo(end, true)) continue;
    if (nextCooking !== undefined && end + 1e-8 >= nextCooking && activity.action.type === 'cookMix' && activity.cooking) {
      const index = activity.cooking.completed, interval = fantasyCookingInterval(activity), unit = { ...activity.action, repeats: 1 };
      delete next.activity;
      const completed = applyFantasyAction(next, unit, activityRandom(index === 0 ? activity.seed : (activity.seed ^ Math.imul(index + 1, 0x9e3779b1)) >>> 0), {
        advanceTime: false, queuedCompletion: true, worldHour: end, durationHours: interval, priceHour: activity.startedAt + index * interval,
        mageAvailable: activity.cookingMage, cookingStock: options.cookingStock,
      });
      if (completed.error) { next.revision++; addLog(next, `行動を完了できなかった。${completed.error}`, 'failure'); }
      else {
        next = completed.profile; activity.cooking.completed++;
        addLog(next, `cooking:repeat:${activity.cooking.completed}:${activity.action.repeats}`, 'system');
        if (activity.cooking.completed < activity.action.repeats! && !next.death && !next.character!.downed && !next.event) next.activity = activity;
      }
      if (++cookingSteps >= 128 && next.activity?.cooking) break;
      continue;
    }
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
      advanceTime: false, queuedCompletion: true, worldHour: end, durationHours: activity.endsAt - activity.startedAt, priceHour: activity.startedAt, travel: activity.travel, camp:activity.camp,mageAvailable:activity.cookingMage,cookingStock:options.cookingStock,commissionContext:options.commissionContext,onCommission:options.onCommission,
    });
    if (completed.error) {
      next.revision++;
      addLog(next, `行動を完了できなかった。${completed.error}`, 'failure');
    } else {
      next = completed.profile;
    }
  }
  return { profile: fantasyEscrowBagOverflow(profile, next), changed: true };
}
import { fantasyBodyCombatSkills } from './fantasy-body-combat.ts';
