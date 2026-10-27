import type { FantasyItem, FantasyQuest, FantasyRecipe, FantasyStats } from './fantasy.ts';

type Names = [ko: string, en: string, ja: string];
const item = (id: string, names: Names, price: number, category: string, extra: Partial<FantasyItem> = {}): FantasyItem => ({
  id, names: { ko: names[0], en: names[1], ja: names[2] }, name: names[2], price, category,
  description: `${names[2]}。${category === 'relic' ? '考古学研究所で売却できる収集品。' : '登録された用途と製法で利用する品。'}`,
  descriptions: { ko: `${names[0]}. ${category === 'relic' ? '고고학 연구소에서 매각하는 수집품.' : '표시된 효과와 제작법에 따라 사용하는 물품.'}`, en: `${names[1]}. ${category === 'relic' ? 'A collectible sold to an archaeology institute.' : 'Used according to its listed effects and recipes.'}`, ja: `${names[2]}。${category === 'relic' ? '考古学研究所で売却できる収集品。' : '表示された効果と製法で使用する品。'}` }, ...extra,
});
const drop = (kinds: NonNullable<FantasyItem['drop']>['kinds'], chance = 0.3, minDanger = 0) => ({ kinds, chance, minDanger });
const described = (texts: Names) => ({ description: texts[2], descriptions: { ko: texts[0], en: texts[1], ja: texts[2] } });
const weapon = (id: string, names: Names, price: number, stats: Partial<FantasyStats>, slot: NonNullable<FantasyItem['equipment']>['slot'] = 'weapon', guard = 0) => item(id, names, price, slot === 'armor' ? 'armor' : slot === 'accessory' ? 'accessory' : 'weapon', { equipment: { slot, stats, ...(guard ? { guard } : {}) } });

export const FANTASY_EXPANDED_ITEMS: FantasyItem[] = [
  item('redleaf', ['붉은잎 약초', 'Redleaf', '赤葉草'], 8, 'herb', { use: { hp: 12 }, drop: drop(['forest', 'swamp']) }),
  item('moonmint', ['달박하', 'Moonmint', '月薄荷'], 10, 'herb', { use: { mp: 12 }, drop: drop(['forest', 'snow']) }),
  item('sunroot', ['해뿌리', 'Sunroot', '陽根草'], 10, 'herb', { use: { fatigue: 12 }, drop: drop(['forest', 'desert']) }),
  item('silverweed', ['은빛풀', 'Silverweed', '銀葉草'], 12, 'herb', { use: { cure: ['poison'] }, drop: drop(['forest', 'swamp']) }),
  item('frostbloom', ['서리꽃', 'Frostbloom', '霜花'], 14, 'herb', { use: { hp: 5, cure: ['burn'] }, drop: drop(['snow', 'mountain']) }),
  item('embermoss', ['불씨이끼', 'Embermoss', '熾火苔'], 14, 'herb', { use: { mp: 5, cure: ['frost', 'weakness'] }, drop: drop(['volcano', 'cave']) }),
  ...[
    ['copper', '구리', 'Copper', '銅', 6], ['tin', '주석', 'Tin', '錫', 7], ['silver', '은', 'Silver', '銀', 12], ['gold', '금', 'Gold', '金', 18],
    ['mithril', '미스릴', 'Mithril', 'ミスリル', 28], ['adamant', '아다만트', 'Adamant', 'アダマント', 32], ['orichalcum', '오리할콘', 'Orichalcum', 'オリハルコン', 36], ['starsteel', '성철', 'Starsteel', '星鉄', 40],
  ].flatMap(([id, ko, en, ja, price], index) => [
    item(`${id}-ore`, [`${ko} 광석`, `${en} Ore`, `${ja}鉱石`], Number(price), 'ore', { tier: index >= 4 ? 3 : 1, drop: drop(['mountain', 'cave', 'volcano'], index >= 4 ? 0.12 : 0.35, index >= 4 ? 2 : 0) }),
    item(`${id}-ingot`, [`${ko} 주괴`, `${en} Ingot`, `${ja}の延べ棒`], Number(price) * 3 + 6, 'ingot', { tier: index >= 4 ? 3 : 1 }),
  ]),
  ...[
    ['oak-wood', '참나무 목재', 'Oak Timber', '樫材', 7], ['ironwood', '철목', 'Ironwood', '鉄樹材', 16], ['moonwillow', '달버들 목재', 'Moonwillow', '月柳材', 20], ['worldtree-branch', '고목의 가지', 'Elderwood Branch', '古樹の枝', 28],
  ].map(([id, ko, en, ja, price], i) => item(String(id), [String(ko), String(en), String(ja)], Number(price), 'wood', { drop: drop(['forest'], i ? 0.16 : 0.4, i ? 1 : 0) })),
  ...[
    ['trout', '송어', 'Trout', '鱒'], ['salmon', '연어', 'Salmon', '鮭'], ['tuna', '참치', 'Tuna', '鮪'], ['glowfish', '반딧물고기', 'Glowfish', '灯魚'], ['frostcarp', '빙어잉어', 'Frostcarp', '氷鯉'],
  ].map(([id, ko, en, ja], i) => item(id, [ko, en, ja], 8 + i * 3, 'fish', { food: { shelfLife: 12, nutrition: 12 + i * 2 }, use: { hunger: 12 + i * 2 }, drop: drop(['coast', 'swamp', 'island'], 0.35, i >= 3 ? 2 : 0) })),
  ...[
    ['faint-crystal', '희미한 마정석', 'Faint Crystal', '薄い魔晶石', 6, 5], ['dense-crystal', '농축 마정석', 'Dense Crystal', '濃い魔晶石', 22, 20],
    ['pure-crystal', '순수 마정석', 'Pure Crystal', '純魔晶石', 42, 40], ['fire-crystal', '화염 마정석', 'Flame Crystal', '炎の魔晶石', 24, 18],
    ['water-crystal', '물결 마정석', 'Water Crystal', '水の魔晶石', 24, 18], ['wind-crystal', '바람 마정석', 'Wind Crystal', '風の魔晶石', 24, 18],
    ['earth-crystal', '대지 마정석', 'Earth Crystal', '地の魔晶石', 24, 18], ['light-crystal', '빛 마정석', 'Light Crystal', '光の魔晶石', 32, 25],
  ].map(([id, ko, en, ja, price, mp], i) => item(String(id), [String(ko), String(en), String(ja)], Number(price), 'crystal', { use: { mp: Number(mp) }, drop: drop(i === 3 ? ['volcano'] : ['cave', 'tower', 'ruin'], i >= 2 ? 0.12 : 0.3, i >= 2 ? 2 : 0) })),
  ...[
    ['clay-tablet', '고대 점토판', 'Ancient Clay Tablet', '古代の粘土板', ['곡물 수량 같은 자국이 남은 점토판. 고고학 연구소가 연구용으로 매입한다.', 'A clay tablet bearing marks that resemble grain tallies. An archaeology institute buys it for study.', '穀物の数らしい刻みの残る粘土板。考古学研究所が研究用に買い取る。']],
    ['bronze-mirror', '청동 거울', 'Bronze Mirror', '青銅の鏡', ['얼굴 대신 흐릿한 얼룩이 비치는 오래된 거울. 고고학 연구소의 수집 대상이다.', 'An old mirror reflecting a blur instead of a face. Archaeology institutes collect it.', '顔の代わりにぼんやりした染みを映す古い鏡。考古学研究所の収集対象。']],
    ['rusty-clock', '녹슨 현대 시계', 'Rusty Modern Clock', '錆びた近代時計', ['바늘과 기어를 갖춘 근대식 시계. 멈춘 시각만으로 발견된 시대를 단정할 수는 없다. 고고학 연구소에 판다.', 'A modern-style clock with hands and gears. Its stopped hands cannot date its origin. Sold to archaeology institutes.', '針と歯車を備える近代式の時計。止まった時刻だけでは由来を断定できない。考古学研究所で売れる。']],
    ['ancient-spoon', '왕의 것으로 추정된 숟가락', 'Supposedly Royal Spoon', '王の物らしい匙', ['손잡이가 유난히 거창한 숟가락. 왕의 것이라는 추정은 아직 검증되지 않았다. 고고학 연구소가 매입한다.', 'A spoon with an unusually grand handle. Its royal ownership remains unproven. Archaeology institutes buy it.', '柄だけが妙に豪華な匙。王の持ち物という推定は未検証。考古学研究所が買い取る。']],
    ['lost-sock', '짝 잃은 유물 양말', 'Unmatched Relic Sock', '片方だけの遺物靴下', ['놀랍게도 한 짝만 남은 양말. 나머지 한 짝의 행방은 학계도 모른다. 고고학 연구소에 판다.', 'A remarkably persistent single sock. Even scholars cannot locate its partner. Sold to archaeology institutes.', '驚くほどしぶとく片方だけ残った靴下。相方の行方は学界にも不明。考古学研究所で売れる。']],
  ].map(([id, ko, en, ja, texts], i) => item(String(id), [String(ko), String(en), String(ja)], 25 + i * 4, 'relic', { drop: drop(['ruin'], 0.25, 1), ...described(texts as Names) })),
  item('healing-idol', ['생명의 작은 우상', 'Healing Idol', '癒やしの小像'], 120, 'artifact', { tier: 4, use: { hp: 65, mp: 20 }, drop: drop(['ruin'], 0.06, 3), ...described(['따뜻한 빛을 품은 작은 우상. 사용하면 빛이 사라지며 HP 65, MP 20을 회복한다.', 'A small idol holding warm light. Consumed to restore 65 HP and 20 MP.', '温かな光を宿す小像。一度使うと光を失い、HP65とMP20を回復する。']) }),
  item('echo-pendant', ['메아리 펜던트', 'Echo Pendant', 'こだまの首飾り'], 160, 'artifact', { tier: 4, equipment: { slot: 'accessory', stats: { mp: 15, intelligence: 1 } }, drop: drop(['ruin', 'tower'], 0.05, 3), ...described(['마나의 잔향을 담는 장신구. 장착하면 최대 MP +15, 지능 +1. 지능에 따른 최대 MP 증가도 적용된다.', 'An accessory holding a mana echo. Equipped: maximum MP +15 and intelligence +1; intelligence also raises maximum MP.', 'マナの残響を留める装身具。装備中は最大MP+15、知力+1。知力による最大MP増加も適用。']) }),
  item('ancient-aegis', ['옛 수호 방패', 'Ancient Aegis', '古い守護盾'], 200, 'artifact', { tier: 5, equipment: { slot: 'offhand', stats: { vitality: 1 }, guard: 4 }, drop: drop(['ruin'], 0.03, 4), ...described(['오래된 수호 문양이 남은 보조 장비. 체력 +1, 전투 피해를 4 줄인다. 굶주림과 중독 피해는 막지 못한다.', 'An offhand shield with an old warding pattern. Vitality +1 and combat damage reduced by 4; hunger and poison bypass it.', '古い守りの模様が残る副手装備。体力+1、戦闘被害を4軽減。空腹や毒の被害は防げない。']) }),
  ...[
    ['grilled-trout', '허브 송어구이', 'Herbed Trout', '香草鱒焼き', 28, 35, { agility: 1 }], ['salmon-stew', '연어 스튜', 'Salmon Stew', '鮭の煮込み', 35, 45, { vitality: 2 }],
    ['hunter-hotpot', '사냥꾼 전골', 'Hunter Hotpot', '狩人鍋', 38, 50, { strength: 2 }], ['moon-dessert', '달빛 후식', 'Moonlight Dessert', '月光の菓子', 40, 30, { intelligence: 2 }],
    ['spiced-roast', '향신료 고기구이', 'Spiced Roast', '香辛料の肉焼き', 42, 55, { strength: 1, vitality: 1 }], ['dragon-banquet', '용혈의 연회식', 'Dragon Banquet', '竜血の宴膳', 70, 75, { strength: 2, intelligence: 2 }],
  ].map(([id, ko, en, ja, price, nutrition, stats]) => item(String(id), [String(ko), String(en), String(ja)], Number(price), 'food', { food: { shelfLife: 24, nutrition: Number(nutrition) }, use: { hp: 15, hunger: Number(nutrition), effect: { id: 'well-fed', hours: 6, stats: stats as Partial<FantasyStats> } } })),
  ...(['hp', 'mp', 'fatigue'] as const).flatMap((kind, k) => [15, 30, 55, 85].map((amount, tier) => item(`${kind}-potion-${tier + 1}`,
    [`${['체력', '마력', '피로'][k]} 물약 ${['하급', '중급', '상급', '최상급'][tier]}`, `${['Health', 'Mana', 'Vigor'][k]} Potion ${tier + 1}`, `${['体力', '魔力', '疲労'][k]}薬${tier + 1}級`],
    [14, 26, 45, 70][tier], 'potion', { tier: (tier + 1) as 1 | 2 | 3 | 4, use: { [kind]: amount } }))),
  weapon('steel-sword', ['강철검', 'Steel Sword', '鋼の剣'], 65, { strength: 2 }),
  weapon('iron-spear', ['철창', 'Iron Spear', '鉄の槍'], 55, { strength: 1, agility: 1 }),
  weapon('oak-bow', ['참나무 활', 'Oak Bow', '樫の弓'], 58, { agility: 2 }),
  weapon('mana-staff', ['마력 지팡이', 'Mana Staff', '魔力の杖'], 70, { intelligence: 2, mp: 8 }),
  weapon('steel-crossbow', ['강철 석궁', 'Steel Crossbow', '鋼の弩'], 75, { agility: 2, strength: 1 }),
  weapon('sacred-book', ['빛의 성법서', 'Sacred Book', '光の聖法書'], 75, { intelligence: 1, vitality: 1, mp: 10 }),
  weapon('leather-whip', ['가죽 채찍', 'Leather Whip', '革の鞭'], 48, { agility: 1, luck: 1 }),
  weapon('balanced-javelin', ['균형 잡힌 투창', 'Balanced Javelin', '均衡の投槍'], 55, { strength: 1, agility: 1 }),
  weapon('iron-shield', ['철 방패', 'Iron Shield', '鉄の盾'], 60, {}, 'offhand', 2),
  ...[
    ['pepper', '후추', 'Pepper', '胡椒'], ['cinnamon', '계피', 'Cinnamon', '肉桂'], ['saffron', '사프란', 'Saffron', 'サフラン'], ['stardust-spice', '별가루 향신료', 'Stardust Spice', '星粉の香辛料'],
  ].map(([id, ko, en, ja], i) => item(id, [ko, en, ja], 8 + i * 5, 'spice', { use: { fatigue: 3 + i * 2 }, drop: drop(['forest', 'desert'], 0.22, i >= 2 ? 1 : 0) })),
  item('silkworm-silk', ['누에 비단', 'Silkworm Silk', '蚕の絹'], 16, 'silk', { drop: drop(['forest'], 0.2) }),
  item('moon-silk', ['달빛 비단', 'Moon Silk', '月の絹'], 28, 'silk', { drop: drop(['forest', 'ruin'], 0.1, 2) }),
  ...['wolf', 'bear', 'lizard'].flatMap((kind, i) => [
    item(`${kind}-hide`, [`${['늑대', '곰', '도마뱀'][i]} 가죽`, `${['Wolf', 'Bear', 'Lizard'][i]} Hide`, `${['狼', '熊', '蜥蜴'][i]}の革`], 12 + i * 5, 'hide', { drop: drop(['forest', 'swamp', 'mountain'], 0.25, 1) }),
    weapon(`${kind}-armor`, [`${['늑대', '곰', '도마뱀'][i]} 가죽 갑옷`, `${['Wolf', 'Bear', 'Lizard'][i]}hide Armor`, `${['狼', '熊', '蜥蜴'][i]}革の鎧`], 55 + i * 15, i === 0 ? { agility: 1 } : { vitality: 1 }, 'armor', i + 1),
  ]),
  ...[
    ['ruby', '루비', 'Ruby', '紅玉'], ['sapphire', '사파이어', 'Sapphire', '蒼玉'], ['emerald', '에메랄드', 'Emerald', '翠玉'], ['diamond', '다이아몬드', 'Diamond', '金剛石'], ['moonstone', '월장석', 'Moonstone', '月長石'],
  ].map(([id, ko, en, ja], i) => item(id, [ko, en, ja], 28 + i * 5, 'gem', { use: { effect: i === 2 ? { id: 'gem-ward', hours: 4, guard: 2 } : i === 3 ? { id: 'gem-luck', hours: 4, stats: { luck: 2 } } : { id: 'gem-focus', hours: 4, stats: { [i % 2 ? 'intelligence' : 'strength']: 2 } } }, drop: drop(['cave', 'mountain', 'ruin'], 0.1, 2) })),
  weapon('ruby-ring', ['루비 반지', 'Ruby Ring', '紅玉の指輪'], 90, { strength: 1, hp: 8 }, 'accessory'),
  weapon('sapphire-charm', ['사파이어 부적', 'Sapphire Charm', '蒼玉のお守り'], 90, { intelligence: 1, mp: 10 }, 'accessory'),
  weapon('emerald-brooch', ['에메랄드 브로치', 'Emerald Brooch', '翠玉の胸飾り'], 90, { luck: 1, vitality: 1 }, 'accessory'),
  ...(['strength', 'intelligence', 'vitality'] as const).map((stat, i) => item(`${stat}-elixir`, [`${['힘', '지혜', '생명'][i]}의 영약`, `${['Might', 'Wisdom', 'Vitality'][i]} Elixir`, `${['力', '知恵', '生命'][i]}の霊薬`], 180, 'elixir', { tier: 5, use: { permanent: { [stat]: 1 }, permanentCap: 3 }, drop: drop(['ruin', 'volcano', 'tower'], 0.025, 3) })),
];

export const FANTASY_LEGACY_ITEM_UPDATES: Record<string, Partial<FantasyItem>> = {
  herb: { name: '回復薬草', names: { ko: '회복 약초', en: 'Healing Herb', ja: '回復薬草' }, ...described(['HP를 8 회복하는 흔한 약초. 물약과 요리의 재료로도 쓰인다.', 'A common herb restoring 8 HP. Also used in remedies and cooking.', 'HPを8回復する身近な薬草。薬や料理の材料にもなる。']), category: 'herb', use: { hp: 8 } }, ore: { category: 'ore' }, wood: { category: 'wood' }, crystal: { category: 'crystal', use: { mp: 8 } },
  relic: { category: 'relic' }, ingot: { category: 'ingot' }, blade: { category: 'weapon', equipment: { slot: 'weapon', stats: { strength: 2 } } },
  spice: { category: 'spice' }, silk: { category: 'silk' }, gem: { category: 'gem' }, potion: { category: 'potion', use: { hp: 35, mp: 20 }, ...described(['HP 35와 MP 20을 회복하는 기본 조합 물약.', 'A basic compound potion restoring 35 HP and 20 MP.', 'HP35とMP20を回復する基本の調合薬。']) },
  antidote: { name: '解毒薬', names: { ko: '해독 물약', en: 'Antidote Potion', ja: '解毒薬' }, ...described(['독·화상·동상·쇠약을 치료하고 HP 10, MP 12를 회복하는 물약. 영구 능력을 높이는 영약과는 종류가 다르다.', 'Cures poison, burns, frost and weakness and restores 10 HP and 12 MP. Distinct from permanent-stat elixirs.', '毒・火傷・凍傷・衰弱を治し、HP10とMP12を回復する薬。能力を恒久的に高める霊薬とは別の品。']), category: 'potion', use: { hp: 10, mp: 12, cure: ['poison', 'burn', 'frost', 'weakness'] } },
};
const recipe = (id: string, job: string, inputs: Record<string, number>, output: string, dc = 12): FantasyRecipe => ({ id, name: `${FANTASY_EXPANDED_ITEMS.find(item => item.id === output)?.name ?? output}の制作`, job, inputs, output, count: 1, dc });
export const FANTASY_EXPANDED_RECIPES: FantasyRecipe[] = [
  ...['copper', 'tin', 'silver', 'gold', 'mithril', 'adamant', 'orichalcum', 'starsteel'].map((metal, i) => recipe(`smelt-${metal}`, 'blacksmith', { [`${metal}-ore`]: 2, wood: 1 }, `${metal}-ingot`, 9 + Math.floor(i / 2))),
  recipe('forge-spear', 'blacksmith', { ingot: 2, 'oak-wood': 1, 'fire-crystal': 1 }, 'iron-spear'),
  recipe('craft-bow', 'blacksmith', { 'oak-wood': 2, 'silkworm-silk': 1, 'wind-crystal': 1 }, 'oak-bow'),
  recipe('forge-shield', 'blacksmith', { ingot: 2, wood: 1, 'earth-crystal': 1 }, 'iron-shield'),
  recipe('craft-staff', 'mage', { moonwillow: 2, 'dense-crystal': 1, 'light-crystal': 1 }, 'mana-staff'),
  recipe('grill-trout', 'cook', { trout: 1, herb: 1, pepper: 1 }, 'grilled-trout', 10),
  recipe('stew-salmon', 'cook', { salmon: 1, herb: 1, cinnamon: 1 }, 'salmon-stew'),
  recipe('cook-dragon-banquet', 'cook', { meat: 2, 'stardust-spice': 1, saffron: 1 }, 'dragon-banquet', 15),
  recipe('brew-mana-supreme', 'alchemist', { moonmint: 2, 'pure-crystal': 1, 'water-crystal': 1 }, 'mp-potion-4', 14),
  recipe('brew-might-elixir', 'alchemist', { ruby: 2, 'dense-crystal': 2, redleaf: 3 }, 'strength-elixir', 17),
  ...['wolf', 'bear', 'lizard'].map(kind => recipe(`sew-${kind}-armor`, 'blacksmith', { [`${kind}-hide`]: 3, silk: 1 }, `${kind}-armor`)),
];

export const FANTASY_PROFESSION_ITEMS: FantasyItem[] = [
  item('flax', ['아마 섬유', 'Flax Fiber', '亜麻の繊維'], 5, 'fiber', { drop: drop(['forest'], 0.25), ...described(['공동 밭에서 거두거나 숲에서 채집하는 섬유. 직조공이 리넨으로 짠다.', 'Fiber harvested from shared fields or gathered in forests. Weavers turn it into linen.', '共同の畑や森で得られる繊維。織工が麻布に織る。']) }),
  item('grain', ['곡물', 'Grain', '穀物'], 5, 'crop', { ...described(['농부가 공동 경작지에서 수확하는 곡물. 공동 제분대에서 밀가루로 가공한다.', 'Grain harvested by farmers in shared fields and milled at a communal workbench.', '農夫が共同の耕作地で収穫する穀物。共同の製粉台で粉にする。']) }),
  item('flour', ['밀가루', 'Flour', '穀粉'], 10, 'ingredient', { ...described(['곡물을 갈아 만든 제빵 재료. 제빵사가 식당의 공동 화덕에서 빵을 굽는다.', 'Milled grain used by bakers at a restaurant’s shared oven.', '穀物を挽いた製パンの材料。パン職人が食堂の共同窯で焼く。']) }),
  item('clay', ['도예용 점토', 'Potter’s Clay', '陶芸の粘土'], 6, 'material', { drop: drop(['coast', 'swamp'], 0.3), ...described(['물가에서 모으거나 시장에서 사는 점토. 도공이 용기를 빚는다.', 'Clay gathered by the water or bought at a market. Potters shape it into vessels.', '水辺で採るか市場で買う粘土。陶工が器を形づくる。']) }),
  item('linen', ['리넨 천', 'Linen', '麻布'], 12, 'cloth', { ...described(['아마 섬유로 짠 천. 재봉과 가죽 갑옷의 안감에 쓴다.', 'Cloth woven from flax, used in tailoring and as armor lining.', '亜麻から織った布。仕立てや革鎧の裏地に使う。']) }),
  item('pottery-vessel', ['도기 용기', 'Pottery Vessel', '陶器の容器'], 18, 'container', { ...described(['약초 조제와 생선 보존에 쓰는 구운 용기. 해당 제작법의 재료로 소비한다.', 'A fired vessel consumed as a material in herbal preparations and preserved fish recipes.', '薬草の調製や魚の保存に使う焼き物。対応する製法の材料として消費する。']) }),
  item('traveler-cloak', ['여행자의 외투', 'Traveler’s Cloak', '旅人の外套'], 58, 'armor', { equipment: { slot: 'armor', stats: { vitality: 1 }, guard: 1 }, ...described(['리넨과 비단으로 튼튼하게 지은 외투. 장착 중 체력 +1, 전투 피해 1 경감.', 'A sturdy linen and silk cloak. Equipped: vitality +1 and combat damage reduced by 1.', '麻布と絹で丈夫に仕立てた外套。装備中は体力+1、戦闘被害を1軽減。']) }),
  item('dried-fish', ['보존 생선', 'Preserved Fish', '魚の保存食'], 20, 'food', { food: { shelfLife: 168, nutrition: 28 }, use: { hp: 8, hunger: 28 }, ...described(['어부가 공동 작업대에서 말리고 보존한 생선. 긴 여행에 적합한 식량이다.', 'Fish dried and preserved by a fisher at a shared workbench, suitable for long journeys.', '漁師が共同作業台で干して保存した魚。長い旅に向く食料。']) }),
  item('repair-plank', ['선체 보수판', 'Hull Repair Plank', '船体の補修板'], 32, 'ship-material', { ...described(['선공이 조선소 공동 작업장에서 맞춘 보수용 판재. 항구의 보수 의뢰에 납품하거나 매각한다. 개인 선박은 필요하지 않다.', 'A repair board fitted at a shared shipyard. Deliver it for port repair orders or sell it; no personal vessel is needed.', '船大工が造船所の共同工房で合わせた補修材。港の修理依頼に納めるか売却する。自分の船は不要。']) }),
];

export const FANTASY_PROFESSION_RECIPES: FantasyRecipe[] = [
  { id: 'carpenter-bow', name: '木工の旅弓', job: 'carpenter', inputs: { wood: 2, 'oak-wood': 1, silk: 1 }, output: 'oak-bow', count: 1, dc: 11 },
  { id: 'carpenter-javelin', name: '鉄樹の投槍を削る', job: 'carpenter', inputs: { ironwood: 2, ore: 1 }, output: 'balanced-javelin', count: 1, dc: 12 },
  { id: 'carpenter-mana-staff', name: '月柳の杖を仕上げる', job: 'carpenter', inputs: { moonwillow: 2, 'pure-crystal': 1 }, output: 'mana-staff', count: 1, dc: 15 },
  { id: 'tailor-cloak', name: '旅人の外套の仕立て', job: 'tailor', inputs: { linen: 2, silk: 1 }, output: 'traveler-cloak', count: 1, dc: 11 },
  { id: 'tailor-wolf-vest', name: '狼革と布の軽い上着', job: 'tailor', inputs: { linen: 2, 'wolf-hide': 2, silk: 1 }, output: 'wolf-armor', count: 1, dc: 12 },
  { id: 'tailor-bear-coat', name: '熊革の裏地を仕立てる', job: 'tailor', inputs: { linen: 3, 'bear-hide': 2, 'moon-silk': 1 }, output: 'bear-armor', count: 1, dc: 14 },
  { id: 'weaver-linen', name: '亜麻布を織る', job: 'weaver', inputs: { flax: 3 }, output: 'linen', count: 2, dc: 10 },
  { id: 'weaver-moon-silk', name: '月長石の光を織り込む', job: 'weaver', inputs: { flax: 2, 'silkworm-silk': 2, moonstone: 1 }, output: 'moon-silk', count: 2, dc: 14 },
  { id: 'weaver-whip', name: '革ひもを組み上げる', job: 'weaver', inputs: { linen: 2, 'wolf-hide': 1 }, output: 'leather-whip', count: 1, dc: 11 },
  { id: 'leatherworker-armor', name: '裏地付きの蜥蜴革鎧', job: 'leatherworker', inputs: { 'lizard-hide': 2, linen: 1 }, output: 'lizard-armor', count: 1, dc: 12 },
  { id: 'leatherworker-wolf', name: '狼革の軽鎧をなめす', job: 'leatherworker', inputs: { 'wolf-hide': 3, spice: 1 }, output: 'wolf-armor', count: 1, dc: 10 },
  { id: 'leatherworker-bear', name: '厚い熊革を縫い合わせる', job: 'leatherworker', inputs: { 'bear-hide': 3, linen: 2 }, output: 'bear-armor', count: 1, dc: 13 },
  { id: 'gemcutter-charm', name: '蒼玉の研磨と留め具', job: 'gemcutter', inputs: { sapphire: 1, 'silver-ingot': 1 }, output: 'sapphire-charm', count: 1, dc: 13 },
  { id: 'gemcutter-ruby-ring', name: '紅玉の指輪を留める', job: 'gemcutter', inputs: { ruby: 1, 'gold-ingot': 1 }, output: 'ruby-ring', count: 1, dc: 13 },
  { id: 'gemcutter-emerald', name: '翠玉の胸飾りを研ぐ', job: 'gemcutter', inputs: { emerald: 1, 'silver-ingot': 1, silk: 1 }, output: 'emerald-brooch', count: 1, dc: 14 },
  { id: 'herbalist-tonic', name: '薬草の回復煎剤', job: 'herbalist', inputs: { herb: 3, moonmint: 1, 'pottery-vessel': 1 }, output: 'hp-potion-1', count: 2, dc: 10 },
  { id: 'herbalist-vigor', name: '陽根草の疲労回復剤', job: 'herbalist', inputs: { sunroot: 2, pepper: 1, 'pottery-vessel': 1 }, output: 'fatigue-potion-2', count: 1, dc: 12 },
  { id: 'herbalist-antidote', name: '四種の症状に備える薬', job: 'herbalist', inputs: { silverweed: 2, frostbloom: 2, embermoss: 1, 'pottery-vessel': 1 }, output: 'antidote', count: 1, dc: 14 },
  { id: 'farmer-flour', name: '共同製粉台の穀粉', job: 'farmer', inputs: { grain: 3 }, output: 'flour', count: 2, dc: 9 },
  { id: 'fisher-preserve', name: '魚の保存食を仕込む', job: 'fisher', inputs: { fish: 2, spice: 1, 'pottery-vessel': 1 }, output: 'dried-fish', count: 2, dc: 10 },
  { id: 'fisher-salmon-stew', name: '漁場の鮭煮込み', job: 'fisher', inputs: { salmon: 1, herb: 1, 'pottery-vessel': 1 }, output: 'salmon-stew', count: 1, dc: 12 },
  { id: 'baker-bread', name: '共同窯の旅パン', job: 'baker', inputs: { flour: 2, herb: 1 }, output: 'bread', count: 3, dc: 10 },
  { id: 'baker-moon-dessert', name: '月光の焼き菓子', job: 'baker', inputs: { flour: 1, cinnamon: 1, 'light-crystal': 1 }, output: 'moon-dessert', count: 1, dc: 13 },
  { id: 'baker-fish-pie', name: '魚を包んだ旅の焼き物', job: 'baker', inputs: { flour: 2, fish: 1, herb: 1 }, output: 'meal', count: 2, dc: 11 },
  { id: 'baker-spiced-roast', name: '香辛料と肉の窯焼き', job: 'baker', inputs: { meat: 2, flour: 1, pepper: 1 }, output: 'spiced-roast', count: 1, dc: 13 },
  { id: 'potter-vessel', name: '保存と調薬の器', job: 'potter', inputs: { clay: 2, wood: 1 }, output: 'pottery-vessel', count: 2, dc: 10 },
  { id: 'potter-sapphire-charm', name: '蒼玉を包む陶製のお守り', job: 'potter', inputs: { clay: 2, sapphire: 1, silk: 1, moonmint: 1 }, output: 'sapphire-charm', count: 1, dc: 15 },
  { id: 'potter-earth-crystal', name: '魔晶を含む土の焼成', job: 'potter', inputs: { clay: 4, 'dense-crystal': 2 }, output: 'earth-crystal', count: 2, dc: 15 },
  { id: 'shipwright-plank', name: '共同造船所の補修材', job: 'shipwright', inputs: { wood: 3, ironwood: 1 }, output: 'repair-plank', count: 2, dc: 11 },
  { id: 'shipwright-shield', name: '船材と鉄の防護盾', job: 'shipwright', inputs: { 'repair-plank': 1, ingot: 2 }, output: 'iron-shield', count: 1, dc: 12 },
  { id: 'shipwright-coastal-chart', name: '既知の珊瑚航路を写す', job: 'shipwright', inputs: { wood: 2, linen: 1, crystal: 1 }, output: 'map-coral-drift', count: 1, dc: 13 },
  { id: 'scribe-chart', name: '記録済みの野辺の写図', job: 'scribe', inputs: { wood: 2, linen: 1 }, output: 'map-hearth-fields', count: 1, dc: 11 },
  { id: 'scribe-mines-chart', name: '既知の鉱山道を写す', job: 'scribe', inputs: { wood: 2, linen: 1, ore: 1 }, output: 'map-iron-mines', count: 1, dc: 12 },
  { id: 'scribe-moon-chart', name: '既知の月都街道を写す', job: 'scribe', inputs: { wood: 2, linen: 1, crystal: 1 }, output: 'map-moon-road', count: 1, dc: 12 },
  { id: 'scribe-coral-chart', name: '既知の島の航路を記す', job: 'scribe', inputs: { wood: 2, linen: 2, fish: 1 }, output: 'map-coral-drift', count: 1, dc: 13 },
  { id: 'scribe-fern-chart', name: '既知の根と羊歯の道を記す', job: 'scribe', inputs: { wood: 2, linen: 2, herb: 1 }, output: 'map-roots-and-ferns', count: 1, dc: 14 },
];

export const FANTASY_PROFESSION_QUESTS: FantasyQuest[] = [{
  id: 'quest-hull-repair', name: '港の補修材と工房の検分',
  names: { ko: '항구 보수재와 공방 검수', en: 'Harbor Repair Boards and Workshop Inspection', ja: '港の補修材と工房の検分' },
  description: '潮待ち港で依頼を受け、エンバーホールの工房で検分の手順を調べよう。船体の補修板2枚を制作するか扱う店で揃え、潮待ち港へ戻って納品する。',
  descriptions: { ko: '조수항에서 의뢰를 받고 엠버홀 공방의 검수 절차를 조사하자. 선체 보수판 2개를 만들거나 취급 상점에서 구해 조수항으로 돌아와 납품한다.', en: 'Accept the order in Tidehaven and visit Emberhall to study its workshop inspection procedure. Craft or buy two Hull Repair Planks, then return to Tidehaven to deliver them.', ja: '潮待ち港で依頼を受け、エンバーホールの工房で検分の手順を調べよう。船体の補修板2枚を制作するか扱う店で揃え、潮待ち港へ戻って納品する。' },
  giver: 'tidehaven', destination: 'emberhall', item: 'repair-plank', count: 2, gold: 84, xp: 32,
}];
