import type { NpcLocale } from './npc.ts';
import { FANTASY_ITEMS, FANTASY_JOBS, FANTASY_LOCATIONS, FANTASY_RACES, FANTASY_RACE_FAMILIES } from './fantasy-data.ts';
import { FANTASY_MAPS } from './fantasy-town.ts';
import { fantasyBodyTraits } from './fantasy-physiology.ts';
import { FANTASY_CULTURES } from './fantasy-world-expansion.ts';

export const FANTASY_LORE_VERSION = '1.3.1';

export interface FantasyTerm {
  id: string;
  category: 'place' | 'race' | 'job' | 'item' | 'world';
  names: Record<NpcLocale, string>;
  aliases?: Record<NpcLocale, string[]>;
  summary: Record<NpcLocale, string>;
}

export interface FantasyCanonFact {
  id: string;
  topic: string;
  text: Record<NpcLocale, string>;
  termIds: string[];
}

type Translation = [ko: string, en: string, koSummary: string, enSummary: string, jaSummary?: string];

const places: Record<string, Translation> = {
  hearth: ['하스', 'Hearth', '시장·여관·식당·길드·도서관이 모인 출발 도시.', 'The starting city with a market, inn, restaurant, guild and library.', '市場、宿屋、食堂、ギルド、図書館がある出発の街。'],
  greenwood: ['푸른잎숲', 'Greenwood', '하스 근처에서 약초와 목재를 구하는 숲.', 'A forest near Hearth with herbs and timber.'],
  whispergrove: ['속삭임숲', 'Whispergrove', '나무꽃정령이 지키는 깊은 숲과 오래된 문.', 'A deep grove watched by bloom spirits, with an old gate.'],
  ironridge: ['철관산맥', 'Ironridge', '철광석과 보석 원석을 품은 북쪽 산맥.', 'Northern mountains with iron ore and rough gems.'],
  emberhall: ['엠버홀', 'Emberhall', '산드워프의 제련로와 공방이 있는 도시.', 'A forge city shaped by mountain dwarf workshops.'],
  deepcave: ['푸른수정동굴', 'Deepcave', '마정석·철광석·보석 원석이 있는 위험한 지하도.', 'Dangerous underground passages with mana crystals, ore and gems.'],
  sunmeadow: ['햇살목초지', 'Sunmeadow', '작은 농장과 목초지가 이어지는 채집 지역.', 'Pastures and small farms with useful wild plants.'],
  reedfen: ['은갈대습지', 'Silverreed Fen', '약초와 생선, 향신료를 얻는 남쪽 습지.', 'Southern wetlands with herbs, fish and spices.'],
  tidehaven: ['조수항', 'Tidehaven', '시장과 숙소가 있는 아우렐리아 남쪽 항구.', 'A southern Aurelia port with a market and inn.'],
  suncourt: ['솔네왕도', 'Suncourt', '궁정과 큰 시장, 장인 행사가 있는 왕도.', 'The royal city with a court, great market and artisan festivals.'],
  oldwatch: ['옛망루성', 'Oldwatch', '옛길을 지키던 성의 폐허와 기록 조각.', 'A ruined watch castle holding fragments of old records.'],
  starspire: ['별읽는탑', 'Starspire', '별과 잊힌 전이술을 연구하는 탑.', 'A tower studying stars and forgotten transfer arts.'],
  dawnport: ['아사기항', 'Dawnport', '별비단 무역으로 두 대륙을 잇는 동쪽 항구.', 'An eastern port linking the continents through trade in starsilk.'],
  mooncity: ['루네리아', 'Mooncity', '월영족의 서고와 연금술 공방, 여관이 있는 도시.', 'A city with Moonshadow archives, an alchemy workshop and an inn.', '月影族の書庫と錬金工房、宿屋がある都市。'],
  duskmire: ['황혼늪', 'Duskmire', '밤빛 약초와 마정석이 있는 안개 낀 늪.', 'A misty swamp with luminous herbs and mana crystals.'],
  glassdesert: ['유리사막', 'Glass Desert', '별빛을 비추는 모래 아래 옛 교역로가 묻힌 사막.', 'Glass-like dunes over buried ancient trade routes.'],
  ashpeak: ['잿불화산', 'Ashpeak', '용혈족이 지켜보는 활화산과 광물 지대.', 'An active volcanic mineral region watched by Dragonblood people.'],
  frostpass: ['흰안개고개', 'Frostpass', '옛 순례길이 눈 아래 이어지는 북쪽 고개.', 'A northern snowy pass over an old pilgrimage road.'],
  eclipsevault: ['월식지하궁', 'Eclipse Vault', '밤하늘 벽화와 잊힌 문이 있는 고대 지하궁.', 'An ancient underground palace with sky murals and a gate.'],
  'glass-isle': ['유리산호섬', 'Glasscoral Isle', '투명한 산호와 얕은 바다의 결정을 모으는 섬.', 'An island of clear coral and shallow-water crystals.'],
  'drift-isle': ['떠도는섬', 'Drift Isle', '비공정 계류탑과 전이문이 있는 공중의 섬.', 'A floating island with an airship mooring and gate.'],
  'mushroom-isle': ['거대버섯섬', 'Mushroom Isle', '집채만 한 버섯과 독특한 향신료가 있는 섬.', 'An island of house-sized mushrooms and unusual spices.'],
  'storm-isle': ['천둥종섬', 'Stormbell Isle', '폭풍을 알리는 종과 오래된 등대의 섬.', 'An island with a storm-warning bell and an old lighthouse.'],
  'echo-isle': ['메아리섬', 'Echo Isle', '노래가 멀리 울리고 여행자와 어부가 쉬는 섬.', 'An island where songs carry and travelers meet fishers.'],
};

const races: Record<string, Translation> = {
  human: ['인간', 'Human', '적응력이 좋고 모든 직업에 도전하는 종족.', 'Adaptable people able to pursue any profession.'],
  elf: ['숲엘프', 'Wood Elf', '숲과 친하며 민첩과 마력이 뛰어나지만 체력이 약하다.', 'Forest folk with agility and magic, but less endurance.'],
  dwarf: ['산드워프', 'Mountain Dwarf', '광물과 공예에 친하고 튼튼하지만 동작이 둔한 종족.', 'Sturdy mountain folk familiar with minerals and craft, but less agile.'],
  orc: ['오크', 'Orc', '힘과 체력이 높고 공동체를 돌보는 고원 종족.', 'Strong, hardy highland people who support their communities.'],
  halfling: ['소인족', 'Smallfolk', '작은 몸과 좋은 운, 빠른 발을 지닌 여행자들.', 'Small travelers with good fortune and quick feet.'],
  foxkin: ['여우수인', 'Foxkin', '귀와 꼬리, 날카로운 감각을 지닌 민첩한 종족.', 'Agile people with fox ears, tails and sharp senses.'],
  tideborn: ['해민', 'Tideborn', '바다와 육지 모두에서 살며 조류에 익숙한 종족.', 'People at home on land and sea, familiar with currents.'],
  dragonblood: ['용혈족', 'Dragonblood', '옅은 비늘과 뿔을 지닌 강인한 화산의 후예.', 'Strong volcanic descendants with light scales and horns.'],
  starfairy: ['별빛요정', 'Starfairy', '풍부한 마력과 연약한 몸을 지닌 작은 요정.', 'Small fairies with abundant mana and delicate bodies.'],
  dryad: ['나무꽃정령', 'Bloom Spirit', '이 세계에서는 여성의 모습으로 태어나는 나무의 정령.', 'Tree spirits who appear in female form in this setting.'],
  stoneborn: ['돌사람', 'Stoneborn', '성별이 없고 무겁고 튼튼한 몸을 지닌 돌의 종족.', 'Genderless stone people with heavy, durable bodies.'],
  moonshadow: ['달그림자족', 'Moonshadow', '노크티스의 밤과 고문자에 익숙한 섬세한 종족.', 'Delicate people familiar with Noctis nights and old writing.'],
};

const jobs: Record<string, Translation> = {
  adventurer: ['모험가', 'Adventurer', '길을 개척하고 구조·탐사 의뢰를 맡는다.', 'Explores new paths and takes rescue and investigation work.'],
  merchant: ['상인', 'Merchant', '물건과 소문을 운반하고 가격을 협상한다.', 'Carries goods and news and negotiates prices.'],
  blacksmith: ['대장장이', 'Blacksmith', '광석을 제련해 도구와 무기를 만든다.', 'Smelts ore and makes tools and weapons.'],
  cook: ['요리사', 'Cook', '각지의 재료로 사람을 먹이고 요리 의뢰를 맡는다.', 'Feeds people with regional ingredients and cooking commissions.'],
  alchemist: ['연금술사', 'Alchemist', '약초와 광물을 연구하고 약과 촉매를 조합한다.', 'Studies herbs and minerals to make remedies and catalysts.'],
  priest: ['사제', 'Priest', '신전에서 신을 섬기고 기도와 성법으로 사람들을 돌본다.', 'Serves a deity at a temple and cares for people through prayer and sacred arts.'],
  hunter: ['사냥꾼', 'Hunter', '흔적을 읽고 야생의 자원과 마을의 안전을 지킨다.', 'Reads tracks and protects wild resources and settlements.'],
  bard: ['음유시인', 'Bard', '노래와 기록된 이야기를 모아 사람들에게 전한다.', 'Collects songs and recorded stories and shares them.'],
  mage: ['마법사', 'Mage', '마력과 고대 문자를 연구한다.', 'Studies mana and ancient writing.'],
  leader: ['지도자', 'Leader', '분쟁을 중재하고 마을과 개척단의 일을 조율한다.', 'Mediates disputes and coordinates settlements and expeditions.'],
  unassigned: ['무직', 'Unaffiliated', '아직 직업을 정하지 않은 상태. 경험을 쌓고 직업을 알아볼 수 있다.', 'Not yet committed to a profession; free to gain experience and explore trades.'],
  thief: ['도둑', 'Thief', '은밀한 행동과 손기술을 쓰는 범죄 직업. 범행은 위험과 불이익을 따른다.', 'A criminal trade using stealth and deft hands, with risks and consequences.'],
  smuggler: ['밀수업자', 'Smuggler', '금지된 거래를 운반하는 범죄 직업. 거래에는 적발 위험이 있다.', 'A criminal trade carrying illicit goods, with the risk of discovery.'],
  assassin: ['암살자', 'Assassin', '은밀한 추적과 정밀한 행동을 익히는 범죄 직업.', 'A criminal trade trained in covert tracking and precise action.'],
  bandit: ['산적', 'Bandit', '위협과 힘에 의존하는 범죄 직업. 다른 이의 소유를 빼앗는 행동은 위험하다.', 'A criminal trade relying on force and threats, with risks for taking others’ property.'],
  spy: ['첩자', 'Spy', '위장과 관찰로 정보를 모으는 범죄 직업.', 'A criminal trade gathering information through disguise and observation.'],
  crimeboss: ['범죄조직 두목', 'Crime Boss', '조직과 암거래를 조율하는 범죄 직업.', 'A criminal trade coordinating an organization and illicit dealings.'],
};

const items: Record<string, Translation> = {
  herb: ['약초', 'Herb', '치료와 조합에 쓰는 향기로운 풀.', 'A fragrant plant used for remedies and mixtures.'],
  ore: ['철광석', 'Iron Ore', '제련해 철로 만드는 무거운 원광.', 'Heavy raw ore smelted into iron.'],
  wood: ['좋은 목재', 'Timber', '건축과 연료, 도구 자루에 쓰는 목재.', 'Wood for building, fuel and tool handles.'],
  fish: ['신선한 생선', 'Fresh Fish', '여행 요리의 재료가 되는 바다와 강의 식량.', 'Food from rivers and seas used in travel meals.'],
  crystal: ['마정석', 'Mana Crystal', '약한 마력을 저장하는 결정.', 'A crystal holding a small store of mana.'],
  relic: ['고대 유물', 'Ancient Relic', '연구와 복원에 쓰는 옛 생활의 흔적.', 'An object from past lives used for study and restoration.'],
  meal: ['여행자 정찬', 'Traveler Meal', '사용하면 HP와 MP를 회복하는 보존 요리.', 'A preserved meal that restores HP and MP when used.'],
  potion: ['회복약', 'Healing Potion', '사용하면 HP와 MP를 회복하는 조제 약.', 'A prepared remedy restoring HP and MP when used.'],
  ingot: ['철주괴', 'Iron Ingot', '도구와 무기 재료가 되는 제련된 철.', 'Refined iron used for tools and weapons.'],
  blade: ['손벼림검', 'Handforged Sword', '정성껏 벼린 검으로 납품하거나 판매할 수 있다.', 'A carefully forged sword for delivery or sale.'],
  spice: ['향신료', 'Spice', '음식과 거래에 쓰는 지역 특산품.', 'A regional product used in food and trade.'],
  silk: ['별비단', 'Starsilk', '옷과 의식에 쓰는 빛나는 직물.', 'A lustrous fabric used in clothing and ceremonies.'],
  antidote: ['정화 영약', 'Purifying Elixir', '사용하면 HP와 MP를 조금 회복하는 특별한 약.', 'A special preparation that restores a little HP and MP.'],
  gem: ['보석 원석', 'Rough Gem', '장식과 좋은 마법 촉매의 재료.', 'A raw stone used for ornaments and quality magical catalysts.'],
  meat: ['생고기', 'Raw Meat', '음식으로 쓰거나 조리할 수 있지만 쉽게 상하는 식재료.', 'A perishable ingredient that can be cooked or eaten as food.'],
  bread: ['빵', 'Bread', '여행 중 허기를 달래는 곡물 음식.', 'Grain-based food that eases hunger on a journey.'],
  jerky: ['육포', 'Jerky', '고기를 말려 오래 보관하기 좋게 만든 보존식.', 'Dried meat prepared for longer storage.'],
};

const worldTerms: FantasyTerm[] = [
  {"id":"passage-beyond-dawn","category":"world","names":{"ko":"새벽너머의 항로","en":"Passage Beyond Dawn","ja":"暁の向こうへの航路"},"summary":{"ko":"네 대륙의 항해 단서를 모아 소문의 섬으로 향하는 여정.","en":"A voyage following navigation clues across four continents toward a rumored island.","ja":"四大陸の航海の手掛かりを集め、噂の島を目指す旅。"}},
  {"id":"ironmask-fleet","category":"world","names":{"ko":"철가면 선단","en":"Ironmask Fleet","ja":"鉄仮面の船団"},"summary":{"ko":"새 항로의 독점권을 노리는 무장 선단에 관한 소문.","en":"Rumors describe an armed fleet seeking sole control of new routes.","ja":"新航路の独占を狙う武装船団についての噂。"}},
  {"id":"founder-aren","category":"world","names":{"ko":"아렌","en":"Aren","ja":"アレン"},"summary":{"ko":"서명과 다른 증거를 대조해야 신원을 알 수 있는 항해 기록 속 이름.","en":"A name in navigation records whose identity requires corroborating evidence.","ja":"署名と他の証拠の照合で身元を確かめる航海記録の名。"}},
  {"id":"founder-serin","category":"world","names":{"ko":"세린","en":"Serin","ja":"セリン"},"summary":{"ko":"서신과 보존 기록에 남은 이름. 확인한 자료만큼만 그 삶을 알 수 있다.","en":"A name preserved in letters and conservation records, known only through verified evidence.","ja":"手紙と保存記録に残る名。確かめた資料によってのみ、その生涯を知れる。"}},
  {"id":"founder-bato","category":"world","names":{"ko":"바토","en":"Bato","ja":"バト"},"summary":{"ko":"오래된 제작 표식과 서명에 등장하는 이름.","en":"A name appearing on old maker’s marks and signatures.","ja":"古い製作印と署名に現れる名。"}},
  {"id":"founder-yuan","category":"world","names":{"ko":"유안","en":"Yuan","ja":"ユアン"},"summary":{"ko":"보관된 편지와 항해 기록에 남아 있는 서명.","en":"A signature preserved in letters and navigation records.","ja":"保管された手紙と航海記録に残る署名。"}},
  { id: 'world-title', category: 'world', names: { ko: '기나긴 여정', en: 'The Long Journey', ja: '悠久の旅路' }, summary: { ko: '각자의 모험과 생활을 이어가는 이 세계의 이름.', en: 'A world of individual adventures and everyday lives.', ja: 'それぞれの冒険と暮らしが続く世界の名。' } },
  { id: 'aurelia', category: 'world', names: { ko: '아우렐리아', en: 'Aurelia', ja: 'アウレリア' }, summary: { ko: '하스와 솔네왕도, 엠버홀이 있는 서쪽의 큰 대륙.', en: 'The great western continent of Hearth, Suncourt and Emberhall.', ja: 'ハース、白日王都、エンバーホールがある西の大陸。' } },
  { id: 'noctis', category: 'world', names: { ko: '노크티스', en: 'Noctis', ja: 'ノクティス' }, summary: { ko: '루네리아·아사기항·묵향도시와 솔바람·갈대나루 마을을 옛길이 잇는 동쪽 대륙.', en: 'The eastern continent whose old roads link Mooncity, Dawnport, Inkstone City, Pinewatch and Reedcross.', ja: '月都、東岸港、墨香の街、松風と葦渡りの里を古道が結ぶ東の大陸。' } },
  { id: 'sylvara', category: 'world', names: { ko: '실바라', en: 'Sylvara', ja: 'シルヴァラ' }, summary: { ko: '푸른돛항과 수관도시, 물결베틀·이끼샘·잎그늘 마을이 있는 남서쪽 숲과 수로의 대륙.', en: 'The southwestern continent of forests and channels, home to Verdant Quay, Canopy Hall, Loomwater, Mossbrook and Leafshade.', ja: '緑帆港と樹冠の街、波織り・苔泉・葉陰の里がある森と水路の南西大陸。' } },
  { id: 'kazaran', category: 'world', names: { ko: '카자란', en: 'Kazaran', ja: 'カザラン' }, summary: { ko: '호박빛항·붉은직물도시·햇실도시와 샘쉼·바위그늘 마을을 상단이 잇는 남동쪽 대륙.', en: 'The southeastern continent whose caravans connect Amberwake Port, Redweave, Sunloom, Wellrest and Rockshade.', ja: '琥珀の港、赤織と陽織の街、泉憩いと岩陰の里を隊商が結ぶ南東大陸。' } },
  { id: 'starcross-sea', category: 'world', names: { ko: '별나루바다', en: 'Starcross Sea', ja: '星渡りの海' }, summary: { ko: '네 대륙과 여러 섬을 잇는 바다. 아직 지도에 없는 항로가 남아 있다.', en: 'The sea linking four continents and many islands, with routes still absent from charts.', ja: '四大陸と幾つもの島を結ぶ海。まだ地図にない航路が残る。' } },
  { id: 'gold', category: 'world', names: { ko: '금화', en: 'Gold', ja: '金貨' }, aliases: { ko: ['G'], en: ['G'], ja: ['G'] }, summary: { ko: 'G로 표기하는 게임 내 화폐. 실제 결제 금액이 아니다.', en: 'The in-game currency marked G, not a real-money payment.', ja: 'G と表すゲーム内通貨。実際の決済金額ではない。' } },
  { id: 'mana', category: 'world', names: { ko: '마나', en: 'Mana', ja: '魔力' }, aliases: { ko: ['MP'], en: ['MP'], ja: ['MP'] }, summary: { ko: '마법과 능동 기술에 쓰며 MP로 나타내는 힘.', en: 'Power used by magic and active skills, measured as MP.', ja: '魔法やアクティブスキルに使い、MP で表す力。' } },
  { id: 'calendar', category: 'world', names: { ko: '잔광력', en: 'Afterglow Calendar', ja: '残光暦' }, summary: { ko: '여러 대륙이 함께 쓰는 공통 달력. 이야기는 312년부터 흐른다.', en: 'A calendar shared across the continents. The story begins in year 312.', ja: '各大陸が共に使う暦。物語は312年から進む。' } },
  { id: 'guilds', category: 'world', names: { ko: '길드 연맹', en: 'Guild Compact', ja: 'ギルド連盟' }, summary: { ko: '직업 등록과 계약의 기본 관례를 공유하는 도시 길드들.', en: 'City guilds sharing common practices for professions and contracts.', ja: '職業登録と契約の基本慣習を共有する都市のギルド。' } },
  { id: 'dawn-deity', category: 'world', names: { ko: '새벽의 신', en: 'Dawn Deity', ja: '夜明けの神' }, summary: { ko: '하스와 솔네왕도의 새벽 신전이 기리는 신격의 호칭. 순례자 돌봄과 새 출발의 맹세를 중시한다.', en: 'The deity honored at the Dawn Temples of Hearth and Suncourt, associated with pilgrim care and vows of new beginnings.', ja: 'ハースと白日王都の夜明けの神殿が祀る神格の呼称。巡礼者の世話と新しい出発の誓いを重んじる。' } },
  { id: 'covenant-deity', category: 'world', names: { ko: '계약의 마신', en: 'Covenant Deity', ja: '契約の魔神' }, summary: { ko: '루네리아 계약의 사당이 기리는 신격의 호칭. 맹세의 기록과 계약 사본의 보존을 중시한다.', en: 'The deity honored at Mooncity’s covenant shrine, associated with recorded vows and the preservation of contract copies.', ja: '月都の契約の祠が祀る神格の呼称。誓いの記録と契約写本の保存を重んじる。' } },
];

const statLabels: Record<NpcLocale, Record<string, string>> = {
  ko: { hp: 'HP', mp: 'MP', strength: '힘', agility: '민첩', intelligence: '지능', luck: '운', vitality: '체력', dexterity: '손재주', charisma: '카리스마' },
  en: { hp: 'HP', mp: 'MP', strength: 'Strength', agility: 'Agility', intelligence: 'Intelligence', luck: 'Luck', vitality: 'Vitality', dexterity: 'Dexterity', charisma: 'Charisma' },
  ja: { hp: 'HP', mp: 'MP', strength: '力', agility: '敏捷', intelligence: '知力', luck: '運', vitality: '体力', dexterity: '手先', charisma: 'カリスマ' },
};

export const FANTASY_TERMS: FantasyTerm[] = [
  ...worldTerms,
  ...FANTASY_CULTURES.map((culture): FantasyTerm => ({ id: culture.id, category: 'world', names: culture.names, summary: culture.summary })),
  ...FANTASY_LOCATIONS.map((location): FantasyTerm => {
    const legacy = places[location.id];
    const names = location.names ?? { ko: legacy?.[0] ?? location.name, en: legacy?.[1] ?? location.name, ja: location.name };
    const summary = location.descriptions ?? { ko: legacy?.[2] ?? location.description, en: legacy?.[3] ?? location.description, ja: legacy?.[4] ?? location.description };
    return { id: location.id, category: 'place', names, summary };
  }),
  ...FANTASY_RACES.map((race): FantasyTerm => {
    const legacy = races[race.id];
    const names = race.names;
    const family = FANTASY_RACE_FAMILIES.find(entry => entry.id === race.family)!;
    const bodies = fantasyBodyTraits({ race: race.id });
    const modifiers = (locale: NpcLocale) => Object.entries(race.modifiers).filter(([, value]) => value !== 0)
      .map(([id, value]) => `${statLabels[locale][id] ?? id} ${value > 0 ? '+' : ''}${value}`).join(', ');
    const aliases = { ko: legacy && legacy[0] !== names.ko ? [legacy[0]] : [], en: legacy && legacy[1] !== names.en ? [legacy[1]] : [], ja: [] };
    return {
      id: race.id, category: 'race', names, ...(aliases.ko.length || aliases.en.length ? { aliases } : {}),
      summary: {
        ko: `${family.names.ko} 계열. ${race.descriptions?.ko ?? legacy?.[2] ?? '고유한 능력 보정과 기술을 가진 갈래.'} 능력 보정: ${modifiers('ko') || '없음'}. 신체 특성: ${bodies.map(body => body.names.ko).join(', ')}.`,
        en: `${family.names.en} lineage. ${race.descriptions?.en ?? legacy?.[3] ?? 'A lineage with its own attribute changes and skills.'} Attribute changes: ${modifiers('en') || 'none'}. Body traits: ${bodies.map(body => body.names.en).join(', ')}.`,
        ja: `${family.names.ja}系統。${race.description} 身体特性：${bodies.map(body => body.names.ja).join('・')}。`,
      },
    };
  }),
  ...FANTASY_JOBS.map((job): FantasyTerm => {
    const value = jobs[job.id];
    const names = (job as typeof job & { names?: Record<NpcLocale, string> }).names
      ?? { ko: value?.[0] ?? job.name, en: value?.[1] ?? job.name, ja: job.name };
    return { id: job.id, category: 'job', names, summary: job.descriptions ?? { ko: value?.[2] ?? '등록된 직업.', en: value?.[3] ?? 'A registered profession.', ja: job.description } };
  }),
  ...FANTASY_ITEMS.map((item): FantasyTerm => {
    const legacy = items[item.id];
    return { id: item.id, category: 'item', names: item.names ?? { ko: legacy?.[0] ?? item.name, en: legacy?.[1] ?? item.name, ja: item.name }, summary: item.descriptions ?? { ko: legacy?.[2] ?? item.description, en: legacy?.[3] ?? item.description, ja: legacy?.[4] ?? item.description } };
  }),
  ...FANTASY_MAPS.map((map): FantasyTerm => ({ id: map.item, category: 'item', names: map.name, summary: map.description })),
];

const fact = (id: string, topic: string, termIds: string[], ko: string, en: string, ja: string): FantasyCanonFact => ({ id, topic, termIds, text: { ko, en, ja } });

export const FANTASY_CANON_FACTS: FantasyCanonFact[] = [
  fact('priest-and-sacred-arts', 'profession', ['priest', 'mana', 'dawn-deity', 'covenant-deity'], '사제는 신전에서 신을 섬기며 기도와 봉사, 마나 흐름을 정돈하는 성법을 배운다. 새벽 신전과 계약 사당 모두 사제를 가르친다. 사제의 현재 기술은 자신의 피해 경감과 HP 회복이며, 성법이 모든 질병이나 저주를 무조건 없애지는 않는다.', 'Priests serve a deity at a temple and learn prayer, service and sacred arts that order mana. Both Dawn Temples and the covenant shrine train priests. Their current skills reduce their own incoming damage and restore their own HP; sacred arts do not automatically cure every illness or curse.', '司祭は神殿で神に仕え、祈りと奉仕、マナを整える聖法を学ぶ。夜明けの神殿と契約の祠のどちらでも司祭を教える。現在の技能は自分の被害軽減とHP回復であり、すべての病や呪いを無条件に消すものではない。'),
  fact('known-world', 'geography', ['world-title', 'aurelia', 'noctis', 'sylvara', 'kazaran', 'starcross-sea'], '아우렐리아·노크티스·실바라·카자란 네 대륙과 별나루바다의 섬들이 알려져 있다. 지도 밖의 항로는 항해 기록과 직접 탐사로 확인해야 한다.', 'Aurelia, Noctis, Sylvara, Kazaran and islands in the Starcross Sea are known. Routes beyond existing charts require navigation records and exploration.', 'アウレリア、ノクティス、シルヴァラ、カザランの四大陸と星渡りの海の島々が知られる。地図の外の航路は航海記録と探検で確かめる必要がある。'),
  fact('uncharted-isle-rumor', 'voyage', ['starcross-sea', 'oldwatch', 'calendar'], '안개 너머 소원을 이루어 준다는 섬의 이야기가 항구마다 다르게 전해진다. 믿을 만한 항로와 섬의 정체는 아직 확인되지 않았다.', 'Harbors tell differing stories of an island beyond the mist that grants wishes. A reliable route and the island’s true nature have not yet been verified.', '霧の向こうで願いを叶える島の話が港ごとに異なって伝わる。確かな航路と島の正体はまだ確認されていない。'),
  fact("current-calendar", "calendar", ["calendar"], "이야기는 잔광력 312년부터 흐른다. 하루는 24시간이며 봄·여름·가을·겨울이 각각 15일씩 이어져 60일이 한 해다. 모든 참가자는 같은 서버 시계를 쓰며 실제 1분은 게임 30분, 게임 하루는 실제 48분이다. 시간 속도 설정은 없다.", "The story begins in Afterglow year 312. Days have 24 hours; spring, summer, autumn and winter each last 15 days, making a 60-day year. One server clock advances 30 game minutes per real minute; a game day takes 48 real minutes. The rate is fixed.", "物語は残光暦312年から進む。1日は24時間、春夏秋冬は各15日で1年60日。全員共通の時計は実時間1分でゲーム内30分進み、1日は実時間48分。速度は固定。"),
  fact('harbor-compact', 'history', ['calendar', 'guilds', 'hearth', 'tidehaven', 'dawnport'], '잔광력 87년, 하스·조수항·아사기항의 상인과 장인들은 계약 표기와 물품 확인 관례를 맞췄다. 이 협약이 오늘날 길드 연맹의 기초가 되었다.', 'In Afterglow 87, merchants and artisans of Hearth, Tidehaven and Dawnport agreed common contract and goods-checking practices, forming the basis of the Guild Compact.', '残光暦87年、ハース、潮待ち港、東岸港の商人と職人は契約表記と検品の慣習を揃えた。これがギルド連盟の基礎になった。'),
  fact('gate-restoration', 'history', ['calendar', 'starspire', 'mooncity', 'eclipsevault'], '잔광력 276년에 별읽는탑과 루네리아의 연구자들이 일부 전이문을 다시 연결했다. 문을 처음 만든 이들의 정체는 아직 확인되지 않았다.', 'In Afterglow 276, researchers of Starspire and Mooncity reconnected some gates. The identity of the original gate builders remains unconfirmed.', '残光暦276年、星詠みの塔と月都の研究者が一部の転移門を再接続した。最初に門を造った者の正体は未確認。'),
  fact('currency-g', 'economy', ['gold', 'merchant', 'spice', 'silk'], '금화의 표기는 G이며 임금·물건값·운임은 게임 내 금화로 계산한다. 향신료와 별비단은 주요 교역품이다. 실제 결제나 현실 화폐 교환 기능은 없다.', 'Wages, prices and fares use in-game gold marked G. Spice and starsilk are common trade goods. There is no real-money payment or currency exchange feature.', '賃金、品物、運賃は G 表記のゲーム内金貨で計算する。香辛料と星絹は主な交易品。実際の決済や現実通貨との交換機能はない。'),
  fact('mana-and-crystals', 'magic', ['mana', 'crystal', 'mage', 'alchemist'], '마나는 MP로 나타내며 능동 기술에 소비한다. 마정석은 적은 마력을 품은 물질로 연구와 조합에 쓰인다. 마법은 비용과 한계가 있으며 NPC의 말만으로 자원을 무한히 만들 수 없다.', 'Mana is measured as MP and spent on active skills. Mana crystals hold limited power for study and mixtures. Magic has costs and limits; NPC words do not create unlimited resources.', '魔力は MP で表し、アクティブスキルで消費する。魔晶石は研究や調合に使う少量の魔力を宿す物質。魔法には費用と限界があり、NPC の発言で資源を無限に作れない。'),
  fact("life-and-rescue", "gameplay", ["hearth","priest","meal","potion"], "HP는 생명이고 체력은 별도의 능력치다. HP가 0이면 마을이나 인접한 안전지역에서는 NPC와 동료에게 구조될 수 있다. 오지·동굴·섬·바다에서는 구조가 닿지 않아 삶이 끝나며 새 캐릭터로 시작한다. 방문과 업적은 세계의 여행자 기록에 남는다.", "HP measures life; vitality is a separate attribute. At zero HP, NPCs or companions may rescue you in a settlement or nearby safe land. Remote areas, caves, islands and the sea can end your life permanently. A new character begins a new life, while visits and achievements remain in the world records.", "HPは生命で、体力は別の能力値。町や近くの安全な陸地ではHP0でもNPCや仲間に救助されることがある。僻地・洞窟・島・海では救助が届かず人生を終え、新しい人物として生き直す。訪問や実績は世界の旅人の記録に残る。"),
  fact('core-attributes', 'gameplay', ['human', 'mana', 'blacksmith', 'cook', 'leader'], '기본 능력은 HP·MP·힘·민첩·지능·운·체력이다. 직업에 따라 손재주나 카리스마가 추가된다. 성별 자체는 수치 보너스나 직업 제한을 만들지 않는다.', 'The base attributes are HP, MP, strength, agility, intelligence, luck and vitality. Professions may add dexterity or charisma. Gender itself adds no stat bonus or job restriction.', '基本能力は HP、MP、力、敏捷、知力、運、体力。職業で手先やカリスマが加わる。性別自体による数値補正や職業制限はない。'),
  fact('peoples-and-trades', 'culture', ['human', 'elf', 'dwarf', 'orc', 'dryad', 'stoneborn', 'guilds'], '종족은 큰 계열 아래 여러 갈래로 나뉘며 서로 다른 강점과 약점을 갖는다. 어느 종족도 선악이나 직업이 고정되어 있지 않다. 드라이어드는 여성, 바위 골렘은 성별 없음으로 태어나는 세계 설정이다.', 'Ancestries branch into several lineages with different strengths and weaknesses. No people has a fixed morality or profession. Dryads appear female and Stone Golems are genderless in this setting.', '種族は大きな系統から複数の枝に分かれ、それぞれ長所と短所を持つ。善悪や職業は固定されない。この世界の樹花の精は女性、石生まれは性別なしで生まれる。'),
  fact('guild-practice', 'culture', ['guilds', 'unassigned', 'merchant', 'blacksmith', 'cook', 'alchemist', 'leader'], '새 여행자는 무직으로 시작한다. 길드는 일반 직업을 가르치고 현지 스승이나 GM도 조건에 맞는 직업을 제안한다. 명시된 취득 버튼과 서버 검증으로 무료 학습을 시작하며 게임 1시간, 실제 2분 뒤 완료된다. 이전 직업 숙련은 남는다.', 'New travelers begin unaffiliated. Guilds teach ordinary trades; local mentors and the GM suggest eligible professions. An explicit acquisition button and server validation start free learning, completed after one game hour or two real minutes. Earlier proficiency remains.', '新しい旅人は無職で始まる。ギルドは一般職を教え、現地の師匠やGMも条件に合う職を提案する。取得ボタンとサーバー検証で無料の学習を始め、ゲーム内1時間・実時間2分後に完了する。以前の熟練は残る。'),
  fact('travel-network', 'travel', ['aurelia', 'noctis', 'starcross-sea', 'hearth', 'tidehaven', 'dawnport', 'drift-isle'], '육로는 도보와 마차, 항로는 정기선과 일을 돕는 배가 잇는다. 비공정은 레벨 3부터, 전이문은 문이 있는 거점끼리 이용한다. 이동은 공통 시계에 예약되며 시간이 끝나야 도착한다. 게임 1시간은 실제 2분이고 이동 버튼으로 세계 시간을 건너뛰지 않는다.', 'Roads support walking and carriages; sea routes support regular and working passage. Airships unlock at level 3, and gates connect gate-equipped hubs. Travel is scheduled on the shared clock and arrival occurs at completion. One game hour lasts two real minutes; travel does not skip world time.', '陸路は徒歩と馬車、航路は定期船と手伝い船が結ぶ。飛空艇はレベル3から、転移門は門のある拠点間で使える。移動は共通時計に予約され、終了時に到着する。ゲーム内1時間は実時間2分で、操作による時間の飛び越しはない。'),
  fact('sea-boundary', 'geography', ['starcross-sea', 'glass-isle', 'drift-isle', 'mushroom-isle', 'storm-isle', 'echo-isle', 'mirror-isle'], '별나루바다의 여섯 특수섬은 유리산호섬·떠도는섬·거대버섯섬·천둥종섬·메아리섬·거울물결섬이다. 떠도는섬에는 비공정 계류 시설이 있고 거울물결섬에는 관찰 항해자가 머문다. 해도 바깥은 미확인이다.', 'The six unusual islands are Glasscoral, Drift, Mushroom, Stormbell, Echo and Mirrorwake. Drift Isle has an airship mooring; visiting observers stop at Mirrorwake. Waters beyond the charts remain unconfirmed.', '既知の六島は硝子珊瑚島、漂泊の浮島、巨茸の島、雷鐘の島、こだまの小島、鏡波の島。漂泊の浮島には飛空艇の係留施設があり、鏡波には観測の航海者が立ち寄る。海図の外は未確認。'),
  fact('aurelia-cities', 'geography', ['aurelia', 'hearth', 'suncourt', 'emberhall'], '아우렐리아에서는 하스가 여행과 거래의 교차점, 솔네왕도가 궁정과 큰 시장, 엠버홀이 금속 공예의 중심이다. 왕과 왕조의 이름, 전쟁 연대기는 아직 정하지 않았다.', 'In Aurelia, Hearth is a crossroads, Suncourt hosts the royal court and great market, and Emberhall centers on metal craft. Ruler names, dynasties and war chronicles are not yet established.', 'アウレリアではハースが旅と交易の交差点、白日王都が宮廷と大市、エンバーホールが金属工芸の中心。王名、王朝、戦争年表はまだ定めていない。'),
  fact('noctis-cities', 'geography', ['noctis', 'mooncity', 'dawnport', 'glassdesert', 'moonshadow'], '노크티스에는 루네리아의 서고, 아사기항의 무역, 유리사막의 묻힌 옛길이 있다. 월영족은 밤에 익숙하지만 대륙 전체가 영원한 밤인 것은 아니다.', 'Noctis includes Mooncity archives, Dawnport trade and old routes buried in the Glass Desert. Moonshadow people know the night; the continent is not in eternal darkness.', 'ノクティスには月都の書庫、東岸港の交易、玻璃砂漠に埋もれた古道がある。月影族は夜に慣れているが、大陸全体が永遠の夜ではない。'),
  fact('contracts-and-law', 'culture', ['guilds', 'gold', 'merchant', 'leader', 'thief', 'smuggler', 'assassin', 'bandit', 'spy', 'crimeboss'], '길드 도시에서는 소유와 약속을 존중하고 물품 인도와 계약을 기록한다. 관청은 실제 피해와 증언에 따라 수배·자수·체포·심리·재심·배상·구금·석방을 다루며 부동산에는 세금이 따른다. 여행자 사이의 약탈은 허용된 장소에서 서로 위험을 감수하기로 한 경우의 소액 금화에 한한다. 뒷세계의 여섯 직업이 존재하지만 직업 자체를 유죄의 근거로 삼지는 않는다.', 'Guild cities respect property and promises and record deliveries and contracts. Civic offices handle warrants, surrender, arrest, hearings, appeals, restitution, detention and release on the evidence of actual harm and testimony; property carries taxes. Robbery between travelers is limited to small sums of gold where it is permitted and both have accepted the risk. Six underworld professions exist, but a profession alone is not evidence of guilt.', 'ギルド都市は所有と約束を尊重し、納品と契約を記録する。役所は実際の被害と証言に基づき、手配・出頭・逮捕・審理・再審・賠償・拘禁・釈放を扱い、不動産には税がかかる。旅人同士の略奪は、認められた場所で双方が危険を引き受けた場合の少額の金貨に限られる。裏社会には六つの職業があるが、職業だけで有罪とはしない。'),
  fact('archives-and-evidence', 'knowledge', ['starspire', 'mooncity', 'oldwatch', 'relic'], '기록관은 검증된 기록과 소문을 구분한다. 서신의 서명·현장의 표식·독립적인 기록이 서로 맞을 때 그 증거가 뒷받침하는 사실을 확인한다.', 'Archivists distinguish verified records from rumor. Matching signatures, field marks and independent records support the facts they can actually establish.', '記録係は確かな記録と噂を区別する。手紙の署名、現地の印、独立した記録が一致すれば、その証拠に裏付けられる事実を確かめる。'),
  fact('canon-authority', 'knowledge', ['world-title', 'guilds'], '확정 설정은 이 설정집과 등록 데이터가 정한다. NPC는 자신에게 허용된 공개 정보만 말하고, 소문은 소문이라고 밝히며, 모르는 내용은 모른다고 답한다. AI에게 새 공식 설정이나 플레이어의 성취를 확정할 권한은 없다.', 'Canon comes from this bible and registered data. NPCs use only their permitted public knowledge, label rumors and admit unknowns. AI cannot establish new canon or player achievements.', '公式設定は設定集と登録データで決める。NPC は許可された公開知識だけを使い、噂は噂と明示し、不明なことは不明と答える。AI は新しい公式設定やプレイヤーの実績を確定できない。'),
  fact('maps-and-knowledge', 'knowledge', ['map-aurelia', 'map-noctis', 'map-islands', 'guilds'], '지도는 방문한 지역과 구입한 지도를 사용해 기록한 지역만 보여 준다. 책에서 지명을 읽는 것만으로 지도는 열리지 않는다. 도시의 건물과 도서관의 소장 도서는 거점마다 다르다.', 'The map shows visited places and regions recorded by using purchased charts. Reading a place name does not reveal it. Buildings and library holdings differ by settlement.', '地図は訪問した場所と、購入した地図を使って記録した地域を示す。地名を読んだだけでは地図は開かない。建物と図書館の蔵書は拠点ごとに異なる。'),
  fact('food-and-rest', 'survival', ['meat', 'bread', 'jerky', 'meal', 'cook', 'hearth'], '식사와 휴식의 효과는 활동 완료 때 적용된다. 무료 야영은 회복이 적고 위험이 있다. 오프라인의 대기 상태에는 허기·피로가 추가되지 않지만 진행 중인 활동과 음식의 노화는 계속된다. 누구나 음식의 겉보기와 냄새를 보고 요리사는 감별 기술로 더 자세히 판단한다.', 'Meal and rest effects apply when the activity completes. Free camping restores less and carries risk. Offline idle time adds no hunger or fatigue, but pending activities and food aging continue. Anyone can inspect appearance and smell; a cook’s appraisal reveals more.', '食事と休息の効果は活動完了時に適用する。無料の野営は回復が少なく危険がある。オフラインの待機では空腹・疲労を増やさないが、進行中の活動と食品の経時変化は続く。誰でも見た目と匂いを確かめ、料理人は鑑定で詳しく判断する。'),
  fact('temples-and-vows', 'culture', ['dawn-deity', 'covenant-deity', 'hearth', 'suncourt', 'mooncity', 'demigod', 'celestial', 'archangel', 'devilkin', 'archdemon'], '하스·솔네왕도의 새벽 신전은 순례와 등불을 돌보고, 루네리아의 계약 사당은 맹세의 기록을 보존한다. 반신·천상족·대천사는 새벽 신전의 의뢰를, 마족·상위마족은 계약 사당의 전용 의뢰를 받을 수 있다.', 'The Dawn Temples of Hearth and Suncourt tend pilgrims and lamps; Mooncity’s covenant shrine preserves recorded vows. Demigods, Celestial Kin and Archangels have Dawn Temple contracts, while Devilkin and Archdemons have exclusive shrine contracts.', 'ハースと白日王都の夜明けの神殿は巡礼と灯を守り、月都の契約の祠は誓いの記録を保管する。半神・天の民・大天使には夜明けの神殿、魔の民・上位魔族には契約の祠の専用依頼がある。'),
  ...FANTASY_CULTURES.map((culture): FantasyCanonFact => ({ id: `${culture.id}-dress`, topic: 'culture', termIds: [culture.id, culture.land === 'islands' ? 'mirror-isle' : culture.land], text: { ko: `${culture.summary.ko} 복식: ${culture.clothing.ko} 관례: ${culture.customs.ko}`, en: `${culture.summary.en} Dress: ${culture.clothing.en} Custom: ${culture.customs.en}`, ja: `${culture.summary.ja} 服装：${culture.clothing.ja} 慣習：${culture.customs.ja}` } })),
  fact('mirrorwake-mystery', 'geography', ['mirror-isle', 'starcross-sea'], '거울물결섬의 잔잔한 만에서는 하늘이 겹쳐 보이고 수면 아래 빛의 고리가 관측된다. 현상은 확인되었지만 원인·제작자·고대 목적은 미확인이다. 시간 역행이나 다른 세계로 통하는 문이라는 이야기는 검증되지 않은 소문이다.', 'Mirrorwake’s still bay doubles the sky, and light rings have been observed beneath its surface. The phenomenon is recorded, but its cause, makers and ancient purpose are unknown. Tales of reversed time or passages to other worlds are unverified rumors.', '鏡波の凪いだ湾では空が重なり、水面下に光の輪が観測される。現象は確認済みだが原因、造り手、古い目的は不明。時間逆行や異世界への門という話は未検証の噂。'),
  fact("mana-training", "magic", ["mana","mage","aurelia","noctis","sylvara","kazaran"], "마나는 감응·순환·형태·방출을 익히는 경험으로 성장한다. 실제 활동에서 MP를 유효하게 쓸수록 숙련되며 대화나 기술 준비만으로 강해지지 않는다. 반복 활동은 성장량이 감소한다. 전사도 흐름을 몸에 돌려 힘·민첩·버팀을 잠시 강화할 수 있다.", "Mana develops through practical awareness, circulation, shaping and release. MP must have a real effect during activity to build proficiency; conversation and preparation alone do not train it. Repeated activity yields diminishing growth. Warriors can circulate mana to briefly reinforce strength, agility and endurance.", "マナは感応・循環・形成・放出を実践して育つ。実際の行動でMPが有効に働くと熟練し、会話や準備だけでは鍛えられない。反復は成長が減る。戦士も体内の流れで力・身軽さ・粘りを一時強化できる。"),
];

export function fantasyTermName(id: string, locale: NpcLocale): string {
  return FANTASY_TERMS.find(term => term.id === id)?.names[locale] ?? id;
}

export function fantasyCanonicalNames(locale: NpcLocale, ids: string[]): string[] {
  return ids.map(id => `${id}: ${fantasyTermName(id, locale)}`);
}

export function fantasyCanonFor(locale: NpcLocale, termIds: string[] = []): string[] {
  return FANTASY_CANON_FACTS.filter(entry => !termIds.length || entry.termIds.some(id => termIds.includes(id))).map(entry => entry.text[locale]);
}
