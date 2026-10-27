import type { FantasyCharacter, FantasyFoodLot } from './fantasy.ts';
import { FANTASY_ITEMS, FANTASY_JOBS } from './fantasy-data.ts';

type Labels = Record<'ko' | 'en' | 'ja', string>;
export type FantasyFoodQuality = 'fresh' | 'stale' | 'spoiled';
export interface FantasyFoodMeta { item: string; shelfLife: number; nutrition: number }
export const FANTASY_FOOD_META: FantasyFoodMeta[] = [
  { item: 'meat', shelfLife: 12, nutrition: 14 },
  { item: 'fish', shelfLife: 12, nutrition: 12 },
  { item: 'bread', shelfLife: 48, nutrition: 22 },
  { item: 'jerky', shelfLife: 168, nutrition: 32 },
  { item: 'meal', shelfLife: 24, nutrition: 38 },
  ...FANTASY_ITEMS.filter(item => item.food && !['meat', 'fish', 'bread', 'jerky', 'meal'].includes(item.id)).map(item => ({ item: item.id, ...item.food! })),
];

export const FANTASY_LODGINGS = [
  { id: 'common' as const, name: { ko: '공동 객실', en: 'Common room', ja: '相部屋' }, cost: 8, hours: 8, fatigueRecovery: 45, hpRecovery: 0.55, mpRecovery: 0.4 },
  { id: 'private' as const, name: { ko: '개인 객실', en: 'Private room', ja: '個室' }, cost: 20, hours: 8, fatigueRecovery: 75, hpRecovery: 0.8, mpRecovery: 0.75 },
  { id: 'suite' as const, name: { ko: '특실', en: 'Suite', ja: '特別室' }, cost: 50, hours: 8, fatigueRecovery: 100, hpRecovery: 1, mpRecovery: 1 },
];

export const FANTASY_DINING = [
  { id: 'simple' as const, name: { ko: '간단한 식사', en: 'Simple meal', ja: '軽い食事' }, cost: 5, hours: .5, nutrition: 30, hp: 5, mp: 0 },
  { id: 'hearty' as const, name: { ko: '든든한 식사', en: 'Hearty meal', ja: 'しっかりした食事' }, cost: 12, hours: .5, nutrition: 60, hp: 15, mp: 5 },
  { id: 'feast' as const, name: { ko: '풍성한 만찬', en: 'Feast', ja: '贅沢な食事' }, cost: 25, hours: .5, nutrition: 100, hp: 30, mp: 15 },
];

export const foodMeta = (item: string) => FANTASY_FOOD_META.find(food => food.item === item);
export const boundedNeed = (value: number) => Math.max(0, Math.min(100, value));
export function fantasyNeedPenalty(character: Pick<FantasyCharacter, 'fatigue' | 'hunger'>) {
  const penalty = (value: number) => value >= 90 ? 3 : value >= 70 ? 2 : value >= 50 ? 1 : 0;
  return penalty(character.fatigue ?? 0) + penalty(character.hunger ?? 0);
}

function nextLotId(character: FantasyCharacter, item: string) {
  let suffix = 0;
  const prefix = `food-${item}-${Math.floor(character.hour)}`;
  while (character.foodLots.some(lot => lot.id === `${prefix}-${suffix}`)) suffix++;
  return `${prefix}-${suffix}`;
}

export function reconcileFoodLots(character: FantasyCharacter): void {
  for (const meta of FANTASY_FOOD_META) {
    const wanted = character.inventory[meta.item] ?? 0;
    const existing = character.foodLots.filter(lot => lot.item === meta.item).sort((a, b) => a.createdAt - b.createdAt);
    const held = existing.reduce((sum, lot) => sum + lot.count, 0);
    let remove = Math.max(0, held - wanted);
    for (const lot of existing) {
      const taken = Math.min(remove, lot.count);
      lot.count -= taken;
      remove -= taken;
    }
    if (wanted > held) character.foodLots.push({ id: nextLotId(character, meta.item), item: meta.item, count: wanted - held, createdAt: character.hour });
  }
  character.foodLots = character.foodLots.filter(lot => lot.count > 0);
}

export function migrateFantasyLife(character: FantasyCharacter): FantasyCharacter {
  const next = structuredClone(character);
  if (next.fatigue === undefined) next.fatigue = 0;
  if (next.hunger === undefined) next.hunger = 0;
  if (next.charted === undefined) next.charted = [];
  if (next.foodLots === undefined) {
    next.foodLots = [];
    for (const meta of FANTASY_FOOD_META) {
      const count = next.inventory?.[meta.item];
      if (typeof count === 'number' && count > 0) next.foodLots.push({ id: `legacy-${meta.item}-${Math.floor(next.hour)}`, item: meta.item, count, createdAt: next.hour });
    }
  }
  return next;
}

export function canInspectFood(character: FantasyCharacter): boolean {
  return character.job === 'cook' && !!FANTASY_JOBS.find(job => job.id === 'cook')?.skills.some(skill => skill.id === 'cook-sense' && skill.kind === 'passive');
}

export function foodDetails(character: FantasyCharacter, item: string) {
  const meta = foodMeta(item);
  if (!meta) return undefined;
  const lot = character.foodLots?.filter(entry => entry.item === item && entry.count > 0).sort((a, b) => a.createdAt - b.createdAt)[0];
  const age = Math.max(0, character.hour - (lot?.createdAt ?? character.hour));
  const quality: FantasyFoodQuality = age > meta.shelfLife ? 'spoiled' : age >= meta.shelfLife * 0.65 ? 'stale' : 'fresh';
  return { age, shelfLife: meta.shelfLife, nutrition: meta.nutrition, quality };
}

const SENSE: Record<FantasyFoodQuality, { appearance: Labels; smell: Labels }> = {
  fresh: {
    appearance: { ko: '색과 표면이 자연스럽다.', en: 'Its color and surface look normal.', ja: '色つやと表面に目立つ異変はない。' },
    smell: { ko: '재료 본연의 냄새가 난다.', en: 'It smells as the ingredients should.', ja: '食材らしい自然な匂いがする。' },
  },
  stale: {
    appearance: { ko: '표면이 마르고 색이 조금 변했다.', en: 'Its surface is drying and its color has changed a little.', ja: '表面が乾き、色が少し変わっている。' },
    smell: { ko: '향이 약해지고 낯선 냄새가 섞였다.', en: 'Its aroma has faded, with an unfamiliar note.', ja: '香りが弱まり、いつもと違う匂いが混じる。' },
  },
  spoiled: {
    appearance: { ko: '색이 탁하고 표면이 심하게 변했다.', en: 'Its color is dull and its surface looks badly changed.', ja: '色が濁り、表面の変化が目立つ。' },
    smell: { ko: '강한 시큼한 냄새가 난다.', en: 'It has a strong, sour smell.', ja: '強い酸っぱい匂いがする。' },
  },
};

export function foodSense(character: FantasyCharacter, item: string): { appearance: Labels; smell: Labels; known?: NonNullable<ReturnType<typeof foodDetails>> } {
  const details = foodDetails(character, item);
  if (!details) return {
    appearance: { ko: '식품으로 분류되지 않는다.', en: 'This is not classified as food.', ja: '食品として分類されていない。' },
    smell: { ko: '식품의 냄새를 판단할 수 없다.', en: 'There is no food aroma to assess.', ja: '食品としての匂いは判断できない。' },
  };
  return { ...structuredClone(SENSE[details.quality]), ...(canInspectFood(character) ? { known: details } : {}) };
}
