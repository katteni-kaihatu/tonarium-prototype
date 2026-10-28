export function panelCoordinates(rect: { left: number; top: number; width: number; height: number }, x: number, y: number, width: number, height: number) {
  return [((x - rect.left) / Math.max(1, rect.width)) * width, ((y - rect.top) / Math.max(1, rect.height)) * height] as const;
}
