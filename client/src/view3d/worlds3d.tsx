import { t as tr, getLanguage } from '../i18n/index.ts';
import { Suspense, useMemo } from 'react';
import * as THREE from 'three';
import { ROOM_HALF } from '../../../shared/protocol.ts';
import { CAFE, CAFE_TABLE_R, type WorldKind } from '../../../shared/worlds.ts';
import { useStore } from '../store.ts';
import { makeCanvasTexture } from './textTexture.ts';
import { Box, Cyl, SpawnArea } from './parts3d.tsx';
import { GameWorld } from './game3d.tsx';
import { CityWorld } from './city3d.tsx';
import { SurvivorObjects } from './survivors3d.tsx';
import { GardenWorld } from './garden3d.tsx';
import { AntimatterWorld } from './antimatterWorld.tsx';
import { AntimatterSky } from './AntimatterSky.tsx';
import { MirrorPanel } from './mirror3d.tsx';

const H = ROOM_HALF;
const WALL_H = 4;

export interface Palette { floor: string; wall: string; spawn: string }
const PALETTES: Record<WorldKind, Palette> = {
  fantasy: { floor: '#c7b78a', wall: '#e6dcc3', spawn: '#d0ac61' },
  starlounge: { floor: '#353f69', wall: '#202b4d', spawn: '#e8c983' },
  room: { floor: '#565961', wall: '#80848e', spawn: '#7fb3ff' },
  cafe: { floor: '#8a5a3b', wall: '#eadcc4', spawn: '#ffd28a' },
  garden: { floor: '#91ad70', wall: '#d6dbc5', spawn: '#f5db91' },
  game: { floor: '#3b3f6b', wall: '#2a2d52', spawn: '#9cf0ff' },
  survivors: { floor: '#38243d', wall: '#4b2945', spawn: '#ef6b9b' },
  city: { floor: '#9db08a', wall: '#ece5d8', spawn: '#7fb3ff' },
  antimatter: { floor: '#1b1d2e', wall: '#2c2f4a', spawn: '#7fd8ff' },
};

/** 床と壁。どのワールドも同じ形で、色だけ変える */
function Shell({ pal, floor }: { pal: Palette; floor?: THREE.Texture }) {
  return (
    <>
      <mesh rotation-x={-Math.PI / 2}>
        <planeGeometry args={[2 * H, 2 * H]} />
        <meshStandardMaterial color={floor ? '#ffffff' : pal.floor} map={floor ?? null} roughness={0.85} />
      </mesh>
      <Box p={[0, WALL_H / 2, -H]} s={[2 * H, WALL_H, 0.2]} color={pal.wall} />
      <Box p={[0, WALL_H / 2, H]} s={[2 * H, WALL_H, 0.2]} color={pal.wall} />
      <Box p={[-H, WALL_H / 2, 0]} s={[0.2, WALL_H, 2 * H]} color={pal.wall} />
      <Box p={[H, WALL_H / 2, 0]} s={[0.2, WALL_H, 2 * H]} color={pal.wall} />
      <SpawnArea color={pal.spawn} />
    </>
  );
}

function Hall() {
  return (
    <>
      <ambientLight intensity={1.4} />
      <directionalLight position={[5, 10, 5]} intensity={1.2} />
      <Shell pal={PALETTES.room} />
      <gridHelper args={[2 * H, 20, '#5c5f66', '#4a4d54']} position-y={0.005} userData={{ noRay: true }} />
    </>
  );
}

function usePlankTexture() {
  return useMemo(() => {
    const { canvas, tex } = makeCanvasTexture(1024, 1024);
    const ctx = canvas.getContext('2d')!;
    const rows = 16;
    const h = 1024 / rows;
    for (let r = 0; r < rows; r++) {
      let x = -((r * 397) % 600);
      while (x < 1024) {
        const len = 380 + ((r * 131 + x) % 260);
        const l = 36 + ((r * 7 + Math.floor(x)) % 5);
        ctx.fillStyle = `hsl(25, 38%, ${l}%)`;
        ctx.fillRect(x, r * h, len, h);
        ctx.fillStyle = 'rgba(40, 22, 10, .55)';
        ctx.fillRect(x, r * h, 3, h);
        x += len;
      }
      ctx.fillStyle = 'rgba(40, 22, 10, .6)';
      ctx.fillRect(0, r * h, 1024, 2);
    }
    tex.wrapS = tex.wrapT = THREE.RepeatWrapping;
    tex.repeat.set(6, 6);
    tex.anisotropy = 4;
    tex.needsUpdate = true;
    return tex;
  }, []);
}

function MenuBoard() {
  const tex = useMemo(() => {
    const { canvas, tex: t } = makeCanvasTexture(1024, 640);
    const ctx = canvas.getContext('2d')!;
    ctx.fillStyle = '#2c3a33';
    ctx.fillRect(0, 0, 1024, 640);
    ctx.strokeStyle = '#a07a52';
    ctx.lineWidth = 24;
    ctx.strokeRect(12, 12, 1000, 616);
    ctx.fillStyle = '#f4ecd8';
    ctx.textAlign = 'center';
    ctx.font = '700 84px "Segoe UI", "Noto Sans JP", sans-serif';
    ctx.fillText('Café Tonarium', 512, 130);
    ctx.font = '500 48px "Segoe UI", "Noto Sans JP", sans-serif';
    const menu = [[tr("ui548"), '¥450'], [tr("ui549"), '¥520'], [tr("ui550"), '¥550'], [tr("ui551"), '¥480']];
    menu.forEach(([n, p], i) => {
      ctx.textAlign = 'left';
      ctx.fillText(n, 120, 250 + i * 88);
      ctx.textAlign = 'right';
      ctx.fillText(p, 904, 250 + i * 88);
    });
    t.needsUpdate = true;
    return t;
  }, [getLanguage()]);
  return (
    <mesh position={[-H + 0.12, 3.05, CAFE.shelf.z]} rotation-y={Math.PI / 2}>
      <planeGeometry args={[2.6, 1.62]} />
      <meshStandardMaterial map={tex} roughness={0.9} />
    </mesh>
  );
}

function Counter() {
  const c = CAFE.counter;
  const s = CAFE.shelf;
  const jars = ['#c7843f', '#e0c08a', '#7a4a2a', '#b85c3c', '#d9b76a', '#8f6a3d'];
  return (
    <>
      <Box p={[c.x, 0.5, c.z]} s={[c.w, 1, c.d]} color="#5a3826" />
      <Box p={[c.x + 0.05, 1.03, c.z]} s={[c.w + 0.2, 0.06, c.d + 0.1]} color="#d8c3a0" rough={0.4} />
      {/* エスプレッソマシンとカップ */}
      <Box p={[c.x - 0.15, 1.3, c.z - 2.4]} s={[0.55, 0.5, 0.7]} color="#b9bcc0" rough={0.3} />
      <Box p={[c.x - 0.15, 1.6, c.z - 2.4]} s={[0.45, 0.1, 0.6]} color="#2b2b2e" />
      {[-0.6, -0.3, 0.9, 1.2].map((dz) => <Cyl key={dz} p={[c.x + 0.2, 1.11, c.z + dz]} r={0.05} r2={0.04} h={0.1} color="#fbf7ef" />)}
      <Box p={[s.x, 1.1, s.z]} s={[s.w, 2.2, s.d]} color="#6b4630" />
      {[0.8, 1.45, 2.05].map((y) => (
        <group key={y}>
          <Box p={[s.x + 0.32, y, s.z]} s={[0.36, 0.04, s.d - 0.2]} color="#8c6243" />
          {Array.from({ length: 9 }, (_, i) => (
            <Cyl key={i} p={[s.x + 0.32, y + 0.13, s.z - s.d / 2 + 0.6 + i * 0.85]} r={0.09} h={0.22} color={jars[(i + Math.round(y * 3)) % jars.length]} seg={12} />
          ))}
        </group>
      ))}
      {CAFE.stools.map((t) => (
        <group key={t.z} position={[t.x, 0, t.z]}>
          <Cyl p={[0, 0.38, 0]} r={0.04} h={0.76} color="#2e2e30" seg={8} />
          <Cyl p={[0, 0.02, 0]} r={0.2} h={0.04} color="#2e2e30" />
          <Cyl p={[0, 0.78, 0]} r={0.2} h={0.07} color="#7b3f2a" />
        </group>
      ))}
    </>
  );
}

function Chair({ x, z, face }: { x: number; z: number; face: number }) {
  return (
    <group position={[x, 0, z]} rotation-y={face}>
      <Box p={[0, 0.45, 0]} s={[0.44, 0.05, 0.42]} color="#9a6a45" />
      <Box p={[0, 0.78, 0.19]} s={[0.44, 0.5, 0.05]} color="#9a6a45" />
      {[[-0.18, -0.17], [0.18, -0.17], [-0.18, 0.17], [0.18, 0.17]].map(([lx, lz]) => (
        <Box key={`${lx}${lz}`} p={[lx, 0.22, lz]} s={[0.04, 0.44, 0.04]} color="#5a3826" />
      ))}
    </group>
  );
}

function PendantLight({ x, z }: { x: number; z: number }) {
  const lightweight = useStore((s) => s.lightweight);
  return (
    <group position={[x, 0, z]}>
      <mesh position={[0, 3.35, 0]}>
        <cylinderGeometry args={[0.008, 0.008, 1.3, 4]} />
        <meshBasicMaterial color="#222" />
      </mesh>
      <mesh position={[0, 2.62, 0]}>
        <coneGeometry args={[0.26, 0.24, 20, 1, true]} />
        <meshStandardMaterial color="#2f2a26" side={THREE.DoubleSide} roughness={0.5} />
      </mesh>
      <mesh position={[0, 2.54, 0]}>
        <sphereGeometry args={[0.07, 12, 8]} />
        <meshBasicMaterial color="#ffe3a8" toneMapped={false} />
      </mesh>
      {!lightweight && <pointLight position={[0, 2.4, 0]} color="#ffcf8a" intensity={6} distance={6} decay={1.6} />}
    </group>
  );
}

function Tables() {
  return (
    <>
      {CAFE.tables.map((t) => (
        <group key={`${t.x},${t.z}`}>
          <group position={[t.x, 0, t.z]}>
            <Cyl p={[0, 0.74, 0]} r={CAFE_TABLE_R} h={0.04} color="#c49a6c" />
            <Cyl p={[0, 0.37, 0]} r={0.04} h={0.72} color="#2e2e30" seg={8} />
            <Cyl p={[0, 0.02, 0]} r={0.25} h={0.04} color="#2e2e30" />
            <Cyl p={[0.12, 0.8, 0.05]} r={0.045} r2={0.035} h={0.09} color="#fbf7ef" seg={12} />
          </group>
          <Chair x={t.x + 0.85} z={t.z} face={Math.PI / 2} />
          <Chair x={t.x - 0.85} z={t.z} face={-Math.PI / 2} />
          <PendantLight x={t.x} z={t.z} />
        </group>
      ))}
    </>
  );
}

function Sofa() {
  const s = CAFE.sofa;
  const t = CAFE.sofaTable;
  return (
    <>
      <Box p={[s.x, 0.22, s.z]} s={[s.w, 0.44, s.d]} color="#6e3b33" />
      <Box p={[s.x + 0.33, 0.7, s.z]} s={[0.24, 0.6, s.d]} color="#6e3b33" />
      {[-1.2, 0, 1.2].map((dz) => <Box key={dz} p={[s.x - 0.08, 0.5, s.z + dz]} s={[0.7, 0.14, 1.12]} color="#8a4a40" rough={0.95} />)}
      <Box p={[t.x, 0.42, t.z]} s={[t.w, 0.05, t.d]} color="#c49a6c" />
      <Box p={[t.x, 0.2, t.z]} s={[t.w - 0.2, 0.4, t.d - 0.2]} color="#5a3826" />
      <PendantLight x={t.x + 0.4} z={t.z} />
    </>
  );
}

function Plant({ x, z }: { x: number; z: number }) {
  return (
    <group position={[x, 0, z]}>
      <Cyl p={[0, 0.25, 0]} r={0.3} r2={0.22} h={0.5} color="#c46a43" />
      <mesh position={[0, 0.95, 0]}>
        <icosahedronGeometry args={[0.5, 0]} />
        <meshStandardMaterial color="#4f7d45" roughness={0.9} flatShading />
      </mesh>
      <mesh position={[0.15, 1.35, -0.05]}>
        <icosahedronGeometry args={[0.32, 0]} />
        <meshStandardMaterial color="#5f9452" roughness={0.9} flatShading />
      </mesh>
    </group>
  );
}

function Cafe() {
  const planks = usePlankTexture();
  const pal = PALETTES.cafe;
  return (
    <>
      <ambientLight intensity={0.75} color="#ffe9cc" />
      <hemisphereLight args={['#fff2dc', '#5a3826', 0.6]} />
      <directionalLight position={[4, 10, 6]} intensity={0.7} color="#ffe0b8" />
      <Shell pal={pal} floor={planks} />
      <group position={[CAFE.mirror.x, CAFE.mirror.y, CAFE.mirror.z]}>
        <MirrorPanel width={CAFE.mirror.w} height={CAFE.mirror.h} />
      </group>
      {/* 腰壁 */}
      <Box p={[0, 0.55, -H + 0.13]} s={[2 * H, 1.1, 0.06]} color="#7a5038" />
      <Box p={[H - 0.13, 0.55, 0]} s={[0.06, 1.1, 2 * H]} color="#7a5038" />
      <Box p={[0, 0.55, H - 0.13]} s={[2 * H, 1.1, 0.06]} color="#7a5038" />
      <mesh rotation-x={Math.PI / 2} position-y={WALL_H}>
        <planeGeometry args={[2 * H, 2 * H]} />
        <meshStandardMaterial color="#6b4a36" />
      </mesh>
      {/* 天井の梁 */}
      {[-6, -2, 2, 6].map((z) => <Box key={z} p={[0, WALL_H - 0.12, z]} s={[2 * H, 0.24, 0.3]} color="#5a3826" />)}
      <Counter />
      <MenuBoard />
      <Tables />
      <Sofa />
      {CAFE.plants.map((p) => <Plant key={`${p.x},${p.z}`} x={p.x} z={p.z} />)}
    </>
  );
}

function StarLounge() {
  return <>
    <ambientLight intensity={1.3} />
    <directionalLight position={[0, 8, 0]} intensity={1.5} />
    <Shell pal={PALETTES.starlounge} />
    {Array.from({ length: 36 }, (_, i) => (
      <mesh key={i} position={[Math.sin(i * 2.4) * (3 + i % 7), 3.1 + (i % 3) * .3, Math.cos(i * 2.4) * (3 + i % 7)]}>
        <octahedronGeometry args={[.045 + (i % 3) * .025]} />
        <meshBasicMaterial color={i % 2 ? '#f9df9b' : '#c5dcff'} />
      </mesh>
    ))}
  </>;
}

export function WorldMesh({ kind, map = false }: { kind: WorldKind; map?: boolean }) {
  if (kind === 'fantasy') return null;
  if (kind === 'starlounge') return <StarLounge />;
  if (kind === 'game') return <GameWorld pal={PALETTES.game} />;
  if (kind === 'survivors') return <><Hall /><SurvivorObjects /></>;
  if (kind === 'city') return <CityWorld map={map} />;
  if (kind === 'garden') return <><Shell pal={PALETTES.garden} /><GardenWorld map={map} /></>;
  // AntimatterLab は床・壁・光源を自前で持つため Hall では包まない
  if (kind === 'antimatter') return <><Suspense fallback={null}><AntimatterSky /></Suspense><AntimatterWorld /></>;
  return kind === 'cafe' ? <Cafe /> : <Hall />;
}

export const WORLD_BG: Record<WorldKind, string> = { room: '#2b2d31', cafe: '#1f1a17', game: '#7fb6e6', survivors: '#2b2d31', city: '#bcd6ec', garden: '#c8e3ed', starlounge: '#151c37', antimatter: '#0b0d1a', fantasy: '#d9cfb5' };
