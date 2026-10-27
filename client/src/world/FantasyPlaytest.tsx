import { ReasonButton } from './FantasyActionButton.tsx';
import { useEffect, useState } from 'react';
import { useStore } from '../store.ts';
import { useLocale } from '../locale.ts';
import { joinSession } from '../actions.ts';
import { send } from '../net/ws.ts';
import { WorldScreen } from './WorldScreen.tsx';
import '../language.css';

export function FantasyPlaytest() {
  const [locale] = useLocale();
  const connected = useStore((s) => s.wsConnected);
  const session = useStore((s) => s.session);
  const sessions = useStore((s) => s.guild.sessions);
  const selfId = useStore((s) => s.selfId);
  const selfName = useStore((s) => s.selfName);
  const [waiting, setWaiting] = useState(false);
  const title = `RPG Playtest · ${selfId.slice(0, 8)}`;
  const saved = sessions.find((s) => s.name === title && s.owner === selfName && s.world === 'fantasy');
  useEffect(() => { if (waiting && saved) joinSession(saved.id); }, [waiting, saved?.id]);
  if (session) return <WorldScreen />;
  return <main lang={locale} className="language-screen"><div className="language-card"><img src="/brand/logo.png" alt="Tonarium"/><span className="language-ornament">✦</span><h1>{{ko:'기나긴 여정',en:'The Long Journey',ja:'悠久の旅路'}[locale]}</h1><div className="language-choices"><ReasonButton disabled={!connected || waiting} reason={waiting?{ko:'월드 입장을 준비하고 있습니다.',en:'Preparing to enter the world.',ja:'ワールドへの入場を準備中です。'}[locale]:undefined} onClick={() => {
    if (saved) joinSession(saved.id);
    else { setWaiting(true); send({ t: 'sessionCreate', name: title, topic: 'Local RPG playtest', world: 'fantasy', visibility: 'invite' }); }
  }}><span>{waiting?{ko:'준비 중…',en:'Preparing…',ja:'準備中…'}[locale]:{ko:'모험 시작',en:'Begin the adventure',ja:'冒険をはじめる'}[locale]}</span><b>→</b></ReasonButton></div></div></main>;
}
