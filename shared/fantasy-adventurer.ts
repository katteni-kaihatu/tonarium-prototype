import { fantasyJobMagicAttackRatio, fantasyJobHealingBonus } from './fantasy-job-balance.ts';
import type { FantasyCombatStats } from './fantasy-combat-catalog.ts';
import type { FantasyCombatSkill, FantasyCombatCompanionInput } from './fantasy-combat.ts';
import type { NpcLocale } from './npc.ts';

export type FantasyAdventurerGrade = 1 | 2 | 3 | 4 | 5 | 6 | 7 | 8;
export type FantasyRegularEncounterTier = 1 | 2 | 3 | 4 | 5 | 6;

export const FANTASY_GUILD_RANKS: readonly { grade: FantasyAdventurerGrade; names: Record<NpcLocale, string> }[] = [
  { grade: 1, names: { ko: '코퍼', en: 'Copper', ja: 'カッパー' } },
  { grade: 2, names: { ko: '브론즈', en: 'Bronze', ja: 'ブロンズ' } },
  { grade: 3, names: { ko: '실버', en: 'Silver', ja: 'シルバー' } },
  { grade: 4, names: { ko: '골드', en: 'Gold', ja: 'ゴールド' } },
  { grade: 5, names: { ko: '플래티넘', en: 'Platinum', ja: 'プラチナ' } },
  { grade: 6, names: { ko: '미스릴', en: 'Mithril', ja: 'ミスリル' } },
  { grade: 7, names: { ko: '아다만트', en: 'Adamant', ja: 'アダマント' } },
  { grade: 8, names: { ko: '마스터', en: 'Master', ja: 'マスター' } },
];

/** 戦力目安。登録等級の昇格には別途実績が必要。 */
export const FANTASY_ADVENTURER_POWER_THRESHOLDS: readonly number[] = [0, 75, 105, 145, 190, 240, 360, 520];

export function fantasyGuildRankName(grade: FantasyAdventurerGrade | 0, locale: NpcLocale): string {
  if (grade === 0) return { ko: '길드 미등록', en: 'Not registered with the guild', ja: 'ギルド未登録' }[locale];
  const rank = FANTASY_GUILD_RANKS.find(rank => rank.grade === grade) ?? FANTASY_GUILD_RANKS[0];
  return `${rank.names[locale]} (${rank.grade})`;
}

export type FantasyGuildAssessmentError = 'guild:invalid' | 'guild:not-alive' | 'guild:busy' | 'guild:guildOnly' | 'guild:profession' | 'guild:crime' | 'guild:quests-required' | 'guild:power-required' | 'guild:max-rank';
const guildAssessmentErrors: Record<FantasyGuildAssessmentError, Record<NpcLocale, string>> = {
  'guild:crime': { ko: '범죄 직업으로 활동하는 동안에는 모험가 길드에 등록하거나 승급할 수 없습니다.', en: 'You cannot register or advance in the adventurer guild while practicing a criminal profession.', ja: '犯罪職で活動している間は、冒険者ギルドに登録・昇格できません。' },
  'guild:profession': { ko: '사제는 길드에 모험가로 등록하지 않습니다. 신전에서 성직 등급을 확인하세요.', en: 'Priests do not register as guild adventurers. Check your clergy rank at a temple.', ja: '司祭はギルドの冒険者として登録せず、神殿で聖職等級を確認します。' },
  'guild:quests-required': { ko: '현재 등록 등급의 의뢰 5개를 완료하고 보고한 뒤 승급 심사를 받을 수 있습니다.', en: 'Complete and report 5 quests of your current registered rank before the promotion test.', ja: '現在の登録等級の依頼を5件達成・報告してから昇格審査を受けられます。' },
  'guild:power-required': { ko: '다음 등급에 필요한 전투력이 부족합니다. 장비와 능력을 갖춘 뒤 다시 심사받으세요.', en: 'Your combat power is below the next rank’s requirement. Improve your equipment and abilities, then try again.', ja: '次の等級に必要な戦闘力が不足しています。装備と能力を整えて再審査を受けてください。' },
  'guild:max-rank': { ko: '이미 길드의 최고 등급에 도달했습니다.', en: 'You have reached the highest guild rank.', ja: 'すでにギルドの最高等級に達しています。' },
  'guild:invalid': { ko: '등급 심사 요청을 확인할 수 없습니다. 현재 상태를 갱신한 뒤 다시 시도하세요.', en: 'The assessment request is invalid. Refresh and try again.', ja: '等級審査の要求を確認できません。状態を更新してから再度お試しください。' },
  'guild:not-alive': { ko: '살아 있고 HP가 남아 있는 인물만 등급 심사를 받을 수 있습니다.', en: 'A living character with HP is required for an assessment.', ja: '生きていてHPが残っている人物で等級審査を受けてください。' },
  'guild:busy': { ko: '현재 행동이나 사건을 마치고, 심사를 받을 수 있는 상태가 되어야 합니다.', en: 'Finish the current activity or encounter and recover before requesting an assessment.', ja: '現在の行動や出来事を終え、審査を受けられる状態になってから依頼してください。' },
  'guild:guildOnly': { ko: '현재 지역의 열린 길드에서 등급 심사를 받을 수 있습니다.', en: 'Visit an open local guild for an assessment.', ja: '現地の開いているギルドで等級審査を受けられます。' },
};
export function fantasyGuildAssessmentErrorText(source: string, locale: NpcLocale): string | undefined {
  return Object.hasOwn(guildAssessmentErrors, source) ? guildAssessmentErrors[source as FantasyGuildAssessmentError][locale] : undefined;
}

const statValue = (value: number) => Number.isFinite(value) ? Math.max(0, Math.min(1_000_000, value)) : 0;

/** 一時的な負傷や消耗で審査を操作できないよう、最大HP・MPを使う。 */
export interface FantasyCombatPowerContext {
  range: 'melee'|'ranged'|'magic'; vocation?: {job:string}; id?: string;
  skills?: readonly FantasyCombatSkill[];
  companions?: readonly FantasyCombatCompanionInput[];
}

const movementReach = (agility: number) => Math.min(4, 2 + Math.floor(statValue(agility) / 20));
// 12行動の通常攻撃6回と、3回の予告のうち周辺範囲を離れる防御負担を比べる。
const warningExposure = (reach: number) => 6 + Math.max(0, 3 - reach) * 1.8 * .35;
const powerTurns = 12;
const rangeReach = (range: FantasyCombatPowerContext['range']) => range === 'magic' ? 8 : range === 'ranged' ? 7 : 1;
const rangePower = (range: FantasyCombatPowerContext['range']) => range === 'magic' ? 1.2 : range === 'ranged' ? 1.08 : 1;
function capabilityRangePower(range: FantasyCombatPowerContext['range'], reach = rangeReach(range)): number {
  // 初回の接敵に加え、予告攻撃後の再接近2手を12行動で見積もる。
  const openingTurns = 12, distance = range === 'melee' ? 1 : 4, approachTurns = Math.ceil((distance - 1) / 4) * 3;
  return 1 + (openingTurns / (openingTurns - approachTurns) - 1) * Math.min(1, Math.max(0, reach - 1) / 3);
}

function capabilityPowerRatio(stats: FantasyCombatStats, context: FantasyCombatPowerContext, baseOffense: number): number {
  const hp = statValue(stats.hp), mp = statValue(stats.mp), intelligence = statValue(stats.intelligence), attack = statValue(stats.attack);
  if (!hp || !baseOffense) return 1;
  const known = new Map<string, FantasyCombatSkill>();
  for (const skill of context.skills ?? []) {
    if (!known.has(skill.id) && Number.isFinite(skill.mp) && skill.mp >= 0 && skill.mp <= mp && Number.isFinite(skill.power)
      && !['miracle', 'mana'].includes(skill.kind) && !skill.id.startsWith('miracle-') && !skill.battlefieldWide) known.set(skill.id, skill);
  }
  const hitRate = Math.max(.1, Math.min(1, statValue(stats.accuracy) / 100));
  const attackPlans = [{ mp: 0, output: baseOffense, ward: 0, reachPower: capabilityRangePower(context.range) }];
  const supportPlans: { mp: number; healing: number; output: number }[] = [{ mp: 0, healing: 0, output: 0 }];
  for (const skill of known.values()) {
    const power = Math.min(100, statValue(skill.power));
    if (skill.kind === 'attack') {
      if (skill.selfOnly || skill.reach === 0 || skill.motion?.kind === 'reposition') continue;
      const range = skill.range ?? (skill.magic ? 'magic' : context.range), reach = skill.reach ?? rangeReach(range);
      const reachPower = capabilityRangePower(range, reach);
      const distance = Math.min(.08, Math.max(0, reach - rangeReach(range)) * .02);
      const movement = skill.reach !== undefined && skill.motion ? Math.min(.04, statValue(skill.motion.distance) * .015) : 0;
      const area = skill.shape && skill.shape !== 'single' || skill.radius ? .04 * Math.min(1, (skill.secondaryDamage ?? 100) / 100) : 0;
      const control = skill.reach !== undefined && skill.hitUtility ? Math.min(.06, statValue(skill.hitUtility.power) * .01) * Math.min(1, statValue(skill.hitUtility.chance)) : 0;
      const tactical = 1 + Math.min(.16, distance + movement + area + control + (skill.reach !== undefined && skill.effects?.slow ? .02 : 0));
      const magic = skill.reach === undefined ? !!skill.magic || range === 'magic' : skill.magic === true;
      const damage = magic ? attack * fantasyJobMagicAttackRatio(context.vocation?.job) + intelligence * 1.3 : attack;
      const damageOverTime = skill.onHit && skill.onHit.id !== 'frost' ? Math.min(10, statValue(skill.onHit.power)) * Math.min(1, statValue(skill.onHit.chance)) : 0;
      const field = skill.reach !== undefined ? skill.field ?? (skill.effects?.burn ? 'fire' : skill.effects?.slow ? 'frost' : undefined) : undefined;
      const fieldDamage = field === 'fire' || field === 'poison' ? Math.max(1, Math.min(8, Math.floor(power / 5))) * .5 : 0;
      const accuracy = Math.min(1, Math.max(.1, (statValue(stats.accuracy) + Math.max(-20, Math.min(20, skill.hitBonus ?? 0))) / 100));
      attackPlans.push({ mp: skill.mp, output: (damage + power + damageOverTime + fieldDamage + Math.min(10, statValue(skill.reach !== undefined ? skill.effects?.burn ?? 0 : 0)))
        * reachPower / capabilityRangePower(context.range) * accuracy / hitRate * tactical,
      ward: skill.reach !== undefined && skill.effects?.guard ? Math.min(hp / powerTurns, statValue(skill.effects.guard)) : 0, reachPower });
      continue;
    }
    if (skill.motion) continue;
    let healing = skill.kind === 'heal' ? power + Math.floor(intelligence * .8) + fantasyJobHealingBonus(context.vocation?.job, hp) : 0;
    if (skill.kind === 'guard' || skill.kind === 'blessing' || skill.effects?.guard) {
      healing += Math.min(hp / 3, statValue(skill.effects?.guard ?? skill.power) + Math.floor(intelligence * .3));
    }
    let output = skill.kind === 'focus' ? baseOffense * Math.min(.15, power / 100) / hitRate : 0;
    if (skill.effects?.might) output += Math.min(6, statValue(skill.effects.might)) * 2;
    const utilityPower = Math.min(12, power);
    switch (skill.utility) {
      case 'regen': healing += utilityPower * 3; break;
      case 'lifesteal': healing += baseOffense * hitRate * Math.min(.3, utilityPower * .02) * 2; break;
      case 'resolve': case 'weaken': healing += hp * Math.min(.3, utilityPower * .02) / 2; break;
      case 'haste': case 'blind': healing += hp * Math.min(.15, utilityPower / 100) / 2; break;
      case 'root': case 'silence': healing += hp * .02; break;
      case 'vulnerable': output += baseOffense * Math.min(.35, utilityPower * .025) * 2; break;
      case 'bleed': case 'thorns': output += utilityPower * 3; break;
      case 'clarity': if (context.range === 'magic') output += baseOffense * Math.min(.12, utilityPower / 100) * 2; break;
    }
    if (healing || output) supportPlans.push({ mp: skill.mp, healing, output });
  }
  const baseMove = movementReach(stats.agility), maneuvers = [{ reach: baseMove, mp: 0 }];
  for (const reach of [3]) {
    if (reach <= baseMove) continue;
    const reposition = [...known.values()].filter(skill => skill.motion?.kind === 'reposition' && skill.motion.distance >= reach && skill.mp * 3 <= mp).sort((a, b) => a.mp - b.mp)[0];
    if (reposition) maneuvers.push({ reach, mp: reposition.mp * 3 });
  }
  let best = 1;
  // 回復・防護は攻撃の代わりの行動。技の数ではなく共通のMPと12手で比較する。
  for (const maneuver of maneuvers) for (const support of supportPlans) for (let supports = 0; supports <= powerTurns / 2; supports++) {
    if (support.mp * supports + maneuver.mp > mp) continue;
    const turns = powerTurns - supports, budget = mp - support.mp * supports - maneuver.mp;
    for (const attackPlan of attackPlans) {
      const casts = Math.min(turns, attackPlan.mp ? Math.floor(budget / attackPlan.mp) : turns);
      const offense = (turns * baseOffense + casts * Math.max(0, attackPlan.output - baseOffense)
        + Math.min(baseOffense * powerTurns * .15, support.output * supports)) / (baseOffense * powerTurns);
      const survival = 1 + Math.min(hp * 2, support.healing * supports + attackPlan.ward * casts) / hp;
      // 支援で接敵待ちを埋めた行動には、射程の追加行動を重ねて加点しない。
      const fullReach = Math.max(capabilityRangePower(context.range), attackPlan.reachPower);
      const saved = 3 - Math.min(1, supports), supportReach = 1 + (fullReach - 1) * ((powerTurns / (powerTurns - saved) - 1) / (powerTurns / (powerTurns - 3) - 1));
      best = Math.max(best, offense * survival * supportReach / fullReach * warningExposure(baseMove) / warningExposure(maneuver.reach));
    }
  }
  return best;
}

function personalCombatPower(stats: FantasyCombatStats, context?: FantasyCombatPowerContext): number {
  const hp = statValue(stats.hp), mp = statValue(stats.mp), agility = statValue(stats.agility);
  const hitRate = Math.min(100, statValue(stats.accuracy)) / 100;
  const attack = statValue(stats.attack), intelligence = statValue(stats.intelligence);
  const baseOffense = context?.range === 'magic' ? attack*fantasyJobMagicAttackRatio(context.vocation?.job)+intelligence*1.3 : attack+(context?.skills === undefined ? intelligence*.25 : 0);
  const reach = context ? context.skills === undefined ? rangePower(context.range) : capabilityRangePower(context.range) : 1;
  // 現行MPは使用回数で評価し、未使用MPには中立60MPの旧係数だけを残す。
  const offense = baseOffense * reach * hitRate
    * (1 + agility / (agility + 100)) * (context?.skills === undefined ? 1 + .25 * mp / (mp + 100) : 1 + .25 * 60 / 160);
  const incomingChance = (evasion: number) => [8, 20, 35].reduce((sum, foeAgility) => sum + (21 - Math.max(3, Math.min(19, Math.round(20 - (80 + foeAgility * .25 - evasion * .35) / 5)))) / 20, 0) / 3;
  const evasion = context?.skills === undefined ? 1 : incomingChance(20) / incomingChance(agility) * warningExposure(2) / warningExposure(movementReach(agility));
  const durability = hp * (1 + (statValue(stats.defense) + statValue(stats.magicResist)) / 100) * evasion;
  const capabilities = context?.skills?.length ? capabilityPowerRatio(stats, context, baseOffense) : 1;
  return Math.sqrt(offense * durability * capabilities);
}

/** 上位等級の実戦力差を狭める評価指数。能力値だけの旧評価には適用しない。 */
export function fantasyCombatPowerIndex(rawPower: number): number {
  if (!Number.isFinite(rawPower)) return rawPower === Infinity ? 1_000_000_000 : 0;
  const raw = Math.max(0, rawPower);
  return Math.min(1_000_000_000, raw <= 440 ? raw : 440 + (raw - 440) * 2.5);
}

export function fantasyCombatPower(stats: FantasyCombatStats, context?: FantasyCombatPowerContext): number {
  const indexed = context?.skills !== undefined, rawPersonal = personalCombatPower(stats, context);
  const personal = indexed ? fantasyCombatPowerIndex(rawPersonal) : rawPersonal, seen = new Set(context?.id ? [context.id] : []);
  let contribution = 0, count = 0;
  for (const companion of context?.companions ?? []) {
    if (count >= 2) break;
    if (seen.has(companion.id) || !companion.id || !Number.isFinite(companion.hp) || companion.hp <= 0 || !statValue(companion.stats.hp)) continue;
    seen.add(companion.id); count++;
    const availability = Math.min(1, companion.hp / companion.stats.hp);
    const rawCompanion = personalCombatPower(companion.stats, companion), companionPower = indexed ? fantasyCombatPowerIndex(rawCompanion) : rawCompanion;
    contribution += Math.min(personal * .35, companionPower * .35) * availability;
  }
  const score = Math.round(personal + contribution);
  return indexed ? Math.min(1_000_000_000, score) : score;
}

export function fantasyAdventurerGrade(stats: FantasyCombatStats, context?: FantasyCombatPowerContext): FantasyAdventurerGrade {
  const score = fantasyCombatPower(stats,context);
  for (let grade = 8; grade > 1; grade--) {
    if (score >= FANTASY_ADVENTURER_POWER_THRESHOLDS[grade - 1]) return grade as FantasyAdventurerGrade;
  }
  return 1;
}

/** 上位の冒険者でも、通常遭遇に秘密の強敵を混ぜない。 */
export function fantasyRegularEncounterTier(stats: FantasyCombatStats, context?: FantasyCombatPowerContext): FantasyRegularEncounterTier {
  return Math.min(6, fantasyAdventurerGrade(stats,context)) as FantasyRegularEncounterTier;
}

/** 同時に現れる敵の総戦力で、単体より高い推奨等級を付ける。 */
export function fantasyHuntGrade(roster: readonly { tier: number; count: number }[]): FantasyAdventurerGrade {
  let threat = 0;
  for (const entry of roster) {
    if (!Number.isInteger(entry.tier) || entry.tier < 1 || entry.tier > 8 || !Number.isSafeInteger(entry.count) || entry.count < 1) continue;
    threat += 2 ** (entry.tier - 1) * entry.count;
    if (threat >= 128) return 8;
  }
  return Math.max(1, Math.min(8, 1 + Math.ceil(Math.log2(Math.max(1, threat))))) as FantasyAdventurerGrade;
}
