export interface BigNum {
  mantissa: number;
  exponent: number;
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
  totalAntimatter: BigNum;
  lastTick: number;
  createdAt: number;
}

export interface DimensionDerived {
  tier: number;
  amount: BigNum;
  bought: number;
  cost: BigNum;
  productionPerSecond: BigNum;
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
  boosts: number;
}

export interface InfinityDerived {
  can: boolean;
  gain: number;
}

export interface DerivedSnapshot {
  antimatterPerSecond: BigNum;
  tickspeedValue: number;
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
}

export interface AdProfile {
  id: string;
  name: string;
  createdAt?: string | number | null;
}

export interface LeaderboardEntry {
  playerId: string;
  name: string;
  antimatterLog10: number;
  infinities: number;
  playTimeSec: number;
}

export interface OfflineNotice {
  elapsedMs: number;
  simulatedMs: number;
  antimatterGained: BigNum;
}

export interface ImportResult {
  ok: boolean;
  message: string;
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
  profiles: AdProfile[];
  activeProfile: AdProfile | null;
  offlineNotice: OfflineNotice | null;
  leaderboard: LeaderboardEntry[];
  serverStatus: string | null;
  lastSavedAt: string | null;
  buyDimension: (tier: number) => void;
  buyUntilNextTen: (tier: number) => void;
  buyMax: () => void;
  buyTickspeed: () => void;
  dimensionalBoost: () => boolean;
  antimatterGalaxy: () => boolean;
  sacrifice: () => boolean;
  prestigeInfinity: () => number;
  switchProfile: (userId: string) => void;
  createProfile: (name: string) => void;
  deleteProfile: (userId: string) => void;
  resetGame: () => void;
  exportBundle: () => string;
  importBundle: (text: string) => ImportResult;
  dismissOffline: () => void;
  saveToServer: () => Promise<void>;
  loadFromServer: () => Promise<void>;
  refreshLeaderboard: () => Promise<void>;
  submitScore: (name: string) => Promise<void>;
}

export interface AntimatterPanelProps {
  ad: AntimatterSlice;
}
