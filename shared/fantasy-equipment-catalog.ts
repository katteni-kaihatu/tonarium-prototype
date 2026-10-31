import type { FantasyEquipmentSlot, FantasyItem, FantasyRecipe, FantasyStats } from './fantasy.ts';
type Names = [string, string, string];
const text = ([ko, en, ja]: Names) => ({ ko, en, ja });
const wearable = (id: string, names: Names, descriptions: Names, slot: FantasyEquipmentSlot, stats: Partial<FantasyStats>, price: number): FantasyItem => ({
  id, names: text(names), name: names[2], descriptions: text(descriptions), description: descriptions[2], price,
  category: slot === 'offhand' ? 'weapon' : ['head', 'legs', 'feet', 'gloves'].includes(slot) ? 'armor' : 'accessory', equipment: { slot, stats },
});
export const FANTASY_EQUIPMENT_ITEMS: FantasyItem[] = [
  wearable('linen-travel-cap', ['리넨 여행 모자', 'Linen Travel Cap', '麻布の旅帽子'], ['머리 장비. 최대 HP +2.', 'Head gear. Maximum HP +2.', '頭装備。最大HP+2。'], 'head', { hp: 2 }, 18),
  wearable('linen-travel-trousers', ['리넨 여행 바지', 'Linen Travel Trousers', '麻布の旅脚衣'], ['하의 장비. 최대 HP +4.', 'Leg gear. Maximum HP +4.', '下半身装備。最大HP+4。'], 'legs', { hp: 4 }, 26),
  wearable('leather-travel-boots', ['가죽 여행 장화', 'Leather Travel Boots', '革の旅靴'], ['신발 장비. 민첩 +1.', 'Foot gear. Agility +1.', '足装備。敏捷+1。'], 'feet', { agility: 1 }, 34),
  wearable('linen-work-gloves', ['리넨 작업 장갑', 'Linen Work Gloves', '麻布の作業手袋'], ['장갑 장비. 손재주 +1.', 'Gloves. Dexterity +1.', '手袋装備。手先+1。'], 'gloves', { dexterity: 1 }, 22),
  wearable('copper-band-ring', ['구리 띠 반지', 'Copper Band Ring', '銅の輪指輪'], ['두 반지 부위 중 하나에 장착. 최대 HP +2. 두 개 착용하려면 두 개가 필요합니다.', 'Fits either ring slot. Maximum HP +2. Two equipped rings require two owned copies.', 'どちらかの指輪枠に装備。最大HP+2。二枠には二個必要。'], 'ring1', { hp: 2 }, 20),
  wearable('linen-cord-necklace', ['리넨 끈 목걸이', 'Linen Cord Necklace', '麻紐の首飾り'], ['목걸이 장비. 최대 MP +2.', 'Necklace. Maximum MP +2.', '首飾り装備。最大MP+2。'], 'necklace', { mp: 2 }, 20),
  wearable('parrying-dagger', ['막기용 단검', 'Parrying Dagger', '受け流しの短剣'], ['도적·암살자용 보조 단검. 민첩 +1.', 'An offhand dagger for Thieves and Assassins. Agility +1.', '盗賊・暗殺者用の副手短剣。敏捷+1。'], 'offhand', { agility: 1 }, 48),
];
export const FANTASY_EQUIPMENT_RECIPES: FantasyRecipe[] = [
  { id: 'sew-travel-cap', name: '麻布の旅帽子を縫う', job: 'tailor', inputs: { linen: 1 }, output: 'linen-travel-cap', count: 1, dc: 9 },
  { id: 'sew-travel-trousers', name: '麻布の旅脚衣を縫う', job: 'tailor', inputs: { linen: 2 }, output: 'linen-travel-trousers', count: 1, dc: 10 },
  { id: 'sew-travel-boots', name: '革の旅靴を縫う', job: 'leatherworker', inputs: { 'wolf-hide': 1, linen: 1 }, output: 'leather-travel-boots', count: 1, dc: 10 },
  { id: 'sew-work-gloves', name: '麻布の作業手袋を縫う', job: 'tailor', inputs: { linen: 1 }, output: 'linen-work-gloves', count: 1, dc: 9 },
  { id: 'forge-copper-band', name: '銅の輪指輪を作る', job: 'blacksmith', inputs: { 'copper-ingot': 1 }, output: 'copper-band-ring', count: 1, dc: 10 },
  { id: 'tie-cord-necklace', name: '麻紐の首飾りを結ぶ', job: 'weaver', inputs: { linen: 1 }, output: 'linen-cord-necklace', count: 1, dc: 9 },
  { id: 'forge-parrying-dagger', name: '受け流しの短剣を鍛える', job: 'blacksmith', inputs: { ingot: 1, wood: 1 }, output: 'parrying-dagger', count: 1, dc: 12 },
];
