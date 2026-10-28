// AD のゲーム状態を 3D 研究所用のスナップショットと操作口へ変換する接着層。
// 3D 側は BigNum を扱わず、数値は format 済み文字列と log10 だけを受け取る。
import {
  bigLog10,
  canAntimatterGalaxy,
  canDimensionalBoost,
  canInfinity,
  canSacrifice,
  formatNumber,
  getAntimatterPerSecond,
  getDimensionalBoostRequirement,
  getDimensionCost,
  getDimensionProductionPerSecond,
  getEffectiveTickspeed,
  getGalaxyRequirement,
  getMaxUnlockedTier,
  getTickspeedCost,
  type GameState,
} from './engine.mjs';
import type { AdPanelTarget, AdLabSnapshot } from '../../../shared/antimatterLayout.ts';
import type { AdActions } from '../view3d/antimatterPanels.tsx';
import type { AdSlice } from './slice.ts';

const log10Of = (v: Parameters<typeof bigLog10>[0]): number => {
  const v2 = bigLog10(v);
  return Number.isFinite(v2) ? v2 : 0;
};

export function buildAdLabSnapshot(game: GameState): AdLabSnapshot {
  const maxUnlockedTier = getMaxUnlockedTier(game);
  const boostReq = getDimensionalBoostRequirement(game);
  const galaxyReq = getGalaxyRequirement(game);
  return {
    antimatterText: formatNumber(game.antimatter),
    antimatterLog10: log10Of(game.antimatter),
    perSecondText: formatNumber(getAntimatterPerSecond(game)),
    dimensions: game.dimensions.map((dim, i) => {
      const tier = i + 1;
      const production = getDimensionProductionPerSecond(game, tier);
      return {
        tier,
        amountText: formatNumber(dim.amount),
        productionText: formatNumber(production),
        nextCostText: formatNumber(getDimensionCost(game, tier)),
        bought: dim.bought,
        amountLog10: log10Of(dim.amount),
        productionLog10: log10Of(production),
        producing: production.mantissa > 0,
        locked: tier > maxUnlockedTier,
      };
    }),
    tickspeedText: formatNumber(getEffectiveTickspeed(game)),
    tickspeedBought: game.tickspeedBought,
    boosts: game.dimensionalBoosts,
    boostRequirementText: `${boostReq.tier}次元を${boostReq.amount}個`,
    boostCurrentAmountText: formatNumber(game.dimensions[boostReq.tier - 1].amount),
    canBoost: canDimensionalBoost(game),
    galaxies: game.galaxies,
    galaxyRequirementText: `8次元を${galaxyReq.amount}個`,
    galaxyCurrentAmountText: formatNumber(game.dimensions[galaxyReq.tier - 1].amount),
    canGalaxy: canAntimatterGalaxy(game),
    sacrificeText: formatNumber(game.sacrificeBoost),
    sacrificeUnlocked: game.dimensionalBoosts >= 5,
    canSacrifice: canSacrifice(game),
    infinityPointsText: formatNumber(game.infinityPoints),
    infinities: game.infinities,
    canCrunch: canInfinity(game),
  };
}

// 購入ロジックは engine 呼び出し 1 か所に集約する。3D 側はこの口だけを使う。
// buyDimensionMax / buyMaxTickspeed はスライスに無いため、ここで直接 engine を呼ぶことはせず
// スライス側の追加アクション（adBuyDimensionMax / adBuyMaxTickspeed）に委ねる。
export function buildAdActions(slice: AdSlice): AdActions {
  return {
    buyDimension: (tier) => { void slice.adBuyDimension(tier); },
    buyDimensionUpTo: (tier, count) => {
      for (let i = 0; i < count; i++) {
        if (!slice.adBuyDimension(tier)) break;
      }
    },
    buyDimensionMax: (tier) => { slice.adBuyDimensionMax(tier); },
    buyMaxAll: () => { slice.adBuyMax(); },
    buyTickspeed: () => { void slice.adBuyTickspeed(); },
    buyMaxTickspeed: () => { slice.adBuyMaxTickspeed(); },
    dimensionalBoost: () => { void slice.adBoost(); },
    antimatterGalaxy: () => { void slice.adGalaxy(); },
    sacrifice: () => { void slice.adSacrifice(); },
    prestigeInfinity: () => {
      // Big Crunch は取り消せないため、呼び出し前に確認する（3D パネル側では出さない約束）
      if (!window.confirm('Big Crunch を実行しますか？次元・反物質は初期化され、Infinity Point が +1 されます。')) return;
      void slice.adPrestige();
    },
  };
}

export type { AdPanelTarget };
