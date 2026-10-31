import type { FantasyProfile } from './fantasy.ts';
import type { NpcLocale } from './npc.ts';

export type FantasyInnRoom = 'common' | 'private' | 'suite';
export interface FantasyInnRoomAvailability { room: FantasyInnRoom; capacity: number; available: number }
const capacities: Record<FantasyInnRoom, number> = { common: 8, private: 4, suite: 2 };

/** 世界全体の宿泊予約を数える。終わった部屋は同期を待たずに空く。 */
export function fantasyInnAvailability(profiles: Iterable<FantasyProfile>, location: string, hour: number): FantasyInnRoomAvailability[] {
  const occupied = { common: 0, private: 0, suite: 0 };
  for (const profile of profiles) {
    const activity = profile.activity;
    if (!profile.death && profile.character?.location === location && activity?.action.type === 'lodge' && activity.endsAt > hour && activity.startedAt <= hour) occupied[activity.action.room]++;
  }
  return (Object.keys(capacities) as FantasyInnRoom[]).map(room => ({ room, capacity: capacities[room], available: Math.max(0, capacities[room] - occupied[room]) }));
}

export function fantasyInnErrorText(source: string, locale: NpcLocale): string | undefined {
  return source === 'inn:full' ? { ko: '선택한 객실은 모두 사용 중입니다. 다른 객실을 골라 주세요.', en: 'That room type is fully occupied. Please choose another.', ja: 'その客室は満室です。別の客室を選んでください。' }[locale] : undefined;
}
