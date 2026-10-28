import { msg, getLanguage, useLanguage } from '../../i18n/index.ts';
import {
  bigGte, canAntimatterGalaxy, canDimensionalBoost, canInfinity, canSacrifice,
  getAntimatterPerSecond, getDimensionalBoostRequirement, getDimensionCost,
  getDimensionProductionPerSecond, getEffectiveTickspeed, getGalaxyRequirement,
  getInfinityGain, getMaxUnlockedTier, getTickspeedCost, getTickspeedPerPurchase,
  type GameState,
} from '../../ad/engine.mjs';
import { parseImportBundle, type StorageLike } from '../../ad/user.mjs';
import type { AdSlice } from '../../ad/slice.ts';
import type { AntimatterSlice, DerivedSnapshot, OfflineNotice } from './types.ts';
import { AntimatterPanel } from './AntimatterPanel.tsx';
import { emitAdFeedback } from '../../ad/feedback.ts';

function derivedFrom(game: GameState): DerivedSnapshot {
  const maxUnlockedTier = getMaxUnlockedTier(game);
  return {
    antimatterPerSecond: getAntimatterPerSecond(game),
    tickspeedValue: getEffectiveTickspeed(game),
    tickspeedBought: game.tickspeedBought,
    tickspeedCost: getTickspeedCost(game),
    tickspeedAffordable: bigGte(game.antimatter, getTickspeedCost(game)),
    tickspeedPerPurchase: getTickspeedPerPurchase(game),
    maxUnlockedTier,
    dimensions: game.dimensions.map((dim, i) => {
      const tier = i + 1;
      const locked = tier > maxUnlockedTier;
      const cost = getDimensionCost(game, tier);
      return {
        tier,
        amount: dim.amount,
        bought: dim.bought,
        cost,
        productionPerSecond: getDimensionProductionPerSecond(game, tier),
        affordable: !locked && bigGte(game.antimatter, cost),
        locked,
        nextMilestoneRemaining: dim.bought % 10 === 0 ? 10 : 10 - (dim.bought % 10),
      };
    }),
    boost: (() => {
      const req = getDimensionalBoostRequirement(game);
      return { tier: req.tier, amount: req.amount, currentAmount: game.dimensions[req.tier - 1].amount, can: canDimensionalBoost(game) };
    })(),
    galaxy: (() => {
      const req = getGalaxyRequirement(game);
      return { tier: req.tier, amount: req.amount, currentAmount: game.dimensions[7].amount, can: canAntimatterGalaxy(game) };
    })(),
    sacrifice: { unlocked: game.dimensionalBoosts >= 5, can: canSacrifice(game), boost: game.sacrificeBoost, boosts: game.dimensionalBoosts },
    infinity: { can: canInfinity(game), gain: getInfinityGain(game) },
  };
}

// スライスに dismiss が無いため、閉じたオフライン通知をここでだけ覚える。
// スライス側に adDismissOffline が足されたら、この集合は不要になる。
const dismissedOffline = new Set<string>();
const offlineKey = (o: OfflineNotice) => `${o.elapsedMs}:${o.simulatedMs}:${o.antimatterGained.mantissa}:${o.antimatterGained.exponent}`;

export interface AdaptOptions {
  storage?: StorageLike;
}

export function adaptAdSlice(slice: AdSlice, options: AdaptOptions = {}): AntimatterSlice | null {
  const game = slice.adGame;
  if (!game) return null;
  const serverStatus = slice.adSync === 'loading' ? msg('adSyncLoading') : slice.adSync === 'choice' ? msg('adSyncChoice') : slice.adSync === 'error' ? msg('adSyncError') : null;
  const offline = slice.adOffline && !dismissedOffline.has(offlineKey(slice.adOffline)) ? slice.adOffline : null;

  return {
    game,
    derived: derivedFrom(game),
    tickVersion: slice.adVersion,
    migration: slice.adMigration,
    syncSources: slice.adSyncSources,
    progressSources: slice.adProgressSources(),
    selectProgress: slice.adSelectProgress,
    restoreProgress: slice.adRestoreProgress,
    exportProgress: key => { const bundle = slice.adExportProgress(key); return bundle ? JSON.stringify(bundle, null, 2) : ''; },
    activeProfile: slice.adProfile,
    offlineNotice: offline,
    leaderboard: slice.adLeaderboard,
    serverStatus,
    syncState: slice.adSync,
    chooseSave: slice.adChooseSave,
    issueTransfer: slice.adIssueTransfer,
    exchangeTransfer: slice.adExchangeTransfer,
    lastSavedAt: slice.adLastLocalSaveAt ? new Date(slice.adLastLocalSaveAt).toLocaleTimeString(getLanguage()) : null,
    buyDimension: (tier) => { void slice.adBuyDimension(tier); },
    buyUntilNextTen: (tier) => {
      const dim = game.dimensions[tier - 1];
      if (!dim) return;
      let bought = 0;
      do {
        if (!slice.adBuyDimension(tier)) break;
        bought += 1;
      } while (game.dimensions[tier - 1].bought % 10 !== 0 && bought < 10);
    },
    buyMax: () => slice.adBuyMax(),
    buyTickspeed: () => { void slice.adBuyTickspeed(); },
    dimensionalBoost: () => slice.adBoost(),
    antimatterGalaxy: () => slice.adGalaxy(),
    sacrifice: () => slice.adSacrifice(),
    prestigeInfinity: () => {
      const gain = getInfinityGain(game);
      return slice.adPrestige() ? gain : 0;
    },
    resetGame: slice.adResetGame,
    recoveryRecords: slice.adListRecovery(),
    exportRecoveryBundle: (source, key) => { const bundle = slice.adExportRecovery(source, key); return bundle ? JSON.stringify(bundle, null, 2) : ''; },
    exportBundle: () => {
      const bundle = slice.adExport();
      return bundle ? JSON.stringify(bundle, null, 2) : '';
    },
    importBundle: (text, confirmLegacy = false) => {
      let bundle;
      try {
        bundle = parseImportBundle(text);
      } catch {
        emitAdFeedback({ kind: 'error' });
        return { ok: false, message: msg('adImportFailed') };
      }
      try {
        const profile = slice.adImport(bundle, confirmLegacy);
        return { ok: true, message: msg('adImportDone', profile.name) };
      } catch {
        return { ok: false, message: msg('adImportFailed') };
      }
    },
    dismissOffline: () => {
      if (slice.adOffline) {
        dismissedOffline.add(offlineKey(slice.adOffline));
        emitAdFeedback({ kind: 'navigate' });
      }
    },
    saveToServer: async () => { await slice.adSaveServer(); },
    loadFromServer: async () => { await slice.adLoadServer(); },
    refreshLeaderboard: async () => { if (!await slice.adRefreshLeaderboard()) throw new Error('Ranking refresh failed'); },
    submitScore: async (name) => { if (!await slice.adSubmitScore(name)) throw new Error('Score submission failed'); },
  };
}

// ad スライスがまだ起動していない間はパネルを出さないための容器。
// WindowLayer への登録は親エージェントが行い、ここでは slice の受け渡しだけを担う。
export function AntimatterPanelFromSlice({ slice, storage }: { slice: AdSlice; storage?: StorageLike }) {
  useLanguage();
  const ad = adaptAdSlice(slice, { storage });
  if (!ad) return null;
  return <AntimatterPanel ad={ad} />;
}
