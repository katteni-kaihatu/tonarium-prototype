import { t as tr, getLanguage } from '../i18n/index.ts';
import { useEffect, useMemo, useRef, useState } from 'react';
import { useFrame } from '@react-three/fiber';
import * as THREE from 'three';
import { ROOM_HALF } from '../../../shared/protocol.ts';
import {
  ARENA, FALL_Y, JOIN_AREA, LAYER_Y, MIN_PLAYERS, START_BUTTON, TILE, TILE_BREAK_MS, TILE_COUNT, TILE_THICK,
  inJoinArea, ranking, tileCenter, type GameState,
} from '../../../shared/game.ts';
import { useStore, get, gameOfSession, serverNow } from '../store.ts';
import { send } from '../net/ws.ts';
import { Box, Cyl, SpawnArea } from './parts3d.tsx';
import { Label } from './Label.tsx';
import { makeCanvasTexture } from './textTexture.ts';
import type { Interactable } from './interact.ts';
import type { Palette } from './worlds3d.tsx';

const H = ROOM_HALF;
const WALL_H = 4;
const LAYER_COLORS = ['#ff7a8a', '#ffb347', '#ffe066', '#7ee08a', '#6ec6ff'];
const STEPPED = new THREE.Color('#ff3b30');

const joinerTickListeners = new Set<() => void>();
let joinerTimer: ReturnType<typeof setInterval> | undefined;
function subscribeJoinerTick(listener: () => void) {
  joinerTickListeners.add(listener);
  joinerTimer ??= setInterval(() => joinerTickListeners.forEach((l) => l()), 500);
  return () => {
    joinerTickListeners.delete(listener);
    if (joinerTickListeners.size === 0 && joinerTimer) { clearInterval(joinerTimer); joinerTimer = undefined; }
  };
}

/** 参加エリアにいる 3D の人（自分を含む） */
function useJoiners() {
  const [, tick] = useState(0);
  useEffect(() => subscribeJoinerTick(() => tick((n) => n + 1)), [getLanguage()]);
  const s = get();
  return s.participants.filter((u) => {
    if (u.mode !== '3d') return false;
    const a = u.id === s.selfId ? s.selfAvatar : s.avatars[u.id];
    return a && inJoinArea(a.x, a.z) && (a.y ?? 0) > -0.5;
  });
}

/** 5 層 × 8×8 の板。踏まれた板は赤く震え、消える時刻を過ぎたら見えなくなる（当たり判定も同じ時刻で消える） */
function Tiles() {
  const ref = useRef<THREE.InstancedMesh>(null);
  const base = useMemo(() => Array.from({ length: TILE_COUNT }, (_, i) => new THREE.Color(LAYER_COLORS[tileCenter(i).layer])), []);
  const centers = useMemo(() => Array.from({ length: TILE_COUNT }, (_, i) => tileCenter(i)), []);
  const m = useMemo(() => new THREE.Matrix4(), []);
  const c = useMemo(() => new THREE.Color(), []);
  const pos = useMemo(() => new THREE.Vector3(), []);
  const scl = useMemo(() => new THREE.Vector3(), []);
  const q = useMemo(() => new THREE.Quaternion(), []);
  // 各タイルの書き込み済み状態。undefined=未書き込み、null=静止（未踏）を書き込み済み、数値=その消滅時刻を処理中
  const written = useRef<(number | null | undefined)[]>(Array(TILE_COUNT).fill(undefined));
  // 消滅時刻を過ぎて縮小済みのタイルは、行列が縮小したまま変わらない（中心位置は見た目に影響しない）
  const goneWritten = useRef<boolean[]>(Array(TILE_COUNT).fill(false));
  useFrame(() => {
    const mesh = ref.current;
    if (!mesh) return;
    const g = gameOfSession();
    const now = serverNow();
    let matrixDirty = false;
    let colorDirty = false;
    for (let i = 0; i < TILE_COUNT; i++) {
      const at = g.tiles[i];
      if (at === undefined) {
        // 未踏のタイルは静止画そのもの。初回と、踏まれた後に盤面が戻ったときだけ書く
        if (written.current[i] === null) continue;
        const t = centers[i];
        pos.set(t.x, t.y - TILE_THICK / 2, t.z);
        scl.setScalar(1);
        m.compose(pos, q, scl);
        mesh.setMatrixAt(i, m);
        mesh.setColorAt(i, base[i]);
        written.current[i] = null;
        goneWritten.current[i] = false;
        matrixDirty = colorDirty = true;
        continue;
      }
      if (written.current[i] !== at) { written.current[i] = at; goneWritten.current[i] = false; }
      if (goneWritten.current[i]) continue;
      const left = at - now;
      const t = centers[i];
      if (left <= 0) {
        pos.set(t.x, t.y - TILE_THICK / 2, t.z);
        scl.setScalar(0);
        m.compose(pos, q, scl);
        mesh.setMatrixAt(i, m);
        mesh.setColorAt(i, STEPPED);
        goneWritten.current[i] = true;
        matrixDirty = colorDirty = true;
        continue;
      }
      // 消える直前ほど大きく震える。踏まれて消えるまでの間だけ毎フレーム書く
      const shake = left < TILE_BREAK_MS ? (1 - left / TILE_BREAK_MS) * 0.06 : 0;
      pos.set(t.x + (shake ? Math.sin(now / 17 + i) * shake : 0), t.y - TILE_THICK / 2, t.z + (shake ? Math.cos(now / 23 + i) * shake : 0));
      scl.setScalar(1);
      m.compose(pos, q, scl);
      mesh.setMatrixAt(i, m);
      c.copy(base[i]);
      c.lerp(STEPPED, Math.min(1, 0.4 + (1 - left / TILE_BREAK_MS) * 0.6));
      mesh.setColorAt(i, c);
      matrixDirty = colorDirty = true;
    }
    if (matrixDirty) mesh.instanceMatrix.needsUpdate = true;
    if (colorDirty && mesh.instanceColor) mesh.instanceColor.needsUpdate = true;
  });
  return (
    // 境界球は最初に一度だけ（全部の板が原点にある時点で）計算されるので、そのままだと塔を見ても画面外と判定されて消える
    <instancedMesh ref={ref} args={[undefined, undefined, TILE_COUNT]} frustumCulled={false} userData={{ noRay: true }}>
      <boxGeometry args={[TILE - 0.08, TILE_THICK, TILE - 0.08]} />
      <meshStandardMaterial roughness={0.5} />
    </instancedMesh>
  );
}

function Tower() {
  const span = ARENA.half * 2;
  const top = LAYER_Y[0] + 2;
  return (
    <group userData={{ noRay: true }}>
      {[-1, 1].flatMap((sx) => [-1, 1].map((sz) => (
        <Box key={`${sx}${sz}`} p={[ARENA.x + sx * (ARENA.half + 0.3), (top + FALL_Y) / 2, ARENA.z + sz * (ARENA.half + 0.3)]} s={[0.4, top - FALL_Y, 0.4]} color="#d9dcff" />
      )))}
      {LAYER_Y.map((y, i) => (
        <Label key={y} text={tr("ui488", i + 1)} position={[ARENA.x - ARENA.half - 0.3, y + 1.2, ARENA.z + ARENA.half + 0.3]} height={0.5} bg="rgba(40,44,90,.85)" />
      ))}
      {/* 奈落の底 */}
      <mesh rotation-x={-Math.PI / 2} position={[ARENA.x, FALL_Y, ARENA.z + 2]}>
        <planeGeometry args={[2 * H, span + 8]} />
        <meshBasicMaterial color="#1a1030" />
      </mesh>
      <gridHelper args={[span + 8, 16, '#ff4f8b', '#5a2a6e']} position={[ARENA.x, FALL_Y + 0.02, ARENA.z]} />
      <Tiles />
    </group>
  );
}

function drawMonitor(canvas: HTMLCanvasElement, g: GameState, joiners: string[]) {
  const ctx = canvas.getContext('2d')!;
  const W = canvas.width;
  const font = (w: number, size: number) => `${w} ${size}px "Zen Maru Gothic", "Segoe UI", "Noto Sans JP", sans-serif`;
  ctx.fillStyle = '#14163a';
  ctx.fillRect(0, 0, W, canvas.height);
  ctx.fillStyle = '#2b2f7a';
  ctx.fillRect(0, 0, W, 96);
  ctx.fillStyle = '#fff';
  ctx.font = font(800, 54);
  ctx.textAlign = 'left';
  ctx.textBaseline = 'middle';
  ctx.fillText(tr("ui489"), 40, 50);
  ctx.textAlign = 'right';
  ctx.font = font(700, 34);
  const phase = g.phase === 'running' ? tr("ui490", g.players.filter((p) => p.out === null).length) : g.phase === 'ended' ? tr("ui491") : tr("ui492");
  ctx.fillText(phase, W - 40, 50);
  ctx.textAlign = 'left';
  let y = 150;
  if (g.phase === 'ended' && g.winner) {
    const w = g.players.find((p) => p.id === g.winner);
    ctx.fillStyle = '#ffd34d';
    ctx.font = font(900, 84);
    ctx.textAlign = 'center';
    ctx.fillText(tr("ui493", w?.name ?? ''), W / 2, y + 30);
    ctx.textAlign = 'left';
    y += 120;
  }
  if (g.phase === 'idle') {
    ctx.fillStyle = '#cfd3ff';
    ctx.font = font(700, 36);
    ctx.fillText(tr("ui494", MIN_PLAYERS), 40, y);
    y += 60;
    ctx.fillStyle = '#fff';
    ctx.fillText(tr("ui495", joiners.length ? joiners.join('、') : tr("ui496")), 40, y);
    y += 70;
    if (!g.winner) return;
    ctx.fillStyle = '#ffd34d';
    ctx.fillText(tr("ui497", g.players.find((p) => p.id === g.winner)?.name ?? ''), 40, y);
    y += 56;
  }
  const list = g.phase === 'running' ? g.players : ranking(g);
  ctx.font = font(700, 34);
  list.forEach((p, i) => {
    if (y > canvas.height - 30) return;
    const place = g.phase === 'running' ? (p.out === null ? tr("ui498") : tr("ui499")) : tr("ui500", i + 1);
    ctx.fillStyle = p.id === g.winner ? '#ffd34d' : p.out === null ? '#8ef0a8' : '#9aa0c8';
    ctx.fillText(`${place}`, 60, y);
    ctx.fillStyle = '#fff';
    ctx.fillText(p.name, 260, y);
    y += 50;
  });
}

/** ロビーの西の壁のメインモニター。参加者と結果を出す */
function MainMonitor() {
  const game = useStore((s) => gameOfSession(s));
  const joiners = useJoiners().map((u) => u.name);
  const { canvas, tex } = useMemo(() => makeCanvasTexture(1280, 720), []);
  const key = `${JSON.stringify(game.players)}|${game.phase}|${game.winner}|${joiners.join(',')}`;
  useEffect(() => {
    drawMonitor(canvas, game, joiners);
    tex.needsUpdate = true;
  }, [key, getLanguage()]);
  return (
    <group position={[-H + 0.15, 2.4, -3]} rotation-y={Math.PI / 2} userData={{ noRay: true }}>
      <mesh position-z={-0.03}>
        <boxGeometry args={[6.6, 3.9, 0.06]} />
        <meshStandardMaterial color="#0c0d22" />
      </mesh>
      <mesh position-z={0.01}>
        <planeGeometry args={[6.4, 3.6]} />
        <meshBasicMaterial map={tex} toneMapped={false} />
      </mesh>
    </group>
  );
}

function JoinArea() {
  const n = useJoiners().length;
  return (
    <group position={[JOIN_AREA.x, 0, JOIN_AREA.z]} userData={{ noRay: true }}>
      <mesh rotation-x={-Math.PI / 2} position-y={0.006}>
        <circleGeometry args={[JOIN_AREA.r, 48]} />
        <meshBasicMaterial color="#ffd34d" transparent opacity={0.22} depthWrite={false} />
      </mesh>
      <mesh rotation-x={-Math.PI / 2} position-y={0.008}>
        <ringGeometry args={[JOIN_AREA.r - 0.08, JOIN_AREA.r, 64]} />
        <meshBasicMaterial color="#ffd34d" />
      </mesh>
      <Label text={tr("ui501", n)} position={[0, 2.3, 0]} height={0.24} bg="rgba(120,90,0,.9)" />
    </group>
  );
}

function StartButton() {
  const game = useStore((s) => gameOfSession(s));
  const n = useJoiners().length;
  const ready = game.phase === 'idle' && n >= MIN_PLAYERS;
  const data: Interactable = {
    use: () => send({ t: 'gameStart' }),
    hint: game.phase !== 'idle' ? tr("ui502") : ready ? tr("ui503") : tr("ui504", MIN_PLAYERS),
  };
  return (
    <group position={[START_BUTTON.x, 0, START_BUTTON.z]} userData={data}>
      <Cyl p={[0, 0.5, 0]} r={0.35} r2={0.42} h={1} color="#2a2d52" />
      <mesh position-y={1.06}>
        <cylinderGeometry args={[0.24, 0.26, 0.12, 24]} />
        <meshStandardMaterial color={ready ? '#ff3b5c' : '#7a7d99'} emissive={ready ? '#ff3b5c' : '#000'} emissiveIntensity={0.5} />
      </mesh>
      <Label text={ready ? tr("ui505") : game.phase === 'idle' ? tr("ui506", MIN_PLAYERS - n) : tr("ui507")} position={[0, 1.55, 0]} height={0.2} bg={ready ? 'rgba(220,40,70,.95)' : 'rgba(40,44,90,.85)'} />
    </group>
  );
}

/** ロビーは南・東・西の壁と、塔が見える北のガラス。天井は無く、空と塔が見える */
export function GameWorld({ pal }: { pal: Palette }) {
  return (
    <>
      <ambientLight intensity={0.9} />
      <hemisphereLight args={['#e6f2ff', '#3b3f6b', 0.8]} />
      <directionalLight position={[6, 30, 10]} intensity={1.3} />
      <mesh rotation-x={-Math.PI / 2}>
        <planeGeometry args={[2 * H, 2 * H]} />
        <meshStandardMaterial color={pal.floor} roughness={0.8} />
      </mesh>
      <gridHelper args={[2 * H, 20, '#5a5f9a', '#474b80']} position-y={0.005} userData={{ noRay: true }} />
      <Box p={[0, WALL_H / 2, H]} s={[2 * H, WALL_H, 0.2]} color={pal.wall} />
      <Box p={[-H, WALL_H / 2, 0]} s={[0.2, WALL_H, 2 * H]} color={pal.wall} />
      <Box p={[H, WALL_H / 2, 0]} s={[0.2, WALL_H, 2 * H]} color={pal.wall} />
      <mesh position={[0, WALL_H / 2, -H]} userData={{ noRay: true }}>
        <planeGeometry args={[2 * H, WALL_H]} />
        <meshStandardMaterial color="#bfe6ff" transparent opacity={0.18} side={THREE.DoubleSide} depthWrite={false} />
      </mesh>
      <Box p={[0, WALL_H, -H]} s={[2 * H, 0.12, 0.12]} color="#d9dcff" />
      <Box p={[0, 0.05, -H]} s={[2 * H, 0.1, 0.12]} color="#d9dcff" />
      <SpawnArea color={pal.spawn} />
      <JoinArea />
      <StartButton />
      <MainMonitor />
      <Tower />
    </>
  );
}

