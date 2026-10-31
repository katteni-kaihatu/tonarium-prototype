import type { FantasyMonster } from './fantasy-monsters.ts';
import type { FantasyCombatEnemyTemplate } from './fantasy-combat-catalog.ts';
import { fantasyMonsterCombatStats, type FantasyMonsterCombatRole } from './fantasy-monster-balance.ts';

export interface FantasyNavalEncounter {
  template: string; tier: 1 | 2 | 3 | 4 | 5 | 6; role: 'boarder' | 'offshore' | 'kraken';
  spawn: 'regular'; parts?: { template: string; count: number }[];
}
type Words = [ko: string, en: string, ja: string];
const words = ([ko, en, ja]: Words) => ({ ko, en, ja });
function creature(id: string, title: Words, body: Words, tier: FantasyNavalEncounter['tier'], material: string): FantasyMonster {
  const names = words(title), descriptions = words(body);
  return { id: `monster-${id}`, names, name: names.ja, descriptions, description: descriptions.ja, tier,
    dc: [0, 8, 10, 12, 14, 16, 18][tier], damage: [0, 4, 7, 10, 14, 18, 23][tier], kinds: ['coast', 'island'], minDanger: Math.max(0, tier - 3),
    loot: [{ item: material, weight: 6 }], meat: 0, navalOnly: true };
}

export const FANTASY_NAVAL_MONSTERS: FantasyMonster[] = [
  creature('deck-crab', ['갑판기어게', 'Deck-Climbing Crab', '甲板よじ登り蟹'], [
    '밧줄에 매달려 갑판으로 올라오는 작은 게. 좁은 집게로 발목을 노리지만 단단한 난간은 넘기 어렵다.',
    'A small crab climbing mooring ropes onto the deck. Its little pincers reach for ankles.',
    '綱にしがみつき甲板へよじ登る小蟹。小さな鋏で足首を狙う。',
  ], 1, 'fish'),
  creature('bilge-stalker', ['선저 잠복수', 'Bilge Stalker', '船底の潜み獣'], [
    '부유목 아래 숨었다가 젖은 선체를 타고 오르는 날렵한 해안 포식자. 갑판의 짐 사이에 숨는다.',
    'An agile coastal predator that hides beneath driftwood, climbs wet hulls and slips between deck cargo.',
    '流木の下に潜み、濡れた船腹を登って甲板の荷に隠れる素早い海辺の捕食者。',
  ], 2, 'meat'),
  creature('tide-raider', ['갈고리 물결 약탈병', 'Hookline Tide Raider', '鉤綱の潮襲撃兵'], [
    '작살과 갈고리 밧줄로 선박을 약탈하는 수륙 습격단의 전투원. 바다 민족 전체를 뜻하지 않는다.',
    'An amphibious raiding-band fighter using harpoons and grappling lines to seize cargo, not a description of all sea folk.',
    '銛と鉤綱で船荷を奪う水陸襲撃団の戦闘員。海の民全体を指すものではない。',
  ], 3, 'wood'),
  creature('reef-amphibian', ['암초 도약수', 'Reef-Leaping Amphibian', '礁跳び両生獣'], [
    '암초에서 배로 뛰어들어 넓은 앞발로 갑판을 밀어붙이는 튼튼한 수륙 포식자.',
    'A sturdy amphibious predator leaping from reefs onto passing vessels and shoving with broad forelimbs.',
    '岩礁から通る船へ飛び移り、広い前脚で甲板を押し進む頑丈な水陸の捕食者。',
  ], 4, 'fish'),
  creature('juvenile-kraken', ['어린 크라켄', 'Juvenile Kraken', '若いクラーケン'], [
    '선체 바깥에서 먹물을 뿜고 촉수를 갑판에 감는 어린 거대 두족류. 갑판 위의 촉수와 드러난 눈을 공격해 밀어낼 수 있다.',
    'A young giant cephalopod spraying ink from beyond the hull and coiling arms over the deck. Its exposed arms and eye offer a way to drive it off.',
    '船腹の外から墨を吐き、腕を甲板へ絡める若い巨大頭足類。甲板上の腕や露出した眼を狙えば退けられる。',
  ], 6, 'fish'),
];

const roles: Record<string, FantasyMonsterCombatRole> = {
  'monster-deck-crab': 'swarm', 'monster-bilge-stalker': 'skirmisher', 'monster-tide-raider': 'skirmisher',
  'monster-reef-amphibian': 'armored', 'monster-juvenile-kraken': 'beast',
};
const juvenile = fantasyMonsterCombatStats(6, 'beast');
const coreHp = Math.floor(juvenile.hp / 3) * 3;
function combatCreature(monster: FantasyMonster): FantasyCombatEnemyTemplate {
  const stats = fantasyMonsterCombatStats(monster.tier, roles[monster.id]);
  if (monster.id === 'monster-deck-crab') { stats.hp = Math.round(stats.hp * .8); stats.attack = Math.round(stats.attack * .9); }
  if (monster.id === 'monster-juvenile-kraken') { stats.hp = coreHp; stats.attack = Math.round(stats.attack * .75); }
  return { id: monster.id, names: { ...monster.names }, descriptions: { ...monster.descriptions }, tier: monster.tier,
    kind: 'monster', rank: monster.tier >= 5 ? 'elite' : 'normal', stats, pattern: 'strike', kinds: [...monster.kinds], minDanger: monster.minDanger ?? 0,
    provocationOnly: false, navalOnly: true, ...(monster.id === 'monster-deck-crab' ? { physicalMultiplier: .94, magicMultiplier: 1.06 }
      : monster.id === 'monster-reef-amphibian' ? { physicalMultiplier: 1.06, magicMultiplier: .94 } : {}),
    reward: { xp: 8 + monster.tier * 7, gold: monster.tier * 2, materials: [{ item: monster.loot[0].item, count: 1 }] } };
}
function appendage(id: string, title: Words, body: Words): FantasyCombatEnemyTemplate {
  return { id: `monster-juvenile-kraken-${id}`, names: words(title), descriptions: words(body), tier: 6, kind: 'monster', rank: 'normal',
    stats: { hp: coreHp / 3, mp: 0, attack: 1, defense: 10, agility: 1, intelligence: 1, accuracy: 55, magicResist: 6 },
    auxiliary: true, pattern: 'strike', kinds: ['coast', 'island'], minDanger: 3, provocationOnly: false,
    reward: { xp: 0, gold: 0, materials: [] } };
}

// 部位の耐久合計を本体と揃え、切断による本体被害と二重の討伐報酬を混同しない。
export const FANTASY_NAVAL_AUXILIARIES: FantasyCombatEnemyTemplate[] = [
  appendage('tentacle', ['어린 크라켄의 촉수', 'Juvenile Kraken Tentacle', '若いクラーケンの腕'], [
    '갑판 난간에 감긴 촉수. 잘라 내면 바깥 본체도 다치지만 별도의 전리품은 남기지 않는다.',
    'An arm curled around the rail. Severing it injures the body offshore, but yields no separate spoils.',
    '甲板の手すりに絡む腕。切れば船外の本体も傷つくが、別の戦利品は残さない。',
  ]),
  appendage('eye', ['어린 크라켄의 드러난 눈', 'Juvenile Kraken Exposed Eye', '若いクラーケンの露出した眼'], [
    '난간 가까이 드러난 부드러운 눈. 갑판에서 노릴 수 있는 약점이며 독립된 먹잇감은 아니다.',
    'A soft eye exposed near the rail, a weak point reachable from the deck rather than a separate quarry.',
    '手すりの近くに露出した柔らかな眼。甲板から狙える弱点で、独立した獲物ではない。',
  ]),
];
export const FANTASY_NAVAL_COMBAT_TEMPLATES: FantasyCombatEnemyTemplate[] = [...FANTASY_NAVAL_MONSTERS.map(combatCreature), ...FANTASY_NAVAL_AUXILIARIES];
export const FANTASY_NAVAL_ENCOUNTERS: FantasyNavalEncounter[] = [
  { template: 'monster-deck-crab', tier: 1, role: 'boarder', spawn: 'regular' },
  { template: 'monster-bilge-stalker', tier: 2, role: 'boarder', spawn: 'regular' },
  { template: 'monster-tide-raider', tier: 3, role: 'boarder', spawn: 'regular' },
  { template: 'monster-reef-amphibian', tier: 4, role: 'boarder', spawn: 'regular' },
  { template: 'monster-deep-serpent', tier: 5, role: 'offshore', spawn: 'regular' },
  { template: 'monster-juvenile-kraken', tier: 6, role: 'kraken', spawn: 'regular', parts: [
    { template: 'monster-juvenile-kraken-tentacle', count: 2 }, { template: 'monster-juvenile-kraken-eye', count: 1 },
  ] },
];
export const FANTASY_NAVAL_REGULAR_IDS: readonly string[] = FANTASY_NAVAL_ENCOUNTERS.map(entry => entry.template);
