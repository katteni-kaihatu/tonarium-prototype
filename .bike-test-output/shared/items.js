import { newChess, chessBoard, playChess } from './chess.js';
import { BIKE, releaseBike, vehicleInitial } from './vehicle.js';
export const clockTime = (c, serverNow) => (c.playing ? c.base + Math.max(0, serverNow - c.at) / 1000 : c.base);
/** アップロードした画像・動画は /media/ に置かれる */
export const MEDIA_URL_RE = /^\/media\/[0-9a-f-]{36}\.(jpg|png|gif|webp|mp4|webm)$/;
export const YOUTUBE_ID_RE = /^[\w-]{11}$/;
export const CANVAS_W = 620;
export const CANVAS_H = 450;
/** 1 ストロークの総量（座標の数）と strokeAdd 1 回で足せる量の上限。実クライアントは 50ms ごとに数十点しか送らない */
export const STROKE_MAX_NUMS = 8000;
export const STROKE_ADD_MAX_NUMS = 512;
export const NOTE_COLORS = ['#fde68a', '#fca5a5', '#86efac', '#93c5fd', '#d8b4fe'];
export const isChessItem = (item) => item.kind === 'chess' || item.kind === 'chessAi';
export const isHandheld = (i) => i.kind === 'hammer' || i.kind === 'camera';
export const ONLY_3D = { camera: true, bike: true };
/** 頻繁な操作はアイテム全体ではなく操作だけを配り、各クライアントが applyItemAction で適用する */
export const isDeltaAction = (act) => act.a === 'strokeStart' || act.a === 'strokeAdd' || act.a === 'canvasClear';
export const ITEM_INFO = {
    bike: { name: 'バイク', mark: '単車', tint: '#DBEAE7', ink: '#235E57', desc: '3D 専用の一人乗りバイク。照準を合わせ E またはクリックで乗車、E で降車。W/↑: アクセル、S/↓: ブレーキ、A/D・←/→: ハンドル。急旋回すると滑ります。', genre: 'のりもの', in2d: false, in3d: true },
    note: { name: '付箋', mark: '付', tint: '#FBF1C4', ink: '#7A5B0E', desc: '文字を書いて置いておける付箋。2D ではウィンドウで、3D では空間の板として読み書きできる。', genre: 'ツール', in2d: true, in3d: true },
    hammer: { name: 'ピコピコハンマー', mark: '槌', tint: '#FBE3D2', ink: '#A24A16', desc: '手に持って誰かを叩ける。叩くと相手の前に移動する。', genre: 'あそび', in2d: true, in3d: true },
    chess: { name: 'チェス', mark: '♟', tint: '#E3E7F6', ink: '#2F4A9C', desc: '3D では立体のチェス盤、2D ではパネルの UI で遊べる。', genre: 'ゲーム', in2d: true, in3d: true },
    chessAi: { name: 'チェスAI', mark: '♟AI', tint: '#DFEEE8', ink: '#2E6E4E', desc: '白はあなた、黒はAI。みんなで白の駒を動かしてAIと対戦できる。', genre: 'ゲーム', in2d: true, in3d: true },
    g2048: { name: '2048', mark: '2048', tint: '#F4EBCF', ink: '#7A5B0E', desc: 'みんなで操作するパズル。3D では互換表示のパネルになる。', genre: 'ゲーム', in2d: true, in3d: false },
    canvas: { name: 'キャンバス', mark: '画', tint: '#F6E4EC', ink: '#9A3A62', desc: 'みんなで絵を描ける。ペンと消しゴム付き。', genre: 'ツール', in2d: true, in3d: true },
    camera: { name: 'カメラ', mark: '写', tint: '#E5F0E9', ink: '#2E6E4E', desc: '3D 空間で写真を撮ったりライブ配信したりできる。ライブは 2D からも見られる。', genre: 'ツール', in2d: false, in3d: true },
    image: { name: '画像', mark: '絵', tint: '#E4EEF7', ink: '#2F5E8C', desc: '貼り付けた画像。', genre: 'メディア', in2d: true, in3d: true, media: true },
    video: { name: '動画', mark: '動', tint: '#EFE4F6', ink: '#6A3A8C', desc: '貼り付けた動画。みんなで同じところを再生する。', genre: 'メディア', in2d: true, in3d: true, media: true },
    dice: { name: 'サイコロ', mark: '賽', tint: '#F3E6D3', ink: '#7A4A22', desc: 'TRPG 用のサイコロ（d4〜d100、最大10個）。3D では木の器の中を転がり、結果はチャットに残る。シークレットで振ると結果は自分だけに見える。', genre: 'あそび', in2d: true, in3d: true },
    youtube: { name: 'YouTube', mark: 'YT', tint: '#FBE1DE', ink: '#B3261E', desc: 'YouTube の動画。みんなで同じところを再生する。', genre: 'メディア', in2d: true, in3d: true, media: true },
};
const BACK = ['R', 'N', 'B', 'Q', 'K', 'B', 'N', 'R'];
export function chessInitial() {
    const b = Array(64).fill(null);
    for (let c = 0; c < 8; c++) {
        b[c] = `b${BACK[c]}`;
        b[8 + c] = 'bP';
        b[48 + c] = 'wP';
        b[56 + c] = `w${BACK[c]}`;
    }
    return b;
}
function spawnTile(grid, rng) {
    const empty = grid.map((v, i) => (v ? -1 : i)).filter((i) => i >= 0);
    if (!empty.length)
        return;
    grid[empty[Math.floor(rng() * empty.length)]] = rng() < 0.9 ? 2 : 4;
}
export function g2048Initial(rng) {
    const grid = Array(16).fill(0);
    spawnTile(grid, rng);
    spawnTile(grid, rng);
    return grid;
}
function slideLine(line) {
    const vals = line.filter((v) => v);
    const out = [];
    let gained = 0;
    for (let i = 0; i < vals.length; i++) {
        if (vals[i] === vals[i + 1]) {
            out.push(vals[i] * 2);
            gained += vals[i] * 2;
            i++;
        }
        else
            out.push(vals[i]);
    }
    while (out.length < 4)
        out.push(0);
    return { out, gained };
}
function lineIndices(dir, k) {
    // 寄せる側の端から順のマス番号
    const idx = [0, 1, 2, 3];
    switch (dir) {
        case 'left': return idx.map((i) => k * 4 + i);
        case 'right': return idx.map((i) => k * 4 + 3 - i);
        case 'up': return idx.map((i) => i * 4 + k);
        case 'down': return idx.map((i) => (3 - i) * 4 + k);
    }
}
export function slide2048(grid, dir) {
    const next = [...grid];
    let gained = 0;
    for (let k = 0; k < 4; k++) {
        const ids = lineIndices(dir, k);
        const r = slideLine(ids.map((i) => grid[i]));
        ids.forEach((i, j) => { next[i] = r.out[j]; });
        gained += r.gained;
    }
    return { grid: next, gained, moved: next.some((v, i) => v !== grid[i]) };
}
function canMove(grid) {
    return ['up', 'down', 'left', 'right'].some((d) => slide2048(grid, d).moved);
}
/** 画像・動画・YouTube は media が必要。合わなければ null */
export function createItem(kind, base, rng, media) {
    const b = { ...base, updatedBy: base.createdBy };
    const clock = { playing: false, base: 0, at: 0 };
    const size = (n) => Math.max(1, Math.min(10000, Math.round(Number(n) || 1)));
    switch (kind) {
        case 'bike': return { ...b, ...vehicleInitial(b.x, b.z, b.ry), kind, rider: null, rideVersion: 0 };
        case 'image':
        case 'video': {
            if (!media || !('url' in media) || !MEDIA_URL_RE.test(media.url))
                return null;
            const isVideo = /\.(mp4|webm)$/.test(media.url);
            if (isVideo !== (kind === 'video'))
                return null;
            const m = { url: media.url, w: size(media.w), h: size(media.h) };
            return kind === 'image' ? { ...b, kind, ...m } : { ...b, kind, ...m, clock };
        }
        case 'youtube':
            if (!media || !('videoId' in media) || !YOUTUBE_ID_RE.test(media.videoId))
                return null;
            return { ...b, kind, videoId: media.videoId, title: String(media.title ?? '').slice(0, 200), clock };
        case 'note': return { ...b, kind, text: '', color: NOTE_COLORS[Math.floor(rng() * NOTE_COLORS.length)], editingBy: null };
        case 'hammer': return { ...b, kind, holder: null };
        case 'chessAi':
        case 'chess': return { ...b, kind, chess: newChess(), board: chessInitial(), last: null };
        case 'g2048': return { ...b, kind, grid: g2048Initial(rng), score: 0, over: false };
        case 'canvas': return { ...b, kind, strokes: [] };
        case 'camera': return { ...b, kind, holder: null, pitch: 0, live: false, operator: null };
        case 'dice': return { ...b, kind, roll: null };
    }
}
/** item を書き換える。変化があれば true */
export function applyItemAction(item, act, userId, rng) {
    // クライアント由来の非有限数がアイテムに保存されないようにする変換
    const fin = (v) => { const n = Number(v); return Number.isFinite(n) ? n : 0; };
    switch (item.kind) {
        case 'bike': {
            if (act.a === 'bikeMount' && item.rider === null) {
                item.heading = item.ry;
                item.rider = userId;
                item.rideVersion++;
                break;
            }
            if (item.rider !== userId)
                return false;
            if (act.a === 'bikeDismount') {
                Object.assign(item, releaseBike(item));
                break;
            }
            if (act.a !== 'bikeDrive' || act.rideVersion !== item.rideVersion)
                return false;
            const s = act.state;
            if (!s || ![s.x, s.z, s.ry, s.speed, s.heading, s.roll, s.wheel, s.steer].every(Number.isFinite))
                return false;
            item.x = s.x;
            item.z = s.z;
            item.ry = fin(s.ry);
            item.heading = fin(s.heading);
            item.speed = Math.max(0, Math.min(BIKE.maxSpeed, s.speed));
            item.roll = Math.max(-BIKE.maxLean, Math.min(BIKE.maxLean, s.roll));
            item.steer = Math.max(-BIKE.maxSteer, Math.min(BIKE.maxSteer, s.steer));
            item.wheel = fin(s.wheel);
            item.slipping = !!s.slipping;
            item.remainder = 0;
            break;
        }
        case 'note':
            if (act.a === 'noteEdit') {
                if (act.text !== undefined)
                    item.text = act.text.slice(0, 300);
                if (act.color !== undefined && NOTE_COLORS.includes(act.color))
                    item.color = act.color;
                break;
            }
            if (act.a === 'noteLock') {
                if (act.lock)
                    item.editingBy = userId;
                else if (item.editingBy === userId)
                    item.editingBy = null;
                else
                    return false;
                break;
            }
            return false;
        case 'camera':
            if (act.a === 'pick' && item.holder === null) {
                item.holder = userId;
                if (item.live && item.operator !== userId) {
                    item.live = false;
                    item.operator = null;
                }
                break;
            }
            if (act.a === 'drop' && item.holder === userId) {
                item.holder = null;
                item.x = act.x;
                item.z = act.z;
                item.ry = fin(act.ry);
                item.pitch = fin(act.pitch ?? 0);
                break;
            }
            if (act.a === 'camLive') {
                if (act.on) {
                    if (item.holder !== null && item.holder !== userId)
                        return false;
                    item.live = true;
                    item.operator = userId;
                }
                else {
                    if (item.operator !== userId && item.holder !== userId)
                        return false;
                    item.live = false;
                    item.operator = null;
                }
                break;
            }
            return false;
        case 'hammer':
            if (act.a === 'pick' && item.holder === null) {
                item.holder = userId;
                break;
            }
            if (act.a === 'drop' && item.holder === userId) {
                item.holder = null;
                item.x = act.x;
                item.z = act.z;
                item.ry = fin(act.ry);
                break;
            }
            return false;
        case 'chessAi':
        case 'chess':
            if (act.a === 'chessMove') {
                if (item.kind === 'chessAi' && item.chess.fen.split(' ')[1] !== 'w')
                    return false;
                const next = playChess(item.chess, act.from, act.to, act.revision, act.promotion);
                if (!next)
                    return false;
                item.chess = next;
                item.board = chessBoard(next);
                item.last = [act.from, act.to];
                break;
            }
            if (act.a === 'chessReset') {
                item.chess = newChess(item.chess.revision + 1);
                item.board = chessBoard(item.chess);
                item.last = null;
                break;
            }
            return false;
        case 'g2048':
            if (act.a === 'slide') {
                if (item.over)
                    return false;
                const r = slide2048(item.grid, act.dir);
                if (!r.moved)
                    return false;
                spawnTile(r.grid, rng);
                item.grid = r.grid;
                item.score += r.gained;
                item.over = !canMove(item.grid);
                break;
            }
            if (act.a === 'reset2048') {
                item.grid = g2048Initial(rng);
                item.score = 0;
                item.over = false;
                break;
            }
            return false;
        case 'video':
        case 'youtube': {
            if (act.a !== 'mediaPlay' && act.a !== 'mediaPause' && act.a !== 'mediaSeek')
                return false;
            const pos = Math.max(0, Number(act.pos) || 0);
            const playing = act.a === 'mediaPlay' ? true : act.a === 'mediaPause' ? false : item.clock.playing;
            item.clock = { playing, base: pos, at: Date.now() };
            break;
        }
        case 'canvas': {
            const cx = (v) => Math.round(Math.max(0, Math.min(CANVAS_W, fin(v))));
            const cy = (v) => Math.round(Math.max(0, Math.min(CANVAS_H, fin(v))));
            if (act.a === 'strokeStart') {
                const size = Math.max(1, Math.min(40, fin(act.size) || 1));
                item.strokes.push({ id: act.id, by: userId, color: String(act.color).slice(0, 16), size, pts: [cx(act.x), cy(act.y)] });
                if (item.strokes.length > 3000)
                    item.strokes.shift();
                break;
            }
            if (act.a === 'strokeAdd') {
                const st = item.strokes.findLast((s) => s.id === act.id && s.by === userId);
                if (!st || !Array.isArray(act.pts))
                    return false;
                // 1 回の追加量と総量の両方に上限を効かせる（上限を超えた分は打ち切る）
                const room = STROKE_MAX_NUMS - st.pts.length;
                if (room < 2)
                    return false;
                const n = Math.min(act.pts.length, STROKE_ADD_MAX_NUMS, room);
                for (let i = 0; i + 1 < n; i += 2)
                    st.pts.push(cx(act.pts[i]), cy(act.pts[i + 1]));
                break;
            }
            if (act.a === 'canvasClear') {
                item.strokes = [];
                break;
            }
            return false;
        }
        // 結果はサーバーが決める（server の rollDice）
        case 'dice':
            return false;
    }
    item.updatedBy = userId;
    return true;
}
/** セッションに残っているアイテムのひとこと（セッションカードやまとめに出す）。言うことがなければ null */
export function itemSummary(it) {
    switch (it.kind) {
        case 'chess':
        case 'chessAi': {
            const n = it.chess.moves.length;
            return n ? `盤面が途中（${n} 手目）` : null;
        }
        case 'g2048': return it.score > 0 && !it.over ? `2048 が途中（スコア ${it.score}）` : null;
        case 'note': return it.text.trim() ? `付箋「${it.text.trim().split('\n')[0].slice(0, 16)}」` : null;
        case 'canvas': return it.strokes.length ? 'お絵描き' : null;
        case 'image': return '写真';
        case 'video': return '動画';
        case 'youtube': return it.title ? `YouTube「${it.title.slice(0, 20)}」` : 'YouTube';
        default: return null;
    }
}
