import fs from 'node:fs';
import path from 'node:path';
import { createHash, randomUUID } from 'node:crypto';
import type { FantasyAction, FantasyCharacter, FantasyProfile, FantasyResult, FantasyLegacyRecord } from '../shared/fantasy.ts';
import { advanceFantasyWorld, applyFantasyAction, fantasyActionHours, fantasyStats, fantasyTransports, newFantasyProfile, startFantasyActivity } from '../shared/fantasy-engine.ts';
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
import { FANTASY_GATE_HOURS, fantasyHasGate } from '../shared/fantasy-gates.ts';
import { FANTASY_VOYAGE_FINAL_QUEST, validFantasyVoyageEnding } from '../shared/fantasy-voyage-ending.ts';
import { FANTASY_PARTY_MAX_MEMBERS, type FantasyPartyError } from '../shared/fantasy-party.ts';
import { validFantasyVoyageDecisions } from '../shared/fantasy-voyage-decisions.ts';
import { advanceFantasyCombat, createFantasyCombat, addFantasyCombatParticipant, submitFantasyCombatOrder, validFantasyCombatState, type FantasyCombatState, type FantasyCombatOrder, type FantasyCombatResult } from '../shared/fantasy-combat.ts';
import { fantasyCombatPlayer, fantasyCombatSupplies, fantasyCombatProfessionUsesCombat, fantasyCombatApplyCompanions } from './fantasy-combat-adapter.ts';
import { fantasyCombatStartError, fantasyCombatStartPlan, fantasyCombatWarningError, validFantasyCombatProgress, fantasyCombatChallengeIsCrime } from '../shared/fantasy-combat-challenges.ts';
import { fantasyCombatEnemy, FANTASY_APEX_PROVOCATIONS } from '../shared/fantasy-combat-catalog.ts';
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
import { newFantasyPropertyLedger, validFantasyPropertyLedger, validFantasyPropertyTitles, reconcileFantasyProperties, applyFantasyPropertyCommand, fantasyPropertyState, isFantasyPropertyCommand, type FantasyPropertyLedger, type FantasyPropertyError } from '../shared/fantasy-property.ts';
import { applyFantasyPartyVault, returnFantasyPartyDeposits, newFantasyPartyVault, validFantasyPartyVaults, type FantasyPartyVaults, type FantasyPartyVaultCommand, type FantasyPartyVaultContext } from '../shared/fantasy-party-vault.ts';
import { newFantasyEconomyLedger, validFantasyEconomyLedger, closeFantasyEconomyTrades, isFantasyEconomyCommand, applyFantasyEconomyCommand, fantasyEconomyState, fantasyEconomyText, type FantasyEconomyLedger } from '../shared/fantasy-economy.ts';
import { newFantasyCivicLedger, validFantasyCivicLedger, advanceFantasyCivics, isFantasyCivicCommand, applyFantasyCivicCommand, fantasyCivicState, fantasyCivicActionBlock, fantasyCivicServiceMultiplier, type FantasyCivicLedger } from '../shared/fantasy-civics.ts';
import { advanceFantasyProperties, fantasyPropertyCanUse, applyFantasyPropertyImprovement } from '../shared/fantasy-property.ts';
import type { FantasyRealmContext } from '../shared/fantasy-realm.ts';
import { validFantasyPriestGrowth } from '../shared/fantasy-priest-growth.ts';
import { FANTASY_JOB_PATHS, validFantasyJobPaths } from '../shared/fantasy-job-paths.ts';

const object = (value: unknown): value is Record<string, unknown> => value !== null && typeof value === 'object' && !Array.isArray(value);
const count = (value: unknown): value is number => typeof value === 'number' && Number.isSafeInteger(value) && value >= 0;
const id = (value: unknown): value is string => typeof value === 'string' && /^[a-z0-9][a-z0-9-]{0,79}$/.test(value);
const strings = (value: unknown): value is string[] => Array.isArray(value) && value.every((entry) => typeof entry === 'string');
const amounts = (value: unknown) => object(value) && Object.values(value).every(count);
const activityEnvelope = (value: unknown): value is FantasyProfile['activity'] & {} => object(value) && [4, 5].includes(Object.keys(value).length)
  && Object.keys(value).every(key => ['action', 'seed', 'startedAt', 'endsAt', 'work'].includes(key))
  && isFantasyAction(value.action) && count(value.seed) && value.seed <= 0xffffffff
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
  const migrated: Record<string, unknown> = { ...value, draft, character, event, ...(activity === undefined ? {} : { activity }) };
  // 廃止された予約だけを解除する。予約時点では報酬や資源を適用していない。
  if (activityEnvelope(activity) && activity.action.type === 'manaTrain' && object(character)
    && typeof character.hour === 'number' && activity.startedAt <= character.hour) delete migrated.activity;
  if (activityEnvelope(activity) && activity.action.type === 'travel' && activity.action.transport === 'gate'
    && activity.endsAt - activity.startedAt === 1 && object(character) && typeof character.hour === 'number'
    && activity.startedAt <= character.hour && character.hour <= activity.endsAt
    && typeof character.location === 'string' && FANTASY_LOCATIONS.some(place => place.id === character.location)
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
  return migrated;
}

export function isFantasyAction(value: unknown): value is FantasyAction {
  if (!object(value) || typeof value.type !== 'string') return false;
  const keys = (...fields: string[]) => Object.keys(value).length === fields.length + 1 && fields.every((field) => Object.hasOwn(value, field));
  const optionalKeys = (required: string[], optional: string[]) => required.every(key => Object.hasOwn(value, key))
    && Object.keys(value).every(key => key === 'type' || required.includes(key) || optional.includes(key));
  switch (value.type) {
    case 'sync': case 'draw': case 'keep': case 'skip': case 'explore': case 'rest': case 'work': case 'skin': case 'rebirth': case 'pray': case 'escortAbandon': case 'finishVoyage':
      return keys();
    case 'hunt': return optionalKeys([], ['monster']) && (value.monster === undefined || id(value.monster));
    case 'wear': return keys('item') && id(value.item);
    case 'terrain': return keys('activity') && id(value.activity);
    case 'gather': return keys('resource') && ['herbs', 'wood', 'minerals', 'gems'].includes(String(value.resource));
    case 'fish': return keys('mode') && ['pier', 'sea'].includes(String(value.mode));
    case 'boat': return keys('mode') && ['rent', 'buy'].includes(String(value.mode));
    case 'propertyUse': return keys('plot') && id(value.plot);
    case 'priestVow': return keys('quest') && id(value.quest);
    case 'priestReleaseVow': return keys();
    case 'priestBranch': return keys('branch') && ['care', 'ward', 'oath', 'pilgrim'].includes(String(value.branch));
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
    case 'escortAccept': return keys('destination') && id(value.destination);
    case 'job':
      return Object.keys(value).every(key => ['type', 'job', 'via', 'npcId'].includes(key)) && id(value.job)
        && (value.via === undefined || typeof value.via === 'string' && ['guild', 'npc', 'gm'].includes(value.via))
        && (value.npcId === undefined || id(value.npcId));
    case 'accept': return optionalKeys(['quest'], ['offer']) && id(value.quest) && (value.offer === undefined || id(value.offer));
    case 'complete': case 'abandon': return keys('quest') && id(value.quest);
    case 'investigate': return keys('quest', 'approach') && id(value.quest) && ['observe', 'analyze', 'restore'].includes(String(value.approach));
    case 'voyageDecision': return keys('decision', 'choice') && id(value.decision) && id(value.choice);
    case 'craft': return optionalKeys(['recipe'], ['material', 'gem']) && id(value.recipe)
      && (value.material === undefined || id(value.material)) && (value.gem === undefined || id(value.gem));
    case 'sell': return optionalKeys(['item'], ['instance', 'quality']) && id(value.item) && (value.instance === undefined || id(value.instance))
      && (value.quality === undefined || ['fresh', 'stale', 'spoiled'].includes(String(value.quality))) && !(value.instance !== undefined && value.quality !== undefined);
    case 'equip': return optionalKeys(['item'], ['instance']) && id(value.item) && (value.instance === undefined || id(value.instance));
    case 'buy': case 'use': return keys('item') && id(value.item);
    case 'unequip': return keys('slot') && typeof value.slot === 'string' && ['weapon', 'armor', 'accessory', 'offhand'].includes(value.slot);
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
    && strings(c.charted) && Array.isArray(c.foodLots)
    && amounts(c.inventory) && strings(c.quests) && strings(c.completed) && strings(c.visited) && amounts(c.jobXp)
    && (c.buff === null || (object(c.buff) && count(c.buff.power) && c.buff.power > 0
      && ['check', 'guard', 'reward', 'travel'].includes(String(c.buff.effect))
      && (c.buff.stat === undefined || ['strength', 'agility', 'intelligence', 'luck', 'vitality', 'dexterity', 'charisma'].includes(String(c.buff.stat))))))) return false;
  const character = c as unknown as FantasyCharacter;
  if (!validFantasyItemState(character, FANTASY_ITEMS) || !validFantasyReputation(character)
    || !validFantasyApprenticeship(character) || !validFantasyMana(character) || !validFantasyProgression(character)
    || !validFantasyGear(character) || !validFantasyFishing(character) || !validFantasySpecialization(character) || !validFantasyOutfit(character)
    || !validFantasyBirth(character) || !validFantasyPrayer(character) || !validFantasyMainTrials(character) || !validFantasyTaskProgress(character) || !validFantasyEscort(character) || !validFantasyVoyageEnding(character) || !validFantasyVoyageDecisions(character) || !validFantasyCombatProgress(character) || !validFantasyPropertyTitles(character) || !validFantasyPriestGrowth(character)) return false;
  if (character.contracts !== undefined && (!object(character.contracts) || Object.entries(character.contracts).some(([questId, grant]) => {
    const quest = FANTASY_QUESTS.find(quest => quest.id === questId);
    return !quest || fantasyPersonalQuest(quest) || !character.quests.includes(questId) || !object(grant) || Object.keys(grant).length !== 7 || !id(grant.offerId) || !id(grant.issuer)
      || !NPC_PUBLIC.some(npc => npc.id === grant.issuer && npc.homeLocation === quest.giver)
      || !FANTASY_LOCATIONS.some(place => place.id === grant.boardLocation) || !fantasyBuildings({ location: grant.boardLocation }).some(building => building.id === 'guild')
      || typeof grant.acceptedAt !== 'number' || !Number.isFinite(grant.acceptedAt) || grant.acceptedAt < 0 || grant.acceptedAt > character.hour
      || typeof grant.expiresAt !== 'number' || !Number.isFinite(grant.expiresAt) || grant.expiresAt <= grant.acceptedAt
      || !count(grant.progress) || grant.progress > (quest.objective?.type === 'hunt' ? quest.objective.count : 0)
      || !count(grant.gold) || grant.gold > Math.ceil(quest.gold * 1.5);
  }))) return false;
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
      || typeof lot.createdAt !== 'number' || !Number.isFinite(lot.createdAt) || lot.createdAt < 0 || lot.createdAt > character.hour) return false;
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
      || !['travel', 'rest', 'lodge', 'eat', 'pray', 'work', 'explore', 'craft', 'job', 'event', 'learn', 'haggle', 'gather', 'hunt', 'skin', 'fish', 'boat', 'read', 'command', 'magicPrepare', 'alchemy', 'terrain', 'investigate', 'propertyUse', 'priestBranch', 'advanceJob'].includes(activity.action.type)
      || activity.startedAt > character.hour) return false;
    if (activity.work && (activity.startedAt + activity.work.completed * fantasyWorkInterval(activity) > character.hour + 1e-8
      || activity.startedAt + (activity.work.completed + 1) * fantasyWorkInterval(activity) < character.hour - 1e-8)) return false;
    const action = activity.action;
    if (action.type === 'investigate' && (!!fantasyMainInvestigationError(character, action) || activity.endsAt - activity.startedAt !== .5
        || activity.startedAt + 1e-8 < (character.mainTrials?.[action.quest]?.proofs.at(-1)?.hour ?? character.mainTrials?.[action.quest]?.acceptedAt ?? 0))
      || action.type === 'travel' && (!FANTASY_LOCATIONS.some(place => place.id === action.destination) || !['foot', 'carriage', 'ship', 'working-ship', 'airship', 'gate', 'escort'].includes(action.transport)
        || action.transport === 'gate' && (!fantasyHasGate(character.location) || !fantasyHasGate(action.destination) || character.location === action.destination || activity.endsAt - activity.startedAt !== FANTASY_GATE_HOURS)
        || action.transport === 'escort' && (!!fantasyEscortTransportError(character, action.destination) || activity.endsAt - activity.startedAt !== character.escort?.hours || activity.startedAt < character.escort.acceptedAt))
      || action.type === 'job' && (!FANTASY_JOBS.some(job => job.id === action.job && job.category !== 'none') || action.job === character.job)
      || action.type === 'craft' && !FANTASY_RECIPES.some(recipe => recipe.id === action.recipe && recipe.job === character.job)
      || action.type === 'learn' && !!fantasyApprenticeshipError(character, action.npcId, action.skill)
      || action.type === 'read' && (!FANTASY_LIBRARY_BOOKS.some(book => book.id === action.book && book.inGame !== false) || !fantasyLibraryHoldings(character).includes(action.book))
      || action.type === 'event' && !FANTASY_EVENTS.some(event => event.id === value.event && event.choices.some(choice => choice.id === action.choice))) return false;
    if (fantasyActionHours(value as unknown as FantasyProfile, action) <= 0) return false;
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
}
export interface FantasyGroupInvestigationPlan {
  user: string; quest: string; approach: 'observe' | 'analyze' | 'restore'; generation: number; location: string; stage: 'field' | 'verify' | 'compare';
}
export interface FantasyGroupInvestigationResult { updates: { user: string; profile: FantasyProfile }[]; error?: FantasyPartyError }
export interface FantasyGroupTravelPlan { user: string; generation: number; location: string; destination: string; transport: string; quotedCost?: number; quotedHours?: number }
export interface FantasyCombatPlan { user: string; generation: number; location: string; session: string; source: FantasyCombatStartKind; target: string; confirm?: boolean }
export interface FantasyCombatStoreResult { updates: { user: string; profile: FantasyProfile }[]; state?: FantasyCombatState; error?: string }
interface StoredCombat { state: FantasyCombatState; session: string; victoryKey?: string }

export class FantasyStore {
  private profiles = new Map<string, FantasyProfile>();
  private combats = new Map<string, StoredCombat>();
  private properties: FantasyPropertyLedger = newFantasyPropertyLedger();
  private vaults: FantasyPartyVaults = {};
  private economy: FantasyEconomyLedger = newFantasyEconomyLedger();
  private civics: FantasyCivicLedger = newFantasyCivicLedger();
  private combatEnabled: boolean;
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
    try {
      const saved: unknown = JSON.parse(fs.readFileSync(file, 'utf8'));
      if (!object(saved)) throw new Error('Invalid fantasy save');
      const envelope = saved.version === 2 && object(saved.profiles) && object(saved.combats);
      const profileData = envelope ? saved.profiles as Record<string, unknown> : saved;
      if (envelope && Object.keys(saved).some(key => !['version', 'profiles', 'combats', 'properties', 'vaults', 'economy', 'civics'].includes(key))) throw new Error('Invalid fantasy save');
      if (envelope && saved.properties !== undefined) {
        if (!validFantasyPropertyLedger(saved.properties)) throw new Error('Invalid property save');
        this.properties = saved.properties;
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
          if (!object(record) || Object.keys(record).some(key => !['state', 'session', 'victoryKey'].includes(key)) || typeof record.session !== 'string' || !record.session
            || !validFantasyCombatState(record.state) || record.state.id !== id || record.victoryKey !== undefined && typeof record.victoryKey !== 'string') throw new Error('Invalid combat save');
          this.combats.set(id, record as unknown as StoredCombat);
        }
      }
      for (const [user, profile] of Object.entries(upgraded) as [string, FantasyProfile][]) if (profile.combatId) {
        const battle = this.combats.get(profile.combatId)?.state, fighter = battle?.fighters.find(fighter => fighter.userId === user && fighter.generation === (profile.generation ?? 1));
        if (!battle || battle.status !== 'active' || !fighter || fighter.fled || fighter.hp <= 0 || profile.death || profile.character?.location !== battle.location
          || profile.character.hp !== fighter.hp || profile.character.mp !== fighter.mp) throw new Error('Missing active combat');
      }
      for (const record of this.combats.values()) if (record.state.status === 'active') for (const fighter of record.state.fighters) if (fighter.userId && fighter.hp > 0 && !fighter.fled) {
        const profile = upgraded[fighter.userId] as FantasyProfile | undefined;
        if (!profile || (profile.generation ?? 1) !== fighter.generation || profile.combatId !== record.state.id) throw new Error('Missing combat participant');
      }
      this.profiles = new Map(Object.entries(upgraded) as [string, FantasyProfile][]);
      for (const [user, profile] of this.profiles) {
        const c = profile.character; if (!c || profile.death) continue;
        const titles = [...(reconcileFantasyProperties(this.properties, Object.fromEntries(this.profiles)).profiles[user].character?.propertyTitles ?? [])].sort();
        if (JSON.stringify(titles) !== JSON.stringify([...(c.propertyTitles ?? [])].sort())) throw new Error('Property title does not match the world ledger');
        if (profile.activity?.action.type === 'propertyUse') {
          const plot = this.properties.plots[profile.activity.action.plot];
          if (!plot || !titles.includes(profile.activity.action.plot) || plot.listing) throw new Error('Invalid property activity');
        }
      }
      const returned = returnFantasyPartyDeposits(this.vaults, this.profiles);
      this.vaults = returned.vaults; this.profiles = returned.profiles;
      const normalized = reconcileFantasyProperties(this.properties, Object.fromEntries(this.profiles));
      this.properties = normalized.ledger; this.profiles = new Map(Object.entries(normalized.profiles));
      // 移行の保存に失敗しても既存の進行を表示し、操作だけを止める。
      const serialized = this.serialize(this.profiles);
      if (JSON.stringify(saved) !== serialized) this.save(this.file, serialized);
    } catch (error) {
      if ((error as NodeJS.ErrnoException).code !== 'ENOENT') {
        this.loadError = '冒険記録を読み込めません。保存データを管理者に確認してください。';
        this.onError(error);
      }
    }
  }

  private enableCombat(value: unknown): unknown {
    if (!this.combatEnabled || !object(value) || !object(value.character)) return value;
    if (value.activity && object(value.activity) && object(value.activity.action)) {
      const action = value.activity.action;
      if (action.type === 'investigate') return value;
      if (action.type === 'hunt' && FANTASY_MONSTERS.some(monster => monster.id === action.monster && monster.tier === 8)) {
        const copy = { ...value }; delete copy.activity;
        return { ...copy, revision: typeof copy.revision === 'number' ? copy.revision + 1 : copy.revision, character: { ...value.character, combatStoryVersion: 1 } };
      }
    }
    return { ...value, character: { ...value.character, combatStoryVersion: 1 } };
  }

  private serialize(profiles: ReadonlyMap<string, FantasyProfile>, combats: ReadonlyMap<string, StoredCombat> = this.combats, properties = this.properties, vaults = this.vaults, economy = this.economy, civics = this.civics): string {
    return JSON.stringify(combats.size || properties.revision || Object.keys(vaults).length || economy.revision || civics.revision
      ? { version: 2, profiles: Object.fromEntries(profiles), combats: Object.fromEntries(combats), ...(properties.revision ? { properties } : {}), ...(Object.keys(vaults).length ? { vaults } : {}), ...(economy.revision ? { economy } : {}), ...(civics.revision ? { civics } : {}) }
      : Object.fromEntries(profiles));
  }
  private writeState(profiles: Map<string, FantasyProfile>, combats: ReadonlyMap<string, StoredCombat> = this.combats, properties = this.properties, vaults = this.vaults, economy = this.economy, civics = this.civics) {
    const hour = this.worldHour?.() ?? Math.max(0, ...[...profiles.values()].map(p => p.character?.hour ?? 0));
    const normalized = reconcileFantasyProperties(properties, Object.fromEntries(profiles));
    const advanced = advanceFantasyProperties(normalized.ledger, normalized.profiles, hour);
    const civil = advanceFantasyCivics(civics, advanced.profiles, hour);
    const next = new Map(Object.entries(civil.profiles));
    for (const [id, record] of combats) if (record.state !== this.combats.get(id)?.state && !validFantasyCombatState(record.state)) throw new Error('Invalid updated combat state');
    if (![...next.values()].every(isProfile)) throw new Error('Invalid normalized fantasy state');
    this.save(this.file, this.serialize(next, combats, advanced.ledger, vaults, economy, civil.ledger));
    for (const [user, profile] of next) profiles.set(user, profile);
    this.properties = advanced.ledger; this.vaults = vaults; this.economy = economy; this.civics = civil.ledger;
  }

  propertyState(user: string) {
    const normalized = reconcileFantasyProperties(this.properties, Object.fromEntries(this.profiles));
    return fantasyPropertyState(normalized.ledger, normalized.profiles, user);
  }

  propertyRequest(user: string, input: unknown): { updates: { user: string; profile: FantasyProfile }[]; error?: FantasyPropertyError } {
    if (this.loadError || this.clockError()) return { updates: [], error: 'unavailable' };
    if (!isFantasyPropertyCommand(input)) return { updates: [], error: 'invalid' };
    if (input.type === 'sync') { const next = new Map(this.profiles); try { this.writeState(next); this.profiles = next; return { updates: [] }; } catch { return { updates: [], error: 'save-failed' }; } }
    if (this.civicBlocked(user)) return { updates: [], error: 'busy' };
    const sync = this.synchronize(user);
    if (sync.error) return { updates: [], error: 'unavailable' };
    const people = Object.fromEntries(this.profiles), result = applyFantasyPropertyCommand(this.properties, people, user, input, this.worldHour?.() ?? people[user]?.character?.hour ?? 0);
    if (result.error || !result.changed) return { updates: [], ...(result.error ? { error: result.error } : {}) };
    if (result.activity) {
      const scheduled = startFantasyActivity(result.profiles[user], result.activity.action, this.worldHour?.() ?? result.profiles[user].character!.hour);
      if (!scheduled.changed || scheduled.error) return { updates: [], error: 'busy' };
      result.profiles[user] = scheduled.profile;
    }
    const next = new Map(Object.entries(result.profiles));
    if (![...next.values()].every(isProfile)) return { updates: [], error: 'invalid' };
    try { this.writeState(next, this.combats, result.ledger); }
    catch (error) { this.onError(error); return { updates: [], error: 'save-failed' }; }
    const updates = [...next].filter(([id, p]) => JSON.stringify(p) !== JSON.stringify(this.profiles.get(id))).map(([id, profile]) => ({ user: id, profile }));
    this.profiles = next;
    return { updates: updates.map(update => ({ user: update.user, profile: this.profile(update.user) })) };
  }

  realmState(user: string, context: FantasyRealmContext) {
    const hour = this.worldHour?.() ?? this.profiles.get(user)?.character?.hour ?? 0;
    return { economy: fantasyEconomyState(this.economy, this.profiles, user, { hour, peers: context.peers, priceMultiplier: fantasyCivicServiceMultiplier(this.civics, this.profiles.get(user)?.character?.location ?? '') }),
      civic: fantasyCivicState(this.civics, Object.fromEntries(this.profiles), user, hour, context) };
  }
  civicBlocked(user: string) { return fantasyCivicActionBlock(this.civics, this.profile(user), user, this.worldHour?.() ?? this.profile(user).character?.hour ?? 0); }
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
    if (!object(input) || Object.keys(input).length !== 2 || !['economy', 'civic'].includes(String(input.domain))) return { updates: [], error: 'invalid' };
    const command = input.command;
    if (input.domain === 'economy' ? !isFantasyEconomyCommand(command) : !isFantasyCivicCommand(command)) return { updates: [], error: 'invalid' };
    if (!context.peers.includes(user)) return { updates: [], error: 'unavailable' };
    const hour = this.worldHour?.() ?? this.profile(user).character?.hour ?? 0, before = new Map(this.profiles), prepared = new Map(this.profiles);
    for (const peer of context.peers) {
      const current = prepared.get(peer); if (!current?.character || current.combatId) continue;
      const result = advanceFantasyWorld(current, Math.max(hour, current.character.hour), { accrueIdleNeeds: this.onlineUsers.has(peer) });
      if (result.error) return { updates: [], error: 'busy' }; prepared.set(peer, result.profile);
    }
    const civil = advanceFantasyCivics(this.civics, Object.fromEntries(prepared), hour);
    const people = new Map(Object.entries(civil.profiles));
    if (input.domain === 'economy' && (fantasyCivicActionBlock(civil.ledger, people.get(user) ?? this.profile(user), user, hour) || context.peers.some(peer => peer !== user && fantasyCivicActionBlock(civil.ledger, people.get(peer) ?? this.profile(peer), peer, hour) && object(command) && command.peer === peer))) return { updates: [], error: 'custody' };
    const result = input.domain === 'economy'
      ? applyFantasyEconomyCommand(this.economy, people, user, command as never, { hour, peers: context.peers.filter(peer => !fantasyCivicActionBlock(civil.ledger, people.get(peer) ?? this.profile(peer), peer, hour)), token: randomUUID(), priceMultiplier: fantasyCivicServiceMultiplier(civil.ledger, people.get(user)?.character?.location ?? '') })
      : applyFantasyCivicCommand(civil.ledger, Object.fromEntries(people), user, command as never, hour, context);
    if (result.error) return { updates: [], error: result.error };
    const next = result.profiles instanceof Map ? result.profiles : new Map(Object.entries(result.profiles));
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
      const profile = prepared.get(user); if (!profile?.character || profile.combatId) continue;
      const synced = advanceFantasyWorld(profile, Math.max(hour, profile.character.hour), { accrueIdleNeeds: this.onlineUsers.has(user) });
      if (synced.error) return { updates: [], error: 'unavailable' }; prepared.set(user, synced.profile);
    }
    const result = applyFantasyPartyVault(this.vaults, prepared, party, actor, command, randomUUID());
    if (!result.changed || result.error) return { updates: [], error: (result.error ?? 'invalid') as FantasyPartyError };
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

  synchronize(user: string, accrueIdleNeeds = false): FantasyResult {
    const current = this.profile(user);
    if (!this.worldHour || !current.character) return { profile: current, changed: false };
    if (current.combatId) return { profile: current, changed: false };
    if (this.loadError || this.clockError()) return this.reject(user, this.loadError ?? this.clockError()!);
    const hour = this.worldHour();
    if (Math.floor(current.character.hour * 60) === Math.floor(hour * 60) && (!current.activity || current.activity.endsAt > hour)) return { profile: current, changed: false };
    const result = advanceFantasyWorld(current, hour, { accrueIdleNeeds });
    return result.changed && !result.error ? this.commit(user, result) : result;
  }

  tick(online: ReadonlySet<string>): { user: string; profile: FantasyProfile; error?: string }[] {
    if (!this.worldHour || this.loadError || this.clockError()) return [];
    const hour = this.worldHour();
    const next = new Map(this.profiles);
    const changed: { user: string; profile: FantasyProfile }[] = [];
    for (const [user, profile] of this.profiles) {
      if (!profile.character || profile.combatId) continue;
      const wasOnline = this.onlineUsers.has(user);
      const isOnline = online.has(user);
      const due = !!profile.activity && (profile.activity.endsAt <= hour || !!profile.activity.work
        && profile.activity.startedAt + (profile.activity.work.completed + 1) * fantasyWorkInterval(profile.activity) <= hour);
      if (!due && !(wasOnline || isOnline)) continue;
      if (!due && wasOnline === isOnline && Math.floor(profile.character.hour * 60) === Math.floor(hour * 60)) continue;
      const result = advanceFantasyWorld(profile, hour, { accrueIdleNeeds: wasOnline });
      if (result.changed) result.profile = this.enableCombat(result.profile) as FantasyProfile;
      if (result.error) { this.onError(new Error(result.error)); continue; }
      if (!result.changed) continue;
      if (!isProfile(result.profile)) { this.onError(new Error('Fantasy clock produced an invalid profile')); continue; }
      if (profile.activity?.action.type === 'propertyUse' && !result.profile.activity && result.profile.character && !result.profile.death) result.profile = applyFantasyPropertyImprovement(result.profile, profile.activity.action.plot, this.properties, fantasyStats(result.profile.character)).profile;
      next.set(user, result.profile);
      changed.push({ user, profile: result.profile });
    }
    if (!changed.length) { this.onlineUsers = new Set(online); return this.tickCombats(hour); }
    try { this.writeState(next); }
    catch (error) {
      this.onError(error);
      return changed.map(({ user }) => ({ user, profile: this.profile(user), error: '冒険記録を保存できませんでした。操作は確定していません。もう一度お試しください。' }));
    }
    this.profiles = next;
    this.onlineUsers = new Set(online);
    return [...changed.map(({ user }) => ({ user, profile: this.profile(user) })), ...this.tickCombats(hour)];
  }

  reject(user: string, error: string): FantasyResult {
    return { profile: this.profile(user), error, changed: false };
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
    if (!c || profile.death || profile.activity || profile.event || profile.combatId) return { updates: [], error: 'busy' };
    const error = fantasyCombatWarningError(c, target);
    if (error) return { updates: [], error };
    c.apexWarnings ??= {}; c.apexWarnings[target] = { location: c.location, hour: c.hour }; profile.revision++;
    const result = this.commit(user, { profile, changed: true });
    return result.error ? { updates: [], error: result.error } : { updates: [{ user, profile: result.profile }] };
  }

  startCombat(plans: readonly FantasyCombatPlan[], rng = Math.random): FantasyCombatStoreResult {
    const fail = (error: string): FantasyCombatStoreResult => ({ updates: [], error });
    if (this.loadError || this.clockError()) return fail('unavailable');
    if (Array.isArray(plans) && plans.some(plan => plan && this.civicBlocked(plan.user))) return fail('busy');
    if (!Array.isArray(plans) || plans.length < 1 || plans.length > 6 || plans.some(plan => !plan || typeof plan.user !== 'string' || !plan.user || typeof plan.session !== 'string' || !plan.session
      || !count(plan.generation) || typeof plan.location !== 'string' || typeof plan.target !== 'string' || !['hunt', 'story', 'encounter', 'apex', 'challenge'].includes(plan.source))
      || new Set(plans.map(plan => plan.user)).size !== plans.length) return fail('invalid');
    const hour = this.worldHour?.() ?? Math.max(...plans.map(plan => this.profiles.get(plan.user)?.character?.hour ?? 0));
    const next = new Map(this.profiles), prepared: FantasyProfile[] = [];
    let sourcePlan: ReturnType<typeof fantasyCombatStartPlan>;
    for (const plan of plans) {
      if (plan.session !== plans[0].session || plan.location !== plans[0].location || plan.source !== plans[0].source || plan.target !== plans[0].target) return fail('incompatible');
      const saved = this.profiles.get(plan.user);
      if (!saved?.character || saved.combatId || saved.character.hour > hour + 1e-8) return fail('busy');
      const synchronized = advanceFantasyWorld(saved, Math.max(saved.character.hour, hour), { accrueIdleNeeds: this.onlineUsers.has(plan.user) });
      if (synchronized.error) return fail(synchronized.error);
      const p = this.enableCombat(synchronized.profile) as FantasyProfile, c = p.character!;
      if ((p.generation ?? 1) !== plan.generation || c.location !== plan.location) return fail('incompatible');
      const error = fantasyCombatStartError(p, plan.source, plan.target, plan.confirm);
      if (error) return fail(error);
      const resolved = fantasyCombatStartPlan(p, plan.source, plan.target)!;
      if (sourcePlan && (sourcePlan.source !== resolved.source || JSON.stringify(sourcePlan.enemies) !== JSON.stringify(resolved.enemies))) return fail('incompatible');
      sourcePlan = resolved; prepared.push(p);
    }
    if (!sourcePlan) return fail('invalid');
    const id = `combat-${randomUUID()}`;
    let state: FantasyCombatState;
    try { state = createFantasyCombat({ id, location: plans[0].location, source: sourcePlan.source, players: prepared.map((p, index) => fantasyCombatPlayer(p, plans[index].user)), enemies: sourcePlan.enemies, seed: Math.floor(Math.max(0, Math.min(.999999999, rng())) * 4294967296), hour, tactical: true }); }
    catch (error) { this.onError(error); return fail('invalid'); }
    for (const [index, p] of prepared.entries()) {
      const fighter = state.fighters.find(fighter => fighter.userId === plans[index].user)!;
      const carried = (p.character!.effects ?? []).filter(effect => ['poison', 'burn', 'frost'].includes(effect.id) && effect.expiresAt > p.character!.hour);
      fighter.effects = carried.map(effect => ({ id: effect.id as 'poison' | 'burn' | 'frost', power: effect.id === 'burn' ? 3 : effect.id === 'poison' ? 2 : 1, turns: 3 }));
      if (carried.length) p.character!.effects = p.character!.effects!.filter(effect => !carried.includes(effect));
      p.combatId = id; p.revision++;
      if (plans[index].source === 'challenge' && fantasyCombatChallengeIsCrime(plans[index].target) || plans[index].source === 'encounter' && plans[index].target === 'encounter-watch') {
        p.character!.notoriety = Math.min(100, (p.character!.notoriety ?? 0) + 4); grantFantasyReputation(p.character!, -4);
      }
      if (!isProfile(p)) return fail('invalid');
      next.set(plans[index].user, p);
    }
    const combats = new Map(this.combats); combats.set(id, { state, session: plans[0].session, ...(sourcePlan.victoryKey ? { victoryKey: sourcePlan.victoryKey } : {}) });
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
    if (!c || original.death || c.hp <= 0 || original.activity || original.combatId || original.event || this.civicBlocked(user)) return fail('busy');
    if (!assignment || assignment.id !== contractId || assignment.defense !== 'pending' || assignment.from !== c.location) return fail('incompatible');
    const p = structuredClone(original), hour = this.worldHour?.() ?? c.hour, id = randomUUID();
    const level = c.level, template = level >= 7 ? 'monster-goblin-raider' : level >= 3 ? 'monster-forest-wolf' : 'monster-cave-slime';
    const enemy = fantasyCombatEnemy(template) ? template : 'monster-cave-slime';
    const state = createFantasyCombat({ id, location: c.location, source: `escort:${contractId}`, hour, seed: Math.floor(rng() * 0x100000000) >>> 0, tactical: true,
      players: [fantasyCombatPlayer(p, user)], enemies: [{ id: 'road-ambusher', template: enemy }], escort: { owner: user, contractId, destination: assignment.destination } });
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
      if (p.combatId !== state.id && record.state.status === 'active') continue;
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
      const unitActions = (state.units ?? []).filter(unit=>unit.companion?.ownerId===user).reduce((sum,unit)=>sum+Math.max(0,unit.contribution.effectiveActions-(record.state.units?.find(prior=>prior.id===unit.id)?.contribution.effectiveActions??0)),0);
      const focusActions = result.usedSkills?.filter(use=>use.userId===user).length??0;
      const effective = fighter.contribution.effectiveActions-before.contribution.effectiveActions-unitActions-focusActions>0, attempted = fighter.contribution.manualActions > before.contribution.manualActions;
      const commandEffective = (state.units ?? []).some(unit => unit.companion?.ownerId === user && unit.contribution.effectiveActions > (record.state.units?.find(prior => prior.id === unit.id)?.contribution.effectiveActions ?? 0));
      if (commandEffective) grantFantasyPractice(c, { key: `combat:${state.source}:command`.slice(0, 119), amount: 3, success: true, practice: 'command' });
      for (const use of result.usedSkills?.filter(use => use.userId === user) ?? []) {
        const skill = before.skills.find(skill => skill.id === use.skill && skill.kind === 'focus');
        if (!skill || skill.mp !== use.mp) continue;
        const key = `combat:${state.source}:focus`.slice(0, 119);
        const multiplier = fantasyPracticeMultiplier(c, key);
        grantFantasyPractice(c, { key, amount: 4, success: true, skill: use.skill });
        if (use.mp > 0) c.mana = fantasyManaOnUse(c, use.mp, multiplier);
      }
      if (attempted) c.fatigue = Math.min(100, c.fatigue + 1);
      if (order && attempted && (effective || order.type === 'attack' && result.attemptedAttacks?.includes(user))) {
        const key = `combat:${state.source}:${order.type}`.slice(0, 119);
        if (effective && order.type === 'skill') {
          const skill = fighter.skills.find(skill => skill.id === order.skill);
          if (skill && skill.kind !== 'focus' && (skill.mp === 0 || before.mp - fighter.mp >= skill.mp)) { if (!skill.id.startsWith('prepared-spell-')) grantFantasyPractice(c, { key, amount: 4, success: true, skill: skill.id }); if (skill.mp > 0) c.mana = fantasyManaOnUse(c, skill.mp, fantasyPracticeMultiplier(c, key)); }
        }
        const potionPractice = c.job === 'alchemist' && order.type === 'item' && result.spentItems.some(item => item.userId === user);
        if (fantasyCombatProfessionUsesCombat(c.job) || potionPractice) grantFantasyPractice(c, { key, amount: effective ? 3 : 1, success: effective });
        else {
          const prior = c.proficiencyUse;
          c.proficiencyUse = { key, hour: c.hour, repeats: prior?.key === key && c.hour - prior.hour < 6 ? prior.repeats + 1 : 1 };
        }
      }
      if (fighter.hp <= 0 && !p.death) {
        const town = fantasyRescueTown(c, false, fantasyCompanionRescue(c));
        if (town) {
          const cost = Math.floor(c.gold * .1); c.gold -= cost; c.location = town; c.hp = Math.max(1, Math.floor(fantasyStats(c).hp * .5)); c.fatigue = 25; c.hunger = 35; c.effects = [];
          if (!c.visited.includes(town)) c.visited.push(town); p.event = null;
          this.combatLog(p, `戦場から救護され、金貨${cost}枚を支払った。`, 'failure');
        } else { recordFantasyDeath(p, '戦場で力尽き、救助が届かなかった'); this.combatLog(p, '戦場で力尽き、この人生は終わった。足跡は世界に残る。', 'failure'); }
      }
      if (state.status !== 'active' || fighter.fled || fighter.hp <= 0) delete p.combatId;
      if (!p.death && fighter.hp > 0) {
        if (state.status !== 'active' || fighter.fled) for (const effect of fighter.effects) addFantasyStatus(c, effect.id);
        else {
          const fresh = fantasyCombatPlayer(p, user); fighter.stats = fresh.stats; fighter.skills = fresh.skills;
          fighter.hp = c.hp = Math.min(c.hp, fresh.stats.hp); fighter.mp = c.mp = Math.min(c.mp, fresh.stats.mp);
        }
      }
      if (state.status !== 'active' && p.event && state.source === `encounter:${p.event}`) p.event = null;
      if (state.status !== 'active' || fighter.fled || fighter.hp <= 0) this.combatLog(p, `戦闘記録［${state.id}］${fighter.fled ? 'escaped' : state.status}。`, state.status === 'victory' ? 'success' : 'failure');
      p.revision++; profiles.set(user, p); updates.push({ user, profile: p });
    }
    if (record.state.status === 'active' && state.status === 'victory') {
      const credited = [...this.storyPassage(record, state, profiles, orders), ...this.rewardCombat(record, state, profiles)];
      for (const user of credited) if (!updates.some(update => update.user === user)) updates.push({ user, profile: profiles.get(user)! });
    }
    if (state.escort && state.status !== 'active') {
      const owner = profiles.get(state.escort.owner);
      if (owner?.character?.escort?.id === state.escort.contractId && (owner.generation ?? 1) === state.escort.ownerGeneration) {
        if (state.status === 'victory' && state.escort.wagon.hp > 0) owner.character.escort.defense = 'cleared';
        else delete owner.character.escort;
        owner.revision++;
        this.combatLog(owner,state.status === 'victory' ? '護衛隊の出発路を確保した。' : '護衛隊を守れず、依頼は終了した。',state.status === 'victory' ? 'success' : 'failure');
        if (!updates.some(update=>update.user===state.escort!.owner)) updates.push({user:state.escort.owner,profile:owner});
      }
    }
    for (const update of updates) { const p = profiles.get(update.user)!; reconcileFoodLots(p.character!); update.profile = p; }
    return updates;
  }

  private storyPassage(record: StoredCombat, state: FantasyCombatState, profiles: Map<string, FantasyProfile>, orders: Record<string, FantasyCombatOrder>): string[] {
    if (!record.victoryKey) return [];
    const credited: string[] = [];
    for (const fighter of state.fighters) {
      const user = fighter.userId, before = user ? record.state.fighters.find(fighter => fighter.userId === user) : undefined, profile = user ? profiles.get(user) : undefined;
      if (!user || !before || !profile?.character || profile.death || fighter.fled || fighter.hp <= 0 || !orders[user]
        || fighter.contribution.manualActions <= before.contribution.manualActions || (profile.generation ?? 1) !== fighter.generation
        || this.profiles.get(user)?.combatId !== state.id || profile.character.location !== state.location) continue;
      const next = structuredClone(profile); next.character!.combatVictories ??= {}; next.character!.combatVictories[record.victoryKey] = next.character!.hour;
      profiles.set(user, next); credited.push(user);
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
    const enemies = state.fighters.filter(f => f.side === 'enemies').map(f => fantasyCombatEnemy(f.template!)!).filter(Boolean);
    for (const user of eligible) {
      const p = structuredClone(profiles.get(user)!); profiles.set(user, p); if (!p.character) continue; const c = p.character!, before = fantasyStats(c);
      c.hour = Math.max(c.hour, state.hour);
      c.combatVictories ??= {}; c.combatVictories[record.victoryKey ?? state.source] = c.hour;
      const disposable = Object.entries(c.combatVictories).filter(([key]) => !key.startsWith('story:')).sort((a,b) => a[1]-b[1]);
      while (Object.keys(c.combatVictories).length > 300 && disposable.length) delete c.combatVictories[disposable.shift()![0]];
      const xp = enemies.reduce((sum, enemy) => sum + enemy.reward.xp, 0); c.xp += xp;
      while (c.xp >= c.level * 30) { c.xp -= c.level * 30; c.level++; }
      const after = fantasyStats(c);
      if (!p.death) { c.hp = Math.min(after.hp, c.hp + Math.max(0, after.hp - before.hp)); c.mp = Math.min(after.mp, c.mp + Math.max(0, after.mp - before.mp)); }
      for (const enemy of enemies) if (enemy.reward.honor) { c.honors ??= []; if (!c.honors.includes(enemy.reward.honor.id)) c.honors.push(enemy.reward.honor.id); }
      const oldMonster = FANTASY_MONSTERS.find(monster => monster.id === enemies[0]?.id), place = FANTASY_LOCATIONS.find(place => place.id === state.location)!;
      if (oldMonster && oldMonster.kinds.includes(place.kind) && place.danger >= (oldMonster.minDanger ?? 0)) c.lastHunt = { id: oldMonster.id, location: state.location, hour: c.hour, success: true };
      this.combatLog(p, `戦闘勝利。経験値${xp}。`, 'success');
    }
    if (!eligible.length) return eligible;
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
    const separator = record.state.source.indexOf(':'), source = record.state.source.slice(0, separator) as FantasyCombatStartKind;
    const tail = record.state.source.slice(separator + 1), target = source === 'story' ? tail.slice(0, tail.lastIndexOf(':')) : tail;
    const synchronized = advanceFantasyWorld(saved, Math.max(saved.character.hour, this.worldHour?.() ?? record.state.hour), { accrueIdleNeeds: this.onlineUsers.has(user) });
    if (synchronized.error) return fail('busy');
    const p = structuredClone(synchronized.profile);
    if (p.activity || p.combatId || p.event && source !== 'encounter' || p.death || !p.character || p.character.hp <= 0) return fail('busy');
    if (p.character!.location !== record.state.location) return fail('incompatible');
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

  startGroupTravel(plans: readonly FantasyGroupTravelPlan[]): FantasyGroupInvestigationResult {
    const fail = (error: FantasyPartyError): FantasyGroupInvestigationResult => ({ updates: [], error });
    if (this.loadError || this.clockError()) return fail('unavailable');
    if (plans.some(plan => this.civicBlocked(plan.user))) return fail('busy');
    if (plans.length < 2 || plans.length > 6 || new Set(plans.map(plan => plan.user)).size !== plans.length) return fail('invalid');
    const hour = this.worldHour?.() ?? Math.max(...plans.map(plan => this.profiles.get(plan.user)?.character?.hour ?? 0));
    const next = new Map(this.profiles), updates: { user: string; profile: FantasyProfile }[] = [];
    for (const plan of plans) {
      if (plan.location !== plans[0].location || plan.destination !== plans[0].destination || plan.transport !== plans[0].transport) return fail('incompatible');
      const saved = this.profiles.get(plan.user);
      if (!saved?.character || saved.death || saved.combatId || saved.activity || saved.event || saved.character.hp <= 0 || (saved.generation ?? 1) !== plan.generation || saved.character.location !== plan.location) return fail('busy');
      const synced = advanceFantasyWorld(saved, Math.max(hour, saved.character.hour), { accrueIdleNeeds: this.onlineUsers.has(plan.user) });
      if (synced.error) return fail('unavailable');
      const quote = fantasyTransports(synced.profile.character!, plan.destination).find(route => route.id === plan.transport && route.available);
      if (!quote || plan.quotedCost !== undefined && quote.cost !== plan.quotedCost || plan.quotedHours !== undefined && quote.hours !== plan.quotedHours) return fail('incompatible');
      const result = startFantasyActivity(synced.profile, { type: 'travel', destination: plan.destination, transport: plan.transport }, hour);
      if (!result.changed || result.error || !result.profile.activity) return fail('incompatible');
      next.set(plan.user, result.profile); updates.push({ user: plan.user, profile: result.profile });
    }
    const arrival = Math.max(...updates.map(update => update.profile.activity!.endsAt));
    for (const update of updates) {
      update.profile.activity!.endsAt = arrival;
      if (!isProfile(update.profile)) return fail('invalid');
    }
    try { this.writeState(next); }
    catch (error) { this.onError(error); return fail('save-failed'); }
    this.profiles = next; return { updates };
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
      if (!saved?.character || saved.death || saved.activity || saved.event) return fail('busy');
      if (saved.character.hour > hour + 1e-8) return fail('incompatible');
      const synchronized = advanceFantasyWorld(saved, Math.max(hour, saved.character.hour), { accrueIdleNeeds: this.onlineUsers.has(plan.user) });
      if (synchronized.error) return fail('unavailable');
      const current = synchronized.profile, c = current.character!;
      if (current.death || current.activity || current.event || (current.generation ?? 1) !== plan.generation || c.location !== plan.location
        || fantasyMainStage(c, plan.quest)?.id !== plan.stage) return fail('incompatible');
      const started = startFantasyActivity(current, { type: 'investigate', quest: plan.quest, approach: plan.approach }, hour, rng);
      if (started.error || !started.changed || !isProfile(started.profile)) return fail('incompatible');
      next.set(plan.user, started.profile); updates.push({ user: plan.user, profile: started.profile });
    }
    try { this.writeState(next); }
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

  apply(user: string, revision: unknown, action: unknown, rng = Math.random, options: { contract?: FantasyContractGrant } = {}): FantasyResult {
    if (this.loadError) return this.reject(user, this.loadError);
    if (this.clockError()) return this.reject(user, this.clockError()!);
    if (!isFantasyAction(action)) return this.reject(user, '操作の形式が正しくありません。');
    const synchronized = this.synchronize(user, this.onlineUsers.has(user));
    if (synchronized.error) return synchronized;
    const current = this.profile(user);
    if (action.type === 'sync') return { profile: current, changed: false };
    if (!count(revision) || current.revision !== revision) return this.reject(user, '別の画面で記録が更新されました。最新の状態で選び直してください。');
    if (this.civicBlocked(user) && action.type !== 'rebirth') return this.reject(user, '身柄の手続きは町の窓口で進めてください。');
    if (action.type === 'propertyUse' && !fantasyPropertyCanUse(this.properties, Object.fromEntries(this.profiles), user, action.plot, current.character?.hour ?? 0)) return this.reject(user, 'この土地を使う権利がありません。');
    if (action.type === 'buy' || action.type === 'sell') {
      const state = this.realmState(user, { session: 'shop', publicSession: false, peers: [user] }).economy;
      const shop = state.shops.find(shop => action.type === 'buy' ? shop.lots.some(lot => lot.item === action.item && lot.count > 0) : shop.sales.some(lot => lot.item === action.item && lot.canSell && (!action.instance || lot.instance === action.instance) && (!action.quality || lot.quality === action.quality)));
      if (!shop) return this.reject(user, fantasyEconomyText('stock', 'ja'));
      const lot = shop.lots.find(lot => lot.item === action.item && lot.count > 0);
      const change = this.realmRequest(user, { domain: 'economy', command: { type: action.type === 'buy' ? 'shopBuy' : 'shopSell', building: shop.building, item: action.item, count: 1, revision: shop.revision, ...(action.type === 'buy' ? { lot: lot?.id } : { ...(action.instance ? { instance: action.instance } : {}), ...(action.quality ? { quality: action.quality } : {}) }) } }, { session: 'shop', publicSession: false, peers: [user] });
      return change.error ? this.reject(user, fantasyEconomyText(change.error, 'ja')) : { profile: this.profile(user), changed: true };
    }
    if (action.type === 'accept') {
      const quest = FANTASY_QUESTS.find(quest => quest.id === action.quest);
      if (quest && !fantasyPersonalQuest(quest) && (!action.offer || !options.contract)) return this.reject(user, '一般依頼はギルドの掲示板から受注してください。');
    }
    const now = this.now();
    const limit = this.limits.get(user);
    if (limit && now - limit.at < 1000 && limit.count >= 8) return this.reject(user, '操作が続いています。少し待ってからお試しください。');
    if (limit && now - limit.at < 1000) limit.count++;
    else this.limits.set(user, { at: now, count: 1 });
    const result = this.worldHour ? startFantasyActivity(current, action, this.worldHour(), rng, options) : applyFantasyAction(current, action, rng, options);
    if (!result.changed || result.error) return { ...result, profile: this.profile(user), changed: false };
    if (!current.character && result.profile.character && this.worldHour) {
      const character = result.profile.character;
      const offset = this.worldHour() - character.hour;
      character.hour += offset;
      if (character.lifeStartedAt !== undefined) character.lifeStartedAt += offset;
      for (const lot of character.foodLots) lot.createdAt += offset;
      for (const entry of result.profile.log) if (entry.hour === 8) entry.hour = character.hour;
    }
    return this.commit(user, result);
  }

  private commit(user: string, result: FantasyResult): FantasyResult {
    const previous = this.profiles.get(user);
    if (previous?.activity?.action.type === 'propertyUse' && !result.profile.activity && result.profile.character && !result.profile.death) result = { ...result, profile: applyFantasyPropertyImprovement(result.profile, previous.activity.action.plot, this.properties, fantasyStats(result.profile.character)).profile };
    result = { ...result, profile: this.enableCombat(result.profile) as FantasyProfile };
    if (!isProfile(result.profile)) {
      this.onError(new Error('Fantasy action produced an invalid profile'));
      return this.reject(user, '冒険記録の整合性を確認できませんでした。操作は確定していません。');
    }
    const next = new Map(this.profiles);
    next.set(user, result.profile);
    try {
      // 保存に成功してから公開し、失敗した抽選や支払いを確定させない。
      this.writeState(next);
    } catch (error) {
      this.onError(error);
      return this.reject(user, '冒険記録を保存できませんでした。操作は確定していません。もう一度お試しください。');
    }
    this.profiles = next;
    return { ...result, profile: this.profile(user) };
  }
}

export function handleFantasyAction(store: FantasyStore, user: { id: string; session: string | null; world?: string }, revision: unknown, action: unknown, options: { contract?: FantasyContractGrant } = {}): FantasyResult {
  if (!user.session || user.world !== 'fantasy') return store.reject(user.id, 'ファンタジー世界のセッションに参加してから操作してください。');
  return store.apply(user.id, revision, action, Math.random, options);
}
