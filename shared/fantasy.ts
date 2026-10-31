import type { FantasySpecializationState } from './fantasy-specializations.ts';
import type { FantasyPriestGrowth, FantasyPriestBranch } from './fantasy-priest-growth.ts';
import type { FantasyMagicKnowledge } from './fantasy-magic-discovery.ts';
import type { FantasyDungeonState, FantasyDungeonAction } from './fantasy-dungeon.ts';
import type { FantasyInteriorMapAction, FantasyInteriorMapCopy } from './fantasy-interior-maps.ts';

export type FantasyGender = 'male' | 'female' | 'none';
/** 実時間1分あたりのゲーム内分。全参加者で同じ速度を共有する。 */
export const FANTASY_WORLD_TIME_RATE = 30;
export const FANTASY_EVENT_CHANCE = 0.10;
export type FantasySeason = 'spring' | 'summer' | 'autumn' | 'winter';
export interface FantasyWorldClock {
  hour: number;
  rate: typeof FANTASY_WORLD_TIME_RATE;
  serverTime: number;
}
export type FantasyStat = 'strength' | 'agility' | 'intelligence' | 'luck' | 'vitality' | 'dexterity' | 'charisma';
export type FantasyCheckContext = 'narrow-space' | 'trap' | 'deep-water' | 'high-place' | 'heat' | 'cold' | 'heavy-lifting' | 'keen-senses';
export type FantasyStats = Record<'hp' | 'mp' | 'strength' | 'agility' | 'intelligence' | 'luck' | 'vitality', number> & Partial<Record<'dexterity' | 'charisma', number>>;

export interface FantasySkill {
  restore?:'mp';
  utility?:string;
  retired?:boolean;
  id: string;
  name: string;
  names?: Record<'ko' | 'en' | 'ja', string>;
  kind: 'passive' | 'active';
  description: string;
  descriptions?: Record<'ko' | 'en' | 'ja', string>;
  mp: number;
  effect: 'check' | 'heal' | 'guard' | 'reward' | 'travel';
  stat?: FantasyStat;
  power: number;
  diceFaces?: 'steady' | 'even' | 'upper';
  unlock?:
    | { kind: 'job'; xp: number }
    | { kind: 'skill'; skill: string; xp: number }
    | { kind: 'book'; book: string; jobXp?: number }
    | { kind: 'mentor'; jobXp?: number }
    | { kind: 'condition'; condition: 'explore' | 'craft' | 'gather' | 'hunt' | 'fish' | 'command'; count: number };
}
export interface FantasyRace {
  id: string;
  family: string;
  names: Record<'ko' | 'en' | 'ja', string>;
  name: string;
  description: string;
  descriptions?: Record<'ko' | 'en' | 'ja', string>;
  rarity: string;
  weight: number;
  gender?: FantasyGender;
  modifiers: Partial<FantasyStats>;
  skills: [FantasySkill, FantasySkill];
  affinity: string[];
}
export interface FantasyRaceFamily {
  id: string;
  name: string;
  names: Record<'ko' | 'en' | 'ja', string>;
  description: string;
}
export interface FantasyJob {
  id: string;
  names: Record<'ko' | 'en' | 'ja', string>;
  category: 'ordinary' | 'crime' | 'none';
  name: string;
  description: string;
  descriptions?: Record<'ko' | 'en' | 'ja', string>;
  stat: FantasyStat;
  extra?: 'dexterity' | 'charisma';
  skills: FantasySkill[];
  eventIds: string[];
}
export interface FantasyLocation {
  id: string;
  name: string;
  region: string;
  land: 'aurelia' | 'noctis' | 'sylvara' | 'kazaran' | 'islands' | 'frontier';
  names?: Record<'ko' | 'en' | 'ja', string>;
  descriptions?: Record<'ko' | 'en' | 'ja', string>;
  x: number;
  y: number;
  kind: 'city' | 'forest' | 'mountain' | 'cave' | 'ruin' | 'coast' | 'swamp' | 'desert' | 'volcano' | 'island' | 'tower' | 'snow';
  description: string;
  danger: number;
  resources: string[];
  services: ('guild' | 'market' | 'workshop' | 'inn' | 'port' | 'gate')[];
}
export interface FantasyRoute {
  from: string;
  to: string;
  mode: 'land' | 'sea' | 'gate';
  hours: number;
}
export type FantasyEquipmentSlot = 'weapon' | 'offhand' | 'head' | 'body' | 'legs' | 'feet' | 'ring1' | 'ring2' | 'necklace' | 'gloves' | 'artifact' | 'armor' | 'accessory';
export interface FantasyGearInstance {
  id: string; item: string; quality: 1 | 2 | 3 | 4 | 5; createdAt: number;
  bonuses?: Partial<FantasyStats>; guard?: number; check?: number; material?: string; gem?: string;
}
export interface FantasyTimedEffect {
  id: string; expiresAt: number; stats?: Partial<FantasyStats>; check?: number; guard?: number; periodicHp?: number;
  diceFaces?: 'odd' | 'lower'; dicePenalty?: number;
}
export interface FantasyItem {
  craftOnly?:boolean;
  combatUse?:Omit<import('./fantasy-combat.ts').FantasyCombatSkill,'id'|'names'|'mp'>;
  id: string; name: string; price: number; description: string;
  names?: Record<'ko' | 'en' | 'ja', string>; descriptions?: Record<'ko' | 'en' | 'ja', string>;
  category?: string; tier?: 1 | 2 | 3 | 4 | 5;
  use?: { hp?: number; mp?: number; fatigue?: number; hunger?: number; cure?: string[];
    effect?: { id: string; hours: number; stats?: Partial<FantasyStats>; check?: number; guard?: number };
    permanent?: Partial<FantasyStats>; permanentCap?: number };
  equipment?: { slot: FantasyEquipmentSlot; stats?: Partial<FantasyStats>; check?: number; guard?: number };
  sellJobs?: string[]; buyJobs?: string[];
  drop?: { kinds?: FantasyLocation['kind'][]; chance: number; minDanger?: number };
  food?: { shelfLife: number; nutrition: number };
  foodPenalty?: { fatigue: number; status?: 'poison' | 'weakness' };
  light?: boolean;
  wear?: { warmth: number; cooling: number; waterproof: number };
  weatherTool?: { warmth?: number; cooling?: number; waterproof?: number; campOnly?: boolean };
}
export interface FantasyRecipe { id: string; name: string; job: string; inputs: Record<string, number>; output: string; count: number; dc: number;requiresBook?:string;requiresLocations?:string[] }
export type FantasyQuestObjective =
  | { type: 'dungeon'; site: string; goal: 'inspect' | 'clear'; count: number }
  | { type: 'hunt'; monster?: string; count: number }
  | { type: 'gather'; resource: 'herbs' | 'wood' | 'minerals' | 'gems'; count: number }
  | { type: 'craft'; recipe: string; count: number }
  | { type: 'fish'; mode: 'pier' | 'sea'; count: number }
  | { type: 'survey'; count: number };
export interface FantasyQuest {
  id: string; name: string; description: string; giver: string; destination: string; item: string; count: number; gold: number; xp: number;
  names?: Record<'ko' | 'en' | 'ja', string>; descriptions?: Record<'ko' | 'en' | 'ja', string>;
  races?: string[]; families?: string[]; building?: string;
  jobs?: string[];
  institution?: import('./fantasy-institutions.ts').FantasyInstitution;
  requiresCompleted?: string[];
  issuer?: string;
  reportAt?: string;
  completionLabel?: Record<'ko' | 'en' | 'ja', string>;
  dialogue?: Record<'ko' | 'en' | 'ja', string>;
  chapter?: number;
  group?: boolean;
  seasons?: FantasySeason[];
  objective?: FantasyQuestObjective;
}
export interface FantasyEventChoice {
  id: string; label: string; stat: FantasyStat; dc: number; success: string; failure: string; gold: number; item?: string;
  labels?: Record<'ko' | 'en' | 'ja', string>; context?: FantasyCheckContext;
  successes?: Record<'ko' | 'en' | 'ja', string>;
  failures?: Record<'ko' | 'en' | 'ja', string>;
}
export interface FantasyEvent {
  id: string; job?: string; name: string; description: string; choices: FantasyEventChoice[];
  names?: Record<'ko' | 'en' | 'ja', string>; descriptions?: Record<'ko' | 'en' | 'ja', string>;
  races?: string[]; families?: string[]; locations?: string[];
}
export interface FantasyLog { id: number; hour: number; text: string; kind: 'story' | 'success' | 'failure' | 'system' }
export interface FantasyFoodLot { id: string; item: string; count: number; createdAt: number; preservedHours?:number; preservationAt?:number }
export interface FantasyManaState {
  stage: 0 | 1 | 2 | 3 | 4;
  mastery: number;
  strain: number;
  affinity: 'balanced' | 'flame' | 'tide' | 'gale' | 'stone' | 'light' | 'shadow';
  useXp?: number;
}
export type FantasyMainApproach = 'observe' | 'analyze' | 'restore';
export interface FantasyMainTrialState {
  acceptedAt: number;
  proofs: { stage: string; approach: FantasyMainApproach; hour: number }[];
  attempts: number;
}
export interface FantasyCharacter {
  name: string;
  race: string;
  gender: FantasyGender;
  job: string;
  lifeJob?: string;
  level: number;
  xp: number;
  gold: number;
  hp: number;
  /** Current job maximum-HP formula; absent only in legacy saves. */
  jobHpVersion?: 1;
  mp: number;
  location: string;
  /** Authoritative road position, also retained when a journey is interrupted. */
  travelPosition?: FantasyTravelPosition;
  hour: number;
  fatigue: number;
  hunger: number;
  foodLots: FantasyFoodLot[];
  charted: string[];
  inventory: Record<string, number>;
  quests: string[];
  completed: string[];
  visited: string[];
  seen?: string[];
  jobXp: Record<string, number>;
  buff: { stat?: FantasyStat; power: number; effect: FantasySkill['effect']; skill?: string; mp?: number; diceFaces?: 'steady' | 'even' | 'upper'; dice?: number; expiresAt?: number } | null;
  equipment?: Partial<Record<FantasyEquipmentSlot, string>>;
  effects?: FantasyTimedEffect[];
  permanentBonuses?: Partial<FantasyStats>;
  reputation?: { lands: Record<string, number>; regions: Record<string, number>; towns: Record<string, number> };
  bargains?: Partial<Record<'room' | 'food' | 'goods', { location: string; discount: number; expiresAt: number; nextAt: number }>>;
  mana?: FantasyManaState;
  magicKnowledge?: FantasyMagicKnowledge;
  manaRecoveryAt?:number;
  utilityPractice?:import('./fantasy-world-utilities.ts').FantasyUtilityPractice;
  bag?:string;
  pendingLoot?:Record<string,import('./fantasy-bags.ts').FantasyPendingLoot>;
  productionClaims?:string[];
  interiorMaps?: FantasyInteriorMapCopy[];
  blackMarketClues?:string[];
  blackMarketStudies?:string[];
  circleKnowledge?: import('./fantasy-magic-circle.ts').FantasyCircleKnowledge;
  alchemyKnowledge?: import('./fantasy-alchemy-discovery.ts').FantasyAlchemyKnowledge;
  occult?: import('./fantasy-occult.ts').FantasyOccultState;
  downed?: import('./fantasy-downed.ts').FantasyDownedState;
  miracles?: import('./fantasy-miracles.ts').FantasyMiracleKnowledge;
  lastDawnPledge?: {combat:string;generation:number};
  soulAfflictions?: import('./fantasy-miracle-combat.ts').FantasySoulAffliction[];
  carrying?: import('./fantasy-carry-return.ts').FantasyCarryState;
  returnLantern?: import('./fantasy-carry-return.ts').FantasyReturnLanternState;
  dungeon?: FantasyDungeonState;
  learnedSkills?: string[];
  skillXp?: Record<string, number>;
  practice?: Partial<Record<'explore' | 'craft' | 'gather' | 'hunt' | 'fish' | 'command', number>>;
  readBooks?: string[];
  unlockedSkills?: string[];
  proficiencyUse?: { key: string; hour: number; repeats: number };
  gear?: FantasyGearInstance[];
  equippedGear?: Partial<Record<FantasyEquipmentSlot, string>>;
  fishingBoat?: { kind: 'rented' | 'owned'; expiresAt?: number };
  carcass?: { location: string; hour: number; monster: string; hide: string; count: number };
  specialization?: FantasySpecializationState;
  lifeStartedAt?: number;
  birthBonuses?: Partial<FantasyStats>;
  outfit?: string;
  lastHunt?: { id: string; location: string; hour: number; success: boolean; count?:number; receipt?:string };
  contracts?: Record<string, import('./fantasy-contracts.ts').FantasyContractGrant>;
  magicBags?: string[];
  retreatMemories?: import('./fantasy-retreats.ts').FantasyRetreatMemory[];
  rankBenefits?: import('./fantasy-rank-benefits.ts').FantasyRankBenefitsState;
  rankBookRewards?: import('./fantasy-rank-rewards.ts').FantasyRankBookRewards;
  guildProgress?: import('./fantasy-guild-progression.ts').FantasyGuildProgress;
  underworld?: import('./fantasy-underworld.ts').FantasyUnderworldProgress;
  contractParties?: Record<string,import('./fantasy-party-contracts.ts').FantasyPartyContractRecord>;
  guildAssessment?: {grade:import('./fantasy-adventurer.ts').FantasyAdventurerGrade;score:number;assessedAt:number};
  encounterTier?:import('./fantasy-adventurer.ts').FantasyRegularEncounterTier;
  equipmentVersion?: 1;
  expedition?: import('./fantasy-expedition.ts').FantasyExpeditionProgress;
  monsterSites?:string[];
  notoriety?: number;
  lastPrayerDay?: number;
  priestGrowth?: FantasyPriestGrowth;
  mainTrials?: Record<string, FantasyMainTrialState>;
  taskProgress?: Record<string, { acceptedAt: number; progress: number; lastAt: number }>;
  escort?: { id: string; from: string; destination: string; hours: number; reward: number; acceptedAt: number; defense?: 'pending' | 'cleared' };
  escortHistory?: Record<string, number>;
  escortPenalty?: { amount: number; paid: number; hour: number; destination: string };
  voyageEnding?: { hour: number };
  voyageDecisions?: Record<string, { choice: string; hour: number }>;
  combatStoryVersion?: 1;
  combatVictories?: Record<string, number>;
  honors?: string[];
  apexWarnings?: Record<string, { location: string; hour: number }>;
  propertyTitles?: string[];
  jobPaths?: Record<string, { path: string; hour: number }>;
}
export interface FantasyLifeTrace {
  generation: number; name: string; race: string; job: string; level: number;
  hour: number; location: string; cause: string; visited: string[]; completed: string[];
  jobXp: Record<string, number>; reputation?: FantasyCharacter['reputation']; ageHours?: number;
}
export interface FantasyLegacyRecord {
  id: string; generation: number; name: string; race: string; job: string; level: number;
  hour: number; location: string | null; visitedCount: number; questCount: number;
}
export interface FantasyProfile {
  version: 1;
  revision: number;
  draft: { remaining: number; candidate: string | null; kept: string | null };
  character: FantasyCharacter | null;
  event: string | null;
  log: FantasyLog[];
  activity?: FantasyActivity;
  pastLives?: FantasyLifeTrace[];
  generation?: number;
  death?: { location: string; hour: number; cause: string };
  combatId?: string;
}
export interface FantasyActivity {
  action: FantasyAction;
  startedAt: number;
  endsAt: number;
  /** Persisted deterministic roll stream; never a precomputed visible result. */
  seed: number;
  camp?: import('./fantasy-camping.ts').FantasyCampProgress;
  cookingMage?: boolean;
  cooking?: { completed: number };
  retreatCamp?: import('./fantasy-retreats.ts').FantasyRetreatCampSnapshot;
  work?: FantasyWorkProgress;
  travel?: FantasyTravelState;
}
export interface FantasyTravelPosition { from: string; to: string; fraction: number; transport?: 'ship' | 'working-ship' | 'airship' | 'gate'; remainingHours?: number }
export interface FantasyTravelLeg { from: string; to: string; transport: string; hours: number; cost: number; startFraction?: number }
export interface FantasyTravelState { legs: FantasyTravelLeg[]; paid: number; ambushChecked: number; ambushStartedAt?: number }
export interface FantasyWorkProgress { completed: number; successes: number; gold: number; xp: number; totalSteps?: 8 | 16 }
export type FantasyAction =
    | import('./fantasy-cooking.ts').FantasyCookingAction
  | import('./fantasy-alchemy-synthesis.ts').FantasyAlchemyComposeAction
  | {type:'bagEquip';item:string}
  | {type:'bagClaim'}
  | import('./fantasy-occult.ts').FantasyOccultAction
  | {type:'magicCompose';slot:number;core:string;runes:string[]}
  | {type:'downedCare';method:'potion'|'temple'}
  | FantasyDungeonAction
  | FantasyInteriorMapAction
  | { type: 'templeTreat' }
  | { type: 'sync' }
  | { type: 'draw' }
  | { type: 'keep' }
  | { type: 'skip' }
  | { type: 'create'; name: string; gender: 'male' | 'female'; source: 'human' | 'candidate' | 'kept'; job?: string }
  | { type: 'travel'; destination: string; transport: string }
  | { type: 'escortAccept'; destination: string }
  | { type: 'escortAbandon' }
  | { type: 'finishVoyage' }
  | { type: 'voyageDecision'; decision: string; choice: string }
  | { type: 'explore' }
  | { type: 'rest'; watch?: boolean }
  | { type: 'lodge'; room: 'common' | 'private' | 'suite' }
  | { type: 'eat'; meal: 'simple' | 'hearty' | 'feast' }
  | { type: 'work'; career?: 'combat' | 'life' }
  | { type: 'pray' }
  | { type: 'guildAssess' }
  | import('./fantasy-underworld.ts').FantasyUnderworldAction
  | { type: 'magicBagRemove'; slot: 0 | 1 }
  | { type: 'campCook'; recipe: string }
  | { type: 'rankBookClaim'; source: 'adventurer' | 'priest'; skill: string }
  | import('./fantasy-rank-benefits.ts').FantasyRankBenefitAction
  | { type: 'guildRaidStart';offer:string }
  | { type: 'propertyUse'; plot: string }
  | { type: 'advanceJob'; path: string }
  | import('./fantasy-miracles.ts').FantasyMiracleAction
  | { type: 'priestVow'; quest: string }
  | { type: 'priestReleaseVow' }
  | { type: 'priestBranch'; branch: FantasyPriestBranch }
  | { type: 'gather'; resource: 'herbs' | 'wood' | 'minerals' | 'gems' }
  | { type: 'hunt'; monster?: string }
  | { type: 'skin' }
  | { type: 'fish'; mode: 'pier' | 'sea' }
  | { type: 'boat'; mode: 'rent' | 'buy' }
  | { type: 'rebirth' }
  | { type: 'read'; book: string }
  | { type: 'wear'; item: string }
  | { type: 'terrain'; activity: string }
  | { type: 'job'; job: string; via?: 'guild' | 'npc' | 'gm'; npcId?: string }
  | { type: 'accept'; quest: string; offer?: string }
  | { type: 'complete'; quest: string }
  | { type: 'abandon'; quest: string }
  | { type: 'investigate'; quest: string; approach: FantasyMainApproach }
  | { type: 'craft'; recipe: string; material?: string; gem?: string; workshop?: string }
  | ({ type: 'commission' } & import('./fantasy-commissions.ts').FantasyCommissionRequest)
  | { type: 'sell'; item: string; instance?: string; quality?: 'fresh' | 'stale' | 'spoiled' }
  | { type: 'buy'; item: string; count?: number; building?: import('./fantasy-town.ts').FantasyBuildingId }
  | { type: 'use'; item: string }
  | { type: 'equip'; item: string; instance?: string; slot?: FantasyEquipmentSlot }
  | { type: 'expeditionJoin'; route: 'guild' | 'smuggler' }
  | { type: 'unequip'; slot: FantasyEquipmentSlot }
  | { type: 'haggle'; service: 'room' | 'food' | 'goods' }
  | { type: 'manaTrain'; exercise: 'sense' | 'circulate' | 'shape' | 'release' | 'refine' }
  | { type: 'learn'; skill: string; npcId: string }
  | { type: 'skill'; skill: string }
  | { type: 'command'; kind: 'troop' | 'syndicate' | 'summons'; operation: 'hire' | 'assign' | 'dismiss' | 'mission' | 'recover' | 'recontract'; member?: string }
  | { type: 'magicPrepare'; slot: number; element: string; form: string }
  | { type: 'magicCast'; slot: number }
  | { type: 'alchemy'; formula: string }
  | { type: 'event'; choice: string }
  | { type: 'cancel' }
  | { type: 'redirect'; destination: string; transport?: string };
export interface FantasyTransport {
  id: string;
  name: string;
  description: string;
  hours: number;
  cost: number;
  reward?: number;
  available: boolean;
  reason?: string;
  path: string[];
  legs?: FantasyTravelLeg[];
}
export interface FantasyResult { profile: FantasyProfile; error?: string; changed: boolean }
