import { fantasyHasJob } from './fantasy-careers.ts';
import { FANTASY_JOB_PATH_FIELDS as FIELDS, FANTASY_JOB_PATH_PLANS as PLANS } from './fantasy-job-path-catalog.ts';
import type { FantasyAction, FantasyCharacter, FantasySkill, FantasyStat } from './fantasy.ts';
import { FANTASY_JOBS } from './fantasy-data.ts';
import { fantasySkilledPower, fantasySkillUnlocked } from './fantasy-progression.ts';
import type { NpcLocale } from './npc.ts';
import { FANTASY_JOB_PATH_SKILL_NAMES } from './fantasy-job-path-skill-names.ts';
import { fantasyJobPathDiscovered } from './fantasy-job-discovery.ts';

type Text = Record<NpcLocale, string>;
type Names = [string, string, string];
const l = ([ko, en, ja]: Names): Text => ({ ko, en, ja });
type FieldId = keyof typeof FIELDS;
// 条件は公開一覧と分け、既存の技能解放記録だけを参照する。
const REQUIREMENTS = new Map<string, string>();
const PASSIVES = new Map<string, FantasySkill>();
const ACTIVES = new Map<string, FantasySkill>();
export interface FantasyJobPathCombatArt {
  kind: 'attack' | 'heal' | 'guard'; power: number; mp: number; range: 'melee' | 'ranged' | 'magic'; magic?: boolean;
  onHit?: { id: 'burn' | 'frost' | 'poison'; power: number; turns: 3; chance: number };
}
export interface FantasyJobPathCombatPassive { attack?: number; accuracy?: number; defense?: number; magicResist?: number }
const COMBAT_ARTS = new Map<string, FantasyJobPathCombatArt>();
const COMBAT_PASSIVES = new Map<string, FantasyJobPathCombatPassive>();
const COMBAT_JOBS = new Set(['adventurer', 'hunter', 'ranger', 'bard', 'mage', 'leader', 'warrior', 'knight', 'spearfighter', 'archer', 'scout', 'pugilist', 'spellblade', 'shieldbearer', 'summoner', 'thief', 'smuggler', 'assassin', 'bandit', 'spy', 'crimeboss']);
const support = (kind: 'heal' | 'guard', power: number, mp: number): FantasyJobPathCombatArt => ({ kind, power, mp, range: 'magic' });
function combatArt(job: string, index: number, field: FieldId): FantasyJobPathCombatArt | undefined {
  if (!COMBAT_JOBS.has(job)) return undefined;
  if (job === 'bard') return [support('guard', 6, 7), support('heal', 14, 8), { kind: 'attack', power: 4, mp: 7, range: 'magic', magic: true }, support('guard', 5, 6)][index] as FantasyJobPathCombatArt;
  if (job === 'leader') return [support('guard', 5, 6), support('guard', 7, 8), support('guard', 4, 5), support('heal', 12, 8)][index];
  if (job === 'crimeboss') return [support('heal', 12, 8), support('guard', 6, 7), support('guard', 5, 6), support('guard', 4, 5)][index];
  if (job === 'spy' && index > 0 || job === 'smuggler' && index > 1 || job === 'scout' && index === 1 || job === 'thief' && index === 2) return support('guard', 4 + index % 2, 6);
  if (['defense', 'armor', 'sacred', 'earth'].includes(field)) return support('guard', job === 'summoner' ? 7 : 6, 8);
  if (job === 'knight' && index === 2) return support('guard', 6, 7);
  let range: FantasyJobPathCombatArt['range'] = ['mage', 'summoner'].includes(job) || job === 'pugilist' && index === 1 || job === 'archer' && index === 2 ? 'magic'
    : ['hunter', 'ranger', 'archer'].includes(job) || field === 'throwing' || job === 'scout' && index === 0 || job === 'summoner' && index === 2 ? 'ranged' : 'melee';
  if (job === 'summoner' && index === 1) range = 'melee';
  if (job === 'summoner' && index === 2) range = 'ranged';
  if (job === 'spellblade' && index === 2) range = 'magic';
  const power = ['heavy', 'hunt', 'spear'].includes(field) ? 7 : ['flame', 'frost', 'poison'].includes(field) ? 4 : range === 'melee' ? 6 : 5;
  const mp = power >= 7 ? 8 : ['flame', 'frost', 'poison'].includes(field) ? 8 : 6;
  const art: FantasyJobPathCombatArt = { kind: 'attack', power, mp, range, ...(range === 'magic' || job === 'spellblade' ? { magic: true } : {}) };
  if (field === 'flame') art.onHit = { id: 'burn', power: 1, turns: 3, chance: .35 };
  if (field === 'frost') art.onHit = { id: 'frost', power: 1, turns: 3, chance: .30 };
  if (field === 'poison') art.onHit = { id: 'poison', power: 1, turns: 3, chance: .30 };
  return art;
}
const STAT_NAMES: Record<FantasyStat, Names> = { strength: ['힘', 'Strength', '力'], agility: ['민첩', 'Agility', '敏捷'], intelligence: ['지능', 'Intelligence', '知力'], luck: ['운', 'Luck', '運'], vitality: ['체력', 'Vitality', '体力'], dexterity: ['손재주', 'Dexterity', '手先'], charisma: ['카리스마', 'Charisma', 'カリスマ'] };
function skillDescription(effect: FantasySkill['effect'], power: number, stat?: FantasyStat): Text {
  if (effect === 'check' && stat) return l([`다음 ${STAT_NAMES[stat][0]} 판정 한 번에 +${power}. 실제로 쓰인 뒤 숙련이 자란다.`, `Add ${power} to the next ${STAT_NAMES[stat][1]} check. Practice grows after effective use.`, `次の${STAT_NAMES[stat][2]}判定1回に+${power}。実際に使われた後で熟練が育つ。`]);
  if (effect === 'guard') return l([`다음에 받는 피해를 ${power} 줄이는 방호를 준비한다.`, `Prepare protection that reduces the next incoming damage by ${power}.`, `次に受ける被害を${power}減らす防護を備える。`]);
  if (effect === 'heal') return l([`자신의 HP를 최대 ${power} 회복한다. 회복할 피해가 있어야 쓸 수 있다.`, `Restore up to ${power} of your own HP. Requires actual missing HP.`, `自分のHPを最大${power}回復する。回復する傷があるときだけ使える。`]);
  if (effect === 'reward') return l([`다음 유효한 일·제작에 성과 보정 +${power}. 준비만 반복해서 숙련을 얻지 않는다.`, `Add ${power} to the next effective work or crafting reward modifier. Preparation alone grants no practice.`, `次の有効な仕事・制作の成果補正+${power}。準備だけでは熟練を得ない。`]);
  return l([`다음 이용 가능한 일반 이동을 ${power}게임시간 줄인다. 전이문과 최소 이동 시간 규칙은 유지한다.`, `Shorten the next eligible ordinary journey by ${power} game hours. Gates and minimum journey times retain their rules.`, `次の対象となる通常移動を${power}ゲーム時間短縮する。転移門と最低時間の規則は維持する。`]);
}
function combatDescription(art: FantasyJobPathCombatArt): Text {
  if (art.kind === 'guard') return l([`전투에서는 자신이나 동료에게 방호 ${art.power}.`, `In combat, protect yourself or an ally with ward ${art.power}.`, `戦闘では自分か仲間に防護${art.power}。`]);
  if (art.kind === 'heal') return l([`전투에서는 자신이나 동료의 HP를 최대 ${art.power} 회복. 쓰러진 대상은 되살리지 못한다.`, `In combat, heal yourself or an ally for up to ${art.power} HP. Cannot revive fallen targets.`, `戦闘では自分か仲間のHPを最大${art.power}回復。倒れた者は蘇らない。`]);
  const range = art.range === 'magic' ? ['마력', 'magic', '魔力'] : art.range === 'ranged' ? ['원거리', 'ranged', '遠距離'] : ['근접', 'melee', '近接'];
  const status = art.onHit && { burn: ['화상', 'burn', '火傷'], frost: ['냉기', 'frost', '冷気'], poison: ['중독', 'poison', '毒'] }[art.onHit.id];
  return l([`전투에서는 ${range[0]} 공격 보정 +${art.power}.${status ? ` 유효 명중 시 ${Math.round(art.onHit!.chance * 100)}%로 ${status[0]} ${art.onHit!.power}, 3라운드.` : ''}`,
    `In combat, ${range[1]} attack power +${art.power}.${status ? ` Effective hits have a ${Math.round(art.onHit!.chance * 100)}% chance of ${status[1]} ${art.onHit!.power} for 3 rounds.` : ''}`,
    `戦闘では${range[2]}攻撃補正+${art.power}。${status ? `有効命中時${Math.round(art.onHit!.chance * 100)}%で${status[2]}${art.onHit!.power}、3ラウンド。` : ''}`]);
}
export interface FantasyJobPath { id: string; job: string; names: Text; fields: Text }
export const FANTASY_JOB_PATH_CHANGE_COST = 100;
export const FANTASY_JOB_PATH_CHANGE_COOLDOWN = 24;
export const FANTASY_JOB_PATHS: FantasyJobPath[] = Object.entries(PLANS).flatMap(([job, plans]) => plans.map(([slug, ko, en, ja, fieldId], index) => {
  const id = `${job}-${slug}`, definition = FIELDS[fieldId], names = l([ko, en, ja]);
  if (!definition) throw new Error(`Unknown advancement field ${fieldId}`);
  REQUIREMENTS.set(id, `job-${job}-advanced-${[2, 3, 5, 4, 8][index]}`);
  const pair = FANTASY_JOB_PATH_SKILL_NAMES[job]?.[index];
  if (!pair) throw new Error(`Missing advancement skill names ${id}`);
  const skillNames = l(pair[0]), activeNames = l(pair[1]);
  const base = FANTASY_JOBS.find(candidate => candidate.id === job)!;
  const stat = definition.stat && ['dexterity', 'charisma'].includes(definition.stat) && base.extra !== definition.stat ? base.stat : definition.stat;
  const descriptions = stat ? l([`${STAT_NAMES[stat][0]} 판정 +1.`, `${STAT_NAMES[stat][1]} checks +1.`, `${STAT_NAMES[stat][2]}判定+1。`]) : l(['받는 피해를 1 줄인다.', 'Reduce incoming damage by 1.', '受ける被害を1軽減する。']);
  const passiveId = `path-${id}-insight`, activeId = `path-${id}-art`;
  const combat = combatArt(job, index, fieldId);
  let passiveDescriptions = descriptions;
  if (COMBAT_JOBS.has(job)) {
    const bonus = !stat || stat === 'vitality' ? { defense: 1 } : stat === 'agility' || stat === 'luck' || stat === 'dexterity' ? { accuracy: 1 } : stat === 'charisma' ? { magicResist: 1 } : { attack: 1 };
    COMBAT_PASSIVES.set(passiveId, bonus);
    const label = 'defense' in bonus ? ['방어', 'defense', '防御'] : 'accuracy' in bonus ? ['명중', 'accuracy', '命中'] : 'magicResist' in bonus ? ['마력 방호', 'magic resistance', '魔力防護'] : ['공격', 'attack', '攻撃'];
    passiveDescriptions = l([`${descriptions.ko} 전투 ${label[0]} +1.`, `${descriptions.en} Combat ${label[1]} +1.`, `${descriptions.ja}戦闘${label[2]}+1。`]);
  }
  PASSIVES.set(id, { id: passiveId, name: skillNames.ja, names: skillNames, description: passiveDescriptions.ja, descriptions: passiveDescriptions, kind: 'passive', mp: 0, effect: stat ? 'check' : 'guard', power: 1, ...(stat ? { stat } : {}) });
  let effect: FantasySkill['effect'] = combat?.kind === 'heal' ? 'heal' : combat?.kind === 'guard' ? 'guard' : 'check';
  let power = combat && combat.kind !== 'attack' ? combat.power : 4, mp = combat?.mp ?? 5;
  let activeStat = combat?.kind === 'attack' && combat.magic ? 'intelligence' as const : base.stat;
  if (!combat) {
    if (['merchant-maritime', 'fisher-ocean', 'leatherworker-travel', 'shipwright-airship'].includes(id)) { effect = 'travel'; power = .5; mp = 6; }
    else if (['cook-field', 'cook-medicinal'].includes(id)) { effect = 'heal'; power = 14; mp = 8; }
    else if (['armor', 'winter'].includes(fieldId)) { effect = 'guard'; power = 4; mp = 6; }
    else if (['trade', 'court', 'administration'].includes(fieldId)) { effect = 'reward'; power = 1; mp = 6; }
  }
  const outside = skillDescription(effect, power, effect === 'check' ? activeStat : undefined), battle = combat && combatDescription(combat);
  const activeDescriptions = battle ? l([`${outside.ko} ${battle.ko}`, `${outside.en} ${battle.en}`, `${outside.ja}${battle.ja}`]) : outside;
  ACTIVES.set(id, { id: activeId, name: activeNames.ja, names: activeNames, description: activeDescriptions.ja, descriptions: activeDescriptions, kind: 'active', mp, effect, power, ...(effect === 'check' ? { stat: activeStat } : {}) });
  if (combat) COMBAT_ARTS.set(activeId, combat);
  return { id, job, names, fields: definition.names };
}));
const pathOf = (id: string) => FANTASY_JOB_PATHS.find(path => path.id === id);
function ready(c: FantasyCharacter, path: FantasyJobPath): boolean {
  const skill = FANTASY_JOBS.find(job => job.id === path.job)?.skills.find(skill => skill.id === REQUIREMENTS.get(path.id));
  if (!skill || (c.jobXp[path.job] ?? 0) < 100) return false;
  const current = { ...c, job: path.job };
  if (!skill.retired) return fantasySkillUnlocked(current, skill);
  if (skill.unlock?.kind !== 'mentor' || c.jobPaths?.[path.job]?.path === path.id) return fantasySkillUnlocked(current, { ...skill, retired: false });
  const recovery = FANTASY_JOBS.find(job => job.id === path.job)?.skills.find(skill => skill.restore === 'mp' && !skill.retired);
  return !!recovery && fantasySkillUnlocked(current, recovery) && (c.skillXp?.[recovery.id] ?? 0) >= 4;
}
const ERRORS = {
  invalid: l(['알려진 전문 분야를 선택하세요.', 'Choose a known specialization.', '知られている専門分野を選んでください。']),
  job: l(['현재 직업으로는 이 길을 따를 수 없습니다.', 'Your current profession cannot follow this path.', '今の職業ではこの道を選べません。']),
  unwell: l(['지금은 전직할 수 있는 상태가 아닙니다.', 'You are not in a condition to advance now.', '今は転職できる状態ではありません。']),
  undiscovered: l(['아직 이 길에 대해 알려진 것이 없습니다.', 'You do not know this path yet.', 'まだこの道を知りません。']),
  locked: l(['아직 이 길로 나아갈 준비가 되지 않았습니다.', 'You are not yet ready to follow this path.', 'まだこの道へ進む準備が整っていません。']),
  same: l(['이미 이 길을 걷고 있습니다.', 'You already follow this path.', 'すでにこの道を歩んでいます。']),
  gold: l(['전문 분야를 바꿀 금화가 부족합니다.', 'You lack the gold to change specialization.', '専門分野の変更に必要な金貨が足りません。']),
  cooldown: l(['지금은 전문 분야를 다시 바꿀 수 없습니다.', 'You cannot change specialization again yet.', '今は専門分野を変更し直せません。']),
};
export function fantasyJobPathError(c: FantasyCharacter, pathId: string, locale: NpcLocale = 'ja'): string | undefined {
  const path = pathOf(pathId), previous = c.jobPaths?.[path?.job??c.job];
  const error = !path ? 'invalid' : !fantasyHasJob(c,path.job) ? 'job' : c.hp <= 0 ? 'unwell' : previous?.path === pathId ? 'same'
    : !fantasyJobPathDiscovered(c, pathId) ? 'undiscovered' : !ready(c, path) ? 'locked' : previous && c.hour - previous.hour < FANTASY_JOB_PATH_CHANGE_COOLDOWN ? 'cooldown'
      : previous && c.gold < FANTASY_JOB_PATH_CHANGE_COST ? 'gold' : undefined;
  return error ? ERRORS[error][locale] : undefined;
}
export function fantasyJobPathHours(_action?: FantasyAction): number { return 1; }
export function applyFantasyJobPath(c: FantasyCharacter, pathId: string): { error?: string; message?: string } {
  const error = fantasyJobPathError(c, pathId); if (error) return { error };
  const job=pathOf(pathId)!.job;
  const cost = c.jobPaths?.[job] ? FANTASY_JOB_PATH_CHANGE_COST : 0;
  c.gold -= cost; (c.jobPaths ??= {})[job] = { path: pathId, hour: c.hour }; c.buff = null;
  return { message: `jobpath:advance:${pathId}:${cost}` };
}
export function fantasyJobPathSkills(c: FantasyCharacter): FantasySkill[] {
  const record = c.jobPaths?.[c.job], path = record && pathOf(record.path);
  if (!path || path.job !== c.job || !ready(c, path)) return [];
  return [PASSIVES.get(path.id), ACTIVES.get(path.id)].flatMap(skill => {
    if (!skill) return [];
    const power = fantasySkilledPower(c, skill);
    let descriptions: Text;
    if (skill.kind === 'passive') {
      descriptions = skill.stat ? l([`${STAT_NAMES[skill.stat][0]} 판정 +${power}.`, `${STAT_NAMES[skill.stat][1]} checks +${power}.`, `${STAT_NAMES[skill.stat][2]}判定+${power}。`])
        : l([`받는 피해를 ${power} 줄인다.`, `Reduce incoming damage by ${power}.`, `受ける被害を${power}軽減する。`]);
      const bonus = COMBAT_PASSIVES.get(skill.id);
      if (bonus) {
        const label = bonus.defense ? ['방어', 'defense', '防御'] : bonus.accuracy ? ['명중', 'accuracy', '命中'] : bonus.magicResist ? ['마력 방호', 'magic resistance', '魔力防護'] : ['공격', 'attack', '攻撃'];
        descriptions = l([`${descriptions.ko} 전투 ${label[0]} +${Math.min(3, power)}.`, `${descriptions.en} Combat ${label[1]} +${Math.min(3, power)}.`, `${descriptions.ja}戦闘${label[2]}+${Math.min(3, power)}。`]);
      }
    } else {
      const outside = skillDescription(skill.effect, power, skill.stat), art = fantasyJobPathCombatSkill(skill.id, power), battle = art && combatDescription(art);
      descriptions = battle ? l([`${outside.ko} ${battle.ko}`, `${outside.en} ${battle.en}`, `${outside.ja}${battle.ja}`]) : outside;
    }
    return [{ ...skill, names: { ...skill.names! }, description: descriptions.ja, descriptions }];
  });
}
export function fantasyIsJobPathSkill(id: string): boolean { return [...PASSIVES.values(), ...ACTIVES.values()].some(skill => skill.id === id); }
export function fantasyJobPathCombatPassive(id: string): FantasyJobPathCombatPassive | undefined {
  const passive = COMBAT_PASSIVES.get(id); return passive ? { ...passive } : undefined;
}
export function fantasyJobPathCombatSkill(id: string, power?: number): FantasyJobPathCombatArt | undefined {
  const art = COMBAT_ARTS.get(id), original = [...ACTIVES.values()].find(skill => skill.id === id);
  if (!art || !original) return undefined;
  const growth = power !== undefined && Number.isFinite(power) ? Math.max(0, Math.min(3, power - original.power)) : 0;
  return { ...art, power: art.power + growth, ...(art.onHit ? { onHit: { ...art.onHit } } : {}) };
}
export function validFantasyJobPaths(c: FantasyCharacter): boolean {
  const value = c.jobPaths;
  if (value === undefined) return true;
  if (!value || typeof value !== 'object' || Array.isArray(value) || Object.keys(value).length > 36) return false;
  return Object.entries(value).every(([job, record]) => {
    if (!record || typeof record !== 'object' || Array.isArray(record) || Object.keys(record).length !== 2 || typeof record.path !== 'string'
      || typeof record.hour !== 'number' || !Number.isFinite(record.hour) || record.hour < 0 || record.hour > c.hour) return false;
    const path = pathOf(record.path); return !!path && path.job === job && ready(c, path);
  });
}
export function fantasyJobPathText(source: string, locale: NpcLocale): string | undefined {
  const error = Object.values(ERRORS).find(names => Object.values(names).includes(source)); if (error) return error[locale];
  const match = source.match(/^jobpath:advance:([a-z-]+):(0|100)$/), path = match && pathOf(match[1]);
  if (!match || !path) return undefined;
  const name = path.names[locale]; return l([`${name}의 길을 택했습니다. ${match[2]}G.`, `Chose the path of ${name}. ${match[2]}G.`, `${name}の道を選んだ。${match[2]}G。`])[locale];
}
