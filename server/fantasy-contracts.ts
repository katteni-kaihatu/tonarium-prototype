import { fantasyCombatEnemy } from '../shared/fantasy-combat-catalog.ts';
import fs from 'node:fs';
import path from 'node:path';
import { createHash, randomUUID } from 'node:crypto';
import type { FantasyCharacter, FantasyProfile, FantasyQuest, FantasyResult } from '../shared/fantasy.ts';
import { FANTASY_LOCATIONS, FANTASY_QUESTS } from '../shared/fantasy-data.ts';
import { fantasyQuestGrade } from '../shared/fantasy-quest-grades.ts';
import { fantasyRegisteredGuildGrade } from '../shared/fantasy-guild-progression.ts';
import { fantasyQuestInstitution, fantasyInstitutionPresent } from '../shared/fantasy-institutions.ts';
import { NPC_PUBLIC } from '../shared/npc.ts';
import { fantasyEnvironment } from '../shared/fantasy-environment.ts';
import {
  FANTASY_CONTRACT_CYCLE, FANTASY_CONTRACT_DEADLINE_HOURS, FANTASY_CONTRACT_POST_HOURS, FANTASY_CONTRACT_RAID_DELAY_HOURS, FANTASY_CONTRACT_RAID_PARTICIPANTS, FANTASY_CONTRACT_RAID_WAITING_DEADLINE, fantasyCanClaimContract, fantasyCanViewContracts,
  fantasyContractBounty, fantasyContractCandidates, fantasyContractHash, fantasyContractHunt, fantasyContractIssuer, fantasyContractMode, fantasyContractPostingChance,
  type FantasyContractBoard, type FantasyContractError, type FantasyContractGrant, type FantasyContractOffer, type FantasyContractRequest, type FantasyContractVisibleOffer,
} from '../shared/fantasy-contracts.ts';

export interface FantasyContractActor { id: string; session: string | null; world?: string; character?: FantasyCharacter }
interface Claim { phase: 'pending' | 'accepted'; grant: FantasyContractGrant }
interface Offer extends FantasyContractOffer { claims: Record<string, Claim> }
interface Saved { version: 1 | 2; revision: number; generated: Record<string, number>; offers: Offer[]; pressure: Record<string, { value: number; hour: number }>; hunts: string[] }
interface Options { save?: (file: string, text: string) => void; lookup?: (user: string) => FantasyProfile | undefined; onError?: (error: unknown) => void }
const record = (value: unknown): value is Record<string, unknown> => !!value && typeof value === 'object' && !Array.isArray(value);
const hour = (value: unknown): value is number => typeof value === 'number' && Number.isFinite(value) && value >= 0;
const count = (value: unknown): value is number => Number.isSafeInteger(value) && Number(value) >= 0;
const place = (id: unknown): boolean => typeof id === 'string' && FANTASY_LOCATIONS.some(place => place.id === id);
const member = (entries: Record<string, Claim>, user: string) => Object.hasOwn(entries, user) ? entries[user] : undefined;
function valid(value: unknown): value is Saved {
  if (!record(value) || (value.version !== 1 && value.version !== 2) || !count(value.revision) || !record(value.generated) || !record(value.pressure) || !Array.isArray(value.hunts) || value.hunts.length > 2048 || !Array.isArray(value.offers)) return false;
  if (Object.entries(value.generated).some(([id, cycle]) => !place(id) || !count(cycle)) || Object.entries(value.pressure).some(([id, pressure]) => !place(id) || !record(pressure) || !count(pressure.value) || pressure.value > 100 || !hour(pressure.hour))) return false;
  if (new Set(value.hunts).size !== value.hunts.length || value.hunts.some(id => typeof id !== 'string' || !/^[a-zA-Z0-9:._-]{1,160}$/.test(id))) return false;
  if (new Set(value.offers.map(offer => record(offer) ? offer.id : undefined)).size !== value.offers.length) return false;
  return value.offers.every(offer => {
    if (!record(offer) || typeof offer.id !== 'string' || !/^offer-[a-z0-9-]{1,75}$/.test(offer.id) || !place(offer.boardLocation)
      || !FANTASY_QUESTS.some(quest => quest.id === offer.quest && NPC_PUBLIC.some(npc => npc.id === offer.issuer && npc.homeLocation === quest.giver))
      || !['exclusive', 'raid'].includes(String(offer.mode)) || !hour(offer.createdAt) || !hour(offer.expiresAt) || !hour(offer.deadline)
      || Number(offer.expiresAt) <= Number(offer.createdAt) || Number(offer.deadline) < Number(offer.expiresAt)
      || value.version === 1 && (offer.expiresAt !== offer.createdAt + 12 || offer.deadline !== offer.createdAt + FANTASY_CONTRACT_DEADLINE_HOURS)
      || offer.grade !== undefined && (!count(offer.grade) || offer.grade < 1 || offer.grade > 8)
      || offer.startsAt !== undefined && (!hour(offer.startsAt) || Number(offer.startsAt) <= Number(offer.createdAt) || offer.mode !== 'raid')
      || offer.startedAt !== undefined && (!hour(offer.startedAt) || !hour(offer.startsAt) || offer.startedAt < offer.startsAt)
      || offer.monster !== undefined && typeof offer.monster !== 'string'
      || offer.enemyCount !== undefined && (!count(offer.enemyCount) || offer.enemyCount < 1 || offer.enemyCount > 6)
      || offer.recipient !== undefined && (typeof offer.recipient !== 'string' || !offer.recipient.length || offer.recipient.length > 200 || offer.mode !== 'exclusive')
      || !count(offer.gold) || !record(offer.claims) || offer.mode === 'exclusive' && Object.keys(offer.claims).length > 1) return false;
    const quest = FANTASY_QUESTS.find(quest => quest.id === offer.quest)!;
    if (offer.mode !== fantasyContractMode(quest) || offer.gold > Math.ceil(quest.gold * 1.5)) return false;
    return Object.values(offer.claims).every(claim => {
      if (!record(claim) || !['pending', 'accepted'].includes(String(claim.phase)) || !record(claim.grant)) return false;
      const grant = claim.grant;
      return grant.offerId === offer.id && grant.issuer === offer.issuer && grant.boardLocation === offer.boardLocation
      && hour(grant.acceptedAt) && grant.acceptedAt >= Number(offer.createdAt) && grant.acceptedAt < Number(offer.deadline)
      && ['grade', 'startsAt', 'startedAt', 'monster', 'enemyCount'].every(key => grant[key] === undefined || grant[key] === offer[key])
      && grant.expiresAt === offer.deadline && count(grant.progress) && grant.progress <= (quest.objective?.type === 'hunt' ? quest.objective.count : 0) && grant.gold === offer.gold;
    });
  });
}
function fantasyCanClaimContractTarget(quest: FantasyQuest): boolean {
  const objective = quest.objective;
  return objective?.type !== 'hunt' || !!objective.monster&&fantasyCombatEnemy(objective.monster)?.kind==='monster'&&fantasyCombatEnemy(objective.monster)!.tier<=7;
}
function migrate(saved: Saved): Saved {
  if (saved.version === 2) {
    const next = structuredClone(saved); let changed = false;
    for (const offer of next.offers) {
      const quest = FANTASY_QUESTS.find(quest => quest.id === offer.quest)!;
      const grade = fantasyQuestGrade(quest);
      if (offer.grade !== grade) { offer.grade = grade; changed = true; }
      for (const claim of Object.values(offer.claims)) if (claim.grant.grade !== grade) { claim.grant.grade = grade; changed = true; }
    }
    if (changed) next.revision++;
    return next;
  }
  const next = structuredClone(saved); next.version = 2; next.generated = {};
  for (const offer of next.offers) {
    const quest = FANTASY_QUESTS.find(quest => quest.id === offer.quest)!;
    Object.assign(offer, fantasyContractHunt(quest), { grade: fantasyQuestGrade(quest) });
    if (offer.mode === 'raid' && quest.objective?.type === 'hunt'
      && (fantasyCanClaimContractTarget(quest) || Object.keys(offer.claims).length > 0)) {
      offer.startsAt = offer.createdAt + FANTASY_CONTRACT_RAID_DELAY_HOURS;
      offer.expiresAt = FANTASY_CONTRACT_RAID_WAITING_DEADLINE; offer.deadline = FANTASY_CONTRACT_RAID_WAITING_DEADLINE;
    } else offer.expiresAt = (Math.floor(offer.createdAt / FANTASY_CONTRACT_CYCLE) + 1) * FANTASY_CONTRACT_CYCLE;
    for (const claim of Object.values(offer.claims)) Object.assign(claim.grant, {
      expiresAt: offer.deadline, grade: offer.grade, startsAt: offer.startsAt, monster: offer.monster, enemyCount: offer.enemyCount,
    });
  }
  next.revision++; return next;
}
export interface FantasyRaidSnapshot { offer: FantasyContractOffer; quest: FantasyQuest; participants: string[] }
const waitingRaid = (offer: FantasyContractOffer) => offer.mode === 'raid' && offer.startsAt !== undefined && offer.startedAt === undefined;
function saveAtomic(file: string, text: string) {
  fs.mkdirSync(path.dirname(file), { recursive: true }); const temporary = `${file}.${randomUUID()}.tmp`;
  try { fs.writeFileSync(temporary, text, { encoding: 'utf8', flag: 'wx' }); fs.renameSync(temporary, file); }
  finally { try { fs.unlinkSync(temporary); } catch (error) { if ((error as NodeJS.ErrnoException).code !== 'ENOENT') throw error; } }
}

export class FantasyContracts {
  private data: Saved = { version: 2, revision: 0, generated: {}, offers: [], pressure: {}, hunts: [] };
  private save: NonNullable<Options['save']>; private lookup?: Options['lookup']; private onError: NonNullable<Options['onError']>;
  private saveError?: string;
  private inFlight = new Set<string>();
  readonly loadError?: string;
  get error(): string | undefined { return this.loadError ?? this.saveError; }
  constructor(private file: string, options: Options = {}) {
    this.save = options.save ?? saveAtomic; this.lookup = options.lookup; this.onError = options.onError ?? (error => console.error('[fantasy-contracts]', error));
    try { const saved: unknown = JSON.parse(fs.readFileSync(file, 'utf8')); if (!valid(saved)) throw new Error('Invalid shared quest board save'); this.data = migrate(saved); }
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
  /** 指名依頼も通常の予約・受注保存を通す。一日一人一件で再抽選しない。 */
  namedCommission(actor: FantasyContractActor, now: number, day: number): FantasyContractVisibleOffer | undefined {
    if (this.loadError || !this.reconcile() || !this.actorValid(actor) || !hour(now) || !count(day) || day !== Math.floor(now / 24)) return undefined;
    const c = actor.character, rank = fantasyRegisteredGuildGrade(c), daytime = now % 24;
    if (rank < 3 || daytime < 6 || daytime >= 18 || !fantasyCanViewContracts(c)) return undefined;
    const id = `offer-named-${createHash('sha256').update(actor.id).digest('hex').slice(0, 32)}-${day}`;
    const visible = (offer: Offer): FantasyContractVisibleOffer => {
      const { claims: _claims, ...snapshot } = offer;
      const own = member(offer.claims, actor.id);
      return { ...structuredClone(snapshot), participants: Object.keys(offer.claims).length, mine: own?.phase === 'accepted',
        available: !own && fantasyCanClaimContract(c, offer, now) && !Object.keys(offer.claims).length };
    };
    const existing = this.data.offers.find(offer => offer.id === id && offer.recipient === actor.id);
    if (existing) {
      const quest = FANTASY_QUESTS.find(quest => quest.id === existing.quest);
      return quest && fantasyQuestInstitution(quest) === 'guild' ? visible(existing) : undefined;
    }
    const environment = fantasyEnvironment({ ...c, hour: now });
    const candidates = fantasyContractCandidates(c.location, now, environment.season, (environment as { seasonDay?: number }).seasonDay ?? 1)
      .filter(quest => fantasyQuestInstitution(quest) === 'guild' && fantasyQuestGrade(quest) === rank && fantasyContractMode(quest) === 'exclusive' && fantasyCanClaimContractTarget(quest))
      .sort((a, b) => fantasyContractHash(`named:${actor.id}:${day}:${a.id}`) - fantasyContractHash(`named:${actor.id}:${day}:${b.id}`));
    for (const quest of candidates) {
      const offer: Offer = { id, quest: quest.id, boardLocation: c.location, issuer: fantasyContractIssuer(quest)!, recipient: actor.id,
        createdAt: now, expiresAt: (day + 1) * 24, deadline: now + FANTASY_CONTRACT_DEADLINE_HOURS,
        ...fantasyContractHunt(quest), grade: fantasyQuestGrade(quest), mode: 'exclusive', gold: quest.gold, claims: {} };
      if (!fantasyCanClaimContract(c, offer, now)) continue;
      const next = structuredClone(this.data); next.offers.push(offer); next.revision++;
      return this.persist(next) ? visible(offer) : undefined;
    }
    return undefined;
  }
  state(actor: FantasyContractActor, now: number): FantasyContractBoard | null {
    if (!this.actorValid(actor) || !hour(now)) return null;
    const c = actor.character; const environment = fantasyEnvironment({ ...c, hour: now });
    const pressure = this.pressure(c.location, now);
    if (!this.loadError && fantasyCanViewContracts(c)) {
      const cycle = Math.floor(now / FANTASY_CONTRACT_CYCLE);
      if ((this.data.generated[c.location] ?? -1) < cycle) {
        const next = structuredClone(this.data); const start = cycle * FANTASY_CONTRACT_CYCLE;
        const existing = next.offers.filter(offer => !offer.recipient && offer.boardLocation === c.location && (offer.expiresAt > now || waitingRaid(offer)));
        const vacancies = (source:ReturnType<typeof fantasyQuestInstitution>) => Math.max(0,3-existing.filter(offer=>offer.mode!=='raid'&&!Object.keys(offer.claims).length&&fantasyQuestInstitution(FANTASY_QUESTS.find(q=>q.id===offer.quest)!)===source).length);
        const candidates = fantasyContractCandidates(c.location, start, environment.season, (environment as { seasonDay?: number }).seasonDay ?? 1)
          .filter(quest=>fantasyInstitutionPresent({...c,hour:start},fantasyQuestInstitution(quest)))
          .filter(quest => !existing.some(offer => offer.quest === quest.id))
          .filter(quest => fantasyContractHash(`grade-post:${c.location}:${cycle}:${quest.id}`) / 4294967296
            < fantasyContractPostingChance(fantasyQuestGrade(quest)))
          // 同じ周期と地域では全員に同じ抽選を適用する。既存の掲示・受注は変えない。
          .filter(quest => quest.objective?.type !== 'hunt'
            || fantasyContractHash(`hunt-post:${c.location}:${cycle}:${quest.id}`) / 4294967296 < this.pressure(quest.destination, now) / 50);
        const selected: FantasyQuest[] = [];
        for (const quest of candidates) {
          if (fantasyContractMode(quest) === 'raid') {
            if (existing.some(offer => offer.mode === 'raid') || selected.some(candidate => fantasyContractMode(candidate) === 'raid')) continue;
          } else if (selected.filter(candidate => fantasyContractMode(candidate) !== 'raid'&&fantasyQuestInstitution(candidate)===fantasyQuestInstitution(quest)).length >= vacancies(fantasyQuestInstitution(quest))) continue;
          selected.push(quest);
        }
        for (const quest of selected) {
          const id = `offer-${c.location}-${cycle}-${fantasyContractHash(quest.id).toString(16)}`;
          if (next.offers.some(offer => offer.id === id)) continue;
          const hunt = quest.objective?.type === 'hunt';
          const mode = fantasyContractMode(quest); const scheduled = mode === 'raid' && hunt;
          const startsAt = scheduled ? start + FANTASY_CONTRACT_RAID_DELAY_HOURS : undefined;
          next.offers.push({ id, quest: quest.id, boardLocation: c.location, issuer: fantasyContractIssuer(quest)!, createdAt: start,
            expiresAt: scheduled ? FANTASY_CONTRACT_RAID_WAITING_DEADLINE : start + FANTASY_CONTRACT_POST_HOURS, deadline: scheduled ? FANTASY_CONTRACT_RAID_WAITING_DEADLINE : start + FANTASY_CONTRACT_DEADLINE_HOURS,
            ...fantasyContractHunt(quest), grade: fantasyQuestGrade(quest), ...(startsAt === undefined ? {} : { startsAt }), mode, gold: Math.max(1, Math.floor(quest.gold * (hunt ? fantasyContractBounty(this.pressure(quest.destination, now)) : 1))), claims: {} });
        }
        next.generated[c.location] = cycle;
        next.offers = next.offers.filter(offer => waitingRaid(offer) || offer.deadline > now || offer.createdAt > now - 48);
        next.revision++; this.persist(next);
      }
    }
    return { revision: this.data.revision, hour: now, location: c.location, environment: { ...environment, monsterPressure: pressure, bountyMultiplier: fantasyContractBounty(pressure) },
      offers: !fantasyCanViewContracts(c) ? [] : this.data.offers.filter(offer => {
        if (offer.boardLocation !== c.location || offer.startedAt !== undefined || offer.recipient && offer.recipient !== actor.id) return false;
        const own = member(offer.claims, actor.id);
        // Waiting raids remain joinable after their rendezvous time until an actual start.
        return waitingRaid(offer) ? !!own || now < offer.expiresAt && fantasyCanClaimContract(c, offer, now)
          : now < offer.expiresAt && (!!own || fantasyCanClaimContract(c, offer, now));
      }).map(offer => {
        const own = member(offer.claims, actor.id); const participants = Object.keys(offer.claims).length;
        const { claims: _claims, ...snapshot } = offer;
        return { ...snapshot, mine: own?.phase === 'accepted', participants,
          available: !own && now < offer.expiresAt && (offer.mode === 'raid' ? participants < FANTASY_CONTRACT_RAID_PARTICIPANTS : participants === 0) };
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
    if (offer.recipient && offer.recipient !== actor.id) return { error: 'conditions' };
    if (member(offer.claims, actor.id)) return { error: 'already' };
    if (offer.mode === 'raid' && Object.keys(offer.claims).length >= FANTASY_CONTRACT_RAID_PARTICIPANTS) return { error: 'full' };
    if (!fantasyCanClaimContract(actor.character, offer, now)) return { error: 'conditions' };
    if (offer.mode === 'exclusive' && Object.keys(offer.claims).length) return { error: 'taken' };
    const grant: FantasyContractGrant = {
      offerId: offer.id, issuer: offer.issuer, boardLocation: offer.boardLocation, acceptedAt: now, expiresAt: offer.deadline, progress: 0, gold: offer.gold,
      ...(offer.grade === undefined ? {} : { grade: offer.grade }),
      ...(offer.startsAt === undefined ? {} : { startsAt: offer.startsAt }),
      ...(offer.startedAt === undefined ? {} : { startedAt: offer.startedAt }),
      ...(offer.monster === undefined ? {} : { monster: offer.monster }),
      ...(offer.enemyCount === undefined ? {} : { enemyCount: offer.enemyCount }),
    };
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
  raidSnapshot(offerId: string): FantasyRaidSnapshot | undefined {
    const offer = this.data.offers.find(offer => offer.id === offerId && offer.mode === 'raid' && offer.startsAt !== undefined);
    const quest = offer && FANTASY_QUESTS.find(quest => quest.id === offer.quest);
    if (!offer || !quest || quest.objective?.type !== 'hunt') return undefined;
    const { claims: _claims, ...snapshot } = offer;
    return { offer: structuredClone(snapshot), quest, participants: Object.entries(offer.claims).filter(([, claim]) => claim.phase === 'accepted').map(([id]) => id) };
  }
  raidOffer(actor: FantasyContractActor, offerId: string, now: number): FantasyRaidSnapshot | undefined {
    if (this.loadError || !this.reconcile() || !this.actorValid(actor) || !hour(now)) return undefined;
    const offer = this.data.offers.find(offer => offer.id === offerId);
    if (!offer || !waitingRaid(offer) || now < offer.startsAt! || FANTASY_QUESTS.find(quest=>quest.id===offer.quest)?.destination !== actor.character.location
      || member(offer.claims, actor.id)?.phase !== 'accepted' || !actor.character.quests.includes(offer.quest)
      || actor.character.contracts?.[offer.quest]?.offerId !== offer.id) return undefined;
    return this.raidSnapshot(offerId);
  }
  markRaidStarted(offerId: string, now: number): boolean {
    if (this.loadError || !this.reconcile() || !hour(now)) return false;
    const next = structuredClone(this.data); const offer = next.offers.find(offer => offer.id === offerId);
    if (!offer || !waitingRaid(offer) || now < offer.startsAt! || !Object.values(offer.claims).some(claim => claim.phase === 'accepted')) return false;
    offer.startedAt = now; offer.expiresAt = now; offer.deadline = now + FANTASY_CONTRACT_DEADLINE_HOURS;
    for (const claim of Object.values(offer.claims)) { claim.grant.startedAt = now; claim.grant.expiresAt = offer.deadline; }
    next.revision++; return this.persist(next);
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
    const next=structuredClone(this.data);let changed=false;
    if(!next.hunts.includes(receipt)){next.pressure[actor.character.location]={value:Math.max(0,this.pressure(actor.character.location,now)-amount*2),hour:now};next.hunts.push(receipt);changed=true;}
    for(const offer of next.offers){
      const key=`raid-${createHash('sha256').update(`${receipt}:${offer.id}`).digest('hex')}`;
      if(offer.mode!=='raid'||waitingRaid(offer)||now>=offer.deadline||member(offer.claims,actor.id)?.phase!=='accepted'||next.hunts.includes(key))continue;
      const quest=FANTASY_QUESTS.find(quest=>quest.id===offer.quest);
      if(quest?.objective?.type!=='hunt'||quest.destination!==actor.character.location||quest.objective.monster&&quest.objective.monster!==monster)continue;
      for(const [user,claim] of Object.entries(offer.claims))if(claim.phase==='accepted'){
        const present=this.lookup?.(user);if(this.lookup&&(!present?.character||present.death||present.character.location!==quest.destination||present.character.contracts?.[quest.id]?.offerId!==offer.id))continue;
        claim.grant.progress=Math.min(quest.objective.count,claim.grant.progress+amount);
      }
      next.hunts.push(key);changed=true;
    }
    if(!changed)return true;next.hunts=next.hunts.slice(-2048);next.revision++;return this.persist(next);
  }
}
