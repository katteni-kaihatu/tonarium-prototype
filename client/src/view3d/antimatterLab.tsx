// antimatter ワールドの 3D オブジェクト群。既存ファイルは触らず、親が WorldMesh へ分岐追加する。
// drei の Html は使わない。Label.tsx の注記どおり、3D 参加直後の分が空になり撮影にも写らないうえ、
// ポインターロック中は DOM をマウスで直接操作できないため。代わりに、空間内は CanvasTexture の
// ボード（撮影にも写る・遮蔽も 3D 通り）で示し、操作は照準＋クリックで前面パネルを開く方式にする。
import * as THREE from 'three';
import {
  ANTIMATTER_ALTAR, ANTIMATTER_CORE, ANTIMATTER_EXHIBITS, ANTIMATTER_PALETTE, ANTIMATTER_PORTAL,
  ANTIMATTER_TOWERS, DIMENSION_TARGETS, clampLog, towerHeightFromLog,
  type AdDioramaView, type AdLabSnapshot, type AdPanelTarget,
} from '../../../shared/antimatterLayout.ts';
import { Box, Cyl, SpawnArea } from './parts3d.tsx';
import { Label } from './Label.tsx';
import { PanelBoard } from './antimatterPanels.tsx';
import { AntimatterReadout } from './AntimatterReadout.tsx';
import { AdPurchaseParticles3D } from './AdPurchaseParticles3D.tsx';
import { DimensionReactor3D } from './DimensionReactor3D.tsx';
import { DimensionProductionParticles } from './DimensionProductionParticles.tsx';
import { CoreFountain } from './CoreFountain.tsx';

export type Origin = [number, number];

type OpenPanel = (target: AdPanelTarget) => void;

function LabShell({ origin }: { origin: Origin }) {
  const pal = ANTIMATTER_PALETTE;
  return (
    <group position={[origin[0], 0, origin[1]]}>
      <ambientLight intensity={0.9} color="#cdd8ff" />
      <directionalLight position={[5, 10, 5]} intensity={0.9} color="#dfe8ff" />
      <mesh rotation-x={-Math.PI / 2} userData={{ noRay: true }}>
        <planeGeometry args={[20, 20]} />
        <meshStandardMaterial color={pal.floor} roughness={0.85} />
      </mesh>
      <gridHelper args={[20, 20, '#3a3f66', '#2a2e4d']} position-y={0.005} userData={{ noRay: true }} />
      {/* 周囲は透明な境界。移動・アイテムの範囲制限は共通の clampRoom が担う。 */}
      {origin[0] === 0 && origin[1] === 0 && <SpawnArea color={pal.spawn} />}
    </group>
  );
}

function DimensionTower({ tier, x, z, view, interactable, onOpen, detail }: {
  tier: number; x: number; z: number;
  view: AdLabSnapshot['dimensions'][number];
  interactable: boolean; onOpen: OpenPanel; detail: 'full' | 'simple';
}) {
  const target = DIMENSION_TARGETS[tier - 1];
  const h = view.locked ? 0.5 : towerHeightFromLog(view.amountLog10);
  const groupProps = interactable
    ? { userData: { hint: `第${tier}次元（クリックでパネル）`, use: () => onOpen(target) } }
    : { userData: { noRay: true } };
  return (
    <group position={[x, 0, z]} {...groupProps}>
      <DimensionReactor3D tier={tier} amountLog10={view.amountLog10} productionLog10={view.productionLog10} bought={view.bought} locked={view.locked} detail={detail} />
      <Label text={view.locked ? `🔒 第${tier}次元` : `第${tier}次元`} position={[0, h + 1.4, 0]} height={0.22} bg="rgba(20,24,48,.92)" />
    </group>
  );
}

function ExhibitPlinth({ id, x, z, title, interactable, onOpen }: {
  id: AdPanelTarget; x: number; z: number; title: string; interactable: boolean; onOpen: OpenPanel;
}) {
  const groupProps = interactable
    ? { userData: { hint: `${title}（モック・クリックで説明）`, use: () => onOpen(id) } }
    : { userData: { noRay: true } };
  return (
    <group position={[x, 0, z]} {...groupProps}>
      <Cyl p={[0, 0.35, 0]} r={0.42} r2={0.5} h={0.7} color="#2e334f" />
      <Box p={[0, 1.05, 0]} s={[0.7, 0.7, 0.18]} color="#8a7a5c" />
      <Label text={`${title}（モック）`} position={[0, 1.75, 0]} height={0.2} bg="rgba(60,50,30,.94)" />
    </group>
  );
}

/** 自分の研究所。isOwn が false の場合は操作を付けず、親は通常こちらではなく DioramaLab を使う */
export function AntimatterLab({ origin = [0, 0], snapshot, isOwn, onOpenPanel }: {
  origin?: Origin; snapshot: AdLabSnapshot; isOwn: boolean; onOpenPanel?: OpenPanel;
}) {
  const open: OpenPanel = (target) => {
    if (!isOwn) return;
    onOpenPanel?.(target);
    // ポインターロック中は DOM を触れないので、パネルを開くときにロックを外す。
    // 閉じたあとは既存の挙動どおりキャンバスをクリックすれば再ロックされる
    if (document.pointerLockElement) document.exitPointerLock();
  };
  return (
    <group position={[origin[0], 0, origin[1]]}>
      <LabShell origin={origin} />
      {isOwn && <AdPurchaseParticles3D snapshot={snapshot} />}
      {isOwn && <DimensionProductionParticles snapshot={snapshot} />}
      <group position={[ANTIMATTER_CORE.x, 0, ANTIMATTER_CORE.z]} userData={{ hint: '反物質コア（クリックでパネル）', use: () => open('core') }}>
        <CoreFountain log10={snapshot.antimatterLog10} bought={snapshot.tickspeedBought} />
        <Label text="反物質コア" position={[0, 2.6, 0]} height={0.24} bg="rgba(20,24,48,.92)" />
        <AntimatterReadout snapshot={snapshot} onOpen={isOwn ? () => open('core') : undefined} />
      </group>
      {ANTIMATTER_TOWERS.map((t) => (
        <group key={t.tier} position={[0, 0, 0]}>
          <DimensionTower tier={t.tier} x={t.x} z={t.z} view={snapshot.dimensions[t.tier - 1]} interactable={isOwn} onOpen={open} detail="full" />
          {isOwn && !snapshot.dimensions[t.tier - 1].locked && (
            <PanelBoard
              hint={`第${t.tier}次元（クリックでパネル）`} onOpen={() => open(DIMENSION_TARGETS[t.tier - 1])}
              position={[t.x, towerHeightFromLog(snapshot.dimensions[t.tier - 1].amountLog10) + 1.9, t.z]}
              lines={[
                `第${t.tier}次元`,
                `所持 ${snapshot.dimensions[t.tier - 1].amountText}`,
                `生産 ${snapshot.dimensions[t.tier - 1].productionText} / 秒`,
                `次コスト ${snapshot.dimensions[t.tier - 1].nextCostText}`,
              ]}
            />
          )}
        </group>
      ))}
      <group position={[ANTIMATTER_ALTAR.x, 0, ANTIMATTER_ALTAR.z]} userData={isOwn ? { hint: 'Sacrifice 祭壇（クリックでパネル）', use: () => open('sacrifice') } : { noRay: true }}>
        <Cyl p={[0, 0.3, 0]} r={0.5} r2={0.62} h={0.6} color="#5c2a3a" />
        <mesh position-y={0.85}>
          <sphereGeometry args={[0.24, 16, 12]} />
          <meshStandardMaterial color="#ff6b8a" emissive="#b32e50" emissiveIntensity={1.1} roughness={0.3} />
        </mesh>
        <Label text="Sacrifice 祭壇" position={[0, 1.5, 0]} height={0.2} bg="rgba(60,20,32,.94)" />
      </group>
      <group position={[ANTIMATTER_PORTAL.x, 0, ANTIMATTER_PORTAL.z]} userData={isOwn ? { hint: 'Big Crunch ポータル（クリックでパネル）', use: () => open('crunch') } : { noRay: true }}>
        <mesh position-y={1.1}>
          <torusGeometry args={[0.85, 0.09, 12, 40]} />
          <meshStandardMaterial color={snapshot.canCrunch ? '#c084fc' : '#3a3f66'} emissive={snapshot.canCrunch ? '#7c3aed' : '#000000'} emissiveIntensity={snapshot.canCrunch ? 1.4 : 0} roughness={0.4} />
        </mesh>
        <mesh position-y={1.1}>
          <circleGeometry args={[0.8, 32]} />
          <meshBasicMaterial color="#0b0d1a" transparent opacity={snapshot.canCrunch ? 0.9 : 0.4} depthWrite={false} />
        </mesh>
        <Label text={snapshot.canCrunch ? 'Big Crunch 可能' : 'Big Crunch ポータル'} position={[0, 2.3, 0]} height={0.2} bg="rgba(40,20,60,.94)" />
      </group>
      {snapshot.galaxies > 0 && (
        <group position={[ANTIMATTER_CORE.x, 2.6, ANTIMATTER_CORE.z]} userData={{ noRay: true }}>
          {Array.from({ length: Math.min(snapshot.galaxies, 8) }, (_, i) => (
            <mesh key={i} position={[Math.cos(i * 0.9) * 2.1, 0, Math.sin(i * 0.9) * 2.1]} rotation-x={-Math.PI / 2}>
              <circleGeometry args={[0.32, 24]} />
              <meshBasicMaterial color="#e9d5ff" transparent opacity={0.75} depthWrite={false} blending={THREE.AdditiveBlending} />
            </mesh>
          ))}
          <Label text={`銀河 ×${snapshot.galaxies}`} position={[0, 0.7, 0]} height={0.2} bg="rgba(40,20,60,.94)" />
        </group>
      )}
      {ANTIMATTER_EXHIBITS.map((e) => (
        <ExhibitPlinth key={e.id} id={e.id} x={e.x} z={e.z} title={e.title} interactable={isOwn} onOpen={open} />
      ))}
    </group>
  );
}

/** 他人の研究所。useFrame を使わず静止画にし、31 人分でも毎フレーム計算を増やさない */
export function DioramaLab({ origin = [0, 0], view }: { origin?: Origin; view: AdDioramaView }) {
  const log = clampLog(view.antimatterLog10);
  return (
    <group position={[origin[0], 0, origin[1]]} userData={{ noRay: true }}>
      <mesh position={[ANTIMATTER_CORE.x, 0.5, ANTIMATTER_CORE.z]}>
        <sphereGeometry args={[0.45 + 0.15 * Math.min(log, 10) / 10, 16, 12]} />
        <meshStandardMaterial color="#3a4a7a" roughness={0.8} />
      </mesh>
      {ANTIMATTER_TOWERS.map((t) => (
        <Box key={t.tier} p={[t.x, (t.tier <= view.maxTier ? 0.5 + 0.2 * Math.min(log, 20) : 0.25), t.z]} s={[0.6, t.tier <= view.maxTier ? 1 + 0.4 * Math.min(log, 20) : 0.5, 0.6]} color="#2a3355" />
      ))}
      <Label text="研究所（ジオラマ）" position={[ANTIMATTER_CORE.x, 2.2, ANTIMATTER_CORE.z]} height={0.22} bg="rgba(20,24,48,.92)" />
    </group>
  );
}
