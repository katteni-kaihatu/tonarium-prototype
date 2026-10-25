import { useEffect, useMemo, useRef } from 'react';
import { useFrame } from '@react-three/fiber';
import * as THREE from 'three';
import { ANTIMATTER_CORE, ANTIMATTER_TOWERS, towerHeightFromLog, type AdLabSnapshot } from '../../../shared/antimatterLayout.ts';
import { subscribeAdFeedback } from '../ad/feedback.ts';
import { useAdReducedMotion } from '../ad/useAdReducedMotion.ts';

const PARTICLE_LIMIT = 19_200;
const SUCCESS_KINDS = new Set(['purchase', 'tickspeed', 'boost', 'galaxy', 'sacrifice', 'crunch']);

/** One reused GPU pool: only successful actions upload particle data; motion runs in the shader. */
export function AdPurchaseParticles3D({ snapshot }: { snapshot: AdLabSnapshot }) {
  const latest = useRef(snapshot);
  useEffect(() => { latest.current = snapshot; }, [snapshot]);
  const reduced = useAdReducedMotion();
  const system = useMemo(() => {
    const geometry = new THREE.BufferGeometry();
    const positions = new Float32Array(PARTICLE_LIMIT * 3);
    const colors = new Float32Array(PARTICLE_LIMIT * 3);
    const velocity = new Float32Array(PARTICLE_LIMIT * 3);
    const timing = new Float32Array(PARTICLE_LIMIT * 2);
    const sizes = new Float32Array(PARTICLE_LIMIT);
    for (const [name, values, width] of [
      ['position', positions, 3], ['color', colors, 3], ['aVelocity', velocity, 3],
      ['aTiming', timing, 2], ['aSize', sizes, 1],
    ] as const) {
      geometry.setAttribute(name, new THREE.BufferAttribute(values, width).setUsage(THREE.DynamicDrawUsage));
    }
    geometry.setDrawRange(0, 0);
    const material = new THREE.ShaderMaterial({
      uniforms: { uTime: { value: 0 }, uPixelScale: { value: 1 } },
      vertexColors: true, transparent: true, depthTest: true, depthWrite: false,
      blending: THREE.AdditiveBlending, toneMapped: false,
      vertexShader: `
        attribute vec3 aVelocity;
        attribute vec2 aTiming;
        attribute float aSize;
        uniform float uTime;
        uniform float uPixelScale;
        varying vec3 vColor;
        varying float vFade;
        void main() {
          float age = max(0.0, uTime - aTiming.x);
          float life = max(aTiming.y, 0.001);
          vFade = aTiming.y > 0.0 && age < life ? pow(1.0 - age / life, 1.4) : 0.0;
          vColor = color;
          vec3 displaced = position + aVelocity * age;
          displaced.y -= 0.9 * age * age;
          vec4 viewPosition = modelViewMatrix * vec4(displaced, 1.0);
          gl_Position = projectionMatrix * viewPosition;
          gl_PointSize = vFade > 0.0 ? clamp(aSize * uPixelScale / max(0.01, -viewPosition.z), 1.0, 48.0) : 0.0;
        }
      `,
      fragmentShader: `
        varying vec3 vColor;
        varying float vFade;
        void main() {
          float radius = length(gl_PointCoord - vec2(0.5)) * 2.0;
          float alpha = (1.0 - smoothstep(0.15, 1.0, radius)) * vFade * 0.65;
          if (alpha < 0.01) discard;
          gl_FragColor = vec4(vColor, alpha);
        }
      `,
    });
    return { geometry, material, positions, colors, velocity, timing, sizes, cursor: 0, populated: 0, endsAt: 0 };
  }, []);
  useEffect(() => () => { system.geometry.dispose(); system.material.dispose(); }, [system]);
  useEffect(() => {
    system.timing.fill(0);
    system.geometry.getAttribute('aTiming').needsUpdate = true;
    system.populated = 0;
    system.cursor = 0;
    system.endsAt = 0;
    system.geometry.setDrawRange(0, 0);
    if (reduced) return;
    return subscribeAdFeedback((event) => {
      if (!SUCCESS_KINDS.has(event.kind)) return;
      const tier = event.kind === 'purchase' ? event.tier : undefined;
      const tower = Number.isInteger(tier) && tier! >= 1 && tier! <= 8 ? ANTIMATTER_TOWERS[tier! - 1] : undefined;
      const x = tower?.x ?? ANTIMATTER_CORE.x;
      const z = tower?.z ?? ANTIMATTER_CORE.z;
      const y = tower ? towerHeightFromLog(latest.current.dimensions[tier! - 1].amountLog10) + 0.55 : 0.65;
      const count = tower ? 2_400 : 3_600;
      const purple = event.kind === 'galaxy' || event.kind === 'crunch';
      const now = performance.now() / 1000;
      for (let i = 0; i < count; i++) {
        const index = system.cursor;
        system.cursor = (index + 1) % PARTICLE_LIMIT;
        const offset = index * 3;
        const angle = Math.random() * Math.PI * 2;
        const speed = 0.2 + Math.sqrt(Math.random()) * 1.7;
        // A little initial volume keeps the dense burst legible around the source.
        const spread = Math.random() * 0.18;
        system.positions[offset] = x + Math.cos(angle) * spread;
        system.positions[offset + 1] = y + (Math.random() - 0.5) * 0.2;
        system.positions[offset + 2] = z + Math.sin(angle) * spread;
        system.velocity[offset] = Math.cos(angle) * speed;
        system.velocity[offset + 1] = 0.35 + Math.random() * 1.55;
        system.velocity[offset + 2] = Math.sin(angle) * speed;
        system.colors[offset] = purple ? 0.85 : 0.4;
        system.colors[offset + 1] = purple ? 0.45 : 1;
        system.colors[offset + 2] = 1;
        system.timing[index * 2] = now;
        system.timing[index * 2 + 1] = 0.45 + Math.random() * 0.45;
        system.sizes[index] = 0.025 + Math.random() * 0.03;
      }
      system.populated = Math.min(PARTICLE_LIMIT, system.populated + count);
      system.endsAt = now + 0.9;
      system.material.uniforms.uTime.value = now;
      system.geometry.setDrawRange(0, system.populated);
      for (const attribute of Object.values(system.geometry.attributes)) attribute.needsUpdate = true;
    });
  }, [reduced, system]);
  useFrame(({ gl, size, camera }) => {
    if (reduced || system.endsAt === 0) return;
    const now = performance.now() / 1000;
    system.material.uniforms.uTime.value = now;
    system.material.uniforms.uPixelScale.value = size.height * gl.getPixelRatio() * camera.projectionMatrix.elements[5] / 2;
    if (now >= system.endsAt) {
      system.geometry.setDrawRange(0, 0);
      system.endsAt = 0;
    }
  });
  return <points geometry={system.geometry} material={system.material} frustumCulled={false} userData={{ noRay: true }} />;
}
