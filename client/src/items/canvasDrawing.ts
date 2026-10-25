import { sourceText as uiSource } from '../i18n/core.ts';
import { localized, t as tr } from '../i18n/core.ts';
import { CANVAS_H, CANVAS_W, type Item } from '../../../shared/items.ts';
import type { ItemUi } from '../store.ts';
type Rect = [number, number, number, number];
const FONT = '"Segoe UI", "Hiragino Sans", "Noto Sans JP", sans-serif';
export const PEN_COLORS = ['#111111', '#ef4444', '#f59e0b', '#22c55e', '#3b82f6', '#a855f7'];
export const AREA: Rect = [10, 58, CANVAS_W, CANVAS_H];
export const SIZE_BTNS: [number, string, Rect][] = localized([[3, uiSource('ui341'), [272, 12, 44, 34]], [10, uiSource('ui342'), [320, 12, 44, 34]]]);
export const ERASER: Rect = [370, 12, 92, 34];
export const SAVE: Rect = [468, 12, 70, 34];
export const CLEAR: Rect = [544, 12, 84, 34];
export const colorRect = (i: number): Rect => [16 + i * 40, 13, 32, 32];

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

export function drawCanvasPanel(ctx: CanvasRenderingContext2D, item: Item, ui: ItemUi) {
  if (item.kind !== 'canvas') return;
  ctx.fillStyle = '#2b2d31';
  ctx.fillRect(0, 0, 640, 520);
  const erase = !!ui.erase;
  const color = ui.color ?? PEN_COLORS[0];
  const size = ui.size ?? 3;
  PEN_COLORS.forEach((c, i) => {
    const [x, y, w] = colorRect(i);
    ctx.fillStyle = c;
    ctx.beginPath();
    ctx.arc(x + w / 2, y + w / 2, 13, 0, Math.PI * 2);
    ctx.fill();
    if (!erase && c === color) {
      ctx.strokeStyle = '#fff';
      ctx.lineWidth = 3;
      ctx.beginPath();
      ctx.arc(x + w / 2, y + w / 2, 16, 0, Math.PI * 2);
      ctx.stroke();
    }
  });
  for (const [v, label, r] of SIZE_BTNS) button(ctx, r, label, size === v ? '#5865f2' : '#4e5058');
  button(ctx, ERASER, tr("ui343"), erase ? '#5865f2' : '#4e5058', 15);
  button(ctx, SAVE, tr("ui344"), '#248046', 15);
  button(ctx, CLEAR, tr("ui345"), '#da373c', 15);
  drawStrokes(ctx, item, AREA[0], AREA[1]);
}

export function drawStrokes(ctx: CanvasRenderingContext2D, item: Item, ox: number, oy: number) {
  if (item.kind !== 'canvas') return;
  const ax = ox;
  const ay = oy;
  const aw = CANVAS_W;
  const ah = CANVAS_H;
  {
    ctx.save();
    ctx.beginPath();
    ctx.rect(ax, ay, aw, ah);
    ctx.clip();
    ctx.fillStyle = '#ffffff';
    ctx.fillRect(ax, ay, aw, ah);
    ctx.lineCap = 'round';
    ctx.lineJoin = 'round';
    for (const st of item.strokes) {
      ctx.strokeStyle = st.color === 'erase' ? '#ffffff' : st.color;
      ctx.fillStyle = ctx.strokeStyle;
      ctx.lineWidth = st.size;
      const p = st.pts;
      if (p.length <= 2) {
        ctx.beginPath();
        ctx.arc(ax + p[0], ay + p[1], st.size / 2, 0, Math.PI * 2);
        ctx.fill();
        continue;
      }
      ctx.beginPath();
      ctx.moveTo(ax + p[0], ay + p[1]);
      for (let i = 2; i + 1 < p.length; i += 2) ctx.lineTo(ax + p[i], ay + p[i + 1]);
      ctx.stroke();
    }
    ctx.restore();
  }
}
