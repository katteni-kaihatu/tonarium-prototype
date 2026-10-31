import { useId, useLayoutEffect, useRef, useState, type ButtonHTMLAttributes } from 'react';
import { createPortal } from 'react-dom';
import { fantasyTooltipPosition } from './fantasy-tooltip-position.ts';
import { useLocale } from '../locale.ts';
import { useStore } from '../store.ts';
import './fantasy-action-help.css';

export function ReasonButton({reason,children,...props}: ButtonHTMLAttributes<HTMLButtonElement> & {reason?:string}) {
  const [locale]=useLocale(),id=useId();
  const anchor=useRef<HTMLSpanElement>(null),tip=useRef<HTMLSpanElement>(null);
  const [open,setOpen]=useState(false),[position,setPosition]=useState({left:8,top:8,maxWidth:320,maxHeight:300});
  const connected=useStore(state=>state.wsConnected),pending=useStore(state=>state.fantasyPending||state.fantasyPartyPending||state.fantasyCombatPending||state.fantasyRealmPending),active=useStore(state=>(!!state.fantasyProfile?.activity||!!state.fantasyProfile?.combatId));
  const custody=useStore(state=>state.fantasyRealm?.civic.actionBlock);
  const fallback=!connected?{ko:'서버에 연결해야 합니다.',en:'Connect to the server first.',ja:'サーバーへの接続が必要です。'}[locale]:pending?{ko:'앞선 요청을 처리하고 있습니다.',en:'The previous request is being processed.',ja:'直前の依頼を処理中です。'}[locale]:active?{ko:'현재 활동을 마친 뒤 사용할 수 있습니다.',en:'Finish your current activity first.',ja:'現在の活動を終えてから使えます。'}[locale]:{ko:'현재 조건으로는 사용할 수 없습니다.',en:'The current conditions are not met.',ja:'現在の条件では使えません。'}[locale];
  const explanation=props.disabled?(reason||props.title||(custody?{ko:'법적 절차를 마친 뒤 사용할 수 있습니다.',en:'Resolve the legal proceedings first.',ja:'身柄の手続きを終えてから使えます。'}[locale]:fallback)):undefined;
  useLayoutEffect(()=>{
    if(!open||!anchor.current||!tip.current)return;
    const update=()=>{
      if(!anchor.current||!tip.current)return;
      const panel=anchor.current.closest('.fantasy-panel')?.getBoundingClientRect();
      const bounds={left:Math.max(0,panel?.left??0),top:Math.max(0,panel?.top??0),right:Math.min(innerWidth,panel?.right??innerWidth),bottom:Math.min(innerHeight,panel?.bottom??innerHeight)};
      const maxWidth=Math.max(40,Math.min(320,bounds.right-bounds.left-16)),maxHeight=Math.max(40,bounds.bottom-bounds.top-16);
      tip.current.style.maxWidth=`${maxWidth}px`;tip.current.style.maxHeight=`${maxHeight}px`;
      const size=tip.current.getBoundingClientRect();
      setPosition({...fantasyTooltipPosition(anchor.current.getBoundingClientRect(),{width:Math.min(size.width,maxWidth),height:Math.min(size.height,maxHeight)},bounds),maxWidth,maxHeight});
    };
    update();window.addEventListener('resize',update);window.addEventListener('scroll',update,true);
    return()=>{window.removeEventListener('resize',update);window.removeEventListener('scroll',update,true);};
  },[open,explanation,locale]);
  if(!props.disabled)return <button {...props}>{children}</button>;
  return <span ref={anchor} className="fr-disabled-help" tabIndex={0} aria-describedby={open?id:undefined} onMouseEnter={()=>setOpen(true)} onMouseLeave={()=>setOpen(false)} onFocus={()=>setOpen(true)} onBlur={()=>setOpen(false)} onClick={()=>setOpen(true)} onKeyDown={event=>{if(event.key==='Escape')setOpen(false);if(event.key==='Enter'||event.key===' '){event.preventDefault();setOpen(value=>!value);}}}><button {...props} title={undefined} aria-describedby={open?id:undefined}>{children}</button>{open&&createPortal(<span ref={tip} id={id} role="tooltip" className="fr-action-tooltip" style={position}>{explanation}</span>,document.body)}</span>;
}
