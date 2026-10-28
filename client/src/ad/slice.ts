import { compareProgress, sameSave, validateSave } from './sync.mjs';
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
  prepareProgressSelection, selectProgress, listProgressSources, adoptConnection,
  type ProgressSource,
  type RecoveryRecord,
  type AdConnection,
  buildExportBundle,
  createAuthProvider,
  createProfile,
  listProfiles,
  importBundleInto,
  readSaveRaw,
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
  adMigration: boolean;
  adSyncSources: { local: Record<string, unknown>; remote: Record<string, unknown> } | null;
  adProgressSources: () => ProgressSource[];
  adSelectProgress: (key: string) => void;
  adRestoreProgress: (key: string) => void;
  adExportProgress: (key: string) => ExportBundle | null;
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
  type SyncContext = { generation: number; profileId: string; connection: AdConnection; api: AdApiClient };
  let context: SyncContext | null = null;
  let syncing: SyncContext | null = null;
  let baseline: { id: string; save: Record<string, unknown> | null; revision: number; local?: Record<string, unknown> | null } | null = null;
  let submitting = false;
  let refreshing = false;
  let pending: { local: string; remote: string; offline: boolean } | null = null;
  let initialLocalSource: string | null = null;
  let needsOffline = true;
  let retryAllowed = true;
  let sourceCache: ProgressSource[] | null = null;
  function retainSources(profileId: string, local: unknown, remote: unknown) {
    const key = retainSyncSources(storage, profileId, local, remote);
    sourceCache = null;
    return key;
  }
  const retryable = (error: unknown) => {
    const status = (error as { status?: number } | null)?.status;
    return status === undefined || status === 429 || status >= 500;
  };
  const current = (ctx: SyncContext) => started && context === ctx && generation === ctx.generation && get().adProfile?.id === ctx.profileId;
  const frozen = () => get().adMigration || ['loading', 'choice'].includes(get().adSync);
  const publicApi = () => new AdApiClient(apiBase, createAuthProvider());
  function saveLocalNow(): boolean {
    const { adProfile, adGame } = get();
    if (!adProfile || !adGame || frozen()) return false;
    try {
      writeSave(storage, adProfile.id, serialize(adGame));
      sourceCache = null;
      if (baseline) storage.setItem(baselineKey(adProfile.id), JSON.stringify(baseline));
      set({ adLastLocalSaveAt: Date.now() });
      return true;
    } catch { return false; }
  }
  function adopt(source: string, applyOffline = false, nextBaseline = baseline, resolved?: string) {
    const game = deserialize(source);
    const offline = applyOffline ? offlineProgress(game, Date.now()) : null;
    const save = serialize(game);
    const clean = nextBaseline?.local ?? nextBaseline?.save;
    if (nextBaseline && clean && sameSave({ ...JSON.parse(save), lastTick: clean.lastTick }, clean)) {
      nextBaseline = { ...nextBaseline, local: JSON.parse(save) };
    }
    // 比較基準だけが新しくなると、再起動時に古いセーブを自端末の更新と誤認する。
    writeSave(storage, get().adProfile!.id, save);
    if (resolved) storage.setItem('ad:v4:resolved:' + get().adProfile!.id, resolved);
    if (nextBaseline) storage.setItem(baselineKey(get().adProfile!.id), JSON.stringify(nextBaseline));
    baseline = nextBaseline;
    if (baseline) revision = baseline.revision;
    sourceCache = null;
    if (applyOffline) needsOffline = false;
    set({ adGame: game, adOffline: offline, adSync: 'ready', adSyncSources: null, adServer: 'connected', adLastLocalSaveAt: Date.now(), adVersion: get().adVersion + 1 });
    pending = null;
    void slice.adSubmitScore(undefined, true);
    void slice.adRefreshLeaderboard();
  }
  function persistBeforeChange() {
    if (!frozen() && get().adProfile && get().adGame && !saveLocalNow()) throw new Error('Local save failed');
  }
  const baselineKey = (profileId: string) => 'ad:v4:baseline:' + profileId;
  function acknowledgeClock(save: Record<string, unknown>) {
    const clean = baseline?.local ?? baseline?.save;
    // 産出も操作もない時計の更新だけでは、双方更新の選択を発生させない。
    if (baseline && clean && sameSave({ ...save, lastTick: clean.lastTick }, clean)) baseline.local = save;
  }
  const localChanged = () => !baseline || !sameSave(serialize(get().adGame!), baseline.local ?? baseline.save);
  function remember(ctx: SyncContext, save: Record<string, unknown> | null, next: number, local = save) {
    const value = { id: ctx.connection.id, save, revision: next, local };
    writeSave(storage, ctx.profileId, serialize(get().adGame!));
    storage.setItem(baselineKey(ctx.profileId), JSON.stringify(value));
    baseline = value;
    revision = next;
  }
  async function resolveServer(ctx: SyncContext): Promise<boolean> {
    if (!current(ctx) || syncing === ctx || get().adSync === 'choice' || get().adMigration) return false;
    syncing = ctx;
    const initial = initialLocalSource !== null;
    try {
      const remote = await ctx.api.load(ctx.connection.id);
      if (!current(ctx)) return false;
      if (remote.save) validateSave(remote.save);
      const local = initialLocalSource ?? serialize(get().adGame!);
      const remoteText = remote.save ? JSON.stringify(remote.save) : null;
      const localSave = JSON.parse(local);
      const forceRemote = ctx.connection.adoptRemote;
      const imported = storage.getItem('ad:v3:importPending:' + ctx.profileId);
      const resolvedRaw = storage.getItem('ad:v4:resolved:' + ctx.profileId);
      const resolved = resolvedRaw ? JSON.parse(resolvedRaw) : null;
      const selectionStillValid = resolved?.revision === remote.revision && sameSave(resolved.remote, remote.save);
      const known = baseline?.id === ctx.connection.id ? baseline : null;
      let chosen = local;
      let choice = false;
      if (forceRemote) {
        if (!remoteText) throw new Error('Connected save is unavailable');
        chosen = remoteText;
      } else if (remoteText && !sameSave(localSave, remote.save)) {
        if (imported && !selectionStillValid) choice = true;
        else if (imported && selectionStillValid) chosen = local;
        else if (known) {
          const localChanged = !sameSave(localSave, known.local ?? known.save);
          const remoteChanged = !sameSave(remote.save, known.save);
          if (!localChanged && remoteChanged) chosen = remoteText;
          else if (remoteChanged) choice = true;
        } else {
          const comparison = compareProgress(JSON.parse(local), remote.save);
          if (comparison === 0) choice = true;
          else chosen = comparison > 0 ? local : remoteText;
        }
      }
      if (initial || choice || forceRemote || chosen !== local) {
        const key = retainSources(ctx.profileId, localSave, remote.save);
        set({ adRecoveryKey: key });
      }
      if (choice) {
        writeSave(storage, ctx.profileId, local);
        storage.setItem('ad:v3:importPending:' + ctx.profileId, 'true');
      }
      if (choice) {
        remember(ctx, remote.save, remote.revision);
        initialLocalSource = null;
        pending = { local, remote: remoteText!, offline: needsOffline };
        set({ adSync: 'choice', adSyncSources: { local: localSave, remote: remote.save! } });
        return true;
      }
      const nextLocal = chosen === local && known && sameSave(known.save, remote.save) ? known.local ?? known.save : remote.save;
      if (needsOffline || chosen !== local) {
        adopt(chosen, needsOffline, { id: ctx.connection.id, save: remote.save, revision: remote.revision, local: nextLocal });
      } else {
        remember(ctx, remote.save, remote.revision, nextLocal);
        set({ adSync: 'ready', adServer: 'connected' });
      }
      initialLocalSource = null;
      if (forceRemote) {
        // 接続先の採用とローカル保存が終わるまで専用の意図を残す。
        writeConnection(storage, ctx.profileId, { id: ctx.connection.id, token: ctx.connection.token });
        ctx.connection.adoptRemote = false;
      }
      if (!localChanged()) {
        storage.removeItem('ad:v3:importPending:' + ctx.profileId);
        storage.removeItem('ad:v4:resolved:' + ctx.profileId);
      }
      return true;
    } catch (error) {
      if (current(ctx)) { initialLocalSource = null; retryAllowed = retryable(error); set({ adSync: 'error', adServer: 'error' }); saveLocalNow(); }
      return false;
    } finally { if (syncing === ctx) syncing = null; }
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
    sourceCache = null;
    generation++;
    retryAllowed = true;
    context = null; revision = null; pending = null; initialLocalSource = null;
    baseline = null;
    needsOffline = true;
    let game: GameState;
    try {
      const raw = readSaveRaw(storage, profile.id);
      game = raw ? deserialize(raw) : createNewGame();
      initialLocalSource = raw || serialize(game);
      const savedBaseline = storage.getItem(baselineKey(profile.id));
      if (savedBaseline) baseline = JSON.parse(savedBaseline);
    } catch {
      retryAllowed = false;
      set({ adProfile: profile, adGame: null, adSync: 'error', adServer: 'error' });
      return;
    }
    set({ adProfile: profile, adGame: game, adOffline: null, adSync: 'loading', adSyncSources: null, adServer: 'local', adRecoveryKey: null, adLastServerSaveAt: null, adLeaderboard: [], adVersion: get().adVersion + 1 });
    if (!get().adMigration) void connect(profile, generation);
  }
  function clearTimers(): void {
    for (const t of timers) clearInterval(t);
    timers = [];
  }
  async function saveServerNow(manual: boolean): Promise<boolean> {
    const ctx = context;
    if (!ctx || !current(ctx) || syncing === ctx || get().adSync !== 'ready' || revision === null || !get().adGame) {
      if (manual) emitAdFeedback({ kind: 'error' });
      return false;
    }
    syncing = ctx;
    try {
      const snapshot = JSON.parse(serialize(get().adGame!));
      retainSources(ctx.profileId, snapshot, baseline?.save ?? null);
      const next = await ctx.api.save(ctx.connection.id, snapshot, revision);
      if (!current(ctx)) return false;
      remember(ctx, snapshot, next);
      // 選択後も保存が確定するまでは、再起動や再競合で取り込みを取り消さない。
      storage.removeItem('ad:v3:importPending:' + ctx.profileId);
      storage.removeItem('ad:v4:resolved:' + ctx.profileId);
      set({ adServer: 'connected', adLastServerSaveAt: Date.now() });
      if (manual) emitAdFeedback({ kind: 'save' });
      return true;
    } catch (error) {
      if (current(ctx)) {
        if ((error as { status?: number }).status === 409) {
          if (syncing === ctx) syncing = null;
          await resolveServer(ctx);
        }
        else { retryAllowed = retryable(error); revision = null; set({ adSync: 'error', adServer: 'error' }); saveLocalNow(); }
        if (manual) emitAdFeedback({ kind: 'error' });
      }
      return false;
    } finally { if (syncing === ctx) syncing = null; }
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
    adMigration: false,
    adSyncSources: null,
    adProgressSources: () => sourceCache ??= listProgressSources(storage),
    adSelectProgress(key) {
      const source = listProgressSources(storage).find(s => s.key === key);
      if (!source || !get().adMigration) return;
      const profile = selectProgress(storage, source.profileId);
      set({ adMigration: false });
      loadProfileGame(profile);
    },
    adRestoreProgress(key) {
      if (frozen()) throw new Error('Busy');
      const source = listProgressSources(storage).find(s => s.key === key);
      if (!source) throw new Error('Progress not found');
      persistBeforeChange();
      const active = get().adProfile!;
      retainSources(active.id, JSON.parse(serialize(get().adGame!)), null);
      const original = listProfiles(storage).find(p => p.id === source.profileId)!;
      const profile = createProfile(storage, original.name);
      writeSave(storage, profile.id, source.save);
      const recoveryKey = source.key.startsWith('profile:') ? null : source.key.slice(0, source.key.lastIndexOf(':'));
      const connection = recoveryKey ? JSON.parse(storage.getItem(recoveryKey) || '{}').connection : readConnection(storage, original.id);
      if (connection) writeConnection(storage, profile.id, connection);
      storage.setItem('ad:v3:importPending:' + profile.id, 'true');
      selectProgress(storage, profile.id);
      loadProfileGame(profile);
    },
    adExportProgress(key) {
      const source = listProgressSources(storage).find(s => s.key === key);
      const profile = source && listProfiles(storage).find(p => p.id === source.profileId);
      return source && profile ? buildExportBundle(profile, source.save) : null;
    },
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
      const selection = prepareProgressSelection(storage);
      const profile = listProfiles(storage).find(p => p.id === selection.profileId)!;
      set({ adMigration: !selection.confirmed });
      if (options.tonariumId) linkTonariumProfile(storage, options.tonariumId, options.tonariumName ?? '');

      loadProfileGame(profile);
      timers = [
        window.setInterval(() => {
          const game = get().adGame;
          if (!game || frozen()) return;
          tick(game, 100);
          acknowledgeClock(JSON.parse(serialize(game)));
          // エンジンはインプレース更新のため、参照は変わらない。購読を起こす版カウンタで知らせる
          set({ adVersion: get().adVersion + 1 });
        }, 100),
        window.setInterval(() => { saveLocalNow(); }, 1000),
        // サーバー保存は常に有効（既定は同一オリジンの Tonarium サーバー）。localStorage はフォールバックとして残る
        window.setInterval(() => {
          const idle = !frozen() && !(syncing === context && context !== null);
          if (idle && get().adSync === 'error' && retryAllowed) {
            try {
              const selection = prepareProgressSelection(storage);
              const profile = listProfiles(storage).find(p => p.id === selection.profileId);
              if (profile && profile.id !== get().adProfile?.id) loadProfileGame(profile);
              else if (profile && get().adGame) {
                set({ adSync: 'loading' });
                void connect(profile, generation);
              }
            } catch { set({ adSync: 'error', adServer: 'error' }); }
          } else if (idle && get().adSync === 'ready' && context) {
            const ctx = context;
            void resolveServer(ctx).then(ok => {
              if (ok && current(ctx) && get().adSync === 'ready' && localChanged()) void saveServerNow(false);
            });
          }
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
        loadProfileGame(selectProgress(storage, profile.id));
        return profile;
      });
    },

    adSwitchProfile(userId) {
      manualAction('profile', () => { persistBeforeChange(); loadProfileGame(selectProgress(storage, userId)); });
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
      if (!started || frozen() || syncing === context && context !== null || !get().adGame) return false;
      saveLocalNow();
      if (context) return resolveServer(context);
      const profile = get().adProfile;
      if (profile) { set({ adSync: 'loading' }); await connect(profile, generation); }
      return get().adSync === 'ready' || get().adSync === 'choice';
    },
    adChooseSave(source) {
      if (get().adSync !== 'choice' || !pending) return;
      const resolved = JSON.stringify({ revision, remote: JSON.parse(pending.remote) });
      adopt(pending[source], pending.offline, baseline, resolved);
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
      if (!started || frozen()) throw new Error('Busy');
      persistBeforeChange();
      retainSources(get().adProfile!.id, JSON.parse(serialize(get().adGame!)), null);
      const epoch = ++generation;
      context = null; revision = null;
      set({ adSync: 'loading' });
      try {
        const connection = await publicApi().exchange(code.trim());
        if (!started || generation !== epoch) return;
        const profile = adoptConnection(storage, get().adProfile?.name ?? 'Player 1', connection);
        loadProfileGame(profile);
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
          dimensionalBoosts: game.dimensionalBoosts,
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
      const activeId = get().adProfile?.id;
      return listProfiles(storage).sort((a, b) => Number(b.id === activeId) - Number(a.id === activeId)).flatMap(profile => listRecoveryRecords(storage, profile.id));
    },
    adExportRecovery(source, selectedKey) {
      const profile = get().adProfile;
      if (!profile) return null;
      const records = slice.adListRecovery();
      const key = selectedKey ?? records[0]?.key;
      if (!records.some(record => record.key === key)) return null;
      const raw = key ? storage.getItem(key) : null;
      const save = raw ? JSON.parse(raw)?.[source] : null;
      const owner = listProfiles(storage).find(p => listRecoveryRecords(storage, p.id).some(record => record.key === key));
      return save && owner ? buildExportBundle(owner, save) : null;
    },
    adResetGame() {
      if (frozen()) throw new Error('Busy');
      const profile = get().adProfile;
      if (!profile || !get().adGame) return;
      retainSources(profile.id, JSON.parse(serialize(get().adGame!)), null);
      set({ adGame: createNewGame(), adOffline: null, adVersion: get().adVersion + 1 });
      saveLocalNow();
      void saveServerNow(false);
    },

    adImport(bundle, confirmLegacy) {
      return manualAction('import', () => {
        const parsed = parseImportBundle(bundle);
        if (parsed.version === 2 && !confirmLegacy) throw new Error('Legacy confirmation required');
        if (frozen()) throw new Error('Busy');
        persistBeforeChange();
        const result = importBundleInto(storage, parsed, { confirmLegacy });
        loadProfileGame(result.profile);
        return result.profile;
      });
    },
  };

  return slice;
}
