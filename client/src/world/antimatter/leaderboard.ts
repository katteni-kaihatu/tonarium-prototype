import type { LeaderboardEntry } from './types.ts';
import { compareAdRanking } from '../../../../shared/ad-ranking.ts';

export interface LeaderboardGroup {
  rank: number;
  representative: LeaderboardEntry;
  records: LeaderboardEntry[];
  hasSelfInRecords: boolean;
}

export function groupLeaderboard(entries: readonly LeaderboardEntry[]): LeaderboardGroup[] {
  const groups = new Map<string, { representativeIndex: number; indices: number[] }>();
  entries.forEach((entry, index) => {
    const group = groups.get(entry.name);
    if (!group) groups.set(entry.name, { representativeIndex: index, indices: [index] });
    else {
      group.indices.push(index);
      if (compareAdRanking(entry, entries[group.representativeIndex]) < 0) group.representativeIndex = index;
    }
  });
  return [...groups.values()]
    .sort((a, b) => compareAdRanking(entries[a.representativeIndex], entries[b.representativeIndex]) || a.representativeIndex - b.representativeIndex)
    .map((group, index) => {
      const records = group.indices.filter(i => i !== group.representativeIndex).map(i => entries[i]);
      return { rank: index + 1, representative: entries[group.representativeIndex], records, hasSelfInRecords: records.some(e => e.self === true) };
    });
}
