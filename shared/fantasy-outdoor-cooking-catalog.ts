import type { FantasyItem } from './fantasy.ts';

type Text = [string, string, string];
const labels = ([ko, en, ja]: Text) => ({ ko, en, ja });
const tool = (id: string, names: Text, price: number, descriptions: Text): FantasyItem => ({ id, name: names[2], names: labels(names), price, category: 'tool', tier: 1, description: descriptions[2], descriptions: labels(descriptions) });

// 道具は繰り返し使い、火おこし一回につき木材だけを消費する。
export const FANTASY_OUTDOOR_COOKING_ITEMS: FantasyItem[] = [
  tool('tinderbox', ['부싯돌 화승통', 'Flint Tinderbox', '火打ち石の火口箱'], 12, ['마법사가 없을 때 목재 1개로 야영이나 요리의 불을 붙입니다. 화승통은 소모되지 않습니다.', 'Starts a camp or cooking fire with 1 wood when no mage is present. The tinderbox is reusable.', '魔術師がいないとき、木材1個で野営や料理の火をおこす。火口箱は繰り返し使える。']),
  tool('camp-cookpot', ['야영 냄비', 'Camp Cookpot', '野営の煮炊き鍋'], 20, ['야외에서 고기와 약초를 끓이는 재사용 냄비입니다.', 'A reusable pot for cooking meat and herbs outdoors.', '野外で肉や薬草を煮込む、繰り返し使える鍋。']),
  tool('trail-pan', ['여행용 프라이팬', 'Trail Frying Pan', '旅のフライパン'], 16, ['야외에서 생선을 굽는 재사용 팬입니다.', 'A reusable pan for frying fish outdoors.', '野外で魚を焼く、繰り返し使えるフライパン。']),
  tool('folding-grill', ['접이식 석쇠', 'Folding Grill', '折り畳み焼き網'], 18, ['꼬치와 보존용 고기를 굽는 재사용 석쇠입니다.', 'A reusable grill for roasting skewers and preparing jerky.', '串焼きや保存用の肉を焼く、繰り返し使える網。']),
  tool('camp-kettle', ['야영 주전자', 'Camp Kettle', '野営の湯沸かし'], 14, ['약초차를 끓이는 재사용 주전자입니다. 물은 현지에서 마련합니다.', 'A reusable kettle for herbal tea. Water is sourced locally.', '薬草茶を沸かす、繰り返し使える湯沸かし。水は現地で用意する。']),
  tool('folding-cutting-board', ['접이식 도마', 'Folding Cutting Board', '折り畳みまな板'], 15, ['요리 숙련 100 이상의 요리사는 야영 스튜와 육포를 한 개 더 만듭니다. 도마는 소모되지 않습니다.', 'Cooks with 100 cooking proficiency prepare one extra camp stew or jerky portion. The board is reusable.', '料理熟練100以上の料理人は、野営の煮込みや干し肉を1個多く作れる。まな板は繰り返し使える。']),
  { id: 'camp-roast', name: '野営の肉串', names: labels(['야영 고기꼬치', 'Camp Meat Skewer', '野営の肉串']), price: 9, category: 'food', tier: 1, description: '火でしっかり焼いた素朴な肉串。早めに食べたい。', descriptions: labels(['불에 익힌 소박한 고기꼬치입니다. 빨리 먹는 편이 좋습니다.', 'A simple meat skewer cooked over a fire. Best eaten soon.', '火でしっかり焼いた素朴な肉串。早めに食べたい。']), food: { shelfLife: 12, nutrition: 24 }, use: { hunger: 24, hp: 4 } },
  { id: 'camp-pan-fish', name: '旅の焼き魚', names: labels(['여행길 생선구이', 'Trail Pan-fried Fish', '旅の焼き魚']), price: 10, category: 'food', tier: 1, description: '携帯フライパンで香ばしく焼いた魚。長くは日持ちしない。', descriptions: labels(['휴대용 팬에 구운 생선입니다. 오래 보관할 수 없습니다.', 'Fish fried in a portable pan. It does not keep for long.', '携帯フライパンで香ばしく焼いた魚。長くは日持ちしない。']), food: { shelfLife: 12, nutrition: 26 }, use: { hunger: 26, hp: 4 } },
];

export const FANTASY_GUILD_CAMP_SUPPLIES = ['tinderbox', 'camp-cookpot', 'trail-pan', 'folding-grill', 'camp-kettle', 'folding-cutting-board'] as const;

export interface FantasyOutdoorRecipe {
  id: string;
  names: ReturnType<typeof labels>;
  tools: string[];
  inputs: Record<string, number>;
  output: string;
  count: number;
  hours: number;
  dc: number;
  cookBatch?: boolean;
}
export const FANTASY_OUTDOOR_COOKING_RECIPES: FantasyOutdoorRecipe[] = [
  { id: 'camp-skewer', names: labels(['야영 고기꼬치', 'Camp meat skewer', '野営の肉串']), tools: ['folding-grill'], inputs: { meat: 1 }, output: 'camp-roast', count: 1, hours: .5, dc: 8 },
  { id: 'camp-pan-fish', names: labels(['여행길 생선구이', 'Trail pan-fried fish', '旅の焼き魚']), tools: ['trail-pan'], inputs: { fish: 1, herb: 1 }, output: 'camp-pan-fish', count: 1, hours: .5, dc: 9 },
  { id: 'camp-stew', names: labels(['야영 약초스튜', 'Camp herb stew', '野営の薬草煮込み']), tools: ['camp-cookpot'], inputs: { meat: 2, herb: 1, spice: 1 }, output: 'meal', count: 2, hours: 1, cookBatch: true, dc: 11 },
  { id: 'camp-jerky', names: labels(['야영 육포', 'Camp jerky', '野営の干し肉']), tools: ['folding-grill'], inputs: { meat: 2, spice: 1 }, output: 'jerky', count: 2, hours: 2, cookBatch: true, dc: 12 },
  { id: 'camp-herbal-tea', names: labels(['야영 약초차', 'Camp herbal tea', '野営の薬草茶']), tools: ['camp-kettle'], inputs: { herb: 2 }, output: 'herbal-tea', count: 1, hours: .5, dc: 7 },
];
