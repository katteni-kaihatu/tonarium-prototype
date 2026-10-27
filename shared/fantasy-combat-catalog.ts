import { FANTASY_MONSTERS, type FantasyMonster } from './fantasy-monsters.ts';
import type { FantasyLocation } from './fantasy.ts';
import type { NpcLocale } from './npc.ts';

export type FantasyCombatText = Record<NpcLocale, string>;
export interface FantasyCombatStats { hp: number; mp: number; attack: number; defense: number; agility: number; intelligence: number; accuracy: number; magicResist: number }
export type FantasyCombatPattern = 'strike' | 'guard' | 'venom' | 'frost' | 'breath' | 'drain' | 'arcane' | 'regen' | 'swarm';
export interface FantasyCombatEnemyTemplate {
  id: string; kind: 'monster' | 'human'; tier: FantasyMonster['tier']; rank: 'normal' | 'elite' | 'boss';
  names: FantasyCombatText; descriptions: FantasyCombatText; stats: FantasyCombatStats; pattern: FantasyCombatPattern;
  kinds: FantasyLocation['kind'][]; minDanger: number; provocationOnly: boolean;
  reward: { xp: number; gold: number; materials: { item: string; count: number }[]; honor?: { id: string; names: FantasyCombatText } };
  humanCause?: 'banditry' | 'poaching' | 'fleet-violence' | 'crime-enforcement';
}
export interface FantasyApexProvocation {
  id: string; enemy: string; location: string; action: string; warning: FantasyCombatText; confirmation: FantasyCombatText;
}
type Tuple = [string, string, string];
const text = ([ko, en, ja]: Tuple): FantasyCombatText => ({ ko, en, ja });
const base: Record<FantasyMonster['tier'], FantasyCombatStats> = {
  1: { hp: 24, mp: 0, attack: 8, defense: 2, agility: 6, intelligence: 3, accuracy: 65, magicResist: 0 },
  2: { hp: 45, mp: 4, attack: 13, defense: 4, agility: 9, intelligence: 5, accuracy: 68, magicResist: 2 },
  3: { hp: 80, mp: 8, attack: 20, defense: 7, agility: 11, intelligence: 7, accuracy: 70, magicResist: 4 },
  4: { hp: 125, mp: 15, attack: 29, defense: 11, agility: 13, intelligence: 10, accuracy: 72, magicResist: 7 },
  5: { hp: 195, mp: 26, attack: 40, defense: 16, agility: 15, intelligence: 14, accuracy: 75, magicResist: 11 },
  6: { hp: 300, mp: 42, attack: 53, defense: 22, agility: 18, intelligence: 19, accuracy: 77, magicResist: 16 },
  7: { hp: 470, mp: 65, attack: 68, defense: 29, agility: 21, intelligence: 26, accuracy: 80, magicResist: 23 },
  8: { hp: 1000, mp: 110, attack: 92, defense: 40, agility: 24, intelligence: 35, accuracy: 83, magicResist: 32 },
};
type Role = 'slime' | 'swarm' | 'beast' | 'skirmisher' | 'armored' | 'undead' | 'caster' | 'flying' | 'dragon' | 'golem';
const roleBias: Record<Role, Partial<FantasyCombatStats>> = {
  slime: { hp: .85, attack: .8, defense: .65, agility: .7, intelligence: .7, magicResist: 1.35 },
  swarm: { hp: .9, attack: .85, defense: .55, agility: 1.45, intelligence: .65, accuracy: 1.04 },
  beast: { hp: 1.08, attack: 1.08, agility: 1.1, intelligence: .7 },
  skirmisher: { hp: .9, defense: .8, agility: 1.3, accuracy: 1.04 },
  armored: { hp: 1.15, attack: 1.02, defense: 1.3, agility: .8 },
  undead: { hp: 1.1, agility: .75, magicResist: 1.25 },
  caster: { hp: .82, mp: 1.5, attack: .8, defense: .75, intelligence: 1.35, magicResist: 1.3 },
  flying: { hp: .92, defense: .85, agility: 1.35, accuracy: 1.04 },
  dragon: { hp: 1.1, mp: 1.2, attack: 1.08, defense: 1.1, intelligence: 1.15 },
  golem: { hp: 1.3, mp: 0, defense: 1.45, agility: .55, intelligence: .5, magicResist: 1.25 },
};
function stats(tier: FantasyMonster['tier'], role: Role, extra: Partial<FantasyCombatStats> = {}): FantasyCombatStats {
  const value = { ...base[tier] };
  for (const key of Object.keys(value) as (keyof FantasyCombatStats)[]) value[key] = Math.round(value[key] * (roleBias[role][key] ?? 1));
  return { ...value, ...extra, accuracy: Math.min(95, extra.accuracy ?? value.accuracy) };
}
const roleOf = (id: string): Role => /slime/.test(id) ? 'slime' : /rat|leech|beetle|bat/.test(id) ? 'swarm'
  : /golem|guardian/.test(id) ? 'golem' : /dragon/.test(id) ? 'dragon' : /wyvern|griffin/.test(id) ? 'flying'
    : /elemental/.test(id) ? 'caster' : /skeleton|zombie|wight|grave-knight/.test(id) ? 'undead'
      : /armored-orc|troll|ogre/.test(id) ? 'armored' : /goblin|orc-scout|spider/.test(id) ? 'skirmisher' : 'beast';
const patternOf = (id: string): FantasyCombatPattern => /venom|leech/.test(id) ? 'venom' : /ice|frost/.test(id) ? 'frost'
  : /dragon|flame/.test(id) ? 'breath' : /golem|guardian|beetle|armored|grave-knight/.test(id) ? 'guard'
    : /hydra|troll/.test(id) ? 'regen' : /wight|zombie/.test(id) ? 'drain' : /elemental|void/.test(id) ? 'arcane' : /rat|bat/.test(id) ? 'swarm' : 'strike';
const apexRewards: Record<string, FantasyCombatEnemyTemplate['reward']> = {
  'monster-elder-dragon': { xp: 320, gold: 0, materials: [{ item: 'elder-dragon-scale', count: 2 }], honor: { id: 'honor-ember-oath', names: text(['잿불의 맹세를 지킨 자', 'Keeper of the Ember Oath', '燠火の誓いを守る者']) } },
  'monster-ancient-frost-dragon': { xp: 320, gold: 0, materials: [{ item: 'ancient-frostheart', count: 1 }], honor: { id: 'honor-frost-silence', names: text(['백무의 침묵을 넘은 자', 'Beyond the White-Mist Silence', '白霧の静寂を越える者']) } },
  'monster-ancient-storm-dragon': { xp: 320, gold: 0, materials: [{ item: 'ancient-storm-sinew', count: 2 }], honor: { id: 'honor-thunder-answer', names: text(['천둥에 응답한 자', 'Answer to the Thunder', '雷に応えた者']) } },
  'monster-void-chimera': { xp: 320, gold: 0, materials: [{ item: 'void-chimera-prism', count: 1 }], honor: { id: 'honor-void-witness', names: text(['공허의 경계를 기록한 자', 'Witness to the Void Boundary', '虚の境を記す者']) } },
};
function fromMonster(monster: FantasyMonster): FantasyCombatEnemyTemplate {
  const extra = monster.id === 'monster-elder-dragon' ? { hp: 1700 } : {};
  return { id: monster.id, kind: 'monster', tier: monster.tier, rank: monster.tier >= 7 ? 'boss' : monster.tier >= 5 ? 'elite' : 'normal',
    names: { ...monster.names }, descriptions: { ...monster.descriptions }, stats: stats(monster.tier, roleOf(monster.id), extra), pattern: patternOf(monster.id),
    kinds: [...monster.kinds], minDanger: monster.minDanger ?? 0, provocationOnly: monster.tier === 8,
    reward: apexRewards[monster.id] ?? { xp: 8 + monster.tier * 7, gold: monster.tier * 2, materials: monster.loot.slice(0, 1).map(value => ({ item: value.item, count: 1 })) },
  };
}
function added(id: string, names: Tuple, descriptions: Tuple, tier: FantasyMonster['tier'], kinds: FantasyLocation['kind'][], role: Role, pattern: FantasyCombatPattern, material: string): FantasyCombatEnemyTemplate {
  return { id: `monster-${id}`, kind: 'monster', tier, rank: tier >= 7 ? 'boss' : tier >= 5 ? 'elite' : 'normal', names: text(names), descriptions: text(descriptions),
    stats: stats(tier, role), pattern, kinds, minDanger: Math.max(0, tier - 3), provocationOnly: false,
    reward: { xp: 8 + tier * 7, gold: tier * 2, materials: [{ item: material, count: 1 }] } };
}
const additions: FantasyCombatEnemyTemplate[] = [
  added('mimic', ['금고 미믹', 'Coffer Mimic', '金庫ミミック'], ['버려진 금고를 흉내 내다가 다가온 이를 덮치는 위장 포식자.', 'A disguised predator imitating an abandoned coffer.', '捨てた金庫に擬態して近づく者を襲う捕食者。'], 3, ['ruin', 'cave'], 'armored', 'guard', 'relic'),
  added('kobold-ambusher', ['코볼트 매복병', 'Kobold Ambusher', 'コボルト伏兵'], ['갱도 통행료를 빼앗는 무장단의 매복병. 코볼트 전체를 뜻하지 않는다.', 'An ambusher in an armed mine-road extortion gang, not all kobolds.', '坑道の通行料を奪う武装団の伏兵。全コボルトを指さない。'], 2, ['cave', 'mountain'], 'skirmisher', 'strike', 'ore'),
  added('harpy', ['절벽 하피', 'Cliff Harpy', '崖ハーピー'], ['돌풍을 타고 급강하해 짐을 노리는 날개 달린 포식자.', 'A winged predator diving on gusts to seize supplies.', '突風に乗り急降下して荷を狙う翼ある捕食者。'], 4, ['mountain', 'island'], 'flying', 'strike', 'silk'),
  added('basilisk', ['동굴 바실리스크', 'Cavern Basilisk', '洞窟バジリスク'], ['독이 밴 입김으로 좁은 통로를 지키는 단단한 비늘의 괴수.', 'A hard-scaled beast guarding narrow passages with venomous breath.', '毒の息で狭い通路を守る堅鱗の魔獣。'], 5, ['cave', 'ruin', 'desert'], 'armored', 'venom', 'crystal'),
  added('manticore', ['황야 만티코어', 'Wildland Manticore', '荒野マンティコア'], ['맹수의 몸과 독꼬리를 갖춰 바위 그늘에서 뛰쳐나오는 괴수.', 'A beast with a venomous tail springing from rocky shade.', '獣の体と毒尾を持ち、岩陰から飛び出す魔獣。'], 5, ['mountain', 'desert'], 'beast', 'venom', 'gem'),
  added('gargoyle', ['회랑 가고일', 'Gallery Gargoyle', '回廊ガーゴイル'], ['회랑 조각상 사이에서 날개를 접고 기다리는 돌 괴수.', 'A stone creature waiting with folded wings among gallery statues.', '回廊の彫像に紛れ翼を畳んで待つ石の魔獣。'], 4, ['ruin', 'tower'], 'golem', 'guard', 'ore'),
  added('dullahan', ['길 잃은 듀라한', 'Wayward Dullahan', '迷いのデュラハン'], ['끊어진 옛 길목을 배회하며 생기를 빼앗는 갑옷 망자.', 'An armored revenant draining life along a broken old road.', '途切れた古道を巡り生命力を奪う鎧の亡者。'], 6, ['ruin', 'snow'], 'undead', 'drain', 'relic'),
  added('lich', ['봉인묘의 리치', 'Sealed-Tomb Lich', '封墓のリッチ'], ['묘실에 모은 마나를 죽음의 주문으로 바꾸는 강대한 망자.', 'A powerful undead caster turning stored tomb mana into deadly spells.', '墓室に蓄えたマナを死の術に変える強大な亡者。'], 7, ['ruin', 'cave', 'tower'], 'caster', 'arcane', 'pure-crystal'),
  added('phoenix', ['잿불 불사조', 'Ember Phoenix', '燠火の不死鳥'], ['뜨거운 기류 속에서 상처를 추스르며 불꽃을 뿜는 거대한 새.', 'An immense bird recovering in hot updrafts while breathing flame.', '熱い上昇気流で傷を癒やし炎を放つ巨鳥。'], 7, ['volcano', 'island'], 'flying', 'regen', 'fire-crystal'),
  added('treant', ['뒤틀린 고목정령', 'Twisted Treant', '歪みの古木精'], ['상처 난 뿌리에서 마나가 흘러 길을 휘감는 거대한 고목 형체.', 'A massive old-tree form whose wounded roots spill mana across a path.', '傷ついた根からマナが流れ道を巻く巨大な古木の形。'], 5, ['forest', 'swamp'], 'golem', 'regen', 'worldtree-branch'),
];
function human(id: string, names: Tuple, descriptions: Tuple, tier: FantasyMonster['tier'], role: Role, humanCause: NonNullable<FantasyCombatEnemyTemplate['humanCause']>, kinds: FantasyLocation['kind'][]): FantasyCombatEnemyTemplate {
  const law = humanCause === 'crime-enforcement';
  return { id: `human-${id}`, kind: 'human', tier, rank: tier >= 5 ? 'elite' : 'normal', names: text(names), descriptions: text(descriptions), stats: stats(tier, role),
    pattern: role === 'armored' ? 'guard' : 'strike', kinds, minDanger: 0, provocationOnly: false, humanCause,
    reward: { xp: tier * 8, gold: law ? 0 : tier * 3, materials: law ? [] : [{ item: 'ore', count: 1 }] } };
}
const humans: FantasyCombatEnemyTemplate[] = [
  human('road-bandit', ['노상 강도', 'Road Bandit', '街道の強盗'], ['통행인을 협박해 짐을 빼앗는 무장 강도.', 'An armed robber threatening travelers for their cargo.', '通行人を脅し荷を奪う武装強盗。'], 2, 'skirmisher', 'banditry', ['forest', 'coast', 'mountain']),
  human('poacher', ['무장 밀렵자', 'Armed Poacher', '武装密猟者'], ['발각된 덫을 감추려 목격자를 위협하는 밀렵자.', 'A poacher threatening witnesses to hide discovered traps.', '見つかった罠を隠すため目撃者を脅す密猟者。'], 3, 'skirmisher', 'poaching', ['forest', 'swamp']),
  human('ironmask-marine', ['철가면 선단 사병', 'Ironmask Fleet Marine', '鉄仮面船団の私兵'], ['해도를 빼앗고 귀환 기록을 넘기라 요구하는 선단의 사병.', 'A fleet fighter seizing charts and demanding return records.', '海図を奪い帰還記録を渡せと迫る船団の私兵。'], 4, 'armored', 'fleet-violence', ['coast', 'island', 'forest']),
  human('watch-patrol', ['단속 경비병', 'Watch Patrol', '取締りの衛兵'], ['실제로 드러난 범행을 단속하는 경비병. 직업만으로 상대를 공격하지 않는다.', 'A guard responding to an exposed offense, not attacking someone merely for a profession.', '実際に露見した犯行を取り締まる衛兵。職業だけで相手を襲わない。'], 3, 'armored', 'crime-enforcement', ['city', 'coast', 'forest']),
  human('order-knight', ['서약 기사', 'Oathbound Knight', '誓いの騎士'], ['위법한 습격이나 명시적 도전에 대응하는 기사. 선량한 여행자의 무작위 적이 아니다.', 'A knight responding to unlawful violence or an explicit challenge, not a random foe of peaceful travelers.', '違法な襲撃や明示した挑戦に応じる騎士。平穏な旅人の無作為な敵ではない。'], 6, 'armored', 'crime-enforcement', ['city', 'coast', 'mountain']),
];
export const FANTASY_COMBAT_ENEMIES: FantasyCombatEnemyTemplate[] = [...FANTASY_MONSTERS.map(fromMonster), ...additions, ...humans];
export const fantasyCombatEnemy = (id: string): FantasyCombatEnemyTemplate | undefined => FANTASY_COMBAT_ENEMIES.find(enemy => enemy.id === id);
export function createFantasyCombatEnemyStats(id: string, rng: () => number = Math.random): { stats: FantasyCombatStats; variation: number } {
  const enemy = fantasyCombatEnemy(id); if (!enemy) throw new RangeError('Unknown combat enemy');
  const draw = rng(); if (!Number.isFinite(draw) || draw < 0 || draw > 1) throw new RangeError('Invalid enemy variation draw');
  const variation = .92 + draw * .16, result = { ...enemy.stats };
  for (const key of Object.keys(result) as (keyof FantasyCombatStats)[]) result[key] = Math.max(key === 'mp' || key === 'magicResist' ? 0 : 1, Math.round(result[key] * variation));
  result.accuracy = Math.min(99, result.accuracy);
  return { stats: result, variation };
}
export const FANTASY_APEX_PROVOCATIONS: FantasyApexProvocation[] = [
  { id: 'apex-elder-dragon', enemy: 'monster-elder-dragon', location: 'ashpeak', action: 'strike-scale-gong', warning: text([
    '잿불 제단의 비늘종은 고룡에게 결투를 알리는 장치다. 종을 치지 않으면 고룡은 먼저 공격하지 않는다. 최고급 장비와 충분한 회복 준비가 없다면 치명적인 위험이 있다.',
    'The scale gong at the ember altar announces a challenge to the elder dragon. It will not attack first if the gong is left alone. Without top-grade equipment and ample recovery supplies, the danger is lethal.',
    '燠火の祭壇の鱗鐘は古竜へ決闘を告げる装置だ。鳴らさなければ古竜は先に襲わない。最高級装備と十分な回復の備えがなければ命に関わる。']), confirmation: text(['위험을 알고 비늘종을 울려 고룡에게 도전한다', 'Accept the risk and sound the scale gong', '危険を承知で鱗鐘を鳴らし古竜へ挑む']) },
  { id: 'apex-frost-dragon', enemy: 'monster-ancient-frost-dragon', location: 'frostpass', action: 'break-frost-seal', warning: text([
    '빙문에 박힌 봉인못을 뽑으면 잠든 고대 서리용이 도전을 받아들인다. 못을 그대로 두면 전투는 시작되지 않는다. 최고급 방어구와 냉기에 대한 대비가 필요하다.',
    'Removing the seal pin from the ice gate challenges the sleeping ancient frost dragon. Leaving it untouched starts no battle. Top-grade armor and preparation for the cold are necessary.',
    '氷門の封印釘を抜くと眠る古き霜竜が挑戦を受ける。触れずに置けば戦闘は始まらない。最高級の防具と冷気への備えが必要だ。']), confirmation: text(['위험을 알고 빙문의 봉인못을 뽑는다', 'Accept the risk and remove the ice-gate seal', '危険を承知で氷門の封印釘を抜く']) },
  { id: 'apex-storm-dragon', enemy: 'monster-ancient-storm-dragon', location: 'storm-isle', action: 'ring-storm-chain', warning: text([
    '절벽의 세 사슬을 함께 당기면 고대 폭풍용에게 결투 신호가 전해진다. 평범한 중계종 조사와는 다른 장치이며, 이 사슬을 당기지 않는 한 용과 싸우지 않는다. 최고급 장비와 낙뢰에 대비해야 한다.',
    'Pulling the three cliff chains together signals a duel to the ancient storm dragon. This is separate from the ordinary relay-bell investigation; leaving the chains alone avoids the battle. Prepare top-grade equipment and protection from lightning.',
    '崖の三本の鎖を共に引くと古き嵐竜へ決闘の合図が届く。通常の中継鐘の調査とは別の装置で、鎖を引かない限り竜とは戦わない。最高級装備と落雷への備えが必要だ。']), confirmation: text(['위험을 알고 절벽의 결투 사슬을 당긴다', 'Accept the risk and pull the duel chains', '危険を承知で崖の決闘鎖を引く']) },
  { id: 'apex-void-chimera', enemy: 'monster-void-chimera', location: 'eclipsevault', action: 'light-void-brazier', warning: text([
    '닫힌 경계 화로에 불을 붙이면 공허빛 키메라가 도전자를 찾아온다. 화로를 건드리지 않으면 일반 유적 조사를 계속할 수 있다. 최고급 무기·방어구와 마력 방호가 없다면 싸움을 버티기 어렵다.',
    'Lighting the sealed boundary brazier calls the void-lit chimera to its challenger. Leaving it alone permits ordinary ruin investigations. Without top-grade arms, armor and magical protection, this fight is difficult to survive.',
    '閉じた境界火鉢に火を灯すと虚光のキマイラが挑戦者を訪れる。触れなければ通常の遺跡調査を続けられる。最高級の武具と魔力の守りがなければ戦いを耐え難い。']), confirmation: text(['위험을 알고 경계 화로에 불을 붙인다', 'Accept the risk and light the boundary brazier', '危険を承知で境界火鉢に火を灯す']) },
];
