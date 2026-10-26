import type { Solid } from './worlds.ts';
import type { SystemView } from './system-types.ts';

export function systemSolids(view?: SystemView): Solid[] {
  if (!view) return [];
  return view.map.objects.filter(o => o.solid).map(o => {
    const [x, y, z] = view.objects[o.id]?.position ?? o.position;
    const [w, h, d] = o.size ?? [1, 1, 1];
    const c = Math.abs(Math.cos(o.rotation ?? 0)), s = Math.abs(Math.sin(o.rotation ?? 0));
    return { x, z, w: w * c + d * s, d: d * c + w * s, y0: y, y1: y + h };
  });
}

export function systemSeat(view: SystemView | undefined, user: string) {
  const seatId = Object.entries(view?.seats ?? {}).find(([, occupant]) => occupant === user)?.[0];
  const object = view?.map.objects.find(o => o.id === seatId);
  if (!object) return undefined;
  const [x, y, z] = view!.objects[object.id]?.position ?? object.position;
  const [ox, oy, oz] = object.seatOffset ?? [0, 0.45, 0];
  const ry = object.rotation ?? 0;
  return { id: object.id, x: x + ox * Math.cos(ry) + oz * Math.sin(ry), y: y + oy, z: z - ox * Math.sin(ry) + oz * Math.cos(ry), ry };
}
