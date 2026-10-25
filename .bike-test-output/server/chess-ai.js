import { Chess } from 'chess.js';
import { chessBoard, chessView, playChess, squareIndex } from '../shared/chess.js';
const VALUE = { p: 100, n: 320, b: 330, r: 500, q: 900, k: 0 };
const MATE = 100_000;
/** Positive scores favor the side to move. Encourage development and central control. */
function evaluate(game) {
    let score = 0;
    for (const [row, rank] of game.board().entries()) {
        for (const [col, piece] of rank.entries()) {
            if (!piece)
                continue;
            const center = 7 - Math.abs(col - 3.5) - Math.abs(row - 3.5);
            const development = piece.type === 'p' ? (piece.color === 'w' ? 6 - row : row - 1) * 8
                : piece.type === 'n' || piece.type === 'b' ? center * 12 : 0;
            score += (piece.color === game.turn() ? 1 : -1) * (VALUE[piece.type] + development);
        }
    }
    return score;
}
function ordered(moves) {
    const priority = (m) => (m.san.endsWith('#') ? MATE : 0)
        + (m.captured ? VALUE[m.captured] * 10 - VALUE[m.piece] : 0)
        + (m.promotion ? VALUE[m.promotion] : 0);
    return moves.sort((a, b) => priority(b) - priority(a));
}
const SLICE_MS = 4;
/** Iterative-deepening negamax. A short deadline bounds work per shared board.
 * 探索を丸ごと同期で回すと最大で予算分だけイベントループを止めるため、
 * ノードごとに時刻を見て、連続計算が数msを超えたら setImmediate へ譲る（盤面はこの呼び出し専用の Chess で共有されない）。 */
export async function chooseChessAiMove(state, budgetMs = 60) {
    const view = chessView(state);
    if (view.over || view.turn !== 'b')
        return null;
    const game = new Chess(state.fen);
    const candidates = ordered(game.moves({ verbose: true }));
    let best = candidates[0] ?? null;
    const deadline = performance.now() + budgetMs;
    let timedOut = false;
    let sliceStart = performance.now();
    const checkpoint = async () => {
        const now = performance.now();
        if (now >= deadline) {
            timedOut = true;
            return true;
        }
        if (now - sliceStart < SLICE_MS)
            return timedOut;
        await new Promise((resolve) => setImmediate(resolve));
        sliceStart = performance.now();
        if (sliceStart >= deadline)
            timedOut = true;
        return timedOut;
    };
    const search = async (depth, alpha, beta, ply) => {
        if (await checkpoint())
            return 0;
        if (game.isCheckmate())
            return -MATE + ply;
        if (game.isDraw())
            return 0;
        if (depth === 0)
            return evaluate(game);
        let score = -Infinity;
        for (const move of ordered(game.moves({ verbose: true }))) {
            game.move(move);
            const value = -await search(depth - 1, -beta, -alpha, ply + 1);
            game.undo();
            if (timedOut)
                return 0;
            score = Math.max(score, value);
            alpha = Math.max(alpha, value);
            if (alpha >= beta)
                break;
        }
        return score;
    };
    for (let depth = 1; depth <= 3; depth++) {
        let iterationBest = best;
        let alpha = -Infinity;
        for (const move of candidates) {
            game.move(move);
            const score = -await search(depth - 1, -Infinity, -alpha, 1);
            game.undo();
            if (timedOut)
                break;
            if (score > alpha) {
                alpha = score;
                iterationBest = move;
            }
        }
        if (timedOut)
            break;
        best = iterationBest;
        if (alpha >= MATE - 10)
            break;
    }
    return best;
}
/** Never apply an old reply after reset, removal, or a replacement position. */
export function applyChessAiReply(item, expected, move) {
    if (item.kind !== 'chessAi' || item.chess !== expected || chessView(item.chess).turn !== 'b')
        return false;
    const next = playChess(item.chess, squareIndex(move.from), squareIndex(move.to), expected.revision, move.promotion);
    if (!next)
        return false;
    item.chess = next;
    item.board = chessBoard(next);
    item.last = [squareIndex(move.from), squareIndex(move.to)];
    return true;
}
export function scheduleChessAiReply(item, current, publish, delayMs = 350) {
    if (item.kind !== 'chessAi' || chessView(item.chess).turn !== 'b' || chessView(item.chess).over)
        return;
    const expected = item.chess;
    return setTimeout(() => {
        if (current() !== item || item.chess !== expected)
            return;
        // 探索は非同期に譲りながら進む。適用直前に applyChessAiReply が局面の世代を再検証する
        void chooseChessAiMove(expected).then((move) => {
            if (move && applyChessAiReply(item, expected, move))
                publish();
        }, (e) => console.error('chess ai failed', e));
    }, delayMs);
}
