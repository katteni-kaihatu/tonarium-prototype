import { fantasyHasJob } from './fantasy-careers.ts';
import type { FantasyCharacter } from './fantasy.ts';
import type { NpcLocale } from './npc.ts';
import { FANTASY_ITEMS, FANTASY_LOCATIONS } from './fantasy-data.ts';
import { fantasyCampFireSource, lightFantasyCampFire, type FantasyCampFireSource } from './fantasy-camping.ts';
import { fantasyDungeonCampError, fantasyDungeonErrorText } from './fantasy-dungeon.ts';
import { fantasyHasSpoiledIngredients, reconcileFoodLots } from './fantasy-life.ts';
import { FANTASY_OUTDOOR_COOKING_RECIPES, type FantasyOutdoorRecipe } from './fantasy-outdoor-cooking-catalog.ts';

export type FantasyOutdoorCookingAction = { type: 'campCook'; recipe: string };
export interface FantasyOutdoorCookingContext { mageAvailable?: boolean }
export interface FantasyOutdoorCookingResult { hours: number; error?: string; log?: string; count?: number; fire?: FantasyCampFireSource }
const recipeOf = (id: string) => FANTASY_OUTDOOR_COOKING_RECIPES.find(recipe => recipe.id === id);

export function validFantasyOutdoorCookingAction(value: unknown): value is FantasyOutdoorCookingAction {
  if (!value || typeof value !== 'object' || Array.isArray(value)) return false;
  const action = value as Record<string, unknown>;
  return Object.keys(action).length === 2 && action.type === 'campCook' && typeof action.recipe === 'string' && !!recipeOf(action.recipe);
}
export function fantasyOutdoorCookingActionHours(action: FantasyOutdoorCookingAction): number { return recipeOf(action.recipe)?.hours ?? 0; }
export function fantasyOutdoorCookingCount(c: Pick<FantasyCharacter, 'job' | 'jobXp' | 'inventory'>, recipe: FantasyOutdoorRecipe): number {
  return recipe.count + (recipe.cookBatch && fantasyHasJob(c,'cook') && (c.jobXp.cook ?? 0) >= 100 && (c.inventory['folding-cutting-board'] ?? 0) > 0 ? 1 : 0);
}
export function fantasyOutdoorCookingError(c: FantasyCharacter, action: FantasyOutdoorCookingAction, context: FantasyOutdoorCookingContext = {}): string | undefined {
  const recipe = recipeOf(action.recipe);
  if (!recipe) return 'その野外料理はありません。';
  if (c.hp <= 0) return '回復してから野外料理をしてください。';
  if (!FANTASY_LOCATIONS.some(place => place.id === c.location)) return 'ここでは野外料理ができません。';
  if (c.dungeon?.active) { const error = fantasyDungeonCampError(c); if (error) return error; }
  if (recipe.tools.some(id => (c.inventory[id] ?? 0) < 1)) return '料理に必要な野営道具を用意してください。';
  if (Object.entries(recipe.inputs).some(([id, count]) => (c.inventory[id] ?? 0) < count)) return '野外料理の材料が足りません。';
  if (fantasyHasSpoiledIngredients(c, recipe.inputs)) return '傷んだ食材は野外料理に使えません。';
  if (fantasyCampFireSource(c, context.mageAvailable) === 'none') return '火をおこす魔術師か、火口箱と木材1個が必要です。';
}

// 完了時に呼び、料理の誕生時刻を現在時刻に揃える。
export function applyFantasyOutdoorCooking(c: FantasyCharacter, action: { type: string }, context: FantasyOutdoorCookingContext = {}): FantasyOutdoorCookingResult | undefined {
  if (action.type !== 'campCook') return;
  if (!validFantasyOutdoorCookingAction(action)) return { hours: 0, error: 'その野外料理はありません。' };
  const recipe = recipeOf(action.recipe)!, error = fantasyOutdoorCookingError(c, action, context);
  if (error) return { hours: recipe.hours, error };
  const fire = lightFantasyCampFire(c, context.mageAvailable), count = fantasyOutdoorCookingCount(c, recipe);
  reconcileFoodLots(c);
  for (const [id, amount] of Object.entries(recipe.inputs)) c.inventory[id] -= amount;
  c.inventory[recipe.output] = (c.inventory[recipe.output] ?? 0) + count;
  reconcileFoodLots(c);
  return { hours: recipe.hours, count, fire, log: `野外料理「${recipe.names.ja}」を${count}個作った。${fire === 'mage' ? '魔術師が無料で火をおこした。' : '木材1個で火をおこし、道具は手元に残った。'}` };
}

export function fantasyOutdoorCookingErrorText(text: string, locale: NpcLocale): string | undefined {
  const messages: Record<string, [string, string]> = {
    'その野外料理はありません。': ['그 야외 요리법은 없습니다.', 'That outdoor recipe is unavailable.'],
    '回復してから野外料理をしてください。': ['회복한 뒤 야외 요리를 하세요.', 'Recover before cooking outdoors.'],
    'ここでは野外料理ができません。': ['여기서는 야외 요리를 할 수 없습니다.', 'You cannot cook outdoors here.'],
    '料理に必要な野営道具を用意してください。': ['요리에 필요한 야영 도구를 준비하세요.', 'Bring the camping tools required for this recipe.'],
    '野外料理の材料が足りません。': ['야외 요리 재료가 부족합니다.', 'Not enough ingredients for outdoor cooking.'],
    '傷んだ食材は野外料理に使えません。': ['상한 식재료는 야외 요리에 쓸 수 없습니다.', 'Spoiled ingredients cannot be used in outdoor cooking.'],
    '火をおこす魔術師か、火口箱と木材1個が必要です。': ['불을 붙일 마법사나 화승통과 목재 1개가 필요합니다.', 'You need a mage to light the fire, or a tinderbox and 1 wood.'],
  };
  const translated = messages[text];
  return translated ? locale === 'ja' ? text : translated[locale === 'ko' ? 0 : 1] : fantasyDungeonErrorText(text, locale);
}
export function fantasyOutdoorCookingLogText(text: string, locale: NpcLocale): string | undefined {
  const match = /^野外料理「(.+)」を(\d+)個作った。(魔術師が無料で火をおこした。|木材1個で火をおこし、道具は手元に残った。)$/.exec(text);
  const recipe = match && FANTASY_OUTDOOR_COOKING_RECIPES.find(recipe => recipe.names.ja === match[1]);
  if (!match || !recipe) return;
  const fire = match[3].startsWith('魔術師');
  return ({ ko: `${recipe.names.ko} ${match[2]}개를 만들었다. ${fire ? '마법사가 무료로 불을 붙였다.' : '목재 1개를 썼으며 도구는 남았다.'}`, en: `Prepared ${match[2]} × ${recipe.names.en}. ${fire ? 'A mage lit the fire for free.' : 'Used 1 wood; all tools remain.'}`, ja: text })[locale];
}

export function fantasyOutdoorCookingItemName(id: string, locale: NpcLocale): string {
  const item = FANTASY_ITEMS.find(item => item.id === id);
  return item?.names?.[locale] ?? item?.name ?? id;
}
