import { ARENA, START_BUTTON } from './game.js';
import { CITY_HALF, CITY_SOLIDS } from './city.js';
import { SURVIVOR_TITLE } from './survivor.js';
const chairsAround = (x, z, n, dist, start = 0) => Array.from({ length: n }, (_, i) => {
    const a = start + (i * Math.PI * 2) / n;
    return { x: x + Math.sin(a) * dist, z: z + Math.cos(a) * dist, r: 0.24 };
});
/** カフェの家具の配置。見た目（View3D）と当たり判定で共用する */
export const CAFE = {
    counter: { x: -8.3, z: -1, w: 1.1, d: 8 },
    shelf: { x: -9.6, z: -1, w: 0.5, d: 8 },
    stools: [-4.2, -2.6, -1, 0.6, 2.2].map((z) => ({ x: -7.25, z, r: 0.22 })),
    /** 2 人用の丸テーブル。スポーンエリアはあけておく */
    tables: [
        { x: 3.2, z: -3.5 }, { x: 6.8, z: -3.5 },
        { x: 3.2, z: 0.5 }, { x: 6.8, z: 0.5 },
        { x: -3.8, z: 4.2 },
    ],
    /** 東の壁ぞいのソファ席 */
    sofa: { x: 9.25, z: 5, w: 0.9, d: 3.6 },
    sofaTable: { x: 7.9, z: 5, w: 0.8, d: 1.8 },
    plants: [{ x: 8.9, z: -8.9 }, { x: -8.9, z: 8.9 }, { x: 8.9, z: 8.9 }, { x: -3.2, z: -8.9 }],
};
export const CAFE_TABLE_R = 0.5;
/** 見た目と当たり判定で同じ配置・寸法を使う。南のスポーンと中央の道はあけておく */
export const GARDEN = {
    trees: [
        { x: -7.4, z: -6.8, r: 0.26, h: 2.3, canopy: 1.15, color: '#57854c' },
        { x: -3.8, z: -7.2, r: 0.24, h: 2.4, canopy: 1.05, color: '#779c58' },
        { x: 4, z: -7.2, r: 0.24, h: 2.3, canopy: 1.1, color: '#658e4e' },
        { x: 7.4, z: -6.6, r: 0.26, h: 2.4, canopy: 1.15, color: '#57854c' },
        { x: -7.5, z: 3.8, r: 0.25, h: 2.3, canopy: 1.1, color: '#779c58' },
        { x: 7.5, z: 3.8, r: 0.25, h: 2.4, canopy: 1.15, color: '#658e4e' },
        { x: -5.3, z: 7.4, r: 0.24, h: 2.3, canopy: 1.05, color: '#57854c' },
        { x: 5.3, z: 7.4, r: 0.24, h: 2.4, canopy: 1.05, color: '#779c58' },
    ],
    benches: [
        { x: -4.5, z: -3, w: 2.4, d: 0.85, facing: 1 },
        { x: 4.5, z: -3, w: 2.4, d: 0.85, facing: 1 },
        { x: -4.5, z: 3, w: 2.4, d: 0.85, facing: -1 },
        { x: 4.5, z: 3, w: 2.4, d: 0.85, facing: -1 },
    ],
    beds: [
        { x: -7.7, z: -1, w: 1.4, d: 3.6, color: '#e6a4a0' },
        { x: 7.7, z: -1, w: 1.4, d: 3.6, color: '#b49acb' },
        { x: 0, z: -8.3, w: 3, d: 1.1, color: '#efc66c' },
    ],
    lamps: [
        { x: -2.5, z: -4.8, r: 0.18, h: 2.7 },
        { x: 2.5, z: -4.8, r: 0.18, h: 2.7 },
        { x: -2.5, z: 4.6, r: 0.18, h: 2.7 },
        { x: 2.5, z: 4.6, r: 0.18, h: 2.7 },
    ],
    paths: [
        { x: 0, z: 1, w: 2.4, d: 15 },
        { x: -4.5, z: 0, w: 6.6, d: 2 },
        { x: 4.5, z: 0, w: 6.6, d: 2 },
    ],
};
export const WORLDS = {
    starlounge: { name: '星あかりのラウンジ', desc: '星の灯りに包まれる青いラウンジ', solids: [] },
    room: { name: 'ホール', desc: '何も置いていない広い部屋', solids: [] },
    cafe: {
        name: 'カフェ',
        desc: 'カウンターとテーブル席のある落ち着いたカフェ',
        solids: [
            CAFE.counter, CAFE.shelf, ...CAFE.stools,
            ...CAFE.tables.flatMap((t) => [{ ...t, r: CAFE_TABLE_R }, ...chairsAround(t.x, t.z, 2, 0.85, Math.PI / 2)]),
            CAFE.sofa, CAFE.sofaTable,
            ...CAFE.plants.map((p) => ({ ...p, r: 0.4 })),
        ],
    },
    garden: {
        name: 'ガーデン',
        desc: '木陰のベンチと花壇を散歩できる、空の見える庭',
        solids: [
            ...GARDEN.trees.map(({ x, z, r }) => ({ x, z, r })),
            ...GARDEN.benches.map(({ x, z, w, d }) => ({ x, z, w, d })),
            ...GARDEN.beds.map(({ x, z, w, d }) => ({ x, z, w, d })),
            ...GARDEN.lamps.map(({ x, z, r }) => ({ x, z, r })),
        ],
    },
    game: {
        name: 'ゲーム',
        desc: '板わたりサバイバル。ガラスの向こうの 5 層の塔で、最後まで落ちずに残った人が勝ち',
        solids: [{ x: START_BUTTON.x, z: START_BUTTON.z, r: 0.45 }],
        extent: { minX: -10, maxX: 10, minZ: ARENA.z - ARENA.half, maxZ: 10 },
    },
    survivors: {
        name: SURVIVOR_TITLE,
        desc: '夜明けまで10分。仲間と装備を重ね、押し寄せる夜の眷属を生き延びる',
        solids: [],
    },
    city: {
        name: '街',
        desc: '10 階建てのマンションと、駅が 3 つある高架の環状線が走る広い街',
        solids: CITY_SOLIDS,
        extent: { minX: -CITY_HALF, maxX: CITY_HALF, minZ: -CITY_HALF, maxZ: CITY_HALF },
    },
};
/** 切り替えを決めてから実際に切り替わるまで（全員に予告を出す） */
export const WORLD_COUNTDOWN_MS = 3000;
export const WORLD_KINDS = Object.keys(WORLDS);
export const isWorldKind = (v) => typeof v === 'string' && Object.hasOwn(WORLDS, v);
/** 背の高さ。高さのある当たり判定は、足元 y からこの高さまでと重なるときだけ効く */
const BODY_H = 1.7;
/** 半径 r の体が家具にめり込んでいたら外へ押し出した位置。y は足元の高さ（地上の人・アイテムは 0） */
export function pushOut(x, z, r, solids, y = 0) {
    for (let pass = 0; pass < 3; pass++) {
        let moved = false;
        for (const s of solids) {
            if (s.y0 !== undefined && (y + BODY_H <= s.y0 || y >= s.y1))
                continue;
            if ('r' in s) {
                const dx = x - s.x;
                const dz = z - s.z;
                const d = Math.hypot(dx, dz);
                const min = s.r + r;
                if (d >= min)
                    continue;
                const k = d < 1e-4 ? 1 : 1 / d;
                x = s.x + (d < 1e-4 ? min : dx * k * min);
                z = s.z + (d < 1e-4 ? 0 : dz * k * min);
                moved = true;
            }
            else {
                const hx = s.w / 2;
                const hz = s.d / 2;
                const cx = Math.max(s.x - hx, Math.min(s.x + hx, x));
                const cz = Math.max(s.z - hz, Math.min(s.z + hz, z));
                const dx = x - cx;
                const dz = z - cz;
                const d = Math.hypot(dx, dz);
                if (d >= r)
                    continue;
                if (d > 1e-4) {
                    x = cx + (dx / d) * r;
                    z = cz + (dz / d) * r;
                }
                else {
                    // 中心が箱の中：いちばん近い辺から出す
                    const out = [
                        [s.x - hx - r - x, 0], [s.x + hx + r - x, 0], [0, s.z - hz - r - z], [0, s.z + hz + r - z],
                    ].sort((a, b) => Math.abs(a[0] + a[1]) - Math.abs(b[0] + b[1]))[0];
                    x += out[0];
                    z += out[1];
                }
                moved = true;
            }
        }
        if (!moved)
            break;
    }
    return { x, z };
}
