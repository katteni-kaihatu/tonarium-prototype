import type { FantasyCharacter, FantasyProfile } from '../shared/fantasy.ts';
import { FANTASY_QUESTS } from '../shared/fantasy-data.ts';
import { fantasyQuestRecordEligible } from '../shared/fantasy-access.ts';
import { grantFantasyExperience } from '../shared/fantasy-engine.ts';

import type { FantasyPartyContractMember, FantasyPartyContractRecord } from '../shared/fantasy-party-contracts.ts';
export type { FantasyPartyContractMember, FantasyPartyContractRecord } from '../shared/fantasy-party-contracts.ts';
export interface FantasyPartyContractSnapshot { parties: { id: string; leader: string; members: string[] }[] }
export interface FantasyPartyContractResult { profiles: Map<string, FantasyProfile>; changed: boolean; error?: 'invalid-party-contract' | 'invalid-party-payment'; shares?: Record<string, number> }
type LinkedCharacter = FantasyCharacter & { contractParties?: Record<string, FantasyPartyContractRecord> };
const character = (p?: FantasyProfile) => p?.character as LinkedCharacter | null | undefined;
const link = (p: FantasyProfile | undefined, quest: string) => character(p)?.contractParties?.[quest];
const identity = (user: string, p: FantasyProfile): FantasyPartyContractMember => ({ user, generation: p.generation ?? 1, lifeStartedAt: p.character!.lifeStartedAt ?? 0 });
const sameLife = (member: FantasyPartyContractMember, p?: FantasyProfile) => !!p?.character && !p.death && member.generation === (p.generation ?? 1) && member.lifeStartedAt === (p.character.lifeStartedAt ?? 0);
const unchanged = (profiles: ReadonlyMap<string, FantasyProfile>, error?: FantasyPartyContractResult['error']): FantasyPartyContractResult => ({ profiles: new Map(profiles), changed: false, ...(error ? { error } : {}) });
function valid(record: FantasyPartyContractRecord): boolean {
  return typeof record.offer === 'string' && !!record.offer && typeof record.party === 'string' && !!record.party && typeof record.owner === 'string' && !!record.owner
    && Number.isSafeInteger(record.totalGold) && record.totalGold >= 0 && record.totalGold <= 1_000_000_000
    && Array.isArray(record.members) && record.members.length >= 1 && record.members.length <= 6 && record.members.every(member => plain(member)) && new Set(record.members.map(member => member.user)).size === record.members.length
    && record.members.some(member => member.user === record.owner) && record.members.every(member => typeof member.user === 'string' && !!member.user && Number.isSafeInteger(member.generation) && member.generation >= 1
      && Number.isFinite(member.lifeStartedAt) && member.lifeStartedAt >= 0 && (member.participated === undefined || member.participated === true)) && (record.paid === undefined || record.paid === true);
}
const plain = (value: unknown): value is Record<string, unknown> => !!value && typeof value === 'object' && !Array.isArray(value) && [Object.prototype, null].includes(Object.getPrototypeOf(value));
const safeText = (value: unknown): value is string => typeof value === 'string' && value.length > 0 && value.length <= 160 && !/[\u0000-\u001f\u007f]/.test(value) && !['__proto__', 'constructor', 'prototype'].includes(value);
const fields = (value: Record<string, unknown>, required: string[], optional: string[] = []) => required.every(key => Object.hasOwn(value, key)) && Object.keys(value).every(key => required.includes(key) || optional.includes(key));

export function validFantasyPartyContracts(c: FantasyCharacter, own?: { user: string; generation: number }): boolean {
  const records = (c as LinkedCharacter).contractParties;
  if (records === undefined) return true;
  if (!plain(records) || Object.keys(records).length > FANTASY_QUESTS.length) return false;
  return Object.entries(records).every(([quest, record]) => {
    if (!safeText(quest) || !FANTASY_QUESTS.some(entry => entry.id === quest) || !plain(record) || !fields(record, ['offer', 'party', 'owner', 'members', 'totalGold'], ['paid']) || !valid(record as unknown as FantasyPartyContractRecord)
      || !safeText(record.offer) || !safeText(record.party) || !safeText(record.owner) || !(record.members as FantasyPartyContractMember[]).every(member => plain(member) && fields(member as unknown as Record<string, unknown>, ['user', 'generation', 'lifeStartedAt'], ['participated']) && safeText(member.user))) return false;
    const entry = record as unknown as FantasyPartyContractRecord;
    if (!entry.members.some(member => member.lifeStartedAt === (c.lifeStartedAt ?? 0) && (!own || member.user === own.user && member.generation === own.generation))) return false;
    const grant = c.contracts?.[quest];
    return entry.paid ? !grant && !c.quests.includes(quest) : c.quests.includes(quest) && !!grant && grant.offerId === entry.offer && grant.gold === entry.totalGold;
  });
}
function partyFor(snapshot: FantasyPartyContractSnapshot, owner: string, id?: string) {
  const found = snapshot.parties.filter(party => party.members.includes(owner) && (!id || party.id === id));
  const party = found.length === 1 ? found[0] : undefined;
  return party && party.members.length <= 6 && party.members.includes(party.leader) && new Set(party.members).size === party.members.length ? party : undefined;
}
function replaceLink(profiles: Map<string, FantasyProfile>, member: FantasyPartyContractMember, quest: string, record: FantasyPartyContractRecord) {
  const source = profiles.get(member.user); if (!sameLife(member, source)) return;
  const p = structuredClone(source!), c = character(p)!; c.contractParties ??= {}; c.contractParties[quest] = structuredClone(record); p.revision++; profiles.set(member.user, p);
}

export function fantasyPartyContractSupport(profiles: ReadonlyMap<string, FantasyProfile>, actor: string, quest: string): string | undefined {
  const local = link(profiles.get(actor), quest); if (!local || local.owner === actor || local.paid) return;
  const owner = link(profiles.get(local.owner), quest);
  return owner && !owner.paid && owner.offer === local.offer && owner.members.some(member => member.user === actor && sameLife(member, profiles.get(actor))) ? owner.owner : undefined;
}

export function enrollFantasyPartyContract(before: ReadonlyMap<string, FantasyProfile>, after: ReadonlyMap<string, FantasyProfile>, owner: string, quest: string, snapshot: FantasyPartyContractSnapshot): FantasyPartyContractResult {
  const source = before.get(owner), accepted = after.get(owner), c = character(accepted), grant = c?.contracts?.[quest];
  if (!source?.character || !c || source.character.quests.includes(quest) || !c.quests.includes(quest) || !grant || link(accepted, quest)?.offer === grant.offerId) return unchanged(after);
  const party = partyFor(snapshot, owner); if (!party) return unchanged(after);
  if (fantasyPartyContractSupport(before, owner, quest)) return unchanged(after, 'invalid-party-contract');
  const canonical = FANTASY_QUESTS.find(entry => entry.id === quest);
  const users = [owner, ...party.members.filter(user => user !== owner).sort()];
  const members = users.filter(user => {
    const p = after.get(user), member = character(p);
    if (!p || !member || p.death || member.location !== c.location || p.activity || p.combatId || p.event) return false;
    if (user === owner) return sameLife(identity(owner, source), accepted);
    return !!canonical && fantasyQuestRecordEligible(member, { ...canonical, jobs: undefined }) && !member.completed.includes(quest) && !member.quests.includes(quest) && !member.contracts?.[quest] && !link(p, quest);
  }).map(user => identity(user, after.get(user)!));
  const record: FantasyPartyContractRecord = { offer: grant.offerId, party: party.id, owner, members, totalGold: grant.gold };
  if (!valid(record)) return unchanged(after, 'invalid-party-contract');
  const profiles = new Map(after);
  for (const member of members) {
    replaceLink(profiles, member, quest, record);
    if (member.user !== owner) {
      const c = character(profiles.get(member.user))!; c.quests.push(quest); c.contracts ??= {}; c.contracts[quest] = structuredClone(grant);
    }
  }
  return { profiles, changed: true };
}

export function refreshFantasyPartyContract(source: ReadonlyMap<string, FantasyProfile>, owner: string, quest: string, snapshot: FantasyPartyContractSnapshot): FantasyPartyContractResult {
  const saved = link(source.get(owner), quest), ownerProfile = source.get(owner), c = character(ownerProfile);
  if (!saved || saved.owner !== owner || saved.paid || !c?.quests.includes(quest)) return unchanged(source);
  if (!valid(saved) || !saved.members.some(member => member.user === owner && sameLife(member, ownerProfile)) || c.contracts?.[quest]?.offerId !== saved.offer || c.contracts[quest].gold !== saved.totalGold) return unchanged(source, 'invalid-party-contract');
  const party = partyFor(snapshot, owner, saved.party); if (!party) return unchanged(source);
  const record = structuredClone(saved), profiles = new Map(source); let changed = false;
  const canonical = FANTASY_QUESTS.find(entry => entry.id === quest);
  record.members = record.members.filter(member => {
    if (party.members.includes(member.user) && sameLife(member, source.get(member.user))) return true;
    if (member.user === owner) return true;
    const p = source.get(member.user);
    if (link(p, quest)?.offer === record.offer) {
      const next = structuredClone(p!), c = character(next)!;
      delete c.contractParties![quest];
      if (c.contracts?.[quest]?.offerId === record.offer) { delete c.contracts[quest]; c.quests = c.quests.filter(id => id !== quest); if (c.taskProgress) delete c.taskProgress[quest]; }
      next.revision++; profiles.set(member.user, next);
    }
    changed = true; return false;
  });
  for (const user of [...party.members].sort()) {
    if (record.members.some(member => member.user === user)) continue;
    const p = profiles.get(user), member = character(p);
    if (!p || !member || p.death || member.location !== c.location || p.activity || p.combatId || p.event || !canonical || !fantasyQuestRecordEligible(member, { ...canonical, jobs: undefined }) || member.completed.includes(quest) || member.quests.includes(quest) || member.contracts?.[quest] || link(p, quest)) continue;
    record.members.push(identity(user, p)); changed = true;
  }
  if (!changed) return unchanged(source);
  for (const member of record.members) {
    replaceLink(profiles, member, quest, record);
    if (member.user !== owner) { const c = character(profiles.get(member.user))!; if (!c.quests.includes(quest)) c.quests.push(quest); c.contracts ??= {}; c.contracts[quest] ??= structuredClone(ownerProfile!.character!.contracts![quest]); }
  }
  return { profiles, changed: true };
}

/** users は通信要求ではなく、共有場面にいた人物のサーバー記録から渡す。 */
export function markFantasyPartyContractParticipation(source: ReadonlyMap<string, FantasyProfile>, owner: string, quest: string, users: readonly string[], snapshot: FantasyPartyContractSnapshot): FantasyPartyContractResult {
  const saved = link(source.get(owner), quest); if (!saved || saved.paid || saved.owner !== owner) return unchanged(source);
  if (!valid(saved)) return unchanged(source, 'invalid-party-contract');
  const party = partyFor(snapshot, owner, saved.party), location = source.get(owner)?.character?.location;
  if (!party || !location) return unchanged(source);
  const record = structuredClone(saved); let changed = false;
  for (const member of record.members) {
    const p = source.get(member.user);
    if (!member.participated && users.includes(member.user) && party.members.includes(member.user) && sameLife(member, p) && p!.character!.location === location) { member.participated = true; changed = true; }
  }
  if (!changed) return unchanged(source);
  const profiles = new Map(source);
  for (const member of record.members) if (link(profiles.get(member.user), quest)?.offer === record.offer) replaceLink(profiles, member, quest, record);
  return { profiles, changed: true };
}

export function settleFantasyPartyContract(before: ReadonlyMap<string, FantasyProfile>, after: ReadonlyMap<string, FantasyProfile>, owner: string, quest: string, snapshot: FantasyPartyContractSnapshot): FantasyPartyContractResult {
  const original = before.get(owner), finished = after.get(owner), c = character(original), done = character(finished), record = link(original, quest);
  if (!record || record.owner !== owner || record.paid || link(finished, quest)?.paid || !c || !done || !c.quests.includes(quest) || c.completed.includes(quest) || done.quests.includes(quest) || !done.completed.includes(quest)) return unchanged(after);
  const grant = c.contracts?.[quest];
  const payout = done.gold - c.gold;
  // 呼出元は副収入を加える前に、依頼の加算額だけを渡す。
  if (!valid(record) || link(finished, quest)?.offer !== record.offer || !grant || grant.offerId !== record.offer || grant.gold !== record.totalGold || !sameLife(identity(owner, original!), finished)
    || !Number.isSafeInteger(payout) || payout <= 0 || payout < record.totalGold || payout > record.totalGold + 1000) return unchanged(after, 'invalid-party-contract');
  const party = partyFor(snapshot, owner, record.party), recipients = record.members.filter(member => {
    const p = after.get(member.user);
    return sameLife(member, p) && (member.user === owner || !!member.participated && !!party?.members.includes(member.user) && link(p, quest)?.offer === record.offer);
  }).sort((a, b) => a.user === owner ? -1 : b.user === owner ? 1 : a.user.localeCompare(b.user));
  if (!recipients.length || !recipients.some(member => member.user === owner)) return unchanged(after, 'invalid-party-contract');
  const unit = Math.floor(payout / recipients.length), remainder = payout % recipients.length;
  const shares: Record<string, number> = Object.fromEntries(recipients.map((member, index) => [member.user, unit + (index < remainder ? 1 : 0)]));
  for (const member of recipients) {
    const gold = after.get(member.user)!.character!.gold - (member.user === owner ? payout : 0) + shares[member.user];
    if (!Number.isSafeInteger(gold) || gold < 0) return unchanged(after, 'invalid-party-payment');
  }
  const profiles = new Map(after), paid = { ...structuredClone(record), paid: true as const };
  for (const member of record.members) {
    const p = profiles.get(member.user); if (!sameLife(member, p) || link(p, quest)?.offer !== record.offer) continue;
    if (member.user !== owner && !Object.hasOwn(shares, member.user)) {
      const next = structuredClone(p!); delete character(next)!.contractParties![quest]; next.revision++; profiles.set(member.user, next);
    } else replaceLink(profiles, member, quest, paid);
    const c = character(profiles.get(member.user))!;
    if (member.user !== owner) {
      c.quests = c.quests.filter(id => id !== quest); if (c.contracts) delete c.contracts[quest]; if (c.taskProgress) delete c.taskProgress[quest];
      if (Object.hasOwn(shares, member.user) && !c.completed.includes(quest)) {
        c.completed.push(quest);
        const canonical = FANTASY_QUESTS.find(entry => entry.id === quest);
        if (canonical) {
          const hp = c.hp, mp = c.mp;
          grantFantasyExperience(profiles.get(member.user)!, canonical.xp);
          c.hp = hp; c.mp = mp;
        }
      }
    }
  }
  for (const member of recipients) {
    const c = character(profiles.get(member.user))!;
    c.gold += shares[member.user] - (member.user === owner ? payout : 0);
  }
  return { profiles, changed: true, shares };
}

/** 達成の配当後に呼び、放棄や離脱で失効した同行分だけを片付ける。 */
export function reconcileFantasyPartyContracts(source: ReadonlyMap<string, FantasyProfile>, snapshot: FantasyPartyContractSnapshot): FantasyPartyContractResult {
  const profiles = new Map(source), groups = new Map<string, { quest: string; record: FantasyPartyContractRecord }>();
  const matches = (a: FantasyPartyContractRecord | undefined, b: FantasyPartyContractRecord) => !!a && !a.paid && a.owner === b.owner && a.offer === b.offer && a.party === b.party;
  for (const p of source.values()) for (const [quest, record] of Object.entries(character(p)?.contractParties ?? {})) {
    if (!plain(record) || !valid(record)) return unchanged(source, 'invalid-party-contract');
    if (record.paid) continue;
    groups.set(JSON.stringify([quest, record.owner, record.offer, record.party]), { quest, record });
  }
  let changed = false;
  const clear = (user: string, quest: string, record: FantasyPartyContractRecord, preserveOwnerClaim = true) => {
    const source = profiles.get(user); if (!matches(link(source, quest), record)) return;
    const p = structuredClone(source!), c = character(p)!;
    delete c.contractParties![quest];
    if ((user !== record.owner || !preserveOwnerClaim) && (!c.contracts?.[quest] || c.contracts[quest].offerId === record.offer)) {
      if (c.contracts) delete c.contracts[quest]; c.quests = c.quests.filter(id => id !== quest); if (c.taskProgress) delete c.taskProgress[quest];
    }
    p.revision++; profiles.set(user, p); changed = true;
  };
  for (const { quest, record: candidate } of groups.values()) {
    // 読込対象外の所有者は、死亡・放棄と推定しない。
    if (!profiles.has(candidate.owner)) continue;
    const owner = profiles.get(candidate.owner), c = character(owner), saved = link(owner, quest);
    if (saved?.paid) continue;
    const record = matches(saved, candidate) ? saved! : candidate;
    if (matches(saved, candidate) && c?.completed.includes(quest) && !c.quests.includes(quest) && !c.contracts?.[quest]) continue;
    const ownerMember = record.members.find(member => member.user === record.owner);
    const party = partyFor(snapshot, record.owner, record.party);
    const validOwnerClaim = matches(saved, candidate) && !!ownerMember && sameLife(ownerMember, owner) && !!c?.quests.includes(quest)
      && c.contracts?.[quest]?.offerId === record.offer && c.contracts[quest].gold === record.totalGold;
    const active = validOwnerClaim && !!party;
    if (!active) {
      for (const user of profiles.keys()) clear(user, quest, candidate, validOwnerClaim && !party);
      continue;
    }
    const next = structuredClone(record);
    next.members = next.members.filter(member => {
      if (member.user === record.owner) return true;
      const p = profiles.get(member.user), c = character(p);
      if (!party.members.includes(member.user)) return false;
      if (!p) return true;
      return sameLife(member, p) && matches(link(p, quest), record) && !!c?.quests.includes(quest) && !c.completed.includes(quest) && c.contracts?.[quest]?.offerId === record.offer;
    });
    const kept = new Set(next.members.map(member => member.user));
    for (const user of profiles.keys()) if (!kept.has(user)) clear(user, quest, record);
    if (next.members.length !== record.members.length) {
      for (const member of next.members) if (matches(link(profiles.get(member.user), quest), record)) replaceLink(profiles, member, quest, next);
      changed = true;
    }
  }
  return changed ? { profiles, changed: true } : unchanged(source);
}
