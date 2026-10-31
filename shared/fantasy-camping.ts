import { FANTASY_FRONTIER_BASE } from './fantasy-frontier-data.ts';
import { isFantasyRetreat } from './fantasy-retreats.ts';
import type { FantasyActivity, FantasyCharacter } from './fantasy.ts';
import { fantasyCompanionAvailable } from './fantasy-summon-paths.ts';
import type { NpcLocale } from './npc.ts';
import { fantasyLightStrength, fantasyWeatherExposure, fantasyCampWeatherLoss } from './fantasy-environment.ts';
import { fantasyArtifactEffects } from './fantasy-frontier-artifacts.ts';

export type FantasyCampFireSource = 'mage' | 'tinderbox' | 'none';
export function fantasyCampFireSource(c: Pick<FantasyCharacter, 'job' | 'inventory'>, mageAvailable = false): FantasyCampFireSource {
  if (c.job === 'mage' || mageAvailable) return 'mage';
  return (c.inventory.tinderbox ?? 0) > 0 && (c.inventory.wood ?? 0) >= 1 ? 'tinderbox' : 'none';
}
// 開始時に燃料を一度だけ使い、火元を野営の記録へ保存する。
export function lightFantasyCampFire(c: Pick<FantasyCharacter, 'job' | 'inventory'>, mageAvailable = false): FantasyCampFireSource {
  const source = fantasyCampFireSource(c, mageAvailable);
  if (source === 'tinderbox') c.inventory.wood--;
  return source;
}
export function fantasyCampFireText(source: FantasyCampFireSource, locale: NpcLocale): string {
  return ({
    mage: { ko: '마법사가 무료로 모닥불을 붙였다.', en: 'A mage lit the campfire for free.', ja: '魔術師が無料で焚き火をおこした。' },
    tinderbox: { ko: '화승통으로 모닥불을 붙이고 목재 1개를 썼다.', en: 'Lit the campfire with the tinderbox and used 1 wood.', ja: '火口箱で焚き火をおこし、木材1個を使った。' },
    none: { ko: '불을 붙일 수 없어 모닥불 없이 야영한다.', en: 'Unable to light a fire; camping without a campfire.', ja: '火をおこせず、焚き火なしで野営する。' },
  } as const)[source][locale];
}

export function fantasyCampingKit(character: Pick<FantasyCharacter, 'inventory'> & Partial<Pick<FantasyCharacter, 'location' | 'hour' | 'outfit' | 'dungeon' | 'equipment' | 'equippedGear' | 'gear'>>) {
  const artifact = fantasyArtifactEffects(character);
  const has = (id: string) => (character.inventory[id] ?? 0) > 0;
  const light = fantasyLightStrength(character.inventory);
  const baseFatigue = (has('fur-bedroll') ? 33 : has('bedroll') ? 25 : has('guild-loan-bedroll') ? 20 : 15) + (has('pocket-hearth') ? 5 : 0) + artifact.campFatigueBonus;
  const weatherPenalty = character.location !== undefined && character.hour !== undefined ? fantasyWeatherExposure(character as FantasyCharacter, { camping: true }).campFatigueLoss : 0;
  return {
    baseFatigue, weatherPenalty, fatigue: Math.max(0, baseFatigue - weatherPenalty),
    hp: .2 + artifact.campHpBonus,
    mp: .15 + (has('pocket-hearth') ? .05 : 0) + artifact.campMpBonus,
    riskMultiplier: (has('sentinel-bell') ? .55 : 1) * (has('camp-tarp') ? .9 : 1) * (has('camp-stakes') ? .9 : 1) * (light === 3 ? .8 : light === 2 ? .9 : light === 1 ? .97 : 1) * (1 - artifact.campRiskReduction),
    ward: has('ward-seal'),
  };
}

export function fantasyCampLogText(text: string, locale: NpcLocale): string | undefined {
  const say = (ko: string, en: string, ja: string) => ({ ko, en, ja })[locale];
  const fire = (['mage', 'tinderbox', 'none'] as const).find(source => fantasyCampFireText(source, 'ja') === text);
  if (fire) return fantasyCampFireText(fire, locale);
  if(text==='野営中に魔物が現れ、休息を中断した。')return say('야영 중 마물이 나타나 휴식을 중단했다.','A monster appeared at camp and interrupted your rest.','野営中に魔物が現れ、休息を中断した。');
  const watch=text.match(/^交代で見張りをした。担当時間([\d.]+)時間、疲労回復-(\d+)。$/);
  if(watch)return say(`교대로 망을 봤다. 당번 ${watch[1]}시간 · 피로 회복 -${watch[2]}.`,`Rotated the watch. Watch duty ${watch[1]} hours · fatigue recovery -${watch[2]}.`,`交代で見張りをした。担当時間${watch[1]}時間、疲労回復-${watch[2]}。`);
  const rest = text.match(/^野営を終えた。疲労-(\d+)、HP\+(\d+)%、MP\+(\d+)%、危険軽減(\d+)%。$/);
  if (rest) return say(`야영을 마쳤다. 피로 -${rest[1]} · HP +${rest[2]}% · MP +${rest[3]}%. 장비가 불상사 위험을 ${rest[4]}% 줄였다.`, `Finished camping. Fatigue -${rest[1]} · HP +${rest[2]}% · MP +${rest[3]}%. Equipment reduced incident risk by ${rest[4]}%.`, `野営を終えた。疲労-${rest[1]}・HP+${rest[2]}%・MP+${rest[3]}%。装備で災難の危険が${rest[4]}%減った。`);
  if (text === '野営の結界符が襲撃を防ぎ、1枚燃え尽きた。') return say('야영 결계부가 습격을 막고 한 장 타올라 사라졌다.', 'A camp ward blocked the attack and one seal burned away.', '野営の結界符が襲撃を防ぎ、1枚燃え尽きた。');
  return undefined;
}


export interface FantasyCampProgress { fire?: FantasyCampFireSource; checked: number; watchHours: number; fatigueRecovered: number; weatherLoss?: number }
export interface FantasyCampWatchWindow { startedAt: number; endsAt: number; watchers: number }
export function fantasyCampCompanions(c: FantasyCharacter): number {
  return (['troop', 'syndicate'] as const).flatMap(kind => c.specialization?.companies?.[kind]?.members ?? [])
    .filter(member => member.assigned && member.condition === 'ready' && member.hp > 0 && fantasyCompanionAvailable(c, member.id)).length;
}
export function fantasyCampTogether(a: FantasyCharacter, b: FantasyCharacter): boolean {
  if (a.location !== b.location) return false;
  const ar = a.dungeon?.active, br = b.dungeon?.active;
  if (!!ar !== !!br || ar && br && (ar.site !== br.site || ar.room !== br.room || a.dungeon?.sites[ar.site]?.layoutSeed !== b.dungeon?.sites[br.site]?.layoutSeed)) return false;
  const ap = a.travelPosition, bp = b.travelPosition;
  return !ap && !bp || !!ap && !!bp && ap.from === bp.from && ap.to === bp.to && Math.abs(ap.fraction - bp.fraction) < 1e-9;
}
export function fantasyCampWatcherCount(windows: readonly FantasyCampWatchWindow[], hour: number): number {
  return windows.filter(window => window.startedAt < hour && window.endsAt >= hour).reduce((sum, window) => sum + window.watchers, 0);
}
export function fantasyCampWatchHours(windows: readonly FantasyCampWatchWindow[], from: number, to: number): number {
  const boundaries = [...new Set([from, to, ...windows.flatMap(window => [window.startedAt, window.endsAt]).filter(hour => hour > from && hour < to)])].sort((a, b) => a - b);
  return boundaries.slice(1).reduce((hours, end, i) => hours + (fantasyCampWatcherCount(windows, (boundaries[i] + end) / 2) >= 2 ? end - boundaries[i] : 0), 0);
}
export function validFantasyCampProgress(activity: FantasyActivity, c: FantasyCharacter): boolean {
  const camp = activity.camp;
  if (camp === undefined) return true;
  if (!camp || typeof camp !== 'object' || Array.isArray(camp) || ![3,4,5].includes(Object.keys(camp).length) || camp.fire!==undefined&&!['mage','tinderbox','none'].includes(camp.fire) || Object.keys(camp).some(key => !['fire','checked', 'watchHours', 'fatigueRecovered','weatherLoss'].includes(key)) || activity.action.type !== 'rest' || activity.endsAt - activity.startedAt !== 8) return false;
  const elapsed = Math.min(8, Math.max(0, c.hour - activity.startedAt));
  return Number.isSafeInteger(camp.checked) && camp.checked >= 0 && camp.checked === Math.floor(elapsed + 1e-8)
    && Number.isFinite(camp.watchHours) && camp.watchHours >= 0 && camp.watchHours <= elapsed + 1e-8 && (activity.action.watch === true || camp.watchHours === 0)
    && (camp.weatherLoss === undefined || Number.isFinite(camp.weatherLoss) && camp.weatherLoss >= 0 && camp.weatherLoss <= elapsed / 8 * 13 + 1e-8)
    && Number.isSafeInteger(camp.fatigueRecovered) && camp.fatigueRecovered >= 0 && camp.fatigueRecovered <= Math.floor((elapsed - camp.watchHours * .25 + 1e-8) / 8 * fantasyCampingKit(c).baseFatigue);
}
export function advanceFantasyCamp(c: FantasyCharacter, activity: FantasyActivity, from: number, to: number, windows: readonly FantasyCampWatchWindow[] = []): void {
  const camp = activity.camp; if (!camp || activity.action.type !== 'rest') return;
  const start = Math.max(activity.startedAt, from), end = Math.min(activity.endsAt, to);
  if (end <= start) return;
  if (activity.action.watch) camp.watchHours += fantasyCampWatchHours(windows, Math.max(activity.startedAt, from), Math.min(activity.endsAt, to));
  const campfire = !!camp.fire && camp.fire !== 'none';
  camp.weatherLoss = (camp.weatherLoss ?? fantasyCampWeatherLoss(c, activity.startedAt, start, campfire)) + fantasyCampWeatherLoss(c, start, end, campfire);
  const recovered = Math.max(camp.fatigueRecovered, Math.floor((end - activity.startedAt - camp.watchHours * .25 + 1e-8) / 8 * fantasyCampingKit(c).baseFatigue - camp.weatherLoss + 1e-8));
  c.fatigue = Math.max(0, c.fatigue - Math.max(0, recovered - camp.fatigueRecovered));
  camp.fatigueRecovered = recovered; camp.checked = Math.max(camp.checked, Math.floor(to - activity.startedAt + 1e-8));
}
function campRoll(seed: number, slot: number): number {
  let state = (seed ^ Math.imul(slot, 0x9e3779b1) ^ 0xca9fb3d7) >>> 0;
  state = Math.imul(state ^ state >>> 16, 0x21f0aaad); state = Math.imul(state ^ state >>> 15, 0x735a2d97);
  return ((state ^ state >>> 15) >>> 0) / 4294967296;
}
export function fantasyCampAmbushHit(activity: FantasyActivity, c: FantasyCharacter, danger: number, until: number, windows: readonly FantasyCampWatchWindow[] = []): { hour: number; slot: number } | undefined {
  if (isFantasyRetreat(c.location) || c.location===FANTASY_FRONTIER_BASE || !activity.camp || activity.action.type !== 'rest') return;
  const kit = fantasyCampingKit(c), chance = c.dungeon?.active ? .035 + danger * .01 : .015 + danger * .005;
  for (let slot = activity.camp.checked + 1; slot <= Math.floor(Math.min(until, activity.endsAt) - activity.startedAt + 1e-8); slot++) {
    const hour = activity.startedAt + slot; if (hour >= activity.endsAt - 1e-8) break;
    if (campRoll(activity.seed, slot) < Math.min(.3, chance) * kit.riskMultiplier * (fantasyCampWatcherCount(windows, hour) >= 2 ? .35 : 1)) return { hour, slot };
  }
}
