import { useEffect, useMemo } from 'react';
import { useFrame } from '@react-three/fiber';
import * as THREE from 'three';
import {
  ANTIMATTER_CORE, ANTIMATTER_TOWERS, towerHeightFromLog,
  type AdDimensionView, type AdLabSnapshot,
} from '../../../shared/antimatterLayout.ts';
import { useAdReducedMotion } from '../ad/useAdReducedMotion.ts';

export const MAX_DIMENSION_PRODUCTION_PARTICLES = 4096;
const TIER_COLORS = ['#77ffe0', '#74caff', '#b297ff', '#ff8adf', '#ffad78', '#ffe478', '#aaff83', '#ffffff'];

/** Logarithmic density keeps very large AD production readable and bounded. */
export function dimensionProductionParticleCount(view: Pick<AdDimensionView, 'producing' | 'locked' | 'productionLog10'>): number {
  if (view.locked || !view.producing) return 0;
  const log = Number.isFinite(view.productionLog10) ? Math.max(0, view.productionLog10) : 0;
  return Math.min(MAX_DIMENSION_PRODUCTION_PARTICLES, Math.round(128 + log * 256));
}

const vertexShader = `
  attribute vec4 aSeed;
  uniform float uTime;
  uniform float uViewportHeight;
  uniform float uPixelRatio;
  uniform vec3 uFrom;
  uniform vec3 uTo;
  varying float vAlpha;
  const float TAU = 6.28318530718;
  void main() {
    float speed = 0.65 + aSeed.y * 0.7;
    float phase = fract(aSeed.x + uTime * 0.2 * speed);
    float angle = aSeed.z * TAU + uTime * speed * 1.8;
    vec3 p;
    if (aSeed.w < 0.3) {
      // Rotate circular orbits into seeded planes to fill a spherical shell.
      float radius = 0.55 + aSeed.y * 0.55;
      float orbitAngle = (aSeed.w / 0.3) * TAU + uTime * speed * 1.8;
      float node = aSeed.x * TAU;
      float cosInclination = aSeed.z * 2.0 - 1.0;
      float sinInclination = sqrt(max(0.0, 1.0 - cosInclination * cosInclination));
      vec3 orbit = vec3(cos(orbitAngle), sin(orbitAngle) * cosInclination, sin(orbitAngle) * sinInclination) * radius;
      p = uFrom + vec3(
        orbit.x * cos(node) - orbit.y * sin(node),
        orbit.x * sin(node) + orbit.y * cos(node),
        orbit.z
      );
      vAlpha = 0.38 + aSeed.z * 0.4;
    } else {
      // High tiers feed the previous tier; tier 1 feeds the antimatter core.
      vec3 direction = normalize(uTo - uFrom);
      vec3 sideways = normalize(vec3(direction.z, 0.0, -direction.x));
      float radius = (0.035 + aSeed.y * 0.2) * sin(phase * 3.14159265);
      p = mix(uFrom, uTo, phase);
      p.y += sin(phase * 3.14159265) * 0.55;
      p += sideways * cos(angle + phase * TAU * 2.0) * radius;
      p.y += sin(angle + phase * TAU * 2.0) * radius;
      vAlpha = smoothstep(0.0, 0.08, phase) * smoothstep(0.0, 0.12, 1.0 - phase) * 0.8;
    }
    vec4 mvPosition = modelViewMatrix * vec4(p, 1.0);
    gl_Position = projectionMatrix * mvPosition;
    gl_PointSize = clamp((0.018 + aSeed.z * 0.015) * uViewportHeight / max(0.1, -mvPosition.z), uPixelRatio, 12.0 * uPixelRatio);
  }
`;

const fragmentShader = `
  uniform vec3 uColor;
  varying float vAlpha;
  void main() {
    float radius = length(gl_PointCoord - vec2(0.5)) * 2.0;
    if (radius > 1.0) discard;
    float glow = pow(1.0 - radius, 1.4);
    gl_FragColor = vec4(mix(uColor, vec3(1.0), glow * 0.35), glow * vAlpha);
  }
`;

function DimensionProductionStream({ view, target }: { view: AdDimensionView; target?: AdDimensionView }) {
  const reducedMotion = useAdReducedMotion();
  const tower = ANTIMATTER_TOWERS[view.tier - 1];
  const destination = target ? ANTIMATTER_TOWERS[target.tier - 1] : ANTIMATTER_CORE;
  const count = dimensionProductionParticleCount(view);
  const { geometry, material } = useMemo(() => {
    const geometry = new THREE.BufferGeometry();
    const seeds = new Float32Array(MAX_DIMENSION_PRODUCTION_PARTICLES * 4);
    const hash = (n: number) => {
      const value = Math.sin(n * 127.1 + 311.7) * 43758.5453123;
      return value - Math.floor(value);
    };
    for (let i = 0; i < seeds.length; i++) seeds[i] = hash(i + view.tier * 16384);
    geometry.setAttribute('position', new THREE.BufferAttribute(new Float32Array(MAX_DIMENSION_PRODUCTION_PARTICLES * 3), 3));
    geometry.setAttribute('aSeed', new THREE.BufferAttribute(seeds, 4));
    geometry.setDrawRange(0, 0);
    const material = new THREE.ShaderMaterial({
      uniforms: {
        uTime: { value: view.tier * 0.73 },
        uViewportHeight: { value: 1080 },
        uPixelRatio: { value: 1 },
        uFrom: { value: new THREE.Vector3() },
        uTo: { value: new THREE.Vector3() },
        uColor: { value: new THREE.Color(TIER_COLORS[view.tier - 1]) },
      },
      vertexShader, fragmentShader,
      transparent: true, depthWrite: false, blending: THREE.AdditiveBlending,
      toneMapped: false,
    });
    return { geometry, material };
  }, [view.tier]);

  useEffect(() => () => {
    geometry.dispose();
    material.dispose();
  }, [geometry, material]);

  useEffect(() => {
    geometry.setDrawRange(0, count);
    material.uniforms.uFrom.value.set(tower.x, towerHeightFromLog(view.amountLog10) + 0.55, tower.z);
    material.uniforms.uTo.value.set(destination.x, target ? towerHeightFromLog(target.amountLog10) + 0.55 : 0.65, destination.z);
  }, [geometry, material, count, tower, destination, view.amountLog10, target?.amountLog10]);

  useFrame(({ size, gl }, delta) => {
    // No CPU particle loop or allocation as the 250 ms game snapshots advance.
    if (!reducedMotion && count > 0) material.uniforms.uTime.value += Math.min(delta, 0.05);
    const pixelRatio = gl.getPixelRatio();
    material.uniforms.uViewportHeight.value = size.height * pixelRatio;
    material.uniforms.uPixelRatio.value = pixelRatio;
  });

  return (
    <points
      name={`ad-dimension-${view.tier}-production-particles`}
      geometry={geometry} material={material} frustumCulled={false}
      userData={{ noRay: true, producing: view.producing, particleCount: count, localOrbitRadius: [0.55, 1.1] }}
    />
  );
}

/** World-space streams live beside the towers, so lab origins are applied once. */
export function DimensionProductionParticles({ snapshot }: { snapshot: AdLabSnapshot }) {
  return (
    <group name="ad-dimension-production-streams" userData={{ noRay: true }}>
      {snapshot.dimensions.map((view, i) => (
        <DimensionProductionStream key={view.tier} view={view} target={i > 0 ? snapshot.dimensions[i - 1] : undefined} />
      ))}
    </group>
  );
}
