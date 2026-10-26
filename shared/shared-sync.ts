import type { AssetView } from './shared-assets.ts';
export interface AssetDelta { from: number; revision: number; values: AssetView['values'] }
export function assetDelta(before: AssetView, after: AssetView): AssetDelta {
  return { from: before.revision, revision: after.revision, values: Object.fromEntries(Object.entries(after.values).filter(([id, fields]) => JSON.stringify(before.values[id]) !== JSON.stringify(fields))) };
}
export function applyAssetDelta(current: AssetView | undefined, delta: AssetDelta): AssetView | 'resync' | 'stale' {
  if (current && delta.revision <= current.revision) return 'stale';
  if (!current || current.revision !== delta.from || delta.revision !== delta.from + 1) return 'resync';
  return { ...current, revision: delta.revision, values: { ...current.values, ...delta.values } };
}
