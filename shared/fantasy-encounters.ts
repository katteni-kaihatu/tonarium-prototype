import type { FantasyEvent, FantasyEventChoice, FantasyLocation, FantasyStat } from './fantasy.ts';
import type { NpcLocale } from './npc.ts';

type Text = Record<NpcLocale, string>;
type Words = [string, string, string];
const l = ([ko, en, ja]: Words): Text => ({ ko, en, ja });
export type FantasyEncounterCause = 'escape-failed' | 'stealth-failed' | 'crime-exposed' | 'pursuit-failed';
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
  encounter('encounter-woodland-wolf', ['덤불의 늑대', 'Wolf in the Brush', '茂みの狼'],
    ['늑대가 퇴로를 돌아 앞을 막았다. 싸우거나 틈을 찾아 도망쳐야 한다.', 'A wolf circled around and blocked your retreat. Fight or find an opening to escape.', '狼が回り込んで退路を塞いだ。戦うか、隙を見つけて逃げる必要がある。'], 'monster', 13),
  encounter('encounter-goblin', ['길을 막은 고블린', 'Goblin on the Path', '道を塞ぐゴブリン'],
    ['고블린이 무기를 들고 좁은 길을 막는다. 물러날 틈을 주지 않는다.', 'An armed goblin blocks the narrow path and gives you no room to withdraw.', '武器を持ったゴブリンが狭い道を塞ぎ、退く隙を与えない。'], 'monster', 14),
  encounter('encounter-ruin-skeleton', ['깨어난 해골 병사', 'Awakened Skeleton', '目覚めた骸骨兵'],
    ['잔해에서 일어난 해골 병사가 출구로 다가온다. 대응하지 않으면 빠져나갈 수 없다.', 'A skeleton rises from the debris and approaches the exit. You must act to get past it.', '瓦礫から起きた骸骨兵が出口へ迫る。対応しなければ抜けられない。'], 'monster', 16),
  encounter('encounter-reef-beast', ['물가의 거대 게', 'Giant Crab at the Water', '水辺の大蟹'],
    ['거대한 게가 집게를 벌려 물가의 길을 가로막았다. 싸우거나 물러날 틈을 찾아야 한다.', 'A giant crab raises its claws across the waterside path. Fight or find room to retreat.', '大蟹が鋏を広げて水辺の道を塞いだ。戦うか、退く隙を探す必要がある。'], 'monster', 15),
  encounter('encounter-watch', ['뒤쫓아온 경비대', 'A Pursuing Patrol', '追ってきた警備隊'],
    ['들킨 행동을 따라온 경비대가 길을 막는다. 대응을 결정해야 한다. 무력 저항은 악명을 높인다.', 'A patrol following your exposed activity blocks the way. Decide how to respond. Armed resistance raises notoriety.', '露見した行動を追った警備隊が道を塞ぐ。対応を決めよう。武力抵抗は悪名を高める。'], 'person', 14),
  encounter('encounter-bandits', ['골목의 추격자', 'Pursuers in the Alley', '路地の追跡者'],
    ['무장한 추격자들이 앞을 막고 짐을 노린다. 싸움과 도주, 대화 중 대응을 선택해야 한다.', 'Armed pursuers block your way and eye your belongings. Choose to fight, flee or talk.', '武装した追跡者が荷を狙って立ち塞がる。戦闘、逃走、会話から対応を選ぶ必要がある。'], 'person', 15),
];

export function fantasyHostileEncounter(id: string | null | undefined): FantasyHostileEncounter | undefined {
  return FANTASY_HOSTILE_ENCOUNTERS.find(event => event.id === id);
}
export function fantasyEncounterChoiceStat(id: string | null | undefined, choice: string, combatStat: FantasyStat): FantasyStat | undefined {
  const event = fantasyHostileEncounter(id);
  return event?.choices.some(value => value.id === choice) ? choice === 'fight' ? combatStat : event.choices.find(value => value.id === choice)!.stat : undefined;
}
export function fantasyEncounterFor(kind: FantasyLocation['kind'], cause: FantasyEncounterCause, crime = false): FantasyHostileEncounter {
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
  const source = /^遭遇の発端［(escape-failed|stealth-failed|crime-exposed|pursuit-failed)］。$/.exec(text);
  if (source) return ({
    'escape-failed': l(['위험을 피하지 못해 상대와 마주쳤다.', 'You failed to avoid the danger and were confronted.', '危険を避けきれず、相手と対峙した。']),
    'stealth-failed': l(['은밀한 움직임을 들켜 상대가 다가온다.', 'Your covert movement was noticed and an opponent approaches.', '密かな動きに気づかれ、相手が迫る。']),
    'crime-exposed': l(['범행을 들켜 추격을 받았다.', 'Your crime was exposed and brought pursuit.', '犯行が露見し、追跡を受けた。']),
    'pursuit-failed': l(['추격을 끊지 못해 길을 막혔다.', 'You failed to break pursuit and were cornered.', '追跡を切れず、行く手を塞がれた。']),
  } as Record<string, Text>)[source[1]][locale];
  const outcome = /^遭遇［([a-z-]+)］(fight|escape|talk)：(成功|失敗)。$/.exec(text);
  if (!outcome) return undefined;
  const event = fantasyHostileEncounter(outcome[1]), choice = event?.choices.find(choice => choice.id === outcome[2]);
  if (!event || !choice) return undefined;
  return `${event.names![locale]} · ${choice.labels![locale]}: ${(outcome[3] === '成功' ? choice.successes : choice.failures)![locale]}`;
}
