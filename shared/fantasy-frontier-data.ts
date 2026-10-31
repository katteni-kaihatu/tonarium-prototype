import type { FantasyLocation, FantasyRoute } from './fantasy.ts';
import type { FantasyDungeonRoom, FantasyDungeonSite, DungeonText } from './fantasy-dungeon-catalog.ts';

export const FANTASY_FRONTIER_LAND = 'frontier';
export const FANTASY_FRONTIER_BASE = 'frontier-landing';
export const FANTASY_FRONTIER_DEPARTURE = 'dawnport';
const l = (ko: string, en: string, ja: string): DungeonText => ({ ko, en, ja });
export const FANTASY_FRONTIER_NAMES = l('미개척 대륙', 'Uncharted Continent', '未開拓大陸');
const place = (id: string, x: number, y: number, kind: FantasyLocation['kind'], danger: number, names: DungeonText, descriptions: DungeonText, resources: string[], services: FantasyLocation['services'] = []): FantasyLocation => ({
  id, x, y, kind, danger, names, descriptions, name: names.ja, description: descriptions.ja,
  land: FANTASY_FRONTIER_LAND, region: FANTASY_FRONTIER_NAMES.ja, resources, services,
});

export const FANTASY_FRONTIER_LOCATIONS: FantasyLocation[] = [
  place(FANTASY_FRONTIER_BASE, 1965, 610, 'coast', 1,
    l('원정대 상륙지', 'Expedition Landing', '遠征隊の上陸地'),
    l('작은 부두 하나와 원정대 천막뿐이다. 한정된 보급품을 나누며 숙소는 직접 마련한다.', 'A single small dock and expedition tents. Supplies are rationed; explorers arrange their own shelter.', '小さな桟橋一つと遠征隊の天幕だけがある。補給品は少量で、寝床は自分で用意する。'), ['fish', 'wood'], ['port']),
  place('frontier-kelp-coast', 2015, 780, 'coast', 4,
    l('해초 밀물해안', 'Kelptide Coast', '海藻の満ち潮浜'),
    l('해초가 드리운 바위 웅덩이에 물고기가 모인다. 만조 때는 해안길이 잠긴다.', 'Fish gather in kelp-draped rock pools. High tide covers the shore trail.', '海藻の垂れる岩の潮溜まりに魚が集まる。満潮には浜道が沈む。'), ['fish', 'rock-salt']),
  place('frontier-rainforest', 2070, 605, 'forest', 4,
    l('비울림 원시림', 'Rain-Echo Wildwood', '雨響きの原生林'),
    l('겹친 수관 아래 식용 버섯과 열매가 자란다. 큰 짐승의 흔적이 젖은 땅에 남는다.', 'Edible fungi and berries grow under layered canopies. Large beasts leave tracks in wet earth.', '重なる樹冠の下に食用茸と木の実が育つ。濡れた土に大きな獣の跡が残る。'), ['wood', 'herb', 'pantry-mushroom', 'pantry-berry']),
  place('frontier-fern-meadow', 2135, 745, 'forest', 4,
    l('고사리 바람들', 'Fernwind Meadow', '羊歯風の野'),
    l('숲이 낮아진 풀밭에 열매와 약초가 섞여 자란다. 사냥감은 바람을 따라 이동한다.', 'Berries and herbs mingle where woodland thins into grass. Wildlife moves with the wind.', '森が低くなる草地に木の実と薬草が混じる。獲物は風に沿って移る。'), ['wood', 'herb', 'pantry-berry']),
  place('frontier-reed-marsh', 2200, 905, 'swamp', 5,
    l('깊은 갈대습지', 'Deepreed Marsh', '深葦の湿地'),
    l('갈대 사이 물길에는 물고기가 살지만 진흙 아래 큰 그림자가 움직인다.', 'Fish live in the reed channels, while broad shadows move beneath the mud.', '葦の水路には魚が棲むが、泥の下では大きな影が動く。'), ['fish', 'herb', 'wood']),
  place('frontier-river-bend', 2210, 670, 'coast', 4,
    l('굽이강 자갈톱', 'Riverbend Shingle', '曲がり川の砂利洲'),
    l('내륙의 넓은 강이 자갈톱을 감싼다. 낚시와 물 보충은 가능하나 배를 댈 부두는 없다.', 'A broad inland river curves around shingle banks. Fish and water are available, with no dock.', '内陸の大河が砂利洲を囲む。魚と水は得られるが桟橋はない。'), ['fish', 'herb']),
  place('frontier-split-gorge', 2180, 480, 'mountain', 5,
    l('갈라진 협곡', 'Riven Gorge', '裂けた峡谷'),
    l('급한 절벽 사이로 광맥이 드러난다. 돌그늘에서 사냥감과 포식자가 물을 기다린다.', 'Mineral veins cross steep cliffs. Quarry and predators wait for water in the stone shade.', '急な崖に鉱脈が走る。岩陰では獲物も捕食者も水を待つ。'), ['ore', 'gem', 'crystal']),
  place('frontier-cloud-ridge', 2295, 340, 'mountain', 5,
    l('구름등성이', 'Cloudback Ridge', '雲背の尾根'),
    l('구름이 바위 능선을 감싸며 날개 달린 포식자가 상승기류를 탄다.', 'Clouds wrap the rocky spine and winged predators ride the updrafts.', '雲が岩の背を包み、翼ある捕食者が上昇気流に乗る。'), ['ore', 'gem']),
  place('frontier-frost-basin', 2225, 195, 'snow', 5,
    l('서리잠 분지', 'Frostsleep Basin', '霜眠りの盆地'),
    l('만년설 아래 바람이 갇히는 차가운 분지. 식량과 땔감은 오르기 전에 준비해야 한다.', 'Wind settles over a cold basin of old snow. Carry food and fuel before climbing.', '古い雪に風が籠る冷たい盆地。登る前に食料と燃料を備える必要がある。'), ['crystal', 'herb']),
  place('frontier-amber-dunes', 2420, 615, 'desert', 5,
    l('호박빛 모래언덕', 'Amber Dunes', '琥珀色の砂丘'),
    l('마른 바람이 광물 가루를 옮긴다. 모래 아래 단단한 돌의 선이 드러났다 사라진다.', 'Dry winds carry mineral dust. Lines of hard stone appear and vanish beneath the sand.', '乾いた風が鉱物の粉を運ぶ。砂の下に硬い石の線が現れては消える。'), ['ore', 'rock-salt', 'spice']),
  place('frontier-cinder-caldera', 2425, 430, 'volcano', 6,
    l('잿불 분화구', 'Cinder Caldera', '燠火の火口盆'),
    l('식은 용암 사이로 뜨거운 김이 솟는다. 검은 암석에 결정과 오래된 흔적이 박혀 있다.', 'Hot steam rises through cooled lava. Crystals and old traces lie within black stone.', '冷えた溶岩の隙間から熱い蒸気が上がる。黒い岩に結晶と古い痕跡が埋まる。'), ['ore', 'crystal', 'gem']),
  place('frontier-echo-caverns', 2055, 400, 'cave', 5,
    l('지하울림 동굴지대', 'Underecho Caverns', '地響きの洞窟地帯'),
    l('빗물이 돌 틈으로 스며드는 동굴지대. 통로의 울림을 따라가면 길을 잃기 쉽다.', 'Rain seeps through this cavern country. Following echoes alone can lead explorers astray.', '雨水が岩間に染みる洞窟地帯。響きだけを頼ると道を失いやすい。'), ['ore', 'crystal', 'gem']),
  place('frontier-shattered-tableland', 2330, 810, 'mountain', 6,
    l('부서진 대지', 'Shattered Tableland', '砕けた台地'),
    l('평평한 바위가 깊은 틈으로 갈라진다. 수풀 속에서 각진 돌 조각이 간혹 보인다.', 'Flat stone splits into deep clefts. Angular fragments sometimes show through the scrub.', '平らな岩が深い裂け目に分かれる。藪の間に角張った石片が時折見える。'), ['ore', 'crystal', 'relic']),
  place('frontier-storm-bluffs', 2440, 965, 'mountain', 6,
    l('폭풍바람 절벽', 'Stormwind Bluffs', '嵐風の断崖'),
    l('바다 위 솟은 높은 절벽에는 둥지와 강풍뿐이다. 안전한 정박지는 없다.', 'High cliffs above the sea hold nests and fierce winds. There is no safe anchorage.', '海へ高く突き出た崖には巣と強風がある。安全な泊まり場はない。'), ['gem', 'ore']),
];

const trail = (from: string, to: string, hours: number): FantasyRoute => ({ from, to, mode: 'land', hours });
export const FANTASY_FRONTIER_ROUTES: FantasyRoute[] = [
  { from: FANTASY_FRONTIER_DEPARTURE, to: FANTASY_FRONTIER_BASE, mode: 'sea', hours: 24 },
  trail(FANTASY_FRONTIER_BASE, 'frontier-rainforest', 3), trail(FANTASY_FRONTIER_BASE, 'frontier-kelp-coast', 4),
  trail('frontier-rainforest', 'frontier-fern-meadow', 3), trail('frontier-kelp-coast', 'frontier-fern-meadow', 4),
  trail('frontier-fern-meadow', 'frontier-reed-marsh', 5), trail('frontier-fern-meadow', 'frontier-river-bend', 3),
  trail('frontier-rainforest', 'frontier-echo-caverns', 5), trail('frontier-rainforest', 'frontier-split-gorge', 5),
  trail('frontier-echo-caverns', 'frontier-split-gorge', 4), trail('frontier-split-gorge', 'frontier-cloud-ridge', 5),
  trail('frontier-cloud-ridge', 'frontier-frost-basin', 6), trail('frontier-cloud-ridge', 'frontier-cinder-caldera', 6),
  trail('frontier-river-bend', 'frontier-amber-dunes', 5), trail('frontier-amber-dunes', 'frontier-cinder-caldera', 5),
  trail('frontier-river-bend', 'frontier-shattered-tableland', 5), trail('frontier-reed-marsh', 'frontier-shattered-tableland', 5),
  trail('frontier-shattered-tableland', 'frontier-storm-bluffs', 6), trail('frontier-amber-dunes', 'frontier-shattered-tableland', 4),
];

export const FANTASY_FRONTIER_ENCOUNTERS: Record<string, string[]> = {
  [FANTASY_FRONTIER_BASE]: [],
  'frontier-kelp-coast': ['monster-deep-serpent', 'monster-hydra', 'monster-reef-amphibian', 'monster-juvenile-kraken'],
  'frontier-rainforest': ['monster-marsh-troll', 'monster-chimera'],
  'frontier-fern-meadow': ['monster-marsh-troll', 'monster-ogre'],
  'frontier-reed-marsh': ['monster-marsh-troll', 'monster-marsh-wisp', 'monster-hydra'],
  'frontier-river-bend': ['monster-deep-serpent', 'monster-hydra'],
  'frontier-split-gorge': ['monster-stone-troll', 'monster-manticore', 'monster-chimera'],
  'frontier-cloud-ridge': ['monster-griffin', 'monster-storm-elemental', 'monster-cliff-wyvern'],
  'frontier-frost-basin': ['monster-ice-wolf', 'monster-grave-knight'],
  'frontier-amber-dunes': ['monster-basilisk', 'monster-manticore', 'monster-flame-lizard'],
  'frontier-cinder-caldera': ['monster-flame-lizard', 'monster-greater-chimera'],
  'frontier-echo-caverns': ['monster-stone-troll', 'monster-stone-golem', 'monster-ancient-wight'],
  'frontier-shattered-tableland': ['monster-chimera', 'monster-cliff-wyvern', 'monster-greater-chimera'],
  'frontier-storm-bluffs': ['monster-storm-elemental', 'monster-griffin', 'monster-venom-wyvern'],
};
export const FANTASY_FRONTIER_FORAGE_ITEMS: Record<string, string[]> = {
  'frontier-rainforest': ['pantry-mushroom', 'pantry-berry'], 'frontier-fern-meadow': ['pantry-berry'],
};

const chamber = (id: string, names: DungeonText, descriptions: DungeonText, x: number, y: number, exits: string[], extra: Partial<FantasyDungeonRoom> = {}): FantasyDungeonRoom => ({ id, names, descriptions, x, y, exits, ...extra });
function site(id: string, location: string, kind: FantasyDungeonSite['kind'], names: DungeonText, descriptions: DungeonText, passage: DungeonText, hazard: DungeonText, guardian: DungeonText, enemy: string, boss: string, material: string): FantasyDungeonSite {
  return { id, location, kind, names, descriptions, entry: 'threshold', rooms: [
    chamber('threshold', l('숨은 입구', 'Hidden Threshold', '隠れた入口'), descriptions, 0, 0, ['passage', 'hazard']),
    chamber('passage', passage, l('흔적을 읽으며 좁은 길을 따라간다.', 'Read the traces along a narrow passage.', '狭い通路に残る痕跡を読む。'), 1, 0, ['threshold', 'crossing'], { enemy: { template: enemy } }),
    chamber('hazard', hazard, l('흩어진 조각 아래 위험이 남아 있다.', 'Danger remains beneath the scattered fragments.', '散らばる欠片の下に危険が残る。'), 0, 1, ['threshold', 'crossing'], { trap: { detect: 17, disarm: 18, damage: 14, effect: kind === 'ruin' ? 'weakness' : 'poison' }, reward: { gold: 12, item: material, count: 2 } }),
    chamber('crossing', l('갈림 회랑', 'Crossing Hall', '分かれの回廊'), descriptions, 1, 1, ['passage', 'hazard', 'heart']),
    chamber('heart', guardian, l('가장 깊은 곳을 지키는 형체가 앞을 막는다.', 'A guardian of the deepest chamber bars the way.', '最奥を守る形が行く手を塞ぐ。'), 2, 1, ['crossing'], { enemy: { template: boss, boss: true }, reward: { gold: 36, item: material, count: 3 } }),
  ] };
}

export const FANTASY_FRONTIER_DUNGEONS: FantasyDungeonSite[] = [
  site('frontier-root-archive', 'frontier-rainforest', 'ruin',
    l('뿌리 밑 기록유적', 'Rootbound Archive', '根の下の記録遺跡'),
    l('원시림의 뿌리가 덮은 석판과 기록실. 누가 기록했는지는 알 수 없다.', 'Stone tablets and record chambers beneath wildwood roots; their authors remain unknown.', '原生林の根に覆われた石板と記録室。誰が記したかは分からない。'),
    l('뿌리 회랑', 'Root Gallery', '根の回廊'), l('무너진 석판실', 'Fallen Tablet Room', '崩れた石板室'), l('기록의 심장', 'Archive Heart', '記録の心臓'), 'monster-stone-golem', 'monster-archive-warden', 'relic'),
  site('frontier-drowned-court', 'frontier-reed-marsh', 'ruin',
    l('침수된 돌정원', 'Drowned Stone Court', '水没した石庭'),
    l('진흙 아래 잠긴 돌기둥과 계단이 검은 물길을 잇는다.', 'Sunken pillars and stairs connect dark channels beneath the mud.', '泥の下に沈んだ石柱と階段が暗い水路をつなぐ。'),
    l('침수 회랑', 'Flooded Gallery', '水浸しの回廊'), l('갈라진 둑', 'Fractured Dike', '割れた堤'), l('물밑 제단', 'Submerged Altar', '水底の祭壇'), 'monster-marsh-wisp', 'monster-hydra', 'relic'),
  site('frontier-sand-observatory', 'frontier-amber-dunes', 'ruin',
    l('모래속 관측유적', 'Sandburied Observatory', '砂中の観測遺跡'),
    l('바람이 파낸 입구 너머에 낯선 하늘을 새긴 원형 방이 남아 있다.', 'A wind-scoured entrance leads to round chambers etched with an unfamiliar sky.', '風が掘り出した入口の先に、見知らぬ空を刻んだ円形の部屋が残る。'),
    l('별자국 회랑', 'Star-Traced Gallery', '星跡の回廊'), l('모래추 방', 'Sandweight Chamber', '砂錘の間'), l('관측의 중심', 'Observation Heart', '観測の中心'), 'monster-basilisk', 'monster-ancient-wight', 'relic'),
  site('frontier-broken-aqueduct', 'frontier-shattered-tableland', 'ruin',
    l('끊어진 수로유적', 'Severed Aqueduct', '途切れた水路遺跡'),
    l('갈라진 대지 아래 오래된 물길과 닫힌 수문이 남아 있다.', 'Ancient channels and closed sluices remain beneath the fractured tableland.', '砕けた台地の下に古い水路と閉ざされた水門が残る。'),
    l('마른 물길', 'Dry Watercourse', '乾いた水路'), l('기울어진 수문', 'Tilted Sluice', '傾いた水門'), l('물길의 봉인', 'Waterway Seal', '水路の封印'), 'monster-ruin-stone-sentinel', 'monster-greater-chimera', 'relic'),
  site('frontier-prism-hollow', 'frontier-echo-caverns', 'cave',
    l('일곱빛 공동', 'Prism Hollow', '七色の空洞'),
    l('물방울의 빛이 갈라지는 결정 동굴. 광맥 사이에 둥지가 감춰져 있다.', 'Droplet light splits across crystal caves, hiding a den among the veins.', '水滴の光が割れる結晶洞。鉱脈の間に巣が隠れる。'),
    l('결정 터널', 'Crystal Tunnel', '結晶の隧道'), l('부서진 암반', 'Shattered Shelf', '砕けた岩棚'), l('공동의 심장', 'Hollow Heart', '空洞の心臓'), 'monster-stone-troll', 'monster-stone-golem', 'crystal'),
  site('frontier-rime-warren', 'frontier-frost-basin', 'cave',
    l('얼음숨 굴', 'Rimebreath Warren', '氷息の巣穴'),
    l('눈 밑으로 이어진 얼음 통로. 벽을 스치는 차가운 숨결이 길을 숨긴다.', 'Ice passages run beneath the snow; cold breath along their walls conceals the way.', '雪の下に続く氷の通路。壁を掠める冷たい息が道を隠す。'),
    l('서리 터널', 'Rime Tunnel', '霜の隧道'), l('얇은 얼음바닥', 'Thin Ice Floor', '薄氷の床'), l('얼어붙은 깊은 굴', 'Frozen Deep Den', '凍った深い巣'), 'monster-ice-wolf', 'monster-grave-knight', 'crystal'),
  site('frontier-ember-tubes', 'frontier-cinder-caldera', 'cave',
    l('잔불 용암굴', 'Ember Lava Tubes', '残り火の溶岩洞'),
    l('식은 용암 아래 뜨거운 공기가 흐르는 굴. 벽의 결정은 아직 온기를 품는다.', 'Hot air flows beneath cooled lava; the wall crystals still hold warmth.', '冷えた溶岩の下を熱い空気が流れる。壁の結晶にはまだ温もりがある。'),
    l('용암 터널', 'Lava Tunnel', '溶岩の隧道'), l('증기 틈', 'Steam Fissure', '蒸気の裂け目'), l('열기의 심장', 'Heart of Heat', '熱の心臓'), 'monster-flame-lizard', 'monster-greater-chimera', 'gem'),
];

export const FANTASY_FRONTIER_SITE_DISCOVERY: Record<string, { location: string; hidden: true; chance: number; dc: number }> = Object.fromEntries(
  FANTASY_FRONTIER_DUNGEONS.map(site => [site.id, { location: site.location, hidden: true, chance: 0.35, dc: site.kind === 'ruin' ? 17 : 15 }]),
);
export const fantasyFrontierSitesAt = (location: string) => FANTASY_FRONTIER_DUNGEONS.filter(site => site.location === location);
