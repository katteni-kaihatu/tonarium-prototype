import { compareProgress, validateSave } from './sync.mjs';
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
  readConnection, writeConnection, retainSyncSources, listRecoveryRecords, parseImportBundle,
  type RecoveryRecord,
  type AdConnection,
  buildExportBundle,
  createAuthProvider,
  createProfile,
  listProfiles,
  ensureDefaultProfile,
  importBundleInto,
  readSaveRaw,
  switchProfile,
  writeSave,
  type AdProfile,
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
  adSync: 'disconnected' | 'loading' | 'choice' | 'ready' | 'error';
  adRecoveryKey: string | null;
  adChooseSave: (source: 'local' | 'remote') => void;
  adIssueTransfer: () => Promise<{ code: string; expiresAt: number }>;
  adExchangeTransfer: (code: string) => Promise<void>;
  adRefreshLeaderboard: () => Promise<boolean>;
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
  adSubmitScore: (name?: string, automatic?: boolean) => Promise<boolean>;
  adExport: () => ExportBundle | null;
  adListRecovery: () => RecoveryRecord[];
  adExportRecovery: (source: 'local' | 'remote', key?: string) => ExportBundle | null;
  adResetGame: () => void;
  adImport: (bundle: ExportBundle, confirmLegacy?: boolean) => AdProfile;
}

export type AdSet = (partial: Partial<AdSlice>) => void;
export type AdGet = () => AdSlice;

export function createAdSlice(set: AdSet, get: AdGet): AdSlice {
  let started = false;
  let timers: number[] = [];
  let storage: StorageLike = safeStorage();
  let apiBase = '';
  let generation = 0;
  let revision: number | null = null;
  let context: { generation: number; profileId: string; connection: AdConnection; api: AdApiClient } | null = null;
  let saving = false;
  let submitting = false;
  let refreshing = false;
  let pending: { local: string; remote: string } | null = null;
  let initialLocalSource: string | null = null;
  let retryAllowed = true;
  const retryable = (error: unknown) => {
    const status = (error as { status?: number } | null)?.status;
    return status === undefined || status === 429 || status >= 500;
  };
  const current = (ctx: NonNullable<typeof context>) => started && context === ctx && generation === ctx.generation && get().adProfile?.id === ctx.profileId;
  const frozen = () => ['loading', 'choice'].includes(get().adSync);
  const publicApi = () => new AdApiClient(apiBase, createAuthProvider());
  function saveLocalNow(): boolean {
    const { adProfile, adGame } = get();
    if (!adProfile || !adGame || frozen()) return false;
    try {
      writeSave(storage, adProfile.id, serialize(adGame));
      set({ adLastLocalSaveAt: Date.now() });
      return true;
    } catch { return false; }
  }
  function adopt(source: string) {
    const game = deserialize(source);
    const offline = offlineProgress(game, Date.now());
    set({ adGame: game, adOffline: offline, adSync: 'ready', adServer: 'connected', adVersion: get().adVersion + 1 });
    pending = null;
    saveLocalNow();
    void slice.adSubmitScore(undefined, true);
    void slice.adRefreshLeaderboard();
  }
  function persistBeforeChange() {
    if (!frozen() && get().adProfile && get().adGame && !saveLocalNow()) throw new Error('Local save failed');
  }
  async function resolveServer(ctx: NonNullable<typeof context>): Promise<boolean> {
    if (!current(ctx)) return false;
    set({ adSync: 'loading' });
    revision = null;
    try {
      const local = initialLocalSource ?? serialize(get().adGame!);
      initialLocalSource = null;
      const remote = await ctx.api.load(ctx.connection.id);
      if (!current(ctx)) return false;
      if (remote.save) validateSave(remote.save);
      const remoteText = remote.save ? JSON.stringify(remote.save) : null;
      // 退避が失敗した場合は採用を中止し、比較前の進捗を守る。
      const key = retainSyncSources(storage, ctx.profileId, JSON.parse(local), remote.save);
      set({ adRecoveryKey: key });
      revision = remote.revision;
      if (!remoteText) adopt(local);
      else {
        const comparison = compareProgress(JSON.parse(local), remote.save);
        if (comparison === 0 || storage.getItem('ad:v3:importPending:' + ctx.profileId)) {
          pending = { local, remote: remoteText };
          set({ adSync: 'choice' });
        } else adopt(comparison > 0 ? local : remoteText);
      }
      return true;
    } catch (error) {
      if (current(ctx)) { retryAllowed = retryable(error); set({ adSync: 'error', adServer: 'error' }); saveLocalNow(); }
      return false;
    }
  }
  async function connect(profile: AdProfile, epoch: number) {
    try {
      let connection = readConnection(storage, profile.id);
      if (!connection) {
        connection = await publicApi().create();
        if (!started || generation !== epoch) return;
        writeConnection(storage, profile.id, connection);
      }
      if (!started || generation !== epoch) return;
      const api = new AdApiClient(apiBase, createAuthProvider({ mode: 'token', token: connection.token }));
      context = { generation: epoch, profileId: profile.id, connection, api };
      await resolveServer(context);
    } catch (error) {
      if (started && generation === epoch) {
        retryAllowed = retryable(error);
        initialLocalSource = null;
        set({ adSync: 'error', adServer: 'error' });
        saveLocalNow();
      }
    }
  }
  function loadProfileGame(profile: AdProfile): void {
    generation++;
    retryAllowed = true;
    context = null; revision = null; pending = null; initialLocalSource = null;
    let game: GameState;
    try {
      const raw = readSaveRaw(storage, profile.id);
      game = raw ? deserialize(raw) : createNewGame();
      initialLocalSource = raw || serialize(game);
    } catch {
      retryAllowed = false;
      set({ adProfile: profile, adGame: null, adSync: 'error', adServer: 'error' });
      return;
    }
    set({ adProfile: profile, adGame: game, adOffline: null, adSync: 'loading', adServer: 'local', adRecoveryKey: null, adLastServerSaveAt: null, adLeaderboard: [], adVersion: get().adVersion + 1 });
    void connect(profile, generation);
  }
  function clearTimers(): void {
    for (const t of timers) clearInterval(t);
    timers = [];
  }
  async function saveServerNow(manual: boolean): Promise<boolean> {
    const ctx = context;
    if (!ctx || !current(ctx) || saving || get().adSync !== 'ready' || revision === null || !get().adGame) {
      if (manual) emitAdFeedback({ kind: 'error' });
      return false;
    }
    saving = true;
    try {
      const next = await ctx.api.save(ctx.connection.id, JSON.parse(serialize(get().adGame!)), revision);
      if (!current(ctx)) return false;
      revision = next;
      // 選択後も保存が確定するまでは、再起動や再競合で取り込みを取り消さない。
      storage.removeItem('ad:v3:importPending:' + ctx.profileId);
      set({ adServer: 'connected', adLastServerSaveAt: Date.now() });
      if (manual) emitAdFeedback({ kind: 'save' });
      return true;
    } catch (error) {
      if (current(ctx)) {
        if ((error as { status?: number }).status === 409) await resolveServer(ctx);
        else { retryAllowed = retryable(error); revision = null; set({ adSync: 'error', adServer: 'error' }); saveLocalNow(); }
        if (manual) emitAdFeedback({ kind: 'error' });
      }
      return false;
    } finally { saving = false; }
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
    adSync: 'disconnected',
    adRecoveryKey: null,
    adLastLocalSaveAt: null,
    adLastServerSaveAt: null,
    adLeaderboard: [],

    adStart(options = {}) {
      if (started) return;
      started = true;
      storage = options.storage ?? safeStorage();

      // 既定は同一オリジン（Tonarium サーバー内の /api/*）。空文字の AdApiClient は相対パス /api/... を叩く。
      // VITE_AD_API_BASE は任意の上書きで、Workers などの外部 API に向けたい場合にだけ指定する。
      apiBase = (options.apiBase ?? import.meta.env?.VITE_AD_API_BASE ?? '').trim().replace(/\/+$/, '');
      const profile = ensureDefaultProfile(storage);
      if (options.tonariumId) linkTonariumProfile(storage, options.tonariumId, options.tonariumName ?? '');

      loadProfileGame(profile);
      timers = [
        window.setInterval(() => {
          const game = get().adGame;
          if (!game || frozen()) return;
          tick(game, 100);
          // エンジンはインプレース更新のため、参照は変わらない。購読を起こす版カウンタで知らせる
          set({ adVersion: get().adVersion + 1 });
        }, 100),
        window.setInterval(() => { saveLocalNow(); }, 1000),
        // サーバー保存は常に有効（既定は同一オリジンの Tonarium サーバー）。localStorage はフォールバックとして残る
        window.setInterval(() => {
          if (get().adSync === 'error' && retryAllowed) {
            const profile = get().adProfile;
            if (profile && get().adGame) {
              set({ adSync: 'loading' });
              void connect(profile, generation);
            }
          } else void saveServerNow(false);
          void slice.adSubmitScore(undefined, true);
          void slice.adRefreshLeaderboard();
        }, 30000),
      ];
      void slice.adRefreshLeaderboard();
    },

    adStop() {
      saveLocalNow();
      clearTimers();
      started = false;
      generation++;
      context = null; revision = null; pending = null;
      set({ adSync: 'disconnected' });
    },

    adBindTonarium(selfId, selfName) {
      if (!started) {
        slice.adStart({ tonariumId: selfId, tonariumName: selfName });
        return;
      }
      linkTonariumProfile(storage, selfId, selfName);
    },

    adBuyDimension(tier) {
      const game = get().adGame;
      if (!game || frozen()) return false;
      const ok = buyDimension(game, tier);
      if (ok) {
        set({ adVersion: get().adVersion + 1 });
        emitAdFeedback({ kind: 'purchase', tier, count: 1 });
      }
      return ok;
    },

    adBuyDimensionMax(tier) {
      const game = get().adGame;
      if (!game || frozen()) return;
      const count = buyMaxDimension(game, tier);
      if (count > 0) {
        set({ adVersion: get().adVersion + 1 });
        emitAdFeedback({ kind: 'purchase', tier, count });
      }
    },

    adBuyMax() {
      const game = get().adGame;
      if (!game || frozen()) return;
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
      if (!game || frozen()) return false;
      const ok = buyTickspeed(game);
      if (ok) {
        set({ adVersion: get().adVersion + 1 });
        emitAdFeedback({ kind: 'tickspeed', count: 1 });
      }
      return ok;
    },

    adBuyMaxTickspeed() {
      const game = get().adGame;
      if (!game || frozen()) return;
      const count = buyMaxTickspeed(game);
      if (count > 0) {
        set({ adVersion: get().adVersion + 1 });
        emitAdFeedback({ kind: 'tickspeed', count });
      }
    },

    adBoost() {
      const game = get().adGame;
      if (!game || frozen()) return false;
      const ok = dimensionalBoost(game);
      if (ok) {
        set({ adVersion: get().adVersion + 1 });
        emitAdFeedback({ kind: 'boost' });
      }
      return ok;
    },

    adGalaxy() {
      const game = get().adGame;
      if (!game || frozen()) return false;
      const ok = antimatterGalaxy(game);
      if (ok) {
        set({ adVersion: get().adVersion + 1 });
        emitAdFeedback({ kind: 'galaxy' });
      }
      return ok;
    },

    adSacrifice() {
      const game = get().adGame;
      if (!game || frozen()) return false;
      const ok = sacrifice(game);
      if (ok) {
        set({ adVersion: get().adVersion + 1 });
        emitAdFeedback({ kind: 'sacrifice' });
      }
      return ok;
    },

    adPrestige() {
      const game = get().adGame;
      if (!game || frozen()) return false;
      const ok = Boolean(prestigeInfinity(game));
      if (ok) {
        set({ adVersion: get().adVersion + 1 });
        emitAdFeedback({ kind: 'crunch' });
      }
      return ok;
    },

    adCreateProfile(name) {
      return manualAction('profile', () => {
        persistBeforeChange();
        const profile = createProfile(storage, name);
        loadProfileGame(switchProfile(storage, profile.id));
        return profile;
      });
    },

    adSwitchProfile(userId) {
      manualAction('profile', () => { persistBeforeChange(); loadProfileGame(switchProfile(storage, userId)); });
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
      if (!started || frozen() || saving || !get().adGame) return false;
      saveLocalNow();
      if (context) return resolveServer(context);
      const profile = get().adProfile;
      if (profile) { set({ adSync: 'loading' }); await connect(profile, generation); }
      return get().adSync === 'ready' || get().adSync === 'choice';
    },
    adChooseSave(source) {
      if (get().adSync !== 'choice' || !pending) return;
      adopt(pending[source]);
    },
    async adIssueTransfer() {
      const ctx = context;
      if (!ctx || !current(ctx) || get().adSync !== 'ready') throw new Error('Not connected');
      if (!await saveServerNow(false) || !current(ctx) || get().adSync !== 'ready') throw new Error('Save not resolved');
      const result = await ctx.api.transfer(ctx.connection.id);
      if (!current(ctx)) throw new Error('Profile changed');
      return result;
    },
    async adExchangeTransfer(code) {
      if (!started || frozen() || saving) throw new Error('Busy');
      persistBeforeChange();
      const epoch = ++generation;
      context = null; revision = null;
      set({ adSync: 'loading' });
      try {
        const connection = await publicApi().exchange(code.trim());
        if (!started || generation !== epoch) return;
        const existing = listProfiles(storage).find(p => readConnection(storage, p.id)?.id === connection.id);
        const profile = existing ?? createProfile(storage, get().adProfile?.name ?? 'Player 1');
        writeConnection(storage, profile.id, connection);
        loadProfileGame(switchProfile(storage, profile.id));
      } catch (error) {
        if (started && generation === epoch) { set({ adSync: 'error', adServer: 'error' }); saveLocalNow(); }
        throw error;
      }
    },
    async adRefreshLeaderboard() {
      if (!started || refreshing) return false;
      refreshing = true;
      const epoch = generation;
      const api = context?.api ?? publicApi();
      try {
        const entries = await api.leaderboard();
        if (!started || generation !== epoch) return false;
        set({ adLeaderboard: entries });
        return true;
      } catch { return false; }
      finally {
        refreshing = false;
        if (started && generation !== epoch) void slice.adRefreshLeaderboard();
      }
    },
    async adSubmitScore(name, automatic = false) {
      const ctx = context;
      const game = get().adGame;
      if (!ctx || !current(ctx) || !game || submitting || get().adSync !== 'ready') return false;
      submitting = true;
      try {
        await ctx.api.submitScore({
          playerId: ctx.connection.id,
          name: name?.trim() || get().adProfile!.name,
          antimatterLog10: Number.isFinite(bigLog10(game.antimatter)) ? bigLog10(game.antimatter) : 0,
          infinities: game.infinities ?? 0,
          playTimeSec: Math.max(0, Math.floor((Date.now() - (game.createdAt || Date.now())) / 1000)),
        });
        if (!current(ctx)) return false;
        if (!automatic) emitAdFeedback({ kind: 'submit' });
        return true;
      } catch {
        if (current(ctx) && !automatic) emitAdFeedback({ kind: 'error' });
        return false;
      } finally { submitting = false; }
    },
    adExport() {
      const { adProfile, adGame } = get();
      if (!adProfile || !adGame) return null;
      return manualAction('export', () =>
        buildExportBundle(adProfile, JSON.parse(serialize(adGame)) as Record<string, unknown>));
    },
    adListRecovery() {
      const profile = get().adProfile;
      return profile ? listRecoveryRecords(storage, profile.id) : [];
    },
    adExportRecovery(source, selectedKey) {
      const profile = get().adProfile;
      if (!profile) return null;
      const records = listRecoveryRecords(storage, profile.id);
      const key = selectedKey ?? records[0]?.key;
      if (!records.some(record => record.key === key)) return null;
      const raw = key ? storage.getItem(key) : null;
      const save = raw ? JSON.parse(raw)[source] : null;
      return save ? buildExportBundle(profile, save) : null;
    },
    adResetGame() {
      if (frozen()) throw new Error('Busy');
      const profile = get().adProfile;
      if (!profile || !get().adGame) return;
      retainSyncSources(storage, profile.id, JSON.parse(serialize(get().adGame!)), null);
      set({ adGame: createNewGame(), adOffline: null, adVersion: get().adVersion + 1 });
      saveLocalNow();
      void saveServerNow(false);
    },

    adImport(bundle, confirmLegacy) {
      return manualAction('import', () => {
        const parsed = parseImportBundle(bundle);
        if (parsed.version === 2 && !confirmLegacy) throw new Error('Legacy confirmation required');
        if (frozen() || saving) throw new Error('Busy');
        persistBeforeChange();
        const result = importBundleInto(storage, parsed, { confirmLegacy });
        loadProfileGame(result.profile);
        return result.profile;
      });
    },
  };

  return slice;
}
