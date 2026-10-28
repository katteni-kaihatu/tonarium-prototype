import { t } from '../i18n/core.ts';

// 各行に高さを割り当て、長い翻訳でも最下段まで描く。数値の指数も途中で折らない。
export function drawAdBoard(canvas: HTMLCanvasElement, lines: string[]) {
  const ctx = canvas.getContext('2d');
  if (!ctx) return;
  ctx.fillStyle = 'rgba(16,20,40,0.92)';
  ctx.fillRect(0, 0, canvas.width, canvas.height);
  ctx.textAlign = 'left';
  ctx.textBaseline = 'middle';
  const pad = 24;
  const rowHeight = (canvas.height - pad * 2) / Math.max(1, lines.length);
  lines.forEach((text, i) => {
    const size = Math.min(i === 0 ? 52 : 42, rowHeight / 1.3);
    ctx.font = `${size}px "Segoe UI", "Noto Sans KR", sans-serif`;
    const fitted = Math.min(size, size * (canvas.width - pad * 2) / Math.max(1, ctx.measureText(text).width));
    ctx.font = `${fitted}px "Segoe UI", "Noto Sans KR", sans-serif`;
    ctx.fillStyle = i === 0 ? '#aef3ff' : '#e8ecff';
    ctx.fillText(text, pad, pad + rowHeight * (i + 0.5));
  });
}

export type AdReadings = { antimatterText: string; perSecondText: string };
export function adReadoutLines(readings: AdReadings): [string, string, string] {
  return [t('adLabText55'), readings.antimatterText, t('adLabText127', readings.perSecondText)];
}

/** Keep scientific notation on one line, including unusually long exponents. */
function fittedText(ctx: CanvasRenderingContext2D, text: string, y: number, size: number, color: string) {
  const font = (px: number) => `600 ${px}px "Segoe UI", "Hiragino Sans", "Noto Sans JP", sans-serif`;
  ctx.font = font(size);
  const fitted = Math.min(size, size * 912 / Math.max(1, ctx.measureText(text).width));
  ctx.font = font(fitted);
  ctx.fillStyle = color;
  ctx.fillText(text, 512, y);
}

export function drawAdReadings(canvas: HTMLCanvasElement, readings: AdReadings) {
  const ctx = canvas.getContext('2d');
  if (!ctx) return;
  ctx.fillStyle = '#0b1325';
  ctx.fillRect(0, 0, 1024, 512);
  ctx.strokeStyle = '#426680';
  ctx.lineWidth = 3;
  ctx.strokeRect(16, 16, 992, 480);
  ctx.fillStyle = '#73dbf4';
  ctx.fillRect(50, 125, 924, 3);
  ctx.textAlign = 'center';
  ctx.textBaseline = 'middle';
  const lines = adReadoutLines(readings);
  fittedText(ctx, lines[0], 78, 64, '#9feaff');
  fittedText(ctx, lines[1], 231, 168, '#f0fbff');
  fittedText(ctx, lines[2], 397, 82, '#94e4b7');
}
