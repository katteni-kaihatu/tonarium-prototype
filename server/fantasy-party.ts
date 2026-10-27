import { randomUUID } from 'node:crypto';
import type { FantasyProfile } from '../shared/fantasy.ts';
import { FANTASY_PARTY_MAX_MEMBERS, FANTASY_PARTY_TTL_MS, isFantasyPartyCommand, type FantasyPartyError, type FantasyPartyState } from '../shared/fantasy-party.ts';
import { fantasyMainInvestigationError, fantasyMainStage } from '../shared/fantasy-main-trials.ts';
import { fantasyEnvironmentActionError } from '../shared/fantasy-environment.ts';
import type { FantasyGroupInvestigationPlan, FantasyGroupInvestigationResult, FantasyGroupTravelPlan, FantasyCombatPlan, FantasyCombatStoreResult } from './fantasy-store.ts';
import { fantasyCombatStartError } from '../shared/fantasy-combat-challenges.ts';
import { fantasyTransports } from '../shared/fantasy-engine.ts';
import type { FantasyPartyVault, FantasyPartyVaultCommand, FantasyPartyVaultContext } from '../shared/fantasy-party-vault.ts';

export interface FantasyPartyActor { id: string; name: string; session: string | null; world?: string; profile: FantasyProfile }
interface Consent extends FantasyGroupInvestigationPlan { expiresAt: number }
interface CombatConsent extends FantasyCombatPlan { expiresAt: number }
interface TravelConsent extends FantasyGroupTravelPlan { expiresAt: number; cost: number; hours: number }
interface Party { id: string; session: string; leader: string; members: string[]; ready: Map<string, Consent>; combatReady: Map<string, CombatConsent>; travelReady: Map<string, TravelConsent>; chat: NonNullable<FantasyPartyState['chat']> }
interface Invitation { id: string; party: string; target: string; from: string; expiresAt: number }
interface Options {
  lookup: (user: string) => FantasyPartyActor | undefined;
  start: (plans: FantasyGroupInvestigationPlan[]) => FantasyGroupInvestigationResult;
  startCombat?: (plans: FantasyCombatPlan[]) => FantasyCombatStoreResult;
  startTravel?: (plans: FantasyGroupTravelPlan[]) => FantasyGroupInvestigationResult;
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
  constructor(private options: Options) { this.now = options.now ?? Date.now; }
  private party(user: string) { return [...this.parties.values()].find(party => party.members.includes(user)); }
  private alive(actor: FantasyPartyActor | undefined): actor is FantasyPartyActor { return !!actor && !!actor.session && actor.world === 'fantasy' && !!actor.profile.character && actor.profile.character.hp > 0 && !actor.profile.death; }
  private plan(actor: FantasyPartyActor, quest: string, approach: Consent['approach']): FantasyGroupInvestigationPlan | undefined {
    const c = actor.profile.character;
    if (!this.alive(actor) || !c || actor.profile.activity || actor.profile.combatId || actor.profile.event || fantasyMainInvestigationError(c, { type: 'investigate', quest, approach }) || fantasyEnvironmentActionError(c, { type: 'investigate', quest, approach })) return undefined;
    const stage = fantasyMainStage(c, quest)!;
    return { user: actor.id, quest, approach, generation: actor.profile.generation ?? 1, location: c.location, stage: stage.id };
  }
  private matches(actor: FantasyPartyActor, consent: Consent): boolean {
    const current = this.plan(actor, consent.quest, consent.approach);
    return !!current && current.generation === consent.generation && current.location === consent.location && current.stage === consent.stage && consent.expiresAt > this.now();
  }
  private combatPlan(actor: FantasyPartyActor, source: FantasyCombatPlan['source'], target: string, confirm?: boolean): FantasyCombatPlan | undefined {
    if (!this.alive(actor) || fantasyCombatStartError(actor.profile, source, target, confirm)) return undefined;
    return { user: actor.id, generation: actor.profile.generation ?? 1, location: actor.profile.character!.location, session: actor.session!, source, target, ...(confirm !== undefined ? { confirm } : {}) };
  }
  private sameCombat(a: FantasyCombatPlan | undefined, b: FantasyCombatPlan | undefined) { return !!a && !!b && a.source === b.source && a.target === b.target && a.location === b.location && a.session === b.session; }
  private travelPlan(actor: FantasyPartyActor, destination: string, transport: string): TravelConsent | undefined {
    const c = actor.profile.character;
    if (!this.alive(actor) || !c || actor.profile.activity || actor.profile.combatId || actor.profile.event) return;
    const route = fantasyTransports(c, destination).find(route => route.id === transport && route.available);
    if (!route || route.cost > c.gold) return;
    return { user: actor.id, generation: actor.profile.generation ?? 1, location: c.location, destination, transport, cost: route.cost, hours: route.hours, expiresAt: this.now() + FANTASY_PARTY_TTL_MS };
  }
  invalidate(user: string) { const party = this.party(user); party?.ready.delete(user); party?.combatReady.delete(user); party?.travelReady.delete(user); }
  leave(user: string) {
    const party = this.party(user); if (!party) return;
    const returned = this.options.returnDeposits?.(party.id, user); if (returned?.error) return returned.error;
    party.members = party.members.filter(id => id !== user); party.ready.clear(); party.combatReady.clear(); party.travelReady.clear();
    if (!party.members.length) this.parties.delete(party.id);
    else if (party.leader === user) party.leader = party.members[0];
    for (const [id, invite] of this.invitations) if (invite.target === user || invite.from === user || invite.party === party.id) this.invitations.delete(id);
  }
  sweep() {
    for (const [id, limit] of this.limits) if (this.now() - limit.time > 300_000 || !this.options.lookup(id)) this.limits.delete(id);
    for (const party of [...this.parties.values()]) for (const user of [...party.members]) {
      const actor = this.options.lookup(user);
      if (!this.alive(actor) || actor.session !== party.session) { this.leave(user); continue; }
      const consent = party.ready.get(user); if (consent && !this.matches(actor, consent)) party.ready.delete(user);
      const combat = party.combatReady.get(user), current = combat && this.combatPlan(actor, combat.source, combat.target, combat.confirm);
      if (combat && (combat.expiresAt <= this.now() || !this.sameCombat(combat, current) || current!.generation !== combat.generation)) party.combatReady.delete(user);
      const travel = party.travelReady.get(user), currentTravel = travel && this.travelPlan(actor, travel.destination, travel.transport);
      if (travel && (!currentTravel || travel.expiresAt <= this.now() || travel.generation !== currentTravel.generation || travel.location !== currentTravel.location || travel.cost !== currentTravel.cost || travel.hours !== currentTravel.hours)) party.travelReady.delete(user);
    }
    for (const [id, invite] of this.invitations) {
      const party = this.parties.get(invite.party), target = this.options.lookup(invite.target);
      if (invite.expiresAt <= this.now() || !party || !this.alive(target) || target.session !== party.session || this.party(invite.target)) this.invitations.delete(id);
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
      return { id, name: member.name, isLeader: party.leader === id, here: member.profile.character.location === actor?.profile.character?.location,
        ready: party.ready.has(id) || party.combatReady.has(id) || party.travelReady.has(id), compatible: combatReference ? this.sameCombat(combatReference, this.combatPlan(member, combatReference.source, combatReference.target, combatReference.confirm)) : !!q && this.same(reference, this.plan(member, q, 'observe')),
        ...(combatReference ? { combatReady: party.combatReady.has(id) } : {}), ...(party.travelReady.size ? { travelReady: party.travelReady.has(id) } : {}) };
    }) ?? [];
    const travels = party && [...party.travelReady.values()], travel = travels?.[0];
    const battle = party && party.members.map(id => this.options.lookup(id)).filter(member => member?.profile.character?.location === actor?.profile.character?.location).map(member => member && this.options.battle?.(member.id, party.session)).find(Boolean);
    return { id: party?.id ?? null, members, invitations: [...this.invitations.values()].filter(invite => invite.target === user).map(invite => ({ id: invite.id, fromId: invite.from, fromName: this.options.lookup(invite.from)?.name ?? '', expiresAt: invite.expiresAt })),
      canStart: !!party && !combatReference && party.leader === user && members.length >= 2 && members.every(member => party.ready.has(member.id) && member.compatible),
      ...(party && this.options.startTravel ? { canStartTravel: party.leader === user && party.members.length >= 2 && travels!.length === party.members.length && travels!.every(entry => entry.location === travel!.location && entry.destination === travel!.destination && entry.transport === travel!.transport) } : {}),
      ...(party && travels!.length === party.members.length && travels!.length >= 2 ? { travelHours: Math.max(...travels!.map(plan => plan.hours)) } : {}),
      ...(party && this.options.vault ? { vault: this.options.vault(party.id) } : {}),
      ...(party?.chat.length ? { chat: party.chat.slice(-80) } : {}),
      ...(battle ? { battle: { id: battle.id, needsConfirmation: battle.source.startsWith('apex:') || battle.source.startsWith('challenge:') } } : {}),
      ...(combatReference ? { canStartCombat: party!.leader === user && members.length >= 2 && members.every(member => party!.combatReady.has(member.id) && member.compatible) } : {}) };
  }
  request(user: string, input: unknown): { error?: FantasyPartyError; updates?: FantasyGroupInvestigationResult['updates'] } {
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
      const id = `party-${randomUUID()}`; this.parties.set(id, { id, session: actor.session!, leader: user, members: [user], ready: new Map(), combatReady: new Map(), travelReady: new Map(), chat: [] }); return {};
    }
    if (input.type === 'respond') {
      const invite = this.invitations.get(input.invite);
      if (!invite || invite.target !== user) return { error: 'invite-expired' };
      const group = this.parties.get(invite.party)!;
      if (input.accept && party) return { error: 'already-in-party' };
      if (input.accept && group.members.length >= FANTASY_PARTY_MAX_MEMBERS) return { error: 'party-full' };
      this.invitations.delete(invite.id);
      if (input.accept) { group.members.push(user); group.ready.clear(); group.combatReady.clear(); group.travelReady.clear(); }
      return {};
    }
    if (!party) return { error: 'no-party' };
    if (input.type === 'leave') { const error = this.leave(user); return error ? { error } : {}; }
    if (input.type === 'unready') { this.invalidate(user); return {}; }
    if (input.type === 'chat') {
      party.chat.push({ id: randomUUID(), from: user, name: actor.name, text: input.text.trim(), at: this.now() });
      party.chat = party.chat.slice(-80); return {};
    }
    if (input.type === 'deposit' || input.type === 'requestWithdraw' || input.type === 'approveWithdraw') return this.options.vaultRequest?.(party, user, input) ?? { error: 'unavailable' };
    if (input.type === 'joinCombat') {
      const participant = party.members.find(id => this.options.battle?.(id, party.session)?.id === input.combatId);
      if (!participant || !this.options.joinCombat) return { error: 'incompatible' };
      const result = this.options.joinCombat(user, party.session, input.combatId, input.confirm);
      return result.error ? { error: result.error === 'save-failed' ? 'save-failed' : 'incompatible' } : { updates: result.updates };
    }
    if (input.type === 'readyTravel') {
      const plan = this.travelPlan(actor, input.destination, input.transport);
      if (!plan) return { error: 'incompatible' };
      this.invalidate(user); party.travelReady.set(user, plan); return {};
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
      const plan = this.combatPlan(actor, input.source, input.target, input.confirm);
      if (!plan) return { error: actor.profile.activity || actor.profile.event || actor.profile.combatId ? 'busy' : 'incompatible' };
      this.invalidate(user); party.combatReady.set(user, { ...plan, expiresAt: time + FANTASY_PARTY_TTL_MS }); return {};
    }
    if (party.leader !== user) return { error: 'leader-only' };
    if (party.members.length < 2) return { error: 'too-small' };
    if (input.type === 'startTravel') {
      if (!this.options.startTravel) return { error: 'unavailable' };
      const plans = party.members.map(id => party.travelReady.get(id));
      if (plans.some(plan => !plan)) return { error: 'not-ready' };
      const ready = plans as TravelConsent[];
      if (!ready.every(plan => plan.location === ready[0].location && plan.destination === ready[0].destination && plan.transport === ready[0].transport)) return { error: 'incompatible' };
      const result = this.options.startTravel(ready.map(({ expiresAt: _, cost, hours, ...plan }) => ({ ...plan, quotedCost: cost, quotedHours: hours })));
      if (result.error) return { error: result.error };
      party.travelReady.clear(); return { updates: result.updates };
    }
    if (input.type === 'startCombat') {
      if (!this.options.startCombat) return { error: 'unavailable' };
      if (!party.members.every(id => party.combatReady.has(id))) return { error: 'not-ready' };
      const plans = party.members.map(id => party.combatReady.get(id)!);
      if (!plans.every(plan => this.sameCombat(plans[0], plan))) return { error: 'incompatible' };
      const result = this.options.startCombat(plans.map(({ expiresAt: _, ...plan }) => plan));
      if (result.error) return { error: result.error === 'save-failed' ? 'save-failed' : 'incompatible' };
      party.ready.clear(); party.combatReady.clear(); return { updates: result.updates };
    }
    if (!party.members.every(id => party.ready.has(id))) return { error: 'not-ready' };
    const plans = party.members.map(id => party.ready.get(id)!);
    if (!plans.every(plan => this.same(plans[0], plan))) return { error: 'incompatible' };
    const result = this.options.start(plans.map(({ expiresAt: _, ...plan }) => plan));
    if (result.error) return { error: result.error };
    party.ready.clear(); return { updates: result.updates };
  }
}
