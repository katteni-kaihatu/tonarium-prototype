import type { FantasyCharacter, FantasyStats } from './fantasy.ts';
import type { FantasyBodyTrait } from './fantasy-physiology.ts';

const l = (ko: string, en: string, ja: string) => ({ ko, en, ja });
export interface FantasyDiverseBodyTrait extends FantasyBodyTrait { stats: Partial<FantasyStats> }
export const FANTASY_BODY_DIVERSITY_TRAITS: FantasyDiverseBodyTrait[] = [
  { id: 'overlapping-scales', names: l('겹비늘', 'Overlapping scales', '重なり合う鱗'), descriptions: l('HP +4, 체력 +1, 민첩 −1. 비늘은 열을 막지만 차가워지면 관절이 굳는다.', 'HP +4, vitality +1, agility −1. Scales turn heat, but cold stiffens their joints.', 'HP+4、体力+1、敏捷−1。鱗は熱を遮るが、冷えると関節が硬くなる。'), stats: { hp: 4, vitality: 1, agility: -1 }, modifiers: { heat: 1, cold: -1, 'narrow-space': -1 } },
  { id: 'hollow-bones', names: l('속 빈 뼈', 'Hollow bones', '中空の骨'), descriptions: l('HP −4, 민첩 +2, 힘 −1. 가벼운 골격은 높은 발판에 유리하고 무거운 짐에 약하다.', 'HP −4, agility +2, strength −1. A light skeleton suits high ledges but bears heavy loads poorly.', 'HP−4、敏捷+2、力−1。軽い骨格は高い足場に有利だが、重い荷は苦手。'), stats: { hp: -4, agility: 2, strength: -1 }, modifiers: { 'high-place': 2, 'heavy-lifting': -2 } },
  { id: 'balancing-tail', names: l('균형 꼬리', 'Balancing tail', '釣り合いの尾'), descriptions: l('민첩 +1, 손재주 +1, 힘 −1. 꼬리로 높은 곳에서 균형을 잡지만 좁은 틈에서는 걸리기 쉽다.', 'Agility +1, dexterity +1, strength −1. A tail steadies high steps but catches in narrow gaps.', '敏捷+1、手先+1、力−1。尾で高所の釣り合いを取れるが、狭い隙間で引っ掛かる。'), stats: { agility: 1, dexterity: 1, strength: -1 }, modifiers: { 'high-place': 2, 'narrow-space': -1 } },
  { id: 'webbed-limbs', names: l('물갈퀴 팔다리', 'Webbed limbs', '水かきのある手足'), descriptions: l('HP +2, 민첩 +1, 손재주 −1. 깊은 물을 헤치기 쉽지만 단단한 짐을 움켜쥐기 어렵다.', 'HP +2, agility +1, dexterity −1. Webbing drives through deep water but makes heavy grips awkward.', 'HP+2、敏捷+1、手先−1。深い水をかき分けやすいが、重い荷をつかみにくい。'), stats: { hp: 2, agility: 1, dexterity: -1 }, modifiers: { 'deep-water': 2, 'heavy-lifting': -1 } },
  { id: 'living-sapwood', names: l('살아 있는 목질', 'Living sapwood', '生きた木質'), descriptions: l('HP +5, 체력 +1, 민첩 −1. 목질은 추위를 견디지만 강한 열에 수액을 잃는다.', 'HP +5, vitality +1, agility −1. Living wood endures cold but loses its sap in intense heat.', 'HP+5、体力+1、敏捷−1。木質は寒さに耐えるが、高熱で樹液を失う。'), stats: { hp: 5, vitality: 1, agility: -1 }, modifiers: { cold: 1, heat: -2 } },
  { id: 'mineral-core', names: l('광물 심장', 'Mineral core', '鉱物の核'), descriptions: l('HP +6, 힘 +1, 민첩 −2, MP −3. 단단한 중심은 무거운 물체를 받치지만 물속과 높은 발판에서 불리하다.', 'HP +6, strength +1, agility −2, MP −3. A solid core braces loads but hinders movement in deep water and on high ledges.', 'HP+6、力+1、敏捷−2、MP−3。硬い核は重い物を支えるが、水中や高い足場で不利。'), stats: { hp: 6, strength: 1, agility: -2, mp: -3 }, modifiers: { 'heavy-lifting': 2, 'deep-water': -2, 'high-place': -1 } },
  { id: 'mana-woven', names: l('마력으로 짠 몸', 'Mana-woven body', '魔力で編まれた体'), descriptions: l('MP +6, 지능 +1, HP −5, 힘 −1. 마력의 흐름을 느끼지만 무거운 물체를 붙들기 어렵다.', 'MP +6, intelligence +1, HP −5, strength −1. This body senses mana currents but struggles to hold heavy objects.', 'MP+6、知力+1、HP−5、力−1。魔力の流れを感じ取るが、重い物を支えにくい。'), stats: { mp: 6, intelligence: 1, hp: -5, strength: -1 }, modifiers: { 'keen-senses': 1, 'heavy-lifting': -1 } },
  { id: 'insulating-fur', names: l('보온 털', 'Insulating fur', '保温する毛皮'), descriptions: l('HP +3, 체력 +1, 민첩 −1. 두터운 털은 추위를 막지만 열을 가둔다.', 'HP +3, vitality +1, agility −1. Thick fur keeps out cold but traps heat.', 'HP+3、体力+1、敏捷−1。厚い毛は寒さを防ぐが、熱がこもる。'), stats: { hp: 3, vitality: 1, agility: -1 }, modifiers: { cold: 2, heat: -2 } },
  { id: 'night-eyes', names: l('야행성 눈', 'Nocturnal eyes', '夜行の目'), descriptions: l('손재주 +1, HP −2. 섬세하고 큰 눈은 작은 흔적과 함정의 윤곽을 잘 찾는다.', 'Dexterity +1, HP −2. Large, delicate eyes pick out faint traces and the outlines of traps.', '手先+1、HP−2。大きく繊細な目で微かな痕跡や罠の輪郭を見分ける。'), stats: { dexterity: 1, hp: -2 }, modifiers: { 'keen-senses': 2, trap: 1 } },
  { id: 'split-hooves', names: l('갈라진 발굽', 'Split hooves', '割れた蹄'), descriptions: l('체력 +1, 손재주 −1. 바위 가장자리를 잘 딛지만 물속에서 균형을 잡기 어렵다.', 'Vitality +1, dexterity −1. Split hooves grip rocky edges but lose their footing in deep water.', '体力+1、手先−1。岩の縁を踏みやすいが、深い水では足元が不安定になる。'), stats: { vitality: 1, dexterity: -1 }, modifiers: { 'high-place': 2, 'deep-water': -1 } },
  { id: 'strong-hands', names: l('강한 손아귀', 'Strong hands', '強い握力'), descriptions: l('힘 +1, 손재주 −1. 짐을 붙드는 굵은 손가락은 좁은 장치에서 둔하다. 큰 체구도 있으면 붙잡아 으깨기를 익힌다.', 'Strength +1, dexterity −1. Thick fingers brace loads but struggle with tight mechanisms. A large frame also unlocks Grip Crush.', '力+1、手先−1。太い指で荷を支えるが細い仕掛けは苦手。大きな体なら握り潰しも学ぶ。'), stats: { strength: 1, dexterity: -1 }, modifiers: { 'heavy-lifting': 2, trap: -1 } },
  { id: 'flexible-joints', names: l('유연한 관절', 'Flexible joints', '柔軟な関節'), descriptions: l('민첩 +1, 체력 −1. 몸을 접어 틈과 함정을 지나지만 큰 하중에 약하다. 비틀어 치기를 익힌다.', 'Agility +1, vitality −1. Joints fold through gaps and traps but bear loads poorly. Unlocks Coiling Strike.', '敏捷+1、体力−1。関節を畳んで隙間や罠を抜けるが荷重に弱い。捻り打ちを学ぶ。'), stats: { agility: 1, vitality: -1 }, modifiers: { 'narrow-space': 2, trap: 1, 'heavy-lifting': -1 } },
  { id: 'spring-tendons', names: l('탄력 힘줄', 'Spring tendons', '弾む腱'), descriptions: l('민첩 +1, HP −2. 높은 발판으로 도약하지만 큰 짐을 든 채로 버티기 어렵다. 도약 차기를 익히며 자유 비행은 하지 못한다.', 'Agility +1, HP −2. Tendons spring onto ledges but brace loads poorly. Unlocks Spring Kick, without free flight.', '敏捷+1、HP−2。腱で高所へ跳ねるが大荷物を支えにくい。跳躍蹴りを学び、自由飛行はしない。'), stats: { agility: 1, hp: -2 }, modifiers: { 'high-place': 2, 'heavy-lifting': -1 } },
  { id: 'gripping-digits', names: l('붙드는 손발가락', 'Gripping digits', '掴む指趾'), descriptions: l('손재주 +1, 힘 −1. 가는 발판을 감아 쥐지만 깊은 물을 젓기에는 불리하다.', 'Dexterity +1, strength −1. Curved digits grip thin ledges but paddle poorly in deep water.', '手先+1、力−1。細い足場を掴む指だが深水をかくのは苦手。'), stats: { dexterity: 1, strength: -1 }, modifiers: { 'high-place': 2, 'deep-water': -1 } },
  { id: 'broad-feet', names: l('넓은 발바닥', 'Broad feet', '幅広い足裏'), descriptions: l('체력 +1, 민첩 −1. 하중을 넓게 받치지만 좁은 발판에서 발을 놓기 어렵다.', 'Vitality +1, agility −1. Broad feet support loads but fit narrow ledges poorly.', '体力+1、敏捷−1。広い足で荷重を受けるが細い足場は苦手。'), stats: { vitality: 1, agility: -1 }, modifiers: { 'heavy-lifting': 1, cold: 1, 'high-place': -1 } },
  { id: 'scent-organ', names: l('발달한 후각', 'Scent organ', '発達した嗅覚'), descriptions: l('손재주 +1, MP −2. 냄새로 숨은 흔적을 찾지만 고열과 자극에 민감하다.', 'Dexterity +1, MP −2. Smell reveals hidden traces, but the organ is sensitive to heat and irritation.', '手先+1、MP−2。匂いで隠れた痕跡を探すが高熱や刺激に敏感。'), stats: { dexterity: 1, mp: -2 }, modifiers: { 'keen-senses': 2, heat: -1 } },
  { id: 'echo-larynx', names: l('반향 울림목', 'Echo larynx', '反響する喉'), descriptions: l('MP +2, HP −2. 반향으로 함정과 흔적을 읽지만 깊은 물에서 소리를 쓰기 어렵다.', 'MP +2, HP −2. Echoes reveal traps and traces, but are difficult to use in deep water.', 'MP+2、HP−2。反響で罠や痕跡を読むが深い水では使いにくい。'), stats: { mp: 2, hp: -2 }, modifiers: { 'keen-senses': 2, trap: 1, 'deep-water': -1 } },
  { id: 'protective-eyelid', names: l('보호 눈꺼풀', 'Protective eyelid', '保護する瞬膜'), descriptions: l('손재주 +1, 매력 −1. 열과 물속 흔적을 살피기 쉽지만 추위에 눈막이 굳는다.', 'Dexterity +1, charisma −1. A membrane helps in heat and water, but stiffens in cold.', '手先+1、魅力−1。熱や水中の痕跡を見やすいが寒さで膜が硬くなる。'), stats: { dexterity: 1, charisma: -1 }, modifiers: { heat: 1, 'deep-water': 1, cold: -1 } },
  { id: 'elastic-cartilage', names: l('탄성 연골', 'Elastic cartilage', '弾性の軟骨'), descriptions: l('손재주 +1, HP −3. 좁은 틈에 몸을 맞추지만 무거운 하중에는 약하다. 비틀어 치기를 익힌다.', 'Dexterity +1, HP −3. Cartilage folds into gaps but tolerates heavy loads poorly. Unlocks Coiling Strike.', '手先+1、HP−3。軟骨で隙間に体を合わせるが重い荷に弱い。捻り打ちを学ぶ。'), stats: { dexterity: 1, hp: -3 }, modifiers: { 'narrow-space': 2, 'heavy-lifting': -1 } },
  { id: 'rooted-feet', names: l('뿌리 발', 'Rooted feet', '根の足'), descriptions: l('체력 +1, 민첩 −1. 땅을 붙들어 짐을 받치지만 높은 발판을 빠르게 옮기기 어렵다.', 'Vitality +1, agility −1. Roots brace loads against the ground, but slow movement between high ledges.', '体力+1、敏捷−1。根で地を掴み荷を支えるが高所を渡りにくい。'), stats: { vitality: 1, agility: -1 }, modifiers: { 'heavy-lifting': 1, 'high-place': -1 } },
];

export const FANTASY_RACE_DIVERSITY_TRAITS: Record<string, string[]> = {
  foxkin: ['balancing-tail', 'insulating-fur'], wolfkin: ['insulating-fur'], catkin: ['balancing-tail', 'night-eyes'], rabbitkin: ['insulating-fur'], bearkin: ['insulating-fur'],
  tideborn: ['webbed-limbs'], coralborn: ['webbed-limbs'], birdkin: ['hollow-bones'], batkin: ['night-eyes'], dryad: ['living-sapwood'],
  stoneborn: ['mineral-core'], 'clockwork-golem': ['mineral-core'], lizardkin: ['overlapping-scales', 'balancing-tail'], dragonblood: ['overlapping-scales', 'balancing-tail'],
  'frost-dragonkin': ['overlapping-scales', 'balancing-tail'], 'storm-dragonkin': ['overlapping-scales', 'balancing-tail'], 'true-dragon': ['overlapping-scales', 'balancing-tail'], 'elder-dragon': ['overlapping-scales', 'balancing-tail'],
  starfairy: ['mana-woven'], 'flower-fairy': ['mana-woven'], frostfairy: ['mana-woven'], 'fire-spirit': ['mana-woven'], 'water-spirit': ['mana-woven'], windspirit: ['mana-woven'], voidborn: ['mana-woven'], phoenix: ['hollow-bones', 'mana-woven'],
  moonshadow: ['night-eyes'], 'dark-elf': ['night-eyes'], 'vampire-night': ['night-eyes'], 'vampire-crimson': ['night-eyes'], 'vampire-moon': ['night-eyes'],
  deerkin: ['split-hooves', 'insulating-fur'], goatkin: ['split-hooves', 'insulating-fur'],
};
const additionalRaceTraits: Record<string, string[]> = {
  elf: ['flexible-joints'], 'high-elf': ['flexible-joints'], 'dark-elf': ['flexible-joints'], 'snow-elf': ['spring-tendons'],
  dwarf: ['strong-hands', 'broad-feet'], 'hill-dwarf': ['strong-hands', 'broad-feet'], 'deep-dwarf': ['strong-hands', 'broad-feet'],
  orc: ['strong-hands', 'broad-feet'], hobgoblin: ['strong-hands'], bearkin: ['strong-hands', 'scent-organ'],
  foxkin: ['flexible-joints', 'scent-organ'], wolfkin: ['spring-tendons', 'scent-organ'], catkin: ['flexible-joints', 'spring-tendons', 'gripping-digits'],
  rabbitkin: ['spring-tendons', 'scent-organ'], deerkin: ['spring-tendons', 'scent-organ'], goatkin: ['spring-tendons'],
  birdkin: ['gripping-digits', 'protective-eyelid'], batkin: ['echo-larynx', 'gripping-digits', 'elastic-cartilage'],
  tideborn: ['elastic-cartilage', 'protective-eyelid'], coralborn: ['protective-eyelid'], lizardkin: ['flexible-joints', 'protective-eyelid'],
  dragonblood: ['strong-hands', 'protective-eyelid'], 'frost-dragonkin': ['strong-hands', 'protective-eyelid'], 'storm-dragonkin': ['strong-hands', 'protective-eyelid'],
  'true-dragon': ['strong-hands', 'protective-eyelid'], 'elder-dragon': ['strong-hands', 'protective-eyelid'],
  dryad: ['rooted-feet'], stoneborn: ['strong-hands', 'broad-feet'], 'clockwork-golem': ['strong-hands', 'broad-feet'],
  goblin: ['flexible-joints', 'gripping-digits'], halfling: ['broad-feet'], phoenix: ['protective-eyelid'],
};
for (const [race, ids] of Object.entries(additionalRaceTraits)) FANTASY_RACE_DIVERSITY_TRAITS[race] = [...new Set([...(FANTASY_RACE_DIVERSITY_TRAITS[race] ?? []), ...ids])];

// 生まれの乱数や職業の記録を変えず、同じ身体から同じ差だけを求める。
export function fantasyBodyStatModifiers(c: Pick<FantasyCharacter, 'race'>): Partial<FantasyStats> {
  const ids = Object.hasOwn(FANTASY_RACE_DIVERSITY_TRAITS, c.race) ? FANTASY_RACE_DIVERSITY_TRAITS[c.race] : [], result: Partial<FantasyStats> = {};
  for (const trait of FANTASY_BODY_DIVERSITY_TRAITS) if (ids.includes(trait.id)) for (const [key, amount] of Object.entries(trait.stats)) {
    const stat = key as keyof FantasyStats, cap = stat === 'hp' || stat === 'mp' ? 12 : 3;
    result[stat] = Math.max(-cap, Math.min(cap, (result[stat] ?? 0) + amount));
  }
  for (const key of Object.keys(result) as (keyof FantasyStats)[]) if (result[key] === 0) delete result[key];
  return result;
}
