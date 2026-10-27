import type { FantasyCharacter, FantasyCheckContext } from './fantasy.ts';

type Names = Record<'ko' | 'en' | 'ja', string>;
export interface FantasyBodyTrait {
  id: string;
  names: Names;
  descriptions: Names;
  modifiers: Partial<Record<FantasyCheckContext, number>>;
}
const names = (ko: string, en: string, ja: string): Names => ({ ko, en, ja });
const trait = (id: string, label: Names, description: Names, modifiers: FantasyBodyTrait['modifiers']): FantasyBodyTrait => ({ id, names: label, descriptions: description, modifiers });

export const FANTASY_CONTEXT_NAMES: Record<FantasyCheckContext, Names> = {
  'narrow-space': names('좁은 틈 통과', 'Narrow passages', '狭い隙間'),
  trap: names('함정 대응', 'Traps', '罠への対処'),
  'deep-water': names('깊은 물', 'Deep water', '深い水'),
  'high-place': names('높은 발판', 'High ledges', '高い足場'),
  heat: names('고열 견디기', 'Intense heat', '高熱への耐性'),
  cold: names('추위 견디기', 'Intense cold', '寒さへの耐性'),
  'heavy-lifting': names('무거운 물체', 'Heavy loads', '重い物の扱い'),
  'keen-senses': names('감각으로 흔적 찾기', 'Finding subtle traces', '感覚で痕跡を探す'),
};

export const FANTASY_BODY_TRAITS: FantasyBodyTrait[] = [
  trait('surefooted', names('안정된 발굽', 'Sure hooves', '安定した蹄'), names('좁은 비탈과 높은 발판을 잘 딛지만 깊은 물에서는 불리하다.', 'Finds purchase on slopes and high ledges, but struggles in deep water.', '斜面や高い足場を踏めるが、深い水は苦手。'), { 'high-place': 3, trap: 1, 'deep-water': -1 }),
  trait('balanced', names('보통 체격', 'Balanced build', '標準的な体格'), names('특정 지형에 치우치지 않는 체격이다.', 'A build with no special terrain advantage.', '特定の地形に偏らない体格。'), {}),
  trait('small', names('작은 체구', 'Small stature', '小柄'), names('좁은 틈과 높은 발판에 유리하지만 무거운 짐에는 불리하다.', 'Fits narrow passages and ledges, but struggles with heavy loads.', '隙間や足場に有利だが、重い荷は苦手。'), { 'narrow-space': 3, 'high-place': 1, 'heavy-lifting': -2 }),
  trait('tiny', names('아주 작은 체구', 'Tiny stature', '極小の体'), names('틈과 함정에 유리하지만 큰 짐과 깊은 물에는 불리하다.', 'Suits gaps and traps, but struggles with heavy loads and deep water.', '隙間と罠に有利だが、大荷物と深い水は苦手。'), { 'narrow-space': 4, trap: 2, 'heavy-lifting': -4, 'deep-water': -2 }),
  trait('flexible', names('유연한 몸', 'Flexible body', '柔軟な体'), names('몸을 접어 틈을 지나고 함정을 피하기 쉽다.', 'Can bend through gaps and maneuver around traps.', '体を曲げて隙間を抜け、罠に対応しやすい。'), { 'narrow-space': 2, trap: 2 }),
  trait('light', names('가벼운 몸', 'Light frame', '軽い体'), names('불안한 발판과 함정에 유리하지만 힘으로 버티는 작업에 불리하다.', 'Handles ledges and traps, but is less suited to heavy work.', '足場や罠に有利だが、重い物を支えるのは苦手。'), { trap: 2, 'high-place': 1, 'heavy-lifting': -1 }),
  trait('winged', names('날개', 'Wings', '翼'), names('높은 발판을 안정적으로 건너지만 좁은 틈과 깊은 물에는 불리하다. 장거리 비행을 허용하지 않는다.', 'Helps on high ledges, but hinders in gaps and deep water. Does not unlock long-distance flight.', '高い足場に有利だが、隙間と深い水は苦手。長距離飛行は解禁しない。'), { 'high-place': 3, trap: 1, 'narrow-space': -1, 'deep-water': -2 }),
  trait('aquatic', names('수생 체질', 'Aquatic body', '水生の体'), names('깊은 물에 강하지만 강한 열에는 약하다. 바다 여행에는 이동수단이 필요하다.', 'Handles deep water but dislikes intense heat. Sea journeys still require transport.', '深い水に強いが、高熱は苦手。海の旅には交通手段が必要。'), { 'deep-water': 4, heat: -2 }),
  trait('heavy', names('무거운 몸', 'Heavy body', '重い体'), names('무거운 물체를 지탱하지만 틈·높은 발판·깊은 물에 불리하다.', 'Braces heavy loads, but struggles in gaps, high ledges and deep water.', '重い物を支えられるが、隙間・高所・深い水は苦手。'), { 'heavy-lifting': 3, 'narrow-space': -3, 'high-place': -2, 'deep-water': -3, trap: -1 }),
  trait('sturdy', names('단단한 체격', 'Sturdy build', '頑丈な体格'), names('무거운 작업과 추위를 잘 견디지만 순간적인 함정 대응이 둔하다.', 'Handles loads and cold, but reacts less readily to traps.', '重作業と寒さに強いが、とっさの罠対応は鈍い。'), { 'heavy-lifting': 2, cold: 1, trap: -1 }),
  trait('large', names('큰 체구', 'Large frame', '大きな体'), names('무거운 물체에 강하지만 좁은 틈과 함정에 불리하다.', 'Handles heavy loads, but struggles with tight gaps and traps.', '重い物に強いが、狭い隙間と罠は苦手。'), { 'heavy-lifting': 3, 'narrow-space': -3, trap: -1 }),
  trait('heatproof', names('열에 강한 몸', 'Heat-resistant body', '熱に強い体'), names('고열에 강하지만 추위에 약하다. 피해 면역은 아니다.', 'Handles heat but dislikes cold. Does not grant damage immunity.', '高熱に強いが寒さは苦手。被害を無効化しない。'), { heat: 4, cold: -2 }),
  trait('coldproof', names('추위에 강한 몸', 'Cold-resistant body', '寒さに強い体'), names('추위에 강하지만 고열에 약하다. 피해 면역은 아니다.', 'Handles cold but dislikes heat. Does not grant damage immunity.', '寒さに強いが高熱は苦手。被害を無効化しない。'), { cold: 4, heat: -2 }),
  trait('keen', names('예민한 감각', 'Keen senses', '鋭い感覚'), names('미세한 흔적과 함정의 징후를 찾기 쉽다.', 'Picks up subtle traces and signs of traps.', '小さな痕跡や罠の兆候を見つけやすい。'), { 'keen-senses': 3, trap: 1 }),
  trait('ethereal', names('희미한 형체', 'Ethereal form', '希薄な姿'), names('틈과 물속 움직임에 유리하지만 무거운 물체를 다루기 어렵다. 벽을 통과하지 않는다.', 'Moves readily in gaps and water, but struggles with heavy loads. Cannot pass through walls.', '隙間や水中の動きに有利だが重い物は苦手。壁を通り抜けない。'), { 'narrow-space': 3, 'deep-water': 2, trap: 1, 'heavy-lifting': -3 }),
];

export const FANTASY_RACE_BODY_TRAITS: Record<string, string[]> = {
  human: ['balanced'], elf: ['light', 'keen'], dwarf: ['small', 'sturdy'], orc: ['large', 'sturdy'], halfling: ['small', 'light'],
  foxkin: ['flexible', 'keen'], tideborn: ['aquatic'], dragonblood: ['large', 'heatproof'], starfairy: ['tiny', 'winged'], dryad: ['sturdy', 'keen'],
  stoneborn: ['heavy', 'sturdy'], moonshadow: ['light', 'keen'], wolfkin: ['keen', 'sturdy'], catkin: ['flexible', 'light', 'keen'],
  rabbitkin: ['small', 'keen'], bearkin: ['large', 'sturdy'], birdkin: ['winged', 'keen'], lizardkin: ['flexible', 'heatproof'],
  'high-elf': ['light', 'keen'], 'dark-elf': ['flexible', 'keen'], 'snow-elf': ['light', 'coldproof'], 'hill-dwarf': ['small', 'sturdy'], 'deep-dwarf': ['small', 'sturdy', 'keen'],
  'vampire-night': ['flexible', 'keen'], 'vampire-crimson': ['sturdy', 'keen'], 'vampire-moon': ['light', 'keen'],
  'frost-dragonkin': ['large', 'coldproof'], 'storm-dragonkin': ['large', 'keen'], 'fire-spirit': ['heatproof', 'light'], 'water-spirit': ['aquatic', 'flexible'],
  'flower-fairy': ['tiny', 'winged'], 'clockwork-golem': ['heavy', 'sturdy'], gnome: ['small', 'keen'], goblin: ['small', 'flexible'], hobgoblin: ['sturdy'],
  coralborn: ['aquatic', 'sturdy'], celestial: ['winged', 'keen'], devilkin: ['flexible', 'heatproof'], revenant: ['ethereal', 'coldproof'],
  demigod: ['sturdy', 'keen'], 'true-dragon': ['large', 'winged', 'heatproof'], 'elder-dragon': ['large', 'winged', 'heatproof', 'keen'],
  archangel: ['winged', 'keen'], archdemon: ['large', 'winged', 'heatproof'], phoenix: ['winged', 'heatproof', 'light'], voidborn: ['ethereal', 'keen'],
  deerkin: ['light', 'keen'], goatkin: ['sturdy', 'keen', 'surefooted'], batkin: ['winged', 'keen', 'light'],
  windspirit: ['ethereal', 'light'], frostfairy: ['tiny', 'winged', 'coldproof'],
};

export function fantasyBodyTraits(character: Pick<FantasyCharacter, 'race'>): FantasyBodyTrait[] {
  const ids = Object.hasOwn(FANTASY_RACE_BODY_TRAITS, character.race) ? FANTASY_RACE_BODY_TRAITS[character.race] : [];
  return ids.flatMap(id => FANTASY_BODY_TRAITS.filter(entry => entry.id === id));
}
export function fantasyContextBonus(character: Pick<FantasyCharacter, 'race'>, context: FantasyCheckContext): number {
  if (!Object.hasOwn(FANTASY_CONTEXT_NAMES, context)) return 0;
  return Math.max(-5, Math.min(5, fantasyBodyTraits(character).reduce((total, entry) => total + (entry.modifiers[context] ?? 0), 0)));
}
