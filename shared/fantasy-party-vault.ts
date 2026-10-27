import type { FantasyFoodLot, FantasyGearInstance, FantasyProfile } from './fantasy.ts';
import { FANTASY_ITEMS } from './fantasy-data.ts';
import { FANTASY_MAPS } from './fantasy-town.ts';
import { foodMeta } from './fantasy-life.ts';
import { fantasySpendItem, validFantasyGear } from './fantasy-equipment.ts';

export interface FantasyPartyVaultLot {
  id: string; item: string; count: number; donor: string; generation: number; name: string;
  food?: FantasyFoodLot[]; gear?: FantasyGearInstance;
}
export interface FantasyPartyWithdrawal { id: string; user: string; generation: number; name: string; lot: string; count: number }
export interface FantasyPartyVault { revision: number; lots: FantasyPartyVaultLot[]; requests: FantasyPartyWithdrawal[] }
export type FantasyPartyVaults = Record<string, FantasyPartyVault>;
export type FantasyPartyVaultCommand =
  | { type: 'deposit'; revision: number; item: string; count: number; instance?: string }
  | { type: 'requestWithdraw'; revision: number; lot: string; count: number }
  | { type: 'approveWithdraw'; revision: number; request: string; approve: boolean };
export interface FantasyPartyVaultContext { id: string; leader: string; members: string[] }
export interface FantasyPartyVaultResult { vaults: FantasyPartyVaults; profiles: Map<string, FantasyProfile>; changed: boolean; error?: string }
const integer = (v: unknown, min = 0): v is number => Number.isSafeInteger(v) && Number(v) >= min;
const object = (v: unknown): v is Record<string, unknown> => !!v && typeof v === 'object' && !Array.isArray(v);
const text = (v: unknown): v is string => typeof v === 'string' && v.length > 0 && v.length <= 200 && !/[\u0000-\u001f\u007f]/.test(v);
const knownItem = (id: string) => FANTASY_ITEMS.some(item => item.id === id) || FANTASY_MAPS.some(map => map.item === id);
export const newFantasyPartyVault = (): FantasyPartyVault => ({ revision: 0, lots: [], requests: [] });

export function validFantasyPartyVaults(value: unknown): value is FantasyPartyVaults {
  return object(value) && Object.entries(value).every(([key, v]) => text(key) && object(v) && integer(v.revision)
    && Array.isArray(v.lots) && v.lots.length <= 500 && Array.isArray(v.requests) && v.requests.length <= 100
    && v.lots.every(lot => object(lot) && text(lot.id) && typeof lot.item === 'string' && knownItem(lot.item)
      && integer(lot.count, 1) && text(lot.donor) && integer(lot.generation, 1) && text(lot.name)
      && (!!foodMeta(lot.item) === Array.isArray(lot.food))
      && (lot.food === undefined || Array.isArray(lot.food) && !!foodMeta(lot.item) && lot.food.every(f => object(f) && text(f.id)
        && f.item === lot.item && integer(f.count, 1) && typeof f.createdAt === 'number' && Number.isFinite(f.createdAt) && f.createdAt >= 0)
        && lot.food.reduce((sum, f) => sum + Number(f.count), 0) === lot.count)
      && (lot.gear === undefined || object(lot.gear) && lot.count === 1 && text(lot.gear.id) && lot.gear.item === lot.item
        && integer(lot.gear.quality, 1) && Number(lot.gear.quality) <= 5 && typeof lot.gear.createdAt === 'number' && Number.isFinite(lot.gear.createdAt)
        && validFantasyGear({ gear: [lot.gear], hour: lot.gear.createdAt, inventory: { [lot.item]: 1 } } as unknown as NonNullable<FantasyProfile['character']>)))
    && new Set(v.lots.map(lot => lot.id)).size === v.lots.length
    && v.requests.every(r => object(r) && text(r.id) && text(r.user) && text(r.name) && integer(r.generation, 1)
      && text(r.lot) && integer(r.count, 1) && (v.lots as FantasyPartyVaultLot[]).some(lot => lot.id === r.lot && lot.count >= Number(r.count)))
    && new Set(v.requests.map(r => r.id)).size === v.requests.length);
}

function deliver(profile: FantasyProfile, lot: FantasyPartyVaultLot, amount: number, suffix: string) {
  const c = profile.character!;
  c.inventory[lot.item] = (c.inventory[lot.item] ?? 0) + amount;
  if (lot.gear) { c.gear ??= []; c.gear.push({ ...lot.gear, id: `gear-shared-${suffix}-${lot.id}`.slice(0, 110) }); }
  if (lot.food) {
    let remaining = amount;
    for (const [index, food] of lot.food.entries()) {
      const n = Math.min(food.count, remaining); if (!n) continue;
      c.foodLots.push({ ...food, id: `food-shared-${suffix}-${lot.id}-${index}`.slice(0, 150), count: n }); food.count -= n; remaining -= n;
    }
    lot.food = lot.food.filter(food => food.count > 0);
  }
  lot.count -= amount;
  profile.revision++;
}

export function applyFantasyPartyVault(vaults: FantasyPartyVaults, profiles: ReadonlyMap<string, FantasyProfile>, party: FantasyPartyVaultContext, actor: string, command: FantasyPartyVaultCommand, token: string): FantasyPartyVaultResult {
  const fail = (error: string): FantasyPartyVaultResult => ({ vaults, profiles: new Map(profiles), changed: false, error });
  const before = profiles.get(actor), c = before?.character;
  if (!party.members.includes(actor) || !c || before!.death || c.hp <= 0) return fail('not-alive');
  if (before!.activity || before!.combatId || before!.event) return fail('busy');
  if (profiles.get(party.leader)?.character?.location !== c.location) return fail('busy');
  const prior = vaults[party.id] ?? newFantasyPartyVault();
  if (command.revision !== prior.revision) return fail('stale');
  const next = structuredClone(vaults), current = structuredClone(before!), updated = new Map(profiles);
  const vault = next[party.id] ??= newFantasyPartyVault(); updated.set(actor, current);
  if (command.type === 'deposit') {
    if (!knownItem(command.item) || !integer(command.count, 1) || command.count > 999 || vault.lots.length >= 500) return fail('invalid');
    const character = current.character!, ownedGear = character.gear?.filter(g => g.item === command.item) ?? [];
    const gear = command.instance ? ownedGear.find(g => g.id === command.instance) : undefined;
    if (command.instance && (!gear || command.count !== 1)) return fail('invalid');
    if (!command.instance && !foodMeta(command.item) && (character.inventory[command.item] ?? 0) - ownedGear.length < command.count) return fail('equipped');
    const foods: FantasyFoodLot[] = [];
    if (foodMeta(command.item)) {
      let remaining = command.count;
      for (const lot of character.foodLots.filter(f => f.item === command.item).sort((a, b) => a.createdAt - b.createdAt)) {
        const count = Math.min(remaining, lot.count); if (!count) continue;
        foods.push({ ...lot, count }); lot.count -= count; remaining -= count;
      }
      if (remaining) return fail('invalid');
      character.foodLots = character.foodLots.filter(f => f.count > 0);
    }
    if (!fantasySpendItem(character, command.item, command.count, command.instance)) return fail('equipped');
    vault.lots.push({ id: token, item: command.item, count: command.count, donor: actor, generation: before!.generation ?? 1, name: c.name,
      ...(foods.length ? { food: foods } : {}), ...(gear ? { gear: structuredClone(gear) } : {}) });
    current.revision++;
  } else if (command.type === 'requestWithdraw') {
    const lot = vault.lots.find(lot => lot.id === command.lot);
    if (!lot || !integer(command.count, 1) || command.count > lot.count || vault.requests.some(r => r.user === actor && r.lot === lot.id) || vault.requests.length >= 100) return fail('invalid');
    vault.requests.push({ id: token, user: actor, generation: before!.generation ?? 1, name: c.name, lot: lot.id, count: command.count });
  } else {
    if (party.leader !== actor) return fail('leader-only');
    const request = vault.requests.find(r => r.id === command.request);
    if (!request) return fail('invalid');
    if (command.approve) {
      const recipient = profiles.get(request.user), rc = recipient?.character, lot = vault.lots.find(lot => lot.id === request.lot);
      if (!party.members.includes(request.user) || !rc || recipient!.death || rc.hp <= 0 || (recipient!.generation ?? 1) !== request.generation) return fail('not-alive');
      if (recipient!.activity || recipient!.combatId || recipient!.event || rc.location !== c.location) return fail('busy');
      if (!lot || lot.count < request.count) return fail('invalid');
      const changed = request.user === actor ? current : structuredClone(recipient!);
      deliver(changed, lot, request.count, token); updated.set(request.user, changed);
    }
    vault.requests = vault.requests.filter(r => r.id !== request.id);
  }
  vault.lots = vault.lots.filter(lot => lot.count > 0);
  vault.requests = vault.requests.filter(r => vault.lots.some(lot => lot.id === r.lot && lot.count >= r.count));
  vault.revision++;
  return { vaults: next, profiles: updated, changed: true };
}

export function returnFantasyPartyDeposits(vaults: FantasyPartyVaults, profiles: ReadonlyMap<string, FantasyProfile>, party?: string, owner?: string): FantasyPartyVaultResult {
  const next = structuredClone(vaults), updated = new Map(profiles); let changed = false;
  for (const [id, vault] of Object.entries(next)) {
    if (party && id !== party) continue;
    for (const lot of vault.lots) {
      if (owner && owner !== lot.donor) continue;
      const before = updated.get(lot.donor);
      if (!before?.character || before.death || before.character.hp <= 0 || (before.generation ?? 1) !== lot.generation) continue;
      const profile = structuredClone(before); deliver(profile, lot, lot.count, `return-${vault.revision}`); updated.set(lot.donor, profile); changed = true;
    }
    const pending = vault.requests.length;
    vault.lots = vault.lots.filter(lot => lot.count > 0);
    vault.requests = vault.requests.filter(r => (!owner || r.user !== owner) && vault.lots.some(lot => lot.id === r.lot));
    if (pending !== vault.requests.length) changed = true;
    if (changed) vault.revision++;
    if (!vault.lots.length) delete next[id];
  }
  return { vaults: next, profiles: updated, changed };
}
