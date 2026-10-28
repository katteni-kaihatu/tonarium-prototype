import { initialArrivalState, type Arrival, type ArrivalKind } from './newArrival.ts';
import { t } from './i18n/core.ts';
import { create } from 'zustand';
import type { FantasyRealmState } from '../../shared/fantasy-realm.ts';
import type { UiMessage } from './i18n/index.ts';
import type { MovementMode } from './view3d/movement.ts';
import type { AvatarState, ChatMessage, EventDef, Group, GuildConfig, Message, Mode, Participant, Person, Presence, SessionInfo, User } from '../../shared/protocol.ts';
import { SPAWN } from '../../shared/protocol.ts';
import type { Item } from '../../shared/items.ts';
import { WORLDS } from './i18n/static.ts';
import { type WorldKind } from '../../shared/worlds.ts';
import type { DieSides } from '../../shared/dice.ts';
import { newGame, type GameState } from '../../shared/game.ts';
import { NEW_ELEVATOR, type ElevatorState } from '../../shared/city.ts';
import type { PositionRoute } from '../../shared/session-position.ts';
import { newSurvivorProfile, type SurvivorProfile, type SurvivorState } from '../../shared/survivor.ts';
import type { FantasyProfile, FantasyWorldClock, FantasyLegacyRecord } from '../../shared/fantasy.ts';
import type { NpcChatMessage, NpcId, NpcRelationship } from '../../shared/npc.ts';
import type { FantasyGmChatResponse } from '../../shared/fantasy-gm.ts';
import type { FantasyCommunityState } from '../../shared/fantasy-community.ts';
import type { FantasyContractBoard, FantasyContractError } from '../../shared/fantasy-contracts.ts';
import type { FantasyPartyState, FantasyPartyError } from '../../shared/fantasy-party.ts';
import type { FantasyCombatState } from '../../shared/fantasy-combat.ts';
import type { FantasyPropertyState } from '../../shared/fantasy-property.ts';
import type { FantasyAccountPublic } from '../../shared/fantasy-account.ts';
import { createAdSlice, type AdSlice } from './ad/slice.ts';
import type { AdPanelTarget } from '../../shared/antimatterLayout.ts';
import { deriveSession } from './sessionView.ts';
import { storedHomePageOf, type HomePage } from './homePage.ts';
export type { HomePage } from './homePage.ts';
import type { Post, TimelineTab } from '../../shared/timeline.ts';
import type { Walk } from './walk.ts';

export type VoiceStatus = 'off' | 'connecting' | 'connected' | 'unavailable';
export type WinMode = 'simple' | 'free';
/** ウィンドウのキー: share（画面共有）/ cam:<アイテムID> / view:<ユーザーID> / item:<アイテムID> */
export interface Win { key: string; x: number; y: number }
/** key は attention ならウィンドウのキー、invite なら session:<id> / group:<id>、askJoin なら session:<id> */
export interface Notice { id: number; kind: 'poke' | 'hit' | 'follow' | 'live' | 'attention' | 'invite' | 'askJoin' | 'online'; from: string; key?: string; fromName: string; at: number; unread: boolean; count?: number; lastHitAt?: number }
/** ホームの右の欄に出すもの */
export type SideWidget = 'now' | 'events' | 'sessions' | 'worlds' | 'items';

interface State extends AdSlice {
  /** 3D の照準クリックで開いた AD 前面パネルの宛先（antimatter-space ウィンドウ用） */
  adSpaceTarget: AdPanelTarget | null;
  selfId: string;
  selfName: string;
  joined: boolean;
  wsConnected: boolean;
  wsReady: boolean;
  /** つなぎ直した先のサーバーが、このページと違う版の画面を出している */
  updateVersion: string | null;
  /** 互換性バージョンがサーバーと合わず、接続を断たれた。更新するまで全面表示で止める */
  incompatible: boolean;

  guild: GuildConfig;
  groups: Group[];
  events: EventDef[];
  users: User[];
  /** ホーム向けの、セッションごとの軽い情報（WebSocket で届く） */
  sessionInfo: Record<string, SessionInfo>;
  // 以下はいるセッションの分だけ LiveKit の部屋から届く（出たら捨てる）
  chats: Record<string, ChatMessage[]>;
  avatarsBy: Record<string, Record<string, AvatarState>>;
  itemsBy: Record<string, Record<string, Item>>;
  /** 同じセッションにいる人の、中だけの状態 */
  presence: Record<string, Presence>;

  session: string | null;
  mode: Mode;
  /** 開いているホームのページ（最後に開いたページを覚えておき、セッション中のメニューはそこを開く） */
  homePage: HomePage;
  marketProductId: string | null;
  marketLikes: { counts: Record<string, number>; liked: string[] } | null;
  /** group ページで開いているグループと、グループごとに開いているチャンネル */
  homeGroup: string | null;
  homeChannel: Record<string, string>;
  /** フレンドページで DM を開いている相手の名前 */
  dmWith: string | null;

  /** DM とチャンネルのメッセージ（会話のキー → 古い順） */
  inbox: Record<string, Message[]>;
  /** 会話のキー → 読んだ時刻 */
  reads: Record<string, number>;
  /** フレンドとグループの仲間（オフラインの人のステータスもここから） */
  people: Record<string, Person>;
  /** 来たら知らせる をつけている相手 */
  watching: string[];
  recentStatus: string[];
  /** 前回いなくなった時刻（おかえりのまとめに使う）。まだ届いていなければ undefined */
  lastSeen: number | null | undefined;

  // 以下は参加中セッションの分だけを recompute() で切り出したもの。位置の更新では participants を差し替えない
  participants: Participant[];
  avatars: Record<string, AvatarState>;
  /** 3D に出す相手の ID。座標が変わっても配列の参照は保つ */
  avatarIds: string[];
  items: Record<string, Item>;

  /** 同期しない手元だけの状態 */
  itemUi: Record<string, ItemUi>;
  /** 後ろほど前面 */
  windows: Win[];
  maxWin: string | null;
  winMode: WinMode;
  /** たたんでいる前面パネル */
  folded: { left: boolean; right: boolean; faces: boolean };
  confirmClose: string | null;
  /** 切り替えを確認しているワールド */
  confirmWorld: WorldKind | null;
  /** ワールドの切り替えの予告（at はサーバー時刻） */
  worldPending: { sid: string; world: WorldKind; at: number; by: string; clearItems: boolean } | null;
  /** ワールドを読み込んでいる疑似ローディング */
  worldLoading: { world: WorldKind; dur: number } | null;
  /** 2D/3D 切り替え中の疑似ローディング */
  switching: { to: Mode; dur: number } | null;
  /** 疑似ローディングの長さの倍率（手元に保存） */
  loadScale: number;
  /** 軽量設定。3D のポイントライトなど重いものを読み込まない（手元に保存） */
  lightweight: boolean;
  /** 2D の背景に出すマップ（手元に保存）。マップを入れるべきか試すための設定 */
  mapMode: 'none' | '2d' | '3d';
  /** 声の湯気：会話のあった場所の熱をマップに残す（手元に保存） */
  voiceHeat: boolean;
  /** マップで選んだ目的地へ 2D の自分が歩いている途中 */
  walk: Walk | null;
  /** 動画・YouTube ごとの自分だけの音量（0〜1）。無ければ既定の半分 */
  volumes: Record<string, number>;
  /** 全体の音量（0〜1、手元に保存）。voice は人の声、fx はサウンドボードや効果音、media は動画・YouTube・画面共有の音 */
  audioVol: { voice: number; fx: number; media: number };
  /** 人ごとの声の音量（0〜2、名前ごとに手元に保存）。無ければ等倍 */
  peerVolume: Record<string, number>;
  /** 自分だけミュートしている人の名前（手元に保存） */
  peerMuted: string[];
  /** セッション中にホームを重ねて開いている */
  hubOpen: boolean;
  /** フレンドのページで開いているタブ（ホームの「もっと見る」から選んで開く） */
  friendsTab: 'all' | 'now' | 'followers' | 'following' | 'block';
  timelineTab: TimelineTab;
  /** タイムラインの右の欄を上書きしているもの。compose か post:<ID>。null なら通常の右の欄 */
  timelineSide: string | null;
  /** 引用して書くポスト */
  composeQuote: string | null;
  /** タイムラインのページに貼った・落とした写真。書く欄が受け取って上げる。'unsupported' は写真以外だったとき */
  composeImage: File | 'unsupported' | null;
  posts: Post[];
  /** スマホ幅のセッション画面で、下のタブで選んでいるもの */
  phoneTab: 'screen' | 'list' | 'log';
  sideWidget: SideWidget;
  /** セッションの外で選んでおく、次に入るときのモード */
  joinMode: Mode;
  /** サイコロを振る種類・個数（手元に保存） */
  dice: { sides: DieSides; count: number; secret: boolean };
  /** 視点のライブを頼んだ相手。始まったらウィンドウを開く */
  liveRequested: string | null;
  /** サーバー時刻 - 手元の時刻（動画の再生位置をそろえる） */
  serverOffset: number;
  broadcast: Record<string, boolean>;
  worldBy: Record<string, WorldKind>;
  /** セッションごとの板わたりのゲーム */
  games: Record<string, GameState>;
  /** セッションごとの協力サバイバルラン */
  survivors: Record<string, SurvivorState>;
  /** 仮IDに紐づくサーバー保存の個人進行 */
  survivorProfile: SurvivorProfile;
  fantasyProfile: FantasyProfile | null;
  fantasyAccount: FantasyAccountPublic | null;
  fantasyHomeId: string | null;
  fantasyAccountReady: boolean;
  fantasyAccountError: string | null;
  fantasyLegacies: FantasyLegacyRecord[];
  fantasyContractBoard: FantasyContractBoard | null;
  fantasyContractError: FantasyContractError | null;
  fantasyParty: FantasyPartyState | null;
  fantasyPartyError: FantasyPartyError | null;
  fantasyPartyPending: boolean;
  fantasyCombat: FantasyCombatState | null;
  fantasyCombatError: string | null;
  fantasyCombatPending: boolean;
  fantasyRealm: FantasyRealmState | null;
  fantasyRealmPending: boolean;
  fantasyRealmError: string | null;
  fantasyProperties: FantasyPropertyState | null;
  fantasyPropertyPending: boolean;
  fantasyPropertyError: string | null;
  fantasyClock: FantasyWorldClock | null;
  gmReply: FantasyGmChatResponse | null;
  dialogueProgress: Record<string, { kind: 'npc' | 'gm'; locale: 'ko' | 'en' | 'ja'; npcId?: string; text: string }>;
  gmPending: boolean;
  gmRequestId: string | null;
  gmError: string | null;
  gmErrorLocale: 'ko' | 'en' | 'ja' | null;
  communityState: FantasyCommunityState | null;
  communityError: string | null;
  communityPending: boolean;
  fantasyError: string | null;
  fantasyPending: boolean;
  fantasyTestResetAllowed: boolean;
  npcMessages: NpcChatMessage[];
  npcPending: boolean;
  npcError: string | null;
  npcErrorContext: { npcId: string; locale: 'ko' | 'en' | 'ja' } | null;
  npcModel: string;
  npcRequestId: string | null;
  npcRelationships: Partial<Record<NpcId, NpcRelationship>>;
  /** 街のマンションのエレベーター（セッションごと） */
  elevators: Record<string, ElevatorState>;
  /** 注目を集めているアイテム ID → 光らせる期限（performance.now） */
  attention: Record<string, number>;
  popupPausedUntil: number;
  chatNotificationSound: boolean;
  arrivals: Partial<Record<ArrivalKind, Arrival>>;
  phoneLayout: boolean;
  rightView: 'log' | 'msg';
  rightConversation: string | null;
  toast: { text: string | UiMessage; at: number } | null;
  /** 開く前に確認している外部 URL */
  openUrl: string | null;
  /** プロフィールを開いている相手 */
  profileOf: string | null;
  notices: Notice[];
  friends: string[];
  following: string[];
  followers: string[];
  /** フレンドのフレンド（自分とフレンドは除く） */
  fof: string[];
  /** 名前単位。手元だけに保存する */
  blocked: string[];
  /** 3D で「そばにいく」したとき Player が拾う */
  teleport: AvatarState | null;
  hits: Record<string, number>;
  /** つんつんされた時刻（顔のタイルの演出用） */
  pokes: Record<string, number>;
  emotes: Record<string, import('../../shared/emotes.ts').ActiveEmote>;
  swings: Record<string, number>;
  hitFx: { key: number; from: string; to: string }[];
  movementMode: MovementMode;
  doubleJump: boolean;
  lean: boolean;
  locked: boolean;
  aimHint: string | null;

  selfAvatar: AvatarState;

  voice: VoiceStatus;
  sync: VoiceStatus;
  syncError: string | null;
  syncTransport: string | null;
  syncRtt: number | null;
  syncStats: Record<string, unknown> | null;
  syncRoutes: PositionRoute[];
  syncPeerDelivery: boolean;
  voiceError: string | UiMessage | null;
  /** 希望設定。未接続中も切り替えられ、参加時に適用する */
  micEnabled: boolean;
  speaking: Record<string, boolean>;
  micOn: Record<string, boolean>;
  sharer: string | null;
  shareHasAudio: boolean;

  selectedNote: string | null;
  lightbox: string | null;
  /** 映像要素は livekit.ts の camVideos */
  camFeeds: Record<string, number>;
  flashAt: number;
}

function load<T>(key: string, fallback: T): T {
  try { return (JSON.parse(localStorage.getItem(key) ?? 'null') as T | null) ?? fallback; } catch { return fallback; }
}
export function save(key: string, value: unknown) {
  try { localStorage.setItem(key, JSON.stringify(value)); } catch { /* 保存できない環境では今回だけ */ }
}

/** スポーンエリアの中のどこか（スクリーン側の北を向く） */
export function spawnPoint(): AvatarState {
  const r = Math.sqrt(Math.random()) * (SPAWN.r - 0.3);
  const a = Math.random() * Math.PI * 2;
  return { x: SPAWN.x + Math.sin(a) * r, z: SPAWN.z + Math.cos(a) * r, ry: 0 };
}

const savedAudioVol = load<Partial<State['audioVol']>>('tonarium.audioVol', {});

export const useStore = create<State>((set, get) => ({
  adSpaceTarget: null,
  ...createAdSlice((p) => set(p as Partial<State>), () => get() as unknown as AdSlice),
  selfId: '',
  selfName: '',
  joined: false,
  wsConnected: false,
  wsReady: false,
  updateVersion: null,
  incompatible: false,
  guild: { name: 'Tonarium', sessions: [] },
  groups: [],
  events: [],
  users: [],
  sessionInfo: {},
  chats: {},
  avatarsBy: {},
  itemsBy: {},
  presence: {},
  session: null,
  mode: '2d',
  homePage: storedHomePageOf(load<unknown>('tonarium.homePage', 'home')),
  marketProductId: null,
  marketLikes: null,
  homeGroup: null,
  homeChannel: {},
  dmWith: null,
  inbox: {},
  reads: {},
  people: {},
  watching: [],
  recentStatus: [],
  lastSeen: undefined,
  participants: [],
  avatars: {},
  avatarIds: [],
  items: {},
  itemUi: {},
  windows: [],
  maxWin: null,
  winMode: load('tonarium.winMode', 'simple'),
  folded: load('tonarium.folded', { left: false, right: false, faces: false }),
  confirmClose: null,
  confirmWorld: null,
  worldPending: null,
  worldLoading: null,
  profileOf: null,
  openUrl: null,
  serverOffset: 0,
  broadcast: {},
  worldBy: {},
  games: {},
  survivors: {},
  survivorProfile: newSurvivorProfile(),
  fantasyProfile: null,
  fantasyAccount: null,
  fantasyHomeId: null,
  fantasyAccountReady: false,
  fantasyAccountError: null,
  fantasyLegacies: [],
  fantasyContractBoard: null,
  fantasyContractError: null,
  fantasyParty: null,
  fantasyPartyError: null,
  fantasyPartyPending: false,
  fantasyCombat: null,
  fantasyCombatError: null,
  fantasyCombatPending: false,
  fantasyRealm: null, fantasyRealmPending: false, fantasyRealmError: null,
  fantasyProperties: null,
  fantasyPropertyPending: false,
  fantasyPropertyError: null,
  fantasyClock: null,
  gmReply: null,
  dialogueProgress: {},
  gmPending: false,
  gmRequestId: null,
  gmError: null,
  gmErrorLocale: null,
  communityState: null,
  communityError: null,
  communityPending: false,
  fantasyError: null,
  fantasyPending: false,
  fantasyTestResetAllowed: false,
  npcMessages: [],
  npcPending: false,
  npcError: null,
  npcErrorContext: null,
  npcModel: '',
  npcRequestId: null,
  npcRelationships: {},
  elevators: {},
  attention: {},
  ...initialArrivalState(),
  chatNotificationSound: load('tonarium.chatNotificationSound', true),
  phoneLayout: false,
  rightView: 'log',
  rightConversation: null,
  toast: null,
  liveRequested: null,
  switching: null,
  loadScale: load('tonarium.loadScale', 1),
  lightweight: load('tonarium.lightweight', false),
  mapMode: load('tonarium.mapMode', 'none'),
  voiceHeat: load('tonarium.voiceHeat', true),
  walk: null,
  volumes: {},
  audioVol: {
    voice: savedAudioVol.voice ?? 1,
    fx: savedAudioVol.fx ?? 0.05,
    media: savedAudioVol.media ?? 0.05,
  },
  peerVolume: load('tonarium.peerVolume', {}),
  peerMuted: load('tonarium.peerMuted', []),
  hubOpen: false,
  phoneTab: 'screen',
  friendsTab: 'all',
  timelineTab: load('tonarium.timelineTab', 'home'),
  // スマホでは右の欄が下からのシートになるので、開いた途端に覆わないよう閉じておく
  timelineSide: typeof matchMedia === 'function' && matchMedia('(max-width: 720px)').matches ? null : 'compose',
  composeQuote: null,
  composeImage: null,
  posts: [],
  sideWidget: load('tonarium.sideWidget', 'events'),
  joinMode: load('tonarium.joinMode', '2d'),
  dice: load('tonarium.dice', { sides: 6 as DieSides, count: 2, secret: false }),
  notices: [],
  friends: [],
  following: [],
  followers: [],
  fof: [],
  blocked: load('tonarium.blocked', []),
  teleport: null,
  hits: {},
  pokes: {},
  emotes: {},
  swings: {},
  hitFx: [],
  movementMode: 'walk',
  doubleJump: load('tonarium.doubleJump', false),
  lean: load('tonarium.lean', true),
  locked: false,
  aimHint: null,
  selfAvatar: spawnPoint(),
  voice: 'off',
  sync: 'off',
  syncError: null,
  syncTransport: null,
  syncRtt: null,
  syncStats: null,
  syncRoutes: [],
  syncPeerDelivery: false,
  voiceError: null,
  micEnabled: true,
  speaking: {},
  micOn: {},
  sharer: null,
  shareHasAudio: false,
  selectedNote: null,
  lightbox: null,
  camFeeds: {},
  flashAt: 0,
}));

export interface ItemUi { sel?: number; chessRevision?: number; promotionTo?: number; chessMessage?: string | UiMessage; resetConfirm?: boolean; color?: string; size?: number; erase?: boolean }

export const set = useStore.setState;
export const get = useStore.getState;

export function recompute() {
  const s = get();
  const next = deriveSession(s, s);
  if (next.participants === s.participants && next.avatars === s.avatars && next.items === s.items && next.avatarIds === s.avatarIds) return;
  set(next);
}

/** セッションを出たら中の状態は捨てる（次に入るときは部屋から届き直す） */
export function dropSession(sid: string | null) {
  if (!sid) return;
  set({ emotes: {} });
  set((s) => {
    const omit = <T,>(m: Record<string, T>) => { const { [sid]: _, ...rest } = m; return rest; };
    return { chats: omit(s.chats), avatarsBy: omit(s.avatarsBy), itemsBy: omit(s.itemsBy), games: omit(s.games), survivors: omit(s.survivors), elevators: omit(s.elevators), broadcast: omit(s.broadcast), presence: {} };
  });
}

export function nameOf(id: string | null) {
  if (!id) return '';
  return get().users.find((p) => p.id === id)?.name ?? t('ui74');
}

export function sessionOf(id: string | null) {
  return id ? get().guild.sessions.find((w) => w.id === id) : undefined;
}

export function colorOf(id: string) {
  let h = 0;
  for (const c of id) h = (h * 31 + c.charCodeAt(0)) >>> 0;
  return `hsl(${h % 360}, 65%, 55%)`;
}

export function heldHammer(s: { items: Record<string, Item>; selfId: string }) {
  return Object.values(s.items).find((i) => i.kind === 'hammer' && i.holder === s.selfId);
}

export function heldCamera(s: { items: Record<string, Item>; selfId: string }) {
  return Object.values(s.items).find((i): i is Item & { kind: 'camera' } => i.kind === 'camera' && i.holder === s.selfId);
}

export const serverNow = () => Date.now() + get().serverOffset;
export const isBroadcast = (s = get()) => !!(s.session && s.broadcast[s.session]);
export const worldKindOf = (s = get(), sid = s.session): WorldKind => (sid && s.worldBy[sid]) || 'room';
export const solidsOf = (s = get()) => WORLDS[worldKindOf(s)].solids;
const NO_GAME = newGame();
export const gameOfSession = (s = get()) => (s.session && s.games[s.session]) || NO_GAME;
export const elevatorOfSession = (s = get()) => (s.session && s.elevators[s.session]) || NEW_ELEVATOR;

export function showToast(text: string | UiMessage) {
  set({ toast: { text, at: Date.now() } });
}

/** 自分以外の人が送った、読んでいないメッセージの数 */
export function unreadOf(s: { inbox: Record<string, Message[]>; reads: Record<string, number>; selfName: string }, conv: string) {
  const read = s.reads[conv] ?? 0;
  return (s.inbox[conv] ?? []).filter((m) => m.at > read && m.from !== s.selfName).length;
}
