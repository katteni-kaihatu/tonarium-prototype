import type { FantasyProfile } from './fantasy.ts';
import { FANTASY_LOCATIONS } from './fantasy-data.ts';
import { FANTASY_SETTLEMENTS } from './fantasy-town.ts';
import { NPC_PUBLIC, type NpcLocale } from './npc.ts';
import { fantasyStats } from './fantasy-engine.ts';
import { grantFantasyReputation } from './fantasy-reputation.ts';
import { grantFantasyPractice } from './fantasy-progression.ts';

type Text = Record<NpcLocale, string>;
const text = (ko: string, en: string, ja: string): Text => ({ ko, en, ja });
export type FantasyCivicPolicy = 'provisions' | 'patrol' | 'festival' | 'extort';
export type FantasyCivicCrime = 'theft' | 'assault' | 'robbery' | 'extortion';
export type FantasyCivicError = 'invalid' | 'unavailable' | 'stale' | 'busy' | 'protected' | 'cooldown' | 'insufficient-gold' | 'forbidden' | 'no-case' | 'custody' | 'wait' | 'duplicate' | 'limit';
export interface FantasyCivicContext { session: string; publicSession: boolean; peers: string[] }
export type FantasyCivicCommand = { type: 'sync' }
  | { type: 'consent'; enabled: boolean; revision: number; requestId: string }
  | { type: 'rob' | 'arrest'; target: string; revision: number; requestId: string }
  | { type: 'npcCrime'; npc: string; kind: 'theft' | 'assault'; revision: number; requestId: string }
  | { type: 'hearing'; plea: 'admit' | 'contest'; revision: number; requestId: string }
  | { type: 'govern'; policy: FantasyCivicPolicy; revision: number; requestId: string }
  | { type: 'surrender' | 'appeal' | 'restitution' | 'payFine' | 'release'; revision: number; requestId: string };
export interface FantasyCivicPerson { user: string; generation: number; name: string }
export interface FantasyCivicCase {
  id: string; accused: FantasyCivicPerson; victim: { npc: string } | FantasyCivicPerson; location: string; createdAt: number;
  crime: FantasyCivicCrime; evidence: { npc: string; strength: number }[];
  status: 'wanted' | 'custody' | 'sentenced' | 'closed'; fine: number; damages: number; jailUntil: number | null;
  repaid: boolean; appealed: boolean; arrestor: FantasyCivicPerson | null; closedReason: 'served' | 'paid' | 'past-life' | null;
}
export interface FantasyCivicNpcPresence {
  npc: string; location: string; building: string; activity: 'sleep' | 'work' | 'market' | 'visit'; window: number;
  relations: Record<string, number>;
}
export interface FantasyCivicTown {
  council: number; guild: number; underworld: number; trust: number; treasury: number;
  projects: { provisions: number; patrol: number; festival: number };
  policy: FantasyCivicPolicy | null; policyUntil: number; steward: FantasyCivicPerson | null;
}
export interface FantasyCivicNotice { id: string; hour: number; location: string; text: Text; npcs: string[] }
export interface FantasyCivicLedger {
  version: 1; revision: number; window: number; towns: Record<string, FantasyCivicTown>; npcs: Record<string, FantasyCivicNpcPresence>;
  cases: FantasyCivicCase[]; consents: Record<string, { generation: number; session: string; location: string; until: number }>;
  cooldowns: Record<string, number>; receipts: Record<string, { user: string; generation: number; request: string; hour: number }>;
  notices: FantasyCivicNotice[];
}
export interface FantasyCivicState {
  revision: number; location: string | null; hour: number; town: FantasyCivicTown | null; serviceMultiplier: number;
  npcs: (FantasyCivicNpcPresence & { names: Text; role: Text })[]; notices: FantasyCivicNotice[];
  ownCases: Omit<FantasyCivicCase, 'accused' | 'arrestor'>[];
  wanted: { user: string; generation: number; name: string; crime: FantasyCivicCrime; location: string; bounty: number }[];
  riskEnabled: boolean; riskUntil: number; peers: { user: string; name: string; consenting: boolean; wanted: boolean }[];
  actionBlock: 'custody' | undefined;
}
export interface FantasyCivicChange { ledger: FantasyCivicLedger; profiles: Record<string, FantasyProfile>; changed: boolean; error?: FantasyCivicError }

const towns = Object.keys(FANTASY_SETTLEMENTS).filter(id => FANTASY_SETTLEMENTS[id].kind !== 'tower');
const npcOf = (id: string) => NPC_PUBLIC.find(npc => npc.id === id);
const place = (id: string) => FANTASY_LOCATIONS.find(location => location.id === id);
const object = (value: unknown): value is Record<string, unknown> => !!value && typeof value === 'object' && !Array.isArray(value);
const exact = (value: Record<string, unknown>, keys: string[]) => Object.keys(value).length === keys.length && Object.keys(value).every(key => keys.includes(key));
const int = (value: unknown, low = 0, high = Number.MAX_SAFE_INTEGER): value is number => typeof value === 'number' && Number.isSafeInteger(value) && value >= low && value <= high;
const hour = (value: unknown): value is number => typeof value === 'number' && Number.isFinite(value) && value >= 0 && value < 1e12;
const key = (value: unknown): value is string => typeof value === 'string' && /^[a-zA-Z0-9][a-zA-Z0-9:_-]{0,119}$/.test(value);
const user = (value: unknown): value is string => typeof value === 'string' && value.length > 0 && value.length <= 120 && !['__proto__', 'prototype', 'constructor'].includes(value) && !/[\u0000-\u001f\u007f]/.test(value);
const identity = (value: unknown): value is FantasyCivicPerson => object(value) && exact(value, ['user', 'generation', 'name']) && user(value.user) && int(value.generation, 1)
  && typeof value.name === 'string' && value.name.trim().length > 0 && [...value.name].length <= 24 && !/[\u0000-\u001f\u007f]/.test(value.name);
const generation = (profile: FantasyProfile) => profile.generation ?? 1;
const current = (entry: FantasyCivicPerson, profiles: Record<string, FantasyProfile>) => !!profiles[entry.user]?.character && !profiles[entry.user].death && generation(profiles[entry.user]) === entry.generation;
const idle = (profile: FantasyProfile | undefined) => !!profile?.character && !profile.death && profile.character.hp > 0 && !profile.activity && !profile.event && !profile.combatId;
const person = (id: string, p: FantasyProfile): FantasyCivicPerson => ({ user: id, generation: generation(p), name: p.character!.name });
const activeCase = (ledger: FantasyCivicLedger, id: string, p: FantasyProfile) => ledger.cases.find(entry => entry.accused.user === id && entry.accused.generation === generation(p) && entry.status !== 'closed');
const receipt = (id: string, gen: number, request: string) => JSON.stringify([id, gen, request]);
const hash = (value: string) => { let result = 2166136261; for (const point of value) { result ^= point.charCodeAt(0); result = Math.imul(result, 16777619); } return result >>> 0; };
const bounded = (value: number, low = -100, high = 100) => Math.max(low, Math.min(high, value));
const record = (p: FantasyProfile, message: string) => {
  p.log = [...p.log, { id: Math.max(0, ...p.log.map(entry => entry.id)) + 1, hour: p.character!.hour, text: message, kind: 'system' as const }].slice(-100);
};
const addNotice = (l: FantasyCivicLedger, location: string, at: number, message: Text, npcs: string[] = []) => {
  l.notices.push({ id: `civic-${l.revision}-${l.notices.at(-1)?.id ?? 'first'}-${hash(`${location}:${at}:${message.ko}`)}`.slice(-120), hour: at, location, text: message, npcs });
  l.notices = l.notices.slice(-80);
};
const validText = (value: unknown) => object(value) && exact(value, ['ko', 'en', 'ja']) && Object.values(value).every(value => typeof value === 'string' && value.length > 0 && value.length <= 600);

export function newFantasyCivicLedger(): FantasyCivicLedger {
  return { version: 1, revision: 0, window: -1, towns: Object.fromEntries(towns.map(id => [id, { council: 50, guild: 40, underworld: 10, trust: 0, treasury: 0,
    projects: { provisions: 0, patrol: 0, festival: 0 }, policy: null, policyUntil: 0, steward: null }])),
    npcs: Object.fromEntries(NPC_PUBLIC.map(npc => [npc.id, { npc: npc.id, location: npc.homeLocation, building: npc.building, activity: 'work', window: -1, relations: {} }])),
    cases: [], consents: {}, cooldowns: {}, receipts: {}, notices: [] };
}

export function isFantasyCivicCommand(value: unknown): value is FantasyCivicCommand {
  if (!object(value)) return false;
  if (value.type === 'sync') return exact(value, ['type']);
  const base = ['type', 'revision', 'requestId'];
  if (!int(value.revision) || !key(value.requestId)) return false;
  if (value.type === 'consent') return exact(value, [...base, 'enabled']) && typeof value.enabled === 'boolean';
  if (value.type === 'rob' || value.type === 'arrest') return exact(value, [...base, 'target']) && user(value.target);
  if (value.type === 'npcCrime') return exact(value, [...base, 'npc', 'kind']) && typeof value.npc === 'string' && !!npcOf(value.npc) && ['theft', 'assault'].includes(String(value.kind));
  if (value.type === 'hearing') return exact(value, [...base, 'plea']) && ['admit', 'contest'].includes(String(value.plea));
  if (value.type === 'govern') return exact(value, [...base, 'policy']) && ['provisions', 'patrol', 'festival', 'extort'].includes(String(value.policy));
  return ['surrender', 'appeal', 'restitution', 'payFine', 'release'].includes(String(value.type)) && exact(value, base);
}

export function validFantasyCivicLedger(value: unknown): value is FantasyCivicLedger {
  if (!object(value) || !exact(value, ['version', 'revision', 'window', 'towns', 'npcs', 'cases', 'consents', 'cooldowns', 'receipts', 'notices']) || value.version !== 1 || !int(value.revision) || !int(value.window, -1)
    || !object(value.towns) || Object.keys(value.towns).length !== towns.length || !object(value.npcs) || Object.keys(value.npcs).length !== NPC_PUBLIC.length
    || !Array.isArray(value.cases) || value.cases.length > 512 || !object(value.consents) || Object.keys(value.consents).length > 4096
    || !object(value.cooldowns) || Object.keys(value.cooldowns).length > 8192 || !object(value.receipts) || Object.keys(value.receipts).length > 4096 || !Array.isArray(value.notices) || value.notices.length > 80) return false;
  if (Object.entries(value.towns).some(([id, town]) => !towns.includes(id) || !object(town) || !exact(town, ['council', 'guild', 'underworld', 'trust', 'treasury', 'projects', 'policy', 'policyUntil', 'steward'])
    || ![town.council, town.guild, town.underworld].every(amount => int(amount, 0, 100)) || Number(town.council) + Number(town.guild) + Number(town.underworld) !== 100
    || !int(town.trust, -100, 100) || !int(town.treasury, 0, 1e9) || !object(town.projects) || !exact(town.projects, ['provisions', 'patrol', 'festival']) || Object.values(town.projects).some(amount => !int(amount))
    || town.policy !== null && !['provisions', 'patrol', 'festival', 'extort'].includes(String(town.policy)) || !hour(town.policyUntil) || town.steward !== null && !identity(town.steward))) return false;
  if (Object.entries(value.npcs).some(([id, npc]) => !npcOf(id) || !object(npc) || !exact(npc, ['npc', 'location', 'building', 'activity', 'window', 'relations']) || npc.npc !== id || npc.location !== npcOf(id)!.homeLocation
    || typeof npc.building !== 'string' || ![npcOf(id)!.building, 'residence', 'market', 'temple', 'guild', 'inn'].includes(npc.building)
    || !['sleep', 'work', 'market', 'visit'].includes(String(npc.activity)) || !int(npc.window, -1) || npc.window > (value.window as number) || !object(npc.relations) || Object.keys(npc.relations).length > 8
    || Object.entries(npc.relations).some(([other, relation]) => !npcOf(other) || other === id || npcOf(other)!.homeLocation !== npcOf(id)!.homeLocation || !int(relation, -100, 100)))) return false;
  const active = new Set<string>();
  for (const entry of value.cases) {
    if (!object(entry) || !exact(entry, ['id', 'accused', 'victim', 'location', 'createdAt', 'crime', 'evidence', 'status', 'fine', 'damages', 'jailUntil', 'repaid', 'appealed', 'arrestor', 'closedReason'])
      || !key(entry.id) || !identity(entry.accused) || !(identity(entry.victim) || object(entry.victim) && exact(entry.victim, ['npc']) && typeof entry.victim.npc === 'string' && !!npcOf(entry.victim.npc))
      || typeof entry.location !== 'string' || !place(entry.location) || !hour(entry.createdAt) || !['theft', 'assault', 'robbery', 'extortion'].includes(String(entry.crime))
      || !Array.isArray(entry.evidence) || entry.evidence.length < 1 || entry.evidence.length > 3 || entry.evidence.some(witness => !object(witness) || !exact(witness, ['npc', 'strength']) || typeof witness.npc !== 'string' || !npcOf(witness.npc) || npcOf(witness.npc)!.homeLocation !== entry.location || !int(witness.strength, 1, 100))
      || !['wanted', 'custody', 'sentenced', 'closed'].includes(String(entry.status)) || !int(entry.fine, 0, 10000) || !int(entry.damages, 0, 1000) || entry.jailUntil !== null && !hour(entry.jailUntil)
      || typeof entry.repaid !== 'boolean' || typeof entry.appealed !== 'boolean' || entry.arrestor !== null && !identity(entry.arrestor) || ![null, 'served', 'paid', 'past-life'].includes(entry.closedReason as null)) return false;
    const tag = receipt(entry.accused.user, entry.accused.generation, 'case');
    if (entry.status !== 'closed') { if (active.has(tag)) return false; active.add(tag); }
    if (entry.status === 'sentenced' && entry.jailUntil === null || entry.status === 'closed' && entry.closedReason === null) return false;
  }
  if (new Set(value.cases.map(entry => (entry as FantasyCivicCase).id)).size !== value.cases.length) return false;
  if (Object.entries(value.consents).some(([id, consent]) => !user(id) || !object(consent) || !exact(consent, ['generation', 'session', 'location', 'until']) || !int(consent.generation, 1) || !key(consent.session) || typeof consent.location !== 'string' || !place(consent.location) || !hour(consent.until))) return false;
  if (Object.values(value.cooldowns).some(until => !hour(until))) return false;
  if (Object.entries(value.receipts).some(([id, entry]) => !object(entry) || !exact(entry, ['user', 'generation', 'request', 'hour']) || !user(entry.user) || !int(entry.generation, 1) || !key(entry.request) || !hour(entry.hour) || id !== receipt(entry.user, entry.generation, entry.request))) return false;
  return value.notices.every(entry => object(entry) && exact(entry, ['id', 'hour', 'location', 'text', 'npcs']) && typeof entry.id === 'string' && entry.id.length <= 120 && hour(entry.hour) && typeof entry.location === 'string' && !!place(entry.location)
    && validText(entry.text) && Array.isArray(entry.npcs) && entry.npcs.length <= 3 && entry.npcs.every(npc => typeof npc === 'string' && npcOf(npc)?.homeLocation === entry.location));
}

function schedule(ledger: FantasyCivicLedger, window: number) {
  const daytime = (window * 6) % 24;
  for (const npc of NPC_PUBLIC) {
    const record = ledger.npcs[npc.id], offset = hash(npc.id) % 2;
    record.window = window;
    record.activity = daytime === 0 ? 'sleep' : daytime === 6 && offset ? 'market' : daytime === 18 ? 'visit' : 'work';
    const available = FANTASY_SETTLEMENTS[npc.homeLocation]?.buildingIds ?? [];
    record.building = record.activity === 'sleep' ? 'residence' : record.activity === 'market' && available.includes('market') ? 'market'
      : record.activity === 'visit' && available.includes('inn') ? 'inn' : npc.building;
  }
  for (const location of towns) {
    const locals = NPC_PUBLIC.filter(npc => npc.homeLocation === location).sort((a, b) => a.id.localeCompare(b.id));
    if (locals.length < 2) continue;
    const first = locals[hash(`${location}:${window}`) % locals.length], second = locals[(locals.indexOf(first) + 1) % locals.length];
    const cooperate = hash(`${first.id}:${second.id}:${window}`) % 5 !== 0;
    for (const [a, b] of [[first, second], [second, first]]) {
      const relations = ledger.npcs[a.id].relations;
      if (!Object.hasOwn(relations, b.id) && Object.keys(relations).length >= 8) delete relations[Object.keys(relations)[0]];
      relations[b.id] = bounded((relations[b.id] ?? 0) + (cooperate ? 1 : -1));
    }
    const town = ledger.towns[location];
    town.trust = bounded(town.trust + (cooperate ? 1 : -1));
    if (cooperate) town.projects.provisions++;
    addNotice(ledger, location, window * 6, cooperate
      ? text(`${first.name.ko}와 ${second.name.ko}가 이웃의 물자를 함께 옮겼다.`, `${first.name.en} and ${second.name.en} helped carry their neighbours’ supplies.`, `${first.name.ja}と${second.name.ja}が近所の物資を一緒に運んだ。`)
      : text(`${first.name.ko}와 ${second.name.ko}가 장터 차례를 두고 다퉜다.`, `${first.name.en} and ${second.name.en} argued over their market turns.`, `${first.name.ja}と${second.name.ja}が市の順番でもめた。`), [first.id, second.id]);
    if (town.policy && town.policyUntil <= window * 6) { town.policy = null; town.steward = null; }
  }
  ledger.window = window;
}

export function advanceFantasyCivics(ledger: FantasyCivicLedger, profiles: Record<string, FantasyProfile>, at: number): FantasyCivicChange {
  if (!hour(at) || !validFantasyCivicLedger(ledger)) return { ledger, profiles, changed: false, error: 'invalid' };
  const target = Math.floor(at / 6);
  const pendingConsent = Object.entries(ledger.consents).some(([id, consent]) => !profiles[id]?.character || profiles[id].death || generation(profiles[id]) !== consent.generation || profiles[id].character!.location !== consent.location || consent.until <= at);
  const pendingCase = ledger.cases.some(entry => entry.status !== 'closed' && (!current(entry.accused, profiles) || entry.status === 'sentenced' && entry.jailUntil! <= at));
  if (target <= ledger.window && !pendingConsent && !pendingCase && !Object.values(ledger.cooldowns).some(until => until + 48 < at)) return { ledger, profiles, changed: false };
  const next = structuredClone(ledger), people = structuredClone(profiles); let changed = false;
  if (target > next.window) {
    const first = Math.max(next.window + 1, target - 7);
    for (let step = first; step <= target; step++) { next.revision++; schedule(next, step); }
    changed = true;
  }
  for (const [id, consent] of Object.entries(next.consents)) {
    const p = people[id];
    if (!p?.character || p.death || generation(p) !== consent.generation || p.character.location !== consent.location || consent.until <= at) { delete next.consents[id]; changed = true; }
  }
  for (const entry of next.cases) {
    if (entry.status === 'closed') continue;
    if (!current(entry.accused, people)) { entry.status = 'closed'; entry.closedReason = 'past-life'; entry.jailUntil = null; changed = true; }
    else if (entry.status === 'sentenced' && entry.jailUntil! <= at) {
      entry.status = 'closed'; entry.closedReason = 'served'; entry.jailUntil = null;
      const p = people[entry.accused.user]; p.character!.notoriety = Math.max(0, (p.character!.notoriety ?? 0) - 5); p.revision++;
      record(p, '형기를 마치고 풀려났다.'); changed = true;
    }
  }
  for (const [id, until] of Object.entries(next.cooldowns)) if (until + 48 < at) { delete next.cooldowns[id]; changed = true; }
  if (changed && next.revision === ledger.revision) next.revision++;
  return changed ? { ledger: next, profiles: people, changed: true } : { ledger, profiles, changed: false };
}

export function fantasyCivicActionBlock(ledger: FantasyCivicLedger, profile: FantasyProfile, actor: string, at: number): 'custody' | undefined {
  const entry = activeCase(ledger, actor, profile);
  return entry && (entry.status === 'custody' || entry.status === 'sentenced' && entry.jailUntil! > at) ? 'custody' : undefined;
}
export function fantasyCivicServiceMultiplier(ledger: FantasyCivicLedger, location: string): number {
  const town = ledger.towns[location];
  return town ? Math.round(bounded(1 - town.trust * .0005 + (town.policy === 'extort' ? .08 : town.policy === 'provisions' ? -.04 : 0), .9, 1.2) * 1000) / 1000 : 1;
}
export function fantasyNpcCivicPresence(ledger: FantasyCivicLedger, npc: string): FantasyCivicNpcPresence | undefined { return ledger.npcs[npc] ? structuredClone(ledger.npcs[npc]) : undefined; }
const consenting = (ledger: FantasyCivicLedger, id: string, p: FantasyProfile, at: number, context: FantasyCivicContext) => {
  const consent = ledger.consents[id]; return context.publicSession && !!consent && consent.generation === generation(p) && consent.session === context.session && consent.location === p.character!.location && consent.until > at;
};
const contextValid = (context: FantasyCivicContext) => key(context.session) && typeof context.publicSession === 'boolean' && Array.isArray(context.peers) && context.peers.length <= 200 && context.peers.every(user);
const courthouse = (location: string) => towns.includes(location);

export function fantasyCivicState(ledger: FantasyCivicLedger, profiles: Record<string, FantasyProfile>, actor: string, at: number, context: FantasyCivicContext): FantasyCivicState {
  const p = profiles[actor], location = p?.character?.location ?? null;
  const mine = p ? ledger.cases.filter(entry => entry.accused.user === actor && entry.accused.generation === generation(p)).slice(-12) : [];
  return { revision: ledger.revision, location, hour: at, town: location && ledger.towns[location] ? structuredClone(ledger.towns[location]) : null, serviceMultiplier: location ? fantasyCivicServiceMultiplier(ledger, location) : 1,
    npcs: NPC_PUBLIC.filter(npc => npc.homeLocation === location).map(npc => ({ ...structuredClone(ledger.npcs[npc.id]), names: { ...npc.name }, role: { ...npc.role } })),
    notices: structuredClone(ledger.notices.filter(entry => entry.location === location).slice(-12)),
    ownCases: mine.map(({ accused: _a, arrestor: _b, ...entry }) => structuredClone(entry)),
    wanted: ledger.cases.filter(entry => entry.status === 'wanted' && entry.location === location && current(entry.accused, profiles)).map(entry => ({ ...entry.accused, crime: entry.crime, location: entry.location, bounty: Math.floor(entry.fine / 4) })),
    riskEnabled: !!p?.character && consenting(ledger, actor, p, at, context), riskUntil: ledger.consents[actor]?.until ?? 0,
    peers: !contextValid(context) ? [] : context.peers.filter(id => id !== actor && idle(profiles[id]) && profiles[id].character!.location === location).map(id => ({ user: id, name: profiles[id].character!.name,
      consenting: consenting(ledger, id, profiles[id], at, context), wanted: !!activeCase(ledger, id, profiles[id]) && activeCase(ledger, id, profiles[id])!.status === 'wanted' })),
    actionBlock: p ? fantasyCivicActionBlock(ledger, p, actor, at) : undefined };
}

function crime(ledger: FantasyCivicLedger, profiles: Record<string, FantasyProfile>, actor: string, victim: FantasyCivicCase['victim'], kind: FantasyCivicCrime, location: string, at: number, damages: number) {
  if (ledger.cases.filter(entry => entry.status !== 'closed').length >= 512) return false;
  const witnesses = NPC_PUBLIC.filter(npc => npc.homeLocation === location && (!('npc' in victim) || npc.id !== victim.npc));
  const fallback = 'npc' in victim ? npcOf(victim.npc) : undefined;
  const witness = witnesses[hash(`${actor}:${at}:${kind}`) % Math.max(1, witnesses.length)] ?? fallback;
  if (!witness) return false;
  const liveCases = ledger.cases.filter(entry => entry.status !== 'closed');
  const oldCases = ledger.cases.filter(entry => entry.status === 'closed' && at - entry.createdAt < 24 * 60).slice(-Math.max(0, 511 - liveCases.length));
  ledger.cases = [...(liveCases.length === 511 ? [] : oldCases), ...liveCases].sort((a, b) => a.createdAt - b.createdAt);
  ledger.cases.push({ id: `case-${ledger.revision}-${hash(`${actor}:${at}:${kind}`)}`, accused: person(actor, profiles[actor]), victim, location, createdAt: at, crime: kind,
    evidence: [{ npc: witness.id, strength: kind === 'assault' ? 95 : 85 }], status: 'wanted', fine: kind === 'assault' ? 30 : 15 + damages, damages, jailUntil: null, repaid: false, appealed: false, arrestor: null, closedReason: null });
  profiles[actor].character!.notoriety = Math.min(100, (profiles[actor].character!.notoriety ?? 0) + (kind === 'assault' ? 10 : 5));
  grantFantasyReputation(profiles[actor].character!, -4);
  const name = profiles[actor].character!.name;
  addNotice(ledger, location, at, text(`${name}의 가해 행위를 목격한 증언이 관청에 접수됐다.`, `Witness testimony about ${name}’s offence reached the watch.`, `${name}の加害行為について、目撃証言が役所へ届いた。`), [witness.id]);
  return true;
}

export function applyFantasyCivicCommand(ledger: FantasyCivicLedger, profiles: Record<string, FantasyProfile>, actor: string, command: FantasyCivicCommand, at: number, context: FantasyCivicContext): FantasyCivicChange {
  const fail = (error: FantasyCivicError): FantasyCivicChange => ({ ledger, profiles, changed: false, error });
  if (!validFantasyCivicLedger(ledger) || !isFantasyCivicCommand(command) || !hour(at) || at < Math.max(0, ledger.window * 6) || !contextValid(context)) return fail('invalid');
  if (command.type === 'sync') return advanceFantasyCivics(ledger, profiles, at);
  const original = profiles[actor];
  if (!original?.character || original.death || original.character.hp <= 0) return fail('unavailable');
  const receiptId = receipt(actor, generation(original), command.requestId);
  if (Object.hasOwn(ledger.receipts, receiptId)) return fail('duplicate');
  if (command.revision !== ledger.revision) return fail('stale');
  if (!idle(original)) return fail('busy');
  if (fantasyCivicActionBlock(ledger, original, actor, at) && !['hearing', 'appeal', 'restitution', 'payFine', 'release', 'consent'].includes(command.type)) return fail('custody');
  const next = structuredClone(ledger), people = structuredClone(profiles), p = people[actor], c = p.character!, location = c.location;
  const own = activeCase(next, actor, p);
  const cooldownId = receipt(actor, generation(p), command.type === 'rob' || command.type === 'npcCrime' ? 'crime' : command.type);
  if ((next.cooldowns[cooldownId] ?? 0) > at && ['rob', 'npcCrime', 'govern'].includes(command.type)) return fail('cooldown');
  const touched = new Set([actor]);
  if (command.type === 'consent') {
    if (command.enabled) {
      if (!context.publicSession || !courthouse(location) || !!own) return fail('protected');
      if (!Object.hasOwn(next.consents, actor) && Object.keys(next.consents).length >= 4096) return fail('limit');
      next.consents[actor] = { generation: generation(p), session: context.session, location, until: at + 12 };
    } else delete next.consents[actor];
  } else if (command.type === 'rob') {
    const target = people[command.target];
    if (command.target === actor || !context.peers.includes(command.target) || !idle(target) || target.character!.location !== location || !consenting(next, actor, p, at, context) || !consenting(next, command.target, target, at, context)
      || !!activeCase(next, command.target, target) || !!own || !courthouse(location)) return fail('protected');
    if (target.character!.gold < 1) return fail('unavailable');
    const gain = Math.min(10, Math.max(1, Math.floor(target.character!.gold * .05)));
    const success = (hash(`${actor}:${command.target}:${generation(p)}:${Math.floor(at / 24)}`) % 20) + fantasyStats(c).agility >= 15;
    if (success) { target.character!.gold -= gain; c.gold += gain; touched.add(command.target); record(target, `${c.name}에게 금화 ${gain}G를 빼앗겼다.`); }
    if (!crime(next, people, actor, person(command.target, target), 'robbery', location, at, success ? gain : 0)) return fail('unavailable');
    next.cooldowns[cooldownId] = at + 24;
    if (['thief', 'smuggler', 'assassin', 'bandit', 'spy', 'crimeboss'].includes(c.job)) grantFantasyPractice(c, { key: 'civic:robbery', amount: 3, success });
    record(p, success ? `약탈에 성공했다. G+${gain}. 목격자가 있었다.` : '약탈에 실패했다. 목격자가 있었다.');
  } else if (command.type === 'npcCrime') {
    const target = npcOf(command.npc);
    if (!target || target.homeLocation !== location || !!own || !courthouse(location) || next.cases.filter(entry => entry.status !== 'closed').length >= 512) return fail('unavailable');
    const gain = command.kind === 'theft' ? 4 + hash(`${actor}:${at}`) % 3 : 0;
    if (!crime(next, people, actor, { npc: target.id }, command.kind, location, at, command.kind === 'assault' ? 12 : gain)) return fail('unavailable');
    c.gold += gain;
    if (command.kind === 'assault') c.hp = Math.max(1, c.hp - 3);
    next.cooldowns[cooldownId] = at + 24;
    if (['thief', 'smuggler', 'assassin', 'bandit', 'spy', 'crimeboss'].includes(c.job)) grantFantasyPractice(c, { key: `civic:${command.kind}`, amount: 3, success: true });
    record(p, command.kind === 'theft' ? `${target.name.ko}의 물품을 훔쳤다. G+${gain}. 목격자가 있었다.` : `${target.name.ko}에게 위해를 가했다. 경비가 찾고 있다.`);
  } else if (command.type === 'surrender') {
    if (!own || own.status !== 'wanted') return fail('no-case');
    if (!courthouse(location) || own.location !== location) return fail('unavailable');
    own.status = 'custody'; delete next.consents[actor]; record(p, '관청에 자수하고 심리를 기다린다.');
  } else if (command.type === 'arrest') {
    const target = people[command.target], entry = target && activeCase(next, command.target, target);
    if (!['knight', 'leader', 'scout'].includes(c.job) || !!own || command.target === actor || !context.publicSession || !context.peers.includes(command.target)) return fail('forbidden');
    if (!idle(target) || target.character!.location !== location || !entry || entry.status !== 'wanted' || entry.location !== location) return fail('unavailable');
    entry.status = 'custody'; entry.arrestor = person(actor, p); delete next.consents[command.target]; touched.add(command.target);
    record(target, `${c.name}의 인도로 관청에 구금됐다.`); record(p, `${target.character!.name}를 관청에 인도했다. 현상금은 벌금 납부 때 정산한다.`);
  } else if (command.type === 'hearing' || command.type === 'appeal') {
    if (!own || own.location !== location || !courthouse(location) || command.type === 'hearing' && own.status !== 'custody' || command.type === 'appeal' && (own.status !== 'sentenced' || own.appealed)) return fail('no-case');
    if (command.type === 'appeal') {
      own.appealed = true;
      if (own.repaid) { own.fine = Math.ceil(own.fine / 2); own.jailUntil = Math.min(own.jailUntil!, at + .5); }
      record(p, own.repaid ? '배상 기록이 재심에 반영되어 남은 처분이 줄었다.' : '재심에서 목격 증거가 다시 확인되어 원래 처분이 유지됐다.');
    } else {
      const reduced = command.type === 'hearing' && command.plea === 'admit' || own.repaid;
      own.status = 'sentenced'; own.fine = Math.ceil(own.fine * (reduced ? .75 : 1));
      own.jailUntil = at + (own.crime === 'assault' ? reduced ? 2 : 4 : reduced ? 1 : 2);
      record(p, `심리에서 목격 증거를 확인했다. 벌금 ${own.fine}G 또는 남은 형기로 처분을 마친다.`);
    }
  } else if (command.type === 'restitution') {
    if (!own || own.repaid || own.damages < 1 || own.location !== location || !courthouse(location)) return fail('no-case');
    if (c.gold < own.damages) return fail('insufficient-gold');
    if (!('npc' in own.victim)) {
      const victim = people[own.victim.user];
      if (victim?.character && !victim.death && generation(victim) === own.victim.generation) { victim.character.gold += own.damages; touched.add(own.victim.user); record(victim, `가해자의 배상금 ${own.damages}G를 받았다.`); }
      else next.towns[location].treasury += own.damages;
    } else next.towns[location].treasury += own.damages;
    c.gold -= own.damages; own.repaid = true; c.notoriety = Math.max(0, (c.notoriety ?? 0) - 2); record(p, `피해 ${own.damages}G를 배상했다.`);
  } else if (command.type === 'payFine') {
    if (!own || own.status !== 'sentenced' || own.location !== location) return fail('no-case');
    if (c.gold < own.fine) return fail('insufficient-gold');
    c.gold -= own.fine;
    const award = own.arrestor && current(own.arrestor, people) ? Math.floor(own.fine / 4) : 0;
    if (award && own.arrestor) { people[own.arrestor.user].character!.gold += award; touched.add(own.arrestor.user); record(people[own.arrestor.user], `경비 현상금 ${award}G를 받았다.`); }
    next.towns[location].treasury += own.fine - award;
    own.status = 'closed'; own.closedReason = 'paid'; own.jailUntil = null; c.notoriety = Math.max(0, (c.notoriety ?? 0) - 5); record(p, '벌금을 납부하고 풀려났다.');
  } else if (command.type === 'release') {
    if (!own || own.status !== 'sentenced') return fail('no-case');
    if (own.jailUntil! > at) return fail('wait');
    own.status = 'closed'; own.closedReason = 'served'; own.jailUntil = null; c.notoriety = Math.max(0, (c.notoriety ?? 0) - 5); record(p, '형기를 마치고 풀려났다.');
  } else if (command.type === 'govern') {
    const town = next.towns[location];
    if (!town || !['leader', 'crimeboss'].includes(c.job) || (c.jobXp[c.job] ?? 0) < 30 || !!own) return fail('forbidden');
    if (command.policy === 'extort' && c.job !== 'crimeboss') return fail('forbidden');
    if (c.gold < 12) return fail('insufficient-gold');
    c.gold -= 12; town.treasury += 12; town.policy = command.policy; town.policyUntil = at + 24; town.steward = person(actor, p);
    if (command.policy === 'extort') {
      town.trust = bounded(town.trust - 8); const shift = Math.min(5, town.council); town.council -= shift; town.underworld += shift;
      const victim = NPC_PUBLIC.find(npc => npc.homeLocation === location && npc.building === 'market') ?? NPC_PUBLIC.find(npc => npc.homeLocation === location);
      if (!victim || !crime(next, people, actor, { npc: victim.id }, 'extortion', location, at, 8)) return fail('limit');
      record(p, '뒷골목의 압박으로 조직의 영향력이 커졌다. 주민의 신뢰를 잃었다.');
    } else {
      town.projects[command.policy]++; town.trust = bounded(town.trust + (command.policy === 'festival' ? 4 : 3));
      const shift = Math.min(2, town.underworld); town.underworld -= shift; town[command.policy === 'provisions' ? 'guild' : 'council'] += shift;
      grantFantasyReputation(c, 2); record(p, '마을의 공동 사업에 자금을 내고 주민과 함께 마쳤다.');
    }
    next.cooldowns[cooldownId] = at + 24;
    grantFantasyPractice(c, { key: `civic:${command.policy}`, amount: 3, success: true, practice: 'command' });
    addNotice(next, location, at, command.policy === 'extort'
      ? text(`${c.name}의 조직이 장터를 압박해 물가가 올랐다.`, `${c.name}’s organisation pressured the market and prices rose.`, `${c.name}の組織が市に圧力をかけ、物価が上がった。`)
      : text(`${c.name}가 이웃과 함께 마을 사업을 마쳤다.`, `${c.name} completed a town project with the neighbours.`, `${c.name}が住人と一緒に街の事業を終えた。`));
  }
  for (const id of touched) people[id].revision++;
  next.revision++;
  next.receipts[receiptId] = { user: actor, generation: generation(p), request: command.requestId, hour: at };
  const ids = Object.keys(next.receipts); for (const old of ids.slice(0, Math.max(0, ids.length - 4096))) delete next.receipts[old];
  if (!validFantasyCivicLedger(next)) return fail('invalid');
  return { ledger: next, profiles: people, changed: true };
}

export function fantasyCivicText(error: string, locale: NpcLocale): string {
  const messages: Record<string, Text> = {
    invalid: text('잘못된 요청입니다.', 'Invalid request.', '無効な依頼です。'), unavailable: text('지금 이곳에서 할 수 없습니다.', 'Unavailable here now.', 'いまここでは行えません。'),
    stale: text('기록이 바뀌었습니다. 다시 확인하세요.', 'The record changed. Refresh it.', '記録が変わりました。確認し直してください。'), busy: text('현재 행동이나 사건을 먼저 마쳐 주세요.', 'Finish the current activity or encounter first.', 'いまの行動や出来事を先に終えてください。'),
    protected: text('서로 위험에 동의한 같은 장소의 상대만 가능합니다.', 'Both people must consent to danger in the same place.', '同じ場所で双方が危険に同意する必要があります。'),
    cooldown: text('다시 행동하려면 시간이 더 필요합니다.', 'More time must pass before trying again.', '再び行うには、もう少し時間が必要です。'),
    'insufficient-gold': text('금화가 부족합니다.', 'Not enough gold.', '金貨が足りません。'), forbidden: text('이 일을 맡을 권한이 없습니다.', 'You cannot hold this responsibility.', 'この役目を担う権限がありません。'),
    'no-case': text('처리할 해당 사건이 없습니다.', 'There is no matching case to handle.', '扱える該当事件がありません。'), custody: text('관청에서 처분을 마친 뒤 행동할 수 있습니다.', 'Resolve your custody at the watch before acting.', '役所で処分を終えてから行動できます。'),
    wait: text('아직 정해진 시간이 지나지 않았습니다.', 'The appointed time has not passed.', 'まだ決められた時間が過ぎていません。'), duplicate: text('이미 처리한 요청입니다.', 'This request was already handled.', '処理済みの依頼です。'), limit: text('더 이상 기록을 추가할 수 없습니다.', 'No more records can be added now.', 'いまはこれ以上記録を追加できません。'),
  };
  return messages[error]?.[locale] ?? error;
}

export function fantasyCivicLogText(source: string, locale: NpcLocale): string | undefined {
  const fixed: Record<string, Text> = {
    '형기를 마치고 풀려났다.': text('형기를 마치고 풀려났다.', 'The sentence ended and you were released.', '刑期を終えて釈放された。'),
    '약탈에 실패했다. 목격자가 있었다.': text('약탈에 실패했다. 목격자가 있었다.', 'The robbery failed. There was a witness.', '略奪に失敗した。目撃者がいた。'),
    '관청에 자수하고 심리를 기다린다.': text('관청에 자수하고 심리를 기다린다.', 'You surrendered to the watch and await a hearing.', '役所へ自首し、審理を待っている。'),
    '배상 기록이 재심에 반영되어 남은 처분이 줄었다.': text('배상 기록이 재심에 반영되어 남은 처분이 줄었다.', 'Restitution was considered at the rehearing and the remaining sentence was reduced.', '弁償の記録が再審で考慮され、残る処分が軽くなった。'),
    '재심에서 목격 증거가 다시 확인되어 원래 처분이 유지됐다.': text('재심에서 목격 증거가 다시 확인되어 원래 처분이 유지됐다.', 'The rehearing confirmed the eyewitness evidence and upheld the original sentence.', '再審で目撃証拠が再確認され、元の処分が維持された。'),
    '벌금을 납부하고 풀려났다.': text('벌금을 납부하고 풀려났다.', 'You paid the fine and were released.', '罰金を払い、釈放された。'),
    '뒷골목의 압박으로 조직의 영향력이 커졌다. 주민의 신뢰를 잃었다.': text('뒷골목의 압박으로 조직의 영향력이 커졌다. 주민의 신뢰를 잃었다.', 'Underworld pressure increased your organisation’s influence and cost public trust.', '裏社会の圧力で組織の影響力が増したが、住民の信頼を失った。'),
    '마을의 공동 사업에 자금을 내고 주민과 함께 마쳤다.': text('마을의 공동 사업에 자금을 내고 주민과 함께 마쳤다.', 'You funded a civic project and completed it with the residents.', '街の共同事業に資金を出し、住人と一緒に仕上げた。'),
  };
  if (fixed[source]) return fixed[source][locale];
  let match: RegExpMatchArray | null;
  const name = (source: string) => NPC_PUBLIC.find(npc => npc.name.ko === source)?.name[locale] ?? source;
  if ((match = source.match(/^(.+)에게 금화 (\d+)G를 빼앗겼다\.$/))) return text(source, `${name(match[1])} took ${match[2]}G from you.`, `${name(match[1])}に金貨${match[2]}Gを奪われた。`)[locale];
  if ((match = source.match(/^약탈에 성공했다\. G\+(\d+)\. 목격자가 있었다\.$/))) return text(source, `The robbery succeeded. G+${match[1]}. There was a witness.`, `略奪に成功した。G+${match[1]}。目撃者がいた。`)[locale];
  if ((match = source.match(/^(.+)의 물품을 훔쳤다\. G\+(\d+)\. 목격자가 있었다\.$/))) return text(source, `You stole from ${name(match[1])}. G+${match[2]}. There was a witness.`, `${name(match[1])}の品を盗んだ。G+${match[2]}。目撃者がいた。`)[locale];
  if ((match = source.match(/^(.+)에게 위해를 가했다\. 경비가 찾고 있다\.$/))) return text(source, `You harmed ${name(match[1])}. The watch is looking for you.`, `${name(match[1])}に危害を加えた。警備が捜している。`)[locale];
  if ((match = source.match(/^(.+)의 인도로 관청에 구금됐다\.$/))) return text(source, `${name(match[1])} brought you into the watch’s custody.`, `${name(match[1])}の引き渡しで役所に拘束された。`)[locale];
  if ((match = source.match(/^(.+)를 관청에 인도했다\. 현상금은 벌금 납부 때 정산한다\.$/))) return text(source, `You brought ${name(match[1])} to the watch. A bounty is settled from the paid fine.`, `${name(match[1])}を役所へ引き渡した。報奨は罰金納付時に精算される。`)[locale];
  if ((match = source.match(/^심리에서 목격 증거를 확인했다\. 벌금 (\d+)G 또는 남은 형기로 처분을 마친다\.$/))) return text(source, `The hearing confirmed eyewitness evidence. Pay ${match[1]}G or serve the remaining sentence.`, `審理で目撃証拠を確認した。罰金${match[1]}Gを払うか、残る刑期を終える。`)[locale];
  if ((match = source.match(/^가해자의 배상금 (\d+)G를 받았다\.$/))) return text(source, `You received ${match[1]}G in restitution.`, `加害者の弁償金${match[1]}Gを受け取った。`)[locale];
  if ((match = source.match(/^피해 (\d+)G를 배상했다\.$/))) return text(source, `You paid ${match[1]}G in restitution.`, `被害${match[1]}Gを弁償した。`)[locale];
  if ((match = source.match(/^경비 현상금 (\d+)G를 받았다\.$/))) return text(source, `You received a watch bounty of ${match[1]}G.`, `警備の報奨金${match[1]}Gを受け取った。`)[locale];
  return undefined;
}
