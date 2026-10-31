import { fantasyLifeJob } from './fantasy-careers.ts';
import { FANTASY_IMPROVISED_RECIPE, fantasyIsCookingIngredient, fantasyBadCookingChoices, fantasyImprovisedCookingPlan } from './fantasy-freeform-cooking.ts';
import { fantasyDungeonCampError } from './fantasy-dungeon.ts';
import type { FantasyAction, FantasyCharacter, FantasyFoodLot } from './fantasy.ts';
import type { NpcLocale } from './npc.ts';
import { FANTASY_ITEMS, FANTASY_LOCATIONS, FANTASY_RECIPES } from './fantasy-data.ts';
import { FANTASY_OUTDOOR_COOKING_RECIPES } from './fantasy-outdoor-cooking-catalog.ts';
import { fantasyOutdoorCookingCount, validFantasyOutdoorCookingAction } from './fantasy-outdoor-cooking.ts';
import { fantasyBuildings, fantasyCraftFacility, fantasyCanCraft } from './fantasy-town.ts';
import { fantasyHasSpoiledIngredients, foodMeta, reconcileFoodLots } from './fantasy-life.ts';
import { fantasyFoodLotAge } from './fantasy-food-preservation.ts';
import { fantasyCampFireSource, lightFantasyCampFire } from './fantasy-camping.ts';
import { fantasyPracticeMultiplier } from './fantasy-progression.ts';
import { fantasyTermName } from './fantasy-lore.ts';

export type FantasyCookingStation = 'outdoor' | 'kitchen';
export interface FantasyCookingIngredient { item: string; count: number }
export interface FantasyCookingAction { type: 'cookMix'; station: FantasyCookingStation; ingredients: FantasyCookingIngredient[]; recipe?: string; workshop?: string; repeats?: number; storage?: string; mains?: string[]; additions?: { main: number; item: string }[] }
export interface FantasyCookingRecipe { id: string; inputs: Record<string, number>; output: string; count: number; dc: number; hours: number; tools: string[]; job?: string }
export interface FantasyCookingPlan { candidates?: { item: string; weight: number }[]; improvised?: boolean; recipe: FantasyCookingRecipe; station: FantasyCookingStation; batches: number; inputs: Record<string, number>; count: number; hours: number }
export interface FantasyCookingStock { inventory: Record<string, number>; foodLots: FantasyFoodLot[] }
export interface FantasyCookingContext { mageAvailable?: boolean; stock?: FantasyCookingStock }
export const FANTASY_COOKING_BATCH_LIMIT = 10;
export const FANTASY_COOKING_QUANTITY_LIMIT = 1;
export const FANTASY_COOKING_SLOT_LIMIT = 5;

export function fantasyCookingRecipes(station: FantasyCookingStation): FantasyCookingRecipe[] {
  return station === 'outdoor' ? FANTASY_OUTDOOR_COOKING_RECIPES.map(recipe => ({ ...recipe }))
    : FANTASY_RECIPES.filter(recipe => !!foodMeta(recipe.output)).map(recipe => ({ ...recipe, hours: 3, tools: [] }));
}
export function fantasyCookingIngredients(station: FantasyCookingStation): string[] {
  const registered = new Set(fantasyCookingRecipes(station).flatMap(recipe => Object.keys(recipe.inputs)));
  return FANTASY_ITEMS.filter(item => fantasyIsCookingIngredient(item) || registered.has(item.id) && !item.equipment && !item.wear && !item.light).map(item => item.id).sort();
}
export function validFantasyCookingAction(value: unknown): value is FantasyCookingAction {
  if (!value || typeof value !== 'object' || Array.isArray(value)) return false;
  const v = value as Record<string, unknown>;
  if (v.type !== 'cookMix' || (v.station !== 'outdoor' && v.station !== 'kitchen') || Object.keys(v).some(key => !['type', 'station', 'ingredients', 'recipe', 'workshop', 'repeats', 'storage', 'mains', 'additions'].includes(key))
    || v.recipe !== undefined && (typeof v.recipe !== 'string' || v.recipe !== FANTASY_IMPROVISED_RECIPE && !fantasyCookingRecipes(v.station as FantasyCookingStation).some(recipe => recipe.id === v.recipe))
    || v.workshop !== undefined && (v.station !== 'kitchen' || typeof v.workshop !== 'string' || !/^[a-z0-9-]{1,80}-commercial$/.test(v.workshop))
    || v.repeats !== undefined && (!Number.isSafeInteger(v.repeats) || Number(v.repeats) < 1 || Number(v.repeats) > 1_000_000)
    || v.storage !== undefined && (typeof v.storage !== 'string' || v.station !== 'kitchen' || v.storage !== v.workshop)
    || !Array.isArray(v.ingredients) || v.ingredients.length < 1 || v.ingredients.length > 8) return false;
  const known = new Set(fantasyCookingIngredients(v.station as FantasyCookingStation));
  const valid = v.ingredients.every(ingredient => !!ingredient && typeof ingredient === 'object' && !Array.isArray(ingredient) && Object.keys(ingredient).length === 2
    && typeof ingredient.item === 'string' && known.has(ingredient.item) && Number.isSafeInteger(ingredient.count) && ingredient.count >= 1 && ingredient.count <= 99)
    && new Set(v.ingredients.map(ingredient => ingredient.item)).size === v.ingredients.length;
  if (!valid) return false;
  if (v.mains === undefined) return v.additions === undefined;
  if (!Array.isArray(v.mains) || v.mains.length !== 3 || !v.mains.every(item => typeof item === 'string' && known.has(item))) return false;
  const additions = v.additions === undefined ? [] : v.additions;
  if (!Array.isArray(additions) || additions.length > 2 || additions.some(addition => !addition || typeof addition !== 'object' || Array.isArray(addition) || Object.keys(addition).length !== 2
    || !Number.isInteger(addition.main) || addition.main < 0 || addition.main > 2 || typeof addition.item !== 'string' || !known.has(addition.item)) || new Set(additions.map(addition => addition.main)).size !== additions.length) return false;
  const aggregate: Record<string, number> = {};
  for (const item of [...v.mains, ...additions.map(addition => addition.item)]) aggregate[item] = (aggregate[item] ?? 0) + 1;
  return Object.keys(aggregate).length === v.ingredients.length && v.ingredients.every(ingredient => aggregate[ingredient.item] === ingredient.count);
}
export function fantasyCookingMatches(action: FantasyCookingAction, profession?: string): FantasyCookingPlan[] {
  if (!validFantasyCookingAction(action)) return [];
  const inputs = Object.fromEntries(action.ingredients.map(ingredient => [ingredient.item, ingredient.count]));
  const matches: FantasyCookingPlan[] = fantasyCookingRecipes(action.station).filter(recipe => !profession || !recipe.job || recipe.job === profession).flatMap(recipe => {
    const entries = Object.entries(recipe.inputs); if (entries.length !== action.ingredients.length) return [];
    const batches = inputs[entries[0][0]] / entries[0][1];
    if (!Number.isSafeInteger(batches) || batches < 1 || batches > FANTASY_COOKING_BATCH_LIMIT || entries.some(([item, count]) => inputs[item] !== count * batches)) return [];
    return [{ recipe, station: action.station, batches, inputs, count: recipe.count * batches, hours: recipe.hours * batches }];
  });
  if (action.recipe && action.recipe !== FANTASY_IMPROVISED_RECIPE && matches.length === 0) return [];
  return action.recipe === FANTASY_IMPROVISED_RECIPE || matches.length === 0 ? [fantasyImprovisedCookingPlan(action)] : matches;
}
export function fantasyCookingPlan(action: FantasyCookingAction): FantasyCookingPlan | undefined {
  const matches = fantasyCookingMatches(action);
  return action.recipe ? matches.find(plan => plan.recipe.id === action.recipe) : matches.length === 1 ? matches[0] : undefined;
}
export function fantasyCookingUnitHours(action: FantasyCookingAction): number { return fantasyCookingPlan(action)?.hours ?? 0; }
export function fantasyCookingActionHours(action: FantasyCookingAction): number { return fantasyCookingUnitHours(action) * (action.repeats ?? 1); }
export function fantasyCookingStockCharacter(c: FantasyCharacter, action: FantasyCookingAction, context: FantasyCookingContext): FantasyCharacter {
  return action.storage && context.stock ? { ...c, inventory: context.stock.inventory, foodLots: context.stock.foodLots } : c;
}
export function fantasyCookingMaxRepeats(c: FantasyCharacter, action: FantasyCookingAction, context: FantasyCookingContext = {}): number {
  const plan = fantasyCookingPlan(action); if (!plan || action.storage && !context.stock) return 0;
  const needs = { ...plan.inputs }, stock = action.storage ? context.stock!.inventory : c.inventory;
  if (action.station === 'outdoor' && c.job !== 'mage' && !context.mageAvailable) needs.wood = (needs.wood ?? 0) + 1;
  return Math.max(0, Math.min(1_000_000, Math.floor(100_000 / plan.hours), ...Object.entries(needs).map(([item, count]) => Math.floor((stock[item] ?? 0) / count))));
}
export function fantasyCookingOutputCount(c: FantasyCharacter, plan: FantasyCookingPlan): number {
  const outdoor = plan.station === 'outdoor' && FANTASY_OUTDOOR_COOKING_RECIPES.find(recipe => recipe.id === plan.recipe.id);
  return outdoor ? fantasyOutdoorCookingCount(c, outdoor) * plan.batches : plan.count;
}
export function fantasyCookingError(c: FantasyCharacter, action: FantasyCookingAction, context: FantasyCookingContext = {}): string | undefined {
  if (!validFantasyCookingAction(action)) return 'cooking:invalid';
  const matches = fantasyCookingMatches(action), plan = fantasyCookingPlan(action);
  if (!plan) return matches.length > 1 && !action.recipe ? 'cooking:choose' : 'cooking:unmatched';
  if (c.hp <= 0) return 'cooking:unavailable';
  if (!plan.improvised && plan.batches !== 1) return 'cooking:batch';
  if (fantasyCookingActionHours(action) > 100_000) return 'cooking:repeat-limit';
  if (Object.values(plan.inputs).reduce((sum, count) => sum + count, 0) > FANTASY_COOKING_SLOT_LIMIT) return 'cooking:slots';
  if (plan.improvised && !action.mains) return 'cooking:mains';
  if (action.storage && !context.stock) return 'cooking:storage';
  const repeats = action.repeats ?? 1, original = c;
  c = fantasyCookingStockCharacter(c, action, context);
  if (Object.entries(plan.inputs).some(([item, count]) => (c.inventory[item] ?? 0) < count * repeats)) return 'cooking:stock';
  if (action.station === 'outdoor') {
    if (!FANTASY_LOCATIONS.some(place => place.id === c.location)) return 'ここでは野外料理ができません。';
    if (c.dungeon?.active) { const camp = fantasyDungeonCampError(c); if (camp) return camp; }
    const tools = plan.improvised ? ['camp-cookpot', 'trail-pan', 'folding-grill', 'camp-kettle'] : plan.recipe.tools;
    if (plan.improvised ? !tools.some(id => (c.inventory[id] ?? 0) > 0) : tools.some(id => (c.inventory[id] ?? 0) < 1)) return '料理に必要な野営道具を用意してください。';
    const available = { ...c, inventory: { ...c.inventory, wood: (c.inventory.wood ?? 0) - (plan.inputs.wood ?? 0) * repeats - Math.max(0, repeats - 1) } };
    if (fantasyCampFireSource(available, context.mageAvailable) === 'none') return '火をおこす魔術師か、火口箱と木材1個が必要です。';
    return;
  }
  if (fantasyCookingMaxRepeats(original, action, context) < repeats) return 'cooking:stock';
  if (!FANTASY_RECIPES.some(recipe => recipe.job === fantasyLifeJob(c) && !!foodMeta(recipe.output))) return 'cooking:profession';
  const facility = fantasyCraftFacility(fantasyLifeJob(c)??c.job), workshop = action.workshop === `${c.location}-commercial`;
  if (action.workshop && !workshop || c.dungeon?.active || !facility || !workshop && !fantasyBuildings(c).some(building => building.id === facility)) return 'cooking:kitchen';
  if (plan.improvised) return;
  const recipe = FANTASY_RECIPES.find(recipe => recipe.id === plan.recipe.id)!;
  if (!fantasyCanCraft(c, recipe, workshop)) return 'cooking:knowledge';
}
/** Inspect only the FIFO portions consumed; preserved old lots may be fresher than newer lots. */
export function fantasyCookingTrial(c: FantasyCharacter, plan: FantasyCookingPlan) {
  let food = 0, stale = 0;
  for (const [item, count] of Object.entries(plan.inputs)) {
    const meta = foodMeta(item); if (!meta) continue;
    let remaining = count;
    for (const lot of c.foodLots.filter(lot => lot.item === item && lot.count > 0).sort((a, b) => a.createdAt - b.createdAt)) {
      const amount = Math.min(remaining, lot.count); if (amount <= 0) break;
      food += amount; if (fantasyFoodLotAge(c.hour, lot) >= meta.shelfLife * .65) stale += amount;
      remaining -= amount;
    }
  }
  const proficiency = Math.min(10, Math.floor(Math.sqrt(c.jobXp[plan.recipe.job ?? 'cook'] ?? 0) / 3)), qualityPenalty = food ? Math.ceil(stale / food * 3) : 0;
  const batchPenalty = Math.min(3, Math.floor((plan.batches - 1) / 3));
  const threshold = Math.max(2, Math.min(20, plan.recipe.dc - proficiency + qualityPenalty + batchPenalty));
  return { proficiency, qualityPenalty, batchPenalty, threshold, chance: (21 - threshold) / 20 };
}
export function fantasyCookingOutcome(c: FantasyCharacter, plan: FantasyCookingPlan, success = true, rng?: () => number) {
  const spoiled = fantasyHasSpoiledIngredients(c, plan.inputs);
  const choices = spoiled ? fantasyBadCookingChoices('toxic') : plan.candidates;
  let selected = choices?.[0]?.item ?? plan.recipe.output;
  if (choices?.length && rng) {
    const total = choices.reduce((sum, candidate) => sum + candidate.weight, 0);
    const draw = rng();
    let pick = Math.max(0, Math.min(.99999999999, Number.isFinite(draw) ? draw : 0)) * total;
    for (const candidate of choices) { selected = candidate.item; pick -= candidate.weight; if (pick < 0) break; }
  }
  const output = selected;
  const harmful = !!FANTASY_ITEMS.find(item => item.id === output)?.foodPenalty;
  return { item: harmful || success ? output : 'charred-dish', count: fantasyCookingOutputCount(c, plan), harmful: harmful || !success };
}
/** Engine advances time first; this function consumes, rolls once, and records the real cooking discipline. */
export function applyFantasyCooking(c: FantasyCharacter, action: FantasyCookingAction, rng: () => number, context: FantasyCookingContext = {}) {
  const error = fantasyCookingError(c, action, context); if (error) return { error, success: false, harmful: false, logs: [] as string[] };
  const plan = fantasyCookingPlan(action)!, source = fantasyCookingStockCharacter(c, action, context), trial = fantasyCookingTrial(source, plan), sample = rng();
  const die = 1 + Math.floor(Math.max(0, Math.min(.999999999999, Number.isFinite(sample) ? sample : 0)) * 20);
  const success = die >= trial.threshold;
  const outcome = fantasyCookingOutcome(source, plan, success, rng), count = outcome.count;
  reconcileFoodLots(source);
  for (const [item, amount] of Object.entries(plan.inputs)) source.inventory[item] -= amount;
  reconcileFoodLots(source);
  if (action.storage && context.stock) context.stock.foodLots = source.foodLots;
  const fire = action.station === 'outdoor' ? lightFantasyCampFire(source, context.mageAvailable) : undefined;
  c.inventory[outcome.item] = (c.inventory[outcome.item] ?? 0) + count; reconcileFoodLots(c);
  const key = `cook:${action.station}:${plan.recipe.id}`, multiplier = fantasyPracticeMultiplier(c, key);
  const xp = Math.max(1, Math.floor((success && !outcome.harmful ? 6 : 2) * plan.batches * multiplier));
  const discipline = plan.recipe.job ?? 'cook';
  c.jobXp[discipline] = Math.min(1_000_000, (c.jobXp[discipline] ?? 0) + xp);
  const prior = c.proficiencyUse;
  c.proficiencyUse = { key, hour: c.hour, repeats: prior?.key === key && c.hour - prior.hour < 6 ? prior.repeats + 1 : 1 };
  c.practice ??= {}; c.practice.craft = Math.min(1_000_000, (c.practice.craft ?? 0) + 1);
  return { success, harmful: outcome.harmful, count, logs: [
    `料理判定：d20=${die}、補正+0、合計${die} / DC${trial.threshold} → ${success ? '成功' : '失敗'}`,
    `cooking:${success ? 'success' : 'failure'}:${outcome.item}:${count}:${xp}:${fire ?? 'kitchen'}`,
  ] };
}
/** Old saved commands retain their inputs while resolving through the same authority and cooking trial. */
export function fantasyLegacyCookingAction(action: FantasyAction): FantasyCookingAction | undefined {
  if (validFantasyOutdoorCookingAction(action)) {
    const recipe = FANTASY_OUTDOOR_COOKING_RECIPES.find(recipe => recipe.id === action.recipe)!;
    return { type: 'cookMix', station: 'outdoor', recipe: recipe.id, ingredients: Object.entries(recipe.inputs).map(([item, count]) => ({ item, count })) };
  }
  if (action.type === 'craft' && !action.material && !action.gem) {
    const recipe = FANTASY_RECIPES.find(recipe => recipe.id === action.recipe && !!foodMeta(recipe.output));
    if (recipe) return { type: 'cookMix', station: 'kitchen', recipe: recipe.id, ingredients: Object.entries(recipe.inputs).map(([item, count]) => ({ item, count })), ...(action.workshop ? { workshop: action.workshop } : {}) };
  }
}
export function fantasyCookingText(text: string, locale: NpcLocale): string | undefined {
  const errors: Record<string, [string, string, string]> = {
    'cooking:batch': ['재료 수량을 늘리지 말고 반복 횟수를 지정하세요.', 'Use the repeat count instead of multiplying ingredient quantities.', '材料の数量を増やす代わりに繰り返し回数を指定してください。'],
    'cooking:repeat-limit': ['한 번에 예약할 수 있는 조리 시간을 넘었습니다.', 'This exceeds the maximum duration of one cooking queue.', '一度に予約できる調理時間を超えています。'],
    'cooking:progress': ['반복 조리 기록을 확인할 수 없습니다.', 'The cooking repetition record is invalid.', '繰り返し調理の記録を確認できません。'],
    'cooking:slots': ['한 번에는 재료를 최대 5개만 넣을 수 있습니다.', 'Use at most 5 ingredient units per dish.', '一回に入れられる材料は合計5個までです。'],
    'cooking:mains': ['자유 요리는 주재료 3칸을 채워 주세요.', 'Fill all three main ingredient slots.', '自由料理は主材料の3枠を埋めてください。'],
    'cooking:storage': ['현지에서 이용 권한이 있는 창고를 선택하세요.', 'Choose an accessible local warehouse.', '現地で利用権のある倉庫を選んでください。'],
    'cooking:invalid': ['재료와 수량을 확인하세요.', 'Check the ingredients and quantities.', '材料と数量を確認してください。'],
    'cooking:unmatched': ['선택한 요리법과 재료 배합이 다릅니다. 즉석 조리를 선택하세요.', 'The chosen recipe does not match. Choose improvised cooking.', '選んだ料理法と配合が異なります。あり合わせの調理を選んでください。'],
    'cooking:choose': ['같은 배합으로 만들 요리를 선택하세요.', 'Choose which matching dish to prepare.', '同じ配合で作る料理を選んでください。'],
    'cooking:stock': ['선택한 수량만큼 재료가 필요합니다.', 'You need the selected quantities of ingredients.', '選んだ数量の材料が必要です。'],
    'cooking:spoiled': ['상한 식재료는 요리에 쓸 수 없습니다.', 'Spoiled ingredients cannot be cooked.', '傷んだ食材は料理に使えません。'],
    'cooking:profession': ['이 요리법에 맞는 생산 직업이 필요합니다.', 'This recipe requires its cooking profession.', 'この料理法に対応する生産職が必要です。'],
    'cooking:kitchen': ['이용할 수 있는 현지 주방이 필요합니다.', 'An accessible local kitchen is required.', '利用できる現地の厨房が必要です。'],
    'cooking:knowledge': ['이 요리의 필요한 지식을 먼저 익히세요.', 'Learn the knowledge required for this dish first.', 'この料理に必要な知識を先に学んでください。'],
    'cooking:unavailable': ['회복한 뒤 요리하세요.', 'Recover before cooking.', '回復してから料理してください。'],
    '料理判定': ['요리 판정', 'Cooking check', '料理判定'],
  };
  if (errors[text]) return errors[text][locale === 'ko' ? 0 : locale === 'en' ? 1 : 2];
  const repeated = /^cooking:repeat:(\d+):(\d+)$/.exec(text);
  if (repeated) return ({ ko: `반복 조리 ${repeated[1]}/${repeated[2]}회 완료`, en: `Cooking repetition ${repeated[1]}/${repeated[2]} complete`, ja: `繰り返し調理 ${repeated[1]}/${repeated[2]}回完了` })[locale];
  const eaten = /^cooking:eaten:([a-z0-9-]+)$/.exec(text);
  if (eaten) return ({ ko: '음식을 삼키자 속이 불편하고 몸이 무거워졌다.', en: 'After swallowing it, your stomach churns and your body feels heavy.', ja: '飲み込むと腹が不快になり、体が重くなった。' })[locale];
  const m = /^cooking:(success|failure):([a-z0-9-]+):(\d+):(\d+):(mage|tinderbox|kitchen)$/.exec(text);
  if (!m) return;
  const name = FANTASY_ITEMS.find(item => item.id === m[2])?.names?.[locale] ?? fantasyTermName(m[2], locale);
  const fire = m[5] === 'tinderbox' ? ({ ko: ' · 목재 1개 소모', en: ' · Used 1 wood', ja: '・木材1個消費' })[locale] : m[5] === 'mage' ? ({ ko: ' · 마법으로 무료 점화', en: ' · Free magical ignition', ja: '・魔法で無料点火' })[locale] : '';
  return m[1] === 'success' ? ({ ko: `${name} ${m[3]}개 완성 · 요리 숙련 +${m[4]}${fire}`, en: `Prepared ${m[3]} × ${name} · Cooking +${m[4]}${fire}`, ja: `${name}を${m[3]}個完成・料理熟練+${m[4]}${fire}` })[locale]
    : ({ ko: `조리에 실패해 ${name} ${m[3]}개가 남았다 · 요리 숙련 +${m[4]}${fire}`, en: `Cooking failed, leaving ${m[3]} × ${name} · Cooking +${m[4]}${fire}`, ja: `調理に失敗し、${name}が${m[3]}個残った・料理熟練+${m[4]}${fire}` })[locale];
}
