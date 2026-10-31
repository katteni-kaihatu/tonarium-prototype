interface Bounds { left: number; top: number; right: number; bottom: number }
export function fantasyTooltipPosition(anchor: Bounds, size: { width: number; height: number }, bounds: Bounds) {
  const clamp = (n: number, min: number, max: number) => Math.max(min, Math.min(n, Math.max(min, max)));
  const below = anchor.bottom + 8;
  return { left: clamp(anchor.left, bounds.left + 8, bounds.right - size.width - 8), top: clamp(below + size.height <= bounds.bottom - 8 ? below : anchor.top - size.height - 8, bounds.top + 8, bounds.bottom - size.height - 8) };
}
