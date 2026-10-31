import { useId, useLayoutEffect, useRef, useState } from 'react';
import { createPortal } from 'react-dom';
import type { NpcLocale } from '../../../shared/npc.ts';
import type { FantasyStatusRow } from '../../../shared/fantasy-status-view.ts';
import { fantasyTooltipPosition } from './fantasy-tooltip-position.ts';
import './fantasy-action-help.css';
import './fantasy-status-effects.css';

function StatusChip({ effect, locale }: { effect: FantasyStatusRow; locale: NpcLocale }) {
  const id = useId(), anchor = useRef<HTMLButtonElement>(null), tip = useRef<HTMLSpanElement>(null);
  const [open, setOpen] = useState(false), [position, setPosition] = useState({ left: 8, top: 8, maxWidth: 300, maxHeight: 300 });
  const kind = effect.kind === 'buff' ? { ko: '강화', en: 'Buff', ja: '強化' }[locale] : { ko: '불이익', en: 'Debuff', ja: '不利' }[locale];
  useLayoutEffect(() => {
    if (!open) return;
    const update = () => {
      if (!anchor.current || !tip.current) return;
      const panel = anchor.current.closest('.fantasy-panel')?.getBoundingClientRect();
      const bounds = { left: Math.max(0, panel?.left ?? 0), top: Math.max(0, panel?.top ?? 0), right: Math.min(innerWidth, panel?.right ?? innerWidth), bottom: Math.min(innerHeight, panel?.bottom ?? innerHeight) };
      const maxWidth = Math.max(40, Math.min(300, bounds.right - bounds.left - 16)), maxHeight = Math.max(40, bounds.bottom - bounds.top - 16);
      tip.current.style.maxWidth = `${maxWidth}px`; tip.current.style.maxHeight = `${maxHeight}px`;
      const size = tip.current.getBoundingClientRect();
      setPosition({ ...fantasyTooltipPosition(anchor.current.getBoundingClientRect(), { width: Math.min(size.width, maxWidth), height: Math.min(size.height, maxHeight) }, bounds), maxWidth, maxHeight });
    };
    update(); window.addEventListener('resize', update); window.addEventListener('scroll', update, true);
    return () => { window.removeEventListener('resize', update); window.removeEventListener('scroll', update, true); };
  }, [open, effect.description]);
  return <>
    <button ref={anchor} type="button" className={`fr-status-chip ${effect.kind}`} aria-label={`${kind}: ${effect.name}. ${effect.description}`} aria-describedby={open ? id : undefined} aria-expanded={open}
      onMouseEnter={() => setOpen(true)} onMouseLeave={() => setOpen(false)} onFocus={() => setOpen(true)} onBlur={() => setOpen(false)} onClick={() => setOpen(true)} onKeyDown={event => { if (event.key === 'Escape') setOpen(false); }}>
      <span aria-hidden="true">{effect.kind === 'buff' ? '+' : '−'}</span>{effect.name}
    </button>
    {open && createPortal(<span id={id} ref={tip} role="tooltip" className="fr-action-tooltip fr-status-tooltip" style={position}><b>{effect.name}</b><span>{effect.description}</span></span>, document.body)}
  </>;
}

export function FantasyStatusEffects({ effects, locale }: { effects: readonly FantasyStatusRow[]; locale: NpcLocale }) {
  if (!effects.length) return null;
  return <section className="fr-status-effects" aria-label={{ ko: '현재 효과', en: 'Current effects', ja: '現在の効果' }[locale]}>
    <small>{{ ko: '현재 효과', en: 'Current effects', ja: '現在の効果' }[locale]}</small>
    {(['buff', 'debuff'] as const).map(kind => {
      const group = effects.filter(effect => effect.kind === kind);
      return group.length ? <div className="fr-status-group" key={kind}><span>{kind === 'buff' ? {ko:'강화',en:'Buffs',ja:'強化'}[locale] : {ko:'디버프',en:'Debuffs',ja:'弱体'}[locale]}</span><div>{group.map(effect => <StatusChip key={effect.id} effect={effect} locale={locale} />)}</div></div> : null;
    })}
  </section>;
}
