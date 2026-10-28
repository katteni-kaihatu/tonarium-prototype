import { validateSave } from './sync.mjs';
/**
 * user.mjs — Antimatter Dimensions ユーザー分離 / 認証差し替え / export・import
 *
 * UI 非依存の純粋モジュール。ブラウザ API には直接触らず、ストレージは
 * 引数で注入する（Web Storage 互換: getItem / setItem / removeItem を持つ
 * オブジェクト）。これにより:
 *   - ブラウザでは localStorage をそのまま渡せる
 *   - Node のテストでは Map ベースのモックを渡せる
 *   - 将来、保存先を IndexedDB やサーバー側セッションへ替えても
 *     このモジュールの API は変えずに済む
 *
 * ---------------------------------------------------------------------------
 * ユーザー分離の考え方
 * ---------------------------------------------------------------------------
 * プロフィール（= ローカルユーザー）を複数持てる。各プロフィールのセーブは
 * ユーザー ID で名前空間を分けたキーに保存する:
 *
 *   'ad:v2:profiles'        プロフィール配列 [{id, name, createdAt}, ...]
 *   'ad:v2:activeProfile'   現在アクティブなプロフィールの id（文字列）
 *   'ad:v2:save:' + userId  そのユーザーのセーブ（JSON 文字列）
 *
 * 旧方式（app.js の 'ad-save-v1' + 単一 playerId）とはキーが衝突しない。
 * 移行は統合フェーズで「旧セーブをデフォルトプロフィールへ取り込む」形で行う。
 *
 * ---------------------------------------------------------------------------
 * 認証の差し替え
 * ---------------------------------------------------------------------------
 * 認証方式は createAuthProvider(config) の中だけに閉じ込めてある。
 * 将来 OIDC / OAuth 等へ移行する場合は、この関数を差し替えて
 * {mode, getUserId(), getAuthHeaders()} を返す実装にすればよく、
 * 呼び出し側（API クライアント）は一切変更しなくてよい。
 *
 * 接続権限はプロフィール別に保持し、エクスポートには含めない。
 */

// ---------------------------------------------------------------------------
// 定数
// ---------------------------------------------------------------------------

export const PROFILES_KEY = 'ad:v2:profiles';
export const ACTIVE_PROFILE_KEY = 'ad:v2:activeProfile';
export const SAVE_KEY_PREFIX = 'ad:v2:save:';

export const EXPORT_BUNDLE_TYPE = 'antimatter-dimensions-export';
export const EXPORT_BUNDLE_VERSION = 3;

export const DEFAULT_PROFILE_NAME = 'Player 1';
export const MAX_PROFILE_NAME_LENGTH = 64;

/** 対応する認証モード。将来モードを増やす場合はここへ追加する。 */
export const AUTH_MODES = Object.freeze(['anonymous', 'token', 'header-injected']);

// ---------------------------------------------------------------------------
// 内部ヘルパー
// ---------------------------------------------------------------------------

function assertStorage(storage) {
  if (
    !storage ||
    typeof storage.getItem !== 'function' ||
    typeof storage.setItem !== 'function' ||
    typeof storage.removeItem !== 'function'
  ) {
    throw new TypeError(
      'user.mjs: storage must implement getItem/setItem/removeItem (Web Storage compatible)',
    );
  }
}

/** プレーンオブジェクトのディープクローン（JSON 化できる値だけを想定）。 */
function clonePlain(value) {
  if (value === null || typeof value !== 'object') return value;
  return JSON.parse(JSON.stringify(value));
}

function normalizeProfileName(name) {
  if (typeof name !== 'string') {
    throw new Error('Profile name must be a string');
  }
  const trimmed = name.trim();
  if (trimmed.length === 0) {
    throw new Error('Profile name must not be empty');
  }
  return trimmed.slice(0, MAX_PROFILE_NAME_LENGTH);
}

/** 保存済みエントリを {id, name, createdAt} の形へ正規化する。不正なら null。 */
function normalizeStoredProfile(entry) {
  if (!entry || typeof entry !== 'object') return null;
  const id = entry.id ?? entry.userId;
  if (typeof id !== 'string' || id.length === 0) return null;
  const name =
    typeof entry.name === 'string' && entry.name.trim().length > 0
      ? entry.name.trim().slice(0, MAX_PROFILE_NAME_LENGTH)
      : 'Player';
  return {
    id,
    name,
    createdAt: typeof entry.createdAt === 'string' ? entry.createdAt : null,
  };
}

function readProfilesRaw(storage) {
  const raw = storage.getItem(PROFILES_KEY);
  if (raw === null || raw === undefined || raw === '') return [];
  let parsed;
  try {
    parsed = JSON.parse(raw);
  } catch {
    throw new Error(`user.mjs: stored profiles are corrupted (key: ${PROFILES_KEY})`);
  }
  if (!Array.isArray(parsed)) {
    throw new Error(`user.mjs: stored profiles are corrupted (key: ${PROFILES_KEY})`);
  }
  return parsed.map(normalizeStoredProfile).filter((p) => p !== null);
}

function writeProfilesRaw(storage, profiles) {
  storage.setItem(PROFILES_KEY, JSON.stringify(profiles));
}

// ---------------------------------------------------------------------------
// ID 生成
// ---------------------------------------------------------------------------

/**
 * generateUserId() -> string
 * crypto.randomUUID があればそれを使う。無い環境（非 secure コンテキスト、
 * 古い Node 等）でも動くよう、getRandomValues → Math.random の順に
 * フォールバックする。返り値は [A-Za-z0-9_-] のみで構成し、バックエンドの
 * playerId バリデーション（^[A-Za-z0-9_-]{1,64}$）にもそのまま使える。
 */
export function generateUserId() {
  const cryptoObj = globalThis.crypto ?? null;
  if (cryptoObj && typeof cryptoObj.randomUUID === 'function') {
    try {
      return cryptoObj.randomUUID();
    } catch {
      // フォールバックへ進む
    }
  }
  if (cryptoObj && typeof cryptoObj.getRandomValues === 'function') {
    try {
      const bytes = new Uint8Array(16);
      cryptoObj.getRandomValues(bytes);
      // RFC 4122 version 4 / variant のビットを立てる
      bytes[6] = (bytes[6] & 0x0f) | 0x40;
      bytes[8] = (bytes[8] & 0x3f) | 0x80;
      const hex = Array.from(bytes, (b) => b.toString(16).padStart(2, '0')).join('');
      return `${hex.slice(0, 8)}-${hex.slice(8, 12)}-${hex.slice(12, 16)}-${hex.slice(16, 20)}-${hex.slice(20)}`;
    } catch {
      // フォールバックへ進む
    }
  }
  const rand = () =>
    Math.floor(Math.random() * 0xffffffff)
      .toString(16)
      .padStart(8, '0');
  return `user-${Date.now().toString(16)}-${rand()}-${rand()}`.slice(0, 64);
}

// ---------------------------------------------------------------------------
// キー
// ---------------------------------------------------------------------------

/** そのユーザーのセーブを保存するストレージキー。 */
export function saveKeyFor(userId) {
  if (typeof userId !== 'string' || userId.length === 0) {
    throw new Error('saveKeyFor: userId must be a non-empty string');
  }
  return SAVE_KEY_PREFIX + userId;
}

// ---------------------------------------------------------------------------
// プロフィール管理
// ---------------------------------------------------------------------------

/** listProfiles(storage) -> [{id, name, createdAt}, ...]（コピーを返す） */
export function listProfiles(storage) {
  assertStorage(storage);
  return clonePlain(readProfilesRaw(storage));
}

/**
 * createProfile(storage, name) -> 作成したプロフィール
 * アクティブなプロフィールがまだ無い場合のみ、新規プロフィールを
 * アクティブにする（既存のアクティブは勝手に奪わない。切り替えは
 * switchProfile を明示的に呼ぶこと）。
 */
export function createProfile(storage, name) {
  assertStorage(storage);
  const profileName = normalizeProfileName(name);
  const profiles = readProfilesRaw(storage);
  const profile = {
    id: generateUserId(),
    name: profileName,
    createdAt: new Date().toISOString(),
  };
  profiles.push(profile);
  writeProfilesRaw(storage, profiles);
  if (getActiveProfile(storage) === null) {
    storage.setItem(ACTIVE_PROFILE_KEY, profile.id);
  }
  return clonePlain(profile);
}

/** getActiveProfile(storage) -> アクティブなプロフィール or null */
export function getActiveProfile(storage) {
  assertStorage(storage);
  const activeId = storage.getItem(ACTIVE_PROFILE_KEY);
  if (typeof activeId !== 'string' || activeId.length === 0) return null;
  const profile = readProfilesRaw(storage).find((p) => p.id === activeId);
  return profile ? clonePlain(profile) : null;
}

/**
 * ensureDefaultProfile(storage) -> アクティブなプロフィール
 * 初回起動用。プロフィールが無ければデフォルト（'Player 1'）を自動作成し、
 * プロフィールはあるがアクティブが無い/壊れている場合は先頭をアクティブにする。
 * 冪等: 何度呼んでも余分なプロフィールは作らない。
 */
export function ensureDefaultProfile(storage) {
  assertStorage(storage);
  const profiles = readProfilesRaw(storage);
  if (profiles.length === 0) {
    return createProfile(storage, DEFAULT_PROFILE_NAME);
  }
  const active = getActiveProfile(storage);
  if (active !== null) return active;
  storage.setItem(ACTIVE_PROFILE_KEY, profiles[0].id);
  return clonePlain(profiles[0]);
}

/**
 * switchProfile(storage, userId) -> 切り替え後のプロフィール
 * 存在しない userId の場合は Error を投げる。
 */
export function switchProfile(storage, userId) {
  assertStorage(storage);
  const profile = readProfilesRaw(storage).find((p) => p.id === userId);
  if (!profile) {
    throw new Error(`switchProfile: profile not found: ${String(userId)}`);
  }
  storage.setItem(ACTIVE_PROFILE_KEY, profile.id);
  return clonePlain(profile);
}

/**
 * renameProfile(storage, userId, name) -> 更新後のプロフィール
 * 存在しない userId の場合は Error を投げる。
 */
export function renameProfile(storage, userId, name) {
  assertStorage(storage);
  const profileName = normalizeProfileName(name);
  const profiles = readProfilesRaw(storage);
  const profile = profiles.find((p) => p.id === userId);
  if (!profile) {
    throw new Error(`renameProfile: profile not found: ${String(userId)}`);
  }
  profile.name = profileName;
  writeProfilesRaw(storage, profiles);
  return clonePlain(profile);
}

/**
 * deleteProfile(storage, userId) -> boolean（削除できたら true）
 * そのユーザーのセーブキーも一緒に消す。アクティブだった場合は
 * 残りの先頭プロフィールへ自動で切り替え、残りが無ければ
 * アクティブキーを取り除く。存在しない userId でもエラーにせず
 * false を返す（冪等な掃除操作として扱う）が、セーブキーの残骸は消す。
 */
export function deleteProfile(storage, userId) {
  assertStorage(storage);
  if (typeof userId === 'string' && userId.length > 0) {
    storage.removeItem(saveKeyFor(userId));
  }
  const profiles = readProfilesRaw(storage);
  const index = profiles.findIndex((p) => p.id === userId);
  if (index === -1) return false;
  profiles.splice(index, 1);
  writeProfilesRaw(storage, profiles);
  if (storage.getItem(ACTIVE_PROFILE_KEY) === userId) {
    if (profiles.length > 0) {
      storage.setItem(ACTIVE_PROFILE_KEY, profiles[0].id);
    } else {
      storage.removeItem(ACTIVE_PROFILE_KEY);
    }
  }
  return true;
}

// ---------------------------------------------------------------------------
// ユーザー単位のセーブ読み書き（分離の担保はここを通すこと）
// ---------------------------------------------------------------------------

/**
 * writeSave(storage, userId, save) -> 保存先キー
 * save はオブジェクト（JSON 化して保存）でも JSON 文字列でもよい。
 */
export function writeSave(storage, userId, save) {
  assertStorage(storage);
  const key = saveKeyFor(userId);
  const text = typeof save === 'string' ? save : JSON.stringify(save);
  if (typeof text !== 'string') {
    throw new Error('writeSave: save must be an object or a JSON string');
  }
  storage.setItem(key, text);
  return key;
}

/** readSaveRaw(storage, userId) -> 保存済み JSON 文字列 or null */
export function readSaveRaw(storage, userId) {
  assertStorage(storage);
  const raw = storage.getItem(saveKeyFor(userId));
  return raw === undefined ? null : raw;
}

/** readSave(storage, userId) -> パース済みセーブオブジェクト or null */
export function readSave(storage, userId) {
  const raw = readSaveRaw(storage, userId);
  if (raw === null || raw === '') return null;
  try {
    return JSON.parse(raw);
  } catch {
    throw new Error(`readSave: stored save is corrupted (key: ${saveKeyFor(userId)})`);
  }
}

// ---------------------------------------------------------------------------
// 認証抽象
// ---------------------------------------------------------------------------

function resolveConfiguredUserId(storage, config) {
  if (typeof config.getUserId === 'function') {
    const id = config.getUserId();
    return typeof id === 'string' && id.length > 0 ? id : null;
  }
  if (typeof config.userId === 'string' && config.userId.length > 0) return config.userId;
  const profile = config.profile;
  if (profile && typeof profile === 'object') {
    const id = profile.id ?? profile.userId;
    if (typeof id === 'string' && id.length > 0) return id;
  }
  if (storage) {
    const active = getActiveProfile(storage);
    if (active) return active.id;
  }
  return null;
}

/**
 * createAuthProvider(config) -> {mode, getUserId(), getAuthHeaders()}
 *
 * config:
 *   mode:     'anonymous' | 'token' | 'header-injected'（省略時は 'anonymous'）
 *   storage:  anonymous でアクティブプロフィールから userId を引く場合に渡す。
 *             getUserId() は呼び出しのたびに storage を読むので、
 *             プロフィール切替が即座にヘッダへ反映される。
 *   userId:   userId を固定で渡す場合（storage より優先順位は getUserId 関数
 *             の次）。profile: {id, name} を渡してもよい。
 *   getUserId: () => string | null の関数で渡す場合（最優先）。
 *   token:    token モード必須。メモリ上でのみ保持し、storage へは保存しない。
 *
 * モードごとの getAuthHeaders():
 *   anonymous:       { 'X-User-Id': <active profile id> }（無ければ {}）
 *   token:           { Authorization: 'Bearer <token>' }（+ userId が分かれば
 *                      'X-User-Id' も付ける）
 *   header-injected: {}（前段プロキシが認証済みで、認証ヘッダはプロキシが
 *                      付ける前提。JS 側は一切付けない）
 */
export function createAuthProvider(config = {}) {
  if (config === null || typeof config !== 'object') {
    throw new TypeError('createAuthProvider: config must be an object');
  }
  const mode = config.mode ?? 'anonymous';
  if (!AUTH_MODES.includes(mode)) {
    throw new Error(
      `createAuthProvider: unknown auth mode: ${String(mode)} (expected one of ${AUTH_MODES.join(', ')})`,
    );
  }
  const storage = config.storage ?? null;
  if (storage !== null) assertStorage(storage);

  let token = null;
  if (mode === 'token') {
    if (typeof config.token !== 'string' || config.token.length === 0) {
      throw new Error("createAuthProvider: mode 'token' requires a non-empty config.token");
    }
    // トークンはこのクロージャ（メモリ上）でのみ保持する。storage には書かない。
    token = config.token;
  }

  const provider = {
    mode,
    getUserId() {
      return resolveConfiguredUserId(storage, config);
    },
    getAuthHeaders() {
      if (mode === 'header-injected') return {};
      if (mode === 'token') {
        const headers = { Authorization: `Bearer ${token}` };
        const userId = provider.getUserId();
        if (userId) headers['X-User-Id'] = userId;
        return headers;
      }
      // anonymous
      const userId = provider.getUserId();
      return userId ? { 'X-User-Id': userId } : {};
    },
  };
  return Object.freeze(provider);
}

// ---------------------------------------------------------------------------
// export / import
// ---------------------------------------------------------------------------

function normalizeBundleUser(user) {
  if (!user || typeof user !== 'object') {
    throw new Error('Invalid export bundle: missing "user" object');
  }
  const id = user.id ?? user.userId;
  if (typeof id !== 'string' || id.length === 0) {
    throw new Error('Invalid export bundle: user.id must be a non-empty string');
  }
  if (typeof user.name !== 'string' || user.name.trim().length === 0) {
    throw new Error('Invalid export bundle: user.name must be a non-empty string');
  }
  return { id, name: user.name.trim().slice(0, MAX_PROFILE_NAME_LENGTH) };
}

function toExportedAtIso(exportedAt) {
  if (exportedAt === undefined || exportedAt === null) return new Date().toISOString();
  if (exportedAt instanceof Date) {
    if (Number.isNaN(exportedAt.getTime())) throw new Error('buildExportBundle: exportedAt is an invalid Date');
    return exportedAt.toISOString();
  }
  if (typeof exportedAt === 'string') {
    const time = Date.parse(exportedAt);
    if (Number.isNaN(time)) throw new Error('buildExportBundle: exportedAt is not a valid date string');
    return new Date(time).toISOString();
  }
  if (typeof exportedAt === 'number' && Number.isFinite(exportedAt)) {
    return new Date(exportedAt).toISOString();
  }
  throw new Error('buildExportBundle: exportedAt must be a Date, ISO string, or epoch ms');
}

function canonical(value) {
  if (Array.isArray(value)) return '[' + value.map(canonical).join(',') + ']';
  if (value && typeof value === 'object') return '{' + Object.keys(value).sort().map(k => JSON.stringify(k) + ':' + canonical(value[k])).join(',') + '}';
  return JSON.stringify(value);
}
function payload(bundle) {
  return { type: bundle.type, version: bundle.version, exportedAt: bundle.exportedAt, user: bundle.user, save: bundle.save };
}
function checksum(bundle) {
  let crc = 0xffffffff;
  for (const byte of new TextEncoder().encode(canonical(payload(bundle)))) {
    crc ^= byte;
    for (let bit = 0; bit < 8; bit++) crc = (crc >>> 1) ^ ((crc & 1) ? 0xedb88320 : 0);
  }
  return 'crc32:' + ((crc ^ 0xffffffff) >>> 0).toString(16).padStart(8, '0');
}
export function buildExportBundle(profile, saveObject, exportedAt) {
  const user = normalizeBundleUser(profile);
  validateSave(saveObject);
  const bundle = { type: EXPORT_BUNDLE_TYPE, version: 3, exportedAt: toExportedAtIso(exportedAt), user, save: clonePlain(saveObject) };
  return { ...bundle, checksum: checksum(bundle) };
}
export function parseImportBundle(input) {
  const raw = typeof input === 'string' ? JSON.parse(input) : clonePlain(input);
  if (!raw || raw.type !== EXPORT_BUNDLE_TYPE || ![2, 3].includes(raw.version)) throw new Error('Invalid export bundle');
  validateSave(raw.save);
  normalizeBundleUser(raw.user);
  if (raw.version === 3 && (typeof raw.exportedAt !== 'string' || toExportedAtIso(raw.exportedAt) !== raw.exportedAt)) throw new Error('Invalid export date');
  if (raw.version === 3 && (typeof raw.checksum !== 'string' || raw.checksum !== checksum(raw))) throw new Error('Checksum mismatch');
  return raw;
}
export function importBundleInto(storage, bundle, options = {}) {
  assertStorage(storage);
  const parsed = parseImportBundle(bundle);
  if (parsed.version === 2 && options.confirmLegacy !== true) throw new Error('Legacy confirmation required');
  const active = ensureDefaultProfile(storage);
  const previous = readSaveRaw(storage, active.id);
  if (previous) retainSyncSources(storage, active.id, JSON.parse(previous), null);
  storage.setItem('ad:v3:importPending:' + active.id, 'true');
  const key = writeSave(storage, active.id, parsed.save);
  return { profile: active, userId: active.id, saveKey: key, sourceUser: normalizeBundleUser(parsed.user) };
}

export function readConnection(storage, profileId) {
  const raw = storage.getItem('ad:v3:connection:' + profileId);
  if (!raw) return null;
  const value = JSON.parse(raw);
  if (!value || typeof value.id !== 'string' || typeof value.token !== 'string') throw new Error('Invalid AD connection');
  return value;
}
export function writeConnection(storage, profileId, connection) {
  storage.setItem('ad:v3:connection:' + profileId, JSON.stringify(connection));
}
export function listRecoveryRecords(storage, profileId) {
  const prefix = 'ad:v3:recovery:' + profileId + ':';
  const records = JSON.parse(storage.getItem('ad:v3:recoveryIndex:' + profileId) || '[]');
  const keys = new Set(records.map(record => record.key));
  const add = key => {
    if (key?.startsWith(prefix) && !keys.has(key) && storage.getItem(key)) {
      records.push({ key, createdAt: null });
      keys.add(key);
    }
  };
  add(storage.getItem('ad:v3:lastRecovery:' + profileId));
  // 旧版で一覧に登録されなかった記録も回収する。
  if (typeof storage.key === 'function') {
    for (let i = 0; i < storage.length; i++) add(storage.key(i));
  }
  return records.filter(record => record.key.startsWith(prefix) && storage.getItem(record.key));
}
export function retainSyncSources(storage, profileId, local, remote) {
  const records = listRecoveryRecords(storage, profileId);
  const key = 'ad:v3:recovery:' + profileId + ':' + generateUserId();
  storage.setItem(key, JSON.stringify({ local, remote }));
  storage.setItem('ad:v3:recoveryIndex:' + profileId, JSON.stringify([{ key, createdAt: new Date().toISOString() }, ...records]));
  storage.setItem('ad:v3:lastRecovery:' + profileId, key);
  return key;
}
export default {
  AUTH_MODES,
  PROFILES_KEY,
  ACTIVE_PROFILE_KEY,
  SAVE_KEY_PREFIX,
  EXPORT_BUNDLE_TYPE,
  EXPORT_BUNDLE_VERSION,
  DEFAULT_PROFILE_NAME,
  generateUserId,
  saveKeyFor,
  listProfiles,
  createProfile,
  getActiveProfile,
  ensureDefaultProfile,
  switchProfile,
  renameProfile,
  deleteProfile,
  writeSave,
  readSave,
  readSaveRaw,
  createAuthProvider,
  buildExportBundle,
  parseImportBundle,
  importBundleInto,
  readConnection,
  writeConnection,
  retainSyncSources,
  listRecoveryRecords,
};
