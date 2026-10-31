import { FantasyCarryReturnPanel } from './FantasyCarryReturnPanel.tsx';
import { fantasyMainStage } from '../../../shared/fantasy-main-trials.ts';
import { useEffect } from 'react';
import type { FantasyProfile } from '../../../shared/fantasy.ts';
import { FANTASY_PARTY_MAX_MEMBERS, fantasyPartyErrorText, type FantasyPartyCommand } from '../../../shared/fantasy-party.ts';
import { useLocale } from '../locale.ts';
import { get, set, useStore } from '../store.ts';
import { send } from '../net/ws.ts';
import { ReasonButton } from './FantasyActionButton.tsx';
import { FantasyPartyExtras } from './FantasyPartyExtras.tsx';

export function FantasyPartyPanel({ profile }: { profile: FantasyProfile }) {
  const [locale] = useLocale(), state = useStore(s => s.fantasyParty), error = useStore(s => s.fantasyPartyError);
  const pending = useStore(s => s.fantasyPartyPending), connected = useStore(s => s.wsConnected), selfId = useStore(s => s.selfId);
  const actionPending = useStore(s => s.fantasyPending || s.fantasyCombatPending);
  const session = useStore(s => s.session), users = useStore(s => s.users), c = profile.character;
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
  const aid = (target: string, method: 'carry' | 'putDown') => {
    const current = get();
    if (!current.wsConnected || current.fantasyPartyPending || current.fantasyPending || current.fantasyCombatPending) return;
    set({ fantasyPending: true, fantasyError: null });
    send({ t: 'fantasyAid', target, method });
  };
  const self = state?.members.find(member => member.id === selfId), members = state?.members ?? [];
  const activeInvestigation=c?.quests.some(quest=>fantasyMainStage(c,quest)?.location===c.location);
  const busy = !!profile.activity || !!profile.event || !!profile.death || !!profile.combatId || !c;
  const transportReason = !connected ? say('연결을 기다리고 있어요.', 'Waiting for connection.', '接続を待っています。') : pending || actionPending ? say('요청을 확인 중이에요.', 'Waiting for the request.', '依頼を確認しています。') : undefined;
  const reason = transportReason ?? (busy ? say('현재 행동이나 사건을 먼저 마쳐 주세요.', 'Finish the current activity or encounter.', 'いまの行動や出来事を先に終えてください。') : undefined);
  const carryReason = (member: typeof members[number], puttingDown: boolean): string | undefined => {
    if (transportReason) return transportReason;
    if (!c || profile.death || c.hp <= 0 || c.downed) return say('의식이 있는 동료가 부축할 수 있습니다.', 'A conscious companion can carry someone.', '意識のある仲間が運べます。');
    if (profile.combatId) return say('전투를 마친 뒤 파티에서 부축하거나 내려놓으세요.', 'Finish combat before carrying or putting down a companion here.', '戦闘を終えてからパーティーで運ぶ・降ろすを選んでください。');
    if (profile.activity || profile.event || c.travelPosition) return say('현재 행동·사건·이동을 마쳐 주세요.', 'Finish the current activity, encounter or journey.', 'いまの行動・出来事・移動を終えてください。');
    if (c.returnLantern) return say('귀환 기도가 끝날 때까지 기다리세요.', 'Wait for the Return Lantern prayer to finish.', '帰還の祈りが終わるまで待ってください。');
    if (!member.here) return say('같은 장소와 던전 방으로 모이세요.', 'Meet at the same location and dungeon room.', '同じ場所とダンジョンの部屋に集まってください。');
    if (puttingDown) {
      const link = c.carrying;
      if (!link || link.party !== state?.id || link.generation !== (profile.generation ?? 1) || link.target !== member.id || member.carriedBy !== selfId) return say('부축 상태가 바뀌었습니다. 파티 정보를 다시 확인하세요.', 'The carry state changed. Wait for the party list to refresh.', '運搬状態が変わりました。パーティー情報の更新を待ってください。');
    } else {
      if (c.carrying || member.carriedBy) return say('한 번에 동료 한 명만 부축할 수 있습니다.', 'Only one companion can be carried at a time.', '一度に運べる仲間は一人です。');
      if (!member.downed) return say('아직 쓰러져 있는 동료만 부축할 수 있습니다.', 'Only a companion who is still downed can be carried.', 'まだ倒れている仲間だけを運べます。');
    }
    return undefined;
  };
  return <section className="fr-party"><h2>{say('파티', 'Party', 'パーティー')}{state?.id && ` · ${members.length}/${FANTASY_PARTY_MAX_MEMBERS}`}</h2>
    {!state?.id&&<FantasyCarryReturnPanel profile={profile} selfId={selfId} peers={[]} blocked={pending||actionPending||!connected} showCarryControls={false} onCommand={(target,method)=>send({t:'fantasyAid',target,method})}/>}
    {error && <p role="alert" className="fr-error">{fantasyPartyErrorText(error, locale)}</p>}
    {state?.invitations.map(invite => <article key={invite.id} className="fr-party-invite"><p>{say(`${invite.fromName}의 파티 초대`, `Party invitation from ${invite.fromName}`, `${invite.fromName}からの招待`)}</p><div className="fr-action-grid">
      <ReasonButton className="fr-btn" disabled={pending || actionPending || !connected || busy} reason={reason} onClick={() => command({ type: 'respond', invite: invite.id, accept: true })}>{say('수락', 'Accept', '参加')}</ReasonButton>
      <ReasonButton className="fr-btn" disabled={pending || actionPending || !connected} reason={reason} onClick={() => command({ type: 'respond', invite: invite.id, accept: false })}>{say('거절', 'Decline', '辞退')}</ReasonButton>
    </div></article>)}
    {!state?.id ? <ReasonButton className="fr-btn" disabled={pending || actionPending || !connected || busy} reason={reason} onClick={() => command({ type: 'create' })}>{say('파티 만들기', 'Create a party', 'パーティーを作る')}</ReasonButton> : <>
      <ul className="fr-party-members">{members.map(member => {
        const puttingDown = c?.carrying?.target === member.id;
        const showCarry = member.id !== selfId && (member.downed || puttingDown);
        const disabledReason = showCarry ? carryReason(member, puttingDown) : undefined;
        return <li key={member.id} style={{ flexWrap: 'wrap', alignItems: 'center' }}><b>{member.name}{member.isLeader ? ' ♛' : ''}</b><span>{member.downed ? say('빈사', 'Downed', '瀕死') : member.travelReady ? say('이동 동의함', 'Travel agreed', '移動に同意') : member.combatReady ? say('전투 준비됨', 'Battle ready', '戦闘準備完了') : member.ready ? say('준비됨', 'Ready', '準備完了') : !member.here ? say('다른 장소', 'Elsewhere', '別の場所') : !member.compatible && activeInvestigation ? say('조사 단계가 다름', 'Different investigation', '調査段階が違う') : say('준비 대기', 'Not ready', '準備待ち')}{member.carriedBy && ` · ${say('부축 중', 'Carried', '運搬中')}`}</span>
          {showCarry && <ReasonButton type="button" className="fr-btn" disabled={!!disabledReason} reason={disabledReason} onClick={() => aid(member.id, puttingDown ? 'putDown' : 'carry')}>{puttingDown ? say('내려놓기', 'Put down', '降ろす') : say('부축하기', 'Carry', '運ぶ')}</ReasonButton>}
        </li>;
      })}</ul>
      {self?.isLeader && members.length > 1 && <details className="fr-party-manage"><summary>{say('파티장 넘기기 · 내보내기', 'Hand over lead · Remove member', 'リーダー交代・追放')}</summary><ul>{members.filter(member => !member.isLeader).map(member => <li key={member.id}><b>{member.name}</b><ReasonButton className="fr-btn" disabled={pending || actionPending || !connected} reason={reason} onClick={() => command({ type: 'transferLeader', target: member.id })}>{say('파티장 넘기기', 'Make leader', 'リーダーにする')}</ReasonButton><ReasonButton className="fr-btn" disabled={pending || actionPending || !connected} reason={reason} onClick={() => command({ type: 'kick', target: member.id })}>{say('내보내기', 'Remove', '追放')}</ReasonButton></li>)}</ul></details>}
      {self?.isLeader && members.length < FANTASY_PARTY_MAX_MEMBERS && <details><summary>{say('동료 초대', 'Invite travelers', '仲間を招待')}</summary>{users.filter(user => user.session === session && user.id !== selfId && !members.some(member => member.id === user.id)).map(user => <ReasonButton key={user.id} className="fr-btn" disabled={pending || actionPending || !connected} reason={reason} onClick={() => command({ type: 'invite', target: user.id })}>{user.name} +</ReasonButton>)}</details>}
      <FantasyPartyExtras profile={profile} state={state} selfId={selfId} blocked={pending || actionPending || !connected} command={command}/>
      <ReasonButton className="fr-btn" disabled={pending || actionPending || !connected} reason={reason} onClick={() => command({ type: 'leave' })}>{say('파티 나가기', 'Leave party', 'パーティーを抜ける')}</ReasonButton>
      <p className="fr-muted">{say('조사 방법과 전투는 의뢰에서, 이동 제안은 지도에서 정하세요. 함정과 부상은 각자 판정합니다.', 'Choose investigations and battles in Quests, and propose travel on the map. Traps and injuries are resolved individually.', '調査と戦闘は依頼で、移動の提案は地図で選びます。罠と負傷は個別に判定します。')}</p>
    </>}
  </section>;
}
