import { fantasyDungeonView } from '../../../shared/fantasy-dungeon.ts';
import { useLocale } from '../locale.ts';
import { useStore } from '../store.ts';
import { FANTASY_TERMS } from '../../../shared/fantasy-lore.ts';
import { fantasyPartyErrorText } from '../../../shared/fantasy-party.ts';
import { requestFantasyParty } from './fantasy-party-transport.ts';
import { ReasonButton } from './FantasyActionButton.tsx';
import { realDuration } from './FantasyActivity.tsx';
import { FANTASY_DUNGEONS } from '../../../shared/fantasy-dungeon-catalog.ts';

export function FantasyPartyConsent() {
  const [locale] = useLocale(), state = useStore(s => s.fantasyParty), selfId = useStore(s => s.selfId), error = useStore(s => s.fantasyPartyError);
  const character=useStore(s=>s.fantasyProfile?.character);
  const blocked = useStore(s => !s.wsConnected || s.fantasyPartyPending || s.fantasyPending || s.fantasyCombatPending);
  const me = state?.members.find(member => member.id === selfId), travel = state?.travelProposal, combat = state?.combatProposal, dungeon=state?.dungeonProposal;
  const movementLeader=state?.movementLeader?state.movementLeader===selfId:!!me?.isLeader;
  const say = (ko: string, en: string, ja: string) => ({ko,en,ja})[locale];
  if (!state?.id || !me || !travel && !combat && !dungeon && !error) return null;
  const place = (id: string) => FANTASY_TERMS.find(term => term.category === 'place' && term.id === id)?.names[locale] ?? id;
  const mode = (id: string) => ({foot:say('도보','On foot','徒歩'),carriage:say('마차','Carriage','馬車'),ship:say('배','Ship','船'),escort:say('상단 호위','Caravan escort','隊商護衛'),gate:say('전이문','Gate','転移門'),'foot-carriage':say('도보 → 마차','Walk → carriage','徒歩 → 馬車')} as Record<string,string>)[id] ?? id;
  return <section className="fr-party-consent" aria-live="polite">
    {dungeon&&<><h3>{say('공동 탐사 제안','Group exploration proposal','共同探索の提案')}</h3><p>{dungeon.action.type==='dungeonEnter'?FANTASY_DUNGEONS.find(site=>dungeon.action.type==='dungeonEnter'&&site.id===dungeon.action.site)?.names[locale]:dungeon.action.type==='dungeonMove'?(character?fantasyDungeonView(character,locale)?.exits.find(exit=>dungeon.action.type==='dungeonMove'&&exit.id===dungeon.action.room)?.name:undefined)??say('연결된 다음 방으로 이동','Move to the adjoining room','つながる次の部屋へ移動'):dungeon.action.type==='dungeonInspect'?say('각자 주변을 조사하고 정보 공유','Inspect individually and share findings','各自で調査し情報を共有'):say('입구에서 밖으로 나가기','Leave through the entrance','入口から外へ出る')}</p><small>0 G · {say('즉시','Immediate','即時')} · {dungeon.agreed.length}/{state.members.filter(member=>!member.downed||!member.carriedBy).length} {say('동의','agreed','同意')}</small><div className="fr-action-grid">
      {!movementLeader&&!me.downed&&<>{[true,false].map(accept=><ReasonButton key={String(accept)} className="fr-btn" disabled={blocked||accept&&dungeon.agreed.includes(selfId)} reason={say('응답 처리 중이거나 이미 동의했습니다.','Processing a response or already agreed.','返答を処理中、または同意済みです。')} onClick={()=>requestFantasyParty({type:'dungeonDecision',proposal:dungeon.id,revision:dungeon.revision,accept})}>{accept?say('동의','Agree','同意'):say('거절 · 제안 취소','Decline · cancel proposal','断る・提案を取り消す')}</ReasonButton>)}</>}
      {movementLeader&&<ReasonButton className="fr-btn primary" disabled={blocked||!state.canStartDungeon} reason={say('모든 동료의 동의를 기다립니다.','Waiting for every member’s agreement.','全員の同意を待っています。')} onClick={()=>requestFantasyParty({type:'startDungeon'})}>{say('함께 진행','Proceed together','一緒に進める')}</ReasonButton>}
    </div></>}
    {error && <p role="alert" className="fr-error">{fantasyPartyErrorText(error,locale)}</p>}
    {travel && <><h3>{travel.kind === 'redirect' ? say('목적지 변경 제안','Change of destination','目的地変更の提案') : say('파티 이동 제안','Party travel proposal','パーティー移動の提案')}</h3><p>{place(travel.destination)} · {mode(travel.transport)}</p>
      {travel.quotes.filter(quote=>quote.user===selfId).map(quote=><p key={quote.user}>{say('내 비용','Your fare','自分の運賃')} {quote.cost} G · {realDuration(quote.hours,locale)}</p>)}
      <p>{travel.agreed.length}/{state.members.filter(member=>!member.downed||!member.carriedBy).length} {say('동의','agreed','同意')}</p><div className="fr-action-grid">
      {!movementLeader&&!me.downed && <><ReasonButton className="fr-btn primary" disabled={blocked||travel.agreed.includes(selfId)} reason={say('이미 동의했거나 응답을 처리 중입니다.','Already agreed or processing a response.','同意済み、または返答を処理中です。')} onClick={()=>requestFantasyParty({type:'travelDecision',proposal:travel.id,revision:travel.revision,accept:true})}>{say('동의','Agree','同意')}</ReasonButton><ReasonButton className="fr-btn" disabled={blocked} onClick={()=>requestFantasyParty({type:'travelDecision',proposal:travel.id,revision:travel.revision,accept:false})}>{say('거절 · 제안 취소','Decline · cancel proposal','断る・提案を取り消す')}</ReasonButton></>}
      {movementLeader && <ReasonButton className="fr-btn primary" disabled={blocked||!state.canStartTravel} reason={say('모든 파티원의 동의가 필요합니다.','Every member must agree.','全員の同意が必要です。')} onClick={()=>requestFantasyParty({type:travel.kind==='redirect'?'startRedirect':'startTravel'})}>{say('함께 출발','Depart together','一緒に出発')}</ReasonButton>}
      </div></>}
    {combat && <><h3>{say('파티 전투 제안','Party battle proposal','パーティー戦闘の提案')}</h3><p>{FANTASY_TERMS.find(term=>term.id===combat.target)?.names[locale]??say('앞을 가로막은 상대와 전투','Confront the opposition','行く手を塞ぐ相手との戦闘')}</p><div className="fr-action-grid">
      {!me.isLeader && (['accept','decline','sit-out'] as const).map(decision=><ReasonButton key={decision} className="fr-btn" disabled={blocked||me.combatDecision===decision} reason={say('이미 선택했거나 응답을 처리 중입니다.','Already selected or processing a response.','選択済み、または返答を処理中です。')} onClick={()=>requestFantasyParty({type:'combatDecision',proposal:combat.id,revision:combat.revision,decision})}>{({accept:say('수락','Accept','参加する'),decline:say('거절 · 제안 취소','Decline · cancel proposal','断る・提案を取り消す'),'sit-out':say('참여하지 않음','Sit out','参加しない')})[decision]}</ReasonButton>)}
      {me.isLeader&&<ReasonButton className="fr-btn primary" disabled={blocked||!state.canStartCombat} reason={say('동료들의 참가 여부를 기다리고 있습니다.','Waiting for each member’s decision.','全員の参加判断を待っています。')} onClick={()=>requestFantasyParty({type:'startCombat'})}>{say('전투 시작','Begin battle','戦闘開始')}</ReasonButton>}
      </div></>}
  </section>;
}
