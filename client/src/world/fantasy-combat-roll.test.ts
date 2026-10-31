import test from 'node:test';
import assert from 'node:assert/strict';
import { fantasyCombatRollUpdate } from './fantasy-combat-roll.ts';
const log = (id: number, rolled = true) => ({ id, round: 1, text: { ko: '판정', en: 'Check', ja: '判定' }, ...(rolled ? { roll: { sides: 20 as const, value: 12, target: 10, success: true } } : {}) });
test('battle dice ignore history and repeated snapshots, choose newest fresh roll and reset per battle', () => {
  const initial = fantasyCombatRollUpdate(undefined, { id: 'a', logs: [log(1)] }); assert.equal(initial.result, undefined);
  assert.equal(fantasyCombatRollUpdate(initial.cursor, { id: 'a', logs: [log(1)] }).result, undefined);
  const next = fantasyCombatRollUpdate(initial.cursor, { id: 'a', logs: [log(1), log(2), log(3), log(4, false)] });
  assert.equal(next.result?.id, 3); assert.equal(next.cursor.id, 4);
  assert.equal(fantasyCombatRollUpdate(next.cursor, { id: 'b', logs: [log(1)] }).result, undefined);
});
