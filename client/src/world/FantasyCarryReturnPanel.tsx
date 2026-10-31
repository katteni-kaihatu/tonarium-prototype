import type { FantasyProfile } from '../../../shared/fantasy.ts';
import type { FantasyCarryReturnMethod } from '../../../shared/fantasy-carry-return.ts';
import { FANTASY_RETURN_LANTERN_FATIGUE, FANTASY_RETURN_LANTERN_HOURS, FANTASY_RETURN_LANTERN_MP, fantasyReturnLanternSiteAllowed } from '../../../shared/fantasy-carry-return.ts';
import { fantasyIsSaint } from '../../../shared/fantasy-miracles.ts';
import { useLocale } from '../locale.ts';
import { ReasonButton } from './FantasyActionButton.tsx';

export interface FantasyCarryReturnPeer {
  id: string; name: string; here?: boolean; downed?: boolean; downedKind?: 'damage' | 'sacrifice'; carriedBy?: string;
  returnLantern?: { endsAt: number; invited: boolean; accepted: boolean };
}
export function FantasyCarryReturnPanel({ profile, selfId, peers, blocked = false, showCarryControls = true, onCommand }: {
  profile: FantasyProfile; selfId: string; peers: readonly FantasyCarryReturnPeer[]; blocked?: boolean;
  showCarryControls?: boolean;
  onCommand: (target: string, method: FantasyCarryReturnMethod) => void;
}) {
  const [locale] = useLocale(), c = profile.character;
  const say = (ko: string, en: string, ja: string) => ({ ko, en, ja })[locale];
  if (!c || profile.death) return null;
  const others = peers.filter(peer => peer.id !== selfId), patient = c.carrying && peers.find(peer => peer.id === c.carrying!.target);
  const unavailable = blocked ? say('요청을 확인하거나 연결을 기다리고 있습니다.', 'Waiting for the request or connection.', '依頼の確認か接続を待っています。') : profile.combatId || profile.activity || profile.event || c.downed || c.hp <= 0 || c.travelPosition ? say('전투나 행동을 마치고 의식이 있는 상태여야 합니다.', 'You must be conscious and outside combat, travel, and other activities.', '意識があり、戦闘・移動・ほかの行動がない状態で使えます。') : undefined;
  const channelReason = c.returnLantern ? say('귀환 기도가 끝날 때까지 기다리세요.', 'Wait for the Return Lantern prayer to finish.', '帰還の祈りが終わるまで待ってください。') : undefined;
  const ready = fantasyIsSaint(c) && !!c.miracles?.prepared.includes('miracle-return-lantern');
  const returnReason = unavailable ?? channelReason ?? (!ready ? say('성자 사제로 귀환의 등불을 준비해야 합니다.', 'Prepare Return Lantern as a Saint priest.', '聖者の司祭として帰還の灯を準備してください。') : !fantasyReturnLanternSiteAllowed(c) ? say('이 던전에서는 귀환의 등불을 사용할 수 없습니다.', 'Return Lantern is unavailable in this dungeon.', 'このダンジョンでは帰還の灯を使えません。') : c.mp < FANTASY_RETURN_LANTERN_MP || c.fatigue + FANTASY_RETURN_LANTERN_FATIGUE > 100 ? say('MP 45와 피로 여유 35가 필요합니다.', 'You need 45 MP and room for 35 fatigue.', 'MP45と疲労35の余裕が必要です。') : undefined);
  const incoming = others.filter(peer => peer.returnLantern?.invited);
  const carriedBy = peers.find(peer => peer.id === selfId)?.carriedBy;
  if (!others.some(peer => peer.downed) && !c.carrying && !carriedBy && !fantasyIsSaint(c) && !incoming.length) return null;
  return <section className="fr-card fr-carry-return">
    <h3>{showCarryControls ? say('동료 부축 · 귀환', 'Carry companions · Return', '仲間を運ぶ・帰還') : say('동료 간호 · 귀환', 'Care for companions · Return', '仲間の看護・帰還')}</h3>
    {carriedBy && <p role="status">{say('동료가 부축하여 함께 이동합니다.', 'A companion is carrying you as they travel.', '仲間に運ばれ、一緒に移動しています。')} · {peers.find(peer => peer.id === carriedBy)?.name ?? carriedBy}</p>}
    {c.carrying && <p role="status">{say('부축 중', 'Carrying', '運んでいる仲間')} · {patient?.name ?? c.carrying.target}</p>}
    {others.filter(peer => peer.downed || c.carrying?.target === peer.id).map(peer => {
      const here = peer.here !== false;
      const reason = unavailable ?? channelReason ?? (!here ? say('같은 장소와 던전 방으로 모이세요.', 'Meet at the same location and dungeon room.', '同じ場所とダンジョンの部屋に集まってください。') : undefined);
      const carrying = c.carrying?.target === peer.id;
      const carryReason = reason ?? (!carrying && (c.carrying || peer.carriedBy) ? say('한 번에 동료 한 명만 부축할 수 있습니다.', 'Only one companion can be carried at a time.', '一度に運べる仲間は一人です。') : undefined);
      const tendReason = reason ?? (peer.downedKind === 'sacrifice' ? say('희생으로 쓰러진 상태에는 일반 간호를 사용할 수 없습니다.', 'Ordinary care cannot treat a sacrificial collapse.', '犠牲で倒れた状態には通常の看護を使えません。') : undefined);
      return <article key={peer.id} className="fr-card"><b>{peer.name}</b><div className="fr-inline-actions">
        {showCarryControls && <ReasonButton type="button" className="fr-btn" disabled={!!carryReason} reason={carryReason} onClick={() => onCommand(peer.id, carrying ? 'putDown' : 'carry')}>{carrying ? say('내려놓기', 'Put down', '下ろす') : say('부축하기', 'Carry', '運ぶ')}</ReasonButton>}
        <ReasonButton type="button" className="fr-btn" disabled={!!tendReason} reason={tendReason} onClick={() => onCommand(peer.id, 'tend')}>{say('간호하기', 'Tend', '看護する')}</ReasonButton>
      </div><small>{say('간호는 회복약 1개를 쓰고 남은 시간을 2시간 늘립니다. 1시간 간격, 합계 12시간까지입니다.', 'Care spends one healing potion and adds two hours: once per hour, up to 12 extra hours in total.', '看護は回復薬を一つ使い、残る時間を2時間延ばします。1時間間隔で、合計12時間まで。')}</small></article>;
    })}
    {fantasyIsSaint(c) && <div>
      <p>{say('귀환의 등불은 던전 시작 지점으로 돌아갑니다. 의식이 있는 동료는 직접 동의하고 같은 방에서 기다려야 합니다. 부축 중인 동료도 함께 갑니다.', 'Return Lantern returns to the dungeon starting point. Conscious companions must agree and wait in the same room. Carried companions accompany them.', '帰還の灯はダンジョンの開始地点へ戻ります。意識のある仲間は同意し、同じ部屋で待つ必要があります。運んでいる仲間も一緒に戻ります。')}</p>
      {c.returnLantern ? <p role="status">{say('귀환 기도 중', 'Channeling Return Lantern', '帰還の祈りを捧げている')} · {Math.max(0, c.returnLantern.endsAt - c.hour).toFixed(1)} h</p> : <ReasonButton type="button" className="fr-btn" disabled={!!returnReason} reason={returnReason} onClick={() => onCommand(selfId, 'returnInvite')}>{say('귀환의 등불', 'Return Lantern', '帰還の灯')} · {FANTASY_RETURN_LANTERN_HOURS} h · MP {FANTASY_RETURN_LANTERN_MP} · {say('피로', 'Fatigue', '疲労')} +{FANTASY_RETURN_LANTERN_FATIGUE}</ReasonButton>}
    </div>}
    {incoming.map(peer => {
      const reason = unavailable ?? channelReason ?? (peer.here === false ? say('초대한 동료와 같은 방에 있어야 합니다.', 'Remain in the inviting companion’s room.', '招待した仲間と同じ部屋にいる必要があります。') : undefined);
      return <article key={peer.id} className="fr-card"><p>{peer.name} · {say('귀환의 등불 초대', 'Return Lantern invitation', '帰還の灯の招待')} · {Math.max(0, peer.returnLantern!.endsAt - c.hour).toFixed(1)} h</p>
        {peer.returnLantern!.accepted && <p role="status">{say('귀환에 동의했습니다. 기도가 끝날 때까지 같은 방에서 기다리세요.', 'You agreed to return. Stay in the same room until the prayer ends.', '帰還に同意しました。祈りが終わるまで同じ部屋で待ってください。')}</p>}
        <div className="fr-inline-actions">{!peer.returnLantern!.accepted && <ReasonButton type="button" className="fr-btn" disabled={!!reason} reason={reason} onClick={() => onCommand(peer.id, 'returnAccept')}>{say('함께 귀환에 동의', 'Agree to return', '一緒の帰還に同意')}</ReasonButton>}
          <ReasonButton type="button" className="fr-btn" disabled={!!reason} reason={reason} onClick={() => onCommand(peer.id, 'returnDecline')}>{say('거절', 'Decline', '断る')}</ReasonButton>
        </div>
      </article>;
    })}
  </section>;
}
