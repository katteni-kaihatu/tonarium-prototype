import type { VehicleState } from '../../../shared/vehicle.ts';
import { get } from '../store.ts';
import { itemAction } from '../items/actions.ts';
import { carrying } from './interact.ts';
export { moveBike } from './bikePhysics.ts';

export type BikeItem = Extract<ReturnType<typeof get>['items'][string], { kind: 'bike' }>;
export const riddenBike = () => Object.values(get().items).find((it): it is BikeItem => it.kind === 'bike' && it.rider === get().selfId);
export const bikeDisplay = new Map<string, VehicleState>();

export function requestBikeMount(id: string) {
  const s = get();
  const it = s.items[id];
  if (s.mode !== '3d' || it?.kind !== 'bike' || it.rider || riddenBike() || carrying.current || s.selfAvatar.ride
    || Math.hypot(s.selfAvatar.x - it.x, s.selfAvatar.z - it.z) > 3 || Math.abs(s.selfAvatar.y ?? 0) > 0.3) return;
  itemAction(id, { a: 'bikeMount' });
}
