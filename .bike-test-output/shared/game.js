/**
 * ゲームワールドの「板わたり」。ロビー（いつもの部屋）の北のガラスの向こうに、板を並べた 5 層の塔がある。
 * 板は踏まれると TILE_BREAK_MS 後に消える。一番下より下へ落ちたら脱落し、最後まで残った人が勝ち
 */
export const GRID = 8;
export const LAYERS = 5;
export const TILE = 1.5;
/** 板の上面の高さ（上の層から） */
export const LAYER_Y = [20, 15, 10, 5, 0];
export const TILE_THICK = 0.25;
export const TILE_BREAK_MS = 600;
/** ここより下に落ちたら脱落 */
export const FALL_Y = -8;
/** 塔の中心。ロビーの北の壁（z = -10）から 4m 離す */
export const ARENA = { x: 0, z: -20, half: (GRID * TILE) / 2 };
export const JOIN_AREA = { x: 5.5, z: -6.5, r: 1.8 };
export const START_BUTTON = { x: 8.6, z: -6.5 };
export const MIN_PLAYERS = 2;
/** 勝者を称えてから次のゲームを受け付けるまで */
export const CELEBRATE_MS = 8000;
export const TILE_COUNT = GRID * GRID * LAYERS;
export function tileCenter(i) {
    const layer = Math.floor(i / (GRID * GRID));
    const r = Math.floor((i % (GRID * GRID)) / GRID);
    const c = i % GRID;
    return {
        x: ARENA.x - ARENA.half + (c + 0.5) * TILE,
        z: ARENA.z - ARENA.half + (r + 0.5) * TILE,
        y: LAYER_Y[layer],
        layer,
    };
}
export const inArena = (x, z) => Math.abs(x - ARENA.x) <= ARENA.half && Math.abs(z - ARENA.z) <= ARENA.half;
export const inJoinArea = (x, z) => Math.hypot(x - JOIN_AREA.x, z - JOIN_AREA.z) <= JOIN_AREA.r;
export const newGame = (round = 0) => ({ round, phase: 'idle', players: [], winner: null, startedAt: 0, tiles: {} });
export const tileGone = (g, i, now) => g.tiles[i] !== undefined && now >= g.tiles[i];
/** (x, z) の真下で、足元 y 以下にある一番高い残っている板。無ければ null */
export function tileBelow(g, x, z, y, now) {
    if (!inArena(x, z))
        return null;
    const c = Math.min(GRID - 1, Math.floor((x - (ARENA.x - ARENA.half)) / TILE));
    const r = Math.min(GRID - 1, Math.floor((z - (ARENA.z - ARENA.half)) / TILE));
    for (let layer = 0; layer < LAYERS; layer++) {
        if (LAYER_Y[layer] > y + 0.05)
            continue;
        const i = layer * GRID * GRID + r * GRID + c;
        if (!tileGone(g, i, now))
            return { i, y: LAYER_Y[layer] };
    }
    return null;
}
/** 最上段のうち、i 番目の参加者が立つ板（散らばるように選ぶ） */
export function startTile(i) {
    // 64 と互いに素な 27 ずつ進めると、人数が少なくても盤面に散らばる
    return (i * 27 + 9) % (GRID * GRID);
}
/** 落ちた順の逆（最後まで残った人が先頭） */
export function ranking(g) {
    return [...g.players].sort((a, b) => (b.out ?? Infinity) - (a.out ?? Infinity));
}
