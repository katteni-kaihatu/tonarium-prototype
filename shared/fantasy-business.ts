import { fantasyBusinessDemand, type FantasyBusinessDemand } from './fantasy-business-demand.ts';
import { enlistFantasyWorkerCompanion, fantasyWorkerCompanionId } from './fantasy-worker-companions.ts';
import { FANTASY_BUSINESS_WORKERS as catalog, FANTASY_BUSINESS_JOBS } from './fantasy-worker-catalog.ts';
import type { FantasyProfile } from './fantasy.ts';
import type { NpcLocale } from './npc.ts';
import { FANTASY_ITEMS, FANTASY_RECIPES } from './fantasy-data.ts';
import { takeFantasyEconomyParcel, deliverFantasyEconomyParcel, validFantasyEconomyParcel, type FantasyEconomyParcel } from './fantasy-economy.ts';
import type { FantasyFoodQuality } from './fantasy-life.ts';
import { fantasyBuildings } from './fantasy-town.ts';
import { foodMeta } from './fantasy-life.ts';
import { fantasyFoodLotQuality } from './fantasy-sales.ts';
import { fantasyItemWeight, fantasyBagChangeError } from './fantasy-bags.ts';
import { fantasyBlackMarketOpening } from './fantasy-black-market.ts';
import { fantasyStats } from './fantasy-engine.ts';
import { FANTASY_PROPERTY_PLOTS, type FantasyPropertyLedger, type FantasyPropertyRecord, type FantasyPropertyChange } from './fantasy-property.ts';
import { fantasyPropertyCanUse } from './fantasy-property-extensions.ts';
import { fantasyFurniture } from './fantasy-furniture.ts';
import { fantasyCommissionRecipeAllowed } from './fantasy-commissions.ts';

type Text = Record<NpcLocale, string>;
const l = (ko: string, en: string, ja: string): Text => ({ ko, en, ja });
export { FANTASY_BUSINESS_JOBS } from './fantasy-worker-catalog.ts';

export type FantasyWorkerProgress = Record<string, Record<string, number>>;
export interface FantasyEmployee {
  npc: string; user: string; generation: number; hiredAt: number; expiresAt: number; source: 'guild' | 'blackMarket';
  skills: Record<string, number>; learning: number; plot?: string; job?: string; recipe?: string; mode?: 'sell' | 'craft'; salesItem?: string; lastAt: number; estate?: true; company?: true;
}
export interface FantasyBusinessReport { at: number; item: string; produced: number; sold: number; revenue: number; wages: number }
export interface FantasyBusiness { report?: FantasyBusinessReport; inventory: Record<string, number>; treasury: number; lastAt: number; parcels?: { id: string; goods: FantasyEconomyParcel }[] }
export interface FantasyEmployeeView {
  id: string; names: Text; race: string; role: Text; source: 'guild' | 'blackMarket'; fee: number; wage: number; combatJob?: string;
  details?: { skills: Record<string, number>; learning: number }; expiresAt?: number; plot?: string; job?: string; recipe?: string; mode?: 'sell' | 'craft'; salesItem?: string; company?: true;
}
export interface FantasyWorkforceView { candidates: FantasyEmployeeView[]; employees: FantasyEmployeeView[]; canInspect: boolean; revision: number }
export interface FantasyBusinessView { demands: FantasyBusinessDemand[]; report?: FantasyBusinessReport; parcels: { id: string; item: string; count: number; instance?: string; quality?: FantasyFoodQuality; gearQuality?: number }[]; inventory: Record<string, number>; treasury: number; weight: number; capacity: number; slots: number; slotLimit: number; workers: FantasyEmployeeView[]; recipes: { id: string; job: string; output: string; count: number; inputs: Record<string, number> }[]; canUse: boolean }
type Base = { plot: string; revision: number; requestId: string };
export type FantasyBusinessCommand = Base & (
  { type: 'workerHire'; npc: string; source: 'guild' | 'blackMarket' }
  | { type: 'workerRelease'; npc: string }
  | { type: 'workerCompany'; npc: string }
  | { type: 'workerAssign'; npc: string; job: string; mode: 'sell' | 'craft'; recipe?: string; salesItem?: string }
  | { type: 'warehouseDeposit' | 'warehouseWithdraw'; item: string; count: number; instance?: string; quality?: FantasyFoodQuality; parcel?: string }
  | { type: 'businessDeposit'; amount: number }
  | { type: 'businessWithdraw'; amount: number }
);
const find = (id: string) => catalog.find(n => n.id === id);
const object = (v: unknown): v is Record<string, any> => !!v && typeof v === 'object' && !Array.isArray(v);
const int = (v: unknown, min = 0, max = 1_000_000): v is number => Number.isSafeInteger(v) && Number(v) >= min && Number(v) <= max;
const time = (v: unknown): v is number => typeof v === 'number' && Number.isFinite(v) && v >= 0;
const keys = (v: object, allowed: string[]) => Object.keys(v).every(k => allowed.includes(k));
const same = (w: FantasyEmployee, actor: string, p?: FantasyProfile) => !!p?.character && !p.death && !w.estate && w.user === actor && w.generation === (p.generation ?? 1);
// 個体や鮮度のある品は、数だけの在庫と分けて荷包みで保存する。
export function fantasyWarehouseItem(item: string): boolean {
  const value = FANTASY_ITEMS.find(v => v.id === item);
  return !!value && !value.equipment && !foodMeta(item) && !['artifact', 'relic', 'map', 'black-market-relic', 'black-market-study', 'alchemy-potion', 'interior-map'].includes(value.category ?? '')
    && !/relic|unidentified|map|chart|potion|antidote/.test(item);
}
export function fantasyWarehouseSupported(item: string): boolean {
  const value = FANTASY_ITEMS.find(v => v.id === item);
  return !!value && !['artifact', 'relic', 'black-market-relic', 'black-market-study'].includes(value.category ?? '') && !/unidentified|occult-relic/.test(item);
}
function workerRecipe(recipe: typeof FANTASY_RECIPES[number]) {
  const output = FANTASY_ITEMS.find(item => item.id === recipe.output);
  const standardPotion = recipe.job === 'alchemist' && (recipe.id === 'alchemy-potion' && recipe.output === 'potion' || recipe.id === 'alchemy-purify' && recipe.output === 'antidote');
  return fantasyCommissionRecipeAllowed(recipe) && fantasyWarehouseSupported(recipe.output) && (fantasyWarehouseItem(recipe.output) || !!output?.equipment || !!foodMeta(recipe.output) || standardPotion) && Object.keys(recipe.inputs).every(fantasyWarehouseSupported);
}
function workerProductionReady(w: FantasyEmployee, p?: FantasyProfile): boolean {
  const member = p?.character?.specialization?.companies?.troop?.members.find(member => member.id === fantasyWorkerCompanionId(w.npc));
  return !w.company && (!member || member.condition === 'ready' && member.hp > 0 && !member.assigned);
}
function consumeBusinessInputs(b: FantasyBusiness, inputs: Record<string, number>, at: number): FantasyBusiness | undefined {
  const next = structuredClone(b);
  for (const [item, amount] of Object.entries(inputs)) {
    let left = amount, plain = Math.min(left, next.inventory[item] ?? 0);
    if (plain) { next.inventory[item] -= plain; if (!next.inventory[item]) delete next.inventory[item]; left -= plain; }
    for (const parcel of next.parcels ?? []) {
      const goods = parcel.goods;
      if (!left || goods.item !== item || goods.gear || goods.interiorMap) continue;
      if (goods.food) {
        for (const lot of goods.food) {
          if (fantasyFoodLotQuality({ hour: at }, lot) === 'spoiled') continue;
          const count = Math.min(left, lot.count); left -= count; lot.count -= count; goods.count -= count;
        }
        goods.food = goods.food.filter(lot => lot.count > 0);
      } else { const count = Math.min(left, goods.count); left -= count; goods.count -= count; }
    }
    if (left) return;
    next.parcels = next.parcels?.filter(parcel => parcel.goods.count > 0);
  }
  return next;
}
export function validFantasyBusiness(value: unknown): value is FantasyBusiness {
  return object(value) && keys(value, ['inventory', 'treasury', 'lastAt', 'parcels', 'report']) && Object.keys(value).length >= 3 && (value.parcels === undefined || Array.isArray(value.parcels) && value.parcels.length <= 64 && new Set(value.parcels.map((p: any) => p.id)).size === value.parcels.length && value.parcels.every((p: any) => object(p) && Object.keys(p).length === 2 && typeof p.id === 'string' && p.id.length <= 120 && validFantasyEconomyParcel(p.goods))) && (value.report === undefined || object(value.report) && Object.keys(value.report).length === 6 && time(value.report.at) && fantasyWarehouseSupported(value.report.item) && int(value.report.produced, 0, 999) && int(value.report.sold, 0, 999) && int(value.report.revenue) && int(value.report.wages, 0, 100)) && object(value.inventory) && Object.keys(value.inventory).length <= 64 && Object.entries(value.inventory).every(([item, n]) => fantasyWarehouseItem(item) && int(n, 1)) && int(value.treasury) && time(value.lastAt);
}
export function validFantasyWorkerProgress(value: unknown): value is FantasyWorkerProgress {
  return object(value) && Object.keys(value).length <= catalog.length && Object.entries(value).every(([id, skills]) => !!find(id) && object(skills)
    && Object.keys(skills).length >= 1 && Object.keys(skills).length <= FANTASY_BUSINESS_JOBS.length
    && Object.entries(skills).every(([job, xp]) => FANTASY_BUSINESS_JOBS.includes(job as any) && int(xp)));
}
function rememberWorkerProgress(ledger: FantasyPropertyLedger, worker: FantasyEmployee): boolean {
  if (JSON.stringify(ledger.workerProgress?.[worker.npc]) === JSON.stringify(worker.skills)) return false;
  ledger.workerProgress ??= {}; ledger.workerProgress[worker.npc] = { ...worker.skills }; return true;
}
export function validFantasyEmployees(value: unknown): value is Record<string, FantasyEmployee> {
  return object(value) && Object.keys(value).length <= catalog.length && Object.entries(value).every(([id, w]) => object(w) && !!find(id) && w.npc === id
    && keys(w, ['npc', 'user', 'generation', 'hiredAt', 'expiresAt', 'source', 'skills', 'learning', 'plot', 'job', 'recipe', 'mode', 'lastAt', 'estate', 'company', 'salesItem'])
    && typeof w.user === 'string' && !!w.user && w.user.length <= 120 && int(w.generation, 1) && time(w.hiredAt) && time(w.expiresAt) && w.expiresAt > w.hiredAt && time(w.lastAt)
    && w.source === find(id)!.source && w.learning === find(id)!.learning && object(w.skills) && Object.entries(w.skills).every(([job, xp]) => FANTASY_BUSINESS_JOBS.includes(job as any) && int(xp))
    && (w.plot === undefined || FANTASY_PROPERTY_PLOTS.some(p => p.id === w.plot && p.kind === 'commercial')) && (w.job === undefined || FANTASY_BUSINESS_JOBS.includes(w.job))
    && (w.recipe === undefined || FANTASY_RECIPES.some(r => r.id === w.recipe && r.job === w.job)) && (w.salesItem === undefined || typeof w.salesItem === 'string' && fantasyWarehouseSupported(w.salesItem) && w.salesItem !== 'scribe-interior-map') && (w.mode === undefined || ['sell', 'craft'].includes(w.mode)) && (w.estate === undefined || w.estate === true) && (w.company === undefined || w.company === true));
}
const operations = ['workerHire', 'workerRelease', 'workerCompany', 'workerAssign', 'warehouseDeposit', 'warehouseWithdraw', 'businessDeposit', 'businessWithdraw'];
export const fantasyBusinessOperation = (type: string) => operations.includes(type);
export function isFantasyBusinessCommand(v: unknown): v is FantasyBusinessCommand {
  if (!object(v) || !operations.includes(v.type) || !FANTASY_PROPERTY_PLOTS.some(p => p.id === v.plot) || !int(v.revision, 0, Number.MAX_SAFE_INTEGER) || typeof v.requestId !== 'string' || !/^[a-zA-Z0-9][a-zA-Z0-9:_-]{0,119}$/.test(v.requestId)) return false;
  const base = ['type', 'plot', 'revision', 'requestId'];
  if (v.type === 'workerHire') return Object.keys(v).length === 6 && keys(v, [...base, 'npc', 'source']) && !!find(v.npc) && ['guild', 'blackMarket'].includes(v.source);
  if (['workerRelease', 'workerCompany'].includes(v.type)) return Object.keys(v).length === 5 && keys(v, [...base, 'npc']) && !!find(v.npc);
  if (v.type === 'workerAssign') return [7, 8, 9].includes(Object.keys(v).length) && keys(v, [...base, 'npc', 'job', 'mode', 'recipe', 'salesItem']) && !!find(v.npc) && FANTASY_BUSINESS_JOBS.includes(v.job) && ['sell', 'craft'].includes(v.mode) && (v.recipe === undefined || typeof v.recipe === 'string') && (v.salesItem === undefined || typeof v.salesItem === 'string' && fantasyWarehouseSupported(v.salesItem) && v.salesItem !== 'scribe-interior-map') && (v.mode !== 'craft' || typeof v.recipe === 'string' && v.salesItem === undefined);
  if (v.type === 'warehouseDeposit' || v.type === 'warehouseWithdraw') return Object.keys(v).length >= 6 && keys(v, [...base, 'item', 'count', 'instance', 'quality', 'parcel']) && typeof v.item === 'string' && fantasyWarehouseSupported(v.item) && int(v.count, 1, 999) && (v.instance === undefined || typeof v.instance === 'string' && v.instance.length <= 160) && (v.parcel === undefined || typeof v.parcel === 'string' && v.parcel.length <= 120) && (v.quality === undefined || ['fresh', 'stale', 'spoiled'].includes(v.quality));
  return Object.keys(v).length === 5 && keys(v, [...base, 'amount']) && int(v.amount, 1);
}
export const fantasyWorkerCanInspect = (p?: FantasyProfile) => !!p?.character && (p.character.job === 'leader' || (fantasyStats(p.character).charisma ?? 0) >= 14);
function workerView(id: string, p: FantasyProfile | undefined, w?: FantasyEmployee, progress?: Record<string, number>): FantasyEmployeeView {
  const n = find(id)!, inspect = fantasyWorkerCanInspect(p);
  return { id, names: n.names, race: n.race, role: n.combatJob ? l('전투 훈련을 받은 일꾼', 'Worker with combat training', '戦闘の訓練を受けた働き手') : l('작업 도구를 지닌 장인', 'Artisan carrying work tools', '仕事道具を持つ職人'), source: n.source, fee: n.fee, wage: n.wage,
    ...(n.combatJob ? { combatJob: n.combatJob } : {}), ...(inspect ? { details: { skills: { ...(w?.skills ?? progress ?? { [n.job]: n.initialXp }) }, learning: w?.learning ?? n.learning } } : {}),
    ...(w ? { ...(w.source === 'guild' && !w.company ? { expiresAt: w.expiresAt } : {}), ...(w.plot ? { plot: w.plot, job: w.job, recipe: w.recipe, mode: w.mode, salesItem: w.salesItem } : {}), ...(w.company ? { company: true as const } : {}) } : {}) };
}
export function fantasyWorkforceState(ledger: FantasyPropertyLedger, profiles: Record<string, FantasyProfile>, actor: string, at: number, realm = 'default'): FantasyWorkforceView {
  const p = profiles[actor], c = p?.character, workers = ledger.employees ?? {}, black = !!c?.blackMarketClues?.includes(c.location) && fantasyBlackMarketOpening(c.location, at, realm).open;
  return { revision: ledger.revision, canInspect: fantasyWorkerCanInspect(p), employees: Object.values(workers).filter(w => same(w, actor, p) && (w.source === 'blackMarket' || w.company || w.expiresAt > at)).map(w => workerView(w.npc, p, w)),
    candidates: !c || p.death ? [] : catalog.filter(n => !workers[n.id] && (n.source === 'guild' ? fantasyBuildings(c).some(building => building.id === 'guild') : black)).map(n => workerView(n.id, p, undefined, ledger.workerProgress?.[n.id])) };
}
export function fantasyPropertyStorageCapacity(plot: string, record: FantasyPropertyRecord) {
  const p = FANTASY_PROPERTY_PLOTS.find(p => p.id === plot)!;
  const extra = (record.furniture ?? []).reduce((sum, placed) => sum + (fantasyFurniture(placed.item)?.storage ?? 0), 0);
  return { capacity: (p.kind === 'commercial' ? 240_000 + (record.extension?.level ?? 0) * 80_000 : p.id.endsWith('-mansion') ? 180_000 : 12_000) + extra, slotLimit: p.kind === 'commercial' ? 48 : p.id.endsWith('-mansion') ? 48 : 8 + Math.floor(extra / 6_000) };
}
export const fantasyBusinessStoredWeight = (b?: FantasyBusiness) => businessWeight(b);
const businessWeight = (b?: FantasyBusiness) => weight(b?.inventory ?? {}) + (b?.parcels ?? []).reduce((sum, p) => sum + fantasyItemWeight(p.goods.item) * p.goods.count, 0);
const weight = (items: Record<string, number>) => Object.entries(items).reduce((sum, [id, n]) => sum + fantasyItemWeight(id) * n, 0);
export function fantasyBusinessView(ledger: FantasyPropertyLedger, profiles: Record<string, FantasyProfile>, actor: string, plot: string, at: number): FantasyBusinessView | undefined {
  if (!fantasyPropertyCanUse(ledger, profiles, actor, plot, at)) return;
  const record = ledger.plots[plot], data = record.business;
  const assigned = Object.values(ledger.employees ?? {}).filter(w => w.plot === plot && !w.estate && !w.company);
  const demands = assigned.filter(w => w.mode === 'sell').map(w => { const recipe = FANTASY_RECIPES.find(r => r.id === w.recipe); return fantasyBusinessDemand(FANTASY_PROPERTY_PLOTS.find(p => p.id === plot)!.location, recipe?.output ?? w.salesItem ?? FANTASY_PROPERTY_PLOTS.find(p => p.id === plot)!.input!, at, recipe?.count ?? 1); });
  return { demands, ...(data?.report ? { report: { ...data.report } } : {}), parcels: (data?.parcels ?? []).map(({ id, goods }) => ({ id, item: goods.item, count: goods.count, ...(goods.instance ? { instance: goods.instance } : {}), ...(goods.food ? { quality: goods.food.some(food => fantasyFoodLotQuality({ hour: at }, food) === 'spoiled') ? 'spoiled' as const : goods.food.some(food => fantasyFoodLotQuality({ hour: at }, food) === 'stale') ? 'stale' as const : 'fresh' as const } : goods.quality ? { quality: goods.quality } : {}), ...(goods.gear ? { gearQuality: goods.gear.quality } : {}) })), inventory: { ...data?.inventory }, treasury: data?.treasury ?? 0, weight: businessWeight(data), ...fantasyPropertyStorageCapacity(plot, record), slots: Object.keys(data?.inventory ?? {}).length + (data?.parcels?.length ?? 0),
    workers: Object.values(ledger.employees ?? {}).filter(w => same(w, actor, profiles[actor]) && w.plot === plot).map(w => workerView(w.npc, profiles[actor], w)), canUse: true,
    recipes: FANTASY_RECIPES.filter(workerRecipe).map(({ id, job, output, count, inputs }) => ({ id, job, output, count, inputs })) };
}
export function applyFantasyBusinessCommand(ledger: FantasyPropertyLedger, profiles: Record<string, FantasyProfile>, actor: string, cmd: FantasyBusinessCommand, at: number, realm = 'default'): FantasyPropertyChange {
  const fail = (error: FantasyPropertyChange['error']): FantasyPropertyChange => ({ ledger, profiles, changed: false, error });
  const p = profiles[actor], c = p?.character, plot = FANTASY_PROPERTY_PLOTS.find(p => p.id === cmd.plot)!;
  if (!c || p.death || p.activity || p.combatId || p.event || c.downed || c.hp <= 0) return fail('busy');
  const receipt = JSON.stringify([actor, p.generation ?? 1, cmd.requestId]); if (ledger.receipts[receipt]) return { ledger, profiles, changed: false };
  if (ledger.plots[cmd.plot].revision !== cmd.revision) return fail('stale');
  if (c.location !== plot.location) return fail('unavailable');
  const next = structuredClone(ledger), people = { ...profiles }, profile = structuredClone(p), record = next.plots[cmd.plot]; people[actor] = profile;
  if (advanceFantasyBusinesses(next, people, at)) next.revision++;
  next.employees ??= {}; const w = 'npc' in cmd ? next.employees[cmd.npc] : undefined;
  if (cmd.type === 'workerHire') {
    const candidate = fantasyWorkforceState(ledger, profiles, actor, at, realm).candidates.find(n => n.id === cmd.npc && n.source === cmd.source), n = find(cmd.npc)!;
    if (!candidate) return fail('unavailable');
    if (Object.values(next.employees).filter(w => same(w, actor, p)).length >= 12) return fail('limit');
    if (c.gold < n.fee) return fail('insufficient-gold');
    profile.character!.gold -= n.fee;
    next.employees[n.id] = { npc: n.id, user: actor, generation: p.generation ?? 1, source: n.source, hiredAt: at, expiresAt: n.source === 'blackMarket' ? Number.MAX_SAFE_INTEGER : at + 24 * 30, skills: { ...(next.workerProgress?.[n.id] ?? { [n.job]: n.initialXp }) }, learning: n.learning, lastAt: at };
    rememberWorkerProgress(next, next.employees[n.id]);
  } else if (cmd.type === 'workerRelease' || cmd.type === 'workerCompany') {
    if (!w || !same(w, actor, p)) return fail('not-owner');
    if (cmd.type === 'workerCompany') {
      if (w.company) return fail('occupied');
      const candidate = fantasyWorkerCompanyCandidate(next, people, actor, cmd.npc, at);
      if (!candidate || !enlistFantasyWorkerCompanion(profile, candidate)) return fail('limit');
      w.company = true; delete w.plot; delete w.job; delete w.recipe; delete w.mode; delete w.salesItem; w.lastAt = at;
    } else {
      const company = profile.character!.specialization?.companies?.troop;
      if (company) company.members = company.members.filter(member => member.id !== fantasyWorkerCompanionId(cmd.npc));
      rememberWorkerProgress(next, w);
      delete next.employees[cmd.npc];
    }
  } else {
    if (!fantasyPropertyCanUse(ledger, profiles, actor, cmd.plot, at)) return fail('not-owner');
    record.business ??= { inventory: {}, treasury: 0, lastAt: at }; const b = record.business;
    if (cmd.type === 'workerAssign') {
      if (!w || !same(w, actor, p) || !workerProductionReady(w, p) || w.source === 'guild' && w.expiresAt <= at) return fail('not-owner');
      if (plot.kind !== 'commercial' || Object.values(next.employees).filter(v => v.plot === cmd.plot && v.npc !== w.npc).length >= 2 + (record.extension?.level ?? 0)) return fail('limit');
      const recipe = FANTASY_RECIPES.find(r => r.id === cmd.recipe && r.job === cmd.job && workerRecipe(r));
      if (cmd.recipe && !recipe || cmd.mode === 'craft' && !recipe || cmd.salesItem && recipe) return fail('invalid');
      w.plot = cmd.plot; w.job = cmd.job; w.mode = cmd.mode; w.lastAt = at; if (recipe) w.recipe = recipe.id; else delete w.recipe; if (cmd.salesItem) w.salesItem = cmd.salesItem; else delete w.salesItem;
      w.skills[cmd.job] ??= 0;
    } else if (cmd.type === 'businessDeposit' || cmd.type === 'businessWithdraw') {
      if (plot.kind !== 'commercial') return fail('unavailable');
      if (cmd.type === 'businessDeposit') { if (c.gold < cmd.amount) return fail('insufficient-gold'); if (b.treasury + cmd.amount > 1_000_000) return fail('limit'); profile.character!.gold -= cmd.amount; b.treasury += cmd.amount; }
      else { if (b.treasury < cmd.amount) return fail('insufficient-gold'); if (c.gold + cmd.amount > 1_000_000) return fail('limit'); b.treasury -= cmd.amount; profile.character!.gold += cmd.amount; }
    } else {
      const add = cmd.type === 'warehouseDeposit';
      if (cmd.parcel) {
        if (add || cmd.instance || cmd.quality) return fail('invalid');
        const stored = b.parcels?.find(p => p.id === cmd.parcel);
        if (!stored || stored.goods.item !== cmd.item || stored.goods.count !== cmd.count) return fail('missing-material');
        if (!deliverFantasyEconomyParcel(profile.character!, stored.goods, cmd.count, cmd.requestId)) return fail('invalid');
        b.parcels = b.parcels!.filter(p => p.id !== cmd.parcel);
      } else if (add && (!fantasyWarehouseItem(cmd.item) || cmd.instance)) {
        const goods = takeFantasyEconomyParcel(profile.character!, { item: cmd.item, count: cmd.count, ...(cmd.instance ? { instance: cmd.instance } : {}) }, cmd.quality);
        if (!goods) return fail('missing-material');
        b.parcels ??= []; b.parcels.push({ id: cmd.requestId, goods });
      } else {
        if (!fantasyWarehouseItem(cmd.item) || cmd.instance || cmd.quality) return fail('invalid');
        const from = add ? profile.character!.inventory : b.inventory, to = add ? b.inventory : profile.character!.inventory;
        if ((from[cmd.item] ?? 0) < cmd.count) return fail('missing-material');
        if ((to[cmd.item] ?? 0) + cmd.count > 1_000_000) return fail('limit');
        from[cmd.item] -= cmd.count; if (!from[cmd.item]) delete from[cmd.item]; to[cmd.item] = (to[cmd.item] ?? 0) + cmd.count;
      }
      const capacity = fantasyPropertyStorageCapacity(cmd.plot, record);
      if (businessWeight(b) > capacity.capacity || Object.keys(b.inventory).length + (b.parcels?.length ?? 0) > capacity.slotLimit) return fail('storage-full');
      if (fantasyBagChangeError(p, profile)) return fail('bag-full');
    }
  }
  const value = 'npc' in cmd ? cmd.npc : 'amount' in cmd ? cmd.amount : cmd.item;
  profile.log = [...profile.log, { id: Math.max(0, ...profile.log.map(entry => entry.id)) + 1, hour: at, kind: 'system' as const, text: `property:${cmd.type}:${cmd.plot}:${value}` }].slice(-100);
  record.revision++; next.revision++; profile.revision++;
  next.receipts[receipt] = { actor, generation: p.generation ?? 1, requestId: cmd.requestId, plot: cmd.plot, operation: cmd.type, hour: at };
  while (Object.keys(next.receipts).length > 4096) delete next.receipts[Object.keys(next.receipts)[0]];
  return { ledger: next, profiles: people, changed: true };
}
function addBusinessOutput(b: FantasyBusiness, w: FantasyEmployee, output: string, count: number, at: number) {
  if (fantasyWarehouseItem(output)) { b.inventory[output] = (b.inventory[output] ?? 0) + count; return; }
  b.parcels ??= []; const item = FANTASY_ITEMS.find(v => v.id === output)!;
  if (foodMeta(output)) {
    const id = `work-${w.npc}-${at}`;
    b.parcels.push({ id, goods: { item: output, count, food: [{ id, item: output, count, createdAt: at }], quality: 'fresh' } });
  } else if (item.equipment) for (let unit = 0; unit < count; unit++) {
    const id = `work-${w.npc}-${at}-${unit}`, quality = Math.min(5, 1 + Math.floor((w.skills[w.job!] ?? 0) / 150)) as 1 | 2 | 3 | 4 | 5;
    b.parcels.push({ id, goods: { item: output, count: 1, instance: id, gear: { id, item: output, quality, createdAt: at } } });
  }
  else if (output === 'potion' || output === 'antidote') b.parcels.push({ id: `work-${w.npc}-${at}`, goods: { item: output, count } });
}
function sellBusinessOutput(b: FantasyBusiness, item: string, maximum: number, at: number, markup: number) {
  const unitPrice = Math.max(1, (FANTASY_ITEMS.find(v => v.id === item)?.price ?? 1) + markup);
  let left = Math.min(999, maximum), sold = 0, revenue = 0;
  const plain = Math.min(left, b.inventory[item] ?? 0);
  if (plain) { b.inventory[item] -= plain; if (!b.inventory[item]) delete b.inventory[item]; left -= plain; sold += plain; revenue += plain * unitPrice; }
  for (const parcel of b.parcels ?? []) {
    const goods = parcel.goods;
    if (!left || goods.item !== item || goods.interiorMap) continue;
    if (goods.food) {
      for (const lot of goods.food) {
        const quality = fantasyFoodLotQuality({ hour: at }, lot);
        if (quality === 'spoiled') continue;
        const count = Math.min(left, lot.count); lot.count -= count; goods.count -= count; left -= count; sold += count; revenue += count * Math.max(1, Math.floor(unitPrice * (quality === 'stale' ? .65 : 1)));
      }
      goods.food = goods.food.filter(lot => lot.count > 0);
    } else {
      const count = Math.min(left, goods.count), quality = goods.gear?.quality ?? 1;
      goods.count -= count; left -= count; sold += count; revenue += count * Math.floor(unitPrice * (1 + (quality - 1) * .1));
    }
  }
  b.parcels = b.parcels?.filter(p => p.goods.count > 0);
  return { sold, revenue };
}
export function advanceFantasyBusinesses(ledger: FantasyPropertyLedger, profiles: Record<string, FantasyProfile>, at: number): boolean {
  let changed = false;
  for (const [id, w] of Object.entries(ledger.employees ?? {})) {
    const p = profiles[w.user];
    if (rememberWorkerProgress(ledger, w)) changed = true;
    if (!same(w, w.user, p)) { if (!w.estate) { w.estate = true; delete w.plot; changed = true; } continue; }
    if (w.source === 'blackMarket' && w.expiresAt !== Number.MAX_SAFE_INTEGER) { w.expiresAt = Number.MAX_SAFE_INTEGER; changed = true; }
    if (w.company && !p!.character!.specialization?.companies?.troop?.members.some(member => member.id === fantasyWorkerCompanionId(w.npc))) {
      delete w.company; w.expiresAt = Math.max(w.expiresAt, at + 24); w.lastAt = at; changed = true;
    }
    if (w.expiresAt <= at && !w.company) { delete ledger.employees![id]; changed = true; continue; }
    if (!w.plot || !w.job || at < w.lastAt + 4) continue;
    const record = ledger.plots[w.plot], b = record.business, plot = FANTASY_PROPERTY_PLOTS.find(v => v.id === w.plot)!;
    const steps = Math.min(12, Math.floor((at - w.lastAt) / 4));
    // 期限より前の時間だけを消化し、停止・資材不足の時間を後から買い戻さない。
    const end = w.lastAt + Math.floor((at - w.lastAt) / 4) * 4; w.lastAt = end; changed = true;
    if (!workerProductionReady(w, p) || !b || !fantasyPropertyCanUse(ledger, profiles, w.user, w.plot, at) || p!.character!.location !== plot.location && record.extension?.lease?.state === 'active') continue;
    for (let i = 0; i < steps; i++) {
      const n = find(id)!, recipe = FANTASY_RECIPES.find(r => r.id === w.recipe && r.job === w.job && workerRecipe(r));
      if (w.mode === 'craft' && !recipe || b.treasury < n.wage) break;
      const completedAt = end - (steps - i - 1) * 4, output = recipe?.output ?? w.salesItem ?? plot.input!, count = recipe?.count ?? 0;
      let next = structuredClone(b), produced = 0;
      if (recipe) {
        const work = consumeBusinessInputs(next, recipe.inputs, completedAt);
        if (work) { next = work; addBusinessOutput(next, w, output, count, completedAt); produced = count; }
      }
      const demand = fantasyBusinessDemand(plot.location, output, completedAt, recipe?.count ?? 1, completedAt - 2);
      const sale = w.mode === 'sell' ? sellBusinessOutput(next, output, demand.quantity, completedAt, recipe ? 0 : n.wage + 2 + Math.min(5, Math.floor((w.skills[w.job] ?? 0) / 100))) : { sold: 0, revenue: 0 };
      if (!produced && !sale.sold) continue;
      const capacity = fantasyPropertyStorageCapacity(w.plot, record);
      if (businessWeight(next) > capacity.capacity || Object.keys(next.inventory).length + (next.parcels?.length ?? 0) > capacity.slotLimit || (next.parcels?.length ?? 0) > 64 || Object.values(next.inventory).some(n => n > 1_000_000) || next.treasury - n.wage + sale.revenue > 1_000_000) continue;
      next.treasury += sale.revenue - n.wage;
      next.report = { at: completedAt, item: output, produced, sold: sale.sold, revenue: sale.revenue, wages: n.wage };
      Object.assign(b, next); w.skills[w.job] = Math.min(1_000_000, (w.skills[w.job] ?? 0) + w.learning); rememberWorkerProgress(ledger, w); record.revision++;
    }
  }
  return changed;
}
export function validFantasyEmployeeCompanies(ledger: FantasyPropertyLedger, profiles: Record<string, FantasyProfile>): boolean {
  for (const [actor, p] of Object.entries(profiles)) {
    if (!p.character || p.death) continue;
    for (const member of p.character.specialization?.companies?.troop?.members ?? []) {
      const n = catalog.find(n => n.combatJob && fantasyWorkerCompanionId(n.id) === member.id);
      if (!n) continue;
      const employee = ledger.employees?.[n.id];
      if (!employee?.company || !same(employee, actor, p)) return false;
    }
  }
  return true;
}
export function fantasyWorkerCompanyCandidate(ledger: FantasyPropertyLedger, profiles: Record<string, FantasyProfile>, actor: string, npc: string, at: number) {
  const w = ledger.employees?.[npc], n = find(npc);
  return w && n?.combatJob && same(w, actor, profiles[actor]) && (w.source === 'blackMarket' || w.expiresAt > at) && !w.company ? { id: n.id, names: n.names, race: n.race, job: n.combatJob, wage: n.wage, level: 1 + Math.min(5, Math.floor(Math.max(0, ...Object.values(w.skills)) / 80)) } : undefined;
}
