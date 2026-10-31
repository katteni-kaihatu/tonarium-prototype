import type { FantasyItem } from './fantasy.ts';
type Text = Record<'ko' | 'en' | 'ja', string>;
const l = (ko: string, en: string, ja: string): Text => ({ ko, en, ja });
export interface FantasyBag { id: string; kind: 'basic' | 'magic'; grade: 1 | 2 | 3; names: Text; weight: number; weightLimit: number; slotLimit: number; price: number }
export const FANTASY_BAGS: FantasyBag[] = [
  { id: 'canvas-bag-1', kind: 'basic', grade: 1, names: l('작은 여행 배낭', 'Small Traveling Pack', '小さな旅の背嚢'), weight: 800, weightLimit: 25_000, slotLimit: 32, price: 35 },
  { id: 'canvas-bag-2', kind: 'basic', grade: 2, names: l('튼튼한 여행 배낭', 'Sturdy Traveling Pack', '丈夫な旅の背嚢'), weight: 1200, weightLimit: 35_000, slotLimit: 40, price: 90 },
  { id: 'canvas-bag-3', kind: 'basic', grade: 3, names: l('대형 원정 배낭', 'Large Expedition Pack', '大きな遠征背嚢'), weight: 1800, weightLimit: 50_000, slotLimit: 48, price: 180 },
  { id: 'arcane-bag-1', kind: 'magic', grade: 1, names: l('접힌 공간의 주머니', 'Folded-Space Satchel', '折り畳む空間の鞄'), weight: 400, weightLimit: 50_000, slotLimit: 56, price: 240 },
  { id: 'arcane-bag-2', kind: 'magic', grade: 2, names: l('별무늬 공간 가방', 'Starwoven Space Bag', '星紋の空間鞄'), weight: 600, weightLimit: 80_000, slotLimit: 72, price: 600 },
  { id: 'arcane-bag-3', kind: 'magic', grade: 3, names: l('고리 겹침의 공간함', 'Nested-Ring Space Case', '輪を重ねる空間鞄'), weight: 900, weightLimit: 120_000, slotLimit: 96, price: 1200 },
  { id: 'preserve-magic-bag', kind: 'magic', grade: 3, names: l('신선 보존 마법 가방', 'Freshness Preservation Bag', '鮮度を保つ魔法鞄'), weight: 1200, weightLimit: 12_000, slotLimit: 8, price: 3200 },
];
export const FANTASY_BAG_ITEMS: FantasyItem[] = FANTASY_BAGS.map(bag => {
  const descriptions = bag.id === 'preserve-magic-bag' ? l(
    '마탑에서 파는 고가의 마법 보조 가방. 일반 가방을 유지하며 마법 가방 두 칸 중 하나에 착용한다. 가방 하나당 식품만 최대 12kg·8종을 자동 수납하고, 그 안의 식품만 신선도 저하를 1/10로 늦춘다. 넘친 식품과 일반 물품은 주 가방에 남는다. 식품 종류 순서로 넣고 같은 종류는 오래된 묶음부터 넣는다. 이미 상한 음식은 되돌리지 않는다. 가방 무게 1.2kg. 소지하기만 해서는 보존되지 않으며 중복 보존 속도는 겹치지 않는다.',
    'An expensive supplementary magic bag sold at towers. Keeps your normal bag and occupies one of two magic bag slots. Each bag automatically holds only food, up to 12 kg and 8 types, and ages that food at one tenth the normal rate. Excess food and ordinary goods stay in the main bag. Food types fill in a fixed order, oldest batches first within each type. Does not restore spoiled food. Bag weight: 1.2 kg. Must be equipped; two bags expand food space without multiplying preservation speed.',
    '魔法塔で売られる高価な魔法の補助鞄。普通の鞄を残して、魔法鞄二枠の一つに装備する。一つにつき食品だけ12kg・8種類まで自動収納し、その中の食品だけ鮮度低下を1/10にする。超過分や普通の荷物は主鞄に残る。食品の種類順に詰め、同じ種類は古いロットから入れる。傷んだ食品は戻らない。重さ1.2kg。所持だけでは効かず、二つでも保存速度は重複しない。',
  ) : l(`최대 ${bag.weightLimit / 1000}kg, 서로 다른 물품 ${bag.slotLimit}종. 가방 무게 ${bag.weight / 1000}kg. ${bag.kind === 'magic' ? '일반 가방에 추가하는 마법 보조 가방이며 최대 두 개를 함께 착용한다.' : '일반 가방은 하나만 착용하며 마법 보조 가방은 별도이다.'} 소지품에서 선택한 뒤 착용한다.`,
    `Carry up to ${bag.weightLimit / 1000} kg and ${bag.slotLimit} distinct item types. Bag weight: ${bag.weight / 1000} kg. ${bag.kind === 'magic' ? 'A supplementary magic bag; equip up to two alongside one normal bag.' : 'Equip one normal bag; supplementary magic bags use separate slots.'} Select this bag in your inventory, then equip it.`,
    `重量${bag.weightLimit / 1000}kg、異なる品目${bag.slotLimit}種類まで。鞄の重さ${bag.weight / 1000}kg。${bag.kind === 'magic' ? '普通の鞄に加える魔法の補助鞄で、二つまで同時に装備できる。' : '普通の鞄は一つ装備でき、魔法の補助鞄は別枠。'}持ち物で選び、装備する。`);
  return { id: bag.id, names: bag.names, name: bag.names.ja, descriptions, description: descriptions.ja, category: 'bag', tier: bag.grade, price: bag.price };
});
