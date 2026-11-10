import type { UiMessage } from '../../i18n/core.ts';
export interface BigNum {
  mantissa: number;
  exponent: number;
}

export type AutobuyerId = 'lowDims' | 'highDims' | 'tickspeed' | 'boost' | 'galaxy' | 'crunch';

export type InfinityUpgradeId = import('../../ad/engine.mjs').InfinityUpgradeId;
export type InfinityUpgradeEffect = import('../../ad/engine.mjs').InfinityUpgradeEffect;

export interface InfinityUpgradeDerived {
  id: InfinityUpgradeId;
  column: number;
  row: number;
  cost: number;
  owned: boolean;
  /** 列の上の段まで買ってある（買えるかどうかは IP 次第）。 */
  available: boolean;
  canBuy: boolean;
  effect: InfinityUpgradeEffect;
}

export interface AutobuyerState {
  unlocked: boolean;
  enabled: boolean;
  level: number;
  elapsedMs: number;
}

export interface AutobuyerDerived {
  id: AutobuyerId;
  unlocked: boolean;
  enabled: boolean;
  intervalMs: number;
  unlockCost: number;
  canUnlock: boolean;
  upgradeCost: number | null;
  canUpgrade: boolean;
}

export interface DimensionState {
  amount: BigNum;
  bought: number;
  tier: number;
}

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

export interface DimensionDerived {
  purchaseEtaSeconds: number;
  milestoneEtaSeconds: number;
  tier: number;
  amount: BigNum;
  bought: number;
  cost: BigNum;
  productionPerSecond: BigNum;
  /** Sacrifice を除く、強化込みの倍率（第8次元の Sacrifice は別に出す）。 */
  multiplier: BigNum;
  affordable: boolean;
  locked: boolean;
  nextMilestoneRemaining: number;
}

export interface RequirementDerived {
  tier: number;
  amount: number;
  currentAmount: BigNum;
  can: boolean;
}

export interface SacrificeDerived {
  unlocked: boolean;
  can: boolean;
  boost: BigNum;
  next: BigNum;
  boosts: number;
}

export interface InfinityDerived {
  can: boolean;
  gain: number;
}

export interface MultiplierBreakdown {
  tier: number;
  locked: boolean;
  buy10: BigNum;
  boost: BigNum;
  other: BigNum;
  total: BigNum;
}

/** 説明とツールチップ用に、エンジンの式で「実行したらどうなるか」を先に求めた値。 */
export interface PreviewDerived {
  tickspeedNext: BigNum;
  boostFirst: BigNum;
  boostFirstNext: BigNum;
  galaxyPerPurchaseNext: number;
  sacrificeNeeded: BigNum;
  infinityThresholdLog10: number;
  breakdown: MultiplierBreakdown[];
}

export interface DerivedSnapshot {
  antimatterPerSecond: BigNum;
  tickspeedValue: BigNum;
  tickspeedBought: number;
  tickspeedCost: BigNum;
  tickspeedAffordable: boolean;
  tickspeedPerPurchase: number;
  maxUnlockedTier: number;
  dimensions: DimensionDerived[];
  boost: RequirementDerived;
  galaxy: RequirementDerived;
  sacrifice: SacrificeDerived;
  infinity: InfinityDerived;
  autobuyers: AutobuyerDerived[];
  infinityUpgrades: InfinityUpgradeDerived[];
  preview: PreviewDerived;
}

export interface AdProfile {
  id: string;
  name: string;
  createdAt?: string | number | null;
}

/** ad/api.ts の LeaderboardEntry と同じ形（応答に playerId は含まれない。自分の行には self が付く） */
export interface LeaderboardEntry {
  name: string;
  antimatterLog10: number;
  infinities: number;
  playTimeSec: number;
  dimensionalBoosts?: number;
  galaxies?: number;
  self?: boolean;
}

export interface OfflineNotice {
  elapsedMs: number;
  simulatedMs: number;
  antimatterGained: BigNum;
}

export interface ImportResult {
  ok: boolean;
  message: UiMessage;
}

/**
 * ad スライスがこのパネルへ渡す契約。ゲーム計算は engine.mjs 側が正で、
 * このパネルは derived の表示と action の呼び出しだけを行う。
 * tickVersion は 100ms の tick ごとに 1 ずつ増える描画間引きの基準で、
 * スライスは tick のたびに derived へ新しい参照を渡すこと。
 */
export interface AntimatterSlice {
  game: GameState;
  derived: DerivedSnapshot;
  tickVersion: number;
  migration: boolean;
  syncSources: { local: Record<string, unknown>; remote: Record<string, unknown> } | null;
  progressSources: import('../../ad/user.mjs').ProgressSource[];
  selectProgress: (key: string) => void;
  restoreProgress: (key: string) => void;
  exportProgress: (key: string) => string;
  activeProfile: AdProfile | null;
  offlineNotice: OfflineNotice | null;
  rescueCount: number;
  leaderboard: LeaderboardEntry[];
  serverStatus: UiMessage | null;
  syncState: 'disconnected' | 'loading' | 'choice' | 'ready' | 'error';
  chooseSave: (source: 'local' | 'remote') => void;
  issueTransfer: () => Promise<{ code: string; expiresAt: number }>;
  exchangeTransfer: (code: string) => Promise<void>;
  lastSavedAt: string | null;
  buyDimension: (tier: number) => void;
  buyUntilNextTen: (tier: number) => void;
  buyMax: () => void;
  buyTickspeed: () => void;
  dimensionalBoost: () => boolean;
  antimatterGalaxy: () => boolean;
  sacrifice: () => boolean;
  prestigeInfinity: () => number;
  unlockAutobuyer: (id: AutobuyerId) => void;
  setAutobuyer: (id: AutobuyerId, enabled: boolean) => void;
  upgradeAutobuyer: (id: AutobuyerId) => void;
  buyInfinityUpgrade: (id: InfinityUpgradeId) => void;
  resetGame: () => void;
  exportBundle: () => string;
  recoveryRecords: { key: string; createdAt: string | null }[];
  exportRecoveryBundle: (source: 'local' | 'remote', key?: string) => string;
  importBundle: (text: string, confirmLegacy?: boolean) => ImportResult;
  dismissOffline: () => void;
  saveToServer: () => Promise<void>;
  loadFromServer: () => Promise<void>;
  refreshLeaderboard: () => Promise<void>;
  submitScore: (name: string) => Promise<void>;
}

export interface AntimatterPanelProps {
  ad: AntimatterSlice;
}
