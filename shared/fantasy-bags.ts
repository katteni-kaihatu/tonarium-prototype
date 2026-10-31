import type { FantasyAction, FantasyCharacter, FantasyItem, FantasyProfile, FantasyResult, FantasyGearInstance, FantasyFoodLot } from './fantasy.ts';
import type { NpcLocale } from './npc.ts';
import { FANTASY_ITEMS } from './fantasy-data.ts';
import { FANTASY_BAGS, FANTASY_BAG_ITEMS } from './fantasy-bag-catalog.ts';
import { FANTASY_LOCATIONS } from './fantasy-data.ts';
import { FANTASY_MAPS } from './fantasy-town.ts';
import { FANTASY_FOOD_META } from './fantasy-life.ts';
import { validFantasyGear } from './fantasy-equipment.ts';
import { validFantasyFoodPreservation } from './fantasy-food-preservation.ts';
import { FANTASY_PRESERVATION_BAG, fantasyEquippedMagicBags, fantasyNormalBagId, fantasyFoodStorageAllocation } from './fantasy-bag-configuration.ts';
import { fantasyOnRoad } from './fantasy-travel.ts';
import { FANTASY_WORKSHOP_ITEM_WEIGHTS } from './fantasy-workshop-materials.ts';
import { FANTASY_INTERIOR_MAP_ITEM, validFantasyInteriorMapCopy, type FantasyInteriorMapCopy } from './fantasy-interior-map-catalog.ts';
export { FANTASY_BAGS, FANTASY_BAG_ITEMS } from './fantasy-bag-catalog.ts';
export { fantasyEquippedMagicBags, fantasyNormalBagId } from './fantasy-bag-configuration.ts';

export const FANTASY_STARTER_BAG = { id: 'starter-pack', weightLimit: 20_000, slotLimit: 24 } as const;
export type FantasyBagAction = { type: 'bagEquip'; item: string } | { type: 'magicBagRemove'; slot: 0 | 1 } | { type: 'bagClaim' };
export interface FantasyPendingLoot { items: Record<string, number>; gear: FantasyGearInstance[]; foodLots: FantasyFoodLot[]; interiorMaps?: FantasyInteriorMapCopy[] }
type Character = Pick<FantasyCharacter, 'inventory'> & { bag?: string; magicBags?: string[] };
const errors = {
  weight: { ko: '가방의 무게 한도를 넘깁니다. 물품을 줄이거나 더 큰 가방을 사용하세요.', en: 'This exceeds the bag’s weight limit. Remove goods or use a larger bag.', ja: '鞄の重量上限を超えます。荷物を減らすか、大きな鞄を使ってください。' },
  slots: { ko: '가방에 넣을 수 있는 물품 종류가 너무 많습니다.', en: 'This exceeds the number of item types the bag can hold.', ja: '鞄に入れられる品目の種類を超えます。' },
  owned: { ko: '실제로 보유한 가방을 선택하세요.', en: 'Select a bag you actually own.', ja: '実際に所持する鞄を選んでください。' },
  unavailable: { ko: '지금은 가방을 바꿀 수 없습니다.', en: 'You cannot change bags now.', ja: '今は鞄を替えられません。' },
  magicSlots: { ko: '마법 보조 가방은 두 개까지 착용할 수 있습니다. 먼저 하나를 해제하세요.', en: 'You can equip at most two supplementary magic bags. Remove one first.', ja: '魔法の補助鞄は二つまで装備できます。先に一つ外してください。' },
  removal: { ko: '해제 후 남는 가방 용량에 맞게 먼저 짐을 줄여 주세요.', en: 'Reduce your goods to fit the remaining bag capacity before removing this bag.', ja: '外した後の鞄の容量に収まるよう、先に荷物を減らしてください。' },
};
const weights: Record<string, number> = {
  'travel-umbrella': 600, 'shade-hat': 140, 'frost-charm': 80, 'ember-handwarmer': 350, 'cooling-camp-mat': 1100, 'frostweave-cloak': 650, 'emberlined-coat': 1800,
  herb: 20, ore: 2000, wood: 1500, meal: 400, lantern: 800, 'guild-loan-lantern': 1000, 'guild-loan-bedroll': 1800, bread: 250, jerky: 80, fish: 500, meat: 500, spice: 50, silk: 200, crystal: 200, gem: 50,
  blade: 1800, potion: 300, antidote: 150, linen: 350, 'wolf-hide': 900, 'bear-hide': 1800, 'lizard-hide': 800,
  'elder-dragon-scale': 1200, 'ancient-frostheart': 700, 'ancient-storm-sinew': 400, 'void-chimera-prism': 250,
  'steel-sword': 2200, 'iron-spear': 2400, 'oak-bow': 1100, 'mana-staff': 1200, 'steel-crossbow': 2800, 'sacred-book': 700, 'iron-shield': 3500,
};
const categoryWeights: Record<string, number> = { herb: 20, ore: 2000, ingot: 1000, wood: 1500, hide: 900, cloth: 350, silk: 200, fiber: 150, gem: 50, crystal: 200, relic: 500, artifact: 500, weapon: 1800, armor: 5500, food: 250, potion: 300, 'alchemy-potion': 350, map: 50, tool: 800, 'apex-material': 700 };
// グラムで数え、同じ品の個体記録や食品ロットを二重計上しない。
export function fantasyItemWeight(value: FantasyItem | string): number {
  const id = typeof value === 'string' ? value : value.id, bag = FANTASY_BAGS.find(bag => bag.id === id); if (bag) return bag.weight;
  if (Object.hasOwn(FANTASY_WORKSHOP_ITEM_WEIGHTS, id)) return FANTASY_WORKSHOP_ITEM_WEIGHTS[id];
  if (Object.hasOwn(weights, id)) return weights[id];
  const item = typeof value === 'string' ? FANTASY_ITEMS.find(item => item.id === id) ?? FANTASY_BAG_ITEMS.find(item => item.id === id) : value;
  if (!item) return 250;
  if (item.equipment) return ({ weapon: 1800, offhand: 2500, armor: 5500, accessory: 100, head: 500, body: 5500, legs: 1200, feet: 900, ring1: 30, ring2: 30, necklace: 100, gloves: 220, artifact: 500 })[item.equipment.slot];
  if (item.category && Object.hasOwn(categoryWeights, item.category)) return categoryWeights[item.category];
  if (item.food) return 250;
  if (item.light) return 800;
  if (/^(hp|mp|fatigue)-potion/.test(id)) return 300;
  if (/chart|map|fragment|scroll/.test(id)) return 50;
  if (/ingot/.test(id)) return 1000;
  if (/boat|airship/.test(id)) return 50_000;
  return 250;
}
export function validFantasyBag(c: Character): boolean {
  if (c.bag !== undefined && (typeof c.bag !== 'string' || !FANTASY_BAGS.some(bag => bag.id === c.bag) || !Number.isSafeInteger(c.inventory[c.bag]) || c.inventory[c.bag] < 1)) return false;
  const legacy = FANTASY_BAGS.some(bag => bag.id === c.bag && bag.kind === 'magic');
  if (c.magicBags !== undefined && (!Array.isArray(c.magicBags) || c.magicBags.length > 2 || legacy)) return false;
  const magic = fantasyEquippedMagicBags(c);
  return magic.every(id => typeof id === 'string' && FANTASY_BAGS.some(bag => bag.id === id && bag.kind === 'magic') && Number.isSafeInteger(c.inventory[id]) && c.inventory[id] >= magic.filter(value => value === id).length);
}
export function fantasyPreservedFoodAllocation(c: Character) {
  return fantasyFoodStorageAllocation(c.inventory, validFantasyBag(c) ? fantasyEquippedMagicBags(c) : [], new Set(FANTASY_FOOD_META.map(food => food.item)), fantasyItemWeight);
}
export function fantasyBagState(c: Character) {
  const selected = validFantasyBag(c) ? FANTASY_BAGS.find(bag => bag.id === fantasyNormalBagId(c)) : undefined, bag = selected ?? FANTASY_STARTER_BAG;
  const magicBags = validFantasyBag(c) ? fantasyEquippedMagicBags(c) : [];
  const extra = magicBags.filter(id => id !== FANTASY_PRESERVATION_BAG).map(id => FANTASY_BAGS.find(bag => bag.id === id)!);
  const food = fantasyPreservedFoodAllocation(c);
  const weightLimit = bag.weightLimit + extra.reduce((sum, bag) => sum + bag.weightLimit, 0) + food.weight;
  // A partially stored food type still occupies a slot outside the preservation bag.
  const foodOnlySlots = Object.entries(food.counts).filter(([item, count]) => count === c.inventory[item]).length;
  const slotLimit = bag.slotLimit + extra.reduce((sum, bag) => sum + bag.slotLimit, 0) + foodOnlySlots;
  let weight = 0, slots = 0;
  for (const [id, count] of Object.entries(c.inventory)) if (Number.isSafeInteger(count) && count > 0) { slots++; weight += fantasyItemWeight(id) * count; }
  return { bag: bag.id, magicBags, foodStorage: food, weight, weightLimit, slots, slotLimit, overloaded: weight > weightLimit || slots > slotLimit };
}
function equippedConfiguration(c: Character, item: string): Character {
  const magicBags = fantasyEquippedMagicBags(c), main = fantasyNormalBagId(c);
  return { ...c, bag: FANTASY_BAGS.find(bag => bag.id === item)?.kind === 'magic' ? main === 'starter-pack' ? undefined : main : item === 'starter-pack' ? undefined : item,
    magicBags: FANTASY_BAGS.find(bag => bag.id === item)?.kind === 'magic' ? [...magicBags, item] : magicBags };
}
export function fantasyBagEquipError(c: Character, item: string): string | undefined {
  if (item !== FANTASY_STARTER_BAG.id && (!FANTASY_BAGS.some(bag => bag.id === item) || !Number.isSafeInteger(c.inventory[item]) || c.inventory[item] < 1)) return errors.owned.ja;
  if (FANTASY_BAGS.find(bag => bag.id === item)?.kind === 'magic' && fantasyEquippedMagicBags(c).length >= 2) return errors.magicSlots.ja;
  const configuration = equippedConfiguration(c, item); if (!validFantasyBag(configuration)) return errors.owned.ja;
  const next = fantasyBagState(configuration);
  if (next.weight > next.weightLimit) return errors.weight.ja;
  if (next.slots > next.slotLimit) return errors.slots.ja;
}
export function fantasyMagicBagRemoveError(c: Character, slot: 0 | 1): string | undefined {
  const magicBags = fantasyEquippedMagicBags(c); if (!Number.isInteger(slot) || slot < 0 || slot >= magicBags.length) return errors.owned.ja;
  magicBags.splice(slot, 1); const main = fantasyNormalBagId(c);
  const next = fantasyBagState({ ...c, bag: main === 'starter-pack' ? undefined : main, magicBags });
  return next.overloaded ? errors.removal.ja : undefined;
}
// 同じ鞄なら古い超過荷物の整理を許し、鞄の変更時は全量が収まることを求める。
export function fantasyBagChangeError(before: FantasyProfile, after: FantasyProfile): string | undefined {
  if (!after.character) return;
  if (!validFantasyBag(after.character)) return errors.owned.ja;
  if (before.character && (fantasyNormalBagId(before.character) !== fantasyNormalBagId(after.character) || JSON.stringify(fantasyEquippedMagicBags(before.character)) !== JSON.stringify(fantasyEquippedMagicBags(after.character)))) {
    const next = fantasyBagState(after.character); if (next.overloaded) return errors.removal.ja;
  }
  const next = fantasyBagState(after.character), previous = before.character ? fantasyBagState(before.character) : { weight: 0, weightLimit: 20_000, slots: 0, slotLimit: 24 };
  if (Math.max(0, next.weight - next.weightLimit) > Math.max(0, previous.weight - previous.weightLimit)) return errors.weight.ja;
  if (Math.max(0, next.slots - next.slotLimit) > Math.max(0, previous.slots - previous.slotLimit)) return errors.slots.ja;
}
export function fantasyBagActionValid(value: unknown): value is FantasyBagAction {
  if (!value || typeof value !== 'object' || Array.isArray(value)) return false; const v = value as Record<string, unknown>;
  if (v.type === 'bagClaim') return Object.keys(v).length === 1;
  if (v.type === 'magicBagRemove') return Object.keys(v).length === 2 && (v.slot === 0 || v.slot === 1);
  return Object.keys(v).length === 2 && v.type === 'bagEquip' && typeof v.item === 'string' && (v.item === 'starter-pack' || FANTASY_BAGS.some(bag => bag.id === v.item));
}
export function applyFantasyBagAction(profile: FantasyProfile, action: FantasyAction | FantasyBagAction): FantasyResult | undefined {
  if (action.type === 'bagClaim') return claimFantasyPendingLoot(profile);
  if (action.type !== 'bagEquip' && action.type !== 'magicBagRemove') return;
  const fail = (error: string): FantasyResult => ({ profile, changed: false, error }), c = profile.character;
  if (!c || profile.death || c.hp <= 0 || profile.activity || profile.combatId || profile.event) return fail(errors.unavailable.ja);
  if (!fantasyBagActionValid(action)) return fail(errors.owned.ja);
  const equipError = action.type === 'magicBagRemove' ? fantasyMagicBagRemoveError(c, action.slot) : fantasyBagEquipError(c, action.item); if (equipError) return fail(equipError);
  const next = structuredClone(profile), target = next.character!;
  const removed = action.type === 'magicBagRemove' ? fantasyEquippedMagicBags(c)[action.slot] : undefined;
  if (action.type === 'magicBagRemove') {
    target.magicBags = fantasyEquippedMagicBags(c); target.magicBags.splice(action.slot, 1);
    const main = fantasyNormalBagId(c); if (main === 'starter-pack') delete target.bag; else target.bag = main;
  } else {
    const configuration = equippedConfiguration(c, action.item);
    if (configuration.bag === undefined) delete target.bag; else target.bag = configuration.bag;
    target.magicBags = configuration.magicBags;
  }
  const error = fantasyBagChangeError(profile, next); if (error) return fail(error);
  next.revision++;
  next.log.push({ id: (next.log.at(-1)?.id ?? 0) + 1, hour: target.hour, kind: 'system', text: action.type === 'magicBagRemove' ? `bag:remove:${removed}` : `bag:equip:${action.item}` }); next.log = next.log.slice(-100);
  return { profile: next, changed: true };
}
export function fantasyBagText(source: string, locale: NpcLocale): string | undefined {
  if (source === 'bag:delivery') return { ko: '가방에 들어가지 않은 보상을 이 지역의 보관품으로 남겼습니다. 여유를 만든 뒤 수령하세요.', en: 'Rewards that did not fit are held for you here. Make room and collect them later.', ja: '入りきらない報酬をこの地域の預かり品に残した。空きを作って受け取れる。' }[locale];
  if (source === 'bag:claimed') return { ko: '현재 가방에 들어가는 보관품을 수령했습니다. 남은 물품은 계속 보관됩니다.', en: 'Collected the held goods that fit. Any remainder stays safely held.', ja: '鞄に入る預かり品を受け取った。残りは引き続き保管される。' }[locale];
  const error = Object.values(errors).find(error => error.ja === source); if (error) return error[locale];
  if (source.startsWith('bag:remove:')) { const name = FANTASY_BAGS.find(bag => bag.id === source.slice(11))?.names[locale]; if (name) return { ko: `${name}을 해제했습니다.`, en: `Removed ${name}.`, ja: `${name}を外した。` }[locale]; }
  const id = source.startsWith('bag:equip:') ? source.slice(10) : '', name = id === 'starter-pack' ? { ko: '기본 배낭', en: 'Starter pack', ja: '最初の背嚢' }[locale] : FANTASY_BAGS.find(bag => bag.id === id)?.names[locale];
  if (!name) return;
  return { ko: `${name}을 사용하도록 바꿨습니다.`, en: `Now using ${name}.`, ja: `${name}に持ち替えた。` }[locale];
}

const object = (v: unknown): v is Record<string, unknown> => !!v && typeof v === 'object' && !Array.isArray(v);
const knownItem = (id: string) => FANTASY_ITEMS.some(item => item.id === id) || FANTASY_MAPS.some(map => map.item === id);
export function validFantasyPendingLoot(c: FantasyCharacter): boolean {
  const loot = c.pendingLoot; if (loot === undefined) return true;
  if (!object(loot) || Object.keys(loot).length > FANTASY_LOCATIONS.length) return false;
  const gearIds = new Set((c.gear ?? []).map(gear => gear.id)), foodIds = new Set(c.foodLots.map(lot => lot.id));
  for (const [location, pending] of Object.entries(loot)) {
    if (!FANTASY_LOCATIONS.some(place => place.id === location) || !object(pending) || ![3, 4].includes(Object.keys(pending).length) || Object.keys(pending).some(key => !['items', 'gear', 'foodLots', 'interiorMaps'].includes(key)) || !object(pending.items) || !Array.isArray(pending.gear) || !Array.isArray(pending.foodLots)) return false;
    if (pending.interiorMaps !== undefined && (!Array.isArray(pending.interiorMaps) || pending.interiorMaps.some(copy => !validFantasyInteriorMapCopy(copy)))) return false;
    if ((pending.interiorMaps?.length ?? 0) !== (pending.items[FANTASY_INTERIOR_MAP_ITEM] ?? 0)) return false;
    if (Object.keys(pending.items).length > FANTASY_ITEMS.length + FANTASY_MAPS.length || Object.entries(pending.items).some(([id, count]) => !knownItem(id) || !Number.isSafeInteger(count) || Number(count) < 1 || Number(count) > 1_000_000)) return false;
    if (!validFantasyGear({ ...c, inventory: pending.items, gear: pending.gear, equipment: undefined, equippedGear: undefined } as FantasyCharacter)) return false;
    for (const gear of pending.gear) { if (gearIds.has(gear.id)) return false; gearIds.add(gear.id); }
    const foods = new Map<string, number>();
    for (const lot of pending.foodLots) {
      if (!object(lot) || Object.keys(lot).some(key => !['id', 'item', 'count', 'createdAt', 'preservedHours', 'preservationAt'].includes(key)) || !validFantasyFoodPreservation(lot, c.hour) || typeof lot.id !== 'string' || !lot.id.trim() || lot.id.length > 120 || /[\u0000-\u001f\u007f]/.test(lot.id) || foodIds.has(lot.id) || !FANTASY_FOOD_META.some(meta => meta.item === lot.item) || !Number.isSafeInteger(lot.count) || lot.count < 1 || !Number.isFinite(lot.createdAt) || lot.createdAt < 0 || lot.createdAt > c.hour) return false;
      foodIds.add(lot.id); foods.set(lot.item, (foods.get(lot.item) ?? 0) + lot.count);
    }
    for (const meta of FANTASY_FOOD_META) if ((foods.get(meta.item) ?? 0) !== (pending.items[meta.item] ?? 0)) return false;
  }
  return true;
}
function uniqueDeliveryId(c: FantasyCharacter, gear: boolean): string {
  const all = new Set([...(gear ? c.gear ?? [] : c.foodLots).map(value => value.id), ...Object.values(c.pendingLoot ?? {}).flatMap(pending => (gear ? pending.gear : pending.foodLots).map(value => value.id))]);
  let i = 0; const prefix = `${gear ? 'gear-' : ''}delivery-${Math.floor(c.hour)}-`; while (all.has(`${prefix}${i}`)) i++; return `${prefix}${i}`;
}
// 完了した報酬の増加分だけを預け、既存の荷物には触れない。
export function fantasyEscrowBagOverflow(before: FantasyProfile, after: FantasyProfile): FantasyProfile {
  if (!after.character || !before.character || !fantasyBagChangeError(before, after)) return after;
  const next = structuredClone(after), c = next.character!, old = before.character, previous = fantasyBagState(old);
  const weightExcess = Math.max(0, previous.weight - previous.weightLimit), slotExcess = Math.max(0, previous.slots - previous.slotLimit);
  const fits = (inventory: Record<string, number>) => { const state = fantasyBagState({ ...c, inventory }); return Math.max(0, state.weight - state.weightLimit) <= weightExcess && Math.max(0, state.slots - state.slotLimit) <= slotExcess; };
  const added = Object.entries(c.inventory).map(([id, count]) => [id, Math.max(0, count - (old.inventory[id] ?? 0))] as const).filter(([, count]) => count > 0).sort(([a], [b]) => fantasyItemWeight(b) - fantasyItemWeight(a));
  const oldGear = new Set((old.gear ?? []).map(gear => gear.id)), oldFood = new Map(old.foodLots.map(lot => [lot.id, lot.count]));
  let stored = false;
  for (const [id, gained] of added) {
    if (fits(c.inventory)) break;
    const originalCount = c.inventory[id], base = originalCount - gained;
    let low = 0, high = gained;
    if (fits({ ...c.inventory, [id]: base })) while (low < high) { const middle = Math.ceil((low + high) / 2); if (fits({ ...c.inventory, [id]: base + middle })) low = middle; else high = middle - 1; }
    const count = gained - low;
    if (!count) continue;
    const pending = (c.pendingLoot ??= {})[c.location] ??= { items: {}, gear: [], foodLots: [] };
    pending.items[id] = (pending.items[id] ?? 0) + count; c.inventory[id] -= count; stored = true;
    if (id === FANTASY_INTERIOR_MAP_ITEM) {
      const oldCopies = new Set((old.interiorMaps ?? []).map(copy => copy.id)), moved = (c.interiorMaps ?? []).filter(copy => !oldCopies.has(copy.id)).slice(0, count);
      c.interiorMaps = (c.interiorMaps ?? []).filter(copy => !moved.includes(copy)); (pending.interiorMaps ??= []).push(...moved);
    }
    const movedGear = (c.gear ?? []).filter(gear => gear.item === id && !oldGear.has(gear.id)).slice(0, count);
    if (c.gear) c.gear = c.gear.filter(gear => !movedGear.includes(gear));
    for (const gear of movedGear) { const copy = structuredClone(gear); copy.id = uniqueDeliveryId(c, true); pending.gear.push(copy); }
    if (FANTASY_FOOD_META.some(meta => meta.item === id)) {
      let remaining = count;
      for (const lot of [...c.foodLots].reverse()) if (lot.item === id && remaining) {
        const moved = Math.min(remaining, Math.max(0, lot.count - (oldFood.get(lot.id) ?? 0))); if (!moved) continue;
        pending.foodLots.push({ ...lot, id: uniqueDeliveryId(c, false), count: moved }); lot.count -= moved; remaining -= moved;
      }
      if (remaining) pending.foodLots.push({ id: uniqueDeliveryId(c, false), item: id, count: remaining, createdAt: c.hour });
      c.foodLots = c.foodLots.filter(lot => lot.count > 0);
    }
  }
  if (stored) { next.log.push({ id: (next.log.at(-1)?.id ?? 0) + 1, hour: c.hour, kind: 'system', text: 'bag:delivery' }); next.log = next.log.slice(-100); }
  return next;
}
function claimFantasyPendingLoot(profile: FantasyProfile): FantasyResult {
  const original = profile.character, fail = (): FantasyResult => ({ profile, changed: false, error: errors.unavailable.ja });
  if (!original || original.hp <= 0 || profile.death || profile.activity || profile.combatId || profile.event || fantasyOnRoad(original) || !validFantasyPendingLoot(original) || !original.pendingLoot || !Object.hasOwn(original.pendingLoot, original.location)) return fail();
  const next = structuredClone(profile), c = next.character!, pending = c.pendingLoot![c.location]; let claimed = false;
  for (const [id, quantity] of Object.entries(pending.items)) {
    let low = 0, high = Math.min(quantity, 1_000_000 - (c.inventory[id] ?? 0));
    while (low < high) { const middle = Math.ceil((low + high) / 2); if (!fantasyBagState({ ...c, inventory: { ...c.inventory, [id]: (c.inventory[id] ?? 0) + middle } }).overloaded) low = middle; else high = middle - 1; }
    let count = low;
    const gears = pending.gear.filter(gear => gear.item === id), ordinary = quantity - gears.length, gearRoom = Math.max(0, 1000 - (c.gear?.length ?? 0)); count = Math.min(count, ordinary + gearRoom);
    if (count < 1) continue;
    c.inventory[id] = (c.inventory[id] ?? 0) + count; pending.items[id] -= count; claimed = true;
    if (id === FANTASY_INTERIOR_MAP_ITEM) {
      const moved = (pending.interiorMaps ?? []).slice(0, count); pending.interiorMaps = (pending.interiorMaps ?? []).filter(copy => !moved.includes(copy)); (c.interiorMaps ??= []).push(...moved);
    }
    const moving = gears.slice(0, Math.min(count, gearRoom)); pending.gear = pending.gear.filter(gear => !moving.includes(gear));
    for (const gear of moving) { const copy = structuredClone(gear); copy.id = uniqueDeliveryId(c, true); (c.gear ??= []).push(copy); }
    let remaining = count;
    for (const lot of pending.foodLots) if (lot.item === id && remaining) { const moved = Math.min(remaining, lot.count); c.foodLots.push({ ...lot, id: uniqueDeliveryId(c, false), count: moved }); lot.count -= moved; remaining -= moved; }
    pending.foodLots = pending.foodLots.filter(lot => lot.count > 0);
    if (!pending.items[id]) delete pending.items[id];
  }
  if (!claimed) return fail();
  if (!Object.keys(pending.items).length) delete c.pendingLoot![c.location];
  next.revision++; next.log.push({ id: (next.log.at(-1)?.id ?? 0) + 1, hour: c.hour, kind: 'system', text: 'bag:claimed' }); next.log = next.log.slice(-100);
  return { profile: next, changed: true };
}
