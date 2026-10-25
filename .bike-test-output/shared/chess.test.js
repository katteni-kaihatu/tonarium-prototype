import { test } from '../assertion-runner.js';
import assert from 'node:assert/strict';
import { chessBoard, chessLegalMoves, chessView, newChess, playChess, squareIndex } from './chess.js';
import { applyItemAction, createItem } from './items.js';
function move(state, from, to, promotion) {
    const next = playChess(state, squareIndex(from), squareIndex(to), state.revision, promotion);
    assert.ok(next, `${from}-${to} must be legal`);
    return next;
}
const position = (fen) => ({ ...newChess(), fen, positions: [fen.split(' ').slice(0, 4).join(' ')] });
test('initial position has 20 moves; turn, blocked paths, and stale requests are enforced', () => {
    let state = newChess();
    assert.equal(chessView(state).game.moves().length, 20);
    assert.equal(playChess(state, 0, 16, 0), null);
    assert.equal(playChess(state, 56, 40, 0), null);
    assert.equal(playChess(state, 52.5, 36, 0), null);
    assert.equal(playChess(state, 52, NaN, 0), null);
    state = move(state, 'e2', 'e4');
    assert.equal(chessView(state).turn, 'b');
    assert.equal(playChess(state, 51, 35, state.revision), null);
    assert.equal(playChess(state, 12, 28, 0), null);
});
test('castling moves both king and rook; attacked transit squares forbid castling', () => {
    const state = position('r3k2r/8/8/8/8/8/8/R3K2R w KQkq - 0 1');
    const board = chessBoard(move(state, 'e1', 'g1'));
    assert.equal(board[squareIndex('g1')], 'wK');
    assert.equal(board[squareIndex('f1')], 'wR');
    assert.equal(board[squareIndex('h1')], null);
    const attacked = position('r3kr1r/8/8/8/8/8/8/R3K2R w KQ - 0 1');
    assert.equal(playChess(attacked, 60, 62, 0), null);
    const returned = ['h1-h2', 'h8-h7', 'h2-h1', 'h7-h8'].reduce((s, step) => move(s, ...step.split('-')), state);
    assert.equal(playChess(returned, 60, 62, returned.revision), null);
});
test('en passant removes the pawn and expires after one reply', () => {
    let state = newChess();
    for (const step of ['e2-e4', 'a7-a6', 'e4-e5', 'd7-d5'])
        state = move(state, ...step.split('-'));
    const board = chessBoard(move(state, 'e5', 'd6'));
    assert.equal(board[squareIndex('d5')], null);
    assert.equal(board[squareIndex('d6')], 'wP');
    state = move(move(state, 'h2', 'h3'), 'a6', 'a5');
    assert.equal(playChess(state, squareIndex('e5'), squareIndex('d6'), state.revision), null);
});
test('promotion requires an explicit valid choice and supports underpromotion', () => {
    const state = position('7k/P7/8/8/8/8/8/7K w - - 0 1');
    assert.equal(playChess(state, 8, 0, 0), null);
    for (const choice of ['q', 'r', 'b', 'n']) {
        assert.equal(chessBoard(move(state, 'a7', 'a8', choice))[0], `w${choice.toUpperCase()}`);
    }
});
test('pinned pieces cannot expose their king; checkmate ends play', () => {
    const pinned = position('4r2k/8/8/8/8/8/4R3/4K3 w - - 0 1');
    assert.equal(playChess(pinned, squareIndex('e2'), squareIndex('d2'), 0), null);
    let state = newChess();
    for (const step of ['f2-f3', 'e7-e5', 'g2-g4', 'd8-h4'])
        state = move(state, ...step.split('-'));
    assert.match(chessView(state).status, /黒の勝ち/);
    assert.equal(chessView(state).over, true);
    assert.deepEqual(chessLegalMoves(state, squareIndex('e1')), []);
});
test('stalemate, insufficient material, fifty moves, and threefold repetition end play', () => {
    assert.match(chessView(position('7k/5Q2/6K1/8/8/8/8/8 b - - 0 1')).status, /ステイルメイト/);
    assert.match(chessView(position('7k/8/8/8/8/8/8/7K w - - 0 1')).status, /戦力不足/);
    assert.match(chessView(position('7k/8/8/8/8/8/R7/7K w - - 100 51')).status, /50手/);
    let state = newChess();
    for (let n = 0; n < 2; n++) {
        for (const step of ['g1-f3', 'g8-f6', 'f3-g1', 'f6-g8'])
            state = move(state, ...step.split('-'));
    }
    assert.match(chessView(state).status, /同一局面3回/);
});
test('server action accepts either user, rejects illegal moves without mutations, and resets the whole game', () => {
    const item = createItem('chess', { id: 'test', x: 0, z: 0, ry: 0, createdBy: 'alice' }, Math.random);
    assert.ok(item?.kind === 'chess');
    const before = structuredClone(item);
    assert.equal(applyItemAction(item, { a: 'chessMove', from: 0, to: 16, revision: 0 }, 'bob', Math.random), false);
    assert.deepEqual(item, before);
    assert.equal(applyItemAction(item, { a: 'chessMove', from: 52, to: 36, revision: 0 }, 'bob', Math.random), true);
    assert.equal(applyItemAction(item, { a: 'chessMove', from: 12, to: 28, revision: 1 }, 'carol', Math.random), true);
    assert.equal(item.updatedBy, 'carol');
    assert.equal(applyItemAction(item, { a: 'chessReset' }, 'alice', Math.random), true);
    assert.deepEqual(item.board, before.board);
    assert.equal(item.last, null);
    assert.deepEqual(item.chess.moves, []);
    assert.equal(playChess(item.chess, 52, 36, 0), null);
});
