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
 * 注意: token モードのトークンは呼び出し側がメモリ上（または Secure Vault 等）
 * で保持し、このモジュール経由で storage に平文保存することはしない。
 * このモジュール自体もトークンを storage へ書き込むことは決してない。
 */

// ---------------------------------------------------------------------------
// 定数
// ---------------------------------------------------------------------------

export const PROFILES_KEY = 'ad:v2:profiles';
export const ACTIVE_PROFILE_KEY = 'ad:v2:activeProfile';
export const SAVE_KEY_PREFIX = 'ad:v2:save:';

export const EXPORT_BUNDLE_TYPE = 'antimatter-dimensions-export';
export const EXPORT_BUNDLE_VERSION = 2;

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

function assertBundleSave(save) {
  if (!save || typeof save !== 'object' || Array.isArray(save)) {
    throw new Error('Invalid export bundle: "save" must be an object');
  }
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

/**
 * buildExportBundle(profile, saveObject, exportedAt?) ->
 *   {type: 'antimatter-dimensions-export', version: 2, exportedAt: ISO文字列,
 *    user: {id, name}, save}
 * profile は {id, name} でも {userId, name} でもよい。save はディープ
 * クローンするので、返した bundle を書き換えても元のセーブは汚れない。
 */
export function buildExportBundle(profile, saveObject, exportedAt) {
  const user = normalizeBundleUser(profile);
  assertBundleSave(saveObject);
  return {
    type: EXPORT_BUNDLE_TYPE,
    version: EXPORT_BUNDLE_VERSION,
    exportedAt: toExportedAtIso(exportedAt),
    user,
    save: clonePlain(saveObject),
  };
}

/**
 * parseImportBundle(jsonTextOrObject) -> {user: {id, name}, save}
 * type / version / user / save を検証し、不正なら Error を投げる。
 * 戻り値の save はディープクローン（入力オブジェクトと参照を共有しない）。
 */
export function parseImportBundle(jsonTextOrObject) {
  let raw = jsonTextOrObject;
  if (typeof raw === 'string') {
    try {
      raw = JSON.parse(raw);
    } catch (err) {
      throw new Error(`Invalid export bundle: not valid JSON (${err.message})`);
    }
  }
  if (!raw || typeof raw !== 'object' || Array.isArray(raw)) {
    throw new Error('Invalid export bundle: expected an object');
  }
  if (raw.type !== EXPORT_BUNDLE_TYPE) {
    throw new Error(
      `Invalid export bundle: type must be "${EXPORT_BUNDLE_TYPE}", got ${JSON.stringify(raw.type)}`,
    );
  }
  if (raw.version !== EXPORT_BUNDLE_VERSION) {
    throw new Error(
      `Invalid export bundle: unsupported version ${JSON.stringify(raw.version)} (expected ${EXPORT_BUNDLE_VERSION})`,
    );
  }
  const user = normalizeBundleUser(raw.user);
  assertBundleSave(raw.save);
  return { user, save: clonePlain(raw.save) };
}

/** 既に parse 済みの {user, save} か、生の bundle かをどちらでも受理する。 */
function coerceToParsedBundle(bundle) {
  if (typeof bundle === 'string') return parseImportBundle(bundle);
  if (bundle && typeof bundle === 'object' && 'type' in bundle) {
    return parseImportBundle(bundle);
  }
  if (bundle && typeof bundle === 'object') {
    const user = normalizeBundleUser(bundle.user);
    assertBundleSave(bundle.save);
    return { user, save: clonePlain(bundle.save) };
  }
  throw new Error('Invalid export bundle: expected an object or JSON string');
}

/**
 * importBundleInto(storage, bundle) ->
 *   {profile, userId, saveKey, sourceUser}
 *
 * 方針: bundle は「現在の（アクティブな）プロフィール配下に」取り込む。
 * つまり保存先は必ずアクティブプロフィールの save キーであり、bundle 元の
 * user.id を保存先キーにもプロフィール作成にも使わない。これにより他人の
 * bundle を取り込んでも、他人の userId 名義のデータが自分のストレージに
 * 生えることはない。アクティブプロフィールが無ければデフォルトを作成する。
 */
export function importBundleInto(storage, bundle) {
  assertStorage(storage);
  const parsed = coerceToParsedBundle(bundle);
  const active = ensureDefaultProfile(storage);
  const key = writeSave(storage, active.id, parsed.save);
  return {
    profile: active,
    userId: active.id,
    saveKey: key,
    sourceUser: clonePlain(parsed.user),
  };
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
};
