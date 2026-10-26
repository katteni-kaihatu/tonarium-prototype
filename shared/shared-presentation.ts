import type { AssetView, Catalog } from './shared-assets.ts';
import type { Solid } from './worlds.ts';
export function sharedPresentation(view: AssetView | undefined, catalog: Catalog | undefined) {
  if (!view || !catalog) return [];
  return view.map.placements.flatMap(p => {
    const entry = catalog.entries.find(e => e.id === p.asset.id && e.version === p.asset.version && e.integrity === p.asset.integrity);
    const presentation = entry?.manifest.presentation;
    if (!presentation || entry?.manifest.kind !== 'spatial') return [];
    const value = view.values[p.instanceId]?.[presentation.field] ?? 0;
    return [{ ...p.transform, instanceId: p.instanceId, color: presentation.color, label: `${presentation.label}: ${value}`, solid: presentation.solid && value > 0 }];
  });
}
export function sharedSolids(view: AssetView | undefined, catalog: Catalog | undefined): Solid[] {
  return sharedPresentation(view, catalog).filter(p => p.solid).map(p => ({ x: p.x, z: p.z, w: p.scale * (Math.abs(Math.cos(p.ry)) + Math.abs(Math.sin(p.ry))), d: p.scale * (Math.abs(Math.cos(p.ry)) + Math.abs(Math.sin(p.ry))), y0: p.y, y1: p.y + p.scale }));
}
