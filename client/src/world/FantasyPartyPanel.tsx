import { useEffect } from 'react';
import type { FantasyProfile } from '../../../shared/fantasy.ts';
import { FANTASY_PARTY_MAX_MEMBERS, fantasyPartyErrorText, type FantasyPartyCommand } from '../../../shared/fantasy-party.ts';
import { fantasyMainInvestigationError, fantasyMainStage } from '../../../shared/fantasy-main-trials.ts';
import { FANTASY_MAIN_APPROACHES, fantasyMainApproachLabel } from '../../../shared/fantasy-main-guidance.ts';
import { fantasyVoyageScene } from '../../../shared/fantasy-voyage-scenes.ts';
import { useLocale } from '../locale.ts';
import { get, set, useStore } from '../store.ts';
import { send } from '../net/ws.ts';
import { ReasonButton } from './FantasyActionButton.tsx';
import { fantasyErrorText } from './fantasy-copy.ts';
import { FantasyPartyExtras } from './FantasyPartyExtras.tsx';

export function FantasyPartyPanel({ profile }: { profile: FantasyProfile }) {
  const [locale] = useLocale(), state = useStore(s => s.fantasyParty), error = useStore(s => s.fantasyPartyError);
  const pending = useStore(s => s.fantasyPartyPending), connected = useStore(s => s.wsConnected), selfId = useStore(s => s.selfId);
  const actionPending = useStore(s => s.fantasyPending || s.fantasyCombatPending);
  const session = useStore(s => s.session), users = useStore(s => s.users), account = useStore(s=>s.fantasyAccount), c = profile.character;
  const say = (ko: string, en: string, ja: string) => ({ ko, en, ja })[locale];
  useEffect(() => {
    if (!connected) return;
    send({ t: 'fantasyPartyRequest', command: { type: 'sync' } });
    const timer = setInterval(() => send({ t: 'fantasyPartyRequest', command: { type: 'sync' } }), 5000);
    return () => clearInterval(timer);
  }, [connected, session]);
  useEffect(() => {
    if (!pending) return;
    const timer = setTimeout(() => set({ fantasyPartyPending: false, fantasyPartyError: 'unavailable' }), 10000);
    return () => clearTimeout(timer);
  }, [pending]);
  const command = (value: FantasyPartyCommand) => {
    if (!get().wsConnected || get().fantasyPartyPending || get().fantasyPending || get().fantasyCombatPending) return;
    set({ fantasyPartyPending: true, fantasyPartyError: null });
    send({ t: 'fantasyPartyRequest', command: value });
  };
  const self = state?.members.find(member => member.id === selfId), members = state?.members ?? [];
  const quest = c?.quests.find(quest => !!fantasyMainStage(c, quest)), stage = c && quest ? fantasyMainStage(c, quest) : undefined;
  const scene = c && quest ? fantasyVoyageScene(c, quest) : undefined;
  const busy = !!profile.activity || !!profile.event || !!profile.death || !!profile.combatId || !c;
  const transportReason = !connected ? say('연결을 기다리고 있어요.', 'Waiting for connection.', '接続を待っています。') : pending || actionPending ? say('요청을 확인 중이에요.', 'Waiting for the request.', '依頼を確認しています。') : undefined;
  const combatReason = transportReason ?? (profile.activity || profile.death || profile.combatId || !c ? say('현재 활동이나 전투를 먼저 마쳐 주세요.', 'Finish the current activity or combat first.', 'いまの行動や戦闘を先に終えてください。') : undefined);
  const investigationError = c && quest ? fantasyMainInvestigationError(c, { type: 'investigate', quest, approach: 'observe' }) : undefined;
  const reason = transportReason ?? (busy ? say('현재 행동이나 사건을 먼저 마쳐 주세요.', 'Finish the current activity or encounter.', 'いまの行動や出来事を先に終えてください。')
    : !scene ? say('받은 메인 의뢰의 다음 조사 장소에서 준비하세요.', 'Ready at the next site of your accepted main quest.', '受けた主依頼の次の調査場所で準備してください。') : investigationError ? fantasyErrorText(investigationError, locale) : undefined);
  return <section className="fr-party"><h2>{say('파티', 'Party', 'パーティー')}{state?.id && ` · ${members.length}/${FANTASY_PARTY_MAX_MEMBERS}`}</h2>
    {error && <p role="alert" className="fr-error">{fantasyPartyErrorText(error, locale)}</p>}
    {state?.invitations.map(invite => <article key={invite.id} className="fr-party-invite"><p>{say(`${invite.fromName}의 파티 초대`, `Party invitation from ${invite.fromName}`, `${invite.fromName}からの招待`)}</p><div className="fr-action-grid">
      <ReasonButton className="fr-btn" disabled={pending || actionPending || !connected || busy} reason={reason} onClick={() => command({ type: 'respond', invite: invite.id, accept: true })}>{say('수락', 'Accept', '参加')}</ReasonButton>
      <ReasonButton className="fr-btn" disabled={pending || actionPending || !connected} reason={reason} onClick={() => command({ type: 'respond', invite: invite.id, accept: false })}>{say('거절', 'Decline', '辞退')}</ReasonButton>
    </div></article>)}
    {!state?.id ? <ReasonButton className="fr-btn" disabled={pending || actionPending || !connected || busy} reason={reason} onClick={() => command({ type: 'create' })}>{say('파티 만들기', 'Create a party', 'パーティーを作る')}</ReasonButton> : <>
      <ul className="fr-party-members">{members.map(member => <li key={member.id}><b>{member.name}{member.isLeader ? ' ♛' : ''}</b><span>{member.travelReady ? say('이동 동의함', 'Travel agreed', '移動に同意') : member.combatReady ? say('전투 준비됨', 'Battle ready', '戦闘準備完了') : member.ready ? say('준비됨', 'Ready', '準備完了') : !member.here ? say('다른 장소', 'Elsewhere', '別の場所') : !member.compatible && !!scene ? say('조사 단계가 다름', 'Different investigation', '調査段階が違う') : say('준비 대기', 'Not ready', '準備待ち')}</span></li>)}</ul>
      {quest && stage && <><p>{say('각자 조사 방법을 선택해 준비하세요.', 'Choose your own approach and ready up.', '各自が調査方法を選んで準備してください。')}</p><div className="fr-action-grid">{FANTASY_MAIN_APPROACHES.map(approach => <ReasonButton key={approach} className="fr-btn" disabled={!!reason || !!self?.ready} reason={self?.ready ? say('준비를 취소하면 방법을 바꿀 수 있어요.', 'Unready to change your approach.', '準備を取り消すと方法を変えられます。') : reason} onClick={() => command({ type: 'ready', quest, approach })}>{scene?.approaches[approach][locale] ?? fantasyMainApproachLabel(stage.kind, approach, locale)}</ReasonButton>)}</div></>}
      {(self?.ready || self?.combatReady) && <ReasonButton className="fr-btn" disabled={pending || actionPending || !connected} reason={reason} onClick={() => command({ type: 'unready' })}>{say('준비 취소', 'Unready', '準備を取り消す')}</ReasonButton>}
      {self?.isLeader && <ReasonButton className="fr-btn primary" disabled={!!combatReason || !state.canStartCombat} reason={combatReason ?? say('전투 메뉴에서 모두 같은 전투로 준비해야 해요.', 'Everyone must ready for the same battle in Combat.', '戦闘メニューで全員が同じ戦闘に準備してください。')} onClick={() => command({ type: 'startCombat' })}>{say('함께 전투 시작', 'Begin battle together', '一緒に戦闘を始める')}</ReasonButton>}
      {self?.isLeader && <ReasonButton className="fr-btn primary" disabled={!!reason || !state.canStart} reason={reason ?? say('같은 현장의 동료 2명 이상이 모두 준비해야 해요.', 'All members must ready at the same site; at least two are needed.', '同じ現場で2人以上の全員の準備が必要です。')} onClick={() => command({ type: 'start' })}>{say('함께 조사 시작', 'Begin together', '一緒に調査を始める')}</ReasonButton>}
      {self?.isLeader && members.length < FANTASY_PARTY_MAX_MEMBERS && <details><summary>{say('동료 초대', 'Invite travelers', '仲間を招待')}</summary>{users.filter(user => (!account||user.id.startsWith('fantasy:'))&&user.session === session && user.id !== selfId && !members.some(member => member.id === user.id)).map(user => <ReasonButton key={user.id} className="fr-btn" disabled={pending || actionPending || !connected} reason={reason} onClick={() => command({ type: 'invite', target: user.id })}>{user.name} +</ReasonButton>)}</details>}
      <FantasyPartyExtras profile={profile} state={state} selfId={selfId} blocked={pending || actionPending || !connected} command={command}/>
      <ReasonButton className="fr-btn" disabled={pending || actionPending || !connected} reason={reason} onClick={() => command({ type: 'leave' })}>{say('파티 나가기', 'Leave party', 'パーティーを抜ける')}</ReasonButton>
      <p className="fr-muted">{say('각자의 판정과 진행을 유지해요. 대화 속 선택과 비용도 본인에게만 적용돼요.', 'Checks and progress stay personal. Story choices and their costs also belong to each traveler.', '判定と進行は各自のものです。物語の選択と費用も本人だけに適用されます。')}</p>
    </>}
  </section>;
}
