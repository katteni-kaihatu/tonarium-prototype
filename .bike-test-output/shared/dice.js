export const DICE_SIDES = [4, 6, 8, 10, 12, 20, 100];
export const DICE_MAX = 10;
/** 転がっている演出の長さ。結果はこの後にチャットへ出す */
export const ROLL_MS = 1800;
/** 面数ごとの色。3D の駒と 2D のタイルで共用 */
export const DICE_COLORS = {
    4: { bg: '#e0604c', ink: '#fff' }, 6: { bg: '#f3efe6', ink: '#3a2a1e' }, 8: { bg: '#4b7fd9', ink: '#fff' }, 10: { bg: '#3f9f66', ink: '#fff' },
    12: { bg: '#8f5cc9', ink: '#fff' }, 20: { bg: '#e2ad35', ink: '#3a2a1e' }, 100: { bg: '#33404f', ink: '#fff' },
};
export const isDieSides = (v) => DICE_SIDES.includes(v);
export const diceLabel = (sides, count) => `${count}d${sides}`;
export function diceSummary(r) {
    if (!r.results)
        return `${diceLabel(r.sides, r.count)} → ？`;
    const total = r.results.reduce((a, b) => a + b, 0);
    return r.results.length > 1 ? `${diceLabel(r.sides, r.count)} → ${r.results.join(' + ')} = ${total}` : `${diceLabel(r.sides, r.count)} → ${total}`;
}
/** 演出用の乱数。振った回の id から作るので、全員が同じ転がり方を見る */
export function seededRng(seed) {
    let h = 2166136261;
    for (let i = 0; i < seed.length; i++)
        h = Math.imul(h ^ seed.charCodeAt(i), 16777619);
    return () => {
        h = (h + 0x6d2b79f5) | 0;
        let t = Math.imul(h ^ (h >>> 15), 1 | h);
        t = (t + Math.imul(t ^ (t >>> 7), 61 | t)) ^ t;
        return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
    };
}
