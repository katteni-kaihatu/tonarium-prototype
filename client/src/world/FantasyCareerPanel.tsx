import { useEffect, useState } from 'react';
import type { FantasyAction, FantasyCharacter } from '../../../shared/fantasy.ts';
import { FANTASY_JOBS } from '../../../shared/fantasy-data.ts';
import { useLocale } from '../locale.ts';
import { useStore } from '../store.ts';
import { ReasonButton } from './FantasyActionButton.tsx';
import { FantasyAdvancementPanel } from './FantasyAdvancementPanel.tsx';
import { FantasyPriestPanel } from './FantasyPriestPanel.tsx';
import { actionHelp } from './fantasy-action-help.ts';
import { realDuration } from './FantasyActivity.tsx';

export interface FantasyCareerOffer { job: string; via?: 'guild' | 'npc' | 'gm'; npcId?: string }
export function FantasyCareerPanel({ c, offers, onAction, blocked }: { c: FantasyCharacter; offers: FantasyCareerOffer[]; onAction: (action: FantasyAction) => void; blocked: boolean }) {
  const [locale] = useLocale(), [changing, setChanging] = useState(false), profile = useStore(s => s.fantasyProfile);
  const say = (ko: string, en: string, ja: string) => ({ ko, en, ja })[locale];
  useEffect(() => setChanging(false), [c.job]);
  const hasJob = c.job !== 'unassigned', current = FANTASY_JOBS.find(job => job.id === c.job);
  return <section className="fr-career-panel">
    {hasJob && <><h3>{current?.names[locale]}</h3>{c.job === 'priest' ? profile && <FantasyPriestPanel profile={profile} onAction={onAction}/> : <FantasyAdvancementPanel c={c} onAction={onAction} blocked={blocked}/>}</>}
    {(!hasJob || changing) && <div className="fr-career-offers">{offers.filter(offer => offer.job !== c.job).map(offer => {
      const job = FANTASY_JOBS.find(job => job.id === offer.job); if (!job) return null;
      const action: FantasyAction = { type: 'job', ...offer }, reason = actionHelp(c, action, locale);
      return <div className="fr-service-row" key={job.id}><span>{job.names[locale]}<small>{realDuration(1, locale)}</small></span><ReasonButton className="fr-btn" disabled={blocked || !!reason} reason={reason} onClick={() => onAction(action)}>{say('이 직업으로 변경', 'Choose this profession', 'この職業に変える')}</ReasonButton></div>;
    })}</div>}
    {hasJob && <div className="fr-career-change"><ReasonButton className="fr-btn" disabled={blocked} onClick={() => setChanging(!changing)}>{changing ? say('직업 변경 닫기', 'Close profession change', '職業変更を閉じる') : say('직업 변경', 'Change profession', '職業変更')}</ReasonButton></div>}
  </section>;
}
