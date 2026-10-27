import type { FantasyCharacter } from './fantasy.ts';
import type { NpcLocale } from './npc.ts';
import { FANTASY_FINAL_ISLE_ID } from './fantasy-isle-access.ts';
import { FANTASY_VOYAGE_EPILOGUE } from './fantasy-isle-story.ts';

export const FANTASY_VOYAGE_CHART_QUEST = 'main-night-17';
export const FANTASY_VOYAGE_FINAL_QUEST = 'main-night-18';
type EndingCharacter = Pick<FantasyCharacter, 'voyageEnding' | 'hour' | 'lifeStartedAt' | 'completed' | 'visited' | 'mainTrials'>;
export function validFantasyVoyageEnding(character: EndingCharacter): boolean {
  const value = character.voyageEnding;
  if (value === undefined) return true;
  if (!value || typeof value !== 'object' || Array.isArray(value) || Object.keys(value).length !== 1 || !Object.hasOwn(value, 'hour')
    || !Number.isFinite(character.hour) || !Number.isFinite(value.hour) || value.hour < (character.lifeStartedAt ?? 0) || value.hour > character.hour
    || !character.completed.includes(FANTASY_VOYAGE_FINAL_QUEST) || !character.visited.includes(FANTASY_FINAL_ISLE_ID)) return false;
  const record = character.mainTrials?.[FANTASY_VOYAGE_FINAL_QUEST];
  return record === undefined || !!record && Array.isArray(record.proofs) && record.proofs.length === 3
    && record.proofs.every((proof, index) => proof && proof.stage === ['field', 'verify', 'compare'][index] && Number.isFinite(proof.hour) && proof.hour <= value.hour);
}
export function fantasyVoyageFinishError(character: FantasyCharacter): string | undefined {
  if (character.voyageEnding) return 'この航海の終章はすでに記録されています。';
  if (!character.completed.includes(FANTASY_VOYAGE_FINAL_QUEST)) return '最後の主依頼を終えてから航海を記録してください。';
  if (character.location !== FANTASY_FINAL_ISLE_ID || !character.visited.includes(FANTASY_FINAL_ISLE_ID)) return '航海の終章は、実際に島へ到着してから記録してください。';
  return undefined;
}
export function fantasyVoyageEnding(character: EndingCharacter, locale: NpcLocale): { title: string; paragraphs: string[] } | undefined {
  if (!character.voyageEnding || !validFantasyVoyageEnding(character)) return undefined;
  const text = FANTASY_VOYAGE_EPILOGUE[locale];
  return { title: text.title, paragraphs: [...text.paragraphs] };
}
