export const CITY_HALF = 60;
/** マンションの 1 階分の高さ */
export const FLOOR_H = 3;
/** 1 階〜10 階と屋上 */
export const MANSION_STOPS = 11;
const rect = (x0, x1, z0, z1, y0, y1) => ({ x: (x0 + x1) / 2, z: (z0 + z1) / 2, w: Math.abs(x1 - x0), d: Math.abs(z1 - z0), ...(y0 !== undefined ? { y0, y1 } : {}) });
/* マンション。原点はマンションの中心、mx は東、mz は南 */
export const MANSION = { x: -36, z: -36, hw: 8, hd: 6 };
const M = (mx, mz) => ({ x: MANSION.x + mx, z: MANSION.z + mz });
const mrect = (mx0, mx1, mz0, mz1, y0, y1) => {
    const a = M(mx0, mz0);
    const b = M(mx1, mz1);
    return rect(a.x, b.x, a.z, b.z, y0, y1);
};
/** エレベーターのかご（昇降路）。北側の壁にドア */
export const SHAFT = { mx0: 4.6, mx1: 7.4, mz0: 1.4, mz1: 4.2, door0: 5.4, door1: 6.6 };
export const SHAFT_RECT = (() => { const a = M(SHAFT.mx0, SHAFT.mz0); const b = M(SHAFT.mx1, SHAFT.mz1); return { x0: a.x, x1: b.x, z0: a.z, z1: b.z }; })();
/** 階段室：北東の角。西の段を北へ上り、踊り場で折り返して東の段を南へ上る */
const STAIR = { mx0: 4, mx1: 8, mz0: -6, mz1: -1.5, mid: 6, landing: -4.5 };
const T = 0.12;
function mansionSolids() {
    // 屋上の手すりの高さまで
    const top = (MANSION_STOPS - 1) * FLOOR_H + 1.1;
    const out = [
        // 外壁。1 階の西だけ入口
        mrect(-8, 8, -6 - T, -6, 0, top), mrect(-8, 8, 6, 6 + T, 0, top), mrect(8, 8 + T, -6, 6, 0, top),
        mrect(-8 - T, -8, -6, -1, 0, top), mrect(-8 - T, -8, 1, 6, 0, top), mrect(-8 - T, -8, -1, 1, FLOOR_H, top),
        // 昇降路
        mrect(SHAFT.mx0 - T, SHAFT.mx0, SHAFT.mz0, SHAFT.mz1, 0, top), mrect(SHAFT.mx1, SHAFT.mx1 + T, SHAFT.mz0, SHAFT.mz1, 0, top),
        mrect(SHAFT.mx0, SHAFT.mx1, SHAFT.mz1, SHAFT.mz1 + T, 0, top),
        mrect(SHAFT.mx0, SHAFT.door0, SHAFT.mz0 - T, SHAFT.mz0, 0, top), mrect(SHAFT.door1, SHAFT.mx1, SHAFT.mz0 - T, SHAFT.mz0, 0, top),
        // 階段室の西の壁と、上りと下りの段の間の仕切り
        mrect(STAIR.mx0 - T, STAIR.mx0, -6, STAIR.mz1, 0, top), mrect(STAIR.mid - 0.05, STAIR.mid + 0.05, STAIR.landing, -1, 0, top),
    ];
    for (let f = 0; f < MANSION_STOPS - 1; f++) {
        const y0 = f * FLOOR_H;
        const y1 = y0 + FLOOR_H;
        // 南東の部屋と昇降路の西の間
        out.push(mrect(4 - T, 4, 1, 6, y0, y1));
        if (f === 0)
            continue;
        // 2 階より上：廊下と 4 部屋。ドアは幅 1.2m の開口
        out.push(mrect(-8, -5.6, -1 - T, -1, y0, y1), mrect(-4.4, 0.4, -1 - T, -1, y0, y1), mrect(1.6, 4, -1 - T, -1, y0, y1), mrect(-8, -5.6, 1, 1 + T, y0, y1), mrect(-4.4, 0.4, 1, 1 + T, y0, y1), mrect(1.6, 4, 1, 1 + T, y0, y1), mrect(-2 - T / 2, -2 + T / 2, -6, -1, y0, y1), mrect(-2 - T / 2, -2 + T / 2, 1, 6, y0, y1), 
        // 部屋の机
        ...[-5, 1].flatMap((mx) => [mrect(mx - 0.6, mx + 0.6, -4.2, -3.2, y0, y0 + 0.75), mrect(mx - 0.6, mx + 0.6, 3.2, 4.2, y0, y0 + 0.75)]));
    }
    return out;
}
/** 各階の床（2 階〜屋上）は、階段と昇降路の穴を空けた板 */
function mansionSurfaces() {
    const out = [];
    const flat = (mx0, mx1, mz0, mz1, y) => {
        const a = M(mx0, mz0);
        const b = M(mx1, mz1);
        return { x0: a.x, x1: b.x, z0: a.z, z1: b.z, ya: y, yb: y };
    };
    for (let f = 1; f < MANSION_STOPS; f++) {
        const y = f * FLOOR_H;
        out.push(flat(-8, 4, -6, 6, y), flat(4, 8, STAIR.mz1, SHAFT.mz0, y), flat(4, SHAFT.mx0, SHAFT.mz0, 6, y), flat(SHAFT.mx1, 8, SHAFT.mz0, 6, y), flat(SHAFT.mx0, SHAFT.mx1, SHAFT.mz1, 6, y));
    }
    for (let f = 0; f < MANSION_STOPS - 1; f++) {
        const y = f * FLOOR_H;
        const h = FLOOR_H / 2;
        const a = M(STAIR.mx0, STAIR.landing);
        const b = M(STAIR.mid, STAIR.mz1);
        // 西の段：南端（mz1）が低く、北（landing）へ上る
        out.push({ x0: a.x, x1: b.x, z0: a.z, z1: b.z, ya: y + h, yb: y, axis: 'z' });
        const c = M(STAIR.mx0, STAIR.mz0);
        const d = M(STAIR.mx1, STAIR.landing);
        out.push({ x0: c.x, x1: d.x, z0: c.z, z1: d.z, ya: y + h, yb: y + h });
        const e = M(STAIR.mid, STAIR.landing);
        const g = M(STAIR.mx1, STAIR.mz1);
        // 東の段：北（landing）が低く、南へ上って次の階へ
        out.push({ x0: e.x, x1: g.x, z0: e.z, z1: g.z, ya: y + h, yb: y + FLOOR_H, axis: 'z' });
    }
    return out;
}
/** マンションの階段の段（見た目用）。1 段ずつの箱 */
export function stairSteps() {
    const out = [];
    const n = 10;
    const run = (STAIR.mz1 - STAIR.landing) / n;
    for (let f = 0; f < MANSION_STOPS - 1; f++) {
        for (let i = 0; i < n; i++) {
            const y = f * FLOOR_H + ((i + 1) * FLOOR_H) / 2 / n;
            const w = M((STAIR.mx0 + STAIR.mid) / 2, STAIR.mz1 - (i + 0.5) * run);
            out.push({ x: w.x, z: w.z, w: STAIR.mid - STAIR.mx0, d: run, y });
            const e = M((STAIR.mid + STAIR.mx1) / 2, STAIR.landing + (i + 0.5) * run);
            out.push({ x: e.x, z: e.z, w: STAIR.mx1 - STAIR.mid, d: run, y: y + FLOOR_H / 2 });
        }
    }
    return out;
}
/* 電車：高架の環状線。角を丸めた正方形を時計回り（上から見て）に走る */
export const TRACK = { half: 48, r: 12, y: 6 };
/** 車内の床とホームの高さ */
export const PLATFORM_Y = 7;
export const CAR = { len: 11.4, w: 2.8, h: 2.6, spacing: 12, doors: [-3, 3], doorW: 1.4 };
const STRAIGHT = 2 * (TRACK.half - TRACK.r);
const ARC = (Math.PI * TRACK.r) / 2;
export const LOOP = 4 * (STRAIGHT + ARC);
/** 線路の上の s（m）の点と進む向き */
export function trackAt(s) {
    const L = ((s % LOOP) + LOOP) % LOOP;
    const H = TRACK.half;
    const c = H - TRACK.r;
    const side = Math.floor(L / (STRAIGHT + ARC));
    const u = L - side * (STRAIGHT + ARC);
    // side 0 は北の直線を東へ。そこから 90° ずつ回したもの
    let x;
    let z;
    let tx;
    let tz;
    if (u < STRAIGHT) {
        x = -c + u;
        z = -H;
        tx = 1;
        tz = 0;
    }
    else {
        const a = -Math.PI / 2 + (u - STRAIGHT) / TRACK.r;
        x = c + Math.cos(a) * TRACK.r;
        z = -c + Math.sin(a) * TRACK.r;
        tx = -Math.sin(a);
        tz = Math.cos(a);
    }
    for (let i = 0; i < side; i++) {
        [x, z] = [-z, x];
        [tx, tz] = [-tz, tx];
    }
    return { x, z, tx, tz };
}
/** 駅：北・東・南の直線のまん中。ホームは線路の内側 */
export const STATIONS = [
    { name: '北駅', s: STRAIGHT / 2 },
    { name: '東駅', s: STRAIGHT * 1.5 + ARC },
    { name: '南駅', s: STRAIGHT * 2.5 + ARC * 2 },
];
const DWELL = 10_000;
/** ドアが開いている間（止まっている間の 1 秒目〜9 秒目） */
const DOOR_OPEN = [1000, 9000];
const legs = STATIONS.map((st, i) => {
    const next = STATIONS[(i + 1) % STATIONS.length];
    const d = ((next.s - st.s) % LOOP + LOOP) % LOOP;
    return { from: st.s, d, ms: (4 + d / 10) * 1000 };
});
export const TRAIN_CYCLE = legs.reduce((a, l) => a + DWELL + l.ms, 0);
/** 電車のまん中の位置と、止まっている駅（ドアが開いているときだけ station） */
export function trainState(now) {
    let t = ((now % TRAIN_CYCLE) + TRAIN_CYCLE) % TRAIN_CYCLE;
    for (let i = 0; i < legs.length; i++) {
        const l = legs[i];
        if (t < DWELL)
            return { s: l.from, station: t >= DOOR_OPEN[0] && t < DOOR_OPEN[1] ? i : null, stopped: true };
        t -= DWELL;
        if (t < l.ms)
            return { s: l.from + (l.d * (1 - Math.cos((Math.PI * t) / l.ms))) / 2, station: null, stopped: false };
        t -= l.ms;
    }
    return { s: legs[0].from, station: null, stopped: true };
}
/** 号車 k のまん中・向き（前が +along）と、内側（ホーム側）を向く横の向き */
export function carPose(now, k) {
    const { s } = trainState(now);
    const p = trackAt(s + (k === 0 ? CAR.spacing / 2 : -CAR.spacing / 2));
    return { x: p.x, z: p.z, ax: p.tx, az: p.tz, nx: -p.tz, nz: p.tx, ry: Math.atan2(-p.tx, -p.tz) };
}
export const toCarLocal = (c, x, z) => ({ along: (x - c.x) * c.ax + (z - c.z) * c.az, side: (x - c.x) * c.nx + (z - c.z) * c.nz });
export const fromCarLocal = (c, along, side) => ({ x: c.x + c.ax * along + c.nx * side, z: c.z + c.az * along + c.nz * side });
/** 駅のホームと、地上へ下りる坂（どちらも軸に沿った長方形） */
const PLAT = { len: 26, from: CAR.w / 2 + 0.1, to: CAR.w / 2 + 4.1, rampAt: [9, 12], rampLen: 14 };
function stationFrame(i) {
    const p = trackAt(STATIONS[i].s);
    return { ...p, nx: -p.tz, nz: p.tx };
}
const frameRect = (f, a0, a1, s0, s1) => {
    const xs = [f.x + f.tx * a0 + f.nx * s0, f.x + f.tx * a1 + f.nx * s1];
    const zs = [f.z + f.tz * a0 + f.nz * s0, f.z + f.tz * a1 + f.nz * s1];
    return { x0: Math.min(...xs), x1: Math.max(...xs), z0: Math.min(...zs), z1: Math.max(...zs) };
};
const solidOf = (r, y0, y1) => rect(r.x0, r.x1, r.z0, r.z1, y0, y1);
/** 止まった電車のドアの位置（ホームの中心からの along） */
export const DOOR_SPOTS = [CAR.spacing / 2, -CAR.spacing / 2].flatMap((c) => CAR.doors.map((d) => c + d));
function stationParts(i) {
    const f = stationFrame(i);
    const y = PLATFORM_Y;
    const half = PLAT.len / 2;
    const [ra, rb] = PLAT.rampAt;
    const surfaces = [{ ...frameRect(f, -half, half, PLAT.from, PLAT.to), ya: y, yb: y }];
    // 坂はホームの奥から内側へ下りる。ya/yb はその長方形の軸の小さい側と大きい側の高さ
    const ramp = frameRect(f, ra, rb, PLAT.to, PLAT.to + PLAT.rampLen);
    const axis = Math.abs(f.nx) > 0.5 ? 'x' : 'z';
    const outward = axis === 'x' ? f.nx : f.nz;
    surfaces.push({ ...ramp, axis, ya: outward > 0 ? y : 0, yb: outward > 0 ? 0 : y });
    const rail = (a0, a1, s0, s1) => solidOf(frameRect(f, a0, a1, s0, s1), y, y + 1.2);
    const solids = [
        // 奥の柵（坂の口だけ空ける）と両端
        rail(-half, ra, PLAT.to, PLAT.to + 0.1), rail(rb, half, PLAT.to, PLAT.to + 0.1),
        rail(-half - 0.1, -half, PLAT.from, PLAT.to), rail(half, half + 0.1, PLAT.from, PLAT.to),
        // 坂の手すり（地上を歩く人にとっても壁）
        solidOf(frameRect(f, ra - 0.1, ra, PLAT.to, PLAT.to + PLAT.rampLen)), solidOf(frameRect(f, rb, rb + 0.1, PLAT.to, PLAT.to + PLAT.rampLen)),
        // 段の下は詰まった塊なので、地上の人（と 2D の人）は入れない。高さ 0.9m より上は段の上を歩く人なので効かせない。
        // 下の 3m は空けておく（上り始めの人が縁に押し戻されないよう、縁に着く頃には 0.9m より上にいる長さ）
        solidOf(frameRect(f, ra, rb, PLAT.to, PLAT.to + PLAT.rampLen - 3), 0, 0.9),
    ];
    // 線路側の柵。ドアの位置は電車が止まってドアが開いている間だけ通れる
    const edge = [-half, ...DOOR_SPOTS.slice().sort((a, b) => a - b).flatMap((d) => [d - CAR.doorW / 2, d + CAR.doorW / 2]), half];
    for (let j = 0; j < edge.length; j += 2)
        solids.push(rail(edge[j], edge[j + 1], PLAT.from - 0.1, PLAT.from));
    const gates = DOOR_SPOTS.map((d) => rail(d - CAR.doorW / 2, d + CAR.doorW / 2, PLAT.from - 0.1, PLAT.from));
    return { surfaces, solids, gates, frame: f };
}
export const STATION_PARTS = STATIONS.map((_, i) => stationParts(i));
/* 街のほかの建物。h は高さ（当たり判定は高さを問わない） */
export const BUILDINGS = [
    { x: -14, z: -36, w: 10, d: 12, h: 14, color: '#c9b79c' },
    { x: 24, z: -36, w: 8, d: 10, h: 9, color: '#a8b8c8' },
    { x: 37, z: -36, w: 10, d: 12, h: 26, color: '#8f9db3' },
    { x: 36, z: -12, w: 10, d: 10, h: 18, color: '#b7a28f' },
    { x: 36, z: 22, w: 10, d: 12, h: 12, color: '#c7c0a8' },
    { x: 36, z: 37, w: 10, d: 8, h: 8, color: '#d8b3a0' },
    { x: -23, z: 36, w: 9, d: 10, h: 10, color: '#b9c7b0' },
    { x: 22, z: 37, w: 8, d: 8, h: 15, color: '#a9a2c2' },
    { x: -36, z: 36, w: 12, d: 12, h: 20, color: '#c4a7a7' },
    { x: -36, z: 12, w: 10, d: 12, h: 11, color: '#a7bdc4' },
    { x: -36, z: -12, w: 10, d: 10, h: 16, color: '#cbbf94' },
];
/** 高架の柱（線路に沿って 15m ごと。地上では通り抜けられない） */
export const PILLARS = Array.from({ length: Math.floor(LOOP / 15) }, (_, i) => trackAt(i * 15 + 7.5));
/** 広場の噴水と木 */
export const PLAZA = { fountain: { x: 0, z: -6, r: 2.2 }, trees: [{ x: -12, z: -12 }, { x: 12, z: -12 }, { x: -12, z: 14 }, { x: 12, z: 14 }, { x: -16, z: 0 }, { x: 16, z: 0 }] };
/** マンションの壁と机（見た目もこれから作る） */
export const MANSION_SOLIDS = mansionSolids();
export const CITY_SOLIDS = [
    ...MANSION_SOLIDS,
    ...BUILDINGS.map((b) => rect(b.x - b.w / 2, b.x + b.w / 2, b.z - b.d / 2, b.z + b.d / 2)),
    ...PILLARS.map((p) => ({ x: p.x, z: p.z, r: 0.5, y0: 0, y1: TRACK.y })),
    ...STATION_PARTS.flatMap((p) => p.solids),
    { x: PLAZA.fountain.x, z: PLAZA.fountain.z, r: PLAZA.fountain.r },
    ...PLAZA.trees.map((t) => ({ x: t.x, z: t.z, r: 0.4 })),
];
export const CITY_SURFACES = [...mansionSurfaces(), ...STATION_PARTS.flatMap((p) => p.surfaces)];
export function surfaceHeight(s, x, z) {
    if (x < s.x0 || x > s.x1 || z < s.z0 || z > s.z1)
        return null;
    if (!s.axis || s.ya === s.yb)
        return s.ya;
    const t = s.axis === 'x' ? (x - s.x0) / (s.x1 - s.x0) : (z - s.z0) / (s.z1 - s.z0);
    return s.ya + (s.yb - s.ya) * t;
}
export const ELEVATOR_SPEED = 2.5;
/** 呼ばれてからドアを閉めて動き出すまで */
export const ELEVATOR_CLOSE_MS = 1200;
/** 着いてから次の行き先へ向かうまで（ドアが開いている） */
export const ELEVATOR_DWELL_MS = 4000;
export const NEW_ELEVATOR = { from: 0, to: 0, startAt: 0, queue: [] };
export const elevatorArriveAt = (e) => e.startAt + (Math.abs(e.to - e.from) * FLOOR_H / ELEVATOR_SPEED) * 1000;
export function elevatorY(e, now) {
    if (now <= e.startAt)
        return e.from * FLOOR_H;
    const end = elevatorArriveAt(e);
    if (now >= end)
        return e.to * FLOOR_H;
    const u = (now - e.startAt) / (end - e.startAt);
    return (e.from + (e.to - e.from) * u) * FLOOR_H;
}
/** その階のドアが開いているか。着いて止まっている間だけ開き、次へ動き出す少し前に閉める */
export function elevatorDoorOpen(e, floor, now) {
    if (e.to !== floor || now < elevatorArriveAt(e))
        return e.from === floor && now < e.startAt - ELEVATOR_CLOSE_MS;
    return true;
}
/** 階のドアの当たり判定（閉まっている間だけ効かせる） */
export const SHAFT_DOOR = (f) => mrect(SHAFT.door0, SHAFT.door1, SHAFT.mz0 - T, SHAFT.mz0, f * FLOOR_H, f * FLOOR_H + 2.4);
export const stopLabel = (f) => (f === MANSION_STOPS - 1 ? '屋上' : `${f + 1}階`);
/** 地上の位置を街の中に収める */
export const clampCity = (v) => Math.max(-CITY_HALF + 0.5, Math.min(CITY_HALF - 0.5, v));
/** 昇降路の内側（エレベーターのかごの中）か */
export const inShaft = (x, z) => x > SHAFT_RECT.x0 && x < SHAFT_RECT.x1 && z > SHAFT_RECT.z0 && z < SHAFT_RECT.z1;
/** 呼び出しボタンとかごの中のボタンの位置（見た目と押す判定） */
export const SHAFT_FRONT = M((SHAFT.door0 + SHAFT.door1) / 2, SHAFT.mz0);
export const mansionPoint = M;
