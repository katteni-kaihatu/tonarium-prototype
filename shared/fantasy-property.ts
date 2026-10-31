import { FANTASY_BUSINESS_WORKERS, FANTASY_BUSINESS_JOBS } from './fantasy-worker-catalog.ts';
import type { FantasyCharacter, FantasyProfile, FantasyResult, FantasyStats } from './fantasy.ts';
import { FANTASY_ITEMS, FANTASY_LOCATIONS } from './fantasy-data.ts';
import { FANTASY_SETTLEMENTS } from './fantasy-town.ts';
import { FANTASY_TERMS } from './fantasy-lore.ts';
import { grantFantasyPractice } from './fantasy-progression.ts';
import { fantasyLifeJob } from './fantasy-careers.ts';
import type { NpcLocale } from './npc.ts';
import { fantasyFurniture, fantasyFurnitureCanPlace, validFantasyFurniture, type FantasyFurniturePlacement } from './fantasy-furniture.ts';
import { isFantasyPropertyExtensionCommand, validFantasyPropertyExtension, fantasyPropertyExtensionOperation, fantasyPropertyCanUse, fantasyPropertyOwnsShare, fantasyPropertyHasTitle, fantasyPropertyExtensionView, reconcileFantasyPropertyParties, applyFantasyPropertyExtensionCommand, fantasyPropertyListProposal, fantasyPropertyPurchasePrice, fantasyPropertySale, newFantasyPropertyExtension, type FantasyPropertyExtension, type FantasyPropertyExtensionCommand, type FantasyPropertyManagementView } from './fantasy-property-extensions.ts';
export { advanceFantasyProperties, fantasyPropertyCanUse, applyFantasyPropertyImprovement } from './fantasy-property-extensions.ts';

import { isFantasyBusinessCommand, fantasyBusinessOperation, validFantasyBusiness, validFantasyEmployees, validFantasyWorkerProgress, fantasyBusinessView, fantasyWorkforceState, applyFantasyBusinessCommand, fantasyPropertyStorageCapacity, fantasyBusinessStoredWeight, type FantasyBusiness, type FantasyWorkerProgress, type FantasyEmployee, type FantasyBusinessCommand, type FantasyBusinessView, type FantasyWorkforceView } from './fantasy-business.ts';

type Text = Record<NpcLocale, string>;
const text = (ko: string, en: string, ja: string): Text => ({ ko, en, ja });
export type FantasyPropertyKind = 'farmland' | 'commercial' | 'residence';
export interface FantasyPropertyPlot {
  id: string; location: string; kind: FantasyPropertyKind; names: Text; descriptions: Text;
  mansion?: true; initialPrice: number; hours: number; output?: string; input?: string; jobs: string[];
}
export interface FantasyPropertyOwner { user: string; generation: number; name: string; acquiredAt: number; estate?: true }
export interface FantasyPropertyRecord { revision: number; owner: FantasyPropertyOwner | null; listing: { price: number } | null; extension?: FantasyPropertyExtension; furniture?: FantasyFurniturePlacement[]; business?: FantasyBusiness }
export interface FantasyPropertyLedger {
  version: 1; revision: number; employees?: Record<string, FantasyEmployee>; workerProgress?: FantasyWorkerProgress; plots: Record<string, FantasyPropertyRecord>;
  receipts: Record<string, { actor: string; generation: number; requestId: string; plot: string; operation: string; hour: number }>;
}
export type FantasyPropertyCommand = { type: 'sync' }
  | { type: 'buy' | 'cancel' | 'use'; plot: string; revision: number; requestId: string }
  | { type: 'furnish' | 'unfurnish'; plot: string; revision: number; requestId: string; item: string }
  | { type: 'list'; plot: string; revision: number; requestId: string; price: number } | FantasyPropertyExtensionCommand | FantasyBusinessCommand;
export type FantasyPropertyError = 'invalid' | 'unavailable' | 'busy' | 'stale' | 'not-owner' | 'not-listed' | 'listed' | 'insufficient-gold' | 'limit' | 'estate' | 'missing-material' | 'save-failed' | 'occupied' | 'target' | 'consent' | 'tax-due' | 'no-due' | 'auction' | 'bid-low' | 'cooldown' | 'furniture-limit' | 'bag-full' | 'storage-full';
export interface FantasyPropertyView extends FantasyPropertyPlot {
  revision: number; price: number | null; listed: boolean; ownerName: string | null; ownedByMe: boolean; estate: boolean;
  management?: FantasyPropertyManagementView; business?: FantasyBusinessView;
  furniture?: { item: string; names: Text; descriptions: Text; canRemove: boolean }[];
}
export interface FantasyPropertyState { workforce?: FantasyWorkforceView; revision: number; location: string | null; plots: FantasyPropertyView[]; owned: FantasyPropertyView[]; legacies: FantasyPropertyView[] }
export interface FantasyPropertyChange {
  ledger: FantasyPropertyLedger; profiles: Record<string, FantasyProfile>; changed: boolean; error?: FantasyPropertyError;
  activity?: { user: string; action: { type: 'propertyUse'; plot: string } };
}

const KIND_NAMES: Record<FantasyPropertyKind, Text> = {
  farmland: text('작은 경작지', 'Small growing plot', '小さな耕作地'),
  commercial: text('작은 업장', 'Small business', '小さな店'),
  residence: text('작은 집', 'Small home', '小さな家'),
};
const farmlandLocations = new Set(['hearth', 'sunmeadow', 'pinewatch', 'reedcross', 'canopy-hall', 'mossbrook', 'leafshade', 'wellrest', 'loom-village']);
export const FANTASY_PROPERTY_PLOTS: FantasyPropertyPlot[] = Object.entries(FANTASY_SETTLEMENTS).filter(([, place]) => place.kind !== 'tower').flatMap(([location, settlement]) => {
  const place = FANTASY_LOCATIONS.find(place => place.id === location)!;
  const locationNames = place.names ?? FANTASY_TERMS.find(term => term.category === 'place' && term.id === location)?.names ?? text(place.name, place.name, place.name);
  const kinds: FantasyPropertyKind[] = ['residence'];
  if (settlement.kind === 'city' || settlement.kind === 'port') kinds.push('residence');
  if (farmlandLocations.has(location)) kinds.push('farmland');
  if (settlement.buildingIds.some(id => ['market', 'library', 'blacksmith'].includes(id))) kinds.push('commercial');
  return kinds.map((kind, index) => {
    const mansion = index === 1 && kind === 'residence';
    const names = Object.fromEntries((['ko', 'en', 'ja'] as const).map(locale => [locale, `${locationNames[locale]} · ${mansion ? text('대저택', 'Grand mansion', '大邸宅')[locale] : KIND_NAMES[kind][locale]}`])) as Text;
    const input = settlement.buildingIds.includes('blacksmith') ? 'ore' : place.land === 'kazaran' ? 'spice' : place.land === 'sylvara' ? 'wood' : 'herb';
    return { id: `${location}-${mansion ? 'mansion' : kind}`, location, kind, names, ...(mansion ? { mansion: true as const } : {}),
      descriptions: kind === 'farmland' ? text('돌보고 수확하는 개인 경작지.', 'A personal plot to tend and harvest.', '手入れして収穫する自分の畑。')
        : kind === 'commercial' ? text('재료를 들여와 직접 영업하는 업장.', 'Bring supplies and operate the business yourself.', '仕入れた材料で自分の店を営む。')
          : text('돈을 내지 않고 쉬어 갈 수 있는 내 집.', 'Your own home, where you can rest without a room fee.', '宿代を払わず休める自分の家。'),
      initialPrice: mansion ? 18_000 + (settlement.kind === 'city' ? 6_000 : 0) : (kind === 'farmland' ? 180 : kind === 'commercial' ? 360 : 240) + (settlement.kind === 'city' ? 120 : settlement.kind === 'port' ? 60 : 0),
      hours: kind === 'residence' ? 8 : 4,
      ...(kind === 'farmland' ? { output: place.land === 'kazaran' ? 'spice' : 'herb' } : kind === 'commercial' ? { input } : {}),
      jobs: kind === 'farmland' ? ['farmer', 'herbalist'] : kind === 'commercial' ? [...FANTASY_BUSINESS_JOBS] : [],
    };
  });
});

const object = (value: unknown): value is Record<string, unknown> => !!value && typeof value === 'object' && !Array.isArray(value);
const integer = (value: unknown, minimum = 0, maximum = 1_000_000) => Number.isSafeInteger(value) && Number(value) >= minimum && Number(value) <= maximum;
const id = (value: unknown): value is string => typeof value === 'string' && /^[a-zA-Z0-9][a-zA-Z0-9:_-]{0,119}$/.test(value);
const plotOf = (id: string) => FANTASY_PROPERTY_PLOTS.find(plot => plot.id === id);
const generationOf = (profile: FantasyProfile) => profile.generation ?? 1;
const owns = (owner: FantasyPropertyOwner | null, actor: string, profile: FantasyProfile) => !!owner && owner.user === actor && owner.generation === generationOf(profile) && !owner.estate;
const receiptKey = (actor: string, generation: number, request: string) => JSON.stringify([actor, generation, request]);
function log(profile: FantasyProfile, message: string) {
  profile.log = [...profile.log, { id: Math.max(0, ...profile.log.map(entry => entry.id)) + 1, hour: profile.character!.hour, text: message, kind: 'system' as const }].slice(-100);
}
export function fantasyPropertyActivityUses(profile: FantasyProfile, plot: string): boolean {
  const action = profile.activity?.action;
  return action?.type === 'propertyUse' && action.plot === plot || (action?.type === 'craft' || action?.type === 'cookMix' && action.station === 'kitchen') && action.workshop === plot;
}
export function newFantasyPropertyLedger(): FantasyPropertyLedger {
  return { version: 1, revision: 0, plots: Object.fromEntries(FANTASY_PROPERTY_PLOTS.map(plot => [plot.id, { revision: 0, owner: null, listing: { price: plot.initialPrice } }])), receipts: {} };
}
export function normalizeFantasyPropertyLedger(value: unknown): FantasyPropertyLedger | undefined {
  if (validFantasyPropertyLedger(value)) return structuredClone(value);
  if (!object(value) || !object(value.plots)) return;
  const missing = FANTASY_PROPERTY_PLOTS.filter(plot => !Object.hasOwn(value.plots as object, plot.id));
  if (!missing.length || missing.some(plot => !plot.mansion)) return;
  const next = structuredClone(value);
  for (const plot of missing) (next.plots as Record<string, unknown>)[plot.id] = { revision: 0, owner: null, listing: { price: plot.initialPrice } };
  return validFantasyPropertyLedger(next) ? next : undefined;
}
export function isFantasyPropertyCommand(value: unknown): value is FantasyPropertyCommand {
  if (!object(value)) return false;
  if (value.type === 'sync') return Object.keys(value).length === 1;
  if (isFantasyPropertyExtensionCommand(value) || isFantasyBusinessCommand(value)) return true;
  if (['furnish', 'unfurnish'].includes(String(value.type))) return Object.keys(value).length === 5 && Object.keys(value).every(key => ['type', 'plot', 'revision', 'requestId', 'item'].includes(key))
    && id(value.plot) && !!plotOf(value.plot) && integer(value.revision, 0, Number.MAX_SAFE_INTEGER) && id(value.requestId) && typeof value.item === 'string' && !!fantasyFurniture(value.item);
  if (!['buy', 'list', 'cancel', 'use'].includes(String(value.type)) || Object.keys(value).length !== (value.type === 'list' ? 5 : 4)
    || !id(value.plot) || !plotOf(value.plot) || !integer(value.revision, 0, Number.MAX_SAFE_INTEGER) || !id(value.requestId)) return false;
  return value.type !== 'list' || integer(value.price, 1, 1_000_000);
}
export function validFantasyPropertyTitles(character: FantasyCharacter): boolean {
  return character.propertyTitles === undefined || Array.isArray(character.propertyTitles) && character.propertyTitles.length <= FANTASY_PROPERTY_PLOTS.length
    && character.propertyTitles.every(id => typeof id === 'string' && !!plotOf(id)) && new Set(character.propertyTitles).size === character.propertyTitles.length;
}
export function validFantasyPropertyLedger(value: unknown): value is FantasyPropertyLedger {
  if (!object(value) || ![4, 5, 6].includes(Object.keys(value).length) || Object.keys(value).some(key => !['version', 'revision', 'plots', 'receipts', 'employees', 'workerProgress'].includes(key)) || value.employees !== undefined && !validFantasyEmployees(value.employees) || value.workerProgress !== undefined && !validFantasyWorkerProgress(value.workerProgress) || value.version !== 1 || !integer(value.revision, 0, Number.MAX_SAFE_INTEGER)
    || !object(value.plots) || Object.keys(value.plots).length !== FANTASY_PROPERTY_PLOTS.length || !object(value.receipts) || Object.keys(value.receipts).length > 4096) return false;
  const ownedCount = new Map<string, number>();
  for (const [id, record] of Object.entries(value.plots)) {
    if (!plotOf(id) || !object(record) || ![3, 4, 5, 6].includes(Object.keys(record).length) || Object.keys(record).some(key => !['revision', 'owner', 'listing', 'extension', 'furniture', 'business'].includes(key)) || !integer(record.revision, 0, Number.MAX_SAFE_INTEGER)
      || record.business !== undefined && (!validFantasyBusiness(record.business) || record.owner === null)
      || record.furniture !== undefined && (plotOf(id)!.kind !== 'residence' || record.owner === null || !validFantasyFurniture(record.furniture))
      || record.extension !== undefined && !validFantasyPropertyExtension(record.extension)) return false;
    const owner = record.owner;
    if (owner !== null && (!object(owner) || Object.keys(owner).some(key => !['user', 'generation', 'name', 'acquiredAt', 'estate'].includes(key))
      || typeof owner.user !== 'string' || !owner.user || owner.user.length > 120 || !integer(owner.generation, 1)
      || typeof owner.name !== 'string' || !owner.name.trim() || [...owner.name].length > 24 || /[\u0000-\u001f\u007f]/.test(owner.name)
      || typeof owner.acquiredAt !== 'number' || !Number.isFinite(owner.acquiredAt) || owner.acquiredAt < 0 || owner.estate !== undefined && owner.estate !== true)) return false;
    const listing = record.listing;
    if (listing !== null && (!object(listing) || Object.keys(listing).length !== 1 || !integer(listing.price, 1) || object(owner) && owner.estate)) return false;
    if (owner === null && (!object(listing) || listing.price !== plotOf(id)!.initialPrice)) return false;
    if (object(owner) && !owner.estate) {
      const key = JSON.stringify([owner.user, owner.generation]), count = (ownedCount.get(key) ?? 0) + 1;
      if (count > 3) return false;
      ownedCount.set(key, count);
    }
    if (record.extension) {
      const ext = record.extension as FantasyPropertyExtension;
      const saleListing = record.listing as { price: number } | null;
      if (ext.shares.some(share => object(owner) && share.user === owner.user && share.generation === owner.generation)) return false;
      const parties = owner ? [owner as unknown as FantasyPropertyOwner, ...ext.shares] : [];
      const partyTokens = parties.map(p => JSON.stringify([p.user, p.generation]));
      if (ext.sale && (ext.sale.approved.some(token => !partyTokens.includes(token)) || saleListing && (saleListing.price !== ext.sale.price || ext.sale.approved.length !== parties.length))) return false;
      if (ext.bargain && (owner !== null || !saleListing || ext.bargain.price < Math.ceil(saleListing.price * .8) || ext.bargain.price > saleListing.price)) return false;
      if (ext.construction && !((plotOf(id)!.kind === 'farmland' ? ['irrigation', 'greenhouse', 'granary'] : plotOf(id)!.kind === 'commercial' ? ['workshop', 'shopfront', 'storehouse'] : ['hearth', 'bedroom', 'garden']).includes(ext.construction.blueprint))) return false;
      for (const share of ext.shares.filter(share => !share.estate)) {
        const key = JSON.stringify([share.user, share.generation]), count = (ownedCount.get(key) ?? 0) + 1;
        if (count > 3) return false; ownedCount.set(key, count);
      }
    }
  }
  for (const [key, entry] of Object.entries(value.receipts)) {
    if (!object(entry) || Object.keys(entry).length !== 6 || typeof entry.actor !== 'string' || !entry.actor || entry.actor.length > 120 || !integer(entry.generation, 1)
      || !id(entry.requestId) || typeof entry.plot !== 'string' || !plotOf(entry.plot) || !['buy', 'list', 'cancel', 'use', 'furnish', 'unfurnish'].includes(String(entry.operation)) && !fantasyPropertyExtensionOperation(String(entry.operation)) && !fantasyBusinessOperation(String(entry.operation))
      || typeof entry.hour !== 'number' || !Number.isFinite(entry.hour) || entry.hour < 0 || key !== receiptKey(entry.actor, entry.generation as number, entry.requestId)) return false;
  }
  return true;
}
export function reconcileFantasyProperties(ledger: FantasyPropertyLedger, profiles: Record<string, FantasyProfile>): FantasyPropertyChange {
  const next = structuredClone(ledger), people = { ...profiles };
  let changed = false;
  for (const record of Object.values(next.plots)) {
    const owner = record.owner, profile = owner && profiles[owner.user];
    if (!owner || owner.estate || profile?.character && !profile.death && generationOf(profile) === owner.generation) continue;
    owner.estate = true; record.listing = null; record.revision++; changed = true;
  }
  for (const record of Object.values(next.plots)) if (reconcileFantasyPropertyParties(record, profiles)) { record.revision++; changed = true; }
  for (const [actor, profile] of Object.entries(profiles)) {
    if (!profile.character) continue;
    const titles = Object.entries(next.plots).filter(([, record]) => !profile.death && fantasyPropertyHasTitle(record, actor, profile)).map(([id]) => id).sort();
    if (JSON.stringify([...(profile.character.propertyTitles ?? [])].sort()) === JSON.stringify(titles)) continue;
    const copy = structuredClone(profile); copy.character!.propertyTitles = titles; copy.revision++; people[actor] = copy; changed = true;
  }
  if (changed) next.revision++;
  return { ledger: changed ? next : ledger, profiles: changed ? people : profiles, changed };
}
export function fantasyPropertyState(ledger: FantasyPropertyLedger, profiles: Record<string, FantasyProfile>, actor: string, at = profiles[actor]?.character?.hour ?? 0, realm = 'default'): FantasyPropertyState {
  const profile = profiles[actor], character = profile?.character;
  const view = (plot: FantasyPropertyPlot): FantasyPropertyView => {
    const record = ledger.plots[plot.id];
    return { ...plot, revision: record.revision, price: record.listing?.price ?? null, listed: !!record.listing, ownerName: record.owner?.name ?? null,
      ownedByMe: !!profile && fantasyPropertyOwnsShare(record, actor, profile) && !profile.death, estate: !!record.owner?.estate,
      business: fantasyBusinessView(ledger, profiles, actor, plot.id, at),
      management: fantasyPropertyExtensionView(ledger, profiles, actor, plot.id),
      ...(record.furniture ? { furniture: record.furniture.map(placed => ({ item: placed.item, names: fantasyFurniture(placed.item)!.names, descriptions: fantasyFurniture(placed.item)!.descriptions,
        canRemove: !!profile && fantasyPropertyCanUse(ledger, profiles, actor, plot.id, character?.hour ?? 0) && (fantasyPropertyOwnsShare(record, actor, profile) || placed.user === actor && placed.generation === generationOf(profile)) })) } : {}) };
  };
  return { workforce: fantasyWorkforceState(ledger, profiles, actor, at, realm), revision: ledger.revision, location: character?.location ?? null,
    plots: character ? FANTASY_PROPERTY_PLOTS.filter(plot => plot.location === character.location).map(view) : [],
    owned: profile && !profile.death ? FANTASY_PROPERTY_PLOTS.filter(plot => fantasyPropertyOwnsShare(ledger.plots[plot.id], actor, profile) || character?.propertyTitles?.includes(plot.id)).map(view) : [],
    legacies: FANTASY_PROPERTY_PLOTS.filter(plot => ledger.plots[plot.id].owner?.user === actor && ledger.plots[plot.id].owner?.estate).map(view) };
}
export function fantasyPropertyUseHours(plot: string): number { return plotOf(plot)?.hours ?? 0; }
function propertyPracticeJob(c: FantasyCharacter, plot: FantasyPropertyPlot): string | undefined {
  const job = fantasyLifeJob(c);
  return job && plot.jobs.includes(job) ? job : undefined;
}
export function fantasyPropertyUseError(profile: FantasyProfile, plotId: string): string | undefined {
  const c = profile.character, plot = plotOf(plotId);
  if (!c || profile.death || c.hp <= 0 || profile.combatId || profile.event) return 'property:busy';
  if (!plot || c.location !== plot.location) return 'property:unavailable';
  if (!c.propertyTitles?.includes(plot.id)) return 'property:not-owner';
  if (plot.input && (c.inventory[plot.input] ?? 0) < 1) return 'property:missing-material';
  if (plot.input && c.gold + (FANTASY_ITEMS.find(item => item.id === plot.input)?.price ?? 0) + 12 + Math.min(8, Math.floor((c.jobXp[propertyPracticeJob(c, plot) ?? ''] ?? 0) / 50)) > 1_000_000) return 'property:limit';
  if (plot.output && (c.inventory[plot.output] ?? 0) > 999_996) return 'property:limit';
  return undefined;
}
export function applyFantasyPropertyUse(profile: FantasyProfile, plotId: string, maximum?: Pick<FantasyStats, 'hp' | 'mp'>): FantasyResult {
  const error = fantasyPropertyUseError(profile, plotId);
  if (error) return { profile, error, changed: false };
  const next = structuredClone(profile), c = next.character!, plot = plotOf(plotId)!;
  const practiceJob = propertyPracticeJob(c, plot), professionXp = practiceJob ? c.jobXp[practiceJob] ?? 0 : 0;
  if (plot.kind === 'residence') {
    const recovery = Math.min(75, c.fatigue); c.fatigue -= recovery;
    if (maximum) { c.hp = Math.min(maximum.hp, c.hp + 30); c.mp = Math.min(maximum.mp, c.mp + 15); }
    log(next, `property:rest:${plot.id}:${recovery}`);
  } else if (plot.kind === 'farmland') {
    const count = 2 + Math.min(2, Math.floor(professionXp / 100));
    c.inventory[plot.output!] = (c.inventory[plot.output!] ?? 0) + count;
    if (practiceJob) grantFantasyPractice(c, { key: `property:${plot.id}`, amount: 3, success: true, job: practiceJob });
    log(next, `property:harvest:${plot.id}:${plot.output}:${count}`);
  } else {
    c.inventory[plot.input!]--; if (!c.inventory[plot.input!]) delete c.inventory[plot.input!];
    const earned = (FANTASY_ITEMS.find(item => item.id === plot.input)?.price ?? 0) + 12 + Math.min(8, Math.floor(professionXp / 50));
    c.gold = Math.min(1_000_000, c.gold + earned);
    if (practiceJob) grantFantasyPractice(c, { key: `property:${plot.id}`, amount: 3, success: true, job: practiceJob });
    log(next, `property:operate:${plot.id}:${earned}`);
  }
  return { profile: next, changed: true };
}
export function applyFantasyPropertyCommand(ledger: FantasyPropertyLedger, profiles: Record<string, FantasyProfile>, actor: string, command: FantasyPropertyCommand, hour: number, realm = 'default'): FantasyPropertyChange {
  const fail = (error: FantasyPropertyError): FantasyPropertyChange => ({ ledger, profiles, changed: false, error });
  if (!isFantasyPropertyCommand(command) || !Number.isFinite(hour) || hour < 0) return fail('invalid');
  const normalized = reconcileFantasyProperties(ledger, profiles);
  if (normalized.changed) {
    const result = applyFantasyPropertyCommand(normalized.ledger, normalized.profiles, actor, command, hour, realm);
    return result.error ? fail(result.error) : { ...result, changed: true };
  }
  if (command.type === 'sync') return { ledger, profiles, changed: false };
  const current = profiles[actor], c = current?.character;
  if (!c || current.death || c.hp <= 0 || current.activity || current.combatId || current.event) return fail('busy');
  const receipt = receiptKey(actor, generationOf(current), command.requestId);
  if (ledger.receipts[receipt]) return { ledger, profiles, changed: false };
  if (isFantasyBusinessCommand(command)) return applyFantasyBusinessCommand(ledger, profiles, actor, command, hour, realm);
  if (isFantasyPropertyExtensionCommand(command) && command.type !== 'acceptBargain') return applyFantasyPropertyExtensionCommand(ledger, profiles, actor, command, hour);
  const plot = plotOf(command.plot)!, saved = ledger.plots[plot.id];
  if (c.location !== plot.location) return fail('unavailable');
  if (saved.revision !== command.revision) return fail('stale');
  if (saved.owner?.estate && !(['use', 'furnish', 'unfurnish'].includes(command.type) && fantasyPropertyCanUse(ledger, profiles, actor, plot.id, hour))) return fail('estate');
  const own = owns(saved.owner, actor, current), next = structuredClone(ledger), people = { ...profiles }, profile = structuredClone(current);
  const character = profile.character!, record = next.plots[plot.id]; people[actor] = profile;
  if (command.type === 'furnish' || command.type === 'unfurnish') {
    if (plot.kind !== 'residence') return fail('unavailable');
    if (!fantasyPropertyCanUse(ledger, profiles, actor, plot.id, hour)) return fail('not-owner');
    if (Object.values(profiles).some(value => fantasyPropertyActivityUses(value, plot.id))) return fail('busy');
    const furniture = saved.furniture ?? [];
    if (command.type === 'furnish') {
      if ((character.inventory[command.item] ?? 0) < 1) return fail('missing-material');
      if (!fantasyFurnitureCanPlace(furniture, command.item)) return fail('furniture-limit');
      character.inventory[command.item]--; if (!character.inventory[command.item]) delete character.inventory[command.item];
      record.furniture = [...furniture, { item: command.item, user: actor, generation: generationOf(profile), hour }];
    } else {
      const index = furniture.findIndex(placed => placed.item === command.item && (fantasyPropertyOwnsShare(saved, actor, profile) || placed.user === actor && placed.generation === generationOf(profile)));
      if (index < 0) return fail('not-owner');
      if ((character.inventory[command.item] ?? 0) >= 1_000_000) return fail('limit');
      record.furniture = furniture.filter((_, position) => position !== index);
      if (record.business) {
        const capacity = fantasyPropertyStorageCapacity(plot.id, record), weight = fantasyBusinessStoredWeight(record.business);
        if (weight > capacity.capacity || Object.keys(record.business.inventory).length + (record.business.parcels?.length ?? 0) > capacity.slotLimit) return fail('storage-full');
      }
      character.inventory[command.item] = (character.inventory[command.item] ?? 0) + 1;
    }
    log(profile, `property:${command.type}:${plot.id}:${command.item}`);
  } else if (command.type === 'buy' || command.type === 'acceptBargain') {
    if (!saved.listing || fantasyPropertyOwnsShare(saved, actor, current)) return fail('not-listed');
    const price = fantasyPropertyPurchasePrice(saved, actor, current, hour, command.type === 'acceptBargain');
    if (price === null) return fail('not-listed');
    if (price < (saved.extension?.taxDue ?? 0)) return fail('tax-due');
    if (saved.extension?.lease?.state === 'active' || saved.extension?.auction || saved.extension?.construction) return fail('occupied');
    if (character.gold < price) return fail('insufficient-gold');
    if (Object.values(ledger.plots).filter(record => fantasyPropertyOwnsShare(record, actor, current)).length >= 3) return fail('limit');
    if (saved.owner) {
      const ownerProfile = profiles[saved.owner.user];
      if (!ownerProfile?.character || ownerProfile.death || generationOf(ownerProfile) !== saved.owner.generation) return fail('estate');
      if (ownerProfile.activity || ownerProfile.combatId) return fail('busy');
      if (!saved.extension?.shares.length && ownerProfile.character.gold + price - (saved.extension?.taxDue ?? 0) > 1_000_000) return fail('limit');
      const seller = structuredClone(ownerProfile);
      seller.character!.propertyTitles = seller.character!.propertyTitles?.filter(id => id !== plot.id); seller.revision++;
      log(seller, `property:sold:${plot.id}:${price}`); people[saved.owner.user] = seller;
      fantasyPropertySale(record, people, price, hour);
    }
    character.gold -= price; character.propertyTitles = [...(character.propertyTitles ?? []), plot.id].sort();
    record.owner = { user: actor, generation: generationOf(profile), name: character.name, acquiredAt: hour }; record.listing = null;
    record.extension ??= newFantasyPropertyExtension(hour); record.extension.taxAt = hour; record.extension.taxDue = 0;
    delete record.extension.bargain; delete record.extension.shareOffer; delete record.extension.lease; delete record.extension.sale;
    log(profile, `property:bought:${plot.id}:${price}`);
  } else if (!own && command.type !== 'use' && command.type !== 'cancel') return fail('not-owner');
  else if (command.type === 'list') {
    if (saved.extension?.lease?.state === 'active' || saved.extension?.auction || saved.extension?.construction) return fail('occupied');
    if (Object.values(profiles).some(value => fantasyPropertyActivityUses(value, plot.id))) return fail('busy');
    if (!fantasyPropertyListProposal(record, actor, profile, command.price)) record.listing = { price: command.price };
    log(profile, `property:listed:${plot.id}:${command.price}`);
  } else if (command.type === 'cancel') {
    if (!fantasyPropertyOwnsShare(saved, actor, current)) return fail('not-owner');
    if (!saved.listing && !saved.extension?.sale) return fail('not-listed');
    record.listing = null; if (record.extension) delete record.extension.sale; log(profile, `property:cancel:${plot.id}`);
  } else {
    if (saved.listing) return fail('listed');
    if (!fantasyPropertyCanUse(ledger, profiles, actor, plot.id, hour)) return fail(saved.extension?.taxDue ? 'tax-due' : 'occupied');
    const error = fantasyPropertyUseError(profile, plot.id);
    if (error) return fail(error === 'property:missing-material' ? 'missing-material' : error === 'property:not-owner' ? 'not-owner' : 'unavailable');
  }
  record.revision++; next.revision++;
  next.receipts[receipt] = { actor, generation: generationOf(current), requestId: command.requestId, plot: plot.id, operation: command.type, hour };
  while (Object.keys(next.receipts).length > 4096) delete next.receipts[Object.keys(next.receipts)[0]];
  if (command.type !== 'use') profile.revision++;
  const reconciled = reconcileFantasyProperties(next, people);
  return { ledger: reconciled.ledger, profiles: reconciled.profiles, changed: true, ...(command.type === 'use' ? { activity: { user: actor, action: { type: 'propertyUse' as const, plot: plot.id } } } : {}) };
}

const ERRORS: Record<string, Text> = {
  invalid: text('요청을 확인할 수 없습니다.', 'The request is invalid.', '依頼を確認できません。'),
  unavailable: text('해당 부동산이 있는 곳에 방문하세요.', 'Visit the property location.', 'その不動産のある場所を訪ねてください。'),
  busy: text('현재 행동이나 사건을 먼저 마쳐 주세요.', 'Finish the current activity or encounter first.', 'いまの行動や出来事を先に終えてください。'),
  stale: text('매물 정보가 바뀌었습니다. 새로 확인하세요.', 'The listing changed. Refresh it.', '物件情報が変わりました。確認し直してください。'),
  'not-owner': text('현재 인물의 소유가 아닙니다.', 'This character does not own it.', 'いまの人物の所有物ではありません。'),
  'not-listed': text('현재 구매하거나 취소할 매물이 아닙니다.', 'That property is not listed for this operation.', 'いまはこの取引ができる売り物件ではありません。'),
  listed: text('매물 등록을 취소한 뒤 이용하세요.', 'Withdraw the listing before using it.', '売り出しを取り消してから利用してください。'),
  'insufficient-gold': text('금화가 부족합니다.', 'You do not have enough gold.', '金貨が足りません。'),
  limit: text('한 인물은 최대 3곳을 소유할 수 있으며 금화 보관 한도를 넘길 수 없습니다.', 'Each life can own up to three properties; balances must remain within the gold limit.', '一人が所有できるのは3件までで、金貨の上限も超えられません。'),
  estate: text('지난 인물의 유산입니다. 공개 경매로만 새 주인을 정하며 자동 상속하지 않습니다.', 'This past-life estate changes hands through a public auction, without automatic inheritance.', '前の人物の遺産です。公開競売で新しい所有者を決め、自動相続はしません。'),
  'missing-material': text('필요한 재료나 가구가 부족합니다.', 'The required material or furniture is missing.', '必要な材料や家具が足りません。'),
  'furniture-limit': text('침대와 각 기능 가구는 하나씩, 장식은 네 점까지 놓을 수 있습니다.', 'Install one bed and one of each functional furnishing, plus up to four decorations.', '寝台と各機能家具は1点ずつ、装飾は4点まで置けます。'),
  'storage-full': text('수납 공간이 부족합니다. 물품을 먼저 꺼내거나 수납 가구를 설치하세요.', 'Storage is full. Withdraw goods or install storage furniture first.', '収納が足りません。先に品物を取り出すか収納家具を置いてください。'),
  'bag-full': text('가방의 무게나 물품 종류 한도를 넘깁니다. 먼저 공간을 마련하세요.', 'The bag would exceed its weight or item-type limit. Make room first.', '鞄の重量か品目数の上限を超えます。先に空きを作ってください。'),
  'already-rested': text('지금은 충분히 쉬었습니다.', 'You are already rested.', 'いまは十分休めています。'),
  'save-failed': text('기록을 저장하지 못했습니다. 거래는 적용되지 않았습니다.', 'The save failed; the transaction was not applied.', '保存に失敗しました。取引は適用されていません。'),
  occupied: text('매매·임대·공사 중에는 이 일을 할 수 없습니다.', 'Unavailable during a sale, lease or construction.', '売買・賃貸・工事の間はできません。'),
  target: text('같은 장소의 상대 이름을 확인해 주세요.', 'Check the other traveler’s name at this location.', '同じ場所にいる相手の名前を確認してください。'),
  consent: text('계약 당사자의 동의가 필요합니다.', 'The parties must consent to this contract.', '契約当事者の同意が必要です。'),
  'tax-due': text('미납 세금을 먼저 정산해 주세요.', 'Settle the outstanding property tax first.', '未納の税を先に精算してください。'),
  'no-due': text('지금은 정산하거나 정비할 것이 없습니다.', 'There is nothing to settle or maintain now.', 'いま精算や整備が必要なものはありません。'),
  auction: text('현재 경매 조건을 확인해 주세요.', 'Check the current auction conditions.', '現在の競売条件を確認してください。'),
  'bid-low': text('현재 최소 입찰액보다 낮습니다.', 'The bid is below the current minimum.', '現在の最低入札額を下回っています。'),
  cooldown: text('다음 상담까지 조금 기다려 주세요.', 'Wait before the next negotiation.', '次の相談まで少しお待ちください。'),
};
export function fantasyPropertyText(source: string, locale: NpcLocale): string | undefined {
  const direct = ERRORS[source.startsWith('property:') ? source.slice(9) : source];
  if (direct) return direct[locale];
  const [, action, plotId, value, amount] = source.split(':');
  if (source.startsWith('property:credit:') && /^\d+$/.test(plotId)) return text(`부동산 정산금 +${plotId}G.`, `Property settlement +${plotId}G.`, `不動産精算金+${plotId}G。`)[locale];
  if (!source.startsWith('property:') || !plotId || !plotOf(plotId)) return undefined;
  const name = plotOf(plotId)!.names[locale], say = (ko: string, en: string, ja: string) => text(ko, en, ja)[locale];
  if (['workerHire', 'workerRelease', 'workerCompany', 'workerAssign'].includes(action)) {
    const worker = FANTASY_BUSINESS_WORKERS.find(n => n.id === value)?.names[locale] ?? value;
    return say(`${name}: ${worker}의 계약·배치를 갱신했습니다.`, `${name}: updated ${worker}’s employment or assignment.`, `${name}：${worker}の契約・配属を更新した。`);
  }
  if (action === 'workshop-lost') return say(`${name}의 작업장 이용 권한이 없어 제작을 중단했습니다.`, `Crafting stopped because workshop access at ${name} was lost.`, `${name}の作業場を使う権利を失い、製作を中止した。`);
  if (action === 'businessDeposit' || action === 'businessWithdraw') return say(`${name}의 영업 금고에서 ${value}G를 ${action === 'businessDeposit' ? '입금' : '출금'}했습니다.`, `${name}: ${action === 'businessDeposit' ? 'deposited' : 'withdrew'} ${value}G in business funds.`, `${name}の営業金庫へ${value}Gを${action === 'businessDeposit' ? '入金' : '出金'}した。`);
  if (action === 'warehouseDeposit' || action === 'warehouseWithdraw') return say(`${name}의 창고에서 물품을 ${action === 'warehouseDeposit' ? '보관' : '회수'}했습니다.`, `${name}: ${action === 'warehouseDeposit' ? 'stored' : 'withdrew'} goods.`, `${name}の倉庫で品物を${action === 'warehouseDeposit' ? '保管' : '回収'}した。`);
  if (action === 'furnish' || action === 'unfurnish') { const furniture = fantasyFurniture(value)?.names[locale] ?? value; return action === 'furnish'
    ? say(`${name}에 ${furniture}을 놓았습니다.`, `Installed ${furniture} at ${name}.`, `${name}に${furniture}を置いた。`)
    : say(`${name}의 ${furniture}을 회수했습니다.`, `Recovered ${furniture} from ${name}.`, `${name}の${furniture}を回収した。`); }
  if (action === 'bed-rest') return say(`${name}의 침대에서 편히 쉬었습니다. 피로를 최대 ${value} 더 줄였습니다.`, `Rested comfortably in the bed at ${name}, reducing fatigue by up to ${value} more.`, `${name}の寝台で安らぎ、疲労をさらに最大${value}減らした。`);
  if (action === 'lease') return say(`${name}의 임대료 ${value}G를 선불로 냈습니다.`, `Prepaid ${value}G in rent for ${name}.`, `${name}の家賃${value}Gを前払いした。`);
  if (action === 'auctionWon') return say(`${name}을 ${value}G에 낙찰받았습니다.`, `Won ${name} at auction for ${value}G.`, `${name}を${value}Gで落札した。`);
  if (action === 'autoHarvest') return say(`${name}에서 고용인이 수확물 ${value}개를 보관했습니다.`, `Workers stored ${value} harvested goods at ${name}.`, `${name}で雇い人が収穫物${value}個を保管した。`);
  if (action === 'improved') return say(`${name}의 개축 ${value}단계가 작업에 도움이 되었습니다.`, `Upgrade ${value} at ${name} improved the work.`, `${name}の改築${value}段階が作業に役立った。`);
  if (action === 'bought') return say(`${name}을 ${value}G에 샀습니다.`, `Bought ${name} for ${value}G.`, `${name}を${value}Gで購入した。`);
  if (action === 'sold') return say(`${name}을 팔아 ${value}G를 받았습니다.`, `Sold ${name} and received ${value}G.`, `${name}を売り${value}Gを受け取った。`);
  if (action === 'listed') return say(`${name}을 ${value}G에 매물로 내놓았습니다.`, `Listed ${name} for ${value}G.`, `${name}を${value}Gで売りに出した。`);
  if (action === 'cancel') return say(`${name}의 판매를 취소했습니다.`, `Withdrew ${name} from sale.`, `${name}の売り出しを取り消した。`);
  if (action === 'rest') return say(`${name}에서 쉬었습니다. 피로 -${value}.`, `Rested at ${name}. Fatigue -${value}.`, `${name}で休んだ。疲労-${value}。`);
  if (action === 'operate') return say(`${name}의 영업을 마쳤습니다. 매출 +${value}G.`, `Finished business at ${name}. Revenue +${value}G.`, `${name}の営業を終えた。売上+${value}G。`);
  if (action === 'harvest') {
    const item = FANTASY_ITEMS.find(item => item.id === value)?.names?.[locale] ?? FANTASY_TERMS.find(term => term.category === 'item' && term.id === value)?.names[locale] ?? value;
    return say(`${name}에서 ${item} ${amount}개를 수확했습니다.`, `Harvested ${amount} ${item} at ${name}.`, `${name}で${item}を${amount}個収穫した。`);
  }
  return undefined;
}
