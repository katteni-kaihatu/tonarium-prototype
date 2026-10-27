import type { FantasyCharacter } from './fantasy.ts';
import { fantasyBuildings } from './fantasy-town.ts';
import { recordFantasyPriestPrayer } from './fantasy-priest-growth.ts';

type Locale = 'ko' | 'en' | 'ja';
export const FANTASY_PRAYER_HOURS = .5;
export const FANTASY_PRAYER_PRIEST_XP = 3;
export const FANTASY_PRAYER_NOTORIETY_REDUCTION = 2;
export type FantasyPrayerReason = 'no-temple' | 'already-prayed' | 'unwell';
export interface FantasyPrayerStatus {
  day: number; used: boolean; canPray: boolean; priestXp: number; notorietyReduction: number; hours: number; reason?: FantasyPrayerReason;
}
const REASONS: Record<FantasyPrayerReason, Record<Locale, string>> = {
  'no-temple': { ko: '기도할 수 있는 신전에 방문해야 합니다.', en: 'Visit a temple to pray.', ja: '祈りを捧げられる神殿を訪ねてください。' },
  'already-prayed': { ko: '오늘은 이미 기도했습니다. 다음 날 다시 기도할 수 있습니다.', en: 'You have already prayed today. Return on the next world day.', ja: '今日はすでに祈りました。次の日に再び祈れます。' },
  unwell: { ko: '지금은 기도할 수 있는 상태가 아닙니다.', en: 'You are not in a condition to pray now.', ja: '今は祈りを捧げられる状態ではありません。' },
};

export function fantasyPrayerStatus(character: FantasyCharacter, atHour = character.hour): FantasyPrayerStatus {
  const day = Math.floor(Math.max(0, atHour) / 24);
  const used = character.lastPrayerDay === day;
  const reason: FantasyPrayerReason | undefined = character.hp <= 0 ? 'unwell'
    : !fantasyBuildings(character).some(building => building.id === 'temple') ? 'no-temple'
      : used ? 'already-prayed' : undefined;
  return { day, used, canPray: !reason, priestXp: character.job === 'priest' ? Math.max(0, Math.min(FANTASY_PRAYER_PRIEST_XP, 1_000_000 - (character.jobXp.priest ?? 0))) : 0,
    notorietyReduction: Math.min(FANTASY_PRAYER_NOTORIETY_REDUCTION, Math.max(0, character.notoriety ?? 0)), hours: FANTASY_PRAYER_HOURS, ...(reason ? { reason } : {}) };
}

export function fantasyPrayerDisabledReason(character: FantasyCharacter, locale: Locale = 'ja', atHour = character.hour): string | undefined {
  const { reason } = fantasyPrayerStatus(character, atHour);
  return reason ? REASONS[reason][locale] : undefined;
}
export function fantasyPrayerError(character: FantasyCharacter, atHour = character.hour): string | undefined {
  return fantasyPrayerDisabledReason(character, 'ja', atHour);
}

export function applyFantasyPrayer(character: FantasyCharacter): { priestXp: number; notorietyReduction: number; day: number; error?: string } {
  const status = fantasyPrayerStatus(character);
  const error = fantasyPrayerError(character);
  if (error) return { priestXp: 0, notorietyReduction: 0, day: status.day, error };
  character.lastPrayerDay = status.day;
  recordFantasyPriestPrayer(character, status.day);
  if (status.priestXp) character.jobXp.priest = (character.jobXp.priest ?? 0) + status.priestXp;
  if (status.notorietyReduction) character.notoriety = Math.max(0, (character.notoriety ?? 0) - status.notorietyReduction);
  return { priestXp: status.priestXp, notorietyReduction: status.notorietyReduction, day: status.day };
}

export function validFantasyPrayer(character: FantasyCharacter): boolean {
  return (character.notoriety === undefined || Number.isSafeInteger(character.notoriety) && character.notoriety >= 0 && character.notoriety <= 100)
    && (character.lastPrayerDay === undefined || Number.isSafeInteger(character.lastPrayerDay) && character.lastPrayerDay >= 0 && character.lastPrayerDay <= Math.floor(character.hour / 24));
}
