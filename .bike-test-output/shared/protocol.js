/**
 * 互換性バージョン。画面の版（CLIENT_VERSION）とは別に、通信の約束事だけを見る。
 * 約束事を壊す変更（メッセージの追加・意味の変更など）を入れたら +1 する。
 * hello で申告が無い・一致しないクライアントはサーバーが接続を断ち、画面は全面で更新を促す（docs/sync.md）
 */
export const COMPAT_VERSION = 1;
export const VISIBILITY_INFO = {
    public: { name: 'パブリック', desc: 'だれでも' },
    friends: { name: 'フレンド+', desc: '作った人と中にいる人のフレンド' },
    groupPlus: { name: 'グループ+', desc: 'グループのメンバーと、そのフレンド' },
    group: { name: 'グループ', desc: 'グループのメンバーだけ' },
    invite: { name: 'インバイト', desc: '誘われた人だけ' },
};
export const isGroupVisibility = (v) => v === 'group' || v === 'groupPlus';
/** color は点の色、ink は文字の色（白地で読める濃さ） */
export const STATUS_INFO = {
    joinMe: { name: '参加 OK', desc: 'フレンドの「フレンドの今」で上に出る。誘い歓迎', color: '#2F5FC4', ink: '#2F5FC4' },
    online: { name: 'オンライン', desc: 'いつもの状態。いる場所が見えて、参加もできる', color: '#2E9A64', ink: '#22734A' },
    askMe: { name: '声かけて', desc: '「参加する」が「行ってもいい？」になる。返事してから来てもらう', color: '#D97A2B', ink: '#9A4A14' },
    busy: { name: '取り込み中', desc: '誘い・つんつん・通知の音を止める。メッセージは届く', color: '#C2402F', ink: '#C2402F' },
};
export const STATUS_KINDS = Object.keys(STATUS_INFO);
export const STATUS_TEXT_MAX = 32;
export const RSVP_LABEL = { yes: '来る', maybe: 'たぶん', no: 'むり' };
/** この人数が「来る」と答えた日程の相談はイベントになる */
export const PLAN_QUORUM = 3;
export const dmKey = (a, b) => `dm:${[a, b].sort().join('\u0000')}`;
export const channelKey = (group, channel) => `ch:${group}:${channel}`;
/** dm のキーから相手の名前を取り出す */
export const dmPeer = (conv, self) => conv.slice(3).split('\u0000').find((n) => n !== self) ?? self;
export const EMPTY_PRESENCE = { micOn: false, follow: null, pos: null, viewing: [], viewLive: false, display: null };
/** 初速 4.2m/s・重力 12m/s² で 0.7m ほど跳ぶ */
export const JUMP_V = 4.2;
export const GRAVITY = 12;
/** 跳んでから ms 経ったときの足元の高さ（m） */
export function jumpHeight(ms) {
    const t = ms / 1000;
    if (!(t > 0 && t < (2 * JUMP_V) / GRAVITY))
        return 0;
    return JUMP_V * t - (GRAVITY * t * t) / 2;
}
/** 部屋へ送る種類の一覧（送り先の振り分けに使う。型と同じ並び） */
const ROOM_CLIENT_TYPES = {
    peerOperation: true,
    sync: true, mode: true, status: true, follow: true, dropFollowers: true, place2d: true, displayMove: true, chat: true, avatar: true,
    viewing: true, poke: true, sound: true, emote: true, liveRequest: true, viewLive: true, itemCreate: true, attention: true, broadcast: true, world: true, sessionRename: true,
    gameStart: true, gameStep: true, gameFell: true, survivorStyle: true, survivorStart: true, survivorMove: true, survivorChoose: true, survivorReroll: true, survivorUpgrade: true, survivorReset: true,
    elevatorCall: true, itemRemove: true, itemMove: true, itemAction: true, hit: true,
};
export const isRoomClientMsg = (m) => m.t in ROOM_CLIENT_TYPES;
/** 床は -ROOM_HALF..ROOM_HALF。スクリーンは北壁 (z = -ROOM_HALF) */
export const ROOM_HALF = 10;
/** 入ってきた人が現れる丸いエリア。家具を置かない */
export const SPAWN = { x: 0, z: 6.5, r: 1.6 };
/** スポーンエリアの i 番目の立ち位置。ひまわりの種の並びで、人が増えても重ならない */
export function spawnSlot(i) {
    const r = 0.45 * Math.sqrt(i);
    const a = i * 2.39996;
    return { x: SPAWN.x + Math.sin(a) * r, z: SPAWN.z + Math.cos(a) * r };
}
