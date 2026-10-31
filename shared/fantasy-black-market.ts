import type { FantasyCharacter, FantasyProfile } from './fantasy.ts';
import { FANTASY_ITEMS, FANTASY_LOCATIONS } from './fantasy-data.ts';
import { NPC_PUBLIC, type NpcLocale } from './npc.ts';
import { fantasyBagChangeError } from './fantasy-bags.ts';
import { FANTASY_BLACK_MARKET_ITEMS, FANTASY_BLACK_MARKET_RUNE_TOKENS } from './fantasy-black-market-catalog.ts';
import { FANTASY_RELICS } from './fantasy-relic-catalog.ts';
import { FANTASY_JOB_DISCOVERY_BOOKS } from './fantasy-job-discovery.ts';
import { learnFantasyCircleBook } from './fantasy-magic-circle.ts';
export { FANTASY_BLACK_MARKET_ITEMS } from './fantasy-black-market-catalog.ts';

type Text = Record<NpcLocale, string>;
type Bidder = { type: 'npc'; id: string; names: Text } | { type: 'player'; userId: string; generation: number; names: Text };
export interface FantasyBlackMarketLot { id: string; item: string; count: number; reserve: number; increment: number; currentBid: number; bidder?: Bidder; endsAt: number; settled: boolean; claimed: boolean;
  competitors: { id: string; names: Text; limit: number; nextAt: number }[]; history: { at: number; amount: number; bidder: Bidder }[] }
export interface FantasyBlackMarketAuction { id: string; realm: string; location: string; day: number; opensAt: number; closesAt: number; lots: FantasyBlackMarketLot[] }
export interface FantasyBlackMarketLedger { version: 1; revision: number; markets: Record<string, FantasyBlackMarketAuction> }
export type FantasyBlackMarketAction = { type: 'sync' } | { type: 'blackMarketLearn'; npc: string } | { type: 'blackMarketBid'; market: string; lot: string; amount: number; revision: number } | { type: 'blackMarketClaim'; market: string; lot: string; revision: number };
export interface FantasyBlackMarketResult { ledger: FantasyBlackMarketLedger; profiles: Map<string, FantasyProfile>; changed: boolean; error?: string }
export type FantasyBlackMarketState = ReturnType<typeof fantasyBlackMarketState>;
const l = (ko: string, en: string, ja: string): Text => ({ ko, en, ja });
const hash = (value: string) => { let result = 2166136261; for (const char of value) result = Math.imul(result ^ char.charCodeAt(0), 16777619) >>> 0; return result; };
const object = (value: unknown): value is Record<string, unknown> => !!value && typeof value === 'object' && !Array.isArray(value);
const validTime = (value: unknown): value is number => typeof value === 'number' && Number.isFinite(value) && value >= 0;
const int = (value: unknown, min = 0, max = 1_000_000_000): value is number => Number.isSafeInteger(value) && Number(value) >= min && Number(value) <= max;
const locationKnown = (id: string) => NPC_PUBLIC.some(npc => npc.homeLocation === id && npc.building === 'residence' && !npc.travelOnly);
const sameLife = (profile: FantasyProfile | undefined, generation?: number) => !!profile?.character && !profile.death && (generation === undefined || (profile.generation ?? 1) === generation);
const canParticipate = (profile: FantasyProfile | undefined) => sameLife(profile) && !profile!.character!.downed && profile!.character!.hp > 0;
export const newFantasyBlackMarketLedger = (): FantasyBlackMarketLedger => ({ version: 1, revision: 0, markets: {} });
export function fantasyBlackMarketOpening(location: string, hour: number, realm: string) {
  const day = Math.floor(hour / 24) - (hour % 24 < 5 ? 1 : 0), opensAt = day * 24 + 20, closesAt = day * 24 + 29;
  const id = `bm:${encodeURIComponent(realm)}:${location}:${day}`;
  return { id, day, opensAt, closesAt, open: day >= 0 && locationKnown(location) && hour >= opensAt && hour < closesAt && hash(`${realm}:${location}:${day}:opening`) % 4 === 0 };
}
const clueText = l('이 마을에서 쌓은 신뢰가 있군요. 이따금 밤에만 열리는 뒷골목 경매의 표식을 기억해 두세요.', 'Your good name is known here. Remember the sign of the backstreet auction that opens on certain nights.', 'この町で積んだ信用がありますね。ときおり夜だけ開く、裏通りの競売の印を覚えておいてください。');
export function fantasyBlackMarketClue(c: FantasyCharacter, npcId: string, locale: NpcLocale = 'ja'): { eligible: boolean; message?: string } {
  const npc = NPC_PUBLIC.find(npc => npc.id === npcId);
  const eligible = !!npc && !npc.travelOnly && npc.building === 'residence' && npc.homeLocation === c.location && (c.reputation?.towns[c.location] ?? 0) >= 15;
  return eligible ? { eligible, message: clueText[locale] } : { eligible };
}
export function validFantasyBlackMarketClues(c: FantasyCharacter): boolean {
  return (c.blackMarketClues === undefined || Array.isArray(c.blackMarketClues) && new Set(c.blackMarketClues).size === c.blackMarketClues.length && c.blackMarketClues.every(id => typeof id === 'string' && locationKnown(id)))
    && (c.blackMarketStudies === undefined || Array.isArray(c.blackMarketStudies) && new Set(c.blackMarketStudies).size === c.blackMarketStudies.length && c.blackMarketStudies.every(id => FANTASY_RELICS.some(relic => relic.id === id)));
}
const npcNames = [l('가면의 수집가', 'The Masked Collector', '仮面の収集家'), l('회색 망토의 상인', 'The Gray-Cloaked Trader', '灰外套の商人'), l('등불 든 감정사', 'The Lantern Appraiser', '灯りを持つ鑑定家')];
function makeMarket(location: string, hour: number, realm: string): FantasyBlackMarketAuction {
  const opening = fantasyBlackMarketOpening(location, hour, realm), lots: FantasyBlackMarketLot[] = [];
  const weapons = FANTASY_ITEMS.filter(item => item.equipment?.slot === 'weapon' && item.price > 0 && item.price <= 500);
  const ordinary = FANTASY_ITEMS.filter(item => ['crystal', 'gem', 'relic', 'potion', 'hp-potion-3', 'mp-potion-3', 'antidote'].includes(item.id));
  const books = FANTASY_BLACK_MARKET_ITEMS.filter(item => item.category === 'black-market-study'), relics = FANTASY_BLACK_MARKET_ITEMS.filter(item => item.category === 'black-market-relic');
  const maps = FANTASY_BLACK_MARKET_ITEMS.filter(item => item.category === 'black-market-map');
  const rareMaps = maps.filter(item => item.tier === 5), eliteMaps = maps.filter(item => item.tier === 4);
  for (let index = 0; index < 3 + hash(`${opening.id}:count`) % 3; index++) {
    const seed = `${opening.id}:lot:${index}`, rarity = hash(`${seed}:rarity`) % 100;
    const pool = rarity < 1 ? rareMaps : rarity < 4 ? eliteMaps : rarity < 7 ? relics : rarity < 37 ? books : rarity < 67 && weapons.length ? weapons : ordinary;
    const item = pool[hash(`${seed}:item`) % pool.length], count = item.category?.startsWith('black-market') || item.equipment ? 1 : 1 + hash(`${seed}:count`) % 3;
    const value = Math.max(5, item.price * count), reserve = Math.max(5, Math.ceil(value * .65)), increment = Math.max(2, Math.ceil(value * .05));
    lots.push({ id: `lot-${index + 1}`, item: item.id, count, reserve, increment, currentBid: 0, endsAt: opening.opensAt + 5 + index * .5, settled: false, claimed: false, history: [],
      competitors: npcNames.slice(0, 2 + hash(`${seed}:people`) % 2).map((names, person) => ({ id: `collector-${person}`, names, limit: Math.floor(value * (.85 + hash(`${seed}:limit:${person}`) % 85 / 100)), nextAt: opening.opensAt + .5 + person * .25 })) });
  }
  return { id: opening.id, realm, location, day: opening.day, opensAt: opening.opensAt, closesAt: opening.closesAt, lots };
}
const errors = {
  invalid: l('경매 지정을 확인할 수 없습니다.', 'The auction request is invalid.', '競売の指定を確認できません。'),
  stale: l('경매가 갱신되었습니다. 현재 입찰을 확인하세요.', 'The auction has changed. Check the current bid.', '競売が更新されました。現在の入札を確かめてください。'),
  unavailable: l('지금 이 경매에 참여할 수 없습니다.', 'You cannot take part in this auction now.', '今はこの競売に参加できません。'),
  trust: l('아직 이 마을에서 그 이야기를 들을 인연이 없습니다.', 'You have not yet earned that confidence in this town.', 'まだこの町で、その話を聞ける縁がありません。'),
  bid: l('현재 가격보다 높은 유효한 금액을 제시하세요.', 'Offer a valid amount above the current price.', '現在の価格を上回る有効な額を示してください。'),
  own: l('이미 가장 높은 금액을 제시했습니다.', 'Your bid is already the highest.', 'すでにあなたが最高額を示しています。'),
  gold: l('입찰금을 맡길 금화가 부족합니다.', 'You lack the gold to place that bid in escrow.', 'その入札金を預ける金貨が足りません。'),
  claim: l('이 낙찰품을 받을 수 없습니다.', 'You cannot collect this auction lot.', 'この落札品は受け取れません。'),
};
export function fantasyBlackMarketText(source: string, locale: NpcLocale): string | undefined { return Object.values(errors).find(value => value.ja === source)?.[locale] ?? (source === clueText.ja ? clueText[locale] : undefined); }
export function fantasyBlackMarketActionValid(value: unknown): value is FantasyBlackMarketAction {
  if (!object(value)) return false;
  if (value.type === 'sync') return Object.keys(value).length === 1;
  const id = (v: unknown) => typeof v === 'string' && v.length > 0 && v.length <= 500 && !/[\u0000-\u001f]/.test(v);
  if (value.type === 'blackMarketLearn') return Object.keys(value).length === 2 && id(value.npc);
  if (value.type === 'blackMarketClaim') return Object.keys(value).length === 4 && id(value.market) && id(value.lot) && int(value.revision);
  return value.type === 'blackMarketBid' && Object.keys(value).length === 5 && id(value.market) && id(value.lot) && int(value.revision) && int(value.amount, 1, 1_000_000);
}
function refund(profiles: Map<string, FantasyProfile>, lot: FantasyBlackMarketLot): void {
  if (lot.bidder?.type !== 'player') return;
  const profile = profiles.get(lot.bidder.userId); if (!sameLife(profile, lot.bidder.generation)) return;
  profile!.character!.gold += lot.currentBid; profile!.revision++;
}
function bid(lot: FantasyBlackMarketLot, amount: number, bidder: Bidder, at: number, profiles: Map<string, FantasyProfile>) {
  refund(profiles, lot); lot.currentBid = amount; lot.bidder = bidder;
  lot.history.push({ at, amount, bidder: structuredClone(bidder) }); lot.history = lot.history.slice(-40);
}
function advance(ledger: FantasyBlackMarketLedger, profiles: Map<string, FantasyProfile>, hour: number, realm: string, participants?: readonly string[]): boolean {
  let changed = false;
  const prune = () => { for (const [id, market] of Object.entries(ledger.markets)) if (market.closesAt + 24 * 14 < hour && market.lots.every(lot => lot.claimed || lot.bidder?.type !== 'player' || !sameLife(profiles.get(lot.bidder.userId), lot.bidder.generation))) { delete ledger.markets[id]; changed = true; } };
  prune();
  for (const [user, profile] of profiles) {
    if (participants && !participants.includes(user)) continue;
    const c = profile.character; if (!c?.blackMarketClues?.includes(c.location)) continue;
    const opening = fantasyBlackMarketOpening(c.location, hour, realm);
    if (opening.open && !Object.hasOwn(ledger.markets, opening.id) && Object.keys(ledger.markets).length < 512) { ledger.markets[opening.id] = makeMarket(c.location, hour, realm); changed = true; }
  }
  for (const market of Object.values(ledger.markets).filter(market => market.realm === realm)) for (const lot of market.lots) {
    if (lot.settled) continue;
    while (true) {
      const npc = [...lot.competitors].sort((a, b) => a.nextAt - b.nextAt || a.id.localeCompare(b.id))[0];
      if (npc.nextAt > hour || npc.nextAt >= lot.endsAt) break;
      const at = npc.nextAt; npc.nextAt += .75; changed = true;
      const minimum = lot.currentBid ? lot.currentBid + lot.increment : lot.reserve;
      if (lot.bidder?.type === 'npc' && lot.bidder.id === npc.id || minimum > npc.limit) continue;
      bid(lot, minimum, { type: 'npc', id: npc.id, names: npc.names }, at, profiles);
    }
    if (hour >= lot.endsAt) { lot.settled = true; changed = true; }
  }
  prune();
  return changed;
}
export function advanceFantasyBlackMarket(ledger: FantasyBlackMarketLedger, profiles: Map<string, FantasyProfile>, hour: number, realm: string, participants?: readonly string[]): FantasyBlackMarketResult {
  if (!validTime(hour) || typeof realm !== 'string' || !realm || realm.length > 200) return { ledger, profiles, changed: false, error: errors.invalid.ja };
  const next = structuredClone(ledger), copied = new Map([...profiles].map(([id, profile]) => [id, structuredClone(profile)]));
  const changed = advance(next, copied, hour, realm, participants); if (changed) next.revision++;
  return changed ? { ledger: next, profiles: copied, changed } : { ledger, profiles, changed: false };
}
export function applyFantasyBlackMarket(ledger: FantasyBlackMarketLedger, profiles: Map<string, FantasyProfile>, userId: string, action: FantasyBlackMarketAction, hour: number, realm: string, participants?: readonly string[]): FantasyBlackMarketResult {
  const fail = (kind: keyof typeof errors): FantasyBlackMarketResult => ({ ledger, profiles, changed: false, error: errors[kind].ja });
  if (!fantasyBlackMarketActionValid(action) || !validTime(hour) || !realm || realm.length > 200 || participants && !participants.includes(userId)) return fail('invalid');
  if (action.type === 'sync') return advanceFantasyBlackMarket(ledger, profiles, hour, realm, participants);
  const profile = profiles.get(userId); if (!canParticipate(profile) || profile!.activity || profile!.combatId || profile!.character!.travelPosition) return fail('unavailable');
  if (action.type !== 'blackMarketLearn' && action.revision !== ledger.revision) return fail('stale');
  if (action.type !== 'blackMarketLearn') { const progressed = advanceFantasyBlackMarket(ledger, profiles, hour, realm, participants); if (progressed.changed) return { ...progressed, error: errors.stale.ja }; }
  const next = structuredClone(ledger), copied = new Map([...profiles].map(([id, profile]) => [id, structuredClone(profile)])), p = copied.get(userId)!, c = p.character!;
  if (action.type === 'blackMarketLearn') {
    if (!fantasyBlackMarketClue(c, action.npc).eligible || c.blackMarketClues?.includes(c.location)) return fail('trust');
    (c.blackMarketClues ??= []).push(c.location); p.revision++; advance(next, copied, hour, realm, participants); next.revision++; return { ledger: next, profiles: copied, changed: true };
  }
  const market = Object.hasOwn(next.markets, action.market) ? next.markets[action.market] : undefined, lot = market?.lots.find(lot => lot.id === action.lot);
  if (!market || market.realm !== realm || market.location !== c.location || !c.blackMarketClues?.includes(c.location) || !lot) return fail('unavailable');
  if (action.type === 'blackMarketClaim') {
    if (!lot.settled || hour < lot.endsAt || lot.claimed || lot.bidder?.type !== 'player' || lot.bidder.userId !== userId || lot.bidder.generation !== (p.generation ?? 1)) return fail('claim');
    c.inventory[lot.item] = (c.inventory[lot.item] ?? 0) + lot.count;
    const bagError = fantasyBagChangeError(profile!, p); if (bagError) return { ledger, profiles, changed: false, error: bagError };
    lot.claimed = true; p.revision++; next.revision++; return { ledger: next, profiles: copied, changed: true };
  }
  if (lot.settled || hour < market.opensAt || hour >= lot.endsAt) return fail('unavailable');
  if (hour < (lot.history.at(-1)?.at ?? market.opensAt)) return fail('stale');
  if (lot.bidder?.type === 'player' && lot.bidder.userId === userId && lot.bidder.generation === (p.generation ?? 1)) return fail('own');
  const minimum = lot.currentBid ? lot.currentBid + lot.increment : lot.reserve;
  if (action.amount < minimum) return fail('bid'); if (c.gold < action.amount) return fail('gold');
  c.gold -= action.amount; p.revision++;
  bid(lot, action.amount, { type: 'player', userId, generation: p.generation ?? 1, names: l(c.name, c.name, c.name) }, hour, copied);
  next.revision++; return { ledger: next, profiles: copied, changed: true };
}
export function fantasyBlackMarketState(ledger: FantasyBlackMarketLedger, c: FantasyCharacter, hour: number, realm: string, viewer?: { userId: string; generation: number }) {
  const known = !!c.blackMarketClues?.includes(c.location), opening = fantasyBlackMarketOpening(c.location, hour, realm), stored = known ? ledger.markets[opening.id] : undefined;
  const owned = (lot: FantasyBlackMarketLot) => !!viewer && lot.bidder?.type === 'player' && lot.bidder.userId === viewer.userId && lot.bidder.generation === viewer.generation;
  const pending = known ? Object.values(ledger.markets).filter(market => market.realm === realm && market.location === c.location && market.lots.some(lot => lot.settled && !lot.claimed && lot.bidder?.type === 'player' && (!viewer || owned(lot)))) : [];
  const publicMarket = (market: FantasyBlackMarketAuction) => ({ id: market.id, location: market.location, opensAt: market.opensAt, closesAt: market.closesAt, lots: market.lots.map(lot => ({ id: lot.id, item: lot.item, count: lot.count, currentBid: lot.currentBid, minimumBid: lot.currentBid ? lot.currentBid + lot.increment : lot.reserve,
    endsAt: lot.endsAt, settled: lot.settled, claimed: lot.claimed, yours: owned(lot), canClaim: owned(lot) && lot.settled && !lot.claimed && c.hp > 0 && !c.downed, bidder: lot.bidder ? { type: lot.bidder.type, names: lot.bidder.names } : undefined, competitors: lot.competitors.map(npc => ({ id: npc.id, names: npc.names })), history: lot.history.map(entry => ({ at: entry.at, amount: entry.amount, bidder: { type: entry.bidder.type, names: entry.bidder.names } })) })) });
  return { known, open: known && opening.open, revision: ledger.revision, ...(stored ? { market: publicMarket(stored) } : {}), pending: pending.map(publicMarket) };
}
export function validFantasyBlackMarketLedger(value: unknown): value is FantasyBlackMarketLedger {
  if (!object(value) || Object.keys(value).length !== 3 || value.version !== 1 || !int(value.revision) || !object(value.markets) || Object.keys(value.markets).length > 512) return false;
  const text = (v: unknown) => object(v) && Object.keys(v).length === 3 && ['ko', 'en', 'ja'].every(locale => typeof v[locale] === 'string' && (v[locale] as string).length > 0 && (v[locale] as string).length <= 100);
  const bidder = (v: unknown) => object(v) && text(v.names) && (v.type === 'npc' ? Object.keys(v).length === 3 && typeof v.id === 'string' && /^collector-[0-2]$/.test(v.id) : v.type === 'player' && Object.keys(v).length === 4 && typeof v.userId === 'string' && v.userId.length > 0 && v.userId.length <= 200 && int(v.generation, 1));
  for (const [id, entry] of Object.entries(value.markets)) {
    if (!object(entry) || Object.keys(entry).length !== 7 || entry.id !== id || typeof entry.realm !== 'string' || !entry.realm || entry.realm.length > 200 || typeof entry.location !== 'string' || !FANTASY_LOCATIONS.some(place => place.id === entry.location) || !int(entry.day) || !validTime(entry.opensAt) || !validTime(entry.closesAt) || !Array.isArray(entry.lots)) return false;
    const expected = fantasyBlackMarketOpening(entry.location, entry.opensAt, entry.realm);
    if (!expected.open || expected.id !== id || expected.day !== entry.day || expected.opensAt !== entry.opensAt || expected.closesAt !== entry.closesAt || entry.lots.length < 3 || entry.lots.length > 5) return false;
    for (let index = 0; index < entry.lots.length; index++) {
      const lot = entry.lots[index];
      if (!object(lot) || Object.keys(lot).some(key => !['id', 'item', 'count', 'reserve', 'increment', 'currentBid', 'bidder', 'endsAt', 'settled', 'claimed', 'competitors', 'history'].includes(key)) || lot.id !== `lot-${index + 1}` || !FANTASY_ITEMS.some(item => item.id === lot.item) && !FANTASY_BLACK_MARKET_ITEMS.some(item => item.id === lot.item)
        || !int(lot.count, 1, 3) || !int(lot.reserve, 1, 1_000_000) || !int(lot.increment, 1, lot.reserve) || lot.endsAt !== expected.opensAt + 5 + index * .5 || !int(lot.currentBid, 0, 1_000_000) || lot.currentBid > 0 && lot.currentBid < lot.reserve || typeof lot.settled !== 'boolean' || typeof lot.claimed !== 'boolean' || lot.claimed && (!lot.settled || !object(lot.bidder) || lot.bidder.type !== 'player') || (lot.currentBid === 0 ? lot.bidder !== undefined : !bidder(lot.bidder)) || !Array.isArray(lot.competitors) || lot.competitors.length < 2 || lot.competitors.length > 3 || !Array.isArray(lot.history) || lot.history.length > 40) return false;
      const reserve = lot.reserve, endsAt = Number(lot.endsAt), competitors = lot.competitors;
      if (competitors.some((npc, n) => !object(npc) || Object.keys(npc).length !== 4 || npc.id !== `collector-${n}` || !int(npc.limit, reserve, reserve * 4) || !text(npc.names) || !validTime(npc.nextAt) || npc.nextAt < expected.opensAt + .5 + n * .25 || npc.nextAt > endsAt + .75 || !Number.isInteger((npc.nextAt - expected.opensAt - .5 - n * .25) / .75))) return false;
      let amount = 0, at = entry.opensAt;
      for (const record of lot.history) {
        if (!object(record) || Object.keys(record).length !== 3 || !validTime(record.at) || record.at < at || record.at >= endsAt || !int(record.amount, reserve, 1_000_000) || record.amount <= amount || !bidder(record.bidder)) return false;
        const bidderValue = record.bidder as Bidder;
        if (bidderValue.type === 'npc' && !competitors.some(npc => npc.id === bidderValue.id && JSON.stringify(npc.names) === JSON.stringify(bidderValue.names) && npc.limit >= Number(record.amount))) return false;
        amount = record.amount; at = record.at;
      }
      if (lot.history.length && (amount !== lot.currentBid || JSON.stringify(lot.history.at(-1).bidder) !== JSON.stringify(lot.bidder))) return false;
    }
  }
  return true;
}
export function applyFantasyBlackMarketToken(c: FantasyCharacter, item: string): boolean {
  if ((c.inventory[item] ?? 0) < 1 || c.hp <= 0 || c.downed) return false;
  const rune = FANTASY_BLACK_MARKET_RUNE_TOKENS.find(token => token.id === item);
  if (rune) { const copy = structuredClone(c); if (!learnFantasyCircleBook(copy, rune.book).length) return false; c.circleKnowledge = copy.circleKnowledge; c.inventory[item]--; return true; }
  const relic = FANTASY_RELICS.find(relic => `black-study-${relic.path}` === item && relic.job === c.job);
  if (relic) { if (c.blackMarketStudies?.includes(relic.id)) return false; (c.blackMarketStudies ??= []).push(relic.id); c.inventory[item]--; return true; }
  if (item === 'black-skill-folio') {
    const book = Object.entries(FANTASY_JOB_DISCOVERY_BOOKS).find(([path, book]) => path.startsWith(`${c.job}-`) && path !== 'mage-star' && !c.readBooks?.includes(book))?.[1];
    if (!book) return false; (c.readBooks ??= []).push(book); c.inventory[item]--; return true;
  }
  return false;
}
