import { useRef } from 'react';
import { useFrame } from '@react-three/fiber';
import type { Group } from 'three';
import { EMOTES } from '../i18n/static.ts';
import { type ActiveEmote } from '../../../shared/emotes.ts';
import { useEmote, useReducedMotion } from '../emotes.ts';
import { Label } from './Label.tsx';

function Reaction({ emote, portrait }: { emote: ActiveEmote; portrait: boolean }) {
  const ref = useRef<Group>(null);
  const reduced = useReducedMotion();
  const info = EMOTES[emote.id];
  const centerX = portrait && emote.id === 'fall' && !reduced ? 0.45 : 0;
  const captionY = !portrait ? 1.95 : reduced ? 1.17 : emote.id === 'fall' ? 0.85 : emote.id === 'hop' ? 1.5 : 1.32;
  const particleY = portrait ? captionY - 0.3 : 1.4;
  useFrame(() => {
    if (!ref.current || reduced) return;
    const t = (performance.now() - emote.started) / 1000;
    ref.current.position.y = Math.sin(t * 4) * 0.06;
    ref.current.children.forEach((child, i) => {
      child.position.y = particleY + Math.sin(t * 5 + i * 1.6) * 0.15;
      child.position.x = centerX + Math.cos(t * 1.6 + i * 1.6) * (portrait ? 0.6 : 0.65);
      child.position.z = Math.sin(t * 1.6 + i * 1.6) * 0.3;
    });
  });
  return <group userData={{ noRay: true }}>
    <Label text={info.caption} position={[centerX, captionY, 0]} height={portrait ? reduced ? 0.065 : 0.12 : 0.25} bg={info.tint} fg={info.color} />
    <group ref={ref}>{[0, 1, 2, 3].map((i) => <Label key={i} text={info.particles} position={[centerX + (i - 1.5) * 0.35, particleY, 0]} height={portrait ? 0.1 : 0.2} fg={info.color} bg="rgba(0,0,0,0)" />)}</group>
  </group>;
}

export function Emote3D({ id, portrait = false }: { id: string; portrait?: boolean }) {
  const emote = useEmote(id);
  return emote ? <Reaction key={emote.at} emote={emote} portrait={portrait} /> : null;
}
