import type { FantasyItem, FantasyRecipe } from './fantasy.ts';
const l = (ko: string, en: string, ja: string) => ({ ko, en, ja });
const garment = (id: string, names: ReturnType<typeof l>, descriptions: ReturnType<typeof l>, price: number, warmth: number, cooling: number, waterproof: number): FantasyItem => ({ id, name: names.ja, names, description: descriptions.ja, descriptions, price, category: 'clothing', tier: 1, wear: { warmth, cooling, waterproof } });

export const FANTASY_ENVIRONMENT_ITEMS: FantasyItem[] = [
  { id: 'lantern', name: '旅のランタン', names: l('여행용 랜턴', 'Travel Lantern', '旅のランタン'), description: '夜道や洞窟を照らす携帯灯。', descriptions: l('밤길과 동굴을 밝히는 휴대용 등불이다.', 'A portable light for night roads and caves.', '夜道や洞窟を照らす携帯灯。'), price: 12, category: 'tool', tier: 1, light: true },
  garment('linen-clothes', l('리넨 평상복', 'Linen Clothes', '麻の普段着'), l('통풍이 잘되는 가벼운 평상복이다.', 'Light everyday clothes that breathe well.', '風通しのよい軽い普段着。'), 14, 1, 4, 0),
  garment('summer-wrap', l('한여름 여행복', 'Summer Travelwear', '夏の旅装'), l('햇빛을 가리고 열을 내보내는 얇은 여행복이다.', 'Thin travelwear that shades the skin and releases heat.', '日差しを遮り熱を逃がす薄手の旅装。'), 28, 0, 9, 0),
  garment('wool-coat', l('모직 외투', 'Wool Coat', '毛織の外套'), l('차가운 바람을 막아주는 따뜻한 외투다.', 'A warm coat that blocks chilly winds.', '冷たい風を防ぐ暖かい外套。'), 32, 11, 0, 2),
  garment('fur-parka', l('한겨울 모피 여행복', 'Winter Fur Travelwear', '厳冬の毛皮旅装'), l('모피와 안감을 겹쳐 혹한의 체온 손실을 줄인다.', 'Layers of fur and lining reduce heat loss in severe cold.', '毛皮と裏地を重ねて厳寒の熱損失を抑える。'), 65, 21, 0, 4),
  garment('rain-cape', l('방수 망토', 'Rain Cape', '雨よけのマント'), l('빗물을 흘려보내는 가벼운 망토다.', 'A light cape that sheds rain.', '雨を流す軽いマント。'), 25, 3, 1, 12),
  garment('oilskin-coat', l('방수 여행복', 'Oilskin Travelwear', '油布の旅装'), l('비와 바닷바람에 맞춰 마감한 여행복이다.', 'Travelwear finished for rain and sea winds.', '雨と潮風に備えて仕上げた旅装。'), 42, 7, 1, 18),
  { id: 'winterbloom', name: '雪咲き草', names: l('설화초', 'Winterbloom', '雪咲き草'), description: '冬の寒さで花を開く薬草。', descriptions: l('겨울의 추위 속에서 꽃을 피우는 약초다. 채집할 수 있는 계절이 한정된다.', 'An herb that flowers in winter cold. Its gathering season is limited.', '冬の寒さで花を開く薬草。採れる季節は限られる。'), price: 20, category: 'herb', tier: 2, use: { hp: 8, mp: 6, cure: ['frost'] } },
];

export const FANTASY_ENVIRONMENT_RECIPES: FantasyRecipe[] = [
  { id: 'tailor-summer', name: '風通しを整える夏の旅装', job: 'tailor', inputs: { linen: 3, silk: 1 }, output: 'summer-wrap', count: 1, dc: 11 },
  { id: 'tailor-winter', name: '毛皮を重ねる厳冬の旅装', job: 'tailor', inputs: { 'wolf-hide': 3, linen: 2 }, output: 'fur-parka', count: 1, dc: 14 },
  { id: 'tailor-rain', name: '雨よけの縫い目', job: 'tailor', inputs: { linen: 2, 'lizard-hide': 1 }, output: 'rain-cape', count: 1, dc: 12 },
  { id: 'herbalist-winter', name: '雪咲き草の薬', job: 'herbalist', inputs: { winterbloom: 2, 'pottery-vessel': 1 }, output: 'hp-potion-2', count: 1, dc: 12 },
];
