import type { FantasyCharacter } from '../../../shared/fantasy.ts';
import { fantasyVoyageChapterDetail, fantasyVoyageEarnedScenes, fantasyVoyageScene } from '../../../shared/fantasy-voyage-scenes.ts';
import { FANTASY_MAIN_QUESTS } from '../../../shared/fantasy-second-content.ts';
import { fantasyQuestText } from '../../../shared/fantasy-narrative.ts';
import { useLocale } from '../locale.ts';
import { fantasyVoyageDecisionMemories } from '../../../shared/fantasy-voyage-decisions.ts';

export function FantasyVoyageSceneSetup({ c, quest }: { c: FantasyCharacter; quest: string }) {
  const [locale] = useLocale(), scene = fantasyVoyageScene(c, quest), chapter = fantasyVoyageChapterDetail(c, quest);
  return <section className="fr-voyage-scene">
    {chapter && <details><summary>{{ ko: '의뢰인의 사연', en: 'The issuer’s story', ja: '依頼人の事情' }[locale]}</summary><p>{chapter.motivation[locale]}</p><p>{chapter.stakes[locale]}</p></details>}
    {scene && scene.location === c.location && <p className="fr-scene-setup">{scene.setup[locale]}</p>}
  </section>;
}

export function FantasyVoyageSceneHistory({ c, quest }: { c: FantasyCharacter; quest?: string }) {
  const [locale] = useLocale(), earned = fantasyVoyageEarnedScenes(c, locale, quest);
  const memories = fantasyVoyageDecisionMemories(c, locale).filter(memory => !quest || memory.quest === quest);
  if (!earned.length) return null;
  const chapters = [...new Set(earned.map(scene => scene.chapter))].sort((a, b) => a - b);
  const clue = (scene: typeof earned[number]) => <details key={scene.id} className="fr-voyage-clue"><summary>{scene.name}</summary>{!scene.inferred && <p>{scene.story}</p>}<p>{scene.fact}</p><p className="fr-muted">{scene.next}</p></details>;
  return <details className="fr-fold fr-voyage-chronicle"><summary>{{ ko: quest ? '확보한 단서와 이어지는 이야기' : '항해 이야기 다시 읽기', en: quest ? 'Verified clues and their leads' : 'Read the voyage story', ja: quest ? '確かめた手掛かりとその先' : '航海の物語を読み返す' }[locale]}</summary>
    {memories.length > 0 && <details><summary>{{ ko: '내가 남긴 선택', en: 'My choices', ja: '自分が残した選択' }[locale]}</summary>{memories.map(memory => <article key={memory.id}><b>{memory.label}</b><p>{memory.text}</p></article>)}</details>}
    {quest ? earned.map(clue) : chapters.map(chapter => {
      const q = FANTASY_MAIN_QUESTS.find(value => value.chapter === chapter);
      return <details key={chapter}><summary>{q ? fantasyQuestText(q, locale).name : chapter}</summary>{earned.filter(scene => scene.chapter === chapter).map(clue)}</details>;
    })}
  </details>;
}
