export interface BigNum { mantissa: number; exponent: number }
export interface DimensionState { amount: BigNum; bought: number; tier: number }
export type AutobuyerId = 'lowDims' | 'highDims' | 'tickspeed' | 'boost' | 'galaxy' | 'crunch';
export interface AutobuyerState { unlocked: boolean; enabled: boolean; level: number; elapsedMs: number }
export type InfinityUpgradeId =
  | 'totalTime' | 'dims18' | 'dims36' | 'resetReq'
  | 'buy10' | 'dims27' | 'dims45' | 'galaxyBoost'
  | 'runTime' | 'unspentIp' | 'boostMult' | 'ipGen'
  | 'startBoost1' | 'startBoost2' | 'startBoost3' | 'startGalaxy';
export interface InfinityUpgradeDef { id: InfinityUpgradeId; column: number; row: number; cost: number }
export type InfinityUpgradeEffect =
  | { kind: 'mult'; value: BigNum }
  | { kind: 'reduce'; value: number }
  | { kind: 'ms'; value: number }
  | { kind: 'start'; boosts: number; galaxies: number };
export interface GameState {
  version: number;
  antimatter: BigNum;
  dimensions: DimensionState[];
  tickspeed: number;
  tickspeedBought: number;
  dimensionalBoosts: number;
  galaxies: number;
  sacrificeBoost: BigNum;
  sacrificeTotalFirst: BigNum;
  achievements: string[];
  infinityPoints: BigNum;
  infinities: number;
  autobuyers: Record<AutobuyerId, AutobuyerState>;
  infinityUpgrades: InfinityUpgradeId[];
  runStartedAt: number;
  bestInfinityMs: number | null;
  ipGenElapsedMs: number;
  totalAntimatter: BigNum;
  lastTick: number;
  createdAt: number;
}
export interface OfflineResult {
  elapsedMs: number;
  simulatedMs: number;
  antimatterBefore: BigNum;
  antimatterAfter: BigNum;
  antimatterGained: BigNum;
}
export const VERSION: number;
export const OFFLINE_CAP_MS: number;
export const SACRIFICE_MIN_GAIN: number;
export const INFINITY_THRESHOLD_LOG10: number;
export const AUTOBUYER_IDS: AutobuyerId[];
export const AUTOBUYER_RUN_ORDER: AutobuyerId[];
export const AUTOBUYER_UNLOCK_COST: Record<AutobuyerId, number>;
export const AUTOBUYER_BASE_INTERVAL_MS: number;
export const AUTOBUYER_INTERVAL_FACTOR: number;
export const AUTOBUYER_MIN_INTERVAL_MS: number;
export const AUTOBUYER_MAX_LEVEL: number;
export const INFINITY_UPGRADES: InfinityUpgradeDef[];
export const INFINITY_UPGRADE_IDS: InfinityUpgradeId[];
export const INFINITY_UPGRADE_PARAMS: Record<string, unknown>;
export function hasInfinityUpgrade(state: GameState, id: InfinityUpgradeId): boolean;
export function isInfinityUpgradeAvailable(state: GameState, id: InfinityUpgradeId): boolean;
export function canBuyInfinityUpgrade(state: GameState, id: InfinityUpgradeId): boolean;
export function buyInfinityUpgrade(state: GameState, id: InfinityUpgradeId): boolean;
export function getInfinityUpgradeEffect(state: GameState, id: InfinityUpgradeId): InfinityUpgradeEffect;
export function getStartingState(state: GameState): { boosts: number; galaxies: number };
export function getIpGenerationInterval(state: GameState): number | null;
export function createAutobuyers(): Record<AutobuyerId, AutobuyerState>;
export function getAutobuyerInterval(level: number): number;
export function getAutobuyerUpgradeCost(state: GameState, id: AutobuyerId): number | null;
export function unlockAutobuyer(state: GameState, id: AutobuyerId): boolean;
export function setAutobuyerEnabled(state: GameState, id: AutobuyerId, enabled: boolean): boolean;
export function upgradeAutobuyerInterval(state: GameState, id: AutobuyerId): boolean;
export function runAutobuyers(state: GameState, dtMs: number): void;
export function bigNormalize(mantissa: number, exponent?: number): BigNum;
export function toBig(value: unknown): BigNum;
export function bigFromNumber(n: number): BigNum;
export function bigFromLog10(log10: number): BigNum;
export function bigZero(): BigNum;
export function bigOne(): BigNum;
export function bigClone(b: BigNum): BigNum;
export function bigLog10(b: BigNum): number;
export function bigCompare(a: BigNum, b: BigNum): number;
export function bigGte(a: BigNum, b: BigNum): boolean;
export function bigGt(a: BigNum, b: BigNum): boolean;
export function bigLte(a: BigNum, b: BigNum): boolean;
export function bigLt(a: BigNum, b: BigNum): boolean;
export function bigEq(a: BigNum, b: BigNum): boolean;
export function bigAdd(a: BigNum, b: BigNum): BigNum;
export function bigSub(a: BigNum, b: BigNum): BigNum;
export function bigMul(a: BigNum, b: BigNum): BigNum;
export function bigDiv(a: BigNum, b: BigNum): BigNum;
export function bigMulNumber(a: BigNum, scalar: number): BigNum;
export function bigPow(a: BigNum, p: number): BigNum;
export function bigToNumber(b: BigNum): number;
export function formatNumber(value: BigNum | number, decimals?: number): string;
export function createNewGame(now?: number): GameState;
export function getDimensionCost(state: GameState, tier: number): BigNum;
export function getDimensionCostForBulk(state: GameState, tier: number, count: number): BigNum;
export function getTickspeedCost(state: GameState): BigNum;
export function getTickspeedPerPurchase(state: GameState): number;
export function getEffectiveTickspeed(state: GameState): number;
export function getEffectiveTickspeedBig(state: GameState): BigNum;
export function getEffectiveTickspeedLog10(state: GameState): number;
export function getMaxUnlockedTier(state: GameState): number;
export function getDimensionMultiplierBig(state: GameState, tier: number): BigNum;
export function getDimensionProductionPerSecond(state: GameState, tier: number): BigNum;
export function getAntimatterPerSecond(state: GameState): BigNum;
export function getDimensionalBoostRequirement(state: GameState): { tier: number; amount: number };
export function getGalaxyRequirement(state: GameState): { tier: number; amount: number };
export function canDimensionalBoost(state: GameState): boolean;
export function canAntimatterGalaxy(state: GameState): boolean;
export function getInfinityGain(state: GameState): number;
export function canInfinity(state: GameState): boolean;
export function canSacrifice(state: GameState): boolean;
export function rescueIfStuck(state: GameState): boolean;
export function getSacrificeCandidate(state: GameState): BigNum;
export function checkAchievements(state: GameState): string[];
export function tick(state: GameState, dtMs: number): GameState;
export function buyDimension(state: GameState, tier: number): boolean;
export function buyMaxDimension(state: GameState, tier: number, maxIterations?: number): number;
export function buyMax(state: GameState): void;
export function buyTickspeed(state: GameState): boolean;
export function buyMaxTickspeed(state: GameState, maxIterations?: number): number;
export function dimensionalBoost(state: GameState): boolean;
export function antimatterGalaxy(state: GameState): boolean;
export function sacrifice(state: GameState): boolean;
export function prestigeInfinity(state: GameState): boolean;
export function offlineProgress(state: GameState, now?: number): OfflineResult;
export function serialize(state: GameState): string;
export function deserialize(input: string | Record<string, unknown>, now?: number): GameState;
