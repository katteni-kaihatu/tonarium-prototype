import type { FantasyCharacter } from './fantasy.ts';
import type { NpcLocale } from './npc.ts';
import { NPC_PUBLIC } from './npc.ts';
import { FANTASY_JOBS, FANTASY_LOCATIONS } from './fantasy-data.ts';
import { fantasyBuildings } from './fantasy-town.ts';
import { fantasyCanRegisterGuild } from './fantasy-guild-progression.ts';
import { fantasyPriestGrowthStatus } from './fantasy-priest-growth.ts';
import { FANTASY_FRONTIER_BASE, FANTASY_FRONTIER_DEPARTURE, FANTASY_FRONTIER_DUNGEONS, FANTASY_FRONTIER_SITE_DISCOVERY, fantasyFrontierSitesAt } from './fantasy-frontier-data.ts';
import { FANTASY_FRONTIER_ARTIFACTS } from './fantasy-frontier-artifacts.ts';

export interface FantasyExpeditionProgress {
  route: 'guild' | 'smuggler'; issuedAt: number;
  ruinRolls?: { site: string; hour: number; item?: string }[];
}
export const FANTASY_EXPEDITION_MIN_GRADE = 4;
export const FANTASY_EXPEDITION_SMUGGLING_FEE = 80;
export const FANTASY_FRONTIER_SUPPLIES: Readonly<Record<string, number>> = { potion: 2, 'mp-potion-1': 1, jerky: 3, bread: 3, lantern: 1, bedroll: 1, tinderbox: 1, 'ward-seal': 1 };
const crime = (c: FantasyCharacter) => FANTASY_JOBS.find(job => job.id === c.job)?.category === 'crime';
export function fantasyExpeditionQualified(c: FantasyCharacter, route: FantasyExpeditionProgress['route']): boolean {
  if (route === 'smuggler') return crime(c) && (c.encounterTier ?? 0) >= FANTASY_EXPEDITION_MIN_GRADE;
  return c.job === 'priest' ? fantasyPriestGrowthStatus(c).clergyAdventurerGrade >= FANTASY_EXPEDITION_MIN_GRADE
    : fantasyCanRegisterGuild(c) && !!c.guildProgress && c.guildProgress.grade >= FANTASY_EXPEDITION_MIN_GRADE;
}
export function fantasyExpeditionQuote(c: FantasyCharacter, route: FantasyExpeditionProgress['route']) {
  const enlisted = c.expedition?.route === route;
  const venue = route === 'guild' ? fantasyBuildings(c).some(b => b.id === 'guild') : c.location === FANTASY_FRONTIER_DEPARTURE
    && NPC_PUBLIC.some(npc => npc.homeLocation === c.location && npc.trainableJobs?.some(id => FANTASY_JOBS.find(job => job.id === id)?.category === 'crime'));
  const reason = !fantasyExpeditionQualified(c, route) ? 'expedition:rank' : !venue ? 'expedition:venue' : route === 'smuggler' && c.gold < FANTASY_EXPEDITION_SMUGGLING_FEE && !enlisted ? 'expedition:fare' : undefined;
  return { eligible: !reason, ...(reason ? { reason } : {}), enlisted, departure: FANTASY_FRONTIER_DEPARTURE, base: FANTASY_FRONTIER_BASE };
}
export function joinFantasyExpedition(c: FantasyCharacter, route: FantasyExpeditionProgress['route']): string | undefined {
  const quote = fantasyExpeditionQuote(c, route);
  if (quote.reason) return quote.reason;
  if (quote.enlisted) return 'expedition:enlisted';
  if (route === 'smuggler') c.gold -= FANTASY_EXPEDITION_SMUGGLING_FEE;
  c.expedition = { route, issuedAt: c.hour, ...(c.expedition?.ruinRolls ? { ruinRolls: c.expedition.ruinRolls } : {}) };
  if (!c.charted.includes(FANTASY_FRONTIER_BASE)) c.charted.push(FANTASY_FRONTIER_BASE);
}
export function fantasyExpeditionTravelError(c: FantasyCharacter, destination: string, transport: string): string | undefined {
  const from = FANTASY_LOCATIONS.find(place => place.id === c.location), to = FANTASY_LOCATIONS.find(place => place.id === destination);
  if (from?.land !== 'frontier' && to?.land !== 'frontier') return;
  if (from?.land === 'frontier' && to?.land === 'frontier') return transport === 'foot' ? undefined : 'expedition:foot';
  if (!['ship', 'working-ship'].includes(transport)) return 'expedition:ship';
  if (from?.land === 'frontier') return c.location === FANTASY_FRONTIER_BASE && destination === FANTASY_FRONTIER_DEPARTURE ? undefined : 'expedition:harbor';
  if (c.location !== FANTASY_FRONTIER_DEPARTURE || destination !== FANTASY_FRONTIER_BASE) return 'expedition:harbor';
  if (!c.expedition) return 'expedition:recruit';
  if (!fantasyExpeditionQualified(c, c.expedition.route)) return 'expedition:rank';
}
export function validFantasyExpedition(c: FantasyCharacter): boolean {
  const e = c.expedition; if (e === undefined) return true;
  if (!e || typeof e !== 'object' || Array.isArray(e) || Object.keys(e).some(key => !['route','issuedAt','ruinRolls'].includes(key)) || !['guild','smuggler'].includes(e.route)
    || !Number.isFinite(e.issuedAt) || e.issuedAt < 0 || e.issuedAt > c.hour) return false;
  if (e.ruinRolls === undefined) return true;
  return Array.isArray(e.ruinRolls) && e.ruinRolls.length <= FANTASY_FRONTIER_DUNGEONS.length && new Set(e.ruinRolls.map(roll => roll.site)).size === e.ruinRolls.length
    && e.ruinRolls.every(roll => roll && typeof roll === 'object' && !Array.isArray(roll) && Object.keys(roll).every(key => ['site','hour','item'].includes(key))
      && FANTASY_FRONTIER_DUNGEONS.some(site => site.id === roll.site && site.kind === 'ruin') && Number.isFinite(roll.hour) && roll.hour >= 0 && roll.hour <= c.hour
      && (roll.item === undefined || FANTASY_FRONTIER_ARTIFACTS.some(item => item.id === roll.item)));
}
function hash(value: string): number {
  let n = 2166136261; for (const ch of value) n = Math.imul(n ^ ch.charCodeAt(0), 16777619);
  n ^= n >>> 16; n = Math.imul(n, 0x7feb352d); n ^= n >>> 15; n = Math.imul(n, 0x846ca68b); return (n ^ n >>> 16) >>> 0;
}
export function fantasyExpeditionRuinReward(c: FantasyCharacter, id: string, rng?: () => number, privateContext = ''): { site: string; item?: string } | undefined {
  const site = FANTASY_FRONTIER_DUNGEONS.find(site => site.id === id && site.kind === 'ruin'), progress = c.dungeon?.sites[id];
  if (!c.expedition || !site || !progress || c.expedition.ruinRolls?.some(roll => roll.site === id)) return;
  const bosses = site.rooms.filter(room => room.enemy?.boss); if (!bosses.length || bosses.some(room => !progress.cleared.includes(room.id))) return;
  // 保存の再試行でも、同じ生涯と遺跡の抽選結果を変えない。
  const key = `${c.name}:${c.race}:${c.lifeStartedAt ?? 0}:${id}:${progress.layoutSeed ?? 0}:${privateContext}`;
  const draw = rng ? Math.max(0, Math.min(.999999999, Number(rng()) || 0)) : hash(key) / 0x100000000;
  const item = draw < .3 ? FANTASY_FRONTIER_ARTIFACTS[hash(`${key}:artifact`) % FANTASY_FRONTIER_ARTIFACTS.length].id : undefined;
  (c.expedition.ruinRolls ??= []).push({ site: id, hour: c.hour, ...(item ? { item } : {}) });
  if (item) c.inventory[item] = (c.inventory[item] ?? 0) + 1;
  return { site: id, ...(item ? { item } : {}) };
}
export function fantasyFrontierDiscoveryCandidate(c: FantasyCharacter, rng: () => number) {
  const sites=fantasyFrontierSitesAt(c.location).filter(site=>!c.dungeon?.known?.includes(site.id));
  if(!sites.length)return;
  const site=sites[Math.min(sites.length-1,Math.floor(Math.max(0,Math.min(.999999,Number(rng())||0))*sites.length))];
  return rng()<FANTASY_FRONTIER_SITE_DISCOVERY[site.id].chance?site:undefined;
}
export function fantasyExpeditionText(text: string, locale: NpcLocale): string | undefined {
  const labels: Record<string, [string,string,string]> = {
    'expedition:carcass': ['사냥한 짐승의 가죽을 벗겨 회수할 수 있다.', 'The hunted carcass can be skinned.', '狩った獲物から皮を回収できる。'],
    'expedition:rank': ['골드(4등급) 이상 등록 모험가 또는 동급 신전 사제가 필요합니다. 밀항은 범죄 직업과 동급 전투력이 필요합니다.', 'Requires registered Gold (grade 4) or equivalent temple rank. Illegal passage requires a criminal profession and equivalent combat power.', 'ゴールド（4級）以上の登録か同等の神殿階級が必要です。密航は犯罪職と同等の戦力が必要です。'],
    'expedition:venue': ['길드 모집 창구 또는 아사기항의 뒷골목 연락책을 찾아가세요.', 'Visit a guild recruitment desk or the underworld contact at Dawnport.', 'ギルドの募集窓口、または東岸港アサギの裏社会の連絡役を訪ねてください。'],
    'expedition:fare': ['밀항 준비금 80G가 필요합니다. 배삯은 별도입니다.', 'Illegal arrangements cost 80G; passage fare is separate.', '密航の手配に80G必要です。船賃は別です。'],
    'expedition:enlisted': ['이미 참가 등록되어 있습니다.', 'Already enlisted.', 'すでに参加登録済みです。'],
    'expedition:recruit': ['길드 탐사 모집이나 밀항 연락책을 통해 먼저 등록하세요.', 'Enlist through the guild or an illegal-passage contact first.', '先にギルドの遠征募集か密航の連絡役で登録してください。'],
    'expedition:harbor': ['아사기항과 원정 베이스캠프의 부두에서 승선하세요.', 'Board at Dawnport or the expedition landing.', '東岸港アサギか遠征の上陸拠点の波止場で乗船してください。'],
    'expedition:ship': ['미개척 대륙의 외해는 원정 항로의 배로만 건널 수 있습니다.', 'Cross the uncharted outer sea by the expedition sea route.', '未開拓大陸の外海は遠征航路の船で渡ってください。'],
    'expedition:foot': ['내륙에는 정기 교통편이 없습니다. 도보로 이동하세요.', 'There is no scheduled inland transport. Travel on foot.', '内陸に定期交通はありません。徒歩で移動してください。'],
    'expedition:joined': ['미개척 대륙 원정에 참가했다. 아사기항에서 배를 탈 수 있다.', 'Enlisted for the uncharted expedition. Passage is available at Dawnport.', '未開拓大陸への遠征に参加した。東岸港アサギから船に乗れる。'],
    'expedition:ruin-empty': ['처음 돌파한 유적에서는 쓸 만한 유물을 찾지 못했다.', 'The first clear yielded no usable artifact.', '初めて踏破した遺跡で、使える遺物は見つからなかった。'],
  };
  const fixed = labels[text]; if (fixed) return fixed[locale === 'ko' ? 0 : locale === 'en' ? 1 : 2];
  if(text.startsWith('expedition:discovered:')){const site=FANTASY_FRONTIER_DUNGEONS.find(site=>site.id===text.slice('expedition:discovered:'.length));if(site)return {ko:`숨겨진 입구를 발견했다. ${site.names.ko} 안으로 들어갈 수 있다.`,en:`Discovered a hidden entrance to ${site.names.en}.`,ja:`隠された入口を発見した。${site.names.ja}に入れる。`}[locale];}
  if (text.startsWith('expedition:artifact:')) {
    const id = text.slice('expedition:artifact:'.length), item = FANTASY_FRONTIER_ARTIFACTS.find(item => item.id === id);
    if (item) return {ko:`유적에서 ${item.names!.ko}을 발견했다.`,en:`Found ${item.names!.en} in the ruin.`,ja:`遺跡で${item.names!.ja}を見つけた。`}[locale];
  }
}
