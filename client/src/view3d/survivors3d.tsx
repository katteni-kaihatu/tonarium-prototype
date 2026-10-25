import { t as tr } from '../i18n/index.ts';
import { useEffect, useMemo, useRef, useState } from 'react';
import { useFrame } from '@react-three/fiber';
import * as THREE from 'three';
import { SURVIVOR_STYLES } from '../i18n/static.ts';
import { SURVIVOR_JOIN, survivorDistance, type SurvivorAttackEffect, type SurvivorEnemy, type SurvivorPlayer, type SurvivorProjectile } from '../../../shared/survivor.ts';
import { useStore, get, colorOf, serverNow } from '../store.ts';
import { Cyl } from './parts3d.tsx';
import { Label } from './Label.tsx';

const ATTACK_COLORS: Record<string, string> = {
  moonblade: '#ff65aa', eclipse: '#ffe675', bloodaura: '#ff315e', crimsonsun: '#ff9d35',
  starbolt: '#5fe5ff', starfall: '#ffe16e', shade: '#bc8aff', umbralstorm: '#a457ff',
  frostlance: '#8beaff', stormring: '#7cbdff', embermine: '#ff7c3b', thornshot: '#93e86b', voidpulse: '#d783ff',
  lunarconvergence: '#ff527d', crimsonvoid: '#b58cff', stormfrost: '#9af8ff',
  astralbarrage: '#4deaff', soulreaper: '#ff2d72', thunderweb: '#f4e95c', infernomine: '#ff782b', thornstorm: '#95ff5b', lunarvoid: '#db7aff',
};
const isAreaWeapon = (gear: string) => ['moonblade', 'eclipse', 'bloodaura', 'crimsonsun', 'starfall', 'embermine', 'voidpulse', 'lunarconvergence', 'soulreaper', 'infernomine', 'lunarvoid'].includes(gear);

function AttackTrace({ effect, target, showArea, origin }: { effect: SurvivorAttackEffect; target: { x: number; z: number }; showArea: boolean; origin: { x: number; z: number } }) {
  const area = isAreaWeapon(effect.gear);
  const color = ATTACK_COLORS[effect.gear] ?? '#fff3a6';
  const ring = useRef<THREE.Mesh>(null);
  const ringMaterial = useRef<THREE.MeshBasicMaterial>(null);
  const projectile = useRef<THREE.Mesh>(null);
  const projectileMaterial = useRef<THREE.MeshBasicMaterial>(null);
  const beam = useRef<THREE.Mesh>(null);
  const beamMaterial = useRef<THREE.MeshBasicMaterial>(null);
  const beamGlow = useRef<THREE.Mesh>(null);
  const beamGlowMaterial = useRef<THREE.MeshBasicMaterial>(null);
  const sparks = useRef<(THREE.Mesh | null)[]>([]);
  const sparkMaterials = useRef<(THREE.MeshBasicMaterial | null)[]>([]);
  const impact = useRef<THREE.Mesh>(null);
  const impactMaterial = useRef<THREE.MeshBasicMaterial>(null);
  const from = useMemo(() => new THREE.Vector3(origin.x, 0.42, origin.z), [origin.x, origin.z]);
  const to = useMemo(() => new THREE.Vector3(target.x, 0.42, target.z), [target.x, target.z]);
  const direction = useMemo(() => new THREE.Vector3(), []);
  const middle = useMemo(() => new THREE.Vector3(), []);
  const up = useMemo(() => new THREE.Vector3(0, 1, 0), []);
  useFrame(() => {
    const age = Math.max(0, serverNow() - effect.at);
    const progress = Math.min(1, age / 650);
    const fade = 1 - progress;
    if (ring.current && ringMaterial.current && showArea) {
      ring.current.position.set(effect.areaCenter?.x ?? effect.from.x, 0.055, effect.areaCenter?.z ?? effect.from.z);
      ring.current.scale.setScalar(0.15 + effect.reach * progress);
      ringMaterial.current.opacity = fade * 0.95;
    }
    if (!area && projectile.current && projectileMaterial.current && beam.current && beamMaterial.current) {
      projectile.current.position.lerpVectors(from, to, progress);
      projectile.current.position.y = 0.52;
      projectile.current.visible = age <= 650;
      projectileMaterial.current.opacity = fade;
      direction.subVectors(to, from);
      const beamLength = direction.length();
      middle.addVectors(from, to).multiplyScalar(0.5);
      beam.current.position.copy(middle);
      beam.current.position.y = 0.39;
      beam.current.quaternion.setFromUnitVectors(up, direction.normalize());
      beam.current.scale.set(0.035, beamLength, 0.035);
      beam.current.visible = age <= 650 && beamLength > 0.01;
      beamMaterial.current.opacity = fade * 0.68;
      if (beamGlow.current && beamGlowMaterial.current) {
        beamGlow.current.position.copy(beam.current.position);
        beamGlow.current.quaternion.copy(beam.current.quaternion);
        beamGlow.current.scale.set(0.1, beamLength, 0.1);
        beamGlow.current.visible = beam.current.visible;
        beamGlowMaterial.current.opacity = fade * 0.3;
      }
    }
    if (impact.current && impactMaterial.current) {
      impact.current.position.set(target.x, 0.06, target.z);
      impact.current.scale.setScalar(0.2 + progress * 0.85);
      impact.current.rotation.z = -progress * Math.PI * 0.45;
      impactMaterial.current.opacity = fade * 0.9;
    }
    for (let i = 0; i < sparks.current.length; i++) {
      const mesh = sparks.current[i], material = sparkMaterials.current[i];
      if (!mesh || !material) continue;
      const angle = i * Math.PI * 2 / 6 + (effect.at % 997) * 0.004;
      const distance = progress * (0.3 + (i % 3) * 0.12);
      mesh.position.set(target.x + Math.cos(angle) * distance, 0.12 + Math.sin(progress * Math.PI) * 0.22, target.z + Math.sin(angle) * distance);
      mesh.scale.setScalar(0.13 * fade);
      material.opacity = fade;
      mesh.visible = age <= 650;
    }
  });
  return (
    <group userData={{ noRay: true }}>
      {area && showArea && <mesh ref={ring} rotation-x={-Math.PI / 2}>
        <ringGeometry args={[0.82, 1, 48]} />
        <meshBasicMaterial ref={ringMaterial} color={color} transparent opacity={0.9} depthWrite={false} toneMapped={false} />
      </mesh>}
      {!area && <>
        <mesh ref={beamGlow}>
          <cylinderGeometry args={[1, 1, 1, 8]} />
          <meshBasicMaterial ref={beamGlowMaterial} color={color} transparent opacity={0.3} depthWrite={false} toneMapped={false} blending={THREE.AdditiveBlending} />
        </mesh>
        <mesh ref={beam}>
          <cylinderGeometry args={[1, 1, 1, 8]} />
          <meshBasicMaterial ref={beamMaterial} color={color} transparent opacity={0.68} depthWrite={false} toneMapped={false} />
        </mesh>
        <mesh ref={projectile}>
          <octahedronGeometry args={[0.2, 1]} />
          <meshBasicMaterial ref={projectileMaterial} color={color} transparent opacity={1} depthWrite={false} toneMapped={false} />
        </mesh>
      </>}
      <mesh ref={impact} rotation-x={-Math.PI / 2}>
        <ringGeometry args={[0.72, 1, 32]} />
        <meshBasicMaterial ref={impactMaterial} color="#fff" transparent opacity={0.9} depthWrite={false} toneMapped={false} />
      </mesh>
      {Array.from({ length: 6 }, (_, index) => <mesh key={index} ref={(node) => { sparks.current[index] = node; }}>
        <octahedronGeometry args={[1, 0]} />
        <meshBasicMaterial ref={(material) => { sparkMaterials.current[index] = material; }} color={index % 2 ? color : '#fff6d9'} transparent opacity={1} depthWrite={false} toneMapped={false} blending={THREE.AdditiveBlending} />
      </mesh>)}
    </group>
  );
}

function JoinCircle() {
  const [, tick] = useState(0);
  useEffect(() => { const t = setInterval(() => tick((n) => n + 1), 500); return () => clearInterval(t); }, []);
  const s = get();
  const users = s.participants.filter((u) => {
    const p = u.mode === '3d' ? s.avatars[u.id] : u.pos;
    return survivorDistance(p ?? { x: 0, z: 6.5 }, SURVIVOR_JOIN) <= SURVIVOR_JOIN.r;
  });
  const run = s.survivors[s.session ?? ''];
  const label = run?.phase === 'running' || run?.phase === 'boss' ? tr("ui532") : tr("ui533", users.length);
  return (
    <group position={[SURVIVOR_JOIN.x, 0, SURVIVOR_JOIN.z]} userData={{ noRay: true }}>
      <mesh rotation-x={-Math.PI / 2} position-y={0.018}>
        <circleGeometry args={[SURVIVOR_JOIN.r, 48]} />
        <meshBasicMaterial color="#ce5c91" transparent opacity={0.17} depthWrite={false} />
      </mesh>
      <mesh rotation-x={-Math.PI / 2} position-y={0.025}>
        <ringGeometry args={[SURVIVOR_JOIN.r - 0.07, SURVIVOR_JOIN.r, 64]} />
        <meshBasicMaterial color="#ff9ac8" />
      </mesh>
      <Label text={label} position={[0, 2.1, 0]} height={0.24} bg="rgba(92,28,68,.92)" />
    </group>
  );
}

function StartAltar() {
  return (
    <group position={[SURVIVOR_JOIN.x + 2.8, 0, SURVIVOR_JOIN.z]} userData={{ noRay: true }}>
      <Cyl p={[0, 0.42, 0]} r={0.42} r2={0.5} h={0.84} color="#38213b" />
      <mesh position-y={0.9}>
        <icosahedronGeometry args={[0.28, 1]} />
        <meshStandardMaterial color="#ef6b9b" emissive="#b32e70" emissiveIntensity={1.2} roughness={0.3} />
      </mesh>
      <Label text={tr("ui534")} position={[0, 1.5, 0]} height={0.22} bg="rgba(93,30,68,.96)" />
    </group>
  );
}

function Enemy({ enemy, paused }: { enemy: SurvivorEnemy; paused: boolean }) {
  const ref = useRef<THREE.Group>(null);
  const material = useRef<THREE.MeshStandardMaterial>(null);
  const halo = useRef<THREE.Mesh>(null);
  const haloMaterial = useRef<THREE.MeshBasicMaterial>(null);
  const groundRing = useRef<THREE.Mesh>(null);
  const groundRingMaterial = useRef<THREE.MeshBasicMaterial>(null);
  const dashTrail = useRef<THREE.Mesh>(null);
  const dashTrailMaterial = useRef<THREE.MeshBasicMaterial>(null);
  const boss = enemy.kind === 'boss';
  const charger = enemy.kind === 'charger';
  const shifter = enemy.kind === 'shifter';
  const color = boss ? '#a41142' : charger ? '#e87927' : enemy.kind === 'wisp' ? '#33c7c5' : enemy.kind === 'knight' ? '#7b547a' : enemy.kind === 'bat' ? '#513b77' : enemy.kind === 'slinger' ? '#d39a37' : enemy.kind === 'splitter' ? '#d95748' : shifter ? '#9749bd' : enemy.kind === 'pack' ? '#719d32' : enemy.kind === 'bulwark' ? '#687b93' : '#7c3154';
  const size = boss ? 0.72 : enemy.kind === 'knight' || enemy.kind === 'bulwark' ? 0.42 : enemy.kind === 'splitter' ? 0.4 : charger ? 0.38 : enemy.kind === 'wisp' || shifter ? 0.32 : 0.3;
  useFrame(({ clock }) => {
    if (!ref.current) return;
    if (paused) return;
    ref.current.position.y = boss ? 0.95 + Math.sin(clock.elapsedTime * 2) * 0.1
      : enemy.kind === 'wisp' ? 0.72 + Math.sin(clock.elapsedTime * 8 + enemy.movePhase) * 0.24
        : shifter ? 0.58 + Math.sin(clock.elapsedTime * 9 + enemy.movePhase) * 0.17
        : 0.35 + Math.sin(clock.elapsedTime * 5 + enemy.x) * 0.06;
    ref.current.position.x = enemy.x; ref.current.position.z = enemy.z;
    const hitAge = serverNow() - enemy.hitAt;
    const flash = enemy.hitAt > 0 && hitAge >= 0 && hitAge < 220 ? 1 - hitAge / 220 : 0;
    const scale = 1 + flash * 0.28;
    ref.current.scale.setScalar(scale);
    material.current?.emissive.set(flash > 0 ? '#ffffff' : color);
    if (material.current) material.current.emissiveIntensity = (boss ? 0.65 : 0.12) + flash * 2.8;
    if (dashTrail.current && dashTrailMaterial.current && (boss || charger || shifter)) {
      const remaining = enemy.dashUntil - serverNow();
      const from = enemy.dashFrom;
      const dx = from ? enemy.x - from.x : 0, dz = from ? enemy.z - from.z : 0;
      const length = Math.hypot(dx, dz);
      dashTrail.current.visible = !!from && remaining > 0 && length > 0.05;
      if (from && length > 0.05) {
        dashTrail.current.position.set((from.x + enemy.x) / 2 - enemy.x, 0.42, (from.z + enemy.z) / 2 - enemy.z);
        dashTrail.current.rotation.y = -Math.atan2(dz, dx);
        dashTrail.current.scale.x = length;
      }
      dashTrailMaterial.current.color.set(boss ? '#fff0d8' : shifter ? '#f2b7ff' : '#ffe6a0');
      dashTrailMaterial.current.opacity = Math.max(0, Math.min(1, remaining / (boss ? 520 : shifter ? 650 : 480))) * 0.9;
    }
    if (boss) {
      const pulse = 0.5 + Math.sin(clock.elapsedTime * 3.2) * 0.5;
      halo.current?.scale.setScalar(1.08 + pulse * 0.12);
      if (haloMaterial.current) haloMaterial.current.opacity = 0.16 + pulse * 0.16;
      groundRing.current?.scale.setScalar(1 + pulse * 0.12);
      if (groundRingMaterial.current) groundRingMaterial.current.opacity = 0.52 + pulse * 0.28;
    }
  });
  return (
    <group ref={ref} position={[enemy.x, 0, enemy.z]}>
      <mesh>
        {boss || enemy.kind === 'splitter' ? <dodecahedronGeometry args={[size, 1]} />
          : charger || enemy.kind === 'pack' ? <coneGeometry args={[size, size * 2.2, enemy.kind === 'pack' ? 3 : 6]} />
            : enemy.kind === 'wisp' || shifter ? <octahedronGeometry args={[size, 1]} />
              : enemy.kind === 'slinger' || enemy.kind === 'bulwark' ? <boxGeometry args={[size * 1.7, size * 1.9, size * 1.2]} />
                : <icosahedronGeometry args={[size, 0]} />}
        <meshStandardMaterial ref={material} color={color} emissive={color} emissiveIntensity={boss ? 0.65 : 0.12} roughness={0.55} />
      </mesh>
      {(boss || charger || shifter) && <mesh ref={dashTrail} visible={false}>
        <boxGeometry args={[1, 0.07, 0.18]} />
        <meshBasicMaterial ref={dashTrailMaterial} color={boss ? '#fff0d8' : shifter ? '#f2b7ff' : '#ffe6a0'} transparent opacity={0.9} depthWrite={false} toneMapped={false} blending={THREE.AdditiveBlending} />
      </mesh>}
      {charger && <mesh rotation-x={-Math.PI / 2} position-y={0.035}>
        <ringGeometry args={[0.43, 0.5, 6]} />
        <meshBasicMaterial color="#ff9b38" transparent opacity={0.78} depthWrite={false} toneMapped={false} />
      </mesh>}
      {enemy.kind === 'wisp' && <>
        <mesh rotation-x={-Math.PI / 2} position-y={0.04}>
          <ringGeometry args={[0.36, 0.4, 32]} />
          <meshBasicMaterial color="#8dfff4" transparent opacity={0.7} depthWrite={false} toneMapped={false} />
        </mesh>
        <mesh rotation-x={Math.PI / 2} position-y={0.72}>
          <torusGeometry args={[0.43, 0.025, 6, 24]} />
          <meshBasicMaterial color="#81fff2" transparent opacity={0.78} depthWrite={false} toneMapped={false} />
        </mesh>
      </>}
      {shifter && <mesh rotation-x={-Math.PI / 2} position-y={0.04}>
        <ringGeometry args={[0.39, 0.44, 24]} />
        <meshBasicMaterial color="#f2b7ff" transparent opacity={0.72} depthWrite={false} toneMapped={false} />
      </mesh>}
      {enemy.kind === 'bulwark' && <mesh rotation-x={-Math.PI / 2} position-y={0.045}>
        <ringGeometry args={[0.52, 0.58, 6]} />
        <meshBasicMaterial color="#c4d4e9" transparent opacity={0.62} depthWrite={false} toneMapped={false} />
      </mesh>}
      {boss && <>
        <mesh ref={halo}>
          <icosahedronGeometry args={[size * 1.42, 0]} />
          <meshBasicMaterial ref={haloMaterial} color="#ff315d" wireframe transparent opacity={0.22} depthWrite={false} toneMapped={false} />
        </mesh>
        <mesh ref={groundRing} rotation-x={-Math.PI / 2} position-y={-0.94}>
          <ringGeometry args={[0.9, 1.04, 48]} />
          <meshBasicMaterial ref={groundRingMaterial} color="#ff456d" transparent opacity={0.7} depthWrite={false} toneMapped={false} />
        </mesh>
      </>}
    </group>
  );
}

function ChargeTelegraph({ enemy, pausedAt }: { enemy: SurvivorEnemy; pausedAt: number | null }) {
  const line = useRef<THREE.Mesh>(null);
  const lineMaterial = useRef<THREE.MeshBasicMaterial>(null);
  const mark = useRef<THREE.Mesh>(null);
  const markMaterial = useRef<THREE.MeshBasicMaterial>(null);
  useFrame(({ clock }) => {
    const target = enemy.chargeTarget;
    if (!line.current || !lineMaterial.current || !mark.current || !markMaterial.current) return;
    const remaining = enemy.chargeUntil - (pausedAt ?? serverNow());
    if (!target || remaining <= 0) {
      line.current.visible = false; mark.current.visible = false;
      return;
    }
    const dx = target.x - enemy.x, dz = target.z - enemy.z;
    const length = Math.hypot(dx, dz);
    line.current.visible = length > 0.05;
    line.current.position.set((enemy.x + target.x) / 2, 0.055, (enemy.z + target.z) / 2);
    line.current.rotation.y = -Math.atan2(dz, dx);
    line.current.scale.x = length;
    mark.current.visible = true;
    mark.current.position.set(target.x, 0.06, target.z);
    mark.current.scale.setScalar(1 + Math.sin(clock.elapsedTime * 18) * 0.12);
    const opacity = 0.5 + Math.sin(clock.elapsedTime * 18) * 0.22;
    lineMaterial.current.opacity = opacity;
    markMaterial.current.opacity = opacity + 0.12;
  });
  return (
    <group userData={{ noRay: true }}>
      <mesh ref={line} visible={false}>
        <boxGeometry args={[1, 0.035, 0.16]} />
        <meshBasicMaterial ref={lineMaterial} color="#ff9b38" transparent opacity={0.6} depthWrite={false} toneMapped={false} />
      </mesh>
      <mesh ref={mark} rotation-x={-Math.PI / 2} visible={false}>
        <ringGeometry args={[0.45, 0.55, 6]} />
        <meshBasicMaterial ref={markMaterial} color="#fff0b8" transparent opacity={0.75} depthWrite={false} toneMapped={false} />
      </mesh>
    </group>
  );
}

function BossProjectile({ projectile, paused }: { projectile: SurvivorProjectile; paused: boolean }) {
  const ref = useRef<THREE.Group>(null);
  const color = projectile.kind === 'boss' ? '#ff315d' : '#ffd166';
  useFrame((_, dt) => {
    if (!ref.current || paused) return;
    const blend = Math.min(1, dt * 18);
    ref.current.position.x += (projectile.x - ref.current.position.x) * blend;
    ref.current.position.z += (projectile.z - ref.current.position.z) * blend;
  });
  return (
    <group ref={ref} position={[projectile.x, 0.32, projectile.z]} userData={{ noRay: true }}>
      <mesh>
        <octahedronGeometry args={[0.17, 1]} />
        <meshBasicMaterial color={projectile.kind === 'boss' ? '#fff0d8' : '#fff8d2'} toneMapped={false} />
      </mesh>
      <mesh position={[-projectile.vx / 5.8 * 0.25, 0, -projectile.vz / 5.8 * 0.25]} rotation-y={-Math.atan2(projectile.vz, projectile.vx)}>
        <boxGeometry args={[0.55, 0.055, 0.055]} />
        <meshBasicMaterial color={color} transparent opacity={0.85} depthWrite={false} toneMapped={false} blending={THREE.AdditiveBlending} />
      </mesh>
    </group>
  );
}

function RunPlayer({ player, index, self }: { player: SurvivorPlayer; index: number; self: boolean }) {
  const style = SURVIVOR_STYLES[player.style];
  const ref = useRef<THREE.Group>(null);
  const levelRing = useRef<THREE.Mesh>(null);
  const levelRingMaterial = useRef<THREE.MeshBasicMaterial>(null);
  const hitRing = useRef<THREE.Mesh>(null);
  const hitRingMaterial = useRef<THREE.MeshBasicMaterial>(null);
  const previousLevel = useRef(player.level);
  const levelAt = useRef(0);
  useEffect(() => {
    if (player.level > previousLevel.current) levelAt.current = serverNow();
    previousLevel.current = player.level;
  }, [player.level]);
  useFrame((_, dt) => {
    if (!ref.current) return;
    const target = self ? get().selfAvatar : player;
    const k = self ? 1 : Math.min(1, dt * 10);
    ref.current.position.x += (target.x - ref.current.position.x) * k;
    ref.current.position.z += (target.z - ref.current.position.z) * k;
    if (levelRing.current && levelRingMaterial.current) {
      const age = serverNow() - levelAt.current;
      const progress = Math.max(0, Math.min(1, age / 850));
      levelRing.current.visible = levelAt.current > 0 && age >= 0 && age < 850;
      levelRing.current.scale.setScalar(0.36 + progress * 1.35);
      levelRingMaterial.current.opacity = Math.sin(progress * Math.PI) * 0.9;
    }
    if (hitRing.current && hitRingMaterial.current) {
      const age = serverNow() - player.hitAt;
      const flash = player.hitAt > 0 && age >= 0 && age < 300 ? 1 - age / 300 : 0;
      hitRing.current.visible = flash > 0;
      hitRing.current.scale.setScalar(0.48 + (1 - flash) * 0.55);
      hitRingMaterial.current.opacity = flash * 0.9;
    }
  });
  return (
    <group ref={ref} position={[player.x, 0, player.z]} userData={{ noRay: true }}>
      <mesh ref={levelRing} rotation-x={-Math.PI / 2} position-y={0.045} visible={false}>
        <ringGeometry args={[0.72, 1, 48]} />
        <meshBasicMaterial ref={levelRingMaterial} color="#ffe7a0" transparent opacity={0} depthWrite={false} toneMapped={false} blending={THREE.AdditiveBlending} />
      </mesh>
      <mesh ref={hitRing} rotation-x={-Math.PI / 2} position-y={0.052} visible={false}>
        <ringGeometry args={[0.72, 1, 40]} />
        <meshBasicMaterial ref={hitRingMaterial} color="#ff5577" transparent opacity={0} depthWrite={false} toneMapped={false} blending={THREE.AdditiveBlending} />
      </mesh>
      <mesh position-y={0.12} rotation-x={-Math.PI / 2}>
        <circleGeometry args={[0.34, 32]} />
        <meshBasicMaterial color={colorOf(player.id)} transparent opacity={0.7} />
      </mesh>
      <Cyl p={[0, 0.34, 0]} r={0.19} r2={0.16} h={0.44} color={player.alive ? (index === 0 ? '#ffe29a' : '#8ed9ff') : '#55515a'} />
      <mesh position-y={0.64}>
        <sphereGeometry args={[0.12, 12, 8]} />
        <meshStandardMaterial color={player.alive ? '#fff0d5' : '#777'} />
      </mesh>
      <Label text={`${style.mark} ${player.name} · Lv.${player.level}`} position={[0, 1.12, 0]} height={0.18} bg={player.alive ? 'rgba(55,28,55,.92)' : 'rgba(45,43,49,.9)'} />
    </group>
  );
}

export function SurvivorObjects() {
  const run = useStore((s) => s.survivors[s.session ?? '']);
  const selfId = useStore((s) => s.selfId);
  return (
    <>
      <JoinCircle />
      <StartAltar />
      <Label text={tr("ui535")} position={[0, 2.2, -8]} height={0.34} bg="rgba(48,24,52,.94)" />
      {Object.values(run?.players ?? {}).map((p, i) => <RunPlayer key={p.id} player={p} index={i} self={p.id === selfId} />)}
      {run?.enemies.map((e) => <Enemy key={e.id} enemy={e} paused={run.pausedAt != null} />)}
      {run?.enemies.filter((e) => e.kind === 'charger' && e.chargeTarget).map((e) => <ChargeTelegraph key={`${e.id}-charge`} enemy={e} pausedAt={run?.pausedAt ?? null} />)}
      {(run?.projectiles ?? []).map((projectile) => <BossProjectile key={projectile.id} projectile={projectile} paused={run?.pausedAt != null} />)}
      {(run?.effects ?? []).flatMap((effect) => effect.targets.map((target, index) => (
        <AttackTrace
          key={`${effect.id}:${index}`}
          effect={effect}
          target={target}
          showArea={index === 0}
          origin={effect.chain && index > 0 ? effect.targets[index - 1] : effect.from}
        />
      )))}
    </>
  );
}
