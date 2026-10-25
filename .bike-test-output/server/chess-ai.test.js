import { test } from 'node:test';
import assert from 'node:assert/strict';
import { setTimeout as delay } from 'node:timers/promises';
import { chessBoard, chessView, newChess, playChess, squareIndex } from '../shared/chess.js';
import { applyItemAction, createItem } from '../shared/items.js';
import { applyChessAiReply, chooseChessAiMove, scheduleChessAiReply } from './chess-ai.js';
function board() {
    return createItem('chessAi', { id: 'ai', x: 0, z: 0, ry: 0, createdBy: 'alice' }, Math.random);
}
function whiteMove(item) {
    assert.equal(applyItemAction(item, { a: 'chessMove', from: 52, to: 36, revision: item.chess.revision }, 'bob', Math.random), true);
}
function position(fen) {
    return { ...newChess(), fen, positions: [fen.split(' ').slice(0, 4).join(' ')] };
}
test('AI item allows anyone to play white, protects black, and returns a legal reply', async () => {
    const item = board();
    whiteMove(item);
    const expected = item.chess;
    assert.equal(applyItemAction(item, { a: 'chessMove', from: 12, to: 28, revision: 1 }, 'alice', Math.random), false);
    const move = await chooseChessAiMove(expected);
    assert.ok(move);
    assert.ok(playChess(expected, squareIndex(move.from), squareIndex(move.to), expected.revision));
    assert.equal(applyChessAiReply(item, expected, move), true);
    assert.equal(item.chess.moves.length, 2);
    assert.equal(chessView(item.chess).turn, 'w');
    assert.equal(applyChessAiReply(item, expected, move), false);
});
test('AI finds mate in one instead of choosing an arbitrary move', async () => {
    const item = board();
    for (const [from, to] of [['f2', 'f3'], ['e7', 'e5'], ['g2', 'g4']]) {
        item.chess = playChess(item.chess, squareIndex(from), squareIndex(to), item.chess.revision);
    }
    const expected = item.chess;
    const move = await chooseChessAiMove(expected, 500);
    assert.ok(move);
    assert.equal(move.san, 'Qh4#');
    assert.equal(applyChessAiReply(item, expected, move), true);
    assert.match(chessView(item.chess).status, /黒の勝ち/);
    assert.equal(await chooseChessAiMove(item.chess), null);
});
test('AI can promote and stops at drawn or human-turn positions', async () => {
    const item = board();
    item.chess = position('7k/8/8/8/8/8/p7/7K b - - 0 1');
    const expected = item.chess;
    const move = await chooseChessAiMove(expected, 500);
    assert.ok(move?.promotion);
    assert.equal(applyChessAiReply(item, expected, move), true);
    assert.equal(chessBoard(item.chess)[56], `b${move.promotion.toUpperCase()}`);
    assert.equal(await chooseChessAiMove(newChess()), null);
    assert.equal(await chooseChessAiMove(position('7k/8/8/8/8/8/8/7K b - - 0 1')), null);
});
test('scheduled AI publishes once, even when scheduled twice for the same position', async () => {
    const item = board();
    whiteMove(item);
    let published = 0;
    scheduleChessAiReply(item, () => item, () => published++, 1);
    scheduleChessAiReply(item, () => item, () => published++, 1);
    await delay(200);
    assert.equal(published, 1);
    assert.equal(item.chess.moves.length, 2);
});
test('reset and removal invalidate pending AI replies', async () => {
    for (const action of ['reset', 'remove']) {
        const item = board();
        whiteMove(item);
        let current = item;
        let published = 0;
        scheduleChessAiReply(item, () => current, () => published++, 1);
        if (action === 'reset')
            applyItemAction(item, { a: 'chessReset' }, 'bob', Math.random);
        else
            current = undefined;
        const before = structuredClone(item);
        await delay(30);
        assert.equal(published, 0);
        assert.deepEqual(item, before);
    }
});
