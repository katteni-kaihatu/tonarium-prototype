import { AdStore, AdStoreError } from './ad-store.ts';
import { scheduleChessAiReply } from './chess-ai.ts';
import 'dotenv/config';
import { configuredTranslationModel, createTranslationHandler, createTranslator } from './translation.ts';
import { ContentTranslationStore } from './content-translations.ts';
import { collectContentDocuments, readContentMetadata } from './content-translation-sources.ts';
import { contentTranslationConfig } from './content-translation-config.ts';
import http from 'node:http';
import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { createHash, randomInt, randomUUID } from 'node:crypto';
import { WebSocketServer, WebSocket } from 'ws';
import { keepHomeSocketsAlive } from './ws-heartbeat.ts';
import { SessionThumbnails } from './thumbnails.ts';
import { AccessToken } from 'livekit-server-sdk';
import type {
  AvatarState, ChatMedia, ChatMessage, ChatScope, ClientMsg, EventDef, Group, GuildConfig, Message, Mode, Participant, Person, Presence, Recap, RoomClientMsg, Rsvp,
  ServerMsg, SessionDef, SessionInfo, StatusKind, User,
} from '../shared/protocol.ts';
import { COMPAT_VERSION, PLAN_QUORUM, ROOM_HALF, STATUS_INFO, STATUS_TEXT_MAX, VISIBILITY_INFO, channelKey, dmKey, isGroupVisibility, type DirectoryEntry } from '../shared/protocol.ts';
import { GROUP_COLORS, canSeeSession } from '../shared/home.ts';
import { WORLDS, WORLD_COUNTDOWN_MS, isWorldKind, pushOut, type WorldKind } from '../shared/worlds.ts';
import { ITEM_INFO, MEDIA_URL_RE, ONLY_3D, applyItemAction, canAddMirror, createItem, isDeltaAction, isHandheld, itemSummary, type Item } from '../shared/items.ts';
import { mediaTransform } from '../shared/media-placement.ts';
import { telephoneAction, telephoneItemFor, telephoneState, tickTelephone, reconcileTelephoneHost, hasTelephoneHistory } from './telephone.ts';
import type { TelephoneAction } from '../shared/telephone.ts';
import { sanitizeParams } from '../shared/avatar.ts';
import { VOICE_RANGE, clampAvatar, computePlaces, placeDistance } from '../shared/places.ts';
import { CITY_HALF, clampCity } from '../shared/city.ts';
import { callElevator, elevatorOf, resetElevator } from './city.ts';
import { isStaleEvent, pruneEvents } from './events.ts';
import { logHammerHit } from './hammer.ts';
import { MarketLikes } from './market.ts';
import { BIKE, clampBike, releaseBike } from '../shared/vehicle.ts';
import { SOUNDS } from '../shared/sounds.ts';
import { EMOTES, isEmoteId } from '../shared/emotes.ts';
import { DICE_MAX, ROLL_MS, isDieSides, type DiceRoll } from '../shared/dice.ts';
import type { PeerOperation } from '../shared/session-events.ts';
import { getOgp } from './ogp.ts';
import { IMAGE_MAX, IMAGE_TYPES, MEDIA_NAME_RE, MEDIA_TOTAL_MAX, pipeFile, saveMedia } from './media.ts';
import { FileStorage, openStorage } from './storage.ts';
import { addMediaFile, loadAccountImages, loadMediaFiles, removeMediaFiles, saveAccountImages, type AccountImages } from './db/image-store.ts';
import { SharedService } from './shared-service.ts';
import { sharedSolids } from '../shared/shared-presentation.ts';
import { SystemService } from './system-service.ts';
import { TimedCameraItems } from './timed-camera-items.ts';
import { systemMaps } from './system-maps.ts';
import { isSystemControlledItem, reconcileSystemItems } from './system-items.ts';
import { cameraTimerRemoval } from '../shared/camera-timer-demo.ts';
import { systemSeat, systemSolids } from '../shared/system-presentation.ts';
import { assetDelta } from '../shared/shared-sync.ts';
import { PERSON as PERSON_R, freeSpot, itemRadius, pushApart2D } from './spacing.ts';
import { clearGame, eliminate, gameOf, resetGame, startGame, stepTile, type GameDeps } from './game.ts';
import { chooseSurvivorGear, chooseSurvivorStyle, clearSurvivor, moveSurvivor, removeSurvivor, resetSurvivorUpgrades, rerollSurvivorChoice, startSurvivor, tickSurvivors, upgradeSurvivor, survivorOf, type SurvivorDeps } from './survivors.ts';
import { newSurvivorProfile, SURVIVOR_META_UPGRADES, SURVIVOR_PROFILE_VERSION, SURVIVOR_TICK_MS, survivorUpgradeRefund, type SurvivorMetaUpgrade, type SurvivorProfile, type SurvivorStyle } from '../shared/survivor.ts';
import { Follows } from './follows.ts';
import { POST_RATE, Timeline, UPLOAD_RATE } from './timeline.ts';
import { POST_IMAGE_MAX_BYTES, isImageId, type Post } from '../shared/timeline.ts';
import { closeDb, db, openDb } from './db/index.ts';
import { debounced, drain, enqueue } from './db/persist.ts';
import { listAppData, putAppData } from './db/app-data.ts';
import { addMarketLike, addReport, loadContent, savePosts, saveItems as writeItems } from './db/content-store.ts';
import { loadPeopleAndHome, saveConversations, saveFollows as writeFollows, saveHome as writeHome, savePeople as writePeople, saveReads, type PersonRec } from './db/home-store.ts';
import { accounts } from './db/schema.ts';
import { ne } from 'drizzle-orm';
import { Auth, normalizeName, requestOrigin, type Account } from './auth.ts';
import { createSyncGrant, handleSyncOffer, upgradeSync, revokeSync, revokeUserSync, leaveRoom, livekitRoom, roomSend, roomSendSnapshot, shutdownRooms, type RoomHandlers } from './rooms.ts';
import { FantasyStore, handleFantasyAction, isFantasyAction } from './fantasy-store.ts';
import { FantasyClock } from './fantasy-clock.ts';
import { FantasyParty } from './fantasy-party.ts';
import { NpcChat } from './npc.ts';
import { FantasyGmChat } from './fantasy-gm-chat.ts';
import { FantasyCommunity, type CommunityActor } from './fantasy-community.ts';
import { FantasyContracts, type FantasyContractActor } from './fantasy-contracts.ts';
import { fantasyPersonalQuest, fantasyContractErrorText } from '../shared/fantasy-contracts.ts';
import { FANTASY_QUESTS } from '../shared/fantasy-data.ts';
import { FantasyPropertyDialogue } from './fantasy-property-dialogue.ts';
import { FantasyBargaining } from './fantasy-bargaining.ts';
import { FantasyConversationActions } from './fantasy-conversation-actions.ts';
import { NPC_PUBLIC } from '../shared/npc.ts';
import { fantasyGmActivityName } from '../shared/fantasy-gm-locale.ts';
import { fantasyTestToolsAllowed } from './fantasy-test-reset.ts';
import { fantasyCombatHuntOptions } from '../shared/fantasy-combat-challenges.ts';
import { fantasyHostileEncounter } from '../shared/fantasy-encounters.ts';
import type { DialogueDynamicContext } from './dialogue-dynamic.ts';
import { FantasyAccounts, type AccountBinding } from './fantasy-accounts.ts';
import { FantasyBackups, fantasyBackupFiles, createFantasyBackupSave } from './fantasy-backups.ts';
import { resolvePublicFile } from './static-files.ts';
import { FantasyDiagnostics } from './fantasy-diagnostics.ts';
import { FantasyPlayObserver } from './fantasy-play-observer.ts';
import { FantasyDialogueObserver } from './fantasy-dialogue-observer.ts';

const PORT = Number(process.env.SERVER_PORT ?? 3001);
const DEV = process.argv.includes('--dev');
const npcChat = new NpcChat();
const fantasyGmChat = new FantasyGmChat();
const fantasyPropertyDialogue = new FantasyPropertyDialogue();
const fantasyBargaining = new FantasyBargaining();
const fantasyConversationActions = new FantasyConversationActions();
const ROOT = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');
const DIST = path.join(ROOT, 'client/dist');
// index.html は読み込むファイル名にハッシュを含むので、画面が変わったときだけ版が変わる
const CLIENT_VERSION = (() => {
  if (DEV) return null;
  try { return createHash('sha1').update(fs.readFileSync(path.join(DIST, 'index.html'))).digest('hex').slice(0, 12); } catch { return null; }
})();
const DATA_DIR = process.env.DATA_DIR ?? path.join(ROOT, 'data');
// 名前だけでログイン扱いになる入口。設定を書き間違えても本番で開かないよう、明示の指定と本番でないことの両方を求める
const DEV_LOGIN = process.env.AUTH_DEV_LOGIN === '1' && process.env.NODE_ENV !== 'production';
if (process.env.AUTH_DEV_LOGIN === '1' && !DEV_LOGIN) console.warn('NODE_ENV=production なので AUTH_DEV_LOGIN を無視します');
const auth = new Auth({
  misskeyOrigin: (process.env.MISSKEY_URL || 'https://misskey.resonite.love').replace(/\/$/, ''),
  devLogin: DEV_LOGIN,
  clientAddress: (req) => fantasyAccounts.clientAddress(req),
  onRenamed: (account) => {
    if (homeUsers().some((u) => u.id === account.id)) { updateHomeUser(account.id, { name: account.name }); broadcastUsers(); }
    if (account.kind !== 'guest') sendDirectory(account.id, account);
  },
});
setInterval(() => { void auth.sweep().catch((e) => console.error('auth sweep', e)); }, 3_600_000).unref();
const fantasyDiagnostics = new FantasyDiagnostics({directory:path.join(DATA_DIR,'fantasy-diagnostics'),
  captureMode:process.env.FANTASY_DIAGNOSTICS_DIALOGUE_MODE==='off'?'off':process.env.FANTASY_DIAGNOSTICS_DIALOGUE_MODE==='issues'?'issues':'all',
  maxTextChars:4000,retentionDays:Number(process.env.FANTASY_DIAGNOSTICS_RETENTION_DAYS),maxTotalBytes:Number(process.env.FANTASY_DIAGNOSTICS_MAX_TOTAL_BYTES),
  maxFileBytes:Number(process.env.FANTASY_DIAGNOSTICS_MAX_FILE_BYTES),maxQueueSize:Number(process.env.FANTASY_DIAGNOSTICS_MAX_QUEUE)});
const fantasyPlayObserver = new FantasyPlayObserver(fantasyDiagnostics);
const fantasyDialogueObserver = new FantasyDialogueObserver(fantasyDiagnostics);
const fantasyReplyErrors = new WeakMap<WebSocket,string>();
const sharedAssets = new SharedService(DATA_DIR);
const systems = new SystemService(DATA_DIR, ROOT);
const timedCameras = new TimedCameraItems(systems);
for (const error of systems.startupErrors) console.error(error);
const contentConfig = contentTranslationConfig(process.env, DEV);
const contentMetadata = (() => {
  try { return readContentMetadata(ROOT); }
  catch { console.error('Content translation metadata is invalid; original text remains available.'); return { schema: 1 as const, glossary: {}, entries: {} }; }
})();
const contentTranslations = new ContentTranslationStore(path.join(DATA_DIR, 'content-translations'), contentConfig.translate, {
  glossary: contentMetadata.glossary, profile: contentConfig.profile,
});
try {
  void contentTranslations.register(collectContentDocuments(systems.catalog.current(), contentMetadata)).catch(() => {
    console.error('Content translation registration failed; original text remains available.');
  });
} catch { console.error('Content translation registration failed; original text remains available.'); }
const fantasyBackups = new FantasyBackups({ dataDirectory: DATA_DIR, files: fantasyBackupFiles(DATA_DIR) });
fantasyBackups.acquireRuntime();
const saveFantasyData = createFantasyBackupSave(fantasyBackups);
let fantasyClock: FantasyClock;
const fantasyStore = new FantasyStore(path.join(DATA_DIR, 'fantasy.json'), {
  save: saveFantasyData,
  combatEnabled: true,
  worldHour: () => fantasyClock.snapshot().hour,
  clockError: () => fantasyClock.error,
});
fantasyClock = new FantasyClock(path.join(DATA_DIR, 'fantasy-clock.json'), { save: saveFantasyData, initialHour: fantasyStore.maximumHour() });
const fantasyCommunity = new FantasyCommunity(path.join(DATA_DIR, 'fantasy-community.json'), { save: saveFantasyData });
const fantasyContracts = new FantasyContracts(path.join(DATA_DIR, 'fantasy-contracts.json'), { save: saveFantasyData, lookup: user => fantasyStore.loadError ? undefined : fantasyStore.profile(user) });
const fantasyAccounts = new FantasyAccounts({ file:path.join(DATA_DIR,'fantasy-accounts.json'),save:saveFantasyData,
  trustProxy:process.env.FANTASY_TRUST_PROXY==='1',
  trustedProxyAddresses:(process.env.FANTASY_TRUSTED_PROXY_IPS??'').split(',').map(value=>value.trim()).filter(Boolean),
  canClaimLegacy:(account,principal)=>{
    const current=fantasyStore.profile(account.principal);
    return !fantasyStore.loadError && principal.startsWith('fantasy:') && fantasyStore.hasProfile(principal)
      && !current.character && !current.pastLives?.length && !current.activity && !current.combatId;
  },
});
try { if(!fantasyStore.loadError&&!fantasyClock.error&&!fantasyAccounts.loadError)fantasyBackups.checkpoint('startup',true); }
catch(error){console.error('[fantasy-backup] startup snapshot failed',error);}
const fantasyParty = new FantasyParty({ lookup: id => {
  const user = users.get(id);
  return user && fantasyUserAuthorized(id) ? { id, name: user.name, session: user.session, world: user.session ? worldOf.get(user.session) : undefined, profile: fantasyStore.profile(id) } : undefined;
}, start: plans => fantasyStore.startGroupInvestigation(plans), startCombat: plans => fantasyStore.startCombat(plans),
  startTravel: plans => fantasyStore.startGroupTravel(plans),
  battle: (user, session) => fantasyStore.combat(user, session),
  joinCombat: (user, session, combat, confirm) => fantasyStore.joinCombat(user, session, combat, confirm),
  vault: party => fantasyStore.partyVault(party), vaultRequest: (party, user, command) => fantasyStore.partyVaultRequest(party, user, command),
  returnDeposits: (party, user) => {
    const result = fantasyStore.returnPartyDeposits(party, user);
    for (const update of result.updates) sendTo([update.user], { t: 'fantasyProfile', profile: update.profile });
    return result;
  },
});
function communityActor(user: User): CommunityActor {
  const profile = fantasyStore.profile(user.id);
  return { id: user.id, session: user.session, world: user.session ? worldOf.get(user.session) : undefined, character: profile.character ?? undefined, busy: !!profile.activity };
}
/** 2 人以上がこの時間以上いたセッションだけ、グループのチャンネルにまとめを残す */
const RECAP_MIN_MS = Number(process.env.RECAP_MIN_MINUTES ?? 10) * 60_000;
/** ユーザー由来のキー（ID・名前）を入れるレコードは prototype を持たせない。__proto__ 等も通常のキーとして扱い、Object.prototype を汚染させない */
function newRecord<T>(): Record<string, T> { return Object.create(null) as Record<string, T>; }
function nullRecord<T>(obj: Record<string, T>): Record<string, T> { return Object.assign(newRecord<T>(), obj); }
/** 続けて呼ばれてもまとめて 1 回にする（配信用。保存は db/persist.ts の debounced） */
function later(fn: () => void, ms: number) {
  let t: ReturnType<typeof setTimeout> | null = null;
  return () => { if (!t) t = setTimeout(() => { t = null; fn(); }, ms); };
}
/**
 * 人を名前で持っていた頃のデータは引き継がない。最初の起動で data/archive-<日時>/ へ移して残し、新しく空から始める
 * （印のファイルを置き、2 回目からは何もしない）。メディア・共有アセット/システム・翻訳は人に結び付かないのでそのまま
 */
function archiveNameKeyedData() {
  const mark = path.join(DATA_DIR, '.ids-v1');
  if (fs.existsSync(mark)) return;
  const names = ['home.json', 'people.json', 'messages.json', 'follows.json', 'friends.json', 'timeline.json', 'items.json', 'survivors.json',
    'market-likes.json', 'reports.log', 'icons', 'avatars', 'profiles', 'group-images', 'timeline-images'];
  const found = names.filter((n) => fs.existsSync(path.join(DATA_DIR, n)));
  if (found.length) {
    const dir = path.join(DATA_DIR, `archive-${new Date().toISOString().replace(/[:.]/g, '-')}`);
    fs.mkdirSync(dir, { recursive: true });
    for (const n of found) fs.renameSync(path.join(DATA_DIR, n), path.join(dir, n));
    console.log(`名前で持っていた古いデータを ${dir} へ移しました: ${found.join(' ')}`);
  }
  fs.mkdirSync(DATA_DIR, { recursive: true });
  fs.writeFileSync(mark, '');
}
archiveNameKeyedData();
/** 画像はストレージに置く。ディスクに置いていた頃の画像と動画は引き継がずに消す */
function removeLocalMedia() {
  const found = ['media', 'icons', 'avatars', 'group-images', 'timeline-images'].filter((n) => fs.existsSync(path.join(DATA_DIR, n)));
  for (const n of found) fs.rmSync(path.join(DATA_DIR, n), { recursive: true, force: true });
  if (found.length) console.log(`ストレージへ移る前の画像を消しました: ${found.join(' ')}`);
}
removeLocalMedia();

// 人とホームのデータは DB にある。起動時に全部読んでメモリに持ち、以後はメモリ側が正で、変わったら DB へ書く
try { await openDb(); }
catch (e) {
  // Drizzle は失敗したクエリで包むので、接続や認証の失敗は cause の方にある
  const err = e as Error & { cause?: Error };
  console.error('DB に接続できませんでした:', err.cause?.message ?? err.message);
  process.exit(1);
}
const storage = await openStorage(DATA_DIR);
const loaded = await loadPeopleAndHome();
const content = await loadContent();
const marketLikes = new MarketLikes(content.likes);
const survivorProfiles = nullRecord(Object.fromEntries((await listAppData<SurvivorProfile>('survivors.profile')).map((r) => [r.key, r.data])));
/** ゲストの進み具合は保存しない（端末を変えると別人になるため、ログインした人だけ残す） */
const guestIds = new Set<string>();
// 1 人分ずつの印は付けず、変わったら全員分を 1 回で書く（人数ぶんの行しかない）
const saveSurvivorProfiles = debounced('survivors', () => putAppData('survivors.profile',
  Object.entries(survivorProfiles).filter(([id]) => !guestIds.has(id)).map(([id, data]) => ({ key: id, accountId: id, data }))));
/** AD のセーブとランキングは AdStore（DATA_DIR/ad-access.json）。端末ごとのトークンと引き継ぎコードで、ログインのアカウントには結び付けない */
interface AdLeaderboardEntry { playerId: string; name: string; antimatterLog10: number; infinities: number; playTimeSec: number; dimensionalBoosts?: number }
function legacyAdScores(): AdLeaderboardEntry[] {
  try { return JSON.parse(fs.readFileSync(path.join(DATA_DIR, 'ad-leaderboard.json'), 'utf-8')) as AdLeaderboardEntry[]; } catch { return []; }
}
const adStore = new AdStore(path.join(DATA_DIR, 'ad-access.json'), Date.now, legacyAdScores());
function survivorCount(value: unknown, max: number) {
  return typeof value === 'number' && Number.isFinite(value)
    ? Math.min(max, Math.max(0, Math.floor(value)))
    : 0;
}
// 正規化（移行・返金・オブジェクト再構築）済みのプロフィール実体。再構築は冪等で、以降この実体に
// 起きる変更は購入・リセット・実績追加など値の変更だけなので、2 回目以降は再構築を省ける。
// 実体が差し替われば WeakSet に載っていないので、初回として再び正規化が走る。
// ただし加算で増える points / upgrades / upgradeSpent は、旧実装が毎回クランプしていたため、
// 高速パスでもこの3種のクランプだけは毎回行い、結果が旧実装と一致するようにする
const normalizedSurvivorProfiles = new WeakSet<SurvivorProfile>();
function survivorProfile(id: string): SurvivorProfile {
  const p = survivorProfiles[id] ??= newSurvivorProfile();
  if (normalizedSurvivorProfiles.has(p)) {
    p.points = survivorCount(p.points, Number.MAX_SAFE_INTEGER);
    for (const key of Object.keys(SURVIVOR_META_UPGRADES) as SurvivorMetaUpgrade[]) {
      p.upgrades[key] = survivorCount(p.upgrades[key], SURVIVOR_META_UPGRADES[key].max);
      const spent = p.upgradeSpent[key] as number | null | undefined;
      p.upgradeSpent[key] = spent == null
        ? survivorUpgradeRefund(key, p.upgrades[key])
        : survivorCount(spent, Number.MAX_SAFE_INTEGER);
    }
    return p;
  }
  p.points = survivorCount(p.points, Number.MAX_SAFE_INTEGER);
  const upgrades = p.upgrades as Record<string, unknown> | null | undefined;
  const version = survivorCount(p.upgradeVersion, SURVIVOR_PROFILE_VERSION);
  if (version < 2) {
    const legacyRefund = ['might', 'vitality', 'haste']
      .reduce((total, key) => total + survivorCount(upgrades?.[key], 10) * 2, 0);
    p.points = survivorCount(p.points + legacyRefund, Number.MAX_SAFE_INTEGER);
    p.upgrades = newSurvivorProfile().upgrades;
    p.upgradeSpent = newSurvivorProfile().upgradeSpent;
    p.upgradeVersion = SURVIVOR_PROFILE_VERSION;
    saveSurvivorProfiles();
  } else {
    p.upgrades = Object.fromEntries(Object.entries(SURVIVOR_META_UPGRADES)
      .map(([key, upgrade]) => [key, survivorCount(upgrades?.[key], upgrade.max)])) as SurvivorProfile['upgrades'];
    const normalized = p.upgrades;
    if (version === 2) {
      const oldCosts: Record<SurvivorMetaUpgrade, number> = { might: 2, rerolls: 4, vitality: 2, regeneration: 4, choiceCount: 100, synergySlots: 100, characters: 20 };
      p.upgradeSpent = Object.fromEntries(Object.keys(SURVIVOR_META_UPGRADES).map((key) => {
        const upgrade = key as SurvivorMetaUpgrade;
        return [upgrade, survivorUpgradeRefund(upgrade, normalized[upgrade], oldCosts[upgrade])];
      })) as SurvivorProfile['upgradeSpent'];
    } else {
      const spent = p.upgradeSpent as Record<string, unknown> | null | undefined;
      p.upgradeSpent = Object.fromEntries(Object.keys(SURVIVOR_META_UPGRADES).map((key) => {
        const upgrade = key as SurvivorMetaUpgrade;
        return [upgrade, spent?.[upgrade] == null
          ? survivorUpgradeRefund(upgrade, normalized[upgrade])
          : survivorCount(spent[upgrade], Number.MAX_SAFE_INTEGER)];
      })) as SurvivorProfile['upgradeSpent'];
    }
    if (version < SURVIVOR_PROFILE_VERSION) {
      p.upgradeVersion = SURVIVOR_PROFILE_VERSION;
      saveSurvivorProfiles();
    }
  }
  p.achievements ??= [];
  p.discovered ??= [];
  p.runs ??= 0; p.bestLevel ??= 0; p.bestKills ??= 0;
  normalizedSurvivorProfiles.add(p);
  return p;
}

/** アイコンとアバター。画像はストレージの icons/<ID>/<版>.jpg・avatars/<ID>/<版>.<拡張子>、キーと調整値は DB */
const accountImages = await loadAccountImages();
const NO_IMAGES: AccountImages = { icon: null, avatarImage: null, avatarParams: null, avatarVersion: null };
const imagesOf = (id: string) => accountImages.get(id) ?? NO_IMAGES;
const newVersion = () => randomUUID().slice(0, 8);
const removeObject = (key: string) => storage.delete(key).catch((e) => { console.error(`ストレージのオブジェクトを消せませんでした (${key}):`, e); });
/** 差し替えた後で、使わなくなった古いオブジェクトを消す（DB に書けてから消す） */
function setImages(id: string, patch: Partial<AccountImages>) {
  const before = imagesOf(id);
  const next = { ...before, ...patch };
  accountImages.set(id, next);
  const stale = [before.icon, before.avatarImage].filter((k): k is string => !!k && k !== next.icon && k !== next.avatarImage);
  enqueue('accountImages', async () => {
    await saveAccountImages(id, next);
    for (const k of stale) await removeObject(k);
  });
}
/** 添付画像（古い順）。合計が上限を超えたら古いものから、DB の記録とストレージのオブジェクトを消す */
const mediaFiles = await loadMediaFiles();
let mediaTotal = mediaFiles.reduce((n, f) => n + f.size, 0);
function addMedia(name: string, size: number) {
  mediaFiles.push({ name, size });
  mediaTotal += size;
  const gone: string[] = [];
  while (mediaTotal > MEDIA_TOTAL_MAX && mediaFiles.length > 1) {
    const f = mediaFiles.shift()!;
    mediaTotal -= f.size;
    gone.push(f.name);
  }
  enqueue('media', async () => {
    await addMediaFile(name, size);
    await removeMediaFiles(gone);
    for (const n of gone) await removeObject(`media/${n}`);
  });
}
/** 1 人が 1 時間に送れる添付画像。合計 1GB の上限をひとりで埋められないようにする（MEDIA_RATE_* はテスト用） */
const MEDIA_RATE = { files: Number(process.env.MEDIA_RATE_FILES) || 30, bytes: 100 * 1024 * 1024, windowMs: 60 * 60_000 };
const mediaUploads = new Map<string, { at: number; size: number }[]>();
function recentMediaUploads(id: string) {
  const now = Date.now();
  const recent = (mediaUploads.get(id) ?? []).filter((u) => now - u.at < MEDIA_RATE.windowMs);
  if (recent.length) mediaUploads.set(id, recent); else mediaUploads.delete(id);
  return recent;
}
/** 送り始める前に、1 枚の上限ぶんの枠をその場で押さえる（同時に送られても判定をまとめて通さない）。保存できたら実際の大きさに直す */
function reserveMediaUpload(id: string) {
  const recent = recentMediaUploads(id);
  if (recent.length >= MEDIA_RATE.files || recent.reduce((n, u) => n + u.size, 0) + IMAGE_MAX > MEDIA_RATE.bytes) return null;
  const slot = { at: Date.now(), size: IMAGE_MAX };
  mediaUploads.set(id, [...recent, slot]);
  return { done: (size: number) => { slot.size = size; }, cancel: () => { const list = mediaUploads.get(id); if (list) mediaUploads.set(id, list.filter((u) => u !== slot)); } };
}
/** 画像の中身はストレージから直接読ませる。版付きの URL は中身が変わらないので、転送ごと長くキャッシュさせる */
function redirectToObject(res: http.ServerResponse, key: string, immutable: boolean) {
  res.statusCode = 302;
  res.setHeader('Location', storage.url(key));
  res.setHeader('Cache-Control', immutable ? 'public, max-age=31536000, immutable' : 'no-cache');
  res.end();
}
/** 自己紹介（アカウント ID ごと）。ステータスと一緒に profiles 表へ書く */
const bios = loaded.bios;
const bioOf = (id: string) => bios.get(id) ?? '';
/** キー icons/<ID>/<版>.jpg の版 */
const iconVersion = (id: string) => imagesOf(id).icon?.split('/')[2]?.split('.')[0] ?? null;
const avatarVersion = (id: string) => imagesOf(id).avatarVersion;
const isJpeg = (b: Buffer) => b[0] === 0xff && b[1] === 0xd8;
const ICON_MAX_BYTES = 300_000;
const isPng = (b: Buffer) => b[0] === 0x89 && b[1] === 0x50 && b[2] === 0x4e && b[3] === 0x47;

async function readBody(req: http.IncomingMessage, limit: number) {
  const chunks: Buffer[] = [];
  let size = 0;
  for await (const c of req) {
    size += (c as Buffer).length;
    if (size > limit) return null;
    chunks.push(c as Buffer);
  }
  return Buffer.concat(chunks);
}

const SESSIONS_FILE = process.env.SESSIONS_FILE ?? path.join(ROOT, 'sessions.json');
const guild = JSON.parse(fs.readFileSync(SESSIONS_FILE, 'utf-8')) as GuildConfig;
const fixedSessionIds = new Set(guild.sessions.map((d) => d.id));
const EMPTY_SESSION_TTL_MS = 5 * 60 * 1000;
const emptySessionTimers = new Map<string, ReturnType<typeof setTimeout>>();
// 画面から作ったセッション・グループ・イベント。sessions.json のセッションの後ろに並べる
// renamed は sessions.json のセッションを画面から改名したときの名前（sessions.json は書き換えない）
const home: { sessions: SessionDef[]; groups: Group[]; events: EventDef[]; renamed: Record<string, string> } = { sessions: [], groups: [], events: [], renamed: {} };
Object.assign(home, loaded.home);
home.renamed = nullRecord(home.renamed);
for (const d of guild.sessions) d.name = home.renamed[d.id] ?? d.name;
const defaultChannels = () => [{ id: 'general', name: '雑談' }];
for (const g of home.groups) {
  if (!g.channels?.length) g.channels = defaultChannels();
  g.editors = [...new Set((g.editors ?? []).filter((n) => n !== g.owner && g.members.includes(n)))];
}
const canEditGroup = (g: Group, id: string) => g.owner === id || !!g.editors?.includes(id);
const groupImageKey = (g: Group, v: number) => `groups/${g.id}/${v}.jpg`;
for (const ev of home.events) { ev.maybe ??= []; ev.declined ??= []; }
guild.sessions.push(...home.sessions);
/** 開始から 30 日以上過ぎたイベントは残さない。当日のものや開始時刻が読めないものは消さない */
function pruneOldEvents() {
  home.events = pruneEvents(home.events, Date.now());
}
const eventsBeforePrune = home.events.length;
pruneOldEvents();
// 続けて変わってもまとめて 1 回だけ DB へ書く
const saveHome = debounced('home', () => writeHome(home));
if (home.events.length !== eventsBeforePrune) saveHome();
// 常駐中に 30 日を跨いだイベントも残り続けないよう、起動時・作成時だけでなく日次でも剪定する
setInterval(() => {
  const before = home.events.length;
  pruneOldEvents();
  if (home.events.length !== before) { saveHome(); broadcastEvents(); }
}, 24 * 60 * 60 * 1000);
const sessionIds = new Set(guild.sessions.map((w) => w.id));
const shortId = () => randomUUID().slice(0, 8);

// フォローはアカウント ID の組で保存する。お互いにフォローしているとフレンド
const follows = new Follows(loaded.follows);
const saveFollows = debounced('follows', () => writeFollows(follows.edges()));
const friendsOf = (id: string) => follows.friendsOf(id);
/** 付け外しを繰り返しても、同じ人からのフォロー通知はこの間に 1 回だけ */
const FOLLOW_NOTICE_MS = 60 * 60 * 1000;
const followNoticeAt = new Map<string, number>();

const users = new Map<string, Participant>();
const sockets = new Map<string, Set<WebSocket>>(); // 同じIDで複数タブを開ける
const homeConnections = new Map<WebSocket, HomeConnectionState>();
function fantasyDiagnosticError(error:unknown):string|undefined {
  return typeof error==='string'&&error?(/^[a-z][a-z0-9-]{0,63}$/u.test(error)?error:'game-rule'):undefined;
}
function observeFantasyOutgoing(ws:WebSocket,msg:ServerMsg,dialogueToken?:object):void {
  try{
    if(msg.t!=='npcReply'&&msg.t!=='fantasyGmReply'&&msg.t!=='fantasyProfile'&&msg.t!=='fantasyCombatState'&&!(msg.t.startsWith('fantasy')&&'error'in msg&&msg.error))return;
    const state=homeConnections.get(ws),actor=state?.id?users.get(state.id):undefined;
    if(!state)return;
    if('error'in msg&&msg.error)fantasyReplyErrors.set(ws,fantasyDiagnosticError(msg.error)??'game-rule');
    if(msg.t==='npcReply'||msg.t==='fantasyGmReply')fantasyDialogueObserver.reply(ws,{kind:msg.t==='npcReply'?'npc':'gm',requestId:msg.requestId,
      text:msg.t==='npcReply'?msg.text:msg.reply.text,route:msg.source,model:msg.model,errorCode:fantasyDiagnosticError(msg.error),
      currentActorId:ws.readyState===WebSocket.OPEN&&fantasySocketAuthorized(ws)?state.id:null,token:dialogueToken});
    if(!actor?.session||worldOf.get(actor.session)!=='fantasy'||!fantasySocketAuthorized(ws))return;
    if(msg.t==='fantasyProfile')fantasyPlayObserver.profile(actor.id,actor.session,msg.profile);
    if(msg.t==='fantasyCombatState')fantasyPlayObserver.combat(actor.id,actor.session,msg.state);
  }catch{/* 診断失敗で通信を止めない。 */}
}
const chats = new Map<string, ChatMessage[]>();
const avatars = new Map<string, Map<string, AvatarState>>();
const items = new Map<string, Map<string, Item>>();
const systemItemRooms = new Set<string>();
const broadcastMode = new Map<string, boolean>();
const lastAttention = new Map<string, number>();
const emoteUntil = new WeakMap<Participant, number>();
const worldOf = new Map<string, WorldKind>();
const thumbnails = new SessionThumbnails(
  (id, sid) => sendTo([id], { t: 'thumbnailRequest', sid }),
  () => broadcastSessionInfo(),
);
// アイテムはだれもいなくなっても残し、再起動しても戻す（盤面の続きをするため）
const savedItems = content.items;
/** 持っている人や編集中の人は再起動でいなくなるので外す */
function settle(it: Item) {
  if (it.kind === 'bike') Object.assign(it, releaseBike(it));
  const x = it as Item & { holder?: string | null; editingBy?: string | null; live?: boolean; operator?: string | null };
  if ('holder' in x) x.holder = null;
  if ('editingBy' in x) x.editingBy = null;
  if ('live' in x) { x.live = false; x.operator = null; }
  return it;
}
function registerSession(def: SessionDef) {
  thumbnails.register(def.id);
  sessionIds.add(def.id);
  worldOf.set(def.id, isWorldKind(def.world) ? def.world : 'room');
  chats.set(def.id, []);
  avatars.set(def.id, new Map());
  const saved = savedItems[def.id] ?? [];
  // なくした種類（動画など）のアイテムは戻さず、保存からも消す
  const known = saved.filter((it) => Object.hasOwn(ITEM_INFO, it.kind));
  items.set(def.id, new Map(known.map((it) => [it.id, settle(it)])));
  if (known.length !== saved.length) markItemsDirty(def.id);
}
/** アイテムが変わったセッションの印。保存は印があるときだけ文字列化する（無変更でも 5 秒ごとに全アイテムを文字列化していたのをやめる） */
const dirtyItemSessions = new Set<string>();
const markItemsDirty = (sid: string) => { dirtyItemSessions.add(sid); };
/** 終了時にも呼び、保留分を書き込みの列に積む */
function saveItems() {
  if (!dirtyItemSessions.size) return;
  const sids = [...dirtyItemSessions];
  dirtyItemSessions.clear();
  const bySession = Object.fromEntries(sids.map((sid) => [sid, [...(items.get(sid)?.values() ?? [])]]));
  // 失敗したら印を戻し、次の 5 秒でもう一度書く
  enqueue('items', () => writeItems(bySession), () => { for (const sid of sids) dirtyItemSessions.add(sid); });
}
setInterval(saveItems, 5000);

const people: Record<string, PersonRec> = loaded.people;
const savePeople = debounced('people', () => writePeople(people, bios));
function personRec(id: string) {
  return (people[id] ??= { status: 'online', statusText: '', recent: [], lastSeen: null, watchers: [] });
}

/** convs は会話ごとのメッセージ、reads は アカウント ID → 会話 → 読んだ時刻 */
const inbox = { convs: loaded.convs, reads: loaded.reads };
/** 変わった会話と、既読が変わった人。保存のときはその分だけ書く（中身を書き換えたら必ず印を付けること） */
const dirtyConvs = new Set<string>();
const dirtyReads = new Set<string>();
const saveInbox = debounced('inbox', async () => {
  const convs = [...dirtyConvs], readers = [...dirtyReads];
  dirtyConvs.clear();
  dirtyReads.clear();
  try {
    if (convs.length) await saveConversations(inbox.convs, convs);
    if (readers.length) await saveReads(inbox.reads, readers);
  } catch (e) {
    // 書き直しのときに同じ会話・人をもう一度書くため、印を戻す
    for (const c of convs) dirtyConvs.add(c);
    for (const r of readers) dirtyReads.add(r);
    throw e;
  }
});

/** セッションにだれかが入ってから全員が出るまで。終わったらまとめにする */
const visits = new Map<string, { from: number; people: Map<string, string>; log: Recap['log'] }>();
for (const w of guild.sessions) {
  registerSession(w);
  scheduleEmptyCheck(w.id);
}
// sessions.json から外したセッションなどのアイテムは、次の保存で DB から消す
for (const sid of Object.keys(savedItems)) if (!sessionIds.has(sid)) markItemsDirty(sid);
// 配信のたびにフレンド全走査と全ユーザー配列化を人数分繰り返さないよう、1 回の配信で使い回す写し
interface UserSnapshot { all: Participant[]; friendsById: Map<string, string[]> }
function snapshotUsers(): UserSnapshot {
  return { all: homeUsers(), friendsById: follows.friendMap() };
}
// 写しが渡されたとき（配信の一括計算）だけそれを使い、単発呼び出しでは全体の写しを作らない。
// friendsOf と friendsById は同じ follows から求めるので、対象者の集合は写し経由と一致する
const sessionsVisibleTo = (id: string, snap?: UserSnapshot) => {
  const friends = snap ? snap.friendsById.get(id) ?? [] : friendsOf(id);
  const all = snap ? snap.all : homeUsers();
  return guild.sessions.filter((d) => canSeeSession(d, id, friends, home.groups, all));
};
const broadcastSessions = () => { const snap = snapshotUsers(); for (const [ws, state] of homeConnections) { const user = homeUser(state); if (user) send(ws, { t: 'sessions', list: sessionsVisibleTo(user.id, snap) }); } };
const broadcastGroups = () => broadcast({ t: 'groups', list: home.groups });
const broadcastEvents = () => broadcast({ t: 'events', list: home.events });

function send(ws: WebSocket, msg: ServerMsg,dialogueToken?:object) {
  observeFantasyOutgoing(ws,msg,dialogueToken);
  if (fantasyPrivatePacket(msg) && !fantasySocketAuthorized(ws)) return;
  if (ws.readyState === WebSocket.OPEN) ws.send(JSON.stringify(msg));
}
function fantasyPrivatePacket(msg:ServerMsg):boolean {
  return msg.t==='communityState'||msg.t.startsWith('fantasy')&&!['fantasyClock','fantasyTestMode','fantasyAccountState'].includes(msg.t);
}
function broadcast(msg: ServerMsg, except?: WebSocket) {
  const data = JSON.stringify(msg);
  for (const set of sockets.values())
    for (const ws of set) if (ws !== except && ws.readyState === WebSocket.OPEN && (!fantasyPrivatePacket(msg)||fantasySocketAuthorized(ws))) {observeFantasyOutgoing(ws,msg);ws.send(data);}
}
function sendTo(ids: Iterable<string>, msg: ServerMsg) {
  const data = JSON.stringify(msg), targets=new Set(ids), delivered=new Set<WebSocket>();
  const deliver=(ws:WebSocket)=>{if(!delivered.has(ws)&&ws.readyState===WebSocket.OPEN&&(!fantasyPrivatePacket(msg)||fantasySocketAuthorized(ws))){delivered.add(ws);observeFantasyOutgoing(ws,msg);ws.send(data);}};
  for(const id of targets)for(const ws of sockets.get(id)??[])deliver(ws);
  if(!fantasyPrivatePacket(msg))for(const [ws,state]of homeConnections)if(state.homeId&&targets.has(state.homeId))deliver(ws);
}

const reportedFantasyHunts = new Map<string, string>();
const fantasyWorldPublished = new Map<string, number>();
function contractActor(user: User): FantasyContractActor {
  return { id: user.id, session: user.session, world: user.session ? worldOf.get(user.session) : undefined, character: fantasyStore.profile(user.id).character ?? undefined };
}
function fantasyRealmContext(user: User) {
  const session = user.session ?? '', def = guild.sessions.find(d => d.id === session);
  return { session, publicSession: !!session && (!def?.visibility || def.visibility === 'public'), peers: [...users.values()].filter(peer => fantasyUserAuthorized(peer.id)&&peer.session === session && !!session && worldOf.get(session) === 'fantasy').map(peer => peer.id) };
}
function fantasyMarketQuote(user: User, action: import('../shared/fantasy.ts').FantasyAction, locale: 'ko'|'en'|'ja') {
  if (action.type !== 'buy' && action.type !== 'sell') return undefined;
  const economy = fantasyStore.realmState(user.id, fantasyRealmContext(user)).economy;
  for (const shop of economy.shops) {
    const lot = action.type === 'buy' ? shop.lots.find(lot => lot.item === action.item && lot.count > 0) : shop.sales.find(lot => lot.item === action.item && lot.canSell && (!action.instance || lot.instance === action.instance) && (!action.quality || lot.quality === action.quality));
    if (lot) return { text: String(lot.unitPrice)+' G · '+({ko:'즉시',en:'Immediate',ja:'即時'}[locale]), key: JSON.stringify([shop.building, shop.revision, lot.unitPrice, 'id' in lot ? lot.id : lot.key]) };
  }
  return { text: {ko:'지금은 거래할 수 없는 물건입니다.',en:'This item cannot be traded now.',ja:'今は取引できない品物です。'}[locale], key: 'unavailable' };
}
function fantasyDialogueFacts(user: User, locale: 'ko'|'en'|'ja'): DialogueDynamicContext | undefined {
  const profile = fantasyStore.profile(user.id), location = profile.character?.location;
  if (!location) return undefined;
  const realm = fantasyStore.realmState(user.id, fantasyRealmContext(user));
  return { hour: realm.civic.hour, location, shops: realm.economy.shops,
    rumors: realm.civic.notices.filter(note => note.location === location && Math.floor(note.hour / 24) === Math.floor(realm.civic.hour / 24) && note.hour <= realm.civic.hour).map(note => ({hour:note.hour,text:note.text[locale]})), activity: profile.activity };
}
function publishFantasyRealms() {
  for (const user of users.values()) if (fantasyUserAuthorized(user.id)&&user.session && worldOf.get(user.session) === 'fantasy') sendTo([user.id], { t: 'fantasyRealmState', state: fantasyStore.realmState(user.id, fantasyRealmContext(user)) });
}
const fantasyPartyPublished = new Map<string, string>();
const fantasyCombatPublished = new Map<string, string>();
function publishFantasyCombats() {
  for (const user of users.values()) {
    if(!fantasyUserAuthorized(user.id))continue;
    const state = user.session && worldOf.get(user.session) === 'fantasy' ? fantasyStore.combat(user.id, user.session) : null;
    const signature = JSON.stringify(state);
    if (!state && !fantasyCombatPublished.has(user.id) || fantasyCombatPublished.get(user.id) === signature) continue;
    fantasyCombatPublished.set(user.id, signature); sendTo([user.id], { t: 'fantasyCombatState', state });
  }
}
function publishFantasyParties() {
  fantasyParty.sweep();
  for (const user of users.values()) {
    if(!fantasyUserAuthorized(user.id))continue;
    const state = fantasyParty.state(user.id), signature = JSON.stringify(state);
    if (fantasyPartyPublished.get(user.id) === signature) continue;
    fantasyPartyPublished.set(user.id, signature); sendTo([user.id], { t: 'fantasyPartyState', state });
  }
}
function applyFantasyUserAction(actor: FantasyContractActor, revision: unknown, action: unknown, options: Parameters<typeof handleFantasyAction>[4] = {}) {
  const started=performance.now(),before=fantasyStore.profile(actor.id),result=applyFantasyUserActionCore(actor,revision,action,options);
  if(actor.world==='fantasy')fantasyDiagnostics.record({type:'game.action',actorId:actor.id,sessionId:actor.session??undefined,action:isFantasyAction(action)?action.type:'invalid',
    status:result.error?'rejected':'ok',errorCode:result.error?(before.revision!==revision?'stale':'game-rule'):undefined,revision:result.profile.revision,
    expectedRevision:typeof revision==='number'?revision:undefined,generation:result.profile.generation??1,location:result.profile.character?.location,durationMs:performance.now()-started});
  return result;
}
function applyFantasyUserActionCore(actor: FantasyContractActor, revision: unknown, action: unknown, options: Parameters<typeof handleFantasyAction>[4] = {}) {
  const current = fantasyStore.profile(actor.id);
  if (actor.session && actor.world === 'fantasy' && current.character?.combatStoryVersion === 1 && isFantasyAction(action)) {
    const fight = action.type === 'hunt' ? { source: 'hunt' as const, target: action.monster ?? fantasyCombatHuntOptions(current.character)[0]?.id }
      : action.type === 'event' && action.choice === 'fight' && current.event && fantasyHostileEncounter(current.event) ? { source: 'encounter' as const, target: current.event } : undefined;
    if (fight?.target) {
      if (current.revision !== revision) return fantasyStore.reject(actor.id, '別の画面で記録が更新されました。最新の状態で選び直してください。');
      const combat = fantasyStore.startCombat([{ user: actor.id, session: actor.session, location: current.character.location, generation: current.generation ?? 1, source: fight.source, target: fight.target }]);
      if (combat.updates.length) { fantasyParty.invalidate(actor.id); publishFantasyParties(); publishFantasyCombats(); }
      return { profile: fantasyStore.profile(actor.id), changed: combat.updates.length > 0, ...(combat.error ? { error: combat.error } : {}) };
    }
  }
  const result = handleFantasyAction(fantasyStore, actor, revision, action, options);
  if (result.changed && (action as { type?: string })?.type !== 'sync') { fantasyParty.invalidate(actor.id); publishFantasyParties(); }
  return result;
}
function publishFantasyWorld(user: User, periodic = false) {
  if(!fantasyUserAuthorized(user.id))return;
  const profile = fantasyStore.profile(user.id);
  const hunt = profile.character?.lastHunt;
  const receipt = hunt ? `${user.id}:${profile.generation ?? 1}:${hunt.hour}:${hunt.id}` : '';
  const prior = reportedFantasyHunts.get(user.id);
  reportedFantasyHunts.set(user.id, receipt);
  if (prior !== receipt && hunt?.success) fantasyContracts.recordHunt({ ...contractActor(user), character: { ...profile.character!, location: hunt.location } }, 1, hunt.hour, receipt, hunt.id);
  if (profile.death) for (const grant of Object.values(profile.character?.contracts ?? {})) fantasyContracts.release(user.id, grant.offerId);
  const progress = fantasyStore.synchronizeContractProgress(user.id, offer => fantasyContracts.progress(user.id, offer));
  if (progress.changed) sendTo([user.id], { t: 'fantasyProfile', profile: progress.profile });
  if (periodic && !progress.changed && Date.now() - (fantasyWorldPublished.get(user.id) ?? 0) < 5000) return;
  fantasyWorldPublished.set(user.id, Date.now());
  sendTo([user.id], { t: 'fantasyLegacies', records: fantasyStore.legacies(user.id) });
  sendTo([user.id], { t: 'fantasyContractBoard', board: fantasyContracts.state(contractActor(user), fantasyClock.snapshot().hour), error: fantasyContracts.error ? 'unavailable' : undefined });
}

setInterval(() => {
  for(const [ws,state]of homeConnections)if(state.accountBinding&&!fantasyAccounts.bindingCurrent(state.accountBinding))unbindFantasyAccount(ws,state,'unauthenticated');
  fantasyClock.checkpoint();
  const online = new Set([...users.values()].filter(user => fantasyUserAuthorized(user.id)&&user.session && worldOf.get(user.session) === 'fantasy').map(user => user.id));
  for (const update of fantasyStore.tick(online)) {
    fantasyPlayObserver.profile(update.user,users.get(update.user)?.session??null,update.profile);
    sendTo([update.user], { t: 'fantasyProfile', profile: update.profile, error: update.error });
    const user = users.get(update.user);
    if (user) sendTo([user.id], { t: 'communityState', state: fantasyCommunity.state(communityActor(user)) });
  }
  for (const user of users.values()) if (fantasyUserAuthorized(user.id)&&user.session && worldOf.get(user.session) === 'fantasy') publishFantasyWorld(user, true);
  const clock = fantasyClock.snapshot();
  sendTo(users.keys(), { t: 'fantasyClock', clock });
  publishFantasyParties();
  publishFantasyCombats();
}, 1000);
setInterval(()=>{try{fantasyBackups.checkpoint('periodic');}catch(error){console.error('[fantasy-backup] periodic snapshot failed',error);}},300_000).unref();
const isOnline = (id: string) => homeUsers().some((u) => u.id === id);

/**
 * ログインした人（ゲスト以外）の名簿。フォロー・DM・グループなど人に残るものはアカウント ID で持つので、
 * オフラインの人の名前とアイコンはここから引いてもらう（起動時に DB から読み、変わったら 1 人分ずつ配る）
 */
const directory = new Map<string, DirectoryEntry>();
const entryOf = (a: Pick<Account, 'id' | 'name' | 'username' | 'kind'>): DirectoryEntry => ({
  id: a.id, name: a.name, username: a.kind === 'misskey' ? a.username : null, icon: iconVersion(a.id), avatar: avatarVersion(a.id),
});
async function loadDirectory() {
  const rows = await db().select().from(accounts).where(ne(accounts.kind, 'guest'));
  for (const r of rows) directory.set(r.id, entryOf({ id: r.id, name: r.displayName, username: r.username, kind: r.kind }));
}
/** 1 人分を作り直して全員へ配る。account を渡さなければ今の名簿の名前のまま、アイコンとアバターだけ読み直す */
function sendDirectory(id: string, account?: Pick<Account, 'id' | 'name' | 'username' | 'kind'>) {
  const current = directory.get(id);
  const base = account ?? (current && { id, name: current.name, username: current.username, kind: 'misskey' as const });
  if (!base) return;
  const entry = entryOf(base);
  directory.set(id, entry);
  broadcast({ t: 'directory', list: [entry], full: false });
}

/** 会話に入っている人のアカウント ID。会話として成り立たなければ null */
function convMembers(conv: string): string[] | null {
  if (conv.startsWith('dm:')) {
    const pair = conv.slice(3).split(':');
    return pair.length === 2 && follows.isFriend(pair[0], pair[1]) ? pair : null;
  }
  const m = /^ch:([^:]+):([^:]+)$/.exec(conv);
  const g = m && home.groups.find((x) => x.id === m[1]);
  return g && g.channels.some((c) => c.id === m[2]) ? g.members : null;
}
function pushMessage(conv: string, m: Message) {
  const list = (inbox.convs[conv] ??= []);
  list.push(m);
  if (list.length > 300) list.shift();
  dirtyConvs.add(conv);
  saveInbox();
  sendTo(convMembers(conv) ?? [], { t: 'msg', conv, m });
}
/** 見える会話だけ、新しい方から 100 件ずつ。
 * 全会話を走査せず、その人の会話のキーだけを組み立てて引く。拾う条件は convMembers と一致する
 * （DM はフレンド同士の組だけ、チャンネルは入っているグループのものだけ）。
 * 常駐の参加者インデックスは持たない（フレンド追加やグループの出入り・削除のたびに同期が必要で、ずれると会話が消えるため） */
function convsOf(id: string) {
  const out: Record<string, Message[]> = {};
  const take = (conv: string) => { const list = inbox.convs[conv]; if (list) out[conv] = list.slice(-100); };
  for (const f of friendsOf(id)) take(dmKey(id, f));
  for (const g of home.groups) if (g.members.includes(id)) for (const c of g.channels) take(channelKey(g.id, c.id));
  return out;
}

/** フレンドと、同じグループの人 */
function knownPeopleOf(id: string, friendsById?: Map<string, string[]>) {
  // 写しが渡されたらそれだけを使う（無い人はフレンドなし）。friendsOf へ落とすと配信の人数分だけ全走査が戻ってしまう
  const set = new Set(friendsById ? friendsById.get(id) ?? [] : friendsOf(id));
  for (const g of home.groups) if (g.members.includes(id)) for (const m of g.members) set.add(m);
  set.delete(id);
  return [...set];
}
function personOf(id: string): Person {
  const r = personRec(id);
  return { id, status: r.status, statusText: r.statusText, lastSeen: isOnline(id) ? null : r.lastSeen };
}
const watchingOf = (id: string) => Object.entries(people).filter(([, r]) => r.watchers.includes(id)).map(([n]) => n);
function sendWatching(id: string) {
  sendTo([id], { t: 'watching', ids: watchingOf(id), recentStatus: personRec(id).recent });
}
function broadcastPeople() {
  const snap = snapshotUsers();
  for (const [ws, state] of homeConnections) { const user = homeUser(state); if (user) send(ws, { t: 'people', list: knownPeopleOf(user.id, snap.friendsById).map((n) => personOf(n)) }); }
}
function followsMsg(id: string, friendMap?: Map<string, string[]>): ServerMsg {
  return { t: 'follows', following: follows.following(id), followers: follows.followers(id), fof: follows.friendsOfFriends(id, friendMap) };
}
// フレンドのフレンドはだれかのフォロー 1 つで遠くの人まで変わるので、全員に送り直す
function broadcastFollows() {
  const map = follows.friendMap();
  for (const id of new Set(homeUsers().map((u) => u.id))) sendTo([id], followsMsg(id, map));
}

/** 変わったポスト。消えたポストは保存のときに全体と比べて消す */
const dirtyPosts = new Set<string>();
const saveTimeline = debounced('timeline', async () => {
  const ids = [...dirtyPosts];
  dirtyPosts.clear();
  try { await savePosts(timeline.posts, ids); }
  catch (e) { for (const id of ids) dirtyPosts.add(id); throw e; }
});
const timelineImageKey = (id: string) => `timeline/${id}.jpg`;
const timeline = new Timeline(content.posts, (id) => { void removeObject(timelineImageKey(id)); }, (id) => { if (id) dirtyPosts.add(id); saveTimeline(); });
timeline.sweepImages();
setInterval(() => {
  const gone = timeline.prune();
  if (gone.length) broadcast({ t: 'postsRemoved', ids: gone });
  timeline.sweepImages();
}, 60 * 60 * 1000);
/** 非公開のセッション名はポストに残さない（ポストは全員に配るため） */
const publicSessionName = (def: SessionDef) => ((def.visibility ?? 'public') === 'public' ? def.name : null);

function handleTimeline(me: User, msg: ClientMsg): boolean {
  switch (msg.t) {
    case 'postCreate': {
      if (!timeline.allow(`post:${me.id}`, POST_RATE)) return true;
      const here = me.session ? guild.sessions.find((d) => d.id === me.session) : undefined;
      const post = timeline.create(me.id, msg, {
        place: msg.withPlace && here ? { sid: here.id, name: publicSessionName(here), mode: me.mode } : null,
        session: (id) => {
          const def = guild.sessions.find((d) => d.id === id);
          return def && canSeeSession(def, me.id, friendsOf(me.id), home.groups, homeUsers()) ? { name: publicSessionName(def) } : null;
        },
      });
      if (!post) return true;
      broadcast({ t: 'post', p: post });
      const gone = timeline.prune();
      if (gone.length) broadcast({ t: 'postsRemoved', ids: gone });
      return true;
    }
    case 'postDelete': {
      const gone = timeline.remove(msg.id, me.id);
      if (gone.length) broadcast({ t: 'postsRemoved', ids: gone });
      return true;
    }
    case 'postReact':
    case 'postRepost': {
      const p: Post | null = msg.t === 'postReact' ? timeline.react(msg.id, me.id, msg.emoji, !!msg.on) : timeline.repost(msg.id, me.id, !!msg.on);
      if (p) broadcast({ t: 'post', p });
      return true;
    }
  }
  return false;
}

function finishVisit(sid: string) {
  const v = visits.get(sid);
  visits.delete(sid);
  const def = guild.sessions.find((d) => d.id === sid);
  const g = def && isGroupVisibility(def.visibility) ? home.groups.find((x) => x.id === def.group) : undefined;
  if (!v || !def || !g || v.people.size < 2 || Date.now() - v.from < RECAP_MIN_MS) return;
  const left = [...items.get(sid)!.values()].flatMap((it) => {
    const summary = itemSummary(it);
    return summary ? [{ id: it.id, kind: it.kind, summary, ...(it.kind === 'image' ? { image: it.url } : {}) }] : [];
  });
  const recap: Recap = { session: sid, sessionName: def.name, from: v.from, to: Date.now(), people: [...v.people].map(([id, name]) => ({ id, name })), items: left.slice(0, 6), log: v.log };
  pushMessage(channelKey(g.id, g.channels[0].id), { id: randomUUID(), from: '', at: Date.now(), text: '', recap });
}
/** 途中参加のスナップショットが重くならないよう、古い画像は捨てる */
const MAX_IMAGES = 40;

function chatMedia(m: ChatMedia | undefined): ChatMedia | undefined {
  if (!m || typeof m.url !== 'string' || !MEDIA_URL_RE.test(m.url)) return undefined;
  const size = (n: number) => Math.max(1, Math.min(10000, Math.round(Number(n) || 1)));
  return { kind: 'image', url: m.url, w: size(m.w), h: size(m.h) };
}

function pushChat(sid: string, from: User | null, text: string, opt: { scope?: ChatScope; image?: string; media?: ChatMedia; to?: string[]; about?: string; dice?: DiceRoll; clientRequestId?: string } = {}, peerEvent?: PeerOperation) {
  const list = chats.get(sid);
  if (!list) return;
  if (from && opt.clientRequestId) {
    const existing = list.find(m => m.from === from.id && m.clientRequestId === opt.clientRequestId);
    if (existing) { roomSend(sid, { t: 'chat', sid, m: existing }, [from.id]); return; }
  }
  const m: ChatMessage = {
    id: peerEvent?.id ?? randomUUID(), from: from?.id ?? null, fromName: from?.name ?? '', text, at: peerEvent?.at ?? Date.now(), scope: opt.scope ?? 'all',
    ...(opt.clientRequestId ? { clientRequestId: opt.clientRequestId } : {}),
    ...(opt.image ? { image: opt.image } : {}), ...(opt.media ? { media: opt.media } : {}), ...(opt.to ? { to: opt.to } : {}), ...(opt.about ? { about: opt.about } : {}), ...(opt.dice ? { dice: opt.dice } : {}),
  };
  list.push(m);
  if (list.length > 500) list.shift();
  const visit = visits.get(sid);
  if (visit && from && text && m.scope !== 'near' && visit.log.length < 200) visit.log.push({ id: from.id, name: from.name, text: text.slice(0, 300), at: m.at });
  if (opt.image) {
    const withImage = list.filter((x) => x.image);
    for (const old of withImage.slice(0, -MAX_IMAGES)) { delete old.image; old.text += '（画像は古いため省略）'; }
  }
  roomSend(sid, { t: 'chat', sid, m }, m.to);
}

const event = (sid: string, text: string, about?: string) => pushChat(sid, null, text, { about });

const lastRoll = new Map<string, number>();
/** 結果の表示順とシークレットの宛先はサーバーで確定する。 */
function rollDice(sid: string, me: User, it: Item & { kind: 'dice' }, sides: unknown, count: unknown, secret: boolean, proposed?: DiceRoll) {
  const n = Math.floor(Number(count));
  if (!isDieSides(sides) || !(n >= 1 && n <= DICE_MAX)) return;
  if (Date.now() - (lastRoll.get(me.id) ?? 0) < 600) return;
  lastRoll.set(me.id, Date.now());
  const results = Array.from({ length: n }, () => randomInt(1, sides + 1));
  const roll: DiceRoll = proposed ?? { id: randomUUID(), by: me.id, sides, count: n, results, secret, at: Date.now() };
  it.roll = secret ? { ...roll, results: null } : roll;
  it.updatedBy = me.id;
  sendItem(sid, it);
  setTimeout(() => {
    if (me.session !== sid) return;
    if (!secret) { pushChat(sid, me, '', { dice: roll }); return; }
    pushChat(sid, me, '', { dice: roll, to: [me.id] });
    const others = [...users.values()].filter((u) => u.session === sid && u.id !== me.id).map((u) => u.id);
    if (others.length) pushChat(sid, me, '', { dice: { ...roll, results: null }, to: others });
  }, ROLL_MS);
}

/** 声の範囲チャットの宛先：送信時点で VOICE_RANGE 以内にいる同じワールドの人 */
function nearIds(sid: string, me: User) {
  if (broadcastMode.get(sid)) return [...users.values()].filter((u) => u.session === sid).map((u) => u.id);
  const places = computePlaces([...users.values()].filter((u) => u.session === sid), (id) => avatars.get(sid)!.get(id));
  const p = places.get(me.id);
  if (!p) return [me.id];
  return [...places].filter(([, q]) => placeDistance(q, p) <= VOICE_RANGE).map(([id]) => id);
}

function dropFollowersOf(u: User) {
  let changed = false;
  for (const f of users.values())
    if (f.follow === u.id) { f.follow = null; changed = true; }
  return changed;
}

function releaseCameras(sid: string, u: User, at?: AvatarState) {
  for (const it of items.get(sid)!.values()) {
    if (it.kind !== 'camera') continue;
    let changed = false;
    if (it.holder === u.id) {
      it.holder = null;
      if (at) { it.x = at.x; it.z = at.z; it.ry = at.ry; }
      changed = true;
    }
    if (it.live && it.operator === u.id) { it.live = false; it.operator = null; changed = true; }
    if (changed) sendItem(sid, it);
  }
}
function releaseBikes(sid: string, id: string) {
  for (const it of items.get(sid)!.values()) {
    if (it.kind !== 'bike' || it.rider !== id) continue;
    Object.assign(it, releaseBike(it));
    sendItem(sid, it);
  }
}
/** 部屋の中だけの項目を落として、ホームにも配る形にする */
const publicUser = ({ micOn, follow, pos, viewing, viewLive, display, ...u }: Participant): User => u;
/**
 * presence の組み立て結果を参加者ごとに覚えておき、変わっていない人は使い回す。
 * pos / display / viewing はサーバー内でインプレースに書き換えられることが無く、常に新しい
 * オブジェクトへの代入で差し替わる（代入箇所は index.ts と spacing.ts のみ）ため、6 項目が
 * 全て一致すれば前回のオブジェクトをそのまま配っても pack 後の内容は完全一致する。
 */
const presenceCache = new WeakMap<Participant, Presence>();
function presenceOf(u: Participant): Presence {
  const prev = presenceCache.get(u);
  if (prev && prev.micOn === u.micOn && prev.follow === u.follow && prev.pos === u.pos
    && prev.viewing === u.viewing && prev.viewLive === u.viewLive && prev.display === u.display) return prev;
  const p: Presence = { micOn: u.micOn, follow: u.follow, pos: u.pos, viewing: u.viewing, viewLive: u.viewLive, display: u.display };
  presenceCache.set(u, p);
  return p;
}
const inSession = (sid: string) => [...users.values()].filter((u) => u.session === sid);
const othersIn = (sid: string, me: string) => inSession(sid).filter((u) => u.id !== me).map((u) => u.id);
function broadcastUsers() {
  for (const [ws, state] of homeConnections) if (state.id) send(ws, { t: 'users', list: usersForConnection(state) });
}
/** セッションの中の人の状態を、その部屋の全員に配り直す */
function sendPresence(sid: string) {
  const here = inSession(sid);
  refreshTelephones(sid);
  // 視点のライブは、ついてくる人がいなくなったら止める。
  // ついてくる人がいるかは全員分を先に集めておく（メンバーごとの some 走査だと O(N^2) になる）。
  // follow はこのループ中では変わらないため、先に集めても判定は従来と一致する
  const followed = new Set<string | null>(here.map((f) => f.follow));
  for (const u of here)
    if (u.viewLive && (u.mode !== '3d' || !followed.has(u.id))) u.viewLive = false;
  roomSend(sid, { t: 'presence', sid, all: Object.fromEntries(here.map((u) => [u.id, presenceOf(u)])) });
}
function sessionInfoOf(sid: string): SessionInfo {
  const list = [...(items.get(sid)?.values() ?? [])].flatMap((it) => {
    const summary = itemSummary(it);
    return summary ? [{ id: it.id, kind: it.kind, summary }] : [];
  });
  return { world: worldOf.get(sid) ?? 'room', items: list, thumbnail: thumbnails.thumbnail(sid) };
}
const allSessionInfo = () => Object.fromEntries([...sessionIds].map((sid) => [sid, sessionInfoOf(sid)]));
/** アイテムやワールドが変わったら、ホーム向けの軽い情報を全員に配り直す（続けて起きた変更はまとめる） */
const broadcastSessionInfo = later(() => broadcast({ t: 'sessionInfo', sessions: allSessionInfo() }), 300);
setInterval(() => {
  for (const sid of sessionIds) thumbnails.update(sid, inSession(sid));
}, 10_000);
function sendItem(sid: string, it: Item) {
  markItemsDirty(sid);
  if (it.kind === 'telephone') {
    const present = new Set(inSession(sid).map(u => u.id));
    for (const u of inSession(sid)) roomSend(sid, { t: 'item', sid, item: telephoneItemFor(it, u.id, present) }, [u.id]);
  } else roomSend(sid, { t: 'item', sid, item: it });
  broadcastSessionInfo();
}
function sendItemRemove(sid: string, id: string) {
  markItemsDirty(sid);
  roomSend(sid, { t: 'itemRemove', sid, id });
  broadcastSessionInfo();
}
function syncSystemItems(sid: string, createMissingNative = !systemItemRooms.has(sid), notify = true) {
  const current = items.get(sid);
  if (!current) return;
  const changes = reconcileSystemItems(current, systems.view(sid), { createMissingNative });
  for (const id of changes.removed) {
    const item = current.get(id);
    if (item) timedCameras.remove(sid, item);
    current.delete(id);
  }
  for (const item of changes.changed) {
    const previous = current.get(item.id);
    if (previous?.kind === 'camera' && previous.variant === 'camera-timer'
      && (item.kind !== 'camera' || item.variant !== 'camera-timer')) timedCameras.remove(sid, previous);
    current.set(item.id, item);
  }
  systemItemRooms.add(sid);
  if (!changes.changed.length && !changes.removed.length) return;
  markItemsDirty(sid);
  if (notify) {
    for (const id of changes.removed) sendItemRemove(sid, id);
    for (const item of changes.changed) sendItem(sid, item);
  }
}
/** 移動の配信は位置だけにし、アイテムごとに間引く。止まったときの最後の位置は必ず届ける */
const ITEM_MOVE_MS = 80;
const itemMoveSentAt = new Map<string, number>();
const itemMoveTimers = new Map<string, ReturnType<typeof setTimeout>>();
function broadcastItemMove(sid: string, it: Item) {
  markItemsDirty(sid);
  const key = `${sid}\0${it.id}`;
  const send = () => {
    itemMoveSentAt.set(key, Date.now());
    roomSend(sid, { t: 'itemMove', sid, id: it.id, x: it.x, z: it.z, ry: it.ry,
      ...(it.kind === 'image' ? mediaTransform(it) : {}) });
  };
  const wait = ITEM_MOVE_MS - (Date.now() - (itemMoveSentAt.get(key) ?? 0));
  if (wait <= 0) { send(); return; }
  if (itemMoveTimers.has(key)) return;
  itemMoveTimers.set(key, setTimeout(() => {
    itemMoveTimers.delete(key);
    if (items.get(sid)?.get(it.id) === it) send();
  }, wait));
}
const telephonePresence = new WeakMap<object, string>();
function refreshTelephones(sid: string) {
  const present = new Set(inSession(sid).map(u => u.id));
  const presenceKey = [...present].sort().join('\0');
  for (const it of items.get(sid)?.values() ?? []) {
    if (it.kind !== 'telephone' || isSystemControlledItem(it)) continue;
    const g = telephoneState(it);
    const progressed = tickTelephone(g, Date.now());
    const hostChanged = reconcileTelephoneHost(g, present, Math.random);
    const presenceChanged = telephonePresence.get(g) !== presenceKey;
    telephonePresence.set(g, presenceKey);
    if (progressed || hostChanged || presenceChanged) sendItem(sid, it);
  }
}
setInterval(() => { for (const sid of items.keys()) refreshTelephones(sid); }, 250);

function sendSessionSnapshot(sid: string, id: string) {
  syncSystemItems(sid);
  for (const item of timedCameras.tick(sid, items.get(sid)?.values() ?? [], inSession(sid).map(user => user.id))) sendItem(sid, item);
  refreshTelephones(sid);
  roomSendSnapshot(sid, id, {
    sid,
    sharedAssets: sharedAssets.view(sid, id),
    systems: systems.view(sid),
    chats: (chats.get(sid) ?? []).filter((m) => !m.to || m.to.includes(id)),
    avatars: Object.fromEntries(avatars.get(sid) ?? []),
    items: [...(items.get(sid)?.values() ?? [])].map(it => telephoneItemFor(it, id, new Set(inSession(sid).map(u => u.id)))),
    presence: Object.fromEntries(inSession(sid).map((u) => [u.id, presenceOf(u)])),
    broadcast: broadcastMode.get(sid) ?? false,
    world: worldOf.get(sid) ?? 'room',
    game: gameOf(sid),
    survivor: survivorOf(sid),
    elevator: elevatorOf(sid),
    now: Date.now(),
  });
}
const roomHandlers: RoomHandlers = {
  onMessage: (sid, from, msg, peerPositions, peerEvent) => {
    const me = users.get(from);
    if (!me || me.session !== sid) return;
    try { handleSession(me, sid, msg, peerPositions, peerEvent); }
    catch (e) { console.error('bad room message', e); }
  },
};
const modeLabel = (m: Mode) => (m === '3d' ? '3D' : '2D');
const clampRoom = (v: number) => Math.max(-ROOM_HALF + 0.5, Math.min(ROOM_HALF - 0.5, v));
/** クライアント由来の数値を有限数にする（NaN や Infinity が共有状態に残らないように） */
const finNum = (v: unknown) => { const n = Number(v); return Number.isFinite(n) ? n : 0; };
const solidsOf = (sid: string) => [...WORLDS[worldOf.get(sid) ?? 'room'].solids, ...sharedSolids(sharedAssets.view(sid, 'server'), sharedAssets.catalog.current()), ...systemSolids(systems.view(sid))];
/** 部屋（街なら街）の中に収め、家具にめり込んでいたら外へ出す。アイテムと 2D の人は地上にいる */
function placeIn(sid: string, x: number, z: number, r: number) {
  const world = worldOf.get(sid) ?? 'room';
  const extent = WORLDS[world].extent;
  const clamp = (v: number, axis: 'x' | 'z') => world === 'city' ? clampCity(v) : extent
    ? Math.max(axis === 'x' ? extent.minX : extent.minZ, Math.min(axis === 'x' ? extent.maxX : extent.maxZ, v))
    : clampRoom(v);
  // クライアント由来の NaN がそのまま保存・永続化されるのを防ぐ関所（有限でなければ 0 に倒してから収める）
  const p = pushOut(clamp(finNum(x), 'x'), clamp(finNum(z), 'z'), r, solidsOf(sid));
  return { x: clamp(p.x, 'x'), z: clamp(p.z, 'z') };
}
const clamp2d = (sid: string, p: AvatarState): AvatarState => ({ ...placeIn(sid, p.x, p.z, PERSON_R), ry: finNum(p.ry) });

/** 配信ディスプレイを本人の 1.3m 前の床に、本人の方へ向けて立てる */
function placeDisplay(sid: string, u: Participant, av: AvatarState) {
  const p = placeIn(sid, av.x - Math.sin(av.ry) * 1.3, av.z - Math.cos(av.ry) * 1.3, 0.3);
  u.display = { ...p, ry: av.ry };
}

const worldPending = new Set<string>();
/** ワールドごとに広さや家具が違うので、全員をスポーンエリアに戻す（3D の人は各自の手元で戻る） */
function switchWorld(sid: string, world: WorldKind, clear: boolean, byName: string) {
  worldPending.delete(sid);
  const previousWorld = worldOf.get(sid);
  worldOf.set(sid, world);
  resetGame(sid, gameDeps);
  const sessItems = items.get(sid)!;
  for (const u of inSession(sid)) releaseBikes(sid, u.id);
  if (clear) {
    for (const [id, item] of [...sessItems]) if (!isSystemControlledItem(item)) {
      timedCameras.remove(sid, item);
      sessItems.delete(id); sendItemRemove(sid, id);
    }
  } else {
    for (const it of sessItems.values()) {
      if (isSystemControlledItem(it)) continue;
      if ('holder' in it && it.holder) continue;
      const p = placeIn(sid, it.x, it.z, itemRadius(it) * 0.6);
      if (Math.abs(p.x - it.x) + Math.abs(p.z - it.z) < 1e-3) continue;
      Object.assign(it, p);
      sendItem(sid, it);
    }
  }
  for (const u of users.values()) {
    if (u.session !== sid) continue;
    u.pos = null;
    // 配信ディスプレイは、戻った先で次に位置が届いたときに立て直す
    u.display = null;
  }
  resetElevator(sid);
  if (previousWorld === 'fantasy' || world === 'fantasy') {
    synchronizeFantasyWorldConnections(sid);
    broadcastUsers();
    broadcastSessions();
  }
  roomSend(sid, { t: 'world', sid, world });
  roomSend(sid, { t: 'elevator', sid, elevator: elevatorOf(sid) });
  broadcastSessionInfo();
  sendPresence(sid);
  event(sid, `${byName} がワールドを「${WORLDS[world].name}」に切り替えました${clear ? '（アイテムはすべて片付けました）' : ''}`);
}

const gameDeps: GameDeps = {
  sendGame: (sid, game) => roomSend(sid, { t: 'game', sid, game }),
  sendTile: (sid, tile, at) => roomSend(sid, { t: 'gameTile', sid, tile, at }),
  event: (sid, text) => event(sid, text),
};
const survivorDeps: SurvivorDeps = {
  sendState: (sid, state) => roomSend(sid, { t: 'survivor', sid, state }),
  profile: survivorProfile,
  saveProfiles: saveSurvivorProfiles,
  users: (sid) => inSession(sid),
  avatars: (sid) => avatars.get(sid) ?? new Map(),
  profileUpdated: (id, profile) => sendTo([id], { t: 'survivorProfile', profile }),
};
setInterval(() => tickSurvivors(Date.now(), survivorDeps), SURVIVOR_TICK_MS);

function leaveSession(u: Participant) {
  emoteUntil.delete(u);
  revokeUserSync(u.id);
  const sid = u.session;
  if (!sid) return;
  eliminate(sid, u.id, gameDeps);
  removeSurvivor(sid, u.id, survivorDeps);
  const av = avatars.get(sid)!.get(u.id);
  if (avatars.get(sid)!.delete(u.id)) roomSend(sid, { t: 'avatarRemove', sid, id: u.id });
  for (const it of items.get(sid)!.values()) {
    if (it.kind === 'note' && it.editingBy === u.id) { it.editingBy = null; sendItem(sid, it); }
    if (it.kind === 'hammer' && it.holder === u.id) {
      it.holder = null;
      if (av) { it.x = av.x; it.z = av.z; }
      sendItem(sid, it);
    }
  }
  releaseCameras(sid, u, av);
  releaseBikes(sid, u.id);
  dropFollowersOf(u);
  u.follow = null;
  u.pos = null;
  u.session = null;
  fantasyParty.leave(u.id); publishFantasyParties();
  try {
    for (const item of timedCameras.leave(sid, u.id, items.get(sid)!.values())) sendItem(sid, item);
    const changed = systems.leave(sid, u.id);
    syncSystemItems(sid, false);
    if (changed) roomSend(sid, { t: 'systemState', sid, view: systems.view(sid) });
  }
  catch (error) { console.error('system departure cleanup', error); }
  refreshTelephones(sid);
  thumbnails.update(sid, inSession(sid));
  u.mode = '2d';
  u.micOn = false;
  u.sharing = false;
  u.viewing = [];
  u.viewLive = false;
  u.display = null;
  event(sid, `${u.name} が退出しました`);
  if (inSession(sid).length) sendPresence(sid);
  else {
    finishVisit(sid); sharedAssets.release(sid); systems.release(sid);
    timedCameras.release(sid, items.get(sid)!.values());
    void leaveRoom(sid); scheduleEmptyCheck(sid);
  }
}

/** ゲストはセッションで遊ぶことまで。人やアカウントに残るもの（投稿・フォロー・DM・作成・参加表明・いいね・ステータス）はログインが要る */
const LOGIN_ONLY = new Set<ClientMsg['t']>([
  'marketLike', 'followUser', 'postCreate', 'postDelete', 'postReact', 'postRepost',
  'sessionCreate', 'sessionDelete', 'groupCreate', 'groupUpdate', 'groupJoin', 'groupLeave', 'channelCreate', 'groupDelete',
  'msg', 'rsvp', 'setStatus', 'watch', 'askJoin', 'eventCreate', 'eventAttend', 'eventDelete', 'invite',
]);

/**
 * ホームの接続。id は今動いている人（fantasy の世界では fantasy のアカウントに替わる）、homeId はログインの本人（アカウント ID）。
 * フォローや DM など人とのやりとりは homeId の人で行う
 */
interface HomeConnectionState {
  id: string | null;
  account: Account | null;
  homeId?: string;
  homeUser?: Participant;
  accountBinding?: AccountBinding;
  syncRequest?: string;
  remoteAddress?: string;
  testModeSent?: boolean;
}
/** fantasy のアカウントで動いている間だけ、替わる前に写しておいた本人（state.homeUser）を使う。ふだんは今の本人（マイク・共有などが最新） */
function homeUser(state:HomeConnectionState):Participant|undefined {
  const active=state.id?users.get(state.id):undefined,id=state.homeId??state.id;
  const original=state.id&&state.id===id?active??state.homeUser:state.homeUser??active;
  return original&&id?{...original,id,session:active?.session??null,mode:active?.mode??original.mode}:undefined;
}
function homeUsers():Participant[]{
  const result=new Map<string,Participant>();
  for(const [ws,state]of homeConnections){if(ws.readyState!==WebSocket.OPEN)continue;const user=homeUser(state);if(user)result.set(user.id,user);}
  return[...result.values()];
}
function userForConnection(user: Participant, state: HomeConnectionState): User {
  const own = user.id === state.id ? homeUser(state) : undefined;
  return publicUser(own ? { ...user, name: own.name, icon: own.icon, avatar: own.avatar, bio: own.bio, status: own.status, statusText: own.statusText } : user);
}
function usersForConnection(state: HomeConnectionState): User[] {
  const active = state.id ? users.get(state.id) : undefined;
  const sid = active?.session && worldOf.get(active.session) === 'fantasy' ? active.session : undefined;
  const actors = sid ? inSession(sid) : [], actorIds = new Set(actors.map(user => user.id));
  // ホームの名前と招待先を残しつつ、同じ部屋の別名をアバターとして二重に数えない。
  const visible = new Map(homeUsers().map(user => [user.id, publicUser(sid && user.session === sid && !actorIds.has(user.id) ? { ...user, session: null } : user)]));
  for (const actor of actors) visible.set(actor.id, userForConnection(actor, state));
  return [...visible.values()];
}
function homeUserById(id:string):Participant|undefined {
  const visible=homeUsers(),direct=visible.find(user=>user.id===id);if(direct)return direct;
  const actor=users.get(id);if(!actor)return undefined;
  for(const [ws,state]of homeConnections)if(ws.readyState===WebSocket.OPEN&&state.id===id){const user=homeUser(state);if(user)return user;}
  return undefined;
}
/** ホームの本人と、その人が fantasy のアカウントで動いているときの姿の両方に反映する */
function updateHomeUser(id:string,fields:Partial<Participant>):void {
  for(const state of homeConnections.values())if(state.homeId===id){
    if(state.homeUser)Object.assign(state.homeUser,fields);
    const active=state.id?users.get(state.id):undefined;if(active)Object.assign(active,fields);
  }
  const user=users.get(id);if(user)Object.assign(user,fields);
}
function markHomeOffline(user:Participant|undefined):void {
  if(user&&!isOnline(user.id)){personRec(user.id).lastSeen=Date.now();savePeople();broadcastPeople();}
}

/**
 * テスト専用（NODE_ENV=test・TONARIUM_TEST_HELLO_ID=1・ループバックの接続）。ログインせずに hello の id と name を本人にする。
 * fantasy のテストは決まった ID（alice など）で保存データを用意してからつなぐため。DB にアカウントは作らない
 */
const testHelloEnabled=(state:HomeConnectionState)=>process.env.NODE_ENV==='test'&&process.env.TONARIUM_TEST_HELLO_ID==='1'
  &&/^(?:::1|127\.\d+\.\d+\.\d+|::ffff:127\.\d+\.\d+\.\d+)$/u.test(state.remoteAddress??'');
function testHelloAccount(state:HomeConnectionState,msg:ClientMsg):Account|null {
  if(!testHelloEnabled(state))return null;
  const {id,name}=msg as {id?:unknown;name?:unknown};
  if(typeof id!=='string'||!id||id.length>128||id.startsWith('fantasy:')||id==='__proto__'||typeof name!=='string'||(state.id&&state.id!==id))return null;
  return {id,kind:'dev',username:null,name:normalizeName(name)};
}
function fantasyAccountTestBypass(state:HomeConnectionState):boolean {
  return process.env.NODE_ENV==='test'&&process.env.FANTASY_ACCOUNT_TEST_BYPASS==='1'
    && /^(?:::1|127\.\d+\.\d+\.\d+|::ffff:127\.\d+\.\d+\.\d+)$/u.test(state.remoteAddress??'');
}
function fantasySocketAuthorized(ws:WebSocket):boolean {
  const state=homeConnections.get(ws);
  return !!state && (fantasyAccountTestBypass(state)||!!state.accountBinding&&fantasyAccounts.bindingCurrent(state.accountBinding)
    &&state.id===state.accountBinding.account.principal&&!!users.get(state.id)?.session&&worldOf.get(users.get(state.id)!.session!)==='fantasy');
}
function fantasyUserAuthorized(id:string):boolean { return [...sockets.get(id)??[]].some(fantasySocketAuthorized); }
function fantasyAccountSessionConflict(state: HomeConnectionState, sid: string): boolean {
  const binding = state.accountBinding;
  if (!binding || !fantasyAccounts.bindingCurrent(binding) || state.id === binding.account.principal) return false;
  const occupied = users.get(binding.account.principal)?.session;
  return !!occupied && occupied !== sid;
}
function fantasyAccountState(ws:WebSocket,state:HomeConnectionState,error?:string):void {
  const user=state.id?users.get(state.id):undefined;
  send(ws,{t:'fantasyAccountState',account:fantasySocketAuthorized(ws)?state.accountBinding?.account??null:null,homeId:state.homeId??state.id??'',activeId:state.id??'',...(user?{user:userForConnection(user,state)}:{}),...(error?{error}:{})});
}
function switchFantasyIdentity(ws:WebSocket,state:HomeConnectionState,target:string):Participant|undefined {
  const old=state.id&&users.get(state.id);if(!old)return undefined;
  if(old.id===target)return old;
  if(old.id===state.homeId)state.homeUser={...old,viewing:[...old.viewing]};
  let next=users.get(target);
  if(!next){const source=target===state.homeId?state.homeUser??old:old;next={...source,id:target,session:null,mode:'2d',follow:null,pos:null,micOn:false,sharing:false,viewing:[],viewLive:false,display:null};users.set(target,next);}
  else if(target.startsWith('fantasy:')&&![...sockets.get(target)??[]].some(fantasySocketAuthorized)){
    const source=state.homeUser??old;Object.assign(next,{name:source.name,icon:source.icon,avatar:source.avatar,bio:source.bio,status:source.status,statusText:source.statusText});
  }
  fantasyDialogueObserver.cancel(ws,'identity-changed');
  state.syncRequest=undefined;
  onClose(ws,old.id,true);state.id=target;
  if(!sockets.has(target))sockets.set(target,new Set());sockets.get(target)!.add(ws);
  return next;
}
function publishFantasyInitial(ws:WebSocket,state:HomeConnectionState,user:User):void {
  if(!fantasySocketAuthorized(ws))return;
  const synchronized=fantasyStore.synchronize(user.id);
  send(ws,{t:'fantasyProfile',profile:synchronized.profile,error:synchronized.error??fantasyStore.loadError??fantasyClock.error});
  send(ws,{t:'fantasyClock',clock:fantasyClock.snapshot()});
  send(ws,{t:'fantasyPartyState',state:fantasyParty.state(user.id)});
  send(ws,{t:'communityState',state:fantasyCommunity.state(communityActor(user))});
  publishFantasyWorld(user);publishFantasyRealms();
}
function synchronizeFantasyWorldConnections(sid: string): void {
  const connections = [...homeConnections].filter(([, state]) => !!state.id && users.get(state.id)?.session === sid);
  const enteringFantasy = worldOf.get(sid) === 'fantasy';
  const unavailable = new Set<WebSocket>();
  for (const [ws, state] of connections) {
    const current = state.id ? users.get(state.id) : undefined;
    if (!current || current.session !== sid) continue;
    const conflict = enteringFantasy && fantasyAccountSessionConflict(state, sid);
    if (conflict) unavailable.add(ws);
    const target = enteringFantasy && !conflict && !fantasyAccountTestBypass(state) && state.accountBinding && fantasyAccounts.bindingCurrent(state.accountBinding)
      ? state.accountBinding.account.principal : state.homeId ?? current.id;
    const user = current.id === target ? current : switchFantasyIdentity(ws, state, target);
    if (!user) continue;
    if (user.session && user.session !== sid) leaveSession(user);
    user.session = sid;
  }
  cancelEmptyCheck(sid);
  thumbnails.update(sid, inSession(sid));
  publishFantasyParties();
  for (const [ws, state] of connections) {
    const user = state.id ? users.get(state.id) : undefined;
    if (!user || user.session !== sid) continue;
    fantasyAccountState(ws, state, unavailable.has(ws) ? 'unavailable' : undefined);
    if (enteringFantasy) publishFantasyInitial(ws, state, user);
  }
}
function unbindFantasyAccount(ws:WebSocket,state:HomeConnectionState,error?:string):void {
  const current=state.id?users.get(state.id):undefined,sid=current?.session;
  state.accountBinding=undefined;
  if(state.homeId)switchFantasyIdentity(ws,state,state.homeId);
  const home=state.id?users.get(state.id):undefined;
  if(home&&sid&&worldOf.get(sid)==='fantasy'&&home.session!==sid){leaveSession(home);home.session=sid;}
  fantasyAccountState(ws,state,error);broadcastUsers();broadcastSessions();
}

const fantasyDiagnosticCommands=new Set(['fantasyAction','fantasyTestReset','fantasyRealmRequest','fantasyPropertyRequest','fantasyPartyRequest','fantasyCombatRequest','communityContribute','fantasyAccountBind','fantasyAccountUnbind','join','leave']);
function handle(ws:WebSocket,state:HomeConnectionState,msg:ClientMsg){
  const started=performance.now(),beforeId=state.id,beforeSession=beforeId?users.get(beforeId)?.session:null;
  const beforeWorld=beforeSession?worldOf.get(beforeSession):undefined;
  fantasyReplyErrors.delete(ws);let threw=false;
  try{return handleMessage(ws,state,msg);}catch(error){threw=true;throw error;}
  finally{
    try{if(msg&&fantasyDiagnosticCommands.has(msg.t)){
      const actor=state.id?users.get(state.id):undefined,afterWorld=actor?.session?worldOf.get(actor.session):undefined;
      if(beforeWorld==='fantasy'||afterWorld==='fantasy'){
        const owner=beforeWorld==='fantasy'?beforeId:state.id,errorCode=threw?'handler-failure':fantasyReplyErrors.get(ws);
        const profile=owner&&fantasyUserAuthorized(owner)?fantasyStore.profile(owner):undefined;
        fantasyDiagnostics.record({type:msg.t==='join'||msg.t==='leave'||msg.t.startsWith('fantasyAccount')?'connection':'game.command',actorId:owner??undefined,sessionId:beforeSession??actor?.session??undefined,
          operation:msg.t,action:msg.t==='fantasyAction'&&isFantasyAction(msg.action)?msg.action.type:undefined,status:errorCode?'rejected':'ok',errorCode,
          generation:profile?.generation,location:profile?.character?.location,revision:profile?.revision,worldHour:profile?.character?.hour,durationMs:performance.now()-started});
      }
    }}catch{/* 診断失敗で処理結果を変えない。 */}
  }
}
function handleMessage(ws: WebSocket, state: HomeConnectionState, msg: ClientMsg) {
  if (msg.t === 'hello') {
    // 互換性バージョンが違う（申告が無い旧クライアントを含む）と通信の約束事が食い違うので、状態を渡さず接続を断つ
    if (msg.compat !== COMPAT_VERSION) {
      send(ws, { t: 'incompatible', compat: COMPAT_VERSION });
      ws.close();
      return;
    }
    const account = state.account ?? testHelloAccount(state, msg);
    if (!account) { if (!testHelloEnabled(state)) ws.close(4401, 'login required'); return; }
    state.id = account.id;
    state.homeId = account.id;
    if (!state.testModeSent) {
      send(ws, { t: 'fantasyTestMode', enabled: fantasyTestToolsAllowed(process.env.FANTASY_TEST_TOOLS, state.remoteAddress) });
      state.testModeSent = true;
    }
    const name = account.name;
    if (account.kind === 'guest') guestIds.add(account.id);
    // 初めてログインした人は名簿に足して皆へ知らせる（フォローなどで ID から名前を引けるように）
    else if (!directory.has(account.id)) sendDirectory(account.id, account);
    void auth.touch(account.id).catch(() => {});
    const rec = personRec(account.id);
    const cameOnline = !isOnline(account.id);
    const lastSeen = rec.lastSeen;
    if (!users.has(account.id))
      users.set(account.id, {
        id: account.id, name, session: null, mode: '2d',
        micOn: false, sharing: false, follow: null, pos: null,
        icon: iconVersion(account.id), avatar: avatarVersion(account.id), bio: bioOf(account.id), status: rec.status, statusText: rec.statusText, guest: account.kind === 'guest', username: account.kind === 'misskey' ? account.username : null,
        viewing: [], viewLive: false, display: null,
      });
    if (!sockets.has(account.id)) sockets.set(account.id, new Set());
    sockets.get(account.id)!.add(ws);
    state.homeUser = { ...users.get(account.id)!, viewing: [...users.get(account.id)!.viewing] };
    send(ws, { t: 'directory', list: [...directory.values()], full: true });
    send(ws, {
      t: 'snapshot',
      s: {
        guild: { ...guild, sessions: sessionsVisibleTo(account.id) },
        users: usersForConnection(state),
        friends: friendsOf(account.id),
        groups: home.groups,
        events: home.events,
        sessions: allSessionInfo(),
        now: Date.now(),
        version: CLIENT_VERSION,
      },
    });
    send(ws, {
      t: 'inbox', convs: convsOf(account.id), reads: inbox.reads[account.id] ?? {}, people: knownPeopleOf(account.id).map((n) => personOf(n)),
      watching: watchingOf(account.id), lastSeen, recentStatus: rec.recent,
    });
    send(ws, { t: 'survivorProfile', profile: survivorProfile(account.id) });
    if (fantasyAccountTestBypass(state)) {
      const fantasy = fantasyStore.synchronize(account.id);
      if (fantasy.changed) sendTo([account.id], { t: 'fantasyProfile', profile: fantasy.profile });
      else send(ws, { t: 'fantasyProfile', profile: fantasy.profile, error: fantasy.error ?? fantasyStore.loadError ?? fantasyClock.error });
      send(ws, { t: 'fantasyPartyState', state: fantasyParty.state(account.id) });
      send(ws, { t: 'communityState', state: fantasyCommunity.state(communityActor(users.get(account.id)!)) });
      publishFantasyWorld(users.get(account.id)!);
    } else fantasyAccountState(ws, state);
    send(ws, { t: 'fantasyClock', clock: fantasyClock.snapshot() });
    send(ws, { t: 'marketLikes', ...marketLikes.snapshot(account.id) });
    send(ws, followsMsg(account.id));
    send(ws, { t: 'posts', list: timeline.posts });
    broadcastUsers();
    if (cameOnline) {
      // 来たら知らせる は 1 回きり
      const watchers = rec.watchers;
      rec.watchers = [];
      if (watchers.length) savePeople();
      for (const w of watchers) { sendTo([w], { t: 'online', from: account.id, fromName: name }); sendWatching(w); }
      broadcastPeople();
    }
    return;
  }
  const me = state.id ? users.get(state.id) : undefined;
  if (!me) return;
  if(msg.t==='fantasyAccountBind'){
    const binding=typeof msg.ticket==='string'?fantasyAccounts.consumeTicket(msg.ticket):undefined;
    if(!binding||!binding.account.principal.startsWith('fantasy:')){if(state.id?.startsWith('fantasy:'))unbindFantasyAccount(ws,state,'unauthenticated');else fantasyAccountState(ws,state,'unauthenticated');return;}
    const sid=me.session;state.accountBinding=binding;
    if(sid&&worldOf.get(sid)==='fantasy'){
      if(fantasyAccountSessionConflict(state,sid)){fantasyAccountState(ws,state,'unavailable');return;}
      const user=switchFantasyIdentity(ws,state,binding.account.principal);
      if(user){handle(ws,state,{t:'join',sid});if(!fantasySocketAuthorized(ws))unbindFantasyAccount(ws,state,'unauthenticated');else{broadcastUsers();broadcastSessions();}}
    }else fantasyAccountState(ws,state);
    return;
  }
  if(msg.t==='fantasyAccountUnbind'){unbindFantasyAccount(ws,state);return;}
  const worldRequest=msg.t.startsWith('fantasy')||msg.t==='communityContribute'||msg.t==='npcChat'&&!!me.session&&worldOf.get(me.session)==='fantasy';
  if(worldRequest&&!fantasySocketAuthorized(ws)){if(state.id?.startsWith('fantasy:'))unbindFantasyAccount(ws,state,'unauthenticated');else fantasyAccountState(ws,state,'unauthenticated');return;}
  if (msg.t === 'fantasyTestReset') {
    let result;
    const prior = fantasyStore.profile(me.id);
    if (!fantasyTestToolsAllowed(process.env.FANTASY_TEST_TOOLS, state.remoteAddress)) result = fantasyStore.reject(me.id, 'この接続では試験用の初期化を利用できません。');
    else if (!me.session || worldOf.get(me.session) !== 'fantasy') result = fantasyStore.reject(me.id, 'ファンタジー世界に参加してから初期化してください。');
    else if (msg.confirm !== 'RESET_LIFE' || Object.keys(msg).length !== 3) result = fantasyStore.reject(me.id, '初期化の確認が必要です。');
    else result = fantasyStore.testReset(me.id, msg.revision);
    if (result.changed) {
      fantasyParty.leave(me.id); publishFantasyParties();
      for (const grant of Object.values(prior.character?.contracts ?? {})) fantasyContracts.release(me.id, grant.offerId);
      fantasyConversationActions.clear(me.id);
      fantasyBargaining.clear(me.id);
      reportedFantasyHunts.delete(me.id);
      sendTo([me.id], { t: 'fantasyProfile', profile: result.profile });
      sendTo([me.id], { t: 'communityState', state: fantasyCommunity.state(communityActor(me)) });
      for (const user of users.values()) if (user.session && worldOf.get(user.session) === 'fantasy') publishFantasyWorld(user);
    } else send(ws, { t: 'fantasyProfile', profile: result.profile, error: result.error });
    return;
  }
  if (msg.t === 'npcChat') {
    const inFantasy=!!me.session&&worldOf.get(me.session)==='fantasy';
    if(inFantasy){const sync=fantasyStore.synchronize(me.id);if(sync.changed)sendTo([me.id],{t:'fantasyProfile',profile:sync.profile});}
    const profile=fantasyStore.profile(me.id),character=inFantasy?profile.character??undefined:undefined;
    const npcDynamicFacts=inFantasy&&['ko','en','ja'].includes(msg.locale)?fantasyDialogueFacts(me,msg.locale):undefined;
    const npcDiagnosticToken=inFantasy&&typeof msg.text==='string'&&typeof msg.requestId==='string'&&/^[a-zA-Z0-9_-]{1,80}$/u.test(msg.requestId)&&['ko','en','ja'].includes(msg.locale)&&NPC_PUBLIC.some(npc=>npc.id===msg.npcId)
      ?fantasyDialogueObserver.begin(ws,{actorId:me.id,sessionId:me.session,kind:'npc',requestId:msg.requestId,locale:msg.locale,npcId:msg.npcId,query:msg.text,
        generation:profile.generation??1,location:character?.location,profile,dynamicFacts:npcDynamicFacts}):undefined;
    const validDialogue=typeof msg.requestId==='string'&&/^[a-zA-Z0-9_-]{1,80}$/.test(msg.requestId)&&['ko','en','ja'].includes(msg.locale)&&typeof msg.text==='string'&&msg.text.length<=800&&NPC_PUBLIC.some(npc=>npc.id===msg.npcId&&npc.homeLocation===character?.location);
    if(inFantasy&&validDialogue&&(profile.activity||profile.combatId||fantasyStore.civicBlocked(me.id))){
      send(ws,{t:'npcReply',requestId:msg.requestId,npcId:msg.npcId,locale:msg.locale,text:{ko:'하던 일을 마친 뒤에 다시 이야기하자.',en:'Let us talk after you have finished what you are doing.',ja:'今の用事が終わってから、また話しましょう。'}[msg.locale],model:'',source:'canon',relationship:'familiar',error:'busy'},npcDiagnosticToken);return;
    }
    if(inFantasy&&validDialogue){
      const apply=(revision:number,action:import('../shared/fantasy.ts').FantasyAction)=>applyFantasyUserAction(contractActor(me),revision,action);
      const context={user:me.id,speaker:msg.npcId,locale:msg.locale,profile,marketQuote:(action:import('../shared/fantasy.ts').FantasyAction)=>fantasyMarketQuote(me,action,msg.locale),text:msg.text};
      const land = fantasyPropertyDialogue.chat({user:me.id,npc:msg.npcId,text:msg.text,locale:msg.locale,profile,state:fantasyStore.propertyState(me.id),requestId:msg.requestId},command=>{
        const result=fantasyStore.propertyRequest(me.id,command);for(const update of result.updates)sendTo([update.user],{t:'fantasyProfile',profile:update.profile});return result;
      },()=>fantasyStore.propertyState(me.id));
      if(land.handled){send(ws,{t:'npcReply',requestId:msg.requestId,npcId:msg.npcId,locale:msg.locale,text:land.text??'',model:'',source:'canon',relationship:'familiar'},npcDiagnosticToken);send(ws,{t:'fantasyPropertyState',state:fantasyStore.propertyState(me.id)});publishFantasyRealms();return;}
      const bargain=fantasyBargaining.chat({...context,npcId:msg.npcId},apply);
      const conversation=bargain.handled?bargain:fantasyConversationActions.confirm(context,apply);
      if(conversation.handled){
        if(conversation.result)sendTo([me.id],{t:'fantasyProfile',profile:conversation.result.profile,error:conversation.result.error});
        send(ws,{t:'npcReply',requestId:msg.requestId,npcId:msg.npcId,locale:msg.locale,text:conversation.result?.error?{ko:'지금은 그렇게 도와주기 어렵겠어. 준비가 되면 다시 이야기하자.',en:'I cannot arrange that just now. Let us talk again when you are ready.',ja:'今はそうするのは難しそうです。準備が整ってから話しましょう。'}[msg.locale]:conversation.text??'',model:'',source:'canon',relationship:'familiar'},npcDiagnosticToken);
        publishFantasyWorld(me);return;
      }
    }
    const npcConversationSession=me.session,npcConversationWorld=me.session?worldOf.get(me.session):undefined;
    const conversationCurrent=()=>{
      const current=fantasyStore.profile(me.id);
      return ws.readyState===WebSocket.OPEN&&(!inFantasy||fantasySocketAuthorized(ws))&&state.id===me.id&&current.revision===profile.revision&&(current.generation??1)===(profile.generation??1)&&current.character?.lifeStartedAt===profile.character?.lifeStartedAt&&current.character?.location===profile.character?.location&&users.get(me.id)?.session===npcConversationSession&&(npcConversationSession?worldOf.get(npcConversationSession):undefined)===npcConversationWorld;
    };
    void npcChat.chat(character?me.id+':life-'+(profile.generation??1):me.id, { requestId: msg.requestId, text: msg.text, reset: msg.reset, locale: msg.locale, npcId: msg.npcId }, {
      onProgress:inFantasy?text=>{if(conversationCurrent())send(ws,{t:'fantasyDialogueChunk',kind:'npc',requestId:msg.requestId,locale:msg.locale,npcId:msg.npcId,text});}:undefined,isCurrent:conversationCurrent,completedQuests: character?.completed ?? [], character,
      contractBoard:character&&NPC_PUBLIC.some(npc=>npc.id===msg.npcId&&npc.building==='guild')?fantasyContracts.state(contractActor(me),fantasyClock.snapshot().hour)??undefined:undefined,
      dynamicFacts:npcDynamicFacts,
      communityFacts: character ? [...fantasyCommunity.facts(communityActor(me), msg.locale), ...fantasyStore.legacyFacts(me.id, msg.locale), ...fantasyStore.realmFacts(me.id,msg.locale,msg.npcId)] : [],
    }).then(reply=>{
      let text=reply.text;
      const current=fantasyStore.profile(me.id);
      if(inFantasy&&validDialogue&&reply.source==='canon'&&reply.actions?.length&&current.revision===profile.revision&&(current.generation??1)===(profile.generation??1)){
        const proposal=fantasyConversationActions.propose({user:me.id,speaker:msg.npcId,locale:msg.locale,profile:current,marketQuote:action=>fantasyMarketQuote(me,action,msg.locale),query:msg.text},reply.actions.map(action=>({action,label:fantasyGmActivityName({...current,activity:{action,startedAt:character?.hour??0,endsAt:(character?.hour??0)+1,seed:0}},msg.locale)})));
        text=proposal.text;
      }
      send(ws,{t:'npcReply',...reply,text,actions:undefined},npcDiagnosticToken);
    },error=>{console.error('[npc] request failed',error);send(ws,{t:'npcReply',requestId:msg.requestId,text:'',model:'',npcId:'rin',locale:'en',relationship:'stranger',error:'unavailable'},npcDiagnosticToken);});
    return;
  }
  if (msg.t === 'communityContribute') {
    if (me.session && worldOf.get(me.session) === 'fantasy') {
      const synchronized = fantasyStore.synchronize(me.id);
      if (synchronized.changed) sendTo([me.id], { t: 'fantasyProfile', profile: synchronized.profile });
    }
    const result = fantasyCommunity.contribute(communityActor(me), { requestId: msg.requestId, revision: msg.revision, npcId: msg.npcId });
    if (result.error) send(ws, { t: 'communityState', ...result });
    else for (const user of users.values()) if (user.session && worldOf.get(user.session) === 'fantasy') sendTo([user.id], { t: 'communityState', state: fantasyCommunity.state(communityActor(user)) });
    return;
  }
  if (msg.t === 'fantasyContracts') { publishFantasyWorld(me); return; }
  if (msg.t === 'fantasyRealmRequest') {
    if (!me.session || worldOf.get(me.session) !== 'fantasy') { send(ws, { t: 'fantasyRealmState', state: null, error: 'unavailable' }); return; }
    const result = Object.keys(msg).length === 3 ? fantasyStore.realmRequest(me.id, { domain: msg.domain, command: msg.command }, fantasyRealmContext(me)) : { updates: [], error: 'invalid' };
    for (const update of result.updates) { sendTo([update.user], { t: 'fantasyProfile', profile: update.profile }); fantasyParty.invalidate(update.user); }
    publishFantasyRealms(); send(ws, { t: 'fantasyRealmState', state: fantasyStore.realmState(me.id, fantasyRealmContext(me)), ...(result.error ? { error: result.error } : {}) });
    publishFantasyParties(); publishFantasyRealms(); return;
  }
  if (msg.t === 'fantasyPropertyRequest') {
    if (!me.session || worldOf.get(me.session) !== 'fantasy') { send(ws, { t: 'fantasyPropertyState', state: null, error: 'unavailable' }); return; }
    const targetName = msg.command && typeof msg.command === 'object' && 'target' in msg.command ? String(msg.command.target) : undefined;
    const propertyTarget = targetName ? [...users.values()].find(peer => peer.session === me.session && (peer.id === targetName || fantasyStore.profile(peer.id).character?.name === targetName)) : undefined;
    if (targetName && (!propertyTarget || propertyTarget.session !== me.session)) { send(ws, { t: 'fantasyPropertyState', state: fantasyStore.propertyState(me.id), error: 'invalid' }); return; }
    const result = Object.keys(msg).length === 2 ? fantasyStore.propertyRequest(me.id, msg.command) : { updates: [], error: 'invalid' as const };
    for (const update of result.updates) {
      sendTo([update.user], { t: 'fantasyProfile', profile: update.profile }); fantasyParty.invalidate(update.user);
    }
    send(ws, { t: 'fantasyPropertyState', state: fantasyStore.propertyState(me.id), ...(result.error ? { error: result.error } : {}) });
    publishFantasyParties(); return;
  }
  if (msg.t === 'fantasyPartyRequest') {
    const result = Object.keys(msg).length === 2 ? fantasyParty.request(me.id, msg.command) : { error: 'invalid' as const };
    for (const update of result.updates ?? []) sendTo([update.user], { t: 'fantasyProfile', profile: update.profile });
    send(ws, { t: 'fantasyPartyState', state: fantasyParty.state(me.id), ...(result.error ? { error: result.error } : {}) });
    publishFantasyParties(); publishFantasyCombats(); return;
  }
  if (msg.t === 'fantasyCombatRequest') {
    if (!me.session || worldOf.get(me.session) !== 'fantasy') { send(ws, { t: 'fantasyCombatState', state: null, error: 'not-in-world' }); return; }
    const command: unknown = msg.command;
    const value = command && typeof command === 'object' && !Array.isArray(command) ? command as Record<string, unknown> : undefined;
    const keys = (...fields: string[]) => !!value && Object.keys(value).length === fields.length + 1 && fields.every(field => Object.hasOwn(value, field));
    const text = (value: unknown): value is string => typeof value === 'string' && value.length > 0 && value.length <= 160 && !/[\u0000-\u001f\u007f]/.test(value);
    let result: ReturnType<FantasyStore['startCombat']> = { updates: [], error: 'invalid' };
    if (Object.keys(msg).length === 2 && value?.type === 'sync' && keys()) result = { updates: [] };
    else if (Object.keys(msg).length === 2 && value?.type === 'inspect' && keys('target') && text(value.target)) result = fantasyStore.inspectCombat(me.id, value.target);
    else if (Object.keys(msg).length === 2 && value?.type === 'start' && (keys('source', 'target') || keys('source', 'target', 'confirm') && typeof value.confirm === 'boolean')
      && text(value.target) && ['hunt', 'story', 'encounter', 'apex', 'challenge', 'escort'].includes(String(value.source))) {
      const p = fantasyStore.profile(me.id);
      result = value.source === 'escort' ? fantasyStore.startEscortCombat(me.id,me.session,value.target) : p.character ? fantasyStore.startCombat([{ user: me.id, session: me.session, location: p.character.location, generation: p.generation ?? 1,
        source: value.source as 'hunt' | 'story' | 'encounter' | 'apex' | 'challenge', target: value.target, ...(value.confirm !== undefined ? { confirm: value.confirm as boolean } : {}) }]) : { updates: [], error: 'not-alive' };
    } else if (Object.keys(msg).length === 2 && value?.type === 'order' && keys('combatId', 'revision', 'order') && text(value.combatId) && Number.isSafeInteger(value.revision)) result = fantasyStore.combatOrder(me.id, me.session, value.combatId, value.revision, value.order as never);
    for (const update of result.updates) { sendTo([update.user], { t: 'fantasyProfile', profile: update.profile }); const actor = users.get(update.user); if (actor) publishFantasyWorld(actor); }
    if (result.updates.length) fantasyParty.invalidate(me.id);
    send(ws, { t: 'fantasyCombatState', state: fantasyStore.combat(me.id, me.session), ...(result.error ? { error: result.error } : {}) });
    publishFantasyParties(); publishFantasyCombats(); return;
  }
  if (msg.t === 'fantasyAction') {
    const previousRevision = fantasyStore.profile(me.id).revision;
    const actor = contractActor(me);
    let result;
    const questId = msg.action.type === 'accept' ? msg.action.quest : undefined;
    const quest = FANTASY_QUESTS.find(quest => quest.id === questId);
    if(msg.action.type==='haggle')result=fantasyStore.reject(me.id,'値段交渉は取引相手との会話で依頼してください。');
    else if (msg.action.type === 'accept' && quest && !fantasyPersonalQuest(quest)) {
      const claim = fantasyContracts.claim(actor, { quest: quest.id, offer: msg.action.offer ?? '' }, fantasyClock.snapshot().hour,
        grant => applyFantasyUserAction(actor, msg.revision, msg.action, { contract: grant }));
      result = claim.result ?? fantasyStore.reject(me.id, fantasyContractErrorText(claim.error ?? 'unavailable', 'ja'));
    } else {
      const prior = fantasyStore.profile(me.id);
      result = applyFantasyUserAction(actor, msg.revision, msg.action);
      if (result.changed && (msg.action.type === 'abandon' || msg.action.type === 'rebirth')) {
        for (const [id, grant] of Object.entries(prior.character?.contracts ?? {})) if (msg.action.type === 'rebirth' || id === msg.action.quest) fantasyContracts.release(me.id, grant.offerId);
      }
    }
    if (result.changed || result.profile.revision !== previousRevision) sendTo([me.id], { t: 'fantasyProfile', profile: result.profile });
    if (!result.changed) send(ws, { t: 'fantasyProfile', profile: result.profile, error: result.error });
    send(ws, { t: 'fantasyClock', clock: fantasyClock.snapshot() });
    sendTo([me.id], { t: 'communityState', state: fantasyCommunity.state(communityActor(me)) });
    for (const user of users.values()) if (user.session && worldOf.get(user.session) === 'fantasy') publishFantasyWorld(user);
    return;
  }
  if (msg.t === 'fantasyGmChat') {
    const world = me.session ? worldOf.get(me.session) : undefined;
    if (me.session && world === 'fantasy') {
      const synchronized = fantasyStore.synchronize(me.id);
      if (synchronized.changed) sendTo([me.id], { t: 'fantasyProfile', profile: synchronized.profile });
    }
    const profile=fantasyStore.profile(me.id);
    const gmDynamicFacts=me.session&&world==='fantasy'&&['ko','en','ja'].includes(msg.locale)?fantasyDialogueFacts(me,msg.locale):undefined;
    const gmDiagnosticToken=me.session&&world==='fantasy'&&typeof msg.text==='string'&&typeof msg.requestId==='string'&&/^[a-zA-Z0-9_-]{1,80}$/u.test(msg.requestId)&&['ko','en','ja'].includes(msg.locale)
      ?fantasyDialogueObserver.begin(ws,{actorId:me.id,sessionId:me.session,kind:'gm',requestId:msg.requestId,locale:msg.locale,query:msg.text,
        generation:profile.generation??1,location:profile.character?.location,profile,dynamicFacts:gmDynamicFacts}):undefined;
    const validDialogue=typeof msg.requestId==='string'&&/^[a-zA-Z0-9_-]{1,80}$/.test(msg.requestId)&&['ko','en','ja'].includes(msg.locale)&&typeof msg.text==='string'&&msg.text.length<=500;
    if(me.session&&world==='fantasy'&&validDialogue){
      const confirmed=fantasyConversationActions.confirm({user:me.id,speaker:'gm',locale:msg.locale,profile,marketQuote:action=>fantasyMarketQuote(me,action,msg.locale),text:msg.text},(revision,action)=>applyFantasyUserAction(contractActor(me),revision,action));
      if(confirmed.handled){
        if(confirmed.result)sendTo([me.id],{t:'fantasyProfile',profile:confirmed.result.profile,error:confirmed.result.error});
        send(ws,{t:'fantasyGmReply',requestId:msg.requestId,locale:msg.locale,source:'rules',reply:{text:confirmed.result?.error?{ko:'지금은 진행할 수 없습니다. 현재 상태를 확인해 주세요.',en:'This cannot be started now. Please check your current state.',ja:'今は開始できません。現在の状態を確認してください。'}[msg.locale]:confirmed.text??'',suggestions:[]}},gmDiagnosticToken);publishFantasyWorld(me);return;
      }
    }
    const conversationSession=me.session;
    const conversationCurrent=()=>{
      const current=fantasyStore.profile(me.id);
      return ws.readyState===WebSocket.OPEN&&fantasySocketAuthorized(ws)&&state.id===me.id&&current.revision===profile.revision&&(current.generation??1)===(profile.generation??1)&&current.character?.lifeStartedAt===profile.character?.lifeStartedAt&&current.character?.location===profile.character?.location&&users.get(me.id)?.session===conversationSession&&worldOf.get(conversationSession??'')===world;
    };
    void fantasyGmChat.chat(me.id+':life-'+(profile.generation??1), { requestId: msg.requestId, text: msg.text, locale: msg.locale }, { onProgress:text=>{if(conversationCurrent())send(ws,{t:'fantasyDialogueChunk',kind:'gm',requestId:msg.requestId,locale:msg.locale,text});},isCurrent:conversationCurrent,session: me.session, world, profile, dynamicFacts: gmDynamicFacts, communityFacts: [...fantasyCommunity.facts(communityActor(me), msg.locale), ...fantasyStore.legacyFacts(me.id, msg.locale), ...fantasyStore.realmFacts(me.id,msg.locale)] })
      .then(reply=>{
        const current=fantasyStore.profile(me.id);
        const actions=reply.reply.suggestions.flatMap(suggestion=>suggestion.action?[{action:suggestion.action,label:suggestion.label}]:[]);
        let text=reply.reply.text;
        if(me.session&&world==='fantasy'&&reply.source==='rules'&&actions.length&&current.revision===profile.revision&&(current.generation??1)===(profile.generation??1))text=fantasyConversationActions.propose({user:me.id,speaker:'gm',locale:msg.locale,profile:current,marketQuote:action=>fantasyMarketQuote(me,action,msg.locale),query:msg.text},actions).text;
        send(ws,{t:'fantasyGmReply',...reply,reply:{text,suggestions:[]}},gmDiagnosticToken);
      })
      .catch(error => {
        console.error('[fantasy-gm] request failed', error);
        send(ws, { t: 'fantasyGmReply', requestId: msg.requestId, locale: msg.locale, source: 'local', error: 'unavailable', reply: { text: '', suggestions: [] } },gmDiagnosticToken);
      });
    return;
  }
  // 人とのやりとりはログインの本人で行う（fantasy の世界では me が fantasy のアカウントになる）
  const original = homeUser(state) ?? me;
  if (original.guest && LOGIN_ONLY.has(msg.t)) { send(ws, { t: 'loginRequired' }); return; }
  if (msg.t === 'marketLike') {
    if (marketLikes.like(msg.product, original.id)) {
      enqueue('marketLike', () => addMarketLike(msg.product as string, original.id));
      for (const [socket, connection] of homeConnections) {
        const user = homeUser(connection);
        if (user) send(socket, { t: 'marketLikes', ...marketLikes.snapshot(user.id) });
      }
    } else send(ws, { t: 'marketLikes', ...marketLikes.snapshot(original.id) });
    return;
  }
  if (msg.t === 'profileUpdated') {
    updateHomeUser(original.id, { icon: iconVersion(original.id), avatar: avatarVersion(original.id), bio: bioOf(original.id) });
    broadcastUsers();
    if (!original.guest) sendDirectory(original.id);
    return;
  }
  if (msg.t === 'followUser') {
    const target = typeof msg.to === 'string' ? msg.to : '';
    // 名簿にいる人（ログインした人）だけ。ゲストや存在しない ID の辺を溜めない
    if (target === original.id || !directory.has(target)) return;
    const changed = msg.on ? follows.add(original.id, target) : follows.remove(original.id, target);
    if (!changed) return;
    saveFollows();
    const noticeKey = `${original.id}\u0000${target}`;
    if (msg.on && !(Date.now() - (followNoticeAt.get(noticeKey) ?? 0) < FOLLOW_NOTICE_MS)) {
      followNoticeAt.set(noticeKey, Date.now());
      sendTo([target], { t: 'followed', from: original.id, fromName: original.name });
    }
    for (const n of [original.id, target]) sendTo([n], { t: 'friends', ids: friendsOf(n) });
    broadcastFollows();
    broadcastSessions();
    broadcastPeople();
    return;
  }
  if (handleTimeline(original, msg)) return;
  if (handleHome(original, msg, ws)) return;
  const sid = me.session;

  switch (msg.t) {
    case 'thumbnailUpload':
      if (sid && sid === msg.sid) thumbnails.upload(sid, me.id, msg.thumbnail);
      else console.warn('[thumbnail] rejected upload outside session');
      return;
    case 'prepareSync': {
      if (!sid || typeof msg.requestId !== 'string') return;
      state.syncRequest = msg.requestId;
      const current = () => state.syncRequest === msg.requestId && me.session === sid;
      void createSyncGrant(sid, me.id, ws, roomHandlers, () => send(ws, { t: 'syncReset', sid }), current, msg.peerPositions === true, msg.peerDelivery === true).then(
        (config) => { if (current()) send(ws, { t: 'syncConfig', requestId: msg.requestId, config }); },
        () => { if (current()) send(ws, { t: 'syncError', requestId: msg.requestId, error: 'kokosync に接続できません。サーバー設定と接続先を確認してください' }); },
      );
      return;
    }
    case 'join': {
      const def = guild.sessions.find((d) => d.id === msg.sid);
      if (!def || !canSeeSession(def, original.id, friendsOf(original.id), home.groups, homeUsers())) {
        if (msg.requestId) send(ws, { t: 'sessionResult', requestId: msg.requestId, error: 'このセッションには参加できません' });
        return;
      }
      const enteringFantasy=worldOf.get(msg.sid)==='fantasy';
      if(enteringFantasy&&fantasyAccountSessionConflict(state,msg.sid)){
        fantasyAccountState(ws,state,'unavailable');
        if(msg.requestId)send(ws,{t:'sessionResult',requestId:msg.requestId,error:'このセッションには参加できません'});
        return;
      }
      let entering=me;
      if(enteringFantasy&&!fantasyAccountTestBypass(state)&&state.accountBinding&&fantasyAccounts.bindingCurrent(state.accountBinding))entering=switchFantasyIdentity(ws,state,state.accountBinding.account.principal)??me;
      else if(!enteringFantasy&&me.id.startsWith('fantasy:')){
        leaveSession(me);
        for(const [socket,connection]of [...homeConnections])if(connection.id===me.id&&connection.homeId){switchFantasyIdentity(socket,connection,connection.homeId);fantasyAccountState(socket,connection);}
        entering=users.get(state.id!)??me;
      }
      if(entering.session===msg.sid){if(enteringFantasy&&!fantasyAccountTestBypass(state)){fantasyAccountState(ws,state);publishFantasyInitial(ws,state,entering);}if(msg.requestId)send(ws,{t:'sessionResult',requestId:msg.requestId});return;}
      leaveSession(entering);
      entering.session = msg.sid;
      if(enteringFantasy&&!fantasyAccountTestBypass(state))fantasyAccountState(ws,state);
      publishFantasyParties();
      cancelEmptyCheck(msg.sid);
      entering.mode = '2d';
      thumbnails.update(msg.sid, inSession(msg.sid));
      const visit = visits.get(msg.sid) ?? { from: Date.now(), people: new Map<string, string>(), log: [] };
      visit.people.set(original.id, original.name);
      visits.set(msg.sid, visit);
      broadcastUsers(); sendPresence(msg.sid);
      event(msg.sid, `${entering.name} が入室しました`);
      if(enteringFantasy){if(!fantasyAccountTestBypass(state))publishFantasyInitial(ws,state,entering);}else fantasyAccountState(ws,state);
      // フレンド+ のセッションは中にいる人で見える人が変わる
      broadcastSessions();
      if (msg.requestId) send(ws, { t: 'sessionResult', requestId: msg.requestId });
      return;
    }
    case 'leave': {
      leaveSession(me);
      if(me.id.startsWith('fantasy:'))for(const [socket,connection]of [...homeConnections])if(connection.id===me.id&&connection.homeId){switchFantasyIdentity(socket,connection,connection.homeId);fantasyAccountState(socket,connection);}
      broadcastUsers();
      broadcastSessions();
      if (msg.requestId) send(ws, { t: 'sessionResult', requestId: msg.requestId });
      return;
    }
  }
}

/** 部屋で届いたセッション内の操作。送った人がそのセッションにいるときだけ呼ばれる */
function handleSession(me: Participant, sid: string, msg: RoomClientMsg, peerPositions = false, peerEvent?: PeerOperation) {
  const sessItems = items.get(sid)!;
  switch (msg.t) {
    case 'systemResync':
      syncSystemItems(sid);
      roomSend(sid, { t: 'systemState', sid, view: systems.view(sid) }, [me.id]);
      return;
    case 'systemLoad':
    case 'systemCommand': {
      let error: string | undefined;
      let outcome: 'applied' | 'duplicate' = 'applied';
      try {
        const participants = inSession(sid).map(u => u.id);
        if (msg.t === 'systemLoad') {
          const map = systemMaps.get(msg.mapId);
          if (!map) throw new Error('Unknown registered code map');
          systems.load(sid, me.id, map, participants);
        } else outcome = systems.apply(sid, me.id, msg.command, participants);
        syncSystemItems(sid, msg.t === 'systemLoad');
      } catch (reason) { error = reason instanceof Error ? reason.message : 'System operation failed'; }
      roomSend(sid, { t: 'systemState', sid, view: systems.view(sid), ...(error ? { error } : {}),
        ...(msg.t === 'systemCommand' && typeof msg.command?.id === 'string' ? {
          commandResult: { id: msg.command.id, outcome: error ? 'rejected' : outcome },
        } : {}),
      }, error ? [me.id] : undefined);
      return;
    }
    case 'sharedResync': {
      roomSend(sid, { t: 'sharedState', sid, view: sharedAssets.view(sid, me.id) }, [me.id]);
      return;
    }
    case 'sharedCommand': {
      let error: string | undefined;
      const recipients = inSession(sid);
      const before = new Map(recipients.map(u => [u.id, sharedAssets.view(sid, u.id)]));
      let result: string | undefined;
      try { result = sharedAssets.apply(sid, me.id, msg.command); }
      catch { error = '共有アセットの操作を確定できませんでした。状態を確認して再試行してください。'; }
      const commandId = typeof msg.command?.id === 'string' ? msg.command.id.slice(0, 64) : undefined;
      for (const user of error ? [me] : recipients) {
        const view = sharedAssets.view(sid, user.id);
        if (result === 'applied' && msg.command.kind === 'events') roomSend(sid, { t: 'sharedDelta', sid, delta: assetDelta(before.get(user.id)!, view), commandId }, [user.id]);
        else roomSend(sid, { t: 'sharedState', sid, view, commandId, ...(user.id === me.id && error ? { error } : {}) }, [user.id]);
      }
      return;
    }
    case 'sync': {
      sendSessionSnapshot(sid, me.id);
      return;
    }
    case 'chat': {
      const text = String(msg.text ?? '').trim().slice(0, 1000);
      const image = typeof msg.image === 'string' && /^data:image\/(jpeg|png|gif);base64,/.test(msg.image) && msg.image.length < 2_000_000
        ? msg.image : undefined;
      const media = chatMedia(msg.media);
      const scope: ChatScope = msg.scope === 'near' || msg.scope === 'announce' ? msg.scope : 'all';
      const clientRequestId = typeof msg.clientRequestId === 'string' && /^[\da-f-]{36}$/i.test(msg.clientRequestId) ? msg.clientRequestId : undefined;
      if (text || image || media) pushChat(sid, me, text, { scope, image, media, clientRequestId, to: scope === 'near' ? nearIds(sid, me) : undefined }, peerEvent);
      return;
    }
    case 'viewing': {
      const keys = Array.isArray(msg.keys) ? msg.keys.filter((k) => typeof k === 'string').slice(0, 20).map((k) => k.slice(0, 80)) : [];
      if (keys.join('\n') === me.viewing.join('\n')) return;
      me.viewing = keys;
      sendPresence(sid);
      return;
    }
    case 'poke': {
      const target = users.get(msg.to);
      if (!target || target.session !== sid || target.id === me.id) return;
      roomSend(sid, { t: 'poke', sid, from: me.id, to: target.id });
      event(sid, `${me.name} が ${target.name} をつんつんしました`, target.id);
      return;
    }
    case 'attention': {
      const key = String(msg.key ?? '');
      const it = sessItems.get(key.slice(key.indexOf(':') + 1));
      if (!it || !/^(item|cam):/.test(key)) return;
      // 連打で通知が埋まらないように
      if (Date.now() - (lastAttention.get(me.id) ?? 0) < 3000) return;
      lastAttention.set(me.id, Date.now());
      roomSend(sid, { t: 'attention', sid, from: me.id, key });
      const name = it.kind === 'youtube' && it.title ? it.title : ITEM_INFO[it.kind].name;
      event(sid, `${me.name} が「${name}」に注目を集めています`);
      return;
    }
    case 'broadcast': {
      const on = !!msg.on;
      if ((broadcastMode.get(sid) ?? false) === on) return;
      broadcastMode.set(sid, on);
      roomSend(sid, { t: 'broadcast', sid, on });
      event(sid, on ? `${me.name} がブロードキャストモードをオンにしました（距離に関係なく声が届きます）` : `${me.name} がブロードキャストモードをオフにしました`);
      return;
    }
    case 'sessionRename': {
      const name = trimTo(msg.name, 40);
      const def = guild.sessions.find((d) => d.id === sid);
      if (!def || !name || def.name === name) return;
      const before = def.name;
      def.name = name;
      if (!home.sessions.includes(def)) home.renamed[def.id] = name;
      saveHome();
      broadcastSessions();
      event(sid, `${me.name} がセッション名を「${before}」から「${name}」に変えました`);
      return;
    }
    case 'gameStart': {
      if (worldOf.get(sid) !== 'game' || me.mode !== '3d') return;
      startGame(sid, me, [...users.values()].filter((u) => u.session === sid), avatars.get(sid)!, gameDeps);
      return;
    }
    case 'gameStep': {
      stepTile(sid, me, Number(msg.tile), gameDeps);
      return;
    }
    case 'gameFell': {
      eliminate(sid, me.id, gameDeps);
      return;
    }
    case 'survivorStyle': {
      if (worldOf.get(sid) !== 'survivors') return;
      chooseSurvivorStyle(sid, me, msg.style as SurvivorStyle, survivorDeps);
      return;
    }
    case 'survivorStart': {
      if (worldOf.get(sid) !== 'survivors') return;
      startSurvivor(sid, me, survivorDeps);
      return;
    }
    case 'survivorMove': {
      if (worldOf.get(sid) !== 'survivors' || me.mode !== '2d') return;
      moveSurvivor(sid, me, Number(msg.x), Number(msg.z), survivorDeps);
      return;
    }
    case 'survivorChoose': {
      if (worldOf.get(sid) !== 'survivors') return;
      chooseSurvivorGear(sid, me, String(msg.gear), survivorDeps);
      return;
    }
    case 'survivorReroll': {
      if (worldOf.get(sid) !== 'survivors') return;
      rerollSurvivorChoice(sid, me, survivorDeps);
      return;
    }
    case 'survivorUpgrade': {
      if (worldOf.get(sid) !== 'survivors') return;
      upgradeSurvivor(sid, me.id, msg.upgrade as SurvivorMetaUpgrade, survivorDeps);
      return;
    }
    case 'survivorReset': {
      if (worldOf.get(sid) !== 'survivors') return;
      resetSurvivorUpgrades(sid, me.id, survivorDeps);
      return;
    }
    case 'elevatorCall': {
      if (worldOf.get(sid) !== 'city' || me.mode !== '3d') return;
      callElevator(sid, Number(msg.floor), (elevator) => roomSend(sid, { t: 'elevator', sid, elevator }));
      return;
    }
    case 'world': {
      if (!isWorldKind(msg.world) || worldOf.get(sid) === msg.world || worldPending.has(sid)) return;
      const clear = !!msg.clearItems;
      const world = msg.world;
      worldPending.add(sid);
      roomSend(sid, { t: 'worldPending', sid, world, at: Date.now() + WORLD_COUNTDOWN_MS, by: me.id, clearItems: clear });
      setTimeout(() => switchWorld(sid, world, clear, me.name), WORLD_COUNTDOWN_MS);
      return;
    }
    case 'liveRequest': {
      const target = users.get(msg.to);
      if (!target || me.follow !== target.id || target.session !== sid) return;
      roomSend(sid, { t: 'liveRequest', sid, from: me.id }, [target.id]);
      return;
    }
    case 'viewLive': {
      const on = !!msg.on && me.mode === '3d' && [...users.values()].some((f) => f.follow === me.id);
      if (me.viewLive === on) return;
      me.viewLive = on;
      sendPresence(sid);
      event(sid, on ? `${me.name} が視点のライブを始めました（ついてきている人向け）` : `${me.name} が視点のライブを止めました`);
      return;
    }
    case 'emote': {
      if (!isEmoteId(msg.id)) return;
      const at = Date.now();
      if (at < (emoteUntil.get(me) ?? 0)) return;
      emoteUntil.set(me, at + EMOTES[msg.id].duration);
      roomSend(sid, { t: 'emote', sid, from: me.id, id: msg.id, at });
      return;
    }
    case 'sound': {
      if (!SOUNDS.some((s) => s.id === msg.id)) return;
      roomSend(sid, { t: 'sound', sid, from: me.id, id: msg.id });
      return;
    }
    case 'itemCreate': {
      if (!Object.hasOwn(ITEM_INFO, msg.kind)) return;
      if (ONLY_3D[msg.kind] && me.mode !== '3d') return;
      if (msg.kind === 'mirror' && !canAddMirror(sessItems.values())) return;
      let at = placeIn(sid, msg.x, msg.z, 0.4);
      // 2D は細かい位置を選べないので、出す瞬間だけ空いている場所へずらす
      if (me.mode === '2d') {
        const probe = createItem(msg.kind, { id: '', x: 0, z: 0, ry: 0, createdBy: me.id }, Math.random, msg.media);
        if (probe) {
          at = freeSpot(at.x, at.z, itemRadius(probe), [...users.values()].filter((u) => u.session === sid), avatars.get(sid)!,
            sessItems.values(), (x, z) => placeIn(sid, x, z, itemRadius(probe) * 0.6));
        }
      }
      const it = createItem(msg.kind, {
        id: randomUUID(), x: at.x, z: at.z, ry: finNum(msg.ry), createdBy: me.id, variant: msg.variant,
      }, Math.random, msg.media);
      if (!it) return;
      if (it.kind === 'image') it.createdByName = me.name;
      if (it.kind === 'note' && msg.text) it.text = msg.text.slice(0, 300);
      timedCameras.tick(sid, [it], inSession(sid).map(user => user.id));
      sessItems.set(it.id, it);
      sendItem(sid, it);
      event(sid, `${me.name} が ${ITEM_INFO[msg.kind].name} を出しました`);
      return;
    }
    case 'itemRemove': {
      const it = sessItems.get(msg.id);
      if (it && isSystemControlledItem(it)) {
        const map = cameraTimerRemoval(systems.view(sid), it);
        if (!map) return;
        try {
          systems.load(sid, me.id, map, inSession(sid).map(user => user.id));
          syncSystemItems(sid, false);
          roomSend(sid, { t: 'systemState', sid, view: systems.view(sid) });
          event(sid, `${me.name} が ${ITEM_INFO[it.kind].name} をしまいました`);
        } catch (reason) {
          roomSend(sid, { t: 'systemState', sid, view: systems.view(sid), error: reason instanceof Error ? reason.message : 'System removal failed' }, [me.id]);
        }
        return;
      }
      if (!it || isSystemControlledItem(it) || (it.kind === 'bike' && it.rider)) return;
      timedCameras.remove(sid, it);
      if (!sessItems.delete(msg.id)) return;
      sendItemRemove(sid, msg.id);
      event(sid, `${me.name} が ${ITEM_INFO[it.kind].name} をしまいました`);
      return;
    }
    case 'itemMove': {
      const it = sessItems.get(msg.id);
      if (!it || isSystemControlledItem(it) || (it.kind === 'hammer' && it.holder) || (it.kind === 'bike' && it.rider)) return;
      const media = it.kind === 'image';
      const half = (worldOf.get(sid) === 'city' ? CITY_HALF : ROOM_HALF) - 0.5;
      const p = media ? { x: Math.max(-half, Math.min(half, finNum(msg.x))), z: Math.max(-half, Math.min(half, finNum(msg.z))) }
        : placeIn(sid, msg.x, msg.z, itemRadius(it) * 0.6);
      const ry = finNum(msg.ry);
      const transform = media ? mediaTransform({ y: msg.y ?? it.y, scale: msg.scale ?? it.scale }) : null;
      // 位置が変わっていなければ送らない
      if (p.x === it.x && p.z === it.z && ry === it.ry && (!transform || (transform.y === it.y && transform.scale === it.scale))) return;
      it.x = p.x; it.z = p.z; it.ry = ry;
      if (transform) Object.assign(it, transform);
      broadcastItemMove(sid, it);
      return;
    }
    case 'itemAction': {
      const it = sessItems.get(msg.id);
      if (!it || isSystemControlledItem(it)) return;
      if (msg.action?.a === 'timedCameraRequest') {
        if (me.mode === '3d' && timedCameras.request(sid, me.id, it, msg.action.token, inSession(sid).map(user => user.id))) {
          it.updatedBy = me.id;
          sendItem(sid, it);
        }
        return;
      }
      if (it.kind === 'camera' && it.variant === 'camera-timer') return;
      if (it.kind === 'telephone') {
        if (!msg.action || typeof msg.action.a !== 'string' || !msg.action.a.startsWith('telephone')) return;
        const present = new Set(inSession(sid).map(u => u.id));
        if (telephoneAction(telephoneState(it), { id: me.id, name: me.name, kind: 'human' }, msg.action as TelephoneAction, present, Date.now(), Math.random)) {
          it.updatedBy = me.id;
          sendItem(sid, it);
        }
        return;
      }
      if (it.kind === 'bike') {
        if (msg.action.a === 'bikeMount') {
          const av = avatars.get(sid)!.get(me.id);
          if (me.mode !== '3d' || !av || Math.hypot(av.x - it.x, av.z - it.z) > 3 || Math.abs(av.y ?? 0) > 0.3
            || [...sessItems.values()].some(h => h.kind === 'bike' && h.rider === me.id)) return;
        }
        if (msg.action.a === 'bikeDrive') {
          if (it.rider !== me.id) return;
          const state = msg.action.state;
          if (!state || !Number.isFinite(state.x) || !Number.isFinite(state.z)) return;
          const half = worldOf.get(sid) === 'city' ? CITY_HALF : ROOM_HALF;
          const p = placeIn(sid, clampBike(state.x, half), clampBike(state.z, half), BIKE.radius);
          p.x = clampBike(p.x, half); p.z = clampBike(p.z, half);
          if (Math.hypot(p.x - state.x, p.z - state.z) > 1e-5) {
            state.speed = 0; state.roll = 0; state.slipping = false;
          }
          Object.assign(state, p);
        }
      }
      if (msg.action.a === 'pick' && [...sessItems.values()].some((h) => isHandheld(h) && 'holder' in h && h.holder === me.id)) return;
      if (it.kind === 'camera' && (msg.action.a === 'pick' || (msg.action.a === 'camLive' && msg.action.on)) && me.mode !== '3d') return;
      if (it.kind === 'camera' && msg.action.a === 'camLive' && msg.action.on)
        for (const other of sessItems.values())
          if (other !== it && other.kind === 'camera' && other.live && other.operator === me.id) {
            other.live = false; other.operator = null;
            sendItem(sid, other);
          }
      if (it.kind === 'dice' && msg.action.a === 'diceRoll') {
        rollDice(sid, me, it, msg.action.sides, msg.action.count, !!msg.action.secret, peerEvent?.roll);
        return;
      }
      if (msg.action.a === 'drop') Object.assign(msg.action, placeIn(sid, msg.action.x, msg.action.z, 0.3));
      if (!applyItemAction(it, msg.action, me.id, Math.random)) return;
      // 差分だけ配る経路は sendItem を通らないので、保存の印はここで付ける
      markItemsDirty(sid);
      // 旧クライアントだけは手元で適用済み。
      if (isDeltaAction(msg.action)) roomSend(sid, { t: 'itemAction', sid, id: it.id, action: msg.action, by: me.id }, peerEvent ? undefined : othersIn(sid, me.id));
      else sendItem(sid, it);
      if (it.kind === 'chessAi') scheduleChessAiReply(it, () => sessItems.get(it.id), () => sendItem(sid, it));
      return;
    }
    case 'hit': {
      const holding = [...sessItems.values()].some((h) => h.kind === 'hammer' && h.holder === me.id);
      const target = users.get(msg.to);
      if (!holding || !target || target.session !== sid || target.id === me.id) return;
      roomSend(sid, { t: 'hit', sid, from: me.id, to: target.id });
      const list = chats.get(sid);
      if (list) roomSend(sid, { t: 'chat', sid, m: logHammerHit(list, me, target, Date.now()) });
      return;
    }
    case 'mode': {
      if (me.mode === msg.mode) return;
      me.mode = msg.mode;
      if (msg.mode === '3d') { me.follow = null; me.pos = null; }
      if (msg.mode === '2d') {
        eliminate(sid, me.id, gameDeps);
        // スポーンエリアには戻さず、3D でいた場所にとどまる
        const av = avatars.get(sid)!.get(me.id);
        me.pos = av ? { ...av } : null;
        me.display = null;
        dropFollowersOf(me);
        releaseCameras(sid, me, av);
        releaseBikes(sid, me.id);
        if (avatars.get(sid)!.delete(me.id)) roomSend(sid, { t: 'avatarRemove', sid, id: me.id });
      }
      broadcastUsers(); sendPresence(sid);
      thumbnails.update(sid, inSession(sid));
      event(sid, `${me.name} が ${modeLabel(msg.mode)} に切り替えました`);
      return;
    }
    case 'follow': {
      const target = msg.target ? users.get(msg.target) : null;
      if (msg.target && (!target || target.session !== sid || target.mode !== '3d' || target.id === me.id || me.mode !== '2d')) return;
      if (me.follow === (target?.id ?? null)) return;
      me.follow = target?.id ?? null;
      sendPresence(sid);
      if (target) event(sid, `${me.name} が ${target.name} についていきました`);
      return;
    }
    case 'place2d': {
      const target = users.get(msg.target);
      if (!target || target.session !== sid || target.mode !== '2d') return;
      if (me.mode !== '3d' && target.id !== me.id) return;
      target.pos = msg.pos ? clamp2d(sid, msg.pos) : null;
      target.follow = null;
      sendPresence(sid);
      return;
    }
    case 'displayMove': {
      const target = users.get(msg.target);
      if (!target?.display || target.session !== sid || me.mode !== '3d') return;
      target.display = { ...placeIn(sid, msg.x, msg.z, 0.3), ry: Number(msg.ry) || 0 };
      sendPresence(sid);
      return;
    }
    case 'dropFollowers': {
      if (dropFollowersOf(me)) {
        sendPresence(sid);
        event(sid, `${me.name} がついてくる人を解除しました`);
      }
      return;
    }
    case 'status': {
      if (me.micOn === msg.micOn && me.sharing === msg.sharing) return;
      if (msg.sharing && !me.sharing) event(sid, `${me.name} が画面共有を開始しました`);
      me.micOn = msg.micOn;
      me.sharing = msg.sharing;
      if (!me.sharing) me.display = null;
      else if (me.mode === '3d' && !me.display) {
        const av = avatars.get(sid)!.get(me.id);
        if (av) placeDisplay(sid, me, av);
      }
      broadcastUsers(); sendPresence(sid);
      return;
    }
    case 'avatar': {
      // 2D の人の分も覚えるが、使う側はみな mode を見て 3D の人の分だけ使う（mode より先に届くことがある）
      const seat = systemSeat(systems.view(sid), me.id);
      const s = seat ? { ...clampAvatar(worldOf.get(sid) ?? 'room', msg.s), x: seat.x, y: seat.y, z: seat.z, walking: false } : clampAvatar(worldOf.get(sid) ?? 'room', msg.s);
      avatars.get(sid)!.set(me.id, s);
      roomSend(sid, { t: 'avatar', sid, id: me.id, s }, inSession(sid).filter((u) => u.id !== me.id).map((u) => u.id), peerPositions);
      // 2D から 3D に入ったときは、入った場所の前に立てる
      if (me.sharing && !me.display) { placeDisplay(sid, me, s); sendPresence(sid); }
      return;
    }
  }
}

const trimTo = (v: unknown, n: number) => String(v ?? '').trim().slice(0, n);

function cancelEmptyCheck(sessionId: string) {
  clearTimeout(emptySessionTimers.get(sessionId));
  emptySessionTimers.delete(sessionId);
}

function scheduleEmptyCheck(sessionId: string) {
  if (fixedSessionIds.has(sessionId)) return;
  cancelEmptyCheck(sessionId);
  emptySessionTimers.set(sessionId, setTimeout(() => {
    emptySessionTimers.delete(sessionId);
    const def = home.sessions.find((d) => d.id === sessionId);
    if (!def || !sessionIds.has(sessionId) || fixedSessionIds.has(sessionId) || inSession(sessionId).length) return;
    // 全員不在でも進行と結果鑑賞へ復帰できるよう、履歴のある部屋を残す。
    if (hasTelephoneHistory(items.get(sessionId)?.values() ?? [])) return;
    console.log(`session auto-delete: ${JSON.stringify({ id: sessionId, name: def.name, reason: 'empty for 5min' })}`);
    destroyUserSession(sessionId);
  }, EMPTY_SESSION_TTL_MS));
}

function destroyUserSession(sessionId: string) {
  const def = home.sessions.find((d) => d.id === sessionId);
  if (!def) return;
  cancelEmptyCheck(sessionId);
  home.sessions.splice(home.sessions.indexOf(def), 1);
  guild.sessions.splice(guild.sessions.indexOf(def), 1);
  sessionIds.delete(def.id);
  thumbnails.delete(def.id);
  worldOf.delete(def.id);
  chats.delete(def.id);
  avatars.delete(def.id);
  for (const item of items.get(def.id)?.values() ?? []) timedCameras.remove(def.id, item);
  items.delete(def.id);
  systemItemRooms.delete(def.id);
  markItemsDirty(def.id);
  broadcastMode.delete(def.id);
  worldPending.delete(def.id);
  clearSurvivor(def.id);
  clearGame(def.id);
  resetElevator(def.id);
  broadcastSessionInfo();
  for (const ev of home.events) if (ev.session === def.id) ev.session = null;
  saveHome();
  broadcastSessions();
  broadcastEvents();
}

/** ホーム画面の操作（セッション外でもできる）。扱ったら true */
function handleHome(me: User, msg: ClientMsg, ws: WebSocket): boolean {
  switch (msg.t) {
    case 'sessionCreate': {
      const name = trimTo(msg.name, 40);
      const visibility = Object.hasOwn(VISIBILITY_INFO, msg.visibility) ? msg.visibility : 'public';
      const group = isGroupVisibility(visibility) ? home.groups.find((g) => g.id === msg.group && g.members.includes(me.id))?.id : undefined;
      if (!name || (isGroupVisibility(visibility) && !group)) {
        if (msg.requestId) send(ws, { t: 'sessionResult', requestId: msg.requestId, error: !name ? 'セッション名を入力してください' : 'このグループには所属していません' });
        return true;
      }
      const def: SessionDef = { id: shortId(), name, topic: trimTo(msg.topic, 100), world: isWorldKind(msg.world) ? msg.world : 'room', visibility, owner: me.id, group, invited: [] };
      home.sessions.push(def);
      guild.sessions.push(def);
      registerSession(def);
      scheduleEmptyCheck(def.id);
      saveHome();
      broadcastSessions();
      broadcastSessionInfo();
      send(ws, { t: 'sessionCreated', sid: def.id, requestId: msg.requestId });
      return true;
    }
    case 'sessionDelete': {
      const def = home.sessions.find((d) => d.id === msg.id && d.owner === me.id);
      if (!def || [...users.values()].some((u) => u.session === def.id)) return true;
      destroyUserSession(def.id);
      return true;
    }
    case 'groupCreate': {
      const name = trimTo(msg.name, 40);
      if (!name) return true;
      home.groups.push({ id: shortId(), name, color: GROUP_COLORS.includes(msg.color) ? msg.color : GROUP_COLORS[0], owner: me.id, editors: [], members: [me.id], channels: defaultChannels() });
      saveHome();
      broadcastGroups();
      return true;
    }
    case 'groupUpdate': {
      const g = home.groups.find((x) => x.id === msg.groupId);
      if (!g || !canEditGroup(g, me.id)) return true;
      let changed = false;
      if (typeof msg.name === 'string') {
        const name = trimTo(msg.name, 40);
        if (name && name !== g.name) { g.name = name; changed = true; }
      }
      if (g.owner === me.id && Array.isArray(msg.editors)) {
        g.editors = [...new Set(msg.editors.filter((n) => typeof n === 'string' && n !== g.owner && g.members.includes(n)))];
        changed = true;
      }
      if (changed) { saveHome(); broadcastGroups(); }
      return true;
    }
    case 'groupJoin':
    case 'groupLeave': {
      const g = home.groups.find((x) => x.id === msg.id);
      if (!g) return true;
      if (msg.t === 'groupJoin' && !g.members.includes(me.id)) g.members.push(me.id);
      if (msg.t === 'groupLeave') g.members = g.members.filter((n) => n !== me.id);
      g.editors = g.editors?.filter((n) => g.members.includes(n));
      saveHome();
      broadcastGroups();
      broadcastSessions();
      broadcastPeople();
      // チャンネルが見えるようになった・見えなくなったので、メッセージを送り直す
      sendTo([me.id], { t: 'inbox', convs: convsOf(me.id), reads: inbox.reads[me.id] ?? {}, people: knownPeopleOf(me.id).map((n) => personOf(n)), watching: watchingOf(me.id), lastSeen: null, recentStatus: personRec(me.id).recent });
      return true;
    }
    case 'channelCreate': {
      const g = home.groups.find((x) => x.id === msg.group && x.owner === me.id);
      const name = trimTo(msg.name, 20).replace(/^#\s*/, '');
      if (!g || !name || g.channels.length >= 8 || g.channels.some((c) => c.name === name)) return true;
      g.channels.push({ id: shortId(), name });
      saveHome();
      broadcastGroups();
      return true;
    }
    case 'msg': {
      const members = convMembers(msg.conv);
      if (!members?.includes(me.id)) return true;
      const text = trimTo(msg.text, 2000);
      const media = chatMedia(msg.media);
      const at = Number(msg.plan?.at);
      const visible = sessionsVisibleTo(me.id);
      const plan = msg.plan && msg.conv.startsWith('ch:') && Number.isFinite(at)
        ? { at, session: visible.find((d) => d.id === msg.plan!.session)?.id ?? null, answers: { [me.id]: 'yes' as Rsvp }, event: null } : undefined;
      const invite = msg.invite && visible.some((d) => d.id === msg.invite) ? msg.invite : undefined;
      const it = msg.item && visible.some((d) => d.id === msg.item!.session) ? items.get(msg.item.session)?.get(msg.item.id) : undefined;
      const item = it ? { session: msg.item!.session, id: it.id, kind: it.kind, summary: itemSummary(it) ?? ITEM_INFO[it.kind].name } : undefined;
      if (!text && !media && !plan && !invite && !item) return true;
      pushMessage(msg.conv, {
        id: randomUUID(), from: me.id, at: Date.now(), text,
        ...(media ? { media } : {}), ...(plan ? { plan } : {}), ...(invite ? { invite } : {}), ...(item ? { item } : {}),
      });
      // 送った会話は読んだことにする
      (inbox.reads[me.id] ??= newRecord())[msg.conv] = Date.now();
      dirtyReads.add(me.id);
      return true;
    }
    case 'read': {
      if (!convMembers(msg.conv)?.includes(me.id)) return true;
      const reads = (inbox.reads[me.id] ??= newRecord());
      const at = Math.min(Date.now(), Number(msg.at) || 0);
      if (at <= (reads[msg.conv] ?? 0)) return true;
      reads[msg.conv] = at;
      dirtyReads.add(me.id);
      saveInbox();
      sendTo([me.id], { t: 'read', conv: msg.conv, at });
      return true;
    }
    case 'rsvp': {
      const m = inbox.convs[msg.conv]?.find((x) => x.id === msg.id);
      if (!m?.plan || !convMembers(msg.conv)?.includes(me.id)) return true;
      const plan = m.plan;
      if (msg.answer === null) delete plan.answers[me.id];
      else if (msg.answer === 'yes' || msg.answer === 'maybe' || msg.answer === 'no') plan.answers[me.id] = msg.answer;
      const who = (a: Rsvp) => Object.keys(plan.answers).filter((n) => plan.answers[n] === a);
      let ev = plan.event ? home.events.find((x) => x.id === plan.event) : undefined;
      // 剪定済みの古い日程相談 (開始が保持期間を過ぎている) からはイベントを作り直さない。
      // 回答の記録や既存イベントの出席更新は従来どおり行う
      if (!ev && who('yes').length >= PLAN_QUORUM && !isStaleEvent(plan.at, Date.now())) {
        const group = msg.conv.split(':')[1];
        ev = { id: shortId(), title: m.text.split('\n')[0].slice(0, 60) || '集まり', at: plan.at, group, session: plan.session, owner: m.from || me.id, attendees: [], maybe: [], declined: [] };
        pruneOldEvents();
        home.events.push(ev);
        home.events.sort((a, b) => a.at - b.at);
        plan.event = ev.id;
      }
      if (ev) { ev.attendees = who('yes'); ev.maybe = who('maybe'); ev.declined = who('no'); saveHome(); broadcastEvents(); }
      dirtyConvs.add(msg.conv);
      saveInbox();
      sendTo(convMembers(msg.conv) ?? [], { t: 'msg', conv: msg.conv, m });
      return true;
    }
    case 'setStatus': {
      if (!Object.hasOwn(STATUS_INFO, msg.status)) return true;
      const rec = personRec(me.id);
      rec.status = msg.status;
      rec.statusText = trimTo(msg.text, STATUS_TEXT_MAX);
      if (rec.statusText) rec.recent = [rec.statusText, ...rec.recent.filter((t) => t !== rec.statusText)].slice(0, 5);
      savePeople();
      updateHomeUser(me.id, { status: rec.status, statusText: rec.statusText });
      broadcastUsers();
      broadcastPeople();
      sendWatching(me.id);
      return true;
    }
    case 'watch': {
      const target = typeof msg.to === 'string' ? msg.to : '';
      if (!friendsOf(me.id).includes(target)) return true;
      const rec = personRec(target);
      rec.watchers = rec.watchers.filter((n) => n !== me.id);
      if (msg.on) rec.watchers.push(me.id);
      savePeople();
      sendWatching(me.id);
      return true;
    }
    case 'askJoin': {
      const target = homeUserById(msg.to);
      if (!target?.session || target.status === 'busy' || !friendsOf(me.id).includes(target.id)) return true;
      sendTo([target.id], { t: 'askJoin', from: me.id, fromName: me.name, session: target.session });
      return true;
    }
    case 'groupDelete': {
      const g = home.groups.find((x) => x.id === msg.id && x.owner === me.id);
      if (!g) return true;
      home.groups.splice(home.groups.indexOf(g), 1);
      if (g.imageVersion) void removeObject(groupImageKey(g, g.imageVersion));
      // グループ限定だったセッションは作った人だけに残す
      for (const d of home.sessions) if (d.group === g.id) { d.visibility = 'invite'; d.group = undefined; }
      for (const ev of home.events) if (ev.group === g.id) ev.group = null;
      saveHome();
      broadcastGroups();
      broadcastSessions();
      broadcastEvents();
      return true;
    }
    case 'eventCreate': {
      const title = trimTo(msg.title, 60);
      const at = Number(msg.at);
      if (!title || !Number.isFinite(at)) return true;
      const group = home.groups.find((g) => g.id === msg.group && g.members.includes(me.id))?.id ?? null;
      const session = sessionsVisibleTo(me.id).find((d) => d.id === msg.session)?.id ?? null;
      pruneOldEvents();
      home.events.push({ id: shortId(), title, at, group, session, owner: me.id, attendees: [me.id], maybe: [], declined: [] });
      home.events.sort((a, b) => a.at - b.at);
      saveHome();
      broadcastEvents();
      return true;
    }
    case 'eventAttend': {
      const ev = home.events.find((x) => x.id === msg.id);
      if (!ev) return true;
      for (const k of ['attendees', 'maybe', 'declined'] as const) ev[k] = ev[k].filter((n) => n !== me.id);
      if (msg.answer === 'yes') ev.attendees.push(me.id);
      if (msg.answer === 'maybe') ev.maybe.push(me.id);
      if (msg.answer === 'no') ev.declined.push(me.id);
      saveHome();
      broadcastEvents();
      return true;
    }
    case 'eventDelete': {
      const ev = home.events.find((x) => x.id === msg.id && x.owner === me.id);
      if (!ev) return true;
      home.events.splice(home.events.indexOf(ev), 1);
      saveHome();
      broadcastEvents();
      return true;
    }
    case 'invite': {
      const other = homeUserById(msg.to);
      // 取り込み中の人には誘いを届けない
      if (!other || other.id === me.id || other.status === 'busy') return true;
      if (msg.kind === 'session') {
        const def = guild.sessions.find((d) => d.id === msg.id);
        if (!def || !canSeeSession(def, me.id, friendsOf(me.id), home.groups, homeUsers())) return true;
        if (def.owner && !def.invited!.includes(other.id)) { def.invited!.push(other.id); saveHome(); broadcastSessions(); }
      } else if (!home.groups.find((g) => g.id === msg.id)?.members.includes(me.id)) return true;
      sendTo([other.id], { t: 'invite', kind: msg.kind, id: msg.id, from: me.id, fromName: me.name });
      return true;
    }
  }
  return false;
}

function onClose(ws: WebSocket, id: string | null, quiet=false) {
  revokeSync(ws);
  if (!id) return;
  const set = sockets.get(id);
  set?.delete(ws);
  if (set && set.size > 0) return;
  sockets.delete(id);
  const u = users.get(id);
  const wasIn = !!u?.session;
  if (u) leaveSession(u);
  users.delete(id);
  lastAttention.delete(id);
  lastRoll.delete(id);
  fantasyPartyPublished.delete(id); fantasyCombatPublished.delete(id); publishFantasyParties();
  if(!quiet)broadcastUsers();
  if (wasIn&&!quiet) broadcastSessions();
}

const MIME: Record<string, string> = {
  '.wav': 'audio/wav', '.ogg': 'audio/ogg', '.mp3': 'audio/mpeg',
  '.html': 'text/html; charset=utf-8', '.js': 'text/javascript', '.css': 'text/css',
  '.svg': 'image/svg+xml', '.png': 'image/png', '.json': 'application/json', '.woff2': 'font/woff2',
  '.webmanifest': 'application/manifest+json', '.webp': 'image/webp',
};

const handleTranslation = createTranslationHandler(createTranslator(configuredTranslationModel(process.env, DEV)));
async function handleRequest(req: http.IncomingMessage, res: http.ServerResponse) {
  // 絶対形式の壊れたリクエストターゲット（例: http://[::1）でも new URL が例外になるため、ここで 400 にする
  let url: URL;
  try { url = new URL(req.url ?? '/', 'http://x'); } catch { res.statusCode = 400; res.end('bad path'); return; }
  if (await auth.handle(req, res, url)) return;
  if (await fantasyAccounts.handleHttp(req, res)) return;
  // 本人はログインのセッションで決める（URL や本文の名前は信じない）。必要な所でだけ DB を引く
  const who = () => auth.accountOf(req, url.searchParams);
  const deny = (status: number) => { res.statusCode = status; res.end(); };
  if (url.pathname === '/api/content-translations') {
    res.setHeader('Content-Type', 'application/json; charset=utf-8');
    res.setHeader('Cache-Control', 'no-store');
    if (req.method !== 'GET' && req.method !== 'HEAD') { res.statusCode = 405; res.setHeader('Allow', 'GET, HEAD'); res.end('{}'); return; }
    res.end(req.method === 'HEAD' ? undefined : JSON.stringify(contentTranslations.catalog()));
    return;
  }
  if (sharedAssets.http(req, res, url.pathname)) return;
  if (systems.http(req, res, url.pathname)) return;
  if (url.pathname === '/api/translate') {
    // 翻訳は外部の API に費用がかかるので、つないでいる人だけ
    if (!await who()) { deny(401); return; }
    await handleTranslation(req, res);
    return;
  }
  if (url.pathname === '/sync/offer') { await handleSyncOffer(req, res); return; }
  if (url.pathname === '/timeline-image') {
    if (req.method !== 'POST') { res.statusCode = 405; res.end(); return; }
    const account = await who();
    if (!account || account.kind === 'guest') { deny(403); return; }
    const uploader = account.id;
    if (!timeline.allow(`upload:${uploader}`, UPLOAD_RATE)) { res.statusCode = 429; res.end(); return; }
    const body = await readBody(req, POST_IMAGE_MAX_BYTES);
    if (!body) { res.statusCode = 413; res.end(); return; }
    if (!isJpeg(body)) { res.statusCode = 400; res.end(); return; }
    const id = timeline.newImageId();
    try { await storage.put(timelineImageKey(id), body, 'image/jpeg'); } catch (e) { console.error('タイムラインの画像を保存できませんでした:', e); res.statusCode = 500; res.end(); return; }
    timeline.registerUpload(id, uploader);
    res.setHeader('Content-Type', 'application/json');
    res.end(JSON.stringify({ id }));
    return;
  }
  if (url.pathname.startsWith('/timeline-image/')) {
    const id = url.pathname.slice('/timeline-image/'.length);
    if (req.method !== 'GET') { res.statusCode = 405; res.end(); return; }
    if (!isImageId(id)) { res.statusCode = 404; res.end(); return; }
    redirectToObject(res, timelineImageKey(id), true);
    return;
  }
  if (url.pathname.startsWith('/group-image/')) {
    const g = home.groups.find((x) => x.id === url.pathname.slice('/group-image/'.length));
    if (req.method === 'POST') {
      const account = await who();
      const editor = account && account.kind !== 'guest' ? account.id : '';
      if (!g || !canEditGroup(g, editor)) { res.statusCode = 204; res.end(); return; }
      const body = await readBody(req, ICON_MAX_BYTES);
      if (!body || !isJpeg(body)) { res.statusCode = 400; res.end(); return; }
      const before = g.imageVersion ?? 0;
      const v = before + 1;
      try { await storage.put(groupImageKey(g, v), body, 'image/jpeg'); } catch (e) { console.error('グループの画像を保存できませんでした:', e); res.statusCode = 500; res.end(); return; }
      // 読み込み中・書き込み中の脱退・権限変更・削除と、ほかの人の差し替えも反映する
      if (!home.groups.includes(g) || !canEditGroup(g, editor) || (g.imageVersion ?? 0) !== before) { void removeObject(groupImageKey(g, v)); res.statusCode = 204; res.end(); return; }
      g.imageVersion = v;
      saveHome();
      broadcastGroups();
      if (before) void removeObject(groupImageKey(g, before));
      res.setHeader('Content-Type', 'application/json');
      res.end(JSON.stringify({ imageVersion: g.imageVersion }));
      return;
    }
    if (req.method !== 'GET') { res.statusCode = 405; res.end(); return; }
    if (!g?.imageVersion) { res.statusCode = 404; res.end(); return; }
    redirectToObject(res, groupImageKey(g, g.imageVersion), !!url.searchParams.get('v'));
    return;
  }
  if (url.pathname === '/icon') {
    if (req.method === 'POST') {
      // 自分のアイコンだけ書き換えられる。ゲストも残せる
      const account = await who();
      if (!account) { deny(401); return; }
      const body = await readBody(req, ICON_MAX_BYTES);
      if (!body || !isJpeg(body)) { res.statusCode = 400; res.end(); return; }
      const key = `icons/${account.id}/${newVersion()}.jpg`;
      try { await storage.put(key, body, 'image/jpeg'); } catch (e) { console.error('アイコンを保存できませんでした:', e); res.statusCode = 500; res.end(); return; }
      setImages(account.id, { icon: key });
      res.end(JSON.stringify({ icon: iconVersion(account.id) }));
      return;
    }
    const key = imagesOf(url.searchParams.get('id') ?? '').icon;
    if (!key) { res.statusCode = 404; res.end(); return; }
    redirectToObject(res, key, !!url.searchParams.get('v'));
    return;
  }
  if (url.pathname === '/avatar' || url.pathname === '/avatar/params') {
    // 書くのは自分のアバターだけ（ゲストも残せる）。読むのはだれのものでも
    const account = req.method === 'POST' ? await who() : null;
    if (req.method === 'POST' && !account) { deny(401); return; }
    const id = account?.id ?? url.searchParams.get('id') ?? '';
    const isParams = url.pathname === '/avatar/params';
    if (req.method === 'POST') {
      const body = await readBody(req, isParams ? 20_000 : 6_000_000);
      if (!body) { res.statusCode = 413; res.end(); return; }
      if (isParams) {
        let params;
        try { params = sanitizeParams(JSON.parse(body.toString('utf-8'))); } catch { res.statusCode = 400; res.end(); return; }
        setImages(id, { avatarParams: params, avatarVersion: newVersion() });
      } else {
        if (!isPng(body) && !isJpeg(body)) { res.statusCode = 400; res.end(); return; }
        const v = newVersion();
        const key = `avatars/${id}/${v}.${isPng(body) ? 'png' : 'jpg'}`;
        try { await storage.put(key, body, isPng(body) ? 'image/png' : 'image/jpeg'); } catch (e) { console.error('アバターを保存できませんでした:', e); res.statusCode = 500; res.end(); return; }
        setImages(id, { avatarImage: key, avatarVersion: v });
      }
      res.end(JSON.stringify({ avatar: avatarVersion(id) }));
      return;
    }
    const rec = imagesOf(id);
    const immutable = !!url.searchParams.get('v');
    if (isParams) {
      if (rec.avatarParams === null) { res.statusCode = 404; res.end(); return; }
      res.setHeader('Content-Type', 'application/json');
      res.setHeader('Cache-Control', immutable ? 'public, max-age=31536000, immutable' : 'no-cache');
      res.end(JSON.stringify(rec.avatarParams));
      return;
    }
    if (!rec.avatarImage) { res.statusCode = 404; res.end(); return; }
    redirectToObject(res, rec.avatarImage, immutable);
    return;
  }
  if (url.pathname === '/profile') {
    res.setHeader('Content-Type', 'application/json');
    if (req.method === 'POST') {
      // 自己紹介はログインした人だけ（ゲストが残せるのはアイコンとアバター）
      const account = await who();
      if (!account || account.kind === 'guest') { deny(403); return; }
      const body = await readBody(req, 10_000);
      let bio = '';
      try { bio = String((JSON.parse(body?.toString('utf-8') ?? '') as { bio?: unknown }).bio ?? '').slice(0, 300); } catch { res.statusCode = 400; res.end(); return; }
      bios.set(account.id, bio);
      savePeople();
      res.end(JSON.stringify({ bio }));
      return;
    }
    res.end(JSON.stringify({ bio: bioOf(url.searchParams.get('id') ?? '') }));
    return;
  }
  if (url.pathname === '/media' && req.method === 'POST') {
    const account = await who();
    if (!account) { deny(401); return; }
    res.setHeader('Content-Type', 'application/json');
    // 添付は合計の上限で古いものから消えるので、ほかの人の画像を押し出させないよう、送れる人と量を絞る
    if (account.kind === 'guest') { res.statusCode = 403; res.end(JSON.stringify({ error: 'ゲストは画像を共有できません。ログインすると共有できます' })); return; }
    const slot = reserveMediaUpload(account.id);
    if (!slot) { res.statusCode = 429; res.end(JSON.stringify({ error: '画像を送りすぎています。しばらくしてからもう一度お試しください' })); return; }
    let r: Awaited<ReturnType<typeof saveMedia>>;
    try { r = await saveMedia(req, storage); } catch (e) { slot.cancel(); console.error('画像を保存できませんでした:', e); res.statusCode = 500; res.end(); return; }
    if ('error' in r) { slot.cancel(); res.statusCode = r.status; res.end(JSON.stringify(r)); return; }
    slot.done(r.size);
    addMedia(r.name, r.size);
    res.end(JSON.stringify({ url: r.url }));
    return;
  }
  if (url.pathname.startsWith('/media/')) {
    const name = url.pathname.slice('/media/'.length);
    if (!MEDIA_NAME_RE.test(name)) { res.statusCode = 404; res.end(); return; }
    redirectToObject(res, `media/${name}`, true);
    return;
  }
  // S3 を設定していないとき（テストなど）は、ストレージのファイルをここから配る
  if (url.pathname.startsWith('/objects/') && storage instanceof FileStorage) {
    let file: string;
    try { file = storage.file(url.pathname.slice('/objects/'.length)); } catch { res.statusCode = 404; res.end(); return; }
    const type = IMAGE_TYPES[path.extname(file).slice(1)];
    if (!type || !fs.existsSync(file)) { res.statusCode = 404; res.end(); return; }
    res.setHeader('Content-Type', type);
    res.setHeader('Cache-Control', 'public, max-age=31536000, immutable');
    pipeFile(res, file);
    return;
  }
  if (url.pathname === '/ogp') {
    // サーバーから外のページを取りに行くので、つないでいる人だけ
    if (!await who()) { deny(401); return; }
    res.setHeader('Content-Type', 'application/json');
    res.setHeader('Cache-Control', 'public, max-age=3600');
    res.end(JSON.stringify(await getOgp((url.searchParams.get('url') ?? '').slice(0, 2000))));
    return;
  }
  if (url.pathname === '/report' && req.method === 'POST') {
    const account = await who();
    if (!account) { deny(401); return; }
    const body = await readBody(req, 10_000);
    try {
      const r = JSON.parse(body?.toString('utf-8') ?? '') as { target?: unknown; reason?: unknown };
      const report = { fromAccount: account.id, fromName: account.name, target: String(r.target).slice(0, 64), reason: String(r.reason ?? '').slice(0, 500) };
      enqueue('report', () => addReport(report));
      console.log(`report: ${account.name} -> ${String(r.target)}`);
    } catch { res.statusCode = 400; }
    res.end();
    return;
  }
  if (url.pathname.startsWith('/api/save/') || url.pathname === '/api/leaderboard' || url.pathname.startsWith('/api/ad/')) {
    res.setHeader('Content-Type', 'application/json');
    res.setHeader('Cache-Control', 'no-store');
    const token = typeof req.headers.authorization === 'string' ? req.headers.authorization.replace(/^Bearer /, '') : '';
    const peer = req.socket.remoteAddress ?? 'unknown';
    try {
      const match = /^\/api\/save\/([^/]+)$/.exec(url.pathname);
      const id = match ? decodeURIComponent(match[1]) : '';
      const post = req.method === 'POST';
      let body: Record<string, unknown> = {};
      if (post) {
        const raw = await readBody(req, 1_000_000);
        if (!raw) throw new AdStoreError(413);
        try { body = JSON.parse(raw.toString('utf8')); } catch { throw new AdStoreError(400); }
        if (!body || typeof body !== 'object' || Array.isArray(body)) throw new AdStoreError(400);
      }
      let result: unknown;
      if (url.pathname === '/api/ad/create' && post) {
        adStore.limit(`create:${peer}`, 10);
        result = adStore.create();
      } else if (url.pathname === '/api/ad/exchange' && post) {
        result = adStore.exchange(body.code, peer);
      } else if (url.pathname === '/api/ad/transfer' && post) {
        result = adStore.issue(String(body.id ?? ''), token);
      } else if (match && req.method === 'GET') {
        result = adStore.load(id, token);
      } else if (match && post) {
        result = adStore.save(id, token, body.revision, body.save);
      } else if (url.pathname === '/api/leaderboard' && req.method === 'GET') {
        result = { entries: adStore.leaderboard(token) };
      } else if (url.pathname === '/api/leaderboard' && post) {
        adStore.submit(token, body);
        result = { ok: true };
      } else throw new AdStoreError(405);
      res.end(JSON.stringify(result));
    } catch (error) {
      res.statusCode = error instanceof AdStoreError ? error.status : 500;
      res.end(JSON.stringify({ error: `AD request failed (${res.statusCode})` }));
    }
    return;
  }
  if (url.pathname === '/healthz') {
    res.setHeader('Content-Type', 'text/plain');
    res.end('ok');
    return;
  }
  if (url.pathname === '/token') {
    const { LIVEKIT_URL, LIVEKIT_API_KEY, LIVEKIT_API_SECRET } = process.env;
    const account = await who();
    const sid = url.searchParams.get('session') ?? '';
    res.setHeader('Content-Type', 'application/json');
    if (!LIVEKIT_URL || !LIVEKIT_API_KEY || !LIVEKIT_API_SECRET) {
      res.end(JSON.stringify({ error: 'LiveKit が未設定です (.env)' }));
      return;
    }
    // ログインのセッションの本人で、WS 接続中で、そのセッションへの join（canSeeSession 通過済み）を終えた参加者にだけ、
    // サーバー側レコードの identity/name で発行する。拒否理由は区別せず同じ文言で返す
    // fantasy の世界ではつながりの ID が fantasy のアカウントに替わるので、本人のつながりが今動かしている人で発行する
    const me = account ? [...homeConnections.values()].filter((c) => c.homeId === account.id && c.id).map((c) => users.get(c.id!)).find((u) => u?.session === sid) : undefined;
    if (!me || !sessionIds.has(sid) || me.session !== sid) {
      res.end(JSON.stringify({ error: '不正なリクエストです' }));
      return;
    }
    const at = new AccessToken(LIVEKIT_API_KEY, LIVEKIT_API_SECRET, { identity: me.id, name: me.name, ttl: '2h' });
    at.addGrant({ roomJoin: true, room: livekitRoom(sid), canPublish: true, canSubscribe: true, canPublishData: false });
    res.end(JSON.stringify({ url: LIVEKIT_URL, token: await at.toJwt() }));
    return;
  }
  // dev 中は古い client/dist を出さない。手元のブラウザは Vite へ、トンネル越しには 5173 を案内する
  if (DEV) {
    const host = (req.headers.host ?? '').replace(/:\d+$/, '');
    if (host === 'localhost' || host === '127.0.0.1' || host === '[::1]') {
      res.writeHead(302, { Location: `http://localhost:${process.env.CLIENT_PORT || 5173}${url.pathname}${url.search}` });
      res.end();
    } else {
      res.writeHead(503, { 'Content-Type': 'text/plain; charset=utf-8', 'X-Tonarium-Dev': '1' });
      res.end('npm run dev 中です。トンネルは http://localhost:5173 に向けるか、npm start で起動して 3001 をトンネルしてください。');
    }
    return;
  }
  try { decodeURIComponent(url.pathname); } catch { res.statusCode = 400; res.end('bad path'); return; }
  const file = resolvePublicFile(DIST,url.pathname) ?? path.join(DIST,'index.html');
  if (!fs.existsSync(file)) {
    res.statusCode = 404;
    res.end('client not built. run `npm run dev` and open http://localhost:5173');
    return;
  }
  if (file.endsWith('index.html')) {
    // OGP 用に、アクセスされたドメインの絶対 URL を埋める
    const origin = requestOrigin(req);
    res.setHeader('Content-Type', MIME['.html']);
    res.setHeader('Cache-Control', 'no-cache');
    res.end(fs.readFileSync(file, 'utf-8').replaceAll('__ORIGIN__', origin).replaceAll('__VERSION__', CLIENT_VERSION ?? ''));
    return;
  }
  res.setHeader('Content-Type', MIME[path.extname(file)] ?? 'application/octet-stream');
  // assets/ はハッシュ付き。index.html は毎回取り直させる
  res.setHeader('Cache-Control', file.includes(`${path.sep}assets${path.sep}`) ? 'public, max-age=31536000, immutable' : 'no-cache');
  pipeFile(res, file);
}

// ハンドラ全体の安全網: 個別に潰していない例外経路が残っていても、未処理 rejection で
// プロセスごと落とさず、このリクエストだけ 500 (応答開始済みなら切断) で終える
const server = http.createServer((req, res) => {
  handleRequest(req, res).catch((e) => {
    console.error('request handler error', e);
    if (res.writableEnded) return;
    if (!res.headersSent) { res.statusCode = 500; res.end(); } else res.destroy();
  });
});

/** ホーム WS で正当に届く最大のメッセージは thumbnailUpload（サムネイル画像 64KiB の data URL で約 87.5KB。
 * server/thumbnails.ts の THUMBNAIL_MAX_BYTES と受付形式から算出）。それ以外のホーム用メッセージは
 * 長くても数 KB（文章は各所で 2,000 字までに切り詰められる）。上限はその最大の約 12 倍に置き、
 * 既定の 100MB 級フレームを受けて JSON.parse まで進むのをやめる。セッション内の操作（チャットの画像など）は
 * このソケットではなく kokosync 側を通るので、ここには含めない */
const HOME_WS_MAX_PAYLOAD = 1024 * 1024;
const wss = new WebSocketServer({ noServer: true, maxPayload: HOME_WS_MAX_PAYLOAD });
keepHomeSocketsAlive(wss);
server.on('upgrade', (req, socket, head) => {
  // リクエスト側と同じく、壊れた URL で例外にして落とさない
  let pathname: string;
  try { pathname = new URL(req.url ?? '/', 'http://local').pathname; } catch { socket.destroy(); return; }
  if (pathname === '/sync/ws') upgradeSync(req, socket, head);
  else if (pathname === '/ws') {
    // 本人はここで Cookie から決まり、hello では名乗らせない。セッションが無くてもつなぐのは、ログイン導入前の古い画面に
    // incompatible を返して再読み込みを促すため（今の画面はログインしてからつなぐ。セッションが無ければ hello で断る）
    void auth.accountOf(req, new URL(req.url ?? '/', 'http://local').searchParams).then((account) => {
      wss.handleUpgrade(req, socket, head, (ws) => wss.emit('connection', ws, req, account));
    }, (e) => { console.error('ws auth', e); socket.destroy(); });
  }
  else socket.destroy();
});
wss.on('connection', (ws: WebSocket, req: http.IncomingMessage, account: Account | null) => {
  let binding:AccountBinding|undefined;
  try{
    const origin=typeof req.headers.origin==='string'?new URL(req.headers.origin):undefined;
    if(origin&&origin.host===req.headers.host&&['http:','https:'].includes(origin.protocol)&&req.headers['sec-fetch-site']!=='cross-site')binding=fantasyAccounts.readBinding(req);
  }catch{}
  const state: HomeConnectionState = { id: null, account, accountBinding:binding, remoteAddress:req.socket.remoteAddress };
  homeConnections.set(ws, state);
  // maxPayload 超過などで ws が 'error' を出す。接続を閉じるのは ws 側が行う (超過時は 1009) が、
  // リスナーが無いと例外として投げられプロセスごと落ちるため、受けるだけのハンドラを置く
  ws.on('error', () => {});
  ws.on('message', (raw) => {
    try { handle(ws, state, JSON.parse(String(raw)) as ClientMsg); }
    catch (e) { console.error('bad message', e); }
  });
  ws.on('close', () => {const original=homeUser(state),actor=state.id?users.get(state.id):undefined;if(actor?.session&&worldOf.get(actor.session)==='fantasy')fantasyDiagnostics.record({type:'connection',actorId:actor.id,sessionId:actor.session,operation:'disconnect',status:'ok'});fantasyDialogueObserver.cancel(ws,'disconnect');homeConnections.delete(ws);onClose(ws,state.id);markHomeOffline(original);});
});

// 2D の人が他の人やアイテムと重なっていたら押し出す
setInterval(() => {
  // セッション別の振り分けはティックに1回だけ（inSession の全走査をセッション数ぶん回さない）
  const bySession = new Map<string | null, Participant[]>();
  for (const u of users.values()) {
    const list = bySession.get(u.session);
    if (list) list.push(u);
    else bySession.set(u.session, [u]);
  }
  for (const sid of sessionIds) {
    const here = bySession.get(sid) ?? [];
    if (here.some((u) => u.mode === '2d' && u.pos && !u.follow) && pushApart2D(here, avatars.get(sid)!, items.get(sid)!.values(), (p) => clamp2d(sid, p))) sendPresence(sid);
  }
}, 200);

const systemTick = setInterval(() => {
  const rooms = new Map<string, string[]>();
  for (const user of users.values()) if (user.session) { const ids = rooms.get(user.session) ?? []; ids.push(user.id); rooms.set(user.session, ids); }
  for (const [sid, participants] of rooms) {
    try {
      const changed = systems.tick(sid, participants);
      syncSystemItems(sid, false);
      for (const item of timedCameras.tick(sid, items.get(sid)?.values() ?? [], participants)) sendItem(sid, item);
      if (changed) roomSend(sid, { t: 'systemState', sid, view: systems.view(sid) });
    }
    catch (error) { console.error('system tick', sid, error); }
  }
}, 100);
systemTick.unref();

let shuttingDown=false;
for (const sig of ['SIGINT', 'SIGTERM'] as const) process.on(sig, () => {
  if(shuttingDown)return;shuttingDown=true;
  clearInterval(systemTick);
  systems.dispose();
  // まとめ待ちの保存も落とす前に積む
  saveSurvivorProfiles.flush();
  saveItems();
  saveHome.flush();
  saveFollows.flush();
  saveTimeline.flush();
  savePeople.flush();
  saveInbox.flush();
  fantasyClock.checkpoint(true);
  try{fantasyBackups.checkpoint('shutdown',true);}catch(error){console.error('[fantasy-backup] shutdown snapshot failed',error);}
  fantasyDiagnostics.record({type:'runtime.stop',status:'ok',droppedCount:fantasyDiagnostics.stats.dropped});
  const closeDiagnostics=Promise.race([fantasyDiagnostics.close(),new Promise<void>(resolve=>{setTimeout(resolve,2000).unref();})]);
  // 積んだ DB への書き込みを流し切ってから閉じる
  Promise.allSettled([shutdownRooms(), drain().then(closeDb), closeDiagnostics]).finally(()=>{fantasyBackups.releaseRuntime();process.exit(0);});
});
process.on('exit',()=>fantasyBackups.releaseRuntime());

await loadDirectory();

server.listen(PORT, () => {
  fantasyDiagnostics.record({type:'runtime.start',status:'ok',operation:'server'});
  console.log(`server on http://localhost:${PORT}`);
  console.log(`sessions: ${guild.sessions.map((w) => w.name).join(' ')}`);
  if (!process.env.LIVEKIT_URL) console.warn('LIVEKIT_* が未設定: 音声・画面共有は無効になります');
});
