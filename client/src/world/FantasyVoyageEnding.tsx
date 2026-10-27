import type { FantasyAction, FantasyCharacter } from '../../../shared/fantasy.ts';
import { fantasyVoyageEnding, fantasyVoyageFinishError } from '../../../shared/fantasy-voyage-ending.ts';
import { FANTASY_FINAL_ISLE_ID } from '../../../shared/fantasy-isle-access.ts';
import { useLocale } from '../locale.ts';
import { ReasonButton } from './FantasyActionButton.tsx';
import { fantasyErrorText } from './fantasy-copy.ts';

export function FantasyVoyageEnding({ c, blocked, onAction, onSelect }: { c: FantasyCharacter; blocked?: boolean; onAction?: (action: FantasyAction) => void; onSelect?: (id: string) => void }) {
  const [locale] = useLocale(), ending = fantasyVoyageEnding(c, locale);
  if (ending) return <details className="fr-fold fr-voyage-ending" open><summary>{ending.title} ✓</summary>{ending.paragraphs.map((paragraph, index) => <p key={index}>{paragraph}</p>)}</details>;
  if (!c.completed.includes('main-night-18')) return null;
  const error = fantasyVoyageFinishError(c);
  return <details className="fr-fold fr-voyage-ending" open><summary>{{ ko: '새벽너머의 항로 · 마지막 항해', en: 'Passage Beyond Dawn · The final voyage', ja: '暁の向こうへの航路・最後の航海' }[locale]}</summary>
    <p>{{ ko: '항로가 완성되었습니다. 섬에 직접 도착해 항해 일지의 마지막 장을 남기세요.', en: 'Your route is complete. Reach the island and write the final page of your voyage journal.', ja: '航路が完成しました。島に辿り着き、航海日誌の最後の頁を残してください。' }[locale]}</p>
    {onSelect && <ReasonButton className="fr-text-button" onClick={() => onSelect(FANTASY_FINAL_ISLE_ID)}>{{ ko: '섬의 항로 확인', en: 'View the island route', ja: '島への航路を確認' }[locale]} ↗</ReasonButton>}
    {onAction && <ReasonButton className="fr-btn" disabled={blocked || !!error} reason={error ? fantasyErrorText(error, locale) : undefined} onClick={() => onAction({ type: 'finishVoyage' })}>{{ ko: '항해 일지 완성', en: 'Complete voyage journal', ja: '航海日誌を完成' }[locale]}</ReasonButton>}
  </details>;
}
