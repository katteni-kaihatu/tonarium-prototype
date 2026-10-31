import { useEffect, useLayoutEffect, useRef, useState, type PointerEvent } from 'react';
import { createPortal } from 'react-dom';
import { NPC_PUBLIC, type NpcId } from '../../../shared/npc.ts';
import { useLocale } from '../locale.ts';
import { NpcChat } from './NpcChat.tsx';
import { FantasyMenuBoundary } from './FantasyMenuBoundary.tsx';
import { useStore } from '../store.ts';
import { clampMessengerPosition, type MessengerPoint } from './fantasy-messenger-position.ts';

const positions = new Map<string, MessengerPoint>();

export function FantasyMessenger({npcId,hidden,onClose,theme}:{npcId:NpcId;hidden:boolean;onClose:()=>void;theme?:Record<string,string>}) {
  const [locale]=useLocale();
  const session = useStore(state => state.session), self = useStore(state => state.selfId);
  const scope = `${self}:${session ?? ''}`;
  const [placement, setPlacement] = useState(() => ({ scope, point: positions.get(scope) }));
  const position = placement.scope === scope ? placement.point : positions.get(scope);
  const [viewport, setViewport] = useState(() => ({ width: window.innerWidth, height: window.innerHeight }));
  const desktop = viewport.width > 700;
  const [dragging, setDragging] = useState(false);
  const [minimized,setMinimized]=useState(false);
  const root=useRef<HTMLElement>(null);
  const drag = useRef<{ pointer: number; offset: MessengerPoint; bar: HTMLElement } | null>(null);
  const remember = (point: MessengerPoint) => {
    positions.delete(scope); positions.set(scope, point);
    if (positions.size > 20) positions.delete(positions.keys().next().value!);
    setPlacement({ scope, point });
  };
  const stopDrag = () => {
    const active = drag.current; drag.current = null; setDragging(false);
    if (active?.bar.hasPointerCapture(active.pointer)) active.bar.releasePointerCapture(active.pointer);
  };
  useEffect(() => {
    const resize = () => { stopDrag(); setViewport({ width: window.innerWidth, height: window.innerHeight }); };
    window.addEventListener('resize', resize);
    return () => window.removeEventListener('resize', resize);
  }, []);
  useLayoutEffect(() => {
    if (hidden) { stopDrag(); return; }
    if (!desktop || !position || !root.current) return;
    const bounded = clampMessengerPosition(position, root.current.getBoundingClientRect(), viewport);
    if (bounded.x !== position.x || bounded.y !== position.y) remember(bounded);
  }, [hidden, desktop, minimized, position?.x, position?.y, viewport.width, viewport.height, scope]);
  const startDrag = (event: PointerEvent<HTMLElement>) => {
    if (!desktop || event.button !== 0 || !event.isPrimary || !root.current
      || (event.target instanceof Element && event.target.closest('button,input,textarea,select,a,[role="button"]'))) return;
    const rect = root.current.getBoundingClientRect();
    drag.current = { pointer: event.pointerId, offset: { x: event.clientX - rect.left, y: event.clientY - rect.top }, bar: event.currentTarget };
    event.currentTarget.setPointerCapture(event.pointerId); event.preventDefault();
    remember({ x: rect.left, y: rect.top }); setDragging(true);
  };
  const moveDrag = (event: PointerEvent<HTMLElement>) => {
    const active = drag.current;
    if (!active || active.pointer !== event.pointerId || !root.current) return;
    event.preventDefault();
    remember(clampMessengerPosition({ x: event.clientX - active.offset.x, y: event.clientY - active.offset.y }, root.current.getBoundingClientRect(), { width: window.innerWidth, height: window.innerHeight }));
  };
  useEffect(()=>{if(!hidden){setMinimized(false);root.current?.querySelector('textarea')?.focus();}},[hidden]);
  const npc=NPC_PUBLIC.find(n=>n.id===npcId)!;
  const t={ko:{chat:'대화',close:'닫기',minimize:'최소화',restore:'다시 펼치기'},en:{chat:'Conversation',close:'Close',minimize:'Minimize',restore:'Restore'},ja:{chat:'会話',close:'閉じる',minimize:'最小化',restore:'元に戻す'}}[locale];
  return createPortal(<section lang={locale} ref={root} hidden={hidden} data-fr-terrain={theme?'':undefined} onKeyDown={event=>{if(event.key==='Escape'){event.stopPropagation();onClose();}}} className={`fr-messenger ${minimized?'minimized':''} ${dragging?'dragging':''}`} style={{...theme,...(desktop&&position?{left:position.x,top:position.y,right:'auto',bottom:'auto'}:{})}} role="dialog" aria-modal="false" aria-label={`${npc.name[locale]} ${t.chat}`}>
    <header className="fr-messenger-bar" onPointerDown={startDrag} onPointerMove={moveDrag} onPointerUp={stopDrag} onPointerCancel={stopDrag} onLostPointerCapture={stopDrag}><span><b>✦ {npc.name[locale]}</b><small>{npc.role[locale]}</small></span><div><button type="button" aria-label={minimized?t.restore:t.minimize} onClick={()=>setMinimized(!minimized)}>{minimized?'□':'—'}</button><button type="button" aria-label={t.close} onClick={onClose}>×</button></div></header>
    <div className="fr-messenger-content" hidden={minimized}><FantasyMenuBoundary menu={`${npcId}:${locale}`}><NpcChat messenger npcIds={[npcId]} initialNpcId={npcId}/></FantasyMenuBoundary></div>
  </section>,document.body);
}
