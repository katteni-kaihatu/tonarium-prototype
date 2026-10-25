import { useRef } from 'react';
import { useFrame } from '@react-three/fiber';
import * as THREE from 'three';
import { clampLog, towerHeightFromLog } from '../../../shared/antimatterLayout.ts';
import { useAdReducedMotion } from '../ad/useAdReducedMotion.ts';

// Keep the 3D machines recognisable as the reactors shown in the dimension cards.
const TIER_COLORS = ['#77ffe0', '#74caff', '#b297ff', '#ff8adf', '#ffad78', '#ffe478', '#aaff83', '#ffffff'];
const ORBIT_TILTS: [number, number, number][] = [
  [0.38, 0.42, 0.55], [-0.65, 0.85, -0.55], [0.85, -0.5, 0.2],
];

export interface DimensionReactor3DProps {
  tier: number;
  amountLog10: number;
  productionLog10: number;
  bought: number;
  locked: boolean;
  detail?: 'full' | 'simple';
}

/** A bounded mechanical pedestal and animated armillary reactor, with no extra lights. */
export function DimensionReactor3D({
  tier, amountLog10, productionLog10, bought, locked, detail = 'full',
}: DimensionReactor3DProps) {
  const reducedMotion = useAdReducedMotion();
  const outer = useRef<THREE.Group>(null);
  const orbitals = useRef<THREE.Group>(null);
  const crystal = useRef<THREE.Group>(null);
  const phase = useRef(tier * 0.63);
  const full = detail === 'full';
  const tierIndex = Math.min(7, Math.max(0, Math.floor(tier) - 1));
  const color = locked ? '#636d80' : TIER_COLORS[tierIndex];
  const h = locked ? 0.5 : towerHeightFromLog(amountLog10);
  const sides = full ? 64 : 24;
  const curveSegments = full ? 96 : 32;
  const tubeSegments = full ? 10 : 5;
  const satelliteCount = locked ? 0 : tierIndex + 1;
  const energy = Math.min(clampLog(productionLog10), 40) / 40;
  const speed = 0.18 + energy * 0.4 + Math.min(clampLog(bought), 80) * 0.004;
  const glow = locked ? 0.12 : 0.8 + energy * 0.6;

  useFrame((_, delta) => {
    if (locked || reducedMotion) return;
    // Bound the step after a background tab resumes; rotations never jump a whole orbit.
    phase.current = (phase.current + Math.min(delta, 0.05) * speed) % (Math.PI * 20);
    const t = phase.current;
    if (outer.current) {
      outer.current.rotation.set(Math.sin(t * 0.4) * 0.16, t * 0.24, t * 0.7);
    }
    if (orbitals.current) {
      orbitals.current.rotation.set(t * 0.36, t * -0.5, t * 0.22);
      orbitals.current.children.forEach((orbit, i) => {
        // A nested rotor spins satellites in their own tilted orbital plane.
        const rotor = orbit.children[0];
        if (rotor) rotor.rotation.z = t * (i % 2 === 0 ? 1 : -1) * (0.9 + i * 0.18);
      });
    }
    if (crystal.current) {
      crystal.current.rotation.y = t * -0.65;
      crystal.current.position.y = Math.sin(t * 1.8) * 0.025;
    }
  });

  return (
    <group>
      {/* Smooth stepped machining and inset light channels keep the old collision radius. */}
      <mesh position-y={0.09}>
        <cylinderGeometry args={[0.58, 0.65, 0.18, sides]} />
        <meshStandardMaterial color="#151e32" metalness={0.7} roughness={0.32} />
      </mesh>
      <mesh position-y={0.19}>
        <cylinderGeometry args={[0.5, 0.58, 0.08, sides]} />
        <meshStandardMaterial color="#33465a" metalness={0.8} roughness={0.25} />
      </mesh>
      <mesh position-y={h / 2 + 0.14}>
        <cylinderGeometry args={[0.27, 0.37, Math.max(0.2, h - 0.22), sides]} />
        <meshStandardMaterial color="#18263b" metalness={0.65} roughness={0.28} />
      </mesh>
      {full && Array.from({ length: 6 }, (_, i) => {
        const a = i / 6 * Math.PI * 2;
        return (
          <group key={i} rotation-y={a}>
            <mesh position={[0.36, h / 2 + 0.14, 0]}>
              <cylinderGeometry args={[0.022, 0.028, Math.max(0.2, h - 0.24), 10]} />
              <meshStandardMaterial color="#526779" metalness={0.85} roughness={0.2} />
            </mesh>
            <mesh position={[0.385, h / 2 + 0.14, 0]} rotation-y={Math.PI / 2}>
              <boxGeometry args={[0.018, Math.max(0.1, h - 0.4), 0.025]} />
              <meshStandardMaterial color={color} emissive={color} emissiveIntensity={glow * 0.65} toneMapped={false} />
            </mesh>
          </group>
        );
      })}
      {[0.23, h - 0.08].map((y, i) => (
        <mesh key={i} position-y={y} rotation-x={Math.PI / 2}>
          <torusGeometry args={[i === 0 ? 0.48 : 0.4, 0.018, tubeSegments, curveSegments]} />
          <meshStandardMaterial color={color} emissive={color} emissiveIntensity={glow} toneMapped={false} />
        </mesh>
      ))}
      <mesh position-y={h - 0.05}>
        <cylinderGeometry args={[0.43, 0.35, 0.14, sides]} />
        <meshStandardMaterial color="#344a60" metalness={0.85} roughness={0.2} />
      </mesh>
      <mesh position-y={h + 0.035} rotation-x={-Math.PI / 2}>
        <ringGeometry args={[0.22, 0.35, sides]} />
        <meshBasicMaterial color={color} transparent opacity={locked ? 0.12 : 0.5} side={THREE.DoubleSide} toneMapped={false} />
      </mesh>

      <group position-y={h + 0.55}>
        {/* Outer annulus and broken luminous track repeat the card's circular motif. */}
        <group ref={outer} name={`ad-dimension-${tier}-outer`} rotation={[0.08, tier * 0.12, tier * 0.3]}>
          <mesh>
            <torusGeometry args={[0.59, 0.028, tubeSegments, curveSegments]} />
            <meshStandardMaterial color="#30485d" metalness={0.85} roughness={0.23} />
          </mesh>
          {Array.from({ length: full ? 4 : 2 }, (_, i) => (
            <mesh key={i} rotation-z={i * Math.PI / 2 + 0.12}>
              <torusGeometry args={[0.621, 0.012, full ? 8 : 4, full ? 24 : 12, Math.PI * 0.39]} />
              <meshStandardMaterial color={color} emissive={color} emissiveIntensity={glow * 1.4} toneMapped={false} />
            </mesh>
          ))}
          {!locked && [0, Math.PI].map((angle, i) => (
            <mesh key={angle} position={[Math.sin(angle) * 0.59, Math.cos(angle) * 0.59, 0]}>
              <sphereGeometry args={[i === 0 ? 0.047 : 0.028, full ? 24 : 12, full ? 16 : 8]} />
              <meshStandardMaterial color={i === 0 ? color : '#ffffff'} emissive={color} emissiveIntensity={glow * 1.6} toneMapped={false} />
            </mesh>
          ))}
        </group>

        <group ref={orbitals} name={`ad-dimension-${tier}-orbitals`} rotation={[0.2, tier * 0.2, 0.15]}>
          {ORBIT_TILTS.slice(0, full ? 3 : 2).map((rotation, orbitIndex) => (
            <group key={orbitIndex} rotation={rotation}>
              <group rotation-z={tier * 0.45 + orbitIndex * 0.8}>
                <mesh scale={[1, 0.7, 1]}>
                  <torusGeometry args={[0.44, 0.011, tubeSegments, curveSegments]} />
                  <meshStandardMaterial color={color} emissive={color} emissiveIntensity={glow} toneMapped={false} />
                </mesh>
                {Array.from({ length: satelliteCount }, (_, i) => {
                  if (i % (full ? 3 : 2) !== orbitIndex) return null;
                  const a = i / satelliteCount * Math.PI * 2;
                  return (
                    <mesh key={i} position={[Math.cos(a) * 0.44, Math.sin(a) * 0.308, 0]}>
                      <sphereGeometry args={[0.03, full ? 24 : 12, full ? 16 : 8]} />
                      <meshStandardMaterial color={color} emissive={color} emissiveIntensity={glow * 1.6} toneMapped={false} />
                    </mesh>
                  );
                })}
              </group>
            </group>
          ))}
        </group>

        <group ref={crystal} rotation-y={Math.PI / 4}>
          <mesh scale={[0.75, 1.25, 0.75]}>
            <octahedronGeometry args={[0.22, full ? 1 : 0]} />
            <meshStandardMaterial color={color} emissive={color} emissiveIntensity={glow * 0.55} metalness={0.45} roughness={0.13} />
          </mesh>
          <mesh scale={[0.83, 1.3, 0.83]}>
            <octahedronGeometry args={[0.25, 0]} />
            <meshBasicMaterial color={color} wireframe transparent opacity={locked ? 0.28 : 0.7} toneMapped={false} />
          </mesh>
        </group>
      </group>
    </group>
  );
}
