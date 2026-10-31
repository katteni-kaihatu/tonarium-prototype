import { randomUUID } from 'node:crypto';
import type { FantasyProfile } from '../shared/fantasy.ts';
import { FANTASY_PARTY_MAX_MEMBERS, FANTASY_PARTY_TTL_MS, isFantasyPartyCommand, type FantasyPartyError, type FantasyPartyState, type FantasyPartyTravelProposal } from '../shared/fantasy-party.ts';
import { fantasyMainInvestigationError, fantasyMainStage } from '../shared/fantasy-main-trials.ts';
import { fantasyEnvironmentActionError } from '../shared/fantasy-environment.ts';
import type { FantasyGroupInvestigationPlan, FantasyGroupInvestigationResult, FantasyGroupTravelPlan, FantasyCombatPlan, FantasyCombatStoreResult, FantasyGroupDungeonPlan } from './fantasy-store.ts';
import { fantasyCombatStartError } from '../shared/fantasy-combat-challenges.ts';
import { fantasyTransports, fantasyTravelRedirectQuote } from '../shared/fantasy-engine.ts';
import type { FantasyPartyVault, FantasyPartyVaultCommand, FantasyPartyVaultContext } from '../shared/fantasy-party-vault.ts';
import type { FantasyPartyGroupContext, FantasyQuestEligibility } from './fantasy-party-cohorts.ts';
import { FANTASY_ESCORT_AMBUSH_ENCOUNTER } from '../shared/fantasy-encounters.ts';
import { fantasyOnRoad } from '../shared/fantasy-travel.ts';
import { fantasyDungeonActionError, isFantasyDungeonAction, type FantasyDungeonAction } from '../shared/fantasy-dungeon.ts';
import { FANTASY_QUESTS } from '../shared/fantasy-data.ts';
import { fantasyQuestInstitution } from '../shared/fantasy-institutions.ts';

export interface FantasyPartyActor { id: string; name: string; session: string | null; world?: string; profile: FantasyProfile }
interface Consent extends FantasyGroupInvestigationPlan { expiresAt: number }
interface CombatConsent extends FantasyCombatPlan { expiresAt: number }
interface TravelConsent extends FantasyGroupTravelPlan { expiresAt: number; cost: number; hours: number; quotedAt?: number }
interface Party { id: string; session: string; leader: string; members: string[]; ready: Map<string, Consent>; combatReady: Map<string, CombatConsent>; combatDeclined: Set<string>; combatSitOut: Set<string>; travelReady: Map<string, TravelConsent>; chat: NonNullable<FantasyPartyState['chat']>; revision: number; travelQuotes?: TravelConsent[]; travelProposal?: FantasyPartyTravelProposal; combatProposal?: NonNullable<FantasyPartyState['combatProposal']>; dungeonProposal?: NonNullable<FantasyPartyState['dungeonProposal']>; dungeonPlans?: FantasyGroupDungeonPlan[] }
interface Invitation { id: string; party: string; target: string; from: string; expiresAt: number }
type PartyResult = { error?: FantasyPartyError; updates?: FantasyGroupInvestigationResult['updates'] };
interface Options {
  lookup: (user: string) => FantasyPartyActor | undefined;
  start: (plans: FantasyGroupInvestigationPlan[]) => FantasyGroupInvestigationResult;
  startCombat?: (plans: FantasyCombatPlan[], context?: FantasyPartyGroupContext) => FantasyCombatStoreResult;
  guildContract?: (user: string, offer: string) => boolean;
  worldHour?: () => number;
  startTravel?: (plans: FantasyGroupTravelPlan[], context?: FantasyPartyGroupContext) => FantasyGroupInvestigationResult;
  startRedirect?: (plans: FantasyGroupTravelPlan[], context?: FantasyPartyGroupContext) => FantasyGroupInvestigationResult;
  startDungeon?: (plans: FantasyGroupDungeonPlan[], context?: FantasyPartyGroupContext) => FantasyGroupInvestigationResult;
  load?: () => unknown;
  save?: (snapshot: unknown) => boolean;
  transaction?: (operation: () => PartyResult, snapshot: () => unknown) => PartyResult;
  joinCombat?: (user: string, session: string, combat: string, confirm?: boolean) => FantasyCombatStoreResult;
  battle?: (user: string, session: string) => { id: string; source: string } | null;
  vault?: (party: string) => FantasyPartyVault;
  vaultRequest?: (party: FantasyPartyVaultContext, user: string, command: FantasyPartyVaultCommand) => FantasyGroupInvestigationResult;
  returnDeposits?: (party: string, user: string) => FantasyGroupInvestigationResult;
  now?: () => number;
}
export class FantasyParty {
  private parties = new Map<string, Party>();
  private invitations = new Map<string, Invitation>();
  private limits = new Map<string, { time: number; count: number }>();
  private now: () => number;
  constructor(private options: Options) {
    this.now = options.now ?? Date.now;
    const saved = options.load?.();
    if (saved !== undefined) this.restore(saved);
  }
  private snapshot() {
    return structuredClone({ version: 1, parties: [...this.parties.values()].map(p => ({ ...p, ready: [...p.ready], combatReady: [...p.combatReady], combatDeclined: [...p.combatDeclined], combatSitOut: [...p.combatSitOut], travelReady: [...p.travelReady] })), invitations: [...this.invitations.values()] });
  }
  private restore(value: unknown) {
    if (!value || typeof value !== 'object' || Array.isArray(value)) throw Error('Invalid party snapshot');
    const v = value as ReturnType<FantasyParty['snapshot']>;
    if (v.version !== 1 || !Array.isArray(v.parties) || !Array.isArray(v.invitations)) throw Error('Invalid party snapshot');
    const parties = new Map<string, Party>(), users = new Set<string>();
    for (const p of v.parties) {
      if (!p || typeof p.id !== 'string' || typeof p.session !== 'string' || !Array.isArray(p.members) || p.members.length < 1 || p.members.length > 6 || !p.members.includes(p.leader)
        || p.members.some(user => typeof user !== 'string' || users.has(user)) || !Number.isSafeInteger(p.revision) || !Array.isArray(p.ready) || !Array.isArray(p.combatReady) || !Array.isArray(p.travelReady) || !Array.isArray(p.chat)) throw Error('Invalid party snapshot');
      if (p.dungeonProposal && (!isFantasyDungeonAction(p.dungeonProposal.action) || !['dungeonEnter', 'dungeonMove', 'dungeonInspect', 'dungeonExit'].includes(p.dungeonProposal.action.type)
        || typeof p.dungeonProposal.id !== 'string' || p.dungeonProposal.revision !== p.revision || p.dungeonProposal.cost !== 0 || p.dungeonProposal.hours !== 0 || !Number.isFinite(p.dungeonProposal.expiresAt)
        || !Array.isArray(p.dungeonProposal.agreed) || new Set(p.dungeonProposal.agreed).size !== p.dungeonProposal.agreed.length || p.dungeonProposal.agreed.some(user => !p.members.includes(user))
        || !Array.isArray(p.dungeonPlans) || p.dungeonPlans.length < 1 || p.dungeonPlans.length > p.members.length || new Set(p.dungeonPlans.map(plan => plan.user)).size !== p.dungeonPlans.length || p.dungeonPlans.some(plan => !p.members.includes(plan.user) || !Number.isSafeInteger(plan.generation) || !isFantasyDungeonAction(plan.action))
        || p.dungeonProposal.agreed.some(user => !p.dungeonPlans!.some(plan => plan.user === user)))) throw Error('Invalid dungeon proposal');
      for (const user of p.members) users.add(user);
      parties.set(p.id, { ...p, ready: new Map(p.ready), combatReady: new Map(p.combatReady), combatDeclined: new Set(p.combatDeclined), combatSitOut: new Set(p.combatSitOut), travelReady: new Map(p.travelReady) });
    }
    this.parties = parties; this.invitations = new Map(v.invitations.map(invite => [invite.id, invite]));
  }
  private clear(party: Party) { party.ready.clear(); party.combatReady.clear(); party.combatDeclined.clear(); party.combatSitOut.clear(); party.travelReady.clear(); delete party.travelProposal; delete party.travelQuotes; delete party.combatProposal; delete party.dungeonProposal; delete party.dungeonPlans; party.revision++; }
  private context(party: Party): FantasyPartyGroupContext {
    const reference = party.combatReady.get(party.leader), eligible: FantasyQuestEligibility[] = [];
    if (reference?.source === 'story') for (const user of party.members) {
      const actor = this.options.lookup(user), c = actor?.profile.character, stage = c && fantasyMainStage(c, reference.target), record = c?.mainTrials?.[reference.target];
      if (this.alive(actor) && c && record && stage?.location === reference.location && c.location === reference.location && !actor.profile.activity && !actor.profile.combatId)
        eligible.push({ user, generation: actor.profile.generation ?? 1, location: c.location, quest: reference.target, stage: stage.id, acceptedAt: record.acceptedAt });
    }
    const dungeonEligible = reference?.source === 'dungeon' ? party.members.flatMap(user => {
      const actor = this.options.lookup(user), c = actor?.profile.character, active = c?.dungeon?.active;
      return this.alive(actor) && active && `${active.site}:${active.room}` === reference.target && c!.location === reference.location && !actor.profile.activity && !actor.profile.combatId
        ? [{ user, generation: actor.profile.generation ?? 1, location: c!.location, site: active.site, room: active.room }] : [];
    }) : [];
    return { party: party.id, session: party.session, leader: party.leader, ...(eligible.length ? { eligible } : {}), ...(dungeonEligible.length ? { dungeonEligible } : {}) };
  }
  private dungeonPlan(actor: FantasyPartyActor, action: FantasyDungeonAction): FantasyGroupDungeonPlan | undefined {
    if (!this.alive(actor) || actor.profile.character?.returnLantern || fantasyDungeonActionError(actor.profile, action)) return;
    const c = actor.profile.character!, active = c.dungeon?.active;
    return { user: actor.id, generation: actor.profile.generation ?? 1, location: c.location, action: structuredClone(action), ...(active ? { site: active.site, room: active.room } : {}) };
  }
  private party(user: string) { return [...this.parties.values()].find(party => party.members.includes(user)); }
  private alive(actor: FantasyPartyActor | undefined): actor is FantasyPartyActor { return !!actor && !!actor.session && actor.world === 'fantasy' && !!actor.profile.character && actor.profile.character.hp > 0 && !actor.profile.death; }
  private viableMember(actor: FantasyPartyActor | undefined): actor is FantasyPartyActor {
    return !!actor && !!actor.session && actor.world === 'fantasy' && !!actor.profile.character && !actor.profile.death
      && (actor.profile.character.hp > 0 || actor.profile.character.hp === 0 && !!actor.profile.character.downed);
  }
  private carriedBy(party: Party, user: string): string | undefined {
    const patient = this.options.lookup(user), c = patient?.profile.character;
    if (!this.viableMember(patient) || patient.session !== party.session || !c?.downed || c.hp !== 0 || patient.profile.combatId || patient.profile.activity || patient.profile.event || c.carrying) return;
    const carriers = party.members.filter(id => {
      if (id === user) return false;
      const carrier = this.options.lookup(id), other = carrier?.profile.character, link = other?.carrying;
      if (!this.alive(carrier) || carrier.session !== party.session || carrier.profile.combatId || other!.downed || !link || link.target !== user || link.party !== party.id
        || link.generation !== (carrier.profile.generation ?? 1) || link.targetGeneration !== (patient.profile.generation ?? 1) || c.downed!.expiresAt <= Math.max(c.hour, other!.hour)) return false;
      const here = c.dungeon?.active, there = other!.dungeon?.active;
      return link.location === c.location && other!.location === c.location && link.site === here?.site && link.room === here?.room && here?.site === there?.site && here?.room === there?.room
        && (!here || c.dungeon?.sites[here.site]?.layoutSeed === other!.dungeon?.sites[here.site]?.layoutSeed) && JSON.stringify(c.travelPosition) === JSON.stringify(other!.travelPosition);
    });
    return carriers.length === 1 ? carriers[0] : undefined;
  }
  private movementMembers(party: Party): string[] { return party.members.filter(user => !this.carriedBy(party, user)); }
  private movementLeader(party: Party): string | undefined {
    if (this.alive(this.options.lookup(party.leader))) return party.leader;
    if (!this.carriedBy(party, party.leader)) return;
    return this.movementMembers(party).find(user => this.alive(this.options.lookup(user)));
  }
  private movementOrder(party: Party): string[] {
    const leader = this.movementLeader(party), members = this.movementMembers(party);
    return leader ? [leader, ...members.filter(user => user !== leader)] : [];
  }
  private movementMatches(party: Party, plans: readonly { user: string }[] | undefined): boolean {
    const members = this.movementMembers(party);
    return !!plans && plans.length === members.length && new Set(plans.map(plan => plan.user)).size === members.length && members.every(user => plans.some(plan => plan.user === user));
  }
  private movementContext(party: Party): FantasyPartyGroupContext { return { ...this.context(party), leader: this.movementLeader(party) ?? party.leader }; }
  private plan(actor: FantasyPartyActor, quest: string, approach: Consent['approach']): FantasyGroupInvestigationPlan | undefined {
    const c = actor.profile.character;
    if (!this.alive(actor) || !c || c.dungeon?.active || fantasyOnRoad(c) || actor.profile.activity || actor.profile.combatId || actor.profile.event || fantasyMainInvestigationError(c, { type: 'investigate', quest, approach }) || fantasyEnvironmentActionError(c, { type: 'investigate', quest, approach })) return undefined;
    const stage = fantasyMainStage(c, quest)!;
    return { user: actor.id, quest, approach, generation: actor.profile.generation ?? 1, location: c.location, stage: stage.id };
  }
  private matches(actor: FantasyPartyActor, consent: Consent): boolean {
    const current = this.plan(actor, consent.quest, consent.approach);
    return !!current && current.generation === consent.generation && current.location === consent.location && current.stage === consent.stage && consent.expiresAt > this.now();
  }
  private combatPlan(actor: FantasyPartyActor, source: FantasyCombatPlan['source'], target: string, confirm?: boolean): FantasyCombatPlan | undefined {
    if (source === 'guild') {
      const c = actor.profile.character, quest = c && FANTASY_QUESTS.find(q => q.group && q.objective?.type === 'hunt' && fantasyQuestInstitution(q) === 'guild' && c.contracts?.[q.id]?.offerId === target), grant = quest && c?.contracts?.[quest.id], hour = Math.max(c?.hour ?? 0, this.options.worldHour?.() ?? c?.hour ?? 0);
      if (!this.alive(actor) || !c || !quest || !grant || !this.options.guildContract?.(actor.id, target) || actor.profile.activity || actor.profile.combatId || actor.profile.event
        || c.downed || c.carrying || c.returnLantern || c.dungeon?.active || fantasyOnRoad(c) || c.location !== quest.destination || !c.quests.includes(quest.id) || c.completed.includes(quest.id)
        || !Number.isFinite(hour) || !Number.isFinite(grant.startsAt) || grant.startsAt! > hour || grant.startedAt !== undefined || grant.expiresAt <= hour || grant.acceptedAt > hour || grant.progress >= quest.objective!.count) return;
      return { user: actor.id, generation: actor.profile.generation ?? 1, location: c.location, session: actor.session!, source, target };
    }
    const party = this.party(actor.id), reference = party?.combatReady.get(party.leader), leader = party && this.options.lookup(party.leader);
    const follower = reference && leader && reference.source === source && reference.target === target && source === 'escort'
      && !actor.profile.activity && !actor.profile.combatId && !actor.profile.event && actor.profile.character?.location === reference.location
      || reference && leader && source === 'encounter' && target === FANTASY_ESCORT_AMBUSH_ENCOUNTER && actor.profile.event === target && !actor.profile.activity && !actor.profile.combatId;
    if (!this.alive(actor) || !follower && fantasyCombatStartError(actor.profile, source, target, confirm)) return undefined;
    return { user: actor.id, generation: actor.profile.generation ?? 1, location: actor.profile.character!.location, session: actor.session!, source, target, ...(confirm !== undefined ? { confirm } : {}) };
  }
  private sameCombat(a: FantasyCombatPlan | undefined, b: FantasyCombatPlan | undefined) { return !!a && !!b && a.source === b.source && a.target === b.target && a.location === b.location && a.session === b.session; }
  private travelPlan(actor: FantasyPartyActor, destination: string, transport: string, redirect = false, quotedAt?: number): TravelConsent | undefined {
    const c = actor.profile.character;
    if (!this.alive(actor) || !c || c.returnLantern || c.dungeon?.active || !redirect && actor.profile.activity || redirect && actor.profile.activity?.action.type !== 'travel' || actor.profile.combatId || actor.profile.event) return;
    const route = redirect ? fantasyTravelRedirectQuote(actor.profile, destination, transport, quotedAt ?? c.hour) : fantasyTransports(c, destination).find(route => route.id === transport && route.available);
    if (!route || route.cost > c.gold) return;
    return { user: actor.id, generation: actor.profile.generation ?? 1, location: c.location, destination, transport: route.id, cost: route.cost, hours: route.hours,
      ...(redirect ? { quotedAt: quotedAt ?? c.hour, activitySeed: actor.profile.activity!.seed, activityStartedAt: actor.profile.activity!.startedAt } : {}), expiresAt: this.now() + FANTASY_PARTY_TTL_MS };
  }
  invalidate(user: string) { const party = this.party(user); if (!party) return; party.ready.delete(user); if (party.travelProposal || party.combatProposal || party.dungeonProposal) this.clear(party); }
  leave(user: string): PartyResult { return this.change(() => this.leaveInternal(user)); }
  private leaveInternal(user: string): PartyResult {
    const party = this.party(user); if (!party) return {};
    const returned = this.options.returnDeposits?.(party.id, user); if (returned?.error) return { error: returned.error };
    party.members = party.members.filter(id => id !== user); this.clear(party);
    if (!party.members.length) this.parties.delete(party.id);
    else if (party.leader === user) party.leader = party.members[0];
    for (const [id, invite] of this.invitations) if (invite.target === user || invite.from === user || invite.party === party.id) this.invitations.delete(id);
    return returned?.updates.length ? { updates: returned.updates } : {};
  }
  sweep() {
    for (const [id, limit] of this.limits) if (this.now() - limit.time > 300_000 || !this.options.lookup(id)) this.limits.delete(id);
    for (const party of [...this.parties.values()]) for (const user of [...party.members]) {
      const actor = this.options.lookup(user);
      if (!actor?.session) { if (actor?.profile.death) this.leave(user); continue; } // 再接続中の所属は残す。
      if (!this.viableMember(actor) || actor.session !== party.session) { this.leave(user); continue; }
      if (!this.alive(actor)) {
        const carried = !!this.carriedBy(party, user);
        const activeConsent = party.ready.size || party.combatReady.size || party.combatDeclined.size || party.combatSitOut.size || party.combatProposal
          || party.travelReady.has(user) || party.travelQuotes?.some(plan => plan.user === user) || party.dungeonPlans?.some(plan => plan.user === user);
        if ((!carried || activeConsent) && (activeConsent || party.travelReady.size || party.travelProposal || party.dungeonProposal)) this.clear(party);
        continue;
      }
      const consent = party.ready.get(user); if (consent && !this.matches(actor, consent)) party.ready.delete(user);
      const combat = party.combatReady.get(user), current = combat && this.combatPlan(actor, combat.source, combat.target, combat.confirm);
      if (combat && (combat.expiresAt <= this.now() || !this.sameCombat(combat, current) || current!.generation !== combat.generation)) party.combatReady.delete(user);
      const travel = party.travelReady.get(user), currentTravel = travel && this.travelPlan(actor, travel.destination, travel.transport, party.travelProposal?.kind === 'redirect', travel.quotedAt);
      if (travel && (!currentTravel || travel.expiresAt <= this.now() || travel.generation !== currentTravel.generation || travel.location !== currentTravel.location || travel.cost !== currentTravel.cost || Math.abs(travel.hours - currentTravel.hours) > 1e-8)) this.clear(party);
    }
    for (const party of this.parties.values()) {
      if (party.travelProposal && party.travelProposal.expiresAt <= this.now() || party.combatProposal && (party.combatProposal.expiresAt <= this.now() || !party.combatReady.has(party.leader))) this.clear(party);
      if (party.travelProposal && !this.movementMatches(party, party.travelQuotes)) this.clear(party);
      if (party.dungeonProposal && (party.dungeonProposal.expiresAt <= this.now() || !this.movementMatches(party, party.dungeonPlans) || party.dungeonPlans?.some(plan => { const actor = this.options.lookup(plan.user); const now = actor && this.dungeonPlan(actor, plan.action); return !now || JSON.stringify(now) !== JSON.stringify(plan); }))) this.clear(party);
    }
    for (const [id, invite] of this.invitations) {
      const party = this.parties.get(invite.party), target = this.options.lookup(invite.target);
      if (invite.expiresAt <= this.now() || !party || target?.session && (!this.alive(target) || target.session !== party.session) || this.party(invite.target)) this.invitations.delete(id);
    }
  }
  private same(a: FantasyGroupInvestigationPlan | undefined, b: FantasyGroupInvestigationPlan | undefined) { return !!a && !!b && a.quest === b.quest && a.stage === b.stage && a.location === b.location; }
  state(user: string): FantasyPartyState {
    this.sweep(); const actor = this.options.lookup(user), party = this.party(user);
    const basis = party?.ready.get(party.leader) ?? (party && [...party.ready.values()][0]);
    const ownQuest = actor?.profile.character?.quests.find(quest => !!fantasyMainStage(actor.profile.character!, quest));
    const reference = basis ?? (actor && ownQuest ? this.plan(actor, ownQuest, 'observe') : undefined);
    const combatReference = party?.combatReady.get(party.leader) ?? (party && [...party.combatReady.values()][0]);
    const members = party?.members.map(id => {
      const member = this.options.lookup(id), q = reference?.quest;
      if (!member?.profile.character) return { id, name: '…', isLeader: party.leader === id, here: false, ready: false, compatible: false };
      return { id, name: member.name, isLeader: party.leader === id, here: member.profile.character.location === actor?.profile.character?.location && member.profile.character.dungeon?.active?.site === actor?.profile.character?.dungeon?.active?.site && member.profile.character.dungeon?.active?.room === actor?.profile.character?.dungeon?.active?.room,
        ...(member.profile.character.downed?{downed:true,downedKind:member.profile.character.downed.kind??'damage'}:{}),
        ...(this.carriedBy(party,id)?{carriedBy:this.carriedBy(party,id)}:{}),
        ...(member.profile.character.returnLantern?{returnLantern:{endsAt:member.profile.character.returnLantern.endsAt,invited:member.profile.character.returnLantern.invited.some(invite=>invite.user===user),accepted:member.profile.character.returnLantern.accepted.includes(user)}}:{}),
        ready: party.ready.has(id) || party.combatReady.has(id) || party.travelReady.has(id) || !!party.dungeonProposal?.agreed.includes(id), compatible: combatReference ? this.sameCombat(combatReference, this.combatPlan(member, combatReference.source, combatReference.target, combatReference.confirm)) : party.dungeonProposal ? !!this.dungeonPlan(member, party.dungeonProposal.action) : !!q && this.same(reference, this.plan(member, q, 'observe')),
        ...(combatReference ? { combatReady: party.combatReady.has(id) } : {}),
        ...(party.combatReady.has(id) ? { combatDecision: 'accept' as const } : party.combatDeclined.has(id) ? { combatDecision: 'decline' as const } : party.combatSitOut.has(id) ? { combatDecision: 'sit-out' as const } : {}),
        ...(party.travelReady.size ? { travelReady: party.travelReady.has(id) } : {}) };
    }) ?? [];
    const travels = party && [...party.travelReady.values()], travel = travels?.[0];
    const movementMembers = party ? this.movementMembers(party) : [], movementLeader = party && this.movementLeader(party);
    const battle = party && party.members.map(id => this.options.lookup(id)).filter(member => member?.profile.character?.location === actor?.profile.character?.location).map(member => member && this.options.battle?.(member.id, party.session)).find(Boolean);
    return { id: party?.id ?? null, members, ...(movementLeader ? { movementLeader } : {}), invitations: [...this.invitations.values()].filter(invite => invite.target === user).map(invite => ({ id: invite.id, fromId: invite.from, fromName: this.options.lookup(invite.from)?.name ?? '', expiresAt: invite.expiresAt })),
      canStart: !!party && !combatReference && party.leader === user && members.length >= 2 && members.every(member => party.ready.has(member.id) && member.compatible),
      ...(party && this.options.startTravel ? { canStartTravel: movementLeader === user && party.members.length >= 2 && movementMembers.length >= 1 && this.movementMatches(party, travels) && travels!.every(entry => entry.location === travel!.location && entry.destination === travel!.destination && (entry.transport === travel!.transport || travel!.transport === 'escort' && entry.user !== movementLeader && entry.transport === 'foot')) } : {}),
      ...(party && this.movementMatches(party, travels) && travels!.length >= 1 ? { travelHours: Math.max(...travels!.map(plan => plan.hours)) } : {}),
      ...(party?.travelProposal ? { travelProposal: structuredClone({ ...party.travelProposal, agreed: [...party.travelReady.keys()] }) } : {}),
      ...(party?.combatProposal ? { combatProposal: structuredClone(party.combatProposal) } : {}),
      ...(party?.dungeonProposal ? { dungeonProposal: structuredClone(party.dungeonProposal), canStartDungeon: movementLeader === user && this.movementMatches(party, party.dungeonPlans) && movementMembers.every(id => party.dungeonProposal!.agreed.includes(id)) } : {}),
      ...(party && this.options.vault ? { vault: this.options.vault(party.id) } : {}),
      ...(party?.chat.length ? { chat: party.chat.slice(-80) } : {}),
      ...(battle ? { battle: { id: battle.id, needsConfirmation: battle.source.startsWith('apex:') || battle.source.startsWith('challenge:') } } : {}),
      ...(combatReference ? { canStartCombat: party!.leader === user && members.length >= 2 && party!.members.some(id => party!.combatReady.has(id)) && party!.members.every(id => party!.combatReady.has(id) || party!.combatDeclined.has(id) || party!.combatSitOut.has(id)) && members.every(member => !party!.combatReady.has(member.id) || member.compatible) } : {}) };
  }
  private change(operation: () => PartyResult): PartyResult {
    const before = this.snapshot();
    const result = this.options.transaction ? this.options.transaction(operation, () => this.snapshot()) : operation();
    if (result.error) { this.restore(before); return result; }
    if (!this.options.transaction && !result.error && !result.updates && this.options.save && JSON.stringify(before) !== JSON.stringify(this.snapshot()) && !this.options.save(this.snapshot())) {
      this.restore(before); return { error: 'save-failed' };
    }
    return result;
  }
  request(user: string, input: unknown): PartyResult { return this.change(() => this.requestInternal(user, input)); }
  private requestInternal(user: string, input: unknown): { error?: FantasyPartyError; updates?: FantasyGroupInvestigationResult['updates'] } {
    this.sweep(); if (!isFantasyPartyCommand(input)) return { error: 'invalid' };
    const actor = this.options.lookup(user);
    if (!actor?.session || actor.world !== 'fantasy') return { error: 'not-in-world' };
    if (!this.alive(actor)) return { error: 'not-alive' };
    const prior = this.limits.get(user), time = this.now();
    if (prior && time - prior.time < 1000) { if (++prior.count > 12) return { error: 'rate-limit' }; } else this.limits.set(user, { time, count: 1 });
    if (input.type === 'sync') return {};
    const party = this.party(user);
    if (input.type === 'create') {
      if (party) return { error: 'already-in-party' };
      const id = `party-${randomUUID()}`; this.parties.set(id, { id, session: actor.session!, leader: user, members: [user], ready: new Map(), combatReady: new Map(), combatDeclined: new Set(), combatSitOut: new Set(), travelReady: new Map(), chat: [], revision: 0 }); return {};
    }
    if (input.type === 'respond') {
      const invite = this.invitations.get(input.invite);
      if (!invite || invite.target !== user) return { error: 'invite-expired' };
      const group = this.parties.get(invite.party)!;
      if (input.accept && party) return { error: 'already-in-party' };
      if (input.accept && group.members.length >= FANTASY_PARTY_MAX_MEMBERS) return { error: 'party-full' };
      this.invitations.delete(invite.id);
      if (input.accept) { group.members.push(user); this.clear(group); }
      return {};
    }
    if (!party) return { error: 'no-party' };
    if (input.type === 'leave') return this.leaveInternal(user);
    if (input.type === 'unready') { this.invalidate(user); return {}; }
    if (input.type === 'chat') {
      party.chat.push({ id: randomUUID(), from: user, name: actor.name, text: input.text.trim(), at: this.now() });
      party.chat = party.chat.slice(-80); return {};
    }
    if (input.type === 'deposit' || input.type === 'requestWithdraw' || input.type === 'approveWithdraw') return this.options.vaultRequest?.(party, user, input) ?? { error: 'unavailable' };
    if (input.type === 'joinCombat') {
      return { error: 'unavailable' };
    }
    if (input.type === 'readyDungeon') {
      if (this.movementLeader(party) !== user) return { error: 'leader-only' };
      if (party.members.length < 2) return { error: 'too-small' };
      const plans = this.movementOrder(party).map(id => { const member = this.options.lookup(id); return member && this.dungeonPlan(member, input.action); });
      if (!plans.length) return { error: 'incompatible' };
      if (plans.some(plan => !plan)) return { error: 'incompatible' };
      const valid = plans as FantasyGroupDungeonPlan[];
      if (!valid.every(plan => plan.location === valid[0].location && plan.site === valid[0].site && plan.room === valid[0].room)) return { error: 'incompatible' };
      this.clear(party); party.dungeonPlans = valid;
      party.dungeonProposal = { id: randomUUID(), revision: party.revision, action: structuredClone(input.action), cost: 0, hours: 0, agreed: [user], expiresAt: time + FANTASY_PARTY_TTL_MS }; return {};
    }
    if (input.type === 'dungeonDecision') {
      const proposal = party.dungeonProposal;
      if (!proposal || proposal.id !== input.proposal || proposal.revision !== input.revision) return { error: 'stale' };
      if (!party.dungeonPlans?.some(plan => plan.user === user)) return { error: 'incompatible' };
      if (!input.accept) { this.clear(party); return {}; }
      if (!proposal.agreed.includes(user)) proposal.agreed.push(user); return {};
    }
    if (input.type === 'readyTravel' || input.type === 'readyRedirect') {
      const movementLeader = this.movementLeader(party);
      if (movementLeader !== user) return { error: 'leader-only' };
      if (party.members.length < 2) return { error: 'too-small' };
      const redirect = input.type === 'readyRedirect', requested = input.transport ?? 'foot';
      const order = this.movementOrder(party);
      const plans = order.map(id => { const member = this.options.lookup(id); return member && (this.travelPlan(member, input.destination, requested, redirect)
        ?? (!redirect && requested === 'escort' && id !== movementLeader ? this.travelPlan(member, input.destination, 'foot') : undefined)); });
      if (!plans.length) return { error: 'incompatible' };
      if (plans.some(plan => !plan)) return { error: 'incompatible' };
      const quotes = plans as TravelConsent[];
      if (!quotes.every(plan => plan.location === quotes[0].location && (plan.transport === quotes[0].transport || requested === 'escort' && plan.user !== movementLeader && plan.transport === 'foot'))) return { error: 'incompatible' };
      this.clear(party);
      party.travelProposal = { id: randomUUID(), revision: party.revision, kind: redirect ? 'redirect' : 'travel', destination: input.destination, transport: quotes[0].transport,
        expiresAt: time + FANTASY_PARTY_TTL_MS, quotes: quotes.map(plan => ({ user: plan.user, cost: plan.cost, hours: plan.hours })), agreed: [user] };
      // Keep every immutable quote, but readiness is granted only by its owner.
      party.travelQuotes = quotes;
      party.travelReady.set(user, quotes.find(plan => plan.user === user)!); return {};
    }
    if (input.type === 'travelDecision') {
      const proposal = party.travelProposal;
      if (!proposal || proposal.id !== input.proposal || proposal.revision !== input.revision) return { error: 'stale' };
      if (!party.travelQuotes?.some(plan => plan.user === user)) return { error: 'incompatible' };
      if (!input.accept) { this.clear(party); return {}; }
      const quote = party.travelQuotes?.find(plan => plan.user === user), current = this.travelPlan(actor, proposal.destination, quote?.transport ?? proposal.transport, proposal.kind === 'redirect', quote?.quotedAt);
      if (!quote || !current || quote.generation !== current.generation || quote.cost !== current.cost || Math.abs(quote.hours - current.hours) > 1e-8) { this.clear(party); return { error: 'stale' }; }
      party.travelReady.set(user, quote); return {};
    }
    if (input.type === 'invite') {
      if (party.leader !== user) return { error: 'leader-only' };
      if (input.target === user) return { error: 'self-invite' };
      if (party.members.length >= FANTASY_PARTY_MAX_MEMBERS) return { error: 'party-full' };
      const target = this.options.lookup(input.target);
      if (!this.alive(target) || target.session !== party.session) return { error: 'not-found' };
      if (this.party(target.id)) return { error: 'already-in-party' };
      if ([...this.invitations.values()].some(invite => invite.party === party.id && invite.target === target.id)) return { error: 'invite-pending' };
      if ([...this.invitations.values()].filter(invite => invite.party === party.id).length >= FANTASY_PARTY_MAX_MEMBERS * 2) return { error: 'invite-pending' };
      const id = `invite-${randomUUID()}`; this.invitations.set(id, { id, party: party.id, from: user, target: target.id, expiresAt: time + FANTASY_PARTY_TTL_MS }); return {};
    }
    if (input.type === 'ready') {
      const plan = this.plan(actor, input.quest, input.approach);
      if (!plan) return { error: actor.profile.activity || actor.profile.event ? 'busy' : 'incompatible' };
      this.invalidate(user); party.ready.set(user, { ...plan, expiresAt: time + FANTASY_PARTY_TTL_MS }); return {};
    }
    if (input.type === 'readyCombat') {
      if (party.leader !== user) return { error: 'leader-only' };
      if (party.members.some(id => !this.alive(this.options.lookup(id)))) return { error: 'incompatible' };
      const plan = this.combatPlan(actor, input.source, input.target, input.confirm);
      if (!plan) return { error: actor.profile.activity || actor.profile.event || actor.profile.combatId ? 'busy' : 'incompatible' };
      this.clear(party); party.combatReady.set(user, { ...plan, expiresAt: time + FANTASY_PARTY_TTL_MS });
      party.combatProposal = { id: randomUUID(), revision: party.revision, source: plan.source, target: plan.target, expiresAt: time + FANTASY_PARTY_TTL_MS };
      return {};
    }
    // リーダーが用意した戦闘に、各員が参加・辞退・不参加を選ぶ。
    if (input.type === 'combatDecision') {
      const proposal = party.combatProposal;
      if (!proposal || proposal.id !== input.proposal || proposal.revision !== input.revision) return { error: 'stale' };
      if (input.decision === 'decline') { this.clear(party); return {}; }
      if (input.decision === 'accept') {
        const reference = party.combatReady.get(party.leader);
        if (!reference) return { error: 'not-ready' };
        const plan = this.combatPlan(actor, reference.source, reference.target, reference.confirm);
        if (!plan) return { error: actor.profile.activity || actor.profile.event || actor.profile.combatId ? 'busy' : 'incompatible' };
        party.combatDeclined.delete(user); party.combatSitOut.delete(user);
        party.combatReady.set(user, { ...plan, expiresAt: time + FANTASY_PARTY_TTL_MS });
        return {};
      }
      party.combatReady.delete(user);
      party.combatSitOut.add(user); party.combatDeclined.delete(user);
      return {};
    }
    if (input.type === 'transferLeader') {
      if (party.leader !== user) return { error: 'leader-only' };
      if (input.target === user || !party.members.includes(input.target) || !this.alive(this.options.lookup(input.target))) return { error: 'incompatible' };
      party.leader = input.target;
      this.clear(party);
      return {};
    }
    if (input.type === 'kick') {
      if (party.leader !== user) return { error: 'leader-only' };
      if (input.target === user || !party.members.includes(input.target)) return { error: 'incompatible' };
      const returned = this.options.returnDeposits?.(party.id, input.target);
      if (returned?.error) return { error: returned.error as FantasyPartyError };
      party.members = party.members.filter(id => id !== input.target);
      this.clear(party);
      for (const [id, invite] of this.invitations) if (invite.target === input.target) this.invitations.delete(id);
      return returned?.updates.length ? { updates: returned.updates } : {};
    }
    const movementStart = input.type === 'startDungeon' || input.type === 'startTravel' || input.type === 'startRedirect';
    if ((movementStart ? this.movementLeader(party) : party.leader) !== user) return { error: 'leader-only' };
    if (party.members.length < 2) return { error: 'too-small' };
    if (input.type === 'startDungeon') {
      if (!party.dungeonProposal || !party.dungeonPlans || !this.movementMatches(party, party.dungeonPlans) || !this.movementMembers(party).every(id => party.dungeonProposal!.agreed.includes(id))) return { error: 'not-ready' };
      if (!this.options.startDungeon) return { error: 'unavailable' };
      const result = this.options.startDungeon(party.dungeonPlans, this.movementContext(party));
      if (result.error) return { error: result.error }; this.clear(party); return { updates: result.updates };
    }
    if (input.type === 'startTravel' || input.type === 'startRedirect') {
      const start = input.type === 'startRedirect' ? this.options.startRedirect : this.options.startTravel;
      if (!start) return { error: 'unavailable' };
      if (party.travelProposal?.kind !== (input.type === 'startRedirect' ? 'redirect' : 'travel')) return { error: 'not-ready' };
      const plans = this.movementOrder(party).map(id => party.travelReady.get(id));
      if (plans.some(plan => !plan)) return { error: 'not-ready' };
      const ready = plans as TravelConsent[];
      if (!this.movementMatches(party, ready) || !ready.every(plan => plan.location === ready[0].location && plan.destination === ready[0].destination && (plan.transport === ready[0].transport || ready[0].transport === 'escort' && plan.user !== this.movementLeader(party) && plan.transport === 'foot'))) return { error: 'incompatible' };
      const result = start(ready.map(({ expiresAt: _, cost, hours, ...plan }) => ({ ...plan, quotedCost: cost, quotedHours: hours })), this.movementContext(party));
      if (result.error) return { error: result.error };
      this.clear(party); return { updates: result.updates };
    }
    if (input.type === 'startCombat') {
      const participants = party.members.filter(id => party.combatReady.has(id));
      if (!participants.length) return { error: 'not-ready' };
      if (!party.members.every(id => party.combatReady.has(id) || party.combatDeclined.has(id) || party.combatSitOut.has(id))) return { error: 'not-ready' };
      if (!this.options.startCombat) return { error: 'unavailable' };
      const plans = [party.leader, ...participants.filter(id => id !== party.leader)].filter(id => participants.includes(id)).map(id => party.combatReady.get(id)!);
      if (!plans.every(plan => this.sameCombat(plans[0], plan))) return { error: 'incompatible' };
      const result = this.options.startCombat(plans.map(({ expiresAt: _, ...plan }) => plan), this.context(party));
      if (result.error) return { error: result.error === 'save-failed' ? 'save-failed' : 'incompatible' };
      this.clear(party); return { updates: result.updates };
    }
    if (!party.members.every(id => party.ready.has(id))) return { error: 'not-ready' };
    const plans = party.members.map(id => party.ready.get(id)!);
    if (!plans.every(plan => this.same(plans[0], plan))) return { error: 'incompatible' };
    const result = this.options.start(plans.map(({ expiresAt: _, ...plan }) => plan));
    if (result.error) return { error: result.error };
    party.ready.clear(); return { updates: result.updates };
  }
}
