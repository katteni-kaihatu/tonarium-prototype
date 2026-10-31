import type { FantasyItem } from './fantasy.ts';
import { FANTASY_RELICS } from './fantasy-relic-catalog.ts';
import { FANTASY_MONSTER_SITE_ITEMS } from './fantasy-monster-sites.ts';
const l = (ko: string, en: string, ja: string) => ({ ko, en, ja });
const runeNames = [l('충격', 'Impact', '衝撃'), l('연장', 'Reach', '延伸'), l('공명', 'Resonance', '共鳴'), l('정화', 'Purification', '浄化'), l('수호', 'Benediction', '加護'), l('기적', 'Miracle', '奇跡'), l('서리', 'Frost', '霜'), l('잔불', 'Embers', '残り火')];
export const FANTASY_BLACK_MARKET_RUNE_TOKENS = ['physical', 'reach', 'resonance', 'purification', 'benediction', 'miracle', 'frost', 'embers'].map(rune => ({ id: `black-rune-${rune}`, book: `rune-${rune}` }));
export const FANTASY_BLACK_MARKET_ITEMS: FantasyItem[] = [
  ...FANTASY_MONSTER_SITE_ITEMS,
  ...FANTASY_BLACK_MARKET_RUNE_TOKENS.map(({ id }, index) => { const rune = runeNames[index], names = l(`봉인된 룬 필사본 · ${rune.ko}`, `Sealed Rune Copy · ${rune.en}`, `封じたルーン写本・${rune.ja}`); const descriptions = l('봉인을 풀어 문양의 기록을 읽는다. 익힌 적이 없는 문양만 배울 수 있다.', 'Break the seal to study its inscription. A familiar inscription yields no new knowledge.', '封を解いて文様の記録を読む。すでに知る文様から新しい知識は得られない。'); return { id, names, name: names.ja, descriptions, description: descriptions.ja, price: 110, category: 'black-market-study', tier: 3 as const }; }),
  { id: 'black-skill-folio', name: '生業の拾遺帖', names: l('생업의 잃어버린 장', 'A Trade’s Lost Folio', '生業の拾遺帖'), description: '今の生業に関わる古い書の一節が残る。', descriptions: l('지금 생업에 관한 오래된 책의 한 대목이 남아 있다.', 'A passage from an old book concerns your present trade.', '今の生業に関わる古い書の一節が残る。'), price: 95, category: 'black-market-study', tier: 3 },
  ...FANTASY_RELICS.map(relic => ({ id: `black-study-${relic.path}`, name: relic.names.ja, names: relic.names, description: relic.passages.ja[0], descriptions: l(relic.passages.ko[0], relic.passages.en[0], relic.passages.ja[0]), price: relic.path === 'priest-saint' ? 1600 : 700, category: 'black-market-relic', tier: 4 as const })),
];
