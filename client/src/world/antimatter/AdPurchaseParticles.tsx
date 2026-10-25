import { useEffect, useRef, useState, type CSSProperties, type RefObject } from 'react';
import { subscribeAdFeedback } from '../../ad/feedback.ts';
import { useAdReducedMotion } from '../../ad/useAdReducedMotion.ts';

const BURST_LIMIT = 8;
const BURST_MS = 650;
const SUCCESS_KINDS = new Set(['purchase', 'tickspeed', 'boost', 'galaxy', 'sacrifice', 'crunch']);

interface Burst { id: number; x: number; y: number; color: string }

/** Local reactor feedback, clipped to a small area inside the research window. */
export function AdPurchaseParticles({ root }: { root: RefObject<HTMLDivElement | null> }) {
  const [bursts, setBursts] = useState<Burst[]>([]);
  const nextId = useRef(0);
  const reduced = useAdReducedMotion();
  useEffect(() => {
    setBursts([]);
    if (reduced) return;
    const panel = root.current;
    if (!panel) return;
    let interactedButton: Element | null = null;
    const rememberInteraction = (event: Event) => {
      if (event.target instanceof Element) interactedButton = event.target.closest('button');
    };
    panel.addEventListener('click', rememberInteraction, true);
    const timers = new Map<number, ReturnType<typeof setTimeout>>();
    const unsubscribe = subscribeAdFeedback((event) => {
      if (!SUCCESS_KINDS.has(event.kind) || !root.current) return;
      const reactor = event.kind === 'purchase' && Number.isInteger(event.tier)
        ? panel.querySelector(`[data-tier="${event.tier}"] .ad-dimension-reactor`)
        : null;
      const bounds = panel.getBoundingClientRect();
      const candidates = [reactor, panel.querySelector('[data-ad-core] svg'), interactedButton];
      const anchor = candidates.filter((candidate) => candidate && panel.contains(candidate))
        .map((candidate) => candidate!.getBoundingClientRect())
        .find((rect) => rect.width > 0 && rect.height > 0 && rect.top + rect.height / 2 >= bounds.top && rect.top + rect.height / 2 <= bounds.bottom);
      // Keep feedback attached to a visible reactor or the control that performed the action.
      if (!anchor) return;
      const centerY = anchor.top + anchor.height / 2;
      const id = nextId.current++;
      const color = event.kind === 'crunch' || event.kind === 'galaxy' ? '#e4a3ff' : '#8affdf';
      setBursts((previous) => [...previous.slice(-(BURST_LIMIT - 1)), {
        id, color,
        x: anchor.left + anchor.width / 2 - bounds.left + panel.scrollLeft,
        y: centerY - bounds.top + panel.scrollTop,
      }]);
      // Coalesce rapid purchases without allowing a queue of dormant timers to grow.
      while (timers.size >= BURST_LIMIT) {
        const oldest = timers.keys().next().value;
        if (oldest === undefined) break;
        clearTimeout(timers.get(oldest));
        timers.delete(oldest);
      }
      timers.set(id, setTimeout(() => {
        timers.delete(id);
        setBursts((previous) => previous.filter((burst) => burst.id !== id));
      }, BURST_MS));
    });
    return () => {
      unsubscribe();
      panel.removeEventListener('click', rememberInteraction, true);
      timers.forEach(clearTimeout);
    };
  }, [root, reduced]);
  if (reduced) return null;
  return bursts.map((burst) => (
    <span key={burst.id} className="ad-feedback-burst" aria-hidden="true" style={{ left: burst.x, top: burst.y, color: burst.color }}>
      {Array.from({ length: 12 }, (_, i) => {
        const angle = i * Math.PI / 6;
        const radius = i % 2 === 0 ? 40 : 28;
        return <i key={i} style={{ '--ad-spark-x': `${Math.cos(angle) * radius}px`, '--ad-spark-y': `${Math.sin(angle) * radius}px` } as CSSProperties} />;
      })}
    </span>
  ));
}
