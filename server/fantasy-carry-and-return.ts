import type { FantasyCharacter, FantasyProfile } from '../shared/fantasy.ts';
import { FANTASY_ITEMS } from '../shared/fantasy-data.ts';
import { fantasyDungeonSiteFor, newFantasyDungeonProgress, rememberFantasyDungeonMemory } from '../shared/fantasy-dungeon.ts';
import { fantasyIsSaint } from '../shared/fantasy-miracles.ts';
import {
  FANTASY_DOWNED_CARE_HOURS, FANTASY_RETURN_LANTERN_FATIGUE, FANTASY_RETURN_LANTERN_HOURS, FANTASY_RETURN_LANTERN_MP,
  fantasyReturnLanternSiteAllowed, validFantasyCarryReturn,
  type FantasyCarryReturnMethod, type FantasyCarryState, type FantasyReturnLanternState,
} from '../shared/fantasy-carry-return.ts';

export interface FantasyCarryReturnContext { party: string; allies: readonly string[] }
export interface FantasyCarryReturnResult {
  profiles: Map<string, FantasyProfile>; updates: { user: string; profile: FantasyProfile }[]; error?: string;
}
type Character = FantasyCharacter & { carrying?: FantasyCarryState; returnLantern?: FantasyReturnLanternState; miracles?: { prepared: string[] } };
type Downed = NonNullable<FantasyCharacter['downed']> & { kind?: 'damage' | 'sacrifice'; careHours?: number; lastCareAt?: number };
const character = (profile: FantasyProfile | undefined) => profile?.character as Character | undefined;
const generation = (profile: FantasyProfile) => profile.generation ?? 1;
const inParty = (context: FantasyCarryReturnContext | undefined, ...users: string[]) => !!context?.party && users.every(user => context.allies.includes(user));
const active = (profile: FantasyProfile | undefined) => !!profile?.character && !profile.death && !profile.combatId;
const conscious = (profile: FantasyProfile | undefined) => active(profile) && profile!.character!.hp > 0 && !profile!.character!.downed;
const idle = (profile: FantasyProfile | undefined) => conscious(profile) && !profile!.activity && !profile!.event && !profile!.character!.travelPosition;
const prepared = (profile: FantasyProfile) => {
  const c = character(profile)!;
  return fantasyIsSaint(c) && !!c.miracles?.prepared.includes('miracle-return-lantern');
};
function samePlace(a: FantasyCharacter, b: FantasyCharacter): boolean {
  if (a.location !== b.location || a.travelPosition || b.travelPosition || a.dungeon?.active?.site !== b.dungeon?.active?.site || a.dungeon?.active?.room !== b.dungeon?.active?.room) return false;
  const site = a.dungeon?.active?.site;
  return !site || a.dungeon?.sites[site]?.layoutSeed === b.dungeon?.sites[site]?.layoutSeed;
}
function atAnchor(c: FantasyCharacter, anchor: Pick<FantasyCarryState, 'location' | 'site' | 'room'>): boolean {
  return c.location === anchor.location && c.dungeon?.active?.site === anchor.site && c.dungeon?.active?.room === anchor.room;
}
function carryingAnchor(c: FantasyCharacter) {
  const active = c.dungeon?.active;
  return { location: c.location, ...(active ? { site: active.site, room: active.room } : {}) };
}
function writeLog(profile: FantasyProfile, hour: number, text: string) {
  profile.character!.hour = Math.max(profile.character!.hour, hour);
  profile.log.push({ id: (profile.log.at(-1)?.id ?? 0) + 1, hour: profile.character!.hour, text, kind: 'system' });
  profile.log = profile.log.slice(-100);
}
function transaction(original: Map<string, FantasyProfile>) {
  const profiles = new Map(original), changed = new Set<string>();
  const edit = (user: string) => {
    if (!changed.has(user)) { profiles.set(user, structuredClone(profiles.get(user)!)); changed.add(user); }
    return profiles.get(user)!;
  };
  const finish = (): FantasyCarryReturnResult => {
    const updates = [...changed].map(user => { const profile = profiles.get(user)!; profile.revision++; return { user, profile }; });
    return { profiles, updates };
  };
  return { profiles, edit, finish };
}
function fail(profiles: Map<string, FantasyProfile>, error: string): FantasyCarryReturnResult { return { profiles: new Map(profiles), updates: [], error }; }

export function processFantasyCarryReturn(profiles: Map<string, FantasyProfile>, user: string, target: string, method: FantasyCarryReturnMethod, hour: number, context: FantasyCarryReturnContext): FantasyCarryReturnResult {
  if (!Number.isFinite(hour) || hour < 0 || !inParty(context, user, target)) return fail(profiles, 'carry:unavailable');
  const actor = profiles.get(user), other = profiles.get(target), c = character(actor), d = character(other);
  if (!actor || !other || !c || !d || !idle(actor) || !active(other) || !validFantasyCarryReturn(c) || !validFantasyCarryReturn(d) || !samePlace(c, d)) return fail(profiles, 'carry:unavailable');
  if (c.returnLantern && !['returnAccept', 'returnDecline'].includes(method)) return fail(profiles, 'return:pending');
  const tx = transaction(profiles);
  if (method === 'carry') {
    if (user === target || !d.downed || d.hp !== 0 || hour >= d.downed.expiresAt) return fail(profiles, 'carry:patient');
    if (c.carrying || [...profiles.values()].some(profile => character(profile)?.carrying?.target === target)) return fail(profiles, 'carry:occupied');
    const helper = tx.edit(user), patient = tx.edit(target);
    character(helper)!.carrying = { target, targetGeneration: generation(other), generation: generation(actor), party: context.party, ...carryingAnchor(c) };
    writeLog(helper, hour, 'carry:started'); writeLog(patient, hour, 'carry:patient-started');
    return tx.finish();
  }
  if (method === 'putDown') {
    if (c.carrying?.target !== target || c.carrying.targetGeneration !== generation(other) || c.carrying.generation !== generation(actor) || c.carrying.party !== context.party) return fail(profiles, 'carry:unavailable');
    const helper = tx.edit(user), patient = tx.edit(target); delete character(helper)!.carrying;
    writeLog(helper, hour, 'carry:put-down'); writeLog(patient, hour, 'carry:patient-put-down');
    return tx.finish();
  }
  if (method === 'tend') {
    const downed = d.downed as Downed | undefined;
    if (user === target || !downed || downed.kind === 'sacrifice' || d.hp !== 0 || hour < downed.since || hour >= downed.expiresAt) return fail(profiles, 'carry:patient');
    if ((downed.careHours ?? 0) + 2 > FANTASY_DOWNED_CARE_HOURS) return fail(profiles, 'carry:care-limit');
    if (downed.lastCareAt !== undefined && hour < downed.lastCareAt + 1) return fail(profiles, 'carry:care-wait');
    const potion = FANTASY_ITEMS.find(item => (c.inventory[item.id] ?? 0) > 0 && (item.id === 'potion' || item.category === 'potion' && (item.use?.hp ?? 0) > 0) && !item.food && item.category !== 'food');
    if (!potion) return fail(profiles, 'carry:care-potion');
    const helper = tx.edit(user), patient = tx.edit(target), nextDowned = character(patient)!.downed as Downed;
    character(helper)!.inventory[potion.id]--; nextDowned.careHours = (nextDowned.careHours ?? 0) + 2; nextDowned.lastCareAt = hour; nextDowned.expiresAt += 2;
    writeLog(helper, hour, 'carry:tended'); writeLog(patient, hour, 'carry:tended');
    return tx.finish();
  }
  if (method === 'returnInvite') {
    if (user !== target) return fail(profiles, 'return:invitation');
    if (!prepared(actor)) return fail(profiles, 'return:saint');
    if (!fantasyReturnLanternSiteAllowed(c)) return fail(profiles, 'return:sealed');
    if (c.mp < FANTASY_RETURN_LANTERN_MP || c.fatigue + FANTASY_RETURN_LANTERN_FATIGUE > 100) return fail(profiles, 'return:cost');
    const helper = tx.edit(user), next = character(helper)!, position = c.dungeon!.active!;
    const invited = [...new Set(context.allies)].filter(id => id !== user).flatMap(id => {
      const profile = profiles.get(id), candidate = character(profile);
      return profile && candidate && idle(profile) && !candidate.returnLantern && samePlace(c, candidate) ? [{ user: id, generation: generation(profile) }] : [];
    });
    if (invited.length > 5) return fail(profiles, 'carry:unavailable');
    next.mp -= FANTASY_RETURN_LANTERN_MP; next.fatigue += FANTASY_RETURN_LANTERN_FATIGUE;
    next.returnLantern = { party: context.party, generation: generation(actor), site: position.site, room: position.room, location: c.location, invited, accepted: [], startedAt: hour, endsAt: hour + FANTASY_RETURN_LANTERN_HOURS };
    writeLog(helper, hour, 'return:started');
    return tx.finish();
  }
  if (method === 'returnAccept' || method === 'returnDecline') {
    const invitation = d.returnLantern;
    if (user === target || c.returnLantern || !invitation || invitation.party !== context.party || invitation.generation !== generation(other) || hour < invitation.startedAt || hour >= invitation.endsAt || !invitation.invited.some(invite => invite.user === user && invite.generation === generation(actor)) || !atAnchor(c, invitation)) return fail(profiles, 'return:invitation');
    const caster = tx.edit(target), responder = tx.edit(user), pending = character(caster)!.returnLantern!;
    pending.accepted = pending.accepted.filter(id => id !== user);
    if (method === 'returnAccept') pending.accepted.push(user);
    else pending.invited = pending.invited.filter(invite => invite.user !== user);
    writeLog(responder, hour, method === 'returnAccept' ? 'return:accepted' : 'return:declined');
    return tx.finish();
  }
  return fail(profiles, 'carry:unavailable');
}

function setCarriedPosition(patient: FantasyCharacter, carrier: FantasyCharacter) {
  patient.location = carrier.location;
  if (!patient.visited.includes(carrier.location)) patient.visited.push(carrier.location);
  if (carrier.travelPosition) patient.travelPosition = structuredClone(carrier.travelPosition); else delete patient.travelPosition;
  const active = carrier.dungeon?.active;
  if (!active) { if (patient.dungeon) delete patient.dungeon.active; return; }
  patient.dungeon ??= { sites: {} };
  const seed = carrier.dungeon!.sites[active.site]?.layoutSeed;
  let progress = patient.dungeon.sites[active.site];
  if (!progress || progress.layoutSeed !== seed) {
    if (progress) rememberFantasyDungeonMemory(patient, active.site);
    progress = patient.dungeon.sites[active.site] = newFantasyDungeonProgress(seed);
  }
  if (!progress.revealed.includes(active.room)) progress.revealed.push(active.room);
  progress.visited ??= []; if (!progress.visited.includes(active.room)) progress.visited.push(active.room);
  patient.dungeon.active = { ...active };
}

export function advanceFantasyCarryReturn(profiles: Map<string, FantasyProfile>, hour: number, contextForUser: (user: string) => FantasyCarryReturnContext | undefined): FantasyCarryReturnResult {
  if (!Number.isFinite(hour) || hour < 0) return fail(profiles, 'carry:unavailable');
  const tx = transaction(profiles);
  for (const [user, actor] of tx.profiles) {
    const c = character(actor), link = c?.carrying;
    if (!c || !link) continue;
    const patient = tx.profiles.get(link.target), d = character(patient), context = contextForUser(user);
    if(actor.combatId&&c.hp>0&&!actor.death&&patient&&active(patient)&&d?.downed&&d.hp===0&&hour<d.downed.expiresAt&&link.generation===generation(actor)&&link.targetGeneration===generation(patient)&&context?.party===link.party&&inParty(context,user,link.target)&&atAnchor(d,link))continue;
    const valid = active(actor) && c.hp > 0 && !c.downed && !!patient && active(patient) && !!d?.downed && d.hp === 0 && hour < d.downed.expiresAt
      && link.generation === generation(actor) && link.targetGeneration === generation(patient!) && context?.party === link.party && inParty(context, user, link.target) && atAnchor(d!, link);
    if (!valid) {
      const helper = tx.edit(user); delete character(helper)!.carrying; writeLog(helper, hour, 'carry:ended');
      continue;
    }
    const site = c.dungeon?.active?.site;
    if (!atAnchor(c, carryingAnchor(d!)) || site && c.dungeon?.sites[site]?.layoutSeed !== d!.dungeon?.sites[site]?.layoutSeed || JSON.stringify(c.travelPosition) !== JSON.stringify(d!.travelPosition)) {
      const helper = tx.edit(user), carried = tx.edit(link.target), hc = character(helper)!, pc = character(carried)!;
      setCarriedPosition(pc, hc); pc.hour = Math.max(pc.hour, hc.hour, hour);
      hc.carrying = { ...link, ...carryingAnchor(hc) };
      if (!hc.dungeon?.active) { delete hc.carrying.site; delete hc.carrying.room; }
    }
  }
  for (const [user, source] of tx.profiles) {
    const c = character(source), lantern = c?.returnLantern;
    if (!c || !lantern) continue;
    const context = contextForUser(user);
    if (!idle(source) || !prepared(source) || !validFantasyCarryReturn(c) || context?.party !== lantern.party || !inParty(context, user) || generation(source) !== lantern.generation || !atAnchor(c, lantern) || !fantasyReturnLanternSiteAllowed(c)) {
      const caster = tx.edit(user); delete character(caster)!.returnLantern; writeLog(caster, hour, 'return:cancelled');
      continue;
    }
    const invited = lantern.invited.filter(invitation => {
      const profile = tx.profiles.get(invitation.user), member = character(profile);
      return profile && member && idle(profile) && !member.returnLantern && invitation.generation === generation(profile) && inParty(context, user, invitation.user) && samePlace(c, member);
    });
    const accepted = lantern.accepted.filter(id => invited.some(invitation => invitation.user === id));
    if (invited.length !== lantern.invited.length || accepted.length !== lantern.accepted.length) {
      const state = character(tx.edit(user))!.returnLantern!; state.invited = invited; state.accepted = accepted;
    }
    if (hour < lantern.endsAt) continue;
    const site = fantasyDungeonSiteFor(c, lantern.site);
    if (!site) { const caster = tx.edit(user); delete character(caster)!.returnLantern; writeLog(caster, hour, 'return:cancelled'); continue; }
    const travellers = [user, ...accepted.filter(id => {
      const profile = tx.profiles.get(id), member = character(profile), invitation = invited.find(invite => invite.user === id);
      return profile && member && idle(profile) && !member.returnLantern && invitation?.generation === generation(profile) && inParty(context, user, id) && samePlace(c, member);
    })];
    const patients: { carrier: string; patient: string }[] = [];
    for (const id of travellers) {
      const profile = tx.profiles.get(id)!, carrier = character(profile)!, link = carrier.carrying, patient = link && tx.profiles.get(link.target), downed = character(patient);
      if (link && patient && downed?.downed && active(patient) && downed.hp === 0 && hour < downed.downed.expiresAt && link.generation === generation(profile) && link.targetGeneration === generation(patient) && link.party === lantern.party && inParty(context, id, link.target) && samePlace(carrier, downed)) patients.push({ carrier: id, patient: link.target });
      const moved = tx.edit(id), mc = character(moved)!;
      mc.dungeon!.active!.room = site.entry;
      const progress = mc.dungeon!.sites[lantern.site];
      if (!progress.revealed.includes(site.entry)) progress.revealed.push(site.entry);
      progress.visited ??= []; if (!progress.visited.includes(site.entry)) progress.visited.push(site.entry);
      delete mc.returnLantern; writeLog(moved, hour, 'return:completed');
    }
    for (const { carrier, patient } of patients) {
      const helper = tx.edit(carrier), carried = tx.edit(patient), hc = character(helper)!, pc = character(carried)!;
      setCarriedPosition(pc, hc); hc.carrying = { ...hc.carrying!, ...carryingAnchor(hc) };
      writeLog(carried, hour, 'return:completed');
    }
  }
  return tx.finish();
}
