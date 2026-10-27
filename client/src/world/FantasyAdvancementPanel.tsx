import type { FantasyAction, FantasyCharacter } from '../../../shared/fantasy.ts';
import { FANTASY_JOB_PATHS, FANTASY_JOB_PATH_CHANGE_COST, fantasyJobPathError } from '../../../shared/fantasy-job-paths.ts';
import { useLocale } from '../locale.ts';
import { ReasonButton } from './FantasyActionButton.tsx';
import { realDuration } from './FantasyActivity.tsx';
import { fantasyJobPathDiscovered } from '../../../shared/fantasy-job-discovery.ts';

export function FantasyAdvancementPanel({ c, onAction, blocked = false }: { c: FantasyCharacter; onAction: (action: FantasyAction) => void; blocked?: boolean }) {
  const [locale] = useLocale();
  const say = (ko: string, en: string, ja: string) => ({ ko, en, ja })[locale];
  const knownJob = FANTASY_JOB_PATHS.filter(path => path.job === c.job), choices = knownJob.filter(path => fantasyJobPathDiscovered(c, path.id)), current = c.jobPaths?.[c.job];
  if (!knownJob.length) return null;
  return <section className="fr-advancement"><h3>{say('전문 분야', 'Specialization', '専門分野')}</h3>
    {!choices.length && <p className="fr-muted">{say('아직 알려진 전문 분야가 없습니다.', 'No specializations are known yet.', 'まだ知られている専門分野はありません。')}</p>}
    {choices.map(path => {
      const chosen = current?.path === path.id, error = fantasyJobPathError(c, path.id, locale);
      const reason = blocked ? say('현재 행동이나 요청을 먼저 마쳐 주세요.', 'Finish the current activity or request first.', 'いまの行動や依頼を先に終えてください。') : error;
      return <article key={path.id} className="fr-skill-brief"><div><b>{path.names[locale]}</b>{chosen && <span>{say('현재 분야', 'Current field', '現在の分野')}</span>}</div><p>{path.fields[locale]}</p>
        {!chosen && <ReasonButton className="fr-btn" disabled={!!reason} reason={reason} onClick={() => onAction({ type: 'advanceJob', path: path.id })}>
          {current ? say(`이 분야로 변경 · ${FANTASY_JOB_PATH_CHANGE_COST}G`, `Change to this field · ${FANTASY_JOB_PATH_CHANGE_COST}G`, `この分野へ変更・${FANTASY_JOB_PATH_CHANGE_COST}G`) : say('이 분야로 전직', 'Advance to this field', 'この分野へ進む')}
          <small className="fr-action-time">{realDuration(1,locale)}</small>
        </ReasonButton>}
      </article>;
    })}
  </section>;
}
