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
import { COMPAT_VERSION, PLAN_QUORUM, ROOM_HALF, STATUS_INFO, STATUS_TEXT_MAX, VISIBILITY_INFO, channelKey, isGroupVisibility } from '../shared/protocol.ts';
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
import { MEDIA_DIR, mediaExists, pipeFile, saveMedia, serveMedia } from './media.ts';
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
import { BrowserAiBroker } from './browser-ai.ts';
import { BrowserAiPool } from './browser-ai-pool.ts';
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
const browserAiPool = new BrowserAiPool();
const ROOT = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');
const DIST = path.join(ROOT, 'client/dist');
// index.html は読み込むファイル名にハッシュを含むので、画面が変わったときだけ版が変わる
const CLIENT_VERSION = (() => {
  if (DEV) return null;
  try { return createHash('sha1').update(fs.readFileSync(path.join(DIST, 'index.html'))).digest('hex').slice(0, 12); } catch { return null; }
})();
const DATA_DIR = process.env.DATA_DIR ?? path.join(ROOT, 'data');
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
const ICON_DIR = path.join(DATA_DIR, 'icons');
const AVATAR_DIR = path.join(DATA_DIR, 'avatars');
const PROFILE_DIR = path.join(DATA_DIR, 'profiles');
const FRIENDS_FILE = path.join(DATA_DIR, 'friends.json');
const FOLLOWS_FILE = path.join(DATA_DIR, 'follows.json');
const TIMELINE_FILE = path.join(DATA_DIR, 'timeline.json');
const TIMELINE_IMAGE_DIR = path.join(DATA_DIR, 'timeline-images');
const HOME_FILE = path.join(DATA_DIR, 'home.json');
const GROUP_IMAGE_DIR = path.join(DATA_DIR, 'group-images');
const REPORTS_FILE = path.join(DATA_DIR, 'reports.log');
const MESSAGES_FILE = path.join(DATA_DIR, 'messages.json');
const PEOPLE_FILE = path.join(DATA_DIR, 'people.json');
const ITEMS_FILE = path.join(DATA_DIR, 'items.json');
const SURVIVORS_FILE = path.join(DATA_DIR, 'survivors.json');
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
const AD_SAVES_FILE = path.join(DATA_DIR, 'ad-saves.json');
const AD_LEADERBOARD_FILE = path.join(DATA_DIR, 'ad-leaderboard.json');
/** 2 人以上がこの時間以上いたセッションだけ、グループのチャンネルにまとめを残す */
const RECAP_MIN_MS = Number(process.env.RECAP_MIN_MINUTES ?? 10) * 60_000;
function readJson<T>(file: string, fallback: T): T {
  try { return JSON.parse(fs.readFileSync(file, 'utf-8')) as T; } catch { return fallback; }
}
/** ユーザー由来のキー（ID・名前）を入れるレコードは prototype を持たせない。__proto__ 等も通常のキーとして扱い、Object.prototype を汚染させない */
function newRecord<T>(): Record<string, T> { return Object.create(null) as Record<string, T>; }
function nullRecord<T>(obj: Record<string, T>): Record<string, T> { return Object.assign(newRecord<T>(), obj); }
/** 書き込みが続いてもまとめて 1 回にする。flush は保留分をその場で流す（終了時の保存用） */
function later(fn: () => void, ms = 800) {
  let t: ReturnType<typeof setTimeout> | null = null;
  // 失敗で落とさない。従来の非同期書き込みもエラーを握りつぶしていたし、終了時に 1 件の失敗で他を巻き込まないため
  const run = () => { t = null; try { fn(); } catch { /* noop */ } };
  const trigger = () => { if (!t) t = setTimeout(run, ms); };
  trigger.flush = () => { if (t) { clearTimeout(t); run(); } };
  return trigger;
}
for (const d of [ICON_DIR, AVATAR_DIR, PROFILE_DIR, MEDIA_DIR, GROUP_IMAGE_DIR]) fs.mkdirSync(d, { recursive: true });
const MARKET_LIKES_FILE = path.join(DATA_DIR, 'market-likes.json');
const marketLikes = new MarketLikes(readJson<unknown>(MARKET_LIKES_FILE, {}));
const saveMarketLikes = later(() => fs.writeFileSync(MARKET_LIKES_FILE, JSON.stringify(marketLikes.serialize())));
const survivorProfiles = nullRecord(readJson<Record<string, SurvivorProfile>>(SURVIVORS_FILE, {}));
const saveSurvivorProfiles = later(() => fs.writeFileSync(SURVIVORS_FILE, JSON.stringify(survivorProfiles)));
/** AD のセーブとランキングは Tonarium サーバー内で完結する（Workers は使わない） */
interface AdLeaderboardEntry { playerId: string; name: string; antimatterLog10: number; infinities: number; playTimeSec: number }
const adSaves = nullRecord(readJson<Record<string, { save: unknown; updatedAt: string }>>(AD_SAVES_FILE, {}));
const adLeaderboard = readJson<AdLeaderboardEntry[]>(AD_LEADERBOARD_FILE, []);
/** AD の保存は 30 秒に 1 回程度のため、survivors のデバウンス書きとは別に tmp＋リネームで同期書きする（再起動後も残る） */
function writeJsonAtomic(file: string, value: unknown): void {
  const tmp = `${file}.tmp`;
  fs.writeFileSync(tmp, JSON.stringify(value));
  fs.renameSync(tmp, file);
}
const saveAdSaves = () => writeJsonAtomic(AD_SAVES_FILE, adSaves);
const saveAdLeaderboard = () => writeJsonAtomic(AD_LEADERBOARD_FILE, adLeaderboard);
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

const normalizeName = (name: string) => name.trim().slice(0, 24) || 'ゲスト';
const nameHash = (name: string) => createHash('sha1').update(normalizeName(name)).digest('hex');
const iconFile = (name: string) => path.join(ICON_DIR, `${nameHash(name)}.jpg`);
const avatarImageFile = (name: string) => path.join(AVATAR_DIR, `${nameHash(name)}.img`);
const avatarParamsFile = (name: string) => path.join(AVATAR_DIR, `${nameHash(name)}.json`);
const profileFile = (name: string) => path.join(PROFILE_DIR, `${nameHash(name)}.json`);
// mtime とサイズが変わっていなければ前回の読み結果を使い、変わったら読み直す（サーバー経由・外部どちらの変更も検出できる）
const bioCache = new Map<string, { mtimeMs: number; size: number; bio: string }>();
function bioOf(name: string) {
  const file = profileFile(name);
  let stat: fs.Stats | undefined;
  try { stat = fs.statSync(file); } catch { stat = undefined; }
  if (!stat) { bioCache.delete(file); return ''; }
  const cached = bioCache.get(file);
  if (cached && cached.mtimeMs === stat.mtimeMs && cached.size === stat.size) return cached.bio;
  let bio = '';
  try { bio = String((JSON.parse(fs.readFileSync(file, 'utf-8')) as { bio?: unknown }).bio ?? ''); } catch { /* 壊れたプロフィールは従来どおり空として扱う */ }
  bioCache.set(file, { mtimeMs: stat.mtimeMs, size: stat.size, bio });
  return bio;
}
const mtime = (file: string) => { try { return Math.floor(fs.statSync(file).mtimeMs); } catch { return 0; } };
const iconVersion = (name: string) => { const v = mtime(iconFile(name)); return v ? String(v) : null; };
function avatarVersion(name: string) {
  const v = Math.max(mtime(avatarImageFile(name)), mtime(avatarParamsFile(name)));
  return v ? String(v) : null;
}
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
try { Object.assign(home, JSON.parse(fs.readFileSync(HOME_FILE, 'utf-8'))); } catch { /* まだ無い */ }
home.renamed = nullRecord(home.renamed);
for (const d of guild.sessions) d.name = home.renamed[d.id] ?? d.name;
const defaultChannels = () => [{ id: 'general', name: '雑談' }];
for (const g of home.groups) {
  if (!g.channels?.length) g.channels = defaultChannels();
  g.editors = [...new Set((g.editors ?? []).filter((n) => n !== g.owner && g.members.includes(n)))];
}
const canEditGroup = (g: Group, name: string) => g.owner === name || !!g.editors?.includes(name);
const groupImageFile = (g: Group, ext = 'jpg') => path.join(GROUP_IMAGE_DIR, `${g.id}.${ext}`);
function deleteGroupImages(g: Group, keep?: string) {
  for (const ext of ['jpg', 'jpeg', 'png', 'webp']) {
    if (ext !== keep) fs.rmSync(groupImageFile(g, ext), { force: true });
  }
}
for (const ev of home.events) { ev.maybe ??= []; ev.declined ??= []; }
guild.sessions.push(...home.sessions);
/** 開始から 30 日以上過ぎたイベントは残さない。当日のものや開始時刻が読めないものは消さない */
function pruneOldEvents() {
  home.events = pruneEvents(home.events, Date.now());
}
const eventsBeforePrune = home.events.length;
pruneOldEvents();
// home はメモリ側が正で、ファイルへの書き込みは savePeople などと同じく遅らせてまとめる
const saveHome = later(() => fs.writeFileSync(HOME_FILE, JSON.stringify(home)));
if (home.events.length !== eventsBeforePrune) saveHome();
// 常駐中に 30 日を跨いだイベントも残り続けないよう、起動時・作成時だけでなく日次でも剪定する
setInterval(() => {
  const before = home.events.length;
  pruneOldEvents();
  if (home.events.length !== before) { saveHome(); broadcastEvents(); }
}, 24 * 60 * 60 * 1000);
const sessionIds = new Set(guild.sessions.map((w) => w.id));
const shortId = () => randomUUID().slice(0, 8);

// フォローは名前の組で保存する（アイコンなどと同じく名前が本人の識別）。お互いにフォローしているとフレンド。
// follows.json が無いときは旧 friends.json のフレンドを相互フォローとして引き継ぐ（friends.json は書き換えない）
const follows = fs.existsSync(FOLLOWS_FILE)
  ? new Follows(readJson<[string, string][]>(FOLLOWS_FILE, []))
  : Follows.fromFriendPairs(readJson<[string, string][]>(FRIENDS_FILE, []));
const saveFollows = later(() => fs.writeFileSync(FOLLOWS_FILE, JSON.stringify(follows.edges())));
if (!fs.existsSync(FOLLOWS_FILE)) saveFollows();
const friendsOf = (name: string) => follows.friendsOf(name);
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
const savedItems = nullRecord(readJson<Record<string, Item[]>>(ITEMS_FILE, {}));
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
  items.set(def.id, new Map((savedItems[def.id] ?? []).map((it) => [it.id, settle(it)])));
}
/** アイテムが変わったセッションの印。保存は印があるときだけ文字列化する（無変更でも 5 秒ごとに全アイテムを文字列化していたのをやめる） */
const dirtyItemSessions = new Set<string>();
const markItemsDirty = (sid: string) => { dirtyItemSessions.add(sid); };
const itemsJson = () => JSON.stringify(Object.fromEntries([...items].filter(([, m]) => m.size).map(([sid, m]) => [sid, [...m.values()]])));
function saveItems() {
  if (!dirtyItemSessions.size) return;
  dirtyItemSessions.clear();
  fs.writeFile(ITEMS_FILE, itemsJson(), () => {});
}
/** 終了時は保留分をその場で書き出す */
function flushItems() {
  if (!dirtyItemSessions.size) return;
  dirtyItemSessions.clear();
  try { fs.writeFileSync(ITEMS_FILE, itemsJson()); } catch { /* noop */ }
}
setInterval(saveItems, 5000);

interface PersonRec { status: StatusKind; statusText: string; recent: string[]; lastSeen: number | null; watchers: string[] }
const people = nullRecord(readJson<Record<string, PersonRec>>(PEOPLE_FILE, {}));
const savePeople = later(() => fs.writeFileSync(PEOPLE_FILE, JSON.stringify(people)));
function personRec(name: string) {
  return (people[name] ??= { status: 'online', statusText: '', recent: [], lastSeen: null, watchers: [] });
}

/** convs は会話ごとのメッセージ、reads は 名前 → 会話 → 読んだ時刻 */
const inboxRaw = readJson<{ convs: Record<string, Message[]>; reads: Record<string, Record<string, number>> }>(MESSAGES_FILE, { convs: {}, reads: {} });
const inbox = {
  convs: nullRecord(inboxRaw.convs ?? {}),
  reads: nullRecord(Object.fromEntries(Object.entries(inboxRaw.reads ?? {}).map(([name, r]) => [name, nullRecord(r)]))),
};
/** 保存のたびに受信箱全体を文字列化しないよう、会話ごと・名前ごとの JSON を覚えておき、変わった分だけ作り直す。
 * 中身を書き換える場所（pushMessage / 送信時の既読 / 既読 / RSVP）では、対応するキャッシュを必ず捨てること。
 * 組み立て結果は JSON.stringify(inbox) とバイト単位で一致する（キー順・キーと値の文字列化は同じ規則） */
const inboxPartJson = { convs: new Map<string, string>(), reads: new Map<string, string>() };
function inboxJson() {
  const part = (cache: Map<string, string>, key: string, value: unknown) => {
    let s = cache.get(key);
    if (s === undefined) { s = JSON.stringify(value) as string; cache.set(key, s); }
    return `${JSON.stringify(key)}:${s}`;
  };
  const convs = Object.keys(inbox.convs).map((k) => part(inboxPartJson.convs, k, inbox.convs[k])).join(',');
  const reads = Object.keys(inbox.reads).map((k) => part(inboxPartJson.reads, k, inbox.reads[k])).join(',');
  return `{"convs":{${convs}},"reads":{${reads}}}`;
}
const saveInbox = later(() => fs.writeFileSync(MESSAGES_FILE, inboxJson()));

/** セッションにだれかが入ってから全員が出るまで。終わったらまとめにする */
const visits = new Map<string, { from: number; people: Set<string>; log: Recap['log'] }>();
for (const w of guild.sessions) {
  registerSession(w);
  scheduleEmptyCheck(w.id);
}
// 配信のたびにフレンド全走査と全ユーザー配列化を人数分繰り返さないよう、1 回の配信で使い回す写し
interface UserSnapshot { all: Participant[]; friendsByName: Map<string, string[]>; onlineNames: Set<string> }
function snapshotUsers(): UserSnapshot {
  const all = homeUsers();
  return { all, friendsByName: follows.friendMap(), onlineNames: new Set(all.map((u) => u.name)) };
}
// 写しが渡されたとき（配信の一括計算）だけそれを使い、単発呼び出しでは全体の写しを作らない。
// friendsOf と friendsByName は同じ follows から求めるので、対象者の集合は写し経由と一致する
const sessionsVisibleTo = (name: string, snap?: UserSnapshot) => {
  const friends = snap ? snap.friendsByName.get(name) ?? [] : friendsOf(name);
  const all = snap ? snap.all : homeUsers();
  return guild.sessions.filter((d) => canSeeSession(d, name, friends, home.groups, all));
};
const broadcastSessions = () => { const snap = snapshotUsers(); for (const [ws, state] of homeConnections) { const user = homeUser(state); if (user) send(ws, { t: 'sessions', list: sessionsVisibleTo(user.name, snap) }); } };
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
const idsByName = (name: string) => homeUsers().filter((u) => u.name === name).map((u) => u.id);
const isOnline = (name: string) => homeUsers().some((u) => u.name === name);

/** 会話に入っている人の名前。会話として成り立たなければ null */
function convMembers(conv: string): string[] | null {
  if (conv.startsWith('dm:')) {
    const pair = conv.slice(3).split('\u0000');
    return pair.length === 2 && follows.isFriend(pair[0], pair[1]) ? pair : null;
  }
  const m = /^ch:([^:]+):([^:]+)$/.exec(conv);
  const g = m && home.groups.find((x) => x.id === m[1]);
  return g && g.channels.some((c) => c.id === m[2]) ? g.members : null;
}
function sendToNames(names: Iterable<string>, msg: ServerMsg) {
  const set = new Set(names);
  sendTo(homeUsers().filter((u) => set.has(u.name)).map((u) => u.id), msg);
}
function pushMessage(conv: string, m: Message) {
  const list = (inbox.convs[conv] ??= []);
  list.push(m);
  if (list.length > 300) list.shift();
  inboxPartJson.convs.delete(conv);
  saveInbox();
  sendToNames(convMembers(conv) ?? [], { t: 'msg', conv, m });
}
/** 見える会話だけ、新しい方から 100 件ずつ。
 * 全会話を走査せず、その人の会話のキーだけを組み立てて引く。拾う条件は convMembers と一致する
 * （DM はフレンド同士の組だけ、チャンネルは入っているグループのものだけ）。
 * 常駐の参加者インデックスは持たない（フレンド追加やグループの出入り・削除のたびに同期が必要で、ずれると会話が消えるため） */
function convsOf(name: string) {
  const out: Record<string, Message[]> = {};
  const take = (conv: string) => { const list = inbox.convs[conv]; if (list) out[conv] = list.slice(-100); };
  // DM のキーは名前順が正規形。保存済みデータに逆順のキー（旧データ）があっても従来どおり拾えるよう両方見る
  for (const f of friendsOf(name)) { take(`dm:${name}\u0000${f}`); take(`dm:${f}\u0000${name}`); }
  for (const g of home.groups) if (g.members.includes(name)) for (const c of g.channels) take(channelKey(g.id, c.id));
  return out;
}

/** フレンドと、同じグループの人 */
function knownPeopleOf(name: string, friendsByName?: Map<string, string[]>) {
  // 写しが渡されたらそれだけを使う（無い人はフレンドなし）。friendsOf へ落とすと配信の人数分だけ全走査が戻ってしまう
  const set = new Set(friendsByName ? friendsByName.get(name) ?? [] : friendsOf(name));
  for (const g of home.groups) if (g.members.includes(name)) for (const m of g.members) set.add(m);
  set.delete(name);
  return [...set];
}
function personOf(name: string, onlineNames?: Set<string>): Person {
  const r = personRec(name);
  return { name, status: r.status, statusText: r.statusText, lastSeen: (onlineNames ? onlineNames.has(name) : isOnline(name)) ? null : r.lastSeen };
}
const watchingOf = (name: string) => Object.entries(people).filter(([, r]) => r.watchers.includes(name)).map(([n]) => n);
function sendWatching(name: string) {
  sendToNames([name], { t: 'watching', names: watchingOf(name), recentStatus: personRec(name).recent });
}
function broadcastPeople() {
  const snap = snapshotUsers();
  for (const [ws, state] of homeConnections) { const user = homeUser(state); if (user) send(ws, { t: 'people', list: knownPeopleOf(user.name, snap.friendsByName).map((n) => personOf(n, snap.onlineNames)) }); }
}
function followsMsg(name: string, friendMap?: Map<string, string[]>): ServerMsg {
  return { t: 'follows', following: follows.following(name), followers: follows.followers(name), fof: follows.friendsOfFriends(name, friendMap) };
}
// フレンドのフレンドはだれかのフォロー 1 つで遠くの人まで変わるので、全員に送り直す
function broadcastFollows() {
  const map = follows.friendMap();
  for (const name of new Set(homeUsers().map((u) => u.name))) sendToNames([name], followsMsg(name, map));
}

const saveTimeline = later(() => fs.writeFileSync(TIMELINE_FILE, timeline.serialize()));
const timeline = new Timeline(TIMELINE_FILE, TIMELINE_IMAGE_DIR, () => saveTimeline());
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
      if (!timeline.allow(`post:${me.name}`, POST_RATE)) return true;
      const here = me.session ? guild.sessions.find((d) => d.id === me.session) : undefined;
      const post = timeline.create(me.name, msg, {
        place: msg.withPlace && here ? { sid: here.id, name: publicSessionName(here), mode: me.mode } : null,
        session: (id) => {
          const def = guild.sessions.find((d) => d.id === id);
          return def && canSeeSession(def, me.name, friendsOf(me.name), home.groups, homeUsers()) ? { name: publicSessionName(def) } : null;
        },
      });
      if (!post) return true;
      broadcast({ t: 'post', p: post });
      const gone = timeline.prune();
      if (gone.length) broadcast({ t: 'postsRemoved', ids: gone });
      return true;
    }
    case 'postDelete': {
      const gone = timeline.remove(msg.id, me.name);
      if (gone.length) broadcast({ t: 'postsRemoved', ids: gone });
      return true;
    }
    case 'postReact':
    case 'postRepost': {
      const p: Post | null = msg.t === 'postReact' ? timeline.react(msg.id, me.name, msg.emoji, !!msg.on) : timeline.repost(msg.id, me.name, !!msg.on);
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
  const recap: Recap = { session: sid, sessionName: def.name, from: v.from, to: Date.now(), people: [...v.people], items: left.slice(0, 6), log: v.log };
  pushMessage(channelKey(g.id, g.channels[0].id), { id: randomUUID(), from: '', at: Date.now(), text: '', recap });
}
/** 途中参加のスナップショットが重くならないよう、古い画像は捨てる */
const MAX_IMAGES = 40;

function chatMedia(m: ChatMedia | undefined): ChatMedia | undefined {
  if (!m || typeof m.url !== 'string' || !MEDIA_URL_RE.test(m.url) || !mediaExists(m.url)) return undefined;
  const kind = /\.(mp4|webm)$/.test(m.url) ? 'video' : 'image';
  const size = (n: number) => Math.max(1, Math.min(10000, Math.round(Number(n) || 1)));
  return { kind, url: m.url, w: size(m.w), h: size(m.h) };
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
  if (visit && from && text && m.scope !== 'near' && visit.log.length < 200) visit.log.push({ name: from.name, text: text.slice(0, 300), at: m.at });
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
      ...((it.kind === 'image' || it.kind === 'video') ? mediaTransform(it) : {}) });
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
  browserAiPool.cancelOwner(u.id);
  for (const connection of homeConnections.values()) if (connection.id === u.id) connection.browserAi.cancelPending();
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

interface HomeConnectionState {
  id: string | null;
  homeId?: string;
  homeUser?: Participant;
  accountBinding?: AccountBinding;
  syncRequest?: string;
  browserAi: BrowserAiBroker;
  remoteAddress?: string;
  testModeSent?: boolean;
}
function homeUser(state:HomeConnectionState):Participant|undefined {
  const active=state.id?users.get(state.id):undefined,original=state.homeUser??active,id=state.homeId??state.id;
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
  for(const [ws,state]of homeConnections)if(ws.readyState===WebSocket.OPEN&&state.id===id){const user=homeUser(state);if(user?.name===actor.name)return user;}
  return undefined;
}
function updateHomeUser(name:string,fields:Partial<Participant>):void {
  for(const state of homeConnections.values())if(state.homeUser?.name===name)Object.assign(state.homeUser,fields);
  for(const user of users.values())if(user.name===name)Object.assign(user,fields);
}
function markHomeOffline(user:Participant|undefined):void {
  if(user&&!isOnline(user.name)){personRec(user.name).lastSeen=Date.now();savePeople();broadcastPeople();}
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
  let next=users.get(target);
  if(!next){const source=target===state.homeId?state.homeUser??old:old;next={...source,id:target,session:null,mode:'2d',follow:null,pos:null,micOn:false,sharing:false,viewing:[],viewLive:false,display:null};users.set(target,next);}
  else if(target.startsWith('fantasy:')&&![...sockets.get(target)??[]].some(fantasySocketAuthorized)){
    const source=state.homeUser??old;Object.assign(next,{name:source.name,icon:source.icon,avatar:source.avatar,bio:source.bio,status:source.status,statusText:source.statusText});
  }
  fantasyDialogueObserver.cancel(ws,'identity-changed');
  state.syncRequest=undefined;state.browserAi.cancelPending();browserAiPool.cancelOwner(old.id);
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
    if (typeof msg.id !== 'string' || !msg.id || msg.id.length > 128 || msg.id.startsWith('fantasy:') || typeof msg.name !== 'string' || (state.id && state.id !== msg.id)) return;
    // 互換性バージョンが違う（申告が無い旧クライアントを含む）と通信の約束事が食い違うので、状態を渡さず接続を断つ
    if (msg.compat !== COMPAT_VERSION) {
      send(ws, { t: 'incompatible', compat: COMPAT_VERSION });
      ws.close();
      return;
    }
    // __proto__ は ID として受け付けない。レコードのキーや msgpack のマップキーに流れると壊れるため（正規クライアントの ID は UUID で、該当しない）
    if (msg.id === '__proto__') return;
    state.id = msg.id;
    state.homeId=msg.id;
    if (!state.testModeSent) {
      send(ws, { t: 'fantasyTestMode', enabled: fantasyTestToolsAllowed(process.env.FANTASY_TEST_TOOLS, state.remoteAddress) });
      state.testModeSent = true;
    }
    const name = normalizeName(msg.name);
    const rec = personRec(name);
    const cameOnline = !isOnline(name);
    const lastSeen = rec.lastSeen;
    if (!users.has(msg.id))
      users.set(msg.id, {
        id: msg.id, name, session: null, mode: '2d',
        micOn: false, sharing: false, follow: null, pos: null,
        icon: iconVersion(msg.name), avatar: avatarVersion(msg.name), bio: bioOf(msg.name), status: rec.status, statusText: rec.statusText,
        viewing: [], viewLive: false, display: null,
      });
    if (!sockets.has(msg.id)) sockets.set(msg.id, new Set());
    sockets.get(msg.id)!.add(ws);
    state.homeUser={...users.get(msg.id)!,viewing:[...users.get(msg.id)!.viewing]};
    send(ws, {
      t: 'snapshot',
      s: {
        guild: { ...guild, sessions: sessionsVisibleTo(normalizeName(msg.name)) },
        users: usersForConnection(state),
        friends: friendsOf(normalizeName(msg.name)),
        groups: home.groups,
        events: home.events,
        sessions: allSessionInfo(),
        now: Date.now(),
        version: CLIENT_VERSION,
      },
    });
    send(ws, {
      t: 'inbox', convs: convsOf(name), reads: inbox.reads[name] ?? {}, people: knownPeopleOf(name).map((n) => personOf(n)),
      watching: watchingOf(name), lastSeen, recentStatus: rec.recent,
    });
    send(ws, { t: 'survivorProfile', profile: survivorProfile(msg.id) });
    if(fantasyAccountTestBypass(state)){
      const fantasy = fantasyStore.synchronize(msg.id);
      if (fantasy.changed) sendTo([msg.id], { t: 'fantasyProfile', profile: fantasy.profile });
      else send(ws, { t: 'fantasyProfile', profile: fantasy.profile, error: fantasy.error ?? fantasyStore.loadError ?? fantasyClock.error });
      send(ws, { t: 'fantasyPartyState', state: fantasyParty.state(msg.id) });
      send(ws, { t: 'communityState', state: fantasyCommunity.state(communityActor(users.get(msg.id)!)) });
      publishFantasyWorld(users.get(msg.id)!);
    } else fantasyAccountState(ws,state);
    send(ws, { t: 'fantasyClock', clock: fantasyClock.snapshot() });
    send(ws, { t: 'marketLikes', ...marketLikes.snapshot(msg.id) });
    send(ws, followsMsg(name));
    send(ws, { t: 'posts', list: timeline.posts });
    broadcastUsers();
    if (cameOnline) {
      // 来たら知らせる は 1 回きり
      const watchers = rec.watchers;
      rec.watchers = [];
      if (watchers.length) savePeople();
      for (const w of watchers) { sendToNames([w], { t: 'online', from: msg.id, fromName: name }); sendWatching(w); }
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
  if(msg.t==='aiSupport'){
    const receiving=state.browserAi.allowsRemote;
    const accepted=state.browserAi.setReady(msg.ready===true&&(!me.session||worldOf.get(me.session)!=='fantasy'||!fantasySocketAuthorized(ws))?{...msg,ready:false}:msg);
    if(accepted&&receiving&&!state.browserAi.allowsRemote)browserAiPool.cancelOwner(me.id);
    return;
  }
  if(msg.t==='aiSupportResult'||msg.t==='aiSupportChunk'){state.browserAi.result(msg);return;}
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
      browserAiPool.cancelOwner(me.id);
      for (const connection of homeConnections.values()) if (connection.id === me.id) connection.browserAi.cancelPending();
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
    const releaseConversation=inFantasy&&validDialogue?browserAiPool.beginConversation(me.id):()=>{};
    if(inFantasy&&validDialogue&&(profile.activity||profile.combatId||fantasyStore.civicBlocked(me.id))){
      releaseConversation();
      send(ws,{t:'npcReply',requestId:msg.requestId,npcId:msg.npcId,locale:msg.locale,text:{ko:'하던 일을 마친 뒤에 다시 이야기하자.',en:'Let us talk after you have finished what you are doing.',ja:'今の用事が終わってから、また話しましょう。'}[msg.locale],model:'',source:'canon',relationship:'familiar',error:'busy'},npcDiagnosticToken);return;
    }
    if(inFantasy&&validDialogue){
      const apply=(revision:number,action:import('../shared/fantasy.ts').FantasyAction)=>applyFantasyUserAction(contractActor(me),revision,action);
      const context={user:me.id,speaker:msg.npcId,locale:msg.locale,profile,marketQuote:(action:import('../shared/fantasy.ts').FantasyAction)=>fantasyMarketQuote(me,action,msg.locale),text:msg.text};
      const land = fantasyPropertyDialogue.chat({user:me.id,npc:msg.npcId,text:msg.text,locale:msg.locale,profile,state:fantasyStore.propertyState(me.id),requestId:msg.requestId},command=>{
        const result=fantasyStore.propertyRequest(me.id,command);for(const update of result.updates)sendTo([update.user],{t:'fantasyProfile',profile:update.profile});return result;
      },()=>fantasyStore.propertyState(me.id));
      if(land.handled){releaseConversation();send(ws,{t:'npcReply',requestId:msg.requestId,npcId:msg.npcId,locale:msg.locale,text:land.text??'',model:'',source:'canon',relationship:'familiar'},npcDiagnosticToken);send(ws,{t:'fantasyPropertyState',state:fantasyStore.propertyState(me.id)});publishFantasyRealms();return;}
      const bargain=fantasyBargaining.chat({...context,npcId:msg.npcId},apply);
      const conversation=bargain.handled?bargain:fantasyConversationActions.confirm(context,apply);
      if(conversation.handled){
        releaseConversation();
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
      browserGenerate:inFantasy?(personal,signal,shared,progress)=>browserAiPool.generateFor(me.id,npcConversationSession!,state.browserAi,personal,signal,shared,progress):undefined,onProgress:inFantasy?text=>{if(conversationCurrent())send(ws,{t:'fantasyDialogueChunk',kind:'npc',requestId:msg.requestId,locale:msg.locale,npcId:msg.npcId,text});}:undefined,isCurrent:conversationCurrent,completedQuests: character?.completed ?? [], character,
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
    },error=>{console.error('[npc] request failed',error);send(ws,{t:'npcReply',requestId:msg.requestId,text:'',model:'',npcId:'rin',locale:'en',relationship:'stranger',error:'unavailable'},npcDiagnosticToken);}).finally(releaseConversation);
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
    const releaseConversation=me.session&&world==='fantasy'&&validDialogue?browserAiPool.beginConversation(me.id):()=>{};
    if(me.session&&world==='fantasy'&&validDialogue){
      const confirmed=fantasyConversationActions.confirm({user:me.id,speaker:'gm',locale:msg.locale,profile,marketQuote:action=>fantasyMarketQuote(me,action,msg.locale),text:msg.text},(revision,action)=>applyFantasyUserAction(contractActor(me),revision,action));
      if(confirmed.handled){
        releaseConversation();
        if(confirmed.result)sendTo([me.id],{t:'fantasyProfile',profile:confirmed.result.profile,error:confirmed.result.error});
        send(ws,{t:'fantasyGmReply',requestId:msg.requestId,locale:msg.locale,source:'rules',reply:{text:confirmed.result?.error?{ko:'지금은 진행할 수 없습니다. 현재 상태를 확인해 주세요.',en:'This cannot be started now. Please check your current state.',ja:'今は開始できません。現在の状態を確認してください。'}[msg.locale]:confirmed.text??'',suggestions:[]}},gmDiagnosticToken);publishFantasyWorld(me);return;
      }
    }
    const conversationSession=me.session;
    const conversationCurrent=()=>{
      const current=fantasyStore.profile(me.id);
      return ws.readyState===WebSocket.OPEN&&fantasySocketAuthorized(ws)&&state.id===me.id&&current.revision===profile.revision&&(current.generation??1)===(profile.generation??1)&&current.character?.lifeStartedAt===profile.character?.lifeStartedAt&&current.character?.location===profile.character?.location&&users.get(me.id)?.session===conversationSession&&worldOf.get(conversationSession??'')===world;
    };
    void fantasyGmChat.chat(me.id+':life-'+(profile.generation??1), { requestId: msg.requestId, text: msg.text, locale: msg.locale }, { browserGenerate:me.session&&world==='fantasy'?(personal,signal,shared,progress)=>browserAiPool.generateFor(me.id,conversationSession!,state.browserAi,personal,signal,shared,progress):undefined,onProgress:text=>{if(conversationCurrent())send(ws,{t:'fantasyDialogueChunk',kind:'gm',requestId:msg.requestId,locale:msg.locale,text});},isCurrent:conversationCurrent,session: me.session, world, profile, dynamicFacts: gmDynamicFacts, communityFacts: [...fantasyCommunity.facts(communityActor(me), msg.locale), ...fantasyStore.legacyFacts(me.id, msg.locale), ...fantasyStore.realmFacts(me.id,msg.locale)] })
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
      }).finally(releaseConversation);
    return;
  }
  if (msg.t === 'marketLike') {
    const original = homeUser(state) ?? me;
    if (marketLikes.like(msg.product, original.id)) {
      saveMarketLikes();
      for (const [socket, connection] of homeConnections) {
        const user = homeUser(connection);
        if (user) send(socket, { t: 'marketLikes', ...marketLikes.snapshot(user.id) });
      }
    } else send(ws, { t: 'marketLikes', ...marketLikes.snapshot(original.id) });
    return;
  }
  if (msg.t === 'profileUpdated') {
    const original=homeUser(state)??me;
    const icon = iconVersion(original.name);
    const avatar = avatarVersion(original.name);
    const bio = bioOf(original.name);
    updateHomeUser(original.name,{icon,avatar,bio});
    broadcastUsers();
    return;
  }
  if (msg.t === 'followUser') {
    const original = homeUser(state) ?? me;
    const target = typeof msg.name === 'string' ? msg.name : '';
    // 一度でも来たことのある名前だけ。打ち間違いや存在しない名前の辺を溜めない
    if (target === original.name || !Object.hasOwn(people, target)) return;
    const changed = msg.on ? follows.add(original.name, target) : follows.remove(original.name, target);
    if (!changed) return;
    saveFollows();
    const noticeKey = `${original.name}\u0000${target}`;
    if (msg.on && !(Date.now() - (followNoticeAt.get(noticeKey) ?? 0) < FOLLOW_NOTICE_MS)) {
      followNoticeAt.set(noticeKey, Date.now());
      sendToNames([target], { t: 'followed', from: original.id, fromName: original.name });
    }
    for (const n of [original.name, target]) sendToNames([n], { t: 'friends', names: friendsOf(n) });
    broadcastFollows();
    broadcastSessions();
    broadcastPeople();
    return;
  }
  const original = homeUser(state) ?? me;
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
      if (!def || !canSeeSession(def, original.name, friendsOf(original.name), home.groups, homeUsers())) {
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
      const visit = visits.get(msg.sid) ?? { from: Date.now(), people: new Set<string>(), log: [] };
      visit.people.add(entering.name);
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
      if (msg.media && 'url' in msg.media && !mediaExists(msg.media.url)) return;
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
      const media = it.kind === 'image' || it.kind === 'video';
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
      const group = isGroupVisibility(visibility) ? home.groups.find((g) => g.id === msg.group && g.members.includes(me.name))?.id : undefined;
      if (!name || (isGroupVisibility(visibility) && !group)) {
        if (msg.requestId) send(ws, { t: 'sessionResult', requestId: msg.requestId, error: !name ? 'セッション名を入力してください' : 'このグループには所属していません' });
        return true;
      }
      const def: SessionDef = { id: shortId(), name, topic: trimTo(msg.topic, 100), world: isWorldKind(msg.world) ? msg.world : 'room', visibility, owner: me.name, group, invited: [] };
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
      const def = home.sessions.find((d) => d.id === msg.id && d.owner === me.name);
      if (!def || [...users.values()].some((u) => u.session === def.id)) return true;
      destroyUserSession(def.id);
      return true;
    }
    case 'groupCreate': {
      const name = trimTo(msg.name, 40);
      if (!name) return true;
      home.groups.push({ id: shortId(), name, color: GROUP_COLORS.includes(msg.color) ? msg.color : GROUP_COLORS[0], owner: me.name, editors: [], members: [me.name], channels: defaultChannels() });
      saveHome();
      broadcastGroups();
      return true;
    }
    case 'groupUpdate': {
      const g = home.groups.find((x) => x.id === msg.groupId);
      if (!g || !canEditGroup(g, me.name)) return true;
      let changed = false;
      if (typeof msg.name === 'string') {
        const name = trimTo(msg.name, 40);
        if (name && name !== g.name) { g.name = name; changed = true; }
      }
      if (g.owner === me.name && Array.isArray(msg.editors)) {
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
      if (msg.t === 'groupJoin' && !g.members.includes(me.name)) g.members.push(me.name);
      if (msg.t === 'groupLeave') g.members = g.members.filter((n) => n !== me.name);
      g.editors = g.editors?.filter((n) => g.members.includes(n));
      saveHome();
      broadcastGroups();
      broadcastSessions();
      broadcastPeople();
      // チャンネルが見えるようになった・見えなくなったので、メッセージを送り直す
      sendToNames([me.name], { t: 'inbox', convs: convsOf(me.name), reads: inbox.reads[me.name] ?? {}, people: knownPeopleOf(me.name).map((n) => personOf(n)), watching: watchingOf(me.name), lastSeen: null, recentStatus: personRec(me.name).recent });
      return true;
    }
    case 'channelCreate': {
      const g = home.groups.find((x) => x.id === msg.group && x.owner === me.name);
      const name = trimTo(msg.name, 20).replace(/^#\s*/, '');
      if (!g || !name || g.channels.length >= 8 || g.channels.some((c) => c.name === name)) return true;
      g.channels.push({ id: shortId(), name });
      saveHome();
      broadcastGroups();
      return true;
    }
    case 'msg': {
      const members = convMembers(msg.conv);
      if (!members?.includes(me.name)) return true;
      const text = trimTo(msg.text, 2000);
      // Browsers record WebM/Opus; the native Windows client records AAC in MP4.
      // Both must still reference an uploaded file whose content type was sniffed.
      const voice = msg.voice && MEDIA_URL_RE.test(msg.voice.url) && /\.(webm|mp4)$/.test(msg.voice.url) && mediaExists(msg.voice.url)
        ? { url: msg.voice.url, sec: Math.max(1, Math.min(120, Math.round(Number(msg.voice.sec) || 1))) } : undefined;
      const media = chatMedia(msg.media);
      const at = Number(msg.plan?.at);
      const visible = sessionsVisibleTo(me.name);
      const plan = msg.plan && msg.conv.startsWith('ch:') && Number.isFinite(at)
        ? { at, session: visible.find((d) => d.id === msg.plan!.session)?.id ?? null, answers: { [me.name]: 'yes' as Rsvp }, event: null } : undefined;
      const invite = msg.invite && visible.some((d) => d.id === msg.invite) ? msg.invite : undefined;
      const it = msg.item && visible.some((d) => d.id === msg.item!.session) ? items.get(msg.item.session)?.get(msg.item.id) : undefined;
      const item = it ? { session: msg.item!.session, id: it.id, kind: it.kind, summary: itemSummary(it) ?? ITEM_INFO[it.kind].name } : undefined;
      if (!text && !voice && !media && !plan && !invite && !item) return true;
      pushMessage(msg.conv, {
        id: randomUUID(), from: me.name, at: Date.now(), text,
        ...(voice ? { voice } : {}), ...(media ? { media } : {}), ...(plan ? { plan } : {}), ...(invite ? { invite } : {}), ...(item ? { item } : {}),
      });
      // 送った会話は読んだことにする
      (inbox.reads[me.name] ??= newRecord())[msg.conv] = Date.now();
      inboxPartJson.reads.delete(me.name);
      return true;
    }
    case 'read': {
      if (!convMembers(msg.conv)?.includes(me.name)) return true;
      const reads = (inbox.reads[me.name] ??= newRecord());
      const at = Math.min(Date.now(), Number(msg.at) || 0);
      if (at <= (reads[msg.conv] ?? 0)) return true;
      reads[msg.conv] = at;
      inboxPartJson.reads.delete(me.name);
      saveInbox();
      sendToNames([me.name], { t: 'read', conv: msg.conv, at });
      return true;
    }
    case 'rsvp': {
      const m = inbox.convs[msg.conv]?.find((x) => x.id === msg.id);
      if (!m?.plan || !convMembers(msg.conv)?.includes(me.name)) return true;
      const plan = m.plan;
      if (msg.answer === null) delete plan.answers[me.name];
      else if (msg.answer === 'yes' || msg.answer === 'maybe' || msg.answer === 'no') plan.answers[me.name] = msg.answer;
      const who = (a: Rsvp) => Object.keys(plan.answers).filter((n) => plan.answers[n] === a);
      let ev = plan.event ? home.events.find((x) => x.id === plan.event) : undefined;
      // 剪定済みの古い日程相談 (開始が保持期間を過ぎている) からはイベントを作り直さない。
      // 回答の記録や既存イベントの出席更新は従来どおり行う
      if (!ev && who('yes').length >= PLAN_QUORUM && !isStaleEvent(plan.at, Date.now())) {
        const group = msg.conv.split(':')[1];
        ev = { id: shortId(), title: m.text.split('\n')[0].slice(0, 60) || '集まり', at: plan.at, group, session: plan.session, owner: m.from || me.name, attendees: [], maybe: [], declined: [] };
        pruneOldEvents();
        home.events.push(ev);
        home.events.sort((a, b) => a.at - b.at);
        plan.event = ev.id;
      }
      if (ev) { ev.attendees = who('yes'); ev.maybe = who('maybe'); ev.declined = who('no'); saveHome(); broadcastEvents(); }
      inboxPartJson.convs.delete(msg.conv);
      saveInbox();
      sendToNames(convMembers(msg.conv) ?? [], { t: 'msg', conv: msg.conv, m });
      return true;
    }
    case 'setStatus': {
      if (!Object.hasOwn(STATUS_INFO, msg.status)) return true;
      const rec = personRec(me.name);
      rec.status = msg.status;
      rec.statusText = trimTo(msg.text, STATUS_TEXT_MAX);
      if (rec.statusText) rec.recent = [rec.statusText, ...rec.recent.filter((t) => t !== rec.statusText)].slice(0, 5);
      savePeople();
      updateHomeUser(me.name,{status:rec.status,statusText:rec.statusText});
      broadcastUsers();
      broadcastPeople();
      sendWatching(me.name);
      return true;
    }
    case 'watch': {
      const name = normalizeName(msg.name);
      if (!friendsOf(me.name).includes(name)) return true;
      const rec = personRec(name);
      rec.watchers = rec.watchers.filter((n) => n !== me.name);
      if (msg.on) rec.watchers.push(me.name);
      savePeople();
      sendWatching(me.name);
      return true;
    }
    case 'askJoin': {
      const target = homeUserById(msg.to);
      if (!target?.session || target.status === 'busy' || !friendsOf(me.name).includes(target.name)) return true;
      sendTo([target.id], { t: 'askJoin', from: me.id, fromName: me.name, session: target.session });
      return true;
    }
    case 'groupDelete': {
      const g = home.groups.find((x) => x.id === msg.id && x.owner === me.name);
      if (!g) return true;
      home.groups.splice(home.groups.indexOf(g), 1);
      deleteGroupImages(g);
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
      const group = home.groups.find((g) => g.id === msg.group && g.members.includes(me.name))?.id ?? null;
      const session = sessionsVisibleTo(me.name).find((d) => d.id === msg.session)?.id ?? null;
      pruneOldEvents();
      home.events.push({ id: shortId(), title, at, group, session, owner: me.name, attendees: [me.name], maybe: [], declined: [] });
      home.events.sort((a, b) => a.at - b.at);
      saveHome();
      broadcastEvents();
      return true;
    }
    case 'eventAttend': {
      const ev = home.events.find((x) => x.id === msg.id);
      if (!ev) return true;
      for (const k of ['attendees', 'maybe', 'declined'] as const) ev[k] = ev[k].filter((n) => n !== me.name);
      if (msg.answer === 'yes') ev.attendees.push(me.name);
      if (msg.answer === 'maybe') ev.maybe.push(me.name);
      if (msg.answer === 'no') ev.declined.push(me.name);
      saveHome();
      broadcastEvents();
      return true;
    }
    case 'eventDelete': {
      const ev = home.events.find((x) => x.id === msg.id && x.owner === me.name);
      if (!ev) return true;
      home.events.splice(home.events.indexOf(ev), 1);
      saveHome();
      broadcastEvents();
      return true;
    }
    case 'invite': {
      const other = homeUserById(msg.to);
      // 取り込み中の人には誘いを届けない
      if (!other || other.name === me.name || other.status === 'busy') return true;
      if (msg.kind === 'session') {
        const def = guild.sessions.find((d) => d.id === msg.id);
        if (!def || !canSeeSession(def, me.name, friendsOf(me.name), home.groups, homeUsers())) return true;
        if (def.owner && !def.invited!.includes(other.name)) { def.invited!.push(other.name); saveHome(); broadcastSessions(); }
      } else if (!home.groups.find((g) => g.id === msg.id)?.members.includes(me.name)) return true;
      sendTo(idsByName(other.name), { t: 'invite', kind: msg.kind, id: msg.id, from: me.id, fromName: me.name });
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
  if (await fantasyAccounts.handleHttp(req, res)) return;
  if (url.pathname === '/api/content-translations') {
    res.setHeader('Content-Type', 'application/json; charset=utf-8');
    res.setHeader('Cache-Control', 'no-store');
    if (req.method !== 'GET' && req.method !== 'HEAD') { res.statusCode = 405; res.setHeader('Allow', 'GET, HEAD'); res.end('{}'); return; }
    res.end(req.method === 'HEAD' ? undefined : JSON.stringify(contentTranslations.catalog()));
    return;
  }
  if (sharedAssets.http(req, res, url.pathname)) return;
  if (systems.http(req, res, url.pathname)) return;
  if (url.pathname === '/api/translate') { await handleTranslation(req, res); return; }
  if (url.pathname === '/sync/offer') { await handleSyncOffer(req, res); return; }
  if (url.pathname === '/timeline-image') {
    if (req.method !== 'POST') { res.statusCode = 405; res.end(); return; }
    // 名前だけの本人確認は /icon と同じ。少なくともいまつないでいる人からしか受けない
    const uploader = normalizeName(url.searchParams.get('name') ?? '');
    if (!isOnline(uploader)) { res.statusCode = 403; res.end(); return; }
    if (!timeline.allow(`upload:${uploader}`, UPLOAD_RATE)) { res.statusCode = 429; res.end(); return; }
    const body = await readBody(req, POST_IMAGE_MAX_BYTES);
    if (!body) { res.statusCode = 413; res.end(); return; }
    if (!isJpeg(body)) { res.statusCode = 400; res.end(); return; }
    const id = timeline.newImageId();
    fs.writeFileSync(timeline.imageFile(id), body);
    timeline.registerUpload(id, uploader);
    res.setHeader('Content-Type', 'application/json');
    res.end(JSON.stringify({ id }));
    return;
  }
  if (url.pathname.startsWith('/timeline-image/')) {
    const id = url.pathname.slice('/timeline-image/'.length);
    if (req.method !== 'GET') { res.statusCode = 405; res.end(); return; }
    if (!isImageId(id) || !fs.existsSync(timeline.imageFile(id))) { res.statusCode = 404; res.end(); return; }
    res.setHeader('Content-Type', 'image/jpeg');
    res.setHeader('Cache-Control', 'public, max-age=31536000, immutable');
    pipeFile(res, timeline.imageFile(id));
    return;
  }
  if (url.pathname.startsWith('/group-image/')) {
    const g = home.groups.find((x) => x.id === url.pathname.slice('/group-image/'.length));
    if (req.method === 'POST') {
      const name = url.searchParams.get('name') ?? '';
      if (!g || !canEditGroup(g, name)) { res.statusCode = 204; res.end(); return; }
      const body = await readBody(req, ICON_MAX_BYTES);
      if (!body || !isJpeg(body)) { res.statusCode = 400; res.end(); return; }
      // 読み込み中の脱退・権限変更・削除も反映する。
      if (!home.groups.includes(g) || !canEditGroup(g, name)) { res.statusCode = 204; res.end(); return; }
      fs.writeFileSync(groupImageFile(g), body);
      deleteGroupImages(g, 'jpg');
      g.imageVersion = (g.imageVersion ?? 0) + 1;
      saveHome();
      broadcastGroups();
      res.setHeader('Content-Type', 'application/json');
      res.end(JSON.stringify({ imageVersion: g.imageVersion }));
      return;
    }
    if (req.method !== 'GET') { res.statusCode = 405; res.end(); return; }
    if (!g || !fs.existsSync(groupImageFile(g))) { res.statusCode = 404; res.end(); return; }
    res.setHeader('Content-Type', 'image/jpeg');
    res.setHeader('Cache-Control', url.searchParams.get('v') ? 'public, max-age=31536000, immutable' : 'no-cache');
    pipeFile(res, groupImageFile(g));
    return;
  }
  if (url.pathname === '/icon') {
    const name = url.searchParams.get('name') ?? '';
    if (req.method === 'POST') {
      const body = await readBody(req, ICON_MAX_BYTES);
      if (!body || !isJpeg(body)) { res.statusCode = 400; res.end(); return; }
      fs.writeFileSync(iconFile(name), body);
      res.end(JSON.stringify({ icon: iconVersion(name) }));
      return;
    }
    const file = iconFile(name);
    if (!fs.existsSync(file)) { res.statusCode = 404; res.end(); return; }
    res.setHeader('Content-Type', 'image/jpeg');
    // URL に版を付けて取得するので長期キャッシュしてよい
    res.setHeader('Cache-Control', url.searchParams.get('v') ? 'public, max-age=31536000, immutable' : 'no-cache');
    pipeFile(res, file);
    return;
  }
  if (url.pathname === '/avatar' || url.pathname === '/avatar/params') {
    const name = url.searchParams.get('name') ?? '';
    const isParams = url.pathname === '/avatar/params';
    const file = isParams ? avatarParamsFile(name) : avatarImageFile(name);
    if (req.method === 'POST') {
      const body = await readBody(req, isParams ? 20_000 : 6_000_000);
      if (!body) { res.statusCode = 413; res.end(); return; }
      if (isParams) {
        let params;
        try { params = sanitizeParams(JSON.parse(body.toString('utf-8'))); } catch { res.statusCode = 400; res.end(); return; }
        fs.writeFileSync(file, JSON.stringify(params));
      } else {
        if (!isPng(body) && !isJpeg(body)) { res.statusCode = 400; res.end(); return; }
        fs.writeFileSync(file, body);
      }
      res.end(JSON.stringify({ avatar: avatarVersion(name) }));
      return;
    }
    if (!fs.existsSync(file)) { res.statusCode = 404; res.end(); return; }
    const head = fs.readFileSync(file).subarray(0, 4);
    res.setHeader('Content-Type', isParams ? 'application/json' : isPng(head) ? 'image/png' : 'image/jpeg');
    res.setHeader('Cache-Control', url.searchParams.get('v') ? 'public, max-age=31536000, immutable' : 'no-cache');
    pipeFile(res, file);
    return;
  }
  if (url.pathname === '/profile') {
    const name = url.searchParams.get('name') ?? '';
    res.setHeader('Content-Type', 'application/json');
    if (req.method === 'POST') {
      const body = await readBody(req, 10_000);
      let bio = '';
      try { bio = String((JSON.parse(body?.toString('utf-8') ?? '') as { bio?: unknown }).bio ?? '').slice(0, 300); } catch { res.statusCode = 400; res.end(); return; }
      fs.writeFileSync(profileFile(name), JSON.stringify({ bio }));
      res.end(JSON.stringify({ bio }));
      return;
    }
    res.end(JSON.stringify({ bio: bioOf(name) }));
    return;
  }
  if (url.pathname === '/media' && req.method === 'POST') {
    res.setHeader('Content-Type', 'application/json');
    const r = await saveMedia(req);
    if ('error' in r) res.statusCode = r.status;
    res.end(JSON.stringify(r));
    return;
  }
  if (url.pathname.startsWith('/media/')) {
    serveMedia(req, res, url.pathname);
    return;
  }
  if (url.pathname === '/ogp') {
    res.setHeader('Content-Type', 'application/json');
    res.setHeader('Cache-Control', 'public, max-age=3600');
    res.end(JSON.stringify(await getOgp((url.searchParams.get('url') ?? '').slice(0, 2000))));
    return;
  }
  if (url.pathname === '/report' && req.method === 'POST') {
    const body = await readBody(req, 10_000);
    try {
      const r = JSON.parse(body?.toString('utf-8') ?? '') as { from?: unknown; target?: unknown; reason?: unknown };
      fs.appendFileSync(REPORTS_FILE, `${JSON.stringify({ at: new Date().toISOString(), from: String(r.from).slice(0, 24), target: String(r.target).slice(0, 24), reason: String(r.reason ?? '').slice(0, 500) })}\n`);
      console.log(`report: ${String(r.from)} -> ${String(r.target)}`);
    } catch { res.statusCode = 400; }
    res.end();
    return;
  }
  // AD の保存・ランキング。Tonarium にアカウント認証は無く、URL の playerId をキーとしてそのまま受け入れる。
  // Workers 版にあった他人セーブの 403 保護はここでは成立しない（docs/items.md の「AD ポータルと研究所パネル」参照）。
  const adSaveMatch = /^\/api\/save\/([^/]+)$/.exec(url.pathname);
  if (adSaveMatch) {
    let playerId: string;
    try { playerId = decodeURIComponent(adSaveMatch[1]).slice(0, 128); } catch { res.statusCode = 400; res.end('bad path'); return; }
    res.setHeader('Content-Type', 'application/json');
    if (req.method === 'GET') {
      const rec = playerId ? adSaves[playerId] : undefined;
      if (!rec) { res.statusCode = 404; res.end(JSON.stringify({ error: 'not found' })); return; }
      res.end(JSON.stringify({ save: rec.save }));
      return;
    }
    if (req.method === 'POST') {
      const body = await readBody(req, 1_000_000);
      if (!body || !playerId) { res.statusCode = 413; res.end(); return; }
      let parsed: { save?: unknown; updatedAt?: unknown } | null = null;
      try { parsed = JSON.parse(body.toString('utf-8')) as { save?: unknown; updatedAt?: unknown }; } catch { res.statusCode = 400; res.end(); return; }
      if (!parsed || typeof parsed.save !== 'object' || parsed.save === null || Array.isArray(parsed.save)) { res.statusCode = 400; res.end(); return; }
      adSaves[playerId] = { save: parsed.save, updatedAt: typeof parsed.updatedAt === 'string' ? parsed.updatedAt : new Date().toISOString() };
      try { saveAdSaves(); } catch { res.statusCode = 500; res.end(); return; }
      res.end(JSON.stringify({ ok: true }));
      return;
    }
    res.statusCode = 405; res.end(); return;
  }
  if (url.pathname === '/api/leaderboard') {
    res.setHeader('Content-Type', 'application/json');
    if (req.method === 'GET') {
      // playerId はセーブの読み書きキーそのものなので応答には含めない (#210)。
      // 自分の行の強調表示のため、クライアントが既に送っている X-User-Id と一致する行にだけ self を付ける。
      const selfId = typeof req.headers['x-user-id'] === 'string' ? req.headers['x-user-id'].slice(0, 128) : '';
      const entries = adLeaderboard.map(({ playerId, ...rest }) => (selfId && playerId === selfId ? { ...rest, self: true } : rest));
      res.end(JSON.stringify({ entries }));
      return;
    }
    if (req.method === 'POST') {
      const body = await readBody(req, 20_000);
      if (!body) { res.statusCode = 413; res.end(); return; }
      let e: Partial<AdLeaderboardEntry> | null = null;
      try { e = JSON.parse(body.toString('utf-8')) as Partial<AdLeaderboardEntry>; } catch { res.statusCode = 400; res.end(); return; }
      const num = (v: unknown) => (typeof v === 'number' && Number.isFinite(v) ? Math.max(0, v) : null);
      const antimatterLog10 = num(e?.antimatterLog10);
      const infinities = num(e?.infinities);
      const playTimeSec = num(e?.playTimeSec);
      const playerId = typeof e?.playerId === 'string' ? e.playerId.slice(0, 128) : '';
      const name = typeof e?.name === 'string' ? e.name.slice(0, 24) : '';
      if (!playerId || antimatterLog10 === null || infinities === null || playTimeSec === null) { res.statusCode = 400; res.end(); return; }
      const entry: AdLeaderboardEntry = { playerId, name, antimatterLog10, infinities, playTimeSec };
      const at = adLeaderboard.findIndex((x) => x.playerId === playerId);
      if (at >= 0) adLeaderboard[at] = entry; else adLeaderboard.push(entry);
      adLeaderboard.sort((a, b) => b.antimatterLog10 - a.antimatterLog10 || b.infinities - a.infinities);
      adLeaderboard.length = Math.min(adLeaderboard.length, 50);
      try { saveAdLeaderboard(); } catch { res.statusCode = 500; res.end(); return; }
      res.end(JSON.stringify({ ok: true }));
      return;
    }
    res.statusCode = 405; res.end(); return;
  }
  if (url.pathname === '/healthz') {
    res.setHeader('Content-Type', 'text/plain');
    res.end('ok');
    return;
  }
  if (url.pathname === '/token') {
    const { LIVEKIT_URL, LIVEKIT_API_KEY, LIVEKIT_API_SECRET } = process.env;
    const id = url.searchParams.get('id');
    const sid = url.searchParams.get('session') ?? '';
    res.setHeader('Content-Type', 'application/json');
    if (!LIVEKIT_URL || !LIVEKIT_API_KEY || !LIVEKIT_API_SECRET) {
      res.end(JSON.stringify({ error: 'LiveKit が未設定です (.env)' }));
      return;
    }
    // 申告された id/name をそのまま信じると、接続していない第三者が招待制セッションの発行権限まで取れてしまう。
    // WS 接続中で、そのセッションへの join（canSeeSession 通過済み）を終えた参加者にだけ、
    // サーバー側レコードの identity/name で発行する。拒否理由は区別せず同じ文言で返す
    const me = id ? users.get(id) : undefined;
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
    // OGP 用に、アクセスされたドメインの絶対 URL を埋める（Coolify の前段が付ける X-Forwarded-* を優先）
    const proto = String(req.headers['x-forwarded-proto'] ?? 'http').split(',')[0].trim();
    const host = String(req.headers['x-forwarded-host'] ?? req.headers.host ?? 'localhost').split(',')[0].trim();
    const origin = /^[\w.:[\]-]+$/.test(host) ? `${proto === 'https' ? 'https' : 'http'}://${host}` : '';
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
  else if (pathname === '/ws') wss.handleUpgrade(req, socket, head, (ws) => wss.emit('connection', ws, req));
  else socket.destroy();
});
wss.on('connection', (ws, req) => {
  let binding:AccountBinding|undefined;
  try{
    const origin=typeof req.headers.origin==='string'?new URL(req.headers.origin):undefined;
    if(origin&&origin.host===req.headers.host&&['http:','https:'].includes(origin.protocol)&&req.headers['sec-fetch-site']!=='cross-site')binding=fantasyAccounts.readBinding(req);
  }catch{}
  const state: HomeConnectionState = { id: null, accountBinding:binding,browserAi:new BrowserAiBroker(message=>send(ws,message)), remoteAddress:req.socket.remoteAddress };
  homeConnections.set(ws, state);
  const unregisterAi=browserAiPool.register(state.browserAi,{user:()=>state.id,session:()=>state.id?users.get(state.id)?.session??null:null,eligible:()=>ws.readyState===WebSocket.OPEN&&fantasySocketAuthorized(ws)&&!!state.id&&worldOf.get(users.get(state.id)?.session??'')==='fantasy'});
  // maxPayload 超過などの接続エラーを未処理例外にしない。
  ws.on('error', () => {});
  ws.on('message', (raw) => {
    try { handle(ws, state, JSON.parse(String(raw)) as ClientMsg); }
    catch (e) { console.error('bad message', e); }
  });
  ws.on('close', () => {const original=homeUser(state),actor=state.id?users.get(state.id):undefined;if(actor?.session&&worldOf.get(actor.session)==='fantasy')fantasyDiagnostics.record({type:'connection',actorId:actor.id,sessionId:actor.session,operation:'disconnect',status:'ok'});fantasyDialogueObserver.cancel(ws,'disconnect');unregisterAi();homeConnections.delete(ws);state.browserAi.close();onClose(ws,state.id);markHomeOffline(original);});
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
  saveMarketLikes.flush();
  saveSurvivorProfiles.flush();
  flushItems();
  saveHome.flush();
  saveFollows.flush();
  saveTimeline.flush();
  savePeople.flush();
  saveInbox.flush();
  fantasyClock.checkpoint(true);
  try{fantasyBackups.checkpoint('shutdown',true);}catch(error){console.error('[fantasy-backup] shutdown snapshot failed',error);}
  fantasyDiagnostics.record({type:'runtime.stop',status:'ok',droppedCount:fantasyDiagnostics.stats.dropped});
  const closeDiagnostics=Promise.race([fantasyDiagnostics.close(),new Promise<void>(resolve=>{setTimeout(resolve,2000).unref();})]);
  Promise.all([shutdownRooms(),closeDiagnostics]).finally(()=>{fantasyBackups.releaseRuntime();process.exit(0);});
});
process.on('exit',()=>fantasyBackups.releaseRuntime());

server.listen(PORT, () => {
  fantasyDiagnostics.record({type:'runtime.start',status:'ok',operation:'server'});
  console.log(`server on http://localhost:${PORT}`);
  console.log(`sessions: ${guild.sessions.map((w) => w.name).join(' ')}`);
  if (!process.env.LIVEKIT_URL) console.warn('LIVEKIT_* が未設定: 音声・画面共有は無効になります');
});
