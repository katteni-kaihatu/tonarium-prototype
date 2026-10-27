export interface MessengerPoint { x: number; y: number }
export interface MessengerSize { width: number; height: number }

export function clampMessengerPosition(point: MessengerPoint, size: MessengerSize, viewport: MessengerSize, margin = 8): MessengerPoint {
  const axis = (value: number, extent: number, windowExtent: number) => {
    const available = Math.max(0, (Number.isFinite(windowExtent) ? windowExtent : 0) - Math.max(0, Number.isFinite(extent) ? extent : 0));
    const inset = Math.min(Math.max(0, Number.isFinite(margin) ? margin : 0), available / 2);
    return Math.min(available - inset, Math.max(inset, Number.isFinite(value) ? value : inset));
  };
  return { x: axis(point.x, size.width, viewport.width), y: axis(point.y, size.height, viewport.height) };
}
