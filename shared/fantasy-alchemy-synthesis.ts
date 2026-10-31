import { fantasyHasJob } from './fantasy-careers.ts';
import type { FantasyAction, FantasyCharacter, FantasyProfile, FantasyResult } from './fantasy.ts';
import type { NpcLocale } from './npc.ts';
import { FANTASY_ITEMS } from './fantasy-data.ts';
import { fantasyBuildings } from './fantasy-town.ts';
import { fantasyFacilityOpen, fantasyFacilityClosedText } from './fantasy-facility-hours.ts';
import { grantFantasyPractice } from './fantasy-progression.ts';
import { fantasyAlchemyRecipeStability, fantasyAlchemyResultKnown, learnFantasyAlchemyRecipe, validAlchemyKnowledge } from './fantasy-alchemy-discovery.ts';
import { FANTASY_ALCHEMY_CARRIERS, FANTASY_ALCHEMY_FAMILIES, FANTASY_ALCHEMY_INGREDIENTS, FANTASY_ALCHEMY_SYNTHESIS_ITEMS, fantasyAlchemyOutputId, type FantasyAlchemyCarrier } from './fantasy-alchemy-catalog.ts';

export type FantasyAlchemyComposeAction = { type: 'alchemyCompose'; carrier: FantasyAlchemyCarrier; ingredients: string[] };
export interface FantasyAlchemySynthesisContext { advanceTime?: boolean; startedAt?: number }
const errors = {
  recipe: { ko: '등록된 약초와 마물 재료를 서로 다르게 골라 주세요.', en: 'Choose distinct registered herbs and monster materials.', ja: '登録された薬草と魔物素材を重ねず選んでください。' },
  workshop: { ko: '연금술사로서 현지 연금 공방을 이용해야 합니다.', en: 'Work as an alchemist at a local alchemy workshop.', ja: '錬金術師として現地の錬金工房を利用してください。' },
  stock: { ko: '선택한 재료를 각각 1개씩 가지고 있어야 합니다.', en: 'You need one unit of each selected ingredient.', ja: '選んだ素材をそれぞれ1個ずつ所持してください。' },
  unavailable: { ko: '지금은 조합을 시작할 수 없습니다.', en: 'You cannot begin synthesis now.', ja: '今は調合を始められません。' },
};
export function fantasyAlchemyIngredientCapacity(c: Pick<FantasyCharacter, 'jobXp'>): number { const xp = c.jobXp.alchemist ?? 0; return xp >= 100 ? 4 : xp >= 30 ? 3 : 2; }
export function fantasyAlchemyComposeValid(value: unknown): value is FantasyAlchemyComposeAction {
  if (!value || typeof value !== 'object' || Array.isArray(value)) return false;
  const v = value as Record<string, unknown>;
  return Object.keys(v).length === 3 && v.type === 'alchemyCompose' && FANTASY_ALCHEMY_CARRIERS.some(carrier => carrier.id === v.carrier)
    && Array.isArray(v.ingredients) && v.ingredients.length >= 2 && v.ingredients.length <= 4 && new Set(v.ingredients).size === v.ingredients.length
    && v.ingredients.every(id => typeof id === 'string' && FANTASY_ALCHEMY_INGREDIENTS.some(ingredient => ingredient.id === id));
}
export function fantasyCompileAlchemy(c: Pick<FantasyCharacter, 'job' | 'lifeJob' | 'jobXp'>, carrier: string, ingredients: string[]) {
  if (!fantasyHasJob(c,'alchemist') || !fantasyAlchemyComposeValid({ type: 'alchemyCompose', carrier, ingredients }) || ingredients.length > fantasyAlchemyIngredientCapacity(c)) return;
  const materials = FANTASY_ALCHEMY_INGREDIENTS.filter(ingredient => ingredients.includes(ingredient.id));
  if (!materials.some(ingredient => ingredient.kind === 'herb') || !materials.some(ingredient => ingredient.kind === 'monster') || materials.some(ingredient => !FANTASY_ITEMS.some(item => item.id === ingredient.id))) return;
  const family = FANTASY_ALCHEMY_FAMILIES.map(family => ({ family, score: materials.reduce((sum, material) => sum + (material.affinities[family.id] ?? 0), 0) })).sort((a, b) => b.score - a.score)[0].family;
  // 追加素材ほど残る安定幅が減り、単純な足し算では強くならない。
  const potency = 10 * (1 - materials.reduce((room, material) => room * (1 - material.potency * .07), 1));
  const grade = potency >= 5 ? 3 : potency >= 3 ? 2 : 1, id = fantasyAlchemyOutputId(family.id, carrier as FantasyAlchemyCarrier, grade);
  const item = FANTASY_ALCHEMY_SYNTHESIS_ITEMS.find(item => item.id === id)!;
  return { item: id, count: 1 as const, family: family.id, grade, potency, carrier: carrier as FantasyAlchemyCarrier, ingredients: materials.map(material => material.id), names: item.names!, combatUse: item.combatUse!, hours: 2 as const };
}
export function fantasyAlchemySynthesisHours(_profile: FantasyProfile, action: FantasyAction | FantasyAlchemyComposeAction): number { return action.type === 'alchemyCompose' ? 2 : 0; }
export function applyFantasyAlchemySynthesis(profile: FantasyProfile, action: FantasyAction | FantasyAlchemyComposeAction, rng: () => number = Math.random, context: FantasyAlchemySynthesisContext = {}): FantasyResult | undefined {
  if (action.type !== 'alchemyCompose') return;
  const fail = (error: string): FantasyResult => ({ profile, changed: false, error }), c = profile.character;
  if (!c || profile.death || c.hp <= 0 || profile.activity || profile.combatId || profile.event || c.dungeon?.active) return fail(errors.unavailable.ja);
  if (!fantasyHasJob(c,'alchemist') || !fantasyBuildings(c).some(building => building.id === 'tower')) return fail(errors.workshop.ja);
  if (!fantasyFacilityOpen('tower', context.startedAt ?? c.hour)) return fail(fantasyFacilityClosedText('ja'));
  const compiled = fantasyCompileAlchemy(c, action.carrier, action.ingredients); if (!compiled || !validAlchemyKnowledge(c)) return fail(errors.recipe.ja);
  if (compiled.ingredients.some(id => !Number.isSafeInteger(c.inventory[id]) || c.inventory[id] < 1)) return fail(errors.stock.ja);
  const next = structuredClone(profile), target = next.character!;
  for (const id of compiled.ingredients) target.inventory[id]--;
  const stability = fantasyAlchemyRecipeStability(compiled.carrier, compiled.ingredients);
  const known = fantasyAlchemyResultKnown(c, compiled.carrier, compiled.ingredients), roll = stability === 'experimental' && !known ? rng() : 1;
  const success = stability === 'registered' || stability === 'experimental' && (known || Number.isFinite(roll) && roll >= 0 && roll < .65);
  if (success) {
    target.inventory[compiled.item] = (target.inventory[compiled.item] ?? 0) + 1;
    learnFantasyAlchemyRecipe(target, compiled.carrier, compiled.ingredients);
  }
  if (context.advanceTime !== false) target.hour += 2;
  grantFantasyPractice(target, { key: `alchemy-compose:alchemist:${target.location}:${compiled.family}`, amount: 3, success });
  next.revision++;
  next.log.push({ id: (next.log.at(-1)?.id ?? 0) + 1, hour: target.hour, kind: success ? 'success' : 'failure', text: success ? `alchemy:synthesis:${compiled.item}` : 'alchemy:synthesis:failed' }); next.log = next.log.slice(-100);
  return { profile: next, changed: true };
}
export function fantasyAlchemySynthesisText(source: string, locale: NpcLocale): string | undefined {
  if (source === 'alchemy:synthesis:failed') return { ko: '배합이 안정되지 않아 합성에 실패했습니다. 재료와 시간은 소비되었습니다.', en: 'The mixture failed to stabilize. The reagents and time were consumed.', ja: '配合が安定せず合成に失敗した。素材と時間は消費した。' }[locale];
  const error = Object.values(errors).find(error => error.ja === source); if (error) return error[locale];
  if (source === fantasyFacilityClosedText('ja')) return fantasyFacilityClosedText(locale);
  const item = FANTASY_ALCHEMY_SYNTHESIS_ITEMS.find(item => source === `alchemy:synthesis:${item.id}`); if (!item) return;
  return { ko: `${item.names!.ko} 1개를 합성했습니다.`, en: `Synthesized one ${item.names!.en}.`, ja: `${item.names!.ja}を1個合成した。` }[locale];
}
