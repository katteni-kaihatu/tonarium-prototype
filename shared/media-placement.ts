export const MEDIA_PLACEMENT = { distance: 2.2, minDistance: 0.5, maxDistance: 20, minScale: 0.1, maxScale: 10, minY: -100, maxY: 100 } as const;

const bounded = (value: number | undefined, fallback: number, min: number, max: number) =>
  Number.isFinite(value) ? Math.max(min, Math.min(max, value!)) : fallback;

export function mediaTransform(value: { y?: number; scale?: number }) {
  return {
    y: bounded(value.y, 1.6, MEDIA_PLACEMENT.minY, MEDIA_PLACEMENT.maxY),
    scale: bounded(value.scale, 1, MEDIA_PLACEMENT.minScale, MEDIA_PLACEMENT.maxScale),
  };
}

export function boardSize(w: number, h: number): [number, number] {
  const ratio = w / h;
  return ratio > 1.8 / 1.3 ? [1.8, 1.8 / ratio] : [1.3 * ratio, 1.3];
}

export function adjustMediaPlacement(value: { distance: number; scale: number }, delta: number, shift: boolean) {
  if (!Number.isFinite(delta) || delta === 0) return;
  if (shift) value.scale = bounded(value.scale * Math.exp(-Math.sign(delta) * 0.1), 1, MEDIA_PLACEMENT.minScale, MEDIA_PLACEMENT.maxScale);
  else value.distance = bounded(value.distance + Math.sign(delta) * 0.25, MEDIA_PLACEMENT.distance, MEDIA_PLACEMENT.minDistance, MEDIA_PLACEMENT.maxDistance);
}

export function mediaPosition(origin: { x: number; y: number; z: number }, direction: { x: number; y: number; z: number }, distance: number) {
  return { x: origin.x + direction.x * distance, y: origin.y + direction.y * distance, z: origin.z + direction.z * distance };
}
