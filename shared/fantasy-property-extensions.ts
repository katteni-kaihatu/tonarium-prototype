import type { FantasyCharacter, FantasyProfile, FantasyResult, FantasyStats } from './fantasy.ts';
import { FANTASY_ITEMS } from './fantasy-data.ts';
import { fantasyReputation } from './fantasy-reputation.ts';
import { FANTASY_PROPERTY_PLOTS, reconcileFantasyProperties, type FantasyPropertyChange, type FantasyPropertyCommand, type FantasyPropertyLedger, type FantasyPropertyRecord, type FantasyPropertyOwner } from './fantasy-property.ts';

type Party = Pick<FantasyPropertyOwner, 'user' | 'generation' | 'name'>;
export type FantasyPropertyBlueprint = 'irrigation' | 'greenhouse' | 'granary' | 'workshop' | 'shopfront' | 'storehouse' | 'hearth' | 'bedroom' | 'garden';
export interface FantasyPropertyExtension {
  level: number; blueprint: FantasyPropertyBlueprint | null; condition: number; taxAt: number; taxDue: number;
  shares: (Party & { percent: number; estate?: true })[];
  shareOffer?: Party & { percent: number; expiresAt: number };
  lease?: Party & { rent: number; days: number; state: 'offered' | 'active'; expiresAt: number; startsAt: number; endsAt: number };
  construction?: { blueprint: FantasyPropertyBlueprint; endsAt: number; level: number };
  sale?: { price: number; approved: string[] };
  auction?: { minimum: number; startedAt: number; endsAt: number; highest?: Party & { amount: number } };
  automation?: { enabled: boolean; stock: number; wages: number; lastAt: number };
  bargain?: Party & { price: number; expiresAt: number; nextAt: number; roll: number; target: number };
  credits: (Party & { amount: number; estate?: true })[];
}
type Base = { plot: string; revision: number; requestId: string };
export type FantasyPropertyExtensionCommand = Base & (
  { type: 'leaseOffer'; target: string; rent: number; days: number } | { type: 'shareOffer'; target: string; percent: number }
  | { type: 'build'; blueprint: FantasyPropertyBlueprint } | { type: 'auctionStart'; price: number }
  | { type: 'bid'; amount: number } | { type: 'autoStock' | 'autoWithdraw'; count: number } | { type: 'autoToggle'; enabled: boolean }
  | { type: 'leaseAccept' | 'leaseEnd' | 'shareAccept' | 'shareRevoke' | 'leaveShare' | 'approveSale' | 'payTax' | 'auctionCancel' | 'maintain' | 'claim' | 'bargain' | 'acceptBargain' });
export interface FantasyPropertyManagementView {
  level: number; blueprint: FantasyPropertyBlueprint | null; condition: number; taxDue: number; manager: boolean; canUse: boolean; tenant: boolean;
  shares: { name: string; percent: number; mine: boolean; estate: boolean }[];
  shareOffer?: { name: string; percent: number; forMe: boolean; expiresAt: number };
  lease?: { name: string; rent: number; days: number; active: boolean; forMe: boolean; endsAt: number; expiresAt: number };
  construction?: { blueprint: FantasyPropertyBlueprint; endsAt: number; level: number };
  sale?: { price: number; approved: number; total: number; mine: boolean };
  auction?: { minimum: number; highest: number; bidder: string | null; mine: boolean; endsAt: number };
  automation?: { enabled: boolean; stock: number; wages: number };
  bargain?: { price: number; expiresAt: number; roll: number; target: number };
  credit: number;
}

const object = (v: unknown): v is Record<string, any> => !!v && typeof v === 'object' && !Array.isArray(v);
const integer = (v: unknown, min = 0, max = 1_000_000) => Number.isSafeInteger(v) && Number(v) >= min && Number(v) <= max;
const hour = (v: unknown) => typeof v === 'number' && Number.isFinite(v) && v >= 0;
const name = (v: unknown): v is string => typeof v === 'string' && !!v.trim() && [...v].length <= 24 && !/[\u0000-\u001f\u007f]/.test(v);
const identity = (v: unknown): v is Party & Record<string, any> => object(v) && typeof v.user === 'string' && !!v.user && v.user.length <= 120 && integer(v.generation, 1) && name(v.name);
const keys = (v: object, allowed: string[]) => Object.keys(v).every(k => allowed.includes(k));
const who = (p: FantasyProfile, user: string): Party => ({ user, generation: p.generation ?? 1, name: p.character!.name });
const matches = (party: Party | null | undefined, user: string, p: FantasyProfile | undefined) => !!party && !!p?.character && !p.death && party.user === user && party.generation === (p.generation ?? 1);
const alive = (p: FantasyProfile | undefined) => !!p?.character && !p.death && p.character.hp > 0;
const quiet = (p: FantasyProfile | undefined) => alive(p) && !p!.activity && !p!.combatId && !p!.event;
const deed = (ledger: FantasyPropertyLedger, plot: string) => ledger.plots[plot];
export const FANTASY_PROPERTY_BLUEPRINTS: Record<'farmland' | 'commercial' | 'residence', FantasyPropertyBlueprint[]> = {
  farmland: ['irrigation', 'greenhouse', 'granary'], commercial: ['workshop', 'shopfront', 'storehouse'], residence: ['hearth', 'bedroom', 'garden'],
};
export const newFantasyPropertyExtension = (at: number): FantasyPropertyExtension => ({ level: 0, blueprint: null, condition: 100, taxAt: at, taxDue: 0, shares: [], credits: [] });
const extension = (record: FantasyPropertyRecord, at: number) => record.extension ??= newFantasyPropertyExtension(at);
const token = (party: Party) => JSON.stringify([party.user, party.generation]);
function journal(p: FantasyProfile, text: string, at = p.character!.hour) { p.log = [...p.log, { id: Math.max(0, ...p.log.map(e => e.id)) + 1, hour: at, kind: 'system' as const, text }].slice(-100); }
function credit(record: FantasyPropertyRecord, profiles: Record<string, FantasyProfile>, party: Party, amount: number, at: number) {
  if (!amount) return;
  const p = profiles[party.user];
  if (matches(party, party.user, p) && p!.character!.gold + amount <= 1_000_000) {
    const copy = structuredClone(p!); copy.character!.gold += amount; copy.revision++; profiles[party.user] = copy;
    journal(copy, `property:credit:${amount}`, at); return;
  }
  const ext = extension(record, at), existing = ext.credits.find(c => token(c) === token(party));
  if (existing) existing.amount += amount;
  else ext.credits.push({ user: party.user, generation: party.generation, name: party.name, amount, ...(!matches(party, party.user, p) ? { estate: true as const } : {}) });
}
function distribute(record: FantasyPropertyRecord, profiles: Record<string, FantasyProfile>, amount: number, at: number) {
  if (!record.owner || !amount) return;
  const ext = extension(record, at); let rest = amount;
  for (const share of ext.shares) { const part = Math.floor(amount * share.percent / 100); rest -= part; credit(record, profiles, share, part, at); }
  credit(record, profiles, record.owner, rest, at);
}
function recordReceipt(next: FantasyPropertyLedger, actor: string, p: FantasyProfile, command: Exclude<FantasyPropertyCommand, { type: 'sync' }>, at: number) {
  const key = JSON.stringify([actor, p.generation ?? 1, command.requestId]);
  next.receipts[key] = { actor, generation: p.generation ?? 1, requestId: command.requestId, plot: command.plot, operation: command.type, hour: at };
  while (Object.keys(next.receipts).length > 4096) delete next.receipts[Object.keys(next.receipts)[0]];
}
const EXT_TYPES = ['leaseOffer', 'leaseAccept', 'leaseEnd', 'shareOffer', 'shareAccept', 'shareRevoke', 'leaveShare', 'approveSale', 'build', 'payTax', 'auctionStart', 'bid', 'auctionCancel', 'autoStock', 'autoWithdraw', 'autoToggle', 'maintain', 'claim', 'bargain', 'acceptBargain'];
export const fantasyPropertyExtensionOperation = (type: string) => EXT_TYPES.includes(type);
export function isFantasyPropertyExtensionCommand(v: unknown): v is FantasyPropertyExtensionCommand {
  if (!object(v) || !EXT_TYPES.includes(v.type) || !FANTASY_PROPERTY_PLOTS.some(p => p.id === v.plot) || !integer(v.revision, 0, Number.MAX_SAFE_INTEGER)
    || typeof v.requestId !== 'string' || !/^[a-zA-Z0-9][a-zA-Z0-9:_-]{0,119}$/.test(v.requestId)) return false;
  const extra = v.type === 'leaseOffer' ? ['target', 'rent', 'days'] : v.type === 'shareOffer' ? ['target', 'percent'] : v.type === 'build' ? ['blueprint']
    : v.type === 'auctionStart' ? ['price'] : v.type === 'bid' ? ['amount'] : v.type === 'autoStock' || v.type === 'autoWithdraw' ? ['count'] : v.type === 'autoToggle' ? ['enabled'] : [];
  if (Object.keys(v).length !== 4 + extra.length || !keys(v, ['type', 'plot', 'revision', 'requestId', ...extra])) return false;
  if (v.type === 'leaseOffer') return name(v.target) && integer(v.rent, 1, 10_000) && integer(v.days, 1, 15);
  if (v.type === 'shareOffer') return name(v.target) && integer(v.percent, 1, 49);
  if (v.type === 'build') return Object.values(FANTASY_PROPERTY_BLUEPRINTS).flat().includes(v.blueprint);
  if (v.type === 'auctionStart') return integer(v.price, 1);
  if (v.type === 'bid') return integer(v.amount, 1);
  if (v.type === 'autoStock' || v.type === 'autoWithdraw') return integer(v.count, 1, 99);
  return v.type !== 'autoToggle' || typeof v.enabled === 'boolean';
}
export function validFantasyPropertyExtension(value: unknown): value is FantasyPropertyExtension {
  if (!object(value) || !keys(value, ['level', 'blueprint', 'condition', 'taxAt', 'taxDue', 'shares', 'shareOffer', 'lease', 'construction', 'sale', 'auction', 'automation', 'bargain', 'credits'])
    || !integer(value.level, 0, 3) || value.blueprint !== null && !Object.values(FANTASY_PROPERTY_BLUEPRINTS).flat().includes(value.blueprint)
    || !integer(value.condition, 0, 100) || !hour(value.taxAt) || !integer(value.taxDue, 0, 10_000) || !Array.isArray(value.shares) || value.shares.length > 2
    || value.shares.some(s => !identity(s) || !keys(s, ['user', 'generation', 'name', 'percent', 'estate']) || !integer(s.percent, 1, 49) || s.estate !== undefined && s.estate !== true)
    || value.shares.reduce((sum, s) => sum + s.percent, 0) > 49 || new Set(value.shares.map(token)).size !== value.shares.length
    || !Array.isArray(value.credits) || value.credits.length > 100 || value.credits.some(c => !identity(c) || !keys(c, ['user', 'generation', 'name', 'amount', 'estate']) || !integer(c.amount, 1, Number.MAX_SAFE_INTEGER) || c.estate !== undefined && c.estate !== true)
    || new Set(value.credits.map(token)).size !== value.credits.length) return false;
  const offer = value.shareOffer;
  if (offer !== undefined && (!identity(offer) || !keys(offer, ['user', 'generation', 'name', 'percent', 'expiresAt']) || !integer(offer.percent, 1, 49) || value.shares.reduce((n, s) => n + s.percent, 0) + offer.percent > 49 || !hour(offer.expiresAt))) return false;
  const lease = value.lease;
  if (lease !== undefined && (!identity(lease) || !keys(lease, ['user', 'generation', 'name', 'rent', 'days', 'state', 'expiresAt', 'startsAt', 'endsAt'])
    || !integer(lease.rent, 1, 10_000) || !integer(lease.days, 1, 15) || !['offered', 'active'].includes(lease.state)
    || !hour(lease.expiresAt) || !hour(lease.startsAt) || !hour(lease.endsAt) || lease.state === 'active' && lease.endsAt !== lease.startsAt + lease.days * 24)) return false;
  const build = value.construction;
  if (build !== undefined && (!object(build) || Object.keys(build).length !== 3 || !Object.values(FANTASY_PROPERTY_BLUEPRINTS).flat().includes(build.blueprint) || !hour(build.endsAt) || !integer(build.level, 1, 3) || build.level !== value.level + 1)) return false;
  const sale = value.sale;
  if (sale !== undefined && (!object(sale) || Object.keys(sale).length !== 2 || !integer(sale.price, 1) || !Array.isArray(sale.approved) || sale.approved.some(v => typeof v !== 'string') || new Set(sale.approved).size !== sale.approved.length || sale.approved.length > 3)) return false;
  const auction = value.auction;
  if (auction !== undefined && (!object(auction) || !keys(auction, ['minimum', 'startedAt', 'endsAt', 'highest']) || !integer(auction.minimum, 1) || !hour(auction.startedAt) || !hour(auction.endsAt)
    || auction.endsAt <= auction.startedAt || auction.endsAt > auction.startedAt + 72 || auction.highest !== undefined && (!identity(auction.highest) || !keys(auction.highest, ['user', 'generation', 'name', 'amount']) || !integer(auction.highest.amount, auction.minimum)))) return false;
  const auto = value.automation;
  if (auto !== undefined && (!object(auto) || Object.keys(auto).length !== 4 || typeof auto.enabled !== 'boolean' || !integer(auto.stock, 0, 99) || !integer(auto.wages, 0, 198) || auto.wages !== auto.stock * 2 || !hour(auto.lastAt))) return false;
  const bargain = value.bargain;
  return bargain === undefined || identity(bargain) && keys(bargain, ['user', 'generation', 'name', 'price', 'expiresAt', 'nextAt', 'roll', 'target']) && integer(bargain.price, 1)
    && hour(bargain.expiresAt) && hour(bargain.nextAt) && bargain.expiresAt <= bargain.nextAt && integer(bargain.roll, 1, 100) && integer(bargain.target, 10, 85);
}
export function fantasyPropertyCanUse(ledger: FantasyPropertyLedger, profiles: Record<string, FantasyProfile>, actor: string, plotId: string, at: number): boolean {
  const p = profiles[actor], record = ledger.plots[plotId], ext = record?.extension;
  if (!record || !alive(p) || record.listing || ext?.auction || ext?.construction) return false;
  const lease = ext?.lease;
  if (lease?.state === 'active' && lease.endsAt > at) return matches(lease, actor, p) && lease.endsAt >= at + (FANTASY_PROPERTY_PLOTS.find(plot => plot.id === plotId)?.hours ?? 0);
  if (record.owner?.estate || (ext?.taxDue ?? 0) > 0 || ext?.condition === 0) return false;
  return matches(record.owner, actor, p) || !!ext?.shares.some(s => !s.estate && matches(s, actor, p));
}
export function reconcileFantasyPropertyParties(record: FantasyPropertyRecord, profiles: Record<string, FantasyProfile>): boolean {
  const ext = record.extension; if (!ext) return false; let changed = false;
  if (record.owner?.estate) {
    if (ext.shareOffer) { delete ext.shareOffer; changed = true; }
    if (ext.lease?.state === 'offered') { delete ext.lease; changed = true; }
  }
  for (const share of ext.shares) if (!share.estate && !matches(share, share.user, profiles[share.user])) { share.estate = true; changed = true; }
  for (const value of ext.credits) if (!value.estate && !matches(value, value.user, profiles[value.user])) { value.estate = true; changed = true; }
  if (ext.lease && !matches(ext.lease, ext.lease.user, profiles[ext.lease.user])) { delete ext.lease; changed = true; }
  if (ext.shareOffer && !matches(ext.shareOffer, ext.shareOffer.user, profiles[ext.shareOffer.user])) { delete ext.shareOffer; changed = true; }
  return changed;
}
export function fantasyPropertyExtensionView(ledger: FantasyPropertyLedger, profiles: Record<string, FantasyProfile>, actor: string, plotId: string): FantasyPropertyManagementView {
  const p = profiles[actor], record = ledger.plots[plotId], ext = record.extension ?? newFantasyPropertyExtension(record.owner?.acquiredAt ?? 0);
  const own = matches(record.owner, actor, p), tenant = !!ext.lease && matches(ext.lease, actor, p), myShare = ext.shares.find(s => matches(s, actor, p));
  return { level: ext.level, blueprint: ext.blueprint, condition: ext.condition, taxDue: ext.taxDue, manager: own && !record.owner?.estate, canUse: fantasyPropertyCanUse(ledger, profiles, actor, plotId, p?.character?.hour ?? 0), tenant: tenant && ext.lease?.state === 'active',
    shares: [{ name: record.owner?.name ?? '', percent: 100 - ext.shares.reduce((n, s) => n + s.percent, 0), mine: own, estate: !!record.owner?.estate }, ...ext.shares.map(s => ({ name: s.name, percent: s.percent, mine: matches(s, actor, p), estate: !!s.estate }))].filter(s => !!s.name),
    ...(ext.shareOffer && (own || matches(ext.shareOffer, actor, p)) ? { shareOffer: { name: ext.shareOffer.name, percent: ext.shareOffer.percent, forMe: matches(ext.shareOffer, actor, p), expiresAt: ext.shareOffer.expiresAt } } : {}),
    ...(ext.lease && (own || myShare || tenant) ? { lease: { name: ext.lease.name, rent: ext.lease.rent, days: ext.lease.days, active: ext.lease.state === 'active', forMe: tenant, endsAt: ext.lease.endsAt, expiresAt: ext.lease.expiresAt } } : {}),
    ...(ext.construction ? { construction: { ...ext.construction } } : {}),
    ...(ext.sale && (own || myShare) ? { sale: { price: ext.sale.price, approved: ext.sale.approved.length, total: ext.shares.length + 1, mine: ext.sale.approved.includes(token(who(p!, actor))) } } : {}),
    ...(ext.auction ? { auction: { minimum: Math.max(ext.taxDue, ext.auction.highest ? Math.max(ext.auction.highest.amount + 1, Math.ceil(ext.auction.highest.amount * 1.05)) : ext.auction.minimum), highest: ext.auction.highest?.amount ?? 0, bidder: ext.auction.highest?.name ?? null, mine: !!ext.auction.highest && matches(ext.auction.highest, actor, p), endsAt: ext.auction.endsAt } } : {}),
    ...(ext.automation && (own || myShare || tenant) ? { automation: { enabled: ext.automation.enabled, stock: ext.automation.stock, wages: ext.automation.wages } } : {}),
    ...(ext.bargain && matches(ext.bargain, actor, p) && ext.bargain.expiresAt > (p?.character?.hour ?? 0) ? { bargain: { price: ext.bargain.price, expiresAt: ext.bargain.expiresAt, roll: ext.bargain.roll, target: ext.bargain.target } } : {}),
    credit: ext.credits.filter(v => !v.estate && matches(v, actor, p)).reduce((sum, v) => sum + v.amount, 0) };
}
export function fantasyPropertyOwnsShare(record: FantasyPropertyRecord, actor: string, p: FantasyProfile): boolean {
  return matches(record.owner, actor, p) || !!record.extension?.shares.some(s => !s.estate && matches(s, actor, p));
}
export function fantasyPropertyHasTitle(record: FantasyPropertyRecord, actor: string, p: FantasyProfile): boolean {
  const lease = record.extension?.lease;
  if (lease?.state === 'active' && lease.endsAt > (p.character?.hour ?? 0)) return matches(lease, actor, p);
  return !record.owner?.estate && fantasyPropertyOwnsShare(record, actor, p);
}
export function fantasyPropertySale(record: FantasyPropertyRecord, profiles: Record<string, FantasyProfile>, amount: number, at: number) {
  const tax = Math.min(amount, record.extension?.taxDue ?? 0);
  if (record.extension) record.extension.taxDue -= tax;
  distribute(record, profiles, amount - tax, at);
  const ext = record.extension;
  if (ext) { ext.shares = []; delete ext.shareOffer; delete ext.lease; delete ext.sale; delete ext.auction; delete ext.bargain; if (ext.automation) ext.automation.enabled = false; }
}
export function fantasyPropertyListProposal(record: FantasyPropertyRecord, actor: string, p: FantasyProfile, price: number): boolean {
  if (!record.extension?.shares.length) return false;
  record.extension.sale = { price, approved: [token(who(p, actor))] }; record.listing = null; return true;
}
export function fantasyPropertyPurchasePrice(record: FantasyPropertyRecord, actor: string, p: FantasyProfile, at: number, negotiated: boolean): number | null {
  if (!negotiated) return record.listing?.price ?? null;
  const q = record.extension?.bargain;
  return !record.owner && q && matches(q, actor, p) && q.expiresAt > at ? q.price : null;
}

export function advanceFantasyProperties(ledger: FantasyPropertyLedger, profiles: Record<string, FantasyProfile>, at: number): FantasyPropertyChange {
  if (!Number.isFinite(at) || at < 0) return { ledger, profiles, changed: false, error: 'invalid' };
  const next = structuredClone(ledger), people = { ...profiles }; let changed = false;
  for (const plot of FANTASY_PROPERTY_PLOTS) {
    const record = next.plots[plot.id]; if (!record.owner && !record.extension) continue;
    const before = JSON.stringify(record), ext = extension(record, at);
    reconcileFantasyPropertyParties(record, people);
    if (record.owner && !record.owner.estate) {
      const days = Math.min(365, Math.floor(Math.max(0, at - ext.taxAt) / 24));
      if (days) { ext.taxDue = Math.min(10_000, ext.taxDue + days * (plot.kind === 'commercial' ? 3 : plot.kind === 'farmland' ? 1 : 2)); ext.taxAt += Math.floor((at - ext.taxAt) / 24) * 24; ext.condition = Math.max(0, ext.condition - days); }
    }
    if (ext.shareOffer && ext.shareOffer.expiresAt <= at) delete ext.shareOffer;
    if (ext.lease && (ext.lease.state === 'offered' ? ext.lease.expiresAt : ext.lease.endsAt) <= at) delete ext.lease;
    if (ext.construction && ext.construction.endsAt <= at) { ext.level = ext.construction.level; ext.blueprint = ext.construction.blueprint; ext.condition = 100; delete ext.construction; }
    if (ext.bargain && ext.bargain.nextAt <= at) delete ext.bargain;
    const auto = ext.automation;
    if (auto && at >= auto.lastAt + 4) {
      const steps = Math.min(12, Math.floor((at - auto.lastAt) / 4)); auto.lastAt = at;
      if (auto.enabled && record.owner && !record.owner.estate && !record.listing && !ext.auction && !ext.construction && !ext.lease && !ext.taxDue && ext.condition > 0) {
        const owner = people[record.owner.user];
        const count = Math.min(steps, auto.stock, Math.floor(auto.wages / 2), ext.condition);
        if (count && matches(record.owner, record.owner.user, owner)) {
          auto.stock -= count; auto.wages -= count * 2; ext.condition -= count;
          if (plot.kind === 'commercial') distribute(record, people, count * ((FANTASY_ITEMS.find(i => i.id === plot.input)?.price ?? 1) + 5 + ext.level * 2), at);
          else if (plot.kind === 'farmland') { const p = structuredClone(owner!); const item = plot.output!; p.character!.inventory[item] = Math.min(1_000_000, (p.character!.inventory[item] ?? 0) + count * (2 + ext.level)); p.revision++; people[record.owner.user] = p; journal(p, `property:autoHarvest:${plot.id}:${count * (2 + ext.level)}`, at); }
        }
      }
    }
    if (ext.auction && ext.auction.endsAt <= at) {
      const auction = ext.auction, winner = auction.highest, p = winner && people[winner.user];
      if (winner && winner.amount >= ext.taxDue && matches(winner, winner.user, p) && Object.values(next.plots).filter(r => fantasyPropertyOwnsShare(r, winner.user, p!)).length < 3) {
        fantasyPropertySale(record, people, winner.amount, at);
        record.owner = { user: winner.user, generation: winner.generation, name: winner.name, acquiredAt: at }; record.listing = null;
        ext.taxAt = at; ext.taxDue = 0;
        const buyer = structuredClone(people[winner.user]); buyer.revision++; people[winner.user] = buyer;
        journal(buyer, `property:auctionWon:${plot.id}:${winner.amount}`, at);
      } else { if (winner) credit(record, people, winner, winner.amount, at); delete ext.auction; }
    }
    if (JSON.stringify(record) !== before) { record.revision++; changed = true; }
  }
  if (!changed) return { ledger, profiles, changed: false };
  next.revision++;
  const normalized = reconcileFantasyProperties(next, people);
  return { ledger: normalized.ledger, profiles: normalized.profiles, changed: true };
}

export function applyFantasyPropertyExtensionCommand(ledger: FantasyPropertyLedger, profiles: Record<string, FantasyProfile>, actor: string, command: FantasyPropertyExtensionCommand, at: number): FantasyPropertyChange {
  const fail = (error: string): FantasyPropertyChange => ({ ledger, profiles, changed: false, error: error as any });
  const source = profiles[actor]; if (!quiet(source)) return fail('busy');
  const c = source.character!, plot = FANTASY_PROPERTY_PLOTS.find(p => p.id === command.plot)!;
  const saved = ledger.plots[plot.id], old = saved.extension, manager = matches(saved.owner, actor, source) && !saved.owner?.estate;
  if (saved.revision !== command.revision) return fail('stale');
  if (c.location !== plot.location) return fail('unavailable');
  if (ledger.receipts[JSON.stringify([actor, source.generation ?? 1, command.requestId])]) return { ledger, profiles, changed: false };
  const next = structuredClone(ledger), people = { ...profiles }, p = structuredClone(source), record = next.plots[plot.id], ext = extension(record, at); people[actor] = p;
  const mine = who(p, actor), coowner = ext.shares.some(s => !s.estate && matches(s, actor, p));
  const occupied = !!record.listing || !!ext.auction || !!ext.construction || ext.lease?.state === 'active';
  const inUse = Object.values(profiles).some(value => value.activity?.action.type === 'propertyUse' && value.activity.action.plot === plot.id);
  const peer = (target: string) => { const values = Object.entries(profiles).filter(([user, v]) => user !== actor && quiet(v) && v.character!.location === c.location && v.character!.name === target); return values.length === 1 ? { user: values[0][0], p: values[0][1] } : null; };
  if (command.type === 'leaseOffer' || command.type === 'shareOffer') {
    if (!manager) return fail('not-owner'); if (occupied || ext.shares.some(s => s.estate)) return fail('occupied');
    const target = peer(command.target); if (!target) return fail('target');
    if (command.type === 'leaseOffer') {
      if (ext.shares.length) return fail('consent');
      delete ext.shareOffer;
      ext.lease = { ...who(target.p, target.user), rent: command.rent, days: command.days, state: 'offered', expiresAt: at + 1, startsAt: 0, endsAt: 0 };
    } else {
      if (ext.shares.length >= 2 || ext.shares.some(s => s.user === target.user) || ext.shares.reduce((n, s) => n + s.percent, 0) + command.percent > 49) return fail('limit');
      delete ext.lease;
      ext.shareOffer = { ...who(target.p, target.user), percent: command.percent, expiresAt: at + 1 };
    }
  } else if (command.type === 'leaseAccept') {
    const lease = ext.lease;
    if (inUse) return fail('busy');
    if (!lease || lease.state !== 'offered' || lease.expiresAt <= at || !matches(lease, actor, p) || occupied) return fail('consent');
    const total = lease.rent * lease.days; if (p.character!.gold < total) return fail('insufficient-gold');
    p.character!.gold -= total; distribute(record, people, total, at); lease.state = 'active'; lease.startsAt = at; lease.endsAt = at + lease.days * 24;
    journal(p, `property:lease:${plot.id}:${total}`);
  } else if (command.type === 'leaseEnd') {
    if (!ext.lease || !manager && !matches(ext.lease, actor, p)) return fail('not-owner');
    if (ext.lease.state === 'active' && !matches(ext.lease, actor, p) && ext.lease.endsAt > at) return fail('occupied');
    delete ext.lease;
  } else if (command.type === 'shareAccept') {
    const offer = ext.shareOffer;
    if (!offer || !matches(offer, actor, p) || offer.expiresAt <= at || occupied) return fail('consent');
    if (Object.values(ledger.plots).filter(r => fantasyPropertyOwnsShare(r, actor, p)).length >= 3 || ext.shares.length >= 2 || ext.shares.reduce((n, s) => n + s.percent, 0) + offer.percent > 49) return fail('limit');
    ext.shares.push({ ...mine, percent: offer.percent }); delete ext.shareOffer; delete ext.sale; delete ext.lease;
  } else if (command.type === 'shareRevoke') { if (!manager) return fail('not-owner'); delete ext.shareOffer; }
  else if (command.type === 'leaveShare') { if (!coowner || occupied) return fail('occupied'); ext.shares = ext.shares.filter(s => !matches(s, actor, p)); delete ext.sale; }
  else if (command.type === 'approveSale') {
    if ((!manager && !coowner) || !ext.sale || ext.shares.some(s => s.estate)) return fail('consent');
    if (inUse) return fail('busy');
    if (!ext.sale.approved.includes(token(mine))) ext.sale.approved.push(token(mine));
    if (ext.sale.approved.length === ext.shares.length + 1) record.listing = { price: ext.sale.price };
  } else if (command.type === 'build') {
    if (!manager) return fail('not-owner'); if (occupied || ext.taxDue || ext.level >= 3) return fail(ext.taxDue ? 'tax-due' : 'occupied');
    if (inUse) return fail('busy');
    if (!FANTASY_PROPERTY_BLUEPRINTS[plot.kind].includes(command.blueprint)) return fail('invalid');
    const level = ext.level + 1, gold = level * 40, wood = 3 + level * 2, ore = level;
    if (p.character!.gold < gold) return fail('insufficient-gold');
    if ((c.inventory.wood ?? 0) < wood || (c.inventory.ore ?? 0) < ore) return fail('missing-material');
    p.character!.gold -= gold; p.character!.inventory.wood -= wood; p.character!.inventory.ore -= ore;
    for (const item of ['wood', 'ore']) if (!p.character!.inventory[item]) delete p.character!.inventory[item];
    ext.construction = { blueprint: command.blueprint, level, endsAt: at + level * 4 };
  } else if (command.type === 'payTax') {
    if (!manager && !coowner) return fail('not-owner'); if (!ext.taxDue) return fail('no-due');
    if (p.character!.gold < ext.taxDue) return fail('insufficient-gold'); p.character!.gold -= ext.taxDue; ext.taxDue = 0;
  } else if (command.type === 'auctionStart') {
    if (!manager && !record.owner?.estate) return fail('not-owner');
    if (inUse) return fail('busy');
    if (ext.auction || ext.construction || ext.lease?.state === 'active') return fail('occupied');
    if (command.price < ext.taxDue) return fail('tax-due');
    if (ext.shares.length && !record.owner?.estate && (!ext.sale || ext.sale.price !== command.price || ext.sale.approved.length !== ext.shares.length + 1)) return fail('consent');
    ext.auction = { minimum: command.price, startedAt: at, endsAt: at + 24 }; record.listing = null;
  } else if (command.type === 'bid') {
    const auction = ext.auction; if (!auction || auction.endsAt <= at || manager || coowner) return fail('auction');
    const minimum = Math.max(ext.taxDue, auction.highest ? Math.max(auction.highest.amount + 1, Math.ceil(auction.highest.amount * 1.05)) : auction.minimum);
    if (command.amount < minimum) return fail('bid-low');
    if (Object.values(ledger.plots).filter(r => fantasyPropertyOwnsShare(r, actor, p)).length >= 3) return fail('limit');
    const currentBid = auction.highest && matches(auction.highest, actor, p) ? auction.highest.amount : 0;
    if (p.character!.gold + currentBid < command.amount) return fail('insufficient-gold');
    if (auction.highest) credit(record, people, auction.highest, auction.highest.amount, at);
    const bidder = people[actor]; bidder.character!.gold -= command.amount; auction.highest = { ...mine, amount: command.amount };
    auction.endsAt = Math.min(auction.startedAt + 72, Math.max(auction.endsAt, at + 2));
  } else if (command.type === 'auctionCancel') {
    if (!manager || !ext.auction || ext.auction.highest) return fail('auction'); delete ext.auction;
  } else if (command.type === 'autoStock') {
    if (!manager || plot.kind === 'residence') return fail('not-owner'); if (occupied || ext.taxDue) return fail('occupied');
    const auto = ext.automation ??= { enabled: false, stock: 0, wages: 0, lastAt: at }, material = plot.input ?? plot.output!;
    if (auto.stock + command.count > 99 || auto.wages + command.count * 2 > 198) return fail('limit');
    if ((p.character!.inventory[material] ?? 0) < command.count) return fail('missing-material'); if (p.character!.gold < command.count * 2) return fail('insufficient-gold');
    p.character!.inventory[material] -= command.count; if (!p.character!.inventory[material]) delete p.character!.inventory[material]; p.character!.gold -= command.count * 2;
    auto.stock += command.count; auto.wages += command.count * 2;
  } else if (command.type === 'autoToggle') {
    if (!manager || plot.kind === 'residence') return fail('not-owner'); if (command.enabled && (occupied || ext.taxDue)) return fail('occupied');
    const auto = ext.automation ??= { enabled: false, stock: 0, wages: 0, lastAt: at };
    if (command.enabled && (!auto.stock || auto.wages < 2 || !ext.condition)) return fail('missing-material'); auto.enabled = command.enabled; auto.lastAt = at;
  } else if (command.type === 'autoWithdraw') {
    if (!manager || plot.kind === 'residence') return fail('not-owner');
    const auto = ext.automation, material = plot.input ?? plot.output!;
    if (!auto || auto.enabled || auto.stock < command.count) return fail('occupied');
    if ((p.character!.inventory[material] ?? 0) + command.count > 1_000_000 || p.character!.gold + command.count * 2 > 1_000_000) return fail('limit');
    auto.stock -= command.count; auto.wages -= command.count * 2; p.character!.inventory[material] = (p.character!.inventory[material] ?? 0) + command.count; p.character!.gold += command.count * 2;
  } else if (command.type === 'maintain') {
    if (!manager && !coowner) return fail('not-owner'); if (ext.condition === 100) return fail('no-due');
    if (p.character!.gold < 10 + ext.level * 5) return fail('insufficient-gold'); if ((c.inventory.wood ?? 0) < 1 || (c.inventory.ore ?? 0) < 1) return fail('missing-material');
    p.character!.gold -= 10 + ext.level * 5; p.character!.inventory.wood--; p.character!.inventory.ore--; ext.condition = 100;
    for (const item of ['wood', 'ore']) if (!p.character!.inventory[item]) delete p.character!.inventory[item];
  } else if (command.type === 'claim') {
    const amount = ext.credits.filter(v => !v.estate && matches(v, actor, p)).reduce((sum, v) => sum + v.amount, 0), paid = Math.min(amount, 1_000_000 - p.character!.gold);
    if (!paid) return fail('no-due'); p.character!.gold += paid; let left = paid;
    for (const value of ext.credits.filter(v => !v.estate && matches(v, actor, p))) { const part = Math.min(left, value.amount); value.amount -= part; left -= part; }
    ext.credits = ext.credits.filter(v => v.amount > 0);
  } else if (command.type === 'bargain') {
    if (record.owner || !record.listing) return fail('not-listed');
    if (old?.bargain && old.bargain.nextAt > at && matches(old.bargain, actor, p)) return fail('cooldown');
    const score = fantasyReputation(c).score, target = Math.max(10, Math.min(85, 25 + Math.round(score / 2) + (c.job === 'merchant' ? 8 : 0)));
    let hash = 2166136261; for (const char of `${actor}:${p.generation ?? 1}:${plot.id}:${Math.floor(at / 4)}`) hash = Math.imul(hash ^ char.charCodeAt(0), 16777619);
    const roll = 1 + (hash >>> 0) % 100, discount = roll <= target ? Math.min(.2, .08 + Math.max(0, score) * .0012) : 0;
    ext.bargain = { ...mine, price: Math.max(1, Math.ceil(record.listing.price * (1 - discount))), expiresAt: at + 1, nextAt: at + 4, roll, target };
  } else return fail('invalid');
  record.revision++; next.revision++; p.revision++; recordReceipt(next, actor, p, command, at);
  const normalized = reconcileFantasyProperties(next, people);
  return { ledger: normalized.ledger, profiles: normalized.profiles, changed: true };
}
export function applyFantasyPropertyImprovement(profile: FantasyProfile, plotId: string, ledger: FantasyPropertyLedger, maximum?: Pick<FantasyStats, 'hp' | 'mp'>): FantasyResult {
  const plot = FANTASY_PROPERTY_PLOTS.find(p => p.id === plotId), level = ledger.plots[plotId]?.extension?.level ?? 0;
  if (!profile.character || !plot || !level) return { profile, changed: false };
  const proof = profile.log.findLast(entry => entry.text.startsWith('property:'));
  if (!proof || !['rest', 'harvest', 'operate'].some(kind => proof.text.startsWith(`property:${kind}:${plotId}:`))
    || profile.log.some(entry => entry.id > proof.id && entry.text.startsWith('行動を完了できなかった。'))) return { profile, changed: false };
  const next = structuredClone(profile), c = next.character!;
  if (plot.kind === 'farmland') c.inventory[plot.output!] = Math.min(1_000_000, (c.inventory[plot.output!] ?? 0) + level);
  else if (plot.kind === 'commercial') c.gold = Math.min(1_000_000, c.gold + level * 2);
  else { c.fatigue = Math.max(0, c.fatigue - level * 5); if (maximum) { c.hp = Math.min(maximum.hp, c.hp + level * 10); c.mp = Math.min(maximum.mp, c.mp + level * 5); } }
  journal(next, `property:improved:${plotId}:${level}`); return { profile: next, changed: true };
}
