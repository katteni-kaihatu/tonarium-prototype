export interface TrackedPose { p: [number, number, number]; q: [number, number, number, number] }
export interface AvatarXR { head: TrackedPose; left?: TrackedPose; right?: TrackedPose }

export function validAvatarXR(value: unknown): value is AvatarXR {
  if (!value || typeof value !== 'object') return false;
  const v = value as AvatarXR;
  const pose = (p: unknown): p is TrackedPose => {
    if (!p || typeof p !== 'object') return false;
    const { p: position, q } = p as TrackedPose;
    return Array.isArray(position) && position.length === 3 && position.every(n => Number.isFinite(n) && Math.abs(n) <= 5)
      && Array.isArray(q) && q.length === 4 && q.every(Number.isFinite) && Math.abs(Math.hypot(...q) - 1) < .01;
  };
  return pose(v.head) && (v.left === undefined || pose(v.left)) && (v.right === undefined || pose(v.right));
}

export function copyAvatarXR(value: AvatarXR): AvatarXR {
  const pose = (v: TrackedPose): TrackedPose => ({ p: [...v.p], q: [...v.q] });
  return { head: pose(value.head), ...(value.left ? { left: pose(value.left) } : {}), ...(value.right ? { right: pose(value.right) } : {}) };
}
