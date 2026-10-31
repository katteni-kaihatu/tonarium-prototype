import type { FantasyDungeonRoom, FantasyDungeonSite, DungeonText } from './fantasy-dungeon-catalog.ts';

const text = (ko: string, en: string, ja: string): DungeonText => ({ ko, en, ja });
const specials = [
  { kind: 'spring', names: text('잊힌 샘', 'Forgotten Spring', '忘れられた泉'), descriptions: text('잔잔한 물에서 낯선 빛이 돈다. 손을 대거나 약초를 바칠 수 있다.', 'An unfamiliar light moves in the water. Touch it, offer an herb, or walk away.', '静かな水に見知らぬ光が漂う。触れるか、薬草を供えるか、立ち去れる。') },
  { kind: 'shrine', names: text('숨겨진 제단', 'Hidden Shrine', '隠された祭壇'), descriptions: text('무너진 제단이 축복과 저주를 품고 있다. 손을 대거나 약초를 바칠 수 있다.', 'The broken shrine holds blessings and curses. Touch it, offer an herb, or leave it alone.', '崩れた祭壇は祝福と呪いを秘める。触れるか、薬草を供えるか、立ち去れる。') },
  { kind: 'obelisk', names: text('속삭이는 비석', 'Whispering Obelisk', '囁く石碑'), descriptions: text('희미한 속삭임이 답을 기다린다. 손을 대거나 약초를 바칠 수 있다.', 'A faint whisper waits for an answer. Touch the stone, offer an herb, or walk away.', 'かすかな囁きが答えを待つ。触れるか、薬草を供えるか、立ち去れる。') },
] as const;

const sideNames = text('먼지 쌓인 곁방', 'Dusty Side Chamber', '埃の脇室');
export const FANTASY_DUNGEON_GENERATED_NAMES: readonly DungeonText[] = [...specials.map(room => room.names), sideNames];

export function generateFantasyDungeon(template: FantasyDungeonSite, seed: number): FantasyDungeonSite {
  let state = seed >>> 0;
  const random = () => { state = (state + 0x6d2b79f5) >>> 0; let t = Math.imul(state ^ state >>> 15, state | 1); t ^= t + Math.imul(t ^ t >>> 7, t | 61); return ((t ^ t >>> 14) >>> 0) / 4294967296; };
  const site = structuredClone(template), total = 8 + Math.floor(random() * 11);
  const connect = (a: FantasyDungeonRoom, b: FantasyDungeonRoom) => { if (!a.exits.includes(b.id)) a.exits.push(b.id); if (!b.exits.includes(a.id)) b.exits.push(a.id); };
  for (let i = 0; site.rooms.length < total; i++) {
    const special = specials[i % specials.length];
    const room: FantasyDungeonRoom = i < 3 ? { id: `chamber-${i + 1}`, names: { ...special.names }, descriptions: { ...special.descriptions }, x: 0, y: 0, exits: [], special: special.kind }
      : { id: `chamber-${i + 1}`, names: { ...sideNames }, descriptions: text('갈라진 벽과 먼지 속에 지나간 이들의 흔적이 남아 있다.', 'Cracked walls and dust preserve traces of past explorers.', '割れた壁と埃の中に、かつての探索者の痕跡が残る。'), x: 0, y: 0, exits: [], ...(i % 2 === 1 ? { trap: { detect: 12 + Math.floor(random() * 5), disarm: 12 + Math.floor(random() * 6), damage: 5 + Math.floor(random() * 7), effect: 'weakness' as const } } : { reward: { gold: 3 + Math.floor(random() * 9) } }) };
    const candidates = site.rooms.filter(candidate => !candidate.enemy?.boss);
    connect(room, candidates[Math.floor(random() * candidates.length)]);
    site.rooms.push(room);
  }
  const cells = Array.from({ length: 25 }, (_, i) => ({ x: i % 5, y: Math.floor(i / 5) }));
  for (let i = cells.length - 1; i > 0; i--) { const j = Math.floor(random() * (i + 1)); [cells[i], cells[j]] = [cells[j], cells[i]]; }
  site.rooms.forEach((room, i) => { room.x = cells[i].x; room.y = cells[i].y; });
  return site;
}
