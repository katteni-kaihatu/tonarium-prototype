import { FANTASY_ALCHEMY_CARRIERS, FANTASY_ALCHEMY_INGREDIENTS, FANTASY_ALCHEMY_FORMULA_IDS } from './fantasy-alchemy-catalog.ts';
import type { NpcLocale } from './npc.ts';

export interface FantasyAlchemyKnowledge { recipes: string[]; formulas?: string[] }
type Character = { alchemyKnowledge?: FantasyAlchemyKnowledge; readBooks?: string[] };
const pairs = [ ['redleaf', 'lizard-hide'], ['silverweed', 'lizard-hide'], ['frostbloom', 'wolf-hide'], ['embermoss', 'wolf-hide'], ['herb', 'wolf-hide'], ['sunroot', 'lizard-hide'], ['herb', 'bear-hide'], ['moonmint', 'wolf-hide'], ['sunroot', 'wolf-hide'], ['redleaf', 'bear-hide'] ];
export function fantasyAlchemyRecipeKey(carrier: string, ingredients: string[]): string | undefined {
  if (!FANTASY_ALCHEMY_CARRIERS.some(entry => entry.id === carrier) || !Array.isArray(ingredients) || ingredients.length < 2 || ingredients.length > 4 || new Set(ingredients).size !== ingredients.length) return;
  const materials = ingredients.map(id => FANTASY_ALCHEMY_INGREDIENTS.find(entry => entry.id === id));
  if (materials.some(entry => !entry) || !materials.some(entry => entry?.kind === 'herb') || !materials.some(entry => entry?.kind === 'monster')) return;
  return `${carrier}:${[...ingredients].sort().join('+')}`;
}
const registered = new Set(FANTASY_ALCHEMY_CARRIERS.flatMap(carrier => pairs.map(pair => fantasyAlchemyRecipeKey(carrier.id, pair)!)));
export const FANTASY_ALCHEMY_BOOK_RECIPES: Record<string, string[]> = {
  'remedies-and-rites': [fantasyAlchemyRecipeKey('flask', ['redleaf', 'lizard-hide'])!, fantasyAlchemyRecipeKey('flask', ['herb', 'bear-hide'])!],
};
export const FANTASY_ALCHEMY_BOOK_FORMULAS: Record<string, string[]> = { 'remedies-and-rites': ['healing', 'antidote'] };
const formulaExists = (id: string) => FANTASY_ALCHEMY_FORMULA_IDS.some(formula => formula === id);
export function fantasyAlchemyUnidentifiedFormulaName(id: string, locale: NpcLocale): string {
  const number = FANTASY_ALCHEMY_FORMULA_IDS.findIndex(formula => formula === id) + 1;
  return { ko: `미확인 조합 ${number}`, en: `Unidentified mixture ${number}`, ja: `未確認の配合 ${number}` }[locale];
}
export function validAlchemyKnowledge(c: Character): boolean {
  const knowledge = c.alchemyKnowledge;
  if (knowledge === undefined) return true;
  if (!knowledge || typeof knowledge !== 'object' || Array.isArray(knowledge) || Object.keys(knowledge).some(key => !['recipes', 'formulas'].includes(key)) || !Array.isArray(knowledge.recipes) || knowledge.recipes.length > 6000 || new Set(knowledge.recipes).size !== knowledge.recipes.length) return false;
  if (knowledge.formulas !== undefined && (!Array.isArray(knowledge.formulas) || knowledge.formulas.length > FANTASY_ALCHEMY_FORMULA_IDS.length || new Set(knowledge.formulas).size !== knowledge.formulas.length || knowledge.formulas.some(id => typeof id !== 'string' || !formulaExists(id)))) return false;
  return knowledge.recipes.every(key => {
    if (typeof key !== 'string') return false;
    const [carrier, ingredients, extra] = key.split(':');
    return extra === undefined && ingredients !== undefined && fantasyAlchemyRecipeKey(carrier, ingredients.split('+')) === key;
  });
}
export function fantasyAlchemyResultKnown(c: Character, carrier: string, ingredients: string[]): boolean {
  const key = fantasyAlchemyRecipeKey(carrier, ingredients);
  return !!key && validAlchemyKnowledge(c) && (!!c.alchemyKnowledge?.recipes.includes(key) || (c.readBooks ?? []).some(id => Object.hasOwn(FANTASY_ALCHEMY_BOOK_RECIPES, id) && FANTASY_ALCHEMY_BOOK_RECIPES[id].includes(key)));
}
export function learnFantasyAlchemyRecipe(c: Character, carrier: string, ingredients: string[]): string[] {
  const key = fantasyAlchemyRecipeKey(carrier, ingredients);
  if (!key || !validAlchemyKnowledge(c)) return [];
  const knowledge = c.alchemyKnowledge ??= { recipes: [] };
  if (knowledge.recipes.includes(key)) return [];
  knowledge.recipes.push(key); return [key];
}
export function learnFantasyAlchemyBook(c: Character, id: string): string[] {
  if ((!Object.hasOwn(FANTASY_ALCHEMY_BOOK_RECIPES, id) && !Object.hasOwn(FANTASY_ALCHEMY_BOOK_FORMULAS, id)) || !c.readBooks?.includes(id) || !validAlchemyKnowledge(c)) return [];
  const recipes = Object.hasOwn(FANTASY_ALCHEMY_BOOK_RECIPES, id) ? FANTASY_ALCHEMY_BOOK_RECIPES[id] : [], formulas = Object.hasOwn(FANTASY_ALCHEMY_BOOK_FORMULAS, id) ? FANTASY_ALCHEMY_BOOK_FORMULAS[id] : [];
  return [...recipes.flatMap(key => { const [carrier, materials] = key.split(':'); return learnFantasyAlchemyRecipe(c, carrier, materials.split('+')); }), ...formulas.flatMap(formula => learnFantasyAlchemyFormula(c, formula).map(id => `formula:${id}`))];
}
export function fantasyAlchemyFormulaKnown(c: Character, id: string): boolean {
  return formulaExists(id) && validAlchemyKnowledge(c) && (!!c.alchemyKnowledge?.formulas?.includes(id) || (c.readBooks ?? []).some(book => Object.hasOwn(FANTASY_ALCHEMY_BOOK_FORMULAS, book) && FANTASY_ALCHEMY_BOOK_FORMULAS[book].includes(id)));
}
export function learnFantasyAlchemyFormula(c: Character, id: string): string[] {
  if (!formulaExists(id) || !validAlchemyKnowledge(c)) return [];
  const knowledge = c.alchemyKnowledge ??= { recipes: [] }, formulas = knowledge.formulas ??= [];
  if (formulas.includes(id)) return [];
  formulas.push(id); return [id];
}
export function fantasyAlchemyRecipeStability(carrier: string, ingredients: string[]): 'registered' | 'experimental' | 'unstable' {
  const key = fantasyAlchemyRecipeKey(carrier, ingredients);
  if (!key) return 'unstable';
  if (registered.has(key)) return 'registered';
  const materials = ingredients.map(id => FANTASY_ALCHEMY_INGREDIENTS.find(entry => entry.id === id)!);
  return materials.some(herb => herb.kind === 'herb' && materials.some(monster => monster.kind === 'monster' && Object.keys(herb.affinities).some(family => (herb.affinities[family as keyof typeof herb.affinities] ?? 0) > 0 && (monster.affinities[family as keyof typeof monster.affinities] ?? 0) > 0))) ? 'experimental' : 'unstable';
}
