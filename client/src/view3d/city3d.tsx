import { t as tr, localized, systemText } from '../i18n/index.ts';
import { useLayoutEffect, useMemo, useRef } from 'react';
import { useFrame } from '@react-three/fiber';
import * as THREE from 'three';
import {
  BUILDINGS, CAR, CITY_HALF, CITY_SURFACES, FLOOR_H, LOOP, MANSION, MANSION_SOLIDS, MANSION_STOPS, PILLARS, PLATFORM_Y,
  PLAZA, SHAFT, SHAFT_FRONT, SHAFT_RECT, STATIONS as RAW_STATIONS, STATION_PARTS, TRACK, carPose, elevatorDoorOpen, elevatorY, mansionPoint,
  stairSteps, stopLabel as rawStopLabel, trackAt, trainState,
} from '../../../shared/city.ts';
import { elevatorOfSession, get, serverNow } from '../store.ts';
import { send } from '../net/ws.ts';
import { Label } from './Label.tsx';
import { SpawnArea } from './parts3d.tsx';
import type { Interactable } from './interact.ts';

interface BoxSpec { x: number; y: number; z: number; w: number; h: number; d: number; color: string; ry?: number }

/** 色ごとに 1 つの InstancedMesh にまとめて描く（街は箱が多く、1 個ずつだと描画が重い） */
/** ray なら照準をさえぎる（壁や床の向こうのボタンを押せないように）。飾りは照準を素通りさせる */
function Boxes({ boxes, ray = false }: { boxes: BoxSpec[]; ray?: boolean }) {
  const groups = useMemo(() => {
    const m = new Map<string, BoxSpec[]>();
    for (const b of boxes) m.set(b.color, [...(m.get(b.color) ?? []), b]);
    return [...m];
  }, [boxes]);
  return <>{groups.map(([color, list]) => <BoxGroup key={color} color={color} list={list} ray={ray} />)}</>;
}

function BoxGroup({ color, list, ray }: { color: string; list: BoxSpec[]; ray: boolean }) {
  const ref = useRef<THREE.InstancedMesh>(null);
  useLayoutEffect(() => {
    const m = ref.current!;
    const o = new THREE.Object3D();
    list.forEach((b, i) => {
      o.position.set(b.x, b.y, b.z);
      o.rotation.set(0, b.ry ?? 0, 0);
      o.scale.set(b.w, b.h, b.d);
      o.updateMatrix();
      m.setMatrixAt(i, o.matrix);
    });
    m.instanceMatrix.needsUpdate = true;
  }, [list]);
  // 大きな範囲に散らばるので、まとめた境界で見切れないよう視錐台カリングはしない
  return (
    <instancedMesh ref={ref} args={[undefined, undefined, list.length]} frustumCulled={false} userData={{ noRay: !ray }}>
      <boxGeometry />
      <meshStandardMaterial color={color} roughness={0.85} />
    </instancedMesh>
  );
}

const box = (x: number, y0: number, z: number, w: number, h: number, d: number, color: string, ry = 0): BoxSpec => ({ x, y: y0 + h / 2, z, w, h, d, color, ry });

function useStaticBoxes() {
  return useMemo(() => {
    const out: BoxSpec[] = [];
    const walls: BoxSpec[] = [];
    for (const b of BUILDINGS) {
      walls.push(box(b.x, 0, b.z, b.w, b.h, b.d, b.color));
      // 窓の帯
      for (let y = 2; y < b.h - 0.5; y += 3) {
        out.push(box(b.x, y, b.z - b.d / 2 - 0.03, b.w - 1, 1.1, 0.06, '#5b6f86'), box(b.x, y, b.z + b.d / 2 + 0.03, b.w - 1, 1.1, 0.06, '#5b6f86'));
        out.push(box(b.x - b.w / 2 - 0.03, y, b.z, 0.06, 1.1, b.d - 1, '#5b6f86'), box(b.x + b.w / 2 + 0.03, y, b.z, 0.06, 1.1, b.d - 1, '#5b6f86'));
      }
    }
    for (const s of MANSION_SOLIDS) {
      if ('r' in s) continue;
      const y0 = s.y0 ?? 0;
      const h = (s.y1 ?? y0 + 3) - y0;
      walls.push(box(s.x, y0, s.z, s.w, h, s.d, h < 1 ? '#a07a55' : '#ece5d8'));
    }
    // マンションの外の窓（北と南の面）
    for (let f = 0; f < MANSION_STOPS - 1; f++) {
      for (const mx of [-6, -3, 0, 3]) {
        const n = mansionPoint(mx, -6.1);
        const s = mansionPoint(mx, 6.1);
        out.push(box(n.x, f * FLOOR_H + 1, n.z, 1.6, 1.3, 0.08, '#6f8fb3'), box(s.x, f * FLOOR_H + 1, s.z, 1.6, 1.3, 0.08, '#6f8fb3'));
      }
    }
    for (const s of CITY_SURFACES) {
      if (s.axis && s.ya !== s.yb) continue;
      walls.push(box((s.x0 + s.x1) / 2, s.ya - 0.2, (s.z0 + s.z1) / 2, s.x1 - s.x0, 0.2, s.z1 - s.z0, s.ya >= PLATFORM_Y - 0.1 && s.ya <= PLATFORM_Y + 0.1 ? '#b9b3a8' : '#d8d0c2'));
    }
    for (const st of stairSteps()) out.push(box(st.x, st.y - 0.15, st.z, st.w, 0.15, st.d, '#c7bba8'));
    // 駅へ上る段。地面から各段の高さまで詰まった箱にして、横から見ても階段の塊に見えるようにする
    for (const p of STATION_PARTS) {
      const ramp = p.surfaces[1];
      const n = 28;
      for (let i = 0; i < n; i++) {
        const t0 = i / n;
        const t1 = (i + 1) / n;
        const top = ramp.ya + (ramp.yb - ramp.ya) * (t0 + t1) / 2;
        if (ramp.axis === 'x') {
          const x0 = ramp.x0 + (ramp.x1 - ramp.x0) * t0;
          const x1 = ramp.x0 + (ramp.x1 - ramp.x0) * t1;
          out.push(box((x0 + x1) / 2, 0, (ramp.z0 + ramp.z1) / 2, x1 - x0, top, ramp.z1 - ramp.z0, '#b5ada0'));
        } else {
          const z0 = ramp.z0 + (ramp.z1 - ramp.z0) * t0;
          const z1 = ramp.z0 + (ramp.z1 - ramp.z0) * t1;
          out.push(box((ramp.x0 + ramp.x1) / 2, 0, (z0 + z1) / 2, ramp.x1 - ramp.x0, top, z1 - z0, '#b5ada0'));
        }
      }
      for (const s of p.solids) {
        if ('r' in s || s.y0 === undefined) continue;
        out.push(box(s.x, s.y0, s.z, Math.max(s.w, 0.08), (s.y1 ?? s.y0 + 1) - s.y0, Math.max(s.d, 0.08), '#8a9099'));
      }
      // 屋根
      const f = p.frame;
      out.push(box(f.x + f.nx * 3.6, PLATFORM_Y + 3, f.z + f.nz * 3.6, Math.abs(f.tx) * 26 + Math.abs(f.nx) * 4.6, 0.2, Math.abs(f.tz) * 26 + Math.abs(f.nz) * 4.6, '#6d7480'));
    }
    // 高架の床と線路
    const step = 2;
    for (let s = 0; s < LOOP; s += step) {
      const p = trackAt(s + step / 2);
      const ry = Math.atan2(-p.tx, -p.tz);
      out.push({ x: p.x, y: TRACK.y - 0.3, z: p.z, w: 3.6, h: 0.6, d: step + 0.05, color: '#9a9ea6', ry });
      for (const side of [-0.75, 0.75]) out.push({ x: p.x - p.tz * side, y: TRACK.y + 0.06, z: p.z + p.tx * side, w: 0.12, h: 0.12, d: step + 0.05, color: '#5c5f66', ry });
    }
    for (const p of PILLARS) out.push(box(p.x, 0, p.z, 0.9, TRACK.y - 0.6, 0.9, '#a3a7ae'));
    for (const t of PLAZA.trees) out.push(box(t.x, 0, t.z, 0.35, 2.2, 0.35, '#6b4a32'));
    return { walls, decor: out };
  }, []);
}

function Ground() {
  const roads = [-24, 24];
  return (
    <group userData={{ noRay: true }}>
      <mesh rotation-x={-Math.PI / 2}>
        <planeGeometry args={[2 * CITY_HALF, 2 * CITY_HALF]} />
        <meshStandardMaterial color="#9db08a" roughness={0.95} />
      </mesh>
      {roads.map((v) => (
        <group key={v}>
          <mesh rotation-x={-Math.PI / 2} position={[v, 0.01, 0]}><planeGeometry args={[8, 2 * CITY_HALF]} /><meshStandardMaterial color="#5f6268" /></mesh>
          <mesh rotation-x={-Math.PI / 2} position={[0, 0.012, v]}><planeGeometry args={[2 * CITY_HALF, 8]} /><meshStandardMaterial color="#5f6268" /></mesh>
        </group>
      ))}
      <mesh rotation-x={-Math.PI / 2} position-y={0.015}>
        <circleGeometry args={[18, 64]} />
        <meshStandardMaterial color="#d9d0bf" />
      </mesh>
      <mesh position={[PLAZA.fountain.x, 0.4, PLAZA.fountain.z]}>
        <cylinderGeometry args={[PLAZA.fountain.r, PLAZA.fountain.r + 0.2, 0.8, 32]} />
        <meshStandardMaterial color="#c9c3b8" />
      </mesh>
      <mesh position={[PLAZA.fountain.x, 0.82, PLAZA.fountain.z]}>
        <cylinderGeometry args={[PLAZA.fountain.r - 0.2, PLAZA.fountain.r - 0.2, 0.05, 32]} />
        <meshStandardMaterial color="#6fb6e0" />
      </mesh>
      {PLAZA.trees.map((t) => (
        <mesh key={`${t.x},${t.z}`} position={[t.x, 3, t.z]}>
          <sphereGeometry args={[1.4, 16, 12]} />
          <meshStandardMaterial color="#4f8a4a" />
        </mesh>
      ))}
    </group>
  );
}

const DOOR_LEAF = CAR.doorW / 2;

/** 電車 1 両。止まった駅でホーム側のドアが開く */
function Car({ k }: { k: number }) {
  const ref = useRef<THREE.Group>(null);
  const leaves = useRef<THREE.Mesh[]>([]);
  useFrame(() => {
    const now = serverNow();
    const c = carPose(now, k);
    const g = ref.current;
    if (!g) return;
    g.position.set(c.x, 0, c.z);
    g.rotation.y = c.ry;
    const open = trainState(now).station !== null;
    leaves.current.forEach((m, i) => {
      // 前寄り（along が小さい）の扉は後ろ（+Z）へ、もう片方は前へ開く
      const dir = i % 2 ? -1 : 1;
      const base = m.userData.base as number;
      const target = base + (open ? dir * DOOR_LEAF * 0.95 : 0);
      m.position.z += (target - m.position.z) * 0.15;
    });
  });
  // 車体の向きは前が -Z（ry と同じ）。ホーム側（side が正）は、前を -Z にしたときの +X
  const L = CAR.len;
  const W = CAR.w;
  const y = PLATFORM_Y;
  const segs: [number, number][] = [];
  const edges = [-L / 2, ...CAR.doors.slice().sort((a, b) => a - b).flatMap((d) => [d - CAR.doorW / 2, d + CAR.doorW / 2]), L / 2];
  for (let i = 0; i < edges.length; i += 2) segs.push([edges[i], edges[i + 1]]);
  const along = (a: number) => -a;
  return (
    <group ref={ref} userData={{ noRay: true }}>
      <mesh position={[0, y - 0.25, 0]}><boxGeometry args={[W, 0.5, L]} /><meshStandardMaterial color="#d7dce1" /></mesh>
      <mesh position={[0, y + CAR.h, 0]}><boxGeometry args={[W, 0.15, L]} /><meshStandardMaterial color="#c8ced4" /></mesh>
      {[-1, 1].map((sd) => (
        <group key={sd}>
          {segs.map(([a0, a1]) => (
            <group key={a0}>
              <mesh position={[sd * (W / 2 - 0.04), y + 0.5, along((a0 + a1) / 2)]}><boxGeometry args={[0.08, 1, a1 - a0]} /><meshStandardMaterial color="#e9eef2" /></mesh>
              <mesh position={[sd * (W / 2 - 0.04), y + 1.45, along((a0 + a1) / 2)]}><boxGeometry args={[0.06, 0.9, a1 - a0]} /><meshStandardMaterial color="#8fb3cf" transparent opacity={0.55} /></mesh>
              <mesh position={[sd * (W / 2 - 0.04), y + 2.25, along((a0 + a1) / 2)]}><boxGeometry args={[0.08, 0.7, a1 - a0]} /><meshStandardMaterial color="#e9eef2" /></mesh>
            </group>
          ))}
          <mesh position={[sd * (W / 2 + 0.01), y + 0.85, 0]}><boxGeometry args={[0.02, 0.18, L]} /><meshStandardMaterial color="#3a9c5c" /></mesh>
          {CAR.doors.flatMap((d) => [-1, 1].map((h) => (
            <mesh
              key={`${d}${h}`} position={[sd * (W / 2 - 0.06), y + CAR.h / 2, along(d + (h * CAR.doorW) / 4)]}
              ref={(m) => { if (m && sd === 1) { m.userData.base = along(d + (h * CAR.doorW) / 4); if (!leaves.current.includes(m)) leaves.current.push(m); } }}
            >
              <boxGeometry args={[0.06, CAR.h, DOOR_LEAF]} />
              <meshStandardMaterial color="#cfd6dc" />
            </mesh>
          )))}
        </group>
      ))}
      {[-1, 1].map((e) => <mesh key={e} position={[0, y + CAR.h / 2, (e * L) / 2]}><boxGeometry args={[W, CAR.h, 0.1]} /><meshStandardMaterial color="#e3e8ec" /></mesh>)}
      {/* 座席 */}
      {[-1, 1].map((sd) => [-4.5, 0, 4.5].map((a) => (
        <mesh key={`${sd}${a}`} position={[sd * (W / 2 - 0.35), y + 0.22, a]}><boxGeometry args={[0.5, 0.44, 2.4]} /><meshStandardMaterial color="#3f6f9e" /></mesh>
      )))}
    </group>
  );
}

/** 各階のエレベーターのドア（閉まっているときだけ見える）と呼び出しボタン */
function ElevatorHalls() {
  const doors = useRef<THREE.Mesh[]>([]);
  useFrame(() => {
    const e = elevatorOfSession(get());
    const now = serverNow();
    doors.current.forEach((m, f) => { m.visible = !elevatorDoorOpen(e, f, now); });
  });
  const w = SHAFT.door1 - SHAFT.door0;
  return (
    <>
      {Array.from({ length: MANSION_STOPS }, (_, f) => {
        const y = f * FLOOR_H;
        // 昇降路の北の壁（厚さ 0.12m）の外側の面に付ける
        const btn = mansionPoint(SHAFT.door0 - 0.4, SHAFT.mz0 - 0.15);
        return (
          <group key={f}>
            <mesh ref={(m) => { if (m) doors.current[f] = m; }} position={[SHAFT_FRONT.x, y + 1.2, SHAFT_FRONT.z - 0.06]} userData={{ noRay: true }}>
              <boxGeometry args={[w, 2.4, 0.06]} />
              <meshStandardMaterial color="#9aa3ad" metalness={0.3} />
            </mesh>
            <mesh position={[btn.x, y + 1.2, btn.z]} userData={{ use: () => send({ t: 'elevatorCall', floor: f }), hint: tr("ui479", stopLabel(f)) } satisfies Interactable}>
              <boxGeometry args={[0.18, 0.26, 0.05]} />
              <meshStandardMaterial color="#f2c14e" emissive="#f2a13e" emissiveIntensity={0.3} />
            </mesh>
            <Label position={[SHAFT_FRONT.x, y + 2.75, SHAFT_FRONT.z - 0.25]} text={stopLabel(f)} height={0.22} />
          </group>
        );
      })}
    </>
  );
}

/** エレベーターのかご。中の壁に行き先ボタン */
function ElevatorCar() {
  const ref = useRef<THREE.Group>(null);
  useFrame(() => {
    if (ref.current) ref.current.position.y = elevatorY(elevatorOfSession(get()), serverNow());
  });
  const cx = (SHAFT_RECT.x0 + SHAFT_RECT.x1) / 2;
  const cz = (SHAFT_RECT.z0 + SHAFT_RECT.z1) / 2;
  const w = SHAFT_RECT.x1 - SHAFT_RECT.x0 - 0.1;
  const d = SHAFT_RECT.z1 - SHAFT_RECT.z0 - 0.1;
  return (
    <group ref={ref} position={[cx, 0, cz]}>
      <mesh position-y={-0.05} userData={{ noRay: true }}><boxGeometry args={[w, 0.1, d]} /><meshStandardMaterial color="#8c7b69" /></mesh>
      <mesh position-y={2.6} userData={{ noRay: true }}><boxGeometry args={[w, 0.08, d]} /><meshStandardMaterial color="#d9dde2" /></mesh>
      {Array.from({ length: MANSION_STOPS }, (_, f) => {
        const col = f % 2;
        const row = Math.floor(f / 2);
        return (
          <group key={f} position={[w / 2 - 0.04, 0.9 + row * 0.2, -0.25 + col * 0.3]}>
            <mesh userData={{ use: () => send({ t: 'elevatorCall', floor: f }), hint: tr("ui480", stopLabel(f)) } satisfies Interactable}>
              <boxGeometry args={[0.04, 0.16, 0.24]} />
              <meshStandardMaterial color="#f4f1ea" />
            </mesh>
            <Label position={[-0.04, 0, 0]} text={f === MANSION_STOPS - 1 ? 'R' : String(f + 1)} height={0.1} bg="rgba(0,0,0,0)" fg="#26262e" />
          </group>
        );
      })}
    </group>
  );
}

/** 駅の線路側の柵のうち、電車が止まっていないときに閉じている所 */
function StationGates() {
  const refs = useRef<THREE.Mesh[][]>([]);
  useFrame(() => {
    const open = trainState(serverNow()).station;
    refs.current.forEach((list, i) => list.forEach((m) => { m.visible = i !== open; }));
  });
  return (
    <>
      {STATION_PARTS.map((p, i) => p.gates.map((g, j) => ('w' in g ? (
        <mesh key={`${i}-${j}`} position={[g.x, PLATFORM_Y + 0.6, g.z]} ref={(m) => { if (m) { (refs.current[i] ??= [])[j] = m; } }} userData={{ noRay: true }}>
          <boxGeometry args={[Math.max(g.w, 0.08), 1.2, Math.max(g.d, 0.08)]} />
          <meshStandardMaterial color="#f2c14e" />
        </mesh>
      ) : null)))}
    </>
  );
}

/** map は 2D の背景の 3D マップ。遠くから見下ろすので霧はかけない */
export function CityWorld({ map = false }: { map?: boolean }) {
  const { walls, decor } = useStaticBoxes();
  return (
    <>
      {!map && <fog attach="fog" args={['#bcd6ec', 70, 220]} />}
      {/* 屋内（マンションの廊下・車内）は上からの光が届かないので、全体を少し明るくする */}
      <ambientLight intensity={0.8} />
      <hemisphereLight args={['#eaf4ff', '#8c937e', 0.9]} />
      <directionalLight position={[30, 60, 20]} intensity={1.4} />
      <Ground />
      <Boxes boxes={walls} ray />
      <Boxes boxes={decor} />
      <SpawnArea color="#7fb3ff" />
      <StationGates />
      {STATIONS.map((st, i) => {
        const f = STATION_PARTS[i].frame;
        return <Label key={st.name} position={[f.x + f.nx * 5.4, PLATFORM_Y + 2.4, f.z + f.nz * 5.4]} text={st.name} height={0.5} bg="rgba(40,90,60,0.92)" />;
      })}
      <Label position={[MANSION.x - MANSION.hw - 0.6, 3.4, MANSION.z]} text={tr("ui481")} height={0.45} bg="rgba(60,50,40,0.9)" />
      <ElevatorHalls />
      <ElevatorCar />
      <Car k={0} />
      <Car k={1} />
    </>
  );
}

const STATIONS = localized(RAW_STATIONS);
const stopLabel = (floor: number) => systemText(rawStopLabel(floor));
