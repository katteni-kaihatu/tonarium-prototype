import type { FantasyItem, FantasyRecipe } from './fantasy.ts';
const l = (ko: string, en: string, ja: string) => ({ ko, en, ja });
const garment = (id: string, names: ReturnType<typeof l>, descriptions: ReturnType<typeof l>, price: number, warmth: number, cooling: number, waterproof: number): FantasyItem => ({ id, name: names.ja, names, description: descriptions.ja, descriptions, price, category: 'clothing', tier: 1, wear: { warmth, cooling, waterproof } });
const tool = (id: string, names: ReturnType<typeof l>, descriptions: ReturnType<typeof l>, price: number, category: string, weatherTool: NonNullable<FantasyItem['weatherTool']>): FantasyItem => ({ id, name: names.ja, names, description: descriptions.ja, descriptions, price, category, weatherTool, tier: 1 });

export const FANTASY_ENVIRONMENT_ITEMS: FantasyItem[] = [
  { id: 'lantern', name: '旅のランタン', names: l('여행용 랜턴', 'Travel Lantern', '旅のランタン'), description: '夜道や洞窟を照らす携帯灯。暗さの判定負担を4から2に減らし、野営の襲撃危険を10%軽減する。', descriptions: l('밤길과 동굴을 밝히는 휴대등. 어둠의 판정 불이익을 4에서 2로 줄이고 야영 습격 위험을 10% 줄인다. 길드 대여 랜턴보다 밝다.', 'A portable light for night roads and caves. Reduces the darkness check penalty from 4 to 2 and camp ambush risk by 10%. Brighter than a guild loan lantern.', '夜道や洞窟を照らす携帯灯。暗さの判定負担を4から2に減らし、野営の襲撃危険を10%軽減する。ギルドの貸出灯より明るい。'), price: 12, category: 'tool', tier: 1, light: true },
  garment('linen-clothes', l('리넨 평상복', 'Linen Clothes', '麻の普段着'), l('통풍이 잘되는 가벼운 평상복이다.', 'Light everyday clothes that breathe well.', '風通しのよい軽い普段着。'), 14, 1, 4, 0),
  garment('summer-wrap', l('한여름 여행복', 'Summer Travelwear', '夏の旅装'), l('햇빛을 가리고 열을 내보내는 얇은 여행복이다.', 'Thin travelwear that shades the skin and releases heat.', '日差しを遮り熱を逃がす薄手の旅装。'), 28, 0, 9, 0),
  garment('wool-coat', l('모직 외투', 'Wool Coat', '毛織の外套'), l('차가운 바람을 막아주는 따뜻한 외투다.', 'A warm coat that blocks chilly winds.', '冷たい風を防ぐ暖かい外套。'), 32, 11, 0, 2),
  garment('fur-parka', l('한겨울 모피 여행복', 'Winter Fur Travelwear', '厳冬の毛皮旅装'), l('모피와 안감을 겹쳐 혹한의 체온 손실을 줄인다.', 'Layers of fur and lining reduce heat loss in severe cold.', '毛皮と裏地を重ねて厳寒の熱損失を抑える。'), 65, 21, 0, 4),
  garment('rain-cape', l('방수 망토', 'Rain Cape', '雨よけのマント'), l('빗물을 흘려보내는 가벼운 망토다.', 'A light cape that sheds rain.', '雨を流す軽いマント。'), 25, 3, 1, 12),
  garment('oilskin-coat', l('방수 여행복', 'Oilskin Travelwear', '油布の旅装'), l('비와 바닷바람에 맞춰 마감한 여행복이다.', 'Travelwear finished for rain and sea winds.', '雨と潮風に備えて仕上げた旅装。'), 42, 7, 1, 18),
  { ...garment('frostweave-cloak', l('서리실 냉기 망토', 'Frostweave Cooling Cloak', '霜糸の涼風外套'), l('냉기 마법을 짠 망토. 착용하면 더위에 강해지며 휴대 냉각 도구와 함께 사용할 수 있다.', 'A cold-enchanted cloak. Wear it to resist heat; it works alongside one carried cooling tool.', '冷気を織り込んだ外套。着用すると暑さに強くなり、携帯冷却具と併用できる。'), 180, 0, 14, 4), tier: 3 },
  { ...garment('emberlined-coat', l('불씨 안감 보온 외투', 'Emberlined Winter Coat', '熾火裏地の防寒外套'), l('화염 마법의 은은한 온기가 도는 외투. 혹한과 눈에 대비하지만 더운 곳에서는 열이 찬다.', 'A coat warmed by gentle fire magic. Resists deep cold and snow, but traps heat in hot places.', '火の魔法が穏やかに温める外套。厳寒や雪に備えられるが、暑い場所では熱がこもる。'), 220, 30, 0, 10), tier: 3 },
  tool('travel-umbrella', l('여행용 우산', 'Travel Umbrella', '旅の雨傘'), l('휴대하면 야외에서 펼쳐 비를 막는다. 두 개 이상 들고 있어도 방수 효과는 중첩되지 않는다.', 'Opens outdoors while carried to keep rain off. Extra umbrellas do not stack.', '携帯すると屋外で差して雨を防ぐ。複数の傘の効果は重複しない。'), 22, 'tool', { waterproof: 12 }),
  tool('shade-hat', l('넓은 차양 모자', 'Wide Shade Hat', '広つばの日よけ帽'), l('휴대하면 챙겨 쓰는 가벼운 모자. 강한 햇볕 아래 더위를 조금 덜어 준다.', 'A light hat worn while carried. Offers modest relief in strong heat.', '携帯するとかぶる軽い帽子。強い日差しの暑さを少し和らげる。'), 18, 'tool', { cooling: 4 }),
  tool('frost-charm', l('서리숨 냉각 부적', 'Frostbreath Cooling Charm', '霜息の冷却護符'), l('휴대하면 더울 때 냉기를 내는 마도구. 같은 계열의 휴대 도구 중 가장 강한 효과만 적용한다.', 'A carried charm that releases cold in heat. Only the strongest carried cooling tool applies.', '暑い時に冷気を放つ携帯魔道具。同系統の携帯具は最も強い効果だけが働く。'), 160, 'magic-tool', { cooling: 12 }),
  tool('ember-handwarmer', l('불꽃씨 손난로', 'Emberseed Handwarmer', '火種の懐炉'), l('휴대하면 추울 때 화염 마법의 온기를 전한다. 같은 계열의 휴대 보온 도구는 중첩되지 않는다.', 'A carried handwarmer giving gentle magical heat in cold. Carried warming tools do not stack.', '寒い時に火の魔法の温かさを伝える携帯具。同系統の携帯保温具は重複しない。'), 145, 'magic-tool', { warmth: 16 }),
  tool('cooling-camp-mat', l('서늘바람 야영 매트', 'Coolbreeze Camp Mat', '涼風の野営敷物'), l('냉기 마법이 더운 땅의 열을 식힌다. 야영 중에만 더위에 의한 휴식 손실을 줄인다.', 'Cold magic cools the hot ground. Reduces heat-related recovery loss only while camping.', '冷気の魔法が熱い地面を冷ます。野営中だけ暑さによる休息の損失を抑える。'), 150, 'magic-tool', { cooling: 16, campOnly: true }),
  { id: 'winterbloom', name: '雪咲き草', names: l('설화초', 'Winterbloom', '雪咲き草'), description: '冬の寒さで花を開く薬草。', descriptions: l('겨울의 추위 속에서 꽃을 피우는 약초다. 채집할 수 있는 계절이 한정된다.', 'An herb that flowers in winter cold. Its gathering season is limited.', '冬の寒さで花を開く薬草。採れる季節は限られる。'), price: 20, category: 'herb', tier: 2, use: { hp: 8, mp: 6, cure: ['frost'] } },
];

export const FANTASY_ENVIRONMENT_RECIPES: FantasyRecipe[] = [
  { id: 'tailor-umbrella', name: '旅の雨傘を縫う', job: 'tailor', inputs: { linen: 2, wood: 1 }, output: 'travel-umbrella', count: 1, dc: 10 },
  { id: 'tailor-frostweave', name: '霜糸の涼風外套を織る', job: 'tailor', inputs: { silk: 2, linen: 2, crystal: 2, winterbloom: 1 }, output: 'frostweave-cloak', count: 1, dc: 19 },
  { id: 'tailor-emberlined', name: '熾火裏地の外套を縫う', job: 'tailor', inputs: { 'wolf-hide': 3, linen: 2, crystal: 2, spice: 1 }, output: 'emberlined-coat', count: 1, dc: 20 },
  { id: 'mage-frost-charm', name: '霜息を護符に封じる', job: 'mage', inputs: { crystal: 2, silk: 1, winterbloom: 1 }, output: 'frost-charm', count: 1, dc: 17 },
  { id: 'mage-handwarmer', name: '火種を懐炉に宿す', job: 'mage', inputs: { crystal: 2, ore: 1, spice: 1 }, output: 'ember-handwarmer', count: 1, dc: 16 },
  { id: 'mage-cooling-mat', name: '野営敷物に涼風を織る', job: 'mage', inputs: { linen: 3, crystal: 2, winterbloom: 1 }, output: 'cooling-camp-mat', count: 1, dc: 18 },
  { id: 'tailor-summer', name: '風通しを整える夏の旅装', job: 'tailor', inputs: { linen: 3, silk: 1 }, output: 'summer-wrap', count: 1, dc: 11 },
  { id: 'tailor-winter', name: '毛皮を重ねる厳冬の旅装', job: 'tailor', inputs: { 'wolf-hide': 3, linen: 2 }, output: 'fur-parka', count: 1, dc: 14 },
  { id: 'tailor-rain', name: '雨よけの縫い目', job: 'tailor', inputs: { linen: 2, 'lizard-hide': 1 }, output: 'rain-cape', count: 1, dc: 12 },
  { id: 'herbalist-winter', name: '雪咲き草の薬', job: 'herbalist', inputs: { winterbloom: 2, 'pottery-vessel': 1 }, output: 'hp-potion-2', count: 1, dc: 12 },
];
