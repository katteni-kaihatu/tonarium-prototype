export interface FantasyRollView {
  label: string; sides: number; dice: number[]; kept: number; rule: 'highest' | 'lowest' | 'single';
  modifier: number; total: number; dc: number; success: boolean;
}
export function parseFantasyRoll(text: string): FantasyRollView | undefined {
  const single = text.match(/^(.*?)：d(\d+)=(\d+)、補正([+-][\d.]+)、合計(-?[\d.]+) \/ DC([\d.]+) → (成功|失敗)$/);
  if (single) return { label: single[1], sides: +single[2], dice: [+single[3]], kept: +single[3], rule: 'single', modifier: +single[4], total: +single[5], dc: +single[6], success: single[7] === '成功' };
  const pool = text.match(/^(.*?)：(\d+)d(\d+)=\[([\d,\s]+)\]、採用(\d+)（(最高|最低|通常)）、補正([+-][\d.]+)、合計(-?[\d.]+) \/ DC([\d.]+) → (成功|失敗)$/);
  if (!pool) return undefined;
  const dice = pool[4].split(',').map(Number);
  const sides = +pool[3], kept = +pool[5];
  if (dice.length !== +pool[2] || dice.length > 4 || dice.some(value => !Number.isInteger(value) || value < 1 || value > sides) || !dice.includes(kept)) return undefined;
  return { label: pool[1], sides, dice, kept, rule: pool[6] === '最高' ? 'highest' : pool[6] === '最低' ? 'lowest' : 'single', modifier: +pool[7], total: +pool[8], dc: +pool[9], success: pool[10] === '成功' };
}
