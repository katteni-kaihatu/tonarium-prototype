import { fantasyJobCombatProfile } from '../shared/fantasy-job-balance.ts';
import { fantasySkillVisualTier } from '../shared/fantasy-combat-visuals.ts';
import { fantasyUltimateCombatSkill, fantasyUltimateWeaponReady } from '../shared/fantasy-ultimate-skills.ts';
import { FANTASY_MIRACLES, FANTASY_PRIEST_HOLY_ATTACKS } from '../shared/fantasy-miracle-catalog.ts';
import { fantasyIsSaint } from '../shared/fantasy-miracles.ts';
import { fantasyBodyTraits } from '../shared/fantasy-physiology.ts';
import { FANTASY_BODY_ATTACK_IDS } from '../shared/fantasy-body-combat-catalog.ts';
import { fantasyWeaponAttackProfile, fantasyWeaponTechniqueReady } from '../shared/fantasy-weapon-attacks.ts';
import { fantasyCombatSkillRole, fantasyIsLifeCareerSkill } from '../shared/fantasy-combat-capabilities.ts';
import { createHash } from 'node:crypto';
import type { FantasyProfile } from '../shared/fantasy.ts';
import type { FantasyCombatOptions, FantasyCombatPlayer, FantasyCombatState, FantasyCombatCompanionInput, FantasyCombatSkill } from '../shared/fantasy-combat.ts';
import { fantasySkills, fantasyStats } from '../shared/fantasy-engine.ts';
import { FANTASY_ITEMS, FANTASY_RACES, FANTASY_JOBS } from '../shared/fantasy-data.ts';
import { fantasyCombatStat, fantasyMaterialGrade } from '../shared/fantasy-equipment.ts';
import { fantasyActiveEquipmentEntries } from '../shared/fantasy-equipment-slots.ts';
import { fantasyItemBonuses } from '../shared/fantasy-effects.ts';
import { fantasyNeedPenalty, foodMeta } from '../shared/fantasy-life.ts';
import { fantasySkillName } from '../shared/fantasy-skill-names.ts';
import { fantasyEnvironmentPenalty } from '../shared/fantasy-environment.ts';
import { FANTASY_COMPANIONS, FANTASY_MAGIC_COMBINATIONS, fantasyCanPrepareMagic, fantasyActiveCompanions } from '../shared/fantasy-specializations.ts';
import { fantasyTermName } from '../shared/fantasy-lore.ts';
import { fantasyPriestCombatSkill } from '../shared/fantasy-priest-growth.ts';
import { fantasyIsJobPathSkill, fantasyJobPathCombatPassive, fantasyJobPathCombatSkill } from '../shared/fantasy-job-paths.ts';
import { fantasyCompileCircle } from '../shared/fantasy-magic-circle.ts';
import { fantasySummonCombatSpec } from '../shared/fantasy-summon-paths.ts';

import { fantasyWorkerCompanionCombat } from '../shared/fantasy-worker-companions.ts';

const clamp = (value: number, min: number, max: number) => Math.max(min, Math.min(max, Math.round(value)));
export const fantasyCombatProfessionUsesCombat = (job: string) => ['adventurer', 'hunter', 'bard', 'leader', 'crimeboss', 'warrior', 'knight', 'spearfighter', 'archer', 'scout', 'ranger', 'pugilist', 'spellblade', 'shieldbearer', 'mage', 'priest', 'summoner', 'thief', 'smuggler', 'assassin', 'bandit', 'spy'].includes(job);
export function fantasyCombatPlayer(profile: FantasyProfile, user: string): FantasyCombatPlayer {
  const c = profile.character!;
  if (!c || profile.death || c.hp <= 0) throw new TypeError('A living character is required');
  const stats = fantasyStats(c), itemBonuses = fantasyItemBonuses(c, FANTASY_ITEMS), equipped = fantasyActiveEquipmentEntries(c, FANTASY_ITEMS);
  const group = (slot: 'weapon' | 'armor' | 'accessory') => equipped.filter(entry => slot === 'weapon' ? entry.slot === 'weapon'
    : slot === 'armor' ? entry.slot === 'body' || ['head', 'legs', 'feet', 'gloves'].includes(entry.slot) && entry.item.category === 'armor'
      : ['ring1', 'ring2', 'necklace', 'head', 'gloves'].includes(entry.slot) && (entry.item.equipment?.slot === 'accessory' || entry.item.category === 'accessory'));
  const sources = (slot: 'weapon' | 'armor' | 'accessory') => group(slot).map(entry => {
    const gear = c.gear?.find(gear => gear.id === entry.instance);
    const material = gear?.material && FANTASY_ITEMS.find(item => item.id === gear.material);
    return { item: entry.item, gear, materialGrade: material ? fantasyMaterialGrade(material) : 1 };
  });
  // 部位数で等級を加算せず、旧来の一品分を上限として扱う。
  const grade = (slot: 'weapon' | 'armor' | 'accessory') => Math.min(5, Math.max(0, ...sources(slot).map(({ item, gear, materialGrade }) => Math.max(item.tier ?? 1, gear?.quality ?? 1, materialGrade))));
  const masterwork = (slot: 'weapon' | 'armor') => Math.max(0, ...sources(slot).map(({ item, gear, materialGrade }) => Math.max(item.tier ?? 1, materialGrade) >= 3 && gear && gear.quality >= 4 ? gear.quality : 0));
  const combatStat = fantasyCombatStat(c), ranged = /bow|crossbow|javelin/.test(c.equipment?.weapon ?? ''), magic = /staff|sacred-book/.test(c.equipment?.weapon ?? '') || ['mage', 'priest', 'summoner'].includes(c.job);
  const range: FantasyCombatPlayer['range'] = magic ? 'magic' : ranged ? 'ranged' : 'melee';
  const knownSkills = fantasySkills(c).filter(skill => !fantasyIsLifeCareerSkill(skill.id));
  const passive = Math.min(8, knownSkills.filter(skill => !fantasyIsJobPathSkill(skill.id) && skill.id !== 'priest-oath-witness' && skill.kind === 'passive' && skill.effect === 'check' && (!skill.stat || skill.stat === combatStat)).reduce((sum, skill) => sum + skill.power, 0));
  const passiveGuard = Math.min(10, knownSkills.filter(skill => !fantasyIsJobPathSkill(skill.id) && skill.kind === 'passive' && skill.effect === 'guard').reduce((sum, skill) => sum + skill.power, 0));
  const pathBonuses = { attack: 0, accuracy: 0, defense: 0, magicResist: 0 };
  for (const skill of knownSkills.filter(skill => skill.kind === 'passive')) {
    const bonus = fantasyJobPathCombatPassive(skill.id); if (!bonus) continue;
    for (const key of Object.keys(pathBonuses) as (keyof typeof pathBonuses)[]) pathBonuses[key] = Math.min(3, pathBonuses[key] + (bonus[key] ?? 0) * Math.min(3, skill.power));
  }
  const need = fantasyNeedPenalty(c), environment = fantasyEnvironmentPenalty(c), main = stats[combatStat] ?? stats.strength;
  const weaponQuality = masterwork('weapon'), armorQuality = masterwork('armor');
  const raceSkills = new Set(FANTASY_RACES.find(race => race.id === c.race)?.skills.map(skill => skill.id));
  const attackContext = { weapon: (c.inventory[c.equipment?.weapon ?? ''] ?? 0) > 0 ? c.equipment?.weapon ?? '' : '', traits: fantasyBodyTraits(c).map(trait => trait.id) };
  const prepared = ['mage', 'priest'].includes(c.job) ? (c.specialization?.spells ?? []).flatMap<FantasyCombatSkill>(spell => {
    if (spell.circle) {
      const circle = fantasyCompileCircle(c, spell.circle.core, spell.circle.runes);
      return circle && circle.kind !== 'miracle' ? [{ id: `prepared-spell-${spell.slot}`, names: circle.names, kind: circle.kind, mp: circle.mp, power: circle.power, magic: circle.magic,
        range: 'magic' as const, reach: circle.reach, radius: circle.radius, selfOnly: circle.selfOnly, effects: circle.effects, ...(circle.field ? { field: circle.field } : {}),
        damageType: circle.core === 'flame' ? 'fire' as const : circle.core === 'stone' || circle.core === 'physical' ? 'blunt' as const : 'none' as const }] : [];
    }
    const combo = FANTASY_MAGIC_COMBINATIONS.find(combo => combo.element === spell.element && combo.form === spell.form);
    return combo && fantasyCanPrepareMagic(c, spell.element, spell.form, spell.slot) ? [{ id: `prepared-spell-${spell.slot}`, names: combo.names, kind: combo.effect === 'heal' ? 'heal' as const : combo.effect === 'guard' ? 'guard' as const : 'attack' as const,
      mp: combo.mp, power: combo.power * (combo.effect === 'check' ? 3 : 1), magic: combo.effect === 'check', range: 'magic' as const, damageType: combo.element === 'flame' ? 'fire' as const : combo.element === 'stone' ? 'blunt' as const : 'none' as const }] : [];
  }) : [];
  const player: FantasyCombatPlayer = { id: `fighter-${createHash('sha256').update(`${user}:${profile.generation ?? 1}`).digest('hex').slice(0, 24)}`, userId: user,
    names: { ko: c.name, en: c.name, ja: c.name }, generation: profile.generation ?? 1, position: range === 'melee' ? 'front' : 'rear', range,
    stats: { hp: stats.hp, mp: stats.mp, attack: clamp(10 + main * 2 + c.level * 1.3 + grade('weapon') * 5 + passive + pathBonuses.attack - need * 2 + (weaponQuality === 5 ? 20 : weaponQuality === 4 ? 10 : 0), 1, 10000),
      defense: clamp(stats.vitality * .7 + itemBonuses.guard * 1.5 + grade('armor') * 3 + passiveGuard * 1.4 + pathBonuses.defense + (armorQuality === 5 ? 10 : armorQuality === 4 ? 6 : 0), 0, 1000),
      agility: clamp(stats.agility - need - environment, 1, 1000), intelligence: clamp(stats.intelligence - need + (range === 'magic' ? weaponQuality === 5 ? 10 : weaponQuality === 4 ? 5 : 0 : 0), 1, 1000),
      accuracy: clamp(64 + stats.agility * .8 + itemBonuses.check * 2 + pathBonuses.accuracy - (need + environment) * 3, 35, 95), magicResist: clamp(stats.intelligence * .6 + stats.vitality * .3 + grade('accessory') * 2 + pathBonuses.magicResist, 0, 1000) },
    ...(c.carrying?{externalCarrying:{user:c.carrying.target,generation:c.carrying.targetGeneration}}:{}),
    hp: Math.min(c.hp,stats.hp), mp: Math.min(c.mp,stats.mp), ...(c.soulAfflictions?.length ? { miracles: { afflictions: [...c.soulAfflictions] } } : {}),
    vocation: { job: c.job, ...(c.job === 'priest' && c.priestGrowth?.branch ? { path: `priest-${c.priestGrowth.branch}` } : c.jobPaths?.[c.job]?.path ? { path: c.jobPaths[c.job].path } : {}) },
    body: Object.fromEntries(fantasyBodyTraits(c).flatMap(trait => trait.id === 'small' || trait.id === 'tiny' ? [['small', true]] : trait.id === 'large' || trait.id === 'heavy' ? [['large', true]] : trait.id === 'winged' ? [['flying', true]] : trait.id === 'flexible' || trait.id === 'ethereal' ? [['flexible', true]] : [])),
    attackDamageType: /bow|crossbow|javelin|spear|sword|dagger/.test(c.equipment?.weapon ?? '') ? 'pierce' : range === 'magic' ? 'none' : 'blunt',
    skills: [...knownSkills.filter(skill => skill.kind === 'active' && !skill.retired).flatMap<FantasyCombatSkill>(skill => {
      if (!fantasyWeaponTechniqueReady(skill.id, attackContext.weapon) || !fantasyUltimateWeaponReady(skill.id, attackContext.weapon)) return [];
      const holy = FANTASY_PRIEST_HOLY_ATTACKS.find(entry => entry.skill.id === skill.id && c.job === 'priest' && entry.branch === c.priestGrowth?.branch); if (holy) return [{...structuredClone(holy.skill),power:holy.skill.power+Math.min(10,Math.max(0,skill.power-5)*2)}];
      const ultimate = fantasyUltimateCombatSkill(skill.id, skill.power); if (ultimate) return [ultimate];
      if (skill.utility && !['dragonblood-flame', 'true-dragon-roar'].includes(skill.id)) return [{ id: skill.id, names: { ko: fantasySkillName(skill, 'ko'), en: fantasySkillName(skill, 'en'), ja: fantasySkillName(skill, 'ja') },
        kind: ['weaken', 'vulnerable', 'blind', 'bleed', 'root', 'silence'].includes(skill.utility) ? 'hex' as const : 'boon' as const, utility: skill.utility, power: clamp(skill.power, 1, 12), mp: skill.mp, range: 'magic' as const }];
      if (skill.restore === 'mp') return c.manaRecoveryAt !== undefined && c.hour - c.manaRecoveryAt < 6 ? [] : [{ id: skill.id,
        names: { ko: fantasySkillName(skill, 'ko'), en: fantasySkillName(skill, 'en'), ja: fantasySkillName(skill, 'ja') }, kind: 'mana' as const, mp: skill.mp, power: skill.power, range: 'magic' as const }];
      const specialized = fantasyJobPathCombatSkill(skill.id, skill.power) ?? fantasyPriestCombatSkill(skill.id, skill.power);
      const common = c.learnedSkills?.includes(skill.id) === true;
      const racial = raceSkills.has(skill.id) || FANTASY_BODY_ATTACK_IDS.has(skill.id), own = FANTASY_JOBS.find(job => job.id === c.job)?.skills.some(entry => entry.id === skill.id);
      const role = fantasyCombatSkillRole(skill, racial || common || skill.id.startsWith('mana-') ? 'race' : 'job', racial ? c.race : c.job);
      if (!specialized && (fantasyIsJobPathSkill(skill.id) || !role || !racial && !own && !common && !skill.id.startsWith('mana-'))) return [];
      return [fantasyWeaponAttackProfile({ id: skill.id, names: { ko: fantasySkillName(skill, 'ko'), en: fantasySkillName(skill, 'en'), ja: fantasySkillName(skill, 'ja') },
        kind: skill.effect === 'heal' ? 'heal' as const : skill.effect === 'guard' ? 'guard' as const : 'attack' as const,
        mp: skill.mp, power: role?.power ?? clamp(skill.power * (skill.effect === 'heal' ? 2 : skill.effect === 'guard' ? 2 : 3), 1, 100), magic: skill.effect === 'check' && (skill.stat === 'intelligence' || range === 'magic'), range,
        ...role, ...specialized, ...(specialized && 'onHit' in specialized && specialized.onHit ? { damageType: specialized.onHit.id === 'burn' ? 'fire' as const : specialized.onHit.id === 'frost' ? 'ice' as const : 'pierce' as const } : {}) }, { ...attackContext, mastery: c.skillXp?.[skill.id] ?? 0 })];
    }), ...prepared, ...(fantasyIsSaint(c) ? FANTASY_MIRACLES.filter(entry => entry.id !== 'miracle-return-lantern' && c.miracles?.prepared.includes(entry.id) && c.miracles.learned.includes(entry.id)).map(entry => structuredClone(entry.skill)) : [])],
  };
  for(const art of player.skills){
    const preparedSpell=c.specialization?.spells?.find(spell=>`prepared-spell-${spell.slot}`===art.id),circle=preparedSpell?.circle,element=circle?.core??preparedSpell?.element;
    if(element)art.visualElement=art.field==='frost'?'frost':art.field==='poison'?'poison':({flame:'fire',tide:'water',gale:'wind',stone:'earth',star:'star',light:'holy',holy:'holy',healing:'holy',pure:'holy',barrier:'holy',blessing:'holy'} as Record<string,FantasyCombatSkill['visualElement']>)[element];
    if(art.visualTier!==undefined)continue;
    const known=knownSkills.find(skill=>skill.id===art.id);
    art.visualTier=circle?(circle.runes.length>=6?4:circle.runes.length>=4?3:2):known?fantasySkillVisualTier(known,c.skillXp?.[known.id]??0):art.id.startsWith('priest-')?3:1;
  }
  const combatProfile = fantasyJobCombatProfile(c.job);
  for(const stat of ['attack','defense','intelligence','magicResist'] as const) player.stats[stat]=Math.max(stat==='attack'||stat==='intelligence'?1:0,Math.round(player.stats[stat]*combatProfile[stat]));
  const companions = fantasyCombatCompanions(profile, player);
  if (companions.length) player.companions = companions;
  return player;
}
export function fantasyCombatCompanions(profile: FantasyProfile, owner: FantasyCombatPlayer): FantasyCombatCompanionInput[] {
  const c = profile.character;
  if (!c) return [];
  return fantasyActiveCompanions(c).flatMap(({ kind, member }) => {
    const template = FANTASY_COMPANIONS.find(entry => entry.id === member.id && entry.kind === kind);
    if (!template) return [];
    const worker = fantasyWorkerCompanionCombat(member);
    if (worker) return [{ id: member.id, kind, names: template.names, stats: worker.stats, hp: Math.max(1, Math.min(worker.stats.hp, Math.round(worker.stats.hp * member.hp / template.hp))), mp: worker.stats.mp, range: worker.range, skills: worker.skills }];
    const spec = fantasySummonCombatSpec(c, member.id), magic = spec?.magic ?? (kind === 'summons' && template.id !== 'summon-stone'), ranged = template.id.includes('scout') || template.id.includes('lookout');
    const hp = Math.round(template.hp * (1.5 + Math.min(30, c.level) * .08)), mp = spec || magic ? Math.max(12, Math.round(owner.stats.mp * .3)) : 0;
    const guard = template.guard > 0, healing = template.id === 'summon-wisp';
    return [{ id: member.id, kind, names: template.names, stats: { hp, mp, attack: Math.max(3, Math.round(owner.stats.attack * (spec?.attackMultiplier ?? .32))),
      defense: Math.round(owner.stats.defense * (spec?.defenseMultiplier ?? .55) + template.guard), agility: Math.max(3, Math.round(owner.stats.agility * .75)), intelligence: Math.max(3, Math.round(owner.stats.intelligence * .45)),
      accuracy: Math.min(90, owner.stats.accuracy), magicResist: Math.round(owner.stats.magicResist * .5) }, hp: Math.max(1, Math.round(hp * member.hp / template.hp)), mp,
      range: spec?.range ?? (magic ? 'magic' as const : ranged ? 'ranged' as const : 'melee' as const),
      skills: spec?.skills ?? (guard ? [{ id: 'companion-cover', names: { ko: '동료 엄호', en: 'Cover an Ally', ja: '仲間を庇う' }, kind: 'guard' as const, power: 5 + template.guard * 2, mp: 0 }]
        : healing ? [{ id: 'companion-mend', names: { ko: '등불의 치유', en: 'Lamplight Mending', ja: '灯の癒やし' }, kind: 'heal' as const, power: 8, mp: 4, range: 'magic' as const }] : []),
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
      && (item.combatUse || item.id === 'potion' || !!item.use && (!!item.use.hp || !!item.use.mp || !!item.use.cure?.length))).map(item => [item.id, {
      count: c.inventory[item.id], names: item.names ?? { ko: fantasyTermName(item.id, 'ko'), en: fantasyTermName(item.id, 'en'), ja: fantasyTermName(item.id, 'ja') },
      ...(item.combatUse ? { combat: { id: `item-${item.id}`, names: item.names ?? { ko: item.name, en: item.name, ja: item.name }, range: 'magic' as const, ...item.combatUse, mp: 0 } } : {}),
      ...((item.use?.hp ?? (item.id === 'potion' ? 35 : 0)) ? { hp: item.use?.hp ?? 35 } : {}), ...((item.use?.mp ?? (item.id === 'potion' ? 20 : 0)) ? { mp: item.use?.mp ?? 20 } : {}),
      ...(item.use?.cure?.some(id => ['poison', 'burn', 'frost'].includes(id)) ? { cleanse: item.use!.cure!.filter((id): id is 'poison' | 'burn' | 'frost' => ['poison', 'burn', 'frost'].includes(id)) } : {}),
    }]));
  }
  return { supplies };
}
