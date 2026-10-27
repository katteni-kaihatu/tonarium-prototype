import type { FantasyItem, FantasyRecipe } from './fantasy.ts';

type Text = [string, string, string];
const l = ([ko, en, ja]: Text) => ({ ko, en, ja });
export function fantasyTravelEffectName(id: string, locale: 'ko' | 'en' | 'ja'): string | undefined {
  return ({ 'pepper-stew-vigor': l(['든든한 기운', 'Hearty vigor', '満ちた活力']), 'spice-skewer-vigor': l(['매콤한 활력', 'Spiced vitality', '香辛料の活力']), 'starhoney-fortune': l(['별꿀의 행운', 'Starhoney fortune', '星蜜の幸運']) } as Record<string, ReturnType<typeof l>>)[id]?.[locale];
}
const item = (id: string, names: Text, price: number, category: string, descriptions: Text, extra: Partial<FantasyItem> = {}): FantasyItem => ({ id, name: names[2], names: l(names), price, category, tier: 1, description: descriptions[2], descriptions: l(descriptions), ...extra });
const food = (id: string, names: Text, price: number, hours: number, hunger: number, descriptions: Text, use: FantasyItem['use'] = {}): FantasyItem => item(id, names, price, 'food', descriptions, { food: { shelfLife: hours, nutrition: hunger }, use: { hunger, ...use } });

export const FANTASY_TRAVEL_GOODS: FantasyItem[] = [
  item('bedroll', ['여행자 침낭', 'Traveler Bedroll', '旅人の寝袋'], 18, 'camp', ['소지하면 노숙의 기본 피로 회복이 25가 된다. 여러 개를 겹쳐도 효과는 같으며 습격을 막지는 못한다.', 'Carrying it raises base camping fatigue recovery to 25. Extra copies do not stack or stop attacks.', '持っていると野宿の基本疲労回復が25になる。複数持っても重複せず、襲撃は防げない。']),
  item('fur-bedroll', ['모피 침낭', 'Fur Bedroll', '毛皮の寝袋'], 42, 'camp', ['두꺼운 안감의 침낭. 노숙의 기본 피로 회복이 33이 되며 일반 침낭과 중복되지 않는다.', 'A thickly lined bedroll. Base camping fatigue recovery becomes 33; it replaces an ordinary bedroll.', '厚い裏地の寝袋。野宿の基本疲労回復が33になり、普通の寝袋とは重複しない。']),
  item('camp-tarp', ['야영 방수포', 'Camp Tarp', '野営の防水布'], 26, 'camp', ['소지하면 야영 중 불상사 위험을 조금 낮춘다. 완전한 숙소를 대신하지는 않는다.', 'Slightly reduces camping incident risk while carried. It does not provide the safety of an inn.', '持っていると野営中の災難の危険を少し下げる。宿屋の安全性には及ばない。']),
  item('camp-stakes', ['야영 경계 말뚝', 'Camp Perimeter Stakes', '野営の境界杭'], 16, 'camp', ['줄과 작은 방울을 건 말뚝. 야영 중 불상사 위험을 조금 낮추며 소모되지 않는다.', 'Stakes strung with cord and little bells. Slightly reduce camp incidents and are reusable.', '紐と小鈴を張る杭。野営の災難を少し減らし、繰り返し使える。']),
  item('sentinel-bell', ['불침번의 경보종', 'Sentinel Alarm Bell', '見張りの警鐘'], 65, 'magic-tool', ['접근하는 움직임에 울리는 작은 마도구. 노숙 불상사 위험을 45% 줄인다. 여러 개는 중복되지 않는다.', 'A charm that rings at approaching movement. Reduces camp incident risk by 45%; extra copies do not stack.', '近づく動きに鳴る小さな魔道具。野宿の災難の危険を45%減らす。複数は重複しない。']),
  item('ward-seal', ['일회용 야영 결계부', 'Single-use Camp Ward', '使い切りの野営結界符'], 30, 'magic-tool', ['소지하고 노숙하면 습격 한 번을 막고 한 장이 사라진다. 습격이 없으면 남으며 도난과 소음은 막지 못한다.', 'While camping, blocks one attack and consumes one seal. Unused seals remain; theft and noise are not blocked.', '持って野宿すると襲撃を一度防ぎ、1枚消える。襲撃がなければ残り、盗難と物音は防げない。']),
  item('everglow-lantern', ['별빛 유리등', 'Starlit Glass Lantern', '星明かりの玻璃灯'], 58, 'magic-tool', ['마정석 빛으로 밤길과 동굴을 밝히는 휴대등. 소지한 동안 광원으로 쓸 수 있다.', 'A portable crystal light for night roads and caves. Works as a light while carried.', '魔晶石の光で夜道や洞窟を照らす携帯灯。持っている間は光源になる。'], { light: true }),
  item('pocket-hearth', ['주머니 속 난로돌', 'Pocket Hearthstone', '懐の炉石'], 48, 'magic-tool', ['잔잔한 온기를 내는 돌. 노숙 피로 회복을 5, MP 회복을 최대치의 5% 더한다. 여러 개는 중복되지 않는다.', 'A gently warm stone. Adds 5 camping fatigue recovery and 5% maximum MP recovery. Extra copies do not stack.', '穏やかに温まる石。野宿の疲労回復を5、最大MPの回復を5%増やす。複数は重複しない。']),
  food('trail-biscuit', ['여행용 단단한 비스킷', 'Hard Trail Biscuits', '旅の堅焼きビスケット'], 7, 240, 18, ['바삭하고 단단한 건조 비스킷. 긴 길에 챙기기 좋다.', 'Dry, crisp biscuits suited to long journeys.', '乾いて歯応えのあるビスケット。長旅に向く。']),
  food('honey-nuts', ['꿀절임 견과', 'Honeyed Nuts', '蜂蜜漬けの木の実'], 9, 168, 22, ['꿀 냄새가 나는 달콤한 견과. 약간의 피로도 덜어 준다.', 'Sweet nuts smelling of honey. Also ease a little fatigue.', '蜂蜜の香る甘い木の実。少し疲れも和らげる。'], { fatigue: 4 }),
  food('dried-apricot', ['말린 살구', 'Dried Apricots', '干し杏'], 6, 192, 15, ['새콤한 향을 가진 말린 과일. 물기를 잘 피해야 한다.', 'Tart-smelling dried fruit. Best kept away from damp.', '酸味のある香りの干し果物。湿気は避けたい。']),
  food('smoked-trout', ['연기향 훈제생선', 'Smoked River Fish', '川魚の燻製'], 14, 120, 30, ['옅은 연기 냄새가 밴 생선. 소금과 건조로 보존한다.', 'Fish carrying a faint smoky scent, preserved with salt and drying.', '薄い煙の香る魚。塩と乾燥で保存する。'], { hp: 5 }),
  food('pepper-stew', ['후추 고기스튜', 'Peppered Meat Stew', '胡椒の肉煮込み'], 20, 12, 46, ['후추 향이 따뜻하게 올라오는 스튜. 신선할 때 먹으면 잠시 힘을 북돋운다.', 'Warm pepper rises from this stew. Fresh portions briefly bolster strength.', '温かな胡椒の香る煮込み。新しいうちなら一時的に力を養う。'], { hp: 12, effect: { id: 'pepper-stew-vigor', hours: 4, stats: { strength: 1 } } }),
  food('moonrice-ball', ['달빛 곡물주먹밥', 'Moonlit Grain Ball', '月明かりの穀物握り'], 11, 24, 28, ['잎으로 싼 고소한 곡물밥. 마나를 조금 회복한다.', 'Nutty cooked grain wrapped in a leaf. Restores a little mana.', '葉で包んだ香ばしい穀物飯。少しマナを回復する。'], { mp: 6 }),
  food('spice-skewer', ['불꽃향 꼬치', 'Emberspice Skewer', '熾火香の串焼き'], 16, 12, 32, ['매콤한 향신료를 바른 꼬치. 신선하면 잠시 체력을 북돋운다.', 'A sharply spiced skewer. A fresh serving briefly bolsters vitality.', '刺激的な香辛料の串焼き。新しいうちは一時的に体力を養う。'], { effect: { id: 'spice-skewer-vigor', hours: 4, stats: { vitality: 1 } } }),
  food('citrus-ade', ['햇살 감귤수', 'Sunshine Citrusade', '陽だまりの柑橘水'], 8, 18, 12, ['상큼한 과즙과 찬물이 섞인 음료. 더위에 지친 몸을 달랜다.', 'A cool citrus drink that eases weary limbs.', '冷水と爽やかな果汁の飲み物。暑さで疲れた体を和らげる。'], { fatigue: 10 }),
  food('herbal-tea', ['저녁숲 허브차', 'Eveningwood Tea', '夕森の薬草茶'], 10, 18, 8, ['풀 향이 은은한 차. 피로와 마나를 조금 회복한다.', 'A gently herbal tea that restores a little mana and eases fatigue.', '草の香りの穏やかな茶。少しマナを回復し、疲れを和らげる。'], { mp: 10, fatigue: 7 }),
  food('camp-coffee', ['보부상 진한 커피', 'Peddler Strong Coffee', '行商人の濃い珈琲'], 12, 24, 8, ['깊고 쓴 향의 커피. 잠깐 정신을 맑게 하고 피로를 덜어 준다.', 'Deep, bitter coffee that briefly clears the mind and eases fatigue.', '深く苦い香りの珈琲。一時的に頭を冴えさせ、疲れを和らげる。'], { fatigue: 16 }),
  food('winter-broth', ['겨울뿌리 수프', 'Winterroot Broth', '冬根のスープ'], 18, 18, 36, ['뿌리채소와 약초로 끓인 수프. 차갑게 굳은 몸을 풀어 준다.', 'Root and herb broth that eases a chilled body.', '根菜と薬草のスープ。冷え固まった体をほぐす。'], { hp: 10, fatigue: 8, cure: ['frost'] }),
  food('royal-pudding', ['왕실풍 별꿀 푸딩', 'Court-style Starhoney Pudding', '宮廷風の星蜜プリン'], 38, 12, 40, ['흔들리는 달콤한 푸딩. 솜씨 좋은 조리법 덕에 신선할 때 잠시 운이 오른다.', 'A quivering sweet pudding. Its fine recipe briefly increases luck when fresh.', 'ぷるぷると甘いプリン。巧みな調理で、新しいうちは一時的に運が上がる。'], { mp: 12, effect: { id: 'starhoney-fortune', hours: 6, stats: { luck: 1 } } }),
  item('squeaky-slime', ['삑삑 슬라임 인형', 'Squeaky Slime Toy', 'ぴこぴこスライム人形'], 6, 'curio', ['누르면 황당한 소리가 나는 작은 인형. 실컷 놀면 낡지만 피로가 2 줄어든다.', 'A tiny toy with an absurd squeak. Playing wears it out but eases 2 fatigue.', '押すと妙な声を出す小さな人形。遊ぶと傷むが疲労が2減る。'], { use: { fatigue: 2 } }),
  item('paper-dragon', ['한 번 나는 종이용', 'One-flight Paper Dragon', '一度だけ飛ぶ紙竜'], 5, 'curio', ['한 번 날리면 돌아오지 않는 종이용. 날아가는 모습을 보면 피로가 2 줄어든다.', 'A paper dragon that never returns after one flight. Watching it eases 2 fatigue.', '一度飛ばすと戻らない紙の竜。飛ぶ姿を眺めると疲労が2減る。'], { use: { fatigue: 2 } }),
  item('star-snowglobe', ['주머니 별눈구슬', 'Pocket Starsnow Globe', '懐の星雪玉'], 22, 'magic-tool', ['흔들면 안쪽 별가루가 한 번 반짝인다. 빛이 다하면 구슬이 흐려지며 MP가 8 회복된다.', 'Its stardust sparkles once when shaken, then dims, restoring 8 MP.', '振ると星屑が一度きらめく。光を使い切ると曇り、MPを8回復する。'], { use: { mp: 8 } }),
  item('lucky-duck', ['행운을 주장하는 오리', 'Self-proclaimed Lucky Duck', '幸運を自称するアヒル'], 9, 'curio', ['눈빛만큼은 자신만만한 작은 나무오리. 행운의 증거는 없지만 장식품으로 팔 수 있다.', 'A little wooden duck with a confident stare. Its luck is unproven, but it can be sold as a trinket.', '眼差しだけは自信満々の小さな木のアヒル。幸運の証拠はないが飾り物として売れる。']),
];

export const FANTASY_TRAVEL_RECIPES: FantasyRecipe[] = [
  { id: 'tailor-bedroll', name: '旅人の寝袋を縫う', job: 'tailor', inputs: { linen: 2 }, output: 'bedroll', count: 1, dc: 10 },
  { id: 'tailor-fur-bedroll', name: '毛皮の寝袋を縫う', job: 'tailor', inputs: { linen: 2, 'wolf-hide': 2 }, output: 'fur-bedroll', count: 1, dc: 14 },
  { id: 'tailor-camp-tarp', name: '野営の防水布を張る', job: 'tailor', inputs: { linen: 2, 'lizard-hide': 1 }, output: 'camp-tarp', count: 1, dc: 12 },
  { id: 'carpenter-camp-stakes', name: '野営の境界杭を削る', job: 'carpenter', inputs: { wood: 2, ingot: 1 }, output: 'camp-stakes', count: 1, dc: 10 },
  { id: 'mage-sentinel-bell', name: '見張りの警鐘を刻む', job: 'mage', inputs: { crystal: 2, ingot: 1 }, output: 'sentinel-bell', count: 1, dc: 16 },
  { id: 'mage-camp-ward', name: '使い切りの野営結界符を書く', job: 'mage', inputs: { crystal: 1, linen: 1 }, output: 'ward-seal', count: 1, dc: 14 },
  { id: 'cook-trail-biscuit', name: '旅の堅焼きビスケット', job: 'cook', inputs: { bread: 2, spice: 1 }, output: 'trail-biscuit', count: 3, dc: 10 },
  { id: 'cook-smoked-fish', name: '川魚の燻製', job: 'cook', inputs: { fish: 2, spice: 1 }, output: 'smoked-trout', count: 2, dc: 12 },
  { id: 'cook-pepper-stew', name: '胡椒の肉煮込み', job: 'cook', inputs: { meat: 2, herb: 1, spice: 1 }, output: 'pepper-stew', count: 2, dc: 14 },
  { id: 'cook-starhoney-pudding', name: '宮廷風の星蜜プリン', job: 'cook', inputs: { bread: 2, herb: 1, spice: 2 }, output: 'royal-pudding', count: 1, dc: 18 },
];
