import type { FantasyAction, FantasyCharacter, FantasyCheckContext, FantasyMainApproach, FantasyStat, FantasyStats } from './fantasy.ts';
import { FANTASY_MAIN_QUESTS } from './fantasy-second-content.ts';
import { FANTASY_ISLE_CHAPTERS } from './fantasy-isle-story.ts';
import { fantasyIsleAccess, FANTASY_FINAL_ISLE_ID } from './fantasy-isle-access.ts';
import { fantasyStoryCombatRequirement } from './fantasy-combat-stories.ts';

export type { FantasyMainApproach } from './fantasy.ts';
type Text = Record<'ko' | 'en' | 'ja', string>;
export const FANTASY_MAIN_APPROACHES = ['observe', 'analyze', 'restore'] as const;
export interface FantasyMainStage {
  id: 'field' | 'verify' | 'compare'; location: string; kind: 'field' | 'archive'; labels: Text; dc: number; hours: .5; context?: FantasyCheckContext;
}
export interface FantasyMainTrial { questId: string; chapter: number; recommendedLevel: number; stages: FantasyMainStage[] }
const LEVELS = [2, 3, 4, 5, 6, 7, 8, 9, 10, 10, 11, 12, 12, 13, 13, 14, 14, 15];
const DIFFICULTIES = [13, 14, 15, 16, 17, 18, 19, 20, 21, 22, 23, 24, 24, 25, 26, 27, 28, 29];
const SUBJECTS: { field: Text; verify?: Text; compare: Text; context?: FantasyCheckContext }[] = FANTASY_ISLE_CHAPTERS.map(chapter=>({...chapter.stages,...(chapter.context?{context:chapter.context}:{})}));

export const FANTASY_MAIN_TRIALS: FantasyMainTrial[] = FANTASY_MAIN_QUESTS.map(quest => {
  const chapter = quest.chapter!, subject = SUBJECTS[chapter - 1], dc = DIFFICULTIES[chapter - 1];
  const field = (id: 'field' | 'verify', labels: Text, offset: number): FantasyMainStage => ({ id, location: quest.destination, kind: chapter === 2 || chapter === 12 ? 'archive' : 'field', labels, dc: dc + offset, hours: .5, ...(subject.context ? { context: subject.context } : {}) });
  const stages = [field('field', subject.field, 0), ...(subject.verify ? [field('verify', subject.verify, 1)] : [])];
  stages.push({ id: 'compare', location: quest.reportAt ?? quest.giver, kind: 'archive', labels: subject.compare, dc: dc + stages.length, hours: .5 });
  return { questId: quest.id, chapter, recommendedLevel: LEVELS[chapter - 1], stages };
});
export const fantasyMainTrial = (questId: string): FantasyMainTrial | undefined => FANTASY_MAIN_TRIALS.find(trial => trial.questId === questId);
export function fantasyMainProgress(character: Pick<FantasyCharacter, 'mainTrials'>, questId: string): number {
  const trial = fantasyMainTrial(questId), proofs = character.mainTrials?.[questId]?.proofs;
  return trial && Array.isArray(proofs) ? Math.min(trial.stages.length, proofs.length) : 0;
}
export function fantasyMainReady(character: Pick<FantasyCharacter, 'mainTrials' | 'completed'>, questId: string): boolean {
  const trial = fantasyMainTrial(questId);
  return !!trial && (character.completed.includes(questId) || fantasyMainProgress(character, questId) === trial.stages.length);
}
export function fantasyMainStage(character: Pick<FantasyCharacter, 'mainTrials' | 'quests' | 'completed'>, questId: string): FantasyMainStage | undefined {
  if (!character.quests.includes(questId) || character.completed.includes(questId)) return undefined;
  return fantasyMainTrial(questId)?.stages[fantasyMainProgress(character, questId)];
}
export function fantasyMainApproachStat(stats: FantasyStats, stage: FantasyMainStage, approach: FantasyMainApproach): FantasyStat {
  const best = (a: FantasyStat, b: FantasyStat): FantasyStat => stats[b] === undefined || (stats[a] ?? 0) >= stats[b]! ? a : b;
  if (approach === 'analyze') return 'intelligence';
  if (stage.kind === 'archive') return approach === 'observe' ? best('luck', 'charisma') : stats.dexterity === undefined ? 'agility' : 'dexterity';
  return approach === 'observe' ? best('agility', 'vitality') : best('strength', 'dexterity');
}
const object = (value: unknown): value is Record<string, unknown> => !!value && typeof value === 'object' && !Array.isArray(value);
const hour = (value: unknown): value is number => typeof value === 'number' && Number.isFinite(value) && value >= 0;
export function validFantasyMainTrials(character: Pick<FantasyCharacter, 'mainTrials' | 'quests' | 'completed' | 'hour' | 'lifeStartedAt'>): boolean {
  const records = character.mainTrials;
  if (records === undefined) return true;
  if (!object(records) || Object.keys(records).length > FANTASY_MAIN_TRIALS.length) return false;
  return Object.entries(records).every(([id, record]) => {
    const trial = fantasyMainTrial(id);
    if (!trial || !(FANTASY_MAIN_QUESTS.find(quest => quest.id === id)?.requiresCompleted ?? []).every(id => character.completed.includes(id)) || !object(record)
      || Object.keys(record).length !== 3 || !Object.keys(record).every(key => ['acceptedAt', 'proofs', 'attempts'].includes(key))
      || !hour(record.acceptedAt) || record.acceptedAt > character.hour || record.acceptedAt < (character.lifeStartedAt ?? 0)
      || !Number.isSafeInteger(record.attempts) || record.attempts < 0 || record.attempts > 1_000_000
      || !Array.isArray(record.proofs) || record.proofs.length > trial.stages.length || record.attempts < record.proofs.length
      || character.completed.includes(id) && record.proofs.length !== trial.stages.length) return false;
    let previous = record.acceptedAt;
    return record.proofs.every((proof, index) => {
      if (!object(proof) || Object.keys(proof).length !== 3 || !Object.keys(proof).every(key => ['stage', 'approach', 'hour'].includes(key))
        || proof.stage !== trial.stages[index].id || !FANTASY_MAIN_APPROACHES.includes(proof.approach as FantasyMainApproach)
        || !hour(proof.hour) || proof.hour > character.hour || proof.hour < previous + trial.stages[index].hours - 1e-8) return false;
      previous = proof.hour; return true;
    });
  });
}
export function fantasyMainInvestigationError(character: FantasyCharacter, action: Extract<FantasyAction, { type: 'investigate' }>): string | undefined {
  if (!action || action.type !== 'investigate' || Object.keys(action).length !== 3 || !Object.keys(action).every(key => ['type', 'quest', 'approach'].includes(key)) || typeof action.quest !== 'string' || !FANTASY_MAIN_APPROACHES.includes(action.approach)) return '調査の指定が正しくありません。';
  if (!fantasyMainTrial(action.quest)) return '調査対象の主依頼がありません。';
  if (!character.quests.includes(action.quest) || character.completed.includes(action.quest)) return '先にその主依頼を受注してください。';
  if (!validFantasyMainTrials(character)) return '主調査の記録を確認できません。';
  const stage = fantasyMainStage(character, action.quest);
  if (!stage) return 'この主依頼の調査は完了しています。依頼人へ報告してください。';
  if (stage.location === FANTASY_FINAL_ISLE_ID && !fantasyIsleAccess(character)) return '島へ続く航路を確かめてから調査してください。';
  if (character.location !== stage.location) return '次の調査段階の場所へ移動してください。';
  if (fantasyStoryCombatRequirement(character, action.quest, stage.id)) return '調査を続ける前に、通路を塞ぐ相手との戦闘を終えてください。';
  return undefined;
}
