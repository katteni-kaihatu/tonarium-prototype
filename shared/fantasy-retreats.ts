import type { FantasyItem, FantasyLocation, FantasyRoute } from './fantasy.ts';
import type { FantasyMap } from './fantasy-town.ts';
import type { NpcLocale } from './npc.ts';

type Localized = Record<NpcLocale, string>;
const l = (ko: string, en: string, ja: string): Localized => ({ ko, en, ja });
export interface FantasyRetreat {
  location: FantasyLocation;
  map: FantasyMap;
  sanctuary: true;
  moments: Localized;
  sceneKey?: string;
}
const markets = ['hearth', 'emberhall', 'suncourt', 'tidehaven'];
function retreat(id: string, x: number, y: number, kind: FantasyLocation['kind'], names: Localized, descriptions: Localized, moments: Localized, price: number): FantasyRetreat {
  const mapNames = l(`${names.ko} 휴양 지도`, `${names.en} retreat chart`, `${names.ja}の休養地図`);
  return {
    location: { id: `retreat-${id}`, name: names.ja, names, description: descriptions.ja, descriptions, region: 'アウレリアの休養地', land: 'aurelia', x, y, kind, danger: 0, resources: [], services: [] },
    map: { item: `retreat-map-${id}`, name: mapNames, description: l('읽으면 이 휴양지 한 곳의 위치만 표시한다. 도착하려면 길을 따라 여행해야 한다.', 'Read to chart this retreat alone. Follow the roads to reach it.', '読むとこの休養地一か所の位置だけが分かる。到着には道を通って旅する必要がある。'), price, rare: true, locationIds: [`retreat-${id}`], soldAt: [...markets] },
    sanctuary: true, moments, sceneKey: `fantasy.retreat.${id}`,
  };
}
export const FANTASY_RETREATS: FantasyRetreat[] = [
  retreat('dawnridge', 334, 164, 'mountain', l('새벽빛 능선', 'Dawnridge Overlook', '朝焼けの稜線'),
    l('완만한 산길 끝의 풀밭에서 겹겹이 이어진 산봉우리와 여명을 바라본다. 마물이 들어오지 않는 쉼터다.', 'A gentle mountain trail ends in a meadow above layered peaks and the dawn. Monsters never enter this refuge.', '緩やかな山道の先に、幾重もの峰と朝焼けを望む草地が広がる。魔物の入らない休息の場所。'),
    l('능선에 번지는 첫 햇살을 함께 바라보았다.', 'You watched the first light spread across the peaks together.', '峰々に広がる最初の光を、一緒に眺めた。'), 48),
  retreat('mirrorlake', 146, 292, 'forest', l('하늘거울 호숫가', 'Skyglass Lakeshore', '空映しの湖畔'),
    l('바람이 잦아들면 구름과 산 그림자가 호수에 겹친다. 마물의 걱정 없이 물가의 야영터에서 쉰다.', 'Clouds and mountain shadows meet on the still lake. Rest at the shore camp without fear of monsters.', '凪ぐと雲と山の影が湖面に重なる。魔物を気にせず、水辺の野営場で休める。'),
    l('호수의 잔물결을 보며 함께 이야기를 나누었다.', 'You shared stories while watching the ripples on the lake.', '湖のさざ波を眺めながら、一緒に語り合った。'), 45),
  retreat('cedarbend', 126, 383, 'forest', l('삼나무 물굽이', 'Cedarbend Glade', '杉のせせらぎ'),
    l('삼나무 사이의 작은 물굽이에 부드러운 이끼와 평탄한 야영터가 있다. 새소리만 들리는, 마물이 없는 숲이다.', 'A stream bends through cedars beside soft moss and level campsites. Birdsong fills this monster-free wood.', '杉の間を曲がる小川に、柔らかな苔と平らな野営地がある。鳥の声だけが響く、魔物のいない森。'),
    l('삼나무 향과 물소리를 함께 즐겼다.', 'You enjoyed cedar scents and the sound of running water together.', '杉の香りとせせらぎを一緒に楽しんだ。'), 42),
  retreat('cloudfalls', 389, 412, 'forest', l('구름실 폭포', 'Cloudthread Falls', '雲糸の滝'),
    l('하얀 물줄기가 햇빛 아래 무지개를 만들고 잔잔한 소로 흐른다. 마물이 없는 안전한 물가 쉼터다.', 'White falls weave rainbows in sunlight before flowing into a quiet pool. The waterside refuge is safe from monsters.', '白い水の筋が陽光の下で虹を結び、静かな淵へ流れる。魔物のいない安全な水辺の休養地。'),
    l('폭포의 작은 무지개를 찾고 물안개 너머의 별을 함께 기다렸다.', 'You found a rainbow in the falls and waited for stars beyond the mist.', '滝の小さな虹を見つけ、水煙の向こうの星を一緒に待った。'), 46),
];
export const FANTASY_RETREAT_LOCATIONS: FantasyLocation[] = FANTASY_RETREATS.map(retreat => retreat.location);
export const FANTASY_RETREAT_ROUTES: FantasyRoute[] = [
  { from: 'emberhall', to: 'retreat-dawnridge', mode: 'land', hours: 2 },
  { from: 'greenwood', to: 'retreat-mirrorlake', mode: 'land', hours: 1.5 },
  { from: 'sunmeadow', to: 'retreat-cedarbend', mode: 'land', hours: 1.5 },
  { from: 'suncourt', to: 'retreat-cloudfalls', mode: 'land', hours: 2 },
];
export const FANTASY_RETREAT_MAPS: FantasyMap[] = FANTASY_RETREATS.map(retreat => retreat.map);
export const FANTASY_RETREAT_ITEMS: FantasyItem[] = FANTASY_RETREAT_MAPS.map(map => ({ id: map.item, name: map.name.ja, names: map.name, price: map.price, description: map.description.ja, descriptions: map.description, category: 'map' }));
export const fantasyRetreatByLocation = (location: string): FantasyRetreat | undefined => FANTASY_RETREATS.find(retreat => retreat.location.id === location);
export const isFantasyRetreat = (location: string): boolean => !!fantasyRetreatByLocation(location);
const hash = (text: string): number => { let value = 2166136261; for (const ch of text) { value ^= ch.charCodeAt(0); value = Math.imul(value, 16777619); } return value >>> 0; };
export const FANTASY_RETREAT_MARKET_CHANCE = .08;
// Avalanche adjacent world-day seeds before taking a probability roll.
// Raw FNV prefixes leave long correlated runs around the 8% threshold.
function marketHash(seed: string): number {
  let value = hash(seed);
  value ^= value >>> 16; value = Math.imul(value, 0x85ebca6b);
  value ^= value >>> 13; value = Math.imul(value, 0xc2b2ae35);
  return (value ^ value >>> 16) >>> 0;
}
export function fantasyRetreatMarketStock(location: string, globalDay: number): { item: string; count: 1 }[] {
  if (!Number.isSafeInteger(globalDay) || globalDay < 0 || !markets.includes(location)) return [];
  if (marketHash(`retreat-stock:${location}:${globalDay}`) / 4294967296 >= FANTASY_RETREAT_MARKET_CHANCE) return [];
  return [{ item: FANTASY_RETREAT_MAPS[marketHash(`retreat-chart:${location}:${globalDay}`) % FANTASY_RETREAT_MAPS.length].item, count: 1 }];
}

export interface FantasyRetreatParticipant { kind: 'player' | 'companion'; key: string; name: string; generation?: number }
export interface FantasyRetreatCampSnapshot {
  sourceUserId: string;
  generation: number;
  characterName: string;
  location: string;
  startedAt: number;
  participants: FantasyRetreatParticipant[];
}
export interface FantasyRetreatMemory {
  id: string;
  generation: number;
  location: string;
  day: number;
  hour: number;
  characterName: string;
  companions: { kind: 'player' | 'companion'; name: string }[];
}
export const FANTASY_RETREAT_MEMORY_LIMIT = 64;
export const FANTASY_RETREAT_PARTICIPANT_LIMIT = 32;
const object = (value: unknown): value is Record<string, unknown> => !!value && typeof value === 'object' && !Array.isArray(value);
const text = (value: unknown): value is string => typeof value === 'string' && value.trim().length > 0 && value.length <= 160 && !/[\u0000-\u001f\u007f]/.test(value);
const integer = (value: unknown): value is number => Number.isSafeInteger(value) && Number(value) >= 1;
const hour = (value: unknown): value is number => typeof value === 'number' && Number.isFinite(value) && value >= 0;
const participant = (value: unknown): value is FantasyRetreatParticipant => object(value) && ['player', 'companion'].includes(String(value.kind)) && text(value.key) && text(value.name) && (value.kind === 'player' ? integer(value.generation) : value.generation === undefined || integer(value.generation));
const participantKey = (person: FantasyRetreatParticipant) => JSON.stringify([person.kind, person.key, person.generation ?? null]);
export function validFantasyRetreatCampSnapshot(value: unknown): value is FantasyRetreatCampSnapshot {
  return object(value) && text(value.sourceUserId) && integer(value.generation) && text(value.characterName) && typeof value.location === 'string' && isFantasyRetreat(value.location) && hour(value.startedAt)
    && Array.isArray(value.participants) && value.participants.length <= FANTASY_RETREAT_PARTICIPANT_LIMIT && value.participants.every(participant)
    && value.participants.every(person => person.kind !== 'player' || person.key !== value.sourceUserId)
    && new Set(value.participants.map(participantKey)).size === value.participants.length;
}
export function validFantasyRetreatMemory(value: unknown): value is FantasyRetreatMemory {
  return object(value) && typeof value.id === 'string' && /^retreat-memory-[a-z0-9-]+$/.test(value.id) && value.id.length <= 120 && integer(value.generation)
    && typeof value.location === 'string' && isFantasyRetreat(value.location) && Number.isSafeInteger(value.day) && Number(value.day) >= 0 && hour(value.hour) && text(value.characterName)
    && Array.isArray(value.companions) && value.companions.length >= 1 && value.companions.length <= FANTASY_RETREAT_PARTICIPANT_LIMIT
    && value.companions.every(person => object(person) && ['player', 'companion'].includes(String(person.kind)) && text(person.name));
}
// 同行者はサーバーが同じ場所・世代・活動状態を確認した一覧だけを渡す。
export function fantasyRetreatCampSnapshot(input: FantasyRetreatCampSnapshot): FantasyRetreatCampSnapshot | undefined {
  const participants = [...new Map(input.participants.filter(participant).filter(person => person.kind !== 'player' || person.key !== input.sourceUserId).map(person => [participantKey(person), { ...person, name: person.name.trim() }])).values()].slice(0, FANTASY_RETREAT_PARTICIPANT_LIMIT);
  const snapshot = { ...input, characterName: input.characterName.trim(), participants };
  return validFantasyRetreatCampSnapshot(snapshot) ? snapshot : undefined;
}
export interface FantasyRetreatCampCompletion {
  sourceUserId: string;
  generation: number;
  location: string;
  completedAt: number;
  successful: boolean;
  participants: readonly FantasyRetreatParticipant[];
}
export function fantasyCompleteRetreatCamp(existing: readonly FantasyRetreatMemory[], snapshot: FantasyRetreatCampSnapshot | undefined, completion: FantasyRetreatCampCompletion): FantasyRetreatMemory[] {
  const memories = existing.filter(validFantasyRetreatMemory).slice(-FANTASY_RETREAT_MEMORY_LIMIT);
  if (!snapshot || !validFantasyRetreatCampSnapshot(snapshot) || !completion.successful || completion.sourceUserId !== snapshot.sourceUserId || completion.generation !== snapshot.generation || completion.location !== snapshot.location || !hour(completion.completedAt) || completion.completedAt + 1e-8 < snapshot.startedAt + 8) return memories;
  const day = Math.floor(snapshot.startedAt / 24);
  if (memories.some(memory => memory.generation === snapshot.generation && memory.location === snapshot.location && memory.day === day)) return memories;
  const present = new Set(completion.participants.filter(participant).map(participantKey));
  const companions = snapshot.participants.filter(person => present.has(participantKey(person))).map(({ kind, name }) => ({ kind, name }));
  if (!companions.length) return memories;
  const id = `retreat-memory-${snapshot.generation}-${day}-${snapshot.location}-${hash(snapshot.sourceUserId).toString(36)}`;
  return [...memories, { id, generation: snapshot.generation, location: snapshot.location, day, hour: completion.completedAt, characterName: snapshot.characterName, companions }].slice(-FANTASY_RETREAT_MEMORY_LIMIT);
}
