import type { FantasyItem } from './fantasy.ts';

type Text = [string, string, string];
const labels = ([ko, en, ja]: Text) => ({ ko, en, ja });
function dish(id: string, names: Text, description: Text, nutrition: number, penalty?: FantasyItem['foodPenalty']): FantasyItem {
  return { id, name: names[2], names: labels(names), description: description[2], descriptions: labels(description), price: 1, category: 'food', craftOnly: true,
    food: { shelfLife: 12, nutrition }, use: { hunger: nutrition }, ...(penalty ? { foodPenalty: penalty } : {}) };
}
export const FANTASY_FREEFORM_COOKING_ITEMS: FantasyItem[] = [
  dish('improvised-meal', ['일단 끓인 한 끼', 'At Least It’s Cooked', 'とりあえず煮た一食'], ['여러 먹거리를 한데 익혔다. 재료의 모양이 조금씩 남아 있다.', 'Several edible ingredients cooked together, with recognizable pieces remaining.', 'いろいろな食べ物を煮込み、材料の形が少し残っている。'], 12),
  dish('improvised-broth', ['건더기 실종 수프', 'Missing-Ingredients Soup', '具が行方不明のスープ'], ['건더기가 적고 향이 옅은 수프다.', 'A light broth with few solids and a faint aroma.', '具が少なく、香りも淡い汁物。'], 2),
  dish('gritty-dish', ['씹으면 덜컥 잡탕', 'Crunch-and-Flinch Stew', '噛むとガリッと煮込み'], ['딱딱한 알갱이와 질긴 조각이 섞여 있다. 삼키기 어려워 보인다.', 'Hard grains and tough fragments make this look difficult to swallow.', '硬い粒や噛み切れない欠片が混じり、飲み込みづらそうだ。'], 1, { fatigue: 10, status: 'weakness' }),
  dish('toxic-dish', ['수상한 마녀의 잡탕', 'Suspicious Witch’s Stew', '怪しい魔女のごった煮'], ['탁한 빛깔과 코를 찌르는 냄새가 난다. 먹으면 몸을 해칠 듯하다.', 'Murky colors and a pungent smell suggest it would make you ill.', '濁った色で鼻を刺す匂いがし、体を悪くしそうだ。'], 1, { fatigue: 15, status: 'poison' }),
  dish('charred-dish', ['숯이 된 저녁', 'Dinner Turned to Charcoal', '炭になった夕ご飯'], ['검게 탄 조각이 많고 쓴내가 난다. 먹어도 배가 거의 차지 않을 듯하다.', 'Blackened pieces smell bitter and offer little nourishment.', '黒焦げの部分が多く苦い匂いがし、食べても腹の足しにはなりにくそうだ。'], 1, { fatigue: 5 }),
];
export const FANTASY_BAD_COOKING_SENSE = {
  'gritty-dish': { appearance: labels(['딱딱한 알갱이와 질긴 조각이 보인다.', 'Hard grains and tough fragments are visible.', '硬い粒や噛み切れない欠片が見える。']), smell: labels(['먹거리와 흙내가 뒤섞여 난다.', 'Food smells mingle with an earthy, dusty odor.', '食べ物の匂いに土臭さが混じる。']) },
  'toxic-dish': { appearance: labels(['탁한 빛깔의 거품이 떠 있다.', 'Murky foam floats on the surface.', '濁った泡が浮いている。']), smell: labels(['코를 찌르는 불쾌한 냄새가 난다.', 'A pungent, unpleasant smell stings your nose.', '鼻を刺す不快な匂いがする。']) },
  'charred-dish': { appearance: labels(['표면과 건더기가 검게 타 있다.', 'The surface and chunks are blackened.', '表面や具が黒く焦げている。']), smell: labels(['쓰고 매캐한 탄내가 난다.', 'It smells bitter and smoky.', '苦く煙たい焦げ臭さがある。']) },
} as const;
