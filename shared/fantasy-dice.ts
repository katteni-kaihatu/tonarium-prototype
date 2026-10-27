export type FantasyFacePattern = 'steady' | 'even' | 'upper' | 'odd' | 'lower';
export const FANTASY_DICE_FACES: Record<FantasyFacePattern, readonly number[]> = {
  steady: [2, 2, 3, 4, 5, 6], even: [2, 2, 4, 4, 6, 6], upper: [4, 4, 5, 5, 6, 6],
  odd: [1, 1, 3, 3, 5, 5], lower: [1, 1, 2, 2, 3, 3],
};

/** 一回の抽選で選ばれた面を置換する。六面以外は六区間への比例対応で、再抽選は行わない。 */
export function fantasyDieFace(raw: number, sides: number, pattern?: FantasyFacePattern, penalty = 0): number {
  const face = Math.max(1, Math.min(sides, Math.floor(raw)));
  const mapped = pattern && Object.hasOwn(FANTASY_DICE_FACES, pattern)
    ? Math.ceil(FANTASY_DICE_FACES[pattern][Math.min(5, Math.floor((face - 1) * 6 / sides))] * sides / 6) : face;
  return Math.max(1, Math.min(sides, mapped - Math.max(0, Math.floor(penalty))));
}
