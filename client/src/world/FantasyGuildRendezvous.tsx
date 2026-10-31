import { FANTASY_WORLD_TIME_RATE, type FantasyAction, type FantasyCharacter } from '../../../shared/fantasy.ts';
import { FANTASY_QUESTS } from '../../../shared/fantasy-data.ts';
import { fantasyContractHunt, fantasyContractMode } from '../../../shared/fantasy-contracts.ts';
import { fantasyGuildRankName } from '../../../shared/fantasy-adventurer.ts';
import { fantasyQuestText } from '../../../shared/fantasy-narrative.ts';
import { fantasyOnRoad } from '../../../shared/fantasy-travel.ts';
import { useLocale } from '../locale.ts';
import { useStore } from '../store.ts';
import { gameClock } from './fantasy-copy.ts';
import { ReasonButton } from './FantasyActionButton.tsx';

export function FantasyGuildRendezvous({ c, onAction, blocked }: { c: FantasyCharacter; onAction: (action: FantasyAction) => void; blocked: boolean }) {
  const [locale] = useLocale();
  const clockHour = useStore(state => state.fantasyClock?.hour);
  const connected = useStore(state => state.wsConnected);
  const pending = useStore(state => state.fantasyPending || state.fantasyCombatPending || state.fantasyPartyPending || state.fantasyRealmPending);
  const profile = useStore(state => state.fantasyProfile);
  const party = useStore(state => state.fantasyParty), selfId = useStore(state => state.selfId);
  const inParty = !!party?.id && party.members.length > 1, leader = !!party?.members.find(member => member.id === selfId)?.isLeader;
  const hour = Math.max(c.hour, clockHour ?? c.hour);
  const say = (ko: string, en: string, ja: string) => ({ ko, en, ja })[locale];
  const waiting = FANTASY_QUESTS.flatMap(quest => {
    const grant = c.contracts?.[quest.id];
    if (!c.quests.includes(quest.id) || c.completed.includes(quest.id) || quest.destination !== c.location || quest.objective?.type !== 'hunt' || fantasyContractMode(quest) !== 'raid'
      || !grant || grant.startsAt === undefined || grant.startedAt !== undefined || grant.progress >= quest.objective.count) return [];
    return [{ quest, grant }];
  });
  if (!waiting.length) return null;
  const disabled = blocked || !connected || pending || !profile || !!profile.death || !!profile.activity || !!profile.combatId || !!profile.event || c.hp <= 0 || !!c.downed || !!c.carrying || !!c.returnLantern || fantasyOnRoad(c);
  return <section>
    <h3>{say('길드 공동토벌 집결', 'Guild raid rendezvous', 'ギルド共同討伐の集合')}</h3>
    <p className="fr-muted">{say('길드에서 참가한 뒤 목적지까지 직접 이동해야 합니다. 집결 시각 이후 이 현장에 있는 참가자 중 전투할 수 있는 인원으로 시작합니다.', 'Travel to the destination after signing up at the guild. Once muster time arrives, joined players who are here and available can begin.', 'ギルドで参加した後、目的地まで自分で移動します。集合時刻以降、現地にいる参加者のうち戦える人で開始します。')}</p>
    {inParty && <p className="fr-muted">{say('파티장이 출전을 제안하면 각자 참가·거절·불참을 선택합니다. 직업과 관계없이 참가자의 의뢰 보수는 균등하게 나눕니다. 길드 공적은 등록 계약자에게만 기록됩니다.', 'The party leader proposes the raid, then each member accepts, declines or sits out. Contract pay is shared equally among participants regardless of profession. Guild merit belongs to registered contractors.', 'リーダーが出発を提案し、各自が参加・辞退・不参加を選びます。依頼の報酬は職を問わず参加者で均等に分け、ギルドの功績は登録契約者だけに記録します。')}</p>}
    {waiting.map(({ quest, grant }) => {
      const startsAt = grant.startsAt!;
      const grade = grant.grade ?? fantasyContractHunt(quest)?.grade;
      const due = hour >= startsAt;
      const hours = Math.max(0, startsAt - hour);
      const minutes = Math.ceil(hours * 60 / FANTASY_WORLD_TIME_RATE);
      const proposed = inParty && !!party?.combatProposal, partyReason = inParty && !leader ? say('파티장의 제안을 기다린 뒤 각자 참가 여부를 선택하세요.', 'Wait for the party leader’s proposal, then choose whether to join.', 'リーダーの提案を待ち、自分の参加を選んでください。') : proposed ? say('파티원의 참가 여부를 확인 중입니다. 전투 제안에서 답하거나 출발하세요.', 'The raid proposal is awaiting decisions. Respond or start through the battle proposal.', '参加判断を確認中です。戦闘の提案で返答や開始を選んでください。') : undefined;
      return <article key={grant.offerId} className="fr-card">
        <h4>{fantasyQuestText(quest, locale).name}</h4>
        {grade !== undefined && <p>{say('의뢰 전체 권장 등급', 'Recommended rank for the whole contract', '依頼全体の推奨等級')}: <strong>{fantasyGuildRankName(grade, locale)}</strong></p>}
        <p>{say('집결 시각', 'Muster time', '集合時刻')}: <strong>{gameClock(startsAt, locale)}</strong></p>
        <p role="status">{due ? say('집결 시각이 되었습니다. 현장에서 시작할 수 있습니다.', 'Muster time has arrived. The raid can start here.', '集合時刻になりました。現地で開始できます。') : say(`집결까지 게임 ${hours.toFixed(1)}시간 · 실제 약 ${minutes}분`, `${hours.toFixed(1)} game hours until muster · about ${minutes} real min`, `集合までゲーム内${hours.toFixed(1)}時間・実時間約${minutes}分`)}</p>
        <ReasonButton type="button" className="fr-btn primary" disabled={disabled || !due || !!partyReason} reason={partyReason ?? (c.carrying?say('부축 중인 동료를 먼저 내려놓아 주세요.','Put down the companion you are carrying first.','運んでいる仲間を先に降ろしてください。'):!due ? say('집결 시각이 되면 이 현장에서 시작할 수 있습니다.', 'Start here once muster time arrives.', '集合時刻から現地で開始できます。') : undefined)} onClick={() => {
          if (disabled || !due || partyReason) return;
          onAction({ type: 'guildRaidStart', offer: grant.offerId });
        }}>{inParty ? say('파티에 공동토벌 제안', 'Propose raid to party', 'パーティーに共同討伐を提案') : say('현장에서 공동토벌 시작', 'Start raid here', '現地で共同討伐を開始')}</ReasonButton>
      </article>;
    })}
  </section>;
}
