import type { FantasyCharacter } from './fantasy.ts';
import type { NpcLocale } from './npc.ts';
import { fantasyVoyageEnding, fantasyVoyageFinishError } from './fantasy-voyage-ending.ts';
import { fantasyKnownLocations } from './fantasy-town.ts';
import { fantasyTermName } from './fantasy-lore.ts';
import { FANTASY_FINAL_ISLE_ID } from './fantasy-isle-access.ts';

export function fantasyVoyageGuidance(c: FantasyCharacter, locale: NpcLocale): string {
  const ending = fantasyVoyageEnding(c, locale);
  if (ending) return `${ending.title}\n${ending.paragraphs.join('\n')}`;
  const known = fantasyKnownLocations(c).includes(FANTASY_FINAL_ISLE_ID);
  return { ko: known ? `${fantasyTermName(FANTASY_FINAL_ISLE_ID, locale)}의 항로는 완성되었습니다. 섬에 직접 도착해 항해 일지의 마지막 장을 남기세요.` : '네 대륙의 항해 단서를 모아 안개 너머 섬으로 향하는 이야기입니다. 확인한 단서와 다음 의뢰는 받은 의뢰에서 볼 수 있습니다.', en: known ? `The route to ${fantasyTermName(FANTASY_FINAL_ISLE_ID, locale)} is complete. Reach the island and finish your voyage journal there.` : 'Follow navigation clues across four continents toward an island beyond the mist. Your accepted quests show verified clues and the next task.', ja: known ? `${fantasyTermName(FANTASY_FINAL_ISLE_ID, locale)}への航路は完成しました。島へ辿り着き、航海日誌の最後の頁を残してください。` : '四大陸の航海の手掛かりを集め、霧の向こうの島を目指す物語です。確かめた手掛かりと次の依頼は受注した依頼で確認できます。' }[locale];
}

export const fantasyCanRecordVoyage = (c: FantasyCharacter) => !fantasyVoyageFinishError(c);
