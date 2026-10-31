import { FANTASY_JOB_PATH_CATALOG } from './fantasy-job-path-catalog.ts';
import type { NpcLocale } from './npc.ts';

type Text = Record<NpcLocale, string>;
export interface FantasyRelic { id: string; job: string; path: string; names: Text; passages: Record<NpcLocale, string[]>; site: string }
const sacred = [
  { id: 'priest-inquisitor', job: 'priest', names: { ko: '이단심문관', en: 'Inquisitor', ja: '異端審問官' } },
  { id: 'priest-paladin', job: 'priest', names: { ko: '성기사', en: 'Paladin', ja: '聖騎士' } },
  { id: 'priest-saint', job: 'priest', names: { ko: '성자', en: 'Saint', ja: '聖者' } },
];
const sites = ['oldwatch', 'fern-sanctum', 'eclipsevault'];
export const FANTASY_RELICS: FantasyRelic[] = [...FANTASY_JOB_PATH_CATALOG.filter(path => path.id !== 'mage-star'), ...sacred].map((path, index) => ({
  id: `relic-${path.id}`, job: path.job, path: path.id, site: path.id === 'priest-saint' ? 'eclipsevault' : sites[index % sites.length],
  names: { ko: `${path.names.ko}의 유고`, en: `Testament of the ${path.names.en}`, ja: `${path.names.ja}の遺稿` },
  passages: {
    ko: [`먼지가 낀 밀랍 봉인 아래에 ${path.names.ko}의 작은 글씨가 남았다. 누군가는 무너지는 천장 아래에서도 동료의 도구를 챙겼고, 마지막 장에는 돌아갈 길을 그렸다.`, '글쓴이는 남의 손을 흉내 내지 말라고 당부한다. 오래 익힌 솜씨가 있어야 이 기록의 빈 곳을 자신의 경험으로 읽을 수 있다.', '종이를 펴니 접힌 자리에 숨겨진 짧은 서명이 드러났다. 이름을 기억하되, 그 사람이 다 걸었던 길을 한 번에 얻었다고 여기지 말라.'],
    en: [`Beneath a dusty wax seal survives the small handwriting of a ${path.names.en}. Someone gathered a companion’s tools under a failing roof, then drew the road home on the final page.`, 'The writer asks the reader to avoid copying another hand. Only a practiced craft can fill the spaces in these notes with experience.', 'Unfolding the paper reveals a short signature hidden in its crease. Remember the name, without mistaking it for the whole life that gave it meaning.'],
    ja: [`埃をかぶる封蝋の下に、${path.names.ja}の小さな文字が残る。崩れる天井の下で仲間の道具を集め、最後の頁には帰り道を描いた人がいた。`, '書き手は他人の手を真似るなと記す。長く磨いた腕があってこそ、記録の余白を自分の経験で読める。', '紙を広げると、折り目に隠れた短い署名が現れた。その名を覚えても、その人の一生を一度に得たと思ってはならない。'],
  },
}));
