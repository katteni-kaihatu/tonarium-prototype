import { useEffect, useMemo, useRef } from 'react';
import { useFrame } from '@react-three/fiber';
import * as THREE from 'three';
import { clampLog, ringSpeedFromBought } from '../../../shared/antimatterLayout.ts';
import { useAdReducedMotion } from '../ad/useAdReducedMotion.ts';

export const MAX_CORE_PARTICLES = 24576;

export function coreParticleCount(log10: number): number {
  return Math.min(MAX_CORE_PARTICLES, Math.round(2048 + clampLog(log10) * 1024));
}

/** Radians per second; the accumulated amount drives both density and motion. */
export function coreParticleSpeed(log10: number): number {
  return 0.8 + Math.min(clampLog(log10), 24) * 0.24;
}

export function coreParticleRadius(log10: number): number {
  return 2 + Math.min(clampLog(log10) / 20, 1) * 2.2;
}

export function coreParticleHeight(log10: number): number {
  return 2.6 + Math.min(clampLog(log10) / 20, 1) * 0.5;
}

const vertexShader = `
  attribute vec4 aSeed;
  uniform float uPhase;
  uniform float uRadius;
  uniform float uHeight;
  uniform float uViewportHeight;
  uniform float uPixelRatio;
  varying vec3 vColor;
  varying float vAlpha;
  const float TAU = 6.28318530718;

  void main() {
    float motion = uPhase * (0.65 + aSeed.y * 0.7);
    float angle = aSeed.x * TAU + motion;
    vec3 p;
    if (aSeed.w < 0.45) {
      // A flared rising swirl crosses the disk without filling a narrow cylinder.
      float rise = fract(aSeed.z + motion * 0.075);
      float radius = uRadius * (0.15 + aSeed.y * 0.5
        + sin(rise * 3.14159265359) * 0.24);
      angle += rise * TAU * (1.4 + aSeed.w);
      p = vec3(cos(angle) * radius, 0.2 + rise * (uHeight - 0.2), sin(angle) * radius);
      vAlpha = (0.28 + aSeed.y * 0.5)
        * smoothstep(0.0, 0.08, rise) * smoothstep(0.0, 0.1, 1.0 - rise);
    } else {
      // Four broad spiral arms share a rotation so their shape stays readable.
      float radial = sqrt(aSeed.z);
      float radius = uRadius * (0.12 + radial * 0.88);
      angle = floor(aSeed.x * 4.0) * TAU / 4.0 + uPhase * 0.55
        + radial * TAU * 0.75 + (aSeed.y - 0.5) * 0.48;
      p = vec3(cos(angle) * radius,
        0.65 + sin(angle + radial * TAU) * radial * 0.28
          + (aSeed.y - 0.5) * 0.3,
        sin(angle) * radius);
      vAlpha = 0.32 + aSeed.y * 0.4;
    }
    vColor = mix(vec3(0.26, 0.58, 1.0), vec3(0.6, 0.96, 1.0), aSeed.z);
    if (aSeed.w > 0.9) vColor = vec3(0.68, 0.5, 1.0);
    vec4 mvPosition = modelViewMatrix * vec4(p, 1.0);
    gl_Position = projectionMatrix * mvPosition;
    gl_PointSize = clamp((0.018 + aSeed.w * 0.024) * uViewportHeight
      * projectionMatrix[1][1] * 0.5 / max(0.1, -mvPosition.z),
      uPixelRatio, 16.0 * uPixelRatio);
  }
`;

const fragmentShader = `
  varying vec3 vColor;
  varying float vAlpha;
  void main() {
    float radius = length(gl_PointCoord - vec2(0.5)) * 2.0;
    if (radius > 1.0) discard;
    float glow = pow(1.0 - radius, 1.5);
    gl_FragColor = vec4(mix(vColor, vec3(1.0), glow * 0.4), glow * vAlpha);
  }
`;

/** The GPU animates a fixed seeded buffer with smoothly growing bounds. */
export function CoreFountain({ log10, bought }: { log10: number; bought: number }) {
  const reducedMotion = useAdReducedMotion();
  const ring = useRef<THREE.Group>(null);
  const speedRef = useRef(coreParticleSpeed(log10));
  const count = coreParticleCount(log10);
  const speed = coreParticleSpeed(log10);
  const radius = coreParticleRadius(log10);
  const height = coreParticleHeight(log10);
  const { geometry, material } = useMemo(() => {
    const geometry = new THREE.BufferGeometry();
    const seeds = new Float32Array(MAX_CORE_PARTICLES * 4);
    let state = 0x5a17c0de;
    for (let i = 0; i < seeds.length; i++) {
      state = (Math.imul(state, 1664525) + 1013904223) >>> 0;
      seeds[i] = state / 4294967296;
    }
    geometry.setAttribute('position', new THREE.BufferAttribute(new Float32Array(MAX_CORE_PARTICLES * 3), 3));
    geometry.setAttribute('aSeed', new THREE.BufferAttribute(seeds, 4));
    geometry.setDrawRange(0, 0);
    const material = new THREE.ShaderMaterial({
      uniforms: {
        uPhase: { value: 0 },
        uRadius: { value: 2 },
        uHeight: { value: 2.6 },
        uViewportHeight: { value: 1080 },
        uPixelRatio: { value: 1 },
      },
      vertexShader, fragmentShader,
      transparent: true, depthWrite: false, blending: THREE.AdditiveBlending,
      toneMapped: false,
    });
    return { geometry, material };
  }, []);

  useEffect(() => () => {
    geometry.dispose();
    material.dispose();
  }, [geometry, material]);

  useEffect(() => { geometry.setDrawRange(0, count); }, [geometry, count]);

  useEffect(() => {
    if (reducedMotion) {
      material.uniforms.uRadius.value = radius;
      material.uniforms.uHeight.value = height;
    }
  }, [material, radius, height, reducedMotion]);

  useFrame(({ size, gl }, delta) => {
    const dt = Math.min(delta, 0.05);
    // Integrating the smoothed speed prevents phase jumps on game snapshots.
    if (!reducedMotion) {
      speedRef.current = THREE.MathUtils.damp(speedRef.current, speed, 4, dt);
      material.uniforms.uRadius.value = THREE.MathUtils.damp(material.uniforms.uRadius.value, radius, 4, dt);
      material.uniforms.uHeight.value = THREE.MathUtils.damp(material.uniforms.uHeight.value, height, 4, dt);
      material.uniforms.uPhase.value += dt * speedRef.current;
      if (ring.current) ring.current.rotation.y += dt * ringSpeedFromBought(bought);
    }
    const pixelRatio = gl.getPixelRatio();
    material.uniforms.uViewportHeight.value = size.height * pixelRatio;
    material.uniforms.uPixelRatio.value = pixelRatio;
  });

  return (
    <group userData={{ noRay: true }}>
      <mesh position-y={0.5}>
        <sphereGeometry args={[0.55, 24, 16]} />
        <meshStandardMaterial color="#7fd8ff" emissive="#2a6cff" emissiveIntensity={1.4} roughness={0.3} />
      </mesh>
      <group ref={ring} position-y={0.5}>
        <mesh rotation-x={Math.PI / 2}>
          <torusGeometry args={[1.3, 0.05, 8, 48]} />
          <meshBasicMaterial color="#9cf0ff" transparent opacity={0.9} toneMapped={false} />
        </mesh>
      </group>
      <points
        name="ad-core-particles" geometry={geometry} material={material} frustumCulled={false}
        userData={{ noRay: true, particleCount: count, speed, radius, height, reducedMotion }}
      />
    </group>
  );
}
