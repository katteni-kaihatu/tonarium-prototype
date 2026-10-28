// antimatter ワールド（AD 研究所）の配置・当たり判定・log スケール写像。
// 見た目（antimatterLab.tsx）と共有する唯一の配置定義。CAFE のやり方に倣い、
// 位置をここに集約して見た目と Solid がずれないようにする。
import type { Solid } from './worlds.ts';

/** 3D 空間から開く前面パネルの宛先。購入ロジックは持たず、親が engine 呼び出しへ結ぶ */
export type AdPanelTarget =
  | 'core' | 'tickspeed' | 'boost' | 'sacrifice' | 'galaxy' | 'crunch'
  | 'dimension-1' | 'dimension-2' | 'dimension-3' | 'dimension-4'
  | 'dimension-5' | 'dimension-6' | 'dimension-7' | 'dimension-8'
  | 'exhibit-infinity' | 'exhibit-eternity' | 'exhibit-reality' | 'exhibit-celestials';

export const DIMENSION_TARGETS: AdPanelTarget[] = [
  'dimension-1', 'dimension-2', 'dimension-3', 'dimension-4',
  'dimension-5', 'dimension-6', 'dimension-7', 'dimension-8',
];

/** 3D 側は BigNum を扱わない。数値は親が format 済みの文字列と log10 だけ渡す */
export interface AdDimensionView {
  tier: number;
  amountText: string;
  productionText: string;
  nextCostText: string;
  bought: number;
  amountLog10: number;
  productionLog10: number;
  /** log10(0) と log10(1) を区別し、生産停止中の演出を出さない。 */
  producing: boolean;
  locked: boolean;
}

export interface AdLabSnapshot {
  antimatterText: string;
  antimatterLog10: number;
  perSecondText: string;
  dimensions: AdDimensionView[];
  tickspeedText: string;
  tickspeedBought: number;
  boosts: number;
  boostRequirementText: string;
  boostCurrentAmountText: string;
  canBoost: boolean;
  galaxies: number;
  galaxyRequirementText: string;
  galaxyCurrentAmountText: string;
  canGalaxy: boolean;
  sacrificeText: string;
  sacrificeUnlocked: boolean;
  canSacrifice: boolean;
  infinityPointsText: string;
  infinities: number;
  canCrunch: boolean;
}

/** 他人の研究所はこの粒度だけ見せる。セーブ本体・正確な数値は共有しない */
export interface AdDioramaView {
  antimatterLog10: number;
  maxTier: number;
  galaxies: number;
  infinities: number;
}

export const ANTIMATTER_CORE = { x: 0, z: -4.5 };
/** 次元塔。低次元ほど南（スポーン寄り）に並べ、生産の流れが高次元→低次元→コアへ向く */
export const ANTIMATTER_TOWERS = [
  { tier: 1, x: -6.75, z: 1 }, { tier: 2, x: -2.25, z: 1 },
  { tier: 3, x: 2.25, z: 1 }, { tier: 4, x: 6.75, z: 1 },
  { tier: 5, x: -6.75, z: -1.5 }, { tier: 6, x: -2.25, z: -1.5 },
  { tier: 7, x: 2.25, z: -1.5 }, { tier: 8, x: 6.75, z: -1.5 },
];
export const ANTIMATTER_ALTAR = { x: -8, z: -7 };
export const ANTIMATTER_PORTAL = { x: 8, z: -7 };
/** 展示ウィング。南壁沿いに並べるがスポーン円（中心 (0,6.5) 半径 1.6）には触れない */
export const ANTIMATTER_EXHIBITS = [
  { id: 'exhibit-infinity' as const, x: -7, z: 9, title: 'Infinity ホール' },
  { id: 'exhibit-eternity' as const, x: -2.33, z: 9, title: 'Eternity 図書室' },
  { id: 'exhibit-reality' as const, x: 2.33, z: 9, title: 'Reality 保管庫' },
  { id: 'exhibit-celestials' as const, x: 7, z: 9, title: 'Celestials 天文台' },
];

export const ANTIMATTER_SOLIDS: Solid[] = [
  { x: ANTIMATTER_CORE.x, z: ANTIMATTER_CORE.z, r: 1.1 },
  ...ANTIMATTER_TOWERS.map((t) => ({ x: t.x, z: t.z, r: 0.75 })),
  { x: ANTIMATTER_ALTAR.x, z: ANTIMATTER_ALTAR.z, r: 0.7 },
  { x: ANTIMATTER_PORTAL.x, z: ANTIMATTER_PORTAL.z, r: 0.8 },
  ...ANTIMATTER_EXHIBITS.map((e) => ({ x: e.x, z: e.z, r: 0.5 })),
];

export const ANTIMATTER_PALETTE = {
  floor: '#1b1d2e', wall: '#2c2f4a', spawn: '#7fd8ff', bg: '#0b0d1a',
};

/** 描画の詳細度。31 人参加時、遠くの研究所は描画コストを落とすための境界 */
export type AdLod = 'full' | 'simple' | 'silhouette';
export const ANTIMATTER_LOD_FULL_M = 12;
export const ANTIMATTER_LOD_SIMPLE_M = 25;
export function lodForDistance(d: number): AdLod {
  if (d < ANTIMATTER_LOD_FULL_M) return 'full';
  if (d < ANTIMATTER_LOD_SIMPLE_M) return 'simple';
  return 'silhouette';
}

/** log10 は非有限・負を 0 に潰す。塔の高さ等はここからだけ決め、粒子数を量に比例させない */
export const clampLog = (v: number) => (Number.isFinite(v) ? Math.max(0, v) : 0);
export const towerHeightFromLog = (log: number) => 0.6 + 0.35 * Math.min(clampLog(log), 12);
export const towerRadiusFromLog = (log: number) => 0.3 + 0.05 * Math.min(clampLog(log), 10);
/** 飽和型。log 30 で約 170 個、log 300 でも 300 個上限に収まる */
export const particleCountFromLog = (log: number) => {
  const l = clampLog(log);
  return l <= 0 ? 0 : Math.round(20 + (280 * l) / (l + 30));
};
export const ringSpeedFromBought = (bought: number) => Math.min(2.5, 0.3 + 0.05 * Math.max(0, bought));
export const streamOpacityFromLog = (log: number) => 0.08 + 0.5 * Math.min(clampLog(log), 20) / 20;
