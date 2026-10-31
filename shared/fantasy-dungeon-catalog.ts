import { FANTASY_FRONTIER_DUNGEONS } from './fantasy-frontier-data.ts';
import type { FantasyQuest } from './fantasy.ts';

export type DungeonText = Record<'ko' | 'en' | 'ja', string>;
export interface FantasyDungeonRoom {
  id: string; names: DungeonText; descriptions: DungeonText; x: number; y: number; exits: string[];
  trap?: { detect: number; disarm: number; damage: number; effect?: 'poison' | 'frost' | 'weakness' };
  enemy?: { template: string; boss?: boolean };
  special?: 'spring' | 'shrine' | 'obelisk';
  discovery?: string; reward?: { gold: number; item?: string; count?: number };
}
export interface FantasyDungeonSite { id: string; location: string; kind: 'ruin' | 'cave'; names: DungeonText; descriptions: DungeonText; entry: string; rooms: FantasyDungeonRoom[]; prerequisite?: string }
const l = (ko: string, en: string, ja: string): DungeonText => ({ ko, en, ja });
const room = (id: string, names: DungeonText, x: number, y: number, exits: string[], extra: Partial<FantasyDungeonRoom> = {}): FantasyDungeonRoom => ({ id, names, descriptions: l(`${names.ko}의 흔적을 살펴보고 길과 위험을 확인할 수 있다.`, `Examine the traces in ${names.en.toLowerCase()} and check the passages for danger.`, `${names.ja}の痕跡を調べ、通路と危険を確かめられる。`), x, y, exits, ...extra });

// 地図との循環参照を避けるため、実行時のデータ・図書・エンジンを参照しない。
export const FANTASY_DUNGEONS: FantasyDungeonSite[] = [
  { id: 'oldwatch', location: 'oldwatch', kind: 'ruin', names: l('옛 망루 지하', 'Oldwatch Undercroft', '古い見張り城の地下'), descriptions: l('무너진 망루 아래의 병영과 기록실.', 'Barracks and records beneath the fallen watchtower.', '崩れた見張り城の地下に続く兵舎と記録庫。'), entry: 'entrance', rooms: [
    room('entrance', l('무너진 계단', 'Broken Stair', '崩れた階段'), 1, 0, ['barracks', 'archive']),
    room('barracks', l('옛 병영', 'Old Barracks', '古い兵舎'), 0, 1, ['entrance', 'armory'], { enemy: { template: 'monster-skeleton-guard' } }),
    room('archive', l('낡은 기록실', 'Dusty Archive', '埃の記録室'), 2, 1, ['entrance', 'armory'], { trap: { detect: 13, disarm: 14, damage: 7 }, discovery: 'magic-veil', reward: { gold: 9 } }),
    room('armory', l('잠긴 무기고', 'Sealed Armory', '封じられた武器庫'), 1, 2, ['barracks', 'archive', 'watchcrypt'], { trap: { detect: 14, disarm: 15, damage: 10, effect: 'weakness' }, reward: { gold: 14, item: 'ore', count: 2 } }),
    room('watchcrypt', l('수호자의 묘실', 'Warden Crypt', '守り手の墓室'), 1, 3, ['armory'], { enemy: { template: 'monster-ruin-stone-sentinel', boss: true }, discovery: 'magic-light', reward: { gold: 24, item: 'relic', count: 1 } }),
  ] },
  { id: 'fern-sanctum', location: 'fern-sanctum', kind: 'ruin', names: l('고사리 고대 성소', 'Fern Sanctum', '羊歯の古い聖域'), descriptions: l('뿌리가 돌길을 가르고 빛이 안뜰에 모인다.', 'Roots divide the stone paths and light gathers in the court.', '根が石道を分け、光が中庭へ集まる。'), entry: 'entry', rooms: [
    room('entry', l('덩굴 문', 'Vine Gate', '蔓の門'), 0, 1, ['court']),
    room('court', l('풀 덮인 안뜰', 'Overgrown Court', '草の中庭'), 1, 1, ['entry', 'spring', 'rootwalk'], { enemy: { template: 'monster-thorn-beetle' } }),
    room('spring', l('치유의 샘', 'Quiet Spring', '静かな泉'), 1, 0, ['court', 'sunaltar'], { trap: { detect: 14, disarm: 13, damage: 8, effect: 'poison' }, discovery: 'magic-mend' }),
    room('rootwalk', l('뿌리 회랑', 'Root Walk', '根の回廊'), 2, 1, ['court', 'sunaltar'], { reward: { gold: 10, item: 'herb', count: 3 } }),
    room('sunaltar', l('햇빛 제단', 'Sun Altar', '陽の祭壇'), 2, 0, ['spring', 'rootwalk', 'guardian'], { discovery: 'magic-light', trap: { detect: 15, disarm: 15, damage: 11 } }),
    room('guardian', l('성소의 심장', 'Sanctum Heart', '聖域の心臓'), 3, 0, ['sunaltar'], { enemy: { template: 'monster-stone-golem', boss: true }, reward: { gold: 25, item: 'crystal', count: 2 } }),
  ] },
  { id: 'eclipsevault', location: 'eclipsevault', kind: 'ruin', names: l('월식 지하궁', 'Eclipse Vault', '月蝕の地下宮'), descriptions: l('비뚤어진 별 지도가 깊은 지하궁을 안내한다.', 'A distorted star chart leads through the underground palace.', '歪んだ星図が深い地下宮の道を示す。'), entry: 'threshold', rooms: [
    room('threshold', l('달의 문턱', 'Moon Threshold', '月の敷居'), 0, 0, ['mirrors']),
    room('mirrors', l('거울 회랑', 'Mirror Hall', '鏡の回廊'), 1, 0, ['threshold', 'westseal', 'eastseal'], { trap: { detect: 17, disarm: 18, damage: 13, effect: 'frost' } }),
    room('westseal', l('서쪽 봉인', 'Western Seal', '西の封印'), 1, 1, ['mirrors', 'orbits'], { discovery: 'magic-gale', enemy: { template: 'monster-wight' } }),
    room('eastseal', l('동쪽 봉인', 'Eastern Seal', '東の封印'), 2, 0, ['mirrors', 'orbits'], { trap: { detect: 18, disarm: 19, damage: 15, effect: 'weakness' }, reward: { gold: 18, item: 'crystal', count: 2 } }),
    room('orbits', l('천구의 방', 'Orbital Chamber', '天球の間'), 2, 1, ['westseal', 'eastseal', 'eclipsethrone'], { discovery: 'magic-bolt' }),
    room('eclipsethrone', l('월식 왕좌', 'Eclipse Throne', '月蝕の玉座'), 3, 1, ['orbits'], { enemy: { template: 'monster-archive-warden', boss: true }, discovery: 'magic-stone', reward: { gold: 40, item: 'relic', count: 2 } }),
  ] },
  { id: 'deepcave', location: 'deepcave', kind: 'cave', names: l('청수정 동굴', 'Bluecrystal Cavern', '青晶の洞窟'), descriptions: l('푸른 결정과 지하 물길을 따라 내려가는 동굴.', 'A cavern descending along blue crystals and underground streams.', '青い結晶と地下水路に沿って下る洞。'), entry: 'mouth', rooms: [
    room('mouth', l('동굴 어귀', 'Cave Mouth', '洞の入口'), 1, 0, ['pool', 'shelf']),
    room('pool', l('푸른 웅덩이', 'Blue Pool', '青い水溜り'), 0, 1, ['mouth', 'crystals'], { enemy: { template: 'monster-cave-slime' }, discovery: 'magic-tide' }),
    room('shelf', l('부서진 암반', 'Cracked Shelf', '割れた岩棚'), 2, 1, ['mouth', 'crystals', 'echo'], { trap: { detect: 13, disarm: 14, damage: 9 }, reward: { gold: 8, item: 'ore', count: 2 } }),
    room('echo', l('메아리 막장', 'Echo Alcove', '響きの奥穴'), 3, 1, ['shelf'], { reward: { gold: 6, item: 'ore', count: 1 } }),
    room('crystals', l('수정 회랑', 'Crystal Walk', '結晶の回廊'), 1, 2, ['pool', 'shelf', 'matriarch'], { discovery: 'magic-stone', trap: { detect: 15, disarm: 14, damage: 10, effect: 'frost' } }),
    room('matriarch', l('결정 수호굴', 'Crystal Guardian Den', '結晶の守り巣'), 1, 3, ['crystals'], { enemy: { template: 'monster-crystal-cave-spider', boss: true }, reward: { gold: 28, item: 'crystal', count: 3 } }),
  ] },
  { id: 'root-cavern', location: 'root-cavern', kind: 'cave', names: l('뿌리 메아리 동굴', 'Root-Echo Cave', '根響き洞'), descriptions: l('뿌리와 버섯이 숨긴 좁은 통로의 미로.', 'A maze of narrow tunnels hidden by roots and fungi.', '根と茸が隠す細い通路の迷路。'), entry: 'hollow', rooms: [
    room('hollow', l('빈 나무 굴', 'Hollow Trunk', '空洞の幹'), 0, 2, ['fork']),
    room('fork', l('갈림굴', 'Forked Tunnel', '分かれ洞'), 1, 2, ['hollow', 'spores', 'rootbridge']),
    room('spores', l('포자 동굴', 'Spore Cave', '胞子の洞'), 1, 1, ['fork', 'whisper'], { trap: { detect: 14, disarm: 15, damage: 7, effect: 'poison' }, discovery: 'magic-veil' }),
    room('rootbridge', l('뿌리 다리', 'Root Bridge', '根の橋'), 2, 2, ['fork', 'whisper'], { enemy: { template: 'monster-venom-spider' }, reward: { gold: 11, item: 'herb', count: 2 } }),
    room('whisper', l('바람 틈', 'Whispering Cleft', '風の隙間'), 2, 1, ['spores', 'rootbridge', 'brood'], { discovery: 'magic-gale' }),
    room('brood', l('큰 둥지', 'Brood Nest', '大きな巣'), 2, 0, ['whisper'], { enemy: { template: 'monster-mud-golem', boss: true }, discovery: 'magic-mend', reward: { gold: 26, item: 'silk', count: 2 } }),
  ] },
  { id: 'deepcave-depths', location: 'deepcave', kind: 'cave', prerequisite: 'deepcave', names: l('청수정 심층굴', 'Bluecrystal Depths', '青晶の深層洞'), descriptions: l('윗동굴 아래로 내려가는 뜨거운 바위와 불빛의 통로.', 'Warm rock and firelit passages beneath the upper cavern.', '上の洞より深く続く、熱い岩と火明かりの道。'), entry: 'descent', rooms: [
    room('descent', l('깊은 하강로', 'Deep Descent', '深い降り道'), 0, 0, ['chimney']),
    room('chimney', l('열기 굴뚝', 'Warm Chimney', '熱の煙突'), 0, 1, ['descent', 'embers'], { trap: { detect: 16, disarm: 17, damage: 12 } }),
    room('embers', l('잔불 마당', 'Ember Court', '残り火の広場'), 1, 1, ['chimney', 'vault', 'lavaflow'], { enemy: { template: 'monster-flame-lizard' }, discovery: 'magic-flame' }),
    room('vault', l('지하 보관굴', 'Buried Cache', '地下の蔵洞'), 1, 0, ['embers'], { trap: { detect: 17, disarm: 18, damage: 13, effect: 'weakness' }, reward: { gold: 21, item: 'gem', count: 1 } }),
    room('lavaflow', l('용암 흔적길', 'Lava Trace', '溶岩の跡道'), 2, 1, ['embers', 'warden'], { discovery: 'magic-bolt' }),
    room('warden', l('흑요 수호굴', 'Obsidian Warden Den', '黒曜の守り巣'), 3, 1, ['lavaflow'], { enemy: { template: 'monster-obsidian-guardian', boss: true }, discovery: 'magic-flame', reward: { gold: 38, item: 'crystal', count: 3 } }),
  ] },
];

FANTASY_DUNGEONS.push(...FANTASY_FRONTIER_DUNGEONS);

export const FANTASY_DUNGEON_QUESTS: FantasyQuest[] = FANTASY_DUNGEONS.filter(site => !site.id.startsWith('frontier-')).flatMap((site, index) => [
  { id: `dungeon-survey-${site.id}`, name: `${site.names.ja}の調査`, names: l(`${site.names.ko} 조사`, `Survey ${site.names.en}`, `${site.names.ja}の調査`), description: site.descriptions.ja, descriptions: site.descriptions,
    giver: index < 3 ? 'hearth' : 'tidehaven', destination: site.location, building: 'guild', item: 'relic', count: 0, gold: 18 + index * 3, xp: 12 + index * 2, objective: { type: 'dungeon' as const, site: site.id, goal: 'inspect' as const, count: 3 } },
  { id: `dungeon-clear-${site.id}`, name: `${site.names.ja}の守り手`, names: l(`${site.names.ko} 수호자`, `Guardian of ${site.names.en}`, `${site.names.ja}の守り手`), description: site.descriptions.ja, descriptions: site.descriptions,
    giver: index < 3 ? 'hearth' : 'tidehaven', destination: site.location, building: 'guild', item: 'relic', count: 0, gold: 26 + index * 4, xp: 20 + index * 3, objective: { type: 'dungeon' as const, site: site.id, goal: 'clear' as const, count: 1 } },
]);
