import { createRoot } from 'react-dom/client';
import { _roots } from '@react-three/fiber';
import { EMPTY_PRESENCE, ROOM_HALF, type Participant } from '../../shared/protocol.ts';
import type { AvatarState } from '../../shared/protocol.ts';
import type { WorldKind } from '../../shared/worlds.ts';
import { Map2D } from '../../client/src/world/Map2D.tsx';
import { get, set, useStore } from '../../client/src/store.ts';
import { stopWalk } from '../../client/src/walk.ts';
import '../../client/src/styles/world.css';

const root = createRoot(document.getElementById('root')!);

const self: Participant = {
  ...EMPTY_PRESENCE, id: 'map-test', name: 'Map test', session: null, mode: '2d',
  sharing: false, icon: null, avatar: null, bio: '', status: 'online', statusText: '', guest: true, username: null,
  pos: { x: 0, y: 0, z: 0, ry: 0 },
};
set({ selfId: self.id, participants: [self], voiceHeat: false });
let moves: { x: number; z: number }[] = [];
useStore.subscribe((state, previous) => {
  if (state.walk?.to && state.walk.to !== previous.walk?.to) moves.push({ ...state.walk.to });
});
const events: { type: string; id: number; target: string; button: number; buttons: number }[] = [];
for (const type of ['pointerdown', 'pointermove', 'pointerup', 'gotpointercapture', 'lostpointercapture', 'pointercancel']) {
  document.addEventListener(type, event => {
    const e = event as PointerEvent;
    events.push({ type, id: e.pointerId, target: (e.target as Element).tagName, button: e.button, buttons: e.buttons });
  }, true);
}
Object.assign(window, { mapTest: {
  reset: () => { stopWalk(); moves = []; events.length = 0; },
  snapshot: () => {
    const canvas = document.querySelector('canvas');
    const state = canvas && _roots.get(canvas)?.store.getState();
    const scene = state?.scene;
    const bodies: unknown[] = [];
    scene?.traverse(node => {
      if (node.userData.hitTarget) {
        let meshes = 0;
        node.traverse(child => { if (child.type === 'Mesh') meshes++; });
        bodies.push({ id: node.userData.hitTarget, position: node.position.toArray(), ry: node.rotation.y, meshes });
      }
    });
    return { moves, events, walk: get().walk, bodies, render: state?.gl.info.render };
  },
  floorTarget: (x: number, y: number) => {
    const floor = document.querySelector('.mapfloor')!;
    const p = new DOMPoint(x, y).matrixTransform(new DOMMatrix(getComputedStyle(floor).transform).inverse());
    const clamp = (v: number) => Math.max(-ROOM_HALF + .5, Math.min(ROOM_HALF - .5, v));
    return { x: clamp(p.x / p.w), z: clamp(p.y / p.w) };
  },
  interrupt: (type: 'pointercancel' | 'lostpointercapture') => {
    const down = events.findLast(e => e.type === 'pointerdown');
    const canvas = document.querySelector('canvas')!;
    if (!down || !canvas.hasPointerCapture(down.id)) throw new Error('Test pointer capture is missing');
    // 子のハンドラが伝播を止めても、Map2D までキャンセルが届く必要がある。
    canvas.addEventListener(type, e => e.stopPropagation(), { once: true });
    if (type === 'lostpointercapture') canvas.releasePointerCapture(down.id);
    else canvas.dispatchEvent(new PointerEvent(type, { bubbles: true, pointerId: down.id, isPrimary: true }));
  },
  capture: () => {
    const down = events.findLast(e => e.type === 'pointerdown');
    if (!down) throw new Error('Test pointer is not down');
    document.querySelector('canvas')!.setPointerCapture(down.id);
  },
  received: (participants: Participant[], avatars: Record<string, AvatarState>) => set({ participants, avatars, avatarIds: Object.keys(avatars) }),
  show: async (mode: '2d' | '3d', kind: WorldKind = 'room') => {
    const Component = mode === '2d' ? Map2D : (await import('../../client/src/world/Map3D.tsx')).Map3D;
    root.render(<Component key={`${mode}:${kind}`} kind={kind} />);
  },
} });
root.render(<Map2D kind="room" />);
