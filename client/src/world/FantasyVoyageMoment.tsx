import type { FantasyAction, FantasyCharacter } from '../../../shared/fantasy.ts';
import { fantasyVoyageDecisionError, fantasyVoyagePendingDecisions } from '../../../shared/fantasy-voyage-decisions.ts';
import { fantasyVoyageReactions } from '../../../shared/fantasy-voyage-immersion.ts';
import { NPC_PUBLIC } from '../../../shared/npc.ts';
import { useLocale } from '../locale.ts';
import { ReasonButton } from './FantasyActionButton.tsx';
import { fantasyErrorText } from './fantasy-copy.ts';

export function FantasyVoyageMoment({ c, quest, blocked, onAction }: { c: FantasyCharacter; quest: string; blocked: boolean; onAction: (action: FantasyAction) => void }) {
  const [locale] = useLocale();
  const decision = fantasyVoyagePendingDecisions(c).find(value => value.quest === quest);
  const voice = fantasyVoyageReactions(c).filter(value => NPC_PUBLIC.find(npc => npc.id === value.npcId)?.homeLocation === c.location).at(-1);
  return <section className="fr-voyage-moment">
    {decision && <article><p>{decision.setup[locale]}</p><div className="fr-story-choices">{decision.choices.map(choice => {
      const error = fantasyVoyageDecisionError(c, decision.id, choice.id);
      return <ReasonButton key={choice.id} className="fr-btn" disabled={blocked || !!error} reason={error ? fantasyErrorText(error, locale) : undefined} onClick={() => onAction({ type: 'voyageDecision', decision: decision.id, choice: choice.id })}>{choice.label[locale]}{choice.gold > 0 && ` · −${choice.gold} G`}{choice.fatigue > 0 && ` · ${{ ko: '피로', en: 'Fatigue', ja: '疲労' }[locale]} +${choice.fatigue}`}</ReasonButton>;
    })}</div></article>}
    {voice && <details><summary>{NPC_PUBLIC.find(npc => npc.id === voice.npcId)?.name[locale]} · {{ ko: '이번 여정에 관해', en: 'About the journey', ja: 'この旅について' }[locale]}</summary><p>{voice.text[locale]}</p></details>}
  </section>;
}
