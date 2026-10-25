import { t as tr } from '../i18n/index.ts';
import { useEffect, useRef } from 'react';
import { useFrame, useThree } from '@react-three/fiber';
import * as THREE from 'three';
import { ROOM_HALF, type AvatarState } from '../../../shared/protocol.ts';
import { JUMP_PAD, jumpPadAt, jumpPadSolid, type JumpPad } from '../../../shared/jumpPad.ts';
import { ARENA, FALL_Y, LAYER_Y, TILE_COUNT, TILE, inArena, startTile, tileBelow, tileCenter, tileGone } from '../../../shared/game.ts';
import { SURVIVOR_MOVE_SPEED } from '../../../shared/survivor.ts';
import { SURVIVOR_STYLES } from '../i18n/static.ts';
import { get, set, useStore, heldHammer, heldCamera, nameOf, solidsOf, worldKindOf, gameOfSession, elevatorOfSession, serverNow, spawnPoint } from '../store.ts';
import { CAR, CITY_HALF, CITY_SURFACES, SHAFT_RECT, clampCity, elevatorY, type Surface } from '../../../shared/city.ts';
import { STEP_UP, carPose, cityGround, citySolids, keepInCar, toCarLocal } from './cityPhysics.ts';
import { pushOut, type Solid } from '../../../shared/worlds.ts';
import { send } from '../net/ws.ts';
import { selectNote } from '../actions.ts';
import { dropCamera, dropHammer, hit, moveItem, place2d, toggleLive, itemAction } from '../items/actions.ts';
import { bikeDisplay, moveBike, requestBikeMount, riddenBike } from './bikeControl.ts';
import { clampBike, type VehicleState } from '../../../shared/vehicle.ts';
import { bump } from '../items/effects.ts';
import { aimAt, aimOn, carrying, clampRoom, type Interactable } from './interact.ts';
import { useEyeHeight } from './eyeHeight.ts';
import { DEFAULT_EYE_HEIGHT } from '../../../shared/avatar.ts';
import { HammerModel } from './items3d.tsx';
import { takePhoto, world } from './cameraRender.ts';
import { CameraModel, cameraHelp } from './camera3d.tsx';
import { PlayerCamera } from './playerCamera.ts';
import { blocked, blockedByTrain, fallToGround, moveFlight, recoverPosition, walkingAfterMove, type MovementMode } from './movement.ts';
import { canLean, leanAngle, pressJump } from './movementAbilities.ts';
import { xr, xrState } from '../xr/runtime.ts';

const SPEED = 4;
const BODY_R = 0.3;

type Store = ReturnType<typeof get>;
const survivorPlaying = (s: Store) => {
  if (worldKindOf(s) !== 'survivors') return false;
  const phase = s.survivors[s.session ?? '']?.phase;
  return s.movementMode === 'walk' && (phase === 'running' || phase === 'boss');
};

/** (x, z) で足元 y から落ちたときに着く高さ。塔の上で下に板が無ければ null（落ち続ける）。car は街の電車の床 */
function groundAt(s: Store, x: number, z: number, y: number): { y: number; tile: number | null; car?: number | null } | null {
  if (worldKindOf(s) === 'city') return { ...cityGround(x, z, y, serverNow(), elevatorOfSession(s)), tile: null };
  if (worldKindOf(s) !== 'game' || !inArena(x, z)) return y >= -0.05 ? { y: 0, tile: null } : null;
  const t = tileBelow(gameOfSession(s), x, z, y, serverNow());
  return t ? { y: t.y, tile: t.i } : null;
}

/** 塔の上にいる間は塔の端から出られない（ロビーへはガラスで戻れない）。街は広い */
const clampTo = (onTower: boolean, city: boolean) => (onTower
  ? (v: number, c: number) => Math.max(c - ARENA.half + 0.25, Math.min(c + ARENA.half - 0.25, v))
  : city ? (v: number) => clampCity(v) : (v: number) => clampRoom(v));
const SENS = 0.0025;

const isTyping = (t: EventTarget | null) =>
  t instanceof HTMLElement && (t.tagName === 'INPUT' || t.tagName === 'TEXTAREA' || t.isContentEditable);

function hintFor(aim: { data: Interactable; hit: THREE.Intersection } | null): string | null {
  if (riddenBike()) return tr('mergeBikeControls');
  if (carrying.current) return tr("ui525");
  const s = get();
  const cam = heldCamera(s);
  if (cam) return cameraHelp(cam);
  if (!aim) return null;
  if (heldHammer(s) && aim.data.hitTarget) {
    const t = typeof aim.data.hitTarget === 'function' ? aim.data.hitTarget(aim.hit) : aim.data.hitTarget;
    if (t && t !== s.selfId) return tr("ui526", nameOf(t));
  }
  const parts = [aim.data.hint, aim.data.carry && tr("ui527"), aim.data.remove && tr("ui528")].filter(Boolean);
  return parts.length ? parts.join(tr("ui529")) : null;
}

/** `user:<ID>` は 2D の人の立ち姿、`display:<ID>` はその人の配信ディスプレイ */
function sendCarry(c: { id: string; x: number; z: number; ry: number }) {
  // 立ち姿の前は -Z なので、運ぶ人の方を向けるには +180°
  if (c.id.startsWith('user:')) place2d(c.id.slice(5), { x: c.x, z: c.z, ry: c.ry + Math.PI });
  else if (c.id.startsWith('display:')) send({ t: 'displayMove', target: c.id.slice(8), x: c.x, z: c.z, ry: c.ry });
  else moveItem(c.id, c.x, c.z, c.ry);
}

function finishCarry() {
  const c = carrying.current;
  if (!c) return;
  sendCarry(c);
  carrying.current = null;
}

export function Player({ rig }: { rig: PlayerCamera }) {
  const eyeHeight = useEyeHeight();
  const { camera, gl, scene } = useThree();
  const survivorActive = useStore((s) => survivorPlaying(s));
  const heldCam = useStore((s) => heldCamera(s));
  const position = useRef(new THREE.Vector3(get().selfAvatar.x, 0, get().selfAvatar.z));
  const keys = useRef<Record<string, boolean>>({});
  const driving = useRef<{ id: string; version: number; state: VehicleState; sent: number } | null>(null);
  const look = useRef({ yaw: get().selfAvatar.ry, pitch: -0.05 });
  // NaN だと比較が常に false になり一度も送られないので Infinity
  const sent = useRef({ t: 0, x: Infinity, z: Infinity, ry: Infinity, pitch: Infinity, lean: 0, jump: 0, y: 0, walking: false });
  const walking = useRef(false);
  // 足元の高さ・上下の速さ・跳んだ回数。stepped は最後に踏んだと伝えた板、round は塔の上に移ったゲームの回
  // car は街の電車に乗っている号車。乗っている間は毎フレーム電車が動いた分だけ一緒に動かす
  const body = useRef({ y: get().selfAvatar.y ?? 0, vy: 0, grounded: true, extraJump: false, n: get().selfAvatar.jump ?? 0, stepped: -1, round: -1, survivorRun: -1, car: null as number | null });
  const leanConsumed = useRef<Record<string, boolean>>({});
  const aim = useRef<ReturnType<typeof aimAt>>(null);
  const previousMode = useRef<MovementMode>('walk');
  const syncAirHeight = useRef(false);
  const hammerRef = useRef<THREE.Group>(null);
  const cameraRef = useRef<THREE.Group>(null);
  const dragging = useRef<{ data: Interactable; obj: THREE.Object3D; hit: THREE.Intersection | null } | null>(null);
  // 毎フレームの当たり判定用配列の再利用 (#205)。材料が変わらない間は前フレームの配列・面オブジェクトをそのまま使う。
  // 材料は items の参照＋運搬中の id（台）、元配列と台の組（solids）、かごの高さ（街の面）、板の消え具合（ゲームの面）で全て決まる。
  const collCache = useRef<{
    padsItems: Store['items'] | null; padsCarrying: string | undefined; pads: JumpPad[]; padSolids: Solid[];
    solidsBase: Solid[] | null; solidsPads: Solid[] | null; solids: Solid[];
    cityY: number | null; citySurfaces: Surface[];
    goneFlags: Uint8Array; goneScratch: Uint8Array; tileSurfaces: Surface[] | null;
  }>({ padsItems: null, padsCarrying: undefined, pads: [], padSolids: [], solidsBase: null, solidsPads: null, solids: [], cityY: null, citySurfaces: [], goneFlags: new Uint8Array(TILE_COUNT), goneScratch: new Uint8Array(TILE_COUNT), tileSurfaces: null });

  useEffect(() => {
    if (survivorActive && document.pointerLockElement === gl.domElement) document.exitPointerLock();
  }, [survivorActive, gl]);

  useEffect(() => {
    const a = get().selfAvatar;
    position.current.set(a.x, eyeHeight.current.current + (a.y ?? 0), a.z);
    camera.rotation.order = 'YXZ';
    world.scene = scene;
    world.camera = camera as THREE.PerspectiveCamera;
    const canvas = gl.domElement;

    const onLock = () => {
      const locked = document.pointerLockElement === canvas;
      set({ locked });
      if (!locked) { keys.current = {}; leanConsumed.current = {}; rig.lean = 0; }
    };
    const onMouseDown = (e: MouseEvent) => {
      if (xrState().active) return;
      if (survivorPlaying(get())) return;
      if (riddenBike() && e.button === 2) return;
      if (e.button === 2) {
        if (document.pointerLockElement !== canvas) return;
        if (carrying.current) finishCarry();
        else if (aim.current?.data.carry) carrying.current = { id: aim.current.data.carry, x: 0, z: 0, ry: 0, last: 0 };
        return;
      }
      if (e.button !== 0) return;
      if (document.pointerLockElement !== canvas) {
        // ロック前のクリックは操作開始だけ
        if (e.target === canvas) { selectNote(null); void canvas.requestPointerLock(); }
        return;
      }
      use();
    };
    const onMouseUp = (e: MouseEvent) => {
      if (e.button !== 0 || !dragging.current) return;
      dragging.current.data.drag!('end', dragging.current.hit);
      dragging.current = null;
    };
    const onMouseMove = (e: MouseEvent) => {
      if (xrState().active) return;
      if (document.pointerLockElement !== canvas) return;
      if (survivorPlaying(get())) return;
      if (!riddenBike()) look.current.yaw -= e.movementX * SENS;
      look.current.pitch = Math.max(-1.4, Math.min(1.4, look.current.pitch - e.movementY * SENS));
    };
    const onKeyDown = (e: KeyboardEvent) => {
      if (isTyping(e.target)) return;
      if (rig.keyDown(e)) return;
      const freshPress = !e.repeat && !keys.current[e.code];
      keys.current[e.code] = true;
      if ((e.code === 'KeyQ' || e.code === 'KeyE') && (heldHammer(get()) || heldCamera(get()) || carrying.current || dragging.current || riddenBike() || aim.current?.data.bike)) {
        leanConsumed.current[e.code] = true;
        rig.lean = 0;
      }
      if (e.code === 'KeyE' && !e.repeat) {
        const bike = riddenBike();
        if (bike) {
          const d = driving.current;
          if (d?.id === bike.id && d.version === bike.rideVersion)
            itemAction(bike.id, { a: 'bikeDrive', state: d.state, rideVersion: d.version });
          itemAction(bike.id, { a: 'bikeDismount' });
        }
        else {
          const id = aim.current?.data.bike;
          if (id && !carrying.current && body.current.car === null && body.current.grounded) requestBikeMount(id);
        }
      }
      if (riddenBike()) { if (e.code === 'Space' || e.code.startsWith('Arrow')) e.preventDefault(); return; }
      if (e.code === 'Escape') selectNote(null);
      if (e.code === 'Space' && !survivorPlaying(get())) {
        e.preventDefault();
        const b = body.current;
        if (get().movementMode === 'walk' && pressJump(b, get().doubleJump, freshPress) === 'extra') syncAirHeight.current = true;
      }
      if (e.code === 'KeyQ') { dropHammer(); dropCamera(look.current.pitch); }
      const aimedCam = () => {
        const id = aim.current?.data.carry;
        const it = id ? get().items[id] : undefined;
        return it?.kind === 'camera' ? it : undefined;
      };
      if (e.code === 'KeyL') { const c = heldCamera(get()) ?? aimedCam(); if (c) toggleLive(c.id); }
      if (e.code === 'KeyC') { const c = aimedCam(); if (c) takePhoto(c); }
      if (e.code === 'KeyX' && !carrying.current) aim.current?.data.remove?.();
    };
    const onWheel = (e: WheelEvent) => {
      if (!rig.thirdPerson || (!xrState().active && document.pointerLockElement !== canvas && e.target !== canvas)) return;
      e.preventDefault();
      rig.zoom(e.deltaY);
    };
    const onKeyUp = (e: KeyboardEvent) => { keys.current[e.code] = false; leanConsumed.current[e.code] = false; };
    const onBlur = () => { keys.current = {}; leanConsumed.current = {}; rig.lean = 0; };
    xr.use = () => { aim.current = aimAt(scene, camera, xr.ray); use(); };
    xr.release = () => {
      if (dragging.current) { dragging.current.data.drag!('end', dragging.current.hit); dragging.current = null; }
    };
    xr.cancel = finishCarry;
    xr.carry = () => {
      if (riddenBike()) return;
      aim.current = aimAt(scene, camera, xr.ray);
      if (carrying.current) finishCarry();
      else if (aim.current?.data.carry) carrying.current = { id: aim.current.data.carry, x: 0, z: 0, ry: 0, last: 0 };
    };

    document.addEventListener('pointerlockchange', onLock);
    // 右クリックは運ぶ操作に使うので、ロック中はメニューを出さない
    const onContextMenu = (e: MouseEvent) => { if (document.pointerLockElement === canvas) e.preventDefault(); };
    document.addEventListener('mousedown', onMouseDown);
    document.addEventListener('contextmenu', onContextMenu);
    document.addEventListener('mousemove', onMouseMove);
    document.addEventListener('mouseup', onMouseUp);
    canvas.addEventListener('wheel', onWheel, { passive: false });
    window.addEventListener('keydown', onKeyDown);
    window.addEventListener('keyup', onKeyUp);
    window.addEventListener('blur', onBlur);
    return () => {
      if (world.camera === camera) { world.camera = null; world.scene = null; }
      document.removeEventListener('pointerlockchange', onLock);
      document.removeEventListener('mousedown', onMouseDown);
      document.removeEventListener('contextmenu', onContextMenu);
      document.removeEventListener('mousemove', onMouseMove);
      document.removeEventListener('mouseup', onMouseUp);
      canvas.removeEventListener('wheel', onWheel);
      window.removeEventListener('keydown', onKeyDown);
      window.removeEventListener('keyup', onKeyUp);
      window.removeEventListener('blur', onBlur);
      if (document.pointerLockElement === canvas) document.exitPointerLock();
      rig.lean = 0;
      xr.release?.();
      xr.use = null; xr.release = null; xr.carry = null; xr.cancel = null;
      finishCarry();
      const bike = riddenBike();
      if (bike) itemAction(bike.id, { a: 'bikeDismount' });
      if (driving.current) bikeDisplay.delete(driving.current.id);
      set({ locked: false, aimHint: null });
    };
  }, [camera, gl, rig]);

  function use() {
    if (riddenBike()) return;
    if (carrying.current) { finishCarry(); return; }
    const s = get();
    const target = aim.current;
    if (target?.data.bike && (!body.current.grounded || body.current.car !== null || Math.abs(body.current.y) > 0.3)) return;
    const cam = heldCamera(s);
    if (cam) { takePhoto(cam); return; }
    if (heldHammer(s)) {
      set((st) => ({ swings: { ...st.swings, [s.selfId]: performance.now() } }));
      const ht = target?.data.hitTarget;
      const to = typeof ht === 'function' ? ht(target!.hit) : ht;
      if (to && to !== s.selfId && target!.hit.distance < 5) { hit(to); return; }
      if (!target?.data.use && !target?.data.drag) return;
    }
    if (target?.data.drag) {
      dragging.current = { data: target.data, obj: target.obj, hit: target.hit };
      target.data.drag('start', target.hit);
      return;
    }
    target?.data.use?.(target.hit);
  }

  // 開発時のテスト用（マウスロックできない環境から操作する）
  useEffect(() => {
    if (!import.meta.env.DEV) return;
    (window as unknown as Record<string, unknown>).__t3d = {
      use,
      look: (yaw: number, pitch: number) => { look.current = { yaw, pitch }; },
      pos: (x: number, z: number, y?: number) => { position.current.x = x; position.current.z = z; if (y !== undefined) { body.current.y = y; body.current.vy = 0; } },
      key: (code: string) => window.dispatchEvent(new KeyboardEvent('keydown', { code })),
      state: get,
    };
  });

  useFrame((_, dt) => {
    const immersive = xrState().active;
    if (immersive) { look.current.yaw += xr.turn; xr.turn = 0; }
    const eye = eyeHeight.current;
    eye.current += (eye.target - eye.current) * (1 - Math.exp(-dt / 0.2));
    const s = get();
    const b = body.current;
    const toLobby = () => {
      const p = spawnPoint();
      set({ teleport: p });
    };
    const g = gameOfSession(s);
    const survivorRun = s.survivors[s.session ?? ''];
    const survivorMe = survivorRun?.players[s.selfId];
    const survivorPaused = survivorRun?.pausedAt != null;
    if (worldKindOf(s) !== 'survivors') b.survivorRun = -1;
    if (survivorPlaying(s) && survivorMe && b.survivorRun !== survivorRun?.run) {
      b.survivorRun = survivorRun!.run;
      b.stepped = -1;
      set({ teleport: { x: survivorMe.x, z: survivorMe.z, ry: 0 } });
    }
    if (worldKindOf(s) === 'game') {
      const meIdx = g.players.findIndex((p) => p.id === s.selfId && p.out === null);
      // ゲームが始まったら参加者は最上段の自分の板へ
      if (g.phase === 'running' && meIdx >= 0 && b.round !== g.round) {
        b.round = g.round;
        b.stepped = -1;
        const c = tileCenter(startTile(meIdx));
        set({ teleport: { x: c.x, z: c.z, ry: Math.atan2(c.x - ARENA.x, c.z - ARENA.z), y: LAYER_Y[0] } });
      }
      // 次のゲームを待つ間に塔に残っていたら（勝った人）ロビーへ
      if (g.phase === 'idle' && inArena(position.current.x, position.current.z) && !s.teleport) toLobby();
      if (b.y < FALL_Y) {
        if (meIdx >= 0) send({ t: 'gameFell' });
        toLobby();
      }
    }
    const tp = get().teleport;
    if (tp) {
      const bike = riddenBike();
      if (bike) itemAction(bike.id, { a: 'bikeDismount' });
      position.current.x = tp.x;
      position.current.z = tp.z;
      look.current.yaw = tp.ry;
      b.y = tp.y ?? 0;
      b.vy = 0;
      b.extraJump = false;
      b.grounded = false;
      // 電車に乗ったまま飛ぶと、次のフレームで車内に引き戻されてしまう
      b.car = null;
      set({ teleport: null });
    }
    const city = worldKindOf(s) === 'city';
    const cc = collCache.current;
    if (cc.padsItems !== s.items || cc.padsCarrying !== carrying.current?.id) {
      cc.padsItems = s.items;
      cc.padsCarrying = carrying.current?.id;
      cc.pads = Object.values(s.items).filter((item): item is JumpPad => item.kind === 'jumpPad' && item.id !== carrying.current?.id);
      cc.padSolids = cc.pads.map(jumpPadSolid);
    }
    const pads = cc.pads;
    const padSolids = cc.padSolids;
    const solidsWithPads = (base: Solid[]): Solid[] => {
      if (cc.solidsBase !== base || cc.solidsPads !== padSolids) {
        cc.solidsBase = base;
        cc.solidsPads = padSolids;
        cc.solids = [...base, ...padSolids];
      }
      return cc.solids;
    };
    const now0 = serverNow();
    const bike = !tp && !survivorPlaying(s) ? riddenBike() : undefined;
    if (!bike) {
      const previousBike = riddenBike();
      if (previousBike) itemAction(previousBike.id, { a: 'bikeDismount' });
    }
    if (bike) {
      if (!driving.current || driving.current.id !== bike.id || driving.current.version !== bike.rideVersion) {
        driving.current = { id: bike.id, version: bike.rideVersion, state: { ...bike, remainder: 0 }, sent: 0 };
        finishCarry();
      }
      const d = driving.current;
      const k = keys.current;
      const [sx, sy] = immersive ? xr.move : [0, 0];
      const solids = solidsWithPads(city ? citySolids(now0, elevatorOfSession(s)) : solidsOf(s));
      d.state = moveBike(d.state, {
        throttle: k.KeyW || k.ArrowUp ? 1 : Math.max(0, -sy), brake: k.KeyS || k.ArrowDown ? 1 : Math.max(0, sy),
        steering: (k.KeyD || k.ArrowRight ? 1 : 0) - (k.KeyA || k.ArrowLeft ? 1 : 0) + sx,
      }, dt, solids, n => clampBike(n, city ? CITY_HALF : ROOM_HALF));
      const v = d.state;
      bikeDisplay.set(bike.id, v);
      rig.lean = 0;
      b.extraJump = false;
      b.car = null; b.y = 0; b.vy = 0; b.grounded = true;
      look.current.yaw = v.ry;
      position.current.set(v.x, eye.current, v.z);
      camera.rotation.set(look.current.pitch, v.ry, 0);
      const stoppedLeaning = sent.current.lean !== 0;
      sent.current.lean = 0;
      const stoppedWalking = walking.current;
      walking.current = false;
      sent.current.walking = false;
      const a: AvatarState = { x: v.x, z: v.z, ry: v.ry, pitch: look.current.pitch, jump: b.n, walking: false, lean: 0 };
      set({ selfAvatar: a });
      const now = performance.now();
      if (stoppedWalking || stoppedLeaning || now - d.sent >= 50) {
        d.sent = now;
        itemAction(bike.id, { a: 'bikeDrive', state: v, rideVersion: bike.rideVersion });
        send({ t: 'avatar', s: a });
      }
      rig.avatarPosition.set(v.x, b.y, v.z);
      rig.yaw = v.ry;
      rig.place(camera, scene, position.current);
      const hint = hintFor(null);
      if (s.aimHint !== hint) set({ aimHint: hint });
      if (hammerRef.current) hammerRef.current.visible = false;
      if (cameraRef.current) cameraRef.current.visible = false;
      return;
    }
    if (driving.current) {
      bikeDisplay.delete(driving.current.id);
      driving.current = null;
      aim.current = null;
    }
    const mode = s.movementMode;
    const solids = solidsWithPads(city ? citySolids(now0, elevatorOfSession(s)) : solidsOf(s));
    let surfaces: Surface[];
    if (city) {
      const y = elevatorY(elevatorOfSession(s), now0);
      if (cc.cityY !== y) {
        cc.cityY = y;
        cc.citySurfaces = [...CITY_SURFACES, { ...SHAFT_RECT, ya: y, yb: y }];
      }
      surfaces = cc.citySurfaces;
    } else if (worldKindOf(s) === 'game') {
      // 板の消え具合（時刻で変わる）が前フレームと同じなら面オブジェクト群を使い回す
      let same = cc.tileSurfaces !== null;
      for (let i = 0; i < TILE_COUNT; i++) {
        const gone = tileGone(g, i, now0) ? 1 : 0;
        cc.goneScratch[i] = gone;
        if (gone !== cc.goneFlags[i]) same = false;
      }
      if (!same) {
        const out: Surface[] = [];
        for (let i = 0; i < TILE_COUNT; i++) if (!cc.goneScratch[i]) {
          const t = tileCenter(i);
          out.push({ x0: t.x - TILE / 2, x1: t.x + TILE / 2, z0: t.z - TILE / 2, z1: t.z + TILE / 2, ya: t.y, yb: t.y });
        }
        cc.goneFlags.set(cc.goneScratch);
        cc.tileSurfaces = out;
      }
      surfaces = cc.tileSurfaces!;
    } else {
      surfaces = [];
    }
    const valid = (p: { x: number; y: number; z: number }) => {
      const bounds = clampTo(worldKindOf(s) === 'game' && inArena(p.x, p.z), city);
      const height = Math.max(1.7, eye.current + 0.1);
      return bounds(p.x, ARENA.x) === p.x && bounds(p.z, ARENA.z) === p.z && !blocked(p, solids, surfaces, height) && !(city && blockedByTrain(p, now0, height));
    };
    if (mode !== previousMode.current || (tp && mode !== 'noclip') || (mode === 'fly' && !valid({ x: position.current.x, y: b.y, z: position.current.z }))) {
      syncAirHeight.current = mode === 'walk';
      b.vy = 0;
      b.extraJump = false;
      b.grounded = false;
      b.car = null;
      if (mode !== 'noclip') {
        const spawn = spawnPoint();
        const safe = recoverPosition({ x: position.current.x, y: b.y, z: position.current.z }, { ...spawn, y: 0 }, solids, valid);
        if (safe) { position.current.x = safe.x; position.current.z = safe.z; b.y = safe.y; }
        else {
          rig.lean = 0;
          camera.rotation.z = 0;
          walking.current = false;
          sent.current.walking = false;
          const a = { ...get().selfAvatar, walking: false, lean: 0 };
          sent.current.lean = 0;
          rig.place(camera, scene, position.current);
          set({ movementMode: 'noclip', selfAvatar: a });
          send({ t: 'avatar', s: a });
          previousMode.current = 'noclip';
          return;
        }
      }
      previousMode.current = mode;
    }
    if (mode === 'walk' && city && b.car !== null) {
      // 電車に乗っていれば、前のフレームからの電車の動きと向きの変化をそのまま足す
      const prev = carPose(now0 - Math.min(dt, 0.1) * 1000, b.car);
      const cur = carPose(now0, b.car);
      const l = toCarLocal(prev, position.current.x, position.current.z);
      position.current.x = cur.x + cur.ax * l.along + cur.nx * l.side;
      position.current.z = cur.z + cur.az * l.along + cur.nz * l.side;
      look.current.yaw += Math.atan2(Math.sin(cur.ry - prev.ry), Math.cos(cur.ry - prev.ry));
    }
    const survivors = survivorPlaying(s);
    const viewYaw = look.current.yaw + (immersive ? xr.headYaw : 0);
    const pitch = immersive ? xr.headPitch : look.current.pitch;
    const yaw = survivors ? 0 : viewYaw;
    rig.lean = leanAngle(rig.lean, !!keys.current.KeyQ, !!keys.current.KeyE,
      canLean({ enabled: s.lean && !leanConsumed.current.KeyQ && !leanConsumed.current.KeyE, locked: s.locked || immersive, typing: isTyping(document.activeElement), survivor: survivors,
        carrying: !!carrying.current, dragging: !!dragging.current, holdingTool: !!heldHammer(s) || !!heldCamera(s), bike: !!aim.current?.data.bike }), dt);
    const shake = bump(s.hits[s.selfId]);
    camera.rotation.set(pitch - shake * 0.15, yaw + (rig.thirdPerson ? 0 : Math.sin(performance.now() / 30) * shake * 0.03), rig.lean);

    const k = keys.current;
    const f = survivorPaused ? 0 : (k.KeyW || k.ArrowUp ? 1 : 0) - (k.KeyS || k.ArrowDown ? 1 : 0) - (immersive ? xr.move[1] : 0);
    const r = survivorPaused ? 0 : (k.KeyD || k.ArrowRight ? 1 : 0) - (k.KeyA || k.ArrowLeft ? 1 : 0) + (immersive ? xr.move[0] : 0);
    const onTower = worldKindOf(s) === 'game' && inArena(position.current.x, position.current.z);
    const cl = clampTo(onTower, city);
    const beforeMove = { x: position.current.x, z: position.current.z };
    if (mode !== 'walk') {
      b.extraJump = false;
      b.vy = 0; b.grounded = false; b.car = null;
      const up = survivorPaused ? 0 : (k.Space ? 1 : 0) - (k.ShiftLeft || k.ShiftRight ? 1 : 0);
      const step = SPEED * Math.min(dt, 0.1) / (Math.hypot(f, r, up) || 1);
      const p = moveFlight({ x: position.current.x, y: b.y, z: position.current.z }, { x: (-Math.sin(yaw) * f + Math.cos(yaw) * r) * step, y: up * step, z: (-Math.cos(yaw) * f - Math.sin(yaw) * r) * step }, (p) => mode === 'fly' && !valid(p));
      position.current.x = p.x; position.current.z = p.z; b.y = p.y;
    } else if (f || r) {
      const survivorStyle = survivorMe ? SURVIVOR_STYLES[survivorMe.style] : undefined;
      const moveSpeed = survivors
        ? (survivorStyle?.speed ?? SURVIVOR_MOVE_SPEED) * (1 + (survivorMe?.gear.nightcloak ?? 0) * 0.025)
        : SPEED;
      const step = (moveSpeed * Math.min(dt, 0.1)) / Math.hypot(f, r);
      const nx = position.current.x + (-Math.sin(yaw) * f + Math.cos(yaw) * r) * step;
      const nz = position.current.z + (-Math.cos(yaw) * f - Math.sin(yaw) * r) * step;
      position.current.x = cl(nx, ARENA.x);
      position.current.z = cl(nz, ARENA.z);
    }
    // ワールドの切り替えやテレポートで家具の中に入ったときも、ここで外へ出る
    if (mode === 'walk' && solids.length && !onTower) {
      const p = pushOut(position.current.x, position.current.z, BODY_R, solids, b.y);
      position.current.x = cl(p.x, 0);
      position.current.z = cl(p.z, 0);
    }
    if (mode === 'walk' && onTower) {
      const p = pushOut(position.current.x, position.current.z, BODY_R, padSolids, b.y);
      position.current.x = cl(p.x, ARENA.x);
      position.current.z = cl(p.z, ARENA.z);
    }
    if (mode === 'walk' && city && b.car !== null) {
      const p = keepInCar(carPose(now0, b.car), position.current.x, position.current.z, now0);
      position.current.x = p.x;
      position.current.z = p.z;
    }

    // 先に横へ動かしてから、その場所の足元で上下を決める（板が消えた・端から出たときも落ちる）
    const fdt = Math.min(dt, 0.05);
    const worldGround = groundAt(s, position.current.x, position.current.z, b.y);
    const pad = jumpPadAt(pads, position.current.x, position.current.z, b.y);
    const ground = pad && (!worldGround || worldGround.y <= JUMP_PAD.height)
      ? { y: JUMP_PAD.height, tile: null, car: null, jumpPad: true }
      : worldGround;
    // 坂・階段・上がっていくエレベーターでは足元に合わせて上がる
    if (mode === 'walk' && b.grounded && ground && ground.y > b.y && ground.y - b.y <= STEP_UP) b.y = ground.y;
    if (mode === 'walk' && b.grounded && (!ground || ground.y < b.y - 0.001)) b.grounded = false;
    if (mode === 'walk' && !b.grounded) {
      if (fallToGround(b, ground, fdt)) { syncAirHeight.current = true; b.extraJump = false; }
    }
    if (b.grounded) { syncAirHeight.current = false; b.extraJump = false; }
    b.car = city && b.grounded && ground?.car != null ? ground.car : city && b.car !== null && !b.grounded ? b.car : null;
    walking.current = !tp && walkingAfterMove(walking.current, mode, b.grounded, b.car !== null, beforeMove, position.current, dt);
    if (b.grounded && ground?.tile != null && ground.tile !== b.stepped && g.phase === 'running') {
      b.stepped = ground.tile;
      if (g.players.some((p) => p.id === s.selfId && p.out === null)) send({ t: 'gameStep', tile: ground.tile });
    }
    if (survivors && !rig.thirdPerson) {
      camera.up.set(0, 0, -1);
      position.current.set(position.current.x, eye.current + (16 - DEFAULT_EYE_HEIGHT), position.current.z);
      camera.position.copy(position.current);
      camera.lookAt(position.current.x, 0, position.current.z);
    } else {
      camera.up.set(0, 1, 0);
      position.current.y = eye.current + b.y - shake * 0.12;
    }

    const now = performance.now();
    const x = position.current.x;
    const z = position.current.z;
    const st = sent.current;
    const jumped = b.n !== st.jump;
    // 塔の上・落ちている間・高い足場（街の上の階や駅）にいる間は高さも送る。
    // 床でのジャンプは回数だけ送り、相手の画面で放物線を描く（途中の高さを送るとカクつく）
    const sendY = mode !== 'walk' || syncAirHeight.current || onTower || b.y < -0.01 || (ground?.y ?? 0) > 0.01;
    const yNow = sendY ? b.y : undefined;
    const changed = Math.abs(x - st.x) > 0.01 || Math.abs(z - st.z) > 0.01 || Math.abs(yaw - st.ry) > 0.01
      || rig.lean !== st.lean || Math.abs(pitch - st.pitch) > 0.03 || (yNow ?? 0) !== st.y;
    const interval = 33;
    // 跳んだことは待たずに送る（相手の放物線が遅れて始まらないように）
    if (jumped || (rig.lean === 0 && st.lean !== 0) || walking.current !== st.walking || (now - st.t > interval && changed)) {
      Object.assign(st, { t: now, x, z, ry: yaw, pitch, lean: rig.lean, jump: b.n, y: yNow ?? 0, walking: walking.current });
      const cp = b.car !== null ? carPose(now0, b.car) : null;
      const l = cp ? toCarLocal(cp, x, z) : null;
      const ride = cp && l && b.car !== null ? { car: b.car, along: l.along, side: Math.max(-CAR.w, Math.min(CAR.w, l.side)), ry: yaw - cp.ry } : undefined;
      const a: AvatarState = { x, z, ry: yaw, pitch, lean: rig.lean, jump: b.n, walking: walking.current, ...(yNow !== undefined ? { y: yNow } : {}), ...(ride ? { ride } : {}) };
      set({ selfAvatar: a });
      send({ t: 'avatar', s: a });
    }

    const c = carrying.current;
    if (c) {
      c.x = (city ? clampCity : clampRoom)(x - Math.sin(yaw) * 2);
      c.z = (city ? clampCity : clampRoom)(z - Math.cos(yaw) * 2);
      c.ry = yaw;
      if (now - c.last > 80) {
        c.last = now;
        sendCarry(c);
      }
    }

    rig.avatarPosition.set(x, b.y, z);
    rig.yaw = immersive ? look.current.yaw : yaw;
    rig.place(camera, scene, position.current);

    const d = dragging.current;
    if (d) {
      const h = aimOn(d.obj, camera, immersive ? xr.ray : null);
      if (h) { d.hit = h; d.data.drag!('move', h); }
    }

    aim.current = aimAt(scene, camera, immersive ? xr.ray : null);
    const hint = hintFor(aim.current);
    if (hint !== s.aimHint) set({ aimHint: hint });

    const h = hammerRef.current;
    if (h) {
      h.visible = !rig.thirdPerson && !!heldHammer(s);
      const sw = bump(s.swings[s.selfId], now, 350);
      h.position.copy(camera.position);
      h.quaternion.copy(camera.quaternion);
      h.translateX(0.26);
      h.translateY(-0.3);
      h.translateZ(-0.6);
      h.rotateX(-0.3 - sw * 1.5);
      h.rotateZ(0.15);
    }
    const heldCameraModel = cameraRef.current;
    if (heldCameraModel) {
      heldCameraModel.visible = !rig.thirdPerson;
      heldCameraModel.position.copy(camera.position);
      heldCameraModel.quaternion.copy(camera.quaternion);
      heldCameraModel.translateX(.26);
      heldCameraModel.translateY(-.3);
      heldCameraModel.translateZ(-.6);
    }
  }, -0.5);

  return (
    <>
      <group ref={hammerRef} userData={{ noRay: true, firstPerson: true }}>
        <HammerModel scale={0.38} />
      </group>
      {heldCam && <group ref={cameraRef} userData={{ noRay: true, firstPerson: true }}>
        <CameraModel live={heldCam.live} />
      </group>}
    </>
  );
}
