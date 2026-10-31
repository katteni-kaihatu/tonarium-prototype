import type { FantasyAction, FantasyCharacter, FantasyQuest } from './fantasy.ts';
import type { NpcLocale } from './npc.ts';
import { FANTASY_TASK_QUESTS, type FantasyTaskObjective, type FantasyTaskQuest } from './fantasy-task-quests.ts';
import { FANTASY_DUNGEON_QUESTS } from './fantasy-dungeon-catalog.ts';
import { fantasyDungeonObjectiveLabel, fantasyDungeonQuestProgress, fantasyDungeonQuestReady, type FantasyDungeonObjective } from './fantasy-dungeon.ts';

const task = (quest: FantasyQuest | string): FantasyTaskQuest | undefined => FANTASY_TASK_QUESTS.find(value => value.id === (typeof quest === 'string' ? quest : quest.id));
const dungeonQuest = (quest: FantasyQuest | string) => typeof quest === 'string' ? FANTASY_DUNGEON_QUESTS.find(q => q.id === quest) : quest.objective?.type === 'dungeon' ? quest : undefined;
export const fantasyTaskObjective = (quest: FantasyQuest | string): FantasyTaskObjective | FantasyDungeonObjective | undefined => task(quest)?.objective ?? dungeonQuest(quest)?.objective as FantasyDungeonObjective | undefined;
export const fantasyTaskObjectiveLabel = (quest: FantasyQuest, locale: NpcLocale): string | undefined => task(quest)?.objectiveLabels[locale] ?? fantasyDungeonObjectiveLabel(quest, locale);
export function fantasyTaskProgress(character: Pick<FantasyCharacter, 'taskProgress'> & Partial<Pick<FantasyCharacter, 'completed' | 'dungeon'>>, quest: FantasyQuest | string): number {
  const dungeon = dungeonQuest(quest); if (dungeon) return character.completed?.includes(dungeon.id) ? dungeon.objective!.count : fantasyDungeonQuestProgress(character, dungeon);
  const target = task(quest), value = character.taskProgress?.[target?.id ?? '']?.progress;
  if (target && character.completed?.includes(target.id)) return target.objective.count;
  return target && Number.isSafeInteger(value) && value! >= 0 ? Math.min(target.objective.count, value!) : 0;
}
export function fantasyTaskReady(character: FantasyCharacter, quest: FantasyQuest | string): boolean {
  const dungeon = dungeonQuest(quest); if (dungeon) return fantasyDungeonQuestReady(character, dungeon);
  const target = task(quest);
  return !!target && character.quests.includes(target.id) && !character.completed.includes(target.id)
    && validFantasyTaskProgress(character) && fantasyTaskProgress(character, target) >= target.objective.count;
}
const object = (value: unknown): value is Record<string, unknown> => !!value && typeof value === 'object' && !Array.isArray(value);
const hour = (value: unknown): value is number => typeof value === 'number' && Number.isFinite(value) && value >= 0;
const duration = (objective: FantasyTaskObjective) => objective.type === 'gather' ? 2 : objective.type === 'fish' ? objective.mode === 'sea' ? 4 : 2 : 3;
export function validFantasyTaskProgress(character: Pick<FantasyCharacter, 'taskProgress' | 'quests' | 'completed' | 'hour' | 'lifeStartedAt'>): boolean {
  const records = character.taskProgress;
  if (records === undefined) return true;
  if (!object(records) || Object.keys(records).length > FANTASY_TASK_QUESTS.length) return false;
  return Object.entries(records).every(([id, record]) => {
    const target = task(id);
    return !!target && character.quests.includes(id) && !character.completed.includes(id) && object(record)
      && Object.keys(record).length === 3 && Object.keys(record).every(key => ['acceptedAt', 'progress', 'lastAt'].includes(key))
      && hour(record.acceptedAt) && record.acceptedAt >= (character.lifeStartedAt ?? 0) && record.acceptedAt <= character.hour
      && Number.isSafeInteger(record.progress) && record.progress >= 0 && record.progress <= target.objective.count
      && hour(record.lastAt) && record.lastAt >= record.acceptedAt && record.lastAt <= character.hour
      && (record.progress === 0 ? record.lastAt === record.acceptedAt : record.lastAt + 1e-8 >= record.acceptedAt + duration(target.objective) * record.progress);
  });
}
export function grantFantasyTaskProgress(character: FantasyCharacter, action: FantasyAction, startedAt: number, startLocation: string, success: boolean): string[] {
  if (!success || !hour(startedAt) || character.hour <= startedAt || !validFantasyTaskProgress(character)) return [];
  const advanced: string[] = [];
  for (const quest of FANTASY_TASK_QUESTS) {
    if (!character.quests.includes(quest.id) || character.completed.includes(quest.id) || startLocation !== quest.destination || character.location !== quest.destination) continue;
    const objective = quest.objective;
    const matches = objective.type === 'gather' ? action.type === 'gather' && action.resource === objective.resource
      : objective.type === 'craft' ? action.type === 'craft' && action.recipe === objective.recipe
        : objective.type === 'fish' ? action.type === 'fish' && action.mode === objective.mode : action.type === 'explore';
    if (!matches || character.contracts?.[quest.id] && character.contracts[quest.id].expiresAt <= character.hour) continue;
    const prior = character.taskProgress?.[quest.id];
    if (prior && (prior.acceptedAt > startedAt || prior.lastAt >= character.hour || prior.progress >= objective.count)) continue;
    if (character.hour + 1e-8 < startedAt + duration(objective)) continue;
    character.taskProgress ??= {};
    const record = character.taskProgress[quest.id] ??= { acceptedAt: startedAt, progress: 0, lastAt: startedAt };
    record.progress = Math.min(objective.count, record.progress + 1); record.lastAt = character.hour;
    advanced.push(quest.id);
  }
  return advanced;
}
