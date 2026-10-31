import { fantasySeaPosition } from './fantasy-sea.ts';
import { FANTASY_NAVAL_REGULAR_IDS } from './fantasy-naval-catalog.ts';
import { FANTASY_FRONTIER_BASE, FANTASY_FRONTIER_DEPARTURE, FANTASY_FRONTIER_ENCOUNTERS } from './fantasy-frontier-data.ts';
import type { FantasyCharacter, FantasyEvent, FantasyEventChoice, FantasyLocation, FantasyStat } from './fantasy.ts';
import type { NpcLocale } from './npc.ts';
import { FANTASY_LOCATIONS, FANTASY_ROUTES } from './fantasy-data.ts';
import { FANTASY_COMBAT_ENEMIES, type FantasyCombatEnemyTemplate } from './fantasy-combat-catalog.ts';
import { FANTASY_MONSTER_SITES } from './fantasy-monster-sites.ts';

type Text = Record<NpcLocale, string>;
type Words = [string, string, string];
const l = ([ko, en, ja]: Words): Text => ({ ko, en, ja });
export type FantasyEncounterCause = 'escape-failed' | 'stealth-failed' | 'crime-exposed' | 'pursuit-failed' | 'travel-ambush' | 'escort-ambush' | 'exploration';

function encounterHash(value: string): number {
  let hash = 2166136261;
  for (const letter of value) { hash ^= letter.charCodeAt(0); hash = Math.imul(hash, 16777619); }
  return hash >>> 0;
}

export function fantasyEncounterSite(c: Pick<FantasyCharacter, 'location' | 'travelPosition'>): FantasyLocation | undefined {
  const place = FANTASY_LOCATIONS.find(place => place.id === c.location), position = c.travelPosition;
  if (!position || position.from === position.to || position.fraction <= 1e-8 || !FANTASY_ROUTES.some(route => route.from === position.from && route.to === position.to || route.from === position.to && route.to === position.from)) return place;
  const from = FANTASY_LOCATIONS.find(place => place.id === position.from), to = FANTASY_LOCATIONS.find(place => place.id === position.to);
  if (position.from === FANTASY_FRONTIER_BASE && position.to === FANTASY_FRONTIER_DEPARTURE || position.to === FANTASY_FRONTIER_BASE && position.from === FANTASY_FRONTIER_DEPARTURE) return FANTASY_LOCATIONS.find(place => place.id === 'frontier-kelp-coast');
  if (from?.id === FANTASY_FRONTIER_BASE && to?.land === 'frontier') return to;
  if (to?.id === FANTASY_FRONTIER_BASE && from?.land === 'frontier') return from;
  return place;
}

/** The same place, hour, name and event produce the same opponent without consuming a random draw. */
export function fantasyRegularCombatEnemy(c: FantasyCharacter, salt: string, opponent: 'monster' | 'person' = 'monster'): FantasyCombatEnemyTemplate | undefined {
  const place = fantasyEncounterSite(c);
  if (!place) return undefined;
  const position = c.travelPosition;
  const atSea=!!fantasySeaPosition(c);
  const actualOpponent = atSea||place.land === 'frontier' && position && position.from !== position.to && position.fraction > 1e-8 ? 'monster' : opponent;
  const seed = `${c.location}:${c.name}:${Math.floor(c.hour)}:${salt}`;
  const draw = encounterHash(`tier:${seed}`) / 4294967296;
  const strength = Number.isInteger(c.encounterTier) ? Math.max(1, Math.min(6, c.encounterTier!)) : 1;
  const desired = Math.max(1, strength - (draw < .72 ? 0 : draw < .96 ? 1 : 2));
  const enforcement = /guard|watch|patrol/.test(salt);
  const candidates = FANTASY_COMBAT_ENEMIES.filter(enemy => !enemy.auxiliary && !enemy.provocationOnly && enemy.tier <= 6 && (atSea?FANTASY_NAVAL_REGULAR_IDS.includes(enemy.id):!enemy.navalOnly) && (place.land!=='frontier'||actualOpponent==='monster'&&enemy.tier>=4&&!!FANTASY_FRONTIER_ENCOUNTERS[place.id]?.includes(enemy.id))
    && (actualOpponent === 'monster' ? enemy.kind === 'monster' : enemy.kind === 'human' && (enforcement ? enemy.humanCause === 'crime-enforcement' : enemy.humanCause !== 'crime-enforcement')));
  if (!candidates.length) return undefined;
  const distance = Math.min(...candidates.map(enemy => Math.abs(enemy.tier - desired)));
  const matched = candidates.filter(enemy => Math.abs(enemy.tier - desired) === distance);
  // Prefer the lower tier on an equal-distance fallback, then the region's native creatures.
  const tier = Math.min(...matched.map(enemy => enemy.tier));
  const atTier = matched.filter(enemy => enemy.tier === tier);
  const native = atTier.filter(enemy => enemy.kinds.includes(place.kind));
  const pool = (native.length ? native : atTier).slice().sort((a, b) => a.id < b.id ? -1 : a.id > b.id ? 1 : 0);
  return pool[encounterHash(`enemy:${seed}`) % pool.length];
}
/** 護衛中の襲撃だけが開く遭遇。戦闘開始時に契約IDと馬車へ引き継ぐ目印になる。 */
export const FANTASY_ESCORT_AMBUSH_ENCOUNTER = 'encounter-escort-ambush';
export interface FantasyHostileEncounter extends FantasyEvent { opponent: 'monster' | 'person' }
const action = (id: string, labels: Words, stat: FantasyStat, dc: number, successes: Words, failures: Words): FantasyEventChoice => {
  const name = l(labels), success = l(successes), failure = l(failures);
  return { id, label: name.ja, labels: name, stat, dc, success: success.ja, successes: success, failure: failure.ja, failures: failure, gold: 0 };
};
function encounter(id: string, names: Words, descriptions: Words, opponent: 'monster' | 'person', dc: number): FantasyHostileEncounter {
  const name = l(names), description = l(descriptions);
  const fight = action('fight', ['맞서 싸운다', 'Stand and fight', '立ち向かって戦う'], 'strength', dc,
    ['상대를 물리치고 길을 확보했다.', 'You drove the opponent back and secured a way through.', '相手を退け、通れる道を確保した。'],
    ['공격을 받아 물러섰다. 아직 길이 막혀 있다.', 'An attack forced you back. The way is still blocked.', '攻撃を受けて押し戻された。まだ道は塞がれている。']);
  const escape = action('escape', ['틈을 찾아 달아난다', 'Find an opening and escape', '隙を見つけて逃げる'], 'agility', dc - 1,
    ['추격을 따돌리고 안전거리를 벌렸다.', 'You broke pursuit and reached a safe distance.', '追跡を振り切り、安全な距離を取った。'],
    ['퇴로가 막혀 공격을 받았다. 다시 대응해야 한다.', 'Your retreat was blocked and you were struck. You must respond again.', '退路を塞がれて攻撃を受けた。もう一度対応が必要だ。']);
  const choices = [fight, escape];
  if (opponent === 'person') choices.push(action('talk', ['말로 충돌을 풀어 본다', 'Try to defuse the confrontation', '話して衝突を収める'], 'charisma', dc + 1,
    ['대화로 거리를 벌리고 충돌을 끝냈다.', 'Your words created room to leave and ended the confrontation.', '話して離れる隙を作り、衝突を終えた。'],
    ['설득이 통하지 않아 공격을 받았다. 위협이 계속된다.', 'The appeal failed and you were struck. The threat remains.', '説得は通じず攻撃を受けた。脅威は続いている。']));
  return { id, name: name.ja, names: name, description: description.ja, descriptions: description, opponent, choices };
}

export const FANTASY_HOSTILE_ENCOUNTERS: FantasyHostileEncounter[] = [
  encounter('encounter-woodland-wolf', ['덤불 속의 위협', 'Threat in the Brush', '茂みの脅威'],
    ['적대적인 생물이 퇴로를 돌아 앞을 막았다. 싸우거나 틈을 찾아 도망쳐야 한다.', 'A hostile creature circled around and blocked your retreat. Fight or find an opening to escape.', '敵対的な生き物が回り込んで退路を塞いだ。戦うか、隙を見つけて逃げる必要がある。'], 'monster', 13),
  encounter('encounter-goblin', ['길을 막은 위협', 'Threat on the Path', '道を塞ぐ脅威'],
    ['적대적인 상대가 좁은 길을 막는다. 물러날 틈을 주지 않는다.', 'A hostile opponent blocks the narrow path and gives you no room to withdraw.', '敵対する相手が狭い道を塞ぎ、退く隙を与えない。'], 'monster', 14),
  encounter('encounter-ruin-skeleton', ['유적에서 깨어난 위협', 'Awakened Threat in the Ruins', '遺跡に目覚めた脅威'],
    ['잔해에서 움직임이 일더니 적대적인 상대가 출구로 다가온다. 대응하지 않으면 빠져나갈 수 없다.', 'Movement stirs in the debris as a hostile opponent approaches the exit. You must act to get past it.', '瓦礫が動き、敵対する相手が出口へ迫る。対応しなければ抜けられない。'], 'monster', 16),
  encounter('encounter-reef-beast', ['물가의 위협', 'Threat at the Water', '水辺の脅威'],
    ['적대적인 생물이 물가의 길을 가로막았다. 싸우거나 물러날 틈을 찾아야 한다.', 'A hostile creature blocks the waterside path. Fight or find room to retreat.', '敵対的な生き物が水辺の道を塞いだ。戦うか、退く隙を探す必要がある。'], 'monster', 15),
  encounter('encounter-watch', ['뒤쫓아온 경비대', 'A Pursuing Patrol', '追ってきた警備隊'],
    ['들킨 행동을 따라온 경비대가 길을 막는다. 대응을 결정해야 한다. 무력 저항은 악명을 높인다.', 'A patrol following your exposed activity blocks the way. Decide how to respond. Armed resistance raises notoriety.', '露見した行動を追った警備隊が道を塞ぐ。対応を決めよう。武力抵抗は悪名を高める。'], 'person', 14),
  encounter('encounter-bandits', ['골목의 추격자', 'Pursuers in the Alley', '路地の追跡者'],
    ['무장한 추격자들이 앞을 막고 짐을 노린다. 싸움과 도주, 대화 중 대응을 선택해야 한다.', 'Armed pursuers block your way and eye your belongings. Choose to fight, flee or talk.', '武装した追跡者が荷を狙って立ち塞がる。戦闘、逃走、会話から対応を選ぶ必要がある。'], 'person', 15),
  encounter(FANTASY_ESCORT_AMBUSH_ENCOUNTER, ['호송 수레를 노리는 습격자', 'Raiders after the Convoy', '護送隊を狙う襲撃者'],
    ['호송 수레를 노리고 길을 막아선 무장한 무리다. 수레를 지키며 싸우거나, 틈을 찾아 빠져나가야 한다.', 'Armed raiders block the road, eyeing the caravan wagon. Stand and protect it, or find an opening and slip away.', '護送馬車を狙って道を塞ぐ武装した一団。馬車を守って戦うか、隙を突いて抜けるかだ。'], 'person', 14),
];

export function fantasyHostileEncounter(id: string | null | undefined): FantasyHostileEncounter | undefined {
  return FANTASY_HOSTILE_ENCOUNTERS.find(event => event.id === id);
}
export function fantasyEncounterChoiceStat(id: string | null | undefined, choice: string, combatStat: FantasyStat): FantasyStat | undefined {
  const event = fantasyHostileEncounter(id);
  return event?.choices.some(value => value.id === choice) ? choice === 'fight' ? combatStat : event.choices.find(value => value.id === choice)!.stat : undefined;
}
export function fantasyEncounterFor(kind: FantasyLocation['kind'], cause: FantasyEncounterCause, crime = false): FantasyHostileEncounter {
  if (cause === 'escort-ambush') return fantasyHostileEncounter(FANTASY_ESCORT_AMBUSH_ENCOUNTER)!;
  const id = cause === 'crime-exposed' || crime && cause === 'stealth-failed' ? 'encounter-watch'
    : kind === 'city' || cause === 'pursuit-failed' ? 'encounter-bandits'
    : ['forest', 'snow'].includes(kind) ? 'encounter-woodland-wolf'
    : ['ruin', 'tower'].includes(kind) ? 'encounter-ruin-skeleton'
    : ['coast', 'swamp', 'island'].includes(kind) ? 'encounter-reef-beast' : 'encounter-goblin';
  return fantasyHostileEncounter(id)!;
}
export function fantasyCovertWork(job: string): boolean {
  return ['thief', 'smuggler', 'assassin', 'spy', 'bandit'].includes(job);
}
export function fantasyFailedEventPursuit(event: string, choice: string): boolean {
  return ({ 'merchant-bandits': ['escape'], 'thief-market': ['careful'], 'thief-cache': ['careful'], 'thief-guild': ['alternative'],
    'assassin-contract': ['careful'], 'assassin-shadow': ['careful'], 'assassin-retreat': ['careful'] } as Record<string, string[]>)[event]?.includes(choice) ?? false;
}
export const fantasyEncounterOriginLog = (cause: FantasyEncounterCause): string => `遭遇の発端［${cause}］。`;
export const fantasyEncounterOutcomeLog = (id: string, choice: string, success: boolean): string => `遭遇［${id}］${choice}：${success ? '成功' : '失敗'}。`;
export function fantasyEncounterLogText(text: string, locale: NpcLocale): string | undefined {
  const map = /^魔物の地図［([a-z-]+)］を読み、秘密の入口を地図に記録した。$/.exec(text);
  if (map) {
    const site = FANTASY_MONSTER_SITES.find(site => site.id === map[1]);
    if (site) return l([`${site.names.ko} 지도를 읽고 비밀 접근로를 기록했다. ${site.descriptions.ko} 직접 방문한 뒤 위험을 조사해야 한다.`, `Studied the map of ${site.names.en} and recorded its secret approach. ${site.descriptions.en} Visit the location and inspect the danger before challenging it.`, `${site.names.ja}の地図を読み、秘密の入口を記録した。${site.descriptions.ja} 現地を訪れ、危険を調べてから挑もう。`])[locale];
  }
  const source = /^遭遇の発端［(escape-failed|stealth-failed|crime-exposed|pursuit-failed|travel-ambush|escort-ambush|exploration)］。$/.exec(text);
  if (source) return ({
    'escape-failed': l(['위험을 피하지 못해 상대와 마주쳤다.', 'You failed to avoid the danger and were confronted.', '危険を避けきれず、相手と対峙した。']),
    'stealth-failed': l(['은밀한 움직임을 들켜 상대가 다가온다.', 'Your covert movement was noticed and an opponent approaches.', '密かな動きに気づかれ、相手が迫る。']),
    'crime-exposed': l(['범행을 들켜 추격을 받았다.', 'Your crime was exposed and brought pursuit.', '犯行が露見し、追跡を受けた。']),
    'pursuit-failed': l(['추격을 끊지 못해 길을 막혔다.', 'You failed to break pursuit and were cornered.', '追跡を切れず、行く手を塞がれた。']),
    'travel-ambush': l(['이동 중 습격을 받았다.', 'You were ambushed on the road.', '移動中に襲撃を受けた。']),
    'escort-ambush': l(['호송 수레가 길에서 습격을 받았다.', 'The caravan wagon was ambushed on the road.', '護送馬車が道で襲撃を受けた。']),
    exploration: l(['야외 탐사를 마치던 중 적대적인 상대와 마주쳤다.', 'You met a hostile opponent while finishing your wilderness exploration.', '野外の探索を終える際に敵対する相手と遭遇した。']),
  } as Record<string, Text>)[source[1]][locale];
  const outcome = /^遭遇［([a-z-]+)］(fight|escape|talk)：(成功|失敗)。$/.exec(text);
  if (!outcome) return undefined;
  const event = fantasyHostileEncounter(outcome[1]), choice = event?.choices.find(choice => choice.id === outcome[2]);
  if (!event || !choice) return undefined;
  return `${event.names![locale]} · ${choice.labels![locale]}: ${(outcome[3] === '成功' ? choice.successes : choice.failures)![locale]}`;
}
