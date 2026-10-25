type Rect = { left: number; top: number; right: number; bottom: number; width: number; height: number };
type Viewport = { left: number; top: number; width: number; height: number };

export function popoverPosition(anchor: Rect, size: { width: number; height: number }, viewport: Viewport, side: 'right' | 'up' | 'down') {
  const left = viewport.left + 12;
  const top = viewport.top + 12;
  const width = Math.max(0, viewport.width - 24);
  const height = Math.max(0, viewport.height - 24);
  const x = side === 'right' ? anchor.right + 10 : side === 'up' ? anchor.left + (anchor.width - size.width) / 2 : anchor.left;
  const y = side === 'up' ? anchor.top - 10 - size.height : side === 'down' ? anchor.bottom + 8 : anchor.top - 8;
  return { left: Math.max(left, Math.min(x, left + width - size.width)), top: Math.max(top, Math.min(y, top + height - size.height)), maxWidth: width, maxHeight: height };
}
