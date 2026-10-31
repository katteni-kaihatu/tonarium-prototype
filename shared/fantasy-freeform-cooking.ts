import { FANTASY_CUISINE_FAMILIES, FANTASY_CUISINE_PANTRY_GROUPS, type FantasyCuisineGroup } from './fantasy-cuisine-catalog.ts';
import type { FantasyItem } from './fantasy.ts';
import { FANTASY_ITEMS } from './fantasy-data.ts';
import { foodMeta } from './fantasy-life.ts';
import type { FantasyCookingAction, FantasyCookingPlan } from './fantasy-cooking.ts';

export const FANTASY_IMPROVISED_RECIPE = 'cook-improvised';
const RAW_CATEGORIES = new Set(['food', 'herb', 'spice', 'fish', 'meat', 'grain', 'fruit', 'vegetable', 'mushroom', 'ore', 'ingot', 'wood', 'hide', 'cloth', 'silk', 'fiber', 'gem', 'crystal', 'monster-material', 'alchemy-material', 'apex-material', 'material', 'leather', 'seed', 'plant']);
const LEGACY_RAW = new Set(['herb', 'ore', 'wood', 'spice', 'crystal', 'gem', 'meat', 'fish', 'bread', 'meal', 'jerky']);
export function fantasyIsCookingIngredient(item: FantasyItem): boolean {
  return !item.equipment && !item.wear && !item.light && (LEGACY_RAW.has(item.id) || !!item.food || RAW_CATEGORIES.has(item.category ?? ''));
}
export function fantasyCookingMixture(inputs: Readonly<Record<string, number>>) {
  let nutrition = 0, inedible = false, toxic = false, quantity = 0;
  for (const [id, amount] of Object.entries(inputs)) {
    const item = FANTASY_ITEMS.find(item => item.id === id)!;
    quantity += amount;
    if (item.foodPenalty?.status === 'poison' || /(?:^|-)(?:venom|venomous|poison|toxic|nightshade|sulfur|sulphur|brimstone|rot|rotten|rotting|spores?|acid|caustic|bile|miasma|ichor|deathcap|wolfsbane|mercury|quicksilver|lead|blight)(?:-|$)/.test(id)) toxic = true;
    else if (item.foodPenalty || fantasyCookingIngredientGroup(id) === 'other') inedible = true;
    nutrition += amount * (foodMeta(id)?.nutrition ?? (['herb', 'spice'].includes(item.category ?? '') || ['herb', 'spice'].includes(id) ? 1 : 0));
  }
  const risk = toxic ? 'toxic' : inedible ? 'inedible' : 'edible';
  const output = toxic ? 'toxic-dish' : inedible ? 'gritty-dish' : nutrition >= 12 ? 'improvised-meal' : 'improvised-broth';
  const count = Math.max(1, Math.min(10, risk === 'edible' ? Math.floor(nutrition / (output === 'improvised-meal' ? 12 : 2)) : Math.ceil(quantity / 2)));
  return { risk, output, count, quantity };
}
export function fantasyCookingIngredientGroup(id: string): FantasyCuisineGroup {
  if (FANTASY_CUISINE_PANTRY_GROUPS[id]) return FANTASY_CUISINE_PANTRY_GROUPS[id];
  const category = FANTASY_ITEMS.find(item => item.id === id)?.category;
  if (/meat|roast|jerky|bacon|sausage/.test(id)) return 'meat';
  if (/fish|trout|salmon|tuna|carp/.test(id) || category === 'fish') return 'fish';
  if (/grain|flour|bread|rice|biscuit|cracker|loaf/.test(id)) return 'grain';
  if (/milk|butter|cheese|cream/.test(id)) return 'dairy';
  if (/(?:^|-)egg(?:-|$)/.test(id)) return 'egg';
  if (/honey|sugar|syrup|pudding|dessert/.test(id)) return 'sweet';
  if (/apple|pear|berry|apricot|citrus|lemon|rosehip/.test(id)) return 'fruit';
  if (/mushroom/.test(id)) return 'mushroom';
  if (category === 'herb' || /herb|tea|mint|nettle|lotus/.test(id)) return 'herb';
  if (category === 'spice' || /spice|pepper|salt|cinnamon|saffron|anise/.test(id)) return 'spice';
  if (/potato|onion|carrot|tomato|cabbage|bean|garlic|leek|sunroot/.test(id)) return 'vegetable';
  return foodMeta(id) ? 'vegetable' : 'other';
}
const signature = (groups: readonly string[]) => [...groups].sort().join('|');
function matchScore(groups: readonly string[], candidate: readonly string[]): number {
  const remaining = [...candidate]; let score = 0;
  for (const group of groups) { const index = remaining.indexOf(group); if (index >= 0) { score++; remaining.splice(index, 1); } }
  return score;
}
function tasteIndex(value: string): number {
  let hash = 2166136261; for (const char of value) hash = Math.imul(hash ^ char.charCodeAt(0), 16777619);
  return (hash >>> 0) % 3;
}
export function fantasyBadCookingChoices(kind: 'gritty' | 'toxic'): { item: string; weight: number }[] {
  return FANTASY_CUISINE_FAMILIES.find(family => family.id === kind)!.candidates.map(candidate => ({ item: candidate.item, weight: 1 }));
}
export function fantasyImprovisedCookingPlan(action: FantasyCookingAction): FantasyCookingPlan {
  const inputs = Object.fromEntries(action.ingredients.map(ingredient => [ingredient.item, ingredient.count]));
  const mixture = fantasyCookingMixture(inputs);
  if (!action.mains) {
    const batches = Math.max(1, Math.min(10, Math.ceil(mixture.quantity / 4))), hours = action.station === 'outdoor' ? .5 : 1;
    return { improvised: true, recipe: { id: FANTASY_IMPROVISED_RECIPE, inputs, output: mixture.output, count: mixture.count, dc: 12, hours, tools: [] }, station: action.station, batches, inputs, count: mixture.count, hours: hours * batches };
  }
  const groups = action.mains.map(fantasyCookingIngredientGroup), safe = FANTASY_CUISINE_FAMILIES.filter(family => family.id !== 'gritty' && family.id !== 'toxic');
  const family = mixture.risk !== 'edible' ? FANTASY_CUISINE_FAMILIES.find(family => family.id === (mixture.risk === 'toxic' ? 'toxic' : 'gritty'))!
    : safe.find(family => signature(family.groups) === signature(groups)) ?? safe.reduce((best, family) => matchScore(groups, family.groups) > matchScore(groups, best.groups) ? family : best);
  const candidates = family.candidates.map((candidate, index) => ({ item: candidate.item, weight: 1 + (action.additions ?? []).reduce((bonus, addition) => {
    const group = fantasyCookingIngredientGroup(addition.item), pair = `${groups[addition.main]}:${group}`;
    return bonus + (candidate.affinities.includes(group) ? 2 : 0) + (candidate.affinities.includes(pair) ? 3 : 0)
      + (tasteIndex(`${action.mains![addition.main]}:${addition.item}`) === index ? 1 : 0);
  }, 0) }));
  const hours = action.station === 'outdoor' ? .5 : 1;
  return { improvised: true, candidates, recipe: { id: FANTASY_IMPROVISED_RECIPE, inputs, output: candidates[0].item, count: 1,
    dc: 10 + (action.additions?.length ?? 0) + (mixture.risk === 'toxic' ? 4 : mixture.risk === 'inedible' ? 3 : 0), hours, tools: [] }, station: action.station, batches: 1, inputs, count: 1, hours };
}
