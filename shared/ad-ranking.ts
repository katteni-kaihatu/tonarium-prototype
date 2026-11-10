export interface AdRankingScore {
  infinities: number;
  galaxies?: number;
  dimensionalBoosts?: number;
  antimatterLog10: number;
}

export function compareAdRanking(a: AdRankingScore, b: AdRankingScore): number {
  return b.infinities - a.infinities
    || (b.galaxies ?? 0) - (a.galaxies ?? 0)
    || (b.dimensionalBoosts ?? 0) - (a.dimensionalBoosts ?? 0)
    || b.antimatterLog10 - a.antimatterLog10;
}
