import { useEffect, useState } from 'react';
import type { FantasyAction, FantasyCharacter } from '../../../shared/fantasy.ts';
import { FANTASY_JOBS } from '../../../shared/fantasy-data.ts';
import { fantasyCombatJob, fantasyIsLifeJob, fantasyLifeJob } from '../../../shared/fantasy-careers.ts';
import { useLocale } from '../locale.ts';
import { useStore } from '../store.ts';
import { ReasonButton } from './FantasyActionButton.tsx';
import { FantasyAdvancementPanel } from './FantasyAdvancementPanel.tsx';
import { FantasyPriestPanel } from './FantasyPriestPanel.tsx';
import { actionHelp } from './fantasy-action-help.ts';
import { realDuration } from './FantasyActivity.tsx';

export interface FantasyCareerOffer { job: string; via?: 'guild' | 'npc' | 'gm'; npcId?: string }
type Props = { c: FantasyCharacter; offers: FantasyCareerOffer[]; onAction: (action: FantasyAction) => void; blocked: boolean };
function CareerSlot({ c, offers, onAction, blocked, slot }: Props & { slot: 'combat' | 'life' }) {
  const [locale] = useLocale(), [changing, setChanging] = useState(false), profile = useStore(s => s.fantasyProfile);
  const currentId = slot === 'life' ? fantasyLifeJob(c) : fantasyCombatJob(c);
  const say = (ko: string, en: string, ja: string) => ({ ko, en, ja })[locale];
  useEffect(() => setChanging(false), [currentId]);
  const hasJob = !!currentId && currentId !== 'unassigned', current = FANTASY_JOBS.find(job => job.id === currentId);
  const choices = offers.filter(offer => fantasyIsLifeJob(offer.job) === (slot === 'life') && offer.job !== currentId);
  return <section className="fr-career-panel" data-career-slot={slot}>
    <h3>{slot === 'combat' ? say('주직업 · 전투', 'Main profession · Combat', '主職 · 戦闘') : say('서브직업 · 생산·생활', 'Secondary profession · Crafting and life', '副職 · 生産・生活')}</h3>
    {hasJob ? <><h4>{current?.names[locale]}</h4>{currentId === 'priest' ? profile && <FantasyPriestPanel profile={profile} onAction={onAction}/> : <FantasyAdvancementPanel c={{ ...c, job: currentId! }} onAction={onAction} blocked={blocked}/>}</> : <p className="fr-muted">{say('아직 선택하지 않았습니다.', 'No profession chosen yet.', 'まだ選んでいません。')}</p>}
    {(!hasJob || changing) && choices.length > 0 && <div className="fr-career-offers">{choices.map(offer => {
      const job = FANTASY_JOBS.find(job => job.id === offer.job); if (!job) return null;
      const action: FantasyAction = { type: 'job', ...offer }, reason = actionHelp(c, action, locale);
      return <div className="fr-service-row" key={job.id}><span>{job.names[locale]}<small>{realDuration(1, locale)}</small></span><ReasonButton type="button" className="fr-btn" disabled={blocked || !!reason} reason={reason} onClick={() => onAction(action)}>{hasJob ? slot === 'combat' ? say('이 주직업으로 변경', 'Change main profession', 'この主職に変更') : say('이 서브직업으로 변경', 'Change secondary profession', 'この副職に変更') : slot === 'combat' ? say('주직업 배우기', 'Learn main profession', '主職を学ぶ') : say('서브직업 배우기', 'Learn secondary profession', '副職を学ぶ')}</ReasonButton></div>;
    })}</div>}
    {hasJob && choices.length > 0 && <div className="fr-career-change"><ReasonButton type="button" className="fr-btn" aria-expanded={changing} disabled={blocked} onClick={() => setChanging(!changing)}>{changing ? say('직업 변경 닫기', 'Close profession change', '職業変更を閉じる') : slot === 'combat' ? say('주직업 변경', 'Change main profession', '主職を変更') : say('서브직업 변경', 'Change secondary profession', '副職を変更')}</ReasonButton></div>}
    {hasJob && slot === 'life' && <ReasonButton type="button" className="fr-btn" disabled={blocked} onClick={() => onAction({ type: 'work', career: 'life' })}>{say('서브직업으로 일하기', 'Work in your secondary profession', '副職で働く')} · {realDuration(4, locale)}</ReasonButton>}
  </section>;
}
export function FantasyCareerPanel(props: Props) {
  return <div className="fr-careers"><CareerSlot {...props} slot="combat"/><CareerSlot {...props} slot="life"/></div>;
}
