import { ReasonButton } from './FantasyActionButton.tsx';
import type { FantasyCharacter } from '../../../shared/fantasy.ts';
import { NPC_PUBLIC } from '../../../shared/npc.ts';
import { useLocale } from '../locale.ts';
import { get, set, useStore } from '../store.ts';
import { send } from '../net/ws.ts';

export function FantasyCommunity({character, npcId}:{character:FantasyCharacter;npcId?:string}) {
  const [locale]=useLocale();
  const state=useStore(s=>s.communityState);
  const pending=useStore(s=>s.communityPending);
  const connected=useStore(s=>s.wsConnected);
  const error=useStore(s=>s.communityError);
  if(!state||state.location!==character.location)return null;
  const target=npcId??NPC_PUBLIC.find(npc=>npc.homeLocation===character.location)?.id;
  const contribute=()=>{
    const current=get();
    if(!target||!current.wsConnected||current.communityPending||current.fantasyProfile?.activity||!current.communityState?.canContribute||current.communityState.location!==character.location)return;
    set({communityPending:true,communityError:null});
    send({t:'communityContribute',requestId:crypto.randomUUID(),revision:state.revision,npcId:target});
  };
  return <section className="fr-community"><h3>{{ko:'마을 돕기',en:'Help the town',ja:'町の手伝い'}[locale]}</h3>{state.projects.map(project=><p key={project.id}>{project.names[locale]} <small>{project.contributions}/{project.target}{project.completions>0?` · ✓ ${project.completions}`:''}</small></p>)}{state.notices.slice(-2).map(notice=><p key={notice.id}>{notice.text[locale]}</p>)}<ReasonButton type="button" className="fr-btn" disabled={!connected||pending||!state.canContribute||!!get().fantasyProfile?.activity||!target} reason={!connected||get().fantasyProfile?.activity?undefined:pending?({ko:'마을 돕기 요청을 처리하고 있습니다.',en:'Your contribution is being processed.',ja:'手伝いの依頼を処理中です。'})[locale]:state.nextContributionAt>character.hour?({ko:'다시 돕기까지 조금 더 기다려야 합니다.',en:'Wait a little longer before helping again.',ja:'もう一度手伝うには少し待ってください。'})[locale]:!target?({ko:'이곳에는 도움을 받을 주민이 없습니다.',en:'There is no resident here to accept your help.',ja:'ここには手伝いを受け付ける住人がいません。'})[locale]:undefined} onClick={contribute}>{{ko:'돕기',en:'Help',ja:'手伝う'}[locale]}</ReasonButton>{error&&<small role="alert">{{ko:'상태가 바뀌었거나 지금은 참여할 수 없습니다.',en:'The state changed or you cannot contribute yet.',ja:'状態が変わったか、今は参加できません。'}[locale]}</small>}</section>;
}
