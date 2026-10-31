import type { FantasyCharacter, FantasyProfile } from './fantasy.ts';
import type { NpcLocale } from './npc.ts';
import { FANTASY_ITEMS, FANTASY_LOCATIONS, FANTASY_QUESTS, FANTASY_RACES } from './fantasy-data.ts';
import { FANTASY_MAIN_TRIALS } from './fantasy-main-trials.ts';
import { fantasyCharacterJobNames } from './fantasy-job-display.ts';

type Names = Record<NpcLocale, string>;
export interface FantasyRankingRow { nickname: string; race: Names; job: Names; score: number }
export interface FantasyRankingEntry { owner: string; generation: number; dead: boolean; row: FantasyRankingRow }
export interface FantasyRankingLedger { version: 1; entries: FantasyRankingEntry[]; nicknames: Record<string, string> }
export const newFantasyRankingLedger = (): FantasyRankingLedger => ({ version: 1, entries: [], nicknames: {} });
const object = (v: unknown): v is Record<string, unknown> => !!v && typeof v === 'object' && !Array.isArray(v);
const positive = (v: unknown): number => typeof v === 'number' && Number.isSafeInteger(v) && v > 0 ? v : 0;
const list = (v: unknown): string[] => Array.isArray(v) ? [...new Set(v.filter((id): id is string => typeof id === 'string'))] : [];
const text = (v: unknown, max: number): v is string => typeof v === 'string' && v.trim().length > 0 && [...v].length <= max && !/[\u0000-\u001f\u007f]/u.test(v);
export const validFantasyRankingNickname = (value: unknown): value is string => text(value, 80);
export function fantasyRankingScore(c: Partial<FantasyCharacter>): number {
  const items = object(c.inventory) ? FANTASY_ITEMS.reduce((sum, item) => sum + (positive(c.inventory![item.id]) ? (10 + 10 * Math.min(8, positive(item.tier) || 1)) * Math.min(3, Math.sqrt(positive(c.inventory![item.id]))) : 0), 0) : 0;
  const mastery = [c.jobXp, c.skillXp].reduce<number>((sum, xp) => sum + (object(xp) ? Object.values(xp).reduce<number>((points, value) => points + 2 * Math.sqrt(positive(value)), 0) : 0), 0);
  const completed = new Set(list(c.completed)), quests = FANTASY_QUESTS.filter(quest => completed.has(quest.id)).length * 80;
  const story = FANTASY_MAIN_TRIALS.reduce((sum, trial) => {
    const proofs = c.mainTrials?.[trial.questId]?.proofs;
    const stages = completed.has(trial.questId) ? trial.stages.length : Array.isArray(proofs) ? new Set(proofs.filter(proof => proof && trial.stages.some(stage => stage.id === proof.stage)).map(proof => proof.stage)).size : 0;
    return sum + stages * 100;
  }, 0);
  const visited = new Set(list(c.visited)), exploration = FANTASY_LOCATIONS.filter(place => visited.has(place.id)).length * 40;
  // ゲーム上の点数上限は設けず、数値の精度が失われる範囲だけを防ぐ。
  return Math.min(Number.MAX_SAFE_INTEGER, Math.floor(items + mastery + positive(c.level) * 50 + quests + story + exploration));
}
function validNames(value: unknown): value is Names { return object(value) && Object.keys(value).length === 3 && ['ko', 'en', 'ja'].every(locale => text(value[locale], 200)); }
export function validFantasyRankingRow(value: unknown): value is FantasyRankingRow {
  return object(value) && Object.keys(value).length === 4 && validFantasyRankingNickname(value.nickname) && validNames(value.race) && validNames(value.job) && Number.isSafeInteger(value.score) && Number(value.score) >= 0;
}
export function validFantasyRankingLedger(value: unknown): value is FantasyRankingLedger {
  if (!object(value) || Object.keys(value).length !== 3 || value.version !== 1 || !Array.isArray(value.entries) || value.entries.length > 10 || !object(value.nicknames) || Object.entries(value.nicknames).some(([owner, nickname]) => !text(owner, 160) || owner === '__proto__' || !validFantasyRankingNickname(nickname))) return false;
  if (!value.entries.every(entry => object(entry) && Object.keys(entry).length === 4 && text(entry.owner, 160) && entry.owner !== '__proto__' && Number.isSafeInteger(entry.generation) && Number(entry.generation) >= 1 && typeof entry.dead === 'boolean' && validFantasyRankingRow(entry.row))) return false;
  const entries = value.entries as FantasyRankingEntry[];
  return new Set(entries.map(entry => `${entry.owner}\u0000${entry.generation}`)).size === entries.length && entries.every((entry, index) => index === 0 || entries[index - 1].row.score >= entry.row.score);
}
export function reconcileFantasyRanking(ledger: FantasyRankingLedger, profiles: ReadonlyMap<string, FantasyProfile>): FantasyRankingLedger {
  const next = structuredClone(ledger), entries = new Map(next.entries.filter(entry => entry.dead).map(entry => [`${entry.owner}\u0000${entry.generation}`, entry]));
  for (const entry of entries.values()) if (Object.hasOwn(next.nicknames, entry.owner)) entry.row.nickname = next.nicknames[entry.owner];
  for (const [owner, profile] of profiles) {
    const c = profile.character; if (!c) continue;
    const generation = profile.generation ?? 1, key = `${owner}\u0000${generation}`;
    if (entries.has(key)) continue;
    const race = FANTASY_RACES.find(race => race.id === c.race)?.names ?? { ko: '알 수 없음', en: 'Unknown', ja: '不明' };
    entries.set(key, { owner, generation, dead: !!profile.death, row: { nickname: Object.hasOwn(next.nicknames, owner) ? next.nicknames[owner] : c.name, race: { ...race }, job: fantasyCharacterJobNames(c), score: fantasyRankingScore(c) } });
  }
  next.entries = [...entries.values()].sort((a, b) => b.row.score - a.row.score || (a.owner < b.owner ? -1 : a.owner > b.owner ? 1 : a.generation - b.generation)).slice(0, 10);
  return next;
}
export function publicFantasyRanking(ledger: FantasyRankingLedger): FantasyRankingRow[] {
  return ledger.entries.map(entry => structuredClone(entry.row));
}
