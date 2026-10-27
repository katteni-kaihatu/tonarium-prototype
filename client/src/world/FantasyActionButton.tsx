import { useId, type ButtonHTMLAttributes } from 'react';
import { useLocale } from '../locale.ts';
import { useStore } from '../store.ts';
import './fantasy-action-help.css';

export function ReasonButton({reason,children,...props}: ButtonHTMLAttributes<HTMLButtonElement> & {reason?:string}) {
  const [locale]=useLocale(),id=useId();
  const connected=useStore(state=>state.wsConnected),pending=useStore(state=>state.fantasyPending),active=useStore(state=>(!!state.fantasyProfile?.activity||!!state.fantasyProfile?.combatId));
  const custody=useStore(state=>state.fantasyRealm?.civic.actionBlock);
  const fallback=!connected?{ko:'서버에 연결해야 합니다.',en:'Connect to the server first.',ja:'サーバーへの接続が必要です。'}[locale]:pending?{ko:'앞선 요청을 처리하고 있습니다.',en:'The previous request is being processed.',ja:'直前の依頼を処理中です。'}[locale]:active?{ko:'현재 활동을 마친 뒤 사용할 수 있습니다.',en:'Finish your current activity first.',ja:'現在の活動を終えてから使えます。'}[locale]:{ko:'현재 조건으로는 사용할 수 없습니다.',en:'The current conditions are not met.',ja:'現在の条件では使えません。'}[locale];
  const explanation=props.disabled?(reason||props.title||(custody?{ko:'법적 절차를 마친 뒤 사용할 수 있습니다.',en:'Resolve the legal proceedings first.',ja:'身柄の手続きを終えてから使えます。'}[locale]:fallback)):undefined;
  if(!props.disabled)return <button {...props}>{children}</button>;
  return <span className="fr-disabled-help" tabIndex={0} title={explanation} aria-describedby={id}><button {...props} title={explanation} aria-describedby={id}>{children}</button><span id={id} role="tooltip">{explanation}</span></span>;
}
