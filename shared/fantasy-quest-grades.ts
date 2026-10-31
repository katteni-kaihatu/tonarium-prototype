import type { FantasyQuest } from './fantasy.ts';
import { FANTASY_ITEMS, FANTASY_LOCATIONS, FANTASY_RECIPES } from './fantasy-data.ts';
import { FANTASY_DUNGEONS } from './fantasy-dungeon-catalog.ts';
import { fantasyCombatEnemy } from './fantasy-combat-catalog.ts';
import { fantasyHuntGrade, type FantasyAdventurerGrade } from './fantasy-adventurer.ts';

const grade = (value: number): FantasyAdventurerGrade => Math.max(1, Math.min(8, Math.ceil(value))) as FantasyAdventurerGrade;

/** 魔物の有無とは別に、現地の危険を評価する。 */
export function fantasyQuestLocationGrade(location: string): FantasyAdventurerGrade {
  const danger = FANTASY_LOCATIONS.find(place => place.id === location)?.danger ?? 0;
  return grade([1, 1, 2, 4, 6, 7, 8][Math.max(0, Math.floor(danger))] ?? 8);
}

/** 護衛は経由地を含む危険と長距離の負担を使う。 */
export function fantasyEscortGrade(path: readonly string[], hours = 0): FantasyAdventurerGrade {
  return grade(Math.max(2, ...path.map(fantasyQuestLocationGrade), hours >= 12 ? 3 : 1));
}

/** 全依頼で共通の評価。報酬額やプレイヤーの装備には依存しない。 */
export function fantasyQuestGrade(quest: FantasyQuest): FantasyAdventurerGrade {
  let required = Math.max(fantasyQuestLocationGrade(quest.giver), fantasyQuestLocationGrade(quest.destination),
    quest.reportAt ? fantasyQuestLocationGrade(quest.reportAt) : 1);
  const objective = quest.objective;
  if (objective?.type === 'hunt') {
    const enemy = objective.monster ? fantasyCombatEnemy(objective.monster) : undefined;
    required = Math.max(required, fantasyHuntGrade([{ tier: enemy?.tier ?? 1, count: objective.count }]));
  } else if (objective?.type === 'dungeon') {
    const dungeon = FANTASY_DUNGEONS.find(site => site.id === objective.site);
    required = Math.max(required, 3);
    if (dungeon) {
      required = Math.max(required, fantasyQuestLocationGrade(dungeon.location));
      for (const room of dungeon.rooms) {
        if (room.trap) required = Math.max(required, grade((Math.max(room.trap.detect, room.trap.disarm) - 8) / 3));
      }
      if (objective.goal === 'clear') required = Math.max(required, fantasyHuntGrade(dungeon.rooms.flatMap(room => {
        const enemy = room.enemy ? fantasyCombatEnemy(room.enemy.template) : undefined;
        return enemy ? [{ tier: enemy.tier, count: 1 }] : [];
      })));
    }
  } else if (objective?.type === 'craft') {
    const recipe = FANTASY_RECIPES.find(recipe => recipe.id === objective.recipe);
    required = Math.max(required, grade(((recipe?.dc ?? 10) - 8) / 3));
  } else if (objective?.type === 'fish' && objective.mode === 'sea') required = Math.max(required, 2);
  const item = FANTASY_ITEMS.find(item => item.id === quest.item);
  // 簡単な薬草採集は最低等級。大量納品・希少素材は負担を加える。
  if (!objective || objective.type === 'gather') {
    required = Math.max(required, item?.tier ?? 1);
    if (quest.count >= 20) required = Math.max(required, 3);
    else if (quest.count >= 10) required = Math.max(required, 2);
  }
  if (quest.chapter) required = Math.max(required, grade(1 + (quest.chapter - 1) / 3));
  return grade(required);
}
