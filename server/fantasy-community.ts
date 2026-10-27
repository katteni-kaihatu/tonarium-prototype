import fs from 'node:fs';
import path from 'node:path';
import { randomUUID } from 'node:crypto';
import { NPC_PUBLIC, type NpcLocale } from '../shared/npc.ts';
import type { FantasyCharacter } from '../shared/fantasy.ts';
import { FANTASY_LOCATIONS } from '../shared/fantasy-data.ts';
import { fantasyBuildings } from '../shared/fantasy-town.ts';
import { FANTASY_COMMUNITY_PROJECTS, type FantasyCommunityError, type FantasyCommunityProjectId, type FantasyCommunityRequest, type FantasyCommunityState } from '../shared/fantasy-community.ts';

interface Project { location: string; kind: FantasyCommunityProjectId; total: number }
interface Notice { id: number; hour: number; location: string; kind: FantasyCommunityProjectId; npcIds: string[] }
interface Player { lastAt: Record<string, number>; requests: string[] }
interface Saved { version: 1; revision: number; projects: Record<string, Project>; players: Record<string, Player>; notices: Notice[] }
export interface CommunityActor { id: string; session: string | null; world?: string; character?: FantasyCharacter; busy?: boolean }
const object = (value: unknown): value is Record<string, unknown> => !!value && typeof value === 'object' && !Array.isArray(value);
const count = (value: unknown): value is number => typeof value === 'number' && Number.isSafeInteger(value) && value >= 0;
const hour = (value: unknown): value is number => typeof value === 'number' && Number.isFinite(value) && value >= 0;
const local = (location: unknown) => typeof location === 'string' && FANTASY_LOCATIONS.some(place => place.id === location);
const kindOf = (building: string): FantasyCommunityProjectId => ['library', 'tower', 'archaeology', 'alchemist'].includes(building) ? 'research'
  : ['blacksmith', 'shipyard'].includes(building) ? 'repairs' : ['temple', 'residence'].includes(building) ? 'care' : 'supplies';

function valid(value: unknown): value is Saved {
  if (!object(value) || value.version !== 1 || !count(value.revision) || !object(value.projects) || !object(value.players) || !Array.isArray(value.notices) || value.notices.length > 80) return false;
  if (Object.entries(value.projects).some(([key, project]) => !object(project) || !local(project.location) || !Object.hasOwn(FANTASY_COMMUNITY_PROJECTS, String(project.kind)) || !count(project.total) || key !== `${project.location}:${project.kind}`)) return false;
  for (const player of Object.values(value.players)) {
    if (!object(player) || !object(player.lastAt) || !Array.isArray(player.requests) || player.requests.length > 128 || new Set(player.requests).size !== player.requests.length
      || player.requests.some(id => typeof id !== 'string' || !/^[a-zA-Z0-9_-]{1,80}$/.test(id)) || Object.entries(player.lastAt).some(([location, at]) => !local(location) || !hour(at))) return false;
  }
  if (new Set(value.notices.map(notice => object(notice) ? notice.id : undefined)).size !== value.notices.length) return false;
  return value.notices.every(notice => object(notice) && count(notice.id) && hour(notice.hour) && local(notice.location)
    && Object.hasOwn(FANTASY_COMMUNITY_PROJECTS, String(notice.kind)) && Array.isArray(notice.npcIds) && notice.npcIds.length === 2
    && new Set(notice.npcIds).size === 2 && notice.npcIds.every(id => NPC_PUBLIC.some(npc => npc.id === id && npc.homeLocation === notice.location)));
}

function saveAtomic(file: string, text: string) {
  fs.mkdirSync(path.dirname(file), { recursive: true });
  const temporary = `${file}.${randomUUID()}.tmp`;
  try { fs.writeFileSync(temporary, text, { encoding: 'utf8', flag: 'wx' }); fs.renameSync(temporary, file); }
  finally { try { fs.unlinkSync(temporary); } catch (error) { if ((error as NodeJS.ErrnoException).code !== 'ENOENT') throw error; } }
}

export class FantasyCommunity {
  private data: Saved = { version: 1, revision: 0, projects: {}, players: {}, notices: [] };
  private save: (file: string, text: string) => void;
  private onError: (error: unknown) => void;
  readonly loadError?: string;
  constructor(private file: string, options: { save?: (file: string, text: string) => void; onError?: (error: unknown) => void } = {}) {
    this.save = options.save ?? saveAtomic;
    this.onError = options.onError ?? (error => console.error('[fantasy-community] save/load failed', error));
    try {
      const value: unknown = JSON.parse(fs.readFileSync(file, 'utf8'));
      if (!valid(value)) throw new Error('Invalid shared community save');
      this.data = value;
    } catch (error) {
      if ((error as NodeJS.ErrnoException).code !== 'ENOENT') { this.loadError = 'unavailable'; this.onError(error); }
    }
  }

  state(actor: CommunityActor): FantasyCommunityState | null {
    const c = actor.character;
    if (!actor.session || actor.world !== 'fantasy' || !c || !local(c.location)) return null;
    const player = Object.hasOwn(this.data.players, actor.id) ? this.data.players[actor.id] : undefined;
    const nextContributionAt = (player?.lastAt[c.location] ?? -6) + 6;
    return { revision: this.data.revision, location: c.location,
      projects: Object.entries(FANTASY_COMMUNITY_PROJECTS).map(([id, names]) => {
        const total = this.data.projects[`${c.location}:${id}`]?.total ?? 0;
        return { id: id as FantasyCommunityProjectId, names: { ...names }, contributions: total % 3, target: 3, completions: Math.floor(total / 3) };
      }),
      notices: this.data.notices.filter(notice => notice.location === c.location).slice(-5).map(notice => {
        const pair = notice.npcIds.map(id => NPC_PUBLIC.find(npc => npc.id === id)!);
        const project = FANTASY_COMMUNITY_PROJECTS[notice.kind];
        return { id: notice.id, hour: notice.hour, npcIds: [...notice.npcIds], text: {
          ko: `${pair[0].name.ko}와 ${pair[1].name.ko}가 협력해 ${project.ko}를 한 차례 마쳤습니다.`,
          en: `${pair[0].name.en} and ${pair[1].name.en} worked together to finish a round of ${project.en.toLowerCase()}.`,
          ja: `${pair[0].name.ja}と${pair[1].name.ja}が協力し、${project.ja}を一巡終えました。`,
        } };
      }), nextContributionAt, canContribute: !this.loadError && !actor.busy && c.hour >= nextContributionAt && NPC_PUBLIC.some(npc => npc.homeLocation === c.location),
    };
  }

  contribute(actor: CommunityActor, request: FantasyCommunityRequest): { state: FantasyCommunityState | null; error?: FantasyCommunityError } {
    const fail = (error: FantasyCommunityError) => ({ state: this.state(actor), error });
    if (this.loadError) return fail('unavailable');
    const c = actor.character;
    if (!actor.session || actor.world !== 'fantasy' || !c || !request || !count(request.revision)
      || typeof request.requestId !== 'string' || !/^[a-zA-Z0-9_-]{1,80}$/.test(request.requestId) || typeof request.npcId !== 'string') return fail('invalid');
    const npc = NPC_PUBLIC.find(npc => npc.id === request.npcId);
    if (!npc || npc.homeLocation !== c.location || npc.building !== 'residence' && !fantasyBuildings(c).some(building => building.id === npc.building && building.npcIds.includes(npc.id))) return fail('invalid');
    const previous = Object.hasOwn(this.data.players, actor.id) ? this.data.players[actor.id] : { lastAt: {}, requests: [] };
    if (previous.requests.includes(request.requestId)) return fail('duplicate');
    if (request.revision !== this.data.revision) return fail('stale');
    if (actor.busy) return fail('busy');
    if (c.hour < (previous.lastAt[c.location] ?? -6) + 6) return fail('cooldown');
    const next = structuredClone(this.data);
    const kind = kindOf(npc.building); const key = `${c.location}:${kind}`;
    next.projects[key] ??= { location: c.location, kind, total: 0 };
    next.projects[key].total++;
    const players = new Map(Object.entries(next.players));
    players.set(actor.id, { lastAt: { ...previous.lastAt, [c.location]: c.hour }, requests: [...previous.requests, request.requestId].slice(-128) });
    next.players = Object.fromEntries(players);
    next.revision++;
    if (next.projects[key].total % 3 === 0) {
      const partner = NPC_PUBLIC.find(other => other.homeLocation === c.location && other.id !== npc.id);
      if (partner) next.notices.push({ id: next.revision, hour: c.hour, location: c.location, kind, npcIds: [npc.id, partner.id] });
      next.notices = next.notices.slice(-80);
    }
    try { this.save(this.file, JSON.stringify(next)); }
    catch (error) { this.onError(error); return fail('unavailable'); }
    this.data = next;
    return { state: this.state(actor) };
  }

  facts(actor: CommunityActor, locale: NpcLocale): string[] {
    const state = this.state(actor);
    if (!state) return [];
    const progress = state.projects.filter(project => project.contributions || project.completions).map(project => `${project.names[locale]} ${project.contributions}/${project.target}, ${project.completions}`).join('; ');
    const recent = state.notices.at(-1)?.text[locale];
    return [progress ? { ko: `이 지역의 공동 준비 기록: ${progress}.`, en: `Shared preparations in this settlement: ${progress}.`, ja: `この土地の共同準備記録：${progress}。` }[locale] : { ko: '이 지역에는 아직 공동 준비 기여 기록이 없습니다.', en: 'No shared preparation contributions have been recorded here yet.', ja: 'この土地にはまだ共同準備への協力記録がありません。' }[locale], ...(recent ? [recent] : [])];
  }
}
