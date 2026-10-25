import { Chess } from 'chess.js';
const positionKey = (fen) => fen.split(' ').slice(0, 4).join(' ');
export const squareName = (i) => `${'abcdefgh'[i % 8]}${8 - Math.floor(i / 8)}`;
export const squareIndex = (s) => (8 - Number(s[1])) * 8 + 'abcdefgh'.indexOf(s[0]);
export function newChess(revision = 0) {
    const fen = new Chess().fen();
    return { fen, moves: [], positions: [positionKey(fen)], revision };
}
export function chessBoard(state) {
    return new Chess(state.fen).board().flat().map(p => p ? p.color + p.type.toUpperCase() : null);
}
export function chessView(state) {
    const game = new Chess(state.fen);
    const turn = game.turn();
    const color = turn === 'w' ? '白' : '黒';
    const check = game.isCheck();
    let result = '';
    if (game.isCheckmate())
        result = `${turn === 'w' ? '黒' : '白'}の勝ち · チェックメイト`;
    else if (game.isStalemate())
        result = '引き分け · ステイルメイト';
    else if (game.isInsufficientMaterial())
        result = '引き分け · 戦力不足';
    else if (game.isDrawByFiftyMoves())
        result = '引き分け · 50手ルール';
    else if (state.positions.filter(p => p === positionKey(state.fen)).length >= 3)
        result = '引き分け · 同一局面3回';
    return { turn, check, over: !!result, status: result || `${color}の手番${check ? ' · チェック！' : ''}`, game };
}
export function chessLegalMoves(state, from) {
    if (!Number.isInteger(from) || from < 0 || from > 63)
        return [];
    const view = chessView(state);
    return view.over ? [] : view.game.moves({ square: squareName(from), verbose: true });
}
/** Called by the server; revision also rejects moves made before a reset or another user's move. */
export function playChess(state, from, to, revision, promotion) {
    if (revision !== state.revision || !Number.isInteger(to) || to < 0 || to > 63)
        return null;
    const legal = chessLegalMoves(state, from).find(m => squareIndex(m.to) === to && m.promotion === promotion);
    if (!legal)
        return null;
    const game = new Chess(state.fen);
    const move = game.move({ from: legal.from, to: legal.to, promotion });
    const fen = game.fen();
    return { fen, moves: [...state.moves, move.san], positions: [...state.positions, positionKey(fen)], revision: state.revision + 1 };
}
