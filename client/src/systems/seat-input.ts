import type { SystemCatalog, SystemView } from '../../../shared/system-types.ts';

export function standInput(view: SystemView, catalog: SystemCatalog, user: string) {
  const occupied = new Set(Object.entries(view.seats).filter(([, occupant]) => occupant === user).map(([id]) => id));
  if (!occupied.size) return undefined;
  for (const instance of view.systems) {
    const manifest = catalog.entries.find(entry => entry.id === instance.systemId && entry.version === instance.version && entry.integrity === instance.integrity)?.manifest;
    const payload = manifest?.inputs.stand?.payload;
    if (!manifest || !payload || payload.user !== 'user' || Object.keys(payload).length !== 1) continue;
    if (Object.entries(manifest.targets).some(([role, target]) => target.capabilities.includes('seat') && instance.bindings[role]?.some(id => occupied.has(id)))) {
      return { instanceId: instance.instanceId, input: 'stand', payload: { user } };
    }
  }
  return undefined;
}

export interface SeatKeyEvent {
  code: string; repeat?: boolean; isComposing?: boolean; target?: unknown;
  preventDefault(): void; stopImmediatePropagation(): void;
}
export function isSeatTextEntry(target: unknown) {
  const element = target as { tagName?: string; isContentEditable?: boolean; closest?: (selector: string) => unknown } | null;
  return !!element && (['INPUT', 'TEXTAREA', 'SELECT'].includes(element.tagName ?? '') || element.isContentEditable === true || !!element.closest?.('input, textarea, select, [contenteditable="true"], [contenteditable=""]'));
}

export class SeatSpaceShortcut {
  private held = false;
  constructor(private seated: () => boolean, private stand: () => void) {}
  down(event: SeatKeyEvent) {
    if (event.code !== 'Space' || event.isComposing || isSeatTextEntry(event.target)) return false;
    if (!this.held && !this.seated()) return false;
    const first = !this.held && !event.repeat;
    this.held = true;
    event.preventDefault(); event.stopImmediatePropagation();
    if (first) this.stand();
    return true;
  }
  up(event: SeatKeyEvent) {
    if (event.code !== 'Space') return;
    if (this.held) { event.preventDefault(); event.stopImmediatePropagation(); }
    this.held = false;
  }
  reset() { this.held = false; }
}
