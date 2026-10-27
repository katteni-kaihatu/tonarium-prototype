import type { FantasyRealmCommand, FantasyRealmState } from './fantasy-realm.ts';
import type { BrowserAiClientMsg, BrowserAiServerMsg } from './ai-support.ts';
import type { FantasyPartyCommand, FantasyPartyError, FantasyPartyState } from './fantasy-party.ts';
import type { Item, ItemAction, ItemKind, MediaInit } from './items.ts';
import type { ItemVariant } from './item-variants.ts';
import type { WorldKind } from './worlds.ts';
import type { DiceRoll } from './dice.ts';
import type { GameState } from './game.ts';
import type { SurvivorMetaUpgrade, SurvivorProfile, SurvivorState, SurvivorStyle } from './survivor.ts';
import type { ElevatorState } from './city.ts';
import type { SyncConfig } from './session-wire.ts';
import type { PeerOperation } from './session-events.ts';
import type { FantasyAction, FantasyProfile, FantasyWorldClock, FantasyLegacyRecord } from './fantasy.ts';
import type { NpcChatRequest, NpcReply } from './npc.ts';
import type { FantasyGmChatRequest, FantasyGmChatResponse } from './fantasy-gm.ts';
import type { FantasyCommunityError, FantasyCommunityRequest, FantasyCommunityState } from './fantasy-community.ts';
import type { FantasyContractBoard, FantasyContractError } from './fantasy-contracts.ts';
import type { FantasyCombatOrder, FantasyCombatState } from './fantasy-combat.ts';
import type { FantasyCombatStartKind } from './fantasy-combat-challenges.ts';
import type { FantasyPropertyCommand, FantasyPropertyError, FantasyPropertyState } from './fantasy-property.ts';
import type { FantasyAccountPublic } from './fantasy-account.ts';
export type { FantasyCombatStartKind } from './fantasy-combat-challenges.ts';
export type FantasyCombatCommand = { type: 'sync' } | { type: 'inspect'; target: string }
  | { type: 'start'; source: FantasyCombatStartKind; target: string; confirm?: boolean }
  | { type: 'order'; combatId: string; revision: number; order: FantasyCombatOrder };
import type { AssetCommand, AssetView } from './shared-assets.ts';
import type { AssetDelta } from './shared-sync.ts';
import type { Post, PostAttach } from './timeline.ts';
import type { SystemCommand, SystemCommandResult, SystemView } from './system-types.ts';

export type Mode = '2d' | '3d';

/**
 * 互換性バージョン。画面の版（CLIENT_VERSION）とは別に、通信の約束事だけを見る。
 * 約束事を壊す変更（メッセージの追加・意味の変更など）を入れたら +1 する。
 * hello で申告が無い・一致しないクライアントはサーバーが接続を断ち、画面は全面で更新を促す（docs/sync.md）
 */
export const COMPAT_VERSION = 6;

/** セッションを見られる人。省略時は public */
export type Visibility = 'public' | 'friends' | 'groupPlus' | 'group' | 'invite';
export const VISIBILITY_INFO: Record<Visibility, { name: string; desc: string }> = {
  public: { name: 'パブリック', desc: 'だれでも' },
  friends: { name: 'フレンド+', desc: '作った人と中にいる人のフレンド' },
  groupPlus: { name: 'グループ+', desc: 'グループのメンバーと、そのフレンド' },
  group: { name: 'グループ', desc: 'グループのメンバーだけ' },
  invite: { name: 'インバイト', desc: '誘われた人だけ' },
};
export const isGroupVisibility = (v: Visibility | undefined) => v === 'group' || v === 'groupPlus';

/** VRChat のステータスにならった 4 段階 */
export type StatusKind = 'joinMe' | 'online' | 'askMe' | 'busy';
/** color は点の色、ink は文字の色（白地で読める濃さ） */
export const STATUS_INFO: Record<StatusKind, { name: string; desc: string; color: string; ink: string }> = {
  joinMe: { name: '参加 OK', desc: 'フレンドの「フレンドの今」で上に出る。誘い歓迎', color: '#2F5FC4', ink: '#2F5FC4' },
  online: { name: 'オンライン', desc: 'いつもの状態。いる場所が見えて、参加もできる', color: '#2E9A64', ink: '#22734A' },
  askMe: { name: '声かけて', desc: '「参加する」が「行ってもいい？」になる。返事してから来てもらう', color: '#D97A2B', ink: '#9A4A14' },
  busy: { name: '取り込み中', desc: '誘い・つんつん・通知の音を止める。メッセージは届く', color: '#C2402F', ink: '#C2402F' },
};
export const STATUS_KINDS = Object.keys(STATUS_INFO) as StatusKind[];
export const STATUS_TEXT_MAX = 32;

/** オフラインでも見える人の情報（フレンドとグループの仲間の分だけ届く） */
export interface Person {
  name: string;
  status: StatusKind;
  statusText: string;
  /** 最後にいなくなった時刻。オンライン中や不明なら null */
  lastSeen: number | null;
}

export interface Channel { id: string; name: string }

export type Rsvp = 'yes' | 'maybe' | 'no';
export const RSVP_LABEL: Record<Rsvp, string> = { yes: '来る', maybe: 'たぶん', no: 'むり' };
/** この人数が「来る」と答えた日程の相談はイベントになる */
export const PLAN_QUORUM = 3;
export interface Plan {
  at: number;
  session: string | null;
  answers: Record<string, Rsvp>;
  /** イベントになったらその ID */
  event: string | null;
}

export interface RecapItem { id: string; kind: ItemKind; summary: string; image?: string }
/** セッションが終わったときに、グループのチャンネルへ残すまとめ */
export interface Recap {
  session: string;
  sessionName: string;
  from: number;
  to: number;
  people: string[];
  items: RecapItem[];
  log: { name: string; text: string; at: number }[];
}

/**
 * DM とグループのチャンネルのメッセージ。会話のキーは dm:<名前>\0<名前>（名前順）か ch:<グループ ID>:<チャンネル ID>。
 * from は名前で、空ならシステムの投稿（まとめ）
 */
export interface Message {
  id: string;
  from: string;
  at: number;
  text: string;
  voice?: { url: string; sec: number };
  media?: ChatMedia;
  plan?: Plan;
  recap?: Recap;
  /** 誘っているセッション */
  invite?: string;
  /** 共有したアイテム（セッションに置いてあるもの） */
  item?: { session: string; id: string; kind: ItemKind; summary: string };
}
export const dmKey = (a: string, b: string) => `dm:${[a, b].sort().join('\u0000')}`;
export const channelKey = (group: string, channel: string) => `ch:${group}:${channel}`;
/** dm のキーから相手の名前を取り出す */
export const dmPeer = (conv: string, self: string) => conv.slice(3).split('\u0000').find((n) => n !== self) ?? self;

/** セッション（通話・配信・アイテムを持ち、ワールド＝ 3D 空間を 1 つ読み込む） */
export interface SessionDef {
  id: string;
  name: string;
  topic?: string;
  /** 最初に読み込むワールド。省略時は room */
  world?: WorldKind;
  visibility?: Visibility;
  /** 作った人の名前。sessions.json のものは無い */
  owner?: string;
  /** visibility が group のときのグループ ID */
  group?: string;
  /** 誘われた人の名前 */
  invited?: string[];
}
export interface GuildConfig {
  name: string;
  sessions: SessionDef[];
}

export interface Group {
  id: string;
  name: string;
  color: string;
  owner: string;
  imageVersion?: number;
  editors?: string[];
  /** メンバーの名前 */
  members: string[];
  /** 先頭が既定のチャンネル（セッションのまとめもここに残る） */
  channels: Channel[];
}

export interface EventDef {
  id: string;
  title: string;
  /** 開始時刻（ms） */
  at: number;
  group: string | null;
  /** 会場のセッション */
  session: string | null;
  owner: string;
  /** 「来る」と答えた人の名前 */
  attendees: string[];
  maybe: string[];
  declined: string[];
}

/** オンラインの人。ホーム画面でも使うので WebSocket で全員に配る（mode と sharing はセッション一覧の表示に使う） */
export interface User {
  id: string;
  name: string;
  session: string | null;
  mode: Mode;
  sharing: boolean;
  /** アイコンの版（更新時刻）。null ならアイコンなし */
  icon: string | null;
  /** 3D アバター画像・調整値の版。null ならサンプル */
  avatar: string | null;
  bio: string;
  status: StatusKind;
  statusText: string;
}

/** セッションの中だけで使う、その人の状態。LiveKit の部屋でそのセッションの人にだけ配る */
export interface Presence {
  micOn: boolean;
  follow: string | null;
  /** 2D のみ。null ならスポーンエリア */
  pos: AvatarState | null;
  /** 開いているウィンドウのキー（閲覧中の表示に使う） */
  viewing: string[];
  /** ついてきている人に向けて自分の視点をライブ配信している（3D のみ） */
  viewLive: boolean;
  /** 3D で画面共有中に床に立てた配信ディスプレイ。2D のとき（頭の上に出す）や共有していないときは null */
  display: AvatarState | null;
}
export const EMPTY_PRESENCE: Presence = { micOn: false, follow: null, pos: null, viewing: [], viewLive: false, display: null };
/** 同じセッションにいる人（User に Presence を重ねたもの） */
export type Participant = User & Presence;

/** ホーム画面が使う、セッションごとの軽い情報（中の状態そのものは部屋にいる人にしか届かない） */
export interface SessionInfo {
  world: WorldKind;
  thumbnail?: string;
  /** 置いてあるアイテムの要約（セッションカードと、メッセージに添えたアイテムの表示用） */
  items: { id: string; kind: ItemKind; summary: string }[];
}

/** near は声の範囲（送信時点で近くにいた人だけに届く）、announce は上部に固定するお知らせ */
export type ChatScope = 'near' | 'all' | 'announce';

export interface ChatMessage {
  clientRequestId?: string;
  id: string;
  /** null はシステムメッセージ（ログのイベント） */
  from: string | null;
  fromName: string;
  text: string;
  /** data URL（写真・キャンバスの保存など） */
  image?: string;
  /** アップロードした画像・動画 */
  media?: ChatMedia;
  at: number;
  scope: ChatScope;
  /** near の宛先 */
  to?: string[];
  /** イベントで強調する相手（つんつんされた人など） */
  about?: string;
  /** サイコロの結果。シークレットのとき本人以外には results が null */
  dice?: DiceRoll;
  hammer?: { from: string; to: string; count: number; lastHitAt: number };
}

export interface ChatMedia { kind: 'image' | 'video'; url: string; w: number; h: number }

export const LEAN_ANGLE = Math.PI / 18;

export interface AvatarState {
  xr?: import('./xr-pose.ts').AvatarXR;
  x: number;
  z: number;
  ry: number;
  /** 3D の人の顔の上下の向き（上向きが正） */
  pitch?: number;
  lean?: number;
  crouching?: boolean;
  /**
   * 跳んだ回数。高さは送らず、増えたのを見た側が受け取った瞬間から jumpHeight で放物線を描く
   * （途中の高さを送ると、届く間隔のむらでカクつく）
   */
  jump?: number;
  /** 衝突補正後の実移動から判定した、接地・非乗車での歩行状態。 */
  walking?: boolean;
  /** 床（高さ 0）以外にいるときの足元の高さ。ゲームの塔の上など。あればジャンプの放物線より優先する */
  y?: number;
  /**
   * 街の電車に乗っているときの、号車と車内での位置（along は進む向き、side はホーム側が正）。
   * 走る電車の上で x, z をなめらかにつなぐと遅れて車外に見えるので、見る側は車内の位置をつないで今の電車の位置に足す
   */
  ride?: { car: number; along: number; side: number; ry: number };
}

/** 初速 4.2m/s・重力 12m/s² で 0.7m ほど跳ぶ */
export const JUMP_V = 4.2;
export const GRAVITY = 12;
/** 跳んでから ms 経ったときの足元の高さ（m） */
export function jumpHeight(ms: number) {
  const t = ms / 1000;
  if (!(t > 0 && t < (2 * JUMP_V) / GRAVITY)) return 0;
  return JUMP_V * t - (GRAVITY * t * t) / 2;
}

/** WebSocket でつないだときに届く、セッションの外でも使う状態 */
export interface Snapshot {
  guild: GuildConfig;
  users: User[];
  friends: string[];
  groups: Group[];
  events: EventDef[];
  sessions: Record<string, SessionInfo>;
  /** 再生位置をそろえるためのサーバー時刻 */
  now: number;
  /** サーバーが出している画面の版。開発中は null */
  version: string | null;
}

/** セッションの LiveKit の部屋に入ったとき、サーバーからその人だけに届く中の状態 */
export interface SessionSnapshot {
  sid: string;
  sharedAssets?: AssetView;
  systems?: SystemView;
  chats: ChatMessage[];
  avatars: Record<string, AvatarState>;
  items: Item[];
  presence: Record<string, Presence>;
  /** ブロードキャストモード（距離に関係なく音が聞こえる） */
  broadcast: boolean;
  world: WorldKind;
  game: GameState;
  survivor: SurvivorState;
  elevator: ElevatorState;
  now: number;
}

/** WebSocket でサーバーへ送るもの（セッションの外でも使う） */
export type HomeClientMsg =
  | BrowserAiClientMsg
  | { t: 'fantasyAccountBind'; ticket: string }
  | { t: 'fantasyAccountUnbind' }
  | { t: 'fantasyAction'; revision: number; action: FantasyAction }
  | ({ t: 'fantasyRealmRequest' } & FantasyRealmCommand)
  | { t: 'fantasyPartyRequest'; command: FantasyPartyCommand }
  | { t: 'fantasyPropertyRequest'; command: FantasyPropertyCommand }
  | { t: 'fantasyCombatRequest'; command: FantasyCombatCommand }
  | { t: 'fantasyTestReset'; revision: number; confirm: 'RESET_LIFE' }
  | { t: 'fantasyContracts' }
  | ({ t: 'npcChat' } & NpcChatRequest)
  | ({ t: 'fantasyGmChat' } & FantasyGmChatRequest)
  | ({ t: 'communityContribute' } & FantasyCommunityRequest)
  | { t: 'thumbnailUpload'; sid: string; thumbnail: string }
  | { t: 'marketLike'; product: string }
  | { t: 'hello'; id: string; name: string; compat?: number }
  | { t: 'join'; sid: string; requestId?: string }
  | { t: 'leave'; requestId?: string }
  | { t: 'prepareSync'; requestId: string; peerPositions?: boolean; peerDelivery?: boolean }
  /** /icon・/avatar・/profile へ保存した後に、同じ名前のオンラインの人へ反映させる */
  | { t: 'profileUpdated' }
  /** name をフォローする（on: false で外す）。お互いにフォローするとフレンド */
  | { t: 'followUser'; name: string; on: boolean }
  /** withPlace ならサーバーがいまのセッションと 2D/3D を場所として付ける */
  | { t: 'postCreate'; text: string; withPlace: boolean; image?: string; attach?: PostAttach; quote?: string; replyTo?: string }
  | { t: 'postDelete'; id: string }
  | { t: 'postReact'; id: string; emoji: string; on: boolean }
  | { t: 'postRepost'; id: string; on: boolean }
  | { t: 'sessionCreate'; name: string; topic: string; world: WorldKind; visibility: Visibility; group?: string; requestId?: string }
  | { t: 'sessionDelete'; id: string }
  | { t: 'groupCreate'; name: string; color: string }
  | { t: 'groupUpdate'; groupId: string; name?: string; editors?: string[] }
  | { t: 'groupJoin'; id: string }
  | { t: 'groupLeave'; id: string }
  | { t: 'groupDelete'; id: string }
  | { t: 'eventCreate'; title: string; at: number; group: string | null; session: string | null }
  | { t: 'eventAttend'; id: string; answer: Rsvp | null }
  | { t: 'channelCreate'; group: string; name: string }
  | { t: 'msg'; conv: string; text: string; voice?: { url: string; sec: number }; media?: ChatMedia; plan?: { at: number; session: string | null }; invite?: string; item?: { session: string; id: string } }
  /** at までを読んだ */
  | { t: 'read'; conv: string; at: number }
  | { t: 'rsvp'; conv: string; id: string; answer: Rsvp | null }
  | { t: 'setStatus'; status: StatusKind; text: string }
  /** 来たら知らせる */
  | { t: 'watch'; name: string; on: boolean }
  /** 声かけての人に「行ってもいい？」と聞く。to はユーザー ID */
  | { t: 'askJoin'; to: string }
  | { t: 'eventDelete'; id: string }
  /** to はユーザー ID。セッションなら invited にも加える */
  | { t: 'invite'; kind: 'session' | 'group'; id: string; to: string };

/** kokosync でサーバーへ送るもの（セッションの中だけ）。 */
export type RoomClientMsg =
  | { t: 'systemLoad'; mapId: string }
  | { t: 'systemCommand'; command: Exclude<SystemCommand, { kind: 'map' }> }
  | { t: 'systemResync' }
  | { t: 'sharedCommand'; command: AssetCommand }
  | { t: 'sharedResync' }
  | { t: 'peerOperation'; event: PeerOperation }
  /** 部屋につないだ・つなぎ直した後に、中の状態を送ってもらう */
  | { t: 'sync' }
  | { t: 'mode'; mode: Mode }
  | { t: 'status'; micOn: boolean; sharing: boolean }
  | { t: 'follow'; target: string | null }
  | { t: 'dropFollowers' }
  /** pos が null ならスポーンエリアに戻る */
  | { t: 'place2d'; target: string; pos: AvatarState | null }
  /** 3D で配信ディスプレイを持ち運ぶ */
  | { t: 'displayMove'; target: string; x: number; z: number; ry: number }
  | { t: 'chat'; text: string; image?: string; media?: ChatMedia; scope: ChatScope; clientRequestId?: string }
  | { t: 'avatar'; s: AvatarState }
  | { t: 'viewing'; keys: string[] }
  | { t: 'poke'; to: string }
  | { t: 'sound'; id: string }
  | { t: 'emote'; id: import('./emotes.ts').EmoteId }
  /** ついていっている相手に視点のライブを頼む */
  | { t: 'liveRequest'; to: string }
  | { t: 'viewLive'; on: boolean }
  | { t: 'itemCreate'; kind: ItemKind; x: number; z: number; ry: number; text?: string; media?: MediaInit; variant?: ItemVariant }
  /** key はウィンドウのキー（item:<id> / cam:<id>） */
  | { t: 'attention'; key: string }
  | { t: 'broadcast'; on: boolean }
  /** clearItems ならアイテムをすべて片付けてから切り替える */
  | { t: 'world'; world: WorldKind; clearItems?: boolean }
  /** いまのセッションの名前を変える（だれでも） */
  | { t: 'sessionRename'; name: string }
  | { t: 'gameStart' }
  /** 自分が乗った板（サーバーが消える時刻を決める） */
  | { t: 'gameStep'; tile: number }
  | { t: 'gameFell' }
  | { t: 'survivorStyle'; style: SurvivorStyle }
  | { t: 'survivorStart' }
  | { t: 'survivorMove'; x: number; z: number }
  | { t: 'survivorChoose'; gear: string }
  | { t: 'survivorReroll' }
  | { t: 'survivorUpgrade'; upgrade: SurvivorMetaUpgrade }
  | { t: 'survivorReset' }
  /** 街のマンションのエレベーターを呼ぶ・行き先を押す（floor は 0 = 1 階 … 10 = 屋上） */
  | { t: 'elevatorCall'; floor: number }
  | { t: 'itemRemove'; id: string }
  | { t: 'itemMove'; id: string; x: number; z: number; ry: number; y?: number; scale?: number }
  | { t: 'itemAction'; id: string; action: ItemAction }
  | { t: 'hit'; to: string };

export type ClientMsg = HomeClientMsg | RoomClientMsg;

/** 部屋へ送る種類の一覧（送り先の振り分けに使う。型と同じ並び） */
const ROOM_CLIENT_TYPES: Record<RoomClientMsg['t'], true> = {
  systemLoad: true, systemCommand: true, systemResync: true,
  sharedCommand: true, sharedResync: true,
  peerOperation: true,
  sync: true, mode: true, status: true, follow: true, dropFollowers: true, place2d: true, displayMove: true, chat: true, avatar: true,
  viewing: true, poke: true, sound: true, emote: true, liveRequest: true, viewLive: true, itemCreate: true, attention: true, broadcast: true, world: true, sessionRename: true,
  gameStart: true, gameStep: true, gameFell: true, survivorStyle: true, survivorStart: true, survivorMove: true, survivorChoose: true, survivorReroll: true, survivorUpgrade: true, survivorReset: true,
  elevatorCall: true, itemRemove: true, itemMove: true, itemAction: true, hit: true,
};
export const isRoomClientMsg = (m: ClientMsg): m is RoomClientMsg => Object.hasOwn(ROOM_CLIENT_TYPES, m.t);

/** WebSocket でサーバーから届くもの */
export type HomeServerMsg =
  | BrowserAiServerMsg
  | { t: 'fantasyAccountState'; account: FantasyAccountPublic | null; homeId: string; activeId: string; user?: User; error?: string }
  | { t: 'sessionCreated'; sid: string; requestId?: string }
  | { t: 'sessionResult'; requestId: string; error?: string }
  | { t: 'thumbnailRequest'; sid: string }
  | { t: 'marketLikes'; counts: Record<string, number>; liked: string[] }
  /** 互換性バージョンが合わず接続を断るときに、切断の直前に送る */
  | { t: 'incompatible'; compat: number }
  | { t: 'syncConfig'; requestId: string; config: SyncConfig }
  | { t: 'syncError'; requestId: string; error: string }
  | { t: 'syncReset'; sid: string }
  | { t: 'snapshot'; s: Snapshot }
  | { t: 'users'; list: User[] }
  | { t: 'sessionInfo'; sessions: Record<string, SessionInfo> }
  | { t: 'followed'; from: string; fromName: string }
  | { t: 'friends'; names: string[] }
  /** fof はフレンドのフレンド（自分とフレンドは除く） */
  | { t: 'follows'; following: string[]; followers: string[]; fof: string[] }
  | { t: 'posts'; list: Post[] }
  /** 新しいポストか、同じ ID のものの更新（リアクション・リポスト） */
  | { t: 'post'; p: Post }
  | { t: 'postsRemoved'; ids: string[] }
  | { t: 'sessions'; list: SessionDef[] }
  | { t: 'groups'; list: Group[] }
  | { t: 'events'; list: EventDef[] }
  | { t: 'invite'; kind: 'session' | 'group'; id: string; from: string; fromName: string }
  /** 入ったときに 1 回。lastSeen は前回いなくなった時刻（初めてなら null） */
  | { t: 'inbox'; convs: Record<string, Message[]>; reads: Record<string, number>; people: Person[]; watching: string[]; lastSeen: number | null; recentStatus: string[] }
  /** 新しいメッセージか、同じ ID のものの更新（日程の返事など） */
  | { t: 'msg'; conv: string; m: Message }
  | { t: 'read'; conv: string; at: number }
  | { t: 'people'; list: Person[] }
  | { t: 'watching'; names: string[]; recentStatus: string[] }
  | { t: 'survivorProfile'; profile: SurvivorProfile }
  | { t: 'fantasyProfile'; profile: FantasyProfile; error?: string }
  | { t: 'fantasyRealmState'; state: FantasyRealmState | null; error?: string }
  | { t: 'fantasyPartyState'; state: FantasyPartyState; error?: FantasyPartyError }
  | { t: 'fantasyPropertyState'; state: FantasyPropertyState | null; error?: FantasyPropertyError }
  | { t: 'fantasyCombatState'; state: FantasyCombatState | null; error?: string }
  | { t: 'fantasyTestMode'; enabled: boolean }
  | { t: 'fantasyLegacies'; records: FantasyLegacyRecord[] }
  | { t: 'fantasyContractBoard'; board: FantasyContractBoard | null; error?: FantasyContractError }
  | { t: 'fantasyClock'; clock: FantasyWorldClock }
  | ({ t: 'fantasyGmReply' } & FantasyGmChatResponse)
  | { t: 'communityState'; state: FantasyCommunityState | null; error?: FantasyCommunityError }
  | ({ t: 'npcReply' } & NpcReply)
  | { t: 'fantasyDialogueChunk'; requestId: string; kind: 'npc' | 'gm'; locale: 'ko' | 'en' | 'ja'; npcId?: string; text: string }
  | { t: 'askJoin'; from: string; fromName: string; session: string }
  | { t: 'online'; from: string; fromName: string };

/** kokosync でサーバーから届くもの。 */
export type RoomServerMsg =
  | { t: 'systemState'; sid: string; view: SystemView; error?: string; commandResult?: SystemCommandResult }
  | { t: 'sharedDelta'; sid: string; delta: AssetDelta; commandId?: string }
  | { t: 'sharedState'; sid: string; view: AssetView; commandId?: string; error?: string }
  | { t: 'presence'; sid: string; all: Record<string, Presence> }
  | { t: 'chat'; sid: string; m: ChatMessage }
  | { t: 'avatar'; sid: string; id: string; s: AvatarState }
  | { t: 'avatarRemove'; sid: string; id: string }
  | { t: 'item'; sid: string; item: Item }
  /** 移動は中身を送らず位置だけ。受けた側は保持済みのアイテムへ適用する */
  | { t: 'itemMove'; sid: string; id: string; x: number; z: number; ry: number; y?: number; scale?: number }
  | { t: 'itemRemove'; sid: string; id: string }
  | { t: 'itemAction'; sid: string; id: string; action: ItemAction; by: string }
  | { t: 'hit'; sid: string; from: string; to: string }
  | { t: 'poke'; sid: string; from: string; to: string }
  | { t: 'sound'; sid: string; from: string; id: string }
  | { t: 'emote'; sid: string; from: string; id: import('./emotes.ts').EmoteId; at: number }
  | { t: 'liveRequest'; sid: string; from: string }
  | { t: 'attention'; sid: string; from: string; key: string }
  | { t: 'broadcast'; sid: string; on: boolean }
  /** at（サーバー時刻）に切り替わる予告 */
  | { t: 'worldPending'; sid: string; world: WorldKind; at: number; by: string; clearItems: boolean }
  | { t: 'world'; sid: string; world: WorldKind }
  | { t: 'game'; sid: string; game: GameState }
  | { t: 'gameTile'; sid: string; tile: number; at: number }
  | { t: 'survivor'; sid: string; state: SurvivorState }
  | { t: 'elevator'; sid: string; elevator: ElevatorState };

export type ServerMsg = HomeServerMsg | RoomServerMsg;

/** 床は -ROOM_HALF..ROOM_HALF。スクリーンは北壁 (z = -ROOM_HALF) */
export const ROOM_HALF = 10;
/** 入ってきた人が現れる丸いエリア。家具を置かない */
export const SPAWN = { x: 0, z: 6.5, r: 1.6 };
/** スポーンエリアの i 番目の立ち位置。ひまわりの種の並びで、人が増えても重ならない */
export function spawnSlot(i: number) {
  const r = 0.45 * Math.sqrt(i);
  const a = i * 2.39996;
  return { x: SPAWN.x + Math.sin(a) * r, z: SPAWN.z + Math.cos(a) * r };
}
