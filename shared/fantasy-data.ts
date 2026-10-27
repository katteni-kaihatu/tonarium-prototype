import type { FantasyEvent, FantasyItem, FantasyJob, FantasyLocation, FantasyQuest, FantasyRace, FantasyRaceFamily, FantasyRecipe, FantasyRoute, FantasySkill, FantasyStat } from './fantasy';
import { FANTASY_LINEAGE_QUESTS, FANTASY_RACIAL_EVENTS } from './fantasy-racial-content.ts';
import { FANTASY_EXPANSION_LOCATIONS, FANTASY_EXPANSION_ROUTES } from './fantasy-world-expansion.ts';
import { FANTASY_GATE_HOURS, FANTASY_GATE_SETTLEMENTS } from './fantasy-gates.ts';
import { FANTASY_EXPANDED_ITEMS, FANTASY_EXPANDED_RECIPES, FANTASY_LEGACY_ITEM_UPDATES, FANTASY_PROFESSION_ITEMS, FANTASY_PROFESSION_RECIPES, FANTASY_PROFESSION_QUESTS } from './fantasy-items-expansion.ts';
import { FANTASY_ADDITIONAL_RACIAL_EVENTS, FANTASY_EXPANSION_QUESTS } from './fantasy-racial-expansion.ts';
import { APPROVED_RACES, APPROVED_JOBS, APPROVED_EVENTS } from './fantasy-approved-content.ts';
import { APPROVED_QUESTS } from './fantasy-approved-quests.ts';
import { FANTASY_PRIEST_JOB, FANTASY_PRIEST_EVENTS } from './fantasy-priest.ts';
import { FANTASY_REGIONAL_EVENTS } from './fantasy-regional-events.ts';
import { FANTASY_JOB_SKILL_EXPANSIONS, FANTASY_SKILL_METADATA_OVERRIDES } from './fantasy-skill-expansion.ts';
import { FANTASY_MAIN_QUESTS, FANTASY_SIDE_QUESTS, FANTASY_SECOND_RACIAL_EVENTS, FANTASY_SECOND_FAMILY_EVENTS } from './fantasy-second-content.ts';
import { FANTASY_ENVIRONMENT_ITEMS, FANTASY_ENVIRONMENT_RECIPES } from './fantasy-environment-data.ts';
import { FANTASY_TASK_QUESTS } from './fantasy-task-quests.ts';
import { FANTASY_TRAVEL_GOODS, FANTASY_TRAVEL_RECIPES } from './fantasy-travel-goods.ts';
import { FANTASY_HOSTILE_ENCOUNTERS } from './fantasy-encounters.ts';
import { FANTASY_COMBAT_LOOT_ITEMS, FANTASY_COMBAT_LOOT_RECIPES } from './fantasy-combat-loot.ts';

export const FANTASY_STAT_NAMES: Record<FantasyStat | 'hp' | 'mp', string> = {
  hp: 'HP', mp: 'MP', strength: '力', agility: '敏捷', intelligence: '知力', luck: '運', vitality: '体力', dexterity: '手先', charisma: 'カリスマ',
};

const skill = (id: string, name: string, kind: FantasySkill['kind'], description: string, effect: FantasySkill['effect'], power: number, mp = 0, stat?: FantasyStat): FantasySkill => ({ id, name, kind, description, effect, power, mp, ...(stat ? { stat } : {}) });

const ORIGINAL_RACES: Omit<FantasyRace, 'family' | 'names'>[] = [
  { id: 'human', name: '人間', description: '街にも荒野にも暮らしを築く、柔軟で好奇心旺盛な人々。どの仕事も始めやすい。', rarity: '一般', weight: 20, modifiers: {}, affinity: ['city'], skills: [skill('human-adapt', '適応する心', 'passive', '知恵を働かせる判定を少し助ける。', 'check', 1, 0, 'intelligence'), skill('human-ingenuity', 'とっさの機転', 'active', '次の運の判定を強化する。', 'check', 4, 6, 'luck')] },
  { id: 'elf', name: '森エルフ', description: '古い森とともに暮らす長命の民。身軽で魔力に秀でるが、長旅の疲れが残りやすい。', rarity: '一般', weight: 12, modifiers: { mp: 10, agility: 3, intelligence: 1, vitality: -2 }, affinity: ['forest'], skills: [skill('elf-path', '森の道案内', 'passive', '森林に親しみ、旅の負担を和らげる。', 'travel', 1), skill('elf-wind', '風の導き', 'active', '次の敏捷判定に風の加護を得る。', 'check', 4, 8, 'agility')] },
  { id: 'dwarf', name: '山ドワーフ', description: '石と金属を読み取る山の職人。頑丈な体を持つ一方、身軽な動きは苦手。', rarity: '一般', weight: 12, modifiers: { hp: 15, mp: -10, strength: 2, vitality: 2, agility: -2 }, affinity: ['mountain', 'cave'], skills: [skill('dwarf-vein', '鉱脈の目', 'passive', '採集と仕事で得られる成果を増やす。', 'reward', 1), skill('dwarf-iron', '鉄の構え', 'active', '次の危険で受ける被害を軽減する。', 'guard', 8, 6)] },
  { id: 'orc', name: 'オーク', description: '高原で家族や仲間を支える屈強な民。力仕事は得意だが、繊細な研究には時間が必要。', rarity: '一般', weight: 10, modifiers: { hp: 20, mp: -10, strength: 4, vitality: 1, intelligence: -2, luck: -1 }, affinity: ['mountain', 'desert'], skills: [skill('orc-endure', '不屈の体', 'passive', '危険に遭ったときの被害を減らす。', 'guard', 3), skill('orc-roar', '勇気の雄叫び', 'active', '次の力の判定を強化する。', 'check', 4, 8, 'strength')] },
  { id: 'halfling', name: '小人族', description: '畑や宿を大切にする小柄な旅好き。力は控えめでも、幸運と機転が道を開く。', rarity: '一般', weight: 10, modifiers: { hp: -10, luck: 4, agility: 2, strength: -3 }, affinity: ['city', 'forest'], skills: [skill('halfling-luck', '幸運の足音', 'passive', '運が関わる判定に小さな助けを得る。', 'check', 2, 0, 'luck'), skill('halfling-escape', '危機一髪', 'active', '次の危険を身軽に避ける準備をする。', 'guard', 8, 6)] },
  { id: 'foxkin', name: '狐の獣人', description: '耳と尾を持つ機敏な民。商路や森の噂に詳しいが、体力勝負は得意ではない。', rarity: '一般', weight: 10, modifiers: { mp: -5, agility: 3, luck: 2, vitality: -2 }, affinity: ['forest', 'city'], skills: [skill('foxkin-sense', '鋭い感覚', 'passive', '敏捷が必要な判定を助ける。', 'check', 2, 0, 'agility'), skill('foxkin-dash', '残影の駆け足', 'active', '次の旅を軽やかに進む。', 'travel', 2, 7)] },
  { id: 'tideborn', name: '潮の民', description: '海と陸の双方で暮らす水辺の民。潮流と薬草の知識を受け継ぎ、力より知恵を好む。', rarity: '希少', weight: 7, modifiers: { mp: 10, intelligence: 2, vitality: 1, strength: -2 }, affinity: ['coast', 'swamp', 'island'], skills: [skill('tideborn-current', '潮の記憶', 'passive', '水辺を得意とし、旅の負担を和らげる。', 'travel', 1), skill('tideborn-veil', '水の帳', 'active', '水の膜で次の被害を和らげる。', 'guard', 8, 8)] },
  { id: 'dragonblood', name: '竜血族', description: '淡い鱗と角を持つ火山の末裔。力強いが重い体を扱うには慣れが必要。', rarity: '希少', weight: 5, modifiers: { hp: 10, strength: 3, vitality: 2, agility: -3, luck: -1 }, affinity: ['volcano', 'mountain'], skills: [skill('dragonblood-scales', '竜の鱗', 'passive', '小さな怪我を鱗が防ぐ。', 'guard', 3), skill('dragonblood-flame', '炉火の息吹', 'active', '熱と力を必要とする次の判定を強化する。', 'check', 4, 12, 'strength')] },
  { id: 'starfairy', name: '星灯りの妖精', description: '星の光から生まれた小さな妖精。豊かな魔力と引き換えに、体はとても繊細。', rarity: '希少', weight: 5, modifiers: { hp: -25, mp: 25, intelligence: 4, luck: 2, strength: -4 }, affinity: ['tower', 'island'], skills: [skill('starfairy-weave', '星の織り手', 'passive', '魔法や研究の知力判定を助ける。', 'check', 2, 0, 'intelligence'), skill('starfairy-glimmer', 'きらめくひらめき', 'active', '次の知力判定を大きく強化する。', 'check', 4, 8, 'intelligence')] },
  { id: 'dryad', name: '樹花の精', description: 'この世界では女性の姿で芽吹く樹木の精。癒やしと薬草に親しみ、素早い移動は苦手。', rarity: '稀代', weight: 4, gender: 'female', modifiers: { hp: -10, mp: 15, intelligence: 2, vitality: 2, agility: -2 }, affinity: ['forest', 'swamp'], skills: [skill('dryad-herbs', '薬草の囁き', 'passive', '採集と仕事で得られる成果を増やす。', 'reward', 1), skill('dryad-sprout', '命の若芽', 'active', '自身のHPを回復する。', 'heal', 24, 10)] },
  { id: 'stoneborn', name: '石生まれ', description: '山の記憶を宿した性別のない石の民。重く頑丈な体と、小さな魔力の核を持つ。', rarity: '稀代', weight: 3, gender: 'none', modifiers: { hp: 30, mp: -20, strength: 3, vitality: 4, agility: -4 }, affinity: ['mountain', 'cave', 'ruin'], skills: [skill('stoneborn-body', '岩の体', 'passive', '旅や探索で受ける被害を減らす。', 'guard', 3), skill('stoneborn-echo', '大地のこだま', 'active', '次の体力判定を強化する。', 'check', 4, 10, 'vitality')] },
  { id: 'moonshadow', name: '月影族', description: '夜の大陸に暮らす静かな民。影と古代文字に詳しいが、長い肉体労働には弱い。', rarity: '伝承', weight: 2, modifiers: { mp: 15, agility: 3, intelligence: 2, vitality: -3, luck: -1 }, affinity: ['ruin', 'cave', 'snow'], skills: [skill('moonshadow-night', '夜を読む瞳', 'passive', '遺跡の仕掛けを読む知力判定を助ける。', 'check', 2, 0, 'intelligence'), skill('moonshadow-step', '影渡り', 'active', '次の旅の負担を軽減する。', 'travel', 2, 9)] },
];

const raceNames = (ko: string, en: string, ja: string): FantasyRace['names'] => ({ ko, en, ja });
const raceFamily = (id: string, ko: string, en: string, ja: string, description: string): FantasyRaceFamily => ({ id, name: ja, names: raceNames(ko, en, ja), description });

export const FANTASY_RACE_FAMILIES: FantasyRaceFamily[] = [
  raceFamily('human', '인간', 'Humans', '人間', '街や交易路に広く暮らす、適応力のある人々。'),
  raceFamily('beastfolk', '수인족', 'Beastfolk', '獣人', '獣・鳥・爬虫類の特徴を受け継ぎ、多様な暮らしを営む民。'),
  raceFamily('elf', '엘프', 'Elves', 'エルフ', '森や魔力に親しむ長命の民。土地ごとに異なる文化がある。'),
  raceFamily('dwarf', '드워프', 'Dwarves', 'ドワーフ', '石や金属とともに暮らす民。山、丘、地下で技を磨く。'),
  raceFamily('vampire', '뱀파이어', 'Vampires', '吸血族', '血と魔力に縁を持つ民。各系統に異なる長所と弱点がある。'),
  raceFamily('dragonkin', '용혈족', 'Dragonkin', '竜血族', '竜の特徴を受け継ぐ民。炎・霜・嵐の系統がある。'),
  raceFamily('spirit', '정령', 'Spirits', '精霊', '樹木や火、水に由来する民。自然との結びつきが姿に表れる。'),
  raceFamily('fairy', '요정', 'Fairies', '妖精', '星明かりや花に親しむ小さな民。魔力と繊細な体を持つ。'),
  raceFamily('golem', '골렘족', 'Golems', 'ゴーレム', '石や機構に命が宿った民。体の性質と魔力に偏りがある。'),
  raceFamily('smallfolk', '소인족', 'Smallfolk', '小人', '小柄な体と工夫で暮らしを築く、旅人や発明好きの民。'),
  raceFamily('orcfolk', '오크계', 'Orc Kindred', 'オーク系', 'オークとゴブリンの近縁の民。力や機敏さをそれぞれに伸ばす。'),
  raceFamily('seafolk', '해양족', 'Sea Folk', '海の民', '潮や珊瑚に親しみ、海辺と陸の両方で生活する民。'),
  raceFamily('otherworld', '이계족', 'Otherworld Folk', '異界の民', '天上・魔・霊の性質を持つ民。出自で善悪は決まらない。'),
  raceFamily('nightfolk', '월영족', 'Moonshadow Folk', '月影の民', '夜の大陸の記憶と古代文字に親しむ、静かな民。'),
  raceFamily('divine', '신성계', 'Divine Kindred', '神性の民', '神に連なる力を受け継ぐ、きわめて稀な民。'),
];

const originalRaceMetadata: Record<string, { family: string; names: FantasyRace['names']; weight: number }> = {
  human: { family: 'human', names: raceNames('인간', 'Human', '人間'), weight: 17.64 },
  elf: { family: 'elf', names: raceNames('숲 엘프', 'Wood Elf', '森エルフ'), weight: 5 },
  dwarf: { family: 'dwarf', names: raceNames('산 드워프', 'Mountain Dwarf', '山ドワーフ'), weight: 4 },
  orc: { family: 'orcfolk', names: raceNames('오크', 'Orc', 'オーク'), weight: 1.1 },
  halfling: { family: 'smallfolk', names: raceNames('하플링', 'Halfling', '小人族'), weight: 3 },
  foxkin: { family: 'beastfolk', names: raceNames('여우 수인', 'Foxfolk', '狐の獣人'), weight: 4 },
  tideborn: { family: 'seafolk', names: raceNames('조수족', 'Tideborn', '潮の民'), weight: 2 },
  dragonblood: { family: 'dragonkin', names: raceNames('화염 용혈족', 'Ember Dragonkin', '炎の竜血族'), weight: 2.5 },
  starfairy: { family: 'fairy', names: raceNames('별빛 요정', 'Starlight Fairy', '星灯りの妖精'), weight: 2 },
  dryad: { family: 'spirit', names: raceNames('드라이어드', 'Dryad', '樹花の精'), weight: 2.5 },
  stoneborn: { family: 'golem', names: raceNames('바위 골렘', 'Stone Golem', '石生まれ'), weight: 2 },
  moonshadow: { family: 'nightfolk', names: raceNames('월영족', 'Moonshadow', '月影族'), weight: 0.5 },
};

const ancestry = (id: string, family: string, ko: string, en: string, ja: string, description: string, weight: number, modifiers: FantasyRace['modifiers'], affinity: string[], skills: FantasyRace['skills']): FantasyRace => ({
  id, family, names: raceNames(ko, en, ja), name: ja, description, weight,
  rarity: weight >= 3 ? '一般' : weight >= 1 ? '希少' : '伝承', modifiers, affinity, skills,
});

export const FANTASY_RACES: FantasyRace[] = [
  ...ORIGINAL_RACES.map(race => {
    const metadata = originalRaceMetadata[race.id];
    return { ...race, ...metadata, name: metadata.names.ja };
  }),
  ancestry('wolfkin', 'beastfolk', '늑대 수인', 'Wolffolk', '狼の獣人', '群れを大切にする追跡者。力と敏捷に優れるが、学術と魔力は控えめ。', 4, { strength: 2, agility: 2, intelligence: -2, mp: -5 }, ['forest', 'snow'], [skill('wolfkin-instinct', '追跡の勘', 'passive', '敏捷判定に2の補正を得る。', 'check', 2, 0, 'agility'), skill('wolfkin-pace', '群れの歩調', 'active', '次の旅を2時間短縮する。最低1時間。', 'travel', 2, 7)]),
  ancestry('catkin', 'beastfolk', '고양이 수인', 'Catfolk', '猫の獣人', '身軽な路地の案内人。敏捷と運に優れる一方、体力は控えめ。', 4, { agility: 4, luck: 1, vitality: -2 }, ['city', 'ruin'], [skill('catkin-balance', 'しなやかな平衡', 'passive', '敏捷判定に2の補正を得る。', 'check', 2, 0, 'agility'), skill('catkin-step', '音のない一歩', 'active', '次の敏捷判定を4強化する。', 'check', 4, 7, 'agility')]),
  ancestry('rabbitkin', 'beastfolk', '토끼 수인', 'Rabbitfolk', '兎の獣人', '素早く幸運な旅好き。重い荷を扱う力と頑丈さには欠ける。', 3, { agility: 3, luck: 2, strength: -3, hp: -5 }, ['forest', 'city'], [skill('rabbitkin-luck', '野原の幸運', 'passive', '運判定に2の補正を得る。', 'check', 2, 0, 'luck'), skill('rabbitkin-bound', '切り返し', 'active', '次に受ける被害を7軽減する。', 'guard', 7, 6)]),
  ancestry('bearkin', 'beastfolk', '곰 수인', 'Bearfolk', '熊の獣人', '頼もしい力仕事の担い手。力と体力に秀でるが、身軽さと学術は苦手。', 2, { strength: 4, vitality: 3, agility: -3, intelligence: -2, mp: -5 }, ['forest', 'mountain'], [skill('bearkin-hide', '厚い毛並み', 'passive', '受ける被害を2軽減する。', 'guard', 2), skill('bearkin-heave', '大きな踏ん張り', 'active', '次の力判定を4強化する。', 'check', 4, 10, 'strength')]),
  ancestry('birdkin', 'beastfolk', '조인', 'Birdfolk', '鳥の獣人', '羽を持つ風読みの民。敏捷と知力に優れるが、体は軽く繊細。', 2, { agility: 3, intelligence: 1, vitality: -2, strength: -1, hp: -5 }, ['mountain', 'tower'], [skill('birdkin-path', '風向きの見立て', 'passive', '旅の所要時間を1時間短縮する。最低1時間。', 'travel', 1), skill('birdkin-focus', '高みの観察', 'active', '次の知力判定を4強化する。', 'check', 4, 8, 'intelligence')]),
  ancestry('lizardkin', 'beastfolk', '도마뱀 수인', 'Lizardfolk', '蜥蜴の獣人', '硬い鱗を持つ粘り強い民。体力と力に優れ、魔力と運は控えめ。', 2, { vitality: 3, strength: 1, luck: -2, agility: -1, mp: -10 }, ['desert', 'swamp'], [skill('lizardkin-scales', '丈夫な鱗', 'passive', '受ける被害を2軽減する。', 'guard', 2), skill('lizardkin-endure', '揺るがぬ姿勢', 'active', '次の体力判定を4強化する。', 'check', 4, 8, 'vitality')]),
  ancestry('high-elf', 'elf', '하이 엘프', 'High Elf', 'ハイエルフ', '魔力と学問を重んじる民。知力とMPに優れるが、力と体力は控えめ。', 3, { intelligence: 4, mp: 20, strength: -2, vitality: -2 }, ['tower', 'city'], [skill('high-elf-study', '長年の学識', 'passive', '知力判定に2の補正を得る。', 'check', 2, 0, 'intelligence'), skill('high-elf-focus', '精緻な集中', 'active', '次の知力判定を4強化する。', 'check', 4, 10, 'intelligence')]),
  ancestry('dark-elf', 'elf', '다크 엘프', 'Dark Elf', 'ダークエルフ', '地下の文化と遺跡の記録を継ぐ民。敏捷と知力に優れ、体力と運は低い。', 3, { agility: 2, intelligence: 2, vitality: -2, luck: -1, mp: 5 }, ['cave', 'ruin'], [skill('dark-elf-reading', '暗がりの観察', 'passive', '知力判定に2の補正を得る。', 'check', 2, 0, 'intelligence'), skill('dark-elf-step', '静かな足運び', 'active', '次の敏捷判定を4強化する。', 'check', 4, 8, 'agility')]),
  ancestry('snow-elf', 'elf', '설원 엘프', 'Snow Elf', '雪原エルフ', '寒い土地で暮らす慎重な民。体力と知恵に長けるが、力は控えめ。', 2, { vitality: 2, intelligence: 1, agility: 1, strength: -2, mp: 5 }, ['snow', 'forest'], [skill('snow-elf-resolve', '冬越しの知恵', 'passive', '体力判定に2の補正を得る。', 'check', 2, 0, 'vitality'), skill('snow-elf-shelter', '雪囲いの備え', 'active', '次に受ける被害を8軽減する。', 'guard', 8, 8)]),
  ancestry('hill-dwarf', 'dwarf', '구릉 드워프', 'Hill Dwarf', '丘ドワーフ', '丘の集落で畑と工房を守る民。頑健だが、敏捷と魔力は控えめ。', 3, { vitality: 3, strength: 1, agility: -2, mp: -10 }, ['mountain', 'city'], [skill('hill-dwarf-patience', '粘り強い仕事', 'passive', '仕事や採集などの成果を1増やす。', 'reward', 1), skill('hill-dwarf-stance', '丘の踏ん張り', 'active', '次の体力判定を4強化する。', 'check', 4, 8, 'vitality')]),
  ancestry('deep-dwarf', 'dwarf', '지하 드워프', 'Deep Dwarf', '地底ドワーフ', '地下の石組みを読む民。知力と頑丈さに優れ、敏捷と運は控えめ。', 2, { intelligence: 2, vitality: 2, agility: -3, luck: -1, hp: 10 }, ['cave', 'ruin'], [skill('deep-dwarf-measure', '石組みの計算', 'passive', '知力判定に2の補正を得る。', 'check', 2, 0, 'intelligence'), skill('deep-dwarf-brace', '坑道の守り', 'active', '次に受ける被害を8軽減する。', 'guard', 8, 9)]),
  ancestry('vampire-night', 'vampire', '야혈 뱀파이어', 'Nightblood Vampire', '夜血の吸血族', '静かな動きを好む吸血族。敏捷と魔力に優れるが、体力と運は低い。時間帯による追加制約はない。', 2.5, { agility: 3, intelligence: 1, vitality: -2, luck: -2, hp: -5, mp: 10 }, ['city', 'ruin'], [skill('vampire-night-poise', '静寂の作法', 'passive', '敏捷判定に2の補正を得る。', 'check', 2, 0, 'agility'), skill('vampire-night-renew', '血脈の再生', 'active', 'MPを使い、自身のHPを18回復する。', 'heal', 18, 12)]),
  ancestry('vampire-crimson', 'vampire', '홍혈 뱀파이어', 'Crimsonblood Vampire', '紅血の吸血族', '力強さを重んじる吸血族。力とHPに優れるが、知力と運は控えめ。', 1.5, { strength: 3, vitality: 1, intelligence: -2, luck: -2, hp: 10 }, ['ruin', 'mountain'], [skill('vampire-crimson-body', '紅血の頑健', 'passive', '受ける被害を2軽減する。', 'guard', 2), skill('vampire-crimson-force', '血脈の奮起', 'active', '次の力判定を4強化する。', 'check', 4, 10, 'strength')]),
  ancestry('vampire-moon', 'vampire', '월광 뱀파이어', 'Moonlit Vampire', '月光の吸血族', '記憶と偶然を読み取る吸血族。知力と運に優れるが、体力と力は低い。', 1, { intelligence: 3, luck: 2, vitality: -3, strength: -2, mp: 10 }, ['tower', 'ruin'], [skill('vampire-moon-memory', '月の記憶', 'passive', '知力判定に2の補正を得る。', 'check', 2, 0, 'intelligence'), skill('vampire-moon-chance', '運命の綾', 'active', '次の運判定を4強化する。', 'check', 4, 8, 'luck')]),
  ancestry('frost-dragonkin', 'dragonkin', '서리 용혈족', 'Frost Dragonkin', '霜の竜血族', '白い鱗を受け継ぐ頑健な民。体力とHPに優れ、敏捷と運は控えめ。', 1.5, { vitality: 3, strength: 1, agility: -3, luck: -1, hp: 15, mp: -5 }, ['snow', 'mountain'], [skill('frost-dragonkin-scales', '白霜の鱗', 'passive', '受ける被害を3軽減する。', 'guard', 3), skill('frost-dragonkin-brace', '霜鎧の構え', 'active', '次に受ける被害を8軽減する。', 'guard', 8, 10)]),
  ancestry('storm-dragonkin', 'dragonkin', '폭풍 용혈족', 'Storm Dragonkin', '嵐の竜血族', 'しなやかな角と鱗を持つ民。敏捷と魔力に優れ、力と体力は控えめ。', 1, { agility: 3, intelligence: 1, vitality: -2, strength: -1, mp: 10 }, ['coast', 'tower'], [skill('storm-dragonkin-route', '風路の読み', 'passive', '旅の所要時間を1時間短縮する。最低1時間。', 'travel', 1), skill('storm-dragonkin-quick', '嵐の機先', 'active', '次の敏捷判定を4強化する。', 'check', 4, 10, 'agility')]),
  ancestry('fire-spirit', 'spirit', '불꽃 정령', 'Flame Spirit', '火の精', '火に由来する意志の強い精霊。知力とMPに優れるが、体は繊細で運も低い。', 1.5, { intelligence: 3, strength: 1, vitality: -3, luck: -1, mp: 15, hp: -10 }, ['volcano', 'desert'], [skill('fire-spirit-insight', '炉火の洞察', 'passive', '知力判定に2の補正を得る。', 'check', 2, 0, 'intelligence'), skill('fire-spirit-focus', '火芯の集中', 'active', '次の知力判定を4強化する。', 'check', 4, 12, 'intelligence')]),
  ancestry('water-spirit', 'spirit', '물 정령', 'Water Spirit', '水の精', '流れる水に由来する柔軟な精霊。知力とMPに長けるが、力とHPは控えめ。', 1, { intelligence: 2, vitality: 1, strength: -3, mp: 15, hp: -10 }, ['coast', 'swamp'], [skill('water-spirit-flow', '流れの受け身', 'passive', '受ける被害を2軽減する。', 'guard', 2), skill('water-spirit-renew', '清流の癒やし', 'active', '自身のHPを20回復する。', 'heal', 20, 10)]),
  ancestry('flower-fairy', 'fairy', '꽃 요정', 'Flower Fairy', '花の妖精', '花々に親しむ小さな民。運と知力に優れるが、力と体力はとても低い。', 2, { luck: 3, intelligence: 2, strength: -4, vitality: -2, mp: 15, hp: -15 }, ['forest', 'island'], [skill('flower-fairy-gifts', '花の恵み', 'passive', '仕事や採集などの成果を1増やす。', 'reward', 1), skill('flower-fairy-dew', '朝露の癒やし', 'active', '自身のHPを18回復する。', 'heal', 18, 8)]),
  ancestry('clockwork-golem', 'golem', '기계 골렘', 'Clockwork Golem', '機巧ゴーレム', '機構に意志が宿った民。力と知力に優れるが、敏捷、運、魔力は控えめ。', 1, { strength: 2, intelligence: 2, agility: -2, luck: -3, mp: -15, hp: 20 }, ['city', 'ruin'], [skill('clockwork-golem-frame', '補強された骨組み', 'passive', '受ける被害を2軽減する。', 'guard', 2), skill('clockwork-golem-tuning', '精密調整', 'active', '次の手先判定を4強化する。', 'check', 4, 8, 'dexterity')]),
  ancestry('gnome', 'smallfolk', '놈', 'Gnome', 'ノーム', '仕組みを考えるのが好きな小柄な民。知力に優れるが、力と体力は控えめ。', 2, { intelligence: 3, luck: 1, strength: -3, vitality: -1, mp: 10 }, ['city', 'cave'], [skill('gnome-hands', '工夫する手', 'passive', '手先判定に2の補正を得る。', 'check', 2, 0, 'dexterity'), skill('gnome-idea', '発明家の着想', 'active', '次の知力判定を4強化する。', 'check', 4, 8, 'intelligence')]),
  ancestry('goblin', 'orcfolk', '고블린', 'Goblin', 'ゴブリン', '素早く機転の利く小柄な民。敏捷に優れるが、力と頑丈さは控えめ。', 1.5, { agility: 3, luck: 1, strength: -2, vitality: -2, hp: -5 }, ['cave', 'forest'], [skill('goblin-salvage', '使える物の目利き', 'passive', '仕事や採集などの成果を1増やす。', 'reward', 1), skill('goblin-shortcut', '近道の工夫', 'active', '次の旅を2時間短縮する。最低1時間。', 'travel', 2, 7)]),
  ancestry('hobgoblin', 'orcfolk', '홉고블린', 'Hobgoblin', 'ホブゴブリン', '仲間と段取りを重んじる民。力と体力に優れ、知力と運は控えめ。', 0.5, { strength: 2, vitality: 2, luck: -2, intelligence: -1, mp: -5 }, ['mountain', 'city'], [skill('hobgoblin-drill', '積み重ねた鍛錬', 'passive', '力判定に2の補正を得る。', 'check', 2, 0, 'strength'), skill('hobgoblin-cover', '守りの手順', 'active', '次に受ける被害を7軽減する。', 'guard', 7, 8)]),
  ancestry('coralborn', 'seafolk', '산호족', 'Coralborn', '珊瑚の民', '珊瑚のような硬い肌を持つ海辺の民。体力に秀でるが、敏捷と運は低い。', 1, { vitality: 3, intelligence: 1, agility: -3, luck: -1, hp: 10, mp: 5 }, ['coast', 'island'], [skill('coralborn-shell', '珊瑚の肌', 'passive', '受ける被害を2軽減する。', 'guard', 2), skill('coralborn-tide', '満ち潮の癒やし', 'active', '自身のHPを20回復する。', 'heal', 20, 10)]),
  ancestry('celestial', 'otherworld', '천상족', 'Celestial', '天上の民', '穏やかな光を帯びる民。知力と運に優れるが、力と体力は控えめ。', 0.5, { intelligence: 3, luck: 2, strength: -3, vitality: -2, mp: 15, hp: -10 }, ['tower', 'snow'], [skill('celestial-ward', '淡光の守り', 'passive', '受ける被害を2軽減する。', 'guard', 2), skill('celestial-mend', '光の手当て', 'active', '自身のHPを24回復する。', 'heal', 24, 12)]),
  ancestry('devilkin', 'otherworld', '마족', 'Devilkin', '魔の民', '角と濃い魔力を持つ民。力と知力に長けるが、運と体力は低い。出自で性格は決まらない。', 0.5, { strength: 2, intelligence: 2, luck: -3, vitality: -2, mp: 10 }, ['volcano', 'city'], [skill('devilkin-logic', '魔理の解釈', 'passive', '知力判定に2の補正を得る。', 'check', 2, 0, 'intelligence'), skill('devilkin-presence', '揺るがぬ言葉', 'active', '次のカリスマ判定を4強化する。', 'check', 4, 10, 'charisma')]),
  ancestry('revenant', 'otherworld', '망령족', 'Revenant', '残響の民', '強い記憶が姿を得た霊の民。体力と知力に長けるが、敏捷と運は低い。通常のHPと救助規則に従う。', 0.5, { vitality: 3, intelligence: 2, agility: -3, luck: -2, hp: 5, mp: 10 }, ['ruin', 'cave'], [skill('revenant-resolve', '消えない意志', 'passive', '受ける被害を3軽減する。', 'guard', 3), skill('revenant-route', '記憶の道筋', 'active', '次の旅を2時間短縮する。最低1時間。', 'travel', 2, 12)]),
  { ...ancestry('demigod', 'divine', '반신', 'Demigod', '半神', '神に連なる大きな生命力と魔力を持つ。力と知力も高いが、敏捷と運には弱点がある。', 0.08, { hp: 60, mp: 40, strength: 6, intelligence: 4, vitality: 3, agility: -2, luck: -3 }, ['tower', 'ruin'], [skill('demigod-aegis', '神性の加護', 'passive', '受ける被害を5軽減する。', 'guard', 5), skill('demigod-awaken', '神血の覚醒', 'active', '次の力判定を7強化する。', 'check', 7, 18, 'strength')]), rarity: '伝説' },
  { ...ancestry('true-dragon', 'dragonkin', '진룡', 'True Dragon', '真竜', '竜そのものの強い生命力と魔力を持つ。力と体力に秀でるが、重い体と低い運が旅を難しくする。', 0.07, { hp: 80, mp: 50, strength: 7, intelligence: 3, vitality: 4, agility: -4, luck: -3 }, ['volcano', 'mountain'], [skill('true-dragon-scales', '真竜の鱗', 'passive', '受ける被害を5軽減する。', 'guard', 5), skill('true-dragon-roar', '真竜の咆哮', 'active', '次の力判定を7強化する。', 'check', 7, 20, 'strength')]), rarity: '伝説' },
  { ...ancestry('elder-dragon', 'dragonkin', '고룡', 'Elder Dragon', '古竜', '長い時を生きた竜。強大なHP・MPと学識を持つ反面、敏捷と運は大きく低い。', 0.04, { hp: 100, mp: 70, strength: 8, intelligence: 6, vitality: 5, agility: -5, luck: -5 }, ['ruin', 'mountain'], [skill('elder-dragon-wisdom', '古竜の叡智', 'passive', '知力判定に4の補正を得る。', 'check', 4, 0, 'intelligence'), skill('elder-dragon-ward', '古竜の守護', 'active', '次に受ける被害を16軽減する。', 'guard', 16, 22)]), rarity: '伝説' },
  { ...ancestry('archangel', 'otherworld', '대천사', 'Archangel', '大天使', '強い光と豊かな魔力を帯びる天上の民。知力と体力に優れるが、力と運には偏りがある。', 0.06, { hp: 40, mp: 65, intelligence: 6, vitality: 3, agility: 2, strength: -3, luck: -2 }, ['tower', 'snow'], [skill('archangel-halo', '大光輪の守り', 'passive', '受ける被害を4軽減する。', 'guard', 4), skill('archangel-grace', '天上の癒やし', 'active', '自身のHPを55回復する。', 'heal', 55, 20)]), rarity: '伝説' },
  { ...ancestry('archdemon', 'otherworld', '상위마족', 'Archdemon', '上位魔族', '濃密な魔力を宿す上位の魔族。力と知力は高いが、運と敏捷には弱点がある。', 0.05, { hp: 50, mp: 60, strength: 6, intelligence: 5, vitality: 2, luck: -5, agility: -2 }, ['volcano', 'ruin'], [skill('archdemon-insight', '深魔の洞察', 'passive', '知力判定に4の補正を得る。', 'check', 4, 0, 'intelligence'), skill('archdemon-command', '魔威の宣言', 'active', '次のカリスマ判定を7強化する。', 'check', 7, 18, 'charisma')]), rarity: '伝説' },
  { ...ancestry('phoenix', 'spirit', '불사조', 'Phoenix', '不死鳥', '再生の炎をまとう精霊。豊かなMPと敏捷を持つが、力と体力は低い。再生はHP回復として働き、倒れたときの救助規則は共通。', 0.04, { hp: 20, mp: 75, intelligence: 5, agility: 5, vitality: -3, strength: -4 }, ['volcano', 'forest'], [skill('phoenix-embers', '消えない火種', 'passive', '受ける被害を4軽減する。', 'guard', 4), skill('phoenix-renewal', '再生の炎', 'active', '自身のHPを65回復する。', 'heal', 65, 22)]), rarity: '伝説' },
  { ...ancestry('voidborn', 'otherworld', '공허족', 'Voidborn', '虚空の民', '境界の空白に縁を持つ稀な民。知力・運・MPが高い一方、力と体力は低い。', 0.02, { hp: 30, mp: 80, intelligence: 7, luck: 4, strength: -5, vitality: -3, agility: -1 }, ['ruin', 'tower'], [skill('voidborn-memory', '空白を読む記憶', 'passive', '知力判定に4の補正を得る。', 'check', 4, 0, 'intelligence'), skill('voidborn-passage', '境界の道筋', 'active', '次の旅を4時間短縮する。最低1時間。', 'travel', 4, 18)]), rarity: '伝説' },
  ...APPROVED_RACES,
];

const ORDINARY_JOBS: Omit<FantasyJob, 'names' | 'category'>[] = [
  { id: 'adventurer', name: '冒険者', description: '依頼を受け、未知の道と遺跡を切り拓く。', stat: 'strength', skills: [skill('adventurer-camp', '野営の心得', 'passive', '旅の危険による被害を少し減らす。', 'guard', 2), skill('adventurer-resolve', '決死の一歩', 'active', '次の力の判定を強化する。', 'check', 4, 8, 'strength')], eventIds: ['adventurer-ruins', 'adventurer-rescue', 'adventurer-beast'] },
  { id: 'merchant', name: '商人', description: '相場を読み、街から街へ品物と噂を運ぶ。', stat: 'charisma', extra: 'charisma', skills: [skill('merchant-market', '相場の目', 'passive', '仕事と探索の報酬を少し増やす。', 'reward', 2), skill('merchant-bargain', 'ここ一番の交渉', 'active', '次のカリスマ判定を強化する。', 'check', 4, 6, 'charisma')], eventIds: ['merchant-peddler', 'merchant-caravan', 'merchant-bandits'] },
  { id: 'blacksmith', name: '鍛冶師', description: '鉱石から道具や武具を作る、街を支える職人。', stat: 'dexterity', extra: 'dexterity', skills: [skill('blacksmith-eye', '鋼の見極め', 'passive', '手先を使う制作判定を助ける。', 'check', 2, 0, 'dexterity'), skill('blacksmith-forge', '精密鍛造', 'active', '次の手先判定を強化する。', 'check', 4, 8, 'dexterity')], eventIds: ['blacksmith-repair', 'blacksmith-blade', 'blacksmith-court'] },
  { id: 'cook', name: '料理人', description: '土地の食材を使い、人々の体と心を温める。', stat: 'dexterity', extra: 'dexterity', skills: [skill('cook-sense', '食材の目利き', 'passive', '手先の調理判定に2の補正を得る。料理人の間は食品の経過時間・保存目安・栄養・品質を見分ける。', 'check', 2, 0, 'dexterity'), skill('cook-feast', '心尽くしの一皿', 'active', '自身のHPを回復する。', 'heal', 22, 8)], eventIds: ['cook-contest', 'cook-order', 'cook-palace'] },
  { id: 'alchemist', name: '錬金術師', description: '草木と鉱物を調合し、不思議な薬を生み出す。', stat: 'intelligence', extra: 'dexterity', skills: [skill('alchemist-notes', '調合の覚え書き', 'passive', '知力による研究や制作判定を助ける。', 'check', 2, 0, 'intelligence'), skill('alchemist-mixture', '応急調合', 'active', '自身のHPを回復する。', 'heal', 20, 7)], eventIds: ['alchemist-trial', 'alchemist-spring', 'alchemist-moon'] },
  { id: 'hunter', name: '狩人', description: '足跡を追い、野の恵みと集落の安全を守る。', stat: 'agility', skills: [skill('hunter-tracks', '足跡読み', 'passive', '敏捷を使う探索判定を助ける。', 'check', 2, 0, 'agility'), skill('hunter-focus', '静かな集中', 'active', '次の敏捷判定を強化する。', 'check', 4, 7, 'agility')], eventIds: ['hunter-rare', 'hunter-wolves', 'hunter-poacher'] },
  { id: 'bard', name: '吟遊詩人', description: '歌と物語を集め、街や宮廷に喜びを運ぶ。', stat: 'charisma', extra: 'charisma', skills: [skill('bard-rumors', '街角の噂', 'passive', 'カリスマ判定を少し助ける。', 'check', 2, 0, 'charisma'), skill('bard-courage', '勇気の歌', 'active', '次のカリスマ判定を強化する。', 'check', 4, 7, 'charisma')], eventIds: ['bard-festival', 'bard-epic', 'bard-banquet'] },
  { id: 'mage', name: '魔術師', description: '魔力と古代文字を研究し、失われた謎に挑む。', stat: 'intelligence', skills: [skill('mage-analysis', '魔力解析', 'passive', '知力を使う判定を助ける。', 'check', 2, 0, 'intelligence'), skill('mage-insight', '秘術のひらめき', 'active', '次の知力判定を強化する。', 'check', 4, 9, 'intelligence')], eventIds: ['mage-exam', 'mage-artifact', 'mage-rift'] },
  { id: 'leader', name: '指導者', description: '人々の話に耳を傾け、集落や開拓団を導く。', stat: 'charisma', extra: 'charisma', skills: [skill('leader-trust', '積み重ねた信頼', 'passive', '仕事と探索の報酬を少し増やす。', 'reward', 1), skill('leader-rally', '士気高揚', 'active', '次のカリスマ判定を強化する。', 'check', 4, 8, 'charisma')], eventIds: ['leader-dispute', 'leader-settlement', 'leader-defense'] },
];

const jobNames: Record<string, [string, string]> = {
  adventurer: ['모험가', 'Adventurer'], merchant: ['상인', 'Merchant'], blacksmith: ['대장장이', 'Blacksmith'], cook: ['요리사', 'Cook'],
  alchemist: ['연금술사', 'Alchemist'], healer: ['치유사', 'Healer'], hunter: ['사냥꾼', 'Hunter'], bard: ['음유시인', 'Bard'], mage: ['마법사', 'Mage'], leader: ['지도자', 'Leader'],
};
const crimeJob = (id: string, ko: string, en: string, name: string, description: string, stat: FantasyStat, skills: FantasySkill[], eventIds: string[], extra?: 'dexterity' | 'charisma'): FantasyJob => ({ id, name, names: raceNames(ko, en, name), category: 'crime', description, stat, skills, eventIds, ...(extra ? { extra } : {}) });
const BASE_FANTASY_JOBS: FantasyJob[] = [
  { id: 'unassigned', name: '無職', names: raceNames('무직', 'Unaffiliated', '無職'), category: 'none', description: 'まだ所属や専門を決めていない。無料の手伝いで暮らしをつなぎ、ギルドや師匠、GMの提案から職業を得られる。', stat: 'vitality', skills: [], eventIds: [] },
  ...ORDINARY_JOBS.map(job => ({ ...job, names: raceNames(jobNames[job.id][0], jobNames[job.id][1], job.name), category: 'ordinary' as const })),
  crimeJob('thief', '도둑', 'Thief', '盗賊', '人混みや隠された品を読む裏稼業。敏捷と手先を使い、危険な取引に関わる。', 'agility', [skill('thief-fingers', '素早い指先', 'passive', '敏捷判定に2の補正を得る。', 'check', 2, 0, 'agility'), skill('thief-chance', '一瞬の好機', 'active', '次の運判定を4強化する。', 'check', 4, 7, 'luck')], ['thief-market', 'thief-cache', 'thief-guild'], 'dexterity'),
  crimeJob('smuggler', '밀수업자', 'Smuggler', '密輸人', '表に出せない荷と情報を扱う運び手。交渉と段取りが頼りになる。', 'charisma', [skill('smuggler-margin', '裏荷の目利き', 'passive', '仕事や採集などの成果を1増やす。', 'reward', 1), skill('smuggler-talk', '通り抜ける交渉', 'active', '次のカリスマ判定を4強化する。', 'check', 4, 8, 'charisma')], ['smuggler-border', 'smuggler-cargo', 'smuggler-contact'], 'charisma'),
  crimeJob('assassin', '암살자', 'Assassin', '暗殺者', '追跡と静かな行動を得意とする危険な裏稼業。行動の選択は本人に委ねられる。', 'agility', [skill('assassin-patience', '影の忍耐', 'passive', '敏捷判定に2の補正を得る。', 'check', 2, 0, 'agility'), skill('assassin-retreat', '退路の備え', 'active', '次に受ける被害を8軽減する。', 'guard', 8, 9)], ['assassin-contract', 'assassin-shadow', 'assassin-retreat']),
  crimeJob('bandit', '산적', 'Bandit', '山賊', '山道と荒野を拠点にする裏稼業。力を振るうか、別の解決を選ぶかは本人次第。', 'strength', [skill('bandit-toughness', '荒野の頑健', 'passive', '受ける被害を2軽減する。', 'guard', 2), skill('bandit-intimidate', '山道の威勢', 'active', '次の力判定を4強化する。', 'check', 4, 8, 'strength')], ['bandit-ambush', 'bandit-camp', 'bandit-share']),
  crimeJob('spy', '첩자', 'Spy', '密偵', '身分と記録を慎重に扱う情報の担い手。知力とカリスマを使い分ける。', 'intelligence', [skill('spy-patterns', '記録の行間', 'passive', '知力判定に2の補正を得る。', 'check', 2, 0, 'intelligence'), skill('spy-cover', '揺るがぬ表情', 'active', '次のカリスマ判定を4強化する。', 'check', 4, 8, 'charisma')], ['spy-record', 'spy-cover', 'spy-message'], 'charisma'),
  crimeJob('crimeboss', '범죄조직 두목', 'Crime Boss', '裏社会の頭領', '裏の人脈と取り決めをまとめる立場。カリスマで利害を調整する。', 'charisma', [skill('crimeboss-network', '裏の人脈', 'passive', '仕事や採集などの成果を2増やす。', 'reward', 2), skill('crimeboss-command', '頭領の采配', 'active', '次のカリスマ判定を5強化する。', 'check', 5, 10, 'charisma')], ['crimeboss-dispute', 'crimeboss-network', 'crimeboss-truce'], 'charisma'),
  FANTASY_PRIEST_JOB, ...APPROVED_JOBS,
];

export const FANTASY_JOBS: FantasyJob[] = BASE_FANTASY_JOBS.map(job => ({ ...job, skills: [
  ...job.skills.map(skill => ({ ...skill, ...(FANTASY_SKILL_METADATA_OVERRIDES[skill.id] ?? {}) })),
  ...(FANTASY_JOB_SKILL_EXPANSIONS[job.id] ?? []),
] }));

export const FANTASY_LOCATIONS: FantasyLocation[] = [
  { id: 'hearth', name: '炉火の街ハース', region: '中央街道', land: 'aurelia', x: 285, y: 340, kind: 'city', danger: 0, description: '冒険者と職人が集う、すべての旅の出発点。宿、工房、港、転移門がある。', resources: ['herb', 'wood'], services: ['guild', 'market', 'workshop', 'inn', 'port', 'gate'] },
  { id: 'greenwood', name: '翠葉の森', region: '西の森林帯', land: 'aurelia', x: 205, y: 255, kind: 'forest', danger: 1, description: '木漏れ日の下に薬草と香木が育つ。古い道標が旅人を導く。', resources: ['herb', 'wood', 'meat'], services: [] },
  { id: 'whispergrove', name: '囁きの樹庭', region: '西の森林帯', land: 'aurelia', x: 125, y: 205, kind: 'forest', danger: 2, description: '樹花の精が守る深い森。風の声を聞けば珍しい香草に出会える。', resources: ['herb', 'spice', 'wood', 'meat'], services: [] },
  { id: 'ironridge', name: '鉄冠山脈', region: '北の山岳帯', land: 'aurelia', x: 285, y: 160, kind: 'mountain', danger: 2, description: '雪の峰の下に豊かな鉄鉱脈が眠る。足場の確認を忘れずに。', resources: ['ore', 'gem'], services: [] },
  { id: 'emberhall', name: '鍛都エンバーホール', region: '北の山岳帯', land: 'aurelia', x: 355, y: 225, kind: 'city', danger: 0, description: '山ドワーフの炉が昼夜燃える工房都市。鍛冶の依頼が絶えない。', resources: ['ore', 'wood'], services: ['guild', 'market', 'workshop', 'inn'] },
  { id: 'deepcave', name: '青晶の洞窟', region: '北の山岳帯', land: 'aurelia', x: 385, y: 120, kind: 'cave', danger: 3, description: '青い結晶が灯る地下道。崩落の音と水脈の響きが交差する。', resources: ['crystal', 'ore', 'gem'], services: [] },
  { id: 'sunmeadow', name: '陽だまり牧草地', region: '中央街道', land: 'aurelia', x: 190, y: 370, kind: 'forest', danger: 1, description: '畑と小さな牧場が続く平和な土地。野草と季節の香辛料が採れる。', resources: ['herb', 'spice', 'wood', 'meat'], services: ['inn'] },
  { id: 'reedfen', name: '銀葦の湿原', region: '南の水郷', land: 'aurelia', x: 205, y: 460, kind: 'swamp', danger: 2, description: '銀色の葦が揺れる薬草の宝庫。水面の下には古い石畳がある。', resources: ['herb', 'fish', 'spice'], services: [] },
  { id: 'tidehaven', name: '潮待ち港', region: '南の水郷', land: 'aurelia', x: 340, y: 475, kind: 'coast', danger: 0, description: '漁師と行商人の港町。海の向こうへ向かう船を待てる。', resources: ['fish', 'spice'], services: ['market', 'inn', 'port'] },
  { id: 'suncourt', name: '白日王都ソルネ', region: '東の王領', land: 'aurelia', x: 425, y: 350, kind: 'city', danger: 0, description: '石造りの宮廷と大市が並ぶ王都。職人の腕を競う祭りが開かれる。', resources: ['silk', 'spice'], services: ['guild', 'market', 'workshop', 'inn', 'gate'] },
  { id: 'oldwatch', name: '風化した見張り城', region: '東の王領', land: 'aurelia', x: 475, y: 265, kind: 'ruin', danger: 3, description: 'かつて街道を守った古城。記録の断片と眠る財宝が残されている。', resources: ['relic', 'ore'], services: [] },
  { id: 'starspire', name: '星詠みの塔', region: '東の王領', land: 'aurelia', x: 485, y: 420, kind: 'tower', danger: 2, description: '星の動きと失われた転移術を研究する塔。弟子たちが触媒を求めている。', resources: ['crystal', 'relic'], services: ['workshop'] },
  { id: 'dawnport', name: '東岸港アサギ', region: 'ノクティス南岸', land: 'noctis', x: 710, y: 370, kind: 'city', danger: 0, description: '二つの大陸を結ぶ東の港。織物と香辛料が市場を彩る。', resources: ['fish', 'silk'], services: ['guild', 'market', 'workshop', 'inn', 'port'] },
  { id: 'mooncity', name: '月都ルネリア', region: 'ノクティス内陸', land: 'noctis', x: 800, y: 255, kind: 'city', danger: 0, description: '月影族の書庫と静かな市場がある都。月光の門が遠方とつながる。', resources: ['silk', 'crystal'], services: ['guild', 'market', 'workshop', 'inn', 'gate'] },
  { id: 'duskmire', name: '薄暮の沼', region: 'ノクティス南岸', land: 'noctis', x: 820, y: 420, kind: 'swamp', danger: 3, description: '夜光草と漂う霧の沼地。希少な薬草の陰に足場の罠がある。', resources: ['herb', 'crystal'], services: [] },
  { id: 'glassdesert', name: '玻璃砂漠', region: 'ノクティス東部', land: 'noctis', x: 900, y: 330, kind: 'desert', danger: 3, description: '星の光を映す硝子の砂丘。埋もれた交易路から遺物が見つかる。', resources: ['spice', 'relic', 'gem'], services: [] },
  { id: 'ashpeak', name: '燠火の火山', region: 'ノクティス東部', land: 'noctis', x: 900, y: 165, kind: 'volcano', danger: 4, description: '竜血族が見守る活火山。熱い岩肌に強い金属と赤い結晶が育つ。', resources: ['ore', 'crystal', 'gem'], services: [] },
  { id: 'frostpass', name: '白霧峠', region: 'ノクティス北部', land: 'noctis', x: 795, y: 100, kind: 'snow', danger: 3, description: '白い霧が稜線を包む峠。雪の下に古代の巡礼道が続く。', resources: ['herb', 'ore', 'relic'], services: [] },
  { id: 'eclipsevault', name: '月蝕の地下宮', region: 'ノクティス北部', land: 'noctis', x: 695, y: 185, kind: 'ruin', danger: 4, description: '夜空を写す壁画が残る地下宮殿。奥には忘れられた観測記録が眠る。', resources: ['relic', 'crystal', 'gem'], services: [] },
  { id: 'glass-isle', name: '硝子珊瑚島', region: '境界の群島', land: 'islands', x: 565, y: 245, kind: 'island', danger: 2, description: '透明な珊瑚と浅瀬の島。潮の民が小船で結晶を集めている。', resources: ['fish', 'crystal', 'gem'], services: ['port'] },
  { id: 'drift-isle', name: '漂泊の浮島', region: '境界の群島', land: 'islands', x: 560, y: 90, kind: 'island', danger: 3, description: '空に浮かぶ島。係留塔には飛行船が停まり、古い航海記録も残っている。', resources: ['crystal', 'wood', 'relic'], services: ['port'] },
  { id: 'mushroom-isle', name: '巨茸の島', region: '境界の群島', land: 'islands', x: 585, y: 405, kind: 'island', danger: 2, description: '家ほどの茸が茂る島。料理人が探す独特の香味が採れる。', resources: ['herb', 'spice', 'wood'], services: ['port'] },
  { id: 'storm-isle', name: '雷鐘の島', region: '境界の群島', land: 'islands', x: 610, y: 515, kind: 'island', danger: 4, description: '雷を告げる鐘と古い灯台の島。嵐が磨いた鉱物が浜に転がる。', resources: ['ore', 'crystal', 'relic'], services: ['port'] },
  { id: 'echo-isle', name: 'こだまの小島', region: '境界の群島', land: 'islands', x: 520, y: 335, kind: 'island', danger: 1, description: '歌声が不思議に響く小さな島。旅の詩人と漁師が焚火を囲む。', resources: ['fish', 'wood', 'silk'], services: ['inn', 'port'] },
];

export const FANTASY_ROUTES: FantasyRoute[] = [
  { from: 'hearth', to: 'greenwood', mode: 'land', hours: 2 },
  { from: 'greenwood', to: 'whispergrove', mode: 'land', hours: 2 },
  { from: 'greenwood', to: 'ironridge', mode: 'land', hours: 3 },
  { from: 'ironridge', to: 'emberhall', mode: 'land', hours: 2 },
  { from: 'ironridge', to: 'deepcave', mode: 'land', hours: 3 },
  { from: 'emberhall', to: 'deepcave', mode: 'land', hours: 2 },
  { from: 'hearth', to: 'emberhall', mode: 'land', hours: 3 },
  { from: 'hearth', to: 'sunmeadow', mode: 'land', hours: 1 },
  { from: 'sunmeadow', to: 'reedfen', mode: 'land', hours: 2 },
  { from: 'reedfen', to: 'tidehaven', mode: 'land', hours: 2 },
  { from: 'hearth', to: 'tidehaven', mode: 'land', hours: 2 },
  { from: 'hearth', to: 'suncourt', mode: 'land', hours: 2 },
  { from: 'suncourt', to: 'oldwatch', mode: 'land', hours: 2 },
  { from: 'oldwatch', to: 'emberhall', mode: 'land', hours: 3 },
  { from: 'suncourt', to: 'starspire', mode: 'land', hours: 2 },
  { from: 'dawnport', to: 'mooncity', mode: 'land', hours: 3 },
  { from: 'dawnport', to: 'duskmire', mode: 'land', hours: 2 },
  { from: 'duskmire', to: 'glassdesert', mode: 'land', hours: 3 },
  { from: 'mooncity', to: 'glassdesert', mode: 'land', hours: 3 },
  { from: 'glassdesert', to: 'ashpeak', mode: 'land', hours: 4 },
  { from: 'mooncity', to: 'frostpass', mode: 'land', hours: 3 },
  { from: 'frostpass', to: 'ashpeak', mode: 'land', hours: 3 },
  { from: 'mooncity', to: 'eclipsevault', mode: 'land', hours: 3 },
  { from: 'eclipsevault', to: 'frostpass', mode: 'land', hours: 3 },
  { from: 'hearth', to: 'dawnport', mode: 'sea', hours: 8 },
  { from: 'tidehaven', to: 'glass-isle', mode: 'sea', hours: 4 },
  { from: 'glass-isle', to: 'dawnport', mode: 'sea', hours: 4 },
  { from: 'hearth', to: 'drift-isle', mode: 'sea', hours: 7 },
  { from: 'tidehaven', to: 'mushroom-isle', mode: 'sea', hours: 4 },
  { from: 'mushroom-isle', to: 'storm-isle', mode: 'sea', hours: 3 },
  { from: 'storm-isle', to: 'dawnport', mode: 'sea', hours: 5 },
  { from: 'hearth', to: 'echo-isle', mode: 'sea', hours: 3 },
  { from: 'echo-isle', to: 'glass-isle', mode: 'sea', hours: 2 },
  { from: 'echo-isle', to: 'mushroom-isle', mode: 'sea', hours: 2 },
  ...FANTASY_GATE_SETTLEMENTS.slice(1).map(to => ({ from: 'hearth', to, mode: 'gate' as const, hours: FANTASY_GATE_HOURS })),
];

const BASE_FANTASY_ITEMS: FantasyItem[] = [
  { id: 'herb', name: '薬草', price: 5, description: '治療や調合に使う、香りのよい野草。' },
  { id: 'ore', name: '鉄鉱石', price: 7, description: '炉で溶かして金属に変える、重い原石。' },
  { id: 'wood', name: '良質な木材', price: 4, description: '建築、炭、道具の柄に使う。' },
  { id: 'fish', name: '新鮮な魚', price: 6, description: '海や川の恵み。旅の料理にぴったり。' },
  { id: 'crystal', name: '魔晶石', price: 12, description: 'ほのかな魔力を蓄える結晶。' },
  { id: 'relic', name: '古代の遺物', price: 18, description: '研究者や収集家が求める、昔の暮らしの断片。' },
  { id: 'meal', name: '旅人のごちそう', price: 15, description: '空腹とHP・MPを回復する調理済みの食事。持ち歩く間に傷む。' },
  { id: 'meat', name: '生肉', price: 6, description: '森で手に入る肉。日持ちが短く、料理や保存食に加工できる。' },
  { id: 'bread', name: 'パン', price: 5, description: '旅に持ち歩きやすい食べ物。空腹を和らげる。' },
  { id: 'jerky', name: '干し肉', price: 14, description: '肉と香辛料で作る、長旅に向いた保存食。空腹を和らげる。' },
  { id: 'potion', name: '回復薬', price: 20, description: '使用するとHPを回復する錬金薬。' },
  { id: 'ingot', name: '鉄の延べ棒', price: 21, description: '精錬された鉄。武具や工具の材料。' },
  { id: 'blade', name: '手鍛えの剣', price: 48, description: '丁寧に鍛えた丈夫な剣。納品や売却に向く。' },
  { id: 'spice', name: '香辛料', price: 9, description: '料理と交易に使う、土地ごとに香りの違う品。' },
  { id: 'silk', name: '星絹', price: 13, description: '衣装や儀式に使う、光沢のある織物。' },
  { id: 'antidote', name: '清めの霊薬', price: 30, description: '使用するとHPとMPを少し回復する。薬師の依頼にも使う。' },
  { id: 'gem', name: '原石の宝玉', price: 24, description: '装飾品や上質な魔術触媒になる。' },
];

export const FANTASY_ITEMS: FantasyItem[] = [...BASE_FANTASY_ITEMS.map(item => ({ ...item, ...FANTASY_LEGACY_ITEM_UPDATES[item.id] })), ...FANTASY_EXPANDED_ITEMS, ...FANTASY_PROFESSION_ITEMS, ...FANTASY_ENVIRONMENT_ITEMS, ...FANTASY_TRAVEL_GOODS, ...FANTASY_COMBAT_LOOT_ITEMS];

export const FANTASY_RECIPES: FantasyRecipe[] = [
  { id: 'cook-meal', name: '旅人のごちそう', job: 'cook', inputs: { fish: 1, herb: 1 }, output: 'meal', count: 1, dc: 9 },
  { id: 'cook-banquet', name: '香草の宴', job: 'cook', inputs: { fish: 2, spice: 1, herb: 1 }, output: 'meal', count: 3, dc: 12 },
  { id: 'cook-jerky', name: '旅の干し肉', job: 'cook', inputs: { meat: 2, spice: 1 }, output: 'jerky', count: 2, dc: 10 },
  { id: 'smith-ingot', name: '鉄の精錬', job: 'blacksmith', inputs: { ore: 2, wood: 1 }, output: 'ingot', count: 1, dc: 9 },
  { id: 'smith-blade', name: '手鍛えの剣', job: 'blacksmith', inputs: { ingot: 2, wood: 1 }, output: 'blade', count: 1, dc: 13 },
  { id: 'alchemy-potion', name: '回復薬の調合', job: 'alchemist', inputs: { herb: 2 }, output: 'potion', count: 1, dc: 9 },
  { id: 'alchemy-purify', name: '清めの霊薬', job: 'alchemist', inputs: { herb: 2, crystal: 1 }, output: 'antidote', count: 1, dc: 12 },
  { id: 'healer-remedy', name: '祈祷所の薬湯', job: 'priest', inputs: { herb: 2, spice: 1 }, output: 'potion', count: 2, dc: 11 },
  { id: 'mage-refine', name: '遺物の魔晶再生', job: 'mage', inputs: { relic: 1, gem: 1 }, output: 'crystal', count: 3, dc: 13 },
  { id: 'hunter-ration', name: '狩人の携帯食', job: 'hunter', inputs: { fish: 1, spice: 1 }, output: 'meal', count: 1, dc: 10 },
  ...FANTASY_PROFESSION_RECIPES,
  ...FANTASY_ENVIRONMENT_RECIPES,
  ...FANTASY_TRAVEL_RECIPES,
];

export const FANTASY_QUESTS: FantasyQuest[] = [
  { id: 'quest-herbalist', name: '薬師の朝支度', description: '翠葉の森で薬草を集め、ハースの薬師へ持ち帰ろう。', giver: 'hearth', destination: 'greenwood', item: 'herb', count: 3, gold: 28, xp: 24 },
  { id: 'quest-timber', name: '牧場の柵を直そう', description: '陽だまり牧草地で柵を調べて木材を集め、ハースの修理担当へ渡そう。', giver: 'hearth', destination: 'sunmeadow', item: 'wood', count: 3, gold: 24, xp: 22 },
  { id: 'quest-ore', name: '山の鍛冶仲間', description: '鉄冠山脈で鉄鉱石を集め、エンバーホールの鍛冶仲間へ持ち帰ろう。', giver: 'emberhall', destination: 'ironridge', item: 'ore', count: 3, gold: 38, xp: 30 },
  { id: 'quest-crystal', name: '青い灯りの調査', description: '青晶の洞窟で魔晶石を集め、エンバーホールの調査隊へ持ち帰ろう。', giver: 'emberhall', destination: 'deepcave', item: 'crystal', count: 2, gold: 42, xp: 35 },
  { id: 'quest-fen', name: '湿原の薬棚', description: '銀葦の湿原で薬草を採り、潮待ち港の診療所へ持ち帰ろう。', giver: 'tidehaven', destination: 'reedfen', item: 'herb', count: 4, gold: 34, xp: 28 },
  { id: 'quest-fish', name: '港の夕食会', description: '潮待ち港を訪れて魚を集め、ハースの夕食会の主催者へ届けよう。', giver: 'hearth', destination: 'tidehaven', item: 'fish', count: 3, gold: 32, xp: 26 },
  { id: 'quest-court', name: '王都の食材市', description: '白日王都の食材市で香辛料を探し、ハースの料理人へ持ち帰ろう。', giver: 'hearth', destination: 'suncourt', item: 'spice', count: 3, gold: 45, xp: 30 },
  { id: 'quest-watch', name: '見張り城の記録', description: '風化した見張り城で記録の残る遺物を集め、白日王都の研究者へ持ち帰ろう。', giver: 'suncourt', destination: 'oldwatch', item: 'relic', count: 2, gold: 52, xp: 40 },
  { id: 'quest-tower', name: '星詠みの触媒', description: '星詠みの塔で触媒の性質を調べ、魔晶石を白日王都の依頼人へ持ち帰ろう。', giver: 'suncourt', destination: 'starspire', item: 'crystal', count: 3, gold: 58, xp: 42 },
  { id: 'quest-silk', name: '東の仕立て屋', description: '東岸港アサギの織物を調べて星絹を集め、ハースの仕立て屋へ持ち帰ろう。', giver: 'hearth', destination: 'dawnport', item: 'silk', count: 3, gold: 65, xp: 45 },
  { id: 'quest-moon', name: '月都の古書修復', description: '月都ルネリアで修復手順を調べ、修復材の遺物を白日王都の依頼人へ渡そう。遺物は探索か市場で用意できる。', giver: 'suncourt', destination: 'mooncity', item: 'relic', count: 3, gold: 76, xp: 52 },
  { id: 'quest-desert', name: '砂漠の交易所', description: '玻璃砂漠の交易所を訪れて香辛料を集め、東岸港アサギの商人へ持ち帰ろう。', giver: 'dawnport', destination: 'glassdesert', item: 'spice', count: 4, gold: 62, xp: 46 },
  { id: 'quest-island', name: '硝子珊瑚の標本', description: '硝子珊瑚島の浜で原石の宝玉を集め、潮待ち港の研究者へ持ち帰ろう。', giver: 'tidehaven', destination: 'glass-isle', item: 'gem', count: 2, gold: 72, xp: 48 },
  { id: 'quest-mushroom', name: '巨茸の香り', description: '巨茸の島で独特の香辛料を採り、白日王都の料理人へ持ち帰ろう。', giver: 'suncourt', destination: 'mushroom-isle', item: 'spice', count: 3, gold: 58, xp: 44 },
  { id: 'quest-storm', name: '雷鐘の修復', description: '雷鐘の島の灯台を調べ、修復用の延べ棒をエンバーホールの依頼人へ渡そう。延べ棒は鍛冶か市場で用意する。', giver: 'emberhall', destination: 'storm-isle', item: 'ingot', count: 2, gold: 92, xp: 62 },
  { id: 'quest-sword', name: '王都の護衛隊', description: '白日王都の護衛隊を訪ねて必要な剣を確かめ、手鍛えの剣をエンバーホールの依頼人へ渡そう。剣は鍛冶か市場で用意する。', giver: 'emberhall', destination: 'suncourt', item: 'blade', count: 1, gold: 78, xp: 45 },
  ...FANTASY_PROFESSION_QUESTS, ...APPROVED_QUESTS,
  ...FANTASY_MAIN_QUESTS, ...FANTASY_SIDE_QUESTS,
  ...FANTASY_TASK_QUESTS,
];

const choice = (id: string, label: string, stat: FantasyStat, dc: number, success: string, failure: string, gold: number, item?: string) => ({ id, label, stat, dc, success, failure, gold, ...(item ? { item } : {}) });

const crimeEvent = (id: string, job: string, name: string, description: string, first: string, stat: FantasyStat, second: string, alternative: FantasyStat, item: string): FantasyEvent => ({
  id, job, name, description, choices: [
    choice('careful', first, stat, 12, '段取りが実を結び、今回の取り分を受け取った。', '思惑は外れたが、無理をせず次の手を考えることにした。', 24, item),
    choice('alternative', second, alternative, 13, '別の道を選んだ判断が役立ち、話をまとめられた。', '相手の反応を読み違え、今回は引いて仕切り直した。', 28, item),
  ],
});
const CRIME_EVENTS: FantasyEvent[] = [
  crimeEvent('thief-market', 'thief', '雑踏の落とし物', '混雑した市で、裏の仲間が置いた包みの回収を頼まれた。', '人波を読んで進む', 'agility', '包みの目印を見分ける', 'intelligence', 'silk'),
  crimeEvent('thief-cache', 'thief', '忘れられた隠し場所', '古い隠し場所に、引き取り手のない品が残っているらしい。', '足場を確かめて近づく', 'agility', '記された順序を解く', 'dexterity', 'relic'),
  crimeEvent('thief-guild', 'thief', '盗賊仲間の試し', '裏の仲間から、品物を傷めず回収する腕を試される。', '手先の丁寧さを見せる', 'dexterity', '慎重な身のこなしで応じる', 'agility', 'gem'),
  crimeEvent('smuggler-border', 'smuggler', '閉じた街道', '表の街道が閉ざされ、荷の扱いを巡って依頼人が困っている。', '条件を交渉する', 'charisma', '別の日程を組み直す', 'intelligence', 'spice'),
  crimeEvent('smuggler-cargo', 'smuggler', '持ち主を伏せた荷', '名を出したくない客が、荷の引き渡しを持ちかけてきた。', '受け渡しの約束を固める', 'charisma', '荷と記録の食い違いを調べる', 'intelligence', 'silk'),
  crimeEvent('smuggler-contact', 'smuggler', '港の仲介人', '港の仲介人が取り分を変えようとしている。話し合いが必要だ。', '互いの利益を整理する', 'charisma', '帳面から根拠を示す', 'intelligence', 'gem'),
  crimeEvent('assassin-contract', 'assassin', '危うい依頼', '危険な標的の追跡を頼まれた。依頼をどう扱うか判断する。', '距離を保って様子を見る', 'agility', '依頼の矛盾を調べる', 'intelligence', 'crystal'),
  crimeEvent('assassin-shadow', 'assassin', '影を追う者', '追跡中、自分も誰かに見られていると気づいた。', '静かに追跡を切り上げる', 'agility', '相手の目的を読み取る', 'intelligence', 'relic'),
  crimeEvent('assassin-retreat', 'assassin', '引き際の判断', '話が変わり、無関係な旅人が危険に巻き込まれそうだ。', '安全な離脱を優先する', 'agility', '依頼を断る根拠を伝える', 'intelligence', 'potion'),
  crimeEvent('bandit-ambush', 'bandit', '山道の取り分', '山道で止まった荷車を巡り、仲間同士の意見が割れた。', '力仕事で荷車を動かす', 'strength', '争わない条件を示す', 'charisma', 'wood'),
  crimeEvent('bandit-camp', 'bandit', '荒野の野営', '荒れた天気の中、仲間の野営場所を整える必要がある。', '頑丈な支えを組む', 'strength', '最後まで作業を支える', 'vitality', 'meal'),
  crimeEvent('bandit-share', 'bandit', '仲間割れの気配', '取り分を巡る口論が大きくなった。集まりを落ち着かせたい。', '作業を引き受けて場を変える', 'strength', '双方の言い分を聞く', 'charisma', 'ore'),
  crimeEvent('spy-record', 'spy', '記録の食い違い', '二つの記録で日付が違う。どちらが信頼できるか確かめる。', '記述を照合する', 'intelligence', '記録係から話を聞く', 'charisma', 'relic'),
  crimeEvent('spy-cover', 'spy', '借りた肩書', '人前で自分の立場を説明する場面が訪れた。慎重な言葉が要る。', '事前の情報を整理する', 'intelligence', '落ち着いた受け答えをする', 'charisma', 'silk'),
  crimeEvent('spy-message', 'spy', '届かなかった伝言', '預かった伝言と、受取人の話が一致しない。誤解を解く必要がある。', '伝言の前後関係を調べる', 'intelligence', '相手の懸念を聞き出す', 'charisma', 'crystal'),
  crimeEvent('crimeboss-dispute', 'crimeboss', '裏の取り決め', '裏の取引で約束が食い違い、仲介を求められた。', '双方が守れる条件を示す', 'charisma', '過去の取り決めを調べる', 'intelligence', 'gem'),
  crimeEvent('crimeboss-network', 'crimeboss', '人脈の綻び', '連絡役が行き違いを起こし、取引の予定が乱れている。', '役割を整理して伝える', 'charisma', '予定を組み直す', 'intelligence', 'silk'),
  crimeEvent('crimeboss-truce', 'crimeboss', '短い休戦', '対立する相手から、争いを止める話し合いを求められた。', '話し合いの場をまとめる', 'charisma', '続けられる条件を計算する', 'intelligence', 'ingot'),
];

export const FANTASY_EVENTS: FantasyEvent[] = [
  { id: 'adventurer-ruins', job: 'adventurer', name: '扉の向こうの依頼', description: '小さな遺跡の石扉が開かず、調査隊が困っている。', choices: [choice('force', '仲間と扉を押し開ける', 'strength', 12, '扉が動き、調査隊が安全に入れた。', '扉は動かなかった。別の入口を探すことになった。', 24, 'relic'), choice('read', '壁の古代文字を調べる', 'intelligence', 13, '仕掛けを解き、正しい手順を記録した。', '文字の一部が失われ、解読は持ち越しになった。', 28, 'crystal')] },
  { id: 'adventurer-rescue', job: 'adventurer', name: '霧の中の呼び声', description: '帰らない薬草採りを探してほしいと頼まれた。遠くで鐘が鳴る。', choices: [choice('track', '小さな足跡を追う', 'agility', 11, '沢のほとりで薬草採りを見つけ、無事に送り届けた。', '霧で道を見失ったが、捜索隊に足跡の位置を伝えた。', 22, 'herb'), choice('endure', '尾根から一帯を見渡す', 'vitality', 12, '尾根から助けを求める姿を見つけた。', '疲れで尾根に届かず、安全を優先して引き返した。', 26, 'meal')] },
  { id: 'adventurer-beast', job: 'adventurer', name: '橋を塞ぐ牙獣', description: '大きな獣が街道の橋に居座っている。渡りたい旅人が列を作った。', choices: [choice('drive', '盾を鳴らして追い払う', 'strength', 13, '獣は森へ退き、街道が再び開いた。', '獣は動かず、旅人を安全な迂回路へ案内した。', 32, 'ore'), choice('lure', '食べ物で森へ誘う', 'intelligence', 12, '獣の好物がわかり、争わずに橋を空けられた。', '餌には興味を示さず、作戦を練り直すことになった。', 26, 'herb')] },
  { id: 'merchant-peddler', job: 'merchant', name: '村祭りの行商', description: '収穫祭の広場に小さな売り場を出せる。何を売り込もうか。', choices: [choice('pitch', '品物の使い方を楽しく語る', 'charisma', 10, '人だかりができ、持ち込んだ品がよく売れた。', '声が広場の音に埋もれ、売り場の工夫を学んだ。', 20, 'spice'), choice('trend', '売れ筋を見て並べ替える', 'intelligence', 12, '村の需要を読み、ちょうど必要な品を揃えた。', '売れ筋の予想は外れたが、次の祭りの情報を得た。', 26, 'silk')] },
  { id: 'merchant-caravan', job: 'merchant', name: '隊商への誘い', description: '隣の街へ向かう隊商が共同仕入れの相手を探している。', choices: [choice('bargain', '取り分と護衛費を交渉する', 'charisma', 12, '互いに納得する契約がまとまり、交易が実を結んだ。', '条件が合わず、今回は小口の取引で様子を見た。', 32, 'silk'), choice('forecast', '価格と天候から荷を選ぶ', 'intelligence', 13, '品薄になる品を先読みし、よい取引ができた。', '予想より相場が安く、帳簿を見直すことにした。', 36, 'spice')] },
  { id: 'merchant-bandits', job: 'merchant', name: '街道の通行料', description: '荷車の前に盗賊が現れ、不当な通行料を要求した。', choices: [choice('talk', '追跡隊の噂を交えて交渉する', 'charisma', 13, '盗賊は面倒を避けて引き下がり、荷を守れた。', '話し合いはまとまらず、護衛の合流を待った。', 24, 'wood'), choice('escape', '脇道を使って荷車を逃がす', 'agility', 13, '脇道を抜け、荷物を無事に宿場へ届けた。', '泥に車輪がはまり、遠回りをして事態を切り抜けた。', 28, 'silk')] },
  { id: 'blacksmith-repair', job: 'blacksmith', name: '鉱山の緊急修理', description: '鉱石運びの滑車が壊れた。交代の鉱夫が修理を待っている。', choices: [choice('precise', '部品を丁寧に削って合わせる', 'dexterity', 11, '滑車が滑らかに回り、作業が再開した。', '部品の寸法が合わず、先輩職人とやり直した。', 24, 'ore'), choice('brace', '頑丈な補強金具を打つ', 'strength', 12, '丈夫な金具で安全を取り戻した。', '金具が厚すぎた。軽くする工夫を教わった。', 26, 'ingot')] },
  { id: 'blacksmith-blade', job: 'blacksmith', name: '旅立つ剣士の注文', description: '若い剣士が、自分の手に合う一振りを頼みに来た。', choices: [choice('balance', '握りと重心を細かく調整する', 'dexterity', 13, '剣士は剣を一振りし、満面の笑みを見せた。', '重心が合わず、試作品を元に調整を重ねた。', 34, 'blade'), choice('study', '使い方を聞いて設計する', 'intelligence', 12, '剣士の戦い方にぴったりの設計ができた。', '好みの聞き取りが足りず、図面を描き直した。', 28, 'ingot')] },
  { id: 'blacksmith-court', job: 'blacksmith', name: '王室工房の審査', description: '王室の道具を納める職人選びが始まった。審査官が作業を見守る。', choices: [choice('masterpiece', '細部まで整えた作品を作る', 'dexterity', 15, '確かな仕上がりが評価され、試験納入を任された。', '審査には届かなかったが、改善すべき点を教わった。', 38, 'gem'), choice('practical', '丈夫で直しやすい設計を示す', 'intelligence', 13, '現場を考えた設計が認められた。', '設計の説明が届かず、使い方の実演を準備することにした。', 30, 'ingot')] },
  { id: 'cook-contest', job: 'cook', name: '街角の料理大会', description: '広場の料理大会。地元の食材を使った一皿が課題だ。', choices: [choice('technique', '火加減と盛り付けで勝負する', 'dexterity', 12, '香りと見た目が評判になり、賞をもらった。', '火を入れすぎたが、審査員の助言が次につながった。', 28, 'meal'), choice('invent', '意外な食材の組み合わせを試す', 'intelligence', 13, '意外な組み合わせが新しい名物になった。', '味がまとまらず、配合を記した覚え書きを持ち帰った。', 32, 'spice')] },
  { id: 'cook-order', job: 'cook', name: '特別な夜の注文', description: '長旅から帰った家族のため、思い出の料理を再現してほしいという。', choices: [choice('listen', '故郷の味を丁寧に聞く', 'intelligence', 11, '懐かしい香りに食卓が笑顔で満たされた。', '味の記憶は曖昧だったが、家族の話が温かな時間になった。', 24, 'spice'), choice('finish', '食感と温度を心を込めて整える', 'dexterity', 12, '食べやすく温かな一皿に喜んでもらえた。', '仕上げに手間取り、次回の段取りを見直した。', 28, 'meal')] },
  { id: 'cook-palace', job: 'cook', name: '宮廷料理人への招待', description: '宮廷の晩餐で、各地を旅した料理人の一皿を出す機会が訪れた。', choices: [choice('banquet', '季節の食材で美しく仕上げる', 'dexterity', 15, '王室の食卓に採用され、厨房への再訪を約束された。', '忙しい厨房に圧倒されたが、宮廷の手順を学べた。', 38, 'silk'), choice('story', '一皿に旅の物語を添える', 'intelligence', 13, '料理と土地の物語が客たちの会話を弾ませた。', '説明が長くなり、料理を主役にする工夫を学んだ。', 30, 'spice')] },
  { id: 'alchemist-trial', job: 'alchemist', name: '新薬の試作', description: '研究所から、旅の疲れを和らげる薬の共同研究を頼まれた。', choices: [choice('theory', '既存の処方を比較する', 'intelligence', 12, '無理のない改良で安定した処方を見つけた。', '成分がぶつかり、試験記録を次の研究に残した。', 26, 'potion'), choice('measure', '滴ごとに成分を調整する', 'dexterity', 13, '正確な調合で透き通った薬が完成した。', '一滴の差で濁りが出た。手順を見直した。', 30, 'herb')] },
  { id: 'alchemist-spring', job: 'alchemist', name: '濁った泉', description: '村の泉が奇妙な色に濁った。水を飲まずに原因を調べよう。', choices: [choice('analyze', '水と土を採って分析する', 'intelligence', 13, '上流の鉱物が原因とわかり、安全な浄化法を伝えた。', '分析では絞り切れず、村に別の水源を案内した。', 32, 'antidote'), choice('filter', '層を重ねた濾過器を作る', 'dexterity', 12, '濾過器が役立ち、村は安全な水を確保できた。', '流れが詰まり、材料を替えて試すことになった。', 26, 'crystal')] },
  { id: 'alchemist-moon', job: 'alchemist', name: '月光の触媒', description: '月に一度だけ採れる露を使い、特別な触媒を作る夜が来た。', choices: [choice('formula', '月の動きに合わせて調合する', 'intelligence', 14, '露が安定し、美しい結晶の触媒になった。', '月が雲に隠れ、次の満月へ記録を残した。', 36, 'crystal'), choice('steady', '冷えた器を揺らさず保つ', 'dexterity', 13, '繊細な温度を保ち、触媒を確保できた。', '温度が上がり、普通の薬用水として活用した。', 30, 'potion')] },
  { id: 'hunter-rare', job: 'hunter', name: '銀角の足跡', description: '珍しい銀角鹿の目撃情報。森の番人は、生息地の確認だけを望んでいる。', choices: [choice('quiet', '風下から静かに追う', 'agility', 12, '鹿を驚かせず生息地を記録し、落ちた角の欠片を拾った。', '物音で姿を見失い、足跡の記録を持ち帰った。', 28, 'gem'), choice('signs', '食痕と水場を調べる', 'intelligence', 12, '食痕から生息地がわかり、保護の目印を作れた。', '別の獣の跡が混じり、調査を続けることになった。', 26, 'herb')] },
  { id: 'hunter-wolves', job: 'hunter', name: '牧場を囲む影', description: '夜の牧場に群れが近づく。家畜と野生の双方を傷つけず追い払いたい。', choices: [choice('patrol', '高い場所から動きを見張る', 'agility', 13, '接近する場所がわかり、明かりと音で群れを遠ざけた。', '群れが散らばり、牧場主と交代で見張りを続けた。', 30, 'fish'), choice('fence', '柵と警告用の仕掛けを補強する', 'strength', 12, '頑丈な柵が役立ち、家畜は無事に朝を迎えた。', '補強が間に合わず、家畜を納屋へ避難させた。', 26, 'wood')] },
  { id: 'hunter-poacher', job: 'hunter', name: '禁猟地の罠', description: '禁猟の森に仕掛けられた罠を見つけた。番人へ知らせる前に道を守ろう。', choices: [choice('disable', '罠を見極めて解除する', 'agility', 13, '罠を安全に外し、番人に場所と証拠を伝えた。', '仕組みがわからず、周囲に警告を立てて番人を待った。', 30, 'ore'), choice('read', '足跡から仕掛けた範囲を推測する', 'intelligence', 12, '罠のある道筋を地図に残し、巡回に役立てた。', '雨で跡が流れており、見える罠だけを記録した。', 26, 'relic')] },
  { id: 'bard-festival', job: 'bard', name: '収穫祭の舞台', description: '村の祭りで歌うことになった。広場では子どもも大人も待っている。', choices: [choice('sing', '誰もが歌える歌を選ぶ', 'charisma', 10, '広場が大合唱になり、温かな拍手に包まれた。', '村に馴染みのない歌だったが、新しい歌として覚えてもらえた。', 20, 'meal'), choice('improvise', '土地の話を即興の詩にする', 'intelligence', 12, '村の出来事を織り込んだ詩が笑いを誘った。', '話を取り違え、村人に正しい物語を教わった。', 26, 'spice')] },
  { id: 'bard-epic', job: 'bard', name: '忘れられた叙事詩', description: '古い歌の最後の節を探している。旅人の記憶と石碑の文字が手掛かりだ。', choices: [choice('listen', '旅人たちから歌を聞き集める', 'charisma', 12, 'いくつもの節がつながり、失われた物語が蘇った。', '節に食い違いがあり、違いを含めた採録を残した。', 28, 'relic'), choice('decode', '石碑の韻と意味を読み解く', 'intelligence', 13, '石碑の韻から、歌の結びを見つけた。', '欠けた文字を補えず、写しを持って研究者に相談した。', 32, 'crystal')] },
  { id: 'bard-banquet', job: 'bard', name: '領主の夜会', description: '領主の宴に招かれた。各地の客が集まり、慎重な言葉選びが必要だ。', choices: [choice('charm', '客の反応に合わせて演目を変える', 'charisma', 14, '夜会の空気を読み、客たちを楽しませた。', '選曲が場に合わず、短い器楽の演奏へ切り替えた。', 36, 'silk'), choice('history', '来賓の故郷の英雄譚を語る', 'intelligence', 13, '敬意ある物語が喜ばれ、次の旅の招待を受けた。', '地方ごとの解釈が違い、来賓から新しい伝承を教わった。', 30, 'gem')] },
  { id: 'mage-exam', job: 'mage', name: '魔塔の公開試験', description: '魔術師の塔で、古い照明術を復元する試験が開かれる。', choices: [choice('runes', '術式の矛盾を見抜く', 'intelligence', 12, '欠けた式を補い、塔に柔らかな光が灯った。', '魔力が散ったが、試験官に計算の修正点を教わった。', 26, 'crystal'), choice('patience', '魔力の流れを保ち続ける', 'vitality', 13, '安定した集中で照明を維持し、合格の印を得た。', '集中が途切れ、休憩を挟んで練習を続けた。', 30, 'herb')] },
  { id: 'mage-artifact', job: 'mage', name: '落ち着かない遺物', description: '市場の遺物が勝手に音を鳴らし始めた。店主が助けを求めている。', choices: [choice('analyze', '魔力の流路を読み解く', 'intelligence', 13, '用途を突き止め、鳴り続ける仕組みを停止できた。', '古い術式で読み切れず、安全な箱に移した。', 30, 'relic'), choice('attune', '反応を観察して正しい調律を探す', 'luck', 13, '調律が合い、遺物は穏やかな音色に戻った。', '調律は合わず、記録を残して専門家を待った。', 30, 'gem')] },
  { id: 'mage-rift', job: 'mage', name: '小さな次元の綻び', description: '門の近くに小さな裂け目が生まれ、紙や帽子を吸い込んでいる。', choices: [choice('seal', '門の術式を再構成する', 'intelligence', 15, '裂け目が閉じ、吸い込まれた品も戻ってきた。', '裂け目を縮めたところで応援を呼び、作業を引き継いだ。', 38, 'crystal'), choice('anchor', '魔晶の重りで周囲を安定させる', 'vitality', 13, '安定した場を作り、管理人の封鎖を助けた。', '負担が大きく、離れた場所へ人々を誘導した。', 30, 'relic')] },
  { id: 'leader-dispute', job: 'leader', name: '水路を巡る相談', description: '隣り合う二つの畑が、同じ水路の使い方で揉めている。', choices: [choice('mediate', '双方の話を聞いて順番を決める', 'charisma', 11, '互いの事情が伝わり、水を分け合う約束ができた。', '結論は出なかったが、次の話し合いの場を用意した。', 24, 'herb'), choice('plan', '水量と時間を調べて計画を作る', 'intelligence', 12, '数字で示した計画に納得してもらえた。', '雨の予想が難しく、試験的な運用から始めた。', 28, 'wood')] },
  { id: 'leader-settlement', job: 'leader', name: '開拓団の第一歩', description: '小さな開拓団が新しい集落の準備をしている。仕事の割り振りを頼まれた。', choices: [choice('organize', '得意な仕事を聞いて班を作る', 'charisma', 13, '皆の得意分野が生き、集落の土台が整った。', '役割に偏りが出たため、団員と一緒に組み直した。', 32, 'ingot'), choice('logistics', '食料と資材の順序を決める', 'intelligence', 13, '必要な物が必要な時に届き、無駄なく作業が進んだ。', '到着が遅れた資材を待つ間に、別の仕事を進めた。', 32, 'meal')] },
  { id: 'leader-defense', job: 'leader', name: '砦の避難訓練', description: '嵐と魔物に備え、砦の守備隊が避難と連絡の訓練を行う。', choices: [choice('rally', '分かりやすい合図で人々を導く', 'charisma', 14, '混乱なく避難が進み、守備隊から信頼を得た。', '合図が届かない場所があり、連絡役を増やすことにした。', 36, 'silk'), choice('support', '最後の確認まで現場を支える', 'vitality', 13, '最後の一人まで安全を確認し、訓練を終えた。', '疲れて見落としが出たが、班を分ける改善案を残した。', 30, 'potion')] },
  ...FANTASY_PRIEST_EVENTS, ...APPROVED_EVENTS, ...FANTASY_REGIONAL_EVENTS,
  ...FANTASY_SECOND_RACIAL_EVENTS, ...FANTASY_SECOND_FAMILY_EVENTS,
  ...FANTASY_HOSTILE_ENCOUNTERS,
];

FANTASY_EVENTS.push(...CRIME_EVENTS);
FANTASY_EVENTS.push(...FANTASY_RACIAL_EVENTS);
FANTASY_QUESTS.push(...FANTASY_LINEAGE_QUESTS);

FANTASY_LOCATIONS.push(...FANTASY_EXPANSION_LOCATIONS);
FANTASY_ROUTES.push(...FANTASY_EXPANSION_ROUTES);
FANTASY_RECIPES.push(...FANTASY_EXPANDED_RECIPES);
FANTASY_RECIPES.push(...FANTASY_COMBAT_LOOT_RECIPES);
FANTASY_EVENTS.push(...FANTASY_ADDITIONAL_RACIAL_EVENTS);
FANTASY_QUESTS.push(...FANTASY_EXPANSION_QUESTS);

export const fantasyRaceById = (id: string): FantasyRace | undefined => FANTASY_RACES.find(race => race.id === id);
export const fantasyJobById = (id: string): FantasyJob | undefined => FANTASY_JOBS.find(job => job.id === id);
export const fantasyLocationById = (id: string): FantasyLocation | undefined => FANTASY_LOCATIONS.find(location => location.id === id);
export const fantasyItemById = (id: string): FantasyItem | undefined => FANTASY_ITEMS.find(item => item.id === id);
