import type { FantasyAction, FantasyProfile } from '../../../shared/fantasy.ts';
import type { NpcLocale } from '../../../shared/npc.ts';
import { applyFantasyUnderworld, FANTASY_UNDERWORLD_REWARDS, fantasyUnderworldState, fantasyUnderworldText, fantasyUnderworldNpc, type FantasyUnderworldAction } from '../../../shared/fantasy-underworld.ts';
import { itemDisplayName } from './fantasy-action-help.ts';
import { ReasonButton } from './FantasyActionButton.tsx';
import { FantasyExpeditionPanel } from './FantasyExpeditionPanel.tsx';
import { FANTASY_FRONTIER_DEPARTURE } from '../../../shared/fantasy-frontier-data.ts';

interface Props { profile: FantasyProfile; locale: NpcLocale; hour: number; realm: string; npc?: string; pending: boolean; onCommand: (action: FantasyAction) => void }
export function FantasyUnderworldPanel({ profile, locale, hour, realm, npc, pending, onCommand }: Props) {
  const c = profile.character; if (!c) return null;
  const state = fantasyUnderworldState(c), say = (ko: string, en: string, ja: string) => ({ ko, en, ja })[locale];
  return <section className="fr-card" aria-label={say('조직의 신뢰', 'Underworld trust', '組織の信用')} aria-busy={pending}>
    {c.location === FANTASY_FRONTIER_DEPARTURE && npc && fantasyUnderworldNpc(c, npc) && <FantasyExpeditionPanel c={{ ...c, hour }} route="smuggler" locale={locale} blocked={pending} onAction={onCommand}/>}
    <h3>{say('조직의 신뢰', 'Underworld trust', '組織の信用')} · {state.title[locale]}</h3>
    <p>{say('신뢰', 'Trust', '信用')} {state.trust}{state.nextTrust !== undefined ? ` / ${state.nextTrust}` : ''} · {say('사용 가능한 공적', 'Available merit', '使える功績')} {state.merit}</p>
    <p className="fr-muted">{say('조직 의뢰를 완수하면 신뢰와 공적이 쌓입니다. 악명과는 별개이며 전직해도 기록은 남습니다. 보상은 생애마다 각 한 번입니다.', 'Complete underworld contracts to earn trust and merit. Your record survives profession changes and is separate from notoriety. Each reward is available once per life.', '組織の依頼を完了すると信用と功績が貯まる。悪名とは別で、転職しても記録は残る。報酬は各一生に一度。')}</p>
    {!state.active && <p className="fr-muted">{say('보상은 현재 뒷세계 직업으로 받을 수 있습니다.', 'Return to an underworld profession to collect rewards.', '報酬は現在の裏稼業で受け取れます。')}</p>}
    <div className="fr-form-row" style={{ alignItems: 'stretch', flexWrap: 'wrap' }}>{FANTASY_UNDERWORLD_REWARDS.map(reward => {
      const action: FantasyUnderworldAction = { type: 'underworldClaim', reward: reward.id, ...(npc ? { npc } : {}) }, claimed = state.claimed.includes(reward.id);
      const quote = applyFantasyUnderworld(profile, action, { hour, realm }), reason = pending ? say('요청을 처리하고 있습니다.', 'The request is being processed.', '依頼を処理しています。') : quote.error ? fantasyUnderworldText(quote.error, locale) : undefined;
      return <article key={reward.id} style={{ flex: '1 1 180px', minWidth: 0 }}>
        <h4>{reward.names[locale]}</h4><p>{reward.descriptions[locale]}</p>
        <p className="fr-muted">{say('단계', 'Tier', '段階')} {reward.tier} · {reward.merit} {say('공적', 'merit', '功績')} · {reward.gold} G · {Object.entries(reward.inputs).map(([item, count]) => `${itemDisplayName(item, locale)} ×${count}`).join(', ')}</p>
        <ReasonButton className="fr-btn" disabled={pending || !quote.changed} reason={reason} onClick={() => onCommand(action)}>{claimed ? say('수령 완료', 'Collected', '受取済み') : say('보상 받기', 'Collect reward', '報酬を受け取る')}</ReasonButton>
      </article>;
    })}</div>
  </section>;
}
