import type { FantasySkill } from './fantasy.ts';
import type { NpcLocale } from './npc.ts';
import { fantasySkillName } from './fantasy-skill-names.ts';

type Text = Record<NpcLocale, string>;
const l = (ko: string, en: string, ja: string): Text => ({ ko, en, ja });
export type FantasySkillUtility = 'haste' | 'regen' | 'clarity' | 'thorns' | 'lifesteal' | 'resolve' | 'weaken' | 'vulnerable' | 'blind' | 'bleed' | 'root' | 'silence';
export const FANTASY_SKILL_UTILITIES: { id: FantasySkillUtility; target: 'ally' | 'enemy'; names: Text; descriptions: Text }[] = [
  { id: 'haste', target: 'ally', names: l('신속', 'Haste', '迅速'), descriptions: l('전투에서 3라운드 이동력과 회피를 높인다. 전투 밖에서는 3시간 민첩을 높인다.', 'Increase movement and evasion for three rounds. Outside combat, increase agility for three hours.', '戦闘で3ラウンド移動力と回避を高める。戦闘外では3時間敏捷を高める。') },
  { id: 'regen', target: 'ally', names: l('재생', 'Regeneration', '再生'), descriptions: l('3라운드 동안 매 라운드 HP를 회복한다. 전투 밖에서는 3시간 서서히 회복한다. 빈사 상태를 소생시키지 않는다.', 'Restore HP each round for three rounds. Outside combat, recover gradually for three hours. Does not revive a downed target.', '3ラウンド毎回HPを回復。戦闘外では3時間かけて回復する。瀕死の者は蘇生しない。') },
  { id: 'clarity', target: 'ally', names: l('명료', 'Clarity', '明晰'), descriptions: l('전투에서 3라운드 마법 명중과 마법 저항을 높인다. 전투 밖에서는 3시간 지능을 높인다.', 'Increase magic accuracy and magic resistance for three rounds. Outside combat, increase intelligence for three hours.', '戦闘で3ラウンド魔法命中と魔法抵抗を高める。戦闘外では3時間知力を高める。') },
  { id: 'thorns', target: 'ally', names: l('반격 가시', 'Thorns', '反撃の棘'), descriptions: l('전투에서 3라운드 실제로 받은 타격의 일부를 공격자에게 돌려준다.', 'For three combat rounds, reflect part of actual incoming damage to its attacker.', '戦闘で3ラウンド、実際に受けた打撃の一部を攻撃者に返す。') },
  { id: 'lifesteal', target: 'ally', names: l('생명 흡수', 'Life Drain', '生命吸収'), descriptions: l('전투에서 3라운드 실제로 준 피해의 일부만큼 HP를 회복한다.', 'For three combat rounds, restore HP from a bounded fraction of damage actually dealt.', '戦闘で3ラウンド、実際に与えた被害の一部でHPを回復する。') },
  { id: 'resolve', target: 'ally', names: l('불굴', 'Resolve', '不屈'), descriptions: l('전투에서 3라운드 피해를 줄이고 적대적 상태이상 1회를 막으면 사라진다. 전투 밖에서는 3시간 방호를 더한다.', 'Reduce damage for three rounds; consumed when blocking one hostile condition. Outside combat, add protection for three hours.', '戦闘で3ラウンド被害を減らし、敵対状態を1回防ぐと消える。戦闘外では3時間防護を加える。') },
  { id: 'weaken', target: 'enemy', names: l('약화', 'Weaken', '弱化'), descriptions: l('전투에서 3라운드 대상이 주는 실제 피해를 줄인다.', 'Reduce the target’s outgoing damage for three combat rounds.', '戦闘で3ラウンド、対象が与える被害を減らす。') },
  { id: 'vulnerable', target: 'enemy', names: l('틈새 노출', 'Expose', '隙の露呈'), descriptions: l('전투에서 3라운드 대상이 받는 실제 피해를 늘린다.', 'Increase damage actually received by the target for three combat rounds.', '戦闘で3ラウンド、対象が受ける被害を増やす。') },
  { id: 'blind', target: 'enemy', names: l('시야 교란', 'Dazzle', '目くらまし'), descriptions: l('전투에서 3라운드 대상의 공격 명중을 낮춘다.', 'Reduce the target’s attack accuracy for three combat rounds.', '戦闘で3ラウンド、対象の攻撃命中を下げる。') },
  { id: 'bleed', target: 'enemy', names: l('출혈', 'Bleed', '出血'), descriptions: l('전투에서 3라운드 매 라운드 지속 피해를 준다.', 'Inflict ongoing damage each round for three combat rounds.', '戦闘で3ラウンド、毎回継続被害を与える。') },
  { id: 'root', target: 'enemy', names: l('속박', 'Bind', '束縛'), descriptions: l('전투에서 3라운드 대상의 위치 이동을 막는다. 공격까지 막지는 않는다.', 'Prevent the target from changing tiles for three combat rounds. The target can still attack.', '戦闘で3ラウンド、対象の位置移動を止める。攻撃は止めない。') },
  { id: 'silence', target: 'enemy', names: l('침묵', 'Silence', '沈黙'), descriptions: l('전투에서 3라운드 MP를 소모하는 기술을 막는다. 일반 공격은 가능하다.', 'Prevent skills with an MP cost for three combat rounds. Ordinary attacks remain available.', '戦闘で3ラウンド、MPを消費する技能を止める。通常攻撃は可能。') },
];
type Plan = readonly [FantasySkillUtility, FantasySkillUtility, FantasySkillUtility, FantasySkillUtility];
export const FANTASY_JOB_UTILITY_PLANS: Record<string, Plan> = {
  adventurer: ['haste', 'resolve', 'clarity', 'regen'], merchant: ['clarity', 'resolve', 'haste', 'blind'], blacksmith: ['resolve', 'vulnerable', 'thorns', 'weaken'],
  cook: ['regen', 'haste', 'clarity', 'resolve'], alchemist: ['regen', 'blind', 'vulnerable', 'lifesteal'], hunter: ['haste', 'root', 'bleed', 'vulnerable'], ranger: ['root', 'haste', 'blind', 'clarity'],
  bard: ['haste', 'clarity', 'regen', 'resolve'], leader: ['resolve', 'haste', 'clarity', 'regen'], warrior: ['weaken', 'resolve', 'bleed', 'vulnerable'], knight: ['resolve', 'thorns', 'weaken', 'clarity'],
  spearfighter: ['root', 'resolve', 'bleed', 'vulnerable'], archer: ['root', 'haste', 'blind', 'vulnerable'], scout: ['haste', 'blind', 'clarity', 'root'], pugilist: ['weaken', 'haste', 'root', 'resolve'],
  spellblade: ['vulnerable', 'thorns', 'silence', 'lifesteal'], shieldbearer: ['resolve', 'thorns', 'root', 'weaken'], summoner: ['regen', 'thorns', 'root', 'silence'],
  thief: ['haste', 'blind', 'vulnerable', 'root'], smuggler: ['haste', 'blind', 'clarity', 'resolve'], assassin: ['blind', 'bleed', 'weaken', 'haste'], bandit: ['weaken', 'resolve', 'bleed', 'vulnerable'], spy: ['clarity', 'blind', 'silence', 'vulnerable'], crimeboss: ['resolve', 'weaken', 'haste', 'blind'],
  carpenter: ['resolve', 'root', 'thorns', 'clarity'], tailor: ['haste', 'root', 'blind', 'resolve'], weaver: ['root', 'haste', 'blind', 'clarity'], leatherworker: ['resolve', 'haste', 'thorns', 'root'],
  gemcutter: ['clarity', 'blind', 'vulnerable', 'thorns'], herbalist: ['regen', 'clarity', 'weaken', 'blind'], farmer: ['regen', 'resolve', 'root', 'weaken'], fisher: ['root', 'haste', 'resolve', 'bleed'],
  baker: ['regen', 'resolve', 'haste', 'clarity'], potter: ['resolve', 'blind', 'root', 'thorns'], shipwright: ['resolve', 'root', 'haste', 'thorns'], scribe: ['clarity', 'silence', 'vulnerable', 'resolve'],
};
const raceUtilities: Record<string, FantasySkillUtility> = {
  elf: 'clarity', dwarf: 'resolve', orc: 'weaken', halfling: 'haste', foxkin: 'blind', tideborn: 'root', dragonblood: 'vulnerable', starfairy: 'clarity', dryad: 'root', stoneborn: 'thorns', moonshadow: 'blind',
  wolfkin: 'bleed', catkin: 'haste', rabbitkin: 'haste', bearkin: 'weaken', birdkin: 'blind', lizardkin: 'resolve', 'high-elf': 'clarity', 'dark-elf': 'silence', 'snow-elf': 'root', 'hill-dwarf': 'resolve', 'deep-dwarf': 'thorns',
  'vampire-night': 'lifesteal', 'vampire-crimson': 'lifesteal', 'vampire-moon': 'lifesteal', 'frost-dragonkin': 'root', 'storm-dragonkin': 'silence', 'fire-spirit': 'vulnerable', 'water-spirit': 'regen', 'flower-fairy': 'regen', 'clockwork-golem': 'resolve',
  gnome: 'clarity', goblin: 'blind', hobgoblin: 'weaken', coralborn: 'thorns', celestial: 'clarity', devilkin: 'silence', revenant: 'silence', demigod: 'resolve', 'true-dragon': 'vulnerable', 'elder-dragon': 'clarity', archangel: 'clarity', archdemon: 'weaken',
  deerkin: 'haste', goatkin: 'resolve', batkin: 'blind', windspirit: 'haste', frostfairy: 'root',
};
function applyUtility(skill: FantasySkill, id: FantasySkillUtility): FantasySkill {
  if (skill.utility === id) return skill;
  const utility = FANTASY_SKILL_UTILITIES.find(entry => entry.id === id)!;
  const baseNames = { ko: fantasySkillName(skill, 'ko'), en: fantasySkillName(skill, 'en'), ja: fantasySkillName(skill, 'ja') };
  const names = Object.fromEntries((['ko', 'en', 'ja'] as const).map(locale => [locale, `${baseNames[locale]} · ${utility.names[locale]}`])) as Text;
  const { diceFaces: _, stat: _stat, ...rest } = skill;
  return { ...rest, names, name: names.ja, descriptions: utility.descriptions, description: utility.descriptions.ja, utility: id, power: Math.max(1, Math.min(12, skill.power)) };
}
// 廃止した技能IDは保存互換のため消さず、現行の一覧からだけ除く。
export function fantasyJobSkillVariety(job: { id: string; names: Text }, skill: FantasySkill): FantasySkill {
  const match = skill.id.match(new RegExp(`^job-${job.id}-advanced-(\\d+)$`)); if (!match) return skill;
  const n = Number(match[1]);
  if (job.id === 'mage' || job.id === 'priest') return (job.id === 'mage' ? [1, 2] : [1, 4]).includes(n) ? skill : { ...skill, retired: true };
  if (skill.kind !== 'active' || skill.restore === 'mp' || !Object.hasOwn(FANTASY_JOB_UTILITY_PLANS, job.id)) return skill;
  const utility = FANTASY_JOB_UTILITY_PLANS[job.id][n / 2 - 1]; return utility ? applyUtility(skill, utility) : skill;
}
export function fantasyRaceSkillVariety(race: { id: string; names: Text }, skill: FantasySkill): FantasySkill {
  if (race.id === 'human' || skill.kind !== 'active' || skill.effect === 'heal' || skill.effect === 'travel' || !Object.hasOwn(raceUtilities, race.id)) return skill;
  return applyUtility(skill, raceUtilities[race.id]);
}
