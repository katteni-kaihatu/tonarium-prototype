import { sourceText as uiSource } from '../i18n/core.ts';
import { applyItemAction, type ItemAction, type ItemKind, type MediaInit } from '../../../shared/items.ts';
import type { ItemVariant } from '../../../shared/item-variants.ts';
import { isCameraTimerItem } from '../../../shared/camera-timer-demo.ts';
import { ROOM_HALF, spawnSlot, type AvatarState } from '../../../shared/protocol.ts';
import { approach } from '../../../shared/places.ts';
import { get, set, recompute, heldHammer, heldCamera, type ItemUi } from '../store.ts';
import { send } from '../net/ws.ts';
import { placesOf } from '../spatial.ts';
import { stopWalk } from '../walk.ts';

const LIMIT = ROOM_HALF - 0.5;
const clamp = (v: number) => Math.max(-LIMIT, Math.min(LIMIT, v));
export const clampRoomPos = (p: AvatarState): AvatarState => ({ ...p, x: clamp(p.x), z: clamp(p.z) });

/** 自分の前に出す */
export function spawnItem(kind: ItemKind, text?: string, media?: MediaInit, variant?: ItemVariant) {
  const s = get();
  if (!s.session) return;
  const me = placesOf(s).get(s.selfId) ?? { ...spawnSlot(0), ry: 0 };
  const gap = s.mode === '3d' ? 2.2 : 1.2;
  const x = me.x - Math.sin(me.ry) * gap;
  const z = me.z - Math.cos(me.ry) * gap;
  send({ t: 'itemCreate', kind, text, media, variant, x: clamp(x), z: clamp(z), ry: me.ry });
}

/** 入力が途切れないよう手元にすぐ反映してから送る */
export function editNote(id: string, patch: { text?: string; color?: string }) {
  if (get().items[id]?.mapPlacement?.mode === 'system') return;
  const sid = get().session;
  if (!sid) return;
  set((s) => {
    const it = s.itemsBy[sid]?.[id];
    return it?.kind === 'note' ? { itemsBy: { ...s.itemsBy, [sid]: { ...s.itemsBy[sid], [id]: { ...it, ...patch } } } } : {};
  });
  recompute();
  send({ t: 'itemAction', id, action: { a: 'noteEdit', ...patch } });
}

export function postImage(text: string, image: string) {
  if (get().session) send({ t: 'chat', text, image, scope: 'all' });
}

export function removeItem(id: string) {
  const item = get().items[id];
  if (item?.mapPlacement?.mode === 'system' && !isCameraTimerItem(item)) return;
  send({ t: 'itemRemove', id });
}

export function itemAction(id: string, action: ItemAction) {
  if (get().items[id]?.mapPlacement?.mode === 'system') return;
  send({ t: 'itemAction', id, action });
}

export function moveItem(id: string, x: number, z: number, ry: number, transform: { y?: number; scale?: number } = {}) {
  if (get().items[id]?.mapPlacement?.mode === 'system') return;
  const sid = get().session;
  if (!sid) return;
  set((s) => {
    const it = s.itemsBy[sid]?.[id];
    return it ? { itemsBy: { ...s.itemsBy, [sid]: { ...s.itemsBy[sid], [id]: { ...it, x, z, ry, ...transform } } } } : {};
  });
  recompute();
  send({ t: 'itemMove', id, x, z, ry, ...transform });
}

export function setItemUi(id: string, ui: ItemUi) {
  set((s) => ({ itemUi: { ...s.itemUi, [id]: ui } }));
}

export function applyDelta(sid: string, id: string, action: ItemAction, by: string) {
  const cur = get().itemsBy[sid]?.[id];
  if (!cur || cur.mapPlacement?.mode === 'system') return;
  const next = cur.kind === 'canvas' ? { ...cur, strokes: [...cur.strokes] } : { ...cur };
  if (!applyItemAction(next, action, by, Math.random)) return;
  set((s) => ({ itemsBy: { ...s.itemsBy, [sid]: { ...s.itemsBy[sid], [id]: next } } }));
  if (sid === get().session) recompute();
}

export function deltaAction(id: string, action: ItemAction) {
  if (get().items[id]?.mapPlacement?.mode === 'system') return;
  const s = get();
  if (!s.session) return;
  // P2P対応時は全消去との競合も送り主を含めて同じ順序で確定する。
  if (!s.syncPeerDelivery) applyDelta(s.session, id, action, s.selfId);
  send({ t: 'itemAction', id, action });
}

export function dropHammer() {
  const s = get();
  const h = heldHammer(s);
  if (!h) return;
  if (s.mode === '3d') {
    const a = s.selfAvatar;
    itemAction(h.id, { a: 'drop', x: clamp(a.x - Math.sin(a.ry) * 1.2), z: clamp(a.z - Math.cos(a.ry) * 1.2), ry: a.ry });
  } else {
    itemAction(h.id, { a: 'drop', x: h.x, z: h.z, ry: h.ry });
  }
}

export function dropCamera(pitch: number, cameraY?: number, groundAt?: (x: number, z: number) => number) {
  const s = get();
  const c = heldCamera(s);
  if (!c) return;
  const a = s.selfAvatar;
  const x = clamp(a.x - Math.sin(a.ry) * 0.7);
  const z = clamp(a.z - Math.cos(a.ry) * 0.7);
  itemAction(c.id, { a: 'drop', x, z, ry: a.ry, pitch, cameraY, groundY: groundAt?.(x, z) });
}

export function toggleLive(id: string) {
  const it = get().items[id];
  if (it?.kind !== 'camera') return;
  if (!it.live && get().voice !== 'connected') {
    set({ voiceError: uiSource('ui340') });
    return;
  }
  itemAction(id, { a: 'camLive', on: !it.live });
}

export function hit(to: string) {
  if (to === get().selfId || !heldHammer(get())) return;
  send({ t: 'hit', to });
}

export function place2d(target: string, pos: { x: number; z: number; ry: number } | null) {
  if (target === get().selfId) stopWalk();
  send({ t: 'place2d', target, pos });
}

export function hitAndMove(to: string) {
  const s = get();
  if (!heldHammer(s) || to === s.selfId) return;
  hit(to);
  if (s.mode !== '2d') return;
  const places = placesOf(s);
  const t = places.get(to);
  if (t) place2d(s.selfId, approach(places.get(s.selfId), t, 0.8));
}
