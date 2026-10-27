import { createHash } from 'node:crypto';
import type { FantasyProfile } from '../shared/fantasy.ts';
import type { FantasyCombatOptions, FantasyCombatPlayer, FantasyCombatState, FantasyCombatCompanionInput } from '../shared/fantasy-combat.ts';
import { fantasySkills, fantasyStats } from '../shared/fantasy-engine.ts';
import { FANTASY_ITEMS, FANTASY_RACES } from '../shared/fantasy-data.ts';
import { fantasyCombatStat, fantasyEquippedGear, fantasyMaterialGrade } from '../shared/fantasy-equipment.ts';
import { fantasyItemBonuses } from '../shared/fantasy-effects.ts';
import { fantasyNeedPenalty, foodMeta } from '../shared/fantasy-life.ts';
import { fantasySkillName } from '../shared/fantasy-skill-names.ts';
import { fantasyEnvironmentPenalty } from '../shared/fantasy-environment.ts';
import { FANTASY_COMPANIONS, FANTASY_MAGIC_COMBINATIONS, fantasySpellCapacity, type FantasyCompanyKind } from '../shared/fantasy-specializations.ts';
import { fantasyTermName } from '../shared/fantasy-lore.ts';
import { fantasyPriestCombatSkill } from '../shared/fantasy-priest-growth.ts';
import { fantasyIsJobPathSkill, fantasyJobPathCombatPassive, fantasyJobPathCombatSkill } from '../shared/fantasy-job-paths.ts';

const clamp = (value: number, min: number, max: number) => Math.max(min, Math.min(max, Math.round(value)));
export const fantasyCombatProfessionUsesCombat = (job: string) => ['adventurer', 'hunter', 'bard', 'leader', 'crimeboss', 'warrior', 'knight', 'spearfighter', 'archer', 'scout', 'pugilist', 'spellblade', 'shieldbearer', 'mage', 'priest', 'summoner', 'thief', 'smuggler', 'assassin', 'bandit', 'spy'].includes(job);
export function fantasyCombatPlayer(profile: FantasyProfile, user: string): FantasyCombatPlayer {
  const c = profile.character!;
  if (!c || profile.death || c.hp <= 0) throw new TypeError('A living character is required');
  const stats = fantasyStats(c), itemBonuses = fantasyItemBonuses(c, FANTASY_ITEMS), equipped = fantasyEquippedGear(c);
  const grade = (slot: 'weapon' | 'armor' | 'accessory') => {
    const item = FANTASY_ITEMS.find(item => item.id === c.equipment?.[slot] && item.equipment?.slot === slot && (c.inventory[item.id] ?? 0) > 0);
    if (!item) return 0;
    const gear = equipped.find(gear => gear.item === item.id);
    return Math.min(5, Math.max(item.tier ?? 1, gear?.quality ?? 1, gear?.material ? fantasyMaterialGrade(FANTASY_ITEMS.find(item => item.id === gear.material)!) : 1));
  };
  const masterwork = (slot: 'weapon' | 'armor') => {
    const item = FANTASY_ITEMS.find(item => item.id === c.equipment?.[slot] && item.equipment?.slot === slot && (c.inventory[item.id] ?? 0) > 0);
    const gear = item && equipped.find(gear => gear.item === item.id), material = gear?.material && FANTASY_ITEMS.find(item => item.id === gear.material);
    const substantial = !!item && Math.max(item.tier ?? 1, material ? fantasyMaterialGrade(material) : 1) >= 3;
    return substantial && gear && gear.quality >= 4 ? gear.quality : 0;
  };
  const combatStat = fantasyCombatStat(c), ranged = /bow|crossbow|javelin/.test(c.equipment?.weapon ?? ''), magic = /staff|sacred-book/.test(c.equipment?.weapon ?? '') || ['mage', 'priest', 'summoner'].includes(c.job);
  const range: FantasyCombatPlayer['range'] = magic ? 'magic' : ranged ? 'ranged' : 'melee';
  const knownSkills = fantasySkills(c);
  const passive = Math.min(8, knownSkills.filter(skill => !fantasyIsJobPathSkill(skill.id) && skill.id !== 'priest-oath-witness' && skill.kind === 'passive' && skill.effect === 'check' && (!skill.stat || skill.stat === combatStat)).reduce((sum, skill) => sum + skill.power, 0));
  const passiveGuard = Math.min(10, knownSkills.filter(skill => !fantasyIsJobPathSkill(skill.id) && skill.kind === 'passive' && skill.effect === 'guard').reduce((sum, skill) => sum + skill.power, 0));
  const pathBonuses = { attack: 0, accuracy: 0, defense: 0, magicResist: 0 };
  for (const skill of knownSkills.filter(skill => skill.kind === 'passive')) {
    const bonus = fantasyJobPathCombatPassive(skill.id); if (!bonus) continue;
    for (const key of Object.keys(pathBonuses) as (keyof typeof pathBonuses)[]) pathBonuses[key] = Math.min(3, pathBonuses[key] + (bonus[key] ?? 0) * Math.min(3, skill.power));
  }
  const need = fantasyNeedPenalty(c), environment = fantasyEnvironmentPenalty(c), main = stats[combatStat] ?? stats.strength;
  const weaponQuality = masterwork('weapon'), armorQuality = masterwork('armor');
  const combatJobs = new Set(['adventurer', 'hunter', 'warrior', 'knight', 'spearfighter', 'archer', 'scout', 'pugilist', 'spellblade', 'shieldbearer', 'mage', 'priest', 'summoner', 'thief', 'smuggler', 'assassin', 'bandit', 'spy']);
  const raceSkills = new Set(FANTASY_RACES.find(race => race.id === c.race)?.skills.map(skill => skill.id));
  const prepared = c.job === 'mage' ? (c.specialization?.spells ?? []).flatMap(spell => {
    const combo = FANTASY_MAGIC_COMBINATIONS.find(combo => combo.element === spell.element && combo.form === spell.form);
    return combo && spell.slot <= fantasySpellCapacity(c) ? [{ id: `prepared-spell-${spell.slot}`, names: combo.names, kind: combo.effect === 'heal' ? 'heal' as const : combo.effect === 'guard' ? 'guard' as const : 'attack' as const,
      mp: combo.mp, power: combo.power * (combo.effect === 'check' ? 3 : 1), magic: combo.effect === 'check', range: 'magic' as const }] : [];
  }) : [];
  const player: FantasyCombatPlayer = { id: `fighter-${createHash('sha256').update(`${user}:${profile.generation ?? 1}`).digest('hex').slice(0, 24)}`, userId: user,
    names: { ko: c.name, en: c.name, ja: c.name }, generation: profile.generation ?? 1, position: range === 'melee' ? 'front' : 'rear', range,
    stats: { hp: stats.hp, mp: stats.mp, attack: clamp(10 + main * 2 + c.level * 1.3 + grade('weapon') * 5 + passive + pathBonuses.attack - need * 2 + (weaponQuality === 5 ? 20 : weaponQuality === 4 ? 10 : 0), 1, 10000),
      defense: clamp(stats.vitality * .7 + itemBonuses.guard * 1.5 + grade('armor') * 3 + passiveGuard * 1.4 + pathBonuses.defense + (armorQuality === 5 ? 10 : armorQuality === 4 ? 6 : 0), 0, 1000),
      agility: clamp(stats.agility - need - environment, 1, 1000), intelligence: clamp(stats.intelligence - need + (range === 'magic' ? weaponQuality === 5 ? 10 : weaponQuality === 4 ? 5 : 0 : 0), 1, 1000),
      accuracy: clamp(64 + stats.agility * .8 + itemBonuses.check * 2 + pathBonuses.accuracy - (need + environment) * 3, 35, 95), magicResist: clamp(stats.intelligence * .6 + stats.vitality * .3 + grade('accessory') * 2 + pathBonuses.magicResist, 0, 1000) },
    hp: c.hp, mp: c.mp,
    skills: [...knownSkills.filter(skill => skill.kind === 'active').flatMap(skill => {
      const specialized = fantasyJobPathCombatSkill(skill.id, skill.power) ?? fantasyPriestCombatSkill(skill.id, skill.power);
      if (!specialized && (fantasyIsJobPathSkill(skill.id) || !['check', 'heal', 'guard'].includes(skill.effect)
        || !(skill.effect !== 'check' || combatJobs.has(c.job) && skill.id.startsWith(`${c.job}-`) || raceSkills.has(skill.id) && skill.stat !== 'charisma' && skill.stat !== 'dexterity' || skill.id.startsWith('mana-')))) return [];
      return [{ id: skill.id, names: { ko: fantasySkillName(skill, 'ko'), en: fantasySkillName(skill, 'en'), ja: fantasySkillName(skill, 'ja') },
        kind: skill.effect === 'heal' ? 'heal' as const : skill.effect === 'guard' ? 'guard' as const : 'attack' as const,
        mp: skill.mp, power: clamp(skill.power * (skill.effect === 'heal' ? 2 : skill.effect === 'guard' ? 2 : 3), 1, 100), magic: skill.effect === 'check' && (skill.stat === 'intelligence' || range === 'magic'), range,
        ...specialized }];
    }), ...prepared],
  };
  const companions = fantasyCombatCompanions(profile, player);
  if (companions.length) player.companions = companions;
  return player;
}
export function fantasyCombatCompanions(profile: FantasyProfile, owner: FantasyCombatPlayer): FantasyCombatCompanionInput[] {
  const c = profile.character, kind: FantasyCompanyKind | undefined = c?.job === 'leader' ? 'troop' : c?.job === 'crimeboss' ? 'syndicate' : c?.job === 'summoner' ? 'summons' : undefined;
  if (!c || !kind) return [];
  return (c.specialization?.companies?.[kind]?.members ?? []).filter(member => member.assigned && member.condition === 'ready' && member.hp > 0).slice(0, 2).flatMap(member => {
    const template = FANTASY_COMPANIONS.find(entry => entry.id === member.id && entry.kind === kind);
    if (!template) return [];
    const magic = kind === 'summons' && template.id !== 'summon-stone', ranged = template.id.includes('scout') || template.id.includes('lookout');
    const hp = Math.round(template.hp * (1.5 + Math.min(30, c.level) * .08)), mp = magic ? Math.max(12, Math.round(owner.stats.mp * .3)) : 0;
    const guard = template.guard > 0, healing = template.id === 'summon-wisp';
    return [{ id: member.id, kind, names: template.names, stats: { hp, mp, attack: Math.max(3, Math.round(owner.stats.attack * .32)),
      defense: Math.round(owner.stats.defense * .55 + template.guard), agility: Math.max(3, Math.round(owner.stats.agility * .75)), intelligence: Math.max(3, Math.round(owner.stats.intelligence * .45)),
      accuracy: Math.min(90, owner.stats.accuracy), magicResist: Math.round(owner.stats.magicResist * .5) }, hp: Math.max(1, Math.round(hp * member.hp / template.hp)), mp,
      range: magic ? 'magic' as const : ranged ? 'ranged' as const : 'melee' as const,
      skills: guard ? [{ id: 'companion-cover', names: { ko: '동료 엄호', en: 'Cover an Ally', ja: '仲間を庇う' }, kind: 'guard' as const, power: 5 + template.guard * 2, mp: 0 }]
        : healing ? [{ id: 'companion-mend', names: { ko: '등불의 치유', en: 'Lamplight Mending', ja: '灯の癒やし' }, kind: 'heal' as const, power: 8, mp: 4, range: 'magic' as const }] : [],
    }];
  });
}
export function fantasyCombatApplyCompanions(profile: FantasyProfile, battle: FantasyCombatState, user: string): boolean {
  const c = profile.character;
  if (!c) return false;
  let changed = false;
  for (const unit of battle.units ?? []) {
    const binding = unit.companion;
    if (!binding || binding.ownerId !== user || binding.generation !== (profile.generation ?? 1)) continue;
    const member = c.specialization?.companies?.[binding.kind]?.members.find(member => member.id === binding.member), template = FANTASY_COMPANIONS.find(entry => entry.id === binding.member);
    if (!member || !template) continue;
    const hp = unit.hp <= 0 ? 0 : Math.max(1, Math.min(template.hp, Math.round(unit.hp / unit.stats.hp * template.hp)));
    const condition = hp <= 0 ? binding.kind === 'summons' ? 'absent' : 'injured' : member.condition;
    if (member.hp !== hp || member.condition !== condition || hp <= 0 && member.assigned) {
      member.hp = hp; member.condition = condition; if (hp <= 0) member.assigned = false; changed = true;
    }
  }
  return changed;
}
export function fantasyCombatSupplies(profiles: ReadonlyMap<string, FantasyProfile>, users: readonly string[]): FantasyCombatOptions {
  const supplies: NonNullable<FantasyCombatOptions['supplies']> = {};
  for (const user of users) {
    const c = profiles.get(user)?.character;
    if (!c) continue;
    supplies[user] = Object.fromEntries(FANTASY_ITEMS.filter(item => (c.inventory[item.id] ?? 0) > 0 && !foodMeta(item.id) && item.category !== 'food' && !item.food
      && (item.id === 'potion' || !!item.use && (!!item.use.hp || !!item.use.mp || !!item.use.cure?.length))).map(item => [item.id, {
      count: c.inventory[item.id], names: item.names ?? { ko: fantasyTermName(item.id, 'ko'), en: fantasyTermName(item.id, 'en'), ja: fantasyTermName(item.id, 'ja') },
      ...((item.use?.hp ?? (item.id === 'potion' ? 35 : 0)) ? { hp: item.use?.hp ?? 35 } : {}), ...((item.use?.mp ?? (item.id === 'potion' ? 20 : 0)) ? { mp: item.use?.mp ?? 20 } : {}),
      ...(item.use?.cure?.some(id => ['poison', 'burn', 'frost'].includes(id)) ? { cleanse: item.use!.cure!.filter((id): id is 'poison' | 'burn' | 'frost' => ['poison', 'burn', 'frost'].includes(id)) } : {}),
    }]));
  }
  return { supplies };
}
