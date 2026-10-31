import type { FantasySkill } from './fantasy.ts';
import type { FantasyBodyTrait } from './fantasy-physiology.ts';
import type { FantasyCombatSkill } from './fantasy-combat.ts';
const l = (ko: string, en: string, ja: string) => ({ ko, en, ja });
export const FANTASY_EXTRA_COMBAT_BODY_TRAITS: FantasyBodyTrait[] = [
  { id: 'long-limbed', names: l('긴 팔다리', 'Long limbs', '長い手足'), descriptions: l('찌르기·맨손 사거리 최대+1. 높은 발판에 유리하지만 좁은 틈에서 팔다리를 접기 어렵다. 뻗는 장타를 익힌다.', 'Thrust and unarmed reach up to +1. Helpful on ledges, awkward in narrow gaps. Unlocks Extended Palm.', '突き・徒手射程は最大+1。高所に有利だが狭い隙間で畳みにくい。伸掌打を学ぶ。'), modifiers: { 'high-place': 1, 'narrow-space': -1 } },
  { id: 'horned', names: l('단단한 뿔', 'Solid horns', '硬い角'), descriptions: l('가까운 상대를 뿔로 들이받을 수 있다.', 'Can gore a nearby opponent.', '近い相手を角で突ける。'), modifiers: {} },
  { id: 'clawed', names: l('날카로운 발톱', 'Sharp claws', '鋭い爪'), descriptions: l('상대를 할퀴어 깊은 상처를 남긴다.', 'Can rake an opponent and leave wounds.', '相手を引っかいて傷を残す。'), modifiers: {} },
];
export const FANTASY_EXTRA_RACE_COMBAT_TRAITS: Record<string, string[]> = {
  goatkin: ['horned'], dragonblood: ['horned', 'clawed'], 'frost-dragonkin': ['horned', 'clawed'], 'storm-dragonkin': ['horned', 'clawed'],
  'true-dragon': ['horned', 'clawed'], 'elder-dragon': ['horned', 'clawed'], wolfkin: ['clawed'], catkin: ['clawed'], bearkin: ['clawed'], lizardkin: ['clawed'],
  elf: ['long-limbed'], 'high-elf': ['long-limbed'], 'dark-elf': ['long-limbed'], 'snow-elf': ['long-limbed'],
  orc: ['long-limbed'], hobgoblin: ['long-limbed'], deerkin: ['horned', 'long-limbed'], celestial: ['long-limbed'], demigod: ['long-limbed'],
};
export const FANTASY_BODY_COMBAT_CAPABILITIES: Record<string, string[]> = {
  large: ['mass'], 'long-limbed': ['long-reach'], keen: ['precision'], 'balancing-tail': ['tail'], winged: ['wings'], horned: ['horns'], clawed: ['claws'],
  flexible: ['flexibility'], aquatic: ['aquatic'], 'webbed-limbs': ['aquatic'], 'living-sapwood': ['wood'], 'mineral-core': ['mineral'], ethereal: ['ethereal'],
  'strong-hands': ['strong-grip'], 'flexible-joints': ['joint-flexibility'], 'elastic-cartilage': ['joint-flexibility'], 'spring-tendons': ['spring'], 'gripping-digits': ['grip'],
};
export interface FantasyBodyAttackRule { trait: string; tags: string[]; reach?: number; accuracy?: number; secondary?: number }
export const FANTASY_BODY_ATTACK_RULES: FantasyBodyAttackRule[] = [
  { trait: 'large', tags: ['physical-melee'], reach: 1 }, { trait: 'long-limbed', tags: ['thrust', 'unarmed'], reach: 1 },
  { trait: 'keen', tags: ['precision'], reach: 1 }, { trait: 'balancing-tail', tags: ['sweep'], accuracy: 2 },
  { trait: 'flexible', tags: ['unarmed'], accuracy: 2 }, { trait: 'winged', tags: ['aerial'], accuracy: 2 },
  { trait: 'overlapping-scales', tags: ['breath'], secondary: 5 }, { trait: 'mana-woven', tags: ['arcane'], accuracy: 1 },
  { trait: 'mineral-core', tags: ['impact'], accuracy: 1 },
  { trait: 'strong-hands', tags: ['grapple'], accuracy: 2 }, { trait: 'flexible-joints', tags: ['unarmed'], accuracy: 1 },
  { trait: 'gripping-digits', tags: ['grapple'], accuracy: 1 }, { trait: 'spring-tendons', tags: ['leap'], accuracy: 2 },
];
export interface FantasyBodyCombatTechnique { requires: string | string[]; level: number; skill: FantasySkill; combat: Omit<FantasyCombatSkill, 'id' | 'names' | 'mp'>; tags: string[] }
function art(id: string, title: ReturnType<typeof l>, requires: string | string[], level: number, mp: number, combat: FantasyBodyCombatTechnique['combat'], tags: string[]): FantasyBodyCombatTechnique {
  const shape = { single: l('단일', 'single', '単体'), line: l('직선 관통', 'piercing line', '直線貫通'), cone: l('전방90도', 'forward90°', '前方90度'), fan: l('전방180도', 'forward180°', '前方180度'), burst: l('대상 중심 원형', 'target-centered burst', '対象中心の円形') }[combat.shape ?? 'single'];
  const effect = combat.hitUtility && { weaken: l('약화', 'weaken', '弱化'), vulnerable: l('틈새 노출', 'vulnerable', '隙の露出'), bleed: l('출혈', 'bleed', '出血'), blind: l('시야 교란', 'blind', '視界妨害'), root: l('속박', 'root', '束縛'), silence: l('침묵', 'silence', '沈黙') }[combat.hitUtility.id];
  const descriptions = l(`${title.ko}: 기본 사거리${combat.reach}, ${shape.ko}${combat.radius ? ` 반경${combat.radius}` : ''}.${effect ? ` 유효 명중 시 ${Math.round(combat.hitUtility!.chance * 100)}%로 ${effect.ko}${combat.hitUtility!.power}, 3라운드.` : ''}${combat.motion ? ` 최대${combat.motion.distance}칸 접근.` : ''}`,
    `${title.en}: base reach${combat.reach}, ${shape.en}${combat.radius ? ` radius${combat.radius}` : ''}.${effect ? ` Damaging hits: ${Math.round(combat.hitUtility!.chance * 100)}% ${effect.en}${combat.hitUtility!.power}, 3 rounds.` : ''}${combat.motion ? ` Approach up to${combat.motion.distance} tiles.` : ''}`,
    `${title.ja}：基本射程${combat.reach}、${shape.ja}${combat.radius ? `半径${combat.radius}` : ''}。${effect ? `有効命中時${Math.round(combat.hitUtility!.chance * 100)}%で${effect.ja}${combat.hitUtility!.power}、3ラウンド。` : ''}${combat.motion ? `最大${combat.motion.distance}マス接近。` : ''}`);
  return { requires, level, tags, combat, skill: { id, name: title.ja, names: title, kind: 'active', effect: 'check', stat: combat.magic ? 'intelligence' : 'strength', power: 3, mp, description: descriptions.ja, descriptions } };
}
const hex = (id: 'weaken' | 'vulnerable' | 'bleed' | 'blind' | 'root', power: number, chance: number) => ({ id, power, chance });
export const FANTASY_BODY_COMBAT_TECHNIQUES: FantasyBodyCombatTechnique[] = [
  art('body-extended-palm', l('뻗는 장타', 'Extended Palm', '伸掌打'), 'long-reach', 2, 7, { kind: 'attack', power: 8, range: 'melee', reach: 1, shape: 'single', hitUtility: hex('vulnerable', 1, .35) }, ['physical-melee', 'unarmed', 'thrust']),
  art('body-grip-crush', l('붙잡아 으깨기', 'Grip Crush', '握り潰し'), ['strong-grip', 'mass'], 3, 9, { kind: 'attack', power: 10, range: 'melee', reach: 1, shape: 'single', hitUtility: hex('weaken', 2, .45) }, ['physical-melee', 'grapple']),
  art('body-coiling-strike', l('비틀어 치기', 'Coiling Strike', '捻り打ち'), 'joint-flexibility', 3, 8, { kind: 'attack', power: 8, range: 'melee', reach: 1, shape: 'fan', secondaryDamage: 55, hitUtility: hex('vulnerable', 1, .3) }, ['physical-melee', 'unarmed']),
  art('body-spring-kick', l('도약 차기', 'Spring Kick', '跳躍蹴り'), 'spring', 3, 8, { kind: 'attack', power: 9, range: 'melee', reach: 3, shape: 'single', motion: { kind: 'advance', distance: 2 }, hitUtility: hex('weaken', 1, .35) }, ['physical-melee', 'unarmed', 'leap']),
  art('body-tail-sweep', l('꼬리 휩쓸기', 'Tail Sweep', '尾の薙ぎ払い'), 'tail', 2, 8, { kind: 'attack', power: 9, range: 'melee', reach: 2, shape: 'fan', secondaryDamage: 60, hitUtility: hex('weaken', 2, .3) }, ['sweep', 'physical-melee']),
  art('body-horn-gore', l('뿔 돌진', 'Horn Charge', '角の突進'), 'horns', 2, 9, { kind: 'attack', power: 11, range: 'melee', reach: 3, shape: 'single', damageType: 'pierce', motion: { kind: 'advance', distance: 2 }, hitUtility: hex('vulnerable', 2, .4) }, ['impact']),
  art('body-claw-rend', l('찢는 발톱', 'Rending Claws', '裂く爪'), 'claws', 2, 6, { kind: 'attack', power: 8, range: 'melee', reach: 1, shape: 'single', hitUtility: hex('bleed', 2, .6) }, ['physical-melee', 'unarmed']),
  art('body-wing-gust', l('날갯바람', 'Wing Gust', '羽ばたきの風'), 'wings', 3, 9, { kind: 'attack', power: 8, range: 'magic', magic: true, reach: 3, shape: 'cone', secondaryDamage: 60, hitUtility: hex('blind', 2, .4) }, ['aerial', 'arcane']),
  art('body-wing-dive', l('급강하 타격', 'Diving Strike', '急降下打撃'), 'wings', 4, 10, { kind: 'attack', power: 11, range: 'melee', reach: 4, shape: 'single', motion: { kind: 'advance', distance: 3 }, hitUtility: hex('vulnerable', 2, .35) }, ['aerial']),
  art('body-root-lash', l('뿌리 얽기', 'Root Lash', '根絡め'), 'wood', 3, 9, { kind: 'attack', power: 8, range: 'magic', magic: true, reach: 4, shape: 'single', hitUtility: hex('root', 1, .35) }, ['arcane']),
  art('body-mineral-pulse', l('광물 진동', 'Mineral Pulse', '鉱物の震動'), 'mineral', 3, 10, { kind: 'attack', power: 10, range: 'ranged', magic: false, reach: 3, radius: 1, shape: 'burst', secondaryDamage: 65, hitUtility: hex('weaken', 2, .4) }, ['impact']),
  art('body-tidal-lance', l('물결 창', 'Tidal Lance', '潮の槍'), 'aquatic', 3, 8, { kind: 'attack', power: 9, range: 'magic', magic: true, reach: 4, shape: 'line', secondaryDamage: 75, onHit: { id: 'frost', power: 1, turns: 3, chance: .4 } }, ['arcane']),
  art('body-ether-needle', l('허상의 바늘', 'Ether Needle', '幻の針'), 'ethereal', 3, 9, { kind: 'attack', power: 8, range: 'magic', magic: true, reach: 4, shape: 'line', secondaryDamage: 75, hitUtility: hex('vulnerable', 2, .35) }, ['arcane']),
];
export const FANTASY_BODY_ATTACK_IDS = new Set(FANTASY_BODY_COMBAT_TECHNIQUES.map(entry => entry.skill.id));
export const fantasyCombatOnlySkill = (id: string): boolean => FANTASY_BODY_ATTACK_IDS.has(id) || id.endsWith('-reposition') || ['tech-thief-piercing-dash', 'tech-warrior-charge', 'tech-pugilist-step-strike', 'tech-assassin-shadow-step'].includes(id);
export function fantasyBodyCombatCapabilities(traits: string[]): Set<string> {
  return new Set(traits.flatMap(id => Object.hasOwn(FANTASY_BODY_COMBAT_CAPABILITIES, id) ? FANTASY_BODY_COMBAT_CAPABILITIES[id] : []));
}
export function fantasyBodyAdjustAttack(skill: FantasyCombatSkill, traits: string[], tags: string[]): FantasyCombatSkill {
  const rules = FANTASY_BODY_ATTACK_RULES.filter(rule => traits.includes(rule.trait) && rule.tags.some(tag => tags.includes(tag)));
  const reach = Math.min(1, Math.max(0, ...rules.map(rule => rule.reach ?? 0))), accuracy = Math.min(3, rules.reduce((sum, rule) => sum + (rule.accuracy ?? 0), 0));
  const secondary = Math.min(5, Math.max(0, ...rules.map(rule => rule.secondary ?? 0)));
  return { ...skill, reach: Math.min(tags.includes('physical-melee') ? 3 : 10, (skill.reach ?? 1) + reach),
    ...(accuracy ? { hitBonus: Math.min(20, (skill.hitBonus ?? 0) + accuracy) } : {}),
    ...(skill.secondaryDamage && secondary ? { secondaryDamage: Math.min(80, skill.secondaryDamage + secondary) } : {}) };
}
