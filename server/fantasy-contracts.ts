import fs from 'node:fs';
import path from 'node:path';
import { randomUUID } from 'node:crypto';
import type { FantasyCharacter, FantasyProfile, FantasyResult } from '../shared/fantasy.ts';
import { FANTASY_LOCATIONS, FANTASY_QUESTS } from '../shared/fantasy-data.ts';
import { NPC_PUBLIC } from '../shared/npc.ts';
import { fantasyEnvironment } from '../shared/fantasy-environment.ts';
import {
  FANTASY_CONTRACT_CYCLE, FANTASY_CONTRACT_DEADLINE_HOURS, FANTASY_CONTRACT_POST_HOURS, fantasyCanClaimContract, fantasyCanViewContracts,
  fantasyContractBounty, fantasyContractCandidates, fantasyContractHash, fantasyContractIssuer, fantasyContractMode,
  type FantasyContractBoard, type FantasyContractError, type FantasyContractGrant, type FantasyContractOffer, type FantasyContractRequest,
} from '../shared/fantasy-contracts.ts';

export interface FantasyContractActor { id: string; session: string | null; world?: string; character?: FantasyCharacter }
interface Claim { phase: 'pending' | 'accepted'; grant: FantasyContractGrant }
interface Offer extends FantasyContractOffer { claims: Record<string, Claim> }
interface Saved { version: 1; revision: number; generated: Record<string, number>; offers: Offer[]; pressure: Record<string, { value: number; hour: number }>; hunts: string[] }
interface Options { save?: (file: string, text: string) => void; lookup?: (user: string) => FantasyProfile | undefined; onError?: (error: unknown) => void }
const record = (value: unknown): value is Record<string, unknown> => !!value && typeof value === 'object' && !Array.isArray(value);
const hour = (value: unknown): value is number => typeof value === 'number' && Number.isFinite(value) && value >= 0;
const count = (value: unknown): value is number => Number.isSafeInteger(value) && Number(value) >= 0;
const place = (id: unknown): boolean => typeof id === 'string' && FANTASY_LOCATIONS.some(place => place.id === id);
const member = (entries: Record<string, Claim>, user: string) => Object.hasOwn(entries, user) ? entries[user] : undefined;
function valid(value: unknown): value is Saved {
  if (!record(value) || value.version !== 1 || !count(value.revision) || !record(value.generated) || !record(value.pressure) || !Array.isArray(value.hunts) || value.hunts.length > 2048 || !Array.isArray(value.offers)) return false;
  if (Object.entries(value.generated).some(([id, cycle]) => !place(id) || !count(cycle)) || Object.entries(value.pressure).some(([id, pressure]) => !place(id) || !record(pressure) || !count(pressure.value) || pressure.value > 100 || !hour(pressure.hour))) return false;
  if (new Set(value.hunts).size !== value.hunts.length || value.hunts.some(id => typeof id !== 'string' || !/^[a-zA-Z0-9:._-]{1,160}$/.test(id))) return false;
  if (new Set(value.offers.map(offer => record(offer) ? offer.id : undefined)).size !== value.offers.length) return false;
  return value.offers.every(offer => {
    if (!record(offer) || typeof offer.id !== 'string' || !/^offer-[a-z0-9-]{1,75}$/.test(offer.id) || !place(offer.boardLocation)
      || !FANTASY_QUESTS.some(quest => quest.id === offer.quest && NPC_PUBLIC.some(npc => npc.id === offer.issuer && npc.homeLocation === quest.giver))
      || !['exclusive', 'raid'].includes(String(offer.mode)) || !hour(offer.createdAt) || !hour(offer.expiresAt) || !hour(offer.deadline)
      || offer.expiresAt !== offer.createdAt + FANTASY_CONTRACT_POST_HOURS || offer.deadline !== offer.createdAt + FANTASY_CONTRACT_DEADLINE_HOURS
      || !count(offer.gold) || !record(offer.claims) || offer.mode === 'exclusive' && Object.keys(offer.claims).length > 1) return false;
    const quest = FANTASY_QUESTS.find(quest => quest.id === offer.quest)!;
    if (offer.mode !== fantasyContractMode(quest) || offer.gold > Math.ceil(quest.gold * 1.5)) return false;
    return Object.values(offer.claims).every(claim => record(claim) && ['pending', 'accepted'].includes(String(claim.phase)) && record(claim.grant)
      && claim.grant.offerId === offer.id && claim.grant.issuer === offer.issuer && claim.grant.boardLocation === offer.boardLocation
      && hour(claim.grant.acceptedAt) && claim.grant.acceptedAt >= Number(offer.createdAt) && claim.grant.acceptedAt < Number(offer.expiresAt)
      && claim.grant.expiresAt === offer.deadline && count(claim.grant.progress) && claim.grant.progress <= (quest.objective?.type === 'hunt' ? quest.objective.count : 0) && claim.grant.gold === offer.gold);
  });
}
function saveAtomic(file: string, text: string) {
  fs.mkdirSync(path.dirname(file), { recursive: true }); const temporary = `${file}.${randomUUID()}.tmp`;
  try { fs.writeFileSync(temporary, text, { encoding: 'utf8', flag: 'wx' }); fs.renameSync(temporary, file); }
  finally { try { fs.unlinkSync(temporary); } catch (error) { if ((error as NodeJS.ErrnoException).code !== 'ENOENT') throw error; } }
}

export class FantasyContracts {
  private data: Saved = { version: 1, revision: 0, generated: {}, offers: [], pressure: {}, hunts: [] };
  private save: NonNullable<Options['save']>; private lookup?: Options['lookup']; private onError: NonNullable<Options['onError']>;
  private saveError?: string;
  private inFlight = new Set<string>();
  readonly loadError?: string;
  get error(): string | undefined { return this.loadError ?? this.saveError; }
  constructor(private file: string, options: Options = {}) {
    this.save = options.save ?? saveAtomic; this.lookup = options.lookup; this.onError = options.onError ?? (error => console.error('[fantasy-contracts]', error));
    try { const saved: unknown = JSON.parse(fs.readFileSync(file, 'utf8')); if (!valid(saved)) throw new Error('Invalid shared quest board save'); this.data = saved; }
    catch (error) { if ((error as NodeJS.ErrnoException).code !== 'ENOENT') { this.loadError = 'unavailable'; this.onError(error); } }
    if (!this.loadError) this.reconcile();
  }
  private persist(next: Saved): boolean {
    if (this.loadError) return false;
    try { this.save(this.file, JSON.stringify(next)); this.data = next; this.saveError = undefined; return true; }
    catch (error) { this.saveError = 'unavailable'; this.onError(error); return false; }
  }
  reconcile(): boolean {
    if (!this.lookup || this.loadError) return !this.loadError;
    const next = structuredClone(this.data); let changed = false;
    for (const offer of next.offers) for (const [user, claim] of Object.entries(offer.claims)) {
      if (claim.phase !== 'pending') continue;
      if (this.inFlight.has(JSON.stringify([offer.id, user]))) continue;
      const profile = this.lookup(user);
      if (!profile) { this.saveError = 'unavailable'; return false; }
      const contract = (profile.character as (FantasyCharacter & { contracts?: Record<string, FantasyContractGrant> }) | null)?.contracts?.[offer.quest];
      if (contract?.offerId === offer.id || profile.character?.completed.includes(offer.quest)) claim.phase = 'accepted';
      else delete offer.claims[user];
      changed = true;
    }
    if (!changed) return true;
    next.revision++; return this.persist(next);
  }
  private actorValid(actor: FantasyContractActor): actor is FantasyContractActor & { character: FantasyCharacter } {
    return !!actor.session && actor.world === 'fantasy' && !!actor.character && actor.character.hp > 0 && place(actor.character.location);
  }
  private pressure(location: string, now: number): number {
    const prior = this.data.pressure[location];
    return prior ? Math.min(50, prior.value + Math.max(0, Math.floor((now - prior.hour) / FANTASY_CONTRACT_CYCLE)) * 2) : 50;
  }
  state(actor: FantasyContractActor, now: number): FantasyContractBoard | null {
    if (!this.actorValid(actor) || !hour(now)) return null;
    const c = actor.character; const environment = fantasyEnvironment({ ...c, hour: now });
    const pressure = this.pressure(c.location, now);
    if (!this.loadError && fantasyCanViewContracts(c)) {
      const cycle = Math.floor(now / FANTASY_CONTRACT_CYCLE);
      if ((this.data.generated[c.location] ?? -1) < cycle) {
        const next = structuredClone(this.data); const start = cycle * FANTASY_CONTRACT_CYCLE;
        const existing = next.offers.filter(offer => offer.boardLocation === c.location && offer.expiresAt > now);
        const vacancies = Math.max(0, 3 - existing.filter(offer => offer.mode === 'raid' || !Object.keys(offer.claims).length).length);
        const selected = fantasyContractCandidates(c.location, start, environment.season, (environment as { seasonDay?: number }).seasonDay ?? 1)
          .filter(quest => !existing.some(offer => offer.quest === quest.id))
          // 同じ周期と地域では全員に同じ抽選を適用する。既存の掲示・受注は変えない。
          .filter(quest => quest.objective?.type !== 'hunt'
            || fantasyContractHash(`hunt-post:${c.location}:${cycle}:${quest.id}`) / 4294967296 < this.pressure(quest.destination, now) / 50)
          .slice(0, vacancies);
        for (const quest of selected) {
          const id = `offer-${c.location}-${cycle}-${fantasyContractHash(quest.id).toString(16)}`;
          if (next.offers.some(offer => offer.id === id)) continue;
          const hunt = !!(quest as { objective?: { type?: string } }).objective && (quest as { objective?: { type?: string } }).objective?.type === 'hunt';
          next.offers.push({ id, quest: quest.id, boardLocation: c.location, issuer: fantasyContractIssuer(quest)!, createdAt: start,
            expiresAt: start + FANTASY_CONTRACT_POST_HOURS, deadline: start + FANTASY_CONTRACT_DEADLINE_HOURS,
            mode: fantasyContractMode(quest), gold: Math.max(1, Math.floor(quest.gold * (hunt ? fantasyContractBounty(this.pressure(quest.destination, now)) : 1))), claims: {} });
        }
        next.generated[c.location] = cycle;
        next.offers = next.offers.filter(offer => offer.deadline > now || offer.createdAt > now - 48);
        next.revision++; this.persist(next);
      }
    }
    return { revision: this.data.revision, hour: now, location: c.location, environment: { ...environment, monsterPressure: pressure, bountyMultiplier: fantasyContractBounty(pressure) },
      offers: !fantasyCanViewContracts(c) ? [] : this.data.offers.filter(offer => offer.boardLocation === c.location && now < offer.expiresAt && fantasyCanClaimContract(c, offer, now)).map(offer => {
        const own = member(offer.claims, actor.id); const participants = Object.keys(offer.claims).length;
        return { id: offer.id, quest: offer.quest, boardLocation: offer.boardLocation, issuer: offer.issuer, createdAt: offer.createdAt, expiresAt: offer.expiresAt, deadline: offer.deadline, mode: offer.mode, gold: offer.gold,
          mine: !!own, participants, available: !own && (offer.mode === 'raid' || participants === 0) };
      }),
    };
  }
  claim(actor: FantasyContractActor, request: FantasyContractRequest, now: number, apply: (grant: FantasyContractGrant) => FantasyResult): { result?: FantasyResult; error?: FantasyContractError; pending?: boolean } {
    if (this.loadError || !this.reconcile()) return { error: 'unavailable' };
    if (!this.actorValid(actor) || !request || typeof request.offer !== 'string' || typeof request.quest !== 'string' || !hour(now)) return { error: 'invalid' };
    if (!fantasyCanViewContracts(actor.character)) return { error: 'guildOnly' };
    this.state(actor, now);
    const offer = this.data.offers.find(offer => offer.id === request.offer && offer.quest === request.quest);
    if (!offer || now >= offer.expiresAt) return { error: 'expired' };
    if (member(offer.claims, actor.id)) return { error: 'already' };
    if (!fantasyCanClaimContract(actor.character, offer, now)) return { error: 'conditions' };
    if (offer.mode === 'exclusive' && Object.keys(offer.claims).length) return { error: 'taken' };
    const grant: FantasyContractGrant = { offerId: offer.id, issuer: offer.issuer, boardLocation: offer.boardLocation, acceptedAt: now, expiresAt: offer.deadline, progress: 0, gold: offer.gold };
    const pending = structuredClone(this.data); const target = pending.offers.find(candidate => candidate.id === offer.id)!;
    const claims = new Map(Object.entries(target.claims)); claims.set(actor.id, { phase: 'pending', grant }); target.claims = Object.fromEntries(claims);
    const transaction = JSON.stringify([offer.id, actor.id]); this.inFlight.add(transaction);
    pending.revision++; if (!this.persist(pending)) { this.inFlight.delete(transaction); return { error: 'unavailable' }; }
    let result: FantasyResult;
    try { result = apply(structuredClone(grant)); }
    catch (error) { this.inFlight.delete(transaction); this.onError(error); this.reconcile(); return { error: 'unavailable' }; }
    const committed = structuredClone(this.data); const final = committed.offers.find(candidate => candidate.id === offer.id)!;
    if (!result.changed || result.error) delete final.claims[actor.id];
    else final.claims[actor.id].phase = 'accepted';
    committed.revision++;
    const saved = this.persist(committed); this.inFlight.delete(transaction);
    if (!saved) return { result, error: 'unavailable', pending: true };
    return { result };
  }
  release(user: string, offerId: string): boolean {
    const next = structuredClone(this.data); const offer = next.offers.find(offer => offer.id === offerId);
    if (!offer || !member(offer.claims, user)) return true;
    delete offer.claims[user]; next.revision++; return this.persist(next);
  }
  progress(user: string, offerId: string): number | undefined {
    const offer = this.data.offers.find(offer => offer.id === offerId && offer.mode === 'raid');
    const quest = offer && FANTASY_QUESTS.find(quest => quest.id === offer.quest);
    // 採集や制作の個人実績を、共同討伐の進行で上書きしない。
    return quest?.objective?.type === 'hunt' ? offer && member(offer.claims, user)?.grant.progress : undefined;
  }
  recordHunt(actor: FantasyContractActor, amount: number, now: number, receipt: string, monster?: string): boolean {
    if (!this.actorValid(actor) || !Number.isSafeInteger(amount) || amount <= 0 || amount > 100 || !hour(now) || typeof receipt !== 'string' || !/^[a-zA-Z0-9:._-]{1,160}$/.test(receipt)) return false;
    if (this.data.hunts.includes(receipt)) return true;
    const next = structuredClone(this.data);
    next.pressure[actor.character.location] = { value: Math.max(0, this.pressure(actor.character.location, now) - amount * 2), hour: now };
    for (const offer of next.offers) {
      if (offer.mode !== 'raid' || now >= offer.deadline || member(offer.claims, actor.id)?.phase !== 'accepted') continue;
      const quest = FANTASY_QUESTS.find(quest => quest.id === offer.quest);
      if (quest?.objective?.type !== 'hunt' || quest.destination !== actor.character.location || quest.objective.monster && quest.objective.monster !== monster) continue;
      for (const claim of Object.values(offer.claims)) if (claim.phase === 'accepted') claim.grant.progress = Math.min(quest.objective.count, claim.grant.progress + amount);
    }
    next.hunts = [...next.hunts, receipt].slice(-2048); next.revision++; return this.persist(next);
  }
}
