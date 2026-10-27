import type { NpcLocale } from './npc.ts';

export type FantasyCommunityProjectId = 'supplies' | 'repairs' | 'research' | 'care';
export interface FantasyCommunityProject {
  id: FantasyCommunityProjectId;
  names: Record<NpcLocale, string>;
  contributions: number;
  target: number;
  completions: number;
}
export interface FantasyCommunityNotice {
  id: number; hour: number; npcIds: string[]; text: Record<NpcLocale, string>;
}
export interface FantasyCommunityState {
  revision: number;
  location: string;
  projects: FantasyCommunityProject[];
  notices: FantasyCommunityNotice[];
  nextContributionAt: number;
  canContribute: boolean;
}
export interface FantasyCommunityRequest { requestId: string; revision: number; npcId: string }
export type FantasyCommunityError = 'invalid' | 'stale' | 'busy' | 'cooldown' | 'duplicate' | 'unavailable';
export const FANTASY_COMMUNITY_PROJECTS: Record<FantasyCommunityProjectId, Record<NpcLocale, string>> = {
  supplies: { ko: '공동 생활 준비', en: 'Shared provisions', ja: '共同の暮らしの準備' },
  repairs: { ko: '시설 점검 준비', en: 'Maintenance preparations', ja: '設備点検の準備' },
  research: { ko: '공동 기록 정리', en: 'Shared records', ja: '共同の記録整理' },
  care: { ko: '주민 돌봄 준비', en: 'Community care', ja: '住人を支える準備' },
};
