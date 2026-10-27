import type { FantasyCharacter, FantasyMainApproach } from './fantasy.ts';
import type { NpcLocale } from './npc.ts';
import type { FantasyVoyageChapterDetail, FantasyVoyageScene, FantasyVoyageStageId, FantasyVoyageText } from './fantasy-voyage-scene-types.ts';
import { FANTASY_VOYAGE_EARLY_CHAPTERS, FANTASY_VOYAGE_EARLY_SCENES } from './fantasy-voyage-scenes-early.ts';
import { FANTASY_VOYAGE_LATE_CHAPTERS, FANTASY_VOYAGE_LATE_SCENES } from './fantasy-voyage-scenes-late.ts';
import { FANTASY_MAIN_QUESTS } from './fantasy-second-content.ts';
import { fantasyQuestRecordEligible } from './fantasy-access.ts';
import { FANTASY_MAIN_APPROACHES, FANTASY_MAIN_TRIALS, fantasyMainStage, fantasyMainTrial, validFantasyMainTrials } from './fantasy-main-trials.ts';
import { FANTASY_FINAL_ISLE_ID, fantasyIsleAccess } from './fantasy-isle-access.ts';
import { FANTASY_LOCATIONS } from './fantasy-data.ts';
import { validFantasyVoyageEnding } from './fantasy-voyage-ending.ts';
import { FANTASY_VOYAGE_EPILOGUE } from './fantasy-isle-story.ts';

export type FantasyVoyageCurrentScene = Pick<FantasyVoyageScene, 'chapter' | 'stage' | 'requires' | 'setup' | 'approaches'> & { id: string; questId: string; location: string };
export interface FantasyVoyageEarnedScene {
  id: string; chapter: number; stage: FantasyVoyageStageId; name: string; fact: string; story: string; next: string;
  approach?: FantasyMainApproach; hour?: number; inferred?: boolean;
}
const idOf = (chapter: number, stage: string) => `voyage-${String(chapter).padStart(2, '0')}-${stage}`;
const questIdOf = (chapter: number) => `main-night-${String(chapter).padStart(2, '0')}`;
const concealIsle = (character: FantasyCharacter, locale: NpcLocale, value: string): string => {
  if (fantasyIsleAccess(character)) return value;
  const isle = FANTASY_LOCATIONS.find(place => place.id === FANTASY_FINAL_ISLE_ID);
  const names = [...new Set([isle?.name, ...Object.values(isle?.names ?? {})].filter((name): name is string => !!name))].sort((a, b) => b.length - a.length);
  return names.reduce((result, name) => result.replace(new RegExp(name.replace(/[.*+?^${}()|[\]\\]/g, '\\$&'), 'giu'), { ko: '안개 너머의 섬', en: 'the isle beyond the mist', ja: '霧の向こうの島' }[locale]), value);
};
const visibleText = (character: FantasyCharacter, value: FantasyVoyageText): FantasyVoyageText => ({ ko: concealIsle(character, 'ko', value.ko), en: concealIsle(character, 'en', value.en), ja: concealIsle(character, 'ja', value.ja) });
export const FANTASY_VOYAGE_CHAPTERS: FantasyVoyageChapterDetail[] = [...FANTASY_VOYAGE_EARLY_CHAPTERS, ...FANTASY_VOYAGE_LATE_CHAPTERS].sort((a, b) => a.chapter - b.chapter);
export const FANTASY_VOYAGE_SCENES: (FantasyVoyageScene & { id: string; questId: string; location: string })[] = [...FANTASY_VOYAGE_EARLY_SCENES, ...FANTASY_VOYAGE_LATE_SCENES].map((scene: FantasyVoyageScene) => ({ ...scene,
  id: idOf(scene.chapter, scene.stage), questId: questIdOf(scene.chapter),
  location: fantasyMainTrial(questIdOf(scene.chapter))?.stages.find(stage => stage.id === scene.stage)?.location ?? '',
})).sort((a, b) => a.chapter - b.chapter || ['field', 'verify', 'compare'].indexOf(a.stage) - ['field', 'verify', 'compare'].indexOf(b.stage));
const object = (value: unknown): value is Record<string, unknown> => !!value && typeof value === 'object' && !Array.isArray(value);
const text = (value: unknown): value is FantasyVoyageText => object(value) && ['ko', 'en', 'ja'].every(locale => typeof value[locale] === 'string' && value[locale].trim().length > 1);
export function validFantasyVoyageSceneCatalog(scenes: FantasyVoyageScene[] = FANTASY_VOYAGE_SCENES, chapters: FantasyVoyageChapterDetail[] = FANTASY_VOYAGE_CHAPTERS): boolean {
  const ordered = FANTASY_MAIN_TRIALS.flatMap(trial => trial.stages.map(stage => ({ chapter: trial.chapter, stage: stage.id })));
  if (!Array.isArray(scenes) || scenes.length !== ordered.length || !Array.isArray(chapters) || chapters.length !== 18) return false;
  if (new Set(scenes.map(scene => scene && idOf(scene.chapter, scene.stage))).size !== ordered.length
    || new Set(chapters.map(chapter => chapter?.chapter)).size !== 18) return false;
  if (!chapters.every(chapter => object(chapter) && Number.isInteger(chapter.chapter) && chapter.chapter >= 1 && chapter.chapter <= 18 && text(chapter.motivation) && text(chapter.stakes))) return false;
  return ordered.every((entry, index) => {
    const scene = scenes.find(scene => scene?.chapter === entry.chapter && scene?.stage === entry.stage);
    const previous = ordered[index - 1], required = previous ? [idOf(previous.chapter, previous.stage)] : [];
    return !!scene && Array.isArray(scene.requires) && JSON.stringify(scene.requires) === JSON.stringify(required)
      && text(scene.setup) && text(scene.success) && text(scene.failure) && text(scene.next) && object(scene.clue) && text(scene.clue.name) && text(scene.clue.fact)
      && object(scene.approaches) && Object.keys(scene.approaches).length === FANTASY_MAIN_APPROACHES.length && FANTASY_MAIN_APPROACHES.every(approach => text(scene.approaches[approach]));
  });
}
const authorized = (character: FantasyCharacter) => Array.isArray(character.quests) && Array.isArray(character.completed) && Array.isArray(character.visited)
  && validFantasyMainTrials(character) && (character.voyageEnding === undefined || validFantasyVoyageEnding(character));
const eligible = (character: FantasyCharacter, questId: string) => {
  const quest = FANTASY_MAIN_QUESTS.find(quest => quest.id === questId);
  return !!quest && fantasyQuestRecordEligible(character, quest);
};
function earned(character: FantasyCharacter) {
  const result: { scene: typeof FANTASY_VOYAGE_SCENES[number]; proof: NonNullable<FantasyCharacter['mainTrials']>[string]['proofs'][number] | undefined }[] = [];
  if (!authorized(character)) return result;
  const known = new Set<string>();
  for (const scene of FANTASY_VOYAGE_SCENES) {
    if (!eligible(character, scene.questId) || !scene.requires.every(id => known.has(id))) continue;
    const completed = character.completed.includes(scene.questId), record = character.mainTrials?.[scene.questId];
    // 旧章の完了は回想として扱い、存在しない判定や日時を作らない。
    const proof = record?.proofs.find(proof => proof.stage === scene.stage);
    if (!proof && !(completed && !record)) continue;
    if (scene.chapter === 18 && (!character.visited.includes(FANTASY_FINAL_ISLE_ID) || completed && !character.voyageEnding)) continue;
    known.add(scene.id); result.push({ scene, proof });
  }
  return result;
}
export function fantasyVoyageScene(character: FantasyCharacter, questId: string): FantasyVoyageCurrentScene | undefined {
  if (!authorized(character) || !eligible(character, questId) || !character.quests.includes(questId) || character.completed.includes(questId)) return undefined;
  const stage = fantasyMainStage(character, questId), scene = FANTASY_VOYAGE_SCENES.find(scene => scene.questId === questId && scene.stage === stage?.id);
  if (!scene || character.location !== scene.location) return undefined;
  const known = new Set(earned(character).map(value => value.scene.id));
  if (!scene.requires.every(id => known.has(id))) return undefined;
  return { id: scene.id, questId, chapter: scene.chapter, stage: scene.stage, location: scene.location, requires: [...scene.requires], setup: visibleText(character, scene.setup),
    approaches: { observe: visibleText(character, scene.approaches.observe), analyze: visibleText(character, scene.approaches.analyze), restore: visibleText(character, scene.approaches.restore) } };
}
export function fantasyVoyageChapterDetail(character: FantasyCharacter, questId: string): FantasyVoyageChapterDetail | undefined {
  if (!authorized(character) || !eligible(character, questId) || !character.quests.includes(questId) && !character.completed.includes(questId)) return undefined;
  const chapter = FANTASY_MAIN_QUESTS.find(quest => quest.id === questId)?.chapter, detail = FANTASY_VOYAGE_CHAPTERS.find(detail => detail.chapter === chapter);
  return detail ? { chapter: detail.chapter, motivation: visibleText(character, detail.motivation), stakes: visibleText(character, detail.stakes) } : undefined;
}
export function fantasyVoyageEarnedScenes(character: FantasyCharacter, locale: NpcLocale, questId?: string): FantasyVoyageEarnedScene[] {
  return earned(character).filter(value => questId === undefined || value.scene.questId === questId).map(({ scene, proof }) => ({ id: scene.id, chapter: scene.chapter, stage: scene.stage,
    name: concealIsle(character, locale, scene.clue.name[locale]), fact: concealIsle(character, locale, scene.clue.fact[locale]), story: concealIsle(character, locale, scene.success[locale]), next: concealIsle(character, locale, scene.next[locale]),
    ...(proof ? { approach: proof.approach, hour: proof.hour } : { inferred: true }),
  }));
}
export function fantasyVoyageSceneLogText(raw: string, locale: NpcLocale, character?: FantasyCharacter | null): string | undefined {
  const chapterLog = /^航海場面［(main-night-(?:0[1-9]|1[0-8])):(opening|closing)］。$/.exec(raw);
  const outcome = /^航海場面［(main-night-(?:0[1-9]|1[0-8])):(field|verify|compare):(observe|analyze|restore):(success|failure)］。$/.exec(raw);
  if (!chapterLog && !outcome) return undefined;
  if (!character || !authorized(character)) return '';
  const visible = (value: string) => concealIsle(character, locale, value);
  const questId = (chapterLog ?? outcome)![1], trial = fantasyMainTrial(questId);
  if (!trial || !eligible(character, questId) || trial.chapter === 18 && character.completed.includes(questId) && !character.voyageEnding) return '';
  if (chapterLog) {
    const detail = fantasyVoyageChapterDetail(character, questId), record = character.mainTrials?.[questId];
    if (chapterLog[2] === 'closing') {
      if (!character.completed.includes(questId)) return '';
      if (trial.chapter === 18) return character.voyageEnding ? FANTASY_VOYAGE_EPILOGUE[locale].paragraphs.at(-1) ?? '' : '';
      return visible(FANTASY_VOYAGE_SCENES.find(scene => scene.questId === questId && scene.stage === 'compare')?.next[locale] ?? '');
    }
    if (!detail && !record) return '';
    const chapter = detail ?? FANTASY_VOYAGE_CHAPTERS.find(detail => detail.chapter === trial.chapter);
    return chapter ? visible(`${chapter.motivation[locale]}\n${chapter.stakes[locale]}`) : '';
  }
  const [, , stage, approach, result] = outcome!, scene = FANTASY_VOYAGE_SCENES.find(scene => scene.questId === questId && scene.stage === stage);
  const record = character.mainTrials?.[questId];
  if (!scene || !record || trial.chapter === 18 && !character.visited.includes(FANTASY_FINAL_ISLE_ID)) return '';
  if (result === 'success') {
    const known = fantasyVoyageEarnedScenes(character, locale, questId).find(value => value.id === scene.id && value.approach === approach);
    return known ? visible(`${scene.approaches[approach as FantasyMainApproach][locale]}\n${known.story}\n${known.name}: ${known.fact}\n${known.next}`) : '';
  }
  const index = trial.stages.findIndex(value => value.id === stage);
  return record.attempts > record.proofs.length && index >= 0 && index <= record.proofs.length ? visible(`${scene.approaches[approach as FantasyMainApproach][locale]}\n${scene.failure[locale]}`) : '';
}
