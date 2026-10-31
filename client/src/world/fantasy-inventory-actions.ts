import type { FantasyItem } from '../../../shared/fantasy.ts';
import type { NpcLocale } from '../../../shared/npc.ts';
import { FANTASY_FOOD_META } from '../../../shared/fantasy-life.ts';

const labels = {
  eat: { ko: '먹기', en: 'Eat', ja: '食べる' },
  drink: { ko: '마시기', en: 'Drink', ja: '飲む' },
  use: { ko: '사용', en: 'Use', ja: '使う' },
};
export function fantasyInventoryUseLabel(id: string, item: FantasyItem | undefined, locale: NpcLocale): string {
  if (item?.category === 'rank-skill-book') return { ko: '읽고 기술 습득', en: 'Read and learn skill', ja: '読んで技能を習得' }[locale];
  if (item?.food || FANTASY_FOOD_META.some(food => food.item === id)) return labels.eat[locale];
  if (['potion', 'antidote'].includes(id) || item?.category === 'potion' || item?.category === 'alchemy-potion' || /^(hp|mp|fatigue)-potion(?:-|$)/.test(id)) return labels.drink[locale];
  return labels.use[locale];
}
