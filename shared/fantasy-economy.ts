import type { FantasyCharacter, FantasyFoodLot, FantasyGearInstance, FantasyProfile } from './fantasy.ts';
import { FANTASY_ITEMS } from './fantasy-data.ts';
import { FANTASY_MAPS, FANTASY_SETTLEMENTS, fantasyBuildingStock, fantasyBuildings, canSellItem, type FantasyBuildingId } from './fantasy-town.ts';
import { foodMeta, type FantasyFoodQuality } from './fantasy-life.ts';
import { fantasyFoodLotQuality, fantasySaleGroups, type FantasySaleSelection } from './fantasy-sales.ts';
import { fantasySpendItem, validFantasyGear } from './fantasy-equipment.ts';
import { fantasyPrice } from './fantasy-reputation.ts';

export interface FantasyEconomySelection { item: string; count: number; instance?: string }
export interface FantasyEconomyParcel extends FantasyEconomySelection { food?: FantasyFoodLot[]; gear?: FantasyGearInstance; quality?: FantasyFoodQuality }
export interface FantasyEconomyOffer { gold: number; goods: FantasyEconomyParcel[]; confirmed: boolean }
export interface FantasyEconomyTrade {
  id: string; revision: number; users: [string, string]; generations: [number, number]; names: [string, string]; location: string;
  expiresAt: number; status: 'open' | 'completed' | 'cancelled'; offers: [FantasyEconomyOffer, FantasyEconomyOffer];
}
export interface FantasyEconomyShopLot { id: string; item: string; count: number; native: boolean; food?: FantasyFoodLot[]; gear?: FantasyGearInstance }
export interface FantasyEconomyShop { revision: number; epoch: number; lots: FantasyEconomyShopLot[] }
export interface FantasyEconomyLedger { version: 1; revision: number; shops: Record<string, FantasyEconomyShop>; trades: Record<string, FantasyEconomyTrade> }
export type FantasyEconomyCommand = { type: 'sync' }
  | { type: 'open'; peer: string }
  | { type: 'offer'; trade: string; revision: number; gold: number; items: FantasyEconomySelection[] }
  | { type: 'confirm' | 'cancel'; trade: string; revision: number }
  | { type: 'shopBuy'; building: FantasyBuildingId; item: string; count: number; revision: number; lot?: string; quotedUnitPrice?: number }
  | ({ type: 'shopSell'; building: FantasyBuildingId; count: number; revision: number; quotedUnitPrice?: number } & FantasySaleSelection);
export type FantasyEconomyError = 'invalid' | 'busy' | 'not-alive' | 'unavailable' | 'stale' | 'expired' | 'insufficient-gold' | 'missing-item' | 'equipped' | 'stock' | 'limit' | 'changed-goods' | 'save-failed';
export interface FantasyEconomyContext { hour: number; peers: string[]; token?: string; priceMultiplier?: number }
export interface FantasyEconomyResult { ledger: FantasyEconomyLedger; profiles: Map<string, FantasyProfile>; changed: boolean; error?: FantasyEconomyError }
export interface FantasyEconomyTradeView {
  id: string; revision: number; mine: 0 | 1; users: [string, string]; names: [string, string]; expiresAt: number; status: FantasyEconomyTrade['status'];
  offers: { gold: number; confirmed: boolean; items: (FantasyEconomySelection & { gearQuality?: number; quality?: FantasyFoodQuality })[] }[];
}
export interface FantasyEconomyShopView { building: FantasyBuildingId; revision: number; restockAt: number; lots: { id: string; item: string; count: number; unitPrice: number; gearQuality?: number }[]; sales: { key: string; item: string; count: number; unitPrice: number; quality?: FantasyFoodQuality; instance?: string; canSell: boolean }[] }
export interface FantasyEconomyState { revision: number; location: string | null; peers: { id: string; name: string }[]; shops: FantasyEconomyShopView[]; trades: FantasyEconomyTradeView[] }

const RESTOCK_HOURS = 6;
const object = (v: unknown): v is Record<string, unknown> => !!v && typeof v === 'object' && !Array.isArray(v);
const integer = (v: unknown, min = 0, max = Number.MAX_SAFE_INTEGER): v is number => Number.isSafeInteger(v) && Number(v) >= min && Number(v) <= max;
const hour = (v: unknown): v is number => typeof v === 'number' && Number.isFinite(v) && v >= 0;
const text = (v: unknown): v is string => typeof v === 'string' && v.length > 0 && v.length <= 160 && !/[\u0000-\u001f\u007f]/.test(v);
const token = (v: unknown): v is string => typeof v === 'string' && /^[a-z0-9][a-z0-9-]{0,79}$/.test(v);
const itemOf = (id: string) => FANTASY_ITEMS.find(item => item.id === id);
const mapOf = (id: string) => FANTASY_MAPS.find(map => map.item === id);
const known = (id: unknown): id is string => typeof id === 'string' && (!!itemOf(id) || !!mapOf(id));
const building = (id: unknown): id is FantasyBuildingId => typeof id === 'string' && Object.values(FANTASY_SETTLEMENTS).some(place => place.buildingIds.includes(id as FantasyBuildingId));
const generation = (p: FantasyProfile) => p.generation ?? 1;
const idle = (p: FantasyProfile | undefined) => !!p?.character && !p.death && p.character.hp > 0 && !p.activity && !p.combatId && !p.event;
const local = (c: FantasyCharacter, id: FantasyBuildingId) => fantasyBuildings(c).some(entry => entry.id === id);
const capacity = (item: string) => foodMeta(item) ? 20 : (itemOf(item)?.tier ?? 1) > 2 ? 3 : itemOf(item)?.equipment ? 5 : 14;
const basePrice = (item: string) => itemOf(item)?.price ?? mapOf(item)?.price ?? 0;
const shopKey = (location: string, id: string) => `${location}:${id}`;
const fields = (v: Record<string, unknown>, required: string[], optional: string[] = []) => required.every(key => Object.hasOwn(v, key)) && Object.keys(v).every(key => required.includes(key) || optional.includes(key));
const unchanged = (ledger: FantasyEconomyLedger, profiles: ReadonlyMap<string, FantasyProfile>, error?: FantasyEconomyError): FantasyEconomyResult => ({ ledger, profiles: new Map(profiles), changed: false, ...(error ? { error } : {}) });

export const newFantasyEconomyLedger = (): FantasyEconomyLedger => ({ version: 1, revision: 0, shops: {}, trades: {} });
export function isFantasyEconomyCommand(v: unknown): v is FantasyEconomyCommand {
  if (!object(v)) return false;
  if (v.type === 'sync') return fields(v, ['type']);
  if (v.type === 'open') return fields(v, ['type', 'peer']) && text(v.peer);
  if (v.type === 'offer') return fields(v, ['type', 'trade', 'revision', 'gold', 'items']) && token(v.trade) && integer(v.revision) && integer(v.gold, 0, 1_000_000_000)
    && Array.isArray(v.items) && v.items.length <= 12 && v.items.every(item => object(item) && fields(item, ['item', 'count'], ['instance']) && known(item.item) && integer(item.count, 1, 999) && (item.instance === undefined || text(item.instance)))
    && new Set(v.items.map(item => `${item.item}:${item.instance ?? ''}`)).size === v.items.length;
  if (v.type === 'confirm' || v.type === 'cancel') return fields(v, ['type', 'trade', 'revision']) && token(v.trade) && integer(v.revision);
  if (v.type === 'shopBuy') return fields(v, ['type', 'building', 'item', 'count', 'revision'], ['lot', 'quotedUnitPrice']) && building(v.building) && known(v.item) && integer(v.count, 1, 999) && integer(v.revision) && (v.lot === undefined || text(v.lot)) && (v.quotedUnitPrice === undefined || integer(v.quotedUnitPrice, 1));
  return v.type === 'shopSell' && fields(v, ['type', 'building', 'item', 'count', 'revision'], ['quality', 'instance', 'quotedUnitPrice']) && building(v.building) && known(v.item) && integer(v.count, 1, 999) && integer(v.revision) && (v.quotedUnitPrice === undefined || integer(v.quotedUnitPrice, 1))
    && (v.quality === undefined || ['fresh', 'stale', 'spoiled'].includes(String(v.quality))) && (v.instance === undefined || text(v.instance));
}
function validParcel(v: unknown): v is FantasyEconomyParcel {
  if (!object(v) || !fields(v, ['item', 'count'], ['instance', 'food', 'gear', 'quality']) || !known(v.item) || !integer(v.count, 1, 999) || v.instance !== undefined && !text(v.instance)) return false;
  if (!!foodMeta(v.item) !== Array.isArray(v.food)) return false;
  if (v.food !== undefined && (!Array.isArray(v.food) || !v.food.length || v.food.some(f => !object(f) || !fields(f, ['id', 'item', 'count', 'createdAt']) || !text(f.id) || f.item !== v.item || !integer(f.count, 1, 999) || !hour(f.createdAt)) || v.food.reduce((sum, f) => sum + Number(f.count), 0) !== v.count || new Set(v.food.map(f => f.id)).size !== v.food.length)) return false;
  if (v.quality !== undefined && !['fresh', 'stale', 'spoiled'].includes(String(v.quality))) return false;
  return v.gear === undefined || object(v.gear) && v.count === 1 && v.gear.item === v.item && v.instance === v.gear.id && hour(v.gear.createdAt)
    && validFantasyGear({ gear: [v.gear], inventory: { [v.item]: 1 }, hour: v.gear.createdAt } as unknown as FantasyCharacter);
}
export function validFantasyEconomyLedger(v: unknown): v is FantasyEconomyLedger {
  if (!object(v) || !fields(v, ['version', 'revision', 'shops', 'trades']) || v.version !== 1 || !integer(v.revision) || !object(v.shops) || !object(v.trades) || Object.keys(v.shops).length > 250 || Object.keys(v.trades).length > 256) return false;
  for (const [key, shop] of Object.entries(v.shops)) {
    const [location, id] = key.split(':');
    if (key !== shopKey(location, id) || !Object.hasOwn(FANTASY_SETTLEMENTS, location) || !building(id) || !local({ location } as FantasyCharacter, id) || !object(shop)
      || !fields(shop, ['revision', 'epoch', 'lots']) || !integer(shop.revision) || !integer(shop.epoch) || !Array.isArray(shop.lots) || shop.lots.length > 500) return false;
    if (shop.lots.some(lot => !object(lot) || !fields(lot, ['id', 'item', 'count', 'native'], ['food', 'gear']) || !text(lot.id) || typeof lot.native !== 'boolean'
      || !validParcel({ item: lot.item, count: lot.count, ...(lot.food ? { food: lot.food } : {}), ...(lot.gear && object(lot.gear) ? { instance: lot.gear.id, gear: lot.gear } : {}) }) || lot.native && (lot.id !== `stock-${lot.item}` || !fantasyBuildingStock({ location }, id).includes(String(lot.item)) || lot.gear !== undefined || Number(lot.count) > capacity(String(lot.item))))) return false;
    if (new Set(shop.lots.map(lot => lot.id)).size !== shop.lots.length) return false;
  }
  for (const [id, trade] of Object.entries(v.trades)) {
    if (!token(id) || !object(trade) || trade.id !== id || !fields(trade, ['id', 'revision', 'users', 'generations', 'names', 'location', 'expiresAt', 'status', 'offers']) || !integer(trade.revision)
      || !Array.isArray(trade.users) || trade.users.length !== 2 || !trade.users.every(text) || trade.users[0] === trade.users[1]
      || !Array.isArray(trade.generations) || trade.generations.length !== 2 || !trade.generations.every(n => integer(n, 1))
      || !Array.isArray(trade.names) || trade.names.length !== 2 || !trade.names.every(text) || !Object.hasOwn(FANTASY_SETTLEMENTS, String(trade.location))
      || !hour(trade.expiresAt) || !['open', 'completed', 'cancelled'].includes(String(trade.status)) || !Array.isArray(trade.offers) || trade.offers.length !== 2) return false;
    if (trade.offers.some(offer => !object(offer) || !fields(offer, ['gold', 'goods', 'confirmed']) || !integer(offer.gold, 0, 1_000_000_000) || typeof offer.confirmed !== 'boolean' || !Array.isArray(offer.goods) || offer.goods.length > 12 || !offer.goods.every(validParcel)
      || new Set(offer.goods.map(good => `${good.item}:${good.instance ?? ''}`)).size !== offer.goods.length)) return false;
  }
  return true;
}
function nativeLot(item: string, epoch: number): FantasyEconomyShopLot {
  const count = capacity(item);
  return { id: `stock-${item}`, item, count, native: true, ...(foodMeta(item) ? { food: [{ id: `food-stock-${item}-${epoch}`, item, count, createdAt: epoch * RESTOCK_HOURS }] } : {}) };
}
function effectiveShop(ledger: FantasyEconomyLedger, location: string, id: FantasyBuildingId, now: number): FantasyEconomyShop {
  const epoch = Math.floor(now / RESTOCK_HOURS), prior = ledger.shops[shopKey(location, id)], stock = fantasyBuildingStock({ location }, id);
  if (!prior) return { revision: 0, epoch, lots: stock.map(item => nativeLot(item, epoch)) };
  const result = structuredClone(prior);
  if (epoch > prior.epoch) {
    result.epoch = epoch; result.revision++;
    result.lots = [...stock.map(item => nativeLot(item, epoch)), ...result.lots.filter(lot => !lot.native && !lot.food?.some(food => fantasyFoodLotQuality({ hour: now }, food) === 'spoiled'))];
  }
  return result;
}
const tradedPeer = (trade: FantasyEconomyTrade, profiles: ReadonlyMap<string, FantasyProfile>, context: FantasyEconomyContext) => trade.users.every((user, index) => {
  const p = profiles.get(user); return context.peers.includes(user) && idle(p) && generation(p!) === trade.generations[index] && p!.character!.location === trade.location;
});
function syncLedger(ledger: FantasyEconomyLedger, profiles: ReadonlyMap<string, FantasyProfile>, actor: string, context: FantasyEconomyContext) {
  const next = structuredClone(ledger), c = profiles.get(actor)?.character; let changed = false;
  if (c) for (const b of fantasyBuildings(c)) {
    if (!fantasyBuildingStock(c, b.id).length && !['market', 'archaeology'].includes(b.id)) continue;
    const key = shopKey(c.location, b.id), shop = effectiveShop(next, c.location, b.id, context.hour);
    if (!next.shops[key] || shop.epoch !== next.shops[key].epoch) { next.shops[key] = shop; changed = true; }
  }
  for (const trade of Object.values(next.trades)) if (trade.status === 'open' && trade.users.includes(actor)
    && (trade.expiresAt <= context.hour || !tradedPeer(trade, profiles, context))) { trade.status = 'cancelled'; changed = true; }
  if (changed) next.revision++;
  return { next, changed };
}
export function closeFantasyEconomyTrades(ledger: FantasyEconomyLedger): FantasyEconomyLedger {
  const next = structuredClone(ledger); let changed = false;
  for (const trade of Object.values(next.trades)) if (trade.status === 'open') { trade.status = 'cancelled'; changed = true; }
  if (changed) next.revision++;
  return next;
}
function take(character: FantasyCharacter, selection: FantasyEconomySelection, quality?: FantasyFoodQuality): FantasyEconomyParcel | undefined {
  const ownedGear = character.gear?.filter(g => g.item === selection.item) ?? [], gear = selection.instance ? ownedGear.find(g => g.id === selection.instance) : undefined;
  if (selection.instance && (!gear || selection.count !== 1) || !selection.instance && !foodMeta(selection.item) && (character.inventory[selection.item] ?? 0) - ownedGear.length < selection.count) return undefined;
  const parcel: FantasyEconomyParcel = { ...selection, ...(gear ? { gear: structuredClone(gear) } : {}) };
  if (foodMeta(selection.item)) {
    if (selection.instance) return undefined;
    let remaining = selection.count; parcel.food = [];
    for (const lot of character.foodLots.filter(f => f.item === selection.item && (!quality || fantasyFoodLotQuality(character, f) === quality)).sort((a, b) => a.createdAt - b.createdAt || a.id.localeCompare(b.id))) {
      const count = Math.min(remaining, lot.count); if (!count) continue;
      parcel.food.push({ ...lot, count }); lot.count -= count; remaining -= count;
    }
    if (remaining) return undefined;
    character.foodLots = character.foodLots.filter(f => f.count > 0);
    parcel.quality = quality ?? (parcel.food.every(f => fantasyFoodLotQuality(character, f) === 'fresh') ? 'fresh' : parcel.food.some(f => fantasyFoodLotQuality(character, f) === 'spoiled') ? 'spoiled' : 'stale');
  }
  if (!fantasySpendItem(character, selection.item, selection.count, selection.instance)) return undefined;
  return parcel;
}
function takeExact(character: FantasyCharacter, parcel: FantasyEconomyParcel): boolean {
  if (parcel.food) {
    if (parcel.food.some(food => !character.foodLots.some(current => current.id === food.id && current.item === food.item && current.createdAt === food.createdAt && current.count >= food.count))) return false;
    const quality = parcel.food.every(f => fantasyFoodLotQuality(character, f) === 'fresh') ? 'fresh' : parcel.food.some(f => fantasyFoodLotQuality(character, f) === 'spoiled') ? 'spoiled' : 'stale';
    if (quality !== parcel.quality) return false;
    for (const food of parcel.food) character.foodLots.find(current => current.id === food.id)!.count -= food.count;
    character.foodLots = character.foodLots.filter(food => food.count > 0);
    if (!fantasySpendItem(character, parcel.item, parcel.count)) return false;
    return true;
  }
  if (parcel.gear && JSON.stringify(character.gear?.find(g => g.id === parcel.instance)) !== JSON.stringify(parcel.gear)) return false;
  if (!parcel.gear && (character.inventory[parcel.item] ?? 0) - (character.gear?.filter(g => g.item === parcel.item).length ?? 0) < parcel.count) return false;
  return fantasySpendItem(character, parcel.item, parcel.count, parcel.instance);
}
function deliver(character: FantasyCharacter, parcel: FantasyEconomyParcel | FantasyEconomyShopLot, count: number, suffix: string) {
  if (!Number.isSafeInteger((character.inventory[parcel.item] ?? 0) + count)) return false;
  character.inventory[parcel.item] = (character.inventory[parcel.item] ?? 0) + count;
  if (parcel.gear) { character.gear ??= []; character.gear.push({ ...structuredClone(parcel.gear), id: `gear-exchange-${suffix}`.slice(0, 115) }); }
  if (parcel.food) {
    let remaining = count;
    for (const [index, food] of parcel.food.entries()) {
      const amount = Math.min(remaining, food.count); if (!amount) continue;
      character.foodLots.push({ ...food, id: `food-exchange-${suffix}-${index}`.slice(0, 150), count: amount }); remaining -= amount;
    }
  }
  return true;
}
function demand(shop: FantasyEconomyShop, item: string) {
  const total = shop.lots.filter(lot => lot.item === item).reduce((sum, lot) => sum + lot.count, 0), cap = capacity(item);
  return Math.max(.8, Math.min(1.35, 1 + (cap - total) / cap * .3));
}
function sellableHere(c: FantasyCharacter, id: FantasyBuildingId, item: string) {
  if (!local(c, id) || !canSellItem(c, item)) return false;
  if (itemOf(item)?.category === 'relic') return id === 'archaeology';
  return id === 'market' || id === 'blacksmith' || id === 'alchemist' || id === 'restaurant' || id === 'shipyard' && (itemOf(item)?.category === 'ship-material' || !!mapOf(item)) || id === 'tower' && fantasyBuildingStock(c, id).includes(item);
}
function lotPrice(c: FantasyCharacter, shop: FantasyEconomyShop, lot: FantasyEconomyShopLot, multiplier = 1) {
  const age = lot.food?.some(food => fantasyFoodLotQuality(c, food) === 'spoiled') ? 0 : lot.food?.some(food => fantasyFoodLotQuality(c, food) === 'stale') ? .65 : 1;
  if (!age) return 0;
  const craftsmanship = lot.gear ? 1 + (lot.gear.quality - 1) * .12 : 1;
  return fantasyPrice(c, Math.max(1, Math.ceil(basePrice(lot.item) * demand(shop, lot.item) * age * craftsmanship * Math.max(.75, Math.min(1.5, multiplier)))), 'goods');
}
function salePrice(shop: FantasyEconomyShop, group: { item: string; unitPrice: number }) {
  return Math.max(1, Math.min(group.unitPrice, Math.floor(group.unitPrice * demand(shop, group.item))));
}
export function fantasyEconomyState(ledger: FantasyEconomyLedger, profiles: ReadonlyMap<string, FantasyProfile>, actor: string, context: FantasyEconomyContext): FantasyEconomyState {
  const p = profiles.get(actor), c = p?.character;
  if (!c) return { revision: ledger.revision, location: null, peers: [], shops: [], trades: [] };
  return { revision: ledger.revision, location: c.location,
    peers: context.peers.filter(user => user !== actor && idle(profiles.get(user)) && profiles.get(user)!.character!.location === c.location).map(id => ({ id, name: profiles.get(id)!.character!.name })),
    shops: fantasyBuildings(c).filter(b => fantasyBuildingStock(c, b.id).length || ['market', 'archaeology'].includes(b.id)).map(b => {
      const shop = effectiveShop(ledger, c.location, b.id, context.hour), now = { ...c, hour: context.hour };
      const visible = [...shop.lots, ...fantasyBuildingStock(c, b.id).filter(item => !shop.lots.some(lot => lot.id === `stock-${item}`)).map(item => ({ ...nativeLot(item, shop.epoch), count: 0 }))];
      return { building: b.id, revision: shop.revision, restockAt: (shop.epoch + 1) * RESTOCK_HOURS,
        lots: visible.filter(lot => lotPrice(now, shop, lot, context.priceMultiplier) > 0).map(lot => ({ id: lot.id, item: lot.item, count: lot.count, unitPrice: lotPrice(now, shop, lot, context.priceMultiplier), ...(lot.gear ? { gearQuality: lot.gear.quality } : {}) })),
        sales: fantasySaleGroups(now).filter(group => sellableHere(now, b.id, group.item)).map(group => ({ key: group.key, item: group.item, count: group.count,
          unitPrice: salePrice(shop, group), canSell: group.canSell, ...(group.quality ? { quality: group.quality } : {}), ...(group.instance ? { instance: group.instance } : {}) })),
      };
    }),
    trades: Object.values(ledger.trades).filter(trade => trade.users.includes(actor) && (trade.status !== 'open' || trade.expiresAt > context.hour && tradedPeer(trade, profiles, context)))
      .slice(-8).map(trade => ({ id: trade.id, revision: trade.revision, mine: trade.users.indexOf(actor) as 0 | 1, users: [...trade.users], names: [...trade.names], expiresAt: trade.expiresAt, status: trade.status,
        offers: trade.offers.map(offer => ({ gold: offer.gold, confirmed: offer.confirmed, items: offer.goods.map(good => ({ item: good.item, count: good.count, ...(good.instance ? { instance: good.instance, gearQuality: good.gear!.quality } : {}), ...(good.quality ? { quality: good.quality } : {}) })) })) })),
  };
}
export function fantasyEconomyShopQuote(state: FantasyEconomyState, id: FantasyBuildingId, item: string, lot?: string) {
  const shop = state.shops.find(shop => shop.building === id), selected = shop?.lots.find(entry => entry.item === item && (lot ? entry.id === lot : entry.id === `stock-${item}`));
  return selected && shop ? { ...selected, revision: shop.revision, building: id } : undefined;
}
function log(p: FantasyProfile, text: string) {
  p.log = [...p.log, { id: Math.max(0, ...p.log.map(entry => entry.id)) + 1, hour: p.character!.hour, kind: 'system' as const, text }].slice(-100); p.revision++;
}
export function applyFantasyEconomyCommand(ledger: FantasyEconomyLedger, profiles: ReadonlyMap<string, FantasyProfile>, actor: string, command: FantasyEconomyCommand, context: FantasyEconomyContext): FantasyEconomyResult {
  if (!isFantasyEconomyCommand(command) || !hour(context.hour) || !Array.isArray(context.peers) || !context.peers.includes(actor)) return unchanged(ledger, profiles, 'invalid');
  const p = profiles.get(actor), c = p?.character;
  if (!c || p!.death || c.hp <= 0) return unchanged(ledger, profiles, 'not-alive');
  const synchronized = syncLedger(ledger, profiles, actor, context), next = synchronized.next, updated = new Map(profiles);
  if (command.type === 'sync') return { ledger: next, profiles: updated, changed: synchronized.changed };
  if (!idle(p) && command.type !== 'cancel') return unchanged(ledger, profiles, 'busy');
  if (!token(context.token)) return unchanged(ledger, profiles, 'invalid');
  const fail = (error: FantasyEconomyError) => unchanged(ledger, profiles, error);
  if (command.type === 'shopBuy' || command.type === 'shopSell') {
    if (!local(c, command.building)) return fail('unavailable');
    const key = shopKey(c.location, command.building), shop = effectiveShop(next, c.location, command.building, context.hour);
    if (shop.revision !== command.revision) return fail('stale');
    const current = structuredClone(p!), cc = current.character!; cc.hour = context.hour;
    if (command.type === 'shopBuy') {
      const lot = shop.lots.find(lot => lot.item === command.item && (command.lot ? lot.id === command.lot : lot.id === `stock-${command.item}`));
      if (!lot || lot.count < command.count) return fail('stock');
      if (lot.gear && command.count !== 1) return fail('invalid');
      const price = lotPrice(cc, shop, lot, context.priceMultiplier);
      if (!price) return fail('unavailable');
      if (command.quotedUnitPrice !== undefined && price !== command.quotedUnitPrice) return fail('stale');
      const total = price * command.count;
      if (!Number.isSafeInteger(total) || cc.gold < total) return fail('insufficient-gold');
      if ((cc.gear?.length ?? 0) + (lot.gear ? 1 : 0) > 1000 || cc.foodLots.length + (lot.food?.length ?? 0) > 1000) return fail('limit');
      cc.gold -= total; if (!deliver(cc, lot, command.count, context.token)) return fail('limit');
      if (lot.food) { let remaining = command.count; for (const food of lot.food) { const n = Math.min(remaining, food.count); food.count -= n; remaining -= n; } lot.food = lot.food.filter(food => food.count > 0); }
      lot.count -= command.count;
      log(current, `상점에서 ${command.item} ×${command.count} 구매 · -${total}G`);
    } else {
      if (!sellableHere(cc, command.building, command.item)) return fail('unavailable');
      const groups = fantasySaleGroups(cc, command.item), matching = groups.filter(group => (!command.instance || group.instance === command.instance) && (!command.quality || group.quality === command.quality)
        && (command.instance ? true : !group.instance));
      const selected = matching.length === 1 ? matching[0] : undefined;
      if (!selected || !selected.canSell || selected.count < command.count) return fail(selected?.reason === 'equipped' ? 'equipped' : 'missing-item');
      if (command.quotedUnitPrice !== undefined && salePrice(shop, selected) !== command.quotedUnitPrice) return fail('stale');
      if (shop.lots.filter(lot => !lot.native).length >= 300) return fail('limit');
      const parcel = take(cc, { item: command.item, count: command.count, ...(command.instance ? { instance: command.instance } : {}) }, command.quality);
      if (!parcel) return fail('equipped');
      const total = salePrice(shop, selected) * command.count;
      if (!Number.isSafeInteger(cc.gold + total)) return fail('limit');
      cc.gold += total;
      shop.lots.push({ id: `resale-${context.token}`, item: parcel.item, count: parcel.count, native: false, ...(parcel.food ? { food: parcel.food } : {}), ...(parcel.gear ? { gear: parcel.gear } : {}) });
      log(current, `상점에 ${command.item} ×${command.count} 판매 · +${total}G`);
    }
    shop.lots = shop.lots.filter(lot => lot.count > 0); shop.revision++; next.shops[key] = shop; next.revision++; updated.set(actor, current);
    return { ledger: next, profiles: updated, changed: true };
  }
  if (command.type === 'open') {
    const peer = profiles.get(command.peer);
    if (actor === command.peer || !context.peers.includes(command.peer) || !idle(peer) || peer!.character!.location !== c.location || !Object.hasOwn(FANTASY_SETTLEMENTS, c.location)) return fail('unavailable');
    if (Object.values(next.trades).some(trade => trade.status === 'open' && trade.users.some(user => user === actor || user === command.peer))) return fail('busy');
    if (Object.keys(next.trades).length >= 256) {
      const completed = Object.values(next.trades).find(trade => trade.status !== 'open'); if (!completed) return fail('limit'); delete next.trades[completed.id];
    }
    const id = `trade-${context.token}`.slice(0, 80);
    if (Object.hasOwn(next.trades, id)) return fail('invalid');
    next.trades[id] = { id, revision: 0, users: [actor, command.peer], generations: [generation(p!), generation(peer!)], names: [c.name, peer!.character!.name], location: c.location,
      expiresAt: context.hour + 1, status: 'open', offers: [{ gold: 0, goods: [], confirmed: false }, { gold: 0, goods: [], confirmed: false }] };
  } else {
    const trade = Object.hasOwn(next.trades, command.trade) ? next.trades[command.trade] : undefined;
    if (!trade || !trade.users.includes(actor)) return fail('unavailable');
    if (trade.revision !== command.revision) return fail('stale');
    if (command.type === 'cancel' && trade.status === 'cancelled') return { ledger: next, profiles: updated, changed: synchronized.changed };
    if (trade.status !== 'open' || trade.expiresAt <= context.hour || !tradedPeer(trade, profiles, context)) return fail('expired');
    const side = trade.users.indexOf(actor), offer = trade.offers[side];
    if (command.type === 'cancel') trade.status = 'cancelled';
    else if (command.type === 'offer') {
      if (c.gold < command.gold) return fail('insufficient-gold');
      const draft = structuredClone(c); draft.hour = context.hour;
      const goods: FantasyEconomyParcel[] = [];
      for (const selection of command.items) { const parcel = take(draft, selection); if (!parcel) return fail('equipped'); goods.push(parcel); }
      trade.offers[side] = { gold: command.gold, goods, confirmed: false }; trade.offers[1 - side].confirmed = false; trade.revision++;
    } else {
      if (offer.confirmed) return unchanged(ledger, profiles);
      const draft = structuredClone(c); draft.hour = context.hour;
      if (draft.gold < offer.gold || offer.goods.some(parcel => !takeExact(draft, parcel))) return fail('changed-goods');
      offer.confirmed = true;
      if (trade.offers.every(offer => offer.confirmed)) {
        const parties = trade.users.map(user => structuredClone(profiles.get(user)!));
        for (const [index, current] of parties.entries()) {
          current.character!.hour = context.hour; const offered = trade.offers[index];
          if (current.character!.gold < offered.gold || offered.goods.some(parcel => !takeExact(current.character!, parcel))) return fail('changed-goods');
          current.character!.gold -= offered.gold;
        }
        for (const [index, current] of parties.entries()) {
          const received = trade.offers[1 - index], character = current.character!;
          if (!Number.isSafeInteger(character.gold + received.gold) || (character.gear?.length ?? 0) + received.goods.filter(good => good.gear).length > 1000 || character.foodLots.length + received.goods.reduce((n, good) => n + (good.food?.length ?? 0), 0) > 1000) return fail('limit');
          character.gold += received.gold;
          for (const [n, parcel] of received.goods.entries()) if (!deliver(character, parcel, parcel.count, `${context.token}-${index}-${n}`)) return fail('limit');
          log(current, `${trade.names[1 - index]}와 물품 교환을 마쳤습니다.`); updated.set(trade.users[index], current);
        }
        trade.status = 'completed';
      }
    }
  }
  next.revision++;
  return { ledger: next, profiles: updated, changed: true };
}

export function fantasyEconomyText(error: string, locale: 'ko' | 'en' | 'ja') {
  const labels: Record<string, [string, string, string]> = {
    invalid: ['요청을 확인할 수 없습니다.', 'Invalid request.', '依頼を確認できません。'], busy: ['현재 행동이나 거래를 먼저 마쳐 주세요.', 'Finish the current activity or trade first.', 'いまの行動や取引を先に終えてください。'],
    'not-alive': ['지금은 거래할 수 없습니다.', 'Trading is unavailable now.', 'いまは取引できません。'], unavailable: ['이곳에서는 거래할 수 없습니다.', 'That trade is unavailable here.', 'ここでは取引できません。'],
    stale: ['내용이 바뀌었습니다. 다시 확인해 주세요.', 'The terms changed. Review them again.', '内容が変わりました。確認し直してください。'], expired: ['거래 약속이 끝났습니다.', 'This trade has expired.', '取引の約束が終了しました。'],
    'insufficient-gold': ['소지금이 부족합니다.', 'Not enough gold.', '所持金が足りません。'], 'missing-item': ['판매할 물품이나 상태를 다시 확인하세요.', 'Check the goods or their condition.', '売る品と状態を確認してください。'],
    equipped: ['착용 중이거나 지정하지 않은 개별 장비는 넘길 수 없습니다.', 'Unequip and select individual equipment first.', '装備を外し、個体を選んでください。'], stock: ['남은 재고가 부족합니다.', 'Not enough stock remains.', '在庫が足りません。'],
    limit: ['거래 가능한 수량을 넘었습니다.', 'The trading limit was reached.', '取引可能な上限に達しました。'], 'changed-goods': ['제안한 물품이나 금화가 달라졌습니다. 다시 제안해 주세요.', 'The offered goods or gold changed. Make a new offer.', '提示した品や金貨が変わりました。提示し直してください。'],
    'save-failed': ['거래를 기록하지 못했습니다. 다시 시도하세요.', 'The trade could not be saved. Try again.', '取引を記録できませんでした。再試行してください。'],
  };
  return (labels[error] ?? labels.invalid)[locale === 'ko' ? 0 : locale === 'en' ? 1 : 2];
}

export function fantasyEconomyLogText(source: string, locale: 'ko' | 'en' | 'ja'): string {
  const bought = source.match(/^상점에서 (.+) ×(\d+) 구매 · -(\d+)G$/), sold = source.match(/^상점에 (.+) ×(\d+) 판매 · \+(\d+)G$/), exchange = source.match(/^(.+)와 물품 교환을 마쳤습니다\.$/);
  const match = bought ?? sold;
  if (match) {
    const name = itemOf(match[1])?.names?.[locale] ?? mapOf(match[1])?.name[locale] ?? itemOf(match[1])?.name ?? match[1], count = match[2], amount = match[3];
    return locale === 'ko' ? `${name} ×${count} ${bought ? '구매' : '판매'} · ${bought ? '-' : '+'}${amount}G` : locale === 'en' ? `${bought ? 'Bought' : 'Sold'} ${name} ×${count} · ${bought ? '-' : '+'}${amount}G` : `${name} ×${count}を${bought ? '購入' : '売却'} · ${bought ? '-' : '+'}${amount}G`;
  }
  if (exchange) return locale === 'ko' ? source : locale === 'en' ? `Finished exchanging goods with ${exchange[1]}.` : `${exchange[1]}と品物の交換を終えた。`;
  return source;
}
