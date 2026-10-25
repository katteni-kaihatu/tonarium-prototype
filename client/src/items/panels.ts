import { sourceText as uiSource } from '../i18n/core.ts';
import { localized, t as tr, systemText, msg } from '../i18n/core.ts';
import { drawCanvasPanel, drawStrokes, PEN_COLORS, AREA, SIZE_BTNS, ERASER, SAVE, CLEAR, colorRect } from './canvasDrawing.ts';
import { chessView, chessLegalMoves, squareIndex, type Promotion } from '../../../shared/chess.ts';
// 3D の互換モードでも同じ描画・クリック処理を使うため、DOM ではなく Canvas に描く
import { CANVAS_H, CANVAS_W, isChessItem, type Dir, type Item } from '../../../shared/items.ts';
import type { ItemUi } from '../store.ts';
import { deltaAction, itemAction, postImage, setItemUi } from './actions.ts';

type Ui = ItemUi;
type Rect = [number, number, number, number];

export interface Panel {
  w: number;
  h: number;
  draw(ctx: CanvasRenderingContext2D, item: Item, ui: Ui): void;
  click(x: number, y: number, item: Item, ui: Ui): void;
  /** 2D で拡大表示中のみ。処理したら true */
  key?(key: string, item: Item): boolean;
  /** あれば click の代わりに使う */
  drag?(phase: 'start' | 'move' | 'end', x: number, y: number, item: Item, ui: Ui): void;
}

const FONT = '"Segoe UI", "Hiragino Sans", "Noto Sans JP", sans-serif';
const inRect = (x: number, y: number, [rx, ry, rw, rh]: Rect) => x >= rx && x < rx + rw && y >= ry && y < ry + rh;

function button(ctx: CanvasRenderingContext2D, [x, y, w, h]: Rect, label: string, bg = '#4e5058', size = 18) {
  ctx.fillStyle = bg;
  ctx.beginPath();
  ctx.roundRect(x, y, w, h, 6);
  ctx.fill();
  ctx.fillStyle = '#fff';
  ctx.font = `600 ${size}px ${FONT}`;
  ctx.textAlign = 'center';
  ctx.textBaseline = 'middle';
  ctx.fillText(label, x + w / 2, y + h / 2 + 1);
}

const GLYPH: Record<string, string> = { K: '♚', Q: '♛', R: '♜', B: '♝', N: '♞', P: '♟' };
const SQ = 56;
const BX = 16;
const BY = 108;
const CHESS_RESET: Rect = [350, 10, 114, 34];
export const PROMOTIONS: [Promotion, string][] = localized([['q', uiSource('ui346')], ['r', uiSource('ui347')], ['b', uiSource('ui348')], ['n', uiSource('ui349')]]);

export const chessPanel: Panel = localized({
  w: 480,
  h: 688,
  draw(ctx, item, ui) {
    if (!isChessItem(item)) return;
    const view = chessView(item.chess);
    const active = ui.chessRevision === item.chess.revision;
    const sel = active ? ui.sel : undefined;
    const legal = sel === undefined ? [] : chessLegalMoves(item.chess, sel);
    ctx.fillStyle = '#2b2d31';
    ctx.fillRect(0, 0, this.w, this.h);
    ctx.fillStyle = '#f2f3f5';
    ctx.font = `700 22px ${FONT}`;
    ctx.textAlign = 'left';
    ctx.textBaseline = 'middle';
    ctx.fillText(item.kind === 'chessAi' ? tr('ui350') : tr('ui351'), 16, 28);
    button(ctx, CHESS_RESET, ui.resetConfirm ? tr('ui352') : tr('ui353'), '#4e5058', 15);
    ctx.fillStyle = view.check || view.over ? '#ffd27c' : '#f2f3f5';
    ctx.font = `700 20px ${FONT}`;
    ctx.textAlign = 'left';
    ctx.fillText(item.kind === 'chessAi' && view.turn === 'b' && !view.over ? tr('ui354') : systemText(view.status), 16, 65);
    ctx.font = `13px ${FONT}`;
    ctx.fillStyle = '#b5bac1';
    ctx.fillText(item.kind === 'chessAi' ? tr('ui355') : tr('ui356'), 16, 90);
    for (let i = 0; i < 64; i++) {
      const r = Math.floor(i / 8);
      const c = i % 8;
      const x = BX + c * SQ;
      const y = BY + r * SQ;
      const p = item.board[i];
      ctx.fillStyle = (r + c) % 2 ? '#b58863' : '#f0d9b5';
      if (item.last?.includes(i)) ctx.fillStyle = (r + c) % 2 ? '#aaa23a' : '#cdd26a';
      if (sel === i) ctx.fillStyle = '#608bb0';
      if (view.check && p === `${view.turn}K`) ctx.fillStyle = '#d96a59';
      ctx.fillRect(x, y, SQ, SQ);
      if (legal.some(m => squareIndex(m.to) === i)) {
        ctx.beginPath();
        ctx.arc(x + SQ / 2, y + SQ / 2, p ? SQ * 0.43 : 7, 0, Math.PI * 2);
        ctx.fillStyle = '#304d49aa';
        ctx.strokeStyle = '#304d49aa';
        ctx.lineWidth = 4;
        if (p) ctx.stroke(); else ctx.fill();
      }
      ctx.textAlign = 'left';
      ctx.font = `10px ${FONT}`;
      ctx.fillStyle = '#3b3026';
      if (c === 0) ctx.fillText(String(8 - r), x + 3, y + 9);
      if (r === 7) ctx.fillText('abcdefgh'[c], x + SQ - 9, y + SQ - 7);
      if (!p) continue;
      ctx.font = `${SQ * 0.82}px "Segoe UI Symbol", ${FONT}`;
      ctx.textAlign = 'center';
      ctx.textBaseline = 'middle';
      ctx.lineWidth = 2;
      ctx.strokeStyle = p[0] === 'w' ? '#222' : '#ddd';
      ctx.fillStyle = p[0] === 'w' ? '#fff' : '#111';
      ctx.strokeText(GLYPH[p[1]], x + SQ / 2, y + SQ / 2 + 3);
      ctx.fillText(GLYPH[p[1]], x + SQ / 2, y + SQ / 2 + 3);
    }
    ctx.textAlign = 'left';
    ctx.font = `14px ${FONT}`;
    ctx.fillStyle = '#dce0e5';
    const promoting = active && ui.promotionTo !== undefined;
    ctx.fillText(promoting ? tr('ui357') : active && ui.chessMessage ? systemText(ui.chessMessage) : view.over ? tr('ui358') : tr('ui359'), 16, 578);
    if (promoting) {
      PROMOTIONS.forEach(([, label], i) => button(ctx, [16 + i * 113, 596, 107, 32], label, '#476b8c', 14));
    } else {
      const pairs: string[] = [];
      for (let n = Math.max(0, Math.floor((item.chess.moves.length - 8) / 2) * 2); n < item.chess.moves.length; n += 2) {
        pairs.push(`${n / 2 + 1}. ${item.chess.moves[n]} ${item.chess.moves[n + 1] ?? ''}`);
      }
      ctx.fillStyle = '#b5bac1';
      ctx.fillText(pairs.slice(0, 2).join('    ') || tr('ui360'), 16, 609);
      ctx.fillText(pairs.slice(2).join('    '), 16, 634);
    }
    ctx.font = `12px ${FONT}`;
    ctx.fillStyle = '#9ba1aa';
    ctx.fillText(tr('ui361'), 16, 668);
  },
  click(x, y, item, ui) {
    if (!isChessItem(item)) return;
    if (inRect(x, y, CHESS_RESET)) { chessReset(item, ui); return; }
    if (ui.chessRevision === item.chess.revision && ui.promotionTo !== undefined) {
      const choice = PROMOTIONS.findIndex((_, i) => inRect(x, y, [16 + i * 113, 596, 107, 32]));
      if (choice >= 0) { chessPromote(item, ui, PROMOTIONS[choice][0]); return; }
    }
    const c = Math.floor((x - BX) / SQ);
    const r = Math.floor((y - BY) / SQ);
    if (c < 0 || c > 7 || r < 0 || r > 7) return;
    chessSelect(item, ui, r * 8 + c);
  },
});

export function chessReset(item: Item, ui: Ui) {
  if (!ui.resetConfirm) { setItemUi(item.id, { ...ui, resetConfirm: true }); return; }
  itemAction(item.id, { a: 'chessReset' });
  setItemUi(item.id, {});
}

export function chessPromote(item: Item, ui: Ui, promotion: Promotion) {
  if (!isChessItem(item) || ui.chessRevision !== item.chess.revision || ui.sel === undefined || ui.promotionTo === undefined) return;
  itemAction(item.id, { a: 'chessMove', from: ui.sel, to: ui.promotionTo, promotion, revision: item.chess.revision });
  setItemUi(item.id, {});
}

export function chessSelect(item: Item, ui: Ui, i: number) {
  if (!isChessItem(item)) return;
  const view = chessView(item.chess);
  if (view.over || (item.kind === 'chessAi' && view.turn === 'b')) return;
  const sel = ui.chessRevision === item.chess.revision ? ui.sel : undefined;
  const nextUi = { chessRevision: item.chess.revision };
  if (sel === i) { setItemUi(item.id, {}); return; }
  if (item.board[i]?.[0] === view.turn) {
    setItemUi(item.id, { ...nextUi, sel: i });
    return;
  }
  if (sel === undefined) {
    setItemUi(item.id, { ...nextUi, chessMessage: msg('ui362', msg(view.turn === 'w' ? 'ui363' : 'ui364')) });
    return;
  }
  const moves = chessLegalMoves(item.chess, sel).filter(m => squareIndex(m.to) === i);
  if (!moves.length) {
    setItemUi(item.id, { ...nextUi, sel, chessMessage: msg('ui365') });
    return;
  }
  if (moves.some(m => m.promotion)) {
    setItemUi(item.id, { ...nextUi, sel, promotionTo: i });
    return;
  }
  itemAction(item.id, { a: 'chessMove', from: sel, to: i, revision: item.chess.revision });
  setItemUi(item.id, {});
}

const TILE_BG: Record<number, string> = {
  0: '#3a3c42', 2: '#eee4da', 4: '#ede0c8', 8: '#f2b179', 16: '#f59563', 32: '#f67c5f', 64: '#f65e3b',
  128: '#edcf72', 256: '#edcc61', 512: '#edc850', 1024: '#edc53f', 2048: '#edc22e',
};
const G_RESET: Rect = [440 - 20 - 96, 18, 96, 36];
const GX = 20;
const GY = 80;
const CELL = 92;
const GAP = 8;
const BOARD = 4 * CELL + 5 * GAP;
const ARROWS: [Dir, string, Rect][] = [
  ['left', '←', [20, 500, 92, 72]],
  ['up', '↑', [122, 500, 92, 72]],
  ['down', '↓', [224, 500, 92, 72]],
  ['right', '→', [326, 500, 92, 72]],
];

export const panel2048: Panel = localized({
  w: 440,
  h: 590,
  draw(ctx, item) {
    if (item.kind !== 'g2048') return;
    ctx.fillStyle = '#2b2d31';
    ctx.fillRect(0, 0, this.w, this.h);
    ctx.fillStyle = '#f2f3f5';
    ctx.textAlign = 'left';
    ctx.textBaseline = 'middle';
    ctx.font = `800 30px ${FONT}`;
    ctx.fillText('2048', 20, 36);
    ctx.font = `600 18px ${FONT}`;
    ctx.fillStyle = '#b5bac1';
    ctx.fillText(tr('ui366', item.score), 110, 38);
    button(ctx, G_RESET, tr('ui367'));
    ctx.fillStyle = '#1e1f22';
    ctx.beginPath();
    ctx.roundRect(GX - GAP, GY - GAP, BOARD, BOARD, 8);
    ctx.fill();
    for (let i = 0; i < 16; i++) {
      const v = item.grid[i];
      const x = GX + (i % 4) * (CELL + GAP);
      const y = GY + Math.floor(i / 4) * (CELL + GAP);
      ctx.fillStyle = TILE_BG[v] ?? '#3c3a32';
      ctx.beginPath();
      ctx.roundRect(x, y, CELL, CELL, 6);
      ctx.fill();
      if (!v) continue;
      ctx.fillStyle = v <= 4 ? '#776e65' : '#f9f6f2';
      ctx.font = `800 ${v < 100 ? 40 : v < 1000 ? 34 : 28}px ${FONT}`;
      ctx.textAlign = 'center';
      ctx.fillText(String(v), x + CELL / 2, y + CELL / 2 + 2);
    }
    for (const [, label, r] of ARROWS) button(ctx, r, label, '#5865f2', 34);
    if (item.over) {
      ctx.fillStyle = '#000a';
      ctx.fillRect(GX - GAP, GY - GAP, BOARD, BOARD);
      ctx.fillStyle = '#fff';
      ctx.font = `800 36px ${FONT}`;
      ctx.textAlign = 'center';
      ctx.fillText(tr('ui368'), GX - GAP + BOARD / 2, GY - GAP + BOARD / 2);
    }
  },
  click(x, y, item) {
    if (item.kind !== 'g2048') return;
    if (inRect(x, y, G_RESET)) { itemAction(item.id, { a: 'reset2048' }); return; }
    for (const [dir, , r] of ARROWS) if (inRect(x, y, r)) itemAction(item.id, { a: 'slide', dir });
  },
  key(key, item) {
    const dir = ({ ArrowUp: 'up', ArrowDown: 'down', ArrowLeft: 'left', ArrowRight: 'right' } as Record<string, Dir>)[key];
    if (!dir) return false;
    itemAction(item.id, { a: 'slide', dir });
    return true;
  },
});
let active: null | { itemId: string; strokeId: string; buf: number[]; lastX: number; lastY: number; lastSend: number } = null;

function flush() {
  if (!active || !active.buf.length) return;
  deltaAction(active.itemId, { a: 'strokeAdd', id: active.strokeId, pts: active.buf });
  active.buf = [];
  active.lastSend = performance.now();
}

export const canvasPanel: Panel = {
  w: 640,
  h: 520,
  draw: drawCanvasPanel,
  click(x, y, item, ui) {
    this.drag!('start', x, y, item, ui);
    this.drag!('end', x, y, item, ui);
  },
  drag(phase, x, y, item, ui) {
    if (item.kind !== 'canvas') return;
    const [ax, ay] = AREA;
    const px = x - ax;
    const py = y - ay;
    if (phase === 'start') {
      for (let i = 0; i < PEN_COLORS.length; i++)
        if (inRect(x, y, colorRect(i))) { setItemUi(item.id, { ...ui, color: PEN_COLORS[i], erase: false }); return; }
      for (const [v, , r] of SIZE_BTNS) if (inRect(x, y, r)) { setItemUi(item.id, { ...ui, size: v }); return; }
      if (inRect(x, y, ERASER)) { setItemUi(item.id, { ...ui, erase: !ui.erase }); return; }
      if (inRect(x, y, SAVE)) { saveCanvas(item); return; }
      if (inRect(x, y, CLEAR)) { deltaAction(item.id, { a: 'canvasClear' }); return; }
      if (!inRect(x, y, AREA)) return;
      const strokeId = Math.random().toString(36).slice(2, 10);
      const erase = !!ui.erase;
      deltaAction(item.id, {
        a: 'strokeStart', id: strokeId,
        color: erase ? 'erase' : ui.color ?? PEN_COLORS[0],
        size: erase ? 28 : ui.size ?? 3,
        x: px, y: py,
      });
      active = { itemId: item.id, strokeId, buf: [], lastX: px, lastY: py, lastSend: performance.now() };
      return;
    }
    if (!active || active.itemId !== item.id) return;
    if (phase === 'move') {
      if (Math.hypot(px - active.lastX, py - active.lastY) < 2) return;
      active.buf.push(Math.round(px), Math.round(py));
      active.lastX = px;
      active.lastY = py;
      if (performance.now() - active.lastSend > 50) flush();
      return;
    }
    flush();
    active = null;
  },
};

function saveCanvas(item: Item) {
  const cv = document.createElement('canvas');
  cv.width = CANVAS_W * 2;
  cv.height = CANVAS_H * 2;
  const ctx = cv.getContext('2d')!;
  ctx.scale(2, 2);
  drawStrokes(ctx, item, 0, 0);
  postImage(tr("ui369"), cv.toDataURL('image/jpeg', 0.85));
}

export const PANELS: Partial<Record<Item['kind'], Panel>> = { chess: chessPanel, chessAi: chessPanel, g2048: panel2048, canvas: canvasPanel };
export const COMPAT_ONLY: Partial<Record<Item['kind'], boolean>> = { g2048: true };
