/** Manual AD actions only. Production ambience reads game state separately. */
export type AdFeedbackKind =
  | 'purchase' | 'tickspeed' | 'boost' | 'galaxy' | 'sacrifice' | 'crunch'
  | 'save' | 'load' | 'profile' | 'export' | 'import' | 'submit' | 'error' | 'navigate';

export interface AdFeedbackEvent {
  kind: AdFeedbackKind;
  /** Dimension tier, from 1 through 8. */
  tier?: number;
  /** Actual purchases, including purchases combined during one action. */
  count?: number;
}

type Listener = (event: AdFeedbackEvent) => void;
const listeners = new Set<Listener>();
const pendingPurchases = new Map<string, AdFeedbackEvent>();
let scheduled = false;

function deliver(event: AdFeedbackEvent): void {
  for (const listener of [...listeners]) {
    // A visual/audio consumer must never interrupt the gameplay action.
    try { listener(event); } catch (error) { console.error('AD feedback listener failed', error); }
  }
}

/** Coalesce button loops (buy 10 / max all) into one event per purchased tier. */
export function emitAdFeedback(event: AdFeedbackEvent): void {
  if (listeners.size === 0) return;
  if (event.kind !== 'purchase' && event.kind !== 'tickspeed') {
    deliver(event);
    return;
  }
  const count = event.count ?? 1;
  if (!Number.isFinite(count) || count <= 0) return;
  const key = `${event.kind}:${event.tier ?? ''}`;
  const previous = pendingPurchases.get(key);
  pendingPurchases.set(key, { ...event, count: (previous?.count ?? 0) + count });
  if (scheduled) return;
  scheduled = true;
  queueMicrotask(() => {
    const events = [...pendingPurchases.values()];
    pendingPurchases.clear();
    scheduled = false;
    for (const next of events) deliver(next);
  });
}

export function subscribeAdFeedback(listener: Listener): () => void {
  listeners.add(listener);
  return () => { listeners.delete(listener); };
}
