import type { FantasyActivity, FantasyCharacter, FantasyEvent } from './fantasy.ts';
import type { NpcPublicProfile } from './npc.ts';
import { FANTASY_DUNGEONS } from './fantasy-dungeon-catalog.ts';
import { FANTASY_FRONTIER_DUNGEONS } from './fantasy-frontier-data.ts';

export const FANTASY_MAP_MERCHANT_EVENT = 'encounter-wandering-merchant';
export const FANTASY_MAP_MERCHANT_NPC = 'wandering-cartographer';
export const FANTASY_MAP_MERCHANT_SLOT_HOURS = 1 / 12;
export const FANTASY_MAP_MERCHANT_CHANCE = .02;
const l = (ko: string, en: string, ja: string) => ({ ko, en, ja });
const hash = (text: string): number => { let value = 2166136261; for (const ch of text) { value ^= ch.charCodeAt(0); value = Math.imul(value, 16777619); } return value >>> 0; };
export function fantasyMapMerchantDaylight(hour: number): boolean { const time = hour % 24; return Number.isFinite(hour) && hour >= 0 && time >= 6 && time < 18; }
export function fantasyMapMerchantRoad(c: Pick<FantasyCharacter, 'location' | 'travelPosition'>): string {
  const p = c.travelPosition;
  return p && p.from !== p.to ? [p.from, p.to].sort().join('~') : p?.from ?? c.location;
}
// 道路と世界日付に結び付け、再接続や逆方向の旅でも在庫を引き直さない。
export function fantasyMapMerchantStock(road: string, day: number): { item: string; count: 1 }[] {
  const ordered = FANTASY_DUNGEONS.filter(site => !FANTASY_FRONTIER_DUNGEONS.some(hidden => hidden.id === site.id)).map(site => ({ item: `map-dungeon-${site.id}`, order: hash(`${road}:${day}:${site.id}`) })).sort((a, b) => a.order - b.order || a.item.localeCompare(b.item));
  return ordered.slice(0, 1 + hash(`count:${road}:${day}`) % 2).map(({ item }) => ({ item, count: 1 }));
}
// 陸上で経過済みの区間だけ、襲撃とは別の抽選列を使う。
export function fantasyMapMerchantHit(activity: Pick<FantasyActivity, 'action' | 'startedAt' | 'endsAt' | 'seed' | 'travel'>, until: number, after = activity.startedAt): { hour: number; slot: number } | undefined {
  if (activity.action.type !== 'travel' || activity.action.transport === 'escort') return;
  const base = activity.travel?.ambushStartedAt ?? activity.startedAt, end = Math.min(until, activity.endsAt);
  const first = Math.max(0, Math.floor((Math.max(after, activity.startedAt) - base + 1e-8) / FANTASY_MAP_MERCHANT_SLOT_HOURS));
  const slots = Math.floor((end - base + 1e-8) / FANTASY_MAP_MERCHANT_SLOT_HOURS);
  for (let slot = first; slot < slots; slot++) {
    const hour = base + (slot + 1) * FANTASY_MAP_MERCHANT_SLOT_HOURS;
    if (hour >= activity.endsAt - 1e-8 || !fantasyMapMerchantDaylight(hour)) continue;
    let elapsed = hour - activity.startedAt, mode = activity.action.transport;
    for (const leg of activity.travel?.legs ?? []) { mode = leg.transport; if (elapsed < leg.hours - 1e-8) break; elapsed -= leg.hours; }
    if (!['foot', 'carriage'].includes(mode)) continue;
    if (hash(`merchant:${activity.seed}:${slot}`) / 4294967296 < FANTASY_MAP_MERCHANT_CHANCE) return { hour, slot };
  }
}
export const FANTASY_MAP_MERCHANT_ENCOUNTER: FantasyEvent = {
  id: FANTASY_MAP_MERCHANT_EVENT, names: l('길 위의 지도 행상', 'The Roadside Cartographer', '旅路の地図売り'), name: '旅路の地図売り',
  descriptions: l('나루가 길가에 지도를 펼쳤다. 오늘 남은 유적 탐사도를 살펴보거나 여정을 이어갈 수 있다.', 'Naru has spread out charts beside the road. Inspect today’s remaining ruin maps or continue your journey.', 'ナルが道端に地図を広げた。今日残っている遺跡の探索図を見たり、旅を続けたりできる。'),
  description: 'ナルが道端に地図を広げた。今日残っている遺跡の探索図を見たり、旅を続けたりできる。',
  choices: [{ id: 'leave', labels: l('상인과 헤어지기', 'Leave the merchant', '商人と別れる'), label: '商人と別れる', stat: 'charisma', dc: 0,
    successes: l('인사를 나누고 지도를 접는 모습을 뒤로했다.', 'You exchange farewells and leave the folded charts behind.', '挨拶を交わし、畳まれる地図を後にした。'), success: '挨拶を交わし、畳まれる地図を後にした。', failures: l('조용히 자리를 떠났다.', 'You quietly take your leave.', '静かにその場を離れた。'), failure: '静かにその場を離れた。', gold: 0 }],
};
export const FANTASY_MAP_MERCHANT_PROFILE: NpcPublicProfile = {
  id: FANTASY_MAP_MERCHANT_NPC, travelOnly: true, name: l('나루', 'Naru', 'ナル'), role: l('떠돌이 지도 상인', 'Wandering cartographer', '旅する地図商'), age: 41, gender: 'female', race: 'human', homeLocation: 'hearth', building: 'residence',
  personality: l('호기심이 많고 꼼꼼하다. 모르는 위험은 솔직히 인정한다.', 'Curious and meticulous; admits unknown dangers.', '好奇心旺盛で几帳面。未知を認める。'),
  speech: l('지도를 짚어 짧게 설명하고 미확인 길은 구분한다.', 'Points to the chart; labels unchecked paths.', '地図を指し、未確認の道は区別する。'),
  knownTopics: { ko: ['낮의 여행길', '유적 탐사도', '지도와 현장의 차이'], en: ['Daytime travel', 'Ruin survey charts', 'Differences between map and ground'], ja: ['昼の旅路', '遺跡の探索図', '地図と現地の違い'] },
};
