import type { FantasyItem, FantasyLocation, FantasyRecipe, FantasyStats } from './fantasy.ts';
import type { FantasyAlchemyIngredient } from './fantasy-alchemy-catalog.ts';

type Triple = [string, string, string];
const l = ([ko, en, ja]: Triple) => ({ ko, en, ja });
type Source = NonNullable<FantasyItem['drop']>;
const source = (kinds: FantasyLocation['kind'][], chance = .18, minDanger = 0): Source => ({ kinds, chance, minDanger });
type Material = { id: string; names: Triple; price: number; weight: number; category: string; source: Source; use: Triple; reagent?: Omit<FantasyAlchemyIngredient, 'id'> };
const plant = (id: string, names: Triple, kinds: FantasyLocation['kind'][], affinities: FantasyAlchemyIngredient['affinities'], use: Triple, potency = 2): Material => ({ id, names, price: 10 + potency * 2, weight: 25, category: 'herb', source: source(kinds, .16), use, reagent: { kind: 'herb', potency, affinities } });
const tissue = (id: string, names: Triple, kinds: FantasyLocation['kind'][], affinities: FantasyAlchemyIngredient['affinities'], use: Triple, potency = 2): Material => ({ id, names, price: 12 + potency * 3, weight: 120, category: 'monster-material', source: source(kinds, .12, 1), use, reagent: { kind: 'monster', potency, affinities } });
const raw = (id: string, names: Triple, category: string, price: number, weight: number, kinds: FantasyLocation['kind'][], use: Triple): Material => ({ id, names, category, price, weight, source: source(kinds, .2), use });

export const FANTASY_WORKSHOP_MATERIALS: Material[] = [
  plant('cinder-petal', ['잿불꽃잎', 'Cinder Petal', '燠火の花弁'], ['volcano', 'mountain'], { 'fire-bomb': 5, 'vigor-tonic': 1 }, ['가열 조합과 따뜻한 차', 'heated mixtures and warming tea', '加熱調合と温かい茶']),
  plant('rime-lichen', ['백상 지의류', 'Rime Lichen', '霜の地衣'], ['snow', 'cave'], { 'frost-flask': 5, 'ward-tonic': 1 }, ['냉각 조합과 냉각 안감', 'cooling mixtures and cooling linings', '冷却調合と冷却裏地']),
  plant('storm-fennel', ['뇌향 회향', 'Storm Fennel', '雷香の茴香'], ['mountain', 'island'], { 'flash-flask': 5, 'vigor-tonic': 2 }, ['섬광 조합과 기력 음료', 'flash mixtures and vigor drinks', '閃光調合と気力の飲料']),
  plant('dream-lotus', ['꿈연꽃', 'Dream Lotus', '夢蓮'], ['swamp', 'coast'], { 'clarity-tonic': 5, 'restorative-tonic': 1 }, ['명료 조합과 정신 회복 차', 'clarity mixtures and restorative tea', '明晰調合と精神回復の茶']),
  plant('bitter-sedge', ['쓴 사초', 'Bitter Sedge', '苦い菅'], ['swamp', 'forest'], { 'acid-flask': 5, 'restorative-tonic': 1, 'enfeebling-flask': 6 }, ['부식·쇠약 조합과 해독 찜질', 'corrosive and enfeebling mixtures and cleansing poultices', '腐食・衰弱調合と解毒湿布']),
  plant('iron-thyme', ['철향 백리향', 'Iron Thyme', '鉄香の百里香'], ['mountain', 'forest'], { 'ward-tonic': 5, 'binding-flask': 1, 'thorn-tonic': 6 }, ['수호·가시 조합과 든든한 수프', 'warding and thorn mixtures and hearty soup', '守護・棘調合と滋養スープ']),
  plant('ghost-cap', ['유령갓 버섯', 'Ghostcap', '幽霊傘茸'], ['cave', 'ruin'], { 'smoke-bomb': 5, 'clarity-tonic': 1, 'silencing-flask': 6 }, ['연막·정적 조합', 'smoke and silencing mixtures', '煙幕・静寂調合'], 3),
  plant('glue-vine', ['끈끈이 덩굴', 'Glue Vine', '粘着蔓'], ['forest', 'swamp'], { 'binding-flask': 5, 'ward-tonic': 1 }, ['속박 조합과 목공 접착제', 'binding mixtures and wood glue', '束縛調合と木工接着剤']),
  plant('dawn-rosehip', ['새벽 찔레열매', 'Dawn Rosehip', '暁の野薔薇実'], ['forest', 'mountain'], { 'restorative-tonic': 5, 'flash-flask': 1, 'leech-tonic': 6 }, ['재생·흡혈 조합과 과실 보존식', 'restorative and leech mixtures and fruit preserves', '再生・吸血調合と果実保存食']),
  plant('night-anise', ['밤향 팔각', 'Night Anise', '夜香の八角'], ['forest', 'snow'], { 'clarity-tonic': 4, 'smoke-bomb': 2 }, ['명료 조합과 향신 빵', 'clarity mixtures and spiced bread', '明晰調合と香辛パン']),
  plant('salt-aloe', ['소금 알로에', 'Salt Aloe', '塩蘆薈'], ['desert', 'coast'], { 'ward-tonic': 4, 'frost-flask': 2 }, ['수호 조합과 화상 연고', 'ward mixtures and burn salves', '守護調合と火傷軟膏']),
  plant('spring-nettle', ['샘 쐐기풀', 'Spring Nettle', '泉の蕁麻'], ['forest', 'swamp'], { 'vigor-tonic': 5, 'restorative-tonic': 1, 'lacerating-flask': 6 }, ['신속·열상 조합과 피로 회복 음식', 'vigor and lacerating mixtures and fatigue-easing meals', '迅速・裂傷調合と疲労回復食']),
  tissue('salamander-gland', ['불도롱뇽 분비샘', 'Salamander Gland', '火蜥蜴の腺'], ['volcano', 'cave'], { 'fire-bomb': 5, 'acid-flask': 1 }, ['가열 조합', 'heated mixtures', '加熱調合'], 3),
  tissue('frost-moth-dust', ['서리나방 가루', 'Frost Moth Dust', '霜蛾の鱗粉'], ['snow', 'mountain'], { 'frost-flask': 5, 'smoke-bomb': 1 }, ['냉각 조합과 냉각 안감', 'cooling mixtures and cooling lining', '冷却調合と冷却裏地'], 3),
  tissue('thunder-beetle-shell', ['뇌각 딱정벌레 껍질', 'Thunder Beetle Shell', '雷甲虫の殻'], ['mountain', 'island'], { 'flash-flask': 5, 'ward-tonic': 1, 'thorn-tonic': 6 }, ['섬광·가시 조합과 절연 장갑', 'flash and thorn mixtures and insulating gloves', '閃光・棘調合と絶縁手袋'], 3),
  tissue('marsh-slime-gel', ['늪슬라임 점액', 'Marsh Slime Gel', '沼スライムの粘液'], ['swamp', 'cave'], { 'binding-flask': 4, 'acid-flask': 3 }, ['속박 조합과 방수 피혁', 'binding mixtures and sealed leather', '束縛調合と防水革']),
  tissue('basilisk-bile', ['바실리스크 담즙', 'Basilisk Bile', 'バジリスクの胆汁'], ['desert', 'ruin'], { 'acid-flask': 6, 'enfeebling-flask': 6 }, ['부식·쇠약 조합', 'corrosive and enfeebling mixtures', '腐食・衰弱調合'], 3),
  tissue('wisp-dew', ['도깨비불 이슬', 'Wisp Dew', '鬼火の雫'], ['swamp', 'ruin'], { 'clarity-tonic': 5, 'smoke-bomb': 2, 'silencing-flask': 6 }, ['명료·정적 조합과 초점 장식', 'clarity and silencing mixtures and focus charms', '明晰・静寂調合と集中飾り'], 3),
  tissue('troll-marrow', ['트롤 골수', 'Troll Marrow', 'トロルの骨髄'], ['mountain', 'cave'], { 'restorative-tonic': 5, 'ward-tonic': 2, 'leech-tonic': 6 }, ['재생·흡혈 조합과 회복 찜질', 'restorative and leech mixtures and healing poultices', '再生・吸血調合と回復湿布'], 3),
  tissue('manticore-sinew', ['만티코어 힘줄', 'Manticore Sinew', 'マンティコアの腱'], ['desert', 'mountain'], { 'vigor-tonic': 5, 'binding-flask': 1, 'lacerating-flask': 6 }, ['신속·열상 조합과 활시위', 'vigor and lacerating mixtures and bowstrings', '迅速・裂傷調合と弓弦'], 3),
  raw('river-reed', ['강갈대', 'River Reed', '川葦'], 'fiber', 5, 180, ['swamp', 'coast'], ['종이와 갈대 천', 'paper and reed cloth', '紙と葦布']),
  raw('ramie-fiber', ['모시 섬유', 'Ramie Fiber', '苧麻の繊維'], 'fiber', 7, 120, ['forest', 'swamp'], ['튼튼한 직물과 실', 'strong cloth and thread', '丈夫な布と糸']),
  raw('cork-bark', ['코르크 껍질', 'Cork Bark', 'コルク樹皮'], 'wood', 7, 200, ['forest'], ['부력 조끼와 가벼운 방패', 'buoyant vests and light shields', '浮力胴着と軽い盾']),
  raw('cedar-timber', ['삼나무 목재', 'Cedar Timber', '杉材'], 'wood', 9, 1400, ['forest'], ['방패와 합판 활', 'shields and laminated bows', '盾と積層弓']),
  raw('pine-resin', ['송진', 'Pine Resin', '松脂'], 'material', 6, 90, ['forest', 'snow'], ['방수 천과 접착제', 'sealed cloth and glue', '防水布と接着剤']),
  raw('beeswax', ['밀랍', 'Beeswax', '蜜蝋'], 'material', 8, 100, ['forest'], ['방수 천과 연고', 'sealed cloth and salves', '防水布と軟膏']),
  raw('wild-honey', ['야생 꿀', 'Wild Honey', '野蜜'], 'ingredient', 10, 300, ['forest'], ['빵과 과실 보존식', 'bread and fruit preserves', 'パンと果実保存食']),
  raw('rock-salt', ['암염', 'Rock Salt', '岩塩'], 'ore', 5, 350, ['mountain', 'cave', 'desert'], ['염장 생선과 수프', 'salted fish and soup', '塩魚とスープ']),
  raw('quartz-sand', ['석영 모래', 'Quartz Sand', '石英砂'], 'ore', 6, 800, ['desert', 'coast'], ['유리와 도기 유약', 'glass and ceramic glazes', 'ガラスと陶器の釉薬']),
  raw('feldspar', ['장석', 'Feldspar', '長石'], 'ore', 8, 900, ['mountain', 'cave'], ['도기 유약', 'ceramic glazes', '陶器の釉薬']),
  raw('bog-iron', ['늪철', 'Bog Iron', '沼鉄'], 'ore', 9, 1800, ['swamp'], ['강철과 작업 도구', 'steel and work tools', '鋼と作業道具']),
  raw('hardwood-charcoal', ['경목 숯', 'Hardwood Charcoal', '硬木炭'], 'material', 7, 400, ['forest', 'volcano'], ['강철 제련', 'steel smelting', '鋼の精錬']),
  raw('river-pearl', ['강진주', 'River Pearl', '川真珠'], 'gem', 20, 15, ['coast', 'swamp'], ['수호 장식과 치유 도기', 'ward charms and healing vessels', '守護飾りと癒やしの器']),
  raw('smoky-quartz', ['연수정', 'Smoky Quartz', '煙水晶'], 'gem', 18, 90, ['cave', 'mountain'], ['초점 장식과 연마 렌즈', 'focus charms and polished lenses', '集中飾りと研磨レンズ']),
  raw('tannin-bark', ['무두질 껍질', 'Tannin Bark', '鞣し樹皮'], 'wood', 6, 250, ['forest'], ['방수 가죽과 장갑', 'sealed leather and gloves', '防水革と手袋']),
  raw('wool-fleece', ['양모 다발', 'Wool Fleece', '羊毛の束'], 'fiber', 8, 250, ['mountain', 'forest'], ['펠트와 방한 의복', 'felt and winter clothing', 'フェルトと防寒服']),
];

export const FANTASY_WORKSHOP_REAGENTS: FantasyAlchemyIngredient[] = FANTASY_WORKSHOP_MATERIALS.flatMap(({ id, reagent }) => reagent ? [{ id, ...reagent }] : []);
export const FANTASY_WORKSHOP_GATHER_RESOURCES: Record<string, 'herbs' | 'wood' | 'minerals' | 'gems'> = Object.fromEntries(FANTASY_WORKSHOP_MATERIALS.filter(material => material.category !== 'monster-material').map(material => [material.id, material.category === 'gem' ? 'gems' : material.category === 'ore' ? 'minerals' : ['wood', 'fiber'].includes(material.category) ? 'wood' : 'herbs']));
export const FANTASY_WORKSHOP_MATERIAL_ITEMS: FantasyItem[] = FANTASY_WORKSHOP_MATERIALS.map(material => {
  const descriptions = material.reagent
    ? l(['연금 합성과 표시된 생산법에 쓰는 재료. 합성 결과는 제조하여 발견한다. 해당 지형에서 탐사하거나 시장에서 구한다.', 'A reagent for synthesis and listed crafting recipes. Discover synthesis results by making them. Explore its terrain or trade at markets.', '錬金合成と表示された製法の素材。合成結果は実際の製造で発見する。対応地形の探索や市場で得る。'])
    : l([`${material.use[0]}에 사용하는 재료. 해당 지형 탐사에서 얻거나 시장에서 거래한다.`, `A material for ${material.use[1]}. Found by exploring its terrain or traded at markets.`, `${material.use[2]}に使う素材。対応する地形の探索で得るか市場で取引する。`]);
  return { id: material.id, names: l(material.names), name: material.names[2], descriptions, description: descriptions.ja, price: material.price, category: material.category, drop: material.source };
});

type Product = { item: FantasyItem; recipe: FantasyRecipe & { names: ReturnType<typeof l> }; weight: number };
const products: Product[] = [];
function product(id: string, names: Triple, descriptions: Triple, job: string, inputs: Record<string, number>, price: number, weight: number, extra: Partial<FantasyItem>, dc = 12, count = 1) {
  products.push({ item: { id, names: l(names), name: names[2], descriptions: l(descriptions), description: descriptions[2], price, craftOnly: true, ...extra }, recipe: { id: `${job}-${id}`, job, inputs, output: id, name: names[2], names: l(names), count, dc }, weight });
}
const intermediate = (id: string, names: Triple, descriptions: Triple, job: string, inputs: Record<string, number>, price: number, weight: number, category: string) => product(id, names, descriptions, job, inputs, price, weight, { category }, 10, 2);
const food = (id: string, names: Triple, descriptions: Triple, job: string, inputs: Record<string, number>, price: number, nutrition: number, shelfLife: number, use: NonNullable<FantasyItem['use']>) => product(id, names, descriptions, job, inputs, price, 300, { category: 'food', food: { nutrition, shelfLife }, use: { ...use, hunger: nutrition } });
const gear = (id: string, names: Triple, descriptions: Triple, job: string, inputs: Record<string, number>, price: number, weight: number, slot: NonNullable<FantasyItem['equipment']>['slot'], stats: Partial<FantasyStats>, extra: Partial<NonNullable<FantasyItem['equipment']>> = {}, wear?: FantasyItem['wear']) => product(id, names, descriptions, job, inputs, price, weight, { category: slot === 'armor' ? 'armor' : slot === 'weapon' ? 'weapon' : 'accessory', equipment: { slot, stats, ...extra }, ...(wear ? { wear } : {}) }, 13);

intermediate('reed-paper', ['갈대 종이', 'Reed Paper', '葦紙'], ['기록과 지도용 종이. 기존 필사용 종이로 가공한다.', 'Paper for records and charts, finished into copyist paper.', '記録と地図の紙。既存の筆写用紙へ仕上げる。'], 'scribe', { 'river-reed': 2, 'glue-vine': 1 }, 12, 35, 'paper');
intermediate('ramie-cloth', ['모시 천', 'Ramie Cloth', '苧麻布'], ['가볍고 질긴 안감. 방수 외투와 작업 장갑에 쓴다.', 'Light, tough lining for sealed coats and work gloves.', '軽く丈夫な裏地。防水外套と作業手袋に使う。'], 'weaver', { 'ramie-fiber': 3 }, 16, 250, 'cloth');
intermediate('tempered-steel', ['정련 강철', 'Tempered Steel', '調質鋼'], ['늪철과 숯으로 정련한 금속. 망치와 창을 만든다.', 'Metal refined from bog iron and charcoal for hammers and spears.', '沼鉄と炭から精錬した金属。槌と槍を作る。'], 'blacksmith', { 'bog-iron': 2, 'hardwood-charcoal': 1 }, 28, 1000, 'ingot');
intermediate('clear-glass', ['투명 유리', 'Clear Glass', '透明ガラス'], ['석영 모래를 녹인 유리. 렌즈와 유약의 재료.', 'Melted quartz glass for lenses and glazes.', '石英砂を溶かしたガラス。レンズと釉薬の素材。'], 'potter', { 'quartz-sand': 2, wood: 1 }, 14, 300, 'material');
intermediate('sealed-leather', ['방수 무두질 가죽', 'Sealed Leather', '防水鞣し革'], ['수지와 점액으로 봉한 가죽. 방수 장비에 쓴다.', 'Leather sealed with resin and gel for weather gear.', '樹脂と粘液で封じた革。防水装備に使う。'], 'leatherworker', { 'lizard-hide': 1, 'tannin-bark': 1, 'marsh-slime-gel': 1 }, 24, 500, 'hide');
intermediate('wool-felt', ['양모 펠트', 'Wool Felt', '羊毛フェルト'], ['압착한 양모. 방한 외투와 도기 덮개의 안감.', 'Pressed wool for winter coats and vessel covers.', '圧縮した羊毛。防寒外套と器の覆いの裏地。'], 'weaver', { 'wool-fleece': 3 }, 18, 300, 'cloth');
food('honey-rose-preserve', ['꿀찔레 보존식', 'Honey Rosehip Preserve', '蜜薔薇の保存食'], ['HP18, 허기32 회복. 120시간 보존.', 'Restores 18 HP and 32 hunger; keeps for 120 hours.', 'HP18と空腹32を回復。保存120時間。'], 'cook', { 'dawn-rosehip': 2, 'wild-honey': 1, 'pottery-vessel': 1 }, 36, 32, 120, { hp: 18 });
food('salted-herb-fish', ['염장 향초 생선', 'Salted Herb Fish', '香草塩魚'], ['HP14, 허기38 회복. 168시간 보존.', 'Restores 14 HP and 38 hunger; keeps for 168 hours.', 'HP14と空腹38を回復。保存168時間。'], 'fisher', { fish: 2, 'rock-salt': 1, 'iron-thyme': 1 }, 32, 38, 168, { hp: 14 });
food('nettle-grain-pot', ['쐐기풀 곡물죽', 'Nettle Grain Pot', '蕁麻の穀物粥'], ['피로16, 허기45 회복. 24시간 보존.', 'Eases 16 fatigue and restores 45 hunger; keeps for 24 hours.', '疲労16と空腹45を回復。保存24時間。'], 'cook', { grain: 2, 'spring-nettle': 1, 'rock-salt': 1 }, 30, 45, 24, { fatigue: 16 });
food('lotus-mind-tea', ['꿈연꽃 차', 'Dream Lotus Tea', '夢蓮茶'], ['MP22, 허기8 회복. 18시간 보존.', 'Restores 22 MP and 8 hunger; keeps for 18 hours.', 'MP22と空腹8を回復。保存18時間。'], 'herbalist', { 'dream-lotus': 2, 'wild-honey': 1 }, 34, 8, 18, { mp: 22 });
food('cinder-warming-tea', ['잿불 보온차', 'Cinder Warming Tea', '燠火の温茶'], ['피로10, 허기8 회복, 동상 치료. 18시간 보존.', 'Eases 10 fatigue, restores 8 hunger and cures frost; keeps for 18 hours.', '疲労10と空腹8を回復し凍傷を治す。保存18時間。'], 'herbalist', { 'cinder-petal': 1, 'wild-honey': 1, herb: 1 }, 28, 8, 18, { fatigue: 10, cure: ['frost'] });
food('anise-honey-biscuit', ['팔각 꿀 비스킷', 'Anise Honey Biscuit', '八角蜜ビスケット'], ['MP10, 허기34 회복. 96시간 보존.', 'Restores 10 MP and 34 hunger; keeps for 96 hours.', 'MP10と空腹34を回復。保存96時間。'], 'baker', { flour: 2, 'night-anise': 1, 'wild-honey': 1 }, 30, 34, 96, { mp: 10 });
food('iron-thyme-chowder', ['철향 생선 수프', 'Iron Thyme Chowder', '鉄香の魚スープ'], ['HP20, 허기46 회복. 3시간 방호2. 24시간 보존.', 'Restores 20 HP and 46 hunger; guard +2 for 3 hours. Keeps for 24 hours.', 'HP20と空腹46を回復。3時間防護+2。保存24時間。'], 'cook', { fish: 1, 'iron-thyme': 2, 'rock-salt': 1 }, 38, 46, 24, { hp: 20, effect: { id: 'well-fed', hours: 3, guard: 2 } });
food('storm-fennel-cracker', ['뇌향 건빵', 'Storm Fennel Cracker', '雷香の乾パン'], ['피로14, 허기36 회복. 120시간 보존.', 'Eases 14 fatigue and restores 36 hunger; keeps for 120 hours.', '疲労14と空腹36を回復。保存120時間。'], 'baker', { flour: 2, 'storm-fennel': 1, 'rock-salt': 1 }, 32, 36, 120, { fatigue: 14 });
product('aloe-burn-salve', ['알로에 화상 연고', 'Aloe Burn Salve', '蘆薈の火傷軟膏'], ['HP18 회복, 화상 치료.', 'Restores 18 HP and cures burns.', 'HP18を回復し火傷を治す。'], 'herbalist', { 'salt-aloe': 2, beeswax: 1 }, 30, 130, { category: 'potion', use: { hp: 18, cure: ['burn'] } });
product('sedge-cleansing-pack', ['사초 정화 찜질', 'Sedge Cleansing Pack', '菅の浄化湿布'], ['독과 쇠약을 치료한다.', 'Cures poison and weakness.', '毒と衰弱を治す。'], 'herbalist', { 'bitter-sedge': 2, 'ramie-cloth': 1 }, 28, 120, { category: 'potion', use: { cure: ['poison', 'weakness'] } });
product('marrow-recovery-pack', ['골수 회복 찜질', 'Marrow Recovery Pack', '骨髄の回復湿布'], ['HP34 회복. 빈사 상태는 소생시키지 않는다.', 'Restores 34 HP; does not revive a downed character.', 'HP34を回復。瀕死の者は蘇生しない。'], 'herbalist', { 'troll-marrow': 1, 'dawn-rosehip': 1, linen: 1 }, 40, 250, { category: 'potion', use: { hp: 34 } });
gear('waxed-ramie-coat', ['밀랍 모시 외투', 'Waxed Ramie Coat', '蜜蝋苧麻の外套'], ['민첩1, 방호1, 보온1, 방수8. 의복으로 착용하면 비의 부담을 막는다.', 'Agility +1, guard +1, warmth 1, waterproofing 8. Wearing it as an outfit prevents the rain penalty.', '敏捷+1、防護+1、保温1、防水8。衣服として着ると雨の負担を防ぐ。'], 'tailor', { 'ramie-cloth': 2, beeswax: 1, 'pine-resin': 1 }, 76, 1700, 'armor', { agility: 1 }, { guard: 1 }, { warmth: 1, cooling: 0, waterproof: 8 });
gear('felt-wintercoat', ['펠트 방한 외투', 'Felt Wintercoat', 'フェルトの防寒外套'], ['체력1, 민첩−1, 방호2, 보온5.', 'Vitality +1, agility −1, guard +2, warmth 5.', '体力+1、敏捷−1、防護+2、保温5。'], 'tailor', { 'wool-felt': 3, linen: 1 }, 78, 2600, 'armor', { vitality: 1, agility: -1 }, { guard: 2 }, { warmth: 5, cooling: 0, waterproof: 0 });
gear('rime-cooling-wrap', ['서리 냉각 두건', 'Rime Cooling Wrap', '霜の冷却頭巾'], ['손재주1, 방호1, 냉각4.', 'Dexterity +1, guard +1, cooling 4.', '手先+1、防護+1、冷却4。'], 'tailor', { 'ramie-cloth': 2, 'rime-lichen': 1, 'frost-moth-dust': 1 }, 82, 900, 'armor', { dexterity: 1 }, { guard: 1 }, { warmth: 0, cooling: 4, waterproof: 0 });
gear('cork-river-vest', ['코르크 강물 조끼', 'Cork River Vest', 'コルクの川胴着'], ['체력2, 방호1, 방수3. 깊은 물 판정은 기존 신체 규칙을 따른다.', 'Vitality +2, guard +1, waterproofing 3. Water checks still use body rules.', '体力+2、防護+1、防水3。深水判定は既存の身体規則に従う。'], 'shipwright', { 'cork-bark': 3, 'sealed-leather': 1 }, 74, 1600, 'armor', { vitality: 2 }, { guard: 1 }, { warmth: 0, cooling: 0, waterproof: 3 });
gear('tannin-grip-gloves', ['무두질 작업 장갑', 'Tannin Work Gloves', '鞣しの作業手袋'], ['힘1, 손재주1.', 'Strength +1 and dexterity +1.', '力+1、手先+1。'], 'leatherworker', { 'sealed-leather': 1, 'ramie-cloth': 1, 'tannin-bark': 1 }, 58, 220, 'accessory', { strength: 1, dexterity: 1 });
gear('thundershell-gloves', ['뇌각 절연 장갑', 'Thundershell Gloves', '雷殻の絶縁手袋'], ['손재주1, 체력1, 방호1. 번개 면역은 아니다.', 'Dexterity +1, vitality +1 and guard +1; no lightning immunity.', '手先+1、体力+1、防護+1。雷を無効化しない。'], 'leatherworker', { 'thunder-beetle-shell': 2, 'sealed-leather': 1 }, 86, 340, 'accessory', { dexterity: 1, vitality: 1 }, { guard: 1 });
gear('cedar-buckler', ['삼나무 원방패', 'Cedar Buckler', '杉の小盾'], ['민첩1, 방호2.', 'Agility +1 and guard +2.', '敏捷+1、防護+2。'], 'carpenter', { 'cedar-timber': 2, 'cork-bark': 1, ingot: 1 }, 64, 1100, 'offhand', { agility: 1 }, { guard: 2 });
gear('sinew-laminate-bow', ['힘줄 합판 활', 'Sinew Laminate Bow', '腱の積層弓'], ['민첩3, 손재주1. 활 무기 분류를 따른다.', 'Agility +3, dexterity +1; classified as a bow.', '敏捷+3、手先+1。弓の武器分類に従う。'], 'carpenter', { 'cedar-timber': 2, 'manticore-sinew': 1, 'glue-vine': 1 }, 106, 1350, 'weapon', { agility: 3, dexterity: 1 });
gear('tempered-warhammer', ['정련 전투 망치', 'Tempered Warhammer', '調質の戦槌'], ['힘3, 체력1, 민첩−1.', 'Strength +3, vitality +1, agility −1.', '力+3、体力+1、敏捷−1。'], 'blacksmith', { 'tempered-steel': 2, 'cedar-timber': 1 }, 100, 2800, 'weapon', { strength: 3, vitality: 1, agility: -1 });
gear('reedsteel-spear', ['강철 갈대창', 'Reedsteel Spear', '葦鋼の槍'], ['힘2, 손재주2. 창 무기 분류를 따른다.', 'Strength +2, dexterity +2; classified as a spear.', '力+2、手先+2。槍の武器分類に従う。'], 'blacksmith', { 'tempered-steel': 1, 'cedar-timber': 2, 'ramie-fiber': 1 }, 96, 2100, 'weapon', { strength: 2, dexterity: 2 });
gear('pearl-ward-pendant', ['강진주 수호 목걸이', 'Pearl Ward Pendant', '川真珠の守護首飾り'], ['체력1, MP4, 방호1.', 'Vitality +1, MP +4 and guard +1.', '体力+1、MP+4、防護+1。'], 'gemcutter', { 'river-pearl': 2, 'silver-ingot': 1 }, 90, 70, 'accessory', { vitality: 1, mp: 4 }, { guard: 1 });
gear('smoky-focus-charm', ['연수정 집중 장식', 'Smoky Focus Charm', '煙水晶の集中飾り'], ['지능2, MP6.', 'Intelligence +2 and MP +6.', '知力+2、MP+6。'], 'gemcutter', { 'smoky-quartz': 2, 'wisp-dew': 1, 'silver-ingot': 1 }, 98, 85, 'accessory', { intelligence: 2, mp: 6 });
gear('glass-tracing-lens', ['유리 판독 렌즈', 'Glass Tracing Lens', 'ガラスの読取レンズ'], ['손재주2, 지능1.', 'Dexterity +2 and intelligence +1.', '手先+2、知力+1。'], 'gemcutter', { 'clear-glass': 2, 'smoky-quartz': 1, 'cork-bark': 1 }, 76, 180, 'accessory', { dexterity: 2, intelligence: 1 });
gear('pearl-glaze-vessel', ['진주 유약 도기', 'Pearl Glaze Vessel', '真珠釉の器'], ['체력1, MP4, 방호2.', 'Vitality +1, MP +4 and guard +2.', '体力+1、MP+4、防護+2。'], 'potter', { clay: 3, feldspar: 1, 'river-pearl': 1, 'clear-glass': 1 }, 82, 850, 'offhand', { vitality: 1, mp: 4 }, { guard: 2 });
gear('felt-ward-wrap', ['펠트 수호 띠', 'Felt Ward Wrap', 'フェルトの守護帯'], ['체력1, HP4.', 'Vitality +1 and HP +4.', '体力+1、HP+4。'], 'weaver', { 'wool-felt': 2, 'iron-thyme': 1 }, 54, 180, 'accessory', { vitality: 1, hp: 4 });

export const FANTASY_WORKSHOP_PRODUCT_ITEMS = products.map(product => product.item);
export const FANTASY_WORKSHOP_RECIPES = products.map(product => product.recipe);
export const FANTASY_WORKSHOP_ITEM_WEIGHTS: Record<string, number> = Object.fromEntries([...FANTASY_WORKSHOP_MATERIALS.map(material => [material.id, material.weight] as const), ...products.map(product => [product.item.id, product.weight] as const)]);
