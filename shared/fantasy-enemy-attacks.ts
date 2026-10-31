import type { FantasyCombatFighter, FantasyCombatSkill, FantasyCombatState, FantasyCombatText } from './fantasy-combat.ts';
import type { FantasyCombatEnemyTemplate } from './fantasy-combat-catalog.ts';
import type { FantasyCombatTile } from './fantasy-combat-tactics.ts';
import { fantasyCombatAttackTiles } from './fantasy-attack-shapes.ts';

export interface FantasyEnemyAttack extends FantasyCombatSkill {
  kind: 'attack'; prepare: boolean; interval: number; damageScale: number; aim: 'target' | 'self';
}
export interface FantasyEnemyCharge {
  skill: string; preparedRound: number; resolvesRound: number;
  origin: FantasyCombatTile; target: FantasyCombatTile; tiles: FantasyCombatTile[];
}
type Names = [ko: string, en: string, ja: string];
type Art = Pick<FantasyCombatSkill, 'shape' | 'reach' | 'radius' | 'onHit' | 'hitUtility' | 'effects'> & { names: Names; aim?: 'target' | 'self' };
interface Family { element?: NonNullable<FantasyCombatSkill['visualElement']>; damage: NonNullable<FantasyCombatSkill['damageType']>; magic?: boolean; ranged?: boolean; arts: [Art, Art, Art] }
const names = ([ko, en, ja]: Names): FantasyCombatText => ({ ko, en, ja });
const poison = { id: 'poison', power: 2, turns: 3, chance: .4 } as const;
const burn = { id: 'burn', power: 2, turns: 3, chance: .4 } as const;
const frost = { id: 'frost', power: 1, turns: 3, chance: .5 } as const;
const root = { id: 'root', power: 3, chance: .5 } as const;
const families: Record<string, Family> = {
  'deck-crab': { damage: 'pierce', arts: [
    { names: ['작은 집게', 'Little Pincer', '小さな鋏'], shape: 'single', reach: 1 },
    { names: ['발목 긁기', 'Ankle Rake', '足首掻き'], shape: 'fan', reach: 1 },
    { names: ['집게 모아 덮치기', 'Gathered Pincer Pounce', '鋏を揃えた飛び掛かり'], shape: 'cone', reach: 2 }] },
  'bilge-stalker': { damage: 'pierce', arts: [
    { names: ['갈고리 발톱', 'Hooked Claw', '鉤爪'], shape: 'single', reach: 1 },
    { names: ['짐 틈새 돌진', 'Cargo-Gap Rush', '荷の隙間突進'], shape: 'line', reach: 2 },
    { names: ['선저의 도약', 'Bilge Leap', '船底からの跳躍'], shape: 'line', reach: 4, hitUtility: { id: 'bleed', power: 2, chance: .25 } }] },
  'tide-raider': { damage: 'pierce', arts: [
    { names: ['짧은 작살 찌르기', 'Short Harpoon Thrust', '短銛突き'], shape: 'single', reach: 1 },
    { names: ['갈고리 밧줄', 'Grappling Line', '鉤綱'], shape: 'line', reach: 3 },
    { names: ['난간 넘는 급습', 'Rail-Vault Ambush', '手すり越えの急襲'], shape: 'cone', reach: 3, hitUtility: { id: 'vulnerable', power: 3, chance: .3 } }] },
  'reef-amphibian': { element: 'water', damage: 'blunt', arts: [
    { names: ['넓은 앞발', 'Broad Forelimb', '広い前脚'], shape: 'single', reach: 1 },
    { names: ['젖은 꼬리 휘두르기', 'Wet Tail Sweep', '濡れた尾薙ぎ'], shape: 'fan', reach: 2 },
    { names: ['암초 뛰어넘기', 'Reef-Vault Slam', '礁越えの叩き付け'], shape: 'cone', reach: 3, hitUtility: { id: 'root', power: 2, chance: .35 } }] },
  kraken: { element: 'water', damage: 'blunt', ranged: true, arts: [
    { names: ['먹물 분사', 'Ink Jet', '墨噴射'], shape: 'single', reach: 8, hitUtility: { id: 'blind', power: 2, chance: .3 } },
    { names: ['촉수 물결', 'Tentacle Wave', '腕の波'], shape: 'fan', reach: 4 },
    { names: ['갑판 내리치기', 'Deckbreaker Slam', '甲板叩き'], shape: 'cone', reach: 5, hitUtility: { id: 'weaken', power: 2, chance: .3 } }] },
  'kraken-tentacle': { element: 'water', damage: 'blunt', arts: [
    { names: ['약한 꿈틀거림', 'Weak Writhe', '弱いうねり'], shape: 'single', reach: 1 },
    { names: ['난간 스치기', 'Rail Brush', '手すり掠め'], shape: 'fan', reach: 1 },
    { names: ['촉수 거두기', 'Arm Recoil', '腕の引き戻し'], shape: 'line', reach: 2 }] },
  'kraken-eye': { element: 'water', damage: 'blunt', ranged: true, arts: [
    { names: ['작은 물방울', 'Tiny Droplet', '小さな水滴'], shape: 'single', reach: 4 },
    { names: ['잔물결', 'Little Ripple', '小さな波紋'], shape: 'line', reach: 3 },
    { names: ['눈 감는 물보라', 'Blinking Spray', '瞬きの飛沫'], shape: 'cone', reach: 3 }] },
  bandit: { damage: 'pierce', arts: [
    { names: ['베어 가르기','Cutting Slash','斬り払い'], shape: 'single', reach: 1 },
    { names: ['흙먼지 휘두르기','Dust Sweep','砂塵払い'], shape: 'fan', reach: 1, hitUtility: { id: 'blind', power: 3, chance: .35 } },
    { names: ['힘 모은 돌격','Committed Rush','溜め突き'], shape: 'line', reach: 3 }] },
  poacher: { damage: 'pierce', ranged: true, arts: [
    { names: ['사냥 화살','Hunting Arrow','狩り矢'], shape: 'single', reach: 7 },
    { names: ['관통 화살','Piercing Arrow','貫き矢'], shape: 'line', reach: 5 },
    { names: ['조준 관통사','Aimed Piercing Shot','狙い澄ます貫通射'], shape: 'line', reach: 8, hitUtility: { id: 'bleed', power: 3, chance: .5 } }] },
  knight: { damage: 'blunt', arts: [
    { names: ['방패 밀치기','Shield Bash','盾打ち'], shape: 'single', reach: 1, effects: { guard: 4 } },
    { names: ['검의 원호','Sword Arc','剣の弧'], shape: 'cone', reach: 2 },
    { names: ['방패 분쇄 돌진','Shieldbreaker Rush','盾砕きの突進'], shape: 'line', reach: 3, hitUtility: { id: 'weaken', power: 4, chance: .5 } }] },
  slime: { element: 'water', damage: 'blunt', arts: [
    { names: ['점액 타격','Gel Strike','粘体打ち'], shape: 'single', reach: 1 },
    { names: ['점액 뿜기','Gel Spurt','粘液噴き'], shape: 'line', reach: 3 },
    { names: ['부풀어 터뜨리기','Swelling Burst','膨張破裂'], shape: 'burst', reach: 1, radius: 2, aim: 'self', hitUtility: root }] },
  beast: { damage: 'pierce', arts: [
    { names: ['송곳니 물기','Fang Bite','牙噛み'], shape: 'single', reach: 1 },
    { names: ['발톱 휩쓸기','Claw Sweep','爪払い'], shape: 'cone', reach: 2 },
    { names: ['웅크린 덮치기','Coiled Pounce','身を溜めた飛び掛かり'], shape: 'line', reach: 3, hitUtility: { id: 'bleed', power: 3, chance: .5 } }] },
  raider: { damage: 'blunt', arts: [
    { names: ['난폭한 타격','Raider Strike','乱暴な一撃'], shape: 'single', reach: 1 },
    { names: ['무기 휘두르기','Weapon Sweep','武器払い'], shape: 'fan', reach: 2 },
    { names: ['분쇄 내려찍기','Crushing Overhead','粉砕の振り下ろし'], shape: 'cone', reach: 3, hitUtility: { id: 'vulnerable', power: 4, chance: .5 } }] },
  golem: { element: 'earth', damage: 'blunt', arts: [
    { names: ['돌주먹','Stone Fist','石拳'], shape: 'single', reach: 1 },
    { names: ['암석 휩쓸기','Boulder Sweep','岩薙ぎ'], shape: 'fan', reach: 2 },
    { names: ['지반 분쇄','Ground Shatter','地盤砕き'], shape: 'burst', reach: 1, radius: 3, aim: 'self', hitUtility: { id: 'weaken', power: 4, chance: .5 } }] },
  hydra: { element: 'poison', damage: 'pierce', arts: [
    { names: ['쌍두 물기','Twin-Head Bite','双頭噛み'], shape: 'cone', reach: 2 },
    { names: ['꼬리 휩쓸기','Tail Sweep','尾薙ぎ'], shape: 'fan', reach: 2 },
    { names: ['모든 목의 습격','Many-Head Onslaught','多頭の猛襲'], shape: 'fan', reach: 3, onHit: poison }] },
  fire: { element: 'fire', damage: 'fire', magic: true, arts: [
    { names: ['불씨 탄환','Ember Bolt','火種弾'], shape: 'single', reach: 5, onHit: burn },
    { names: ['화염 분사','Flame Jet','火炎噴射'], shape: 'line', reach: 4 },
    { names: ['들이마신 화염 숨결','Gathered Flame Breath','溜めた火炎の息'], shape: 'cone', reach: 6, onHit: burn }] },
  frost: { element: 'frost', damage: 'ice', magic: true, arts: [
    { names: ['얼음 송곳','Ice Fang','氷の牙'], shape: 'single', reach: 5, onHit: frost },
    { names: ['서리 부채','Frost Fan','霜の扇'], shape: 'fan', reach: 3 },
    { names: ['응축한 서리 숨결','Condensed Frost Breath','凝縮した霜の息'], shape: 'cone', reach: 6, onHit: frost }] },
  storm: { element: 'storm', damage: 'none', magic: true, arts: [
    { names: ['번개 창','Lightning Lance','雷の槍'], shape: 'line', reach: 6 },
    { names: ['돌풍 날개','Gust Wing','突風の翼'], shape: 'fan', reach: 3 },
    { names: ['모여드는 낙뢰','Gathering Thunderfall','集う落雷'], shape: 'burst', reach: 7, radius: 2, hitUtility: { id: 'blind', power: 4, chance: .5 } }] },
  arcane: { element: 'star', damage: 'none', magic: true, arts: [
    { names: ['비전 탄환','Arcane Bolt','秘術弾'], shape: 'single', reach: 7 },
    { names: ['영혼 관통','Soul Lance','魂の貫き'], shape: 'line', reach: 5, hitUtility: { id: 'silence', power: 3, chance: .3 } },
    { names: ['응축한 파멸진','Gathered Ruin Sigil','凝縮した破滅陣'], shape: 'burst', reach: 7, radius: 2, hitUtility: { id: 'vulnerable', power: 4, chance: .5 } }] },
  phoenix: { element: 'fire', damage: 'fire', magic: true, arts: [
    { names: ['불깃 날리기','Ember Feather','火羽飛ばし'], shape: 'line', reach: 6 },
    { names: ['잿불 날갯짓','Cinder Wingbeat','燠火の羽ばたき'], shape: 'fan', reach: 3, onHit: burn },
    { names: ['태양불꽃 폭발','Solar Flare Burst','陽炎の爆発'], shape: 'burst', reach: 1, radius: 3, aim: 'self', onHit: burn }] },
  undead: { element: 'star', damage: 'pierce', arts: [
    { names: ['쇠락한 손톱','Withered Claw','衰えた爪'], shape: 'single', reach: 1 },
    { names: ['묘지의 칼날','Grave Blade','墓場の刃'], shape: 'line', reach: 2 },
    { names: ['원한의 휩쓸기','Grudge Sweep','怨念の薙ぎ払い'], shape: 'fan', reach: 3, hitUtility: { id: 'weaken', power: 4, chance: .5 } }] },
  spider: { element: 'poison', damage: 'pierce', ranged: true, arts: [
    { names: ['독니 찌르기','Venom Fang','毒牙突き'], shape: 'single', reach: 1, onHit: poison },
    { names: ['끈끈한 그물','Sticky Web','粘着の網'], shape: 'single', reach: 4, hitUtility: root },
    { names: ['그물 폭탄','Web Cocoon Burst','網繭の破裂'], shape: 'burst', reach: 5, radius: 2, hitUtility: root }] },
  swarm: { element: 'wind', damage: 'pierce', arts: [
    { names: ['떼 물기','Swarming Bite','群れ噛み'], shape: 'single', reach: 1 },
    { names: ['몰려들기','Swarm Rush','群がり'], shape: 'cone', reach: 2 },
    { names: ['소용돌이 떼','Whirling Swarm','渦巻く群れ'], shape: 'burst', reach: 1, radius: 2, aim: 'self', hitUtility: { id: 'blind', power: 4, chance: .5 } }] },
  plant: { element: 'earth', damage: 'blunt', arts: [
    { names: ['가지 타격','Branch Strike','枝打ち'], shape: 'single', reach: 2 },
    { names: ['뿌리 채찍','Root Lash','根の鞭'], shape: 'line', reach: 4 },
    { names: ['뿌리 지진','Root Quake','根の地震'], shape: 'burst', reach: 1, radius: 3, aim: 'self', hitUtility: root }] },
  winged: { element: 'wind', damage: 'pierce', arts: [
    { names: ['갈고리 발톱','Hooked Talon','鉤爪'], shape: 'single', reach: 1 },
    { names: ['날개 베기','Wing Cut','翼斬り'], shape: 'fan', reach: 2 },
    { names: ['선회 급강하','Circling Dive','旋回急降下'], shape: 'line', reach: 5, hitUtility: { id: 'bleed', power: 3, chance: .5 } }] },
  basilisk: { element: 'poison', damage: 'pierce', arts: [
    { names: ['비늘꼬리','Scaled Tail','鱗の尾'], shape: 'fan', reach: 2 },
    { names: ['마비 이빨','Numbing Fang','痺れる牙'], shape: 'single', reach: 1, onHit: poison },
    { names: ['응시의 파동','Petrifying Gaze','石化の凝視'], shape: 'cone', reach: 5, hitUtility: root }] },
  venom: { element: 'poison', damage: 'pierce', ranged: true, arts: [
    { names: ['독가시','Venom Spine','毒棘'], shape: 'single', reach: 5, onHit: poison },
    { names: ['가시 부채','Spine Fan','棘の扇'], shape: 'fan', reach: 3 },
    { names: ['모아 쏘는 독가시','Gathered Venom Volley','溜めた毒棘の斉射'], shape: 'cone', reach: 6, onHit: poison }] },
  mimic: { element: 'alchemy', damage: 'pierce', arts: [
    { names: ['상자 이빨','Chest Fangs','箱の牙'], shape: 'single', reach: 1 },
    { names: ['혀 채찍','Tongue Lash','舌の鞭'], shape: 'line', reach: 3 },
    { names: ['뚜껑 덮치기','Snapping Lid','蓋の挟み撃ち'], shape: 'cone', reach: 3, hitUtility: root }] },
};
function familyOf(template: FantasyCombatEnemyTemplate): string {
  const id = template.id;
  if (id === 'monster-deck-crab') return 'deck-crab';
  if (id === 'monster-bilge-stalker') return 'bilge-stalker';
  if (id === 'monster-tide-raider') return 'tide-raider';
  if (id === 'monster-reef-amphibian') return 'reef-amphibian';
  if (id === 'monster-juvenile-kraken-tentacle') return 'kraken-tentacle';
  if (id === 'monster-juvenile-kraken-eye') return 'kraken-eye';
  if (id === 'monster-juvenile-kraken') return 'kraken';
  if (id.includes('poacher') || id.includes('slinger')) return 'poacher';
  if (template.kind === 'human') return /knight|patrol|marine/.test(id) ? 'knight' : 'bandit';
  if (/phoenix/.test(id)) return 'phoenix';
  if (/lich|void|archive-warden|wisp/.test(id)) return 'arcane';
  if (/frost|ice/.test(id)) return 'frost';
  if (/storm|thunder/.test(id)) return 'storm';
  if (/slime/.test(id)) return 'slime';
  if (/spider/.test(id)) return 'spider';
  if (/golem|guardian|sentinel|gargoyle/.test(id)) return 'golem';
  if (/hydra/.test(id)) return 'hydra';
  if (/treant/.test(id)) return 'plant';
  if (/basilisk/.test(id)) return 'basilisk';
  if (/mimic/.test(id)) return 'mimic';
  if (/venom|manticore|serpent|leech/.test(id)) return 'venom';
  if (/dragon|flame/.test(id)) return 'fire';
  if (/wyvern|griffin|harpy/.test(id)) return 'winged';
  if (/skeleton|zombie|wight|grave-knight|dullahan/.test(id)) return 'undead';
  if (/rat|bat|beetle|crab/.test(id)) return 'swarm';
  if (/orc|goblin|kobold|ogre|troll/.test(id)) return 'raider';
  return 'beast';
}
export function fantasyEnemyAttacks(template: FantasyCombatEnemyTemplate): FantasyEnemyAttack[] {
  const familyId = familyOf(template), family = families[familyId];
  const tier = Math.max(1, Math.min(8, Math.floor(template.tier))), interval = template.rank === 'boss' ? 4 : tier >= 4 ? 5 : 6;
  return family.arts.map((art, index) => {
    const prepare = index === 2;
    return { id: `enemy-${familyId}-${index + 1}`, kind: 'attack', names: names(art.names), prepare, interval,
      damageScale: prepare ? 1.8 : index ? .85 : 1, aim: art.aim ?? 'target',
      mp: family.magic ? prepare ? 6 + Math.min(6, tier) : 2 + Math.floor(tier / 3) : 0,
      power: template.auxiliary ? 0 : prepare ? Math.min(16, tier * 2) : Math.min(8, Math.floor(tier / 2) + index),
      magic: family.magic === true, range: family.magic ? 'magic' : family.ranged ? 'ranged' : 'melee',
      damageType: family.damage, ...(family.element ? { visualElement: family.element } : {}), visualTier: Math.min(5, Math.ceil(tier / 2) + (prepare ? 1 : 0)) as 1 | 2 | 3 | 4 | 5,
      shape: art.shape, reach: art.reach, radius: familyId === 'golem' && prepare && tier >= 7 ? 4 : art.radius ?? 0, secondaryDamage: 100,
      ...(art.onHit ? { onHit: { ...art.onHit, power: Math.min(6, art.onHit.power + Math.floor(tier / 3)) } } : {}),
      ...(art.hitUtility ? { hitUtility: { ...art.hitUtility } } : {}), ...(art.effects ? { effects: { ...art.effects } } : {}) };
  });
}
export function fantasyEnemyAttackById(template: FantasyCombatEnemyTemplate, id: string): FantasyEnemyAttack | undefined {
  return fantasyEnemyAttacks(template).find(attack => attack.id === id);
}
export function fantasyEnemyAttackForRound(template: FantasyCombatEnemyTemplate, round: number): FantasyEnemyAttack {
  const attacks = fantasyEnemyAttacks(template), strong = attacks.find(attack => attack.prepare)!, regular = attacks.filter(attack => !attack.prepare);
  const current = Number.isFinite(round) ? Math.max(1, Math.floor(round)) : 1;
  return current % strong.interval === 2 ? strong : regular[(current - 1) % regular.length];
}
export function fantasyEnemyChargeTiles(state: FantasyCombatState, actor: FantasyCombatFighter, attack: FantasyEnemyAttack, target: FantasyCombatTile): FantasyCombatTile[] {
  const center = attack.aim === 'self' ? actor.tile : target;
  return center ? fantasyCombatAttackTiles(state, actor, center, attack) : [];
}
