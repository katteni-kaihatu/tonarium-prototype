import {
  bigGte, canAntimatterGalaxy, canDimensionalBoost, canInfinity, canSacrifice,
  getAntimatterPerSecond, getDimensionalBoostRequirement, getDimensionCost,
  getDimensionProductionPerSecond, getEffectiveTickspeed, getGalaxyRequirement,
  getInfinityGain, getMaxUnlockedTier, getTickspeedCost, getTickspeedPerPurchase,
  type GameState,
} from '../../ad/engine.mjs';
import { deleteProfile, listProfiles, parseImportBundle, saveKeyFor, type StorageLike } from '../../ad/user.mjs';
import { safeStorage } from '../../ad/storage.ts';
import type { AdSlice } from '../../ad/slice.ts';
import type { AntimatterSlice, DerivedSnapshot, OfflineNotice } from './types.ts';
import { AntimatterPanel } from './AntimatterPanel.tsx';
import { emitAdFeedback } from '../../ad/feedback.ts';

// d.mts の型が実エンジンとずれている箇所だけ、実行時の形に寄せて使う。
const galaxyRequirement = getGalaxyRequirement as unknown as (s: GameState) => { tier: number; amount: number };

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
      const req = galaxyRequirement(game);
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
  const storage = options.storage ?? safeStorage();
  const serverStatus = slice.adServer === 'connected' ? 'Tonarium サーバーに保存しています' : slice.adServer === 'error' ? 'サーバー接続に失敗しました（ローカルで継続）' : 'ローカルで動作中（Tonarium サーバーへの保存は未確認）';
  const offline = slice.adOffline && !dismissedOffline.has(offlineKey(slice.adOffline)) ? slice.adOffline : null;

  return {
    game,
    derived: derivedFrom(game),
    tickVersion: slice.adVersion,
    profiles: (() => { try { return listProfiles(storage); } catch { return slice.adProfile ? [slice.adProfile] : []; } })(),
    activeProfile: slice.adProfile,
    offlineNotice: offline,
    leaderboard: slice.adLeaderboard,
    serverStatus,
    lastSavedAt: slice.adLastLocalSaveAt ? new Date(slice.adLastLocalSaveAt).toLocaleTimeString('ja-JP') : null,
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
    switchProfile: (userId) => slice.adSwitchProfile(userId),
    createProfile: (name) => { void slice.adCreateProfile(name); },
    deleteProfile: (userId) => {
      let switching = false;
      try {
        const profiles = listProfiles(storage);
        const rest = profiles.filter((p) => p.id !== userId);
        if (rest.length === profiles.length) return;
        const wasActive = slice.adProfile?.id === userId;
        if (wasActive && !rest[0]) { emitAdFeedback({ kind: 'error' }); return; }
        deleteProfile(storage, userId);
        if (wasActive && rest[0]) {
          switching = true;
          slice.adSwitchProfile(rest[0].id);
        }
        if (!wasActive) emitAdFeedback({ kind: 'profile' });
      } catch {
        if (!switching) emitAdFeedback({ kind: 'error' });
        // 削除に失敗してもパネル側は続行する
      }
    },
    resetGame: () => {
      // スライスにリセットが無いため、保存を消して同プロフィールを再読込する。
      // 再読込はセーブ無しで新規ゲームを作る。
      if (!slice.adProfile) return;
      try { storage.removeItem(saveKeyFor(slice.adProfile.id)); } catch (error) {
        emitAdFeedback({ kind: 'error' });
        throw error;
      }
      slice.adSwitchProfile(slice.adProfile.id);
    },
    exportBundle: () => {
      const bundle = slice.adExport();
      return bundle ? JSON.stringify(bundle, null, 2) : '';
    },
    importBundle: (text) => {
      let bundle;
      try {
        bundle = parseImportBundle(text);
      } catch {
        emitAdFeedback({ kind: 'error' });
        return { ok: false, message: 'インポートに失敗しました: v2 バンドルの形式ではありません' };
      }
      try {
        const profile = slice.adImport(bundle);
        return { ok: true, message: `v2 バンドルをインポートしました（現在のユーザー「${profile.name}」）` };
      } catch {
        return { ok: false, message: 'インポートに失敗しました: v2 バンドルの形式ではありません' };
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
    refreshLeaderboard: async () => {
      // スライスに読込専用アクションが無いため、ここでは更新できない。
      // ランキングは adSubmitScore 時に更新される。adRefreshLeaderboard の追加が要る。
      emitAdFeedback({ kind: 'error' });
      throw new Error('Ranking refresh is not available');
    },
    submitScore: async () => { if (!await slice.adSubmitScore()) throw new Error('Score submission failed'); },
  };
}

// ad スライスがまだ起動していない間はパネルを出さないための容器。
// WindowLayer への登録は親エージェントが行い、ここでは slice の受け渡しだけを担う。
export function AntimatterPanelFromSlice({ slice, storage }: { slice: AdSlice; storage?: StorageLike }) {
  const ad = adaptAdSlice(slice, { storage });
  if (!ad) return null;
  return <AntimatterPanel ad={ad} />;
}
