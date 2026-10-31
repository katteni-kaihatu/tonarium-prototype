import { FANTASY_FRONTIER_BASE, FANTASY_FRONTIER_DUNGEONS } from './fantasy-frontier-data.ts';
import { FANTASY_FRONTIER_SUPPLIES } from './fantasy-expedition.ts';
import { fantasyPriestGrowthStatus } from './fantasy-priest-growth.ts';
import { FANTASY_RETREAT_MAPS, isFantasyRetreat } from './fantasy-retreats.ts';
import { FANTASY_GUILD_CAMP_SUPPLIES } from './fantasy-outdoor-cooking-catalog.ts';
import { FANTASY_MIRACLES } from './fantasy-miracle-catalog.ts';
import type { FantasyCharacter, FantasyRecipe } from './fantasy.ts';
import { FANTASY_ITEMS, FANTASY_JOBS, FANTASY_LOCATIONS, FANTASY_ROUTES } from './fantasy-data.ts';
import { FANTASY_DUNGEONS } from './fantasy-dungeon-catalog.ts';
import { NPC_PUBLIC, type NpcId, type NpcLocale } from './npc.ts';
import { FANTASY_FINAL_ISLE_ID, fantasyIsleAccess, fantasyIsleLocationVisible } from './fantasy-isle-access.ts';
import { FANTASY_RUNE_BOOK_HOLDINGS } from './fantasy-rune-books.ts';
import { fantasyHasJob, fantasyIsLifeJob, fantasyLifeJob } from './fantasy-careers.ts';

export type FantasyBuildingId = 'market' | 'merchantGuild' | 'blacksmith' | 'alchemist' | 'tower' | 'inn' | 'restaurant' | 'library' | 'guild' | 'shipyard' | 'temple' | 'archaeology';
export interface FantasyBuilding {
  id: FantasyBuildingId;
  name: Record<NpcLocale, string>;
  npcIds: NpcId[];
}

const NAMES: Record<FantasyBuildingId, Record<NpcLocale, string>> = {
  market: { ko: '시장', en: 'Market', ja: '市場' },
  merchantGuild: { ko: '상인 길드', en: 'Merchant guild', ja: '商人ギルド' },
  blacksmith: { ko: '대장간', en: 'Smithy', ja: '鍛冶屋' },
  alchemist: { ko: '연금술 공방', en: 'Alchemy workshop', ja: '錬金工房' },
  tower: { ko: '마법사의 탑', en: 'Mage tower', ja: '魔術師の塔' },
  inn: { ko: '여관', en: 'Inn', ja: '宿屋' },
  restaurant: { ko: '식당', en: 'Restaurant', ja: '食堂' },
  library: { ko: '도서관', en: 'Library', ja: '図書館' },
  guild: { ko: '길드', en: 'Guild', ja: 'ギルド' },
  shipyard: { ko: '조선소', en: 'Shipyard', ja: '造船所' },
  temple: { ko: '새벽 신전', en: 'Dawn temple', ja: '夜明けの神殿' },
  archaeology: { ko: '고고학 연구소', en: 'Archaeology house', ja: '考古学研究所' },
};

export interface FantasySettlement {
  kind: 'city' | 'port' | 'village' | 'tower';
  buildingIds: FantasyBuildingId[];
  libraryBookIds: string[];
}

export const FANTASY_SETTLEMENTS: Record<string, FantasySettlement> = {
  hearth: { kind: 'city', buildingIds: ['market', 'inn', 'restaurant', 'guild', 'library', 'temple'], libraryBookIds: ['traveler-guide', 'trades-handbook', 'lantern-fox', 'tin-pot-king', 'quiet-sword', 'mana-primer', 'one-hundred-spoons', 'small-balcony-garden'] },
  emberhall: { kind: 'city', buildingIds: ['market', 'blacksmith', 'inn', 'guild', 'merchantGuild'], libraryBookIds: [] },
  suncourt: { kind: 'city', buildingIds: ['market', 'restaurant', 'inn', 'guild', 'library', 'temple', 'archaeology', 'merchantGuild'], libraryBookIds: ['traveler-guide', 'pantry-guide', 'quiet-sword', 'staff-and-footwork', 'tin-pot-king', 'argument-of-hats', 'caravan-ledger'] },
  tidehaven: { kind: 'port', buildingIds: ['market', 'inn', 'shipyard'], libraryBookIds: [] },
  dawnport: { kind: 'port', buildingIds: ['market', 'shipyard', 'inn'], libraryBookIds: [] },
  mooncity: { kind: 'city', buildingIds: ['library', 'alchemist', 'inn', 'temple', 'archaeology', 'tower'], libraryBookIds: ['traveler-guide', 'archive-records', 'borrowed-shadow', 'mender-notes', 'mana-primer', 'mana-shapes', 'weather-in-a-bottle'] },
  starspire: { kind: 'tower', buildingIds: ['tower', 'library'], libraryBookIds: ['traveler-guide', 'arts-handbook', 'gate-records', 'mana-primer', 'mana-shapes', 'weather-in-a-bottle', 'mirrorwake-voyage'] },
  sunmeadow: { kind: 'village', buildingIds: ['inn'], libraryBookIds: [] },
  'verdant-quay': { kind: 'port', buildingIds: ['market', 'inn', 'restaurant', 'shipyard', 'library'], libraryBookIds: ['traveler-guide', 'rain-tailor', 'sylvara-journal', 'harbor-signals', 'small-balcony-garden', 'lantern-fox'] },
  'loom-village': { kind: 'village', buildingIds: ['market', 'inn', 'guild', 'library', 'merchantGuild'], libraryBookIds: ['trades-handbook', 'rain-tailor', 'mender-notes', 'sylvara-journal', 'one-hundred-spoons'] },
  'saffron-port': { kind: 'port', buildingIds: ['market', 'inn', 'restaurant', 'shipyard', 'alchemist', 'tower'], libraryBookIds: [] },
  redweave: { kind: 'city', buildingIds: ['market', 'blacksmith', 'inn', 'guild', 'library', 'archaeology', 'merchantGuild'], libraryBookIds: ['traveler-guide', 'caravan-ledger', 'kazaran-journal', 'staff-and-footwork', 'argument-of-hats', 'mirrorwake-voyage'] },
  'inkstone-city': { kind: 'city', buildingIds: ['market', 'inn', 'guild', 'library', 'restaurant'], libraryBookIds: ['traveler-guide', 'archive-records', 'mana-primer', 'borrowed-shadow', 'mender-notes', 'words-and-promises'] },
  pinewatch: { kind: 'village', buildingIds: ['market', 'inn', 'alchemist', 'tower'], libraryBookIds: [] },
  reedcross: { kind: 'village', buildingIds: ['market', 'inn', 'restaurant'], libraryBookIds: [] },
  'canopy-hall': { kind: 'city', buildingIds: ['market', 'inn', 'guild', 'library', 'restaurant'], libraryBookIds: ['traveler-guide', 'sylvara-journal', 'rain-tailor', 'wood-and-hide', 'cloth-and-thread', 'lantern-fox'] },
  mossbrook: { kind: 'village', buildingIds: ['market', 'inn', 'alchemist', 'tower'], libraryBookIds: [] },
  leafshade: { kind: 'village', buildingIds: ['market', 'inn', 'restaurant'], libraryBookIds: [] },
  sunloom: { kind: 'city', buildingIds: ['market', 'inn', 'guild', 'library', 'alchemist', 'merchantGuild', 'tower'], libraryBookIds: ['traveler-guide', 'kazaran-journal', 'caravan-ledger', 'weather-in-a-bottle', 'stone-and-flame', 'one-hundred-spoons'] },
  wellrest: { kind: 'village', buildingIds: ['market', 'inn', 'restaurant'], libraryBookIds: [] },
  rockshade: { kind: 'village', buildingIds: ['market', 'inn', 'blacksmith', 'guild'], libraryBookIds: [] },
};

export const FANTASY_LIBRARY_HOLDINGS: Record<string, string[]> = Object.fromEntries(FANTASY_LOCATIONS.map(location => [location.id,
  [...(FANTASY_SETTLEMENTS[location.id]?.libraryBookIds ?? [])],
]));

for (const miracle of FANTASY_MIRACLES) { const shelf = FANTASY_LIBRARY_HOLDINGS[miracle.library]; if (shelf && !shelf.includes(miracle.book)) shelf.push(miracle.book); }
FANTASY_LIBRARY_HOLDINGS['mooncity'].push('shadow-and-risk','remedies-and-rites','advanced-mana-forms');
FANTASY_LIBRARY_HOLDINGS['loom-village'].push('cloth-and-thread','green-and-grain');
FANTASY_LIBRARY_HOLDINGS['suncourt'].push('martial-practice','words-and-promises','remedies-and-rites');
FANTASY_LIBRARY_HOLDINGS['hearth'].push('martial-practice','field-signs','green-and-grain');
FANTASY_LIBRARY_HOLDINGS['verdant-quay'].push('wood-and-hide','field-signs');
FANTASY_LIBRARY_HOLDINGS['redweave'].push('wood-and-hide','cloth-and-thread','stone-and-flame','words-and-promises');
FANTASY_LIBRARY_HOLDINGS['starspire'].push('stone-and-flame','advanced-mana-forms');
for (const { id, library } of FANTASY_RUNE_BOOK_HOLDINGS) FANTASY_LIBRARY_HOLDINGS[library].push(id);

export function fantasyBuildings(character: Pick<FantasyCharacter, 'location'>): FantasyBuilding[] {
  const location = FANTASY_LOCATIONS.find(place => place.id === character.location);
  if (!location) return [];
  if (location.id === FANTASY_FRONTIER_BASE) return [{id:'market',name:{ko:'베이스캠프 보급소',en:'Base camp supplies',ja:'拠点の補給所'},npcIds:NPC_PUBLIC.filter(npc=>npc.homeLocation===location.id&&npc.building==='market').map(npc=>npc.id)}];
  return (FANTASY_SETTLEMENTS[location.id]?.buildingIds ?? []).map(id => ({
    id, name: id === 'temple' && character.location === 'mooncity' ? {ko:'계약의 사당',en:'Covenant shrine',ja:'契約の祠'} : { ...NAMES[id] }, npcIds: NPC_PUBLIC.filter(npc => npc.homeLocation === location.id && npc.building === id).map(npc => npc.id),
  }));
}

export const FANTASY_TEMPLE_READING = ['temple-vigil-liturgy','temple-pilgrimage-testimonies','temple-oath-commentary'];
export function fantasyTempleLibraryHoldings(c:FantasyCharacter):string[]{
  return c.job==='priest'&&fantasyPriestGrowthStatus(c).clergyGrade>=4&&fantasyBuildings(c).some(building=>building.id==='temple')?[...FANTASY_TEMPLE_READING]:[];
}

export function fantasyLibraryHoldings(character: Pick<FantasyCharacter, 'location'>): string[] {
  if (!fantasyBuildings(character).some(building => building.id === 'library')) return [];
  return [...(FANTASY_LIBRARY_HOLDINGS[character.location] ?? [])];
}

export interface FantasyMap {
  rare?: boolean;
  dungeon?: string;
  item: string;
  name: Record<NpcLocale, string>;
  description: Record<NpcLocale, string>;
  price: number;
  locationIds: string[];
  legacy?: boolean;
  soldAt?: string[];
}

const localMap = (id: string, ko: string, en: string, ja: string, locationIds: string[], soldAt: string[], price = 12): FantasyMap => ({
  item: `map-${id}`, name: { ko, en, ja }, locationIds, soldAt, price,
  description: { ko: '표시된 작은 지역의 길과 지형을 기록한 지도다.', en: 'A chart of the roads and terrain in a small district.', ja: '小さな一帯の道と地形を記した地図。' },
});

export const FANTASY_MAPS: FantasyMap[] = [...FANTASY_RETREAT_MAPS,
  ...FANTASY_DUNGEONS.filter(site=>!FANTASY_FRONTIER_DUNGEONS.some(hidden=>hidden.id===site.id)).map((site,index)=>({item:`map-dungeon-${site.id}`,rare:true,dungeon:site.id,name:{ko:`${site.names.ko} 탐사도`,en:`${site.names.en} survey chart`,ja:`${site.names.ja}の探索図`},description:{ko:'읽으면 해당 유적의 위치와 입구를 기록한다.',en:'Read to record the location and entrance.',ja:'読むと遺跡の位置と入口を記録する。'},price:80+index*15,locationIds:[site.location]})),
  {
    item: 'map-aurelia', legacy: true, name: { ko: '아우렐리아 옛 지도', en: 'Old Aurelia map', ja: 'アウレリアの古地図' }, price: 25,
    description: { ko: '사용하면 아우렐리아의 등록 지역을 지도에 표시한다.', en: 'Use to reveal charted locations in Aurelia.', ja: '使うとアウレリアの登録地域が地図に載る。' },
    locationIds: FANTASY_LOCATIONS.filter(place => place.land === 'aurelia').map(place => place.id),
  },
  {
    item: 'map-noctis', legacy: true, name: { ko: '노크티스 옛 지도', en: 'Old Noctis map', ja: 'ノクティスの古地図' }, price: 40,
    description: { ko: '사용하면 노크티스의 등록 지역을 지도에 표시한다.', en: 'Use to reveal charted locations in Noctis.', ja: '使うとノクティスの登録地域が地図に載る。' },
    locationIds: FANTASY_LOCATIONS.filter(place => place.land === 'noctis').map(place => place.id),
  },
  {
    item: 'map-islands', legacy: true, name: { ko: '옛 군도 항로도', en: 'Old island chart', ja: '群島の古い航路図' }, price: 35,
    description: { ko: '사용하면 바다의 등록된 특수 섬들을 지도에 표시한다.', en: 'Use to reveal the registered unusual islands.', ja: '使うと登録された特別な島が地図に載る。' },
    locationIds: FANTASY_LOCATIONS.filter(place => place.land === 'islands' && !['mirror-isle', FANTASY_FINAL_ISLE_ID].includes(place.id)).map(place => place.id),
  },
  localMap('hearth-fields', '하스 들녘 지도', 'Hearth fields chart', 'ハースの野辺地図', ['hearth','greenwood','sunmeadow'], ['hearth','suncourt']),
  localMap('whisper-road', '속삭임숲 옛길 지도', 'Whispergrove road chart', '囁きの森の古道図', ['greenwood','whispergrove','oldwatch'], ['hearth']),
  localMap('iron-mines', '철관 광산 지도', 'Ironridge mines chart', '鉄冠の鉱山図', ['ironridge','emberhall','deepcave'], ['emberhall','suncourt'], 18),
  localMap('south-reeds', '남부 갈대길 지도', 'Southern reedways chart', '南の葦道図', ['sunmeadow','reedfen','tidehaven'], ['hearth','tidehaven']),
  localMap('royal-road', '왕도와 별탑 길도', 'Court and star-road chart', '王都と星塔の道図', ['suncourt','oldwatch','starspire'], ['suncourt'], 18),
  localMap('moon-road', '루네리아 옛길 지도', 'Mooncity old roads', '月都の古道図', ['dawnport','mooncity','duskmire'], ['dawnport','mooncity']),
  localMap('glass-ash', '유리사막과 잿불길 지도', 'Glass and ash trails', '玻璃と燠火の道図', ['glassdesert','ashpeak','dawnport'], ['dawnport','mooncity'], 20),
  localMap('frost-vault', '흰안개 유적 지도', 'Frostpass ruins chart', '白霧の遺跡図', ['frostpass','eclipsevault','mooncity'], ['mooncity'], 22),
  localMap('coral-drift', '산호섬과 떠도는섬 항로도', 'Coral and drift passage', '珊瑚と浮島の航路図', ['glass-isle','drift-isle','tidehaven'], ['tidehaven','dawnport'], 20),
  localMap('mushroom-bells', '버섯섬과 천둥종 항로도', 'Mushroom and bell passage', '巨茸と雷鐘の航路図', ['mushroom-isle','storm-isle','echo-isle'], ['tidehaven','saffron-port'], 22),
  localMap('sylvara-coast', '실바라 해안 지도', 'Sylvara coast chart', 'シルヴァラの海岸図', ['verdant-quay','loom-village','rainvault'], ['verdant-quay','loom-village'], 16),
  localMap('roots-and-ferns', '뿌리울림과 고사리옛터 지도', 'Roots and ferns chart', '根響きと羊歯の地図', ['root-cavern','fern-sanctum','rainvault'], ['loom-village'], 22),
  localMap('kazaran-caravan', '카자란 상단길 지도', 'Kazaran caravan chart', 'カザランの隊商路図', ['saffron-port','redweave','windstep'], ['saffron-port','redweave'], 16),
  localMap('salt-and-cinder', '소금거울과 잿돌계단 지도', 'Salt and cinder chart', '塩鏡と灰段の地図', ['saltglass','cinder-stair','windstep'], ['redweave'], 22),
  localMap('mirror-waters', '거울물결 항로 단편', 'Mirrorwake passage fragment', '鏡波の航路断片', ['mirror-isle','drift-isle','verdant-quay'], ['verdant-quay','redweave'], 75),
  localMap('ink-and-reeds', '묵향과 갈대마을 길도', 'Ink and reed villages chart', '墨香と葦の里の道図', ['inkstone-city','pinewatch','reedcross'], ['dawnport','inkstone-city'], 18),
  localMap('canopy-villages', '수관과 빗숲마을 지도', 'Canopy villages chart', '樹冠と雨の里の地図', ['canopy-hall','mossbrook','leafshade'], ['verdant-quay','canopy-hall'], 18),
  localMap('caravan-springs', '햇실과 샘터 길도', 'Sunloom and springs chart', '陽織と泉の道図', ['sunloom','wellrest','rockshade'], ['saffron-port','sunloom'], 18),
];

export function fantasyBuildingStock(character: Pick<FantasyCharacter, 'location'>, buildingId: FantasyBuildingId): string[] {
  if (!fantasyBuildings(character).some(building => building.id === buildingId)) return [];
  if (character.location === FANTASY_FRONTIER_BASE) return buildingId === 'market' ? Object.keys(FANTASY_FRONTIER_SUPPLIES) : [];
  const maps = FANTASY_MAPS.filter(map => !map.legacy && (!map.soldAt || map.soldAt.includes(character.location))).map(map => map.item);
  const ordinary = () => FANTASY_ITEMS.filter(item => !item.craftOnly&&item.category!=='black-market-map'&&!item.id.startsWith('arcane-bag-')&&item.id!=='preserve-magic-bag'&&!['artifact', 'relic', 'elixir', 'magic-tool'].includes(item.category ?? '') && (item.tier ?? 1) <= 2);
  const categories = (...ids: string[]) => FANTASY_ITEMS.filter(item => ids.includes(item.category ?? '') && item.category !== 'artifact').map(item => item.id);
  const stock: Partial<Record<FantasyBuildingId, () => string[]>> = {
    market: () => [...ordinary().map(item => item.id),...FANTASY_ITEMS.filter(item=>item.id.startsWith('canvas-bag-')).map(item=>item.id), ...maps], shipyard: () => [...maps.filter(item=>!FANTASY_MAPS.find(map=>map.item===item)?.rare), ...categories('ship-material')],
    alchemist: () => [...categories('herb', 'potion', 'crystal'), ...(character.location === 'mooncity' ? categories('elixir') : [])],
    blacksmith: () => categories('ore', 'ingot', 'weapon', 'armor', 'accessory', 'gem'),
    tower: () => [...categories('magic-tool', 'crystal'), ...FANTASY_ITEMS.filter(item => item.wear&&(item.tier??1)>=3||item.id.startsWith('arcane-bag-')||item.id==='preserve-magic-bag'||item.id.startsWith('mp-potion-') || ['mana-staff', 'sacred-book'].includes(item.id)).map(item => item.id)],
    inn: () => ['meal', 'bread', 'jerky'], restaurant: () => ['meal', 'bread', 'jerky', ...categories('food')],
    guild: () => ['potion','jerky','wood','lantern','bedroll','fur-bedroll','camp-tarp','camp-stakes',...FANTASY_GUILD_CAMP_SUPPLIES,...FANTASY_ITEMS.filter(item=>item.category==='potion').map(item=>item.id)],
    archaeology: () => [],
  };
  const apexOnly = new Set(['elder-dragon-scale', 'ancient-frostheart', 'ancient-storm-sinew', 'void-chimera-prism', 'ember-oath-blade', 'tempest-longbow', 'frostheart-staff', 'dragon-scale-lamellar', 'void-woven-robe', 'oathscale-bulwark']);
  const items = new Map<string, typeof FANTASY_ITEMS[number]>();
  for (const item of FANTASY_ITEMS) if (!items.has(item.id)) items.set(item.id, item);
  const mapIds = new Set(FANTASY_MAPS.map(map => map.item));
  return [...new Set(stock[buildingId]?.() ?? [])].filter(id => !apexOnly.has(id) && items.get(id)?.category !== 'black-market-map' && (items.has(id) || mapIds.has(id)));
}

export function canBuyItem(character: Pick<FantasyCharacter, 'location'>, item: string): boolean {
  return fantasyBuildings(character).some(building => fantasyBuildingStock(character, building.id).includes(item));
}

export const canTradeItem = canBuyItem;

export function canSellItem(character: Pick<FantasyCharacter, 'location'>, itemId: string): boolean {
  const item = FANTASY_ITEMS.find(entry => entry.id === itemId);
  if(item?.category==='guild-loan')return false;
  const buildings = fantasyBuildings(character);
  if (item?.category === 'relic') return buildings.some(building => building.id === 'archaeology');
  if (item?.category === 'ship-material' && buildings.some(building => building.id === 'shipyard')) return true;
  if (item && buildings.some(building => building.id === 'tower') && fantasyBuildingStock(character, 'tower').includes(item.id)) return true;
  if (item) return buildings.some(building => ['market', 'blacksmith', 'alchemist', 'restaurant', 'archaeology'].includes(building.id));
  return FANTASY_MAPS.some(map => map.item === itemId) && buildings.some(building => ['market', 'shipyard'].includes(building.id));
}

export const NPC_TRAINABLE_JOBS: Record<NpcId, string[]> = {
  rin: ['merchant', 'cook'], borin: ['blacksmith'], eris: ['mage', 'alchemist'],
};

export function canAcquireJob(character: Pick<FantasyCharacter, 'location' | 'job'> & Partial<Pick<FantasyCharacter, 'lifeJob'>>, job: string, via: 'guild' | 'npc' | 'gm' = 'guild', npcId?: string): boolean {
  const target = FANTASY_JOBS.find(entry => entry.id === job);
  if (!target || target.category === 'none' || fantasyHasJob(character, target.id)) return false;
  if (target.id === 'priest' && !fantasyBuildings(character).some(building => building.id === 'temple')) return false;
  if (via === 'gm') return true;
  if (via === 'guild') return target.category === 'ordinary' && fantasyBuildings(character).some(building => building.id === 'guild');
  if (via !== 'npc') return false;
  const npc = NPC_PUBLIC.find(entry => entry.id === npcId);
  return !!npc && npc.homeLocation === character.location && (npc.trainableJobs ?? NPC_TRAINABLE_JOBS[npc.id] ?? []).includes(target.id)
    && (npc.building === 'residence' || fantasyBuildings(character).some(building => building.id === npc.building && building.npcIds.includes(npc.id)));
}

/** 借りられる共同作業場を使い、土地や船の所有を制作条件にしない。 */
export function fantasyCraftFacility(job: string): FantasyBuildingId | undefined {
  const facilities: Record<string, FantasyBuildingId> = {
    blacksmith: 'guild', cook: 'restaurant', alchemist: 'tower', priest: 'temple', mage: 'tower', hunter: 'restaurant',
    carpenter: 'guild', tailor: 'merchantGuild', weaver: 'merchantGuild', leatherworker: 'merchantGuild', gemcutter: 'merchantGuild',
    herbalist: 'market', farmer: 'market', fisher: 'market', merchant: 'market', baker: 'restaurant', potter: 'merchantGuild', shipwright: 'shipyard', scribe: 'guild',
  };
  return Object.hasOwn(facilities, job) ? facilities[job] : undefined;
}

/** 材料や鮮度は行動側が検証する。ここでは職業・共同設備・写図の既知情報を共通に判定する。 */
export function fantasyCanCraft(character: Pick<FantasyCharacter, 'job' | 'location' | 'visited' | 'charted'>&Partial<Pick<FantasyCharacter,'readBooks' | 'lifeJob'>>, recipe: FantasyRecipe, propertyWorkshop = false): boolean {
  if(recipe.requiresBook&&!character.readBooks?.includes(recipe.requiresBook)||recipe.requiresLocations?.some(id=>!character.visited.includes(id)&&!character.charted.includes(id)))return false;
  const job = fantasyIsLifeJob(recipe.job) ? fantasyLifeJob(character) : character.job;
  const facility = fantasyCraftFacility(recipe.job);
  if (recipe.job !== job || !facility || !propertyWorkshop && !fantasyBuildings(character).some(building => building.id === facility)) return false;
  const map = FANTASY_MAPS.find(map => map.item === recipe.output);
  if (map) return !map.legacy && map.locationIds.every(id => character.visited.includes(id) || character.charted.includes(id));
  return FANTASY_ITEMS.some(item => item.id === recipe.output);
}

export function fantasyKnownLocations(character: Pick<FantasyCharacter, 'visited' | 'charted'> & Partial<Pick<FantasyCharacter, 'completed' | 'seen'>>): string[] {
  const known = new Set([...(character.visited ?? []), ...(character.charted ?? []), ...(character.seen ?? [])]);
  if (fantasyIsleAccess(character)) known.add(FANTASY_FINAL_ISLE_ID);
  return FANTASY_LOCATIONS.filter(location => known.has(location.id) && (!isFantasyRetreat(location.id)||character.visited.includes(location.id)||character.charted.includes(location.id)) && fantasyIsleLocationVisible(character, location.id)).map(location => location.id);
}

export function fantasyFrontierLocations(character: Pick<FantasyCharacter, 'location'> & Partial<Pick<FantasyCharacter, 'completed' | 'visited' | 'charted'>>): string[] {
  const adjacent = new Set(FANTASY_ROUTES.filter(route => route.mode !== 'gate' && fantasyIsleLocationVisible(character, route.from) && fantasyIsleLocationVisible(character, route.to)).flatMap(route => route.from === character.location ? [route.to] : route.to === character.location ? [route.from] : []));
  adjacent.delete(character.location);
  return FANTASY_LOCATIONS.filter(location => adjacent.has(location.id)&&(!isFantasyRetreat(location.id)||character.visited?.includes(location.id)||character.charted?.includes(location.id))).map(location => location.id);
}
