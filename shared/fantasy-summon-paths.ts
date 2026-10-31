import type { FantasyCharacter } from './fantasy.ts';
import type { FantasyCombatRange, FantasyCombatSkill } from './fantasy-combat.ts';
import type { NpcLocale } from './npc.ts';
import { fantasyIsWorkerCompanion } from './fantasy-worker-companions.ts';
type Text = Record<NpcLocale, string>;
const l = (ko: string, en: string, ja: string): Text => ({ ko, en, ja });
export interface FantasyPathSummon { id: string; kind: 'summons'; requiresPath: string; names: Text; role: Text; cost: number; mp: number; hp: number; check: number; guard: number }
export const FANTASY_PATH_SUMMONS: FantasyPathSummon[] = [
  { id: 'summon-flame-spirit', kind: 'summons', requiresPath: 'summoner-elemental', names: l('화염 정령', 'Flame Spirit', '炎の精霊'), role: l('화상·화염 공격', 'Flame and burns', '炎撃と火傷'), cost: 36, mp: 10, hp: 24, check: 1, guard: 0 },
  { id: 'summon-frost-spirit', kind: 'summons', requiresPath: 'summoner-elemental', names: l('서리 정령', 'Frost Spirit', '霜の精霊'), role: l('빙결·속박', 'Frost and binding', '冷気と束縛'), cost: 38, mp: 10, hp: 26, check: 1, guard: 0 },
  { id: 'summon-direwolf', kind: 'summons', requiresPath: 'summoner-beast', names: l('계약의 거대늑대', 'Covenant Direwolf', '契約の大狼'), role: l('근접·출혈', 'Melee and bleeding', '近接と出血'), cost: 36, mp: 10, hp: 34, check: 1, guard: 1 },
  { id: 'summon-hawk', kind: 'summons', requiresPath: 'summoner-beast', names: l('계약의 매', 'Covenant Hawk', '契約の鷹'), role: l('원거리·시야 교란', 'Ranged and dazzling', '遠射と目くらまし'), cost: 34, mp: 10, hp: 22, check: 1, guard: 0 },
  { id: 'summon-ironward', kind: 'summons', requiresPath: 'summoner-puppet', names: l('철갑 인형', 'Ironward Puppet', '鉄守り人形'), role: l('방호·반격 가시', 'Wards and thorns', '防護と反撃の棘'), cost: 46, mp: 12, hp: 42, check: 0, guard: 2 },
  { id: 'summon-needle-puppet', kind: 'summons', requiresPath: 'summoner-puppet', names: l('바늘 인형', 'Needle Puppet', '針の人形'), role: l('정밀 사격·약화', 'Precise shots and weakening', '精射と弱化'), cost: 42, mp: 12, hp: 26, check: 1, guard: 0 },
  { id: 'summon-dawnmender', kind: 'summons', requiresPath: 'summoner-guardian', names: l('새벽의 치유령', 'Dawnmender Spirit', '暁の癒やし霊'), role: l('치유·재생', 'Healing and regeneration', '治癒と再生'), cost: 48, mp: 14, hp: 28, check: 1, guard: 0 },
  { id: 'summon-oathkeeper', kind: 'summons', requiresPath: 'summoner-guardian', names: l('서약의 수호령', 'Oathkeeper Spirit', '誓いの守護霊'), role: l('방호·불굴', 'Wards and resolve', '防護と不屈'), cost: 50, mp: 14, hp: 38, check: 0, guard: 2 },
];
export function fantasyCompanionAvailable(c: Pick<FantasyCharacter, 'job'> & Partial<Pick<FantasyCharacter, 'jobPaths'>>, id: string): boolean {
  if (fantasyIsWorkerCompanion(id)) return true;
  const summon = FANTASY_PATH_SUMMONS.find(summon => summon.id === id);
  if (summon) return c.job === 'summoner' && c.jobPaths?.summoner?.path === summon.requiresPath;
  if (['summon-wisp', 'summon-stone', 'summon-gale'].includes(id)) return c.job === 'summoner';
  if (['troop-guard', 'troop-scout', 'troop-carrier', 'troop-veteran'].includes(id)) return c.job === 'leader';
  return ['syndicate-runner', 'syndicate-lookout', 'syndicate-keeper', 'syndicate-mediator'].includes(id) && c.job === 'crimeboss';
}
export interface FantasySummonCombatSpec { magic: boolean; range: FantasyCombatRange; attackMultiplier: number; defenseMultiplier: number; skills: FantasyCombatSkill[] }
export function fantasySummonCombatSpec(c: FantasyCharacter, id: string): FantasySummonCombatSpec | undefined {
  if (!FANTASY_PATH_SUMMONS.some(summon => summon.id === id) || !fantasyCompanionAvailable(c, id)) return;
  const mastery = Math.min(3, Math.max(0, Math.floor((c.jobXp.summoner ?? 0) / 250)));
  const art = (slug: string, names: Text, kind: FantasyCombatSkill['kind'], power: number, mp: number, extra: Partial<FantasyCombatSkill> = {}): FantasyCombatSkill => ({ id: `${id}-${slug}`, names, kind, power: power + mastery, mp, ...extra });
  const boon = (utility: NonNullable<FantasyCombatSkill['utility']>, names: Text, power = 2, mp = 4) => art(utility, names, 'boon', power, mp, { utility, range: 'magic' });
  const hex = (utility: NonNullable<FantasyCombatSkill['utility']>, names: Text, power = 2, mp = 4) => art(utility, names, 'hex', power, mp, { utility, range: 'magic' });
  const specs: Record<string, FantasySummonCombatSpec> = {
    'summon-flame-spirit': { magic: true, range: 'magic', attackMultiplier: .34, defenseMultiplier: .4, skills: [art('flame', l('불씨의 화살', 'Ember Arrow', '残り火の矢'), 'attack', 8, 5, { magic: true, range: 'magic', damageType: 'fire', onHit: { id: 'burn', power: 2, turns: 3, chance: .45 } }), hex('vulnerable', l('열기의 틈', 'Heat Fracture', '熱の隙間'))] },
    'summon-frost-spirit': { magic: true, range: 'magic', attackMultiplier: .28, defenseMultiplier: .45, skills: [art('frost', l('서리 파편', 'Frost Shard', '霜の欠片'), 'attack', 6, 5, { magic: true, range: 'magic', damageType: 'ice', onHit: { id: 'frost', power: 2, turns: 3, chance: .5 } }), hex('root', l('얼어붙은 발목', 'Frozen Ankles', '凍る足首'))] },
    'summon-direwolf': { magic: false, range: 'melee', attackMultiplier: .4, defenseMultiplier: .45, skills: [art('fang', l('늑대의 송곳니', 'Dire Fang', '大狼の牙'), 'attack', 7, 3, { range: 'melee', damageType: 'pierce' }), hex('bleed', l('찢어진 상처', 'Rending Wound', '裂ける傷'), 2, 3)] },
    'summon-hawk': { magic: false, range: 'ranged', attackMultiplier: .29, defenseMultiplier: .3, skills: [art('dive', l('예리한 급강하', 'Keen Dive', '鋭い急降下'), 'attack', 5, 3, { range: 'ranged', hitBonus: 10, damageType: 'pierce' }), hex('blind', l('날개 가림', 'Veiling Wings', '視界を覆う翼'))] },
    'summon-ironward': { magic: false, range: 'melee', attackMultiplier: .22, defenseMultiplier: .8, skills: [art('shield', l('철갑의 엄호', 'Iron Cover', '鉄甲の庇い'), 'guard', 12, 5, { range: 'magic' }), boon('thorns', l('철가시 장갑', 'Iron Thorns', '鉄棘の装甲'), 3)] },
    'summon-needle-puppet': { magic: false, range: 'ranged', attackMultiplier: .32, defenseMultiplier: .38, skills: [art('needle', l('관절을 꿰는 바늘', 'Joint Needle', '継ぎ目を縫う針'), 'attack', 5, 4, { range: 'ranged', hitBonus: 5, damageType: 'pierce' }), hex('weaken', l('기운을 끊는 실', 'Sapping Thread', '力を断つ糸'), 3)] },
    'summon-dawnmender': { magic: true, range: 'magic', attackMultiplier: .18, defenseMultiplier: .45, skills: [art('mend', l('새벽의 손길', 'Dawn Hands', '暁の手'), 'heal', 12, 5, { range: 'magic' }), boon('regen', l('새벽의 이슬', 'Dawn Dew', '暁の雫'), 2, 5)] },
    'summon-oathkeeper': { magic: true, range: 'magic', attackMultiplier: .24, defenseMultiplier: .7, skills: [art('oath', l('서약의 방패', 'Oath Shield', '誓いの盾'), 'guard', 10, 4, { range: 'magic' }), boon('resolve', l('남아 있는 서약', 'Enduring Oath', '残る誓い'), 3, 5)] },
  };
  return specs[id];
}
