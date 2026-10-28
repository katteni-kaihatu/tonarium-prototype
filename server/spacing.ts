import type { AvatarState, Participant } from '../shared/protocol.ts';
import type { Item } from '../shared/items.ts';
import { JUMP_PAD } from '../shared/jumpPad.ts';

/** 体の半径（m）。2D の人は他の人やアイテムに押されて、重ならない位置へ少しずつずれる */
export const PERSON = 0.35;
const ITEM_R: Partial<Record<Item['kind'], number>> = { telephone: 0.9, jumpPad: JUMP_PAD.radius, mirror: 1, bike: 0.9, chess: 0.9, chessAi: 0.9, g2048: 0.7, canvas: 0.9, image: 0.7, youtube: 0.8, note: 0.6, dice: 0.5, antimatter: 0.7 };
const itemRadius = (it: Item) => ITEM_R[it.kind] ?? 0.4;

interface Body { x: number; z: number; r: number; id?: string }

function bodies(users: Participant[], avatars: Map<string, AvatarState>, items: Iterable<Item>): Body[] {
  const out: Body[] = [];
  for (const u of users) {
    const a = u.mode === '3d' ? avatars.get(u.id) : u.mode === '2d' && !u.follow ? u.pos : null;
    if (a) out.push({ x: a.x, z: a.z, r: PERSON, id: u.id });
  }
  for (const it of items) if (!('holder' in it && it.holder)) out.push({ x: it.x, z: it.z, r: itemRadius(it) });
  return out;
}

/**
 * 置かれている 2D の人を、重なっている相手から押し出す。動いた人がいれば true。
 * スポーンエリアにいる人（pos が null）と、ついていっている間は対象外
 */
export function pushApart2D(
  users: Participant[], avatars: Map<string, AvatarState>, items: Iterable<Item>,
  clampPos: (p: AvatarState) => AvatarState,
) {
  const itemList = [...items];
  // bodies は対象ごとに組み直さず1回だけ作る。元の挙動では後続の対象が「前に押された人の
  // 新しい座標」を見るので、押し出しのたびに共有側の座標も更新して結果を一致させる
  const all = bodies(users, avatars, itemList);
  const own = new Map<string, Body>();
  for (const b of all) if (b.id !== undefined) own.set(b.id, b);
  let moved = false;
  for (const u of users) {
    if (u.mode !== '2d' || !u.pos || u.follow) continue;
    let dx = 0;
    let dz = 0;
    for (const b of all) {
      if (b.id === u.id) continue;
      let vx = u.pos.x - b.x;
      let vz = u.pos.z - b.z;
      let d = Math.hypot(vx, vz);
      const min = PERSON + b.r;
      if (d >= min) continue;
      if (d < 0.001) { const a = Math.random() * Math.PI * 2; vx = Math.cos(a); vz = Math.sin(a); d = 1; }
      // 1 回で全部は動かさず、なめらかに離れる
      const push = Math.min(0.25, (min - d) * 0.6);
      dx += (vx / d) * push;
      dz += (vz / d) * push;
    }
    if (Math.hypot(dx, dz) < 0.01) continue;
    u.pos = clampPos({ ...u.pos, x: u.pos.x + dx, z: u.pos.z + dz });
    const mine = own.get(u.id);
    if (mine) { mine.x = u.pos.x; mine.z = u.pos.z; }
    moved = true;
  }
  return moved;
}

/** 2D の人がアイテムを出すとき、ほかの物や人に重ならない近くの場所を探す */
export function freeSpot(
  x: number, z: number, radius: number, users: Participant[], avatars: Map<string, AvatarState>, items: Iterable<Item>,
  clampXZ: (x: number, z: number) => { x: number; z: number },
) {
  const others = bodies(users, avatars, items);
  const free = (p: { x: number; z: number }) => others.every((b) => Math.hypot(p.x - b.x, p.z - b.z) >= b.r + radius);
  for (let ring = 0; ring <= 6; ring++) {
    const n = ring === 0 ? 1 : ring * 8;
    for (let i = 0; i < n; i++) {
      const a = (i / n) * Math.PI * 2;
      const p = clampXZ(x + Math.cos(a) * ring * 0.6, z + Math.sin(a) * ring * 0.6);
      if (free(p)) return p;
    }
  }
  return clampXZ(x, z);
}

export { itemRadius };
