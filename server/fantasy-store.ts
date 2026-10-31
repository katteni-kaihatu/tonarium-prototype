import { fantasySeaPosition } from '../shared/fantasy-sea.ts';
import { setupFantasyNavalCombat, ensureFantasyNavalSkills, fantasyNavalAuxiliary, FANTASY_NAVAL_HARPOON } from '../shared/fantasy-naval.ts';
import { migrateFantasyEquipmentResources } from '../shared/fantasy-equipment-migration.ts';
import { fantasyExpeditionRuinReward, fantasyExpeditionTravelError, validFantasyExpedition } from '../shared/fantasy-expedition.ts';
import { FANTASY_EQUIPMENT_SLOTS, migrateFantasyEquipment } from '../shared/fantasy-equipment-slots.ts';
import { applyFantasyUnderworld, creditFantasyUnderworldCompletion, fantasyUnderworldActionValid, validFantasyUnderworld } from '../shared/fantasy-underworld.ts';
import { enrollFantasyPartyContract, refreshFantasyPartyContract, markFantasyPartyContractParticipation, settleFantasyPartyContract, reconcileFantasyPartyContracts, validFantasyPartyContracts, type FantasyPartyContractSnapshot } from './fantasy-party-contracts.ts';
import { recordFantasyClergyCombatService } from './fantasy-clergy-service.ts';
import { fantasyTempleLibraryHoldings } from '../shared/fantasy-town.ts';
import { FANTASY_BAGS } from '../shared/fantasy-bag-catalog.ts';
import { validFantasyFoodPreservation } from '../shared/fantasy-food-preservation.ts';
import { isFantasyRetreat, fantasyRetreatCampSnapshot, fantasyCompleteRetreatCamp, validFantasyRetreatMemory, validFantasyRetreatCampSnapshot, type FantasyRetreatParticipant } from '../shared/fantasy-retreats.ts';
import { validFantasyOutdoorCookingAction } from '../shared/fantasy-outdoor-cooking.ts';
import { validFantasyCookingAction, fantasyCookingActionHours } from '../shared/fantasy-cooking.ts';
import { validFantasyCookingProgress, fantasyCookingInterval } from '../shared/fantasy-cooking-progress.ts';
import { fantasyCookingWarehouse } from './fantasy-cooking-warehouse.ts';
import { FANTASY_COMPANIONS, fantasyActiveCompanions } from '../shared/fantasy-specializations.ts';
import { fantasyRankBenefitActionValid, validFantasyRankBenefits } from '../shared/fantasy-rank-benefits.ts';
import { fantasyRankBookActionValid, validFantasyRankBookRewards } from '../shared/fantasy-rank-rewards.ts';
import { fantasyInnAvailability } from '../shared/fantasy-inn.ts';
import { validFantasyGuildProgress } from '../shared/fantasy-guild-progression.ts';
import { recordFantasyGuildCompletions } from './fantasy-guild-progression.ts';
import { fantasyRegularEncounterTier } from '../shared/fantasy-adventurer.ts';
import { FANTASY_MONSTER_SITES } from '../shared/fantasy-monster-sites.ts';
import { FANTASY_CONTRACT_DEADLINE_HOURS, type FantasyContractOffer } from '../shared/fantasy-contracts.ts';
import { assessFantasyGuildProfile } from './fantasy-guild-assessment.ts';
import { transferFantasyCombatCarry } from './fantasy-combat-carry-transfer.ts';
import { processFantasyCarryReturn, advanceFantasyCarryReturn, type FantasyCarryReturnContext } from './fantasy-carry-and-return.ts';
import { validFantasyCarryReturn, type FantasyCarryReturnMethod } from '../shared/fantasy-carry-return.ts';
import { validFantasyMiracleKnowledge, validFantasyLastDawnPledge } from '../shared/fantasy-miracles.ts';
import { FANTASY_MIRACLE_IDS } from '../shared/fantasy-miracle-catalog.ts';
import { refreshFantasyMiracleAwakening } from '../shared/fantasy-miracle-combat.ts';
import { fantasyJobHpMultiplier } from '../shared/fantasy-job-balance.ts';
import { validFantasyEmployeeCompanies } from '../shared/fantasy-business.ts';
import { isFantasyInteriorMapAction, validFantasyInteriorMaps, fantasyInteriorMapCraftError } from '../shared/fantasy-interior-maps.ts';
import { newFantasyRankingLedger, reconcileFantasyRanking, publicFantasyRanking, validFantasyRankingLedger, validFantasyRankingNickname, type FantasyRankingLedger, type FantasyRankingRow } from '../shared/fantasy-ranking.ts';
import fs from 'node:fs';
import path from 'node:path';
import { createHash, randomUUID } from 'node:crypto';
import type { FantasyAction, FantasyCharacter, FantasyProfile, FantasyResult, FantasyLegacyRecord } from '../shared/fantasy.ts';
import { advanceFantasyWorld, applyFantasyAction, fantasyActionHours, fantasyStats, fantasyUnscaledMaxHp, fantasyTransports, fantasyTravelRedirectQuote, newFantasyProfile, startFantasyActivity } from '../shared/fantasy-engine.ts';
import { FANTASY_EVENTS, FANTASY_ITEMS, FANTASY_JOBS, FANTASY_LOCATIONS, FANTASY_QUESTS, FANTASY_RACES, FANTASY_RECIPES } from '../shared/fantasy-data.ts';
import { FANTASY_FOOD_META, migrateFantasyLife } from '../shared/fantasy-life.ts';
import { FANTASY_MAPS, fantasyBuildings } from '../shared/fantasy-town.ts';
import { fantasyEventEligible, fantasyQuestRecordEligible } from '../shared/fantasy-access.ts';
import { LEGACY_PRIEST_EVENTS } from '../shared/fantasy-priest.ts';
import { validFantasyItemState } from '../shared/fantasy-effects.ts';
import { validFantasyReputation } from '../shared/fantasy-reputation.ts';
import { validFantasyApprenticeship, fantasyApprenticeshipError } from '../shared/fantasy-apprenticeship.ts';
import { validFantasyMana } from '../shared/fantasy-mana.ts';
import { validFantasyProgression } from '../shared/fantasy-progression.ts';
import { validFantasyGear } from '../shared/fantasy-equipment.ts';
import { validFantasyFishing } from '../shared/fantasy-gathering.ts';
import { validFantasyLifeProfile } from '../shared/fantasy-mortality.ts';
import { validFantasySpecialization, FANTASY_MAGIC_ELEMENTS, FANTASY_MAGIC_FORMS, FANTASY_ALCHEMY_FORMULAS } from '../shared/fantasy-specializations.ts';
import { FANTASY_LIBRARY_BOOKS } from '../shared/fantasy-library.ts';
import { validFantasyProductionClaims } from '../shared/fantasy-production-expansion.ts';
import { fantasyLibraryHoldings } from '../shared/fantasy-town.ts';
import { validFantasyOutfit } from '../shared/fantasy-environment.ts';
import { validFantasyBirth } from '../shared/fantasy-birth.ts';
import { validFantasyPrayer } from '../shared/fantasy-prayer.ts';
import { fantasyWorkInterval, fantasyWorkSteps, validFantasyWorkProgress } from '../shared/fantasy-work.ts';
import { fantasyPersonalQuest, type FantasyContractGrant } from '../shared/fantasy-contracts.ts';
import { NPC_PUBLIC, type NpcLocale } from '../shared/npc.ts';
import { resetFantasyTestLife } from './fantasy-test-reset.ts';
import { fantasyMainInvestigationError, fantasyMainStage, validFantasyMainTrials } from '../shared/fantasy-main-trials.ts';
import { validFantasyTaskProgress } from '../shared/fantasy-task-progress.ts';
import { fantasyEscortTransportError, validFantasyEscort } from '../shared/fantasy-escort.ts';
import { FANTASY_ESCORT_AMBUSH_ENCOUNTER, fantasyEncounterFor, fantasyHostileEncounter } from '../shared/fantasy-encounters.ts';
import { fantasyCampCompanions, fantasyCampTogether, validFantasyCampProgress, type FantasyCampWatchWindow } from '../shared/fantasy-camping.ts';
import { fantasyAmbushHit } from '../shared/fantasy-ambush.ts';
import { fantasyOnRoad, fantasyTravelPartyPace, fantasyTravelPosition, fantasyTravelContinuation, validFantasyTravel } from '../shared/fantasy-travel.ts';
import { FANTASY_GATE_HOURS, fantasyHasGate } from '../shared/fantasy-gates.ts';
import { FANTASY_VOYAGE_FINAL_QUEST, validFantasyVoyageEnding } from '../shared/fantasy-voyage-ending.ts';
import { FANTASY_PARTY_MAX_MEMBERS, type FantasyPartyError } from '../shared/fantasy-party.ts';
import { validFantasyVoyageDecisions } from '../shared/fantasy-voyage-decisions.ts';
import { advanceFantasyCombat, createFantasyCombat, addFantasyCombatParticipant, submitFantasyCombatOrder, validFantasyCombatState, type FantasyCombatState, type FantasyCombatOrder, type FantasyCombatResult } from '../shared/fantasy-combat.ts';
import { fantasyCombatPlayer, fantasyCombatSupplies, fantasyCombatProfessionUsesCombat, fantasyCombatApplyCompanions } from './fantasy-combat-adapter.ts';
import { fantasyCombatStartError, fantasyCombatStartPlan, fantasyCombatWarningError, validFantasyCombatProgress, fantasyCombatChallengeIsCrime, grantFantasyFrontierHuntLoot } from '../shared/fantasy-combat-challenges.ts';
import { fantasyCombatEnemy } from '../shared/fantasy-combat-catalog.ts';
import { fantasyRescueTown, recordFantasyDeath } from '../shared/fantasy-mortality.ts';
import { fantasyCompanionRescue } from '../shared/fantasy-specializations.ts';
import { reconcileFoodLots } from '../shared/fantasy-life.ts';
import type { FantasyCombatStartKind } from '../shared/protocol.ts';
import { FANTASY_MONSTERS } from '../shared/fantasy-monsters.ts';
import { grantFantasyPractice, fantasyPracticeMultiplier } from '../shared/fantasy-progression.ts';
import { fantasyManaOnUse } from '../shared/fantasy-mana.ts';
import { grantFantasyReputation } from '../shared/fantasy-reputation.ts';
import { fantasyPartyRewardEligibility } from '../shared/fantasy-party-balance.ts';
import { addFantasyStatus } from '../shared/fantasy-effects.ts';
import { newFantasyPropertyLedger, normalizeFantasyPropertyLedger, validFantasyPropertyLedger, validFantasyPropertyTitles, reconcileFantasyProperties, applyFantasyPropertyCommand, fantasyPropertyState, isFantasyPropertyCommand, type FantasyPropertyLedger, type FantasyPropertyError } from '../shared/fantasy-property.ts';
import { applyFantasyPartyVault, returnFantasyPartyDeposits, newFantasyPartyVault, validFantasyPartyVaults, type FantasyPartyVaults, type FantasyPartyVaultCommand, type FantasyPartyVaultContext } from '../shared/fantasy-party-vault.ts';
import { newFantasyEconomyLedger, validFantasyEconomyLedger, closeFantasyEconomyTrades, isFantasyEconomyCommand, applyFantasyEconomyCommand, fantasyEconomyState, fantasyEconomyText, type FantasyEconomyLedger } from '../shared/fantasy-economy.ts';
import { newFantasyBlackMarketLedger, validFantasyBlackMarketLedger, validFantasyBlackMarketClues, advanceFantasyBlackMarket, applyFantasyBlackMarket, fantasyBlackMarketActionValid, fantasyBlackMarketState, type FantasyBlackMarketLedger } from '../shared/fantasy-black-market.ts';
import { newFantasyCivicLedger, validFantasyCivicLedger, advanceFantasyCivics, isFantasyCivicCommand, applyFantasyCivicCommand, fantasyCivicState, fantasyCivicActionBlock, fantasyCivicServiceMultiplier, type FantasyCivicLedger } from '../shared/fantasy-civics.ts';
import { advanceFantasyProperties, fantasyPropertyCanUse, applyFantasyPropertyImprovement } from '../shared/fantasy-property.ts';
import type { FantasyRealmContext } from '../shared/fantasy-realm.ts';
import { validFantasyPriestGrowth } from '../shared/fantasy-priest-growth.ts';
import { FANTASY_JOB_PATHS, validFantasyJobPaths } from '../shared/fantasy-job-paths.ts';
import { fantasyCohortActivityMatches, shareFantasyInvestigationProofs, validFantasyCohorts, validFantasyQuestEligibility, validFantasyDungeonEligibility, type FantasyCohort, type FantasyTravelCohort, type FantasyPartyGroupContext, type FantasyQuestEligibility, type FantasyDungeonEligibility } from './fantasy-party-cohorts.ts';
import { applyFantasyDungeonAction, isFantasyDungeonAction, markFantasyDungeonVictory, shareFantasyDungeonFinding, validFantasyDungeon, type FantasyDungeonAction } from '../shared/fantasy-dungeon.ts';
import { validFantasyMagicKnowledge } from '../shared/fantasy-magic-discovery.ts';
import {validFantasyCircleKnowledge,validFantasyCircleShape} from '../shared/fantasy-magic-circle.ts';
import {validFantasyOccult,fantasyOccultActionValid} from '../shared/fantasy-occult.ts';
import {beginFantasyDowned,advanceFantasyDowned,validFantasyDowned,stabilizeFantasyDowned,wakeFantasyDowned} from '../shared/fantasy-downed.ts';
import {validFantasyUtilityPractice} from '../shared/fantasy-world-utilities.ts';
import {fantasyAlchemyComposeValid} from '../shared/fantasy-alchemy-synthesis.ts';
import {validAlchemyKnowledge} from '../shared/fantasy-alchemy-discovery.ts';
import {alignFantasyDungeonLayout} from '../shared/fantasy-dungeon-party-layout.ts';
import {fantasyBagActionValid,validFantasyBag,fantasyBagChangeError,validFantasyPendingLoot,fantasyEscrowBagOverflow} from '../shared/fantasy-bags.ts';
import { fantasyMapMerchantHit, FANTASY_MAP_MERCHANT_EVENT } from '../shared/fantasy-map-merchant.ts';
import { fantasyIsLifeJob, fantasyHasJob, fantasyLifeJob } from '../shared/fantasy-careers.ts';
import { fantasyCommissionRecipeAllowed, type FantasyCommissionContext, type FantasyCommissionResult } from '../shared/fantasy-commissions.ts';

const object = (value: unknown): value is Record<string, unknown> => value !== null && typeof value === 'object' && !Array.isArray(value);
const count = (value: unknown): value is number => typeof value === 'number' && Number.isSafeInteger(value) && value >= 0;
const id = (value: unknown): value is string => typeof value === 'string' && /^[a-z0-9][a-z0-9-]{0,79}$/.test(value);
const strings = (value: unknown): value is string[] => Array.isArray(value) && value.every((entry) => typeof entry === 'string');
const amounts = (value: unknown) => object(value) && Object.values(value).every(count);
const activityEnvelope = (value: unknown): value is FantasyProfile['activity'] & {} => object(value) && [4,5,6,7,8,9,10].includes(Object.keys(value).length)
  && Object.keys(value).every(key => ['action','seed','startedAt','endsAt','work','travel','camp','cookingMage','retreatCamp','cooking'].includes(key))
  && isFantasyAction(value.action) && (value.cookingMage===undefined||(value.action.type==='campCook'||value.action.type==='cookMix'&&value.action.station==='outdoor')&&typeof value.cookingMage==='boolean')
  && (value.retreatCamp===undefined||value.action.type==='rest'&&validFantasyRetreatCampSnapshot(value.retreatCamp)&&value.retreatCamp.startedAt===value.startedAt) && count(value.seed) && value.seed <= 0xffffffff
  && typeof value.startedAt === 'number' && Number.isFinite(value.startedAt) && value.startedAt >= 0
  && typeof value.endsAt === 'number' && Number.isFinite(value.endsAt) && value.endsAt > value.startedAt
  && value.endsAt - value.startedAt <= 100_000
  && (value.work === undefined || (value.action.type === 'work' && validFantasyWorkProgress(value.work) && value.work.completed < fantasyWorkSteps(value.work) && value.endsAt - value.startedAt === 4));

function migrateFantasyProfile(value: unknown): unknown {
  if (!object(value) || value.version !== 1) return value;
  const draft = object(value.draft) ? { ...value.draft,
    candidate: value.draft.candidate === 'titan' ? 'human' : value.draft.candidate,
    kept: value.draft.kept === 'titan' ? 'human' : value.draft.kept,
  } : value.draft;
  let character = object(value.character) ? migrateFantasyLife(value.character as unknown as FantasyCharacter) : value.character;
  if (object(character) && character.magicBags === undefined) {
    const legacyBag = character.bag;
    if (FANTASY_BAGS.some(bag => bag.id === legacyBag && bag.kind === 'magic')) { const migratedBag: Record<string, unknown> = { ...character, magicBags: [legacyBag] }; delete migratedBag.bag; character = migratedBag; }
  }
  if (object(character) && object(character.jobXp) && Object.hasOwn(character.jobXp, 'healer')
    && count(character.jobXp.healer) && (character.jobXp.priest === undefined || count(character.jobXp.priest))) {
    const priestXp = character.jobXp.healer + (character.jobXp.priest ?? 0);
    if (Number.isSafeInteger(priestXp)) {
      const jobXp: Record<string, unknown> = { ...character.jobXp, priest: priestXp };
      delete jobXp.healer;
      character = { ...character, job: character.job === 'healer' ? 'priest' : character.job, jobXp };
    }
  }
  if (object(character) && count(character.level) && character.level >= 1 && object(character.jobXp)
    && count(character.hp) && count(character.mp) && Array.isArray(character.effects) && character.effects.length
    && validFantasyItemState(character as unknown as FantasyCharacter, FANTASY_ITEMS)) {
    const current = character as unknown as FantasyCharacter;
    if (current.effects!.some(effect => effect.expiresAt <= current.hour)) {
      const earlier = { ...current, effects: current.effects!.map(effect => ({ ...effect, expiresAt: Math.max(effect.expiresAt, current.hour + 1) })) };
      const earlierStats = fantasyStats(earlier);
      if (current.hp <= earlierStats.hp && current.mp <= earlierStats.mp) {
        const expired = { ...current, effects: current.effects!.filter(effect => effect.expiresAt > current.hour) };
        const maximum = fantasyStats(expired);
        character = { ...expired, hp: Math.min(expired.hp, maximum.hp), mp: Math.min(expired.mp, maximum.mp) };
      }
    }
  }
  if (object(character) && character.race === 'titan' && count(character.level) && character.level >= 1
    && count(character.hp) && count(character.mp) && object(character.jobXp)) {
    const human = { ...character, race: 'human' } as unknown as FantasyCharacter;
    const stats = fantasyStats(human);
    // 旧種族の上限を超えた破損値は移行で隠さない。
    if (character.hp <= stats.hp + 148 && character.mp <= Math.max(5, stats.mp - 29)) {
      character = { ...human, hp: Math.min(human.hp, stats.hp), mp: Math.min(human.mp, stats.mp) };
    }
  }
  const event = typeof value.event === 'string' && Object.hasOwn(LEGACY_PRIEST_EVENTS, value.event) ? LEGACY_PRIEST_EVENTS[value.event] : value.event;
  let activity = value.activity;
  if (object(activity) && object(activity.action) && activity.action.type === 'job' && activity.action.job === 'healer') {
    activity = { ...activity, action: { ...activity.action, job: 'priest' } };
  }
  if (object(character)) { const migratedEquipment=structuredClone(character) as unknown as FantasyCharacter; if(migratedEquipment.equipmentVersion===undefined){migrateFantasyEquipmentResources(migratedEquipment);migratedEquipment.equipmentVersion=1;} migrateFantasyEquipment(migratedEquipment,FANTASY_ITEMS);character=migratedEquipment; }
  const migrated: Record<string, unknown> = { ...value, draft, character, event, ...(activity === undefined ? {} : { activity }) };
  // 廃止された予約だけを解除する。予約時点では報酬や資源を適用していない。
  if (activityEnvelope(activity) && activity.action.type === 'manaTrain' && object(character)
    && typeof character.hour === 'number' && activity.startedAt <= character.hour) delete migrated.activity;
  if (activityEnvelope(activity) && activity.action.type === 'travel' && activity.action.transport === 'gate'
    && activity.endsAt - activity.startedAt === 1 && object(character) && typeof character.hour === 'number'
    && activity.startedAt <= character.hour && character.hour <= activity.endsAt
    && typeof character.location === 'string' && FANTASY_LOCATIONS.some(place => place.id === (character as Record<string, unknown>).location)
    && FANTASY_LOCATIONS.some(place => activity.action.type === 'travel' && place.id === activity.action.destination)
    && Array.isArray(migrated.log) && migrated.log.every(entry => object(entry) && count(entry.id)
      && typeof entry.hour === 'number' && Number.isFinite(entry.hour) && entry.hour >= 0 && typeof entry.text === 'string'
      && ['story', 'success', 'failure', 'system'].includes(String(entry.kind)))) {
    // 旧仕様の一時間予約だけを識別し、新しい不正な予約を移行で隠さない。
    delete migrated.activity;
    const nextId = Math.max(0, ...(migrated.log as FantasyProfile['log']).map(entry => entry.id)) + 1;
    migrated.log = [...migrated.log, { id: nextId, hour: character.hour, text: '旧仕様の転移予約を解除した。位置・金貨・所持品は変更していない。', kind: 'system' }].slice(-80);
    if (count(migrated.revision) && migrated.revision < Number.MAX_SAFE_INTEGER) migrated.revision++;
  }
  if (activityEnvelope(activity) && activity.action.type === 'investigate' && activity.action.quest === FANTASY_VOYAGE_FINAL_QUEST
    && activity.endsAt - activity.startedAt === .5 && object(character) && typeof character.hour === 'number'
    && activity.startedAt <= character.hour && character.hour <= activity.endsAt
    && Array.isArray(character.quests) && character.quests.includes(FANTASY_VOYAGE_FINAL_QUEST)
    && Array.isArray(character.completed) && !character.completed.includes(FANTASY_VOYAGE_FINAL_QUEST)
    && validFantasyMainTrials(character as unknown as FantasyCharacter) && Array.isArray(migrated.log)) {
    const record = (character as unknown as FantasyCharacter).mainTrials?.[FANTASY_VOYAGE_FINAL_QUEST];
    const step = record?.proofs.length ?? 0;
    // 移設前の最終章の予約だけを取り消し、確定済みの手掛かりは残す。
    if (step < 3 && character.location === (step === 2 ? 'rockshade' : 'sunloom')
      && activity.startedAt >= (record?.proofs.at(-1)?.hour ?? record?.acceptedAt ?? 0)
      && migrated.log.every(entry => object(entry) && count(entry.id) && typeof entry.hour === 'number' && Number.isFinite(entry.hour) && entry.hour >= 0
        && typeof entry.text === 'string' && ['story', 'success', 'failure', 'system'].includes(String(entry.kind)))) {
      delete migrated.activity;
      const nextId = Math.max(0, ...(migrated.log as FantasyProfile['log']).map(entry => entry.id)) + 1;
      migrated.log = [...migrated.log, { id: nextId, hour: character.hour, text: '旧航海調査の予約を解除した。確かめた手掛かりと所持品は保たれている。', kind: 'system' }].slice(-80);
      if (count(migrated.revision) && migrated.revision < Number.MAX_SAFE_INTEGER) migrated.revision++;
    }
  }
  if (object(character) && character.jobHpVersion === undefined && count(character.hp) && typeof character.job === 'string' && FANTASY_JOBS.some(job => job.id === (character as Record<string, unknown>).job)) {
    try {
      const current = character as unknown as FantasyCharacter;
      const historical: Readonly<Record<string, number>> = { pugilist: 1.3, knight: 1.35, shieldbearer: 1.45 };
      const multiplier = Math.max(1, historical[current.job] ?? 1, fantasyJobHpMultiplier(current.job));
      const legacyMaximum = Math.max(20, Math.round(fantasyUnscaledMaxHp(current) * multiplier));
      // Only plausible legacy HP migrates. A modern or oversized corrupt value must remain rejectable.
      if (current.hp <= legacyMaximum) { character = { ...current, hp: Math.min(current.hp, fantasyStats(current).hp), jobHpVersion: 1 }; migrated.character = character; }
    } catch { /* Invalid saved shapes are rejected below. */ }
  }
  if (object(character) && typeof character.job === 'string' && fantasyIsLifeJob(character.job) && character.lifeJob === undefined
    && object(character.jobXp) && count(character.jobXp[character.job]) && count(character.hp) && count(character.mp)) {
    try {
      const current = character as unknown as FantasyCharacter;
      const priorMaximum = fantasyStats(current);
      if (current.jobHpVersion === 1 && current.hp <= priorMaximum.hp && current.mp <= priorMaximum.mp) {
        const separated = { ...current, lifeJob: current.job, job: 'unassigned', jobXp: { ...current.jobXp, unassigned: current.jobXp.unassigned ?? 0 } };
        const maximum = fantasyStats(separated);
        character = { ...separated, hp: Math.min(current.hp, maximum.hp), mp: Math.min(current.mp, maximum.mp) };
        migrated.character = character;
        if (object(migrated.activity) && object(migrated.activity.action) && migrated.activity.action.type === 'work' && migrated.activity.action.career === undefined) {
          migrated.activity = { ...migrated.activity, action: { ...migrated.activity.action, career: 'life' } };
        }
      }
    } catch { /* Invalid legacy states stay rejectable. */ }
  }
  return migrated;
}

export function isFantasyAction(value: unknown): value is FantasyAction {
  if(fantasyUnderworldActionValid(value))return true;
  if(fantasyRankBookActionValid(value)||fantasyRankBenefitActionValid(value)||validFantasyOutdoorCookingAction(value)||validFantasyCookingAction(value))return true;
  if(fantasyAlchemyComposeValid(value)||fantasyBagActionValid(value))return true;
  if(fantasyOccultActionValid(value))return true;
  if (isFantasyDungeonAction(value) || isFantasyInteriorMapAction(value)) return true;
  if (!object(value) || typeof value.type !== 'string') return false;
  const keys = (...fields: string[]) => Object.keys(value).length === fields.length + 1 && fields.every((field) => Object.hasOwn(value, field));
  const optionalKeys = (required: string[], optional: string[]) => required.every(key => Object.hasOwn(value, key))
    && Object.keys(value).every(key => key === 'type' || required.includes(key) || optional.includes(key));
  switch (value.type) {
    case 'guildAssess': case 'sync': case 'draw': case 'keep': case 'skip': case 'explore': case 'skin': case 'rebirth': case 'pray': case 'templeTreat': case 'escortAbandon': case 'finishVoyage': case 'cancel':
      return keys();
    case 'work': return optionalKeys([], ['career']) && (value.career === undefined || value.career === 'combat' || value.career === 'life');
    case 'guildRaidStart':return keys('offer')&&id(value.offer);
    case 'rest': return optionalKeys([], ['watch']) && (value.watch === undefined || typeof value.watch === 'boolean');
    case 'hunt': return optionalKeys([], ['monster']) && (value.monster === undefined || id(value.monster));
    case 'wear': return keys('item') && id(value.item);
    case 'terrain': return keys('activity') && id(value.activity);
    case 'gather': return keys('resource') && ['herbs', 'wood', 'minerals', 'gems'].includes(String(value.resource));
    case 'fish': return keys('mode') && ['pier', 'sea'].includes(String(value.mode));
    case 'boat': return keys('mode') && ['rent', 'buy'].includes(String(value.mode));
    case 'propertyUse': return keys('plot') && id(value.plot);
    case 'commission': return optionalKeys(['recipe'], ['npcId', 'workerId', 'material', 'gem']) && id(value.recipe)
      && (Object.hasOwn(value, 'npcId') !== Object.hasOwn(value, 'workerId'))
      && (value.npcId === undefined || id(value.npcId)) && (value.workerId === undefined || id(value.workerId))
      && (value.npcId !== undefined || value.workerId !== undefined)
      && (value.material === undefined || id(value.material)) && (value.gem === undefined || id(value.gem));
    case 'priestVow': return keys('quest') && id(value.quest);
    case 'priestReleaseVow': return keys();
    case 'miraclePrepare': return keys('miracles') && Array.isArray(value.miracles) && value.miracles.length <= 3 && new Set(value.miracles).size === value.miracles.length && value.miracles.every(id => (FANTASY_MIRACLE_IDS as readonly unknown[]).includes(id));
    case 'priestBranch': return keys('branch') && ['care', 'ward', 'oath', 'pilgrim','inquisitor','paladin','saint'].includes(String(value.branch));
    case 'downedCare':return keys('method')&&['potion','temple'].includes(String(value.method));
    case 'magicCompose':return keys('slot','core','runes')&&count(value.slot)&&value.slot>=1&&value.slot<=3&&validFantasyCircleShape({core:value.core,runes:value.runes});
    case 'advanceJob': return keys('path') && id(value.path) && FANTASY_JOB_PATHS.some(path => path.id === value.path);
    case 'read': return keys('book') && id(value.book);
    case 'command': return optionalKeys(['kind', 'operation'], ['member'])
      && ['troop', 'syndicate', 'summons'].includes(String(value.kind))
      && ['hire', 'assign', 'dismiss', 'mission', 'recover', 'recontract'].includes(String(value.operation))
      && (value.member === undefined || id(value.member));
    case 'magicPrepare': return keys('slot', 'element', 'form') && count(value.slot) && value.slot >= 1 && value.slot <= 3
      && FANTASY_MAGIC_ELEMENTS.some(entry => entry.id === value.element) && FANTASY_MAGIC_FORMS.some(entry => entry.id === value.form);
    case 'magicCast': return keys('slot') && count(value.slot) && value.slot >= 1 && value.slot <= 3;
    case 'alchemy': return keys('formula') && FANTASY_ALCHEMY_FORMULAS.some(entry => entry.id === value.formula);
    case 'create':
      return (keys('name', 'gender', 'source') || keys('name', 'gender', 'source', 'job')) && typeof value.name === 'string' && value.name.trim().length > 0
        && [...value.name].length <= 24 && !/[\u0000-\u001f\u007f]/.test(value.name)
        && (value.gender === 'male' || value.gender === 'female')
        && (value.source === 'human' || value.source === 'candidate' || value.source === 'kept') && (value.job === undefined || id(value.job));
    case 'travel': return keys('destination', 'transport') && id(value.destination) && id(value.transport);
    case 'redirect': return optionalKeys(['destination'], ['transport']) && id(value.destination) && (value.transport === undefined || id(value.transport));
    case 'escortAccept': return keys('destination') && id(value.destination);
    case 'job':
      return Object.keys(value).every(key => ['type', 'job', 'via', 'npcId'].includes(key)) && id(value.job)
        && (value.via === undefined || typeof value.via === 'string' && ['guild', 'npc', 'gm'].includes(value.via))
        && (value.npcId === undefined || id(value.npcId));
    case 'accept': return optionalKeys(['quest'], ['offer']) && id(value.quest) && (value.offer === undefined || id(value.offer));
    case 'complete': case 'abandon': return keys('quest') && id(value.quest);
    case 'investigate': return keys('quest', 'approach') && id(value.quest) && ['observe', 'analyze', 'restore'].includes(String(value.approach));
    case 'voyageDecision': return keys('decision', 'choice') && id(value.decision) && id(value.choice);
    case 'craft': return optionalKeys(['recipe'], ['material', 'gem', 'workshop']) && id(value.recipe) && (value.workshop === undefined || id(value.workshop) && value.workshop.endsWith('-commercial'))
      && (value.material === undefined || id(value.material)) && (value.gem === undefined || id(value.gem));
    case 'sell': return optionalKeys(['item'], ['instance', 'quality']) && id(value.item) && (value.instance === undefined || id(value.instance))
      && (value.quality === undefined || ['fresh', 'stale', 'spoiled'].includes(String(value.quality))) && !(value.instance !== undefined && value.quality !== undefined);
    case 'expeditionJoin': return keys('route') && ['guild','smuggler'].includes(String(value.route));
    case 'equip': return optionalKeys(['item'], ['instance','slot']) && id(value.item) && (value.instance === undefined || id(value.instance)) && (value.slot === undefined || [...FANTASY_EQUIPMENT_SLOTS,'armor','accessory'].includes(value.slot as never));
    case 'buy': return optionalKeys(['item'],['count','building']) && id(value.item) && (value.count === undefined || count(value.count) && value.count >= 1 && value.count <= 99) && (value.building === undefined || ['market','blacksmith','alchemist','tower','inn','restaurant','library','guild','shipyard','temple','archaeology'].includes(String(value.building)));
    case 'use': return keys('item') && id(value.item);
    case 'unequip': return keys('slot') && typeof value.slot === 'string' && [...FANTASY_EQUIPMENT_SLOTS,'armor','accessory'].includes(value.slot as never);
    case 'haggle': return keys('service') && typeof value.service === 'string' && ['room', 'food', 'goods'].includes(value.service);
    case 'manaTrain': return keys('exercise') && typeof value.exercise === 'string' && ['sense', 'circulate', 'shape', 'release', 'refine'].includes(value.exercise);
    case 'learn': return keys('skill', 'npcId') && id(value.skill) && id(value.npcId);
    case 'skill': return keys('skill') && id(value.skill);
    case 'event': return keys('choice') && id(value.choice);
    case 'lodge': return keys('room') && typeof value.room === 'string' && ['common', 'private', 'suite'].includes(value.room);
    case 'eat': return keys('meal') && typeof value.meal === 'string' && ['simple', 'hearty', 'feast'].includes(value.meal);
    default: return false;
  }
}

function isProfile(value: unknown): value is FantasyProfile {
  if (!object(value) || value.version !== 1 || !count(value.revision) || !object(value.draft)
    || !count(value.draft.remaining) || value.draft.remaining > 5
    || !(value.draft.candidate === null || id(value.draft.candidate)) || !(value.draft.kept === null || id(value.draft.kept))
    || !(value.event === null || id(value.event)) || !Array.isArray(value.log) || value.combatId !== undefined && !id(value.combatId)) return false;
  if (!value.log.every((entry) => object(entry) && count(entry.id) && typeof entry.hour === 'number' && Number.isFinite(entry.hour) && entry.hour >= 0
    && typeof entry.text === 'string' && ['story', 'success', 'failure', 'system'].includes(String(entry.kind)))) return false;
  if ([value.draft.candidate, value.draft.kept].some(race => race !== null && !FANTASY_RACES.some(r => r.id === race))) return false;
  if (value.draft.remaining === 5 && (value.draft.candidate !== null || value.draft.kept !== null)) return false;
  if (!validFantasyLifeProfile(value as unknown as FantasyProfile)) return false;
  if (value.character === null) return value.event === null && value.activity === undefined;
  const c = value.character;
  if (!(object(c) && typeof c.name === 'string' && c.name.trim().length > 0 && [...c.name].length <= 24 && !/[\u0000-\u001f\u007f]/.test(c.name)
    && id(c.race) && ['male', 'female', 'none'].includes(String(c.gender)) && id(c.job)
    && count(c.level) && c.level >= 1 && count(c.xp) && count(c.gold) && count(c.hp) && count(c.mp) && id(c.location)
    && typeof c.hour === 'number' && Number.isFinite(c.hour) && c.hour >= 0
    && count(c.fatigue) && c.fatigue <= 100 && count(c.hunger) && c.hunger <= 100
    && strings(c.charted) && (c.seen === undefined || strings(c.seen) && new Set(c.seen).size === c.seen.length && c.seen.every(id => FANTASY_LOCATIONS.some(place => place.id === id))) && Array.isArray(c.foodLots)
    && amounts(c.inventory) && strings(c.quests) && strings(c.completed) && strings(c.visited) && amounts(c.jobXp)
    && (c.buff === null || (object(c.buff) && (c.buff.effect === 'travel' ? typeof c.buff.power === 'number' && Number.isFinite(c.buff.power) && c.buff.power > 0 && c.buff.power <= 1_000_000 : count(c.buff.power) && c.buff.power > 0)
      && ['check', 'guard', 'reward', 'travel'].includes(String(c.buff.effect))
      && (c.buff.stat === undefined || ['strength', 'agility', 'intelligence', 'luck', 'vitality', 'dexterity', 'charisma'].includes(String(c.buff.stat))))))) return false;
  const character = c as unknown as FantasyCharacter;
  if (!validFantasyExpedition(character) || character.equipmentVersion !== undefined && character.equipmentVersion !== 1) return false;
  if (character.jobHpVersion !== undefined && character.jobHpVersion !== 1) return false;
  if (character.lifeJob !== undefined && (typeof character.lifeJob !== 'string' || !fantasyIsLifeJob(character.lifeJob) || !Object.hasOwn(character.jobXp, character.lifeJob))) return false;
  if (!validFantasyProductionClaims(character)) return false;
  if(!validFantasyBag(character)||!validFantasyPendingLoot(character)||!validFantasyBlackMarketClues(character))return false;
  if(!validFantasyUtilityPractice(character)||!validAlchemyKnowledge(character))return false;
  if(character.manaRecoveryAt!==undefined&&(!Number.isFinite(character.manaRecoveryAt)||character.manaRecoveryAt<0||character.manaRecoveryAt>character.hour))return false;
  if (!validFantasyDungeon(character) || !validFantasyMagicKnowledge(character)||!validFantasyCircleKnowledge(character)||!validFantasyOccult(character)||!validFantasyDowned(value as unknown as FantasyProfile)) return false;
  if (!validFantasyTravel(character, value.activity as FantasyProfile['activity'])) return false;
  if (!validFantasyItemState(character, FANTASY_ITEMS) || !validFantasyReputation(character)
    || !validFantasyApprenticeship(character) || !validFantasyMana(character) || !validFantasyProgression(character)
    || !validFantasyGear(character) || !validFantasyFishing(character) || !validFantasySpecialization(character) || !validFantasyOutfit(character)
    || !validFantasyBirth(character) || !validFantasyPrayer(character) || !validFantasyMainTrials(character) || !validFantasyTaskProgress(character) || !validFantasyEscort(character) || !validFantasyVoyageEnding(character) || !validFantasyVoyageDecisions(character) || !validFantasyCombatProgress(character) || !validFantasyPropertyTitles(character) || !validFantasyInteriorMaps(character) || !validFantasyPriestGrowth(character) || !validFantasyMiracleKnowledge(character) || !validFantasyLastDawnPledge(character) || !validFantasyCarryReturn(character) || character.soulAfflictions !== undefined && (!Array.isArray(character.soulAfflictions) || new Set(character.soulAfflictions).size !== character.soulAfflictions.length || character.soulAfflictions.length > 3 || character.soulAfflictions.some(id => !['curse','possession','soul-binding'].includes(id)))) return false;
  if (character.contracts !== undefined && (!object(character.contracts) || Object.entries(character.contracts).some(([questId, grant]) => {
    const quest = FANTASY_QUESTS.find(quest => quest.id === questId);
    return !quest || fantasyPersonalQuest(quest) || !character.quests.includes(questId) || !object(grant) || !['offerId','issuer','boardLocation','acceptedAt','expiresAt','progress','gold'].every(key=>Object.hasOwn(grant,key)) || Object.keys(grant).some(key=>!['offerId','issuer','boardLocation','acceptedAt','expiresAt','progress','gold','grade','startsAt','startedAt','monster','enemyCount'].includes(key)) || !id(grant.offerId) || !id(grant.issuer)
      || !NPC_PUBLIC.some(npc => npc.id === grant.issuer && npc.homeLocation === quest.giver)
      || !FANTASY_LOCATIONS.some(place => place.id === grant.boardLocation) || !fantasyBuildings({ location: grant.boardLocation }).some(building => building.id === 'guild')
      || typeof grant.acceptedAt !== 'number' || !Number.isFinite(grant.acceptedAt) || grant.acceptedAt < 0 || grant.acceptedAt > character.hour
      || typeof grant.expiresAt !== 'number' || !Number.isFinite(grant.expiresAt) || grant.expiresAt <= grant.acceptedAt
      || !count(grant.progress) || grant.progress > (quest.objective?.type === 'hunt' ? quest.objective.count : 0)
      || !count(grant.gold) || grant.gold > Math.ceil(quest.gold * 1.5)
      || grant.grade!==undefined&&(!count(grant.grade)||grant.grade<1||grant.grade>8)
      || grant.startsAt!==undefined&&(typeof grant.startsAt!=='number'||!Number.isFinite(grant.startsAt)||grant.startsAt<0)
      || grant.startedAt!==undefined&&(typeof grant.startedAt!=='number'||!Number.isFinite(grant.startedAt)||grant.startsAt===undefined||grant.startedAt<grant.startsAt)
      || grant.monster!==undefined&&(quest.objective?.type!=='hunt'||grant.monster!==quest.objective.monster||!fantasyCombatEnemy(grant.monster)||fantasyCombatEnemy(grant.monster)!.tier>8)
      || grant.enemyCount!==undefined&&(!count(grant.enemyCount)||grant.enemyCount<1||grant.enemyCount>6);
  }))) return false;
  if(character.encounterTier!==undefined&&(!count(character.encounterTier)||character.encounterTier<1||character.encounterTier>6))return false;
  if(character.monsterSites!==undefined&&(!Array.isArray(character.monsterSites)||character.monsterSites.length>FANTASY_MONSTER_SITES.length||new Set(character.monsterSites).size!==character.monsterSites.length||character.monsterSites.some(site=>!FANTASY_MONSTER_SITES.some(entry=>entry.id===site))))return false;
  if(character.retreatMemories!==undefined&&(!Array.isArray(character.retreatMemories)||character.retreatMemories.length>64||character.retreatMemories.some(memory=>!validFantasyRetreatMemory(memory)||memory.generation!==(value.generation??1)||memory.hour>character.hour)||new Set(character.retreatMemories.map(memory=>memory.id)).size!==character.retreatMemories.length))return false;
  if(!validFantasyUnderworld(character)||!validFantasyPartyContracts(character))return false;
  if(!validFantasyRankBookRewards(character)||!validFantasyRankBenefits(character.rankBenefits,character.hour))return false;
  if(character.guildProgress!==undefined&&!validFantasyGuildProgress(character.guildProgress))return false;
  if(character.guildAssessment!==undefined){const a=character.guildAssessment;if(!object(a)||Object.keys(a).length!==3||!count(a.grade)||a.grade<1||a.grade>8||!count(a.score)||a.score>1e9||typeof a.assessedAt!=='number'||!Number.isFinite(a.assessedAt)||a.assessedAt<0||a.assessedAt>character.hour)return false;}
  const race = FANTASY_RACES.find(r => r.id === character.race);
  if (!validFantasyJobPaths(character)) return false;
  if (!race || !FANTASY_JOBS.some(job => job.id === character.job) || !FANTASY_LOCATIONS.some(place => place.id === character.location)) return false;
  if (race.gender ? character.gender !== race.gender : character.gender === 'none') return false;
  const knownList = (values: string[], ids: { id: string }[]) => new Set(values).size === values.length && values.every(entry => ids.some(item => item.id === entry));
  if (!knownList(character.quests, FANTASY_QUESTS) || !knownList(character.completed, FANTASY_QUESTS)
    || character.quests.some(quest => character.completed.includes(quest)) || !knownList(character.visited, FANTASY_LOCATIONS)
    || !knownList(character.charted, FANTASY_LOCATIONS) || !character.visited.includes(character.location)) return false;
  if ([...character.quests, ...character.completed].some(id => !fantasyQuestRecordEligible(character, FANTASY_QUESTS.find(quest => quest.id === id)!))) return false;
  if (!Object.keys(character.inventory).every(item => FANTASY_ITEMS.some(i => i.id === item) || FANTASY_MAPS.some(map => map.item === item))
    || !Object.keys(character.jobXp).every(job => FANTASY_JOBS.some(j => j.id === job)) || !Object.hasOwn(character.jobXp, character.job)) return false;
  const stats = fantasyStats(character);
  if (character.hp > stats.hp || character.mp > stats.mp) return false;
  const lotIds = new Set<string>();
  const foodCounts = new Map<string, number>();
  for (const lot of character.foodLots) {
    if (!object(lot) || typeof lot.id !== 'string' || !lot.id.trim() || lot.id.length > 120 || /[\u0000-\u001f\u007f]/.test(lot.id)
      || lotIds.has(lot.id) || !FANTASY_FOOD_META.some(food => food.item === lot.item) || !count(lot.count) || lot.count <= 0
      || typeof lot.createdAt !== 'number' || !Number.isFinite(lot.createdAt) || lot.createdAt < 0 || lot.createdAt > character.hour || !validFantasyFoodPreservation(lot,character.hour)) return false;
    lotIds.add(lot.id);
    const total = (foodCounts.get(lot.item) ?? 0) + lot.count;
    if (!Number.isSafeInteger(total)) return false;
    foodCounts.set(lot.item, total);
  }
  if (FANTASY_FOOD_META.some(food => (foodCounts.get(food.item) ?? 0) !== (character.inventory[food.item] ?? 0))) return false;
  if (value.event !== null && !FANTASY_EVENTS.some(event => event.id === value.event && fantasyEventEligible(character, event))) return false;
  if (value.activity !== undefined) {
    const activity = value.activity;
    if (!activityEnvelope(activity)
      || !['cookMix','campCook','rankBenefitClaim','travel', 'rest', 'lodge', 'eat', 'pray', 'work', 'explore', 'craft', 'commission', 'skill', 'job', 'event', 'learn', 'haggle', 'gather', 'hunt', 'skin', 'fish', 'boat', 'read', 'command', 'magicPrepare', 'magicCompose', 'alchemyCompose', 'occultObserve', 'occultRelic', 'alchemy', 'terrain', 'investigate', 'propertyUse', 'interiorMapCraft', 'priestBranch', 'advanceJob'].includes(activity.action.type)
      || activity.startedAt > character.hour) return false;
    if(!validFantasyCampProgress(activity,character)||!validFantasyCookingProgress(activity,character))return false;
    if (activity.work && (activity.startedAt + activity.work.completed * fantasyWorkInterval(activity) > character.hour + 1e-8
      || activity.startedAt + (activity.work.completed + 1) * fantasyWorkInterval(activity) < character.hour - 1e-8)) return false;
    const action = activity.action;
    if (action.type === 'work' && action.career === 'life' && !fantasyLifeJob(character)) return false;
    if (action.type === 'cookMix' && (Math.abs(activity.endsAt - activity.startedAt - fantasyCookingActionHours(action)) > 1e-8 || !!action.workshop && action.workshop !== `${character.location}-commercial`)
      || action.type === 'interiorMapCraft' && (!!fantasyInteriorMapCraftError(character, action.site) || activity.endsAt - activity.startedAt !== 3)
      || action.type === 'investigate' && (!!fantasyMainInvestigationError(character, action) || activity.endsAt - activity.startedAt !== .5
        || activity.startedAt + 1e-8 < (character.mainTrials?.[action.quest]?.proofs.at(-1)?.hour ?? character.mainTrials?.[action.quest]?.acceptedAt ?? 0))
      || action.type === 'travel' && (!FANTASY_LOCATIONS.some(place => place.id === action.destination) || !['foot', 'carriage', 'ship', 'working-ship', 'airship', 'gate', 'escort'].includes(action.transport)
        || action.transport === 'gate' && (!fantasyHasGate(character.location) || !fantasyHasGate(action.destination) || character.location === action.destination || Math.abs(activity.endsAt - activity.startedAt - FANTASY_GATE_HOURS*(1-(activity.travel?.legs[0]?.startFraction??0)))>1e-8)
        || action.transport === 'escort' && (!!fantasyEscortTransportError(character, action.destination) || !activity.travel && activity.endsAt - activity.startedAt !== character.escort?.hours || activity.startedAt < character.escort!.acceptedAt))
      || action.type === 'job' && (!FANTASY_JOBS.some(job => job.id === action.job && job.category !== 'none') || fantasyHasJob(character, action.job))
      || action.type === 'craft' && (!FANTASY_RECIPES.some(recipe => recipe.id === action.recipe && fantasyHasJob(character, recipe.job)) || !!action.workshop && action.workshop !== `${character.location}-commercial`)
      || action.type === 'commission' && (!FANTASY_RECIPES.some(recipe => recipe.id === action.recipe && fantasyCommissionRecipeAllowed(recipe)) || activity.endsAt - activity.startedAt !== 3)
      || action.type === 'learn' && !!fantasyApprenticeshipError(character, action.npcId, action.skill)
      || action.type === 'read' && (!FANTASY_LIBRARY_BOOKS.some(book => book.id === action.book && book.inGame !== false) || ![...fantasyLibraryHoldings(character),...fantasyTempleLibraryHoldings(character)].includes(action.book))
      || action.type === 'event' && !FANTASY_EVENTS.some(event => event.id === value.event && event.choices.some(choice => choice.id === action.choice))) return false;
    // An authoritative saved travel receipt owns its schedule. Requoting from a midpoint
    // would reject passengers on sea, airborne and gate legs that cannot be boarded there.
    if (!(action.type === 'travel' && activity.travel) && fantasyActionHours(value as unknown as FantasyProfile, action) <= 0) return false;
  }
  return true;
}

function saveAtomic(file: string, data: string) {
  fs.mkdirSync(path.dirname(file), { recursive: true });
  const temporary = `${file}.${randomUUID()}.tmp`;
  try {
    fs.writeFileSync(temporary, data, { encoding: 'utf8', flag: 'wx' });
    fs.renameSync(temporary, file);
  } finally {
    try { fs.unlinkSync(temporary); } catch (error) { if ((error as NodeJS.ErrnoException).code !== 'ENOENT') throw error; }
  }
}

interface StoreOptions {
  save?: (file: string, data: string) => void;
  onError?: (error: unknown) => void;
  now?: () => number;
  worldHour?: () => number;
  clockError?: () => string | undefined;
  combatEnabled?: boolean;
  /** 実際のサーバーだけが移動・野営中の襲撃抽選を有効にする。テストは決定的なまま。 */
  ambush?: boolean;
}
export interface FantasyGroupInvestigationPlan {
  user: string; quest: string; approach: 'observe' | 'analyze' | 'restore'; generation: number; location: string; stage: 'field' | 'verify' | 'compare';
}
export interface FantasyGroupInvestigationResult { updates: { user: string; profile: FantasyProfile }[]; error?: FantasyPartyError }
export interface FantasyGroupTravelPlan { user: string; generation: number; location: string; destination: string; transport: string; quotedCost?: number; quotedHours?: number; quotedAt?: number; activitySeed?: number; activityStartedAt?: number }
export interface FantasyGroupDungeonPlan { user: string; generation: number; location: string; site?: string; room?: string; action: FantasyDungeonAction }
export interface FantasyCombatPlan { user: string; generation: number; location: string; session: string; source: FantasyCombatStartKind; target: string; confirm?: boolean }
export interface FantasyCombatStoreResult { updates: { user: string; profile: FantasyProfile }[]; state?: FantasyCombatState; error?: string }
interface StoredCombat { expeditionSeed?: string; state: FantasyCombatState; session: string; victoryKey?: string; eligible?: FantasyQuestEligibility[]; dungeonEligible?: FantasyDungeonEligibility[]; party?: string }

export class FantasyStore {
  private profiles = new Map<string, FantasyProfile>();
  private rankings: FantasyRankingLedger = newFantasyRankingLedger();
  private combats = new Map<string, StoredCombat>();
  private cohorts: FantasyCohort[] = [];
  private savedPartyState: unknown;
  private deferPartySave = false;
  private properties: FantasyPropertyLedger = newFantasyPropertyLedger();
  private vaults: FantasyPartyVaults = {};
  private economy: FantasyEconomyLedger = newFantasyEconomyLedger();
  private blackMarket: FantasyBlackMarketLedger = newFantasyBlackMarketLedger();
  private civics: FantasyCivicLedger = newFantasyCivicLedger();
  private combatEnabled: boolean;
  private ambushEnabled: boolean;
  private limits = new Map<string, { at: number; count: number }>();
  private save: (file: string, data: string) => void;
  private onError: (error: unknown) => void;
  private now: () => number;
  private worldHour?: () => number;
  private clockError: () => string | undefined;
  private onlineUsers = new Set<string>();
  readonly loadError: string | undefined;

  constructor(private file: string, options: StoreOptions = {}) {
    this.save = options.save ?? saveAtomic;
    this.onError = options.onError ?? ((error) => console.error('[fantasy] save/load failed', error));
    this.now = options.now ?? Date.now;
    this.worldHour = options.worldHour;
    this.clockError = options.clockError ?? (() => undefined);
    this.combatEnabled = options.combatEnabled === true;
    this.ambushEnabled = options.ambush === true;
    try {
      const saved: unknown = JSON.parse(fs.readFileSync(file, 'utf8'));
      if (!object(saved)) throw new Error('Invalid fantasy save');
      const envelope = saved.version === 2 && object(saved.profiles) && object(saved.combats);
      const profileData = envelope ? saved.profiles as Record<string, unknown> : saved;
      if (envelope && Object.keys(saved).some(key => !['version', 'profiles', 'combats', 'properties', 'vaults', 'economy', 'civics', 'cohorts', 'partyState', 'blackMarket', 'rankings'].includes(key))) throw new Error('Invalid fantasy save');
      if (envelope && saved.rankings !== undefined) {
        if (!validFantasyRankingLedger(saved.rankings)) throw new Error('Invalid ranking save');
        this.rankings = saved.rankings;
      }
      if (envelope && saved.blackMarket !== undefined) {
        if (!validFantasyBlackMarketLedger(saved.blackMarket)) throw new Error('Invalid black market save');
        this.blackMarket = saved.blackMarket;
      }
      if (envelope && saved.cohorts !== undefined) {
        if (!validFantasyCohorts(saved.cohorts)) throw new Error('Invalid party activities');
        this.cohorts = saved.cohorts;
      }
      if (envelope) this.savedPartyState = saved.partyState;
      if (envelope && saved.properties !== undefined) {
        const properties = normalizeFantasyPropertyLedger(saved.properties);
        if (!properties) throw new Error('Invalid property save');
        this.properties = properties;
      }
      if (envelope && saved.vaults !== undefined) {
        if (!validFantasyPartyVaults(saved.vaults)) throw new Error('Invalid shared supplies');
        this.vaults = saved.vaults;
      }
      if (envelope && saved.economy !== undefined) {
        if (!validFantasyEconomyLedger(saved.economy)) throw new Error('Invalid economy save');
        this.economy = closeFantasyEconomyTrades(saved.economy);
      }
      if (envelope && saved.civics !== undefined) {
        if (!validFantasyCivicLedger(saved.civics)) throw new Error('Invalid civic save');
        this.civics = saved.civics;
      }
      const upgraded = Object.fromEntries(Object.entries(profileData).map(([user, value]) => [user, this.enableCombat(migrateFantasyProfile(value))]));
      if (!Object.values(upgraded).every(isProfile)) throw new Error('Invalid fantasy save');
      if (envelope) {
        for (const [id, record] of Object.entries(saved.combats as Record<string, unknown>)) {
          if (!object(record) || Object.keys(record).some(key => !['state', 'session', 'victoryKey', 'eligible', 'dungeonEligible', 'party', 'expeditionSeed'].includes(key)) || record.expeditionSeed !== undefined && (typeof record.expeditionSeed !== 'string' || !/^[a-f0-9-]{36}$/.test(record.expeditionSeed)) || typeof record.session !== 'string' || !record.session
            || !validFantasyCombatState(record.state) || record.state.id !== id || record.victoryKey !== undefined && typeof record.victoryKey !== 'string'
            || record.eligible !== undefined && !validFantasyQuestEligibility(record.eligible) || record.dungeonEligible !== undefined && !validFantasyDungeonEligibility(record.dungeonEligible) || record.party !== undefined && typeof record.party !== 'string') throw new Error('Invalid combat save');
          const restoredCombat={...record,...(record.state.source.startsWith('dungeon:frontier-')&&record.expeditionSeed===undefined?{expeditionSeed:randomUUID()}:{})};
          this.combats.set(id, restoredCombat as unknown as StoredCombat);
        }
      }
      for (const [user, profile] of Object.entries(upgraded) as [string, FantasyProfile][]) if (profile.combatId) {
        const battle = this.combats.get(profile.combatId)?.state, fighter = battle?.fighters.find(fighter => fighter.userId === user && fighter.generation === (profile.generation ?? 1));
        if(fighter&&fighter.hp>0&&profile.character?.carrying&&!fighter.carrying&&!fighter.externalCarrying)fighter.externalCarrying={user:profile.character.carrying.target,generation:profile.character.carrying.targetGeneration};
        const raw=profileData[user],rawCharacter=object(raw)&&object(raw.character)?raw.character:undefined;
        if(battle&&fighter&&profile.character&&rawCharacter?.hp===fighter.hp&&rawCharacter.mp===fighter.mp&&fighter.stats.hp!==fantasyStats(profile.character).hp){
          if (profile.death || profile.character.downed || profile.character.hp <= 0) {
            const maximum = fantasyStats(profile.character);
            fighter.stats = { ...fighter.stats, hp: maximum.hp, mp: maximum.mp };
            fighter.hp = 0; fighter.mp = Math.min(fighter.mp, profile.character.mp, maximum.mp);
          } else {
            const fresh=fantasyCombatPlayer(profile,user);fighter.stats=fresh.stats;fighter.skills=fresh.skills;ensureFantasyNavalSkills(battle,fighter);fighter.hp=profile.character.hp;fighter.mp=profile.character.mp;
            battle.orders={};if(battle.unitOrders)battle.unitOrders={};if(battle.escort){delete battle.escort.order;delete battle.escort.orderedBy;}
          }
          battle.revision++;
        }
        if (!battle || battle.status !== 'active' || !fighter || fighter.fled || fighter.hp <= 0&&!profile.character?.downed || profile.death || profile.character?.location !== battle.location
          || profile.character.hp !== fighter.hp || profile.character.mp !== fighter.mp) throw new Error('Missing active combat');
      }
      for (const record of this.combats.values()) if (record.state.status === 'active') for (const fighter of record.state.fighters) if (fighter.userId && !fighter.fled) {
        const profile = upgraded[fighter.userId] as FantasyProfile | undefined;
        if (fighter.hp <= 0 && profile?.death) continue;
        if (!profile || (profile.generation ?? 1) !== fighter.generation || profile.combatId !== record.state.id) throw new Error('Missing combat participant');
      }
      this.profiles = new Map(Object.entries(upgraded) as [string, FantasyProfile][]);
      if (!validFantasyEmployeeCompanies(this.properties, Object.fromEntries(this.profiles))) throw new Error('Invalid employee company ownership');
      for (const [user, profile] of this.profiles) {
        const c = profile.character; if (!c || profile.death) continue;
        const titles = [...(reconcileFantasyProperties(this.properties, Object.fromEntries(this.profiles)).profiles[user].character?.propertyTitles ?? [])].sort();
        if (JSON.stringify(titles) !== JSON.stringify([...(c.propertyTitles ?? [])].sort())) throw new Error('Property title does not match the world ledger');
        if (profile.activity?.action.type === 'propertyUse') {
          const plot = this.properties.plots[profile.activity.action.plot];
          if (!plot || !titles.includes(profile.activity.action.plot) || plot.listing) throw new Error('Invalid property activity');
        }
      }
      if (this.savedPartyState === undefined) {
        const returned = returnFantasyPartyDeposits(this.vaults, this.profiles);
        this.vaults = returned.vaults; this.profiles = returned.profiles;
      }
      const normalized = reconcileFantasyProperties(this.properties, Object.fromEntries(this.profiles));
      this.properties = normalized.ledger; this.profiles = new Map(Object.entries(normalized.profiles));
      // 移行の保存に失敗しても既存の進行を表示し、操作だけを止める。
      const rankings = reconcileFantasyRanking(this.rankings, this.profiles);
      const serialized = this.serialize(this.profiles, this.combats, this.properties, this.vaults, this.economy, this.civics, this.cohorts, this.savedPartyState, this.blackMarket, rankings);
      let comparison = serialized;
      if (!envelope || saved.rankings === undefined) {
        comparison = this.serialize(this.profiles, this.combats, this.properties, this.vaults, this.economy, this.civics, this.cohorts, this.savedPartyState, this.blackMarket, newFantasyRankingLedger());
        const normalized = JSON.parse(comparison);
        if (envelope && normalized.version !== 2) comparison = JSON.stringify({ version: 2, profiles: normalized, combats: {} });
      }
      if (envelope && object(saved.properties) && object(saved.properties.plots)) {
        const comparable = JSON.parse(comparison);
        if (comparable.properties?.plots) for (const id of Object.keys(comparable.properties.plots)) if (!Object.hasOwn(saved.properties.plots, id)) delete comparable.properties.plots[id];
        comparison = JSON.stringify(comparable);
      }
      if (JSON.stringify(saved) !== comparison) this.save(this.file, serialized);
      this.rankings = rankings;
    } catch (error) {
      if ((error as NodeJS.ErrnoException).code !== 'ENOENT') {
        this.loadError = '冒険記録を読み込めません。保存データを管理者に確認してください。';
        this.onError(error);
      }
    }
  }

  private expeditionProfile(profile: FantasyProfile): FantasyProfile {
    const rated=structuredClone(profile),c=rated.character;
    if(c&&!rated.death){const preview=structuredClone(rated);preview.character!.hp=Math.max(1,c.hp);delete preview.character!.downed;const actor=fantasyCombatPlayer(preview,'expedition-rating');c.encounterTier=fantasyRegularEncounterTier(actor.stats,actor);}
    return rated;
  }
  private expeditionPassengerError(profile: FantasyProfile,destination:string,transport:string):string|undefined {
    const carry=profile.character?.carrying;if(!carry)return;
    const patient=this.profiles.get(carry.target);if(!patient?.character)return;
    const position=profile.character?.travelPosition,other=patient.character.travelPosition,continuation=position&&fantasyTravelContinuation(position);
    if(continuation&&position!.fraction>1e-8&&destination===position!.to&&transport===continuation.transport&&other&&JSON.stringify(position)===JSON.stringify(other))return;
    const boarding=structuredClone(patient);boarding.character!.hour=Math.max(boarding.character!.hour,profile.character?.hour??0);
    return fantasyExpeditionTravelError(this.expeditionProfile(boarding).character!,destination,transport);
  }
  private enableCombat(value: unknown): unknown {
    if (!this.combatEnabled || !object(value) || !object(value.character)) return value;
    if (value.activity && object(value.activity) && object(value.activity.action)) {
      const action = value.activity.action;
      if (action.type === 'investigate') return value;
      if (action.type === 'hunt' && FANTASY_MONSTERS.some(monster => monster.id === action.monster && monster.tier >= 7)) {
        const copy = { ...value }; delete copy.activity;
        return { ...copy, revision: typeof copy.revision === 'number' ? copy.revision + 1 : copy.revision, character: { ...value.character, combatStoryVersion: 1 } };
      }
    }
    const enabled={...value,character:{...value.character,combatStoryVersion:1}};
    if(isProfile(enabled) && !enabled.death && enabled.character.hp > 0 && !enabled.character.downed){const actor=fantasyCombatPlayer(enabled,'encounter-rating');enabled.character.encounterTier=fantasyRegularEncounterTier(actor.stats,actor);}
    return enabled;
  }

  private serialize(profiles: ReadonlyMap<string, FantasyProfile>, combats: ReadonlyMap<string, StoredCombat> = this.combats, properties = this.properties, vaults = this.vaults, economy = this.economy, civics = this.civics, cohorts = this.cohorts, partyState = this.savedPartyState, blackMarket = this.blackMarket, rankings = this.rankings): string {
    return JSON.stringify(combats.size || properties.revision || Object.keys(vaults).length || economy.revision || civics.revision || cohorts.length || partyState !== undefined || blackMarket.revision || rankings.entries.length || Object.keys(rankings.nicknames).length
      ? { version: 2, profiles: Object.fromEntries(profiles), combats: Object.fromEntries(combats), ...(properties.revision ? { properties } : {}), ...(Object.keys(vaults).length ? { vaults } : {}), ...(economy.revision ? { economy } : {}), ...(civics.revision ? { civics } : {}), ...(cohorts.length ? { cohorts } : {}), ...(partyState !== undefined ? { partyState } : {}), ...(blackMarket.revision ? { blackMarket } : {}), ...(rankings.entries.length || Object.keys(rankings.nicknames).length ? { rankings } : {}) }
      : Object.fromEntries(profiles));
  }
  private writeState(profiles: Map<string, FantasyProfile>, combats: ReadonlyMap<string, StoredCombat> = this.combats, properties = this.properties, vaults = this.vaults, economy = this.economy, civics = this.civics, cohorts = this.cohorts, partyState = this.savedPartyState, blackMarket = this.blackMarket, rankings = this.rankings, online: ReadonlySet<string> = this.onlineUsers, checkpoint?: number) {
    const target = checkpoint ?? this.worldHour?.() ?? Math.max(0, ...[...profiles.values()].map(p => p.character?.hour ?? 0));
    // Unrelated saves must not move shared sources beyond a capped cooking queue.
    const hour = checkpoint ?? Math.min(target, ...[...profiles.values()].filter(profile => {
      if (!this.sharedProductionPending(profile)) return false;
      const activity = profile.activity!;
      const due = activity.cooking ? activity.startedAt + (activity.cooking.completed + 1) * fantasyCookingInterval(activity) : activity.endsAt;
      return due <= target + 1e-8;
    }).map(profile => profile.character!.hour));
    for (const [user, candidate] of profiles) {
      let after = candidate;
      if (after.activity?.retreatCamp) {
        const present = this.retreatParticipants(user, profiles, online, partyState);
        const participants = after.activity.retreatCamp.participants.filter(person => present.some(current => current.kind === person.kind && current.key === person.key && current.generation === person.generation));
        if (participants.length !== after.activity.retreatCamp.participants.length) {
          after = structuredClone(after); after.activity!.retreatCamp!.participants = participants; profiles.set(user, after);
        }
      }
      const before = this.profiles.get(user), action = before?.activity?.action;

      if(before?.activity?.retreatCamp&&!after.activity&&after.character&&!after.death){
        const memories=fantasyCompleteRetreatCamp(after.character.retreatMemories??[],before.activity.retreatCamp,{sourceUserId:user,generation:after.generation??1,location:after.character.location,completedAt:after.character.hour,successful:after.character.hour+1e-8>=before.activity.endsAt&&after.character.hp>0,participants:this.retreatParticipants(user,profiles,online,partyState)});
        if(memories.length)after.character.retreatMemories=memories;
      }
      if (action?.type === 'craft' && action.workshop && !after.activity && !after.death && !fantasyPropertyCanUse(properties, Object.fromEntries(profiles), user, action.workshop, before!.activity!.startedAt) && !after.log.some(entry => entry.id > (before!.log.at(-1)?.id ?? 0) && entry.text === `property:workshop-lost:${action.workshop}`)) throw new Error('Workshop access lost during craft');
    }
    const institutional=this.institutionProfiles(this.profiles,profiles,partyState);
    const normalized = reconcileFantasyProperties(properties, Object.fromEntries(institutional));
    const advanced = checkpoint === undefined ? advanceFantasyProperties(normalized.ledger, normalized.profiles, hour) : normalized;
    const civil = advanceFantasyCivics(civics, advanced.profiles, hour);
    const next = new Map(Object.entries(civil.profiles));
    for (const [id, record] of combats) if (record.state !== this.combats.get(id)?.state && !validFantasyCombatState(record.state)) throw new Error('Invalid updated combat state');
    if (![...next.values()].every(isProfile)) throw new Error('Invalid normalized fantasy state');
    if (!validFantasyPropertyLedger(advanced.ledger)) throw new Error('Invalid normalized property state');
    if (!validFantasyEmployeeCompanies(advanced.ledger, civil.profiles)) throw new Error('Invalid employee company ownership');
    if (!validFantasyCohorts(cohorts)) throw new Error('Invalid party activities');
    if(blackMarket!==this.blackMarket&&!validFantasyBlackMarketLedger(blackMarket))throw new Error('Invalid black market state');
    const nextRankings = reconcileFantasyRanking(rankings, next);
    if (!validFantasyRankingLedger(nextRankings)) throw new Error('Invalid ranking state');
    if (!this.deferPartySave) {
      this.save(this.file, this.serialize(next, combats, advanced.ledger, vaults, economy, civil.ledger, cohorts, partyState, blackMarket, nextRankings));
      this.rankings = nextRankings;
    }
    for (const [user, profile] of next) profiles.set(user, profile);
    this.properties = advanced.ledger; this.vaults = vaults; this.economy = economy; this.civics = civil.ledger;
    this.cohorts = cohorts; this.savedPartyState = partyState;
    this.blackMarket = blackMarket;
  }

  publicRanking(): FantasyRankingRow[] { return this.loadError ? [] : publicFantasyRanking(this.rankings); }
  updateRankingNickname(owner: string, nickname: string): boolean {
    if (this.loadError || this.clockError() || !validFantasyRankingNickname(nickname) || !owner || owner.length > 160 || owner === '__proto__' || /[\u0000-\u001f\u007f]/u.test(owner)) return false;
    const normalized = nickname.trim();
    if (this.rankings.nicknames[owner] === normalized) return true;
    const rankings = structuredClone(this.rankings); rankings.nicknames[owner] = normalized;
    const next = new Map(this.profiles);
    try { this.writeState(next, this.combats, this.properties, this.vaults, this.economy, this.civics, this.cohorts, this.savedPartyState, this.blackMarket, rankings); }
    catch (error) { this.onError(error); return false; }
    this.profiles = next; return true;
  }

  partyState(): unknown { return structuredClone(this.savedPartyState); }
  partyContractParticipants(owner:string,quest:string):string[] {
    const profile=this.profiles.get(owner),record=profile?.character?.contractParties?.[quest];
    if(!record||record.owner!==owner||record.paid)return profile?.character?.contracts?.[quest]?[owner]:[];
    const parties=object(this.savedPartyState)&&Array.isArray(this.savedPartyState.parties)?this.savedPartyState.parties:[];
    const party=parties.find(p=>object(p)&&p.id===record.party&&Array.isArray(p.members)&&p.members.includes(owner));
    if(!object(party)||!Array.isArray(party.members))return [];
    const members=party.members as string[];
    return record.members.filter(member=>{const p=this.profiles.get(member.user),c=p?.character;return !!c&&!p!.death&&members.includes(member.user)&&(p!.generation??1)===member.generation&&(c.lifeStartedAt??0)===member.lifeStartedAt&&c.contracts?.[quest]?.offerId===record.offer;}).map(member=>member.user);
  }
  savePartyState(snapshot: unknown): boolean {
    if (this.loadError || this.clockError()) return false;
    const next = new Map(this.profiles);
    try { this.writeState(next, this.combats, this.properties, this.vaults, this.economy, this.civics, this.cohorts, structuredClone(snapshot)); }
    catch (error) { this.onError(error); return false; }
    this.profiles = next; return true;
  }
  /** A party request may return supplies and start a cohort; publish none of it until the one final save. */
  partyTransaction<T extends { error?: string; updates?: { user: string; profile: FantasyProfile }[] }>(operation: () => T, snapshot: () => unknown): T {
    if (this.deferPartySave) return operation();
    const before = { profiles: this.profiles, combats: this.combats, properties: this.properties, vaults: this.vaults, economy: this.economy, civics: this.civics, cohorts: this.cohorts, partyState: this.savedPartyState, blackMarket:this.blackMarket };
    const restore = () => { this.profiles = before.profiles; this.combats = before.combats; this.properties = before.properties; this.vaults = before.vaults; this.economy = before.economy; this.civics = before.civics; this.cohorts = before.cohorts; this.savedPartyState = before.partyState; this.blackMarket=before.blackMarket; };
    this.deferPartySave = true;
    try {
      const result = operation(); this.deferPartySave = false;
      if (result.error) { restore(); return result; }
      const partyState = snapshot();
      if (this.profiles !== before.profiles || this.combats !== before.combats || JSON.stringify(partyState) !== JSON.stringify(before.partyState)) {
        const next = new Map(this.profiles); this.writeState(next, this.combats, this.properties, this.vaults, this.economy, this.civics, this.cohorts, partyState); this.profiles = next;
      }
      const updates=[...this.profiles].filter(([id,p])=>JSON.stringify(p)!==JSON.stringify(before.profiles.get(id))).map(([user,profile])=>({user,profile:this.profile(user)}));
      if(updates.length)result.updates=updates;
      return result;
    } catch (error) { this.deferPartySave = false; restore(); this.onError(error); return { error: 'save-failed' } as T; }
  }

  propertyState(user: string, context?: FantasyRealmContext) {
    const normalized = reconcileFantasyProperties(this.properties, Object.fromEntries(this.profiles));
    return fantasyPropertyState(normalized.ledger, normalized.profiles, user, this.worldHour?.() ?? normalized.profiles[user]?.character?.hour ?? 0, context?.session ?? 'default');
  }

  propertyRequest(user: string, input: unknown, context?: FantasyRealmContext): { updates: { user: string; profile: FantasyProfile }[]; error?: FantasyPropertyError } {
    if (this.loadError || this.clockError()) return { updates: [], error: 'unavailable' };
    if (!isFantasyPropertyCommand(input)) return { updates: [], error: 'invalid' };
    if (input.type === 'sync') { const next = new Map(this.profiles); try { this.writeState(next); this.profiles = next; return { updates: [] }; } catch { return { updates: [], error: 'save-failed' }; } }
    if (this.civicBlocked(user) || this.surfaceBlocked(user)) return { updates: [], error: 'busy' };
    const sync = this.synchronize(user);
    if (sync.error) return { updates: [], error: 'unavailable' };
    if (this.cookingBacklog(this.worldHour?.() ?? this.profile(user).character?.hour ?? 0)) return { updates: [], error: 'busy' };
    const people = Object.fromEntries(this.profiles), result = applyFantasyPropertyCommand(this.properties, people, user, input, this.worldHour?.() ?? people[user]?.character?.hour ?? 0, context?.session ?? 'default');
    if (result.error || !result.changed) return { updates: [], ...(result.error ? { error: result.error } : {}) };
    if (result.activity) {
      const scheduled = startFantasyActivity(result.profiles[user], result.activity.action, this.worldHour?.() ?? result.profiles[user].character!.hour);
      if (!scheduled.changed || scheduled.error) return { updates: [], error: 'busy' };
      result.profiles[user] = scheduled.profile;
    }
    const next = new Map(Object.entries(result.profiles));
    if (![...next.values()].every(isProfile)) return { updates: [], error: 'invalid' };
    for (const [id, after] of next) { const before = this.profiles.get(id); if (before && fantasyBagChangeError(before, after)) return { updates: [], error: 'bag-full' }; }
    try { this.writeState(next, this.combats, result.ledger); }
    catch (error) { this.onError(error); return { updates: [], error: 'save-failed' }; }
    const updates = [...next].filter(([id, p]) => JSON.stringify(p) !== JSON.stringify(this.profiles.get(id))).map(([id, profile]) => ({ user: id, profile }));
    this.profiles = next;
    return { updates: updates.map(update => ({ user: update.user, profile: this.profile(update.user) })) };
  }

  templeBedsAvailable(user: string): number {
    const c=this.profiles.get(user)?.character,hour=this.worldHour?.()??c?.hour??0;if(!c)return 0;
    const occupied=[...this.profiles.values()].filter(profile=>!profile.death&&profile.character?.location===c.location&&profile.activity?.action.type==='rankBenefitClaim'&&profile.activity.action.benefit==='temple-lodging'&&profile.activity.endsAt>hour&&profile.activity.startedAt<=hour).length;
    return Math.max(0,2-occupied);
  }
  innAvailability(user: string) {
    const c = this.profiles.get(user)?.character, hour = this.worldHour?.() ?? c?.hour ?? 0;
    return c && fantasyBuildings(c).some(building => building.id === 'inn') ? fantasyInnAvailability(this.profiles.values(), c.location, hour) : [];
  }
  realmState(user: string, context: FantasyRealmContext) {
    const hour = this.worldHour?.() ?? this.profiles.get(user)?.character?.hour ?? 0;
    return { economy: { ...fantasyEconomyState(this.economy, this.profiles, user, { hour, peers: context.peers, priceMultiplier: fantasyCivicServiceMultiplier(this.civics, this.profiles.get(user)?.character?.location ?? '') }), rooms: this.innAvailability(user), templeBeds: this.templeBedsAvailable(user),campMage:this.campMageAvailable(user) },
      civic: fantasyCivicState(this.civics, Object.fromEntries(this.profiles), user, hour, context),
      blackMarket: this.profiles.get(user)?.character ? fantasyBlackMarketState(this.blackMarket, this.profiles.get(user)!.character!, hour, context.session, {userId:user,generation:this.profiles.get(user)!.generation??1}) : undefined };
  }
  blackMarketRequest(user: string, command: unknown, context: FantasyRealmContext): {updates:{user:string;profile:FantasyProfile}[];error?:string} {
    if(this.loadError||this.clockError()||!context.peers.includes(user))return{updates:[],error:'unavailable'};
    if(!fantasyBlackMarketActionValid(command))return{updates:[],error:'invalid'};
    if(command.type!=='sync'&&(this.surfaceBlocked(user)||this.civicBlocked(user)))return{updates:[],error:'busy'};
    const sync=this.synchronize(user);if(sync.error)return{updates:[],error:'unavailable'};
    const hour=this.worldHour?.()??this.profile(user).character?.hour??0;
    const result=applyFantasyBlackMarket(this.blackMarket,new Map(this.profiles),user,command,hour,context.session,context.peers);
    if(!result.changed)return{updates:[],...(result.error?{error:result.error}:{})};
    const before=this.profiles,next=result.profiles;
    try{this.writeState(next,this.combats,this.properties,this.vaults,this.economy,this.civics,this.cohorts,this.savedPartyState,result.ledger);}
    catch(error){this.onError(error);return{updates:[],error:'save-failed'};}
    this.profiles=next;
    return{updates:[...next].filter(([id,p])=>JSON.stringify(p)!==JSON.stringify(before.get(id))).map(([user,profile])=>({user,profile:structuredClone(profile)})),...(result.error?{error:result.error}:{})};
  }
  civicBlocked(user: string) { return fantasyCivicActionBlock(this.civics, this.profile(user), user, this.worldHour?.() ?? this.profile(user).character?.hour ?? 0); }
  onRoad(user: string) { const c = this.profiles.get(user)?.character; return !!c && fantasyOnRoad(c); }
  surfaceBlocked(user: string) { return this.onRoad(user) || !!this.profiles.get(user)?.character?.dungeon?.active; }
  realmFacts(user: string, locale: NpcLocale, npc?: string): string[] {
    const profile = this.profile(user), location = profile.character?.location; if (!location) return [];
    const records = this.civics.notices.filter(note => note.location === location).slice(-2).map(note => note.text[locale]);
    const presence = npc ? this.civics.npcs[npc] : undefined;
    if (presence) {
      const building = fantasyBuildings(profile.character!).find(place => place.id === presence.building)?.name[locale] ?? ({ko:'거처',en:'home',ja:'住まい'})[locale];
      const activity = { sleep: {ko:'쉬고 있다',en:'resting',ja:'休んでいる'}, work: {ko:'생업에 종사하고 있다',en:'working',ja:'仕事をしている'}, market: {ko:'장을 보고 있다',en:'shopping',ja:'買い物をしている'}, visit: {ko:'이웃을 만나고 있다',en:'visiting neighbours',ja:'近所の人と会っている'} }[presence.activity][locale];
      records.push(({ko:`지금 ${building}에서 ${activity}.`,en:`Currently ${activity} at ${building}.`,ja:`今は${building}で${activity}。`})[locale]);
    }
    return records;
  }
  realmRequest(user: string, input: unknown, context: FantasyRealmContext): { updates: { user: string; profile: FantasyProfile }[]; error?: string } {
    if (this.loadError || this.clockError()) return { updates: [], error: 'unavailable' };
    if (!object(input) || Object.keys(input).length !== 2 || !['economy', 'civic','blackMarket'].includes(String(input.domain))) return { updates: [], error: 'invalid' };
    if(input.domain==='blackMarket')return this.blackMarketRequest(user,input.command,context);
    const command = input.command;
    if (input.domain === 'economy' ? !isFantasyEconomyCommand(command) : !isFantasyCivicCommand(command)) return { updates: [], error: 'invalid' };
    if (object(command) && command.type !== 'sync' && (!!this.profiles.get(user)?.character?.dungeon?.active || command.type !== 'merchantBuy' && this.onRoad(user) || typeof command.peer === 'string' && this.surfaceBlocked(command.peer) || typeof command.target === 'string' && this.surfaceBlocked(command.target))) return { updates: [], error: 'busy' };
    if (!context.peers.includes(user)) return { updates: [], error: 'unavailable' };
    const hour = this.worldHour?.() ?? this.profile(user).character?.hour ?? 0, before = new Map(this.profiles), prepared = new Map(this.profiles);
    for (const peer of context.peers) {
      const current = prepared.get(peer); if (!current?.character || current.combatId || this.sharedProductionPending(current)) continue;
      const result = advanceFantasyWorld(current, Math.max(hour, current.character.hour), { accrueIdleNeeds: this.onlineUsers.has(peer) });
      if (result.error) return { updates: [], error: 'busy' }; prepared.set(peer, result.profile);
    }
    const civil = advanceFantasyCivics(this.civics, Object.fromEntries(prepared), hour);
    const people = new Map(Object.entries(civil.profiles));
    if (object(command) && command.type !== 'sync' && [user, command.peer, command.target].some(id => typeof id === 'string' && people.get(id)?.character && (people.get(id)!.character!.dungeon?.active || command.type !== 'merchantBuy' && fantasyOnRoad(people.get(id)!.character!)))) return { updates: [], error: 'busy' };
    if (input.domain === 'economy' && (fantasyCivicActionBlock(civil.ledger, people.get(user) ?? this.profile(user), user, hour) || context.peers.some(peer => peer !== user && fantasyCivicActionBlock(civil.ledger, people.get(peer) ?? this.profile(peer), peer, hour) && object(command) && command.peer === peer))) return { updates: [], error: 'custody' };
    const result = input.domain === 'economy'
      ? applyFantasyEconomyCommand(this.economy, people, user, command as never, { hour, peers: context.peers.filter(peer => !fantasyCivicActionBlock(civil.ledger, people.get(peer) ?? this.profile(peer), peer, hour)), token: randomUUID(), priceMultiplier: fantasyCivicServiceMultiplier(civil.ledger, people.get(user)?.character?.location ?? '') })
      : applyFantasyCivicCommand(civil.ledger, Object.fromEntries(people), user, command as never, hour, context);
    if (result.error) return { updates: [], error: result.error };
    const next = result.profiles instanceof Map ? result.profiles : new Map(Object.entries(result.profiles));
    for(const [id,p]of next){const before=this.profiles.get(id);if(before&&fantasyBagChangeError(before,p))return {updates:[],error:'capacity'};}
    try { this.writeState(next, this.combats, this.properties, this.vaults, input.domain === 'economy' ? result.ledger as FantasyEconomyLedger : this.economy, input.domain === 'civic' ? result.ledger as FantasyCivicLedger : civil.ledger); }
    catch (error) { this.onError(error); return { updates: [], error: 'save-failed' }; }
    this.profiles = next;
    return { updates: [...next].filter(([id,p]) => JSON.stringify(p) !== JSON.stringify(before.get(id))).map(([id]) => ({ user: id, profile: this.profile(id) })) };
  }

  partyVault(party: string) { return structuredClone(this.vaults[party] ?? newFantasyPartyVault()); }
  partyVaultRequest(party: FantasyPartyVaultContext, actor: string, command: FantasyPartyVaultCommand): FantasyGroupInvestigationResult {
    if (this.loadError || this.clockError()) return { updates: [], error: 'unavailable' };
    if (this.civicBlocked(actor)) return { updates: [], error: 'busy' };
    const prepared = new Map(this.profiles), hour = this.worldHour?.();
    if (hour !== undefined) for (const user of party.members) {
      const profile = prepared.get(user); if (!profile?.character || profile.combatId || this.sharedProductionPending(profile)) continue;
      const synced = advanceFantasyWorld(profile, Math.max(hour, profile.character.hour), { accrueIdleNeeds: this.onlineUsers.has(user) });
      if (synced.error) return { updates: [], error: 'unavailable' }; prepared.set(user, synced.profile);
    }
    const result = applyFantasyPartyVault(this.vaults, prepared, party, actor, command, randomUUID());
    if (!result.changed || result.error) return { updates: [], error: (result.error ?? 'invalid') as FantasyPartyError };
    for (const [id, after] of result.profiles) { const before = prepared.get(id); if (before && fantasyBagChangeError(before, after)) return { updates: [], error: 'capacity' }; }
    return this.commitPartyVault(result);
  }
  returnPartyDeposits(party: string, owner: string): FantasyGroupInvestigationResult {
    if (this.loadError || this.clockError()) return { updates: [], error: 'unavailable' };
    const result = returnFantasyPartyDeposits(this.vaults, this.profiles, party, owner);
    return result.changed ? this.commitPartyVault(result) : { updates: [] };
  }
  private commitPartyVault(result: ReturnType<typeof applyFantasyPartyVault>): FantasyGroupInvestigationResult {
    if (![...result.profiles.values()].every(isProfile) || !validFantasyPartyVaults(result.vaults)) return { updates: [], error: 'invalid' };
    try { this.writeState(result.profiles, this.combats, this.properties, result.vaults); }
    catch (error) { this.onError(error); return { updates: [], error: 'save-failed' }; }
    const updates = [...result.profiles].filter(([id, p]) => JSON.stringify(p) !== JSON.stringify(this.profiles.get(id))).map(([user, profile]) => ({ user, profile }));
    this.profiles = result.profiles; this.vaults = result.vaults; return { updates };
  }

  hasProfile(user: string): boolean { return this.profiles.has(user); }
  profile(user: string): FantasyProfile {
    return structuredClone(this.profiles.get(user) ?? newFantasyProfile());
  }

  legacyCount(): number {
    return [...this.profiles.values()].reduce((count, profile) => count + (profile.pastLives?.length ?? 0), 0);
  }

  legacies(user: string): FantasyLegacyRecord[] {
    const viewer = this.profiles.get(user)?.character;
    if (!viewer) return [];
    const known = new Set([...viewer.visited, ...viewer.charted]);
    return [...this.profiles].flatMap(([owner, profile]) => (profile.pastLives ?? [])
      .filter(trace => known.has(trace.location) || trace.visited.some(id => known.has(id)))
      .map(trace => ({
        id: `${createHash('sha256').update(owner).digest('hex').slice(0, 16)}-${trace.generation}`,
        generation: trace.generation, name: trace.name, race: trace.race, job: trace.job, level: trace.level,
        hour: trace.hour, location: known.has(trace.location) || trace.location === 'sea' ? trace.location : null,
        visitedCount: trace.visited.length, questCount: trace.completed.length,
      }))).sort((a, b) => b.hour - a.hour).slice(0, 100);
  }

  legacyFacts(user: string, locale: NpcLocale): string[] {
    const character = this.profiles.get(user)?.character;
    if (!character) return [];
    return [...this.profiles.values()].flatMap(profile => profile.pastLives ?? [])
      .filter(trace => trace.visited.includes(character.location)).sort((a, b) => b.hour - a.hour).slice(0, 3)
      .map(trace => ({
        ko: `이곳의 옛 여행자 기록: ${trace.name}, ${FANTASY_JOBS.find(job => job.id === trace.job)?.names.ko ?? ''}. 생전에 이 지역을 방문했고 ${trace.completed.length}개의 의뢰를 마쳤다. 이 인물은 이미 삶을 마쳤으며 기록은 남아 있다.`,
        en: `Local traveler record: ${trace.name}, ${FANTASY_JOBS.find(job => job.id === trace.job)?.names.en ?? ''}. Visited this place and completed ${trace.completed.length} contracts during their life. Their life has ended; their record remains.`,
        ja: `この地の旅人の記録：${trace.name}、${FANTASY_JOBS.find(job => job.id === trace.job)?.names.ja ?? ''}。生前にこの地を訪れ、依頼を${trace.completed.length}件終えた。本人の生涯は終わっても記録は残っている。`,
      })[locale]);
  }

  synchronizeContractProgress(user: string, lookup: (offer: string) => number | undefined): FantasyResult {
    const current = this.profile(user);
    if (!current.character || current.death || !current.character.contracts || this.loadError) return { profile: current, changed: false };
    const next = structuredClone(current);
    let changed = false;
    for (const grant of Object.values(next.character!.contracts!)) {
      const shared = lookup(grant.offerId);
      if (shared !== undefined && Number.isSafeInteger(shared) && shared > grant.progress) { grant.progress = shared; changed = true; }
    }
    if (!changed) return { profile: current, changed: false };
    next.revision++;
    return this.commit(user, { profile: next, changed: true });
  }

  maximumHour(): number {
    return [...this.profiles.values()].reduce((hour, profile) => Math.max(hour, profile.character?.hour ?? 8), 8);
  }

  private localCampParty(user:string,profiles:ReadonlyMap<string,FantasyProfile>=this.profiles,partyState=this.savedPartyState):string[]{
    const c=profiles.get(user)?.character;if(!c)return [];
    const parties=object(partyState)&&Array.isArray(partyState.parties)?partyState.parties:[];
    const party=parties.find(entry=>object(entry)&&Array.isArray(entry.members)&&entry.members.includes(user));
    const ids=object(party)&&Array.isArray(party.members)?party.members.filter((id):id is string=>typeof id==='string'):[user];
    return [...new Set(ids)].filter(id=>{const profile=profiles.get(id),other=profile?.character;return !!other&&!profile?.death&&other.hp>0&&!other.downed&&!profile?.combatId&&!fantasyOnRoad(other)&&fantasyCampTogether(c,other);});
  }
  campMageAvailable(user:string):boolean{
    return this.localCampParty(user).some(id=>{const profile=this.profiles.get(id);return this.onlineUsers.has(id)&&profile?.character?.job==='mage'&&(!profile.activity||profile.activity.action.type==='rest'&&profile.activity.camp?.fire==='mage')&&!profile.event&&!profile.character.downed&&!profile.character.returnLantern;});
  }
  private retreatParticipants(user:string,profiles:ReadonlyMap<string,FantasyProfile>=this.profiles,online:ReadonlySet<string>=this.onlineUsers,partyState=this.savedPartyState):FantasyRetreatParticipant[]{
    const c=profiles.get(user)?.character;if(!c)return [];
    const people:FantasyRetreatParticipant[]=this.localCampParty(user,profiles,partyState).filter(id=>id!==user&&online.has(id)).map(id=>{const profile=profiles.get(id)!;return {kind:'player',key:id,name:profile.character!.name,generation:profile.generation??1};});
    for(const {kind,member}of fantasyActiveCompanions(c)){
      if(kind==='summons')continue;
      const template=FANTASY_COMPANIONS.find(entry=>entry.id===member.id);if(template)people.push({kind:'companion',key:member.id,name:template.names.ko});
    }
    return people;
  }
  private campWatch(user: string, profiles: ReadonlyMap<string, FantasyProfile>): FantasyCampWatchWindow[] {
    const c=profiles.get(user)?.character;if(!c)return [];
    const parties=object(this.savedPartyState)&&Array.isArray(this.savedPartyState.parties)?this.savedPartyState.parties:[];
    const party=parties.find(value=>object(value)&&Array.isArray(value.members)&&value.members.includes(user));
    const members=object(party)&&Array.isArray(party.members)?[...new Set(party.members.filter((id):id is string=>typeof id==='string'))]:[user];
    return members.flatMap(member=>{
      const p=profiles.get(member),a=p?.activity,other=p?.character;
      return p&&other&&a?.action.type==='rest'&&a.camp&&a.action.watch===true&&!p.death&&!other.downed&&!p.combatId&&!p.event&&other.hp>0&&fantasyCampTogether(c,other)
        ?[{startedAt:a.startedAt,endsAt:a.endsAt,watchers:1+fantasyCampCompanions(other)}]:[];
    });
  }

  private advanceCamps(hour:number,online:ReadonlySet<string>):Map<string,FantasyResult>{
    const next=new Map(this.profiles),results=new Map<string,FantasyResult>();
    const campers=[...this.profiles].filter(([user,p])=>p.activity?.camp&&p.character&&!p.combatId&&(this.onlineUsers.has(user)||online.has(user)||p.activity.endsAt<=hour)).map(([user])=>user);
    for(let step=0;step<campers.length*10+1;step++){
      const active=campers.filter(user=>{const p=next.get(user)!;return p.activity?.camp&&p.character!.hour<hour&&!p.death&&!p.event;});
      if(!active.length)break;
      const at=Math.min(hour,...active.map(user=>{const p=next.get(user)!,a=p.activity!;return Math.min(a.endsAt,a.startedAt+Math.floor(p.character!.hour-a.startedAt+1e-8)+1);}));
      const snapshot=new Map(next),updates:[string,FantasyResult][]=[];
      for(const user of active){const p=snapshot.get(user)!;if(p.character!.hour>=at)continue;
        updates.push([user,advanceFantasyWorld(p,at,{accrueIdleNeeds:this.onlineUsers.has(user),ambush:this.ambushEnabled&&(this.onlineUsers.has(user)||online.has(user)),campWatch:this.campWatch(user,snapshot)})]);
      }
      for(const [user,result]of updates){if(result.changed&&!result.error){next.set(user,result.profile);results.set(user,result);}}
    }
    for(const [user,result]of results){if(result.profile.activity||result.profile.event||result.profile.death||result.profile.character!.hour>=hour)continue;
      const tail=advanceFantasyWorld(result.profile,hour,{accrueIdleNeeds:this.onlineUsers.has(user)});if(tail.changed)results.set(user,tail);
    }
    return results;
  }

  private sharedProductionPending(profile: FantasyProfile) {
    return !!profile.character && !profile.death && !profile.combatId && (profile.activity?.action.type === 'commission'
      || profile.activity?.action.type === 'cookMix' && profile.activity.action.station === 'kitchen' && !!profile.activity.action.workshop);
  }

  private commissionOptions(user: string, profile: FantasyProfile, properties: FantasyPropertyLedger) {
    const commissionContext: FantasyCommissionContext = { actor: user, generation: profile.generation ?? 1,
      employees: properties.employees, workerProgress: properties.workerProgress,
      startedAt: profile.activity?.action.type === 'commission' ? profile.activity.startedAt : profile.character?.hour };
    return { commissionContext, onCommission: (result: FantasyCommissionResult) => {
      if (!result.changed || result.error || !result.employees) return;
      properties.employees = result.employees; properties.workerProgress = result.workerProgress; properties.revision++;
    } };
  }

  private cookingBacklog(hour: number) {
    return [...this.profiles.values()].some(profile => {
      if (!this.sharedProductionPending(profile)) return false;
      const activity = profile.activity!;
      return (activity.cooking ? activity.startedAt + (activity.cooking.completed + 1) * fantasyCookingInterval(activity) : activity.endsAt) <= hour + 1e-8;
    });
  }

  private cookingState(target: number, settle = false) {
    const normalized = reconcileFantasyProperties(this.properties, Object.fromEntries(this.profiles));
    let properties = structuredClone(normalized.ledger), profiles = new Map(Object.entries(structuredClone(normalized.profiles)));
    const cookingUsers = new Set(settle ? [...profiles].filter(([, p]) => this.sharedProductionPending(p)).map(([user]) => user) : []);
    let hour = target, checkpoint = 0;
    const workerShifts = new Map<string, number>();
    const advanceProperties = (at: number) => {
      const disabled: { id: string; plot: string }[] = [];
      for (const [id, worker] of Object.entries(properties.employees ?? {})) {
        if (!worker.plot || !worker.job || worker.company) continue;
        const steps = Math.floor(Math.max(0, at - worker.lastAt) / 4), remaining = Math.max(0, 12 - (workerShifts.get(id) ?? 0));
        if (!steps) continue;
        if (steps > remaining) {
          // Retain the existing maximum of twelve NPC shifts per settlement.
          worker.lastAt += (steps - remaining) * 4; properties.revision++;
        }
        if (!remaining) { disabled.push({ id, plot: worker.plot }); delete worker.plot; }
        else workerShifts.set(id, (workerShifts.get(id) ?? 0) + Math.min(steps, remaining));
      }
      const advanced = advanceFantasyProperties(properties, Object.fromEntries(profiles), at);
      properties = advanced.ledger; profiles = new Map(Object.entries(advanced.profiles));
      for (const { id, plot } of disabled) if (properties.employees?.[id]) properties.employees[id].plot = plot;
    };
    // Settle shared sources in time order. NPC shifts win ties, but cannot take
    // ingredients that a player already cooked at an earlier boundary.
    for (let step = 0; settle; step++) {
      const due = [...cookingUsers].flatMap(user => {
        const profile = profiles.get(user)!;
        if (!this.sharedProductionPending(profile)) return [];
        const activity = profile.activity!;
        const at = activity.cooking ? activity.startedAt + (activity.cooking.completed + 1) * fantasyCookingInterval(activity) : activity.endsAt;
        return at <= target + 1e-8 ? [{ user, at }] : [];
      });
      if (!due.length) break;
      if (step === 128) {
        // Keep every world subsystem at this checkpoint until the next bounded
        // settlement, including after a save/reload.
        hour = checkpoint;
        break;
      }
      const boundary = Math.min(...due.map(entry => entry.at));
      const users = due.filter(entry => Math.abs(entry.at - boundary) <= 1e-8).map(entry => entry.user);
      const authorized = new Map(users.map(user => {
        const profile = profiles.get(user)!, activity = profile.activity!, action = activity.action;
        const start = activity.cooking ? activity.startedAt + activity.cooking.completed * fantasyCookingInterval(activity) : activity.startedAt;
        let source = this.workshopProfile(user, profile, properties, profiles, start);
        const lease = action.type === 'cookMix' && action.workshop ? properties.plots[action.workshop]?.extension?.lease : undefined;
        if (source.activity && lease?.state === 'active' && lease.endsAt < boundary - 1e-8) source = this.stopWorkshop(source);
        return [user, source === profile] as const;
      }));
      advanceProperties(boundary); checkpoint = boundary;
      for (const user of users) {
        const latest = profiles.get(user)!;
        const source = authorized.get(user) ? latest : this.stopWorkshop(latest);
        const warehouse = source.activity ? this.cookingWarehouse(user, source, properties, profiles, boundary, source.activity.action, true) : undefined;
        const result = advanceFantasyWorld(source, boundary, { accrueIdleNeeds: this.onlineUsers.has(user), cookingStock: warehouse?.stock, ...this.commissionOptions(user, source, properties) });
        if (result.error || !isProfile(result.profile)) throw new Error(result.error ?? 'Invalid chronological cooking profile');
        warehouse?.apply(); profiles.set(user, result.profile);
      }
    }
    advanceProperties(hour);
    for (const user of cookingUsers) {
      const profile = profiles.get(user)!;
      // A capped queue must retain its earlier personal checkpoint as well.
      const activity = profile.activity;
      const start = activity?.cooking ? activity.startedAt + activity.cooking.completed * fantasyCookingInterval(activity) : activity?.startedAt ?? hour;
      const source = this.workshopProfile(user, profile, properties, profiles, start);
      const warehouse = this.cookingWarehouse(user, source, properties, profiles, hour, source.activity?.action, true);
      const result = advanceFantasyWorld(source, Math.max(hour, source.character!.hour), { accrueIdleNeeds: this.onlineUsers.has(user), cookingStock: warehouse?.stock, ...this.commissionOptions(user, source, properties) });
      if (result.error || !isProfile(result.profile)) throw new Error(result.error ?? 'Invalid chronological cooking checkpoint');
      warehouse?.apply();
      profiles.set(user, result.profile);
    }
    return { properties, profiles, hour, cookingUsers };
  }

  private stopWorkshop(profile: FantasyProfile) {
    const copy = structuredClone(profile), action = copy.activity!.action;
    delete copy.activity; copy.revision++;
    if (action.type === 'cookMix' || action.type === 'craft') this.combatLog(copy, `property:workshop-lost:${action.workshop}`, 'system');
    return copy;
  }

  private cookingWarehouse(user: string, profile: FantasyProfile, properties: FantasyPropertyLedger, profiles: ReadonlyMap<string, FantasyProfile>, hour: number, action = profile.activity?.action, authorized = false) {
    if (action?.type !== 'cookMix' || !action.storage || action.station !== 'kitchen' || action.storage !== action.workshop
      || action.storage !== `${profile.character?.location}-commercial` || !authorized && !fantasyPropertyCanUse(properties, Object.fromEntries(profiles), user, action.storage, hour)) return;
    const business = properties.plots[action.storage]?.business;
    const source = fantasyCookingWarehouse(business ?? { inventory: {}, treasury: 0, lastAt: hour });
    return { stock: source.stock, apply: () => {
      if (!business) return;
      const remaining = source.remaining();
      if (JSON.stringify(remaining) === JSON.stringify(business)) return;
      const record = properties.plots[action.storage!];
      record.business = remaining; record.revision++; properties.revision++;
    } };
  }

  private workshopProfile(user: string, profile: FantasyProfile, properties = this.properties, profiles: ReadonlyMap<string, FantasyProfile> = this.profiles, hour = this.worldHour?.() ?? profile.character?.hour ?? 0): FantasyProfile {
    const activity = profile.activity, action = activity?.action;
    if ((action?.type !== 'craft' && !(action?.type === 'cookMix' && action.station === 'kitchen')) || !action.workshop || profile.death || !profile.character) return profile;
    if (action.workshop === `${profile.character.location}-commercial` && fantasyPropertyCanUse(properties, Object.fromEntries(profiles), user, action.workshop, action.type === 'cookMix' ? hour : activity!.startedAt)) return profile;
    return this.stopWorkshop(profile);
  }

  synchronize(user: string, accrueIdleNeeds = false): FantasyResult {
    const current = this.profile(user);
    if (!this.worldHour || !current.character) return { profile: current, changed: false };
    if (current.combatId) return { profile: current, changed: false };
    if (this.loadError || this.clockError()) return this.reject(user, this.loadError ?? this.clockError()!);
    const hour = this.worldHour();
    // A cohort is settled as one transaction even when a single reconnect asks to synchronize.
    if ([...this.profiles.values()].some(profile => this.sharedProductionPending(profile)) || current.character.downed || current.character.carrying || current.character.returnLantern || current.activity?.camp || this.cohorts.some(cohort => cohort.members.some(member => member.user === user))) {
      const updates = this.tick(this.onlineUsers), failed = updates.find(update => update.error);
      if (failed) return this.reject(user, failed.error!);
      return { profile: this.profile(user), changed: updates.some(update => update.user === user) };
    }
    if (Math.floor(current.character.hour * 60) === Math.floor(hour * 60) && (!current.activity || current.activity.endsAt > hour)) return { profile: current, changed: false };
    const staged = current.activity?.action.type === 'cookMix' && current.activity.action.storage ? this.cookingState(hour) : undefined;
    const properties = staged?.properties ?? this.properties, profiles = staged?.profiles ?? this.profiles;
    const source = this.workshopProfile(user, profiles.get(user) ?? current, properties, profiles, hour);
    const warehouse = this.cookingWarehouse(user, source, properties, profiles, hour);
    const result = advanceFantasyWorld(source, hour, { accrueIdleNeeds, ambush: this.ambushEnabled && this.onlineUsers.has(user), cookingStock: warehouse?.stock });
    if (source !== current) result.changed = true;
    if (result.changed && !result.error) warehouse?.apply();
    return result.changed && !result.error ? this.commit(user, result, staged) : result;
  }

  tick(online: ReadonlySet<string>): { user: string; profile: FantasyProfile; error?: string }[] {
    if (!this.worldHour || this.loadError || this.clockError()) return [];
    const target = this.worldHour();
    let staged: ReturnType<FantasyStore['cookingState']> | undefined;
    try {
      if ([...this.profiles.values()].some(profile => this.sharedProductionPending(profile))) staged = this.cookingState(target, true);
    } catch (error) {
      this.onError(error);
      return [...this.profiles].filter(([, profile]) => this.sharedProductionPending(profile)).map(([user, profile]) => ({ user, profile, error: '冒険記録を保存できませんでした。操作は確定していません。もう一度お試しください。' }));
    }
    const hour = staged?.hour ?? target;
    const snapshot = staged?.profiles ?? this.profiles, properties = staged?.properties ?? this.properties;
    const next = new Map(snapshot), combats = new Map(this.combats);
    const campResults=this.advanceCamps(hour,online);
    const groups = this.cohorts.filter((cohort): cohort is FantasyTravelCohort => cohort.kind === 'travel' && cohort.members.every(member => fantasyCohortActivityMatches(this.profiles.get(member.user), member, 'travel')));
    const grouped = new Set(groups.flatMap(group => group.members.map(member => member.user)));
    const ambushes = new Map<string, { cohort: FantasyTravelCohort; hour: number; event: string }>();
    if (this.ambushEnabled) for (const cohort of groups) {
      const lead = this.profiles.get(cohort.leader)!, activity = lead.activity!;
      const base = activity.travel?.ambushStartedAt ?? activity.startedAt;
      const hit = fantasyAmbushHit({ ...activity, startedAt: base, action: { type: 'travel', destination: cohort.destination, transport: cohort.transport } }, Math.min(hour, activity.endsAt), Math.max(lead.character!.hour, base + (activity.travel?.ambushChecked ?? 0) / 12));
      const merchant = fantasyMapMerchantHit(activity, Math.min(hour, activity.endsAt), Math.max(lead.character!.hour, base + (activity.travel?.ambushChecked ?? 0) / 12));
      if (merchant && (!hit || merchant.hour < hit.hour)) {
        for (const member of cohort.members) ambushes.set(member.user, { cohort, hour: merchant.hour, event: FANTASY_MAP_MERCHANT_EVENT });
        continue;
      }
      if (!hit) continue;
      const place = FANTASY_LOCATIONS.find(place => place.id === lead.character!.location)!;
      const event = fantasyEncounterFor(place.kind, cohort.transport === 'escort' ? 'escort-ambush' : 'travel-ambush', false).id;
      for (const member of cohort.members) ambushes.set(member.user, { cohort, hour: hit.hour, event });
    }
    const changed: { user: string; profile: FantasyProfile }[] = [...snapshot].filter(([user, profile]) => JSON.stringify(profile) !== JSON.stringify(this.profiles.get(user))).map(([user, profile]) => ({ user, profile }));
    for (const [user, profile] of snapshot) {
      if (staged?.cookingUsers.has(user)) continue;
      if (!profile.character || profile.combatId || profile.character.downed) continue;
      const wasOnline = this.onlineUsers.has(user);
      const isOnline = online.has(user);
      const due = !!profile.activity && (profile.activity.endsAt <= hour || !!profile.activity.work
        && profile.activity.startedAt + (profile.activity.work.completed + 1) * fantasyWorkInterval(profile.activity) <= hour
        || !!profile.activity.cooking && profile.activity.startedAt + (profile.activity.cooking.completed + 1) * fantasyCookingInterval(profile.activity) <= hour);
      if (!due && !(wasOnline || isOnline) && !grouped.has(user)) continue;
      if (!due && wasOnline === isOnline && Math.floor(profile.character.hour * 60) === Math.floor(hour * 60)) continue;
      const ambush = ambushes.get(user);
      const source = this.workshopProfile(user, profile, properties, next, hour);
      const warehouse = this.cookingWarehouse(user, source, properties, next, hour);
      const result = campResults.get(user) ?? advanceFantasyWorld(source, ambush?.hour ?? hour, { accrueIdleNeeds: wasOnline, ambush: !grouped.has(user) && this.ambushEnabled && (wasOnline || isOnline),campWatch:this.campWatch(user,this.profiles), cookingStock: warehouse?.stock });
      if (source !== profile) result.changed = true;
      if (ambush && result.profile.character && !result.profile.death && result.profile.activity?.action.type === 'travel') {
        result.profile = structuredClone(result.profile); delete result.profile.activity; result.profile.event = ambush.event; result.profile.revision++;
        this.combatLog(result.profile, ambush.event === FANTASY_MAP_MERCHANT_EVENT ? '隊列が足を止め、道端の地図売りに会った。' : '同じ隊列が襲撃を受けた。仲間とともに戦場へ向かう。', ambush.event === FANTASY_MAP_MERCHANT_EVENT ? 'story' : 'failure'); result.changed = true;
      }
      if (result.changed) result.profile = this.enableCombat(result.profile) as FantasyProfile;
      if (result.error) { this.onError(new Error(result.error)); continue; }
      if (!result.changed) continue;
      if (!isProfile(result.profile)) { this.onError(new Error('Fantasy clock produced an invalid profile')); continue; }
      warehouse?.apply();
      if (profile.activity?.action.type === 'propertyUse' && !result.profile.activity && result.profile.character && !result.profile.death) result.profile = applyFantasyPropertyImprovement(result.profile, profile.activity.action.plot, this.properties, fantasyStats(result.profile.character)).profile;
      next.set(user, result.profile);
      const prior = changed.find(update => update.user === user); if (prior) prior.profile = result.profile; else changed.push({ user, profile: result.profile });
    }
    const carried = advanceFantasyCarryReturn(next, hour, user => this.carryContext(user));
    for (const update of carried.updates) { next.set(update.user, update.profile); const prior = changed.find(item => item.user === update.user); if (prior) prior.profile = update.profile; else changed.push(update); }
    for (const [user, source] of next) {
      const c = source.character, d = c?.downed; if (!c || !d || source.death || source.combatId) continue;
      if (!online.has(user) && !this.onlineUsers.has(user) && hour < (d.wakesAt ?? d.expiresAt)) continue;
      const p = structuredClone(source); advanceFantasyDowned(p, hour); p.revision++;
      if (!isProfile(p)) { this.onError(new Error('Invalid downed progression')); continue; }
      next.set(user,p); const prior = changed.find(item => item.user === user); if (prior) prior.profile = p; else changed.push({user,profile:p});
    }
    const shared = shareFantasyInvestigationProofs(this.profiles, next, this.cohorts, hour);
    const ambushedGroups = new Set<string>();
    for (const { cohort, hour: at, event } of ambushes.values()) {
      if (ambushedGroups.has(cohort.id)) continue; ambushedGroups.add(cohort.id);
      if (event === FANTASY_MAP_MERCHANT_EVENT) continue;
      const participants = [cohort.leader, ...cohort.members.map(member => member.user).filter(user => user !== cohort.leader)].filter(user => {
        const p = next.get(user); return !!p?.character && !p.death && p.character.hp > 0 && !p.activity && !!p.event;
      });
      const owner = next.get(cohort.leader), plan = owner?.event && fantasyCombatStartPlan(owner, 'encounter', owner.event);
      if (!plan || !participants.length) continue;
      const escort = plan.source.startsWith('escort:') && owner?.character?.escort;
      const id = `combat-${randomUUID()}`;
      const state = createFantasyCombat({ id, location: owner!.character!.location, source: plan.source, hour: at, seed: cohort.members[0].seed, tactical: true, terrain: 'barricade',
        players: participants.map(user => fantasyCombatPlayer(next.get(user)!, user)), enemies: plan.enemies,
        ...(escort ? { escort: { owner: cohort.leader, contractId: escort.id, destination: escort.destination } } : {}) });
      for (const user of participants) { const p = structuredClone(next.get(user)!); p.event = null; p.combatId = id; p.revision++; next.set(user, p); }
      combats.set(id, { state, session: cohort.session });
    }
    shared.cohorts = shared.cohorts.filter(cohort => cohort.kind !== 'travel' || !ambushedGroups.has(cohort.id) && cohort.members.every(member => fantasyCohortActivityMatches(next.get(member.user), member, 'travel')));
    for (const user of shared.users) if (!changed.some(update => update.user === user)) changed.push({ user, profile: next.get(user)! });
    let blackMarket=this.blackMarket;
    for(const realm of new Set(Object.values(blackMarket.markets).map(market=>market.realm))){
      const auction=advanceFantasyBlackMarket(blackMarket,next,hour,realm,[]);
      if(!auction.changed)continue;
      blackMarket=auction.ledger;
      for(const [user,profile]of auction.profiles){
        if(JSON.stringify(profile)!==JSON.stringify(next.get(user))&&!changed.some(update=>update.user===user))changed.push({user,profile});
        next.set(user,profile);
      }
    }
    // Presence changes must be saved even when no world minute elapsed.
    // Otherwise a disconnect/reconnect can restore an interrupted shared camp.
    for (const [user, profile] of next) {
      if (!profile.activity?.retreatCamp?.participants.some(person => person.kind === 'player' && !online.has(person.key))) continue;
      const prior = changed.find(update => update.user === user);
      if (!prior) { const updated = structuredClone(profile); updated.revision++; next.set(user, updated); changed.push({ user, profile: updated }); }
    }
    if (blackMarket===this.blackMarket && !changed.length && shared.cohorts.length === this.cohorts.length) { this.onlineUsers = new Set(online); return this.tickCombats(hour); }
    try { this.writeState(next, combats, properties, this.vaults, this.economy, this.civics, shared.cohorts,this.savedPartyState,blackMarket,this.rankings,online,staged?.hour); }
    catch (error) {
      this.onError(error);
      return changed.map(({ user }) => ({ user, profile: this.profile(user), error: '冒険記録を保存できませんでした。操作は確定していません。もう一度お試しください。' }));
    }
    const institutionalUpdates=[...next].filter(([id,p])=>JSON.stringify(p)!==JSON.stringify(this.profiles.get(id))).map(([user])=>user);
    this.profiles = next;
    this.combats = combats;
    this.onlineUsers = new Set(online);
    return [...new Set([...changed.map(update=>update.user),...institutionalUpdates])].map(user=>({user,profile:this.profile(user)})).concat(ambushedGroups.size?[]:this.tickCombats(hour));
  }

  reject(user: string, error: string): FantasyResult {
    return { profile: this.profile(user), error, changed: false };
  }

  private carryContext(user:string):FantasyCarryReturnContext {
    const parties=object(this.savedPartyState)&&Array.isArray(this.savedPartyState.parties)?this.savedPartyState.parties:[];
    const party=parties.find(p=>object(p)&&typeof p.id==='string'&&Array.isArray(p.members)&&p.members.includes(user));
    return object(party)&&Array.isArray(party.members)?{party:String(party.id),allies:party.members.filter((v):v is string=>typeof v==='string')}:{party:`solo:${user}`,allies:[user]};
  }

  carryReturn(user:string,target:string,method:FantasyCarryReturnMethod,context:FantasyCarryReturnContext):{updates:{user:string;profile:FantasyProfile}[];error?:string}{
    if(this.loadError||this.clockError())return{updates:[],error:'save-failed'};
    const hour=this.worldHour?.()??this.profiles.get(user)?.character?.hour??0;
    const result=processFantasyCarryReturn(this.profiles,user,target,method,hour,context);
    if(result.error)return{updates:[],error:result.error};
    if(result.updates.some(update=>!isProfile(update.profile)))return{updates:[],error:'carry:unavailable'};
    try{this.writeState(result.profiles);}catch(error){this.onError(error);return{updates:[],error:'save-failed'};}
    this.profiles=result.profiles;return{updates:result.updates.map(update=>({user:update.user,profile:this.profile(update.user)}))};
  }

  aidDowned(user:string,target:string,method:'potion'|'temple',context:FantasyRealmContext&{allies?:readonly string[]}):{updates:{user:string;profile:FantasyProfile}[];error?:string}{
    const fail=(error:string)=>({updates:[],error});
    if(this.loadError||this.clockError())return fail('save-failed');
    if(!context.allies?.includes(user)||!context.allies.includes(target)||!context.session||user===target||!context.peers.includes(user)||!context.peers.includes(target)||!['potion','temple'].includes(method))return fail('unavailable');
    const a=this.profile(user),b=this.profile(target),c=a.character,d=b.character,hour=this.worldHour?.()??c?.hour??0;
    if(!c||!d||a.death||b.death||c.hp<=0||!d.downed||a.activity||c.returnLantern||a.combatId||a.event||b.combatId||c.location!==d.location||this.onRoad(user)||this.onRoad(target)||hour>=d.downed.expiresAt)return fail('unavailable');
    if(c.dungeon?.active?.site!==d.dungeon?.active?.site||c.dungeon?.active?.room!==d.dungeon?.active?.room)return fail('unavailable');
    if(d.lastDawnPledge||d.downed.dawnDebt)return fail('miracle:pledge-bound');
    const helper=structuredClone(a),patient=structuredClone(b),hc=helper.character!,pc=patient.character!;hc.hour=pc.hour=Math.max(hour,hc.hour,pc.hour);
    if(method==='potion'){
      const item=FANTASY_ITEMS.find(item=>(hc.inventory[item.id]??0)>0&&(item.id==='potion'||item.category==='potion'&&(item.use?.hp??0)>0)&&!item.food&&item.category!=='food');
      if(!item||!stabilizeFantasyDowned(patient,pc.hour))return fail('unavailable');hc.inventory[item.id]--;
    }else{
      const cost=Math.ceil(fantasyStats(pc).hp/4)+5;
      if(!fantasyBuildings(pc).some(building=>building.id==='temple')||hc.gold<cost)return fail('unavailable');
      hc.gold-=cost;wakeFantasyDowned(patient,fantasyStats(pc).hp);pc.effects=pc.effects?.filter(effect=>!['poison','burn','frost','weakness'].includes(effect.id));
    }
    helper.revision++;patient.revision++;const next=new Map(this.profiles);next.set(user,helper);next.set(target,patient);
    if(!isProfile(helper)||!isProfile(patient))return fail('invalid');
    try{this.writeState(next);}catch(error){this.onError(error);return fail('save-failed');}
    this.profiles=next;return{updates:[{user,profile:this.profile(user)},{user:target,profile:this.profile(target)}]};
  }

  combat(user: string, session?: string | null): FantasyCombatState | null {
    const profile = this.profiles.get(user);
    if (!profile?.character || !session) return null;
    const record = profile.combatId ? this.combats.get(profile.combatId) : [...this.combats.values()].filter(record => record.state.status !== 'active'
      && record.session === session && record.state.fighters.some(fighter => fighter.userId === user && fighter.generation === (profile.generation ?? 1))).sort((a, b) => b.state.hour - a.state.hour)[0];
    return record && record.session === session && record.state.fighters.some(fighter => fighter.userId === user && fighter.generation === (profile.generation ?? 1)) ? structuredClone(record.state) : null;
  }

  inspectCombat(user: string, target: string): FantasyCombatStoreResult {
    if (this.loadError || this.clockError()) return { updates: [], error: 'unavailable' };
    const synced = this.synchronize(user);
    if (synced.error) return { updates: [], error: synced.error };
    const profile = this.profile(user), c = profile.character;
    if (!c || profile.death || profile.activity || profile.event || profile.combatId || this.onRoad(user)) return { updates: [], error: 'busy' };
    const error = fantasyCombatWarningError(c, target);
    if (error) return { updates: [], error };
    c.apexWarnings ??= {}; c.apexWarnings[target] = { location: c.location, hour: c.hour }; profile.revision++;
    const result = this.commit(user, { profile, changed: true });
    return result.error ? { updates: [], error: result.error } : { updates: [{ user, profile: result.profile }] };
  }

  guildRaidStarted(offerId:string):number|undefined{
    for(const record of this.combats.values())if(record.state.source===`guild:${offerId}`)return record.state.startedAt;
    for(const profile of this.profiles.values())for(const grant of Object.values(profile.character?.contracts??{}))if(grant.offerId===offerId&&grant.startedAt!==undefined)return grant.startedAt;
  }
  synchronizeGuildRaid(offer:FantasyContractOffer):FantasyCombatStoreResult{
    if(offer.startedAt===undefined&&this.guildRaidStarted(offer.id)!==undefined)return{updates:[]};
    const next=new Map(this.profiles),updates:FantasyCombatStoreResult['updates']=[];
    const fields={grade:offer.grade,startsAt:offer.startsAt,startedAt:offer.startedAt,monster:offer.monster,enemyCount:offer.enemyCount,expiresAt:offer.deadline};
    for(const [user,profile] of this.profiles){const grant=profile.character?.contracts?.[offer.quest];if(!grant||grant.offerId!==offer.id||Object.entries(fields).every(([key,value])=>(grant as unknown as Record<string,unknown>)[key]===value))continue;
      const p=structuredClone(profile);Object.assign(p.character!.contracts![offer.quest],fields);p.revision++;next.set(user,p);updates.push({user,profile:p});}
    if(!updates.length)return{updates:[]};
    try{this.writeState(next);}catch(error){this.onError(error);return{updates:[],error:'save-failed'};}this.profiles=next;return{updates:updates.map(update=>({user:update.user,profile:this.profile(update.user)}))};
  }
  startGuildRaid(plans:readonly FantasyCombatPlan[],offer:FantasyContractOffer):FantasyCombatStoreResult{
    const fail=(error:string):FantasyCombatStoreResult=>({updates:[],error});
    const now=this.worldHour?.()??Math.max(0,...plans.map(plan=>this.profiles.get(plan.user)?.character?.hour??0));
    const quest=FANTASY_QUESTS.find(q=>q.id===offer.quest),monster=offer.monster??(quest?.objective?.type==='hunt'?quest.objective.monster:undefined),enemy=monster?fantasyCombatEnemy(monster):undefined;
    if(this.loadError||this.clockError()||!Array.isArray(plans)||plans.length<1||plans.length>6||offer.mode!=='raid'||offer.startsAt===undefined||offer.startsAt>now||offer.startedAt!==undefined||this.guildRaidStarted(offer.id)!==undefined
      ||!quest?.group||quest.objective?.type!=='hunt'||!enemy||enemy.tier>7||quest.objective.monster!==monster)return fail('unavailable');
    const original=this.profiles,staged=new Map(original);
    for(const plan of plans){const saved=original.get(plan.user),c=saved?.character,grant=c?.contracts?.[quest.id];
      if(!c||saved!.death||saved!.activity||saved!.event||saved!.combatId||c.hp<=0||c.downed||c.returnLantern||c.carrying||c.dungeon?.active||fantasyOnRoad(c)||!c.quests.includes(quest.id)||grant?.offerId!==offer.id||grant.startedAt!==undefined||plan.location!==quest.destination||c.location!==quest.destination||plan.source!=='guild'||plan.target!==offer.id)return fail('busy');
      const advanced=advanceFantasyWorld(saved!,Math.max(c.hour,now),{accrueIdleNeeds:this.onlineUsers.has(plan.user)});if(advanced.error||advanced.profile.death||!advanced.profile.character)return fail('busy');
      const p=advanced.profile,character=p.character!;character.contracts![quest.id]={...grant,grade:offer.grade,startsAt:offer.startsAt,startedAt:now,monster:enemy.id,enemyCount:Math.max(1,Math.min(6,quest.objective.count-grant.progress)),expiresAt:now+FANTASY_CONTRACT_DEADLINE_HOURS};staged.set(plan.user,p);
    }
    // 戦闘と出発済みの受注記録を、同じ保存にまとめる。
    this.profiles=staged;
    try{const result=this.startCombat(plans);if(!result.updates.length)this.profiles=original;return result;}catch(error){this.profiles=original;this.onError(error);return fail('save-failed');}
  }

  startPartyCombat(plans: readonly FantasyCombatPlan[], context?: FantasyPartyGroupContext): FantasyCombatStoreResult { const ordered=context?[...plans].sort((a,b)=>Number(b.user===context.leader)-Number(a.user===context.leader)):plans;return this.startCombat(ordered,Math.random,context); }

  startCombat(plans: readonly FantasyCombatPlan[], rng = Math.random, context?: FantasyPartyGroupContext): FantasyCombatStoreResult {
    const fail = (error: string): FantasyCombatStoreResult => ({ updates: [], error });
    if (this.loadError || this.clockError()) return fail('unavailable');
    if (Array.isArray(plans) && plans.some(plan => plan && this.civicBlocked(plan.user))) return fail('busy');
    if (!Array.isArray(plans) || plans.length < 1 || plans.length > 6 || plans.some(plan => !plan || typeof plan.user !== 'string' || !plan.user || typeof plan.session !== 'string' || !plan.session
      || !count(plan.generation) || typeof plan.location !== 'string' || typeof plan.target !== 'string' || !['hunt', 'story', 'encounter', 'apex', 'challenge', 'escort', 'dungeon','guild'].includes(plan.source))
      || new Set(plans.map(plan => plan.user)).size !== plans.length) return fail('invalid');
    if (context && (context.session !== plans[0].session || !plans.some(plan => plan.user === context.leader) || context.eligible !== undefined && !validFantasyQuestEligibility(context.eligible) || context.dungeonEligible !== undefined && !validFantasyDungeonEligibility(context.dungeonEligible))) return fail('invalid');
    const hour = this.worldHour?.() ?? Math.max(...plans.map(plan => this.profiles.get(plan.user)?.character?.hour ?? 0));
    const next = new Map(this.profiles), prepared: FantasyProfile[] = [];
    let sourcePlan: ReturnType<typeof fantasyCombatStartPlan>;
    for (const plan of plans) {
      if (plan.session !== plans[0].session || plan.location !== plans[0].location || plan.source !== plans[0].source || plan.target !== plans[0].target) return fail('incompatible');
      const saved = this.profiles.get(plan.user);
      if (!saved?.character || saved.combatId || this.sharedProductionPending(saved) || saved.character.hour > hour + 1e-8 || plan.source !== 'encounter' && this.onRoad(plan.user)) return fail('busy');
      const synchronized = advanceFantasyWorld(saved, Math.max(saved.character.hour, hour), { accrueIdleNeeds: this.onlineUsers.has(plan.user) });
      if (synchronized.error) return fail(synchronized.error);
      const p = this.enableCombat(synchronized.profile) as FantasyProfile, c = p.character!;
      if ((p.generation ?? 1) !== plan.generation || c.location !== plan.location) return fail('incompatible');
      if(isFantasyRetreat(c.location)&&!fantasyOnRoad(c))return fail('combat:retreat-safe');
      const escortFollower = !!context && !!sourcePlan?.source.startsWith('escort:') && !p.death && c.hp > 0 && !p.activity && !p.combatId
        && (plan.source === 'escort' && !p.event || plan.source === 'encounter' && p.event === FANTASY_ESCORT_AMBUSH_ENCOUNTER);
      const sharedFollower=!!context&&!!sourcePlan&&['encounter','hunt','dungeon'].includes(plan.source)&&!p.death&&c.hp>0&&!p.activity&&!p.combatId&&!c.downed&&!c.returnLantern
        &&(plan.source==='encounter'?p.event===plan.target:!p.event)&&(plan.source!=='dungeon'||c.dungeon?.active&&`${c.dungeon.active.site}:${c.dungeon.active.room}`===plan.target);
      const error = escortFollower||sharedFollower ? undefined : fantasyCombatStartError(p, plan.source, plan.target, plan.confirm);
      if (error) return fail(error);
      const resolved = escortFollower||sharedFollower ? sourcePlan! : fantasyCombatStartPlan(p, plan.source, plan.target)!;
      if (sourcePlan && (sourcePlan.source !== resolved.source || JSON.stringify(sourcePlan.enemies) !== JSON.stringify(resolved.enemies))) return fail('incompatible');
      sourcePlan = resolved; prepared.push(p);
    }
    if (!sourcePlan) return fail('invalid');
    const sea=plans[0].source==='encounter'?prepared.map(profile=>fantasySeaPosition(profile.character!)):[];
    const naval=sea.some(Boolean);
    if(naval&&sea.some(position=>!position||position.from!==sea[0]?.from||position.to!==sea[0]?.to||Math.abs(position.fraction-sea[0]!.fraction)>1e-8))return fail('incompatible');
    if (sourcePlan.source.startsWith('escort:') && plans.length === 1 && !context) {
      return this.startEscortCombat(plans[0].user, plans[0].session, sourcePlan.source.slice('escort:'.length), rng);
    }
    const escortOwner = sourcePlan.source.startsWith('escort:') ? plans.find((plan, index) => prepared[index].character!.escort?.id === sourcePlan!.source.slice('escort:'.length)) : undefined;
    const assignment = escortOwner && prepared[plans.indexOf(escortOwner)].character!.escort;
    const id = `combat-${randomUUID()}`;
    let state: FantasyCombatState;
    try { state = createFantasyCombat({ id, location: plans[0].location, source: sourcePlan.source, players: prepared.map((p, index) => fantasyCombatPlayer(p, plans[index].user)), enemies: sourcePlan.enemies, seed: Math.floor(Math.max(0, Math.min(.999999999, rng())) * 4294967296), hour, tactical: true,
      ...(plans[0].source !== 'apex' && (plans[0].source === 'encounter' || plans[0].source === 'escort' || FANTASY_LOCATIONS.some(place => place.id === plans[0].location && ['forest', 'cave', 'ruin'].includes(place.kind))) ? { terrain: 'barricade' as const } : {}), ...(escortOwner && assignment ? { escort: { owner: escortOwner.user, contractId: assignment.id, destination: assignment.destination } } : {}) }); }
    catch (error) { this.onError(error); return fail('invalid'); }
    if(naval){setupFantasyNavalCombat(state);if(!validFantasyCombatState(state))return fail('invalid');}
    for (const [index, p] of prepared.entries()) {
      const fighter = state.fighters.find(fighter => fighter.userId === plans[index].user)!;
      const carried = (p.character!.effects ?? []).filter(effect => ['poison', 'burn', 'frost'].includes(effect.id) && effect.expiresAt > p.character!.hour);
      fighter.effects = carried.map(effect => ({ id: effect.id as 'poison' | 'burn' | 'frost', power: effect.id === 'burn' ? 3 : effect.id === 'poison' ? 2 : 1, turns: 3 }));
      if (carried.length) p.character!.effects = p.character!.effects!.filter(effect => !carried.includes(effect));
      p.combatId = id; p.revision++;
      if (sourcePlan.source.startsWith('escort:') && p.event === FANTASY_ESCORT_AMBUSH_ENCOUNTER) p.event = null;
      if (plans[index].source === 'challenge' && fantasyCombatChallengeIsCrime(plans[index].target) || plans[index].source === 'encounter' && plans[index].target === 'encounter-watch') {
        p.character!.notoriety = Math.min(100, (p.character!.notoriety ?? 0) + 4); grantFantasyReputation(p.character!, -4);
      }
      if (!isProfile(p)) return fail('invalid');
      next.set(plans[index].user, p);
    }
    const eligible = context?.eligible?.filter(member => {
      const p = this.profiles.get(member.user), c = p?.character;
      return !!c && !p!.death && c.hp > 0 && (p!.generation ?? 1) === member.generation && c.location === member.location && member.location === plans[0].location
        && c.mainTrials?.[member.quest]?.acceptedAt === member.acceptedAt && fantasyMainStage(c, member.quest)?.id === member.stage && sourcePlan!.victoryKey === `story:${member.quest}:${member.stage}`;
    });
    const dungeonEligible = context?.dungeonEligible?.filter(member => {
      const p = this.profiles.get(member.user), c = p?.character, active = c?.dungeon?.active;
      return !!c && !p!.death && c.hp > 0 && (p!.generation ?? 1) === member.generation && c.location === member.location && active?.site === member.site && active.room === member.room && sourcePlan!.source === `dungeon:${member.site}:${member.room}`;
    });
    const combats = new Map(this.combats); combats.set(id, { state, session: plans[0].session, ...(state.source.startsWith('dungeon:frontier-')?{expeditionSeed:randomUUID()}:{}), ...(sourcePlan.victoryKey ? { victoryKey: sourcePlan.victoryKey } : {}), ...(eligible ? { eligible: structuredClone(eligible) } : {}), ...(dungeonEligible ? { dungeonEligible: structuredClone(dungeonEligible) } : {}), ...(context ? { party: context.party } : {}) });
    this.pruneCombats(combats, next);
    try { this.writeState(next, combats); } catch (error) { this.onError(error); return fail('save-failed'); }
    this.profiles = next; this.combats = combats;
    return { state: structuredClone(state), updates: plans.map(plan => ({ user: plan.user, profile: this.profile(plan.user) })) };
  }

  startEscortCombat(user: string, session: string, contractId: string, rng = Math.random): FantasyCombatStoreResult {
    const fail = (error: string): FantasyCombatStoreResult => ({ updates: [], error });
    if (this.loadError || this.clockError() || !session) return fail('unavailable');
    const synchronized = this.synchronize(user); if (synchronized.error) return fail('busy');
    const original = this.profile(user), c = original.character, assignment = c?.escort;
    if (!c || original.death || c.hp <= 0 || original.activity || original.combatId || this.civicBlocked(user)) return fail('busy');
    // 移動中の襲撃だけは遭遇から直接この戦闘へ入る。他の出来事は先に片付けさせる。
    const ambushed = original.event === FANTASY_ESCORT_AMBUSH_ENCOUNTER;
    if (this.onRoad(user) && !ambushed) return fail('busy');
    if (original.event && !ambushed) return fail('busy');
    const plan = assignment?.id === contractId ? fantasyCombatStartPlan(original, ambushed ? 'encounter' : 'escort', ambushed ? original.event! : contractId) : undefined;
    if (!plan || !assignment || plan.source !== `escort:${assignment.id}`) return fail('incompatible');
    const p = structuredClone(original), hour = this.worldHour?.() ?? c.hour, id = randomUUID();
    const state = createFantasyCombat({ id, location: c.location, source: plan.source, hour, seed: Math.floor(rng() * 0x100000000) >>> 0, tactical: true,
      players: [fantasyCombatPlayer(p, user)], enemies: plan.enemies, terrain: 'barricade', escort: { owner: user, contractId: assignment.id, destination: assignment.destination } });
    if (ambushed) { p.event = null; this.combatLog(p, '護送隊への襲撃だ。馬車を守り抜け。', 'failure'); }
    p.combatId = id; p.revision++;
    const next = new Map(this.profiles); next.set(user, p); const combats = new Map(this.combats); combats.set(id, { state, session });
    try { this.writeState(next, combats); } catch (error) { this.onError(error); return fail('save-failed'); }
    this.profiles = next; this.combats = combats;
    return { state: structuredClone(state), updates: [{ user, profile: this.profile(user) }] };
  }

  combatOrder(user: string, session: string, combatId: string, revision: unknown, order: FantasyCombatOrder): FantasyCombatStoreResult {
    if (this.loadError || this.clockError()) return { updates: [], error: 'unavailable' };
    const record = this.combats.get(combatId), profile = this.profiles.get(user);
    if (!record || record.session !== session || profile?.combatId !== combatId || !record.state.fighters.some(fighter => fighter.userId === user && fighter.generation === (profile.generation ?? 1))) return { updates: [], error: 'not-owner' };
    const hour = this.worldHour?.() ?? profile.character!.hour;
    const result = submitFantasyCombatOrder(record.state, user, revision as number, order, hour, this.combatOptions(record.state));
    if (!result.changed) return { updates: [], state: this.combat(user, session) ?? undefined, ...(result.error ? { error: result.error } : {}) };
    return this.commitCombat(record, result, order.type === 'unit' || order.type === 'escort' ? record.state.orders : { ...record.state.orders, [user]: order });
  }

  private combatOptions(state: FantasyCombatState) { return fantasyCombatSupplies(this.profiles, state.fighters.filter(f => f.userId).map(f => f.userId!)); }

  private combatLog(profile: FantasyProfile, text: string, kind: FantasyProfile['log'][number]['kind'] = 'story') {
    const id = Math.max(0, ...profile.log.map(log => log.id)) + 1;
    profile.log.push({ id, hour: profile.character!.hour, text, kind }); profile.log = profile.log.slice(-100);
  }

  private applyCombatResult(record: StoredCombat, result: FantasyCombatResult, profiles: Map<string, FantasyProfile>, orders: Record<string, FantasyCombatOrder> = record.state.orders): { user: string; profile: FantasyProfile }[] {
    const state = result.state, updates: { user: string; profile: FantasyProfile }[] = [];
    for (const fighter of state.fighters.filter(f => f.userId)) {
      const user = fighter.userId!, saved = profiles.get(user);
      if (!saved?.character || (saved.generation ?? 1) !== fighter.generation) continue;
      const p = structuredClone(saved), c = p.character!;
      const pledged=c.lastDawnPledge?.combat===state.id&&c.lastDawnPledge.generation===(p.generation??1)||fighter.miracles?.dawnDebt&&c.downed?.dawnDebt;
      if (p.combatId !== state.id && record.state.status === 'active' && !(pledged&&state.status!=='active')) continue;
      if(fighter.miracles?.dawnDebt&&!p.death)c.lastDawnPledge={combat:state.id,generation:p.generation??1};
      const elapsed = Math.max(0, Math.floor(state.hour) - Math.floor(c.hour));
      c.hour = Math.max(c.hour, state.hour);
      c.hunger = Math.min(100, c.hunger + elapsed * 2); c.fatigue = Math.min(100, c.fatigue + elapsed * 3);
      const maximum = fantasyStats(c);
      fighter.stats.hp = maximum.hp; fighter.stats.mp = maximum.mp;
      fighter.hp = Math.min(fighter.hp, maximum.hp); fighter.mp = Math.min(fighter.mp, maximum.mp);
      c.hp = fighter.hp; c.mp = fighter.mp;
      fantasyCombatApplyCompanions(p, state, user);
      for (const spent of result.spentItems.filter(item => item.userId === user)) c.inventory[spent.item] = Math.max(0, (c.inventory[spent.item] ?? 0) - spent.count);
      const before = record.state.fighters.find(fighter => fighter.userId === user)!, order = orders[user];
      if(before.externalCarrying&&!fighter.externalCarrying&&c.carrying?.target===before.externalCarrying.user&&c.carrying.targetGeneration===before.externalCarrying.generation)delete c.carrying;
      const unitActions = (state.units ?? []).filter(unit=>unit.companion?.ownerId===user).reduce((sum,unit)=>sum+Math.max(0,unit.contribution.effectiveActions-(record.state.units?.find(prior=>prior.id===unit.id)?.contribution.effectiveActions??0)),0);
      const focusActions = result.usedSkills?.filter(use=>use.userId===user && use.kind !== 'obstacle').length??0;
      const effective = fighter.contribution.effectiveActions-before.contribution.effectiveActions-unitActions-focusActions>0, attempted = fighter.contribution.manualActions > before.contribution.manualActions;
      const commandEffective = (state.units ?? []).some(unit => unit.companion?.ownerId === user && unit.contribution.effectiveActions > (record.state.units?.find(prior => prior.id === unit.id)?.contribution.effectiveActions ?? 0));
      if (commandEffective) grantFantasyPractice(c, { key: `combat:${state.source}:command`.slice(0, 119), amount: 3, success: true, practice: 'command' });
      for (const use of result.usedSkills?.filter(use => use.userId === user) ?? []) {
        const skill = before.skills.find(skill => skill.id === use.skill && (use.kind === 'obstacle' || use.kind==='circle' || use.kind==='mana'||use.kind==='utility'|| skill.kind === 'focus'));
        if (!skill || skill.mp !== use.mp || skill.id===FANTASY_NAVAL_HARPOON) continue;
        const key = `combat:${state.source}:${use.kind === 'obstacle' ? 'obstacle' : 'focus'}`.slice(0, 119);
        const multiplier = fantasyPracticeMultiplier(c, key);
        grantFantasyPractice(c, { key, amount: 4, success: true, ...(!use.skill.startsWith('prepared-spell-') ? { skill: use.skill } : {}) });
        if (use.mp > 0) c.mana = fantasyManaOnUse(c, use.mp, multiplier);
        if(use.kind==='mana')c.manaRecoveryAt=state.hour;
      }
      if (attempted) c.fatigue = Math.min(100, c.fatigue + 1);
      if (order && attempted && (effective || order.type === 'attack' && result.attemptedAttacks?.includes(user))) {
        const key = `combat:${state.source}:${order.type.toLowerCase()}`.slice(0, 119);
        if (effective && order.type === 'skill') {
          const skill = fighter.skills.find(skill => skill.id === order.skill);
          if (skill && skill.kind !== 'focus' && !result.usedSkills?.some(use=>use.userId===user&&use.skill===skill.id&&(use.kind==='circle'||use.kind==='mana'||use.kind==='utility')) && (skill.mp === 0 || before.mp - fighter.mp >= skill.mp)) { if (!skill.id.startsWith('prepared-spell-')&&skill.id!==FANTASY_NAVAL_HARPOON) grantFantasyPractice(c, { key, amount: 4, success: true, skill: skill.id }); if (skill.mp > 0) c.mana = fantasyManaOnUse(c, skill.mp, fantasyPracticeMultiplier(c, key)); }
        }
        const potionPractice = fantasyHasJob(c, 'alchemist') && order.type === 'item' && result.spentItems.some(item => item.userId === user);
        if (fantasyCombatProfessionUsesCombat(c.job) || potionPractice) grantFantasyPractice(c, { key, amount: effective ? 3 : 1, success: effective, ...(potionPractice ? { job: 'alchemist' } : {}) });
        else {
          const prior = c.proficiencyUse;
          c.proficiencyUse = { key, hour: c.hour, repeats: prior?.key === key && c.hour - prior.hour < 6 ? prior.repeats + 1 : 1 };
        }
      }
      if (fighter.hp <= 0 && !p.death) {
        beginFantasyDowned(p,state.hour,fighter.miracles?.downedKind??'damage',fighter.miracles?.severity??1,fighter.miracles?.dawnDebt===true);
        if (p.character?.downed && fighter.miracles?.dawnDebt) p.character.downed.dawnDebt = true;
        if(state.status!=='active'&&c.downed?.kind!=='sacrifice'){
          const town=fantasyRescueTown(c,false,fantasyCompanionRescue(c));
          if(town){c.location=town;delete c.travelPosition;if(c.dungeon)delete c.dungeon.active;if(!c.visited.includes(town))c.visited.push(town);}
        }
      }
      if(fighter.hp>0&&c.downed)delete c.downed;
      if (fighter.miracles?.afflictions?.length) c.soulAfflictions = [...fighter.miracles.afflictions]; else delete c.soulAfflictions;
      if (state.status === 'victory' && (fighter.miracles?.dawnDebt || c.downed?.dawnDebt)) { delete c.downed; delete c.carrying; delete c.returnLantern; delete c.lastDawnPledge; recordFantasyDeath(p,'miracle:last-dawn-death'); }
      else if (state.status !== 'active' && c.downed?.kind === 'sacrifice') { delete c.lastDawnPledge; delete c.downed.dawnDebt; wakeFantasyDowned(p,Math.max(1,Math.ceil(maximum.hp*.2))); }
      if (state.status !== 'active' || fighter.fled) delete p.combatId;
      if (!p.death && c.hp>0 && fighter.hp<=0 && state.status!=='active') for(const effect of fighter.effects)addFantasyStatus(c,effect.id);
      if (!p.death && fighter.hp > 0) {
        if (state.status !== 'active' || fighter.fled) for (const effect of fighter.effects) addFantasyStatus(c, effect.id);
        else {
          const fresh = fantasyCombatPlayer(p, user); fighter.stats = fresh.stats; fighter.skills = fresh.skills; ensureFantasyNavalSkills(state,fighter); if(fresh.externalCarrying&&!fighter.carrying)fighter.externalCarrying=fresh.externalCarrying;else delete fighter.externalCarrying;
          fighter.hp = c.hp = Math.min(c.hp, fresh.stats.hp); fighter.mp = c.mp = Math.min(c.mp, fresh.stats.mp);
        }
      }
      if ((state.status !== 'active'||fighter.fled) && p.event && state.source === `encounter:${p.event}`) p.event = null;
      if (state.status !== 'active' || fighter.fled || fighter.hp <= 0) this.combatLog(p, `戦闘記録［${state.id}］${fighter.fled ? 'escaped' : state.status}。`, state.status === 'victory' ? 'success' : 'failure');
      p.revision++; profiles.set(user, p); updates.push({ user, profile: p });
    }
    refreshFantasyMiracleAwakening(state);
    if (record.state.status === 'active' && state.status === 'victory') {
      const credited = [...this.storyPassage(record, state, profiles, orders), ...this.rewardCombat(record, state, profiles), ...this.partyPassage(record, state, profiles), ...this.dungeonPassage(record, state, profiles)];
      for(const fighter of state.fighters)if(fighter.userId){
        const priest=profiles.get(fighter.userId);if(priest)recordFantasyClergyCombatService(priest,state,fighter.userId);
        const victories=priest?.character?.combatVictories;if(victories){const disposable=Object.keys(victories).filter(key=>!key.startsWith('story:')&&!key.startsWith('service:')).sort((a,b)=>victories[a]-victories[b]);while(Object.keys(victories).length>300&&disposable.length)delete victories[disposable.shift()!];}
      }
      for (const user of credited) if (!updates.some(update => update.user === user)) updates.push({ user, profile: profiles.get(user)! });
    }
    if (state.escort && state.status !== 'active') {
      const originalOwner = profiles.get(state.escort.owner), owner = originalOwner && structuredClone(originalOwner);
      if (owner?.character?.escort?.id === state.escort.contractId && (owner.generation ?? 1) === state.escort.ownerGeneration) {
        const beforeDeparture = owner.character.escort.defense === 'pending';
        if (state.status === 'victory' && state.escort.wagon.hp > 0) owner.character.escort.defense = 'cleared';
        else delete owner.character.escort;
        owner.revision++;
        profiles.set(state.escort.owner, owner);
        this.combatLog(owner, state.status === 'victory'
          ? beforeDeparture ? '護衛隊の出発路を確保した。' : '護送隊を守り抜いた。旅を続けられる。'
          : '護送隊を守れず、依頼は終了した。', state.status === 'victory' ? 'success' : 'failure');
        if (!updates.some(update=>update.user===state.escort!.owner)) updates.push({user:state.escort.owner,profile:owner});
      }
    }
    const carriedUsers=transferFantasyCombatCarry(state,profiles,user=>this.carryContext(user));
    const carrySync=advanceFantasyCarryReturn(profiles,state.hour,user=>this.carryContext(user));
    for(const update of carrySync.updates)profiles.set(update.user,update.profile);
    for(const user of new Set([...carriedUsers,...carrySync.updates.map(update=>update.user)]))if(!updates.some(update=>update.user===user))updates.push({user,profile:profiles.get(user)!});
    for (const update of updates) { const p = profiles.get(update.user)!; reconcileFoodLots(p.character!); update.profile = p; }
    return updates;
  }

  private dungeonPassage(record: StoredCombat, state: FantasyCombatState, profiles: Map<string, FantasyProfile>): string[] {
    if (!state.source.startsWith('dungeon:')) return [];
    const target = state.source.slice('dungeon:'.length), credited: string[] = [];
    const fighters = state.fighters.filter(fighter => fighter.userId && (fighter.hp > 0 || fighter.miracles?.downedKind==='sacrifice'&&!fighter.miracles.dawnDebt) && !fighter.fled);
    const users = new Set([...fighters.map(fighter => fighter.userId!), ...(record.dungeonEligible ?? []).map(member => member.user)]);
    for (const user of users) {
      const fighter = fighters.find(fighter => fighter.userId === user), member = record.dungeonEligible?.find(member => member.user === user), original = profiles.get(user), c = original?.character;
      if (!c || original!.death || c.hp <= 0 || !c.dungeon?.active || (original!.generation ?? 1) !== (fighter?.generation ?? member?.generation)
        || c.location !== state.location || `${c.dungeon.active.site}:${c.dungeon.active.room}` !== target || original!.combatId && original!.combatId !== state.id) continue;
      if (!fighter && record.party && object(this.savedPartyState) && Array.isArray(this.savedPartyState.parties)
        && !this.savedPartyState.parties.some(party => object(party) && party.id === record.party && party.session === record.session && Array.isArray(party.members) && party.members.includes(user))) continue;
      const p = structuredClone(original!); if (!markFantasyDungeonVictory(p.character!, target)) continue;
      const site=p.character!.dungeon!.active!.site;
      const draw=createHash('sha256').update(`${record.expeditionSeed??state.id}:${user}:${site}:reward`).digest().readUInt32BE(0)/0x100000000;
      const loot=fantasyExpeditionRuinReward(p.character!,site,()=>draw,`${record.expeditionSeed??state.id}:${user}`);
      if(loot)this.combatLog(p,loot.item?`expedition:artifact:${loot.item}`:'expedition:ruin-empty',loot.item?'success':'story');
      p.revision++; this.combatLog(p, '仲間と遺跡の守り手を退け、この部屋の先へ進めるようになった。', 'success'); profiles.set(user, fantasyEscrowBagOverflow(original!,p)); credited.push(user);
    }
    return credited;
  }

  private storyPassage(record: StoredCombat, state: FantasyCombatState, profiles: Map<string, FantasyProfile>, orders: Record<string, FantasyCombatOrder>): string[] {
    if (!record.victoryKey) return [];
    const credited: string[] = [];
    for (const fighter of state.fighters) {
      const user = fighter.userId, before = user ? record.state.fighters.find(fighter => fighter.userId === user) : undefined, profile = user ? profiles.get(user) : undefined;
      if (!user || !before || !profile?.character || profile.death || fighter.fled || fighter.hp <= 0 && fighter.miracles?.downedKind!=='sacrifice' || !orders[user]
        || fighter.contribution.manualActions <= before.contribution.manualActions || (profile.generation ?? 1) !== fighter.generation
        || this.profiles.get(user)?.combatId !== state.id || profile.character.location !== state.location) continue;
      const next = structuredClone(profile); next.character!.combatVictories ??= {}; next.character!.combatVictories[record.victoryKey] = next.character!.hour;
      profiles.set(user, next); credited.push(user);
    }
    return credited;
  }

  private partyPassage(record: StoredCombat, state: FantasyCombatState, profiles: Map<string, FantasyProfile>): string[] {
    if (!record.victoryKey || !record.eligible) return [];
    const credited: string[] = [];
    for (const member of record.eligible) {
      if (record.party && object(this.savedPartyState) && Array.isArray(this.savedPartyState.parties)
        && !this.savedPartyState.parties.some(party => object(party) && party.id === record.party && party.session === record.session && Array.isArray(party.members) && party.members.includes(member.user))) continue;
      const original = profiles.get(member.user), c = original?.character;
      if (!c || original!.death || c.hp <= 0 || (original!.generation ?? 1) !== member.generation || c.location !== member.location || member.location !== state.location
        || original!.combatId && original!.combatId !== state.id || c.mainTrials?.[member.quest]?.acceptedAt !== member.acceptedAt
        || fantasyMainStage(c, member.quest)?.id !== member.stage || record.victoryKey !== `story:${member.quest}:${member.stage}` || c.combatVictories?.[record.victoryKey] !== undefined) continue;
      const next = structuredClone(original!); next.character!.hour = Math.max(c.hour, state.hour); next.character!.combatVictories ??= {};
      next.character!.combatVictories[record.victoryKey] = next.character!.hour; next.revision++;
      this.combatLog(next, '仲間が道を開いた。同じ依頼の調査を続けられる。'); profiles.set(member.user, next); credited.push(member.user);
    }
    return credited;
  }

  private rewardCombat(record: StoredCombat, state: FantasyCombatState, profiles: Map<string, FantasyProfile>) {
    const participated = new Set(fantasyPartyRewardEligibility(state.scaling, { outcome: 'victory', totalRounds: state.round, contributions: state.fighters.filter(fighter => fighter.userId).map(fighter => ({
      playerId: fighter.userId!, effectiveActions: fighter.contribution.effectiveActions, activeRounds: fighter.contribution.activeRounds, exit: fighter.hp <= 0 ? 'incapacitated' as const : fighter.fled ? 'left' as const : 'present' as const,
    })) }));
    const eligible = state.fighters.filter(f => {
      const profile = f.userId ? profiles.get(f.userId) : undefined;
      return !!profile?.character && !f.fled && participated.has(f.userId!) && (profile.generation ?? 1) === f.generation;
    }).map(f => f.userId!).sort();
    const enemies = state.fighters.filter(f => f.side === 'enemies'&&!fantasyNavalAuxiliary(state,f)).map(f => fantasyCombatEnemy(f.template!)!).filter(Boolean);
    for (const user of eligible) {
      const p = structuredClone(profiles.get(user)!); profiles.set(user, p); if (!p.character) continue; const c = p.character!, before = fantasyStats(c);
      c.hour = Math.max(c.hour, state.hour);
      c.combatVictories ??= {}; c.combatVictories[record.victoryKey ?? state.source] = c.hour;
      const disposable = Object.entries(c.combatVictories).filter(([key]) => !key.startsWith('story:')&&!key.startsWith('service:')).sort((a,b) => a[1]-b[1]);
      while (Object.keys(c.combatVictories).length > 300 && disposable.length) delete c.combatVictories[disposable.shift()![0]];
      const xp = enemies.reduce((sum, enemy) => sum + enemy.reward.xp, 0); c.xp += xp;
      while (c.xp >= c.level * 30) { c.xp -= c.level * 30; c.level++; }
      const after = fantasyStats(c);
      if (!p.death) { if(!c.downed&&c.hp>0)c.hp = Math.min(after.hp, c.hp + Math.max(0, after.hp - before.hp)); c.mp = Math.min(after.mp, c.mp + Math.max(0, after.mp - before.mp)); }
      for (const enemy of enemies) if (enemy.reward.honor) { c.honors ??= []; if (!c.honors.includes(enemy.reward.honor.id)) c.honors.push(enemy.reward.honor.id); }
      const oldMonster = enemies.find(enemy=>enemy.kind==='monster');
      if(oldMonster)c.lastHunt={id:oldMonster.id,location:state.location,hour:c.hour,success:true,count:enemies.filter(enemy=>enemy.id===oldMonster.id).length,receipt:state.id};
      for(const [questId,grant] of Object.entries(c.contracts??{})){
        const quest=FANTASY_QUESTS.find(q=>q.id===questId),objective=quest?.objective;
        if(objective?.type!=='hunt'||quest!.destination!==state.location||grant.acceptedAt>state.startedAt||grant.expiresAt<=state.hour||grant.startsAt!==undefined&&grant.startedAt===undefined)continue;
        const kills=enemies.filter(enemy=>!objective.monster||enemy.id===objective.monster).length;
        grant.progress=Math.min(objective.count,grant.progress+kills);
      }
      this.combatLog(p, `戦闘勝利。経験値${xp}。`, 'success');
    }
    if (!eligible.length) return eligible;
    const deliveryBefore = new Map(eligible.map(user => [user, structuredClone(profiles.get(user)!)]));
    const gold = enemies.reduce((sum, enemy) => sum + enemy.reward.gold, 0), offset = parseInt(createHash('sha256').update(state.id).digest('hex').slice(0, 8), 16) % eligible.length;
    for (let i = 0; i < eligible.length; i++) {
      const p = profiles.get(eligible[(i + offset) % eligible.length])!, amount = Math.floor(gold / eligible.length) + (i < gold % eligible.length ? 1 : 0);
      p.character!.gold += amount;
      if (amount) this.combatLog(p, `戦果の金貨${amount}枚を受け取った。`, 'success');
    }
    let index = offset;
    for (const enemy of enemies) for (const material of enemy.reward.materials) {
      if (!FANTASY_ITEMS.some(item => item.id === material.item)) continue;
      for (let n = 0; n < material.count; n++) { const p = profiles.get(eligible[index++ % eligible.length])!, c = p.character!; c.inventory[material.item] = (c.inventory[material.item] ?? 0) + 1; this.combatLog(p, `戦果の品［${material.item}］を1個受け取った。`, 'success'); }
    }
    for(const enemy of enemies){
      if(state.source!==`hunt:${enemy.id}`)continue;
      const recipient=profiles.get(eligible[index++%eligible.length])!,loot=grantFantasyFrontierHuntLoot(recipient.character!,enemy.id);
      if(loot?.meat)this.combatLog(recipient,`戦果の品［meat］を${loot.meat}個受け取った。`,'success');
      if(loot?.carcass)this.combatLog(recipient,'expedition:carcass','story');
    }
    for (const user of eligible) {
      const rewarded = profiles.get(user)!; reconcileFoodLots(rewarded.character!);
      profiles.set(user, fantasyEscrowBagOverflow(deliveryBefore.get(user)!, rewarded));
    }
    return eligible;
  }

  private commitCombat(record: StoredCombat, result: FantasyCombatResult, orders?: Record<string, FantasyCombatOrder>): FantasyCombatStoreResult {
    const profiles = new Map(this.profiles), combats = new Map(this.combats), updates = this.applyCombatResult(record, result, profiles, orders);
    if (!updates.every(update => isProfile(update.profile))) return { updates: [], error: 'invalid' };
    combats.set(result.state.id, { ...record, state: result.state });
    try { this.writeState(profiles, combats); } catch (error) { this.onError(error); return { updates: [], error: 'save-failed' }; }
    this.profiles = profiles; this.combats = combats;
    return { updates: updates.map(update => ({ user: update.user, profile: this.profile(update.user) })), state: structuredClone(result.state), ...(result.error ? { error: result.error } : {}) };
  }

  private tickCombats(hour: number): { user: string; profile: FantasyProfile; error?: string }[] {
    const profiles = new Map(this.profiles), combats = new Map(this.combats), updates: { user: string; profile: FantasyProfile; error?: string }[] = [];
    for (const record of this.combats.values()) {
      if (record.state.status !== 'active' || record.state.deadline > hour) continue;
      const result = advanceFantasyCombat(record.state, hour, this.combatOptions(record.state));
      if (!result.changed) continue;
      const changed = this.applyCombatResult(record, result, profiles);
      if (!changed.every(update => isProfile(update.profile))) { this.onError(new Error('Invalid combat progress')); continue; }
      combats.set(result.state.id, { ...record, state: result.state }); updates.push(...changed);
    }
    if (!updates.length) return [];
    try { this.writeState(profiles, combats); } catch (error) { this.onError(error); return updates.map(update => ({ user: update.user, profile: this.profile(update.user), error: 'save-failed' })); }
    this.profiles = profiles; this.combats = combats;
    return updates.map(update => ({ user: update.user, profile: this.profile(update.user) }));
  }

  private pruneCombats(combats: Map<string, StoredCombat>, profiles: ReadonlyMap<string, FantasyProfile>) {
    const active = new Set([...profiles.values()].map(profile => profile.combatId).filter(Boolean));
    const old = [...combats.values()].filter(record => record.state.status !== 'active' && !active.has(record.state.id)).sort((a, b) => b.state.hour - a.state.hour);
    for (const record of old.slice(300)) combats.delete(record.state.id);
  }

  joinCombat(user: string, session: string, combatId: string, confirm?: boolean): FantasyCombatStoreResult {
    const fail = (error: string): FantasyCombatStoreResult => ({ updates: [], error });
    if (this.loadError || this.clockError()) return fail('unavailable');
    if (this.civicBlocked(user)) return fail('busy');
    const record = this.combats.get(combatId), saved = this.profiles.get(user);
    if (!record || record.session !== session || record.state.status !== 'active' || !saved?.character) return fail('not-active');
    if (this.sharedProductionPending(saved)) return fail('busy');
    const separator = record.state.source.indexOf(':'), source = record.state.source.slice(0, separator) as FantasyCombatStartKind;
    const tail = record.state.source.slice(separator + 1), target = source === 'story' ? tail.slice(0, tail.lastIndexOf(':')) : tail;
    const synchronized = advanceFantasyWorld(saved, Math.max(saved.character.hour, this.worldHour?.() ?? record.state.hour), { accrueIdleNeeds: this.onlineUsers.has(user) });
    if (synchronized.error) return fail('busy');
    const p = structuredClone(synchronized.profile);
    if (p.activity || p.combatId || p.event && source !== 'encounter' || p.death || !p.character || p.character.hp <= 0) return fail('busy');
    if (p.character!.location !== record.state.location) return fail('incompatible');
    if(record.state.naval){
      const here=fantasySeaPosition(p.character),anchor=record.state.fighters.filter(f=>f.userId&&f.hp>0&&!f.fled&&this.profiles.get(f.userId!)?.combatId===record.state.id).map(f=>this.profiles.get(f.userId!)?.character).map(c=>c&&fantasySeaPosition(c)).find(Boolean);
      if(!here||!anchor||here.from!==anchor.from||here.to!==anchor.to||Math.abs(here.fraction-anchor.fraction)>1e-8)return fail('incompatible');
    }

    if (source === 'encounter' && p.event) return fail('busy');
    const context = source === 'encounter' ? { ...p, event: target } : p;
    const error = source === 'escort' ? undefined : fantasyCombatStartError(context, source, target, confirm);
    if (error) return fail(error);
    if (source !== 'escort' && fantasyCombatStartPlan(context, source, target)?.source !== record.state.source) return fail('incompatible');
    const hour = this.worldHour?.() ?? Math.max(record.state.hour, p.character!.hour);
    if (hour >= record.state.deadline) return fail('stale');
    const result = addFantasyCombatParticipant(record.state, fantasyCombatPlayer(p, user), hour);
    if (!result.changed) return fail(result.error ?? 'invalid');
    p.combatId = combatId; p.revision++;
    if (source === 'challenge' && fantasyCombatChallengeIsCrime(target) || source === 'encounter' && target === 'encounter-watch') {
      p.character!.notoriety = Math.min(100, (p.character!.notoriety ?? 0) + 4); grantFantasyReputation(p.character!, -4);
    }
    if (!isProfile(p)) return fail('invalid');
    const next = new Map(this.profiles); next.set(user, p);
    const combats = new Map(this.combats); combats.set(combatId, { ...record, state: result.state });
    try { this.writeState(next, combats); }
    catch (error) { this.onError(error); return fail('save-failed'); }
    this.profiles = next; this.combats = combats;
    return { state: structuredClone(result.state), updates: [{ user, profile: this.profile(user) }] };
  }

  private hasCarriedPatient(user:string,context?:FantasyPartyGroupContext):boolean{
    const p=this.profiles.get(user),c=p?.character,link=c?.carrying,patient=link&&this.profiles.get(link.target),d=patient?.character;
    return !!context&&!!c&&!!link&&!!patient&&!!d?.downed&&!p!.death&&!patient.death&&c.hp>0&&d.hp===0&&d.downed.expiresAt>(this.worldHour?.()??c.hour)&&link.party===context.party&&this.carryContext(user).party===context.party&&this.carryContext(user).allies.includes(link.target)&&link.generation===(p!.generation??1)&&link.targetGeneration===(patient.generation??1)&&c.location===d.location&&c.dungeon?.active?.site===d.dungeon?.active?.site&&c.dungeon?.active?.room===d.dungeon?.active?.room;
  }

  startGroupDungeon(plans: readonly FantasyGroupDungeonPlan[], _context?: FantasyPartyGroupContext, rng = Math.random): FantasyGroupInvestigationResult {
    const fail = (error: FantasyPartyError): FantasyGroupInvestigationResult => ({ updates: [], error });
    if (this.loadError || this.clockError()) return fail('unavailable');
    if (!Array.isArray(plans) || plans.length < (plans.length===1&&this.hasCarriedPatient(plans[0].user,_context)?1:2) || plans.length > 6 || new Set(plans.map(plan => plan.user)).size !== plans.length
      || plans.some(plan => !plan || !isFantasyDungeonAction(plan.action) || !['dungeonEnter', 'dungeonMove', 'dungeonInspect', 'dungeonExit'].includes(plan.action.type))) return fail('invalid');
    const next = new Map(this.profiles), hour = this.worldHour?.() ?? Math.max(...plans.map(plan => this.profiles.get(plan.user)?.character?.hour ?? 0));
    const findings: { site: string; room: string }[] = [];
    const first=plans[0],site=first.action.type==='dungeonEnter'?first.action.site:first.site;
    const leader=plans.find(plan=>plan.user===_context?.leader)??first;
    const previousLayout=site?this.profiles.get(leader.user)?.character?.dungeon?.sites[site]:undefined;
    const layoutSeed=previousLayout?.layoutSeed??(previousLayout?undefined:1+Math.floor(Math.max(0,Math.min(.999999999999,rng()))*0xffffffff));
    for (const plan of plans) {
      const saved = this.profiles.get(plan.user), c = saved?.character, active = c?.dungeon?.active;
      if (!c || saved!.death || c.hp <= 0 || saved!.activity || saved!.event || saved!.combatId || this.civicBlocked(plan.user) || this.onRoad(plan.user)
        || (saved!.generation ?? 1) !== plan.generation || c.location !== plan.location || active?.site !== plan.site || active?.room !== plan.room) return fail('stale');
      if (plan.location !== plans[0].location || plan.site !== plans[0].site || plan.room !== plans[0].room || JSON.stringify(plan.action) !== JSON.stringify(plans[0].action)) return fail('incompatible');
      const synced = advanceFantasyWorld(saved!, Math.max(hour, c.hour)); if (synced.error) return fail('busy');
      const shared=structuredClone(synced.profile);
      if(site&&!alignFantasyDungeonLayout(shared.character!,site,layoutSeed))return fail('incompatible');
      const result = applyFantasyDungeonAction(shared, plan.action, rng); if (result.error || !result.changed) return fail('incompatible');
      if (result.finding) findings.push(result.finding); next.set(plan.user, result.profile);
    }
    for (const finding of findings) for (const plan of plans) { const p = next.get(plan.user)!; shareFantasyDungeonFinding(p.character!, finding.site, finding.room); }
    const carried=advanceFantasyCarryReturn(next,hour,user=>this.carryContext(user));for(const update of carried.updates)next.set(update.user,update.profile);
    if(carried.updates.some(update=>!isProfile(update.profile)))return fail('invalid');
    if (!plans.every(plan => isProfile(next.get(plan.user)))) return fail('invalid');
    try { this.writeState(next); } catch (error) { this.onError(error); return fail('save-failed'); }
    this.profiles = next; return { updates: [...new Set([...plans.map(plan=>plan.user),...carried.updates.map(update=>update.user)])].map(user=>({user,profile:this.profile(user)})) };
  }

  startGroupTravel(plans: readonly FantasyGroupTravelPlan[], context?: FantasyPartyGroupContext, rng = Math.random): FantasyGroupInvestigationResult {
    const fail = (error: FantasyPartyError): FantasyGroupInvestigationResult => ({ updates: [], error });
    if (this.loadError || this.clockError()) return fail('unavailable');
    if (plans.some(plan => this.civicBlocked(plan.user))) return fail('busy');
    if (plans.length < (plans.length===1&&this.hasCarriedPatient(plans[0].user,context)?1:2) || plans.length > 6 || new Set(plans.map(plan => plan.user)).size !== plans.length) return fail('invalid');
    const hour = this.worldHour?.() ?? Math.max(...plans.map(plan => this.profiles.get(plan.user)?.character?.hour ?? 0));
    const next = new Map(this.profiles), updates: { user: string; profile: FantasyProfile }[] = [];
    for (const plan of plans) {
      if (plan.location !== plans[0].location || plan.destination !== plans[0].destination || plan.transport !== plans[0].transport && !(context && plans[0].transport === 'escort' && plan.user !== context.leader && plan.transport === 'foot')) return fail('incompatible');
      const saved = this.profiles.get(plan.user);
      if (!saved?.character || saved.death || saved.combatId || saved.activity || saved.event || saved.character.dungeon?.active || saved.character.hp <= 0 || saved.character.hour > hour + 1e-8 || (saved.generation ?? 1) !== plan.generation || saved.character.location !== plan.location) return fail('busy');
      const synced = advanceFantasyWorld(saved, Math.max(hour, saved.character.hour), { accrueIdleNeeds: this.onlineUsers.has(plan.user) });
      if (synced.error) return fail('unavailable');
      const travelProfile=this.expeditionProfile(synced.profile);
      if(this.expeditionPassengerError(travelProfile,plan.destination,plan.transport))return fail('incompatible');
      const quote = fantasyTransports(travelProfile.character!, plan.destination).find(route => route.id === plan.transport && route.available);
      if (!quote || plan.quotedCost !== undefined && quote.cost !== plan.quotedCost || plan.quotedHours !== undefined && quote.hours !== plan.quotedHours) return fail('incompatible');
      const result = startFantasyActivity(travelProfile, { type: 'travel', destination: plan.destination, transport: plan.transport }, hour, rng);
      if (!result.changed || result.error || !result.profile.activity) return fail('incompatible');
      next.set(plan.user, result.profile); updates.push({ user: plan.user, profile: result.profile });
    }
    const arrival = fantasyTravelPartyPace(updates.map(update => update.profile.activity!));
    if(arrival===undefined)return fail('incompatible');
    const seed = updates[0].profile.activity!.seed;
    for (const update of updates) {
      // 同じ隊列で歩く全員が同じ時刻に同じ襲撃を受けるよう、抽選の種をそろえる。
      update.profile.activity!.seed = seed;
      update.profile.character!.travelPosition=fantasyTravelPosition(update.profile.activity!,update.profile.character!.hour);
      if (!isProfile(update.profile)) return fail('invalid');
    }
    const members = plans.map(plan => ({ user: plan.user, generation: plan.generation, location: plan.location, startedAt: next.get(plan.user)!.activity!.startedAt, seed }));
    const cohorts: FantasyCohort[] = [...this.cohorts.filter(cohort => !cohort.members.some(member => plans.some(plan => plan.user === member.user))),
      { id: randomUUID(), kind: 'travel', session: context?.session ?? 'local', leader: context?.leader ?? plans[0].user, destination: plans[0].destination, transport: plans[0].transport, endsAt: arrival, members }];
    try { this.writeState(next, this.combats, this.properties, this.vaults, this.economy, this.civics, cohorts); }
    catch (error) { this.onError(error); return fail('save-failed'); }
    this.profiles = next; return { updates };
  }

  startGroupRedirect(plans: readonly FantasyGroupTravelPlan[], context?: FantasyPartyGroupContext): FantasyGroupInvestigationResult {
    const fail = (error: FantasyPartyError): FantasyGroupInvestigationResult => ({ updates: [], error });
    if (this.loadError || this.clockError()) return fail('unavailable');
    if (!Array.isArray(plans) || plans.length < (plans.length===1&&this.hasCarriedPatient(plans[0].user,context)?1:2) || plans.length > 6 || new Set(plans.map(plan => plan.user)).size !== plans.length) return fail('invalid');
    const cohort = this.cohorts.find((entry): entry is FantasyTravelCohort => entry.kind === 'travel' && entry.members.length >= plans.length && plans.every(plan=>entry.members.some(member=>member.user===plan.user)) && entry.members.every(member => plans.some(plan => plan.user === member.user || this.profiles.get(plan.user)?.character?.carrying?.target===member.user&&this.hasCarriedPatient(plan.user,context))));
    if (!cohort || context && (cohort.session !== context.session || cohort.leader !== context.leader&&!plans.some(plan=>this.profiles.get(plan.user)?.character?.carrying?.target===cohort.leader&&this.hasCarriedPatient(plan.user,context)))) return fail('stale');
    const hour = this.worldHour?.() ?? Math.max(...plans.map(plan => this.profiles.get(plan.user)?.character?.hour ?? 0));
    const next = new Map(this.profiles), updates: FantasyGroupInvestigationResult['updates'] = [];
    const lead = this.profiles.get(context?.leader??cohort.leader), activity = lead?.activity;
    if (this.ambushEnabled && activity && lead?.character) {
      const base = activity.travel?.ambushStartedAt ?? activity.startedAt;
      if (fantasyAmbushHit({ ...activity, startedAt: base }, Math.min(hour, activity.endsAt), Math.max(lead.character.hour, base + (activity.travel?.ambushChecked ?? 0) / 12))) return fail('stale');
      if (fantasyMapMerchantHit(activity, Math.min(hour, activity.endsAt), Math.max(lead.character.hour, base + (activity.travel?.ambushChecked ?? 0) / 12))) return fail('stale');
    }
    for (const plan of plans) {
      const saved = this.profiles.get(plan.user), member = cohort.members.find(member => member.user === plan.user)!;
      if (!saved?.character || this.civicBlocked(plan.user) || !fantasyCohortActivityMatches(saved, member, 'travel') || saved.combatId || saved.event
        || (saved.generation ?? 1) !== plan.generation || plan.location !== saved.character.location
        || plan.activitySeed !== undefined && plan.activitySeed !== saved.activity!.seed || plan.activityStartedAt !== undefined && plan.activityStartedAt !== saved.activity!.startedAt) return fail('stale');
      if (plan.destination !== plans[0].destination || plan.transport !== plans[0].transport) return fail('incompatible');
      const originalQuote = fantasyTravelRedirectQuote(saved, plan.destination, plan.transport, plan.quotedAt ?? saved.character.hour);
      if (!originalQuote || plan.quotedCost !== undefined && originalQuote.cost !== plan.quotedCost || plan.quotedHours !== undefined && Math.abs(originalQuote.hours - plan.quotedHours) > 1e-8) return fail('stale');
      const advanced = advanceFantasyWorld(saved, hour, { accrueIdleNeeds: this.onlineUsers.has(plan.user) });
      if (advanced.error || advanced.profile.activity?.action.type !== 'travel') return fail('stale');
      const freshQuote = fantasyTravelRedirectQuote(advanced.profile, plan.destination, plan.transport);
      if (!freshQuote || freshQuote.cost > originalQuote.cost) return fail('stale');
      const result = applyFantasyAction(advanced.profile, { type: 'redirect', destination: plan.destination, transport: plan.transport });
      if (result.error || !result.changed || !result.profile.activity) return fail('incompatible');
      next.set(plan.user, result.profile); updates.push({ user: plan.user, profile: result.profile });
    }
    const arrival = fantasyTravelPartyPace(updates.map(update => update.profile.activity!));
    if(arrival===undefined)return fail('incompatible');
    for (const update of updates) { if (!isProfile(update.profile)) return fail('invalid'); }
    const changed: FantasyTravelCohort = { ...cohort, leader:context?.leader??cohort.leader, destination: plans[0].destination, transport: plans[0].transport, endsAt: arrival,
      members: plans.map(plan => ({ user: plan.user, generation: plan.generation, location: plan.location, seed: next.get(plan.user)!.activity!.seed, startedAt: next.get(plan.user)!.activity!.startedAt })) };
    try { this.writeState(next, this.combats, this.properties, this.vaults, this.economy, this.civics, this.cohorts.map(entry => entry.id === cohort.id ? changed : entry)); }
    catch (error) { this.onError(error); return fail('save-failed'); }
    this.profiles = next; return { updates: updates.map(update => ({ user: update.user, profile: this.profile(update.user) })) };
  }

  startGroupInvestigation(plans: readonly FantasyGroupInvestigationPlan[], rng = Math.random): FantasyGroupInvestigationResult {
    const fail = (error: FantasyPartyError): FantasyGroupInvestigationResult => ({ updates: [], error });
    if (this.loadError || this.clockError()) return fail('unavailable');
    if (Array.isArray(plans) && plans.some(plan => plan && this.civicBlocked(plan.user))) return fail('busy');
    if (!Array.isArray(plans) || plans.length < 2 || plans.length > FANTASY_PARTY_MAX_MEMBERS || !plans.every(plan => object(plan) && Object.keys(plan).length === 6
      && typeof plan.user === 'string' && plan.user.length > 0 && plan.user.length <= 160 && id(plan.quest) && id(plan.location)
      && count(plan.generation) && plan.generation >= 1 && typeof plan.stage === 'string' && ['field', 'verify', 'compare'].includes(plan.stage)
      && typeof plan.approach === 'string' && ['observe', 'analyze', 'restore'].includes(plan.approach)) || new Set(plans.map(plan => plan.user)).size !== plans.length) return fail('invalid');
    const hour = this.worldHour?.() ?? Math.max(...plans.map(plan => this.profiles.get(plan.user)?.character?.hour ?? 0));
    if (!Number.isFinite(hour) || hour < 0) return fail('unavailable');
    const next = new Map(this.profiles), updates: FantasyGroupInvestigationResult['updates'] = [];
    for (const plan of plans) {
      if (!plan || typeof plan.user !== 'string' || plan.quest !== plans[0].quest || plan.location !== plans[0].location || plan.stage !== plans[0].stage
        || !isFantasyAction({ type: 'investigate', quest: plan.quest, approach: plan.approach })) return fail('invalid');
      const saved = this.profiles.get(plan.user);
      if (!saved?.character || saved.death || saved.activity || saved.event || saved.combatId || saved.character.hp <= 0 || this.surfaceBlocked(plan.user)) return fail('busy');
      if (saved.character.hour > hour + 1e-8) return fail('incompatible');
      const synchronized = advanceFantasyWorld(saved, Math.max(hour, saved.character.hour), { accrueIdleNeeds: this.onlineUsers.has(plan.user) });
      if (synchronized.error) return fail('unavailable');
      const current = synchronized.profile, c = current.character!;
      if (current.death || current.activity || current.event || current.combatId || (current.generation ?? 1) !== plan.generation || c.location !== plan.location
        || fantasyMainStage(c, plan.quest)?.id !== plan.stage) return fail('incompatible');
      const started = startFantasyActivity(current, { type: 'investigate', quest: plan.quest, approach: plan.approach }, hour, rng);
      if (started.error || !started.changed || !isProfile(started.profile)) return fail('incompatible');
      next.set(plan.user, started.profile); updates.push({ user: plan.user, profile: started.profile });
    }
    const members = plans.map(plan => {
      const p = next.get(plan.user)!, activity = p.activity!;
      return { user: plan.user, generation: plan.generation, location: plan.location, startedAt: activity.startedAt, seed: activity.seed,
        acceptedAt: p.character!.mainTrials![plan.quest].acceptedAt, approach: plan.approach };
    });
    const cohorts: FantasyCohort[] = [...this.cohorts.filter(cohort => !cohort.members.some(member => plans.some(plan => plan.user === member.user))),
      { id: randomUUID(), kind: 'investigation', quest: plans[0].quest, stage: plans[0].stage, endsAt: updates[0].profile.activity!.endsAt, members }];
    try { this.writeState(next, this.combats, this.properties, this.vaults, this.economy, this.civics, cohorts); }
    catch (error) { this.onError(error); return fail('save-failed'); }
    this.profiles = next;
    return { updates: updates.map(update => ({ user: update.user, profile: this.profile(update.user) })) };
  }

  testReset(user: string, revision: unknown): FantasyResult {
    if (this.loadError || this.clockError()) return this.reject(user, this.loadError ?? this.clockError()!);
    const synchronized = this.synchronize(user);
    if (synchronized.error) return synchronized;
    const current = this.profile(user);
    if (current.combatId) return this.reject(user, '戦闘を終えるか退却してから人生を初期化してください。');
    if (!Number.isSafeInteger(revision) || revision !== current.revision) return this.reject(user, '冒険記録が更新されました。最新の記録でやり直してください。');
    const result = resetFantasyTestLife(current);
    return result.changed ? this.commit(user, result) : result;
  }

  apply(user: string, revision: unknown, action: unknown, rng = Math.random, options: { contract?: FantasyContractGrant; realm?: string } = {}): FantasyResult {
    if (this.loadError) return this.reject(user, this.loadError);
    if (this.clockError()) return this.reject(user, this.clockError()!);
    if (!isFantasyAction(action)) return this.reject(user, '操作の形式が正しくありません。');
    if (action.type === 'redirect' && this.cohorts.some(cohort => cohort.kind === 'travel' && cohort.members.some(member => member.user === user && fantasyCohortActivityMatches(this.profiles.get(user), member, 'travel'))))
      return this.reject(user, '共同の旅は、全員が新しい目的地と経路に同意してから進路を変えてください。');
    const synchronized = this.synchronize(user, this.onlineUsers.has(user));
    if (synchronized.error) return synchronized;
    let current = this.profile(user);
    if (action.type === 'sync') return { profile: current, changed: false };
    if (action.type !== 'cancel' && this.cookingBacklog(this.worldHour?.() ?? current.character?.hour ?? 0)) return this.reject(user, '料理の記録を順番に更新しています。もう一度お試しください。');
    if(this.combatEnabled&&(action.type==='hunt'||action.type==='event'&&action.choice==='fight'&&fantasyHostileEncounter(current.event)))return this.reject(user,'combat:encounter-only');
    if (!count(revision) || current.revision !== revision) return this.reject(user, '別の画面で記録が更新されました。最新の状態で選び直してください。');
    const staged = action.type === 'commission' || action.type === 'cookMix' && action.storage ? this.cookingState(this.worldHour?.() ?? current.character?.hour ?? 0) : undefined;
    current = staged?.profiles.get(user) ?? current;
    if(action.type==='expeditionJoin'||action.type==='travel')current=this.expeditionProfile(current);
    if(action.type==='travel'){const passengerError=this.expeditionPassengerError(current,action.destination,action.transport);if(passengerError)return this.reject(user,passengerError);}
    const properties = staged?.properties ?? this.properties, profiles = staged?.profiles ?? this.profiles;
    if (this.civicBlocked(user) && action.type !== 'rebirth') return this.reject(user, '身柄の手続きは町の窓口で進めてください。');
    if ((action.type === 'craft' || action.type === 'cookMix' && action.station === 'kitchen') && action.workshop && (action.workshop !== `${current.character?.location}-commercial` || !fantasyPropertyCanUse(properties, Object.fromEntries(profiles), user, action.workshop, this.worldHour?.() ?? current.character?.hour ?? 0))) return this.reject(user, 'この土地を使う権利がありません。');
    const warehouse = this.cookingWarehouse(user, current, properties, profiles, this.worldHour?.() ?? current.character?.hour ?? 0, action);
    if (action.type === 'cookMix' && action.storage && !warehouse) return this.reject(user, 'この土地を使う権利がありません。');
    if (action.type === 'propertyUse' && !fantasyPropertyCanUse(this.properties, Object.fromEntries(this.profiles), user, action.plot, current.character?.hour ?? 0)) return this.reject(user, 'この土地を使う権利がありません。');
    if (action.type === 'buy' || action.type === 'sell') {
      const state = this.realmState(user, { session: 'shop', publicSession: false, peers: [user] }).economy;
      const shop = state.shops.find(shop => action.type === 'buy' ? (!action.building || shop.building === action.building) && shop.lots.some(lot => lot.item === action.item && lot.count > 0) : shop.sales.some(lot => lot.item === action.item && lot.canSell && (!action.instance || lot.instance === action.instance) && (!action.quality || lot.quality === action.quality)));
      if (!shop) return this.reject(user, fantasyEconomyText('stock', 'ja'));
      const lot = shop.lots.find(lot => lot.item === action.item && lot.count > 0);
      const change = this.realmRequest(user, { domain: 'economy', command: { type: action.type === 'buy' ? 'shopBuy' : 'shopSell', building: shop.building, item: action.item, count: action.type === 'buy' ? action.count ?? 1 : 1, revision: shop.revision, ...(action.type === 'buy' ? { lot: lot?.id } : { ...(action.instance ? { instance: action.instance } : {}), ...(action.quality ? { quality: action.quality } : {}) }) } }, { session: 'shop', publicSession: false, peers: [user] });
      return change.error ? this.reject(user, fantasyEconomyText(change.error, 'ja')) : { profile: this.profile(user), changed: true };
    }
    if(action.type==='rankBenefitClaim'&&action.benefit==='temple-lodging'&&!current.activity&&this.templeBedsAvailable(user)<=0)return this.reject(user,'rank-benefit:temple-full');
    if(action.type==='lodge' && !current.activity && this.innAvailability(user).find(room=>room.room===action.room)?.available === 0)return this.reject(user,'inn:full');
    if(action.type==='guildRaidStart')return this.reject(user,'現地の共同討伐受付から出発してください。');
    if (action.type === 'accept') {
      const quest = FANTASY_QUESTS.find(quest => quest.id === action.quest);
      if (quest && !fantasyPersonalQuest(quest) && (!action.offer || !options.contract)) return this.reject(user, '一般依頼は担当施設か依頼人の掲示から受注してください。');
    }
    const now = this.now();
    const limit = this.limits.get(user);
    if (limit && now - limit.at < 1000 && limit.count >= 8) return this.reject(user, '操作が続いています。少し待ってからお試しください。');
    if (limit && now - limit.at < 1000) limit.count++;
    else this.limits.set(user, { at: now, count: 1 });
    // 取り消しは進行中の行動を閉じる操作なので、新しい行動として予約しない。
    if(action.type==='underworldClaim')return this.commit(user,applyFantasyUnderworld(current,action,{hour:this.worldHour?.()??current.character?.hour??0,realm:options.realm??'fantasy'}));
    if(action.type==='complete'||action.type==='accept'){const contract=current.character?.contractParties?.[action.quest];if(contract&&!contract.paid&&contract.owner!==user)return this.reject(user,'party-contract:owner-only');}
    if(action.type==='guildAssess'){const assessed=assessFantasyGuildProfile(current,this.worldHour?.()??current.character?.hour??0);return assessed.changed&&!assessed.error?this.commit(user,assessed):this.reject(user,assessed.error??'guild:invalid');}
    const result = ['cancel', 'redirect', 'escortAbandon'].includes(action.type)
      ? applyFantasyAction(current, action, rng, this.worldHour ? { worldHour: this.worldHour() } : {})
      : this.worldHour ? startFantasyActivity(current, action, this.worldHour(), rng, {...options,mageAvailable:this.campMageAvailable(user),cookingStock:warehouse?.stock,commissionContext:this.commissionOptions(user,current,properties).commissionContext,...(action.type==='rest'?{camp:true}:{})}) : applyFantasyAction(current, action, rng, {...options,mageAvailable:this.campMageAvailable(user),cookingStock:warehouse?.stock,...this.commissionOptions(user,current,properties)});
    if (!result.changed || result.error) return { ...result, profile: this.profile(user), changed: false };
    if(action.type==='rest'&&result.profile.activity&&result.profile.character&&isFantasyRetreat(result.profile.character.location)){const c=result.profile.character;result.profile.activity.retreatCamp=fantasyRetreatCampSnapshot({sourceUserId:user,generation:result.profile.generation??1,characterName:c.name,location:c.location,startedAt:result.profile.activity.startedAt,participants:this.retreatParticipants(user)});}
    if (!current.character && result.profile.character && this.worldHour) {
      const character = result.profile.character;
      const offset = this.worldHour() - character.hour;
      character.hour += offset;
      if (character.lifeStartedAt !== undefined) character.lifeStartedAt += offset;
      for (const lot of character.foodLots) {lot.createdAt += offset;if(lot.preservationAt!==undefined)lot.preservationAt+=offset;}
      for (const entry of result.profile.log) if (entry.hour === 8) entry.hour = character.hour;
    }
    warehouse?.apply();
    return this.commit(user, result, staged);
  }

  private institutionProfiles(before:ReadonlyMap<string,FantasyProfile>,after:ReadonlyMap<string,FantasyProfile>,partyState:unknown=this.savedPartyState):Map<string,FantasyProfile> {
    const snapshot:FantasyPartyContractSnapshot={parties:object(partyState)&&Array.isArray(partyState.parties)?partyState.parties.filter((p):p is FantasyPartyContractSnapshot['parties'][number]=>object(p)&&typeof p.id==='string'&&typeof p.leader==='string'&&Array.isArray(p.members)&&p.members.every(m=>typeof m==='string')):[]};
    let next=new Map(after);
    for(const [user,p]of after){const prior=before.get(user),c=p.character;if(!c||!prior?.character)continue;
      for(const quest of c.quests.filter(q=>!prior.character!.quests.includes(q)&&!!c.contracts?.[q])){
        const enrolled=enrollFantasyPartyContract(before,next,user,quest,snapshot);if(enrolled.error)throw Error(enrolled.error);next=enrolled.profiles;
      }
    }
    for(const [user,p]of [...next])for(const [quest,record]of Object.entries(p.character?.contractParties??{})){
      if(record.owner!==user||record.paid||!p.character?.quests.includes(quest))continue;
      const q=FANTASY_QUESTS.find(q=>q.id===quest);if(!q||p.character.location!==q.destination)continue;
      if(q.objective?.type==='hunt'){
        const hunt=p.character.lastHunt,grant=p.character.contracts?.[quest];
        if(!hunt?.success||!grant||hunt.location!==q.destination||hunt.hour<grant.acceptedAt||q.objective.monster&&hunt.id!==q.objective.monster)continue;
        if(JSON.stringify(hunt)===JSON.stringify(before.get(user)?.character?.lastHunt))continue;
      }
      const refreshed=refreshFantasyPartyContract(next,user,quest,snapshot);if(refreshed.error)throw Error(refreshed.error);next=refreshed.profiles;
      const scene=p.character.dungeon?.active;
      const people=record.members.map(m=>m.user).concat(snapshot.parties.find(p=>p.id===record.party)?.members??[]).filter(id=>{
        const person=next.get(id),room=person?.character?.dungeon?.active;
        return !!person?.character&&!person.death&&!person.combatId&&person.character.location===p.character!.location&&scene?.site===room?.site&&scene?.room===room?.room;
      });
      const marked=markFantasyPartyContractParticipation(next,user,quest,people,snapshot);if(marked.error)throw Error(marked.error);next=marked.profiles;
    }
    for(const [user,p]of [...next]){const prior=before.get(user);if(!p.character||!prior?.character)continue;
      for(const quest of p.character.completed.filter(q=>!prior.character!.completed.includes(q))){
        const settled=settleFantasyPartyContract(before,next,user,quest,snapshot);if(settled.error)throw Error(settled.error);next=settled.profiles;
        if(settled.changed&&settled.shares)for(const [recipient,amount]of Object.entries(settled.shares)){const profile=next.get(recipient);if(profile)this.combatLog(profile,`party-contract:paid:${amount}:${Object.keys(settled.shares).length}`,'success');}
      }
    }
    const reconciled=reconcileFantasyPartyContracts(next,snapshot);if(reconciled.error)throw Error(reconciled.error);next=reconciled.profiles;
    for(const [user,p]of [...next]){const prior=before.get(user);if(!p.character||!prior?.character)continue;
      const completed=p.character.completed.filter(q=>!prior.character!.completed.includes(q));if(!completed.length)continue;
      const updated=structuredClone(p);recordFantasyGuildCompletions(prior,updated);
      for(const quest of completed)creditFantasyUnderworldCompletion(prior,updated,quest,prior.character.contracts?.[quest]);
      next.set(user,updated);
    }
    return next;
  }

  private commit(user: string, result: FantasyResult, staged?: { properties: FantasyPropertyLedger; profiles: Map<string, FantasyProfile> }): FantasyResult {
    const previous = this.profiles.get(user);
    if (previous?.activity?.action.type === 'propertyUse' && !result.profile.activity && result.profile.character && !result.profile.death) result = { ...result, profile: applyFantasyPropertyImprovement(result.profile, previous.activity.action.plot, this.properties, fantasyStats(result.profile.character)).profile };
    result = { ...result, profile: this.enableCombat(result.profile) as FantasyProfile };
    let next = new Map(staged?.profiles ?? this.profiles);
    next.set(user, result.profile);
    try{next=this.institutionProfiles(this.profiles,next);}
    catch(error){this.onError(error);return this.reject(user,'party-contract:unavailable');}
    if (![...next].every(([id,p])=>isProfile(p)&&(!p.character||validFantasyPartyContracts(p.character,{user:id,generation:p.generation??1})))) {
      this.onError(new Error('Fantasy action produced an invalid profile'));
      return this.reject(user, '冒険記録の整合性を確認できませんでした。操作は確定していません。');
    }
    const carried=advanceFantasyCarryReturn(next,this.worldHour?.()??result.profile.character?.hour??0,id=>this.carryContext(id));
    for(const update of carried.updates){if(!isProfile(update.profile))return this.reject(user,'carry:unavailable');next.set(update.user,update.profile);}
    try {
      // 保存に成功してから公開し、失敗した抽選や支払いを確定させない。
      this.writeState(next, this.combats, staged?.properties ?? this.properties);
    } catch (error) {
      this.onError(error);
      return this.reject(user, '冒険記録を保存できませんでした。操作は確定していません。もう一度お試しください。');
    }
    this.profiles = next;
    return { ...result, profile: this.profile(user) };
  }
}

export function handleFantasyAction(store: FantasyStore, user: { id: string; session: string | null; world?: string }, revision: unknown, action: unknown, options: { contract?: FantasyContractGrant; realm?: string } = {}): FantasyResult {
  if (!user.session || user.world !== 'fantasy') return store.reject(user.id, 'ファンタジー世界のセッションに参加してから操作してください。');
  return store.apply(user.id, revision, action, Math.random, options);
}
