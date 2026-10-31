import type { FantasyAction, FantasyCharacter, FantasyProfile, FantasyResult } from './fantasy.ts';
import type { NpcLocale } from './npc.ts';
import { FANTASY_DUNGEONS } from './fantasy-dungeon-catalog.ts';
import { FANTASY_RELICS } from './fantasy-relic-catalog.ts';
import { FANTASY_JOBS } from './fantasy-data.ts';

export interface FantasyOccultState { version: 1; starObservations: { hour: number; location: string }[]; relicClaims: string[]; relics: string[]; usedRelics: string[] }
export type FantasyOccultAction = { type: 'occultObserve' } | { type: 'occultRelic'; relic: string };
export interface FantasyOccultContext { advanceTime?: boolean; startedAt?: number }
const state = (c: FantasyCharacter) => c.occult ??= { version: 1, starObservations: [], relicClaims: [], relics: [], usedRelics: [] };
const night = (hour: number) => hour % 24 >= 18 || hour % 24 < 6;
export function fantasyOccultActionValid(value: unknown): value is FantasyOccultAction {
  if (!value || typeof value !== 'object' || Array.isArray(value)) return false;
  const v = value as Record<string, unknown>;
  return v.type === 'occultObserve' && Object.keys(v).length === 1 || v.type === 'occultRelic' && Object.keys(v).length === 2 && FANTASY_RELICS.some(relic => relic.id === v.relic);
}
export function fantasyOccultHours(_profile: FantasyProfile, action: FantasyAction): number { return action.type === 'occultObserve' ? 2 : action.type === 'occultRelic' ? 1 : 0; }
const errors = {
  unavailable: { ko: '지금은 이 기록을 살필 수 없습니다.', en: 'You cannot study these traces now.', ja: '今はこの記録を調べられません。' },
  sky: { ko: '별이 떨어진 섬에서 밤하늘을 오래 살펴야 합니다.', en: 'The vigil needs the night sky of Starfall Isle.', ja: '星降りの島で夜空を見守る必要があります。' },
  practice: { ko: '아직 마력의 흐름을 별빛과 맞출 수 없습니다.', en: 'Your practiced mana cannot yet follow the starlight.', ja: 'まだ磨いた魔力を星明かりに合わせられません。' },
  relic: { ko: '직접 찾은 유고를 아직 읽지 않은 같은 생업의 손으로 펼치세요.', en: 'Study an unread testament you recovered, with the craft it belongs to.', ja: '自ら見つけた未読の遺稿を、その生業の手で開いてください。' },
};
export function fantasyOccultActionError(profile: FantasyProfile, action: FantasyOccultAction, locale: NpcLocale = 'ja', context: FantasyOccultContext = {}): string | undefined {
  const c = profile.character;
  if (!fantasyOccultActionValid(action) || !c || profile.death || c.hp <= 0 || profile.activity || profile.combatId || profile.event || c.travelPosition) return errors.unavailable[locale];
  if (action.type === 'occultObserve') {
    const startedAt = context.startedAt ?? c.hour;
    if (c.location !== 'starfall-isle' || !night(startedAt) || !night(startedAt + 2 - .001)) return errors.sky[locale];
    const mageSkills = FANTASY_JOBS.find(job => job.id === 'mage')!.skills.map(skill => skill.id);
    if (c.job !== 'mage' || (c.jobXp.mage ?? 0) < 100 || Object.entries(c.skillXp ?? {}).filter(([id]) => mageSkills.includes(id)).reduce((total, [, value]) => total + value, 0) < 12 || (c.practice?.explore ?? 0) < 5) return errors.practice[locale];
  } else {
    const relic = FANTASY_RELICS.find(relic => relic.id === action.relic)!;
    if (relic.job !== c.job || !c.occult?.relics.includes(relic.id) || c.occult.usedRelics.includes(relic.id)) return errors.relic[locale];
  }
}
export function fantasyOccultAction(profile: FantasyProfile, action: FantasyAction, _rng: () => number = Math.random, context: FantasyOccultContext = {}): FantasyResult | undefined {
  if (action.type !== 'occultObserve' && action.type !== 'occultRelic') return;
  const error = fantasyOccultActionError(profile, action, 'ja', context); if (error) return { profile, error, changed: false };
  const copy = structuredClone(profile), c = copy.character!, p = state(c); if (context.advanceTime !== false) c.hour += fantasyOccultHours(profile, action);
  if (action.type === 'occultObserve') { if (!p.starObservations.length) p.starObservations.push({ hour: c.hour, location: c.location }); }
  else p.usedRelics.push(action.relic);
  copy.revision++;
  copy.log.push({ id: Math.max(0, ...copy.log.map(entry => entry.id)) + 1, hour: c.hour, kind: 'success', text: action.type === 'occultObserve' ? 'occult:stars' : `occult:read:${action.relic}` }); copy.log = copy.log.slice(-100);
  return { profile: copy, changed: true };
}
export function fantasyOccultDungeonClaim(c: FantasyCharacter, site: string, room: string): string[] {
  const dungeon = FANTASY_DUNGEONS.find(value => value.id === site), chamber = dungeon?.rooms.find(value => value.id === room), receipt = `${site}:${room}`;
  if (!dungeon || dungeon.kind !== 'ruin' || c.location !== dungeon.location || !chamber?.reward || !c.dungeon?.sites[site]?.claimed.includes(room) || c.occult?.relicClaims.some(value => value.startsWith(`${receipt}:`))) return [];
  const p = state(c);
  const candidates = FANTASY_RELICS.filter(relic => relic.job === c.job && relic.site === site && !p.relics.includes(relic.id) && (relic.path !== 'priest-saint' || room === 'eclipsethrone'));
  if (room === 'eclipsethrone') candidates.sort((a, b) => Number(b.path === 'priest-saint') - Number(a.path === 'priest-saint'));
  const relic = candidates[0]; p.relicClaims.push(`${receipt}:${relic?.id ?? '-'}`); if (!relic) return [];
  p.relics.push(relic.id); return [relic.id];
}
export function fantasyOccultKnowledge(c: FantasyCharacter): { cores: string[]; runes: string[] } {
  if (c.job === 'mage') {
    const path = c.jobPaths?.mage?.path, crest = path && ({ 'mage-flame': 'flame-crest', 'mage-ice': 'ice-crest', 'mage-earth': 'earth-crest', 'mage-wind': 'wind-crest', 'mage-star': 'star-crest' } as Record<string, string>)[path];
    if (path === 'mage-star') return { cores: c.occult?.starObservations.length ? ['star'] : [], runes: c.occult?.starObservations.length ? ['star-crest'] : [] };
    return { cores: [], runes: crest ? [crest] : [] };
  }
  const branch = c.priestGrowth?.branch;
  return { cores: c.job === 'priest' && branch && ['inquisitor', 'paladin', 'saint'].includes(branch) ? ['blessing', ...(branch === 'saint' ? ['miracle'] : [])] : [], runes: [] };
}
export function validFantasyOccult(c: FantasyCharacter): boolean {
  const p = c.occult; if (p === undefined) return true;
  const strings = (v: unknown): v is string[] => Array.isArray(v) && v.length <= 300 && v.every(value => typeof value === 'string') && new Set(v).size === v.length;
  if (!p || typeof p !== 'object' || Object.keys(p).length !== 5 || p.version !== 1 || !Array.isArray(p.starObservations) || p.starObservations.length > 1 || !strings(p.relicClaims) || !strings(p.relics) || !strings(p.usedRelics)) return false;
  if (p.starObservations.some(entry => !entry || Object.keys(entry).length !== 2 || entry.location !== 'starfall-isle' || !Number.isFinite(entry.hour) || entry.hour < 2 || entry.hour > c.hour || !night(entry.hour - 2) || !night(entry.hour - .001))) return false;
  if (new Set(p.relicClaims.map(receipt => receipt.split(':').slice(0, 2).join(':'))).size !== p.relicClaims.length || p.relicClaims.some(receipt => { const [site, room, relic, extra] = receipt.split(':'); return extra !== undefined || !relic || relic !== '-' && !FANTASY_RELICS.some(value => value.id === relic && value.site === site && p.relics.includes(relic)) || !FANTASY_DUNGEONS.some(dungeon => dungeon.id === site && dungeon.kind === 'ruin' && dungeon.rooms.some(chamber => chamber.id === room && !!chamber.reward)) || !c.dungeon?.sites[site]?.claimed.includes(room); })) return false;
  return p.relics.every(id => FANTASY_RELICS.some(value => value.id === id) && p.relicClaims.filter(receipt => receipt.split(':')[2] === id).length === 1) && p.usedRelics.every(id => p.relics.includes(id));
}
export function fantasyOccultText(source: string, locale: NpcLocale): string | undefined {
  const error = Object.values(errors).find(value => value.ja === source); if (error) return error[locale];
  if (source === 'occult:stars') return { ko: '별빛이 천천히 옮겨 가는 동안 마력의 새로운 궤적을 기록했다.', en: 'As the stars crossed the sky, you recorded a new orbit for your mana.', ja: '星が空を渡る間、魔力の新たな軌道を書き留めた。' }[locale];
  const relic = FANTASY_RELICS.find(relic => source === `occult:read:${relic.id}`);
  if (relic) return { ko: `${relic.names.ko}의 접힌 글씨를 읽었다.`, en: `You read the folded pages of ${relic.names.en}.`, ja: `${relic.names.ja}の折り畳まれた頁を読んだ。` }[locale];
}
