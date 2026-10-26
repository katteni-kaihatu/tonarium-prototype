import { useFrame } from '@react-three/fiber';
import type * as THREE from 'three';
import type { Item } from '../../../shared/items.ts';
import { removeItem } from '../items/actions.ts';
import { carrying, type Interactable } from './interact.ts';

export function useFollow(ref: React.RefObject<THREE.Group | null>, id: string, x: number, z: number, ry: number, y = 0, scale = 1) {
  useFrame((_, dt) => {
    const g = ref.current;
    if (!g) return;
    const c = carrying.current?.id === id ? carrying.current : null;
    const k = c ? 1 : Math.min(1, dt * 12);
    g.position.x += ((c?.x ?? x) - g.position.x) * k;
    g.position.z += ((c?.z ?? z) - g.position.z) * k;
    g.position.y += ((c?.y ?? y) - g.position.y) * k;
    g.scale.setScalar(c?.scale ?? scale);
    let r = (c?.ry ?? ry) - g.rotation.y;
    r = Math.atan2(Math.sin(r), Math.cos(r));
    g.rotation.y += r * k;
  });
}

export const removable = (item: Item): Interactable => ({
  carry: item.id,
  remove: () => removeItem(item.id),
});

