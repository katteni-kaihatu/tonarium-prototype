import {
  antimatterGalaxy,
  bigLog10,
  buyDimension,
  buyMax,
  buyMaxDimension,
  buyMaxTickspeed,
  buyTickspeed,
  createNewGame,
  deserialize,
  dimensionalBoost,
  offlineProgress,
  prestigeInfinity,
  sacrifice,
  serialize,
  tick,
  type GameState,
  type OfflineResult,
} from './engine.mjs';
import {
  buildExportBundle,
  createAuthProvider,
  createProfile,
  ensureDefaultProfile,
  importBundleInto,
  readSaveRaw,
  switchProfile,
  writeSave,
  type AdProfile,
  type AuthProvider,
  type ExportBundle,
  type StorageLike,
} from './user.mjs';
import { safeStorage } from './storage.ts';
import { linkTonariumProfile } from './link.ts';
import { AdApiClient, type LeaderboardEntry } from './api.ts';
import { emitAdFeedback, type AdFeedbackKind } from './feedback.ts';

export interface AdStartOptions {
  /** 任意の上書き。未指定なら同一オリジン（Tonarium サーバー内の /api/*）を使い、Workers などの外部 API は必須ではない */
  apiBase?: string;
  authMode?: 'anonymous' | 'token' | 'header-injected';
  authToken?: string;
  storage?: StorageLike;
  tonariumId?: string;
  tonariumName?: string;
}

export interface AdSlice {
  adProfile: AdProfile | null;
  adGame: GameState | null;
  adVersion: number;
  adOffline: OfflineResult | null;
  adServer: 'local' | 'connected' | 'error';
  adLastLocalSaveAt: number | null;
  adLastServerSaveAt: number | null;
  adLeaderboard: LeaderboardEntry[];
  adStart: (options?: AdStartOptions) => void;
  adStop: () => void;
  adBindTonarium: (selfId: string, selfName: string) => void;
  adBuyDimension: (tier: number) => boolean;
  adBuyDimensionMax: (tier: number) => void;
  adBuyMax: () => void;
  adBuyTickspeed: () => boolean;
  adBuyMaxTickspeed: () => void;
  adBoost: () => boolean;
  adGalaxy: () => boolean;
  adSacrifice: () => boolean;
  adPrestige: () => boolean;
  adCreateProfile: (name: string) => AdProfile;
  adSwitchProfile: (userId: string) => void;
  adSaveLocal: () => boolean;
  adSaveServer: () => Promise<boolean>;
  adLoadServer: () => Promise<boolean>;
  adSubmitScore: () => Promise<boolean>;
  adExport: () => ExportBundle | null;
  adImport: (bundle: ExportBundle) => AdProfile;
}

export type AdSet = (partial: Partial<AdSlice>) => void;
export type AdGet = () => AdSlice;

export function createAdSlice(set: AdSet, get: AdGet): AdSlice {
  let started = false;
  let timers: number[] = [];
  let storage: StorageLike = safeStorage();
  let apiBase = '';
  let authMode: AdStartOptions['authMode'] = 'anonymous';
  let authToken: string | undefined;
  let api: AdApiClient | null = null;

  function makeAuth(profile: AdProfile): AuthProvider {
    return createAuthProvider({
      mode: authMode ?? 'anonymous',
      userId: profile.id,
      token: authMode === 'token' ? authToken : undefined,
    });
  }

  function saveLocalNow(): boolean {
    const { adProfile, adGame } = get();
    if (!adProfile || !adGame) return false;
    try {
      writeSave(storage, adProfile.id, serialize(adGame));
      set({ adLastLocalSaveAt: Date.now() });
      return true;
    } catch {
      return false;
    }
  }

  function loadProfileGame(profile: AdProfile): void {
    let game: GameState;
    let offline: OfflineResult | null = null;
    try {
      const raw = readSaveRaw(storage, profile.id);
      game = raw ? deserialize(raw) : createNewGame();
    } catch {
      game = createNewGame();
    }
    offline = offlineProgress(game, Date.now());
    set({ adProfile: profile, adGame: game, adOffline: offline, adVersion: get().adVersion + 1 });
    saveLocalNow();
    if (api) api.setAuth(makeAuth(profile));
  }

  function clearTimers(): void {
    for (const t of timers) clearInterval(t);
    timers = [];
  }

  async function saveServerNow(manual: boolean): Promise<boolean> {
    const { adProfile, adGame } = get();
    if (!api || !adProfile || !adGame) return false;
    try {
      await api.save(adProfile.id, JSON.parse(serialize(adGame)) as Record<string, unknown>);
      set({ adServer: 'connected', adLastServerSaveAt: Date.now() });
      if (manual) emitAdFeedback({ kind: 'save' });
      return true;
    } catch {
      set({ adServer: 'error' });
      if (manual) emitAdFeedback({ kind: 'error' });
      return false;
    }
  }

  function manualAction<T>(kind: AdFeedbackKind, action: () => T): T {
    try {
      const result = action();
      emitAdFeedback({ kind });
      return result;
    } catch (error) {
      emitAdFeedback({ kind: 'error' });
      throw error;
    }
  }

  const slice: AdSlice = {
    adProfile: null,
    adGame: null,
    adVersion: 0,
    adOffline: null,
    adServer: 'local',
    adLastLocalSaveAt: null,
    adLastServerSaveAt: null,
    adLeaderboard: [],

    adStart(options = {}) {
      if (started) return;
      started = true;
      storage = options.storage ?? safeStorage();
      authMode = options.authMode ?? 'anonymous';
      authToken = options.authToken;
      // 既定は同一オリジン（Tonarium サーバー内の /api/*）。空文字の AdApiClient は相対パス /api/... を叩く。
      // VITE_AD_API_BASE は任意の上書きで、Workers などの外部 API に向けたい場合にだけ指定する。
      apiBase = (options.apiBase ?? import.meta.env?.VITE_AD_API_BASE ?? '').trim().replace(/\/+$/, '');
      const profile = options.tonariumId
        ? linkTonariumProfile(storage, options.tonariumId, options.tonariumName ?? '')
        : ensureDefaultProfile(storage);
      api = new AdApiClient(apiBase, makeAuth(profile));
      loadProfileGame(profile);
      timers = [
        window.setInterval(() => {
          const game = get().adGame;
          if (!game) return;
          tick(game, 100);
          // エンジンはインプレース更新のため、参照は変わらない。購読を起こす版カウンタで知らせる
          set({ adVersion: get().adVersion + 1 });
        }, 100),
        window.setInterval(() => { saveLocalNow(); }, 1000),
        // サーバー保存は常に有効（既定は同一オリジンの Tonarium サーバー）。localStorage はフォールバックとして残る
        window.setInterval(() => { void saveServerNow(false); }, 30000),
      ];
    },

    adStop() {
      clearTimers();
      started = false;
      api = null;
    },

    adBindTonarium(selfId, selfName) {
      if (!started) {
        slice.adStart({ tonariumId: selfId, tonariumName: selfName });
        return;
      }
      loadProfileGame(linkTonariumProfile(storage, selfId, selfName));
    },

    adBuyDimension(tier) {
      const game = get().adGame;
      if (!game) return false;
      const ok = buyDimension(game, tier);
      if (ok) {
        set({ adVersion: get().adVersion + 1 });
        emitAdFeedback({ kind: 'purchase', tier, count: 1 });
      }
      return ok;
    },

    adBuyDimensionMax(tier) {
      const game = get().adGame;
      if (!game) return;
      const count = buyMaxDimension(game, tier);
      if (count > 0) {
        set({ adVersion: get().adVersion + 1 });
        emitAdFeedback({ kind: 'purchase', tier, count });
      }
    },

    adBuyMax() {
      const game = get().adGame;
      if (!game) return;
      const before = game.dimensions.map((dim) => dim.bought);
      const tickspeedBefore = game.tickspeedBought;
      buyMax(game);
      let changed = false;
      game.dimensions.forEach((dim, index) => {
        const count = dim.bought - before[index];
        if (count <= 0) return;
        changed = true;
        emitAdFeedback({ kind: 'purchase', tier: index + 1, count });
      });
      const count = game.tickspeedBought - tickspeedBefore;
      if (count > 0) {
        changed = true;
        emitAdFeedback({ kind: 'tickspeed', count });
      }
      if (changed) set({ adVersion: get().adVersion + 1 });
    },

    adBuyTickspeed() {
      const game = get().adGame;
      if (!game) return false;
      const ok = buyTickspeed(game);
      if (ok) {
        set({ adVersion: get().adVersion + 1 });
        emitAdFeedback({ kind: 'tickspeed', count: 1 });
      }
      return ok;
    },

    adBuyMaxTickspeed() {
      const game = get().adGame;
      if (!game) return;
      const count = buyMaxTickspeed(game);
      if (count > 0) {
        set({ adVersion: get().adVersion + 1 });
        emitAdFeedback({ kind: 'tickspeed', count });
      }
    },

    adBoost() {
      const game = get().adGame;
      if (!game) return false;
      const ok = dimensionalBoost(game);
      if (ok) {
        set({ adVersion: get().adVersion + 1 });
        emitAdFeedback({ kind: 'boost' });
      }
      return ok;
    },

    adGalaxy() {
      const game = get().adGame;
      if (!game) return false;
      const ok = antimatterGalaxy(game);
      if (ok) {
        set({ adVersion: get().adVersion + 1 });
        emitAdFeedback({ kind: 'galaxy' });
      }
      return ok;
    },

    adSacrifice() {
      const game = get().adGame;
      if (!game) return false;
      const ok = sacrifice(game);
      if (ok) {
        set({ adVersion: get().adVersion + 1 });
        emitAdFeedback({ kind: 'sacrifice' });
      }
      return ok;
    },

    adPrestige() {
      const game = get().adGame;
      if (!game) return false;
      const ok = Boolean(prestigeInfinity(game));
      if (ok) {
        set({ adVersion: get().adVersion + 1 });
        emitAdFeedback({ kind: 'crunch' });
      }
      return ok;
    },

    adCreateProfile(name) {
      return manualAction('profile', () => {
        const profile = createProfile(storage, name);
        loadProfileGame(switchProfile(storage, profile.id));
        return profile;
      });
    },

    adSwitchProfile(userId) {
      manualAction('profile', () => { loadProfileGame(switchProfile(storage, userId)); });
    },

    adSaveLocal() {
      const ok = saveLocalNow();
      emitAdFeedback({ kind: ok ? 'save' : 'error' });
      return ok;
    },

    async adSaveServer() {
      return saveServerNow(true);
    },

    async adLoadServer() {
      const { adProfile } = get();
      if (!api || !adProfile) return false;
      try {
        const save = await api.load(adProfile.id);
        if (!save) {
          emitAdFeedback({ kind: 'error' });
          return false;
        }
        const game = deserialize(save);
        const offline = offlineProgress(game, Date.now());
        set({ adGame: game, adOffline: offline, adVersion: get().adVersion + 1, adServer: 'connected' });
        saveLocalNow();
        emitAdFeedback({ kind: 'load' });
        return true;
      } catch {
        set({ adServer: 'error' });
        emitAdFeedback({ kind: 'error' });
        return false;
      }
    },

    async adSubmitScore() {
      const { adProfile, adGame } = get();
      if (!api || !adProfile || !adGame) return false;
      try {
        await api.submitScore({
          playerId: adProfile.id,
          name: adProfile.name,
          antimatterLog10: Number.isFinite(bigLog10(adGame.antimatter)) ? bigLog10(adGame.antimatter) : 0,
          infinities: adGame.infinities ?? 0,
          playTimeSec: Math.max(0, Math.floor((Date.now() - (adGame.createdAt || Date.now())) / 1000)),
        });
        const entries = await api.leaderboard();
        set({ adLeaderboard: entries });
        emitAdFeedback({ kind: 'submit' });
        return true;
      } catch {
        set({ adServer: 'error' });
        emitAdFeedback({ kind: 'error' });
        return false;
      }
    },

    adExport() {
      const { adProfile, adGame } = get();
      if (!adProfile || !adGame) return null;
      return manualAction('export', () =>
        buildExportBundle(adProfile, JSON.parse(serialize(adGame)) as Record<string, unknown>));
    },

    adImport(bundle) {
      return manualAction('import', () => {
        const current = get().adProfile;
        if (current) switchProfile(storage, current.id);
        // importBundleInto は保存済みアクティブ配下へ書くため、先に現プロフィールをアクティブ化しておく
        const result = importBundleInto(storage, bundle);
        loadProfileGame(result.profile);
        return result.profile;
      });
    },
  };

  return slice;
}
